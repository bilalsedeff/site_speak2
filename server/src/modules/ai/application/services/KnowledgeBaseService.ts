import { createLogger } from '../../../../shared/utils.js';
import { embeddingService } from './EmbeddingService';
import { webCrawlerService, type CrawlOptions } from './WebCrawlerService.js';
import { KnowledgeBaseRepository } from '../../../../domain/repositories/KnowledgeBaseRepository';
import type { 
  KnowledgeChunk
} from '../../domain/entities/KnowledgeBase';

const logger = createLogger({ service: 'knowledge-base' });

export interface CrawlRequest {
  knowledgeBaseId: string;
  baseUrl: string;
  settings: {
    crawlDepth: number;
    crawlDelay: number;
    excludePatterns: string[];
    includePatterns: string[];
    maxChunkSize: number;
    chunkOverlap: number;
  };
}

export interface CrawlResult {
  success: boolean;
  totalUrls: number;
  processedUrls: number;
  failedUrls: number;
  chunks: KnowledgeChunk[];
  errors: string[];
}

export interface SearchRequest {
  query: string;
  knowledgeBaseId: string;
  topK: number;
  threshold?: number;
  filters?: {
    contentType?: string[];
    url?: string;
    section?: string;
  };
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
  relevantContent: string;
}

export interface IndexingProgress {
  status: 'idle' | 'crawling' | 'processing' | 'indexing' | 'completed' | 'error';
  progress: number;
  message: string;
  processedUrls: number;
  totalUrls: number;
  currentUrl?: string;
}

/**
 * Service for managing knowledge bases and search functionality
 */
export class KnowledgeBaseService {
  constructor(private readonly knowledgeBaseRepository: KnowledgeBaseRepository) {}

