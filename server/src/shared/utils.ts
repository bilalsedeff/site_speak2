/**
 * Shared utilities for the SiteSpeak application
 */

export interface LoggerOptions {
  service?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
}

export interface Logger {
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { service = 'app', level = 'info' } = options;
  
  const shouldLog = (messageLevel: string) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(messageLevel) >= levels.indexOf(level);
  };

  const formatMessage = (level: string, message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${service}] ${message}${metaStr}`;
  };

  return {
    debug: (message: string, meta?: any) => {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', message, meta));
      }
    },
    info: (message: string, meta?: any) => {
      if (shouldLog('info')) {
        console.log(formatMessage('info', message, meta));
      }
    },
    warn: (message: string, meta?: any) => {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message, meta));
      }
    },
    error: (message: string, meta?: any) => {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message, meta));
      }
    }
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}