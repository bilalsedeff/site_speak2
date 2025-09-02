/**
 * Rate limiting middleware - Bridge to existing security infrastructure
 * Re-exports from the actual implementation in services/_shared/security
 */

// Re-export existing rate limit middleware
export {
  rateLimitMiddleware,
  createRateLimiter,
  rateLimiters,
} from '../../services/_shared/security/ratelimit';
