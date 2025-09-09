import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../../../../infrastructure/config';
import { createLogger } from '../../../../shared/utils.js';
import { knowledgeChunks } from '../../../../infrastructure/database/schema/knowledge-base';
import { eq, and, sql, inArray } from 'drizzle-orm';

const logger = createLogger({ service: 'pgvector-client' });

export interface NNQuery {
  tenantId: string;
  siteId: string;
  locale?: string;                // BCP-47
  embedding: number[];            // length must match index (1536 for text-embedding-3-small)
  k: number;                      // topK
  minScore?: number;              // optional distance->score cutoff
  filter?: Record<string, any>;   // meta filters
  hybrid?: { text?: string; alpha?: number }; // weighted combo
  useIndex?: "hnsw"|"ivfflat"|"exact";
}

export interface Hit {
  id: string;
  pageId: string;
  distance: number;               // lower is better
  score: number;                  // normalized [0..1]
  content: string;
  meta: Record<string, any>;
  url: string;
  title?: string;
}

export interface ChunkInsert {
  id?: string;
  siteId: string;
  tenantId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  cleanedContent: string;
  contentHash: string;
  embedding: number[];
  wordCount: number;
  tokenCount: number;
  locale: string;
  contentType?: string;
  section?: string;
  heading?: string;
  selector?: string;
  metadata: Record<string, any>;
}

export interface SemanticSearchRequest {
  siteId: string;
  tenantId: string;
  query: string;
  topK?: number;
  locale?: string;
  filters?: Record<string, any>;
  hybrid?: boolean;
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  url: string;
  score: number;
  metadata: Record<string, any>;
  chunkIndex: number;
  title?: string;
}

/**
 * High-performance pgvector client with HNSW/IVFFlat support
 * Implements proper vector similarity search with tenant isolation
 */
export class PgVectorClient {
  private db: ReturnType<typeof drizzle>;
  private sql: postgres.Sql;

