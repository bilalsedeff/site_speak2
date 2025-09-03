# Voice Services Deployment Guide

## Prerequisites

### System Requirements

**Minimum Requirements:**

- Node.js 18+ with TypeScript support
- 2 CPU cores, 4GB RAM
- 10GB disk space
- Network bandwidth: 100Mbps+

**Recommended (Production):**

- Node.js 20+ (LTS)
- 4+ CPU cores, 8GB RAM
- SSD storage
- CDN for audio-worklet-processor.js
- Load balancer for WebSocket connections

### Dependencies

**Required Services:**

- OpenAI API access (with Realtime API enabled)
- Redis (for session management and caching)
- PostgreSQL (for persistent data)
- JWT authentication system

**Optional Services:**

- Monitoring (Prometheus/Grafana)
- Logging (ELK stack)
- WebSocket load balancer (HAProxy/NGINX)

## Environment Configuration

### Environment Variables

Create `.env` file with required variables:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-key-here
OPENAI_ORG_ID=your-org-id  # Optional

# Voice Services Configuration
VOICE_WS_PORT=8080
VOICE_MAX_CONNECTIONS=1000
VOICE_SESSION_TIMEOUT=300000  # 5 minutes in ms

# Performance Settings
VOICE_TARGET_FIRST_TOKEN_MS=300
VOICE_TARGET_PARTIAL_LATENCY_MS=150
VOICE_TARGET_BARGE_IN_MS=50

# Audio Configuration
VOICE_SAMPLE_RATE=48000
VOICE_FRAME_MS=20
VOICE_BITRATE=16000

# Debug Settings
VOICE_DEBUG=false
VOICE_PERFORMANCE_WARNINGS=true
AUDIO_WORKLET_DEBUG=false

# Security
JWT_SECRET=your-super-secret-key-min-32-chars
VOICE_CORS_ORIGIN=https://yourdomain.com

# Database
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/sitespeak

# Monitoring
VOICE_METRICS_ENABLED=true
VOICE_HEALTH_CHECK_INTERVAL=30000
```

### Configuration Validation

Create validation script `scripts/validate-config.js`:

```javascript
const fs = require('fs');
require('dotenv').config();

const requiredEnvVars = [
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'REDIS_URL',
  'DATABASE_URL'
];

const warnings = [];
const errors = [];

// Check required variables
requiredEnvVars.forEach(key => {
  if (!process.env[key]) {
    errors.push(`Missing required environment variable: ${key}`);
  }
});

// Validate JWT secret length
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  errors.push('JWT_SECRET must be at least 32 characters long');
}

// Check OpenAI key format
if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-')) {
  warnings.push('OpenAI API key format appears incorrect');
}

// Validate voice configuration
const wsPort = parseInt(process.env.VOICE_WS_PORT || '8080');
if (isNaN(wsPort) || wsPort < 1024 || wsPort > 65535) {
  errors.push('VOICE_WS_PORT must be a valid port number (1024-65535)');
}

// Check file requirements
const audioWorkletPath = './client/public/audio-worklet-processor.js';
if (!fs.existsSync(audioWorkletPath)) {
  errors.push(`Missing required file: ${audioWorkletPath}`);
}

// Output results
if (errors.length > 0) {
  console.error('❌ Configuration Errors:');
  errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('⚠️  Configuration Warnings:');
  warnings.forEach(warning => console.warn(`  - ${warning}`));
}

console.log('✅ Configuration validation passed');
```

## Docker Deployment

### Dockerfile

```dockerfile
# Use Node.js LTS
FROM node:20-alpine as base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
COPY shared/package*.json ./shared/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build applications
RUN npm run build

# Production stage
FROM node:20-alpine as production

RUN apk add --no-cache curl

WORKDIR /app

# Copy built application
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/client/public ./client/public
COPY --from=base /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/voice/health || exit 1

# Expose ports
EXPOSE 3000 8080

