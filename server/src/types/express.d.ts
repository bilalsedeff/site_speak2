/**
 * Express Request Type Extensions
 * 
 * Centralized type declarations for custom properties added to Express Request objects.
 * This file consolidates all Request interface extensions to avoid conflicts.
 */

import { AuthenticatedUser } from '../infrastructure/auth/middleware';
import { TenantContext } from '../services/_shared/security/tenancy'; // Import the real TenantContext

declare global {
  namespace Express {
    interface Request {
      // Correlation tracking for distributed tracing
      correlationId: string;
      
      // Authenticated user information (added by auth middleware)
      user?: AuthenticatedUser;
      
      // Raw request body for signature verification
      rawBody?: Buffer;
      
      // Locale detection (added by locale detection middleware)
      locale?: string;
      
      // Additional tenant and security context (added by tenancy middleware)
      tenantId?: string;
      siteId?: string;
      tenant?: TenantContext; // Now uses the real TenantContext interface
    }
  }
}

// Re-export types for convenience
export { AuthenticatedUser } from '../infrastructure/auth/middleware';
export { TenantContext } from '../services/_shared/security/tenancy';