/**
 * Validation Middleware - Request validation for API Gateway
 * 
 * Provides middleware for content type validation, payload size limits,
 * and other common request validation patterns.
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../_shared/telemetry/logger.js';

const validationLogger = createLogger({ service: 'api-validation' });

/**
 * Validate request content type
 */
export function validateContentType(allowedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'];
    
    if (!contentType) {
      res.status(400).json({
        success: false,
        error: 'Missing Content-Type header',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`
      });
      return;
    }

    // Extract base content type (ignore charset, boundary, etc.)
    const baseContentType = contentType.split(';')[0]?.trim().toLowerCase() || contentType.toLowerCase();
    
    if (!allowedTypes.includes(baseContentType)) {
      res.status(415).json({
        success: false,
        error: 'Unsupported Content-Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
        received: baseContentType
      });
      return;
    }

    next();
  };
}

/**
 * Validate request payload size
 */
export function validatePayloadSize(options: { maxSizeKb: number }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeBytes = parseInt(contentLength, 10);
      const maxSizeBytes = options.maxSizeKb * 1024;
      
      if (sizeBytes > maxSizeBytes) {
        validationLogger.warn('Request payload too large', {
          sizeBytes,
          maxSizeBytes,
          path: req.path,
          method: req.method,
          ip: req.ip
        });

        res.status(413).json({
          success: false,
          error: 'Payload too large',
          message: `Maximum payload size is ${options.maxSizeKb}KB`,
          received: Math.round(sizeBytes / 1024),
          limit: options.maxSizeKb
        });
        return;
      }
    }

    next();
  };
}

/**
 * Validate request encoding for compressed payloads
 */
export function validateEncoding(options: { 
  required?: boolean;
  allowedEncodings?: string[];
}) {
  const allowedEncodings = options.allowedEncodings || ['gzip', 'br', 'deflate'];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentEncoding = req.headers['content-encoding'];
    
    if (options.required && !contentEncoding) {
      res.status(400).json({
        success: false,
        error: 'Content encoding required',
        message: `Content-Encoding must be one of: ${allowedEncodings.join(', ')}`
      });
      return;
    }

    if (contentEncoding && !allowedEncodings.includes(contentEncoding)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported Content-Encoding',
        message: `Content-Encoding must be one of: ${allowedEncodings.join(', ')}`,
        received: contentEncoding
      });
      return;
    }

    next();
  };
}

/**
 * Validate query parameters
 */
export function validateQueryParams(schema: Record<string, {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean';
  enum?: string[];
  min?: number;
  max?: number;
}>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    for (const [param, rules] of Object.entries(schema)) {
      const value = req.query[param];
      
      // Check required
      if (rules.required && (value === undefined || value === '')) {
        errors.push(`Missing required parameter: ${param}`);
        continue;
      }
      
      // Skip validation if optional and not provided
      if (!rules.required && (value === undefined || value === '')) {
        continue;
      }
      
      const stringValue = String(value);
      
      // Type validation
      if (rules.type) {
        switch (rules.type) {
          case 'number':
            { if (isNaN(Number(stringValue))) {
              errors.push(`Parameter ${param} must be a number`);
              continue;
            }
            const numValue = Number(stringValue);
            if (rules.min !== undefined && numValue < rules.min) {
              errors.push(`Parameter ${param} must be >= ${rules.min}`);
            }
            if (rules.max !== undefined && numValue > rules.max) {
              errors.push(`Parameter ${param} must be <= ${rules.max}`);
            }
            break; }
            
          case 'boolean':
            if (!['true', 'false', '1', '0'].includes(stringValue.toLowerCase())) {
              errors.push(`Parameter ${param} must be a boolean (true/false)`);
            }
            break;
            
          case 'string':
            if (rules.min !== undefined && stringValue.length < rules.min) {
              errors.push(`Parameter ${param} must be at least ${rules.min} characters`);
            }
            if (rules.max !== undefined && stringValue.length > rules.max) {
              errors.push(`Parameter ${param} must be at most ${rules.max} characters`);
            }
            break;
        }
      }
      
      // Enum validation
      if (rules.enum && !rules.enum.includes(stringValue)) {
        errors.push(`Parameter ${param} must be one of: ${rules.enum.join(', ')}`);
      }
    }
    
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: errors
      });
      return;
    }
    
    next();
  };
}

/**
 * Validate JSON schema in request body
 */
export function validateJsonSchema(validate: (data: unknown) => { success: boolean; errors?: string[] }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.body) {
      res.status(400).json({
        success: false,
        error: 'Missing request body',
        message: 'Request body is required'
      });
      return;
    }

    const validation = validate(req.body);
    
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Request validation failed',
        details: validation.errors || ['Unknown validation error']
      });
      return;
    }

    next();
  };
}

/**
 * Security headers validation
 */
export function validateSecurityHeaders(options: {
  requireOrigin?: boolean;
  allowedOrigins?: string[];
  requireUserAgent?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    
    // Origin validation
    if (options.requireOrigin) {
      const origin = req.headers.origin || req.headers.referer;
      if (!origin) {
        errors.push('Origin header is required');
      } else if (options.allowedOrigins && options.allowedOrigins.length > 0) {
        const originUrl = typeof origin === 'string' ? origin : origin[0];
        try {
          const originHost = new URL(originUrl).hostname;
          if (!options.allowedOrigins.some(allowed => 
            allowed === '*' || 
            allowed === originHost || 
            originHost.endsWith('.' + allowed)
          )) {
            errors.push(`Origin not allowed: ${originHost}`);
          }
        } catch {
          errors.push(`Invalid origin format: ${originUrl}`);
        }
      }
    }
    
    // User agent validation
    if (options.requireUserAgent && !req.headers['user-agent']) {
      errors.push('User-Agent header is required');
    }
    
    if (errors.length > 0) {
      validationLogger.warn('Security header validation failed', {
        errors,
        path: req.path,
        method: req.method,
        ip: req.ip,
        origin: req.headers.origin,
        userAgent: req.headers['user-agent']
      });

      res.status(400).json({
        success: false,
        error: 'Security validation failed',
        details: errors
      });
      return;
    }
    
    next();
  };
}

/**
 * Rate limit headers helper
 */
export function addRateLimitHeaders(options: {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set({
      'X-RateLimit-Limit': options.limit.toString(),
      'X-RateLimit-Remaining': options.remaining.toString(),
      'X-RateLimit-Reset': options.reset.toString(),
    });
    
    if (options.retryAfter) {
      res.set('Retry-After', options.retryAfter.toString());
    }
    
    next();
  };
}