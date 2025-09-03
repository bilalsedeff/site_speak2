/**
 * RFC 9457 Problem Details for HTTP APIs
 * 
 * Implements standardized error responses with:
 * - type: URI identifying the problem type
 * - title: Human-readable summary
 * - status: HTTP status code
 * - detail: Specific error description
 * - instance: URI identifying specific occurrence
 * - extensions: Additional context (correlationId, tenantId, etc.)
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '../../../_shared/telemetry/logger';

const logger = createLogger({ service: 'problem-details' });

// Base problem type URI
const PROBLEM_BASE_URI = 'https://sitespeak.ai/problems/';

/**
 * Standard problem types
 */
export const ProblemTypes = {
  // Client errors (4xx)
  BAD_REQUEST: `${PROBLEM_BASE_URI}bad-request`,
  UNAUTHORIZED: `${PROBLEM_BASE_URI}unauthorized`,
  FORBIDDEN: `${PROBLEM_BASE_URI}forbidden`,
  NOT_FOUND: `${PROBLEM_BASE_URI}not-found`,
  METHOD_NOT_ALLOWED: `${PROBLEM_BASE_URI}method-not-allowed`,
  NOT_ACCEPTABLE: `${PROBLEM_BASE_URI}not-acceptable`,
  TIMEOUT: `${PROBLEM_BASE_URI}timeout`,
  CONFLICT: `${PROBLEM_BASE_URI}conflict`,
  GONE: `${PROBLEM_BASE_URI}gone`,
  PAYLOAD_TOO_LARGE: `${PROBLEM_BASE_URI}payload-too-large`,
  UNSUPPORTED_MEDIA_TYPE: `${PROBLEM_BASE_URI}unsupported-media-type`,
  UNPROCESSABLE_ENTITY: `${PROBLEM_BASE_URI}unprocessable-entity`,
  TOO_MANY_REQUESTS: `${PROBLEM_BASE_URI}too-many-requests`,
  
  // Server errors (5xx)
  INTERNAL_SERVER_ERROR: `${PROBLEM_BASE_URI}internal-server-error`,
  NOT_IMPLEMENTED: `${PROBLEM_BASE_URI}not-implemented`,
  BAD_GATEWAY: `${PROBLEM_BASE_URI}bad-gateway`,
  SERVICE_UNAVAILABLE: `${PROBLEM_BASE_URI}service-unavailable`,
  GATEWAY_TIMEOUT: `${PROBLEM_BASE_URI}gateway-timeout`,
  
  // API Gateway specific
  VALIDATION_ERROR: `${PROBLEM_BASE_URI}validation-error`,
  TENANT_ACCESS_DENIED: `${PROBLEM_BASE_URI}tenant-access-denied`,
  RATE_LIMITED: `${PROBLEM_BASE_URI}rate-limited`,
  AUTHENTICATION_REQUIRED: `${PROBLEM_BASE_URI}authentication-required`,
  INSUFFICIENT_PERMISSIONS: `${PROBLEM_BASE_URI}insufficient-permissions`
} as const;

/**
 * Problem Details interface
 */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  extensions?: Record<string, any>;
}

/**
 * Create a Problem Detail object
 */
export function createProblemDetail(options: {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  tenantId?: string;
  extensions?: Record<string, any>;
}): ProblemDetail {
  const {
    type,
    title,
    status,
    detail,
    instance,
    correlationId,
    tenantId,
    extensions = {}
  } = options;

  const problem: ProblemDetail = {
    type: type || getDefaultProblemType(status),
    title,
    status,
    ...(detail && { detail }),
    ...(instance && { instance })
  };

  // Add extensions
  if (correlationId || tenantId || Object.keys(extensions).length > 0) {
    problem.extensions = {
      ...(correlationId && { correlationId }),
      ...(tenantId && { tenantId }),
      ...extensions
    };
  }

  return problem;
}

/**
 * Get default problem type for status code
 */
