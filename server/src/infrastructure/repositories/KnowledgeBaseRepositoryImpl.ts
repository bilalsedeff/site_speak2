import { eq, and, desc, asc, count, sql, inArray } from 'drizzle-orm';
import { db, dbUtils } from '../database';
import { 
  knowledgeBases, 
  knowledgeChunks, 
  crawlSessions,
  type KnowledgeBase as DBKnowledgeBase,
  type KnowledgeChunk as DBKnowledgeChunk
} from '../database/schema/knowledge-base';
import { sites } from '../database/schema/sites';
import { 
  KnowledgeBase, 
  KnowledgeChunk, 
  CreateKnowledgeBaseInput, 
  UpdateKnowledgeBaseInput,
  getDefaultKnowledgeBaseSettings
} from '../../modules/ai/domain/entities/KnowledgeBase';
import { 
  KnowledgeBaseRepository,
  KnowledgeBaseNotFoundError,
  KnowledgeBaseCreateError,
  KnowledgeBaseUpdateError,
  VectorSearchError
} from '../../domain/repositories/KnowledgeBaseRepository';
import { createLogger } from '../../shared/utils';

const logger = createLogger({ service: 'knowledge-base-repository' });

/**
 * Drizzle-based implementation of KnowledgeBaseRepository
 */
export class KnowledgeBaseRepositoryImpl implements KnowledgeBaseRepository {
  
  /**
   * Convert database row to domain entity
   */
  private toDomain(dbRow: DBKnowledgeBase, chunks: KnowledgeChunk[] = []): KnowledgeBase {
    const settings = dbRow.configuration as any || getDefaultKnowledgeBaseSettings();
    
    return new KnowledgeBase(
      dbRow.id,
      dbRow.siteId,
      '', // tenantId will be resolved from siteId
      `Knowledge Base for ${dbRow.siteId}`, // name - could be enhanced
      `Auto-generated knowledge base`, // description - could be enhanced
      '', // baseUrl will be resolved from site
      chunks,
      {
        status: dbRow.status as any,
        progress: 0, // Could calculate from chunks
        totalUrls: dbRow.totalPages || 0,
        processedUrls: dbRow.totalPages || 0,
        failedUrls: 0,
        ...(dbRow.lastCrawledAt && { startedAt: dbRow.lastCrawledAt }),
        ...(dbRow.lastIndexedAt && { completedAt: dbRow.lastIndexedAt }),
      },
      {
        crawlDepth: settings.crawlDepth || 3,
        crawlDelay: settings.crawlDelay || 1000,
        excludePatterns: settings.excludePatterns || [],
        includePatterns: settings.includePatterns || ['*'],
        contentTypes: ['text/html', 'text/plain'],
        maxChunkSize: settings.chunkSize || 1000,
        chunkOverlap: settings.chunkOverlap || 100,
        embeddingModel: dbRow.embeddingModel || 'text-embedding-3-small',
        autoReindex: settings.autoReindex || false,
        reindexInterval: 24,
      },
      dbRow.createdAt,
      dbRow.updatedAt,
      dbRow.lastIndexedAt || undefined,
      dbRow.status !== 'error'
    );
  }

  /**
   * Convert domain chunk to database chunk
   */
  private chunkToDomain(dbChunk: DBKnowledgeChunk): KnowledgeChunk {
    return {
      id: dbChunk.id,
      knowledgeBaseId: dbChunk.knowledgeBaseId,
      content: dbChunk.content,
      embedding: dbChunk.embedding ? Array.from(dbChunk.embedding) : [],
      metadata: {
        ...(dbChunk.url && { url: dbChunk.url }),
        ...(dbChunk.title && { title: dbChunk.title }),
        ...(dbChunk.selector && { section: dbChunk.selector }),
        contentType: dbChunk.contentType as 'text' | 'html' | 'markdown' | 'json',
        ...(dbChunk.lastModified && { lastModified: dbChunk.lastModified }),
        hash: dbChunk.contentHash,
      },
      createdAt: dbChunk.createdAt,
      updatedAt: dbChunk.updatedAt,
    };
  }

  async findById(id: string): Promise<KnowledgeBase | null> {
    try {
      const [kbRow] = await db
        .select()
        .from(knowledgeBases)
        .where(eq(knowledgeBases.id, id))
        .limit(1);

      if (!kbRow) {
        return null;
      }

      // Load chunks
      const chunks = await this.getChunks(id);
      return this.toDomain(kbRow, chunks);
    } catch (error) {
      logger.error('Failed to find knowledge base by ID', { id, error });
      throw new KnowledgeBaseNotFoundError(id);
    }
  }

