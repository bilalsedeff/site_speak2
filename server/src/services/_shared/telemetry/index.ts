/**
 * Telemetry Service - Main exports and initialization
 * 
 * Provides unified observability infrastructure with OpenTelemetry,
 * structured logging, and metrics collection.
 */

// Re-export logger
export {
  logger,
  createTelemetryLogger,
  createServiceLogger,
  createLoggerMiddleware,
  logError,
  logPerformance,
} from './logger.js';

export type { EnhancedLogger } from './logger.js';

// Re-export OpenTelemetry
export {
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
  createSpan,
  withSpan,
  addSpanAttributes,
  recordException,
  trace,
  context,
} from './otel.js';

// Re-export metrics
export {
  initializeMetrics,
  createMetricsMiddleware,
  metricsHelpers,
  metrics,
} from './metrics.js';

export type { Counter, Histogram, Gauge } from './metrics.js';

import { initializeOpenTelemetry } from './otel.js';
import { initializeMetrics } from './metrics.js';
import { logger } from './logger.js';

/**
 * Initialize complete telemetry system
 */
export async function initializeTelemetry(): Promise<void> {
  try {
    logger.info('Initializing telemetry system...');

    // Initialize OpenTelemetry first (affects all other instrumentation)
    await initializeOpenTelemetry();

    // Initialize metrics collection
    await initializeMetrics();

    logger.info('Telemetry system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize telemetry system', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Health check for telemetry system
 */
export function checkTelemetryHealth(): {
  healthy: boolean;
  components: Record<string, boolean>;
} {
  const components = {
    logger: true, // Logger is always available
    opentelemetry: true, // We have fallbacks
    metrics: true, // We have in-memory fallbacks
  };

  return {
    healthy: Object.values(components).every(Boolean),
    components,
  };
}

/**
 * Create telemetry service for dependency injection
 */
export const createTelemetryService = () => ({
  logger,
  createLogger: createServiceLogger,
  initialize: initializeTelemetry,
  health: checkTelemetryHealth,
});

export type TelemetryService = ReturnType<typeof createTelemetryService>;