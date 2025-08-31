/**
 * Metrics Collection - Application and business metrics
 * 
 * Provides common meters for request duration, queue depth,
 * database latency, cache hit ratios, and business metrics.
 */

import { cfg } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Metric types
 */
export interface Counter {
  inc(value?: number, labels?: Record<string, string>): void;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
}

export interface Gauge {
  set(value: number, labels?: Record<string, string>): void;
  inc(value?: number, labels?: Record<string, string>): void;
  dec(value?: number, labels?: Record<string, string>): void;
}

/**
 * Metrics registry
 */
interface MetricsRegistry {
  // Request metrics
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  httpRequestsInFlight: Gauge;
  
  // Database metrics
  dbQueryDuration: Histogram;
  dbConnectionsActive: Gauge;
  dbConnectionsTotal: Counter;
  
  // Queue metrics
  queueJobsTotal: Counter;
  queueJobDuration: Histogram;
  queueDepth: Gauge;
  queueJobsInFlight: Gauge;
  
  // Cache metrics
  cacheOperations: Counter;
  cacheHitRatio: Gauge;
  
  // AI metrics
  aiRequestsTotal: Counter;
  aiRequestDuration: Histogram;
  aiTokensUsed: Counter;
  
  // Voice metrics
  voiceSessionsActive: Gauge;
  voiceSynthesisDuration: Histogram;
  voiceRecognitionDuration: Histogram;
  
  // Business metrics
  sitesActive: Gauge;
  conversationsTotal: Counter;
  knowledgeBaseSize: Gauge;
}

let metrics: MetricsRegistry;

/**
 * Initialize metrics with OpenTelemetry or fallback implementation
 */
export async function initializeMetrics(): Promise<void> {
  try {
    logger.info('Initializing metrics...');

    // Try to use OpenTelemetry metrics
    try {
      const otelMetrics = await import('@opentelemetry/api');
      const meter = otelMetrics.metrics.getMeter(cfg.OTEL_SERVICE_NAME, cfg.OTEL_SERVICE_VERSION);
      
      metrics = createOtelMetrics(meter);
      logger.info('Metrics initialized with OpenTelemetry');
    } catch {
      // Fallback to in-memory metrics
      metrics = createInMemoryMetrics();
      logger.info('Metrics initialized with in-memory implementation');
    }

    // Start background metrics collection
    startBackgroundCollection();
    
  } catch (error) {
    logger.error('Failed to initialize metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Create OpenTelemetry-based metrics
 */
function createOtelMetrics(meter: any): MetricsRegistry {
  return {
    // Request metrics
    httpRequestsTotal: meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
    }),
    httpRequestDuration: meter.createHistogram('http_request_duration_ms', {
      description: 'HTTP request duration in milliseconds',
    }),
    httpRequestsInFlight: meter.createUpDownCounter('http_requests_in_flight', {
      description: 'Number of HTTP requests currently being processed',
    }),
    
    // Database metrics
    dbQueryDuration: meter.createHistogram('db_query_duration_ms', {
      description: 'Database query duration in milliseconds',
    }),
    dbConnectionsActive: meter.createUpDownCounter('db_connections_active', {
      description: 'Number of active database connections',
    }),
    dbConnectionsTotal: meter.createCounter('db_connections_total', {
      description: 'Total number of database connections created',
    }),
    
    // Queue metrics
    queueJobsTotal: meter.createCounter('queue_jobs_total', {
      description: 'Total number of queue jobs processed',
    }),
    queueJobDuration: meter.createHistogram('queue_job_duration_ms', {
      description: 'Queue job processing duration in milliseconds',
    }),
    queueDepth: meter.createUpDownCounter('queue_depth', {
      description: 'Number of jobs waiting in queue',
    }),
    queueJobsInFlight: meter.createUpDownCounter('queue_jobs_in_flight', {
      description: 'Number of jobs currently being processed',
    }),
    
    // Cache metrics
    cacheOperations: meter.createCounter('cache_operations_total', {
      description: 'Total number of cache operations',
    }),
    cacheHitRatio: meter.createUpDownCounter('cache_hit_ratio', {
      description: 'Cache hit ratio (0-1)',
    }),
    
    // AI metrics
    aiRequestsTotal: meter.createCounter('ai_requests_total', {
      description: 'Total number of AI requests',
    }),
    aiRequestDuration: meter.createHistogram('ai_request_duration_ms', {
      description: 'AI request duration in milliseconds',
    }),
    aiTokensUsed: meter.createCounter('ai_tokens_used_total', {
      description: 'Total number of AI tokens consumed',
    }),
    
    // Voice metrics
    voiceSessionsActive: meter.createUpDownCounter('voice_sessions_active', {
      description: 'Number of active voice sessions',
    }),
    voiceSynthesisDuration: meter.createHistogram('voice_synthesis_duration_ms', {
      description: 'Voice synthesis duration in milliseconds',
    }),
    voiceRecognitionDuration: meter.createHistogram('voice_recognition_duration_ms', {
      description: 'Voice recognition duration in milliseconds',
    }),
    
    // Business metrics
    sitesActive: meter.createUpDownCounter('sites_active', {
      description: 'Number of active sites',
    }),
    conversationsTotal: meter.createCounter('conversations_total', {
      description: 'Total number of conversations',
    }),
    knowledgeBaseSize: meter.createUpDownCounter('knowledge_base_size_bytes', {
      description: 'Size of knowledge base in bytes',
    }),
  };
}

/**
 * Create in-memory metrics implementation
 */
function createInMemoryMetrics(): MetricsRegistry {
  const counters = new Map<string, number>();
  const gauges = new Map<string, number>();
  const histograms = new Map<string, number[]>();

  const createCounter = (name: string): Counter => ({
    inc: (value = 1, labels) => {
      const key = createKey(name, labels);
      counters.set(key, (counters.get(key) || 0) + value);
    }
  });

  const createHistogram = (name: string): Histogram => ({
    observe: (value, labels) => {
      const key = createKey(name, labels);
      if (!histograms.has(key)) {
        histograms.set(key, []);
      }
      histograms.get(key)!.push(value);
    }
  });

  const createGauge = (name: string): Gauge => ({
    set: (value, labels) => {
      const key = createKey(name, labels);
      gauges.set(key, value);
    },
    inc: (value = 1, labels) => {
      const key = createKey(name, labels);
      gauges.set(key, (gauges.get(key) || 0) + value);
    },
    dec: (value = 1, labels) => {
      const key = createKey(name, labels);
      gauges.set(key, (gauges.get(key) || 0) - value);
    }
  });

  return {
    httpRequestsTotal: createCounter('http_requests_total'),
    httpRequestDuration: createHistogram('http_request_duration_ms'),
    httpRequestsInFlight: createGauge('http_requests_in_flight'),
    
    dbQueryDuration: createHistogram('db_query_duration_ms'),
    dbConnectionsActive: createGauge('db_connections_active'),
    dbConnectionsTotal: createCounter('db_connections_total'),
    
    queueJobsTotal: createCounter('queue_jobs_total'),
    queueJobDuration: createHistogram('queue_job_duration_ms'),
    queueDepth: createGauge('queue_depth'),
    queueJobsInFlight: createGauge('queue_jobs_in_flight'),
    
    cacheOperations: createCounter('cache_operations_total'),
    cacheHitRatio: createGauge('cache_hit_ratio'),
    
    aiRequestsTotal: createCounter('ai_requests_total'),
    aiRequestDuration: createHistogram('ai_request_duration_ms'),
    aiTokensUsed: createCounter('ai_tokens_used_total'),
    
    voiceSessionsActive: createGauge('voice_sessions_active'),
    voiceSynthesisDuration: createHistogram('voice_synthesis_duration_ms'),
    voiceRecognitionDuration: createHistogram('voice_recognition_duration_ms'),
    
    sitesActive: createGauge('sites_active'),
    conversationsTotal: createCounter('conversations_total'),
    knowledgeBaseSize: createGauge('knowledge_base_size_bytes'),
  };
}

/**
 * Create metric key with labels
 */
function createKey(name: string, labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) {
    return name;
  }
  
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
    
  return `${name}{${labelStr}}`;
}