  constructor() {
    this.sql = postgres(config.DATABASE_URL, {
      max: 20,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    this.db = drizzle(this.sql);
    
    logger.info('PgVectorClient initialized');
  }

  /**
   * Upsert chunks with embeddings (idempotent by content_hash)
   */
  async upsertChunks(chunks: ChunkInsert[]): Promise<void> {
    if (chunks.length === 0) {return;}

    logger.info('Upserting chunks', { count: chunks.length });

    try {
      // Use transaction for consistency
      await this.db.transaction(async (tx) => {
        for (const chunk of chunks) {
          // Check if chunk already exists with same content hash
          const existing = await tx
            .select({ id: knowledgeChunks.id })
            .from(knowledgeChunks)
            .where(
              and(
                eq(knowledgeChunks.knowledgeBaseId, chunk.siteId),
                eq(knowledgeChunks.contentHash, chunk.contentHash)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            // Insert new chunk
            await tx
              .insert(knowledgeChunks)
              .values({
                knowledgeBaseId: chunk.siteId, 
                url: chunk.documentId,
                urlHash: chunk.contentHash.substring(0, 64),
                content: chunk.content,
                contentHash: chunk.contentHash,
                embedding: chunk.embedding, // Store as vector, not JSON
                chunkOrder: chunk.chunkIndex,
                tokenCount: chunk.tokenCount,
                characterCount: chunk.content.length,
                language: chunk.locale,
                contentType: chunk.contentType || 'text',
                title: chunk.heading,
                selector: chunk.selector,
                metadata: chunk.metadata,
              })
              .returning({ id: knowledgeChunks.id });

            // Embedding is now stored directly in the knowledgeChunks table
            // No separate embeddings table needed
          }
        }
      });

      logger.info('Chunks upserted successfully', { count: chunks.length });
    } catch (error) {
      logger.error('Failed to upsert chunks', { error, count: chunks.length });
      throw error;
    }
  }

  /**
   * Vector nearest neighbor search with HNSW/IVFFlat support
   */
  async nnSearch(query: NNQuery): Promise<Hit[]> {
    const startTime = Date.now();
    
    logger.info('Performing NN search', {
      tenantId: query.tenantId,
      siteId: query.siteId,
      k: query.k,
      useIndex: query.useIndex,
    });

    try {
      // Set search parameters based on index type
      if (query.useIndex === 'hnsw') {
        await this.sql`SET hnsw.ef_search = 100`; // Can be tuned based on recall needs
      } else if (query.useIndex === 'ivfflat') {
        await this.sql`SET ivfflat.probes = 50`; // Can be tuned based on recall needs
      }

      // Build the query with proper vector distance operator using pgvector
      const embeddingStr = `[${query.embedding.join(',')}]`;
      
      const results = await this.sql`
        SELECT 
          kc.id,
          kc.content,
          kc.metadata,
          kc.chunk_order as chunk_index,
          kc.knowledge_base_id as site_id,
          kc.url,
          kc.title,
          (kc.embedding <=> ${embeddingStr}::vector) as distance,
          (1 - (kc.embedding <=> ${embeddingStr}::vector)) as score
        FROM knowledge_chunks kc
        WHERE 
          kc.knowledge_base_id = ${query.siteId}
          ${query.locale ? this.sql` AND kc.language = ${query.locale}` : this.sql``}
          ${query.minScore ? this.sql` AND (1 - (kc.embedding <=> ${embeddingStr}::vector)) >= ${query.minScore}` : this.sql``}
        ORDER BY kc.embedding <=> ${embeddingStr}::vector
        LIMIT ${query.k}
      `;

      const hits: Hit[] = results.map((row: any) => ({
        id: row.id,
        pageId: row.site_id,
        distance: parseFloat(row.distance),
        score: parseFloat(row.score),
        content: row.content,
        meta: row.metadata || {},
        url: row.url || `/${row.id}`,
        title: row.title || `Chunk ${row.chunk_index}`,
      }));

      const duration = Date.now() - startTime;
      logger.info('NN search completed', {
        tenantId: query.tenantId,
        resultCount: hits.length,
        duration,
      });

      return hits;
    } catch (error) {
      logger.error('NN search failed', {
        tenantId: query.tenantId,
        siteId: query.siteId,
        error,
      });
      throw error;
    }
  }

  /**
   * Hybrid search combining vector similarity with full-text search
   */
  async hybridSearch(query: NNQuery): Promise<Hit[]> {
    if (!query.hybrid?.text) {
      return this.nnSearch(query);
    }

    const startTime = Date.now();
    const alpha = query.hybrid.alpha || 0.7; // Weight for vector search

    logger.info('Performing hybrid search', {
      tenantId: query.tenantId,
      siteId: query.siteId,
      k: query.k,
      alpha,
    });

    try {
      // Hybrid search combining vector similarity with full-text search using RRF
      const embeddingStr = `[${query.embedding.join(',')}]`;
      const results = await this.sql`
        WITH vector_results AS (
          SELECT 
            kc.id,
            kc.content,
            kc.metadata,
            kc.chunk_order as chunk_index,
            kc.knowledge_base_id as site_id,
            kc.url,
            kc.title,
            (kc.embedding <=> ${embeddingStr}::vector) as vector_distance,
            ROW_NUMBER() OVER (ORDER BY kc.embedding <=> ${embeddingStr}::vector) as vector_rank
          FROM knowledge_chunks kc
          WHERE 
            kc.knowledge_base_id = ${query.siteId}
            ${query.locale ? this.sql` AND kc.language = ${query.locale}` : this.sql``}
        ),
        fts_results AS (
          SELECT 
            kc.id,
            kc.content,
            kc.metadata,
            kc.chunk_order as chunk_index,
            kc.knowledge_base_id as site_id,
            kc.url,
            kc.title,
            ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', ${query.hybrid.text})) as fts_score,
            ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', kc.content), plainto_tsquery('english', ${query.hybrid.text})) DESC) as fts_rank
          FROM knowledge_chunks kc
          WHERE 
            kc.knowledge_base_id = ${query.siteId}
            AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', ${query.hybrid.text})
            ${query.locale ? this.sql` AND kc.language = ${query.locale}` : this.sql``}
        )
        SELECT 
          COALESCE(v.id, f.id) as id,
          COALESCE(v.content, f.content) as content,
          COALESCE(v.metadata, f.metadata) as metadata,
          COALESCE(v.chunk_index, f.chunk_index) as chunk_index,
          COALESCE(v.site_id, f.site_id) as site_id,
          COALESCE(v.url, f.url) as url,
          COALESCE(v.title, f.title) as title,
          COALESCE(v.vector_distance, 1.0) as vector_distance,
          COALESCE(f.fts_score, 0.0) as fts_score,
          -- RRF (Reciprocal Rank Fusion) scoring
          (COALESCE(1.0 / (60 + v.vector_rank), 0.0) * ${alpha} + 
           COALESCE(1.0 / (60 + f.fts_rank), 0.0) * ${1 - alpha}) as combined_score
        FROM vector_results v
        FULL OUTER JOIN fts_results f ON v.id = f.id
        ORDER BY combined_score DESC
        LIMIT ${query.k}
      `;

      const hits: Hit[] = results.map((row: any) => ({
        id: row.id,
        pageId: row.site_id,
        distance: parseFloat(row.vector_distance || 0),
        score: parseFloat(row.combined_score || 0),
        content: row.content,
        meta: row.metadata || {},
        url: row.url || `/${row.id}`,
        title: row.title || `Chunk ${row.chunk_index}`,
      }));

      const duration = Date.now() - startTime;
      logger.info('Hybrid search completed', {
        tenantId: query.tenantId,
        resultCount: hits.length,
        duration,
      });

      return hits;
    } catch (error) {
      logger.error('Hybrid search failed', {
        tenantId: query.tenantId,
        siteId: query.siteId,
        error,
      });
      // Fallback to vector search
      return this.nnSearch(query);
    }
  }

  /**
   * Semantic search with auto-embedding generation
   */
  async semanticSearch(request: SemanticSearchRequest): Promise<SemanticSearchResult[]> {
    const { embeddingService } = await import('../../application/services/EmbeddingService.js');
    const queryEmbedding = await embeddingService.generateEmbedding(request.query);

    const query: NNQuery = {
      tenantId: request.tenantId,
      siteId: request.siteId,
      embedding: queryEmbedding,
      k: request.topK || 8,
      ...(request.locale && { locale: request.locale }),
      ...(request.filters && { filter: request.filters }),
      ...(request.hybrid && { hybrid: { text: request.query, alpha: 0.7 } }),
      useIndex: 'hnsw',
    };

    const hits = request.hybrid ? await this.hybridSearch(query) : await this.nnSearch(query);

    return hits.map(hit => ({
      id: hit.id,
      content: hit.content,
      url: hit.url,
      score: hit.score,
      metadata: hit.meta,
      chunkIndex: hit.meta['chunkIndex'] || 0,
      title: hit.title || 'Untitled',
    }));
  }

  /**
   * Delete chunks by page ID
   */
  async deleteByPage(pageId: string, tenantId: string): Promise<number> {
    logger.info('Deleting chunks by page', { pageId, tenantId });

    try {
      const result = await this.db.transaction(async (tx) => {
        // Get chunk IDs to delete embeddings
        const chunks = await tx
          .select({ id: knowledgeChunks.id })
          .from(knowledgeChunks)
          .where(
            and(
              eq(knowledgeChunks.url, pageId),
              eq(knowledgeChunks.knowledgeBaseId, tenantId) // Using knowledgeBaseId instead of tenantId
            )
          );

        if (chunks.length > 0) {
          const chunkIds = chunks.map(c => c.id);
          
          // Delete chunks (embeddings are stored in the same table now)
          await tx.delete(knowledgeChunks).where(inArray(knowledgeChunks.id, chunkIds));
        }

        return chunks.length;
      });

      logger.info('Chunks deleted', { pageId, count: result });
      return result;
    } catch (error) {
      logger.error('Failed to delete chunks', { pageId, tenantId, error });
      throw error;
    }
  }

  /**
   * Reindex with specified index type (HNSW or IVFFlat)
   */
  async reindex(kind: "hnsw"|"ivfflat"): Promise<void> {
    logger.info('Starting reindex', { indexType: kind });

    try {
      if (kind === 'hnsw') {
        // Create HNSW index on knowledge_chunks.embedding
        await this.sql`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx 
          ON knowledge_chunks 
          USING hnsw (embedding vector_cosine_ops) 
          WITH (m = 16, ef_construction = 64)
        `;
      } else if (kind === 'ivfflat') {
        // Create IVFFlat index
        // Calculate lists based on row count
        const rowCountResult = await this.sql`SELECT COUNT(*) FROM knowledge_chunks WHERE embedding IS NOT NULL`;
        const rowCount = Number(rowCountResult[0]?.['count'] || 0);
        const lists = Math.max(100, Math.min(1000, Math.floor(rowCount / 1000)));
        
        await this.sql`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_chunks_embedding_ivfflat_idx 
          ON knowledge_chunks 
          USING ivfflat (embedding vector_cosine_ops) 
          WITH (lists = ${lists})
        `;
      }

      logger.info('Reindex completed', { indexType: kind });
    } catch (error) {
      logger.error('Reindex failed', { indexType: kind, error });
      throw error;
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(tenantId: string, siteId?: string): Promise<{
    totalChunks: number;
    totalEmbeddings: number;
    indexType: string;
    avgChunkSize: number;
  }> {
    try {
      // Get knowledge base IDs for this tenant
      const kbResult = await this.sql`
        SELECT kb.id 
        FROM knowledge_bases kb
        JOIN sites s ON kb.site_id = s.id
        WHERE s.tenant_id = ${tenantId}
        ${siteId ? this.sql`AND kb.site_id = ${siteId}` : this.sql``}
      `;

      if (kbResult.length === 0) {
        return {
          totalChunks: 0,
          totalEmbeddings: 0,
          indexType: 'none',
          avgChunkSize: 0,
        };
      }

      const kbIds = kbResult.map((row: any) => row.id);

      const chunkStatsResult = await this.db
        .select({
          count: sql<number>`count(*)`,
          avgLength: sql<number>`avg(length(content))`,
        })
        .from(knowledgeChunks)
        .where(inArray(knowledgeChunks.knowledgeBaseId, kbIds));

      const embeddingStatsResult = await this.db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(knowledgeChunks)
        .where(
          and(
            inArray(knowledgeChunks.knowledgeBaseId, kbIds),
            sql`embedding IS NOT NULL`
          )
        );

      const chunkStats = chunkStatsResult[0] || { count: 0, avgLength: 0 };
      const embeddingStats = embeddingStatsResult[0] || { count: 0 };

      // Check which index is active on knowledge_chunks table
      const indexInfo = await this.sql`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'knowledge_chunks' 
        AND indexdef LIKE '%embedding%'
      `;

      let indexType = 'none';
      if (indexInfo.some((idx: any) => idx.indexdef.includes('hnsw'))) {
        indexType = 'hnsw';
      } else if (indexInfo.some((idx: any) => idx.indexdef.includes('ivfflat'))) {
        indexType = 'ivfflat';
      }

      return {
        totalChunks: chunkStats.count,
        totalEmbeddings: embeddingStats.count,
        indexType,
        avgChunkSize: Math.round(chunkStats.avgLength || 0),
      };
    } catch (error) {
      logger.error('Failed to get stats', { tenantId, siteId, error });
      throw error;
    }
  }

  /**
   * Close database connections
   */
  async close(): Promise<void> {
    await this.sql.end();
    logger.info('PgVectorClient closed');
  }
}

// Export singleton instance
export const pgVectorClient = new PgVectorClient();