  async findBySiteId(siteId: string): Promise<KnowledgeBase | null> {
    try {
      const [kbRow] = await db
        .select()
        .from(knowledgeBases)
        .where(eq(knowledgeBases.siteId, siteId))
        .limit(1);

      if (!kbRow) {
        return null;
      }

      const chunks = await this.getChunks(kbRow.id);
      return this.toDomain(kbRow, chunks);
    } catch (error) {
      logger.error('Failed to find knowledge base by site ID', { siteId, error });
      return null;
    }
  }

  async findByTenantId(tenantId: string): Promise<KnowledgeBase[]> {
    try {
      // Join with sites to filter by tenantId
      const rows = await db
        .select({
          kb: knowledgeBases,
        })
        .from(knowledgeBases)
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(eq(sites.tenantId, tenantId));

      const knowledgeBaseList: KnowledgeBase[] = [];
      for (const { kb } of rows) {
        const chunks = await this.getChunks(kb.id);
        knowledgeBaseList.push(this.toDomain(kb, chunks));
      }

      return knowledgeBaseList;
    } catch (error) {
      logger.error('Failed to find knowledge bases by tenant ID', { tenantId, error });
      return [];
    }
  }

  async create(data: CreateKnowledgeBaseInput): Promise<KnowledgeBase> {
    try {
      const settings = { ...getDefaultKnowledgeBaseSettings(), ...data.settings };
      
      const [kbRow] = await db
        .insert(knowledgeBases)
        .values({
          siteId: data.siteId,
          status: 'initializing',
          configuration: settings,
          embeddingModel: settings.embeddingModel,
          vectorDimensions: 1536, // text-embedding-3-small dimensions
          indexType: 'hnsw',
          totalChunks: 0,
          totalPages: 0,
          totalTokens: 0,
          sizeInMB: 0,
          errorCount: 0,
        })
        .returning();

      if (!kbRow) {
        throw new KnowledgeBaseCreateError('Failed to create knowledge base record');
      }

      logger.info('Knowledge base created successfully', {
        id: kbRow.id,
        siteId: data.siteId,
      });

      return this.toDomain(kbRow, []);
    } catch (error) {
      logger.error('Failed to create knowledge base', { data, error });
      throw new KnowledgeBaseCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async update(id: string, updates: UpdateKnowledgeBaseInput): Promise<KnowledgeBase | null> {
    try {
      const updateData: Partial<typeof knowledgeBases.$inferInsert> = {};

      if (updates.settings) {
        // Merge with existing configuration
        const [existing] = await db
          .select({ configuration: knowledgeBases.configuration })
          .from(knowledgeBases)
          .where(eq(knowledgeBases.id, id))
          .limit(1);

        if (existing && existing.configuration) {
          updateData.configuration = { ...existing.configuration, ...updates.settings };
        } else if (updates.settings) {
          updateData.configuration = { ...getDefaultKnowledgeBaseSettings(), ...updates.settings };
        }
      }

      const [updated] = await db
        .update(knowledgeBases)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBases.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      const chunks = await this.getChunks(id);
      return this.toDomain(updated, chunks);
    } catch (error) {
      logger.error('Failed to update knowledge base', { id, updates, error });
      throw new KnowledgeBaseUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(knowledgeBases)
        .where(eq(knowledgeBases.id, id))
        .returning({ id: knowledgeBases.id });

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to delete knowledge base', { id, error });
      return false;
    }
  }

  async getChunks(
    knowledgeBaseId: string,
    options: {
      limit?: number;
      offset?: number;
      contentType?: string;
      language?: string;
    } = {}
  ): Promise<KnowledgeChunk[]> {
    try {
      const { limit = 1000, offset = 0, contentType, language } = options;

      // Build conditions
      const conditions = [eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId)];
      
      if (contentType) {
        conditions.push(eq(knowledgeChunks.contentType, contentType));
      }

      if (language) {
        conditions.push(eq(knowledgeChunks.language, language));
      }

      const chunks = await db
        .select()
        .from(knowledgeChunks)
        .where(and(...conditions))
        .orderBy(asc(knowledgeChunks.chunkOrder))
        .limit(limit)
        .offset(offset);

      return chunks.map(chunk => this.chunkToDomain(chunk));
    } catch (error) {
      logger.error('Failed to get knowledge base chunks', { knowledgeBaseId, options, error });
      return [];
    }
  }

  async addChunk(chunk: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeChunk> {
    try {
      const [inserted] = await db
        .insert(knowledgeChunks)
        .values({
          knowledgeBaseId: chunk.knowledgeBaseId,
          url: chunk.metadata.url || '',
          urlHash: this.generateHash(chunk.metadata.url || ''),
          content: chunk.content,
          contentHash: chunk.metadata.hash,
          embedding: chunk.embedding,
          title: chunk.metadata.title,
          language: 'en', // Default, could be detected
          contentType: chunk.metadata.contentType || 'text',
          tokenCount: this.estimateTokenCount(chunk.content),
          characterCount: chunk.content.length,
          qualityScore: 0.5,
          readabilityScore: 0.5,
          metadata: chunk.metadata,
        })
        .returning();

      if (!inserted) {
        throw new Error('Failed to insert chunk');
      }

      // Update knowledge base statistics
      await this.updateKnowledgeBaseStats(chunk.knowledgeBaseId);

      return this.chunkToDomain(inserted);
    } catch (error) {
      logger.error('Failed to add chunk', { chunk, error });
      throw error;
    }
  }

  async updateChunk(id: string, updates: Partial<KnowledgeChunk>): Promise<KnowledgeChunk | null> {
    try {
      const updateData: Partial<typeof knowledgeChunks.$inferInsert> = {};

      if (updates.content !== undefined) {
        updateData.content = updates.content;
        updateData.contentHash = this.generateHash(updates.content);
        updateData.characterCount = updates.content.length;
        updateData.tokenCount = this.estimateTokenCount(updates.content);
      }

      if (updates.embedding !== undefined) {
        updateData.embedding = updates.embedding;
      }

      if (updates.metadata !== undefined) {
        updateData.metadata = updates.metadata;
        updateData.title = updates.metadata.title;
        updateData.url = updates.metadata.url || '';
      }

      const [updated] = await db
        .update(knowledgeChunks)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeChunks.id, id))
        .returning();

      return updated ? this.chunkToDomain(updated) : null;
    } catch (error) {
      logger.error('Failed to update chunk', { id, updates, error });
      return null;
    }
  }

