/**
 * HTTP Headers Utilities
 * 
 * Implements RFC-compliant HTTP headers for SiteSpeak APIs:
 * - ETag/If-Match for optimistic concurrency control (RFC 9110)
 * - Link header for pagination (RFC 8288)
 * - Cache-Control directives (RFC 9111)
 * - Conditional request handling (RFC 9110)
 */

import { Request, Response } from 'express';
import { createHash } from 'crypto';

export interface ETagOptions {
  weak?: boolean;
  algorithm?: 'md5' | 'sha256';
}

export interface LinkHeaderOptions {
  rel: 'next' | 'prev' | 'first' | 'last' | 'self';
  url: string;
  title?: string;
  type?: string;
}

export interface PaginationLinks {
  self: string;
  first: string;
  last: string;
  next?: string;
  prev?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CacheControlOptions {
  maxAge?: number;
  sMaxAge?: number;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  public?: boolean;
  private?: boolean;
  immutable?: boolean;
  staleWhileRevalidate?: number;
}

export class HttpHeaders {
  /**
   * Generate strong ETag from data
   */
  static generateETag(data: unknown, options: ETagOptions = {}): string {
    const algorithm = options.algorithm || 'md5';
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    
    const hash = createHash(algorithm)
      .update(serialized, 'utf8')
      .digest('hex');
    
    return options.weak ? `W/"${hash}"` : `"${hash}"`;
  }

  /**
   * Generate ETag from entity version/timestamp
   */
  static generateEntityETag(version: string | number | Date, weak = false): string {
    let versionStr: string;
    
    if (version instanceof Date) {
      versionStr = version.getTime().toString();
    } else {
      versionStr = version.toString();
    }
    
    const hash = createHash('md5')
      .update(versionStr, 'utf8')
      .digest('hex');
    
    return weak ? `W/"${hash}"` : `"${hash}"`;
  }

  /**
   * Set ETag header on response
   */
  static setETag(res: Response, data: unknown, options: ETagOptions = {}): void {
    const etag = this.generateETag(data, options);
    res.header('ETag', etag);
  }

  /**
   * Set entity ETag header
   */
  static setEntityETag(res: Response, version: string | number | Date, weak = false): void {
    const etag = this.generateEntityETag(version, weak);
    res.header('ETag', etag);
  }

  /**
   * Check If-Match header for optimistic concurrency control
   */
  static checkIfMatch(req: Request, currentETag: string): boolean {
    const ifMatch = req.header('If-Match');
    
    if (!ifMatch) {
      return false; // No If-Match header means no concurrency control
    }
    
    if (ifMatch === '*') {
      return true; // Matches any existing resource
    }
    
    // Parse comma-separated ETags
    const etags = ifMatch.split(',').map(tag => tag.trim());
    return etags.includes(currentETag);
  }

  /**
   * Check If-None-Match header for cache validation
   */
  static checkIfNoneMatch(req: Request, currentETag: string): boolean {
    const ifNoneMatch = req.header('If-None-Match');
    
    if (!ifNoneMatch) {
      return false;
    }
    
    if (ifNoneMatch === '*') {
      return true; // Matches any resource
    }
    
    // Parse comma-separated ETags
    const etags = ifNoneMatch.split(',').map(tag => tag.trim());
    return etags.includes(currentETag);
  }

  /**
   * Handle conditional GET requests
   */
  static handleConditionalGet(req: Request, res: Response, currentETag: string): boolean {
    this.setEntityETag(res, currentETag);
    
    if (this.checkIfNoneMatch(req, currentETag)) {
      res.status(304).end(); // Not Modified
      return true;
    }
    
    return false;
  }

  /**
   * Enforce If-Match for updates
   */
  static enforceIfMatch(req: Request, currentETag: string): void {
    if (!req.header('If-Match')) {
      throw new Error('If-Match header is required for updates');
    }
    
    if (!this.checkIfMatch(req, currentETag)) {
      throw new Error('ETag mismatch - resource has been modified');
    }
  }

  /**
   * Build Link header value
   */
  static buildLinkHeader(links: LinkHeaderOptions[]): string {
    return links
      .map(link => {
        let value = `<${link.url}>; rel="${link.rel}"`;
        
        if (link.title) {
          value += `; title="${link.title}"`;
        }
        
        if (link.type) {
          value += `; type="${link.type}"`;
        }
        
        return value;
      })
      .join(', ');
  }

