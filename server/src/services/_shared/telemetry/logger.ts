/**
 * Enhanced Logger - Telemetry-focused logging with OpenTelemetry integration
 * 
 * Provides comprehensive logging infrastructure for the telemetry system
 * with performance tracking, structured errors, and middleware support.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger as createBaseLogger, Logger } from '../../../shared/utils.js';
import { formatError, sanitizeLogData } from '../../../../../shared/utils/logger.js';

/**
 * Enhanced logger options
 */
export interface LoggerOptions {
  service: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Enhanced logger with telemetry features
 */
export interface EnhancedLogger extends Logger {
  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, meta?: Record<string, any>): void;
  
  /**
   * Log errors with structured format
   */
  errorWithDetails(error: unknown, context?: Record<string, any>): void;
  
  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): EnhancedLogger;
}

/**
 * Performance measurement result
 */
export interface PerformanceMeasurement {
  operation: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Create enhanced logger with telemetry features
 */
function createEnhancedLogger(options: LoggerOptions): EnhancedLogger {
  const baseLogger = createBaseLogger({
    service: options.service,
    level: options.level || 'info'
  });

  return {
    debug: baseLogger.debug.bind(baseLogger),
    info: baseLogger.info.bind(baseLogger),
    warn: baseLogger.warn.bind(baseLogger),
    error: baseLogger.error.bind(baseLogger),
    
    performance(operation: string, duration: number, meta?: Record<string, any>): void {
      const performanceData = {
        operation,
        duration,
        timestamp: new Date().toISOString(),
        ...meta
      };
      
      baseLogger.info(`Performance: ${operation}`, performanceData);
    },
    
    errorWithDetails(error: unknown, context?: Record<string, any>): void {
      const errorData = {
        ...formatError(error),
        ...context,
        timestamp: new Date().toISOString()
      };
      
      baseLogger.error('Error occurred', sanitizeLogData(errorData));
    },
    
    child(_context: Record<string, any>): EnhancedLogger {
      // Create a new enhanced logger with the merged context
      return createEnhancedLogger({ 
        service: options.service, 
        level: options.level || 'info'
      });
    }
  };
}

/**
 * Create logger with service context
 */
export function createLogger(options: LoggerOptions): Logger {
  return createBaseLogger({
    service: options.service,
    level: options.level || 'info'
  });
}

/**
 * Create telemetry-specific logger with OpenTelemetry integration
 */
export function createTelemetryLogger(service: string): EnhancedLogger {
  return createEnhancedLogger({ 
    service: `telemetry-${service}`,
    level: 'info'
  });
}

/**
 * Create service-specific logger for dependency injection
 */
export function createServiceLogger(serviceName: string, options?: Partial<LoggerOptions>): EnhancedLogger {
  return createEnhancedLogger({
    service: serviceName,
    level: options?.level || 'info'
  });
}

/**
 * Express middleware for request logging with telemetry
 */
export function createLoggerMiddleware(options?: { 
  includeBody?: boolean;
  excludePaths?: string[];
}) {
  const opts = {
    includeBody: false,
    excludePaths: ['/health', '/metrics'],
    ...options
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const requestLogger = createTelemetryLogger('http-request');

    // Skip logging for excluded paths
    if (opts.excludePaths.some(path => req.path.startsWith(path))) {
      next();
      return;
    }

    // Log request start
    const requestData = {
      method: req.method,
      url: req.url,
      correlationId: req.correlationId || 'unknown',
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      ...(opts.includeBody && req.body && { body: sanitizeLogData(req.body) })
    };

    requestLogger.debug('HTTP request started', requestData);

    // Log response completion
    res.on('finish', () => {
      const duration = Date.now() - start;
      const responseData = {
        ...requestData,
        statusCode: res.statusCode,
        duration,
        success: res.statusCode < 400
      };

      if (res.statusCode >= 500) {
        requestLogger.error('HTTP request failed', responseData);
      } else if (res.statusCode >= 400) {
        requestLogger.warn('HTTP request error', responseData);
      } else {
        requestLogger.info('HTTP request completed', responseData);
      }

      // Log performance metrics
      requestLogger.performance('http_request', duration, {
        method: req.method,
        route: req.route?.path || req.path,
        statusCode: res.statusCode
      });
    });

    next();
  };
}

/**
 * Log error with telemetry context
 */
export function logError(error: unknown, context?: Record<string, any>): void {
  const errorLogger = createTelemetryLogger('error-handler');
  errorLogger.errorWithDetails(error, context);
}

/**
 * Log performance measurement
 */
export function logPerformance(
  operation: string, 
  startTime: number, 
  metadata?: Record<string, any>
): PerformanceMeasurement {
  const duration = Date.now() - startTime;
  const measurement: PerformanceMeasurement = {
    operation,
    duration,
    timestamp: new Date(),
    ...(metadata && { metadata })
  };

  const performanceLogger = createTelemetryLogger('performance');
  performanceLogger.performance(operation, duration, metadata);

  return measurement;
}

/**
 * Create a performance timer
 */
export function createPerformanceTimer(operation: string) {
  const startTime = Date.now();
  
  return {
    end: (metadata?: Record<string, any>) => {
      return logPerformance(operation, startTime, metadata);
    }
  };
}

// Default logger instance for backward compatibility
export const logger = createLogger({ service: 'app' });

// Re-export base types for compatibility
export type { Logger } from '../../../shared/utils.js';