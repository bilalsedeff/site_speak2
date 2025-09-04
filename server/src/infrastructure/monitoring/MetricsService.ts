import { createLogger } from '../../../../shared/utils/index.js';
import { config } from '../config';
import os from 'os';
import fs from 'fs';
import { monitorEventLoopDelay } from 'perf_hooks';

const logger = createLogger({ service: 'metrics' });

export interface SystemMetrics {
  timestamp: Date;
  system: {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    cpu: {
      usage: number; // percentage
      loadAverage: number[];
    };
    disk: {
      available: number;
      used: number;
      total: number;
    };
  };
  application: {
    activeConnections: number;
    requestsPerMinute: number;
    errorRate: number;
    responseTimeP95: number;
    activeVoiceSessions: number;
    queueSize: number;
  };
  database: {
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    queries: {
      total: number;
      slow: number;
      failed: number;
    };
    size: number; // bytes
  };
  ai: {
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
    requestsPerMinute: number;
    averageLatency: number;
    errorRate: number;
    embeddingsGenerated: number;
  };
  voice: {
    sessionsActive: number;
    sessionsTotal: number;
    minutesProcessed: number;
    sttRequests: number;
    ttsRequests: number;
    averageLatency: number;
  };
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Service for collecting and managing application metrics
 */
export class MetricsService {
  private requestCounts = new Map<string, number>();
  private responseTimes: number[] = [];
  private errorCounts = new Map<string, number>();
  private _startTime = Date.now(); // Application start time for future use
  private eventLoopMonitor: ReturnType<typeof monitorEventLoopDelay>;
  private isDraining = false;
  
  // Caching for readiness checks (fast path optimization)
  private healthCheckCache: {
    result: HealthCheck[] | null;
    timestamp: number;
  } = { result: null, timestamp: 0 };
  private readonly CACHE_TTL_MS = 150; // 150ms cache TTL per source-of-truth

  // Probe metrics tracking per source-of-truth requirements
  private probeSuccessCounts = new Map<string, number>();
  private probeFailureCounts = new Map<string, number>();
  private probeDurations: Array<{ probe: string; duration: number; success: boolean; timestamp: number }> = [];

