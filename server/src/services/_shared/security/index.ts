/**
 * Security Service - Main exports and middleware setup
 * 
 * Provides unified security infrastructure with authentication,
 * authorization, rate limiting, and tenant isolation.
 */

// Re-export authentication
export {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  validateAccessToken,
  refreshTokenPair,
  revokeRefreshToken,
  extractBearerToken,
  generateSecureToken,
  hashPassword,
  verifyPassword,
} from './auth.js';

export type { JWTClaims, TokenPair, TokenValidation } from './auth.js';

// Re-export RBAC
export {
  rbacService,
  requirePermission,
  RequirePermission,
  isRole,
  hasMinimumRole,
  Permission,
  Role,
} from './rbac.js';

export type { 
  UserContext, 
  PermissionResult,
  UserRole,
  UserPermission,
} from './rbac.js';

// Re-export tenancy
export {
  enforceTenancy,
  withTenantIsolation,
  createTenantJobData,
  validateJobTenancy,
  validateTenantResource,
  getTenantContext,
  tenantErrorHandler,
  createTenantQuery,
} from './tenancy.js';

export type { TenantContext, TenantRequest } from './tenancy.js';

// Re-export rate limiting
export {
  rateLimitService,
  createRateLimiter,
  rateLimiters,
  keyGenerators,
  RedisRateLimitStore,
  MemoryRateLimitStore,
  RateLimitService,
} from './ratelimit.js';

export type { 
  RateLimitConfig, 
  RateLimitResult, 
  RateLimitStore 
} from './ratelimit.js';

// Re-export security headers
export {
  securityHeaders,
  widgetSecurityHeaders,
  apiSecurityHeaders,
  createCORSConfig,
  validateCORSOrigins,
  securityMiddleware,
} from './headers.js';

export type { SecurityHeadersConfig } from './headers.js';

import { Request, Response, NextFunction } from 'express';
import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';
import { extractBearerToken, validateAccessToken } from './auth.js';
import { enforceTenancy } from './tenancy.js';
import { rbacService } from './rbac.js';

/**
 * Complete authentication middleware
 */
export function authenticate(options: {
  required?: boolean;
  skipRoutes?: string[];
} = {}) {
  const { required = true, skipRoutes = ['/health', '/ready', '/metrics'] } = options;

  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Skip authentication for certain routes
      if (skipRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      const authHeader = req.headers.authorization;
      const token = extractBearerToken(authHeader);

      if (!token) {
        if (required) {
          return res.status(401).json({
            error: 'Authentication required',
            code: 'MISSING_TOKEN',
            message: 'Authorization header with Bearer token required',
          });
        } else {
          return next();
        }
      }

      const validation = validateAccessToken(token);

      if (!validation.valid) {
        logger.warn('Invalid token provided', {
          error: validation.error,
          expired: validation.expired,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        const statusCode = validation.expired ? 401 : 403;
        const errorCode = validation.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';

        return res.status(statusCode).json({
          error: validation.error || 'Authentication failed',
          code: errorCode,
          expired: validation.expired,
        });
      }

      // Set user context
      req.user = {
        id: validation.claims!.sub,
        tenantId: validation.claims!.tenantId,
        role: validation.claims!.role,
        permissions: validation.claims!.permissions,
        jti: validation.claims!.jti,
      };

      logger.debug('User authenticated', {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        role: req.user.role,
      });

      next();
    } catch (error) {
      logger.error('Authentication middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
      });
    }
  };
}

/**
 * Combined security middleware stack
 */
export function createSecurityMiddleware(options: {
  auth?: boolean;
  tenancy?: boolean;
  rateLimit?: boolean;
  headers?: boolean;
  skipRoutes?: string[];
} = {}) {
  const {
    auth = true,
    tenancy = true,
    rateLimit = true,
    headers = true,
    skipRoutes = [],
  } = options;

  const middlewares: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

  // Security headers (should be first)
  if (headers) {
    middlewares.push(securityMiddleware.api());
  }

  // Rate limiting (should be early)
  if (rateLimit) {
    middlewares.push(rateLimiters.api);
  }

  // Authentication
  if (auth) {
    middlewares.push(authenticate({ required: true, skipRoutes }));
  }

  // Tenant isolation
  if (tenancy) {
    middlewares.push(enforceTenancy({ required: true, skipRoutes }));
  }

  return middlewares;
}

/**
 * Initialize security system
 */
export async function initializeSecurity(): Promise<void> {
  try {
    logger.info('Initializing security system...');

    // Validate security configuration
    if (!cfg.JWT_SECRET || cfg.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters');
    }

    if (!cfg.ENCRYPTION_KEY || cfg.ENCRYPTION_KEY.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters');
    }

    // Clear RBAC cache
    rbacService.clearCache();

    logger.info('Security system initialized', {
      rbacEnabled: cfg.RBAC_ENABLED,
      rateLimitingEnabled: cfg.RATE_LIMITING_ENABLED,
      tenantIsolationEnabled: cfg.TENANT_ISOLATION,
      jwtIssuer: cfg.JWT_ISSUER,
      jwtAudience: cfg.JWT_AUDIENCE,
    });
  } catch (error) {
    logger.error('Failed to initialize security system', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Health check for security system
 */
export function checkSecurityHealth(): {
  healthy: boolean;
  components: Record<string, boolean>;
  issues: string[];
} {
  const issues: string[] = [];
  
  const components = {
    jwt_secret: !!cfg.JWT_SECRET && cfg.JWT_SECRET.length >= 32,
    encryption_key: !!cfg.ENCRYPTION_KEY && cfg.ENCRYPTION_KEY.length === 32,
    rbac: cfg.RBAC_ENABLED,
    rate_limiting: cfg.RATE_LIMITING_ENABLED,
    tenant_isolation: cfg.TENANT_ISOLATION,
  };

  // Check for issues
  if (!components.jwt_secret) {
    issues.push('JWT_SECRET is missing or too short');
  }
  if (!components.encryption_key) {
    issues.push('ENCRYPTION_KEY is missing or wrong length');
  }

  const healthy = Object.values(components).every(Boolean) && issues.length === 0;

  return {
    healthy,
    components,
    issues,
  };
}

/**
 * Create security service for dependency injection
 */
export const createSecurityService = () => ({
  rbac: rbacService,
  rateLimit: rateLimitService,
  middleware: {
    auth: authenticate,
    tenancy: enforceTenancy,
    headers: securityHeaders,
    rateLimit: createRateLimiter,
    security: createSecurityMiddleware,
  },
  initialize: initializeSecurity,
  health: checkSecurityHealth,
});

export type SecurityService = ReturnType<typeof createSecurityService>;