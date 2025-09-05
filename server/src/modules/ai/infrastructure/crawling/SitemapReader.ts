import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'sitemap-reader' });

/**
 * Sitemap Reader
 * 
 * Reads and processes XML sitemaps for delta-based crawling.
 * Implements sitemap protocol standards and lastmod-based change detection.
 */
export class SitemapReader {
  private readonly userAgent = 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)';
  
  /**
   * Discover and read sitemaps from a domain
   */
  async discoverSitemaps(baseUrl: string): Promise<SitemapDiscoveryResult> {
    const result: SitemapDiscoveryResult = {
      baseUrl,
      discoveredSitemaps: [],
      totalUrls: 0,
      errors: [],
      discoveredAt: new Date()
    };

    try {
      // 1. Check robots.txt for sitemap declarations
      const robotsSitemaps = await this.discoverFromRobots(baseUrl);
      result.discoveredSitemaps.push(...robotsSitemaps);

      // 2. Check common sitemap locations
      const commonSitemaps = await this.checkCommonLocations(baseUrl);
      result.discoveredSitemaps.push(...commonSitemaps);

      // 3. Remove duplicates
      result.discoveredSitemaps = this.deduplicateSitemaps(result.discoveredSitemaps);

      // 4. Process all discovered sitemaps
      let totalUrls = 0;
      for (const sitemap of result.discoveredSitemaps) {
        const processResult = await this.processSitemap(sitemap.url);
        sitemap.entries = processResult.entries;
        sitemap.lastChecked = new Date();
        totalUrls += processResult.entries.length;

        if (processResult.errors.length > 0) {
          result.errors.push(...processResult.errors);
        }
      }

      result.totalUrls = totalUrls;

      logger.info('Sitemap discovery completed', {
        baseUrl,
        sitemapsFound: result.discoveredSitemaps.length,
        totalUrls: result.totalUrls,
        errors: result.errors.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        type: 'discovery-error',
        message: errorMessage,
        url: baseUrl
      });

      logger.error('Sitemap discovery failed', {
        baseUrl,
        error: errorMessage
      });
    }

    return result;
  }

  /**
   * Find URLs that have changed since last crawl
   */
  async findChangedUrls(
    siteId: string,
    baseUrl: string,
    lastCrawlTime?: Date
  ): Promise<SitemapEntry[]> {
    try {
      const discovery = await this.discoverSitemaps(baseUrl);
      const allEntries: SitemapEntry[] = [];

      // Collect all entries from discovered sitemaps
      for (const sitemap of discovery.discoveredSitemaps) {
        allEntries.push(...sitemap.entries);
      }

      // Filter based on lastmod if last crawl time is provided
      if (lastCrawlTime) {
        const changedEntries = allEntries.filter(entry => {
          // If no lastmod, assume it might have changed
          if (!entry.lastmod) {
            return true;
          }
          
          // Compare lastmod with last crawl time
          return entry.lastmod > lastCrawlTime;
        });

        logger.info('Delta URLs identified', {
          siteId,
          totalUrls: allEntries.length,
          changedUrls: changedEntries.length,
          lastCrawlTime: lastCrawlTime.toISOString()
        });

        return changedEntries;
      }

      // Return all entries if no last crawl time
      return allEntries;

    } catch (error) {
      logger.error('Failed to find changed URLs', {
        siteId,
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Process a single sitemap URL
   */
  async processSitemap(sitemapUrl: string): Promise<SitemapProcessResult> {
    const result: SitemapProcessResult = {
      url: sitemapUrl,
      entries: [],
      errors: [],
      processedAt: new Date()
    };

    try {
      logger.debug('Processing sitemap', { sitemapUrl });

      const response = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/xml, text/xml, */*'
        },
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlContent = await response.text();
      const parsed = await parseStringPromise(xmlContent, {
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });

      // Determine sitemap type and process accordingly
      if (parsed.sitemapindex) {
        // This is a sitemap index file
        result.entries = await this.processSitemapIndex(parsed.sitemapindex, sitemapUrl);
      } else if (parsed.urlset) {
        // This is a regular sitemap
        result.entries = this.processUrlSet(parsed.urlset, sitemapUrl);
      } else {
        throw new Error('Invalid sitemap format: no sitemapindex or urlset found');
      }

      logger.info('Sitemap processed successfully', {
        sitemapUrl,
        entriesCount: result.entries.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        type: 'processing-error',
        message: errorMessage,
        url: sitemapUrl
      });

      logger.error('Sitemap processing failed', {
        sitemapUrl,
        error: errorMessage
      });
    }

    return result;
  }

  /**
   * Discover sitemaps from robots.txt
   */
  private async discoverFromRobots(baseUrl: string): Promise<DiscoveredSitemap[]> {
    const sitemaps: DiscoveredSitemap[] = [];
    
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await fetch(robotsUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      });

      if (response.ok) {
        const robotsContent = await response.text();
        const sitemapMatches = robotsContent.match(/^Sitemap:\s*(.+)$/gmi);
        
        if (sitemapMatches) {
          for (const match of sitemapMatches) {
            const sitemapUrl = match.replace(/^Sitemap:\s*/i, '').trim();
            sitemaps.push({
              url: sitemapUrl,
              source: 'robots.txt',
              entries: [],
              discovered: true
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Could not read robots.txt', {
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return sitemaps;
  }

  /**
   * Check common sitemap locations
   */
  private async checkCommonLocations(baseUrl: string): Promise<DiscoveredSitemap[]> {
    const commonPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemaps.xml',
      '/sitemap/sitemap.xml',
      '/wp-sitemap.xml' // WordPress
    ];

    const sitemaps: DiscoveredSitemap[] = [];

    for (const path of commonPaths) {
      try {
        const sitemapUrl = new URL(path, baseUrl).toString();
        const response = await fetch(sitemapUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000
        });

        if (response.ok && this.isXmlContentType(response.headers.get('content-type'))) {
          sitemaps.push({
            url: sitemapUrl,
            source: 'common-location',
            entries: [],
            discovered: true
          });
        }
      } catch {
        // Ignore errors for common location checks
      }
    }

    return sitemaps;
  }

  /**
   * Process sitemap index (references to other sitemaps)
   */
  private async processSitemapIndex(
    sitemapIndex: any,
    parentUrl: string
  ): Promise<SitemapEntry[]> {
    const allEntries: SitemapEntry[] = [];
    
    const sitemapRefs = Array.isArray(sitemapIndex.sitemap) 
      ? sitemapIndex.sitemap 
      : [sitemapIndex.sitemap];

    for (const sitemapRef of sitemapRefs) {
      if (sitemapRef && sitemapRef.loc) {
        try {
          const childResult = await this.processSitemap(sitemapRef.loc);
          allEntries.push(...childResult.entries);
        } catch (error) {
          logger.warn('Failed to process child sitemap', {
            childUrl: sitemapRef.loc,
            parentUrl,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return allEntries;
  }

  /**
   * Process URL set from sitemap
   */
  private processUrlSet(urlset: any, sitemapUrl: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];
    
    const urls = Array.isArray(urlset.url) ? urlset.url : [urlset.url];
    
    for (const url of urls) {
      if (url && url.loc) {
        const entry: SitemapEntry = {
          loc: url.loc,
          lastmod: url.lastmod ? this.parseDate(url.lastmod) : undefined,
          changefreq: this.parseChangeFreq(url.changefreq),
          priority: url.priority ? parseFloat(url.priority) : undefined,
          source: sitemapUrl
        };

        // Validate URL
        if (this.isValidUrl(entry.loc)) {
          entries.push(entry);
        } else {
          logger.warn('Invalid URL in sitemap', {
            url: entry.loc,
            sitemap: sitemapUrl
          });
        }
      }
    }

    return entries;
  }

  /**
   * Remove duplicate sitemaps
   */
  private deduplicateSitemaps(sitemaps: DiscoveredSitemap[]): DiscoveredSitemap[] {
    const seen = new Set<string>();
    return sitemaps.filter(sitemap => {
      if (seen.has(sitemap.url)) {
        return false;
      }
      seen.add(sitemap.url);
      return true;
    });
  }

  /**
   * Check if content type is XML
   */
  private isXmlContentType(contentType: string | null): boolean {
    if (!contentType) {return false;}
    return contentType.includes('xml') || contentType.includes('text/plain');
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse date from sitemap
   */
  private parseDate(dateString: string): Date | undefined {
    try {
      return new Date(dateString);
    } catch {
      return undefined;
    }
  }

  /**
   * Parse change frequency
   */
  private parseChangeFreq(changefreq: string | undefined): SitemapChangeFreq | undefined {
    if (!changefreq) {return undefined;}
    
    const validFreqs: SitemapChangeFreq[] = [
      'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'
    ];
    
    const freq = changefreq.toLowerCase() as SitemapChangeFreq;
    return validFreqs.includes(freq) ? freq : undefined;
  }
}

/**
 * Sitemap discovery result
 */
export interface SitemapDiscoveryResult {
  baseUrl: string;
  discoveredSitemaps: DiscoveredSitemap[];
  totalUrls: number;
  errors: SitemapError[];
  discoveredAt: Date;
}

/**
 * Discovered sitemap
 */
export interface DiscoveredSitemap {
  url: string;
  source: 'robots.txt' | 'common-location' | 'sitemap-index';
  entries: SitemapEntry[];
  discovered: boolean;
  lastChecked?: Date;
}

/**
 * Sitemap processing result
 */
export interface SitemapProcessResult {
  url: string;
  entries: SitemapEntry[];
  errors: SitemapError[];
  processedAt: Date;
}

/**
 * Sitemap entry
 */
export interface SitemapEntry {
  loc: string;
  lastmod?: Date;
  changefreq?: SitemapChangeFreq;
  priority?: number;
  source?: string; // Which sitemap this came from
}

/**
 * Sitemap change frequency
 */
export type SitemapChangeFreq = 
  | 'always' 
  | 'hourly' 
  | 'daily' 
  | 'weekly' 
  | 'monthly' 
  | 'yearly' 
  | 'never';

/**
 * Sitemap error
 */
export interface SitemapError {
  type: 'discovery-error' | 'processing-error' | 'parsing-error';
  message: string;
  url: string;
}

/**
 * Factory function
 */
export function createSitemapReader(): SitemapReader {
  return new SitemapReader();
}