# Start application
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  # Main application
  sitespeak:
    build: 
      context: .
      target: production
    ports:
      - "3000:3000"  # HTTP server
      - "8080:8080"  # WebSocket server
    environment:
      NODE_ENV: production
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      JWT_SECRET: ${JWT_SECRET}
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://postgres:password@postgres:5432/sitespeak
      VOICE_WS_PORT: 8080
    depends_on:
      - postgres
      - redis
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/voice/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # Database
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: sitespeak
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5433:5432"
    restart: unless-stopped

  # Redis for caching and sessions
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6380:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  # NGINX reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - sitespeak
    restart: unless-stopped

  # Monitoring (optional)
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana:/etc/grafana/provisioning
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  grafana_data:
```

## NGINX Configuration

### nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    # WebSocket upgrade configuration
    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    upstream app {
        server sitespeak:3000;
    }

    upstream websocket {
        server sitespeak:8080;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=ws:10m rate=5r/s;

    server {
        listen 80;
        server_name your-domain.com;

        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

        # Main application
        location / {
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API endpoints with rate limiting
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Voice WebSocket endpoint
        location /voice-ws {
            limit_req zone=ws burst=10 nodelay;
            proxy_pass http://websocket;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket specific settings
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
            proxy_connect_timeout 10s;
        }

        # Static files for AudioWorklet
        location /audio-worklet-processor.js {
            alias /app/client/public/audio-worklet-processor.js;
            add_header Cache-Control "public, max-age=31536000";
            add_header Cross-Origin-Embedder-Policy require-corp;
            add_header Cross-Origin-Opener-Policy same-origin;
        }

        # Health check endpoint (no rate limiting)
        location /api/voice/health {
            proxy_pass http://app;
            proxy_set_header Host $host;
        }
    }
}
```

## Kubernetes Deployment

### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sitespeak-voice
  labels:
    app: sitespeak-voice
spec:
  replicas: 3
  selector:
    matchLabels:
      app: sitespeak-voice
  template:
    metadata:
      labels:
        app: sitespeak-voice
    spec:
      containers:
      - name: sitespeak
        image: sitespeak/voice-services:latest
        ports:
        - containerPort: 3000
          name: http
        - containerPort: 8080
          name: websocket
        env:
        - name: NODE_ENV
          value: "production"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secret
              key: api-key
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /api/voice/health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /api/voice/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

---
apiVersion: v1
kind: Service
metadata:
  name: sitespeak-voice-service
spec:
  selector:
    app: sitespeak-voice
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: websocket
    port: 8080
    targetPort: 8080
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sitespeak-voice-ingress
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/websocket-services: "sitespeak-voice-service"
spec:
  tls:
  - hosts:
    - your-domain.com
    secretName: tls-secret
  rules:
  - host: your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sitespeak-voice-service
            port:
              number: 80
      - path: /voice-ws
        pathType: Prefix
        backend:
          service:
            name: sitespeak-voice-service
            port:
              number: 8080
```

## Production Checklist

### Pre-Deployment

- [ ] Validate all environment variables
- [ ] Test OpenAI API connectivity
- [ ] Verify JWT secret strength (32+ characters)
- [ ] Check database schema is up to date
- [ ] Ensure Redis is accessible
- [ ] Validate SSL certificates
- [ ] Test WebSocket connectivity
- [ ] Verify audio-worklet-processor.js is served correctly
- [ ] Check CORS configuration
- [ ] Test rate limiting configuration

### Security Checklist

- [ ] HTTPS enabled with strong SSL configuration
- [ ] JWT tokens use secure signing algorithm
- [ ] WebSocket connections require authentication
- [ ] Rate limiting configured for API and WebSocket endpoints
- [ ] CORS properly configured for production domain
- [ ] No sensitive data in environment variables exposed to client
- [ ] OpenAI API keys stored securely (secrets management)
- [ ] Database connections encrypted
- [ ] Security headers configured
- [ ] Regular security updates scheduled

### Performance Checklist

- [ ] CDN configured for static assets
- [ ] WebSocket load balancing configured
- [ ] Database connection pooling enabled
- [ ] Redis caching configured
- [ ] Health checks configured with appropriate timeouts
- [ ] Resource limits set for containers
- [ ] Monitoring and alerting configured
- [ ] Log aggregation setup
- [ ] Performance targets configured:
  - [ ] First token latency ≤ 300ms
  - [ ] Partial ASR latency ≤ 150ms
  - [ ] Barge-in latency ≤ 50ms

### Monitoring Setup

#### Health Check Endpoint

```javascript
// health-check.js
const express = require('express');
const { voiceOrchestrator } = require('./services/voice');

