/**
 * Rate Limiting - Token bucket and sliding window implementations
 * 
 * Provides rate limiting middleware with Redis backend, supporting
 * per-IP, per-tenant, and per-user rate limits with different strategies.
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  max: number;           // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean;         // Skip counting successful requests
  skipFailedRequests?: boolean;            // Skip counting failed requests
  strategy?: 'sliding_window' | 'token_bucket'; // Rate limiting strategy
  burst?: number;        // For token bucket: burst capacity
  refillRate?: number;   // For token bucket: tokens per second
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
}

/**
 * Rate limit store interface
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number, max?: number): Promise<{ current: number; resetTime: number }>;
  decrement?(key: string): Promise<void>;
  reset?(key: string): Promise<void>;
  get?(key: string): Promise<{ current: number; resetTime: number } | null>;
}

/**
 * Redis-based rate limit store
 */
export class RedisRateLimitStore implements RateLimitStore {
  private redis: Redis;
  private scriptSha: string | null = null;

  constructor(redisUrl: string = cfg.REDIS_URL) {
    this.redis = new Redis(redisUrl, {
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    // Load Lua script for atomic operations
    this.loadScript();
  }

  private async loadScript(): Promise<void> {
    // Lua script for sliding window rate limiting
    const script = `
      local key = KEYS[1]
      local window = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local current_time = tonumber(ARGV[3])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, 0, current_time - window)
      
      -- Count current requests
      local current_requests = redis.call('ZCARD', key)
      
      if current_requests < limit then
        -- Add current request
        redis.call('ZADD', key, current_time, current_time .. ':' .. math.random())
        redis.call('EXPIRE', key, math.ceil(window / 1000))
        return {current_requests + 1, current_time + window}
      else
        -- Rate limit exceeded
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset_time = oldest[2] and (tonumber(oldest[2]) + window) or (current_time + window)
        return {current_requests, reset_time}
      end
    `;

    try {
      const sha = await this.redis.script('LOAD', script);
      // Type guard for Redis script loading result
      this.scriptSha = typeof sha === 'string' ? sha : null;
      logger.debug('Rate limit Lua script loaded', { sha: this.scriptSha });
    } catch (error) {
      logger.error('Failed to load rate limit script', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.scriptSha = null;
    }
  }

  async increment(key: string, windowMs: number, max: number = cfg.RATE_LIMIT_MAX): Promise<{ current: number; resetTime: number }> {
    const currentTime = Date.now();

    try {
      let result: any;
      
      if (this.scriptSha) {
        // Use Lua script for atomic operation
        result = await this.redis.evalsha(
          this.scriptSha,
          1,
          key,
          windowMs.toString(),
          max.toString(),
          currentTime.toString()
        );
      } else {
        // Fallback to individual operations
        const multi = this.redis.multi();
        multi.zremrangebyscore(key, 0, currentTime - windowMs);
        multi.zcard(key);
        
        const results = await multi.exec();
        const currentCount = (results?.[1]?.[1] as number) || 0;
        
        if (currentCount < max) {
          await this.redis.zadd(key, currentTime, `${currentTime}:${Math.random()}`);
          await this.redis.expire(key, Math.ceil(windowMs / 1000));
          result = [currentCount + 1, currentTime + windowMs];
        } else {
          const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
          const resetTime = oldest.length > 1 && oldest[1] ? 
            (parseInt(oldest[1]) + windowMs) : 
            (currentTime + windowMs);
          result = [currentCount, resetTime];
        }
      }

      return {
        current: result[0],
        resetTime: result[1],
      };
    } catch (error) {
      logger.error('Rate limit increment failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // On Redis error, allow the request (fail open)
      return {
        current: 1,
        resetTime: currentTime + windowMs,
      };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      // Remove one entry from the sorted set
      await this.redis.zpopmin(key, 1);
    } catch (error) {
      logger.error('Rate limit decrement failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error('Rate limit reset failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async get(key: string): Promise<{ current: number; resetTime: number } | null> {
    try {
      const count = await this.redis.zcard(key);
      const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      
      if (oldest.length > 1 && oldest[1]) {
        const resetTime = parseInt(oldest[1]) + cfg.RATE_LIMIT_WINDOW_MS;
        return { current: count, resetTime };
      }
      
      return { current: count, resetTime: Date.now() + cfg.RATE_LIMIT_WINDOW_MS };
    } catch (error) {
      logger.error('Rate limit get failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}

/**
 * In-memory rate limit store (for development)
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, Array<{ timestamp: number; id: string }>>();

  async increment(key: string, windowMs: number, max: number = cfg.RATE_LIMIT_MAX): Promise<{ current: number; resetTime: number }> {
    const now = Date.now();
    const requests = this.store.get(key) || [];
    
    // Remove expired requests
    const validRequests = requests.filter(req => now - req.timestamp < windowMs);
    
    if (validRequests.length < max) {
      validRequests.push({ timestamp: now, id: Math.random().toString() });
      this.store.set(key, validRequests);
      
      return {
        current: validRequests.length,
        resetTime: now + windowMs,
      };
    } else {
      // Find reset time based on oldest request
      const oldestTimestamp = Math.min(...validRequests.map(r => r.timestamp));
      
      return {
        current: validRequests.length,
        resetTime: oldestTimestamp + windowMs,
      };
    }
  }

  async decrement(key: string): Promise<void> {
    const requests = this.store.get(key) || [];
    if (requests.length > 0) {
      requests.pop();
      this.store.set(key, requests);
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async get(key: string): Promise<{ current: number; resetTime: number } | null> {
    const requests = this.store.get(key) || [];
    const now = Date.now();
    
    if (requests.length === 0) {
      return { current: 0, resetTime: now + cfg.RATE_LIMIT_WINDOW_MS };
    }
    
    const oldestTimestamp = Math.min(...requests.map(r => r.timestamp));
    return {
      current: requests.length,
      resetTime: oldestTimestamp + cfg.RATE_LIMIT_WINDOW_MS,
    };
  }
}

/**
 * Rate limit service
 */
export class RateLimitService {
  private store: RateLimitStore;
  
  constructor(store?: RateLimitStore) {
    if (store) {
      this.store = store;
    } else if (cfg.NODE_ENV === 'production') {
      this.store = new RedisRateLimitStore();
    } else {
      this.store = new MemoryRateLimitStore();
      logger.debug('Using in-memory rate limit store for development');
    }
  }

  /**
   * Check rate limit for a key
   */
  async checkLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    if (!cfg.RATE_LIMITING_ENABLED) {
      return {
        allowed: true,
        remaining: config.max,
        resetTime: Date.now() + config.windowMs,
        totalRequests: 0,
      };
    }

    try {
      const result = await this.store.increment(key, config.windowMs, config.max);
      const allowed = result.current <= config.max;
      
      logger.debug('Rate limit check', {
        key,
        current: result.current,
        max: config.max,
        allowed,
        resetTime: new Date(result.resetTime).toISOString(),
      });

      return {
        allowed,
        remaining: Math.max(0, config.max - result.current),
        resetTime: result.resetTime,
        totalRequests: result.current,
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // On error, allow the request (fail open)
      return {
        allowed: true,
        remaining: config.max,
        resetTime: Date.now() + config.windowMs,
        totalRequests: 0,
      };
    }
  }

  /**
   * Decrement rate limit counter (for successful requests when skipSuccessfulRequests is true)
   */
  async decrementLimit(key: string): Promise<void> {
    if (this.store.decrement) {
      await this.store.decrement(key);
    }
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    if (this.store.reset) {
      await this.store.reset(key);
    }
  }
}

/**
 * Global rate limit service instance
 */
export const rateLimitService = new RateLimitService();

/**
 * Default key generators
 */
export const keyGenerators = {
  byIP: (req: Request) => `ip:${req.ip}`,
  byTenant: (req: Request) => {
    const tenant = req.tenant;
    return `tenant:${tenant?.tenantId || 'anonymous'}`;
  },
  byUser: (req: Request) => {
    const user = req.user;
    return `user:${user?.id || req.ip}`;
  },
  byUserAndEndpoint: (req: Request) => {
    const user = req.user;
    const route = req.route;
    return `user:${user?.id || req.ip}:${route?.path || req.path}`;
  },
  byTenantAndEndpoint: (req: Request) => {
    const tenant = req.tenant;
    const route = req.route;
    return `tenant:${tenant?.tenantId || 'anonymous'}:${route?.path || req.path}`;
  },
};

/**
 * Express middleware factory for rate limiting
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    max = cfg.RATE_LIMIT_MAX,
    keyGenerator = keyGenerators.byIP,
    skipSuccessfulRequests = cfg.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS,
    skipFailedRequests = false,
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const result = await rateLimitService.checkLimit(key, config);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      if (!result.allowed) {
        logger.warn('Rate limit exceeded', {
          key,
          current: result.totalRequests,
          max,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
        });

        res.status(429).json({
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again after ${new Date(result.resetTime).toISOString()}`,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
        });
        return;
      }

      // Handle response to potentially decrement counter
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalEnd = res.end.bind(res);
        res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void) {
          const shouldDecrement = 
            (skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) ||
            (skipFailedRequests && res.statusCode >= 400);

          if (shouldDecrement) {
            rateLimitService.decrementLimit(key).catch(error => {
              logger.error('Failed to decrement rate limit', { key, error });
            });
          }

          return originalEnd(chunk, encoding as BufferEncoding, cb);
        };
      }

      next();
    } catch (error) {
      logger.error('Rate limiting middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
        method: req.method,
      });

      // On error, allow the request
      next();
    }
  };
}

/**
 * Preset rate limiters for common use cases
 */
export const rateLimiters = {
  // General API rate limit
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    keyGenerator: keyGenerators.byIP,
  }),

  // Strict rate limit for authentication endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    keyGenerator: keyGenerators.byIP,
    skipSuccessfulRequests: true,
  }),

  // Per-user rate limit for AI queries
  aiQuery: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 queries per minute
    keyGenerator: keyGenerators.byUser,
  }),

  // Per-tenant rate limit
  tenant: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute per tenant
    keyGenerator: keyGenerators.byTenant,
  }),

  // Voice synthesis rate limit
  voice: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 voice requests per minute
    keyGenerator: keyGenerators.byUser,
  }),
};

// Types already exported as interfaces above
export { rateLimitService as rateLimit };

// Export aliases for backward compatibility
export const rateLimitMiddleware = createRateLimiter;