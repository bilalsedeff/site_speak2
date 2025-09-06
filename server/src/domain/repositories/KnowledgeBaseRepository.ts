import { KnowledgeBase, KnowledgeChunk, CreateKnowledgeBaseInput, UpdateKnowledgeBaseInput } from '../../modules/ai/domain/entities/KnowledgeBase';

/**
 * Knowledge Base repository interface
 */
export interface KnowledgeBaseRepository {
  /**
   * Find knowledge base by ID
   */
  findById(id: string): Promise<KnowledgeBase | null>;

  /**
   * Find knowledge base by site ID
   */
  findBySiteId(siteId: string): Promise<KnowledgeBase | null>;

  /**
   * Find knowledge bases by tenant ID
   */
  findByTenantId(tenantId: string): Promise<KnowledgeBase[]>;

  /**
   * Create new knowledge base
   */
  create(data: CreateKnowledgeBaseInput): Promise<KnowledgeBase>;

  /**
   * Update knowledge base
   */
  update(id: string, updates: UpdateKnowledgeBaseInput): Promise<KnowledgeBase | null>;

  /**
   * Delete knowledge base
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get knowledge base chunks
   */
  getChunks(knowledgeBaseId: string, options?: {
    limit?: number;
    offset?: number;
    contentType?: string;
    language?: string;
  }): Promise<KnowledgeChunk[]>;

  /**
   * Add chunk to knowledge base
   */
  addChunk(chunk: Omit<KnowledgeChunk, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeChunk>;

  /**
   * Update chunk
   */
  updateChunk(id: string, updates: Partial<KnowledgeChunk>): Promise<KnowledgeChunk | null>;

  /**
   * Delete chunk
   */
  deleteChunk(id: string): Promise<boolean>;

  /**
   * Update multiple chunks in batch
   */
  updateChunks(knowledgeBaseId: string, chunks: KnowledgeChunk[]): Promise<void>;

  /**
   * Clear all chunks from knowledge base
   */
  clearChunks(knowledgeBaseId: string): Promise<void>;

  /**
   * Find chunks by content hash for deduplication
   */
  findChunksByContentHash(knowledgeBaseId: string, contentHashes: string[]): Promise<KnowledgeChunk[]>;

  /**
   * Search chunks using vector similarity
   */
  searchChunks(options: {
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
  }): Promise<Array<{
    chunk: KnowledgeChunk;
    score: number;
  }>>;

  /**
   * Get knowledge base statistics
   */
  getStats(knowledgeBaseId: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    lastUpdated: Date | null;
    indexSizeMB: number;
    avgSearchLatencyMs: number;
    searchCount24h: number;
    languageDistribution: Record<string, number>;
    contentTypeDistribution: Record<string, number>;
    qualityScoreAvg: number;
  }>;

  /**
   * Get tenant-wide knowledge base statistics
   */
  getTenantStats(tenantId: string): Promise<{
    totalKnowledgeBases: number;
    totalDocuments: number;
    totalChunks: number;
    totalIndexSizeMB: number;
    avgSearchLatencyMs: number;
    searchCount24h: number;
    knowledgeBasesByStatus: Record<string, number>;
    lastCrawlAt: Date | null;
    lastSuccessfulCrawl: Date | null;
  }>;

  /**
   * Get last crawl information for tenant
   */
  getLastCrawlInfo(tenantId: string): Promise<{
    lastCrawlAt: Date | null;
    status: 'idle' | 'crawling' | 'indexing' | 'completed' | 'error';
    lastCrawlTime: number | null; // duration in seconds
    lastSitemapCheck: Date | null;
    lastSuccessfulCrawl: Date | null;
    errorCount: number;
    lastError: string | null;
  }>;

  /**
   * Get vector index statistics
   */
  getIndexStats(knowledgeBaseId: string): Promise<{
    indexSize: number;
    vectorCount: number;
    type: 'HNSW' | 'IVFFlat';
    parameters: Record<string, any> | null;
    healthy: boolean;
    lastOptimized: Date | null;
  }>;

  /**
   * Get crawl session by ID
   */
  getCrawlSession(sessionId: string): Promise<{
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
  } | null>;

  /**
   * Create crawl session
   */
  createCrawlSession(data: {
    knowledgeBaseId: string;
    sessionType: 'full' | 'delta' | 'manual' | 'scheduled';
    startUrls: string[];
    maxDepth?: number;
    maxPages?: number;
    respectRobots?: boolean;
    followSitemaps?: boolean;
  }): Promise<string>; // Returns session ID

  /**
   * Update crawl session progress
   */
  updateCrawlSessionProgress(sessionId: string, progress: {
    discovered?: number;
    processed?: number;
    failed?: number;
    skipped?: number;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
    completedAt?: Date;
    errors?: string[];
  }): Promise<void>;

  /**
   * Get crawl sessions for knowledge base
   */
  getCrawlSessions(knowledgeBaseId: string, options?: {
    limit?: number;
    offset?: number;
    status?: 'running' | 'completed' | 'failed' | 'cancelled';
  }): Promise<Array<{
    id: string;
    sessionType: 'full' | 'delta' | 'manual' | 'scheduled';
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: Date;
    completedAt: Date | null;
    pagesDiscovered: number;
    pagesCrawled: number;
    pagesFailed: number;
    chunksCreated: number;
  }>>;

  /**
   * Update knowledge base status and metadata
   */
  updateStatus(id: string, updates: {
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
  }): Promise<KnowledgeBase | null>;

  /**
   * Find knowledge bases that need reindexing
   */
  findRequiringReindex(): Promise<KnowledgeBase[]>;

  /**
   * Find knowledge bases by status
   */
  findByStatus(status: 'initializing' | 'crawling' | 'indexing' | 'ready' | 'error' | 'outdated'): Promise<KnowledgeBase[]>;

  /**
   * Get knowledge bases with pagination
   */
  findMany(options: {
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
  }>;

  /**
   * Health check for repository and underlying services
   */
  healthCheck(): Promise<{
    healthy: boolean;
    details: {
      database: boolean;
      vectorIndex: boolean;
      searchLatency?: number;
    };
    error?: string;
  }>;
}

/**
 * Knowledge base repository errors
 */
export class KnowledgeBaseNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Knowledge base not found: ${identifier}`);
    this.name = 'KnowledgeBaseNotFoundError';
  }
}

export class KnowledgeChunkNotFoundError extends Error {
  constructor(id: string) {
    super(`Knowledge chunk not found: ${id}`);
    this.name = 'KnowledgeChunkNotFoundError';
  }
}

export class CrawlSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Crawl session not found: ${sessionId}`);
    this.name = 'CrawlSessionNotFoundError';
  }
}

export class KnowledgeBaseCreateError extends Error {
  constructor(reason: string) {
    super(`Failed to create knowledge base: ${reason}`);
    this.name = 'KnowledgeBaseCreateError';
  }
}

export class KnowledgeBaseUpdateError extends Error {
  constructor(reason: string) {
    super(`Failed to update knowledge base: ${reason}`);
    this.name = 'KnowledgeBaseUpdateError';
  }
}

export class VectorSearchError extends Error {
  constructor(reason: string) {
    super(`Vector search failed: ${reason}`);
    this.name = 'VectorSearchError';
  }
}

export class IndexingError extends Error {
  constructor(reason: string) {
    super(`Knowledge base indexing error: ${reason}`);
    this.name = 'IndexingError';
  }
}