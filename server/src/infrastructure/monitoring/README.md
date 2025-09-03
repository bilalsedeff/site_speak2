# Monitoring Infrastructure

This directory contains the comprehensive monitoring infrastructure for SiteSpeak, implementing strict Kubernetes probe semantics and enterprise-grade observability.

## Overview

The monitoring system provides:

- **Health Endpoints**: `/health`, `/live`, `/ready` following Kubernetes probe semantics
- **Event Loop Monitoring**: Real-time Node.js event loop lag detection with `perf_hooks`
- **Graceful Shutdown**: Proper drain mode integration for zero-downtime deployments
- **Observability**: Prometheus metrics and OpenTelemetry instrumentation
- **Dependency Checks**: Parallel health checks with proper timeouts

## Architecture

```
monitoring/
├── HealthController.ts     # Health endpoints implementation
├── MetricsService.ts       # Metrics collection and event loop monitoring
├── routes.ts              # Express routes configuration
├── index.ts               # Module exports and utilities
└── README.md             # This documentation
```

## Health Endpoints

### `GET /health` - Aggregate Health Status

**Purpose**: External uptime checks and dashboards. Always returns 200 OK.

**Response Format**:
```json
{
  "status": "ok",
  "degraded": false,
  "live": {
    "ok": true,
    "lagMs": 8.5
  },
  "ready": {
    "ok": true,
    "failed": []
  },
  "version": "git:abcd123",
  "uptimeSec": 9876
}
```

**Status Codes**:
- `200 OK`: Always returned (never 5xx for soft degradations)

### `GET /live` - Liveness Probe

**Purpose**: Kubernetes liveness probe. Indicates if process is alive and event loop is not stuck.

**Response Format**:
```json
{
  "status": "live",
  "lagMs": 12.3,
  "uptimeSec": 1234
}
```

**Status Codes**:
- `200 OK`: Process is alive and healthy
- `500 Internal Server Error`: Event loop stuck or process unhealthy (triggers restart)

**Health Checks**:
- Event loop lag < 200ms (configurable)
- Process not in fatal error state

### `GET /ready` - Readiness Probe

**Purpose**: Kubernetes readiness probe. Gates traffic routing based on dependency health.

**Response Format**:
```json
{
  "status": "ready",
  "deps": {
    "database": "ok",
    "redis": "ok", 
    "openai": "ok"
  },
  "draining": false
}
```

**Status Codes**:
- `200 OK`: Ready to receive traffic
- `503 Service Unavailable`: Not ready (removes from load balancer)

**Health Checks**:
- Database connectivity (75ms timeout)
- Redis connectivity (50ms timeout)  
- OpenAI API connectivity (100ms timeout)
- Drain mode status

### Additional Endpoints

- `GET /health/detailed` - Comprehensive system information
- `GET /health/dependencies` - Dependency status details
- `GET /metrics` - System metrics in JSON format
- `GET /metrics/prometheus` - Prometheus-format metrics
- `GET /version` - Version and build information
- `GET /health/startup` - Startup probe (10 second boot protection)

## Event Loop Monitoring

The system uses `perf_hooks.monitorEventLoopDelay` to detect when the Node.js event loop is stuck:

```typescript
import { monitorEventLoopDelay } from 'perf_hooks';

const monitor = monitorEventLoopDelay({ resolution: 20 });
monitor.enable();

const lagMs = monitor.mean / 1e6; // Convert nanoseconds to milliseconds
const isHealthy = lagMs < 200; // 200ms threshold
```

**Key Features**:
- Real-time lag measurement with 20ms resolution
- Configurable threshold (default 200ms)
- Automatic cleanup on service shutdown
- Integration with liveness probes

## Graceful Shutdown & Drain Mode

On `SIGTERM` (Kubernetes rollout), the system:

1. **Immediately activates drain mode**: `metricsService.setDraining(true)`
2. **Readiness probes return 503**: Removes pod from service endpoints
3. **2-second delay**: Allows load balancers to receive 503 responses
4. **Graceful cleanup**: 30-second timeout for in-flight requests
5. **Resource cleanup**: AI assistant, voice sessions, database, metrics

```typescript
process.on('SIGTERM', async () => {
  // CRITICAL: Set drain mode immediately
  metricsService.setDraining(true);
  
  // Give load balancer time to receive 503s
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Graceful cleanup...
});
```

## Dependency Health Checks

All dependency checks execute in parallel with individual timeouts:

| Service | Timeout | Critical | Check Method |
|---------|---------|----------|--------------|
| Database | 75ms | Yes | `SELECT 1` query |
| Redis | 50ms | Yes | `PING` command |
| OpenAI API | 100ms | Yes | `GET /v1/models` |
| Disk Space | 100ms | No | File system stats |
| Memory | <1ms | No | Process memory usage |

**Performance Optimizations**:
- **Parallel execution**: All checks run concurrently
- **Result caching**: 150ms TTL to debounce repeated calls
- **Timeout handling**: Individual timeouts prevent cascading failures
- **Error isolation**: One check failure doesn't block others

## Prometheus Metrics