const app = express();

app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'healthy',
      redis: 'healthy', 
      openai: 'healthy',
      voice_services: 'healthy'
    }
  };

  try {
    // Check voice orchestrator
    const voiceStatus = voiceOrchestrator.getStatus();
    health.checks.voice_services = voiceStatus.isRunning ? 'healthy' : 'unhealthy';
    
    // Check database connectivity
    await db.query('SELECT 1');
    
    // Check Redis connectivity
    await redis.ping();
    
    // Check OpenAI API
    const openaiTest = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });
    health.checks.openai = openaiTest.ok ? 'healthy' : 'unhealthy';
    
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

#### Metrics Collection

```javascript
// metrics.js  
const { voiceOrchestrator } = require('./services/voice');
const prometheus = require('prom-client');

// Create metrics
const voiceSessionsTotal = new prometheus.Counter({
  name: 'voice_sessions_total',
  help: 'Total number of voice sessions started',
  labelNames: ['tenant_id', 'status']
});

const voiceLatencyHistogram = new prometheus.Histogram({
  name: 'voice_latency_seconds',
  help: 'Voice processing latency',
  labelNames: ['type'], // first_token, partial_asr, barge_in
  buckets: [0.05, 0.1, 0.15, 0.3, 0.5, 1.0, 2.0]
});

const activeVoiceSessionsGauge = new prometheus.Gauge({
  name: 'voice_sessions_active',
  help: 'Number of active voice sessions'
});

// Collect metrics periodically
setInterval(() => {
  const status = voiceOrchestrator.getStatus();
  
  activeVoiceSessionsGauge.set(status.activeSessions);
  
  // Update latency metrics
  if (status.performance.avgFirstTokenLatency) {
    voiceLatencyHistogram.observe(
      { type: 'first_token' }, 
      status.performance.avgFirstTokenLatency / 1000
    );
  }
  
  if (status.performance.avgPartialLatency) {
    voiceLatencyHistogram.observe(
      { type: 'partial_asr' },
      status.performance.avgPartialLatency / 1000
    );
  }
  
  if (status.performance.avgBargeInLatency) {
    voiceLatencyHistogram.observe(
      { type: 'barge_in' },
      status.performance.avgBargeInLatency / 1000
    );
  }
}, 10000);

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(prometheus.register.metrics());
});
```

## Scaling Considerations

### Horizontal Scaling

**WebSocket Sticky Sessions:**

- Use Redis for session storage
- Configure load balancer for WebSocket affinity
- Implement session migration for graceful shutdowns

**Database Scaling:**

- Use connection pooling (pg-pool)
- Consider read replicas for analytics
- Implement database connection limits

**OpenAI API Rate Limits:**

- Implement request queuing
- Use multiple API keys for higher limits
- Cache responses where appropriate

### Vertical Scaling

**Memory Optimization:**

- Monitor AudioWorklet memory usage
- Implement session cleanup
- Use streaming for large responses

**CPU Optimization:**

- Profile AudioWorklet processing
- Optimize Opus encoding/decoding
- Use worker threads for heavy processing

This deployment guide provides a complete production-ready setup for the voice services system, including security, monitoring, and scaling considerations.
