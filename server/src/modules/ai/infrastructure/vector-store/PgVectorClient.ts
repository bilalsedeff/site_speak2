import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../../../../infrastructure/config';
import { createLogger } from '../../../../shared/utils.js';
import { kbChunks, kbDocuments, kbEmbeddings } from '../../../../infrastructure/database/schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';

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
  contentHash: string;
  embedding: number[];
  locale: string;
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
            .select({ id: kbChunks.id })
            .from(kbChunks)
            .where(
              and(
                eq(kbChunks.siteId, chunk.siteId),
                eq(kbChunks.contentHash, chunk.contentHash)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            // Insert new chunk
            const [insertedChunk] = await tx
              .insert(kbChunks)
              .values({
                siteId: chunk.siteId,
                tenantId: chunk.tenantId,
                documentId: chunk.documentId,
                chunkIndex: chunk.chunkIndex,
                content: chunk.content,
                contentHash: chunk.contentHash,
                locale: chunk.locale,
                metadata: chunk.metadata,
              })
              .returning({ id: kbChunks.id });

            // Insert embedding
            await tx.insert(kbEmbeddings).values({
              chunkId: insertedChunk.id,
              siteId: chunk.siteId,
              tenantId: chunk.tenantId,
              embedding: chunk.embedding, // Will be stored as vector type
              model: 'text-embedding-3-small',
              dimensions: chunk.embedding.length,
            });
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

      // Prepare embedding as vector
      const embeddingVector = `[${query.embedding.join(',')}]`;

      // Build the query with proper vector distance operator
      const results = await this.sql`
        SELECT 
          c.id,
          c.content,
          c.metadata,
          c.chunk_index,
          d.url,
          d.title,
          d.id as page_id,
          e.embedding <=> ${embeddingVector}::vector as distance,
          1 - (e.embedding <=> ${embeddingVector}::vector) as score
        FROM kb_chunks c
        JOIN kb_embeddings e ON c.id = e.chunk_id
        JOIN kb_documents d ON c.document_id = d.id
        WHERE 
          c.site_id = ${query.siteId} 
          AND c.tenant_id = ${query.tenantId}
          ${query.locale ? sql`AND c.locale = ${query.locale}` : sql``}
          ${query.minScore ? sql`AND (1 - (e.embedding <=> ${embeddingVector}::vector)) >= ${query.minScore}` : sql``}
        ORDER BY e.embedding <=> ${embeddingVector}::vector ASC
        LIMIT ${query.k}
      `;

      const hits: Hit[] = results.map((row: any) => ({
        id: row.id,
        pageId: row.page_id,
        distance: parseFloat(row.distance),
        score: parseFloat(row.score),
        content: row.content,
        meta: row.metadata || {},
        url: row.url,
        title: row.title,
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
    const embeddingVector = `[${query.embedding.join(',')}]`;

    logger.info('Performing hybrid search', {
      tenantId: query.tenantId,
      siteId: query.siteId,
      k: query.k,
      alpha,
    });

    try {
      // Hybrid search with vector + FTS combination
      const results = await this.sql`
        WITH vector_results AS (
          SELECT 
            c.id,
            c.content,
            c.metadata,
            c.chunk_index,
            d.url,
            d.title,
            d.id as page_id,
            e.embedding <=> ${embeddingVector}::vector as vector_distance,
            1 - (e.embedding <=> ${embeddingVector}::vector) as vector_score
          FROM kb_chunks c
          JOIN kb_embeddings e ON c.id = e.chunk_id
          JOIN kb_documents d ON c.document_id = d.id
          WHERE 
            c.site_id = ${query.siteId} 
            AND c.tenant_id = ${query.tenantId}
            ${query.locale ? sql`AND c.locale = ${query.locale}` : sql``}
          ORDER BY e.embedding <=> ${embeddingVector}::vector ASC
          LIMIT ${query.k * 3}
        ),
        fts_results AS (
          SELECT 
            c.id,
            ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', ${query.hybrid.text})) as fts_score
          FROM kb_chunks c
          WHERE 
            c.site_id = ${query.siteId} 
            AND c.tenant_id = ${query.tenantId}
            AND to_tsvector('english', c.content) @@ plainto_tsquery('english', ${query.hybrid.text})
            ${query.locale ? sql`AND c.locale = ${query.locale}` : sql``}
        )
        SELECT 
          v.*,
          COALESCE(f.fts_score, 0) as fts_score,
          (${alpha} * v.vector_score + ${1 - alpha} * COALESCE(f.fts_score, 0)) as combined_score
        FROM vector_results v
        LEFT JOIN fts_results f ON v.id = f.id
        ORDER BY combined_score DESC
        LIMIT ${query.k}
      `;

      const hits: Hit[] = results.map((row: any) => ({
        id: row.id,
        pageId: row.page_id,
        distance: parseFloat(row.vector_distance),
        score: parseFloat(row.combined_score),
        content: row.content,
        meta: row.metadata || {},
        url: row.url,
        title: row.title,
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
    // This would typically generate embeddings for the query
    // For now, we'll simulate it
    const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());

    const query: NNQuery = {
      tenantId: request.tenantId,
      siteId: request.siteId,
      embedding: mockEmbedding,
      k: request.topK || 8,
      locale: request.locale,
      filter: request.filters,
      hybrid: request.hybrid ? { text: request.query, alpha: 0.7 } : undefined,
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
      title: hit.title,
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
          .select({ id: kbChunks.id })
          .from(kbChunks)
          .where(
            and(
              eq(kbChunks.documentId, pageId),
              eq(kbChunks.tenantId, tenantId)
            )
          );

        if (chunks.length > 0) {
          const chunkIds = chunks.map(c => c.id);
          
          // Delete embeddings
          await tx.delete(kbEmbeddings).where(inArray(kbEmbeddings.chunkId, chunkIds));
          
          // Delete chunks
          await tx.delete(kbChunks).where(inArray(kbChunks.id, chunkIds));
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
        // Create HNSW index
        await this.sql`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS kb_embeddings_embedding_hnsw_idx 
          ON kb_embeddings 
          USING hnsw (embedding vector_cosine_ops) 
          WITH (m = 16, ef_construction = 64)
        `;
      } else if (kind === 'ivfflat') {
        // Create IVFFlat index
        // Calculate lists based on row count
        const rowCount = await this.sql`SELECT COUNT(*) FROM kb_embeddings`;
        const lists = Math.max(100, Math.min(1000, Math.floor(rowCount[0]['count'] / 1000)));
        
        await this.sql`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS kb_embeddings_embedding_ivfflat_idx 
          ON kb_embeddings 
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
      const whereCondition = siteId 
        ? and(eq(kbChunks.tenantId, tenantId), eq(kbChunks.siteId, siteId))
        : eq(kbChunks.tenantId, tenantId);

      const [chunkStats] = await this.db
        .select({
          count: sql<number>`count(*)`,
          avgLength: sql<number>`avg(length(content))`,
        })
        .from(kbChunks)
        .where(whereCondition);

      const [embeddingStats] = await this.db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(kbEmbeddings)
        .where(eq(kbEmbeddings.tenantId, tenantId));

      // Check which index is active
      const indexInfo = await this.sql`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'kb_embeddings' 
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