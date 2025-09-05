import { URL } from 'url';

/**
 * Canonical URL Domain Service
 * 
 * Handles URL canonicalization and deduplication according to web standards.
 * Implements RFC 3986 (URI Generic Syntax) and follows Google's canonicalization guidelines.
 */
export class CanonicalUrlService {
  
  /**
   * Resolve canonical URL from various sources
   */
  resolveCanonicalUrl(
    currentUrl: string,
    canonicalSources: CanonicalSources
  ): CanonicalUrlResult {
    const result: CanonicalUrlResult = {
      originalUrl: currentUrl,
      canonicalUrl: currentUrl,
      source: 'original',
      confidence: 1.0,
      reasons: []
    };

    try {
      // 1. Check rel="canonical" link (highest priority)
      if (canonicalSources.relCanonical) {
        const canonical = this.normalizeUrl(canonicalSources.relCanonical);
        if (this.isValidCanonical(canonical, currentUrl)) {
          result.canonicalUrl = canonical;
          result.source = 'rel-canonical';
          result.confidence = 0.95;
          result.reasons.push('Found rel="canonical" link in HTML');
        }
      }

      // 2. Check HTTP Link header
      if (canonicalSources.httpLinkHeader && !this.hasHigherPrioritySource(result.source)) {
        const canonical = this.normalizeUrl(canonicalSources.httpLinkHeader);
        if (this.isValidCanonical(canonical, currentUrl)) {
          result.canonicalUrl = canonical;
          result.source = 'http-link-header';
          result.confidence = 0.9;
          result.reasons.push('Found canonical URL in HTTP Link header');
        }
      }

      // 3. Check sitemap entry
      if (canonicalSources.sitemapCanonical && !this.hasHigherPrioritySource(result.source)) {
        const canonical = this.normalizeUrl(canonicalSources.sitemapCanonical);
        if (this.isValidCanonical(canonical, currentUrl)) {
          result.canonicalUrl = canonical;
          result.source = 'sitemap';
          result.confidence = 0.8;
          result.reasons.push('Found canonical URL in sitemap');
        }
      }

      // 4. Apply URL normalization if no explicit canonical found
      if (result.source === 'original') {
        const normalized = this.normalizeUrl(currentUrl);
        if (normalized !== currentUrl) {
          result.canonicalUrl = normalized;
          result.source = 'normalized';
          result.confidence = 0.7;
          result.reasons.push('Applied URL normalization rules');
        }
      }

      // 5. Validate final canonical URL
      this.validateCanonicalUrl(result);

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.canonicalUrl = this.normalizeUrl(currentUrl); // Fallback to normalized original
    }

    return result;
  }

  /**
   * Normalize URL according to RFC 3986
   */
  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // 1. Convert scheme and host to lowercase
      urlObj.protocol = urlObj.protocol.toLowerCase();
      urlObj.hostname = urlObj.hostname.toLowerCase();
      
