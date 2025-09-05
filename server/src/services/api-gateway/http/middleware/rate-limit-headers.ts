/**
 * RateLimit Headers Middleware
 * 
 * Implements draft IETF RateLimit headers specification
 * https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers
 * 
 * Adds headers:
 * - RateLimit-Limit: quota units per time window
 * - RateLimit-Remaining: remaining quota units
 * - RateLimit-Reset: seconds until quota resets
 * - RateLimit-Policy: describes the policy
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../_shared/telemetry/logger';

const logger = createLogger({ service: 'rate-limit-headers' });

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  resetTime?: Date;
  policy?: string;
  windowMs?: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  store?: RateLimitStore;
}

export interface RateLimitStore {
  get(key: string): Promise<{ totalHits: number; resetTime: Date } | undefined>;
  increment(key: string, windowMs: number): Promise<{ totalHits: number; resetTime: Date }>;
  decrement?(key: string): Promise<void>;
  resetKey?(key: string): Promise<void>;
}

/**
 * Memory-based rate limit store
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: Date }>();
  
  async get(key: string): Promise<{ totalHits: number; resetTime: Date } | undefined> {
    const entry = this.hits.get(key);
    if (!entry) {return undefined;}
    
    // Clean expired entries
    if (entry.resetTime <= new Date()) {
      this.hits.delete(key);
      return undefined;
    }
    
    return { totalHits: entry.count, resetTime: entry.resetTime };
  }
  
  async increment(key: string, windowMs: number): Promise<{ totalHits: number; resetTime: Date }> {
    const now = new Date();
    const resetTime = new Date(now.getTime() + windowMs);
    
    const existing = this.hits.get(key);
    if (existing && existing.resetTime > now) {
      existing.count += 1;
      return { totalHits: existing.count, resetTime: existing.resetTime };
    }
    
    // Create new entry
    this.hits.set(key, { count: 1, resetTime });
    return { totalHits: 1, resetTime };
  }
  
  async decrement(key: string): Promise<void> {
    const existing = this.hits.get(key);
    if (existing && existing.count > 0) {
      existing.count -= 1;
    }
  }
  
  async resetKey(key: string): Promise<void> {
    this.hits.delete(key);
  }
  
  // Cleanup expired entries periodically
  cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.hits.entries()) {
      if (entry.resetTime <= now) {
        this.hits.delete(key);
      }
    }
  }
}

/**
 * Redis-based rate limit store
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: any) {} // Redis client
  
  async get(key: string): Promise<{ totalHits: number; resetTime: Date } | undefined> {
    const multi = this.redis.multi();
    multi.get(`ratelimit:${key}:count`);
    multi.ttl(`ratelimit:${key}:count`);
    
    const [count, ttl] = await multi.exec();
    
    if (!count[1] || ttl[1] <= 0) {return undefined;}
    
    const resetTime = new Date(Date.now() + (ttl[1] * 1000));
    return { totalHits: parseInt(count[1]), resetTime };
  }
  
  async increment(key: string, windowMs: number): Promise<{ totalHits: number; resetTime: Date }> {
    const windowSeconds = Math.ceil(windowMs / 1000);
    const redisKey = `ratelimit:${key}:count`;
    
    const multi = this.redis.multi();
    multi.incr(redisKey);
    multi.expire(redisKey, windowSeconds);
    multi.ttl(redisKey);
    
    const [count, , ttl] = await multi.exec();
    
    const resetTime = new Date(Date.now() + (ttl[1] * 1000));
    return { totalHits: count[1], resetTime };
  }
  
  async decrement(key: string): Promise<void> {
    const redisKey = `ratelimit:${key}:count`;
    await this.redis.decr(redisKey);
  }
  
  async resetKey(key: string): Promise<void> {
    const redisKey = `ratelimit:${key}:count`;
    await this.redis.del(redisKey);
  }
}

/**
 * Default key generators
 */
