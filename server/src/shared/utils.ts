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

/**
 * Converts a SharedArrayBuffer to ArrayBuffer by copying the data
 */
export function sharedArrayBufferToArrayBuffer(sharedBuffer: SharedArrayBuffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(sharedBuffer.byteLength);
  new Uint8Array(arrayBuffer).set(new Uint8Array(sharedBuffer));
  return arrayBuffer;
}

/**
 * Safely converts any buffer-like object to ArrayBuffer
 */
export function toArrayBuffer(buffer: ArrayBuffer | SharedArrayBuffer): ArrayBuffer {
  if (buffer instanceof SharedArrayBuffer) {
    return sharedArrayBufferToArrayBuffer(buffer);
  }
  return buffer;
}

/**
 * Creates an ArrayBuffer from a Buffer, handling SharedArrayBuffer cases
 */
export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  if (buffer.buffer instanceof SharedArrayBuffer) {
    // Copy data from SharedArrayBuffer to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(new Uint8Array(buffer));
    return arrayBuffer;
  }

  // Return a slice of the underlying ArrayBuffer
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Safely extracts error message from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}