  /**
   * Set pagination Link headers
   */
  static setPaginationLinks(
    res: Response,
    baseUrl: string,
    pagination: PaginationMeta,
    queryParams: Record<string, string> = {}
  ): void {
    const links: PaginationLinks = {
      self: this.buildPaginationUrl(baseUrl, pagination.page, pagination.limit, queryParams),
      first: this.buildPaginationUrl(baseUrl, 1, pagination.limit, queryParams),
      last: this.buildPaginationUrl(baseUrl, pagination.totalPages, pagination.limit, queryParams),
    };

    // Add next/prev links if applicable
    if (pagination.page < pagination.totalPages) {
      links.next = this.buildPaginationUrl(baseUrl, pagination.page + 1, pagination.limit, queryParams);
    }

    if (pagination.page > 1) {
      links.prev = this.buildPaginationUrl(baseUrl, pagination.page - 1, pagination.limit, queryParams);
    }

    // Convert to Link header format
    const linkHeaders: LinkHeaderOptions[] = [
      { rel: 'self', url: links.self },
      { rel: 'first', url: links.first },
      { rel: 'last', url: links.last },
    ];

    if (links.next) {
      linkHeaders.push({ rel: 'next', url: links.next });
    }

    if (links.prev) {
      linkHeaders.push({ rel: 'prev', url: links.prev });
    }

    res.header('Link', this.buildLinkHeader(linkHeaders));
  }

  /**
   * Build pagination URL
   */
  private static buildPaginationUrl(
    baseUrl: string,
    page: number,
    limit: number,
    queryParams: Record<string, string> = {}
  ): string {
    const url = new URL(baseUrl);
    
    // Add pagination params
    url.searchParams.set('page', page.toString());
    url.searchParams.set('limit', limit.toString());
    
    // Add other query params
    Object.entries(queryParams).forEach(([key, value]) => {
      if (key !== 'page' && key !== 'limit') {
        url.searchParams.set(key, value);
      }
    });
    
    return url.toString();
  }

  /**
   * Set Cache-Control header
   */
  static setCacheControl(res: Response, options: CacheControlOptions): void {
    const directives: string[] = [];

    if (options.public) {
      directives.push('public');
    } else if (options.private) {
      directives.push('private');
    }

    if (options.noCache) {
      directives.push('no-cache');
    }

    if (options.noStore) {
      directives.push('no-store');
    }

    if (options.mustRevalidate) {
      directives.push('must-revalidate');
    }

    if (options.immutable) {
      directives.push('immutable');
    }

    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }

    if (options.sMaxAge !== undefined) {
      directives.push(`s-maxage=${options.sMaxAge}`);
    }

    if (options.staleWhileRevalidate !== undefined) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }

    if (directives.length > 0) {
      res.header('Cache-Control', directives.join(', '));
    }
  }

  /**
   * Set headers for public resources
   */
  static setPublicCache(res: Response, maxAge: number = 3600): void {
    this.setCacheControl(res, {
      public: true,
      maxAge,
    });
  }

  /**
   * Set headers for private resources
   */
  static setPrivateCache(res: Response, maxAge: number = 300): void {
    this.setCacheControl(res, {
      private: true,
      maxAge,
    });
  }

  /**
   * Set headers for no caching
   */
  static setNoCache(res: Response): void {
    this.setCacheControl(res, {
      noStore: true,
    });
  }

  /**
   * Set headers for immutable resources
   */
  static setImmutableCache(res: Response, maxAge: number = 31536000): void {
    this.setCacheControl(res, {
      public: true,
      maxAge,
      immutable: true,
    });
  }

  /**
   * Parse ETag from header value
   */
  static parseETag(etagValue: string): { value: string; weak: boolean } {
    if (!etagValue) {
      throw new Error('ETag value is required');
    }

    const weak = etagValue.startsWith('W/');
    const value = weak ? etagValue.slice(3, -1) : etagValue.slice(1, -1);

    return { value, weak };
  }

  /**
   * Middleware for adding security headers
   */
  static securityHeaders(req: Request, res: Response, next: Function): void {
    // Add security headers
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Add HSTS for HTTPS
    if (req.secure) {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  }

  /**
   * Middleware for CORS headers
   */
  static corsHeaders(req: Request, res: Response, next: Function): void {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, If-Match, If-None-Match');
    res.header('Access-Control-Expose-Headers', 'ETag, Link, Location, X-RateLimit-Limit, X-RateLimit-Remaining');
    res.header('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  }

  /**
   * Get request correlation ID
   */
  static getCorrelationId(req: Request): string {
    return req.headers['x-correlation-id'] as string || 
           req.headers['x-request-id'] as string ||
           crypto.randomUUID();
  }

  /**
   * Set correlation ID header
   */
  static setCorrelationId(res: Response, correlationId: string): void {
    res.header('X-Correlation-ID', correlationId);
  }
}