      // 2. Remove default ports
      if (
        (urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')
      ) {
        urlObj.port = '';
      }
      
      // 3. Normalize path
      urlObj.pathname = this.normalizePath(urlObj.pathname);
      
      // 4. Sort query parameters for consistency
      if (urlObj.search) {
        const params = new URLSearchParams(urlObj.search);
        const sortedParams = new URLSearchParams();
        
        // Sort parameters by key
        const keys = Array.from(params.keys()).sort();
        for (const key of keys) {
          const values = params.getAll(key);
          for (const value of values) {
            sortedParams.append(key, value);
          }
        }
        
        urlObj.search = sortedParams.toString();
      }
      
      // 5. Remove fragment (never part of canonical)
      urlObj.hash = '';
      
      // 6. Remove trailing slash from non-root paths
      if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      
      return urlObj.toString();
      
    } catch (error) {
      return url; // Return original if normalization fails
    }
  }

  /**
   * Create canonical URL map for deduplication
   */
  createCanonicalMap(urls: UrlWithCanonical[]): Map<string, string> {
    const canonicalMap = new Map<string, string>();
    
    for (const urlInfo of urls) {
      const canonical = this.resolveCanonicalUrl(urlInfo.url, {
        ...(urlInfo.relCanonical && { relCanonical: urlInfo.relCanonical }),
        ...(urlInfo.httpLinkHeader && { httpLinkHeader: urlInfo.httpLinkHeader }),
        ...(urlInfo.sitemapCanonical && { sitemapCanonical: urlInfo.sitemapCanonical })
      });
      
      canonicalMap.set(urlInfo.url, canonical.canonicalUrl);
    }
    
    return canonicalMap;
  }

  /**
   * Group URLs by their canonical URL
   */
  groupByCanonical(urls: UrlWithCanonical[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    
    for (const urlInfo of urls) {
      const canonical = this.resolveCanonicalUrl(urlInfo.url, {
        ...(urlInfo.relCanonical && { relCanonical: urlInfo.relCanonical }),
        ...(urlInfo.httpLinkHeader && { httpLinkHeader: urlInfo.httpLinkHeader }),
        ...(urlInfo.sitemapCanonical && { sitemapCanonical: urlInfo.sitemapCanonical })
      });
      
      if (!groups.has(canonical.canonicalUrl)) {
        groups.set(canonical.canonicalUrl, []);
      }
      groups.get(canonical.canonicalUrl)!.push(urlInfo.url);
    }
    
    return groups;
  }

  /**
   * Check if two URLs are canonically equivalent
   */
  areCanonicallyEquivalent(url1: string, url2: string): boolean {
    const normalized1 = this.normalizeUrl(url1);
    const normalized2 = this.normalizeUrl(url2);
    return normalized1 === normalized2;
  }

  /**
   * Get canonical URL statistics
   */
  getCanonicalStatistics(results: CanonicalUrlResult[]): CanonicalStatistics {
    const stats: CanonicalStatistics = {
      totalUrls: results.length,
      canonicalSources: {
        'rel-canonical': 0,
        'http-link-header': 0,
        'sitemap': 0,
        'normalized': 0,
        'original': 0
      },
      duplicatesFound: 0,
      averageConfidence: 0,
      errors: 0
    };

    const canonicalUrls = new Set<string>();
    let totalConfidence = 0;

    for (const result of results) {
      // Count sources
      stats.canonicalSources[result.source]++;
      
      // Track duplicates
      if (canonicalUrls.has(result.canonicalUrl)) {
        stats.duplicatesFound++;
      } else {
        canonicalUrls.add(result.canonicalUrl);
      }
      
      // Sum confidence
      totalConfidence += result.confidence;
      
      // Count errors
      if (result.error) {
        stats.errors++;
      }
    }

    stats.averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;
    
    return stats;
  }

  /**
   * Validate that a canonical URL is valid
   */
  private isValidCanonical(canonicalUrl: string, originalUrl: string): boolean {
    try {
      const canonical = new URL(canonicalUrl);
      const original = new URL(originalUrl);
      
      // Must be same protocol (http/https)
      if (canonical.protocol !== original.protocol) {
        return false;
      }
      
      // Must be a valid URL
      if (!canonical.hostname) {
        return false;
      }
      
      // Should not be a fragment-only URL
      if (canonicalUrl.startsWith('#')) {
        return false;
      }
      
      return true;
      
    } catch {
      return false;
    }
  }

  /**
   * Check if current source has higher priority than others
   */
  private hasHigherPrioritySource(currentSource: CanonicalSource): boolean {
    const priorities: Record<CanonicalSource, number> = {
      'rel-canonical': 4,
      'http-link-header': 3,
      'sitemap': 2,
      'normalized': 1,
      'original': 0
    };
    
    const currentPriority = priorities[currentSource] || 0;
    return currentPriority > 2; // Higher than sitemap
  }

  /**
   * Normalize URL path
   */
  private normalizePath(path: string): string {
    // Remove double slashes
    path = path.replace(/\/+/g, '/');
    
    // Decode percent-encoded characters that don't need encoding
    try {
      path = decodeURI(path);
    } catch {
      // Keep original if decoding fails
    }
    
    // Remove . and .. segments
    const segments = path.split('/');
    const normalized: string[] = [];
    
    for (const segment of segments) {
      if (segment === '' || segment === '.') {
        continue; // Skip empty and current directory
      } else if (segment === '..') {
        if (normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
          normalized.pop(); // Go up one directory
        }
      } else {
        normalized.push(segment);
      }
    }
    
    return '/' + normalized.join('/');
  }

  /**
   * Validate the final canonical URL result
   */
  private validateCanonicalUrl(result: CanonicalUrlResult): void {
    try {
      new URL(result.canonicalUrl);
      
      // Additional validation checks
      if (result.canonicalUrl.includes('#')) {
        result.reasons.push('Warning: Canonical URL contains fragment');
        result.confidence *= 0.9;
      }
      
      if (result.canonicalUrl !== result.originalUrl && result.source === 'original') {
        result.reasons.push('Warning: No canonical specified but URLs differ');
      }
      
    } catch (error) {
      result.error = `Invalid canonical URL: ${error}`;
      result.canonicalUrl = result.originalUrl; // Fallback
      result.confidence = 0.1;
    }
  }
}

/**
 * Canonical sources input
 */
export interface CanonicalSources {
  relCanonical?: string;     // From <link rel="canonical">
  httpLinkHeader?: string;   // From HTTP Link: header
  sitemapCanonical?: string; // From sitemap.xml
}

/**
 * URL with canonical information
 */
export interface UrlWithCanonical {
  url: string;
  relCanonical?: string;
  httpLinkHeader?: string;
  sitemapCanonical?: string;
}

/**
 * Canonical URL resolution result
 */
export interface CanonicalUrlResult {
  originalUrl: string;
  canonicalUrl: string;
  source: CanonicalSource;
  confidence: number;
  reasons: string[];
  error?: string;
}

/**
 * Canonical URL source types
 */
export type CanonicalSource = 
  | 'rel-canonical'     // <link rel="canonical">
  | 'http-link-header'  // HTTP Link: header  
  | 'sitemap'           // sitemap.xml
  | 'normalized'        // URL normalization applied
  | 'original';         // No changes made

/**
 * Canonical URL statistics
 */
export interface CanonicalStatistics {
  totalUrls: number;
  canonicalSources: Record<CanonicalSource, number>;
  duplicatesFound: number;
  averageConfidence: number;
  errors: number;
}

/**
 * Factory function
 */
export function createCanonicalUrlService(): CanonicalUrlService {
  return new CanonicalUrlService();
}