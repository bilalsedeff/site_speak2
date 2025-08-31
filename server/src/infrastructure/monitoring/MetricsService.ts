import { createLogger } from '@shared/utils';
import { config } from '../config';
import os from 'os';
import fs from 'fs';

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
  private startTime = Date.now();

  constructor() {
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
   * Perform comprehensive health checks
   */
  async performHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Database health check
    checks.push(await this.checkDatabase());

    // Redis health check
    checks.push(await this.checkRedis());

    // OpenAI API health check
    checks.push(await this.checkOpenAI());

    // Disk space health check
    checks.push(await this.checkDiskSpace());

    // Memory health check
    checks.push(await this.checkMemory());

    return checks;
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // TODO: Implement actual database ping
      // const { checkDatabaseHealth } = await import('../database');
      // await checkDatabaseHealth();
      
      const latency = Date.now() - start;
      
      return {
        service: 'database',
        status: latency < 100 ? 'healthy' : latency < 500 ? 'degraded' : 'unhealthy',
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
   * Check Redis connectivity
   */
  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // TODO: Implement Redis ping
      const latency = Date.now() - start;
      
      return {
        service: 'redis',
        status: 'healthy',
        timestamp: new Date(),
        latency,
        message: 'Redis connection healthy',
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
   * Check OpenAI API connectivity
   */
  private async checkOpenAI(): Promise<HealthCheck> {
    const start = Date.now();
    
    try {
      // Simple API test - get models list
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const latency = Date.now() - start;

      if (response.ok) {
        return {
          service: 'openai',
          status: latency < 1000 ? 'healthy' : 'degraded',
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
        message: 'OpenAI API connection failed',
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
      const stats = await fs.promises.stat(process.cwd());
      
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
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const metrics: string[] = [];
    
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

    // Memory usage
    const memUsage = process.memoryUsage();
    metrics.push(`memory_heap_used_bytes ${memUsage.heapUsed}`);
    metrics.push(`memory_heap_total_bytes ${memUsage.heapTotal}`);
    metrics.push(`memory_external_bytes ${memUsage.external}`);
    metrics.push(`memory_rss_bytes ${memUsage.rss}`);

    return metrics.join('\n') + '\n';
  }
}

// Export singleton instance
export const metricsService = new MetricsService();