### Probe Metrics (Required by Kubernetes)

```prometheus
# Probe success counters
probe_live_success_total 142
probe_ready_success_total 138
probe_health_success_total 95

# Probe failure counters  
probe_live_failure_total 2
probe_ready_failure_total 4

# Probe duration histogram
probe_duration_seconds_bucket{probe="live",le="0.01"} 140
probe_duration_seconds_bucket{probe="live",le="0.1"} 142
probe_duration_seconds_bucket{probe="live",le="+Inf"} 144
probe_duration_seconds_sum{probe="live"} 1.234
probe_duration_seconds_count{probe="live"} 144
```

### System Metrics

```prometheus
# Node.js specific metrics
nodejs_eventloop_lag_seconds 0.008
nodejs_memory_heap_used_bytes 67108864
nodejs_memory_heap_total_bytes 134217728
nodejs_draining 0

# Application metrics
http_requests_total{method="GET",path="/health"} 142
http_errors_total{status_code="503"} 5
system_uptime_seconds 9876
```

## Kubernetes Configuration

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sitespeak-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: sitespeak/api:latest
        ports:
        - containerPort: 8080
        
        # Startup probe - gives time for slow boot
        startupProbe:
          httpGet:
            path: /live
            port: 8080
          periodSeconds: 2
          failureThreshold: 30
          
        # Liveness probe - restart if unhealthy
        livenessProbe:
          httpGet:
            path: /live
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 1
          failureThreshold: 3
          
        # Readiness probe - remove from service if not ready
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          periodSeconds: 5
          timeoutSeconds: 1
          successThreshold: 1
          failureThreshold: 3
```

### Service Configuration

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sitespeak-api
spec:
  selector:
    app: sitespeak-api
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

## Usage Examples

### Basic Import

```typescript
import { metricsService, healthController, setDraining } from '../monitoring';

// Get current metrics
const lagMs = metricsService.getEventLoopLag();
const isHealthy = metricsService.isEventLoopHealthy(200);

// Trigger drain mode
setDraining(true);
```

### Custom Health Checks

```typescript
import { metricsService } from '../monitoring';

// Record custom probe execution
const startTime = Date.now();
try {
  // Perform custom check...
  const success = true;
  metricsService.recordProbeExecution('custom', success, Date.now() - startTime);
} catch (error) {
  metricsService.recordProbeExecution('custom', false, Date.now() - startTime);
}
```

### Monitoring Integration

```typescript
import express from 'express';
import { monitoringRoutes } from '../monitoring';

const app = express();

// Mount all monitoring endpoints
app.use('/', monitoringRoutes);

// Custom metrics endpoint
app.get('/custom-metrics', async (req, res) => {
  const metrics = metricsService.getProbeMetrics();
  res.json(metrics);
});
```

## Development & Testing

### Running Tests

```bash
# Unit tests
npm run test -- monitoring

# Integration tests
npm run test:integration -- monitoring

# Health endpoint testing
curl http://localhost:5000/health
curl http://localhost:5000/live  
curl http://localhost:5000/ready
```

### Local Development

```bash
# Start server with monitoring
npm run dev:server

# Check event loop lag
curl http://localhost:5000/live

# Check dependency health
curl http://localhost:5000/ready

# Get Prometheus metrics
curl http://localhost:5000/metrics/prometheus
```

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| `/live` response time | < 20ms | Fast process-only checks |
| `/ready` response time | < 200ms | Includes dependency checks |
| `/health` response time | < 200ms | Cached for performance |
| Event loop lag threshold | < 200ms | Triggers liveness failure |
| Dependency timeout | 50-100ms | Service-specific limits |

## Troubleshooting

### Common Issues

1. **High Event Loop Lag**:
   ```
   Event loop lag: 450ms (threshold: 200ms)
   ```
   - Check for CPU-intensive operations
   - Review database query performance
   - Look for blocking synchronous operations

2. **Dependency Timeouts**:
   ```
   Database ping timeout (>75ms)
   ```
   - Check network connectivity
   - Verify database performance
   - Review connection pool settings

3. **Readiness Failures**:
   ```
   Readiness: 503 - database=fail, openai=ok
   ```
   - Critical dependency is down
   - Check individual service health
   - Review dependency timeout settings

### Debugging

```typescript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Check specific metrics
const metrics = metricsService.getProbeMetrics();
console.log('Probe metrics:', metrics);

// Manual health check
const checks = await metricsService.performHealthChecks();
console.log('Health checks:', checks);
```

## Production Considerations

1. **Monitoring**: Set up alerts on probe failure rates
2. **Capacity**: Monitor event loop lag trends
3. **Networking**: Ensure probe endpoint accessibility
4. **Timeouts**: Tune timeouts based on infrastructure
5. **Caching**: Adjust cache TTL based on load patterns

## Security

- Health endpoints expose no sensitive information
- No authentication required (standard for Kubernetes probes)  
- No stack traces in error responses
- Rate limiting excluded for health endpoints

This monitoring infrastructure provides enterprise-grade reliability and observability for SiteSpeak deployments.