  /**
   * Search knowledge base using semantic similarity
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    try {
      logger.debug('Searching knowledge base', {
        knowledgeBaseId: request.knowledgeBaseId,
        query: request.query.substring(0, 100),
        topK: request.topK,
        threshold: request.threshold,
      });

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);

      // Get knowledge base chunks from repository using vector search
      const searchResults = await this.knowledgeBaseRepository.searchChunks({
        knowledgeBaseId: request.knowledgeBaseId,
        embedding: queryEmbedding,
        topK: request.topK,
        threshold: request.threshold || 0.7,
        filters: {
          ...(request.filters?.contentType && { contentType: request.filters.contentType }),
          ...(request.filters?.url && { url: request.filters.url }),
        },
      });

      // Convert to similarity results format
      const similarityResults = searchResults.map(result => ({
        score: result.score,
        id: result.chunk.id,
        metadata: {
          chunk: result.chunk,
          url: result.chunk.metadata.url,
          title: result.chunk.metadata.title,
          contentType: result.chunk.metadata.contentType,
        },
      }));

      // Format results (filtering is already done by repository)
      const formattedResults: SearchResult[] = similarityResults.map(result => {
        const chunk = result.metadata?.['chunk'] as KnowledgeChunk;
        const relevantContent = this.extractRelevantContent(chunk.content, request.query);

        return {
          chunk,
          score: result.score,
          relevantContent,
        };
      });

      logger.info('Knowledge base search completed', {
        knowledgeBaseId: request.knowledgeBaseId,
        resultsCount: formattedResults.length,
        topScore: formattedResults[0]?.score,
      });

      return formattedResults;
    } catch (error) {
      logger.error('Knowledge base search failed', {
        error,
        knowledgeBaseId: request.knowledgeBaseId,
        query: request.query.substring(0, 50),
      });
      throw error;
    }
  }

  /**
   * Start comprehensive site crawling and indexing
   */
  async startSiteCrawling(request: {
    knowledgeBaseId: string;
    siteId: string;
    tenantId: string;
    baseUrl: string;
    options?: Partial<CrawlOptions>;
  }): Promise<string> {
    try {
      logger.info('Starting site crawling', {
        knowledgeBaseId: request.knowledgeBaseId,
        siteId: request.siteId,
        baseUrl: request.baseUrl,
      });

      const crawlOptions: CrawlOptions = {
        maxDepth: 3,
        maxPages: 100,
        timeoutMs: 30000,
        concurrency: 2,
        allowJsRendering: true,
        blockResources: ['image', 'font', 'media', 'analytics'],
        respectRobots: true,
        useConditionalRequests: true,
        userAgent: 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)',
        ...request.options
      };

      const webCrawlerServiceInstance = webCrawlerService.getInstance(this);
      const sessionId = await webCrawlerServiceInstance.startCrawl({
        url: request.baseUrl,
        siteId: request.siteId,
        tenantId: request.tenantId,
        options: crawlOptions
      });

      logger.info('Site crawling session started', {
        knowledgeBaseId: request.knowledgeBaseId,
        sessionId,
      });

      return sessionId;
    } catch (error) {
      logger.error('Failed to start site crawling', {
        error,
        knowledgeBaseId: request.knowledgeBaseId,
        siteId: request.siteId,
      });
      throw error;
    }
  }

  /**
   * Start crawling and indexing a knowledge base (legacy method)
   */
  async startIndexing(knowledgeBaseId: string): Promise<void> {
    try {
      logger.info('Starting knowledge base indexing', {
        knowledgeBaseId,
      });

      // TODO: Get knowledge base from repository
      // TODO: Start background crawling job
      // For now, just log the operation

      logger.info('Knowledge base indexing started', {
        knowledgeBaseId,
      });
    } catch (error) {
      logger.error('Failed to start knowledge base indexing', {
        error,
        knowledgeBaseId,
      });
      throw error;
    }
  }

  /**
   * Get crawling/indexing progress by session ID
   */
  async getCrawlingProgress(sessionId: string): Promise<IndexingProgress> {
    try {
      const webCrawlerServiceInstance = webCrawlerService.getInstance(this);
      const crawlSession = webCrawlerServiceInstance.getCrawlStatus(sessionId);
      
      if (!crawlSession) {
        return {
          status: 'error',
          progress: 0,
          message: 'Crawl session not found',
          processedUrls: 0,
          totalUrls: 0,
        };
      }

      const progress = crawlSession.progress.discovered > 0 
        ? Math.round((crawlSession.progress.processed / crawlSession.progress.discovered) * 100)
        : 0;

      const statusMap: Record<string, IndexingProgress['status']> = {
        'initializing': 'crawling',
        'crawling': 'crawling',
        'processing': 'indexing',
        'completed': 'completed',
        'failed': 'error'
      };

      return {
        status: statusMap[crawlSession.status] || 'idle',
        progress,
        message: `${crawlSession.status}: ${crawlSession.progress.processed}/${crawlSession.progress.discovered} pages processed`,
        processedUrls: crawlSession.progress.processed,
        totalUrls: crawlSession.progress.discovered,
      };
    } catch (error) {
      logger.error('Failed to get crawling progress', {
        error,
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Get indexing progress (legacy method)
   */
  async getIndexingProgress(knowledgeBaseId: string): Promise<IndexingProgress> {
    try {
      // Get knowledge base from repository to check status
      const knowledgeBase = await this.knowledgeBaseRepository.findById(knowledgeBaseId);
      
      if (!knowledgeBase) {
        return {
          status: 'error',
          progress: 0,
          message: 'Knowledge base not found',
          processedUrls: 0,
          totalUrls: 0,
        };
      }

      // Get the most recent crawl sessions to determine progress
      const sessions = await this.knowledgeBaseRepository.getCrawlSessions(knowledgeBaseId, {
        limit: 1,
        status: 'running',
      });

      const runningSession = sessions[0];
      
      if (runningSession) {
        const progress = runningSession.pagesDiscovered > 0 
          ? Math.round((runningSession.pagesCrawled / runningSession.pagesDiscovered) * 100)
          : 0;

        return {
          status: 'crawling',
          progress,
          message: `Crawling: ${runningSession.pagesCrawled}/${runningSession.pagesDiscovered} pages processed`,
          processedUrls: runningSession.pagesCrawled,
          totalUrls: runningSession.pagesDiscovered,
        };
      }

      // Map knowledge base status to IndexingProgress status
      const statusMap = {
        'initializing': 'idle' as const,
        'crawling': 'crawling' as const,
        'indexing': 'indexing' as const,
        'ready': 'completed' as const,
        'error': 'error' as const,
        'outdated': 'idle' as const,
      };

      const mappedStatus = statusMap[knowledgeBase.indexingStatus.status as keyof typeof statusMap] || 'idle';
      
      return {
        status: mappedStatus,
        progress: knowledgeBase.indexingStatus.progress || 0,
        message: knowledgeBase.indexingStatus.errorMessage || 'Ready to start indexing',
        processedUrls: knowledgeBase.indexingStatus.processedUrls || 0,
        totalUrls: knowledgeBase.indexingStatus.totalUrls || 0,
      };
    } catch (error) {
      logger.error('Failed to get indexing progress', {
        error,
        knowledgeBaseId,
      });
      throw error;
    }
  }

  /**
   * Process text content into chunks
   */
  async processTextIntoChunks(
    content: string,
    metadata: Omit<KnowledgeChunk['metadata'], 'hash'>,
    settings: {
      maxChunkSize: number;
      chunkOverlap: number;
      embeddingModel: string;
    }
  ): Promise<Omit<KnowledgeChunk, 'id' | 'knowledgeBaseId' | 'createdAt' | 'updatedAt'>[]> {
    try {
      logger.debug('Processing text into chunks', {
        contentLength: content.length,
        maxChunkSize: settings.maxChunkSize,
        chunkOverlap: settings.chunkOverlap,
      });

      // Clean and normalize content
      const cleanedContent = this.cleanTextContent(content);
      
      // Split into chunks
      const textChunks = this.splitTextIntoChunks(
        cleanedContent,
        settings.maxChunkSize,
        settings.chunkOverlap
      );

      // Generate embeddings for all chunks
      const embeddings = await embeddingService.batchGenerateEmbeddings(
        textChunks,
        50, // batch size
        settings.embeddingModel
      );

      // Create chunk objects
      const chunks = textChunks.map((text, index) => ({
        content: text,
        embedding: embeddings[index] || new Array(1536).fill(0),
        metadata: {
          ...metadata,
          hash: this.generateContentHash(text),
        },
      }));

      logger.info('Text processed into chunks successfully', {
        originalLength: content.length,
        chunksCount: chunks.length,
        averageChunkSize: Math.floor(chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length),
      });

      return chunks;
    } catch (error) {
      logger.error('Failed to process text into chunks', {
        error,
        contentLength: content.length,
      });
      throw error;
    }
  }

  /**
   * Update knowledge base chunks
   */
  async updateChunks(knowledgeBaseId: string, newChunks: KnowledgeChunk[]): Promise<void> {
    try {
      logger.info('Updating knowledge base chunks', {
        knowledgeBaseId,
        chunksCount: newChunks.length,
      });

      // Update chunks in repository
      await this.knowledgeBaseRepository.updateChunks(knowledgeBaseId, newChunks);

      // Update knowledge base status to indicate successful indexing
      await this.knowledgeBaseRepository.updateStatus(knowledgeBaseId, {
        status: 'ready',
        lastIndexedAt: new Date(),
        totalChunks: newChunks.length,
      });

      logger.info('Knowledge base chunks updated successfully', {
        knowledgeBaseId,
        chunksCount: newChunks.length,
      });
    } catch (error) {
      logger.error('Failed to update knowledge base chunks', {
        error,
        knowledgeBaseId,
        chunksCount: newChunks.length,
      });
      
      // Mark knowledge base as error state
      await this.knowledgeBaseRepository.updateStatus(knowledgeBaseId, {
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error',
        errorCount: 1,
      }).catch(() => {
        // Ignore errors in error handling
      });

      throw error;
    }
  }

  /**
   * Clean and normalize text content
   */
  private cleanTextContent(content: string): string {
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove HTML tags if present
      .replace(/<[^>]*>/g, ' ')
      // Remove special characters that might interfere with processing
      .replace(/[^\w\s.,!?;:()\-"']/g, ' ')
      // Normalize line breaks
      .replace(/\n+/g, ' ')
      // Trim whitespace
      .trim();
  }

  /**
   * Split text into overlapping chunks
   */
  private splitTextIntoChunks(text: string, maxSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let overlapText = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) {continue;}
      
      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;
      
      if (potentialChunk.length <= maxSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
          
          // Create overlap text from the end of current chunk
          const words = currentChunk.split(' ');
          const overlapWords = Math.min(overlap / 5, words.length); // Approximate words for overlap
          overlapText = words.slice(-overlapWords).join(' ');
        }
        
        currentChunk = overlapText + (overlapText ? '. ' : '') + trimmedSentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }
    
    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Extract relevant content snippet around query terms
   */
  private extractRelevantContent(content: string, query: string, maxLength: number = 200): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    
    // Find the first occurrence of any query term
    let bestIndex = -1;
    for (const term of queryTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
      }
    }
    
    if (bestIndex === -1) {
      // No query terms found, return beginning of content
      return content.length > maxLength 
        ? content.substring(0, maxLength) + '...'
        : content;
    }
    
    // Extract content around the found term
    const start = Math.max(0, bestIndex - maxLength / 2);
    const end = Math.min(content.length, start + maxLength);
    
    let excerpt = content.substring(start, end);
    
    if (start > 0) {excerpt = '...' + excerpt;}
    if (end < content.length) {excerpt = excerpt + '...';}
    
    return excerpt;
  }

  /**
   * Health check for the knowledge base service
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      logger.debug('Performing knowledge base health check');
      
      // Basic service availability check
      // Note: EmbeddingService doesn't have a healthCheck method yet
      const isEmbeddingServiceHealthy = true;
      
      if (!isEmbeddingServiceHealthy) {
        return {
          healthy: false,
          error: 'Embedding service is not healthy'
        };
      }

      // Test basic functionality
      const testEmbedding = await embeddingService.generateEmbedding('health check test');
      
      if (!testEmbedding || testEmbedding.length === 0) {
        return {
          healthy: false,
          error: 'Failed to generate test embedding'
        };
      }

      logger.debug('Knowledge base health check passed');
      return { healthy: true };
    } catch (error) {
      logger.error('Knowledge base health check failed', { error });
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown health check error'
      };
    }
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    // Simple hash function for content deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get knowledge base statistics
   */
  async getStats(knowledgeBaseId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    lastUpdated: Date | null;
    indexSizeMB: number;
    avgSearchLatencyMs: number;
    searchCount24h: number;
    languageDistribution: Record<string, number>;
    contentTypeDistribution: Record<string, number>;
    qualityScoreAvg: number;
  }> {
    try {
      return await this.knowledgeBaseRepository.getStats(knowledgeBaseId);
    } catch (error) {
      logger.error('Failed to get knowledge base stats', { knowledgeBaseId, error });
      throw error;
    }
  }

  /**
   * Get tenant-wide knowledge base statistics
   */
  async getTenantStats(tenantId: string): Promise<{
    totalKnowledgeBases: number;
    totalDocuments: number;
    totalChunks: number;
    totalIndexSizeMB: number;
    avgSearchLatencyMs: number;
    searchCount24h: number;
    knowledgeBasesByStatus: Record<string, number>;
    lastCrawlAt: Date | null;
    lastSuccessfulCrawl: Date | null;
  }> {
    try {
      return await this.knowledgeBaseRepository.getTenantStats(tenantId);
    } catch (error) {
      logger.error('Failed to get tenant stats', { tenantId, error });
      throw error;
    }
  }

  /**
   * Get last crawl information for tenant
   */
  async getLastCrawlInfo(tenantId: string): Promise<{
    lastCrawlAt: Date | null;
    status: 'idle' | 'crawling' | 'indexing' | 'completed' | 'error';
    lastCrawlTime: number | null;
    lastSitemapCheck: Date | null;
    lastSuccessfulCrawl: Date | null;
    errorCount: number;
    lastError: string | null;
  }> {
    try {
      return await this.knowledgeBaseRepository.getLastCrawlInfo(tenantId);
    } catch (error) {
      logger.error('Failed to get last crawl info', { tenantId, error });
      throw error;
    }
  }

  /**
   * Get vector index statistics
   */
  async getIndexStats(knowledgeBaseId: string): Promise<{
    indexSize: number;
    vectorCount: number;
    type: 'HNSW' | 'IVFFlat';
    parameters: Record<string, any> | null;
    healthy: boolean;
    lastOptimized: Date | null;
  }> {
    try {
      return await this.knowledgeBaseRepository.getIndexStats(knowledgeBaseId);
    } catch (error) {
      logger.error('Failed to get index stats', { knowledgeBaseId, error });
      throw error;
    }
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStats(): {
    webCrawler: {
      robotsCache: number;
      etagCache: number;
      activeSessions: number;
    };
  } {
    return {
      webCrawler: webCrawlerService.getInstance().getCacheStats()
    };
  }

  /**
   * Clear all service caches
   */
  clearAllCaches(): void {
    webCrawlerService.getInstance().clearCaches();
    logger.info('All knowledge base service caches cleared');
  }

  /**
   * Validate crawl options
   */
  validateCrawlOptions(options: Partial<CrawlOptions>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (options.maxPages && (options.maxPages < 1 || options.maxPages > 1000)) {
      errors.push('Max pages must be between 1 and 1000');
    }
    
    if (options.maxDepth && (options.maxDepth < 1 || options.maxDepth > 10)) {
      errors.push('Max depth must be between 1 and 10');
    }
    
    if (options.timeoutMs && (options.timeoutMs < 1000 || options.timeoutMs > 60000)) {
      errors.push('Timeout must be between 1000 and 60000 milliseconds');
    }
    
    if (options.concurrency && (options.concurrency < 1 || options.concurrency > 10)) {
      errors.push('Concurrency must be between 1 and 10');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate knowledge base settings
   */
  validateSettings(settings: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (settings.maxChunkSize < 100 || settings.maxChunkSize > 5000) {
      errors.push('Max chunk size must be between 100 and 5000 characters');
    }
    
    if (settings.chunkOverlap < 0 || settings.chunkOverlap >= settings.maxChunkSize) {
      errors.push('Chunk overlap must be between 0 and max chunk size');
    }
    
    if (settings.crawlDepth < 1 || settings.crawlDepth > 10) {
      errors.push('Crawl depth must be between 1 and 10');
    }
    
    if (settings.crawlDelay < 100 || settings.crawlDelay > 10000) {
      errors.push('Crawl delay must be between 100 and 10000 milliseconds');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export factory function for dependency injection
export const createKnowledgeBaseService = (knowledgeBaseRepository: KnowledgeBaseRepository) => {
  return new KnowledgeBaseService(knowledgeBaseRepository);
};

// Export singleton instance (will need to be initialized with repository)
let _knowledgeBaseServiceInstance: KnowledgeBaseService | null = null;

export const knowledgeBaseService = {
  getInstance: (knowledgeBaseRepository?: KnowledgeBaseRepository): KnowledgeBaseService => {
    if (!_knowledgeBaseServiceInstance) {
      if (!knowledgeBaseRepository) {
        throw new Error('KnowledgeBaseRepository is required for first initialization');
      }
      _knowledgeBaseServiceInstance = new KnowledgeBaseService(knowledgeBaseRepository);
    }
    return _knowledgeBaseServiceInstance;
  }
};