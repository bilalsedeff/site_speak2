import { createHash } from 'crypto';

/**
 * Delta Detection Domain Service
 * 
 * Implements content change detection using multiple strategies:
 * - Content hashing for exact change detection
 * - HTTP conditional requests (ETag/Last-Modified)
 * - Sitemap lastmod timestamps
 * - Canonical URL resolution
 */
export class DeltaDetectionService {
  
  /**
   * Detect content changes using multiple strategies
   */
  async detectChanges(
    urls: UrlToCheck[],
    lastCrawlInfo: LastCrawlInfo
  ): Promise<ChangeDetectionResult[]> {
    const results: ChangeDetectionResult[] = [];
    
    for (const url of urls) {
      const result = await this.checkUrlForChanges(url, lastCrawlInfo);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Filter URLs to only those that have actually changed
   */
  async filterChangedUrls(
    urls: UrlToCheck[],
    lastCrawlInfo: LastCrawlInfo
  ): Promise<UrlToCheck[]> {
    const changeResults = await this.detectChanges(urls, lastCrawlInfo);
    
    return changeResults
      .filter(result => result.hasChanged)
      .map(result => result.url);
  }

  /**
   * Check individual URL for changes
   */
  private async checkUrlForChanges(
    url: UrlToCheck,
    lastCrawlInfo: LastCrawlInfo
  ): Promise<ChangeDetectionResult> {
    const result: ChangeDetectionResult = {
      url,
      hasChanged: false,
      changeReasons: [],
      confidence: 0,
      lastChecked: new Date()
    };

    // 1. Check sitemap lastmod first (most reliable for SiteSpeak sites)
    if (url.sitemapLastmod && lastCrawlInfo.lastCrawlTime) {
      if (url.sitemapLastmod > lastCrawlInfo.lastCrawlTime) {
        result.hasChanged = true;
        result.changeReasons.push({
          type: 'sitemap-lastmod',
          details: `Sitemap lastmod ${url.sitemapLastmod.toISOString()} > last crawl ${lastCrawlInfo.lastCrawlTime.toISOString()}`,
          confidence: 0.95
        });
      }
    }

    // 2. Check stored content hash if available
    const storedInfo = lastCrawlInfo.urlInfo?.get(url.loc);
    if (storedInfo?.contentHash && url.currentContentHash) {
      if (storedInfo.contentHash !== url.currentContentHash) {
        result.hasChanged = true;
        result.changeReasons.push({
          type: 'content-hash',
          details: `Content hash changed from ${storedInfo.contentHash} to ${url.currentContentHash}`,
          confidence: 1.0
        });
      } else {
        // Content hash matches, likely no change
        result.changeReasons.push({
          type: 'content-hash-match',
          details: 'Content hash unchanged',
          confidence: 0.9
        });
      }
    }

    // 3. Check HTTP conditional headers
    if (storedInfo?.etag && url.etag) {
      if (storedInfo.etag !== url.etag) {
        result.hasChanged = true;
        result.changeReasons.push({
          type: 'etag',
          details: `ETag changed from ${storedInfo.etag} to ${url.etag}`,
          confidence: 0.85
        });
      }
    }

    if (storedInfo?.lastModified && url.lastModified) {
      if (url.lastModified > storedInfo.lastModified) {
        result.hasChanged = true;
        result.changeReasons.push({
          type: 'last-modified',
          details: `Last-Modified ${url.lastModified.toISOString()} > stored ${storedInfo.lastModified.toISOString()}`,
          confidence: 0.8
        });
      }
    }

    // 4. If no previous crawl info exists, assume changed
    if (!storedInfo) {
      result.hasChanged = true;
      result.changeReasons.push({
        type: 'new-url',
        details: 'No previous crawl information available',
        confidence: 1.0
      });
    }

    // Calculate overall confidence
    result.confidence = this.calculateOverallConfidence(result.changeReasons);
    
    return result;
  }

  /**
   * Generate content hash for comparison
   */
  generateContentHash(content: string, algorithm: 'sha256' | 'md5' = 'sha256'): string {
    // Normalize content before hashing
    const normalizedContent = this.normalizeContentForHashing(content);
    
    return createHash(algorithm)
      .update(normalizedContent, 'utf8')
      .digest('hex');
  }

  /**
   * Normalize content for consistent hashing
   */
  private normalizeContentForHashing(content: string): string {
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove script and style content (often dynamic)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove dynamic timestamps and IDs
      .replace(/timestamp="\d+"/gi, '')
      .replace(/data-timestamp="\d+"/gi, '')
      .replace(/id="[^"]*-\d{13,}"/gi, '') // Remove timestamp-based IDs
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Trim and normalize
      .trim()
      .toLowerCase();
  }

  /**
   * Calculate overall confidence score from individual reasons
   */
  private calculateOverallConfidence(reasons: ChangeReason[]): number {
    if (reasons.length === 0) return 0;

    // Weight different types of evidence
    let totalWeight = 0;
    let weightedSum = 0;

    for (const reason of reasons) {
      const weight = this.getReasonWeight(reason.type);
      totalWeight += weight;
      weightedSum += reason.confidence * weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Get weight for different types of change evidence
   */
  private getReasonWeight(reasonType: ChangeReasonType): number {
    const weights: Record<ChangeReasonType, number> = {
      'content-hash': 1.0,        // Highest confidence
      'sitemap-lastmod': 0.9,     // Very reliable for SiteSpeak sites
      'etag': 0.8,               // Good HTTP standard
      'last-modified': 0.7,      // Decent HTTP standard
      'new-url': 1.0,            // Definitely changed (new)
      'content-hash-match': 0.9   // Strong evidence of no change
    };

    return weights[reasonType] || 0.5;
  }

  /**
   * Compare two content hashes
   */
  compareContentHashes(hash1: string, hash2: string): boolean {
    return hash1 === hash2;
  }

  /**
   * Check if content has likely changed based on metadata
   */
  hasMetadataChanged(
    current: UrlMetadata,
    stored: UrlMetadata
  ): boolean {
    // Check various metadata fields
    const checks = [
      current.title !== stored.title,
      current.description !== stored.description,
      current.contentLength !== stored.contentLength,
      current.etag !== stored.etag,
      current.lastModified && stored.lastModified && 
        current.lastModified > stored.lastModified
    ];

    return checks.some(Boolean);
  }

  /**
   * Create URL fingerprint for change detection
   */
  createUrlFingerprint(url: string, content: string, metadata: UrlMetadata): UrlFingerprint {
    return {
      url,
      contentHash: this.generateContentHash(content),
      metadataHash: this.generateContentHash(JSON.stringify(metadata)),
      title: metadata.title,
      contentLength: content.length,
      etag: metadata.etag,
      lastModified: metadata.lastModified,
      createdAt: new Date()
    };
  }

  /**
   * Batch process multiple URLs for change detection
   */
  async batchDetectChanges(
    urls: UrlToCheck[],
    lastCrawlInfo: LastCrawlInfo,
    batchSize: number = 50
  ): Promise<ChangeDetectionResult[]> {
    const results: ChangeDetectionResult[] = [];
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await this.detectChanges(batch, lastCrawlInfo);
      results.push(...batchResults);
    }
    
    return results;
  }
}

/**
 * URL to check for changes
 */
export interface UrlToCheck {
  loc: string;
  sitemapLastmod?: Date;
  currentContentHash?: string;
  etag?: string;
  lastModified?: Date;
  canonical?: string;
}

/**
 * Last crawl information for comparison
 */
export interface LastCrawlInfo {
  lastCrawlTime?: Date;
  urlInfo?: Map<string, StoredUrlInfo>;
  sessionId?: string;
  version?: string;
}

/**
 * Stored URL information
 */
export interface StoredUrlInfo {
  contentHash: string;
  etag?: string;
  lastModified?: Date;
  title?: string;
  contentLength?: number;
  lastCrawledAt: Date;
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
  url: UrlToCheck;
  hasChanged: boolean;
  changeReasons: ChangeReason[];
  confidence: number;
  lastChecked: Date;
}

/**
 * Change reason
 */
export interface ChangeReason {
  type: ChangeReasonType;
  details: string;
  confidence: number;
}

/**
 * Types of change reasons
 */
export type ChangeReasonType = 
  | 'content-hash'
  | 'sitemap-lastmod'
  | 'etag'
  | 'last-modified'
  | 'new-url'
  | 'content-hash-match';

/**
 * URL metadata for comparison
 */
export interface UrlMetadata {
  title?: string;
  description?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
  contentType?: string;
  statusCode?: number;
}

/**
 * URL fingerprint for storage
 */
export interface UrlFingerprint {
  url: string;
  contentHash: string;
  metadataHash: string;
  title?: string;
  contentLength: number;
  etag?: string;
  lastModified?: Date;
  createdAt: Date;
}

/**
 * Factory function
 */
export function createDeltaDetectionService(): DeltaDetectionService {
  return new DeltaDetectionService();
}