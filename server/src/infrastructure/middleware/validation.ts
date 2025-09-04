import { Request, Response, NextFunction } from 'express';
import { ParsedQs } from 'qs';
import { z, ZodSchema } from 'zod';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'validation' });

export interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
  headers?: ZodSchema;
}

export class ValidationError extends Error {
  constructor(
    public field: string,
    public issues: z.ZodIssue[],
    message: string = 'Validation failed'
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Middleware factory for request validation using Zod schemas
 */
export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: { field: string; issues: z.ZodIssue[] }[] = [];

      // Validate body
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          errors.push({
            field: 'body',
            issues: result.error.issues,
          });
        } else {
          req.body = result.data;
        }
      }

      // Validate params
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          errors.push({
            field: 'params',
            issues: result.error.issues,
          });
        } else {
          req.params = result.data;
        }
      }

      // Validate query
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          errors.push({
            field: 'query',
            issues: result.error.issues,
          });
        } else {
          req.query = result.data;
        }
      }

      // Validate headers
      if (schemas.headers) {
        const result = schemas.headers.safeParse(req.headers);
        if (!result.success) {
          errors.push({
            field: 'headers',
            issues: result.error.issues,
          });
        }
      }

      if (errors.length > 0) {
        logger.warn('Request validation failed', {
          correlationId: req.correlationId,
          path: req.path,
          method: req.method,
          errors: errors.map(e => ({
            field: e.field,
            issues: e.issues.map(issue => ({
              path: issue.path.join('.'),
              code: issue.code,
              message: issue.message,
            })),
          })),
        });

        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          correlationId: req.correlationId,
          details: errors.reduce((acc, error) => {
            acc[error.field] = error.issues.map(issue => ({
              path: issue.path.join('.') || error.field,
              code: issue.code,
              message: issue.message,
              received: 'received' in issue ? issue.received : undefined,
              expected: 'expected' in issue ? issue.expected : undefined,
            }));
            return acc;
          }, {} as Record<string, unknown>),
        });
      }

      next();
      return;
    } catch (error) {
      logger.error('Validation middleware error', {
        error,
        correlationId: req.correlationId,
      });

      res.status(500).json({
        error: 'Internal validation error',
        code: 'VALIDATION_INTERNAL_ERROR',
        correlationId: req.correlationId,
      });
      return;
    }
  };
}

/**
 * Sanitize request data to prevent XSS and other attacks
 */
export function sanitizeRequest() {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Recursively sanitize strings in objects
      const sanitizeValue = (value: unknown): unknown => {
        if (typeof value === 'string') {
          // Basic XSS prevention - remove script tags and event handlers
          return value
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '')
            .replace(/javascript:/gi, '')
            .trim();
        }
        
        if (Array.isArray(value)) {
          return value.map(sanitizeValue);
        }
        
        if (value && typeof value === 'object') {
          const sanitized: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
          }
          return sanitized;
        }
        
        return value;
      };

      if (req.body) {
        req.body = sanitizeValue(req.body);
      }

      if (req.query) {
        const sanitizedQuery = sanitizeValue(req.query);
        // Type-safe assignment to ParsedQs - ensure the sanitized value conforms
        req.query = sanitizedQuery as ParsedQs;
      }

      next();
    } catch (error) {
      logger.error('Request sanitization error', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  };
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  uuid: z.string().uuid(),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).trim(),
  url: z.string().url(),
  
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date ranges
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),

  // File upload
  fileUpload: z.object({
    filename: z.string().min(1),
    mimetype: z.string().min(1),
    size: z.number().int().positive(),
  }),
};