/**
 * Enhanced Logger - Bridge to existing logger with OpenTelemetry integration
 * 
 * Extends our existing logger infrastructure with trace correlation,
 * structured logging, and OpenTelemetry integration.
 */

import { trace } from '@opentelemetry/api';
import { createLogger as createBaseLogger, Logger as BaseLogger, LogLevel, sanitizeLogData } from '../../../../../shared/utils';

/**
 * Enhanced logger interface with trace correlation
 */
export interface EnhancedLogger extends BaseLogger {
  // Override child to return EnhancedLogger instead of BaseLogger
  child(context: Record<string, any>): EnhancedLogger;
  
  // Additional trace/context methods
  withTrace(traceId?: string, spanId?: string): EnhancedLogger;
  withTenant(tenantId: string): EnhancedLogger;
  withUser(userId: string): EnhancedLogger;
  withCorrelation(correlationId: string): EnhancedLogger;
  withContext(ctx: Record<string, any>): EnhancedLogger;
}

/**
 * Enhanced logger implementation with OpenTelemetry integration
 */
export class TelemetryLogger implements EnhancedLogger {
  private baseLogger: BaseLogger;
  private extraContext: Record<string, any> = {};

  constructor(baseContext?: Record<string, any>) {
    this.baseLogger = createBaseLogger(baseContext);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }

  child(context: Record<string, any>): EnhancedLogger {
    const childLogger = new TelemetryLogger();
    // Create new base logger with combined context
    const combinedContext = { ...this.extraContext, ...context };
    childLogger.baseLogger = createBaseLogger(combinedContext);
    childLogger.extraContext = combinedContext;
    return childLogger;
  }

  withTrace(traceId?: string, spanId?: string): EnhancedLogger {
    const activeSpan = trace.getActiveSpan();
    const traceContext = {
      traceId: traceId || activeSpan?.spanContext()?.traceId,
      spanId: spanId || activeSpan?.spanContext()?.spanId,
    };
    
    return this.child(traceContext);
  }

  withTenant(tenantId: string): EnhancedLogger {
    return this.child({ tenantId });
  }

  withUser(userId: string): EnhancedLogger {
    return this.child({ userId });
  }

  withCorrelation(correlationId: string): EnhancedLogger {
    return this.child({ correlationId });
  }

  withContext(ctx: Record<string, any>): EnhancedLogger {
    return this.child(ctx);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    // Get current OpenTelemetry context
    const activeSpan = trace.getActiveSpan();
    const traceContext = activeSpan ? {
      traceId: activeSpan.spanContext().traceId,
      spanId: activeSpan.spanContext().spanId,
    } : {};

    // Merge all context
    const fullMeta = {
      ...this.extraContext,
      ...traceContext,
      ...meta,
    };

    // Sanitize sensitive data
    const sanitizedMeta = sanitizeLogData(fullMeta);

    // Log using base logger with explicit method calling
    switch (level) {
      case 'debug':
        this.baseLogger.debug(message, sanitizedMeta);
        break;
      case 'info':
        this.baseLogger.info(message, sanitizedMeta);
        break;
      case 'warn':
        this.baseLogger.warn(message, sanitizedMeta);
        break;
      case 'error':
        this.baseLogger.error(message, sanitizedMeta);
        break;
    }

    // Add to active span if available
    if (activeSpan && level === 'error') {
      activeSpan.recordException(new Error(message));
      activeSpan.setStatus({ code: 2, message }); // ERROR status
    }
  }
}

/**
 * Create enhanced logger with telemetry capabilities
 */
export function createTelemetryLogger(context?: Record<string, any>): EnhancedLogger {
  return new TelemetryLogger(context);
}

/**
 * Default logger instance for the service
 */
export const logger = createTelemetryLogger({ service: 'sitespeak-api' });

/**
 * Create service-specific logger
 */
export function createServiceLogger(serviceName: string, context?: Record<string, any>): EnhancedLogger {
  return createTelemetryLogger({
    service: serviceName,
    ...context,
  });
}

/**
 * Logger middleware for Express
 */
export function createLoggerMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    // Attach logger to request
    req.logger = logger
      .withCorrelation(requestId)
      .withContext({
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      });

    // Log request start
    req.logger.info('Request started', {
      method: req.method,
      url: req.url,
      headers: sanitizeLogData(req.headers),
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(this: any, ...args: any[]) {
      const duration = Date.now() - startTime;
      
      req.logger.info('Request completed', {
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length'),
      });

      originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Error logging helper
 */
export function logError(error: unknown, context?: Record<string, any>, logger?: EnhancedLogger): void {
  const log = logger || exports.logger;
  
  if (error instanceof Error) {
    log.error(`Error occurred: ${error.message}`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context,
    });
  } else {
    log.error('Unknown error occurred', {
      error: String(error),
      ...context,
    });
  }
}

/**
 * Performance logging helper
 */
export function logPerformance(
  operation: string,
  startTime: number,
  context?: Record<string, any>,
  logger?: EnhancedLogger
): void {
  const duration = Date.now() - startTime;
  const log = logger || exports.logger;
  
  log.info(`Operation completed: ${operation}`, {
    operation,
    duration,
    ...context,
  });

  // Log slow operations as warnings
  if (duration > 5000) { // 5 seconds
    log.warn(`Slow operation detected: ${operation}`, {
      operation,
      duration,
      threshold: 5000,
      ...context,
    });
  }
}