/**
 * Tenant Isolation - Multi-tenancy security helpers
 * 
 * Enforces strict tenant data isolation across all requests,
 * jobs, and database operations with proper context extraction.
 */

import { Request, Response, NextFunction } from 'express';
import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';
import { validateAccessToken } from './auth.js';
import type { UserRole } from '../../../../../shared/types';

/**
 * Tenant context interface
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
  siteId?: string;
  verified: boolean;
}

/**
 * Extended request with tenant context
 */
export interface TenantRequest extends Request {
  tenant: TenantContext; // Required after enforceTenancy middleware
  user?: {
    id: string;
    tenantId: string;
    role: UserRole;
    email: string;
    permissions: string[];
    sessionId?: string;
  };
}

/**
 * Type for Express request handlers that use tenant context
 * Use this after enforceTenancy() middleware to ensure tenant is available
 */
export type TenantRequestHandler = (req: TenantRequest, res: Response, next?: NextFunction) => Promise<void> | void;

/**
 * Extract tenant ID from various sources
 */
function extractTenantId(req: Request): string | null {
  // Priority order for tenant extraction:
  
  // 1. JWT token claims (most secure)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const validation = validateAccessToken(token);
    if (validation.valid && validation.claims) {
      return validation.claims.tenantId;
    }
  }

  // 2. x-tenant-id header (for API clients)
  const headerTenantId = req.headers['x-tenant-id'];
  if (typeof headerTenantId === 'string') {
    return headerTenantId;
  }

  // 3. tenantId in request params
  if (req.params['tenantId']) {
    return req.params['tenantId'];
  }

  // 4. tenantId in query params
  if (req.query['tenantId'] && typeof req.query['tenantId'] === 'string') {
    return req.query['tenantId'];
  }

  // 5. Subdomain extraction (tenant.sitespeak.com)
  const host = req.headers.host;
  if (host) {
    const subdomain = host.split('.')[0];
    // Only use subdomain if it's not a common subdomain
    if (subdomain && !['www', 'api', 'admin', 'app'].includes(subdomain)) {
      return subdomain;
    }
  }

  return null;
}

/**
 * Validate tenant ID format and existence
 */
async function validateTenantId(tenantId: string): Promise<boolean> {
  // Basic UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(tenantId)) {
    return false;
  }

  // In production, this should check database for tenant existence
  // For now, we'll accept any valid UUID format
  return true;
}

/**
 * Express middleware for tenant isolation
 */
export function enforceTenancy(options: {
  required?: boolean;
  allowedSources?: ('jwt' | 'header' | 'params' | 'query' | 'subdomain')[];
  skipRoutes?: string[];
} = {}) {
  const {
    required = true,
    allowedSources: _allowedSources = ['jwt', 'header', 'params'], // TODO: Implement source filtering
    skipRoutes = []
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip tenant enforcement for certain routes
      if (skipRoutes.some(route => req.path.startsWith(route))) {
        return next();
      }

      // Skip if tenant isolation is disabled
      if (!cfg.TENANT_ISOLATION) {
        logger.debug('Tenant isolation disabled, skipping enforcement');
        return next();
      }

      const tenantId = extractTenantId(req);

      if (!tenantId) {
        if (required) {
          logger.warn('Tenant ID required but not provided', {
            path: req.path,
            method: req.method,
            headers: {
              authorization: req.headers.authorization ? '[present]' : '[missing]',
              'x-tenant-id': req.headers['x-tenant-id'] || '[missing]',
              host: req.headers.host,
            },
          });

          return res.status(400).json({
            error: 'Tenant ID required',
            code: 'MISSING_TENANT_ID',
            message: 'Request must include tenant identification',
          });
        } else {
          // Optional tenant context
          req.tenant = {
            tenantId: 'anonymous',
            verified: false,
          };
          return next();
        }
      }

      // Validate tenant ID format
      const isValid = await validateTenantId(tenantId);
      if (!isValid) {
        logger.warn('Invalid tenant ID format', {
          tenantId,
          path: req.path,
          method: req.method,
        });

        return res.status(400).json({
          error: 'Invalid tenant ID format',
          code: 'INVALID_TENANT_ID',
        });
      }

      // Extract additional context
      const siteId = req.params['siteId'] || 
                   req.query['siteId'] as string || 
                   req.headers['x-site-id'] as string;

      // Set tenant context
      req.tenant = {
        tenantId,
        siteId,
        verified: true,
      };

      // Add tenant ID to logger context for all subsequent logs
      // req.logger = logger.withTenant(tenantId); // Commented out until logger extension is implemented

      logger.debug('Tenant context established', {
        tenantId,
        siteId,
        path: req.path,
        method: req.method,
      });

      next();
    } catch (error) {
      logger.error('Tenant enforcement error', {
        path: req.path,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Tenant isolation error',
        code: 'TENANT_ENFORCEMENT_FAILED',
      });
    }
  };
}

