/**
 * Shared logging utilities
 * Provides consistent logging interface for both client and server
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
  timestamp: Date;
  correlationId?: string;
  tenantId?: string;
  userId?: string;
}

export interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  child(context: Record<string, any>): Logger;
}

/**
 * Console-based logger implementation
 * Can be replaced with more sophisticated implementations in server/client
 */
export class ConsoleLogger implements Logger {
  private context: Record<string, any> = {};

  constructor(context?: Record<string, any>) {
    if (context) {
      this.context = { ...context };
    }
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

  child(context: Record<string, any>): Logger {
    return new ConsoleLogger({ ...this.context, ...context });
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    const entry: LogEntry = {
      level,
      message,
      meta: { ...this.context, ...meta },
      timestamp: new Date(),
    };

    // Format for console output
    const logMethod = console[level] || console.log;
    const timestamp = entry.timestamp.toISOString();
    const metaStr = entry.meta && Object.keys(entry.meta).length > 0 
      ? JSON.stringify(entry.meta, null, 2)
      : '';

    logMethod(`[${timestamp}] ${level.toUpperCase()}: ${message}`, metaStr || '');
  }
}

/**
 * Create a logger instance
 * This can be configured differently for server vs client
 */
export function createLogger(context?: Record<string, any>): Logger {
  return new ConsoleLogger(context);
}

/**
 * Sanitize sensitive data from log entries
 */
export function sanitizeLogData(data: any): any {
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'bearer', 'cookie', 'session', 'apikey', 'api_key'
  ];

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): Record<string, any> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return { message: 'Unknown error', error };
}