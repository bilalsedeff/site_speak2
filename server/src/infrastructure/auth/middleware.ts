import { Request, Response, NextFunction } from 'express';

import { jwtService } from './jwt';
import { createLogger } from '../../shared/utils.js';
import type { UserRole } from '../../../../shared/types';

const logger = createLogger({ service: 'auth-middleware' });

// Extend Express Request to include user context
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: UserRole;
  email: string;
  permissions: string[];
  sessionId?: string;
}

/**
 * Authentication error types
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string = 'UNAUTHORIZED',
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string = 'FORBIDDEN',
    public statusCode: number = 403
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Extract and validate JWT token from request
 */
export function authenticate() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const token = jwtService.extractTokenFromHeader(authHeader);

      if (!token) {
        logger.warn('Missing authorization token', {
          correlationId: req.correlationId,
          path: req.path,
          method: req.method,
        });
        
        return res.status(401).json({
          error: 'Authentication required',
          code: 'MISSING_TOKEN',
          correlationId: req.correlationId,
        });
      }

      // Verify and decode token
      const payload = jwtService.verifyAccessToken(token);

      // Set user context on request
      req.user = {
        id: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
        email: payload.email,
        permissions: payload.permissions || [],
        ...(payload.sessionId && { sessionId: payload.sessionId }),
      };

      logger.debug('User authenticated successfully', {
        userId: req.user?.id || 'unknown',
        tenantId: req.user?.tenantId || 'unknown',
        role: req.user?.role || 'unknown',
        correlationId: req.correlationId,
      });

      next();
    } catch (error) {
      logger.warn('Authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
        path: req.path,
      });

      // Determine response based on error type
      let statusCode = 401;
      let code = 'INVALID_TOKEN';
      let message = 'Invalid authentication token';

      if (error instanceof Error) {
        if (error.message === 'Token expired') {
          code = 'TOKEN_EXPIRED';
          message = 'Authentication token has expired';
        } else if (error.message === 'Invalid token') {
          code = 'INVALID_TOKEN';
          message = 'Invalid authentication token';
        }
      }

      return res.status(statusCode).json({
        error: message,
        code,
        correlationId: req.correlationId,
      });
    }
  };
}

/**
 * Optional authentication - sets user if valid token provided
 */
export function optionalAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const token = jwtService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = jwtService.verifyAccessToken(token);
          req.user = {
            id: payload.userId,
            tenantId: payload.tenantId,
            role: payload.role,
            email: payload.email,
            permissions: payload.permissions || [],
            ...(payload.sessionId && { sessionId: payload.sessionId }),
          };
        } catch (error) {
          // Ignore token errors for optional auth
          logger.debug('Optional auth token validation failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            correlationId: req.correlationId,
          });
        }
      }

      next();
    } catch (error) {
      // Should not fail for optional auth
      next();
    }
  };
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn('Authorization check failed - no authenticated user', {
        correlationId: req.correlationId,
        path: req.path,
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        correlationId: req.correlationId,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Authorization failed - insufficient role', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        correlationId: req.correlationId,
        path: req.path,
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.user.role,
        correlationId: req.correlationId,
      });
    }

    logger.debug('Role authorization successful', {
      userId: req.user.id,
      userRole: req.user.role,
      correlationId: req.correlationId,
    });

    next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        correlationId: req.correlationId,
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission) || 
      userPermissions.includes('*') // Wildcard permission
    );

    if (!hasPermission) {
      logger.warn('Authorization failed - missing permissions', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions,
        correlationId: req.correlationId,
        path: req.path,
      });
      
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'MISSING_PERMISSIONS',
        required: requiredPermissions,
        correlationId: req.correlationId,
      });
    }

    next();
  };
}

/**
 * Tenant isolation middleware - ensures users can only access their tenant's data
 */
export function requireTenantAccess() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
        correlationId: req.correlationId,
      });
    }

    // Extract tenant ID from request (path param, query, or body)
    const pathTenantId = req.params['tenantId'];
    const queryTenantId = req.query['tenantId'] as string;
    const bodyTenantId = req.body?.tenantId;
    
    const requestTenantId = pathTenantId || queryTenantId || bodyTenantId;

    if (requestTenantId && requestTenantId !== req.user.tenantId) {
      logger.warn('Tenant access violation', {
        userId: req.user.id,
        userTenantId: req.user.tenantId,
        requestedTenantId: requestTenantId,
        correlationId: req.correlationId,
        path: req.path,
      });
      
      return res.status(403).json({
        error: 'Access denied to tenant resource',
        code: 'TENANT_ACCESS_DENIED',
        correlationId: req.correlationId,
      });
    }

    next();
  };
}

/**
 * Combine authentication and role check
 */
export function authenticateAndAuthorize(...roles: UserRole[]) {
  return [authenticate(), requireRole(...roles)];
}

/**
 * Rate limiting by user
 */
export function userRateLimit() {
  // This would integrate with Redis-based rate limiting
  return (req: Request, res: Response, next: NextFunction) => {
    // TODO: Implement user-specific rate limiting
    // For now, rely on IP-based rate limiting from server setup
    next();
  };
}

/**
 * Error handling middleware for authentication errors
 */
export function authErrorHandler() {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof AuthenticationError) {
      logger.warn('Authentication error', {
        error: error.message,
        code: error.code,
        correlationId: req.correlationId,
      });
      
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        correlationId: req.correlationId,
      });
    }

    if (error instanceof AuthorizationError) {
      logger.warn('Authorization error', {
        error: error.message,
        code: error.code,
        correlationId: req.correlationId,
      });
      
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        correlationId: req.correlationId,
      });
    }

    next(error);
  };
}

// Export aliases for backward compatibility
export const authenticateRequest = authenticate;
export const requireAdminAccess = () => requireRole('admin');