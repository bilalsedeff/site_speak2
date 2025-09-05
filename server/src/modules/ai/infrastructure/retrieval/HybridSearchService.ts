import { createLogger } from '../../../../shared/utils.js';
import { pgVectorClient, type NNQuery } from '../vector-store/PgVectorClient';
import { embeddingService } from '../../application/services/EmbeddingService';
import { retrievalCache, type CacheKey } from './RetrievalCache';
import { rrfRanker, type RankableItem, type RRFResult } from './RRFRanker';

const logger = createLogger({ service: 'hybrid-search' });

/**
 * Hybrid Search Service
 * 
 * Advanced search combining multiple ranking systems:
 * - Vector similarity search (ANN with HNSW/IVFFlat)
 * - PostgreSQL full-text search with ts_rank
 * - BM25 scoring for term frequency
 * - JSON-LD structured data boosting
 * - Reciprocal Rank Fusion (RRF) for result combination
 * 
 * Features:
 * - Multi-tier caching with SWR semantics
 * - Query expansion and synonym handling
 * - Tenant isolation and security
 * - Performance monitoring and analytics
 * - Fallback strategies and error handling
 */
export class HybridSearchService {
  constructor() {
    logger.info('Hybrid Search Service initialized');
  }

  /**
   * Perform hybrid search combining vector similarity and full-text search
   */
  async search(request: HybridSearchRequest): Promise<HybridSearchResult> {
    const startTime = Date.now();
    
    logger.info('Starting hybrid search', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      query: request.query.substring(0, 100),
      topK: request.topK,
      strategies: request.strategies
    });

    try {
      // Validate request
      this.validateRequest(request);

      // Check cache first
      const cacheResult = await this.checkCache(request);
      if (cacheResult) {
        logger.debug('Cache hit for hybrid search', { 
          tenantId: request.tenantId,
          isStale: cacheResult.isStale 
        });
        
        // Trigger background revalidation if stale
        if (cacheResult.shouldRevalidate) {
          this.revalidateInBackground(request).catch(error => 
            logger.error('Background revalidation failed', { error })
          );
        }
        
        return cacheResult.data!;
      }

      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);

      // Execute search strategies in parallel
      const searchPromises: Promise<SearchStrategyResult>[] = [];
      
      if (request.strategies.includes('vector')) {
        searchPromises.push(this.executeVectorSearch(request, queryEmbedding));
      }
      
      if (request.strategies.includes('fulltext')) {
        searchPromises.push(this.executeFullTextSearch(request));
      }
      
      if (request.strategies.includes('bm25')) {
        searchPromises.push(this.executeBM25Search(request));
      }
      
      if (request.strategies.includes('structured')) {
        searchPromises.push(this.executeStructuredDataSearch(request));
      }

      const strategyResults = await Promise.allSettled(searchPromises);

      // Process strategy results
      const successfulResults: SearchStrategyResult[] = [];
      const failedStrategies: SearchStrategy[] = [];