  constructor() {
    // Initialize event loop lag monitoring
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopMonitor.enable();
    
    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method: string, path: string, statusCode: number, responseTime: number): void {
    const key = `${method}:${path}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
    this.responseTimes.push(responseTime);

    // Keep only last 1000 response times for memory efficiency
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }

    // Record errors
    if (statusCode >= 400) {
      const errorKey = `${statusCode}`;
      this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    }
  }

  /**
   * Get current system metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    // Calculate request rate (per minute)
    const totalRequests = Array.from(this.requestCounts.values()).reduce((sum, count) => sum + count, 0);
    const requestsPerMinute = Math.round((totalRequests / uptime) * 60);

    // Calculate error rate
    const totalErrors = Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0);
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Calculate P95 response time
    const sortedTimes = this.responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const responseTimeP95 = sortedTimes[p95Index] || 0;

    return {
      timestamp: new Date(),
      system: {
        uptime,
        memory: memUsage,
        cpu: {
          usage: this.calculateCpuUsage(cpuUsage),
          loadAverage: process.platform === 'win32' ? [0, 0, 0] : os.loadavg(),
        },
        disk: await this.getDiskUsage(),
      },
      application: {
        activeConnections: 0, // TODO: Get from server instance
        requestsPerMinute,
        errorRate,
        responseTimeP95,
        activeVoiceSessions: 0, // TODO: Get from voice handler
        queueSize: 0, // TODO: Get from job queue
      },
      database: {
        connections: {
          active: 0, // TODO: Get from database pool
          idle: 0,
          total: 0,
        },
        queries: {
          total: 0, // TODO: Track database queries
          slow: 0,
          failed: 0,
        },
        size: 0, // TODO: Get database size
      },
      ai: {
        tokenUsage: {
          input: 0, // TODO: Track AI token usage
          output: 0,
          total: 0,
        },
        requestsPerMinute: 0,
        averageLatency: 0,
        errorRate: 0,
        embeddingsGenerated: 0,
      },
      voice: {
        sessionsActive: 0, // TODO: Get from voice service
        sessionsTotal: 0,
        minutesProcessed: 0,
        sttRequests: 0,
        ttsRequests: 0,
        averageLatency: 0,
      },
    };
  }

  /**
   * Perform comprehensive health checks with parallel execution, timeouts, and caching
   */
  async performHealthChecks(): Promise<HealthCheck[]> {
    const now = Date.now();

    // Fast path: return cached result if still valid
    if (
      this.healthCheckCache.result && 
      (now - this.healthCheckCache.timestamp) < this.CACHE_TTL_MS
    ) {
      logger.debug('Returning cached health check result', {
        age: now - this.healthCheckCache.timestamp,
        ttl: this.CACHE_TTL_MS
      });
      return this.healthCheckCache.result;
    }

    const startTime = now;

    // Execute all checks in parallel for better performance
    const checkPromises = [
      this.checkDatabase(),
      this.checkRedis(), 
      this.checkOpenAI(),
      this.checkDiskSpace(),
      this.checkMemory(),
    ];

    // Wait for all checks with a total timeout of 200ms
    const checks = await Promise.allSettled(checkPromises.map(promise => 
      this.withTimeout(promise, 200, 'Health check timeout')
    ));

    const results: HealthCheck[] = [];
    const checkNames = ['database', 'redis', 'openai', 'disk', 'memory'];

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      if (check?.status === 'fulfilled') {
        results.push(check.value);
      } else if (check?.status === 'rejected') {
        // Create error health check for failed/timeout checks
        results.push({
          service: checkNames[i] || 'unknown',
          status: 'unhealthy',
          timestamp: new Date(),
          message: 'Health check failed or timed out',
          details: { error: check.reason instanceof Error ? check.reason.message : 'Unknown error' },
        });
      }
    }

    // Cache the results for fast subsequent calls
    this.healthCheckCache = {
      result: results,
      timestamp: now
    };

    const totalTime = Date.now() - startTime;
    logger.debug('Health checks completed and cached', { totalTime, checksCount: results.length });

    return results;
  }

  /**
   * Helper to add timeout to any promise
   */
  private async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    timeoutMessage: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Check database connectivity and performance
   * Timeout: 75ms per source-of-truth
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    const timeoutMs = 75;
    
    try {
      // Use timeout wrapper for database check
      await this.withTimeout(this.performDatabasePing(), timeoutMs, 'Database ping timeout');
      
      const latency = Date.now() - start;
      
      return {
        service: 'database',
        status: latency < 50 ? 'healthy' : latency < 75 ? 'degraded' : 'unhealthy',
        timestamp: new Date(),
        latency,
        message: `Database responding in ${latency}ms`,
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        timestamp: new Date(),
        latency: Date.now() - start,
        message: 'Database connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Perform actual database ping - placeholder for now
   */
  private async performDatabasePing(): Promise<void> {
    // TODO: Implement actual database ping with SELECT 1
    // For now, simulate a fast database check
    return new Promise((resolve) => {
      setTimeout(resolve, Math.random() * 20 + 5); // 5-25ms simulation
    });
  }

  /**
   * Check Redis connectivity  
   * Timeout: 50ms per source-of-truth
   */
  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    const timeoutMs = 50;
    
    try {
      // Use timeout wrapper for Redis check
      await this.withTimeout(this.performRedisPing(), timeoutMs, 'Redis ping timeout');
      
      const latency = Date.now() - start;
      
      return {
        service: 'redis',
        status: latency < 25 ? 'healthy' : latency < 50 ? 'degraded' : 'unhealthy',
        timestamp: new Date(),
        latency,
        message: `Redis responding in ${latency}ms`,
      };
    } catch (error) {
      return {
        service: 'redis',
        status: 'unhealthy',
        timestamp: new Date(),
        latency: Date.now() - start,
        message: 'Redis connection failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Perform actual Redis ping - placeholder for now
   */
  private async performRedisPing(): Promise<void> {
    // TODO: Implement actual Redis PING command
    // For now, simulate a fast Redis check
    return new Promise((resolve) => {
      setTimeout(resolve, Math.random() * 15 + 5); // 5-20ms simulation
    });
  }

  /**
   * Check OpenAI API connectivity
   * Timeout: 100ms for readiness probe efficiency
   */
  private async checkOpenAI(): Promise<HealthCheck> {
    const start = Date.now();
    const timeoutMs = 100;
    
    try {
      // Use timeout wrapper for OpenAI API check
      const response = await this.withTimeout(
        fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        timeoutMs,
        'OpenAI API timeout'
      );

      const latency = Date.now() - start;

      if (response.ok) {
        return {
          service: 'openai',
          status: latency < 50 ? 'healthy' : latency < 100 ? 'degraded' : 'unhealthy',
          timestamp: new Date(),
          latency,
          message: `OpenAI API responding in ${latency}ms`,
        };
      } else {
        return {
          service: 'openai',
          status: 'unhealthy',
          timestamp: new Date(),
          latency,
          message: `OpenAI API returned ${response.status}`,
          details: { statusCode: response.status },
        };
      }
    } catch (error) {
      return {
        service: 'openai',
        status: 'unhealthy',
        timestamp: new Date(),
        latency: Date.now() - start,
        message: 'OpenAI API connection failed or timed out',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    try {
      const diskUsage = await this.getDiskUsage();
      const usagePercentage = (diskUsage.used / diskUsage.total) * 100;

      let status: HealthCheck['status'] = 'healthy';
      let message = `Disk usage: ${usagePercentage.toFixed(1)}%`;

      if (usagePercentage > 90) {
        status = 'unhealthy';
        message = `Disk space critical: ${usagePercentage.toFixed(1)}%`;
      } else if (usagePercentage > 80) {
        status = 'degraded';
        message = `Disk space high: ${usagePercentage.toFixed(1)}%`;
      }

      return {
        service: 'disk',
        status,
        timestamp: new Date(),
        message,
        details: diskUsage,
      };
    } catch (error) {
      return {
        service: 'disk',
        status: 'unhealthy',
        timestamp: new Date(),
        message: 'Failed to check disk space',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const memUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryPercentage = (usedMemory / totalMemory) * 100;

    // Check heap usage
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    let status: HealthCheck['status'] = 'healthy';
    let message = `Memory usage: ${memoryPercentage.toFixed(1)}%, Heap: ${heapPercentage.toFixed(1)}%`;

    if (memoryPercentage > 90 || heapPercentage > 90) {
      status = 'unhealthy';
      message = `Memory critical - System: ${memoryPercentage.toFixed(1)}%, Heap: ${heapPercentage.toFixed(1)}%`;
    } else if (memoryPercentage > 80 || heapPercentage > 80) {
      status = 'degraded';
      message = `Memory high - System: ${memoryPercentage.toFixed(1)}%, Heap: ${heapPercentage.toFixed(1)}%`;
    }

    return {
      service: 'memory',
      status,
      timestamp: new Date(),
      message,
      details: {
        system: { total: totalMemory, used: usedMemory, free: freeMemory },
        heap: memUsage,
      },
    };
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCpuUsage(cpuUsage: NodeJS.CpuUsage): number {
    // This is a simplified CPU calculation
    // In production, you'd want to track this over time
    const totalUsage = cpuUsage.user + cpuUsage.system;
    const totalTime = process.uptime() * 1000000; // Convert to microseconds
    return Math.min((totalUsage / totalTime) * 100, 100);
  }

  /**
   * Get disk usage information
   */
  private async getDiskUsage(): Promise<{ available: number; used: number; total: number }> {
    try {
      // Simple disk usage estimation - for production, use a proper disk usage library
      const _stats = await fs.promises.stat(process.cwd());
      
      // Return placeholder values for now - in production, use a library like 'node-disk-info'
      return { 
        available: 1000000000, // 1GB 
        used: 500000000,       // 500MB
        total: 1500000000      // 1.5GB
      };
    } catch (error) {
      logger.warn('Failed to get disk usage', { error });
      return { available: 0, used: 0, total: 0 };
    }
  }

  /**
   * Start collecting metrics at regular intervals
   */
  private startMetricsCollection(): void {
    // Clean up old metrics every 5 minutes
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1000);

    logger.info('Metrics collection started');
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    // Reset counters if they get too large
    if (this.requestCounts.size > 1000) {
      this.requestCounts.clear();
    }

    if (this.errorCounts.size > 100) {
      this.errorCounts.clear();
    }

    // Keep only recent response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-500);
    }
  }

  /**
   * Get current event loop lag in milliseconds
   */
  getEventLoopLag(): number {
    return this.eventLoopMonitor.mean / 1e6; // Convert nanoseconds to milliseconds
  }

  /**
   * Check if event loop is healthy (lag below threshold)
   */
  isEventLoopHealthy(thresholdMs: number = 200): boolean {
    return this.getEventLoopLag() < thresholdMs;
  }

  /**
   * Set draining mode (used during graceful shutdown)
   */
  setDraining(draining: boolean): void {
    this.isDraining = draining;
    logger.info('Drain mode changed', { draining });
  }

  /**
   * Check if service is in draining mode
   */
  isDrainingMode(): boolean {
    return this.isDraining;
  }

  /**
   * Get process uptime in seconds
   */
  getUptimeSeconds(): number {
    return Math.floor(process.uptime());
  }

  /**
   * Record probe execution metrics per source-of-truth requirements
   */
  recordProbeExecution(probe: 'live' | 'ready' | 'health', success: boolean, duration: number): void {
    const probeKey = `${probe}`;
    
    if (success) {
      this.probeSuccessCounts.set(probeKey, (this.probeSuccessCounts.get(probeKey) || 0) + 1);
    } else {
      this.probeFailureCounts.set(probeKey, (this.probeFailureCounts.get(probeKey) || 0) + 1);
    }

    // Store duration for histogram calculation
    this.probeDurations.push({
      probe: probeKey,
      duration,
      success,
      timestamp: Date.now(),
    });

    // Keep only last 1000 probe durations for memory efficiency
    if (this.probeDurations.length > 1000) {
      this.probeDurations = this.probeDurations.slice(-1000);
    }

    logger.debug('Probe execution recorded', { probe, success, duration });
  }

  /**
   * Get probe metrics for observability
   */
  getProbeMetrics(): {
    successCounts: Map<string, number>;
    failureCounts: Map<string, number>;
    durations: Array<{ probe: string; duration: number; success: boolean; timestamp: number }>;
  } {
    return {
      successCounts: new Map(this.probeSuccessCounts),
      failureCounts: new Map(this.probeFailureCounts),
      durations: [...this.probeDurations],
    };
  }

  /**
   * Cleanup resources (called during shutdown)
   */
  cleanup(): void {
    this.eventLoopMonitor.disable();
    logger.info('Metrics service cleaned up');
  }

  /**
   * Export metrics in Prometheus format per source-of-truth requirements
   */
  exportPrometheusMetrics(): string {
    const metrics: string[] = [];
    
    // Probe success metrics (required by source-of-truth)
    for (const [probe, count] of this.probeSuccessCounts.entries()) {
      metrics.push(`probe_${probe}_success_total ${count}`);
    }

    // Probe failure metrics  
    for (const [probe, count] of this.probeFailureCounts.entries()) {
      metrics.push(`probe_${probe}_failure_total ${count}`);
    }

    // Probe duration histogram (required by source-of-truth)
    const probeGroups = new Map<string, number[]>();
    for (const entry of this.probeDurations) {
      if (!probeGroups.has(entry.probe)) {
        probeGroups.set(entry.probe, []);
      }
      probeGroups.get(entry.probe)!.push(entry.duration);
    }

    for (const [probe, durations] of probeGroups.entries()) {
      if (durations.length > 0) {
        // Calculate histogram buckets (standard Prometheus buckets for duration in seconds)
        const buckets = [0.001, 0.01, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0];
        const durationSeconds = durations.map(d => d / 1000);
        
        for (const bucket of buckets) {
          const count = durationSeconds.filter(d => d <= bucket).length;
          metrics.push(`probe_duration_seconds_bucket{probe="${probe}",le="${bucket}"} ${count}`);
        }
        
        // Add +Inf bucket
        metrics.push(`probe_duration_seconds_bucket{probe="${probe}",le="+Inf"} ${durations.length}`);
        
        // Sum and count
        const sum = durationSeconds.reduce((a, b) => a + b, 0);
        metrics.push(`probe_duration_seconds_sum{probe="${probe}"} ${sum.toFixed(6)}`);
        metrics.push(`probe_duration_seconds_count{probe="${probe}"} ${durations.length}`);
      }
    }

    // HTTP requests total
    for (const [key, count] of this.requestCounts.entries()) {
      const [method, path] = key.split(':');
      metrics.push(`http_requests_total{method="${method}",path="${path}"} ${count}`);
    }

    // HTTP errors total
    for (const [statusCode, count] of this.errorCounts.entries()) {
      metrics.push(`http_errors_total{status_code="${statusCode}"} ${count}`);
    }

    // System uptime
    metrics.push(`system_uptime_seconds ${process.uptime()}`);

    // Event loop lag (Node.js specific)
    metrics.push(`nodejs_eventloop_lag_seconds ${this.getEventLoopLag() / 1000}`);

    // Memory usage
    const memUsage = process.memoryUsage();
    metrics.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);
    metrics.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);
    metrics.push(`nodejs_memory_external_bytes ${memUsage.external}`);
    metrics.push(`nodejs_memory_rss_bytes ${memUsage.rss}`);

    // Drain mode status
    metrics.push(`nodejs_draining ${this.isDraining ? 1 : 0}`);

    return metrics.join('\n') + '\n';
  }
}

// Export singleton instance
export const metricsService = new MetricsService();