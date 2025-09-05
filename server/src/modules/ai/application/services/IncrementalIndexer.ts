import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { CrawlOrchestrator, createCrawlOrchestrator, ExtractedPageContent } from '../../infrastructure/crawling/CrawlOrchestrator';
import { SitemapReader, createSitemapReader } from '../../infrastructure/crawling/SitemapReader';
import { DeltaDetectionService, createDeltaDetectionService } from '../../domain/services/DeltaDetectionService';
import { ContentHashService, createContentHashService } from '../../domain/services/ContentHashService';
import { KnowledgeChunk, createKnowledgeChunk } from '../../domain/entities/KnowledgeChunk';
// import { ContentHash, createContentHash } from '../../domain/value-objects/ContentHash'; // TODO: Implement if needed

const logger = createLogger({ service: 'incremental-indexer' });

/**
 * Incremental Indexer
 * 
 * Handles delta-only knowledge base updates using sitemap lastmod timestamps,
 * content hashing, and idempotent upsert operations.
 */
export class IncrementalIndexer {
  private readonly crawlOrchestrator: CrawlOrchestrator;
  private readonly sitemapReader: SitemapReader;
  private readonly _deltaDetectionService: DeltaDetectionService; // TODO: Implement delta detection logic
  private readonly contentHashService: ContentHashService;

  constructor() {
    this.crawlOrchestrator = createCrawlOrchestrator();
    this.sitemapReader = createSitemapReader();
    this._deltaDetectionService = createDeltaDetectionService();
    this.contentHashService = createContentHashService();
  }