/**
 * Start background metrics collection
 */
function startBackgroundCollection(): void {
  // Collect system metrics every 30 seconds
  setInterval(async () => {
    try {
      await collectSystemMetrics();
    } catch (error) {
      logger.debug('Error collecting system metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 30000);
}

/**
 * Collect system-level metrics
 */
async function collectSystemMetrics(): Promise<void> {
  // Process metrics
  const memUsage = process.memoryUsage();
  metrics.knowledgeBaseSize.set(memUsage.heapUsed, { type: 'heap' });
  
  // Additional system metrics would go here
  // (CPU usage, disk usage, etc.)
}

/**
 * Express middleware for HTTP metrics
 */
export function createMetricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    // Increment in-flight requests
    metrics.httpRequestsInFlight.inc(1, {
      method: req.method,
      route: req.route?.path || req.path,
    });

    // Override res.end to record metrics
    const originalEnd = res.end;
    res.end = function(this: any, ...args: any[]) {
      const duration = Date.now() - startTime;
      const labels = {
        method: req.method,
        status_code: String(res.statusCode),
        route: req.route?.path || req.path,
      };

      // Record metrics
      metrics.httpRequestsTotal.inc(1, labels);
      metrics.httpRequestDuration.observe(duration, labels);
      metrics.httpRequestsInFlight.dec(1, {
        method: req.method,
        route: req.route?.path || req.path,
      });

      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Helper functions for common metrics
 */
export const metricsHelpers = {
  // Database metrics
  recordDbQuery: (duration: number, operation: string, success: boolean) => {
    metrics.dbQueryDuration.observe(duration, {
      operation,
      status: success ? 'success' : 'error',
    });
  },

  // Queue metrics  
  recordQueueJob: (queue: string, jobType: string, duration: number, success: boolean) => {
    metrics.queueJobsTotal.inc(1, {
      queue,
      job_type: jobType,
      status: success ? 'success' : 'error',
    });
    metrics.queueJobDuration.observe(duration, { queue, job_type: jobType });
  },

  // AI metrics
  recordAiRequest: (model: string, duration: number, tokens: number, success: boolean) => {
    metrics.aiRequestsTotal.inc(1, {
      model,
      status: success ? 'success' : 'error',
    });
    metrics.aiRequestDuration.observe(duration, { model });
    metrics.aiTokensUsed.inc(tokens, { model });
  },

  // Cache metrics
  recordCacheOperation: (operation: 'hit' | 'miss' | 'set' | 'delete', key_type?: string) => {
    metrics.cacheOperations.inc(1, {
      operation,
      key_type: key_type || 'unknown',
    });
  },

  // Voice metrics
  recordVoiceSession: (operation: 'start' | 'end') => {
    if (operation === 'start') {
      metrics.voiceSessionsActive.inc(1);
    } else {
      metrics.voiceSessionsActive.dec(1);
    }
  },
};

// Export metrics registry for direct access
export { metrics };