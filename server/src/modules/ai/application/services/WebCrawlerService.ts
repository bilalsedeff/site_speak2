import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import { createLogger } from '../../../../shared/utils.js';
import { parseString as parseXML } from 'xml2js';
import * as cheerio from 'cheerio';
import { KnowledgeBaseService } from './KnowledgeBaseService.js';
// TODO: Remove if KnowledgeChunk types are not needed for future web crawler features
// import type { KnowledgeChunk } from '../../domain/entities/KnowledgeBase.js';

const logger = createLogger({ service: 'web-crawler' });

type BlockableResourceType = 'image' | 'font' | 'media' | 'stylesheet' | 'analytics';

function isBlockableResource(resourceType: string, blockedTypes: BlockableResourceType[]): boolean {
  // Map Playwright resource types to our blocklist
  const resourceTypeMapping: Record<string, BlockableResourceType> = {
    'image': 'image',
    'font': 'font',
    'media': 'media',
    'stylesheet': 'stylesheet',
    'script': 'analytics', // Block analytics scripts
  };
  
  const mappedType = resourceTypeMapping[resourceType];
  return mappedType ? blockedTypes.includes(mappedType) : false;
}

export interface CrawlRequest {
  url: string;
  siteId: string;
  tenantId: string;
  options: CrawlOptions;
}

export interface CrawlOptions {
  maxDepth: number;
  maxPages: number;
  timeoutMs: number;
  concurrency: number;
  allowJsRendering: boolean;
  blockResources: Array<'image' | 'font' | 'media' | 'stylesheet' | 'analytics'>;
  respectRobots: boolean;
  useConditionalRequests: boolean;
  skipMinimalContent?: boolean;
  userAgent?: string;
  headers?: Record<string, string>;
}

export interface CrawlResult {
  url: string;
  status: number;
  redirectedTo?: string;
  finalUrl: string;
  html: string;
  domMetrics: {
    nodes: number;
    scripts: number;
    sizeKb: number;
    loadMs: number;
  };
  http: {
    etag?: string;
    lastModified?: string;
  };
  extracted: {
    jsonld: string[];
    meta: Record<string, string>;
    canonical?: string;
    title?: string;
    description?: string;
  };
}

export interface SitemapEntry {
  url: string;
  lastmod?: string | undefined;
  changefreq?: string | undefined;
  priority?: number | undefined;
}

export interface CrawlSession {
  sessionId: string;
  siteId: string;
  tenantId: string;
  startedAt: Date;
  status: 'initializing' | 'crawling' | 'processing' | 'completed' | 'failed';
  progress: {
    discovered: number;
    processed: number;
    failed: number;
    skipped: number;
  };
  options: CrawlOptions;
}

/**
 * Enhanced web crawler service implementing best practices from source-of-truth-ai-ingestion.md
 * 
 * Features:
 * - Polite crawling with robots.txt respect
 * - Sitemap-based discovery and delta detection  
 * - Conditional HTTP requests (ETag/If-Modified-Since)
 * - Structured data extraction (JSON-LD priority)
 * - Resource blocking for performance
 * - PII/secret scrubbing
 * - Multi-tenant isolation
 */