function getDefaultProblemType(status: number): string {
  switch (status) {
    case 400: return ProblemTypes.BAD_REQUEST;
    case 401: return ProblemTypes.UNAUTHORIZED;
    case 403: return ProblemTypes.FORBIDDEN;
    case 404: return ProblemTypes.NOT_FOUND;
    case 405: return ProblemTypes.METHOD_NOT_ALLOWED;
    case 406: return ProblemTypes.NOT_ACCEPTABLE;
    case 408: return ProblemTypes.TIMEOUT;
    case 409: return ProblemTypes.CONFLICT;
    case 410: return ProblemTypes.GONE;
    case 413: return ProblemTypes.PAYLOAD_TOO_LARGE;
    case 415: return ProblemTypes.UNSUPPORTED_MEDIA_TYPE;
    case 422: return ProblemTypes.UNPROCESSABLE_ENTITY;
    case 429: return ProblemTypes.TOO_MANY_REQUESTS;
    case 500: return ProblemTypes.INTERNAL_SERVER_ERROR;
    case 501: return ProblemTypes.NOT_IMPLEMENTED;
    case 502: return ProblemTypes.BAD_GATEWAY;
    case 503: return ProblemTypes.SERVICE_UNAVAILABLE;
    case 504: return ProblemTypes.GATEWAY_TIMEOUT;
    default: return status >= 500 ? ProblemTypes.INTERNAL_SERVER_ERROR : ProblemTypes.BAD_REQUEST;
  }
}

/**
 * Convert Zod errors to Problem Details
 */
function zodErrorToProblemDetail(error: ZodError, req: Request): ProblemDetail {
  const issues = error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }));

  return createProblemDetail({
    type: ProblemTypes.VALIDATION_ERROR,
    title: 'Validation Error',
    status: 422,
    detail: `Request validation failed: ${issues.map(i => `${i.path}: ${i.message}`).join(', ')}`,
    instance: req.originalUrl,
    correlationId: req.correlationId,
    tenantId: req.user?.tenantId,
    extensions: { 
      validationErrors: issues,
      path: req.path,
      method: req.method
    }
  });
}

/**
 * Convert generic error to Problem Details
 */
function errorToProblemDetail(error: Error, req: Request, status: number = 500): ProblemDetail {
  // Handle specific error types
  if (error instanceof ZodError) {
    return zodErrorToProblemDetail(error, req);
  }

  // Handle custom API errors with status codes
  const apiError = error as any;
  if (apiError.statusCode || apiError.status) {
    const errorStatus = apiError.statusCode || apiError.status;
    
    return createProblemDetail({
      type: apiError.type || getDefaultProblemType(errorStatus),
      title: getStatusTitle(errorStatus),
      status: errorStatus,
      detail: error.message,
      instance: req.originalUrl,
      correlationId: req.correlationId,
      tenantId: req.user?.tenantId,
      extensions: {
        path: req.path,
        method: req.method,
        ...(apiError.code && { code: apiError.code })
      }
    });
  }

  // Generic error
  return createProblemDetail({
    title: getStatusTitle(status),
    status,
    detail: process.env['NODE_ENV'] === 'development' ? error.message : 'An unexpected error occurred',
    instance: req.originalUrl,
    correlationId: req.correlationId,
    tenantId: req.user?.tenantId,
    extensions: {
      path: req.path,
      method: req.method,
      ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack })
    }
  });
}

/**
 * Get human-readable title for status code
 */
function getStatusTitle(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };
  
  return titles[status] || 'HTTP Error';
}

/**
 * Problem Details error handling middleware
 */
export function problemDetailsHandler() {
  return (error: Error, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      return next(error);
    }

    try {
      const problem = errorToProblemDetail(error, req, 500);
      
      logger.error('Request failed with error', {
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack
        },
        problem,
        correlationId: req.correlationId,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      res
        .status(problem.status)
        .type('application/problem+json')
        .json(problem);
    } catch (handlerError) {
      logger.error('Problem details handler failed', {
        originalError: error.message,
        handlerError: handlerError instanceof Error ? handlerError.message : 'Unknown error',
        correlationId: req.correlationId
      });

      // Fallback to basic error response
      res.status(500).json({
        type: ProblemTypes.INTERNAL_SERVER_ERROR,
        title: 'Internal Server Error',
        status: 500,
        detail: 'An error occurred while processing the request'
      });
    }
  };
}

/**
 * Create a Problem Details response helper
 */
export function sendProblemDetail(res: Response, options: {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  tenantId?: string;
  extensions?: Record<string, any>;
}): void {
  const problem = createProblemDetail(options);
  
  res
    .status(problem.status)
    .type('application/problem+json')
    .json(problem);
}

/**
 * Express response extension for Problem Details
 */
declare global {
  namespace Express {
    interface Response {
      problemDetail(options: {
        type?: string;
        title: string;
        status: number;
        detail?: string;
        instance?: string;
        extensions?: Record<string, any>;
      }): void;
    }
  }
}

/**
 * Add problem detail method to response
 */
export function addProblemDetailMethod() {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.problemDetail = (options) => {
      sendProblemDetail(res, {
        ...options,
        instance: options.instance || req.originalUrl,
        correlationId: req.correlationId,
        tenantId: req.user?.tenantId
      });
    };
    
    next();
  };
}