import { createLogger } from '../../../../shared/utils.js';
import { pgVectorClient, type NNQuery, type Hit } from '../vector-store/PgVectorClient';
import { embeddingService } from '../../application/services/EmbeddingService';
import { retrievalCache, type CacheKey } from './RetrievalCache';
import { rrfRanker, type RankableItem, type RRFResult } from './RRFRanker';
import { sql } from 'drizzle-orm';

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
      const failedStrategies: string[] = [];

      strategyResults.forEach((result, index) => {
        const strategyName = request.strategies[index];
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
        } else {
          failedStrategies.push(strategyName);
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
        locale: request.locale,
        embedding,
        k: request.topK * 2, // Get more results for better fusion
        minScore: request.minScore,
        filter: request.filters,
        useIndex: request.vectorOptions?.indexType || 'hnsw'
      };

      const hits = await pgVectorClient.nnSearch(query);
      
      return {
        strategy: 'vector',
        items: hits.map(hit => ({
          id: hit.id,
          content: hit.content,
          url: hit.url,
          title: hit.title,
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
      // Use the existing database connection from pgVectorClient
      const results = await pgVectorClient['sql']`
        WITH fts_query AS (
          SELECT plainto_tsquery('english', ${request.query}) as query
        )
        SELECT 
          c.id,
          c.content,
          c.metadata,
          c.chunk_index,
          d.url,
          d.title,
          ts_rank(to_tsvector('english', c.content), fts_query.query) as fts_score
        FROM kb_chunks c
        JOIN kb_documents d ON c.document_id = d.id
        CROSS JOIN fts_query
        WHERE 
          c.site_id = ${request.siteId}
          AND c.tenant_id = ${request.tenantId}
          ${request.locale ? sql`AND c.locale = ${request.locale}` : sql``}
          AND to_tsvector('english', c.content) @@ fts_query.query
          ${request.minScore ? sql`AND ts_rank(to_tsvector('english', c.content), fts_query.query) >= ${request.minScore}` : sql``}
        ORDER BY fts_score DESC
        LIMIT ${request.topK * 2}
      `;

      return {
        strategy: 'fulltext',
        items: results.map((row: any) => ({
          id: row.id,
          content: row.content,
          url: row.url,
          title: row.title,
          score: parseFloat(row.fts_score),
          metadata: row.metadata || {},
          chunkIndex: row.chunk_index || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: results.length
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
      // Extract query terms
      const terms = request.query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
      if (terms.length === 0) {
        return { strategy: 'bm25', items: [], executionTime: Date.now() - startTime, totalFound: 0 };
      }

      // Build BM25-inspired query (simplified version)
      const results = await pgVectorClient['sql']`
        WITH query_terms AS (
          SELECT unnest(${terms}) as term
        ),
        term_stats AS (
          SELECT 
            term,
            COUNT(*) as doc_freq
          FROM query_terms qt
          CROSS JOIN kb_chunks c
          WHERE 
            c.site_id = ${request.siteId}
            AND c.tenant_id = ${request.tenantId}
            AND lower(c.content) LIKE '%' || qt.term || '%'
          GROUP BY term
        ),
        chunk_scores AS (
          SELECT 
            c.id,
            c.content,
            c.metadata,
            c.chunk_index,
            d.url,
            d.title,
            SUM(
              CASE 
                WHEN lower(c.content) LIKE '%' || qt.term || '%' 
                THEN LN(1.0 + (LENGTH(c.content) - LENGTH(REPLACE(lower(c.content), qt.term, ''))) / LENGTH(qt.term))
                ELSE 0 
              END
            ) as bm25_score
          FROM kb_chunks c
          JOIN kb_documents d ON c.document_id = d.id
          CROSS JOIN query_terms qt
          WHERE 
            c.site_id = ${request.siteId}
            AND c.tenant_id = ${request.tenantId}
            ${request.locale ? sql`AND c.locale = ${request.locale}` : sql``}
          GROUP BY c.id, c.content, c.metadata, c.chunk_index, d.url, d.title
          HAVING SUM(
            CASE 
              WHEN lower(c.content) LIKE '%' || qt.term || '%' 
              THEN 1
              ELSE 0 
            END
          ) > 0
        )
        SELECT *
        FROM chunk_scores
        WHERE bm25_score > 0
        ${request.minScore ? sql`AND bm25_score >= ${request.minScore}` : sql``}
        ORDER BY bm25_score DESC
        LIMIT ${request.topK * 2}
      `;

      return {
        strategy: 'bm25',
        items: results.map((row: any) => ({
          id: row.id,
          content: row.content,
          url: row.url,
          title: row.title,
          score: parseFloat(row.bm25_score),
          metadata: row.metadata || {},
          chunkIndex: row.chunk_index || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: results.length
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
      // Search in structured data (JSON-LD entities, forms, actions)
      const results = await pgVectorClient['sql']`
        WITH structured_matches AS (
          SELECT 
            c.id,
            c.content,
            c.metadata,
            c.chunk_index,
            d.url,
            d.title,
            CASE 
              WHEN c.metadata->>'hasStructuredData' = 'true' THEN 2.0
              WHEN c.metadata->>'hasActions' = 'true' THEN 1.8
              WHEN c.metadata->>'hasForms' = 'true' THEN 1.6
              ELSE 1.0
            END * ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', ${request.query})) as structured_score
          FROM kb_chunks c
          JOIN kb_documents d ON c.document_id = d.id
          WHERE 
            c.site_id = ${request.siteId}
            AND c.tenant_id = ${request.tenantId}
            ${request.locale ? sql`AND c.locale = ${request.locale}` : sql``}
            AND (
              c.metadata->>'hasStructuredData' = 'true'
              OR c.metadata->>'hasActions' = 'true'
              OR c.metadata->>'hasForms' = 'true'
            )
            AND to_tsvector('english', c.content) @@ plainto_tsquery('english', ${request.query})
        )
        SELECT *
        FROM structured_matches
        WHERE structured_score > 0
        ${request.minScore ? sql`AND structured_score >= ${request.minScore}` : sql``}
        ORDER BY structured_score DESC
        LIMIT ${request.topK * 2}
      `;

      return {
        strategy: 'structured',
        items: results.map((row: any) => ({
          id: row.id,
          content: row.content,
          url: row.url,
          title: row.title,
          score: parseFloat(row.structured_score),
          metadata: row.metadata || {},
          chunkIndex: row.chunk_index || 0
        })),
        executionTime: Date.now() - startTime,
        totalFound: results.length
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

    const options = {
      weights: fusionOptions?.weights,
      minScore: fusionOptions?.minScore,
      maxResults: fusionOptions?.maxResults,
      minConsensus: fusionOptions?.minConsensus
    };

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
      title: result.item.title,
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
    
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
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
        queryHash: retrievalCache.hashEmbedding(queryEmbedding),
        filter: request.filters,
        hybridAlpha: request.fusionOptions?.weights?.[0]
      };

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
        queryHash: retrievalCache.hashEmbedding(queryEmbedding),
        filter: request.filters,
        hybridAlpha: request.fusionOptions?.weights?.[0]
      };

      await retrievalCache.set(cacheKey, {
        ...result,
        cacheInfo: { ...result.cacheInfo, cached: true }
      }, {
        ttl: request.cacheOptions.ttl,
        swr: request.cacheOptions.staleWhileRevalidate
      });
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
          title: item.title,
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