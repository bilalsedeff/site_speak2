import { createLogger } from '../../../../shared/utils.js';
import { embeddingService } from './EmbeddingService';
import { webCrawlerService, type CrawlOptions } from './WebCrawlerService.js';
import type { 
  KnowledgeBase, 
  KnowledgeChunk,
  CreateKnowledgeBaseInput,
  UpdateKnowledgeBaseInput,
  getDefaultKnowledgeBaseSettings,
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
  constructor() {}

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

      // TODO: Get knowledge base chunks from repository
      // For now, using mock data
      const mockChunks: KnowledgeChunk[] = [];

      // Prepare embeddings for similarity search
      const embeddingData = mockChunks.map(chunk => ({
        id: chunk.id,
        embedding: chunk.embedding,
        metadata: {
          chunk,
          url: chunk.metadata.url,
          title: chunk.metadata.title,
          contentType: chunk.metadata.contentType,
        },
      }));

      // Perform similarity search
      const similarityResults = await embeddingService.similaritySearch({
        queryEmbedding,
        embeddings: embeddingData,
        topK: request.topK,
        threshold: request.threshold || 0.7,
      });

      // Apply filters if provided
      let filteredResults = similarityResults;
      if (request.filters) {
        filteredResults = similarityResults.filter(result => {
          const chunk = result.metadata?.['chunk'] as KnowledgeChunk;
          if (!chunk) {return false;}

          if (request.filters?.contentType && 
              !request.filters.contentType.includes(chunk.metadata.contentType)) {
            return false;
          }

          if (request.filters?.url && 
              !chunk.metadata.url?.includes(request.filters.url)) {
            return false;
          }

          if (request.filters?.section && 
              !chunk.metadata.section?.includes(request.filters.section)) {
            return false;
          }

          return true;
        });
      }

      // Format results
      const searchResults: SearchResult[] = filteredResults.map(result => {
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
        resultsCount: searchResults.length,
        topScore: searchResults[0]?.score,
      });

      return searchResults;
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

      const sessionId = await webCrawlerService.startCrawl({
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
      const crawlSession = webCrawlerService.getCrawlStatus(sessionId);
      
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
      // TODO: Get actual progress from repository/job queue
      // For now, return mock progress
      const mockProgress: IndexingProgress = {
        status: 'idle',
        progress: 0,
        message: 'Ready to start indexing',
        processedUrls: 0,
        totalUrls: 0,
      };

      return mockProgress;
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
        embedding: embeddings[index],
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

      // TODO: Update chunks in repository
      // This would involve:
      // 1. Clear existing chunks
      // 2. Insert new chunks
      // 3. Update knowledge base metadata

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
   * Get comprehensive service statistics
   */
  getServiceStats(): {
    knowledgeBase: {
      // TODO: Add actual KB stats from repository
    };
    webCrawler: {
      robotsCache: number;
      etagCache: number;
      activeSessions: number;
    };
  } {
    return {
      knowledgeBase: {
        // TODO: Implement when repository is connected
      },
      webCrawler: webCrawlerService.getCacheStats()
    };
  }

  /**
   * Clear all service caches
   */
  clearAllCaches(): void {
    webCrawlerService.clearCaches();
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

// Export singleton instance
export const knowledgeBaseService = new KnowledgeBaseService();