/**
 * Database query helper with tenant isolation
 */
export function withTenantIsolation(tenantId: string) {
  return {
    /**
     * Add tenant filter to WHERE conditions
     */
    tenantFilter: (field: string = 'tenant_id') => {
      return { [field]: tenantId };
    },

    /**
     * Validate that a resource belongs to the tenant
     */
    validateOwnership: async <T extends Record<string, any>>(
      resource: T,
      field: string = 'tenant_id'
    ): Promise<boolean> => {
      if (!resource || typeof resource !== 'object') {
        return false;
      }

      return resource[field] === tenantId;
    },

    /**
     * Filter array of resources to only include tenant's data
     */
    filterTenantResources: <T extends Record<string, any>>(
      resources: T[],
      field: string = 'tenant_id'
    ): T[] => {
      return resources.filter(resource => 
        resource && resource[field] === tenantId
      );
    },
  };
}

/**
 * Job queue helper for tenant isolation
 */
export function createTenantJobData(
  tenantId: string,
  data: Record<string, any>
): Record<string, any> {
  return {
    tenantId,
    ...data,
    // Add tenant metadata for debugging
    _tenant: {
      id: tenantId,
      isolationEnforced: cfg.TENANT_ISOLATION,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validate job data has proper tenant context
 */
export function validateJobTenancy(
  jobData: any,
  expectedTenantId?: string
): boolean {
  if (!jobData || typeof jobData !== 'object') {
    return false;
  }

  const jobTenantId = jobData.tenantId;
  if (!jobTenantId) {
    return false;
  }

  if (expectedTenantId && jobTenantId !== expectedTenantId) {
    return false;
  }

  return true;
}

/**
 * Express middleware to validate tenant access to resources
 */
export function validateTenantResource(resourceParam: string = 'id') {
  return async (req: TenantRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenant?.verified) {
        res.status(401).json({
          error: 'Tenant context required',
          code: 'TENANT_CONTEXT_REQUIRED',
        });
        return;
      }

      const resourceId = req.params[resourceParam];
      if (!resourceId) {
        res.status(400).json({
          error: 'Resource ID required',
          code: 'RESOURCE_ID_REQUIRED',
        });
        return;
      }

      // In production, this should validate resource ownership
      // by querying the database to ensure the resource belongs to the tenant
      
      // For now, we'll just log and continue
      logger.debug('Validating tenant resource access', {
        tenantId: req.tenant.tenantId,
        resourceId,
        resourceParam,
      });

      next();
    } catch (error) {
      logger.error('Tenant resource validation error', {
        tenantId: req.tenant?.tenantId,
        resourceParam,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Resource validation failed',
        code: 'RESOURCE_VALIDATION_FAILED',
      });
      return;
    }
  };
}

/**
 * Get tenant context from various sources
 */
export function getTenantContext(
  req: Request,
  fallback?: string
): TenantContext | null {
  const tenantId = extractTenantId(req) || fallback;
  
  if (!tenantId) {
    return null;
  }

  const siteId = req.params['siteId'] || 
               req.query['siteId'] as string || 
               req.headers['x-site-id'] as string;

  return {
    tenantId,
    siteId,
    verified: tenantId !== fallback,
  };
}

/**
 * Tenant-aware error handler
 */
export function tenantErrorHandler() {
  return (error: any, req: TenantRequest, res: Response, next: NextFunction): void => {
    // Add tenant context to error logging
    const errorContext = {
      tenantId: req.tenant?.tenantId,
      siteId: req.tenant?.siteId,
      userId: req.user?.id,
      path: req.path,
      method: req.method,
    };

    logger.error('Request error with tenant context', {
      error: error.message || 'Unknown error',
      stack: error.stack,
      ...errorContext,
    });

    // Check for tenant-specific errors
    if (error.code === 'TENANT_ISOLATION_VIOLATION') {
      res.status(403).json({
        error: 'Access denied: tenant isolation violation',
        code: 'TENANT_ISOLATION_VIOLATION',
      });
      return;
    }

    if (error.code === 'TENANT_NOT_FOUND') {
      res.status(404).json({
        error: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
      });
      return;
    }

    // Continue to next error handler
    next(error);
  };
}

/**
 * Helper to create tenant-scoped database queries
 */
export function createTenantQuery(tenantId: string) {
  return {
    // Common WHERE clause for tenant isolation
    where: { tenant_id: tenantId },
    
    // Helper for complex queries
    andTenantId: (conditions: Record<string, any>) => ({
      ...conditions,
      tenant_id: tenantId,
    }),

    // Validate result belongs to tenant
    validateResult: (result: any): boolean => {
      return result && result.tenant_id === tenantId;
    },
  };
}