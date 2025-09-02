/**
 * Multi-tier Retrieval Cache with SWR Semantics
 * 
 * Implements L1 (in-process) + L2 (Redis) caching with stale-while-revalidate
 * for fast, low-latency retrieval results with tenant isolation
 */

import { createLogger } from '../../../../shared/utils.js';
import { createClient, RedisClientType } from 'redis';
import { config } from '../../../../infrastructure/config';
import { createHash } from 'crypto';

const logger = createLogger({ service: 'retrieval-cache' });

export interface CacheKey {
  tenantId: string;
  locale: string;
  model: string;
  k: number;
  filter?: Record<string, unknown>;
  hybridAlpha?: number;
  queryHash: string; // Rounded embedding hash for better hit rates
}

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number; // max-age in milliseconds
  staleWhileRevalidate: number; // SWR window in milliseconds
  hits: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxAge?: number; // Default TTL in milliseconds (5 minutes)
  staleWhileRevalidate?: number; // SWR window in milliseconds (2 minutes)
  l1Size?: number; // L1 cache size per tenant (2000 entries)
  keyPrefix?: string; // Redis key prefix
}

export interface CacheStats {
  l1: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  l2: {
    hits: number;
    misses: number;
    hitRate: number;
    connected: boolean;
  };
  overall: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

/**
 * LRU Cache implementation for L1 (in-process) cache
 */
class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize: number = 2000) {
    this.maxSize = maxSize;
  }

  get(key: string): CacheEntry<T> | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, { ...entry, hits: entry.hits + 1, lastAccessed: Date.now() });
      return entry;
    }
    return undefined;
  }

  set(key: string, entry: CacheEntry<T>): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, { ...entry, lastAccessed: Date.now() });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  // Clean expired entries
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of Array.from(this.cache.entries())) {
      const age = now - entry.timestamp;
      const maxStaleAge = entry.ttl + entry.staleWhileRevalidate;
      
      if (age > maxStaleAge) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }
}

/**
 * Multi-tier Retrieval Cache with SWR semantics
 * 
 * Features:
 * - L1 in-process LRU cache per tenant/locale
 * - L2 Redis cache with SWR semantics
 * - Tenant isolation with automatic key prefixing
 * - Background revalidation during SWR window
 * - Automatic invalidation on KB delta events
 * - Performance metrics and monitoring
 */
