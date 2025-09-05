import fetch from 'node-fetch';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'robots-compliance' });

/**
 * Robots Compliance Checker
 * 
 * Implements RFC 9309 robots exclusion protocol compliance.
 * Ensures polite crawling by respecting robots.txt directives.
 */
export class RobotsComplianceChecker {
  private robotsCache = new Map<string, RobotsResult>();
  private readonly cacheExpiryMs = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Check if URL is allowed by robots.txt
   */
  async isAllowed(
    url: string,
    userAgent: string = '*'
  ): Promise<RobotsComplianceResult> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = new URL('/robots.txt', urlObj.origin).toString();
      
      // Get robots.txt content (cached)
      const robotsResult = await this.getRobotsTxt(robotsUrl);
      
      if (!robotsResult.exists) {
        return {
          url,
          allowed: true,
          reason: 'no-robots-txt',
          crawlDelay: 1000,
          source: 'default'
        };
      }

      // Parse and check rules
      const rules = this.parseRobotsTxt(robotsResult.content, userAgent);
      const path = urlObj.pathname + urlObj.search;
      
      // Check disallow rules first
      for (const disallow of rules.disallow) {
        if (this.pathMatches(path, disallow)) {
          return {
            url,
            allowed: false,
            reason: 'disallowed',
            rule: disallow,
            crawlDelay: rules.crawlDelay,
            source: robotsUrl
          };
        }
      }

      // Check allow rules if they exist
      if (rules.allow.length > 0) {
        for (const allow of rules.allow) {
          if (this.pathMatches(path, allow)) {
            return {
              url,
              allowed: true,
              reason: 'explicitly-allowed',
              rule: allow,
              crawlDelay: rules.crawlDelay,
              source: robotsUrl
            };
          }
        }
        
        // No allow rule matched, but allow rules exist - default deny
        return {
          url,
          allowed: false,
          reason: 'not-explicitly-allowed',
          crawlDelay: rules.crawlDelay,
          source: robotsUrl
        };
      }