      strategyResults.forEach((result, index) => {
        const strategyName = request.strategies[index];
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
        } else {
          if (strategyName) {
            failedStrategies.push(strategyName);
          }
          logger.error('Search strategy failed', { 
            strategy: strategyName, 
            error: result.reason 
          });
        }
      });

      // Ensure we have at least one successful strategy
      if (successfulResults.length === 0) {
        throw new Error('All search strategies failed');
      }

      // Combine results using RRF
      const fusedResults = this.fuseSearchResults(successfulResults, request.fusionOptions);

      // Apply post-processing
      const processedResults = await this.postProcessResults(fusedResults, request);

      // Build final result
      const result: HybridSearchResult = {
        items: processedResults,
        totalCount: processedResults.length,
        searchTime: Date.now() - startTime,
        strategies: {
          executed: successfulResults.map(r => r.strategy),
          failed: failedStrategies,
          totalExecuted: successfulResults.length
        },
        fusion: {
          algorithm: 'RRF',
          combinedCount: fusedResults.length,
          averageConsensus: fusedResults.length > 0 
            ? fusedResults.reduce((sum, r) => sum + r.appearsInSystems, 0) / fusedResults.length 
            : 0
        },
        cacheInfo: {
          cached: false,
          ttl: request.cacheOptions?.ttl || 5 * 60 * 1000
        }
      };

      // Cache the result
      await this.cacheResult(request, result, queryEmbedding);

      logger.info('Hybrid search completed', {
        tenantId: request.tenantId,
        itemsFound: result.items.length,
        searchTime: result.searchTime,
        strategiesExecuted: result.strategies.executed,
        strategiesFailed: result.strategies.failed
      });

      return result;

    } catch (error) {
      logger.error('Hybrid search failed', {
        tenantId: request.tenantId,
        siteId: request.siteId,
        query: request.query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Attempt fallback search
      return this.fallbackSearch(request, error);
    }
  }

  /**
   * Execute vector similarity search
   */
  private async executeVectorSearch(
    request: HybridSearchRequest, 
    embedding: number[]
  ): Promise<SearchStrategyResult> {
    const startTime = Date.now();
    
    try {
      const query: NNQuery = {
        tenantId: request.tenantId,
        siteId: request.siteId,
        embedding,
        k: request.topK * 2, // Get more results for better fusion
        useIndex: request.vectorOptions?.indexType || 'hnsw'
      };

      // Add optional properties only if they exist
      if (request.locale) {
        query.locale = request.locale;
      }
      if (request.minScore !== undefined) {
        query.minScore = request.minScore;
      }
      if (request.filters) {
        query.filter = request.filters;
      }

      const hits = await pgVectorClient.nnSearch(query);
      
      return {
        strategy: 'vector',
        items: hits.map(hit => ({
          id: hit.id,
          content: hit.content,
          url: hit.url,
          title: hit.title || '',
          score: hit.score,
          distance: hit.distance,
          metadata: hit.meta,
          chunkIndex: hit.meta['chunkIndex'] || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: hits.length
      };
    } catch (error) {
      logger.error('Vector search execution failed', { error });
      throw error;
    }
  }

  /**
   * Execute PostgreSQL full-text search
   */
  private async executeFullTextSearch(request: HybridSearchRequest): Promise<SearchStrategyResult> {
    const startTime = Date.now();
    
    try {
      // Use hybrid search with text only (no vector component)
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);
      
      const query: NNQuery = {
        tenantId: request.tenantId,
        siteId: request.siteId,
        embedding: queryEmbedding,
        k: request.topK * 2, // Get more results for better fusion
        hybrid: { text: request.query, alpha: 0.0 }, // Pure text search (alpha=0)
        useIndex: 'exact'
      };

      // Add optional properties only if they exist
      if (request.locale) {
        query.locale = request.locale;
      }
      if (request.minScore !== undefined) {
        query.minScore = request.minScore;
      }
      if (request.filters) {
        query.filter = request.filters;
      }

      const hits = await pgVectorClient.hybridSearch(query);

      return {
        strategy: 'fulltext',
        items: hits.map(hit => ({
          id: hit.id,
          content: hit.content,
          url: hit.url,
          title: hit.title || '',
          score: hit.score,
          metadata: hit.meta,
          chunkIndex: hit.meta['chunkIndex'] || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: hits.length
      };
    } catch (error) {
      logger.error('Full-text search execution failed', { error });
      throw error;
    }
  }

  /**
   * Execute BM25-style search with term frequency boosting
   */
  private async executeBM25Search(request: HybridSearchRequest): Promise<SearchStrategyResult> {
    const startTime = Date.now();
    
    try {
      // For now, use hybrid search with balanced vector/text weighting to approximate BM25
      // TODO: Implement proper BM25 scoring when advanced text search is needed
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);
      
      const query: NNQuery = {
        tenantId: request.tenantId,
        siteId: request.siteId,
        embedding: queryEmbedding,
        k: request.topK * 2, // Get more results for better fusion
        hybrid: { text: request.query, alpha: 0.3 }, // More text-weighted than default
        useIndex: 'hnsw'
      };

      // Add optional properties only if they exist
      if (request.locale) {
        query.locale = request.locale;
      }
      if (request.minScore !== undefined) {
        query.minScore = request.minScore;
      }
      if (request.filters) {
        query.filter = request.filters;
      }

      const hits = await pgVectorClient.hybridSearch(query);

      return {
        strategy: 'bm25',
        items: hits.map(hit => ({
          id: hit.id,
          content: hit.content,
          url: hit.url,
          title: hit.title || '',
          score: hit.score,
          metadata: hit.meta,
          chunkIndex: hit.meta['chunkIndex'] || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: hits.length
      };
    } catch (error) {
      logger.error('BM25 search execution failed', { error });
      throw error;
    }
  }

  /**
   * Execute structured data search with JSON-LD boosting
   */
  private async executeStructuredDataSearch(request: HybridSearchRequest): Promise<SearchStrategyResult> {
    const startTime = Date.now();
    
    try {
      // Use hybrid search with filtering for structured data content
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);
      
      const query: NNQuery = {
        tenantId: request.tenantId,
        siteId: request.siteId,
        embedding: queryEmbedding,
        k: request.topK * 2, // Get more results for better fusion
        hybrid: { text: request.query, alpha: 0.6 }, // Balanced hybrid search
        useIndex: 'hnsw'
      };

      // Add optional properties only if they exist
      if (request.locale) {
        query.locale = request.locale;
      }
      if (request.minScore !== undefined) {
        query.minScore = request.minScore;
      }
      
      // Merge structured data filters with existing filters
      const structuredDataFilter = {
        ...request.filters,
        // Filter for content with structured data indicators
        $or: [
          { hasStructuredData: true },
          { hasActions: true },
          { hasForms: true }
        ]
      };
      query.filter = structuredDataFilter;

      const hits = await pgVectorClient.hybridSearch(query);

      // Apply structured data scoring boost
      const boostedHits = hits.map(hit => {
        let boost = 1.0;
        if (hit.meta['hasStructuredData']) {
          boost *= 2.0;
        }
        if (hit.meta['hasActions']) {
          boost *= 1.8;
        }
        if (hit.meta['hasForms']) {
          boost *= 1.6;
        }
        
        return {
          ...hit,
          score: hit.score * boost
        };
      });

      return {
        strategy: 'structured',
        items: boostedHits.map(hit => ({
          id: hit.id,
          content: hit.content,
          url: hit.url,
          title: hit.title || '',
          score: hit.score,
          metadata: hit.meta,
          chunkIndex: hit.meta['chunkIndex'] || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: boostedHits.length
      };
    } catch (error) {
      logger.error('Structured data search execution failed', { error });
      throw error;
    }
  }

  /**
   * Fuse search results using RRF
   */
  private fuseSearchResults(
    strategyResults: SearchStrategyResult[], 
    fusionOptions?: RRFFusionOptions
  ): RRFResult<HybridSearchItem>[] {
    const rankings = strategyResults.map(result => ({
      systemName: result.strategy,
      items: result.items
    }));

    const options: any = {};
    
    // Only add properties if they are not undefined
    if (fusionOptions?.weights !== undefined) {
      options.weights = fusionOptions.weights;
    }
    if (fusionOptions?.minScore !== undefined) {
      options.minScore = fusionOptions.minScore;
    }
    if (fusionOptions?.maxResults !== undefined) {
      options.maxResults = fusionOptions.maxResults;
    }
    if (fusionOptions?.minConsensus !== undefined) {
      options.minConsensus = fusionOptions.minConsensus;
    }

    return rrfRanker.fuseRankings(rankings, options);
  }

  /**
   * Post-process fused results
   */
  private async postProcessResults(
    fusedResults: RRFResult<HybridSearchItem>[],
    request: HybridSearchRequest
  ): Promise<HybridSearchResultItem[]> {
    return fusedResults.map((result, index) => ({
      id: result.item.id,
      content: result.item.content,
      url: result.item.url,
      title: result.item.title || '',
      relevantSnippet: this.extractRelevantSnippet(result.item.content, request.query),
      score: result.normalizedScore,
      rank: index + 1,
      metadata: result.item.metadata,
      chunkIndex: result.item.chunkIndex,
      fusion: {
        rrfScore: result.rrfScore,
        systemScores: result.systemScores,
        systemRanks: result.systemRanks,
        appearsInSystems: result.appearsInSystems,
        consensusRatio: result.appearsInSystems / request.strategies.length
      }
    }));
  }

  /**
   * Extract relevant snippet around query terms
   */
  private extractRelevantSnippet(content: string, query: string, maxLength: number = 200): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    
    // Find best position (first occurrence of any query term)
    let bestIndex = -1;
    for (const term of queryTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
      }
    }
    
    if (bestIndex === -1) {
      return content.length > maxLength 
        ? content.substring(0, maxLength) + '...'
        : content;
    }
    
    // Extract around found term
    const start = Math.max(0, bestIndex - maxLength / 2);
    const end = Math.min(content.length, start + maxLength);
    
    let snippet = content.substring(start, end);
    
    if (start > 0) {snippet = '...' + snippet;}
    if (end < content.length) {snippet = snippet + '...';}
    
    return snippet;
  }

  /**
   * Check cache for existing results
   */
  private async checkCache(request: HybridSearchRequest) {
    if (!request.cacheOptions?.enabled) {
      return null;
    }

    try {
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);
      const cacheKey: CacheKey = {
        tenantId: request.tenantId,
        locale: request.locale || 'en',
        model: 'hybrid-search',
        k: request.topK,
        queryHash: retrievalCache.hashEmbedding(queryEmbedding)
      };

      // Only add optional properties if they exist
      if (request.filters) {
        cacheKey.filter = request.filters;
      }
      if (request.fusionOptions?.weights?.[0] !== undefined) {
        cacheKey.hybridAlpha = request.fusionOptions.weights[0];
      }

      return await retrievalCache.get<HybridSearchResult>(cacheKey);
    } catch (error) {
      logger.error('Cache check failed', { error });
      return null;
    }
  }

  /**
   * Cache search result
   */
  private async cacheResult(
    request: HybridSearchRequest, 
    result: HybridSearchResult,
    queryEmbedding: number[]
  ): Promise<void> {
    if (!request.cacheOptions?.enabled) {
      return;
    }

    try {
      const cacheKey: CacheKey = {
        tenantId: request.tenantId,
        locale: request.locale || 'en',
        model: 'hybrid-search',
        k: request.topK,
        queryHash: retrievalCache.hashEmbedding(queryEmbedding)
      };

      // Only add optional properties if they exist
      if (request.filters) {
        cacheKey.filter = request.filters;
      }
      if (request.fusionOptions?.weights?.[0] !== undefined) {
        cacheKey.hybridAlpha = request.fusionOptions.weights[0];
      }

      const cacheOptions: any = {};
      if (request.cacheOptions.ttl !== undefined) {
        cacheOptions.ttl = request.cacheOptions.ttl;
      }
      if (request.cacheOptions.staleWhileRevalidate !== undefined) {
        cacheOptions.swr = request.cacheOptions.staleWhileRevalidate;
      }

      await retrievalCache.set(cacheKey, {
        ...result,
        cacheInfo: { ...result.cacheInfo, cached: true }
      }, cacheOptions);
    } catch (error) {
      logger.error('Failed to cache result', { error });
    }
  }

  /**
   * Background revalidation for stale cache entries
   */
  private async revalidateInBackground(request: HybridSearchRequest): Promise<void> {
    logger.debug('Starting background revalidation', { 
      tenantId: request.tenantId,
      query: request.query.substring(0, 50)
    });

    try {
      // Create a new request without cache to force fresh search
      const revalidateRequest = { 
        ...request, 
        cacheOptions: { ...request.cacheOptions, enabled: false } 
      };
      await this.search(revalidateRequest);
    } catch (error) {
      logger.error('Background revalidation failed', { error });
    }
  }

  /**
   * Fallback search when primary search fails
   */
  private async fallbackSearch(request: HybridSearchRequest, error: any): Promise<HybridSearchResult> {
    logger.warn('Executing fallback search', { 
      tenantId: request.tenantId,
      originalError: error instanceof Error ? error.message : 'Unknown error'
    });

    try {
      // Simple fallback using just vector search
      const queryEmbedding = await embeddingService.generateEmbedding(request.query);
      const vectorResult = await this.executeVectorSearch(request, queryEmbedding);

      return {
        items: vectorResult.items.slice(0, request.topK).map((item, index) => ({
          id: item.id,
          content: item.content,
          url: item.url,
          title: item.title ?? '',
          relevantSnippet: this.extractRelevantSnippet(item.content, request.query),
          score: item.score,
          rank: index + 1,
          metadata: item.metadata,
          chunkIndex: item.chunkIndex,
          fusion: {
            rrfScore: item.score,
            systemScores: { vector: item.score },
            systemRanks: { vector: index + 1 },
            appearsInSystems: 1,
            consensusRatio: 1.0
          }
        })),
        totalCount: vectorResult.items.length,
        searchTime: vectorResult.executionTime,
        strategies: {
          executed: ['vector'],
          failed: request.strategies.filter(s => s !== 'vector'),
          totalExecuted: 1
        },
        fusion: {
          algorithm: 'fallback',
          combinedCount: vectorResult.items.length,
          averageConsensus: 1.0
        },
        cacheInfo: {
          cached: false,
          ttl: 0
        }
      };
    } catch (fallbackError) {
      logger.error('Fallback search also failed', { fallbackError });
      throw new Error('All search strategies failed');
    }
  }

  /**
   * Validate search request
   */
  private validateRequest(request: HybridSearchRequest): void {
    if (!request.tenantId || !request.siteId) {
      throw new Error('tenantId and siteId are required');
    }
    
    if (!request.query || request.query.trim().length === 0) {
      throw new Error('Query is required and cannot be empty');
    }
    
    if (request.topK <= 0 || request.topK > 100) {
      throw new Error('topK must be between 1 and 100');
    }
    
    if (request.strategies.length === 0) {
      throw new Error('At least one search strategy must be specified');
    }
  }
}

// Types

export type SearchStrategy = 'vector' | 'fulltext' | 'bm25' | 'structured';

export interface HybridSearchRequest {
  tenantId: string;
  siteId: string;
  query: string;
  topK: number;
  locale?: string;
  minScore?: number;
  strategies: SearchStrategy[];
  filters?: Record<string, any>;
  vectorOptions?: {
    indexType?: 'hnsw' | 'ivfflat';
  };
  fusionOptions?: RRFFusionOptions;
  cacheOptions?: {
    enabled?: boolean;
    ttl?: number;
    staleWhileRevalidate?: number;
  };
}

export interface RRFFusionOptions {
  weights?: number[];
  minScore?: number;
  maxResults?: number;
  minConsensus?: number;
}

export interface HybridSearchItem extends RankableItem {
  content: string;
  url: string;
  title?: string;
  score: number;
  distance?: number;
  metadata: Record<string, any>;
  chunkIndex: number;
}

export interface SearchStrategyResult {
  strategy: SearchStrategy;
  items: HybridSearchItem[];
  executionTime: number;
  totalFound: number;
}

export interface HybridSearchResultItem {
  id: string;
  content: string;
  url: string;
  title?: string;
  relevantSnippet: string;
  score: number;
  rank: number;
  metadata: Record<string, any>;
  chunkIndex: number;
  fusion: {
    rrfScore: number;
    systemScores: Record<string, number>;
    systemRanks: Record<string, number>;
    appearsInSystems: number;
    consensusRatio: number;
  };
}

export interface HybridSearchResult {
  items: HybridSearchResultItem[];
  totalCount: number;
  searchTime: number;
  strategies: {
    executed: SearchStrategy[];
    failed: SearchStrategy[];
    totalExecuted: number;
  };
  fusion: {
    algorithm: string;
    combinedCount: number;
    averageConsensus: number;
  };
  cacheInfo: {
    cached: boolean;
    ttl: number;
  };
}

/**
 * Factory function
 */
export function createHybridSearchService(): HybridSearchService {
  return new HybridSearchService();
}

// Export singleton instance
export const hybridSearchService = createHybridSearchService();