export class WebCrawlerService {
  private activeSessions = new Map<string, CrawlSession>();
  private robotsCache = new Map<string, { allowed: boolean; timestamp: number }>();
  private etagCache = new Map<string, { etag: string; lastModified?: string; timestamp: number }>();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  /**
   * Start a new crawling session
   */
  async startCrawl(request: CrawlRequest): Promise<string> {
    const sessionId = `crawl_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const session: CrawlSession = {
      sessionId,
      siteId: request.siteId,
      tenantId: request.tenantId,
      startedAt: new Date(),
      status: 'initializing',
      progress: { discovered: 0, processed: 0, failed: 0, skipped: 0 },
      options: request.options
    };

    this.activeSessions.set(sessionId, session);

    // Start crawling in background
    this.executeCrawl(sessionId, request).catch(error => {
      logger.error('Crawl session failed', { sessionId, error });
      session.status = 'failed';
    });

    return sessionId;
  }

  /**
   * Get crawl session status
   */
  getCrawlStatus(sessionId: string): CrawlSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Execute the crawling process
   */
  private async executeCrawl(sessionId: string, request: CrawlRequest): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {throw new Error('Session not found');}

    try {
      session.status = 'crawling';
      logger.info('Starting crawl session', {
        sessionId,
        siteId: request.siteId,
        url: request.url,
        options: request.options
      });

      // Step 1: Discover URLs via sitemap (preferred) or homepage crawl
      const urls = await this.discoverUrls(request.url);
      session.progress.discovered = urls.length;

      // Step 2: Filter URLs based on robots.txt and other constraints
      const allowedUrls = await this.filterAllowedUrls(urls, request.options);

      // Step 3: Determine delta (skip unchanged pages if using conditional requests)
      const urlsToProcess = request.options.useConditionalRequests 
        ? await this.filterDeltaUrls(allowedUrls)
        : allowedUrls;

      session.status = 'processing';

      // Step 4: Crawl pages with resource blocking and politeness
      const crawlResults = await this.crawlPages(urlsToProcess, request.options);

      // Step 5: Process each result into knowledge chunks
      for (const result of crawlResults) {
        try {
          await this.processPageResult(result, request.siteId, request.tenantId, request.options);
          session.progress.processed++;
        } catch (error) {
          logger.warn('Failed to process page', { url: result.url, error });
          session.progress.failed++;
        }
      }

      session.status = 'completed';
      logger.info('Crawl session completed', {
        sessionId,
        progress: session.progress,
        duration: Date.now() - session.startedAt.getTime()
      });

    } catch (error) {
      session.status = 'failed';
      logger.error('Crawl session execution failed', { sessionId, error });
      throw error;
    }
  }

  /**
   * Discover URLs via sitemap.xml (preferred) or homepage links
   */
  private async discoverUrls(seedUrl: string): Promise<SitemapEntry[]> {
    try {
      // Try sitemap first
      const sitemapUrls = await this.readSitemap(seedUrl);
      if (sitemapUrls.length > 0) {
        logger.info('Discovered URLs from sitemap', {
          seedUrl,
          count: sitemapUrls.length
        });
        return sitemapUrls;
      }

      // Fallback to homepage discovery
      logger.info('No sitemap found, falling back to homepage discovery', { seedUrl });
      return [{ url: seedUrl }];

    } catch (error) {
      logger.warn('URL discovery failed, using seed URL only', { seedUrl, error });
      return [{ url: seedUrl }];
    }
  }

  /**
   * Read and parse sitemap.xml
   */
  private async readSitemap(baseUrl: string): Promise<SitemapEntry[]> {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    
    try {
      const response = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)'
        }
      });

      if (!response.ok) {
        throw new Error(`Sitemap fetch failed: ${response.status}`);
      }

      const xmlContent = await response.text();
      const parsed = await new Promise<any>((resolve, reject) => {
        parseXML(xmlContent, (err, result) => {
          if (err) {reject(err);}
          else {resolve(result);}
        });
      });

      const entries: SitemapEntry[] = [];

      // Handle sitemap index (multiple sitemaps)
      if (parsed.sitemapindex?.sitemap) {
        for (const sitemap of parsed.sitemapindex.sitemap) {
          const sitemapUrl = sitemap.loc?.[0];
          if (sitemapUrl) {
            try {
              const subEntries = await this.readSitemap(sitemapUrl);
              entries.push(...subEntries);
            } catch (error) {
              logger.warn('Failed to read sub-sitemap', { sitemapUrl, error });
            }
          }
        }
      }

      // Handle regular sitemap (URL entries)
      if (parsed.urlset?.url) {
        for (const url of parsed.urlset.url) {
          const entry: SitemapEntry = {
            url: url.loc?.[0],
            lastmod: url.lastmod?.[0],
            changefreq: url.changefreq?.[0],
            priority: url.priority?.[0] ? parseFloat(url.priority[0]) : undefined
          };

          if (entry.url) {
            entries.push(entry);
          }
        }
      }

      return entries;

    } catch (error) {
      logger.debug('Sitemap reading failed', { sitemapUrl, error });
      return [];
    }
  }

  /**
   * Filter URLs based on robots.txt and other constraints
   */
  private async filterAllowedUrls(urls: SitemapEntry[], options: CrawlOptions): Promise<SitemapEntry[]> {
    if (!options.respectRobots) {
      return urls.slice(0, options.maxPages);
    }

    const allowedUrls: SitemapEntry[] = [];
    const robotsChecks = new Map<string, boolean>();

    for (const entry of urls) {
      if (allowedUrls.length >= options.maxPages) {break;}

      try {
        const url = new URL(entry.url);
        const origin = url.origin;

        // Check robots.txt once per origin
        if (!robotsChecks.has(origin)) {
          const allowed = await this.checkRobotsAllowed(origin, url.pathname);
          robotsChecks.set(origin, allowed);
        }

        if (robotsChecks.get(origin)) {
          allowedUrls.push(entry);
        }

      } catch (error) {
        logger.debug('URL filtering error', { url: entry.url, error });
      }
    }

    return allowedUrls;
  }

  /**
   * Check robots.txt for URL allowance
   */
  private async checkRobotsAllowed(origin: string, pathname: string): Promise<boolean> {
    const cacheKey = `${origin}${pathname}`;
    const cached = this.robotsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.allowed;
    }

    try {
      const robotsUrl = new URL('/robots.txt', origin).toString();
      const response = await fetch(robotsUrl, {
        headers: {
          'User-Agent': 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)'
        }
      });

      if (!response.ok) {
        // If robots.txt is not found, assume everything is allowed
        this.robotsCache.set(cacheKey, { allowed: true, timestamp: Date.now() });
        return true;
      }

      const robotsText = await response.text();
      const allowed = this.parseRobotsAllowance(robotsText, pathname);

      this.robotsCache.set(cacheKey, { allowed, timestamp: Date.now() });
      return allowed;

    } catch (error) {
      logger.debug('Robots.txt check failed', { origin, pathname, error });
      // On error, assume allowed (fail open)
      return true;
    }
  }

  /**
   * Parse robots.txt content for path allowance
   */
  private parseRobotsAllowance(robotsText: string, pathname: string): boolean {
    const lines = robotsText.split('\n').map(line => line.trim());
    let userAgentMatch = false;
    let allowed = true;

    for (const line of lines) {
      if (line.toLowerCase().startsWith('user-agent:')) {
        const userAgent = line.substring(11).trim();
        userAgentMatch = userAgent === '*' || userAgent.toLowerCase() === 'sitespeak-crawler';
        continue;
      }

      if (!userAgentMatch) {continue;}

      if (line.toLowerCase().startsWith('disallow:')) {
        const disallowPath = line.substring(9).trim();
        if (disallowPath === '/' || pathname.startsWith(disallowPath)) {
          allowed = false;
        }
      } else if (line.toLowerCase().startsWith('allow:')) {
        const allowPath = line.substring(6).trim();
        if (pathname.startsWith(allowPath)) {
          allowed = true;
        }
      }
    }

    return allowed;
  }

  /**
   * Filter URLs that haven't changed since last crawl (delta detection)
   */
  private async filterDeltaUrls(urls: SitemapEntry[]): Promise<SitemapEntry[]> {
    const urlsToProcess: SitemapEntry[] = [];

    for (const entry of urls) {
      const cached = this.etagCache.get(entry.url);
      
      if (!cached || Date.now() - cached.timestamp > this.CACHE_TTL) {
        // No cache or expired - process this URL
        urlsToProcess.push(entry);
        continue;
      }

      if (entry.lastmod && cached.lastModified) {
        const entryDate = new Date(entry.lastmod);
        const cachedDate = new Date(cached.lastModified);
        
        if (entryDate > cachedDate) {
          // URL has been modified - process it
          urlsToProcess.push(entry);
        }
        // else: URL hasn't changed - skip it
      } else {
        // No lastmod information - process to be safe
        urlsToProcess.push(entry);
      }
    }

    return urlsToProcess;
  }

  /**
   * Crawl multiple pages with resource blocking and concurrency control
   */
  private async crawlPages(urls: SitemapEntry[], options: CrawlOptions): Promise<CrawlResult[]> {
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      context = await browser.newContext({
        userAgent: options.userAgent || 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)',
        viewport: { width: 1280, height: 720 },
        extraHTTPHeaders: options.headers || {}
      });

      const results: CrawlResult[] = [];
      const semaphore = new Array(options.concurrency).fill(null);

      // Process URLs with controlled concurrency
      for (let i = 0; i < urls.length; i += options.concurrency) {
        const batch = urls.slice(i, i + options.concurrency);
        
        const batchPromises = batch.map(async (entry, index) => {
          if (index >= semaphore.length) {return null;}
          
          try {
            const result = await this.crawlSinglePage(entry, context!, options);
            return result;
          } catch (error) {
            logger.warn('Failed to crawl page', { url: entry.url, error });
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(Boolean) as CrawlResult[]);

        // Rate limiting - delay between batches
        if (i + options.concurrency < urls.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return results;

    } finally {
      await context?.close();
      await browser?.close();
    }
  }

  /**
   * Crawl a single page with resource blocking
   */
  private async crawlSinglePage(
    entry: SitemapEntry,
    context: BrowserContext,
    options: CrawlOptions
  ): Promise<CrawlResult> {
    const page = await context.newPage();
    const startTime = Date.now();

    try {
      // Set up resource blocking
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        
        if (isBlockableResource(resourceType, options.blockResources)) {
          return route.abort();
        }
        
        return route.continue();
      });

      // Handle conditional requests
      const headers: Record<string, string> = {};
      if (options.useConditionalRequests) {
        const cached = this.etagCache.get(entry.url);
        if (cached?.etag) {
          headers['If-None-Match'] = cached.etag;
        }
        if (cached?.lastModified) {
          headers['If-Modified-Since'] = cached.lastModified;
        }
      }

      const response = await page.goto(entry.url, {
        timeout: options.timeoutMs,
        waitUntil: options.allowJsRendering ? 'networkidle' : 'domcontentloaded'
      });

      if (!response) {
        throw new Error('No response received');
      }

      // Handle 304 Not Modified
      if (response.status() === 304) {
        logger.debug('Page not modified, skipping', { url: entry.url });
        throw new Error('Page not modified');
      }

      const html = await page.content();
      const loadMs = Date.now() - startTime;

      // Extract metadata
      const extracted = await this.extractPageMetadata(page, html);

      // Update cache with response headers
      const etag = response.headers()['etag'];
      const lastModified = response.headers()['last-modified'];
      
      if (etag || lastModified) {
        this.etagCache.set(entry.url, {
          etag: etag || '',
          ...(lastModified ? { lastModified } : {}),
          timestamp: Date.now()
        });
      }

      // Calculate DOM metrics
      const domMetrics = await this.calculateDomMetrics(page, html, loadMs);

      const redirectedUrl = response.url() !== entry.url ? response.url() : null;
      const result: CrawlResult = {
        url: entry.url,
        status: response.status(),
        ...(redirectedUrl ? { redirectedTo: redirectedUrl } : {}),
        finalUrl: response.url(),
        html,
        domMetrics,
        http: { 
          ...(etag ? { etag } : {}),
          ...(lastModified ? { lastModified } : {})
        },
        extracted
      };

      return result;

    } finally {
      await page.close();
    }
  }

  /**
   * Extract structured metadata from page
   */
  private async extractPageMetadata(_page: Page, html: string): Promise<CrawlResult['extracted']> {
    // TODO: Use _page for JavaScript-rendered content extraction if needed
    const $ = cheerio.load(html);
    
    // Extract JSON-LD (highest priority for structured data)
    const jsonld: string[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      const content = $(element).html();
      if (content) {
        try {
          JSON.parse(content); // Validate JSON
          jsonld.push(content);
        } catch (error) {
          logger.debug('Invalid JSON-LD found', { content });
        }
      }
    });

    // Extract meta tags
    const meta: Record<string, string> = {};
    $('meta').each((_, element) => {
      const $el = $(element);
      const name = $el.attr('name') || $el.attr('property');
      const content = $el.attr('content');
      
      if (name && content) {
        meta[name] = content;
      }
    });

    // Extract other important metadata
    const title = $('title').text().trim();
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content');
    const canonical = $('link[rel="canonical"]').attr('href');

    return {
      jsonld,
      meta,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(canonical ? { canonical } : {})
    };
  }

  /**
   * Calculate DOM metrics for performance monitoring
   */
  private async calculateDomMetrics(page: Page, html: string, loadMs: number): Promise<CrawlResult['domMetrics']> {
    const nodes = await page.$$eval('*', elements => elements.length);
    const scripts = await page.$$eval('script', elements => elements.length);
    const sizeKb = Math.round(html.length / 1024);

    return { nodes, scripts, sizeKb, loadMs };
  }

  /**
   * Process crawl result into knowledge chunks
   */
  private async processPageResult(
    result: CrawlResult,
    siteId: string,
    tenantId: string,
    options: CrawlOptions
  ): Promise<void> {
    try {
      // Clean content and remove PII/secrets
      const cleanedContent = this.cleanAndScrubContent(result.html, result.extracted);
      
      // Check content length based on options
      const minContentLength = options.skipMinimalContent ? 100 : 50;
      if (cleanedContent.length < minContentLength) {
        logger.debug('Skipping page with insufficient content', { 
          url: result.url,
          contentLength: cleanedContent.length,
          siteId,
          tenantId
        });
        return;
      }

      // Process into chunks with site context
      const chunks = await this.knowledgeBaseService.processTextIntoChunks(
        cleanedContent,
        {
          url: result.finalUrl,
          title: result.extracted.title || 'Untitled',
          contentType: 'html',
          section: 'main',
          lastModified: new Date()
        },
        {
          maxChunkSize: 800, // Token-aware chunking as per document
          chunkOverlap: 80,   // ~10% overlap
          embeddingModel: 'text-embedding-3-small'
        }
      );

      // Store chunks (this would integrate with repository layer)
      logger.info('Processed page into chunks', {
        url: result.url,
        siteId,
        tenantId,
        chunksCount: chunks.length,
        contentLength: cleanedContent.length,
        jsonldCount: result.extracted.jsonld.length,
        useOptions: options.skipMinimalContent ? 'minimal content skipped' : 'all content processed'
      });

    } catch (error) {
      logger.error('Failed to process page result', { 
        url: result.url, 
        siteId, 
        tenantId, 
        error 
      });
      throw error;
    }
  }

  /**
   * Clean content and scrub PII/secrets
   */
  private cleanAndScrubContent(html: string, extracted: CrawlResult['extracted']): string {
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, nav, footer, aside').remove();
    
    // Extract main content (prefer structured landmarks)
    let content = '';
    
    // Try to get main content area
    const main = $('main, [role="main"], .main-content, #main-content');
    if (main.length > 0) {
      content = main.first().text();
    } else {
      // Fallback to body text
      content = $('body').text();
    }

    // Add structured data content if available
    if (extracted.jsonld.length > 0) {
      for (const jsonldStr of extracted.jsonld) {
        try {
          const jsonld = JSON.parse(jsonldStr);
          if (jsonld.description) {
            content += ` ${jsonld.description}`;
          }
          if (jsonld.name || jsonld.headline) {
            content += ` ${jsonld.name || jsonld.headline}`;
          }
        } catch (error) {
          // Skip invalid JSON-LD
        }
      }
    }

    // Clean and normalize
    content = content
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/<[^>]*>/g, ' ')  // Remove any remaining HTML
      .trim();

    // PII/Secret scrubbing patterns
    const scrubPatterns = [
      // API Keys
      /\b[A-Za-z0-9]{32,}\b/g,
      /sk-[A-Za-z0-9]{32,}/g,
      // Email addresses (be conservative - only obvious patterns)
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // Phone numbers (basic pattern)
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      // Social security numbers
      /\b\d{3}-\d{2}-\d{4}\b/g,
      // Credit card patterns (basic)
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g
    ];

    for (const pattern of scrubPatterns) {
      content = content.replace(pattern, '[REDACTED]');
    }

    return content;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.robotsCache.clear();
    this.etagCache.clear();
    logger.info('Web crawler caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { robotsCache: number; etagCache: number; activeSessions: number } {
    return {
      robotsCache: this.robotsCache.size,
      etagCache: this.etagCache.size,
      activeSessions: this.activeSessions.size
    };
  }
}

// Export singleton instance
// Export factory function for dependency injection
export const createWebCrawlerService = (knowledgeBaseService: KnowledgeBaseService) => {
  return new WebCrawlerService(knowledgeBaseService);
};

// Export singleton instance (will need to be initialized with dependencies)
let _webCrawlerServiceInstance: WebCrawlerService | null = null;

export const webCrawlerService = {
  getInstance: (knowledgeBaseService?: KnowledgeBaseService): WebCrawlerService => {
    if (!_webCrawlerServiceInstance) {
      if (!knowledgeBaseService) {
        throw new Error('KnowledgeBaseService is required for first initialization');
      }
      _webCrawlerServiceInstance = new WebCrawlerService(knowledgeBaseService);
    }
    return _webCrawlerServiceInstance;
  }
};