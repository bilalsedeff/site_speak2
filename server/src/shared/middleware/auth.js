/**
 * Authentication middleware - Bridge to existing auth infrastructure
 * Re-exports from the actual implementation in infrastructure/auth
 */

// Re-export existing auth middleware
export {
  authenticateRequest,
  requireTenantAccess,
  requireAdminAccess,
} from '../../infrastructure/auth/middleware';

// Re-export auth utilities
export {
  jwtService,
  sessionManager,
} from '../../infrastructure/auth';
