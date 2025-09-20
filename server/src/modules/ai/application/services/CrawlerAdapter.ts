/**
 * Crawler Adapter - Bridge between KnowledgeBaseService and CrawlOrchestrator
 *
 * This adapter replaces the WebCrawlerService to eliminate architectural duplication.
 * It provides the same interface that KnowledgeBaseService expects while using
 * the primary CrawlOrchestrator implementation under the hood.
 */

import { createLogger } from '../../../../shared/utils.js';
import { CrawlOrchestrator, type CrawlRequest as OrchestratorCrawlRequest, type CrawlSessionResult } from '../../infrastructure/crawling/CrawlOrchestrator.js';
import type { KnowledgeBaseService } from './KnowledgeBaseService.js';

const logger = createLogger({ service: 'crawler-adapter' });

// Re-export interfaces from WebCrawlerService for backward compatibility
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
 * Crawler Adapter Implementation
 */
export class CrawlerAdapter {
  private orchestrator: CrawlOrchestrator;
  private sessionMapping = new Map<string, string>(); // sessionId -> orchestratorSessionId

  constructor(_knowledgeBaseService: KnowledgeBaseService) {
    this.orchestrator = new CrawlOrchestrator();
  }

  /**
   * Start a new crawling session
   */
  async startCrawl(request: CrawlRequest): Promise<string> {
    try {
      logger.info('Starting crawl via adapter', {
        url: request.url,
        siteId: request.siteId,
        tenantId: request.tenantId
      });

      // Convert WebCrawlerService request to CrawlOrchestrator request
      const orchestratorRequest: OrchestratorCrawlRequest = {
        siteId: request.siteId,
        tenantId: request.tenantId,
        knowledgeBaseId: `kb_${request.siteId}`, // Generate KB ID
        baseUrl: request.url,
        sessionType: 'full', // Default to full crawl
        options: {
          maxPages: request.options.maxPages,
          maxDepth: request.options.maxDepth,
          timeoutMs: request.options.timeoutMs,
          respectRobots: request.options.respectRobots,
          useConditionalRequests: request.options.useConditionalRequests,
          userAgent: request.options.userAgent || 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)',
          headers: request.options.headers || {}
        }
      };

      const result: CrawlSessionResult = await this.orchestrator.startCrawl(orchestratorRequest);

      // Store mapping for status tracking
      this.sessionMapping.set(result.sessionId, result.sessionId);

      logger.info('Crawl session started via adapter', {
        sessionId: result.sessionId,
        siteId: request.siteId
      });

      return result.sessionId;
    } catch (error) {
      logger.error('Failed to start crawl via adapter', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        siteId: request.siteId
      });
      throw error;
    }
  }

  /**
   * Get crawl session status
   */
  getCrawlStatus(sessionId: string): CrawlSession | null {
    try {
      const orchestratorSessionId = this.sessionMapping.get(sessionId) || sessionId;
      const orchestratorSession = this.orchestrator.getCrawlStatus(orchestratorSessionId);

      if (!orchestratorSession) {
        return null;
      }

      // Convert CrawlOrchestrator session to WebCrawlerService format
      const adaptedSession: CrawlSession = {
        sessionId: sessionId,
        siteId: orchestratorSession.siteId,
        tenantId: orchestratorSession.tenantId,
        startedAt: orchestratorSession.startedAt,
        status: this.convertStatus(orchestratorSession.status),
        progress: {
          discovered: orchestratorSession.progress.totalUrls,
          processed: orchestratorSession.progress.processedUrls,
          failed: orchestratorSession.progress.failedUrls,
          skipped: orchestratorSession.progress.skippedUrls
        },
        options: {
          maxDepth: orchestratorSession.configuration.maxDepth,
          maxPages: orchestratorSession.configuration.maxPages,
          timeoutMs: 30000, // Default since not in configuration
          concurrency: orchestratorSession.configuration.concurrency,
          allowJsRendering: false, // Default since not in configuration
          blockResources: ['image', 'font', 'media'], // Default
          respectRobots: orchestratorSession.configuration.respectRobots,
          useConditionalRequests: true // Default
        }
      };

      return adaptedSession;
    } catch (error) {
      logger.error('Failed to get crawl status', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { robotsCache: number; etagCache: number; activeSessions: number } {
    try {
      const stats = this.orchestrator.getCrawlerStats();
      return {
        robotsCache: stats.cacheStats.robotsCache,
        etagCache: stats.cacheStats.contentCache,
        activeSessions: stats.activeSessions
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        robotsCache: 0,
        etagCache: 0,
        activeSessions: 0
      };
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    try {
      this.orchestrator.clearCaches();
      this.sessionMapping.clear();
      logger.info('Crawler adapter caches cleared');
    } catch (error) {
      logger.error('Failed to clear caches', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Convert orchestrator status to WebCrawlerService status
   */
  private convertStatus(orchestratorStatus: string): CrawlSession['status'] {
    const statusMap: Record<string, CrawlSession['status']> = {
      'initializing': 'initializing',
      'crawling': 'crawling',
      'processing': 'processing',
      'completed': 'completed',
      'failed': 'failed'
    };

    return statusMap[orchestratorStatus] || 'failed';
  }
}

// Singleton pattern for backward compatibility
let _crawlerAdapterInstance: CrawlerAdapter | null = null;

export const crawlerAdapter = {
  getInstance: (knowledgeBaseService?: KnowledgeBaseService): CrawlerAdapter => {
    if (!_crawlerAdapterInstance) {
      if (!knowledgeBaseService) {
        throw new Error('KnowledgeBaseService required for first crawler adapter initialization');
      }
      _crawlerAdapterInstance = new CrawlerAdapter(knowledgeBaseService);
    }
    return _crawlerAdapterInstance;
  }
};

// Factory function for creating new instances
export const createCrawlerAdapter = (knowledgeBaseService: KnowledgeBaseService) => {
  return new CrawlerAdapter(knowledgeBaseService);
};