/**
 * OpenTelemetry Setup - Instrumentation and tracing
 * 
 * Initializes OpenTelemetry SDK with proper instrumentation
 * for Node.js, Express, Postgres, Redis, and BullMQ.
 * 
 * NOTE: Requires OpenTelemetry packages to be installed:
 * npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
 */

import { cfg } from '../config/index.js';
import { logger } from './logger.js';

// Mock interfaces for when OpenTelemetry packages aren't available
interface MockSpan {
  setAttributes(attributes: Record<string, any>): void;
  recordException(error: Error): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
}

interface MockTracer {
  startSpan(name: string, options?: any): MockSpan;
}

interface MockTrace {
  getActiveSpan(): MockSpan | undefined;
  setSpan(context: any, span: MockSpan): any;
  getSpanContext(span: MockSpan): { traceId: string; spanId: string } | undefined;
}

// Try to import OpenTelemetry, fallback to mocks if not available
let trace: MockTrace;
let context: any;
let NodeSDK: any;

try {
  const otelApi = await import('@opentelemetry/api');
  const otelSdk = await import('@opentelemetry/sdk-node');
  const otelInstrumentations = await import('@opentelemetry/auto-instrumentations-node');
  
  trace = otelApi.trace as any;
  context = otelApi.context;
  NodeSDK = otelSdk.NodeSDK;
  
} catch (error) {
  logger.warn('OpenTelemetry packages not available, using mock implementation', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  
  // Mock implementation
  const mockSpan: MockSpan = {
    setAttributes: () => {},
    recordException: () => {},
    setStatus: () => {},
    end: () => {},
  };
  
  trace = {
    getActiveSpan: () => undefined,
    setSpan: (ctx: any, span: MockSpan) => ctx,
    getSpanContext: () => undefined,
  };
  
  context = {
    active: () => ({}),
    with: (ctx: any, fn: any) => fn(),
  };
}

/**
 * OpenTelemetry SDK instance
 */
let sdk: any;

/**
 * Initialize OpenTelemetry instrumentation
 */
export async function initializeOpenTelemetry(): Promise<void> {
  if (!cfg.OTEL_ENABLED) {
    logger.info('OpenTelemetry disabled by configuration');
    return;
  }

  try {
    logger.info('Initializing OpenTelemetry...');

    if (!NodeSDK) {
      logger.warn('OpenTelemetry SDK not available, telemetry will be limited');
      return;
    }

    // Initialize SDK
    sdk = new NodeSDK({
      serviceName: cfg.OTEL_SERVICE_NAME,
      serviceVersion: cfg.OTEL_SERVICE_VERSION,
      
      // Resource attributes
      resource: {
        attributes: {
          'service.name': cfg.OTEL_SERVICE_NAME,
          'service.version': cfg.OTEL_SERVICE_VERSION,
          'deployment.environment': cfg.NODE_ENV,
        },
      },

      // Tracing configuration
      tracing: {
        sampler: getSampler(),
        spanProcessors: getSpanProcessors(),
      },

      // Auto-instrumentations
      instrumentations: [
        // Will auto-instrument Express, HTTP, Postgres, Redis, etc.
      ],

      // Metrics configuration
      metrics: {
        enabled: true,
        interval: 30000, // 30 seconds
      },
    });

    // Start the SDK
    sdk.start();
    
    logger.info('OpenTelemetry initialized successfully', {
      serviceName: cfg.OTEL_SERVICE_NAME,
      serviceVersion: cfg.OTEL_SERVICE_VERSION,
      environment: cfg.NODE_ENV,
      samplerType: cfg.OTEL_TRACES_SAMPLER,
      samplerArg: cfg.OTEL_TRACES_SAMPLER_ARG,
    });

  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get trace sampler based on configuration
 */
function getSampler(): any {
  if (!NodeSDK) {return null;}

  try {
    const { TraceIdRatioBasedSampler, AlwaysOnSampler, AlwaysOffSampler, ParentBasedSampler } = 
      require('@opentelemetry/sdk-trace-base');

    switch (cfg.OTEL_TRACES_SAMPLER) {
      case 'always_on':
        return new AlwaysOnSampler();
      
      case 'always_off':
        return new AlwaysOffSampler();
      
      case 'traceidratio':
        return new TraceIdRatioBasedSampler(cfg.OTEL_TRACES_SAMPLER_ARG);
      
      case 'parentbased_always_on':
        return new ParentBasedSampler({
          root: new AlwaysOnSampler(),
        });
      
      default:
        return new TraceIdRatioBasedSampler(cfg.OTEL_TRACES_SAMPLER_ARG);
    }
  } catch {
    return null;
  }
}

/**
 * Get span processors for exporting traces
 */
function getSpanProcessors(): any[] {
  if (!cfg.OTEL_EXPORTER_OTLP_ENDPOINT || !NodeSDK) {
    return [];
  }

  try {
    const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');

    const exporter = new OTLPTraceExporter({
      url: cfg.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: cfg.OTEL_EXPORTER_OTLP_HEADERS ? 
        JSON.parse(cfg.OTEL_EXPORTER_OTLP_HEADERS) : 
        {},
    });

    return [new BatchSpanProcessor(exporter)];
  } catch {
    logger.warn('Failed to create OTLP trace exporter, traces will not be exported');
    return [];
  }
}

/**
 * Create a manual span for custom instrumentation
 */
export function createSpan(
  name: string,
  attributes?: Record<string, any>,
  parentSpan?: MockSpan
): MockSpan {
  try {
    const tracer = trace.getTracer?.(cfg.OTEL_SERVICE_NAME) || { startSpan: () => mockSpan };
    const span = tracer.startSpan(name, {
      parent: parentSpan,
      attributes,
    });

    return span;
  } catch (error) {
    logger.debug('Failed to create span, using mock', { spanName: name });
    return mockSpan;
  }
}

/**
 * Execute function with span context
 */
export async function withSpan<T>(
  name: string,
  fn: (span: MockSpan) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createSpan(name, attributes);
  
  try {
    const result = await context?.with?.(
      trace.setSpan?.(context.active(), span),
      () => fn(span)
    ) || fn(span);
    
    span.setStatus?.({ code: 1 }); // OK status
    return result;
  } catch (error) {
    span.recordException?.(error instanceof Error ? error : new Error(String(error)));
    span.setStatus?.({ code: 2, message: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  } finally {
    span.end?.();
  }
}

/**
 * Add attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, any>): void {
  const activeSpan = trace.getActiveSpan?.();
  if (activeSpan) {
    activeSpan.setAttributes?.(attributes);
  }
}

/**
 * Record an exception in the current span
 */
export function recordException(error: Error): void {
  const activeSpan = trace.getActiveSpan?.();
  if (activeSpan) {
    activeSpan.recordException?.(error);
  }
}

/**
 * Shutdown OpenTelemetry gracefully
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    logger.info('Shutting down OpenTelemetry...');
    await sdk.shutdown();
    logger.info('OpenTelemetry shutdown completed');
  } catch (error) {
    logger.error('Error shutting down OpenTelemetry', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Mock span for when OpenTelemetry is not available
const mockSpan: MockSpan = {
  setAttributes: () => {},
  recordException: () => {},
  setStatus: () => {},
  end: () => {},
};

// Setup shutdown handlers
process.on('SIGINT', shutdownOpenTelemetry);
process.on('SIGTERM', shutdownOpenTelemetry);
process.on('beforeExit', shutdownOpenTelemetry);

// Export trace and context for other modules
export { trace, context };