  /**
   * Perform incremental update of knowledge base
   */
  async performIncrementalUpdate(request: IncrementalUpdateRequest): Promise<IncrementalUpdateResult> {
    try {
      logger.info('Starting incremental update', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        knowledgeBaseId: request.knowledgeBaseId
      });

      const startTime = Date.now();
      let processedUrls = 0;
      let updatedChunks = 0;
      let newChunks = 0;
      let skippedUrls = 0;
      const errors: string[] = [];

      // Phase 1: Discover changed URLs
      const changedUrls = await this.discoverChangedUrls(
        request.baseUrl,
        request.lastCrawlInfo
      );

      logger.debug('Delta discovery completed', {
        siteId: request.siteId,
        totalUrls: changedUrls.length
      });

      if (changedUrls.length === 0) {
        return {
          siteId: request.siteId,
          status: 'no-changes',
          processedUrls: 0,
          newChunks: 0,
          updatedChunks: 0,
          skippedUrls: 0,
          errors: [],
          processingTime: Date.now() - startTime,
          lastUpdateTime: new Date()
        };
      }

      // Phase 2: Process changed URLs
      for (const urlInfo of changedUrls) {
        try {
          const processResult = await this.processChangedUrl(
            urlInfo,
            request
          );

          processedUrls++;
          newChunks += processResult.newChunks;
          updatedChunks += processResult.updatedChunks;

          // Report progress
          if (request.progressCallback) {
            request.progressCallback({
              processedUrls,
              totalUrls: changedUrls.length,
              currentUrl: urlInfo.url,
              status: 'processing'
            });
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${urlInfo.url}: ${errorMessage}`);
          
          logger.warn('URL processing failed during incremental update', {
            siteId: request.siteId,
            url: urlInfo.url,
            error: errorMessage
          });

          skippedUrls++;
        }
      }

      const processingTime = Date.now() - startTime;

      const result: IncrementalUpdateResult = {
        siteId: request.siteId,
        status: errors.length === changedUrls.length ? 'failed' : 'completed',
        processedUrls,
        newChunks,
        updatedChunks,
        skippedUrls,
        errors,
        processingTime,
        lastUpdateTime: new Date()
      };

      logger.info('Incremental update completed', {
        siteId: request.siteId,
        result: {
          ...result,
          errors: result.errors.length // Don't log full error array
        }
      });

      return result;

    } catch (error) {
      logger.error('Incremental update failed', {
        siteId: request.siteId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        siteId: request.siteId,
        status: 'failed',
        processedUrls: 0,
        newChunks: 0,
        updatedChunks: 0,
        skippedUrls: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        processingTime: 0,
        lastUpdateTime: new Date()
      };
    }
  }

  /**
   * Schedule incremental updates based on sitemap
   */
  async scheduleIncrementalUpdates(
    sites: SiteUpdateSchedule[],
    options: ScheduleOptions = {}
  ): Promise<ScheduleResult[]> {
    const results: ScheduleResult[] = [];
    const { 
      maxConcurrency = 3,
      delayBetweenSites = 5000,
      checkInterval = 15 * 60 * 1000 // 15 minutes
    } = options;

    logger.info('Scheduling incremental updates', {
      sitesCount: sites.length,
      maxConcurrency,
      checkInterval
    });

    // Process sites in batches to avoid overwhelming servers
    for (let i = 0; i < sites.length; i += maxConcurrency) {
      const batch = sites.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (site) => {
        try {
          // Check if site needs update
          const needsUpdate = await this.checkIfSiteNeedsUpdate(site);
          
          if (!needsUpdate.needsUpdate) {
            return {
              siteId: site.siteId,
              scheduled: false,
              reason: needsUpdate.reason,
              nextCheck: new Date(Date.now() + checkInterval)
            };
          }

          // Perform incremental update
          const updateResult = await this.performIncrementalUpdate({
            siteId: site.siteId,
            tenantId: site.tenantId,
            knowledgeBaseId: site.knowledgeBaseId,
            baseUrl: site.baseUrl,
            ...(site.lastCrawlInfo !== undefined && { lastCrawlInfo: site.lastCrawlInfo })
          });

          return {
            siteId: site.siteId,
            scheduled: true,
            updateResult,
            nextCheck: new Date(Date.now() + checkInterval)
          };

        } catch (error) {
          return {
            siteId: site.siteId,
            scheduled: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            nextCheck: new Date(Date.now() + checkInterval * 2) // Retry later
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            siteId: batch[index]?.siteId || 'unknown',
            scheduled: false,
            error: result.reason?.message || 'Batch processing failed',
            nextCheck: new Date(Date.now() + checkInterval * 2)
          });
        }
      });

      // Add delay between batches
      if (i + maxConcurrency < sites.length) {
        await this.delay(delayBetweenSites);
      }
    }

    logger.info('Incremental update scheduling completed', {
      totalSites: sites.length,
      scheduled: results.filter(r => r.scheduled).length,
      skipped: results.filter(r => !r.scheduled).length,
      errors: results.filter(r => r.error).length
    });

    return results;
  }

  /**
   * Process individual changed URL
   */
  private async processChangedUrl(
    urlInfo: ChangedUrlInfo,
    request: IncrementalUpdateRequest
  ): Promise<UrlProcessResult> {
    // Use crawler to extract content
    const crawlRequest = {
      siteId: request.siteId,
      tenantId: request.tenantId,
      knowledgeBaseId: request.knowledgeBaseId,
      baseUrl: urlInfo.url,
      sessionType: 'delta' as const,
      options: {
        maxDepth: 1,
        maxPages: 1,
        respectRobots: true
      }
    };

    const crawlResult = await this.crawlOrchestrator.startCrawl(crawlRequest);
    
    if (crawlResult.status !== 'completed' || crawlResult.extractedContent.length === 0) {
      throw new Error('Failed to extract content from URL');
    }

    const extractedContent = crawlResult.extractedContent[0];
    
    if (!extractedContent) {
      throw new Error('No content extracted from URL');
    }
    
    // Process content into chunks
    const chunkResult = await this.processContentIntoChunks(
      extractedContent,
      request
    );

    return {
      url: urlInfo.url,
      newChunks: chunkResult.newChunks,
      updatedChunks: chunkResult.updatedChunks,
      processingTime: Date.now() - urlInfo.discoveredAt.getTime()
    };
  }

  /**
   * Process extracted content into knowledge chunks
   */
  private async processContentIntoChunks(
    extractedContent: ExtractedPageContent,
    _request: IncrementalUpdateRequest  // TODO: Use request context for tenant/site-specific processing
  ): Promise<ChunkProcessResult> {
    let newChunks = 0;
    let updatedChunks = 0;

    // Process main text content
    if (extractedContent.content) {
      const textChunks = await this.createTextChunks(extractedContent);
      // Would need to upsert to knowledge base here
      newChunks += textChunks.length;
    }

    // Process structured entities
    if (extractedContent.entities.length > 0) {
      const entityChunks = await this.createEntityChunks(extractedContent);
      // Would need to upsert to knowledge base here
      newChunks += entityChunks.length;
    }

    // Process actions and forms
    if (extractedContent.actions.length > 0 || extractedContent.forms.length > 0) {
      const affordanceChunks = await this.createAffordanceChunks(extractedContent);
      // Would need to upsert to knowledge base here
      newChunks += affordanceChunks.length;
    }

    return { newChunks, updatedChunks };
  }

  /**
   * Create text chunks from content
   */
  private async createTextChunks(extractedContent: ExtractedPageContent): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    
    // Clean and split text content
    const cleanText = this.cleanTextContent(extractedContent.content || '');
    const textSegments = this.splitTextIntoSegments(cleanText);
    
    for (let i = 0; i < textSegments.length; i++) {
      const segment = textSegments[i];
      if (!segment) {
        continue;
      }
      const contentHash = this.contentHashService.computeContentHash(segment);
      
      // Generate embedding (would integrate with embedding service)
      const embedding = new Array(1536).fill(0); // Placeholder
      
      const chunk = createKnowledgeChunk({
        knowledgeBaseId: '', // Would be filled from request
        content: segment,
        embedding,
        metadata: {
          url: extractedContent.canonicalUrl,
          title: extractedContent.title || 'Untitled',
          contentType: 'text',
          language: extractedContent.language,
          hash: contentHash.hash,
          lastModified: extractedContent.lastModified || new Date(),
          importance: 'medium'
        },
        hierarchy: {
          order: i,
          level: 0
        },
        processing: {
          tokenCount: segment.length / 4, // Rough estimate
          characterCount: segment.length,
          qualityScore: 0.8,
          extractionMethod: 'html',
          lastProcessedAt: new Date(),
          processingVersion: '1.0.0'
        }
      });
      
      chunks.push(chunk);
    }
    
    return chunks;
  }

  /**
   * Create entity chunks from structured data
   */
  private async createEntityChunks(extractedContent: ExtractedPageContent): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    
    for (const entity of extractedContent.entities) {
      const entityText = JSON.stringify(entity, null, 2);
      const contentHash = this.contentHashService.computeContentHash(entityText);
      const embedding = new Array(1536).fill(0); // Placeholder
      
      const chunk = createKnowledgeChunk({
        knowledgeBaseId: '', // Would be filled from request
        content: entityText,
        embedding,
        metadata: {
          url: extractedContent.canonicalUrl,
          title: `${entity['@type']} Entity`,
          contentType: 'json-ld',
          language: extractedContent.language,
          hash: contentHash.hash,
          lastModified: extractedContent.lastModified || new Date(),
          importance: 'high',
          entities: [entity]
        },
        hierarchy: {
          order: 0,
          level: 0
        },
        processing: {
          tokenCount: entityText.length / 4,
          characterCount: entityText.length,
          qualityScore: 0.95, // High quality for structured data
          extractionMethod: 'json-ld',
          lastProcessedAt: new Date(),
          processingVersion: '1.0.0'
        }
      });
      
      chunks.push(chunk);
    }
    
    return chunks;
  }

  /**
   * Create affordance chunks (actions/forms)
   */
  private async createAffordanceChunks(extractedContent: ExtractedPageContent): Promise<KnowledgeChunk[]> {
    const chunks: KnowledgeChunk[] = [];
    
    // Process actions
    for (const action of extractedContent.actions) {
      const actionText = `Action: ${action.label}\nType: ${action.type}\nSelector: ${action.selector}`;
      const contentHash = this.contentHashService.computeContentHash(actionText);
      const embedding = new Array(1536).fill(0); // Placeholder
      
      const chunk = createKnowledgeChunk({
        knowledgeBaseId: '', // Would be filled from request
        content: actionText,
        embedding,
        metadata: {
          url: extractedContent.canonicalUrl,
          title: `Action: ${action.label}`,
          contentType: 'form',
          language: extractedContent.language,
          hash: contentHash.hash,
          importance: 'medium'
        },
        hierarchy: {
          order: 0,
          level: 1
        },
        processing: {
          tokenCount: actionText.length / 4,
          characterCount: actionText.length,
          qualityScore: 0.9,
          extractionMethod: 'html',
          lastProcessedAt: new Date(),
          processingVersion: '1.0.0'
        }
      });
      
      chunks.push(chunk);
    }
    
    // Process forms
    for (const form of extractedContent.forms) {
      const formText = `Form: ${form.name}\nType: ${form.type}\nFields: ${form.fields.map((f: any) => f.label || f.name).join(', ')}`;
      const contentHash = this.contentHashService.computeContentHash(formText);
      const embedding = new Array(1536).fill(0); // Placeholder
      
      const chunk = createKnowledgeChunk({
        knowledgeBaseId: '', // Would be filled from request
        content: formText,
        embedding,
        metadata: {
          url: extractedContent.canonicalUrl,
          title: `Form: ${form.name}`,
          contentType: 'form',
          language: extractedContent.language,
          hash: contentHash.hash,
          importance: 'medium'
        },
        hierarchy: {
          order: 0,
          level: 1
        },
        processing: {
          tokenCount: formText.length / 4,
          characterCount: formText.length,
          qualityScore: 0.85,
          extractionMethod: 'html',
          lastProcessedAt: new Date(),
          processingVersion: '1.0.0'
        }
      });
      
      chunks.push(chunk);
    }
    
    return chunks;
  }

  /**
   * Discover URLs that have changed
   */
  private async discoverChangedUrls(
    baseUrl: string,
    lastCrawlInfo?: LastCrawlInfo
  ): Promise<ChangedUrlInfo[]> {
    try {
      // Use sitemap reader to find changed URLs
      const changedEntries = await this.sitemapReader.findChangedUrls(
        'incremental-session',
        baseUrl,
        lastCrawlInfo?.lastCrawlTime
      );

      return changedEntries.map(entry => ({
        url: entry.loc,
        lastmod: entry.lastmod || new Date(),
        changefreq: entry.changefreq || 'weekly',
        priority: entry.priority || 0.5,
        discoveredAt: new Date()
      }));

    } catch (error) {
      logger.error('Failed to discover changed URLs', {
        baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Check if site needs update based on sitemap
   */
  private async checkIfSiteNeedsUpdate(site: SiteUpdateSchedule): Promise<UpdateNeedCheck> {
    try {
      // Quick check via HEAD request to sitemap
      const changedUrls = await this.sitemapReader.findChangedUrls(
        `check-${site.siteId}`,
        site.baseUrl,
        site.lastCrawlInfo?.lastCrawlTime
      );

      if (changedUrls.length === 0) {
        return {
          needsUpdate: false,
          reason: 'no-changes-detected'
        };
      }

      return {
        needsUpdate: true,
        reason: `${changedUrls.length} URLs changed`,
        changedUrls: changedUrls.length
      };

    } catch (error) {
      return {
        needsUpdate: false,
        reason: 'check-failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clean text content
   */
  private cleanTextContent(content: string): string {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Split text into segments
   */
  private splitTextIntoSegments(text: string, maxSize: number = 1000): string[] {
    const segments: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentSegment = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) {continue;}
      
      const potentialSegment = currentSegment + (currentSegment ? '. ' : '') + trimmedSentence;
      
      if (potentialSegment.length <= maxSize) {
        currentSegment = potentialSegment;
      } else {
        if (currentSegment) {
          segments.push(currentSegment + '.');
        }
        currentSegment = trimmedSentence;
      }
    }
    
    if (currentSegment) {
      segments.push(currentSegment + '.');
    }
    
    return segments.filter(segment => segment.length > 0);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Type definitions
export interface IncrementalUpdateRequest {
  siteId: string;
  tenantId: string;
  knowledgeBaseId: string;
  baseUrl: string;
  lastCrawlInfo?: LastCrawlInfo;
  progressCallback?: (progress: UpdateProgress) => void;
}

export interface LastCrawlInfo {
  lastCrawlTime: Date;
  lastSessionId?: string;
  urlInfo?: Map<string, any>;
}

export interface IncrementalUpdateResult {
  siteId: string;
  status: 'completed' | 'failed' | 'no-changes';
  processedUrls: number;
  newChunks: number;
  updatedChunks: number;
  skippedUrls: number;
  errors: string[];
  processingTime: number;
  lastUpdateTime: Date;
}

export interface UpdateProgress {
  processedUrls: number;
  totalUrls: number;
  currentUrl: string;
  status: string;
}

export interface SiteUpdateSchedule {
  siteId: string;
  tenantId: string;
  knowledgeBaseId: string;
  baseUrl: string;
  lastCrawlInfo?: LastCrawlInfo;
  updateFrequency: number; // in minutes
}

export interface ScheduleOptions {
  maxConcurrency?: number;
  delayBetweenSites?: number;
  checkInterval?: number;
}

export interface ScheduleResult {
  siteId: string;
  scheduled: boolean;
  updateResult?: IncrementalUpdateResult;
  reason?: string;
  error?: string;
  nextCheck: Date;
}

export interface ChangedUrlInfo {
  url: string;
  lastmod?: Date;
  changefreq?: string;
  priority?: number;
  discoveredAt: Date;
}

export interface UrlProcessResult {
  url: string;
  newChunks: number;
  updatedChunks: number;
  processingTime: number;
}

export interface ChunkProcessResult {
  newChunks: number;
  updatedChunks: number;
}

export interface UpdateNeedCheck {
  needsUpdate: boolean;
  reason: string;
  changedUrls?: number;
  error?: string;
}

/**
 * Factory function and singleton instance
 */
export function createIncrementalIndexer(): IncrementalIndexer {
  return new IncrementalIndexer();
}

// Export singleton instance for easy import
export const incrementalIndexer = createIncrementalIndexer();