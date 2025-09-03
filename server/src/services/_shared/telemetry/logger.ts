/**
 * Enhanced Logger - Simple wrapper around existing logger
 * 
 * Provides a consistent logging interface for the API Gateway services
 */

import { createLogger as createBaseLogger, Logger } from '../../../shared/utils.js';

/**
 * Enhanced logger options
 */
export interface LoggerOptions {
  service: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
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

// Default logger instance for backward compatibility
export const logger = createLogger({ service: 'app' });

// Re-export base types for compatibility
export type { Logger } from '../../../shared/utils.js';