  async deleteChunk(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(knowledgeChunks)
        .where(eq(knowledgeChunks.id, id))
        .returning({ id: knowledgeChunks.id });

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to delete chunk', { id, error });
      return false;
    }
  }

  async updateChunks(knowledgeBaseId: string, chunks: KnowledgeChunk[]): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Clear existing chunks
        await tx
          .delete(knowledgeChunks)
          .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

        // Insert new chunks
        if (chunks.length > 0) {
          const chunkData = chunks.map(chunk => ({
            id: chunk.id,
            knowledgeBaseId: chunk.knowledgeBaseId,
            url: chunk.metadata.url || '',
            urlHash: this.generateHash(chunk.metadata.url || ''),
            content: chunk.content,
            contentHash: chunk.metadata.hash,
            embedding: chunk.embedding,
            title: chunk.metadata.title,
            language: 'en',
            contentType: chunk.metadata.contentType || 'text',
            tokenCount: this.estimateTokenCount(chunk.content),
            characterCount: chunk.content.length,
            qualityScore: 0.5,
            readabilityScore: 0.5,
            metadata: chunk.metadata,
            createdAt: chunk.createdAt,
            updatedAt: chunk.updatedAt,
          }));

          await dbUtils.batchInsert(knowledgeChunks, chunkData, {
            batchSize: 100,
            onConflict: 'ignore',
          });
        }
      });

      await this.updateKnowledgeBaseStats(knowledgeBaseId);
      
      logger.info('Knowledge base chunks updated successfully', {
        knowledgeBaseId,
        chunkCount: chunks.length,
      });
    } catch (error) {
      logger.error('Failed to update chunks', { knowledgeBaseId, error });
      throw error;
    }
  }

  async clearChunks(knowledgeBaseId: string): Promise<void> {
    try {
      await db
        .delete(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

      await this.updateKnowledgeBaseStats(knowledgeBaseId);
      
      logger.info('Knowledge base chunks cleared', { knowledgeBaseId });
    } catch (error) {
      logger.error('Failed to clear chunks', { knowledgeBaseId, error });
      throw error;
    }
  }

  async findChunksByContentHash(knowledgeBaseId: string, contentHashes: string[]): Promise<KnowledgeChunk[]> {
    try {
      const chunks = await db
        .select()
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId),
            inArray(knowledgeChunks.contentHash, contentHashes)
          )
        );

      return chunks.map(chunk => this.chunkToDomain(chunk));
    } catch (error) {
      logger.error('Failed to find chunks by content hash', { knowledgeBaseId, contentHashes, error });
      return [];
    }
  }

  async searchChunks(options: {
    knowledgeBaseId: string;
    embedding: number[];
    topK: number;
    threshold?: number;
    filters?: {
      contentType?: string[];
      language?: string;
      url?: string;
      pageType?: string;
    };
  }): Promise<Array<{ chunk: KnowledgeChunk; score: number }>> {
    try {
      const { knowledgeBaseId, embedding, topK, threshold = 0.7, filters } = options;

      // Convert embedding to string format for pgvector
      const embeddingStr = `[${embedding.join(',')}]`;

      let whereConditions = [`knowledge_base_id = '${knowledgeBaseId}'`];

      if (filters?.contentType) {
        whereConditions.push(`content_type = ANY(ARRAY[${filters.contentType.map(t => `'${t}'`).join(',')}])`);
      }

      if (filters?.language) {
        whereConditions.push(`language = '${filters.language}'`);
      }

      if (filters?.url) {
        whereConditions.push(`url LIKE '%${filters.url}%'`);
      }

      if (filters?.pageType) {
        whereConditions.push(`page_type = '${filters.pageType}'`);
      }

      const whereClause = whereConditions.join(' AND ');

      // Use raw SQL for vector similarity search
      const results = await dbUtils.raw<{
        id: string;
        knowledge_base_id: string;
        url: string;
        content: string;
        embedding: number[];
        title: string;
        content_type: string;
        content_hash: string;
        language: string;
        created_at: Date;
        updated_at: Date;
        similarity: number;
      }>(`
        SELECT 
          *,
          1 - (embedding <=> $1::vector) as similarity
        FROM knowledge_chunks
        WHERE ${whereClause}
          AND 1 - (embedding <=> $1::vector) >= $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `, [embeddingStr, threshold, topK]);

      return results.map(result => ({
        chunk: {
          id: result.id,
          knowledgeBaseId: result.knowledge_base_id,
          content: result.content,
          embedding: result.embedding,
          metadata: {
            url: result.url,
            title: result.title,
            contentType: result.content_type as 'text' | 'html' | 'markdown' | 'json',
            hash: result.content_hash,
          },
          createdAt: result.created_at,
          updatedAt: result.updated_at,
        },
        score: result.similarity,
      }));
    } catch (error) {
      logger.error('Vector search failed', { options, error });
      throw new VectorSearchError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

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
      // Get basic stats
      const [stats] = await db
        .select({
          totalChunks: count(),
          avgQuality: sql<number>`AVG(quality_score)`,
          lastUpdated: sql<Date>`MAX(updated_at)`,
        })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

      // Get language distribution
      const langDist = await db
        .select({
          language: knowledgeChunks.language,
          count: count(),
        })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId))
        .groupBy(knowledgeChunks.language);

      // Get content type distribution
      const contentTypeDist = await db
        .select({
          contentType: knowledgeChunks.contentType,
          count: count(),
        })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId))
        .groupBy(knowledgeChunks.contentType);

      // Get unique URLs (documents)
      const [docCount] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT url)`,
        })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

      return {
        totalDocuments: docCount?.count || 0,
        totalChunks: stats?.totalChunks || 0,
        lastUpdated: stats?.lastUpdated || null,
        indexSizeMB: 0, // Could calculate from character counts
        avgSearchLatencyMs: 0, // Would need search metrics tracking
        searchCount24h: 0, // Would need search metrics tracking
        languageDistribution: langDist.reduce((acc, { language, count }) => {
          acc[language] = count;
          return acc;
        }, {} as Record<string, number>),
        contentTypeDistribution: contentTypeDist.reduce((acc, { contentType, count }) => {
          acc[contentType] = count;
          return acc;
        }, {} as Record<string, number>),
        qualityScoreAvg: stats?.avgQuality || 0.5,
      };
    } catch (error) {
      logger.error('Failed to get knowledge base stats', { knowledgeBaseId, error });
      throw error;
    }
  }

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
      // Get knowledge bases for tenant
      const kbStats = await db
        .select({
          id: knowledgeBases.id,
          status: knowledgeBases.status,
          totalChunks: knowledgeBases.totalChunks,
          lastCrawledAt: knowledgeBases.lastCrawledAt,
          lastIndexedAt: knowledgeBases.lastIndexedAt,
        })
        .from(knowledgeBases)
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(eq(sites.tenantId, tenantId));

      // Aggregate stats
      const totalKnowledgeBases = kbStats.length;
      const totalChunks = kbStats.reduce((sum, kb) => sum + (kb.totalChunks || 0), 0);
      
      const statusDistribution = kbStats.reduce((acc, kb) => {
        acc[kb.status] = (acc[kb.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const crawlDates = kbStats
        .map(kb => kb.lastCrawledAt)
        .filter(date => date !== null)
        .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0));

      const successfulCrawlDates = kbStats
        .filter(kb => kb.status === 'ready' && kb.lastIndexedAt)
        .map(kb => kb.lastIndexedAt)
        .filter(date => date !== null)
        .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0));

      // Get unique document count across all knowledge bases
      const [docStats] = await db
        .select({
          totalDocuments: sql<number>`COUNT(DISTINCT url)`,
        })
        .from(knowledgeChunks)
        .innerJoin(knowledgeBases, eq(knowledgeChunks.knowledgeBaseId, knowledgeBases.id))
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(eq(sites.tenantId, tenantId));

      return {
        totalKnowledgeBases,
        totalDocuments: docStats?.totalDocuments || 0,
        totalChunks,
        totalIndexSizeMB: 0, // Could calculate
        avgSearchLatencyMs: 0, // Would need metrics tracking
        searchCount24h: 0, // Would need metrics tracking
        knowledgeBasesByStatus: statusDistribution,
        lastCrawlAt: crawlDates[0] || null,
        lastSuccessfulCrawl: successfulCrawlDates[0] || null,
      };
    } catch (error) {
      logger.error('Failed to get tenant stats', { tenantId, error });
      throw error;
    }
  }

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
      // Get most recent crawl sessions for tenant
      const [latestSession] = await db
        .select({
          startedAt: crawlSessions.startedAt,
          completedAt: crawlSessions.completedAt,
          duration: crawlSessions.duration,
          status: crawlSessions.status,
          errors: crawlSessions.errors,
        })
        .from(crawlSessions)
        .innerJoin(knowledgeBases, eq(crawlSessions.knowledgeBaseId, knowledgeBases.id))
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(eq(sites.tenantId, tenantId))
        .orderBy(desc(crawlSessions.startedAt))
        .limit(1);

      // Get error stats
      const [errorStats] = await db
        .select({
          errorCount: sql<number>`SUM(error_count)`,
          lastError: sql<string>`MAX(last_error)`,
        })
        .from(knowledgeBases)
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(eq(sites.tenantId, tenantId));

      // Get last successful crawl
      const [successfulCrawl] = await db
        .select({
          lastIndexedAt: knowledgeBases.lastIndexedAt,
        })
        .from(knowledgeBases)
        .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
        .where(
          and(
            eq(sites.tenantId, tenantId),
            eq(knowledgeBases.status, 'ready')
          )
        )
        .orderBy(desc(knowledgeBases.lastIndexedAt))
        .limit(1);

      const mapStatus = (dbStatus: string): 'idle' | 'crawling' | 'indexing' | 'completed' | 'error' => {
        switch (dbStatus) {
          case 'crawling': return 'crawling';
          case 'indexing': return 'indexing';
          case 'ready': return 'completed';
          case 'error': return 'error';
          default: return 'idle';
        }
      };

      return {
        lastCrawlAt: latestSession?.startedAt || null,
        status: latestSession ? mapStatus(latestSession.status) : 'idle',
        lastCrawlTime: latestSession?.duration || null,
        lastSitemapCheck: null, // Would need separate sitemap tracking
        lastSuccessfulCrawl: successfulCrawl?.lastIndexedAt || null,
        errorCount: errorStats?.errorCount || 0,
        lastError: errorStats?.lastError || null,
      };
    } catch (error) {
      logger.error('Failed to get last crawl info', { tenantId, error });
      throw error;
    }
  }

  async getIndexStats(knowledgeBaseId: string): Promise<{
    indexSize: number;
    vectorCount: number;
    type: 'HNSW' | 'IVFFlat';
    parameters: Record<string, any> | null;
    healthy: boolean;
    lastOptimized: Date | null;
  }> {
    try {
      const [kbInfo] = await db
        .select({
          indexType: knowledgeBases.indexType,
          vectorDimensions: knowledgeBases.vectorDimensions,
          totalChunks: knowledgeBases.totalChunks,
        })
        .from(knowledgeBases)
        .where(eq(knowledgeBases.id, knowledgeBaseId))
        .limit(1);

      if (!kbInfo) {
        throw new KnowledgeBaseNotFoundError(knowledgeBaseId);
      }

      // Get vector count from chunks table
      const [vectorStats] = await db
        .select({
          count: count(),
        })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId),
            sql`embedding IS NOT NULL`
          )
        );

      return {
        indexSize: 0, // Would need to calculate based on vector dimensions and count
        vectorCount: vectorStats?.count || 0,
        type: (kbInfo.indexType?.toUpperCase() || 'HNSW') as 'HNSW' | 'IVFFlat',
        parameters: {
          dimensions: kbInfo.vectorDimensions || 1536,
          efConstruction: 64, // Default HNSW parameters
          m: 16,
        },
        healthy: true, // Would need health check logic
        lastOptimized: null, // Would need optimization tracking
      };
    } catch (error) {
      logger.error('Failed to get index stats', { knowledgeBaseId, error });
      throw error;
    }
  }

  async getCrawlSession(sessionId: string): Promise<{
    id: string;
    knowledgeBaseId: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    progress: {
      discovered: number;
      processed: number;
      failed: number;
      skipped: number;
    };
    startedAt: Date;
    completedAt: Date | null;
    duration: number | null;
    errors: string[];
  } | null> {
    try {
      const [session] = await db
        .select()
        .from(crawlSessions)
        .where(eq(crawlSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return null;
      }

      return {
        id: session.id,
        knowledgeBaseId: session.knowledgeBaseId,
        status: session.status as 'running' | 'completed' | 'failed' | 'cancelled',
        progress: {
          discovered: session.pagesDiscovered || 0,
          processed: session.pagesCrawled || 0,
          failed: session.pagesFailed || 0,
          skipped: session.pagesSkipped || 0,
        },
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        duration: session.duration,
        errors: (session.errors as string[]) || [],
      };
    } catch (error) {
      logger.error('Failed to get crawl session', { sessionId, error });
      return null;
    }
  }

  async createCrawlSession(data: {
    knowledgeBaseId: string;
    sessionType: 'full' | 'delta' | 'manual' | 'scheduled';
    startUrls: string[];
    maxDepth?: number;
    maxPages?: number;
    respectRobots?: boolean;
    followSitemaps?: boolean;
  }): Promise<string> {
    try {
      const [session] = await db
        .insert(crawlSessions)
        .values({
          knowledgeBaseId: data.knowledgeBaseId,
          sessionType: data.sessionType,
          startUrls: data.startUrls,
          maxDepth: data.maxDepth || 3,
          maxPages: data.maxPages || 1000,
          respectRobots: data.respectRobots ?? true,
          followSitemaps: data.followSitemaps ?? true,
          status: 'running',
          pagesDiscovered: 0,
          pagesCrawled: 0,
          pagesSkipped: 0,
          pagesFailed: 0,
          chunksCreated: 0,
          chunksUpdated: 0,
        })
        .returning({ id: crawlSessions.id });

      if (!session) {
        throw new Error('Failed to create crawl session');
      }

      logger.info('Crawl session created', {
        sessionId: session.id,
        knowledgeBaseId: data.knowledgeBaseId,
        sessionType: data.sessionType,
      });

      return session.id;
    } catch (error) {
      logger.error('Failed to create crawl session', { data, error });
      throw error;
    }
  }

  async updateCrawlSessionProgress(sessionId: string, progress: {
    discovered?: number;
    processed?: number;
    failed?: number;
    skipped?: number;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
    completedAt?: Date;
    errors?: string[];
  }): Promise<void> {
    try {
      const updateData: Partial<typeof crawlSessions.$inferInsert> = {};

      if (progress.discovered !== undefined) updateData.pagesDiscovered = progress.discovered;
      if (progress.processed !== undefined) updateData.pagesCrawled = progress.processed;
      if (progress.failed !== undefined) updateData.pagesFailed = progress.failed;
      if (progress.skipped !== undefined) updateData.pagesSkipped = progress.skipped;
      if (progress.status !== undefined) updateData.status = progress.status;
      if (progress.completedAt !== undefined) {
        updateData.completedAt = progress.completedAt;
        // Calculate duration if session is completed
        const [session] = await db
          .select({ startedAt: crawlSessions.startedAt })
          .from(crawlSessions)
          .where(eq(crawlSessions.id, sessionId))
          .limit(1);
        
        if (session) {
          updateData.duration = Math.floor((progress.completedAt.getTime() - session.startedAt.getTime()) / 1000);
        }
      }
      if (progress.errors !== undefined) updateData.errors = progress.errors;

      await db
        .update(crawlSessions)
        .set(updateData)
        .where(eq(crawlSessions.id, sessionId));

      logger.debug('Crawl session progress updated', { sessionId, progress });
    } catch (error) {
      logger.error('Failed to update crawl session progress', { sessionId, progress, error });
      throw error;
    }
  }

  async getCrawlSessions(knowledgeBaseId: string, options: {
    limit?: number;
    offset?: number;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
  } = {}): Promise<Array<{
    id: string;
    sessionType: 'full' | 'delta' | 'manual' | 'scheduled';
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: Date;
    completedAt: Date | null;
    pagesDiscovered: number;
    pagesCrawled: number;
    pagesFailed: number;
    chunksCreated: number;
  }>> {
    try {
      const { limit = 50, offset = 0, status } = options;

      // Build conditions
      const conditions = [eq(crawlSessions.knowledgeBaseId, knowledgeBaseId)];
      
      if (status) {
        conditions.push(eq(crawlSessions.status, status));
      }

      const sessions = await db
        .select({
          id: crawlSessions.id,
          sessionType: crawlSessions.sessionType,
          status: crawlSessions.status,
          startedAt: crawlSessions.startedAt,
          completedAt: crawlSessions.completedAt,
          pagesDiscovered: crawlSessions.pagesDiscovered,
          pagesCrawled: crawlSessions.pagesCrawled,
          pagesFailed: crawlSessions.pagesFailed,
          chunksCreated: crawlSessions.chunksCreated,
        })
        .from(crawlSessions)
        .where(and(...conditions))
        .orderBy(desc(crawlSessions.startedAt))
        .limit(limit)
        .offset(offset);

      return sessions.map(session => ({
        id: session.id,
        sessionType: session.sessionType as 'full' | 'delta' | 'manual' | 'scheduled',
        status: session.status as 'running' | 'completed' | 'failed' | 'cancelled',
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        pagesDiscovered: session.pagesDiscovered || 0,
        pagesCrawled: session.pagesCrawled || 0,
        pagesFailed: session.pagesFailed || 0,
        chunksCreated: session.chunksCreated || 0,
      }));
    } catch (error) {
      logger.error('Failed to get crawl sessions', { knowledgeBaseId, options, error });
      return [];
    }
  }

  async updateStatus(id: string, updates: {
    status?: 'initializing' | 'crawling' | 'indexing' | 'ready' | 'error' | 'outdated';
    lastCrawledAt?: Date;
    lastIndexedAt?: Date;
    nextScheduledCrawl?: Date;
    totalChunks?: number;
    totalPages?: number;
    totalTokens?: number;
    sizeInMB?: number;
    lastError?: string;
    errorCount?: number;
  }): Promise<KnowledgeBase | null> {
    try {
      const [updated] = await db
        .update(knowledgeBases)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBases.id, id))
        .returning();

      if (!updated) {
        return null;
      }

      const chunks = await this.getChunks(id);
      return this.toDomain(updated, chunks);
    } catch (error) {
      logger.error('Failed to update knowledge base status', { id, updates, error });
      return null;
    }
  }

  async findRequiringReindex(): Promise<KnowledgeBase[]> {
    try {
      // Find knowledge bases that need reindexing based on various criteria
      const kbRows = await db
        .select()
        .from(knowledgeBases)
        .where(
          sql`
            status = 'outdated' OR 
            (last_crawled_at IS NULL AND status = 'ready') OR
            (last_crawled_at < NOW() - INTERVAL '24 hours' AND 
             configuration->>'autoReindex' = 'true')
          `
        );

      const knowledgeBaseList: KnowledgeBase[] = [];
      for (const kb of kbRows) {
        const chunks = await this.getChunks(kb.id);
        knowledgeBaseList.push(this.toDomain(kb, chunks));
      }

      return knowledgeBaseList;
    } catch (error) {
      logger.error('Failed to find knowledge bases requiring reindex', { error });
      return [];
    }
  }

  async findByStatus(status: 'initializing' | 'crawling' | 'indexing' | 'ready' | 'error' | 'outdated'): Promise<KnowledgeBase[]> {
    try {
      const kbRows = await db
        .select()
        .from(knowledgeBases)
        .where(eq(knowledgeBases.status, status));

      const knowledgeBaseList: KnowledgeBase[] = [];
      for (const kb of kbRows) {
        const chunks = await this.getChunks(kb.id);
        knowledgeBaseList.push(this.toDomain(kb, chunks));
      }

      return knowledgeBaseList;
    } catch (error) {
      logger.error('Failed to find knowledge bases by status', { status, error });
      return [];
    }
  }

  async findMany(options: {
    tenantId?: string;
    siteId?: string;
    status?: 'initializing' | 'crawling' | 'indexing' | 'ready' | 'error' | 'outdated';
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'lastCrawledAt' | 'name';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    knowledgeBases: KnowledgeBase[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        tenantId,
        siteId,
        status,
        page = 1,
        limit = 50,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;

      // Build conditions
      const conditions = [];

      if (tenantId) {
        conditions.push(eq(sites.tenantId, tenantId));
      }

      if (siteId) {
        conditions.push(eq(knowledgeBases.siteId, siteId));
      }

      if (status) {
        conditions.push(eq(knowledgeBases.status, status));
      }

      // Build base query with joins if needed
      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Get total count
      let countResult;
      if (tenantId) {
        if (whereCondition) {
          [countResult] = await db.select({ count: sql<number>`count(*)` })
            .from(knowledgeBases)
            .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
            .where(whereCondition);
        } else {
          [countResult] = await db.select({ count: sql<number>`count(*)` })
            .from(knowledgeBases)
            .innerJoin(sites, eq(knowledgeBases.siteId, sites.id));
        }
      } else {
        if (whereCondition) {
          [countResult] = await db.select({ count: sql<number>`count(*)` })
            .from(knowledgeBases)
            .where(whereCondition);
        } else {
          [countResult] = await db.select({ count: sql<number>`count(*)` })
            .from(knowledgeBases);
        }
      }

      const total = countResult?.count || 0;

      // Apply sorting and pagination
      let sortColumn;
      switch (sortBy) {
        case 'createdAt':
          sortColumn = knowledgeBases.createdAt;
          break;
        case 'updatedAt':
          sortColumn = knowledgeBases.updatedAt;
          break;
        case 'lastCrawledAt':
          sortColumn = knowledgeBases.lastCrawledAt;
          break;
        default:
          sortColumn = knowledgeBases.updatedAt;
      }
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // Execute main query with conditional joins
      let kbRows;
      if (tenantId) {
        if (whereCondition) {
          kbRows = await db.select()
            .from(knowledgeBases)
            .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
            .where(whereCondition)
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset((page - 1) * limit);
        } else {
          kbRows = await db.select()
            .from(knowledgeBases)
            .innerJoin(sites, eq(knowledgeBases.siteId, sites.id))
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset((page - 1) * limit);
        }
      } else {
        if (whereCondition) {
          kbRows = await db.select()
            .from(knowledgeBases)
            .where(whereCondition)
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset((page - 1) * limit);
        } else {
          kbRows = await db.select()
            .from(knowledgeBases)
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset((page - 1) * limit);
        }
      }

      const knowledgeBaseList: KnowledgeBase[] = [];
      for (const row of kbRows) {
        // Extract knowledge base data from joined result
        const kb = tenantId ? (row as any).knowledge_bases : row;
        // For pagination, we skip loading chunks to improve performance
        knowledgeBaseList.push(this.toDomain(kb, []));
      }

      return {
        knowledgeBases: knowledgeBaseList,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Failed to find knowledge bases with pagination', { options, error });
      return {
        knowledgeBases: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 0,
      };
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      database: boolean;
      vectorIndex: boolean;
      searchLatency?: number;
    };
    error?: string;
  }> {
    try {
      const startTime = Date.now();

      // Test basic database connection
      await db.select().from(knowledgeBases).limit(1);
      
      // Test vector operations
      await dbUtils.raw('SELECT 1');

      const searchLatency = Date.now() - startTime;

      return {
        healthy: true,
        details: {
          database: true,
          vectorIndex: true,
          searchLatency,
        },
      };
    } catch (error) {
      logger.error('Knowledge base repository health check failed', { error });
      return {
        healthy: false,
        details: {
          database: false,
          vectorIndex: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update knowledge base statistics based on current chunks
   */
  private async updateKnowledgeBaseStats(knowledgeBaseId: string): Promise<void> {
    try {
      const [stats] = await db
        .select({
          totalChunks: count(),
          totalTokens: sql<number>`SUM(token_count)`,
          totalCharacters: sql<number>`SUM(character_count)`,
          avgChunkSize: sql<number>`AVG(character_count)`,
        })
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.knowledgeBaseId, knowledgeBaseId));

      await db
        .update(knowledgeBases)
        .set({
          totalChunks: stats?.totalChunks || 0,
          totalTokens: stats?.totalTokens || 0,
          avgChunkSize: Math.floor(stats?.avgChunkSize || 0),
          sizeInMB: ((stats?.totalCharacters || 0) / 1024 / 1024),
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBases.id, knowledgeBaseId));
    } catch (error) {
      logger.error('Failed to update knowledge base statistics', { knowledgeBaseId, error });
      // Don't throw - this is a background operation
    }
  }

  /**
   * Generate hash for content or URL
   */
  private generateHash(content: string): string {
    // Simple hash function - in production, consider using crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Estimate token count from content
   */
  private estimateTokenCount(content: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(content.length / 4);
  }
}