      // No disallow matched and no allow rules - default allow
      return {
        url,
        allowed: true,
        reason: 'not-disallowed',
        crawlDelay: rules.crawlDelay,
        source: robotsUrl
      };

    } catch (error) {
      logger.warn('Robots compliance check failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Default to allowed on error (fail open)
      return {
        url,
        allowed: true,
        reason: 'check-failed',
        crawlDelay: 1000,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch check multiple URLs
   */
  async batchCheck(
    urls: string[],
    userAgent: string = '*'
  ): Promise<RobotsComplianceResult[]> {
    const results: RobotsComplianceResult[] = [];
    
    // Group URLs by domain to minimize robots.txt fetches
    const urlsByDomain = this.groupUrlsByDomain(urls);
    
    for (const [domain, domainUrls] of urlsByDomain.entries()) {
      try {
        const robotsUrl = `${domain}/robots.txt`;
        const robotsResult = await this.getRobotsTxt(robotsUrl);
        
        for (const url of domainUrls) {
          const result = await this.checkAgainstRobots(url, robotsResult, userAgent);
          results.push(result);
        }
      } catch (error) {
        // Add error results for all URLs in this domain
        for (const url of domainUrls) {
          results.push({
            url,
            allowed: true, // Fail open
            reason: 'domain-check-failed',
            crawlDelay: 1000,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Get crawl delay for domain
   */
  async getCrawlDelay(
    domain: string,
    userAgent: string = '*'
  ): Promise<number> {
    try {
      const robotsUrl = `${domain}/robots.txt`;
      const robotsResult = await this.getRobotsTxt(robotsUrl);
      
      if (!robotsResult.exists) {
        return 1000; // Default 1 second
      }

      const rules = this.parseRobotsTxt(robotsResult.content, userAgent);
      return rules.crawlDelay;

    } catch {
      return 1000; // Default on error
    }
  }

  /**
   * Get sitemaps declared in robots.txt
   */
  async getSitemaps(domain: string): Promise<string[]> {
    try {
      const robotsUrl = `${domain}/robots.txt`;
      const robotsResult = await this.getRobotsTxt(robotsUrl);
      
      if (!robotsResult.exists) {
        return [];
      }

      return this.extractSitemaps(robotsResult.content);

    } catch {
      return [];
    }
  }

  /**
   * Clear robots cache for domain
   */
  clearCache(domain?: string): void {
    if (domain) {
      const robotsUrl = `${domain}/robots.txt`;
      this.robotsCache.delete(robotsUrl);
    } else {
      this.robotsCache.clear();
    }
  }

  /**
   * Get robots.txt content (with caching)
   */
  private async getRobotsTxt(robotsUrl: string): Promise<RobotsResult> {
    // Check cache first
    const cached = this.robotsCache.get(robotsUrl);
    if (cached && (Date.now() - cached.fetchedAt.getTime()) < this.cacheExpiryMs) {
      return cached;
    }

    try {
      logger.debug('Fetching robots.txt', { robotsUrl });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        const response = await fetch(robotsUrl, {
          headers: {
            'User-Agent': 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)'
          },
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timeoutId);

        let result: RobotsResult;

        if (response.ok) {
          const content = await response.text();
          const lastModifiedHeader = response.headers.get('last-modified');
          result = {
            url: robotsUrl,
            exists: true,
            content,
            ...(lastModifiedHeader && { lastModified: new Date(lastModifiedHeader) }),
            fetchedAt: new Date()
          };
        } else {
          result = {
            url: robotsUrl,
            exists: false,
            content: '',
            fetchedAt: new Date()
          };
        }

        // Cache the result
        this.robotsCache.set(robotsUrl, result);
        return result;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          logger.warn('Robots.txt fetch timeout', { robotsUrl });
        }
        throw fetchError;
      }

    } catch (error) {
      logger.debug('Failed to fetch robots.txt', {
        robotsUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const result: RobotsResult = {
        url: robotsUrl,
        exists: false,
        content: '',
        fetchedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.robotsCache.set(robotsUrl, result);
      return result;
    }
  }

  /**
   * Parse robots.txt content for specific user agent
   */
  private parseRobotsTxt(content: string, userAgent: string): RobotRules {
    const rules: RobotRules = {
      userAgent,
      allow: [],
      disallow: [],
      crawlDelay: 1000,
      sitemaps: []
    };

    const lines = content.split('\n').map(line => line.trim());
    let currentUserAgent: string | null = null;
    let inRelevantSection = false;

    for (const line of lines) {
      if (!line || line.startsWith('#')) {
        continue; // Skip empty lines and comments
      }

      const [key, ...valueParts] = line.split(':');
      if (!key || valueParts.length === 0) {continue;}
      
      const value = valueParts.join(':').trim();
      const lowerKey = key.toLowerCase().trim();

      switch (lowerKey) {
        case 'user-agent':
          currentUserAgent = value.toLowerCase();
          inRelevantSection = (
            currentUserAgent === '*' || 
            currentUserAgent === userAgent.toLowerCase() ||
            userAgent.toLowerCase().includes(currentUserAgent)
          );
          break;

        case 'disallow':
          if (inRelevantSection) {
            rules.disallow.push(value);
          }
          break;

        case 'allow':
          if (inRelevantSection) {
            rules.allow.push(value);
          }
          break;

        case 'crawl-delay':
          if (inRelevantSection) {
            const delay = parseInt(value, 10);
            if (!isNaN(delay)) {
              rules.crawlDelay = delay * 1000; // Convert to milliseconds
            }
          }
          break;

        case 'sitemap':
          // Sitemaps are global, not user-agent specific
          rules.sitemaps.push(value);
          break;
      }
    }

    return rules;
  }

  /**
   * Check if path matches robots rule pattern
   */
  private pathMatches(path: string, pattern: string): boolean {
    if (!pattern) {return false;}
    if (pattern === '/') {return path === '/';}
    
    // Handle wildcards
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except *
        .replace(/\*/g, '.*'); // Convert * to .*
      
      try {
        return new RegExp('^' + regexPattern).test(path);
      } catch {
        // Fallback to simple string matching if regex fails
        return path.startsWith(pattern.replace('*', ''));
      }
    }

    // Simple prefix matching
    return path.startsWith(pattern);
  }

  /**
   * Check URL against specific robots result
   */
  private async checkAgainstRobots(
    url: string,
    robotsResult: RobotsResult,
    userAgent: string
  ): Promise<RobotsComplianceResult> {
    if (!robotsResult.exists) {
      return {
        url,
        allowed: true,
        reason: 'no-robots-txt',
        crawlDelay: 1000,
        source: 'default'
      };
    }

    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    const rules = this.parseRobotsTxt(robotsResult.content, userAgent);

    // Check disallow first
    for (const disallow of rules.disallow) {
      if (this.pathMatches(path, disallow)) {
        return {
          url,
          allowed: false,
          reason: 'disallowed',
          rule: disallow,
          crawlDelay: rules.crawlDelay,
          source: robotsResult.url
        };
      }
    }

    // Check allow if rules exist
    if (rules.allow.length > 0) {
      for (const allow of rules.allow) {
        if (this.pathMatches(path, allow)) {
          return {
            url,
            allowed: true,
            reason: 'explicitly-allowed',
            rule: allow,
            crawlDelay: rules.crawlDelay,
            source: robotsResult.url
          };
        }
      }
      return {
        url,
        allowed: false,
        reason: 'not-explicitly-allowed',
        crawlDelay: rules.crawlDelay,
        source: robotsResult.url
      };
    }

    return {
      url,
      allowed: true,
      reason: 'not-disallowed',
      crawlDelay: rules.crawlDelay,
      source: robotsResult.url
    };
  }

  /**
   * Group URLs by domain
   */
  private groupUrlsByDomain(urls: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    
    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.origin;
        
        if (!groups.has(domain)) {
          groups.set(domain, []);
        }
        groups.get(domain)!.push(url);
      } catch {
        // Skip invalid URLs
      }
    }
    
    return groups;
  }

  /**
   * Extract sitemap URLs from robots.txt content
   */
  private extractSitemaps(content: string): string[] {
    const sitemaps: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^sitemap:\s*(.+)$/i);
      if (match && match[1]) {
        sitemaps.push(match[1].trim());
      }
    }
    
    return sitemaps;
  }
}

/**
 * Robots.txt fetch result
 */
export interface RobotsResult {
  url: string;
  exists: boolean;
  content: string;
  lastModified?: Date;
  fetchedAt: Date;
  error?: string;
}

/**
 * Parsed robot rules for user agent
 */
export interface RobotRules {
  userAgent: string;
  allow: string[];
  disallow: string[];
  crawlDelay: number; // in milliseconds
  sitemaps: string[];
}

/**
 * Robots compliance check result
 */
export interface RobotsComplianceResult {
  url: string;
  allowed: boolean;
  reason: RobotsReason;
  rule?: string;
  crawlDelay: number;
  source?: string;
  error?: string;
}

/**
 * Robots compliance reasons
 */
export type RobotsReason =
  | 'no-robots-txt'
  | 'disallowed'
  | 'explicitly-allowed'
  | 'not-explicitly-allowed'
  | 'not-disallowed'
  | 'check-failed'
  | 'domain-check-failed';

/**
 * Factory function
 */
export function createRobotsComplianceChecker(): RobotsComplianceChecker {
  return new RobotsComplianceChecker();
}