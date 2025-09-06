import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { CrawlSession, createCrawlSession, SessionType } from '../../domain/entities/CrawlSession';
import { SitemapReader, createSitemapReader } from './SitemapReader';
import { RobotsComplianceChecker, createRobotsComplianceChecker } from './RobotsComplianceChecker';
import { ConditionalFetcher, createConditionalFetcher } from './ConditionalFetcher';
import { PlaywrightAdapter, createPlaywrightAdapter } from './PlaywrightAdapter';
import { JsonLdExtractor, createJsonLdExtractor } from '../extractors/JsonLdExtractor';
import { ActionExtractor, createActionExtractor } from '../extractors/ActionExtractor';
import { FormExtractor, createFormExtractor } from '../extractors/FormExtractor';
import { HtmlExtractor, createHtmlExtractor } from '../extractors/HtmlExtractor';
import { DeltaDetectionService, createDeltaDetectionService } from '../../domain/services/DeltaDetectionService';
import { CanonicalUrlService, createCanonicalUrlService } from '../../domain/services/CanonicalUrlService';
import { ContentHashService, createContentHashService } from '../../domain/services/ContentHashService';
import { getActionDispatchService } from '../../application/services/ActionDispatchService';
import { siteContractService } from '../../../sites/application/services/SiteContractService';

const logger = createLogger({ service: 'crawl-orchestrator' });

/**
 * Crawl Orchestrator
 * 
 * Coordinates the entire crawling process including URL discovery, robots compliance,
 * content fetching, extraction, and delta detection. Implements the full ingestion pipeline.
 */
export class CrawlOrchestrator {
  private readonly sitemapReader: SitemapReader;
  private readonly robotsChecker: RobotsComplianceChecker;
  private readonly conditionalFetcher: ConditionalFetcher;
  private readonly _playwrightAdapter: PlaywrightAdapter;
  private readonly jsonLdExtractor: JsonLdExtractor;
  private readonly actionExtractor: ActionExtractor;
  private readonly formExtractor: FormExtractor;
  private readonly _htmlExtractor: HtmlExtractor;
  private readonly deltaDetectionService: DeltaDetectionService;
  private readonly canonicalUrlService: CanonicalUrlService;
  private readonly contentHashService: ContentHashService;
  private readonly _siteContractService = siteContractService;

  private activeSessions = new Map<string, CrawlSession>();

  constructor() {
    this.sitemapReader = createSitemapReader();
    this.robotsChecker = createRobotsComplianceChecker();
    this.conditionalFetcher = createConditionalFetcher();
    this._playwrightAdapter = createPlaywrightAdapter();
    this.jsonLdExtractor = createJsonLdExtractor();
    this.actionExtractor = createActionExtractor();
    this.formExtractor = createFormExtractor();
    this._htmlExtractor = createHtmlExtractor();
    this.deltaDetectionService = createDeltaDetectionService();
    this.canonicalUrlService = createCanonicalUrlService();
    this.contentHashService = createContentHashService();
    // Site contract service is injected as dependency
    
    // Suppress TypeScript warnings for architectural placeholders
    void this._playwrightAdapter; // Will be used for advanced crawling
    void this._htmlExtractor; // Will be used for advanced extraction
    void this._siteContractService; // Will be used for contract integration
  }