export const keyGenerators = {
  ip: (req: Request) => `ip:${req.ip}`,
  user: (req: Request) => req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`,
  tenant: (req: Request) => req.user?.tenantId ? `tenant:${req.user.tenantId}` : `ip:${req.ip}`,
  combined: (req: Request) => {
    const parts = [req.ip];
    if (req.user?.tenantId) {parts.push(`tenant:${req.user.tenantId}`);}
    if (req.user?.id) {parts.push(`user:${req.user.id}`);}
    return parts.join('|');
  }
};

/**
 * Format rate limit policy string
 */
function formatPolicy(limit: number, windowMs: number): string {
  const windowSeconds = Math.floor(windowMs / 1000);
  if (windowSeconds < 60) {
    return `${limit};w=${windowSeconds}`;
  } else if (windowSeconds < 3600) {
    const minutes = Math.floor(windowSeconds / 60);
    return `${limit};w=${minutes}m`;
  } else {
    const hours = Math.floor(windowSeconds / 3600);
    return `${limit};w=${hours}h`;
  }
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(res: Response, info: RateLimitInfo): void {
  const { limit, remaining, reset, policy, resetTime } = info;
  
  // Standard RateLimit headers (draft spec)
  res.setHeader('RateLimit-Limit', limit.toString());
  res.setHeader('RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('RateLimit-Reset', reset.toString());
  
  if (policy) {
    res.setHeader('RateLimit-Policy', policy);
  }
  
  // Legacy X-RateLimit headers for compatibility
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', reset.toString());
  
  if (resetTime) {
    res.setHeader('X-RateLimit-Reset-Date', resetTime.toISOString());
  }
}

/**
 * Rate limiting middleware with headers
 */
export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyGenerator = keyGenerators.ip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    store = new MemoryRateLimitStore()
  } = config;

  const policy = formatPolicy(max, windowMs);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      
      // Get current rate limit status
      let current = await store.get(key);
      
      // Increment counter
      const result = await store.increment(key, windowMs);
      
      const resetSeconds = Math.ceil((result.resetTime.getTime() - Date.now()) / 1000);
      const remaining = Math.max(0, max - result.totalHits);
      
      const rateLimitInfo: RateLimitInfo = {
        limit: max,
        remaining,
        reset: resetSeconds,
        resetTime: result.resetTime,
        policy,
        windowMs
      };

      // Add headers to all responses
      addRateLimitHeaders(res, rateLimitInfo);
      
      // Check if rate limit exceeded
      if (result.totalHits > max) {
        logger.warn('Rate limit exceeded', {
          key,
          hits: result.totalHits,
          limit: max,
          resetTime: result.resetTime,
          correlationId: req.correlationId,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        // Add Retry-After header
        res.setHeader('Retry-After', resetSeconds.toString());

        return res.status(429).type('application/problem+json').json({
          type: 'https://sitespeak.ai/problems/rate-limited',
          title: 'Too Many Requests',
          status: 429,
          detail: `Rate limit exceeded. Try again in ${resetSeconds} seconds.`,
          instance: req.originalUrl,
          extensions: {
            correlationId: req.correlationId,
            limit: max,
            remaining: 0,
            reset: resetSeconds,
            policy
          }
        });
      }

      // Handle response to potentially decrement counter on certain conditions
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(body) {
          const shouldDecrement = 
            (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) ||
            (skipFailedRequests && res.statusCode >= 400);
          
          if (shouldDecrement && store.decrement) {
            store.decrement(key).catch(err => 
              logger.error('Failed to decrement rate limit counter', { error: err })
            );
          }
          
          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      logger.error('Rate limiting failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId
      });
      
      // Continue without rate limiting on error
      next();
    }
  };
}

/**
 * Pre-configured rate limiters
 */
export const rateLimiters = {
  // Global API rate limiting
  api: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    keyGenerator: keyGenerators.ip
  }),
  
  // Authenticated user rate limiting
  user: createRateLimit({
    windowMs: 60 * 1000, // 1 minute  
    max: 200, // 200 requests per minute per user
    keyGenerator: keyGenerators.user
  }),
  
  // Tenant-based rate limiting
  tenant: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 500 requests per minute per tenant
    keyGenerator: keyGenerators.tenant
  }),
  
  // Strict rate limiting for sensitive endpoints
  strict: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per minute
    keyGenerator: keyGenerators.combined
  }),
  
  // WebSocket connection limiting
  websocket: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 connections per minute per IP
    keyGenerator: keyGenerators.ip
  })
};

/**
 * Create custom rate limiter with specific config
 */
export function createCustomRateLimit(name: string, options: Partial<RateLimitConfig> = {}) {
  return createRateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: keyGenerators.ip,
    ...options
  });
}

// Cleanup expired entries periodically for memory store
const memoryStore = rateLimiters.api as any;
if (memoryStore._store && typeof memoryStore._store.cleanup === 'function') {
  setInterval(() => {
    memoryStore._store.cleanup();
  }, 5 * 60 * 1000); // Cleanup every 5 minutes
}