export class RetrievalCache {
  private l1Caches = new Map<string, LRUCache<unknown>>(); // Per tenant cache
  private l2Client: RedisClientType | null = null;
  private readonly options: Required<CacheOptions>;
  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
  };
  private cleanupInterval: NodeJS.Timeout;
  
  constructor(options: CacheOptions = {}) {
    this.options = {
      maxAge: options.maxAge || 5 * 60 * 1000, // 5 minutes
      staleWhileRevalidate: options.staleWhileRevalidate || 2 * 60 * 1000, // 2 minutes
      l1Size: options.l1Size || 2000,
      keyPrefix: options.keyPrefix || 'retrieval:',
    };

    // Initialize Redis connection
    this.initializeRedis();
    
    // Start cleanup interval (every 2 minutes)
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 2 * 60 * 1000);

    logger.info('Retrieval Cache initialized', {
      maxAge: this.options.maxAge,
      staleWhileRevalidate: this.options.staleWhileRevalidate,
      l1Size: this.options.l1Size,
      keyPrefix: this.options.keyPrefix,
    });
  }

  /**
   * Initialize Redis client for L2 cache
   */
  private async initializeRedis(): Promise<void> {
    try {
      if (!config.REDIS_URL) {
        logger.warn('Redis URL not configured, L2 cache disabled');
        return;
      }

      this.l2Client = createClient({
        url: config.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 1000),
        },
      });

      this.l2Client.on('error', (error) => {
        logger.error('Redis error in retrieval cache', { error });
      });

      this.l2Client.on('connect', () => {
        logger.info('Redis connected for retrieval cache');
      });

      this.l2Client.on('disconnect', () => {
        logger.warn('Redis disconnected for retrieval cache');
      });

      await this.l2Client.connect();
      
    } catch (error) {
      logger.error('Failed to initialize Redis for retrieval cache', { error });
      this.l2Client = null;
    }
  }

  /**
   * Get cached result with SWR semantics
   */
  async get<T>(cacheKey: CacheKey): Promise<{
    data?: T;
    isStale?: boolean;
    shouldRevalidate?: boolean;
  }> {
    const key = this.generateCacheKey(cacheKey);
    const now = Date.now();

    // Try L1 cache first
    const l1Cache = this.getL1Cache(cacheKey.tenantId);
    const l1Entry = l1Cache.get(key) as CacheEntry<T> | undefined;

    if (l1Entry) {
      const age = now - l1Entry.timestamp;
      const isExpired = age > l1Entry.ttl;
      const isInSWRWindow = age > l1Entry.ttl && age <= (l1Entry.ttl + l1Entry.staleWhileRevalidate);

      if (!isExpired) {
        // Fresh data
        this.stats.l1Hits++;
        logger.debug('L1 cache hit (fresh)', { key, age });
        return { data: l1Entry.data };
      }

      if (isInSWRWindow) {
        // Stale but within SWR window - return stale data and trigger revalidation
        this.stats.l1Hits++;
        logger.debug('L1 cache hit (stale, SWR)', { key, age });
        return { 
          data: l1Entry.data, 
          isStale: true, 
          shouldRevalidate: true 
        };
      }

      // Too old, remove from L1
      l1Cache.delete(key);
    }

    this.stats.l1Misses++;

    // Try L2 cache (Redis)
    if (this.l2Client) {
      try {
        const l2Data = await this.l2Client.get(key);
        if (l2Data && typeof l2Data === 'string') {
          const l2Entry: CacheEntry<T> = JSON.parse(l2Data);
          const age = now - l2Entry.timestamp;
          const isExpired = age > l2Entry.ttl;
          const isInSWRWindow = age > l2Entry.ttl && age <= (l2Entry.ttl + l2Entry.staleWhileRevalidate);

          // Store in L1 for faster future access
          l1Cache.set(key, l2Entry);

          if (!isExpired) {
            // Fresh data
            this.stats.l2Hits++;
            logger.debug('L2 cache hit (fresh)', { key, age });
            return { data: l2Entry.data };
          }

          if (isInSWRWindow) {
            // Stale but within SWR window
            this.stats.l2Hits++;
            logger.debug('L2 cache hit (stale, SWR)', { key, age });
            return { 
              data: l2Entry.data, 
              isStale: true, 
              shouldRevalidate: true 
            };
          }

          // Too old, remove from L2
          await this.l2Client.del(key);
        }
      } catch (error) {
        logger.error('L2 cache read error', { error, key });
      }
    }

    this.stats.l2Misses++;
    logger.debug('Cache miss', { key });
    return {};
  }

  /**
   * Set cached result in both L1 and L2
   */
  async set<T>(cacheKey: CacheKey, data: T, options?: { ttl?: number; swr?: number }): Promise<void> {
    const key = this.generateCacheKey(cacheKey);
    const now = Date.now();
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: options?.ttl || this.options.maxAge,
      staleWhileRevalidate: options?.swr || this.options.staleWhileRevalidate,
      hits: 0,
      lastAccessed: now,
    };

    // Store in L1
    const l1Cache = this.getL1Cache(cacheKey.tenantId);
    l1Cache.set(key, entry);

    // Store in L2 (Redis)
    if (this.l2Client) {
      try {
        const expireSeconds = Math.ceil((entry.ttl + entry.staleWhileRevalidate) / 1000);
        await this.l2Client.setEx(key, expireSeconds, JSON.stringify(entry));
        
        logger.debug('Cache entry stored', { 
          key, 
          ttl: entry.ttl, 
          swr: entry.staleWhileRevalidate,
          expireSeconds 
        });
      } catch (error) {
        logger.error('L2 cache write error', { error, key });
      }
    }
  }

  /**
   * Delete cached entry from both L1 and L2
   */
  async delete(cacheKey: CacheKey): Promise<void> {
    const key = this.generateCacheKey(cacheKey);
    
    // Delete from L1
    const l1Cache = this.getL1Cache(cacheKey.tenantId);
    l1Cache.delete(key);

    // Delete from L2
    if (this.l2Client) {
      try {
        await this.l2Client.del(key);
        logger.debug('Cache entry deleted', { key });
      } catch (error) {
        logger.error('L2 cache delete error', { error, key });
      }
    }
  }

  /**
   * Invalidate all cache entries for a tenant/site
   */
  async invalidateTenant(tenantId: string, siteId?: string): Promise<number> {
    let deletedCount = 0;

    // Clear L1 cache for tenant
    const l1Cache = this.getL1Cache(tenantId);
    const l1Keys = Array.from(l1Cache.keys());
    
    for (const key of l1Keys) {
      if (!siteId || key.includes(`site:${siteId}`)) {
        l1Cache.delete(key);
        deletedCount++;
      }
    }

    // Clear L2 cache entries
    if (this.l2Client) {
      try {
        const pattern = siteId 
          ? `${this.options.keyPrefix}tenant:${tenantId}:site:${siteId}:*`
          : `${this.options.keyPrefix}tenant:${tenantId}:*`;
          
        const keys = await this.l2Client.keys(pattern);
        if (keys.length > 0) {
          await this.l2Client.del(keys);
          deletedCount += keys.length;
        }
        
        logger.info('Cache invalidated', { tenantId, siteId, deletedCount });
      } catch (error) {
        logger.error('L2 cache invalidation error', { error, tenantId, siteId });
      }
    }

    return deletedCount;
  }

  /**
   * Get or create L1 cache for tenant
   */
  private getL1Cache(tenantId: string): LRUCache<unknown> {
    let cache = this.l1Caches.get(tenantId);
    if (!cache) {
      cache = new LRUCache(this.options.l1Size);
      this.l1Caches.set(tenantId, cache);
    }
    return cache;
  }

  /**
   * Generate cache key from cache key object
   */
  private generateCacheKey(cacheKey: CacheKey): string {
    const parts = [
      this.options.keyPrefix,
      `tenant:${cacheKey.tenantId}`,
      `locale:${cacheKey.locale}`,
      `model:${cacheKey.model}`,
      `k:${cacheKey.k}`,
      `query:${cacheKey.queryHash}`,
    ];

    if (cacheKey.filter) {
      parts.push(`filter:${this.hashObject(cacheKey.filter)}`);
    }

    if (cacheKey.hybridAlpha !== undefined) {
      parts.push(`alpha:${cacheKey.hybridAlpha.toFixed(2)}`);
    }

    return parts.join(':');
  }

  /**
   * Hash embedding with rounding for better cache hit rates
   */
  hashEmbedding(embedding: number[], decimals: number = 3): string {
    const rounded = embedding.map(n => Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals));
    return createHash('md5').update(JSON.stringify(rounded)).digest('hex').substring(0, 16);
  }

  /**
   * Hash object for consistent key generation
   */
  private hashObject(obj: Record<string, unknown>): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(str).digest('hex').substring(0, 8);
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup(): void {
    let totalCleaned = 0;
    
    for (const [tenantId, cache] of Array.from(this.l1Caches.entries())) {
      const cleaned = cache.cleanup();
      totalCleaned += cleaned;
      
      // Remove empty tenant caches
      if (cache.size() === 0) {
        this.l1Caches.delete(tenantId);
      }
    }

    if (totalCleaned > 0) {
      logger.debug('Cache cleanup completed', { totalCleaned });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const l1TotalSize = Array.from(this.l1Caches.values()).reduce((sum, cache) => sum + cache.size(), 0);
    const l1MaxSize = this.l1Caches.size * this.options.l1Size;
    
    const l1TotalRequests = this.stats.l1Hits + this.stats.l1Misses;
    const l2TotalRequests = this.stats.l2Hits + this.stats.l2Misses;
    const overallTotalRequests = l1TotalRequests + l2TotalRequests;
    
    return {
      l1: {
        size: l1TotalSize,
        maxSize: l1MaxSize,
        hits: this.stats.l1Hits,
        misses: this.stats.l1Misses,
        hitRate: l1TotalRequests > 0 ? this.stats.l1Hits / l1TotalRequests : 0,
      },
      l2: {
        hits: this.stats.l2Hits,
        misses: this.stats.l2Misses,
        hitRate: l2TotalRequests > 0 ? this.stats.l2Hits / l2TotalRequests : 0,
        connected: this.l2Client?.isReady || false,
      },
      overall: {
        hits: this.stats.l1Hits + this.stats.l2Hits,
        misses: this.stats.l1Misses + this.stats.l2Misses,
        hitRate: overallTotalRequests > 0 ? (this.stats.l1Hits + this.stats.l2Hits) / overallTotalRequests : 0,
      },
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
    };
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    // Clear L1 caches
    for (const cache of Array.from(this.l1Caches.values())) {
      cache.clear();
    }
    this.l1Caches.clear();

    // Clear L2 cache
    if (this.l2Client) {
      try {
        const pattern = `${this.options.keyPrefix}*`;
        const keys = await this.l2Client.keys(pattern);
        if (keys.length > 0) {
          await this.l2Client.del(keys);
        }
        logger.info('All caches cleared', { deletedKeys: keys.length });
      } catch (error) {
        logger.error('Error clearing L2 cache', { error });
      }
    }

    this.resetStats();
  }

  /**
   * Close cache and cleanup resources
   */
  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    if (this.l2Client) {
      await this.l2Client.quit();
    }
    
    logger.info('Retrieval cache closed');
  }
}

// Export singleton instance
export const retrievalCache = new RetrievalCache();