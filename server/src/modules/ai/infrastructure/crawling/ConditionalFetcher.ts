import fetch, { Response } from 'node-fetch';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'conditional-fetcher' });

/**
 * Conditional Fetcher
 * 
 * Implements HTTP conditional requests using ETag and Last-Modified headers
 * to minimize bandwidth and avoid re-processing unchanged content.
 */
export class ConditionalFetcher {
  private readonly userAgent = 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)';

  /**
   * Fetch URL with conditional headers
   */
  async fetchConditionally(
    url: string,
    storedInfo?: StoredPageInfo,
    options: FetchOptions = {}
  ): Promise<ConditionalFetchResult> {
    try {
      logger.debug('Fetching URL conditionally', {
        url,
        hasStoredEtag: !!storedInfo?.etag,
        hasStoredLastModified: !!storedInfo?.lastModified
      });

      const headers: Record<string, string> = {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        ...options.headers
      };

      // Add conditional headers if we have stored info
      if (storedInfo?.etag) {
        headers['If-None-Match'] = storedInfo.etag;
      }

      if (storedInfo?.lastModified) {
        headers['If-Modified-Since'] = storedInfo.lastModified.toUTCString();
      }

      // Setup timeout using AbortController
      const abortController = new AbortController();
      const timeoutMs = options.timeout || 30000;
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: abortController.signal,
          follow: options.followRedirects !== false ? 10 : 0,
          compress: true
        });

        clearTimeout(timeoutId);
        return await this.processResponse(url, response, storedInfo);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      logger.error('Conditional fetch failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        url,
        status: 'error',
        statusCode: 0,
        content: null,
        contentChanged: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        fetchedAt: new Date()
      };
    }
  }

  /**
   * Batch fetch multiple URLs conditionally
   */
  async batchFetchConditionally(
    requests: ConditionalFetchRequest[],
    options: BatchFetchOptions = {}
  ): Promise<ConditionalFetchResult[]> {
    const results: ConditionalFetchResult[] = [];
    const { concurrency = 5, delayMs = 1000 } = options;

    // Process in batches to avoid overwhelming servers
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (request) => {
        if (i > 0) {
          // Add delay between batches
          await this.delay(delayMs);
        }
        return this.fetchConditionally(request.url, request.storedInfo, request.options);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result && result.status === 'fulfilled') {
          results.push(result.value);
        } else if (result && result.status === 'rejected') {
          const request = batch[j];
          if (request) {
            results.push({
              url: request.url,
              status: 'error',
              statusCode: 0,
              content: null,
              contentChanged: false,
              error: result.reason?.message || 'Batch fetch failed',
              fetchedAt: new Date()
            });
          }
        }
      }
    }

    logger.info('Batch conditional fetch completed', {
      totalRequests: requests.length,
      successfulFetches: results.filter(r => r.status === 'success').length,
      notModified: results.filter(r => r.status === 'not-modified').length,
      errors: results.filter(r => r.status === 'error').length
    });

    return results;
  }

  /**
   * Head request to check if content has changed
   */
  async checkIfModified(
    url: string,
    storedInfo?: StoredPageInfo
  ): Promise<ModificationCheckResult> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': this.userAgent
      };

      // Add conditional headers
      if (storedInfo?.etag) {
        headers['If-None-Match'] = storedInfo.etag;
      }

      if (storedInfo?.lastModified) {
        headers['If-Modified-Since'] = storedInfo.lastModified.toUTCString();
      }

      // Setup timeout using AbortController
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers,
          signal: abortController.signal
        });

        clearTimeout(timeoutId);

        const currentEtag = response.headers.get('etag');
        const currentLastModified = response.headers.get('last-modified');

        if (response.status === 304) {
          return {
            url,
            modified: false,
            reason: 'not-modified-header',
            statusCode: 304
          };
        }

        // Check if ETags differ
        if (storedInfo?.etag && currentEtag && storedInfo.etag !== currentEtag) {
          const result: ModificationCheckResult = {
            url,
            modified: true,
            reason: 'etag-changed',
            statusCode: response.status
          };
          if (currentEtag) { result.newEtag = currentEtag; }
          if (currentLastModified) { result.newLastModified = new Date(currentLastModified); }
          return result;
        }

        // Check if Last-Modified differs
        if (storedInfo?.lastModified && currentLastModified) {
          const newLastModified = new Date(currentLastModified);
          if (newLastModified > storedInfo.lastModified) {
            const result: ModificationCheckResult = {
              url,
              modified: true,
              reason: 'last-modified-changed',
              statusCode: response.status,
              newLastModified
            };
            if (currentEtag) { result.newEtag = currentEtag; }
            return result;
          }
        }

        // If we get here and response is successful, assume modified if no stored info
        const result: ModificationCheckResult = {
          url,
          modified: !storedInfo,
          reason: storedInfo ? 'headers-unchanged' : 'no-stored-info',
          statusCode: response.status
        };
        if (currentEtag) { result.newEtag = currentEtag; }
        if (currentLastModified) { result.newLastModified = new Date(currentLastModified); }
        return result;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }

    } catch (error) {
      return {
        url,
        modified: true, // Assume modified on error
        reason: 'check-failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract caching headers from response
   */
  extractCachingInfo(response: Response): CachingInfo {
    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');
    const cacheControl = response.headers.get('cache-control');
    const expires = response.headers.get('expires');

    const result: CachingInfo = {
      extractedAt: new Date()
    };

    if (etag) { result.etag = etag; }
    if (lastModified) { result.lastModified = new Date(lastModified); }
    if (cacheControl) { result.cacheControl = cacheControl; }
    if (expires) { result.expires = new Date(expires); }
    
    const maxAge = this.parseCacheControlMaxAge(cacheControl || undefined);
    if (maxAge !== undefined) { result.maxAge = maxAge; }

    return result;
  }

  /**
   * Process HTTP response
   */
  private async processResponse(
    url: string,
    response: Response,
    storedInfo?: StoredPageInfo
  ): Promise<ConditionalFetchResult> {
    const cachingInfo = this.extractCachingInfo(response);
    
    // Handle 304 Not Modified
    if (response.status === 304) {
      logger.debug('Resource not modified', { url, statusCode: 304 });
      
      return {
        url,
        status: 'not-modified',
        statusCode: 304,
        content: null,
        contentChanged: false,
        cachingInfo,
        fetchedAt: new Date()
      };
    }

    // Handle successful responses
    if (response.ok) {
      const content = await response.text();
      const contentLength = content.length;
      
      // Determine if content actually changed
      let contentChanged = true;
      if (storedInfo) {
        // Compare with stored content hash if available
        if (storedInfo.contentHash) {
          const currentHash = this.computeContentHash(content);
          contentChanged = currentHash !== storedInfo.contentHash;
        }
        // Also check if ETags are the same
        else if (cachingInfo.etag && storedInfo.etag) {
          contentChanged = cachingInfo.etag !== storedInfo.etag;
        }
      }

      logger.debug('Resource fetched successfully', {
        url,
        statusCode: response.status,
        contentLength,
        contentChanged
      });

      return {
        url,
        status: 'success',
        statusCode: response.status,
        content,
        contentChanged,
        cachingInfo,
        contentLength,
        fetchedAt: new Date()
      };
    }

    // Handle error responses
    logger.warn('HTTP error response', {
      url,
      statusCode: response.status,
      statusText: response.statusText
    });

    return {
      url,
      status: 'error',
      statusCode: response.status,
      content: null,
      contentChanged: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
      fetchedAt: new Date()
    };
  }

  /**
   * Parse Cache-Control max-age directive
   */
  private parseCacheControlMaxAge(cacheControl?: string): number | undefined {
    if (!cacheControl) { return undefined; }
    
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    return maxAgeMatch && maxAgeMatch[1] ? parseInt(maxAgeMatch[1], 10) : undefined;
  }

  /**
   * Compute simple content hash
   */
  private computeContentHash(content: string): string {
    // Simple hash function for comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Stored page information for conditional requests
 */
export interface StoredPageInfo {
  url: string;
  etag?: string;
  lastModified?: Date;
  contentHash?: string;
  lastFetchedAt: Date;
}

/**
 * Fetch options
 */
export interface FetchOptions {
  timeout?: number;
  headers?: Record<string, string>;
  followRedirects?: boolean;
}

/**
 * Conditional fetch request
 */
export interface ConditionalFetchRequest {
  url: string;
  storedInfo?: StoredPageInfo;
  options?: FetchOptions;
}

/**
 * Batch fetch options
 */
export interface BatchFetchOptions {
  concurrency?: number;
  delayMs?: number;
}

/**
 * Conditional fetch result
 */
export interface ConditionalFetchResult {
  url: string;
  status: 'success' | 'not-modified' | 'error';
  statusCode: number;
  content: string | null;
  contentChanged: boolean;
  cachingInfo?: CachingInfo;
  contentLength?: number;
  error?: string;
  fetchedAt: Date;
}

/**
 * Caching information extracted from response
 */
export interface CachingInfo {
  etag?: string;
  lastModified?: Date;
  cacheControl?: string;
  expires?: Date;
  maxAge?: number;
  extractedAt: Date;
}

/**
 * Modification check result
 */
export interface ModificationCheckResult {
  url: string;
  modified: boolean;
  reason: ModificationReason;
  statusCode?: number;
  newEtag?: string;
  newLastModified?: Date;
  error?: string;
}

/**
 * Modification check reasons
 */
export type ModificationReason =
  | 'not-modified-header'
  | 'etag-changed'
  | 'last-modified-changed'
  | 'headers-unchanged'
  | 'no-stored-info'
  | 'check-failed';

/**
 * Factory function
 */
export function createConditionalFetcher(): ConditionalFetcher {
  return new ConditionalFetcher();
}