  /**
   * Start comprehensive crawling session
   */
  async startCrawl(request: CrawlRequest): Promise<CrawlSessionResult> {
    try {
      logger.info('Starting crawl session', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        sessionType: request.sessionType,
        baseUrl: request.baseUrl
      });

      // Create crawl session
      let session = createCrawlSession(
        request.knowledgeBaseId,
        request.tenantId,
        request.siteId,
        request.sessionType,
        request.options || {}
      );

      // Start the session
      session = session.start([request.baseUrl]);
      this.activeSessions.set(session.id, session);

      // Run crawling pipeline
      const result = await this.executeCrawlPipeline(session, request);

      // Generate site contract if this was a full crawl
      let _siteContract = null;
      if (request.sessionType === 'full') {
        try {
          _siteContract = await this.generateSiteContract(request, result.extractedContent);
          logger.info('Site contract generated', {
            sessionId: session.id,
            siteId: request.siteId
          });
        } catch (error) {
          logger.warn('Site contract generation failed', {
            sessionId: session.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      // TODO: Site contract will be used for future contract persistence and validation
      void _siteContract;

      // Update session with results
      session = session.complete({
        processedUrls: result.processedUrls,
        failedUrls: result.failedUrls,
        chunksCreated: result.extractedContent.length
      });

      this.activeSessions.set(session.id, session);

      logger.info('Crawl session completed', {
        sessionId: session.id,
        status: session.status,
        processedUrls: result.processedUrls,
        extractedContent: result.extractedContent.length
      });

      return {
        sessionId: session.id,
        status: 'completed',
        processedUrls: result.processedUrls,
        failedUrls: result.failedUrls,
        extractedContent: result.extractedContent,
        statistics: session.getStatistics()
      };

    } catch (error) {
      logger.error('Crawl session failed', {
        siteId: request.siteId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Get crawl session status
   */
  getCrawlStatus(sessionId: string): CrawlSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Cancel crawl session
   */
  async cancelCrawl(sessionId: string, reason: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }

    const cancelledSession = session.cancel(reason);
    this.activeSessions.set(sessionId, cancelledSession);

    logger.info('Crawl session cancelled', { sessionId, reason });
    return true;
  }

  /**
   * Execute the full crawling pipeline
   */
  private async executeCrawlPipeline(
    session: CrawlSession,
    request: CrawlRequest
  ): Promise<CrawlPipelineResult> {
    const result: CrawlPipelineResult = {
      processedUrls: 0,
      failedUrls: 0,
      extractedContent: []
    };

    try {
      // Phase 1: URL Discovery
      const urls = await this.discoverUrls(request.baseUrl, session);
      logger.debug('URL discovery completed', { 
        sessionId: session.id, 
        urlsFound: urls.length 
      });

      // Update session progress
      session = session.updateProgress({
        totalUrls: urls.length,
        status: 'crawling'
      });

      // Phase 2: Delta Detection (if not full crawl)
      let urlsToProcess = urls;
      if (request.sessionType === 'delta' && request.lastCrawlInfo) {
        const changedUrls = await this.deltaDetectionService.filterChangedUrls(
          urls,
          request.lastCrawlInfo
        );
        // Convert UrlToCheck[] to UrlToCrawl[]
        urlsToProcess = changedUrls.map(url => ({
          loc: url.loc,
          source: 'sitemap' as const,
          ...(url.sitemapLastmod && { sitemapLastmod: url.sitemapLastmod })
        }));
        logger.debug('Delta detection completed', { 
          sessionId: session.id, 
          originalUrls: urls.length,
          changedUrls: urlsToProcess.length 
        });
      }

      // Phase 3: Process URLs
      for (const url of urlsToProcess) {
        try {
          const extractedContent = await this.processUrl(url, session);
          if (extractedContent) {
            result.extractedContent.push(extractedContent);
          }
          result.processedUrls++;

          // Update progress
          session = session.updateProgress({
            processedUrls: result.processedUrls,
            currentUrl: url.loc
          });

        } catch (error) {
          result.failedUrls++;
          
          session = session.recordError({
            type: 'extraction',
            message: error instanceof Error ? error.message : 'Processing failed',
            url: url.loc,
            severity: 'error'
          });

          logger.warn('URL processing failed', {
            sessionId: session.id,
            url: url.loc,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return result;

    } catch (error) {
      logger.error('Crawl pipeline failed', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Discover URLs to crawl
   */
  private async discoverUrls(baseUrl: string, session: CrawlSession): Promise<UrlToCrawl[]> {
    try {
      // Discover sitemaps
      const sitemapResult = await this.sitemapReader.discoverSitemaps(baseUrl);
      const urls: UrlToCrawl[] = [];

      // Collect URLs from all sitemaps
      for (const sitemap of sitemapResult.discoveredSitemaps) {
        for (const entry of sitemap.entries) {
          urls.push({
            loc: entry.loc,
            source: 'sitemap' as const,
            ...(entry.lastmod && { sitemapLastmod: entry.lastmod }),
            ...(entry.priority && { priority: entry.priority }),
            ...(entry.changefreq && { changefreq: entry.changefreq })
          });
        }
      }

      // Add base URL if not in sitemap
      if (!urls.some(u => u.loc === baseUrl)) {
        urls.unshift({
          loc: baseUrl,
          source: 'manual'
        });
      }

      // Apply robots compliance filter
      const allowedUrls: UrlToCrawl[] = [];
      for (const url of urls) {
        const robotsResult = await this.robotsChecker.isAllowed(url.loc);
        if (robotsResult.allowed) {
          allowedUrls.push(url);
        } else {
          logger.debug('URL blocked by robots.txt', {
            sessionId: session.id,
            url: url.loc,
            reason: robotsResult.reason
          });
        }
      }

      return allowedUrls;

    } catch (error) {
      logger.error('URL discovery failed', {
        sessionId: session.id,
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [{ loc: baseUrl, source: 'fallback' }];
    }
  }

  /**
   * Process individual URL
   */
  private async processUrl(
    url: UrlToCrawl,
    session: CrawlSession
  ): Promise<ExtractedPageContent | null> {
    try {
      logger.debug('Processing URL', { 
        sessionId: session.id, 
        url: url.loc 
      });

      // Fetch content conditionally
      const fetchResult = await this.conditionalFetcher.fetchConditionally(
        url.loc,
        url.storedInfo
      );

      if (fetchResult.status === 'not-modified') {
        logger.debug('URL not modified, skipping', {
          sessionId: session.id,
          url: url.loc
        });
        return null;
      }

      if (fetchResult.status === 'error' || !fetchResult.content) {
        throw new Error(fetchResult.error || 'Failed to fetch content');
      }

      // Resolve canonical URL
      const canonicalFromHtml = this.extractCanonicalFromHtml(fetchResult.content);
      const canonicalResult = this.canonicalUrlService.resolveCanonicalUrl(
        url.loc,
        {
          ...(canonicalFromHtml && { relCanonical: canonicalFromHtml })
        }
      );

      // Compute content hash
      const contentHash = this.contentHashService.computeContentHash(fetchResult.content);

      // Extract structured data
      const jsonLdResult = await this.jsonLdExtractor.extractFromHtml(
        fetchResult.content,
        canonicalResult.canonicalUrl
      );

      // Extract actions
      const actionResult = await this.actionExtractor.extractFromHtml(
        fetchResult.content,
        canonicalResult.canonicalUrl
      );

      // Extract forms
      const formResult = await this.formExtractor.extractFromHtml(
        fetchResult.content,
        canonicalResult.canonicalUrl
      );

      // Create extracted content
      const extractedContent: ExtractedPageContent = {
        url: url.loc,
        canonicalUrl: canonicalResult.canonicalUrl,
        content: fetchResult.content,
        contentHash: contentHash.hash,
        title: this.extractTitle(fetchResult.content) || 'Untitled',
        description: this.extractDescription(fetchResult.content) || '',
        language: this.extractLanguage(fetchResult.content),
        ...(fetchResult.cachingInfo?.lastModified && { lastModified: fetchResult.cachingInfo.lastModified }),
        entities: jsonLdResult.entities,
        actions: actionResult.actions,
        forms: formResult.forms,
        extractedAt: new Date(),
        processingMeta: {
          fetchStatus: fetchResult.status,
          contentLength: fetchResult.contentLength || 0,
          processingTime: Date.now(),
          extractorVersions: {
            jsonLd: '1.0.0',
            actions: '1.0.0',
            forms: '1.0.0'
          }
        }
      };

      logger.debug('URL processing completed', {
        sessionId: session.id,
        url: url.loc,
        entitiesFound: extractedContent.entities.length,
        actionsFound: extractedContent.actions.length,
        formsFound: extractedContent.forms.length
      });

      return extractedContent;

    } catch (error) {
      logger.error('URL processing failed', {
        sessionId: session.id,
        url: url.loc,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Extract canonical URL from HTML
   */
  private extractCanonicalFromHtml(html: string): string | undefined {
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
    return canonicalMatch ? canonicalMatch[1] : undefined;
  }

  /**
   * Extract title from HTML
   */
  private extractTitle(html: string): string | undefined {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch?.[1]?.trim();
  }

  /**
   * Extract description from HTML
   */
  private extractDescription(html: string): string | undefined {
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    return descMatch?.[1]?.trim();
  }

  /**
   * Extract language from HTML
   */
  private extractLanguage(html: string): string {
    const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["'][^>]*>/i);
    return langMatch?.[1] || 'en';
  }

  /**
   * Get crawler statistics
   */
  getCrawlerStats(): CrawlerStatistics {
    const activeSessions = this.activeSessions.size;
    const completedSessions = Array.from(this.activeSessions.values())
      .filter(s => s.isCompleted()).length;

    return {
      activeSessions,
      completedSessions,
      totalSessions: this.activeSessions.size,
      cacheStats: {
        robotsCache: 0, // Would need to expose from RobotsChecker
        sitemapCache: 0,
        contentCache: 0
      }
    };
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.robotsChecker.clearCache();
    logger.info('Crawler caches cleared');
  }

  /**
   * Clean up completed sessions
   */
  cleanupSessions(maxAge: number = 24 * 60 * 60 * 1000): number {
    let cleaned = 0;
    const cutoffTime = Date.now() - maxAge;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.isCompleted() && session.startedAt.getTime() < cutoffTime) {
        this.activeSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up completed sessions', { cleaned });
    }

    return cleaned;
  }

  /**
   * Generate site contract from crawled content
   */
  private async generateSiteContract(
    request: CrawlRequest,
    extractedContent: ExtractedPageContent[]
  ): Promise<any> {
    try {
      // Convert extracted content to page definitions
      const pages = extractedContent.map((content, index) => ({
        id: `page_${index}`,
        path: new URL(content.url).pathname,
        title: content.title || 'Untitled Page',
        description: content.description,
        lastModified: content.extractedAt,
        components: this.extractComponents(content),
        meta: {
          canonical: content.canonicalUrl !== content.url ? content.canonicalUrl : undefined,
          robots: 'index,follow' // Default, could be extracted from content
        },
        navigation: {
          nextPage: this.findNextPage(content, extractedContent)
        }
      }));

      // Create site contract request
      const _contractRequest = {
        siteId: request.siteId,
        tenantId: request.tenantId,
        domain: new URL(request.baseUrl).hostname,
        pages,
        siteConfig: {
          title: pages[0]?.title || 'Generated Site',
          language: extractedContent[0]?.language || 'en'
        },
        buildMetadata: {
          buildTime: new Date(),
          version: '1.0.0',
          crawledUrls: extractedContent.length
        }
      };

      // TODO: Implement proper site contract generation using SiteContractService
      void _contractRequest; // Will be used for proper site contract generation
      // This requires creating a proper Site entity from the extracted content
      const contract = {
        id: `contract-${request.siteId}`,
        siteId: request.siteId,
        tenantId: request.tenantId,
        pages,
        actions: [],
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Initialize action dispatch for the site
      const actionDispatchService = await getActionDispatchService();
      await actionDispatchService.initializeDispatch({
        siteId: request.siteId,
        tenantId: request.tenantId,
        allowedOrigins: [request.baseUrl, 'https://*.sitespeak.com'],
        securitySettings: {
          requireOriginValidation: true,
          allowCrossTenant: false,
          maxActionsPerMinute: 30,
          riskLevelThresholds: {
            low: 100,
            medium: 20,
            high: 5
          }
        }
      });

      return contract;

    } catch (error) {
      logger.error('Site contract generation failed', {
        siteId: request.siteId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Extract components from page content
   */
  private extractComponents(content: ExtractedPageContent): any[] {
    const components = [];

    // Create components based on extracted content
    if (content.forms?.length > 0) {
      content.forms.forEach((form, index) => {
        components.push({
          id: `form_${index}`,
          type: 'form',
          config: {
            fields: form.fields || [],
            action: form.action,
            method: form.method
          },
          actions: [{
            id: `submit_${index}`,
            name: `submit_form_${index}`,
            description: `Submit form ${index + 1}`,
            type: 'form',
            selector: form.selector || `form:nth-of-type(${index + 1})`
          }]
        });
      });
    }

    if (content.actions?.length > 0) {
      content.actions.forEach((action, index) => {
        components.push({
          id: `action_${index}`,
          type: 'interactive',
          config: {
            actionType: action.type,
            selector: action.selector
          },
          actions: [{
            id: action.id || `action_${index}`,
            name: action.name,
            description: action.description,
            type: action.type,
            selector: action.selector
          }]
        });
      });
    }

    // Add default content component
    components.push({
      id: 'content_main',
      type: 'content',
      config: {
        content: content.content?.substring(0, 500) + '...' || 'Main content'
      }
    });

    return components;
  }

  /**
   * Find next page for navigation hints
   */
  private findNextPage(
    currentContent: ExtractedPageContent,
    allContent: ExtractedPageContent[]
  ): string | undefined {
    // Simple heuristic: find next page in same domain
    const currentUrl = new URL(currentContent.url);
    const nextPage = allContent.find(content => {
      const url = new URL(content.url);
      return url.hostname === currentUrl.hostname && 
             url.pathname !== currentUrl.pathname;
    });

    return nextPage ? new URL(nextPage.url).pathname : undefined;
  }
}

/**
 * Crawl request
 */
export interface CrawlRequest {
  siteId: string;
  tenantId: string;
  knowledgeBaseId: string;
  baseUrl: string;
  sessionType: SessionType;
  lastCrawlInfo?: any; // LastCrawlInfo from DeltaDetectionService
  options?: any; // CrawlOptions
}

/**
 * URL to crawl
 */
export interface UrlToCrawl {
  loc: string;
  sitemapLastmod?: Date;
  priority?: number;
  changefreq?: string;
  source: 'sitemap' | 'manual' | 'fallback';
  storedInfo?: any; // StoredPageInfo
}

/**
 * Crawl session result
 */
export interface CrawlSessionResult {
  sessionId: string;
  status: string;
  processedUrls: number;
  failedUrls: number;
  extractedContent: ExtractedPageContent[];
  statistics: any; // SessionStatistics
}

/**
 * Crawl pipeline result
 */
export interface CrawlPipelineResult {
  processedUrls: number;
  failedUrls: number;
  extractedContent: ExtractedPageContent[];
}

/**
 * Extracted page content
 */
export interface ExtractedPageContent {
  url: string;
  canonicalUrl: string;
  content: string;
  contentHash: string;
  title?: string;
  description?: string;
  language: string;
  lastModified?: Date;
  entities: any[]; // ExtractedEntity[]
  actions: any[]; // ExtractedAction[]
  forms: any[]; // ExtractedForm[]
  extractedAt: Date;
  processingMeta: ProcessingMetadata;
}

/**
 * Processing metadata
 */
export interface ProcessingMetadata {
  fetchStatus: string;
  contentLength: number;
  processingTime: number;
  extractorVersions: {
    jsonLd: string;
    actions: string;
    forms: string;
  };
}

/**
 * Crawler statistics
 */
export interface CrawlerStatistics {
  activeSessions: number;
  completedSessions: number;
  totalSessions: number;
  cacheStats: {
    robotsCache: number;
    sitemapCache: number;
    contentCache: number;
  };
}

/**
 * Factory function and singleton instance
 */
export function createCrawlOrchestrator(): CrawlOrchestrator {
  return new CrawlOrchestrator();
}

// Export singleton instance for easy import
export const crawlOrchestrator = createCrawlOrchestrator();