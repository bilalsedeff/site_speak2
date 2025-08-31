import { z } from 'zod';

export interface KnowledgeChunk {
  id: string;
  knowledgeBaseId: string;
  content: string;
  embedding: number[];
  metadata: {
    url?: string;
    title?: string;
    section?: string;
    contentType: 'text' | 'html' | 'markdown' | 'json';
    lastModified?: Date;
    hash: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IndexingStatus {
  status: 'idle' | 'crawling' | 'processing' | 'indexing' | 'completed' | 'error';
  progress: number; // 0-100
  totalUrls: number;
  processedUrls: number;
  failedUrls: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

/**
 * Knowledge Base domain entity
 */
export class KnowledgeBase {
  constructor(
    public readonly id: string,
    public readonly siteId: string,
    public readonly tenantId: string,
    public name: string,
    public description: string,
    public baseUrl: string,
    public chunks: KnowledgeChunk[],
    public indexingStatus: IndexingStatus,
    public settings: {
      crawlDepth: number;
      crawlDelay: number;
      excludePatterns: string[];
      includePatterns: string[];
      contentTypes: string[];
      maxChunkSize: number;
      chunkOverlap: number;
      embeddingModel: string;
      autoReindex: boolean;
      reindexInterval: number; // hours
    },
    public readonly createdAt: Date,
    public updatedAt: Date,
    public lastIndexedAt?: Date,
    public readonly isActive: boolean = true,
  ) {}

  /**
   * Update knowledge base information
   */
  update(updates: {
    name?: string;
    description?: string;
    baseUrl?: string;
    settings?: Partial<KnowledgeBase['settings']>;
  }): KnowledgeBase {
    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      updates.name ?? this.name,
      updates.description ?? this.description,
      updates.baseUrl ?? this.baseUrl,
      this.chunks,
      this.indexingStatus,
      updates.settings ? { ...this.settings, ...updates.settings } : this.settings,
      this.createdAt,
      new Date(), // updatedAt
      this.lastIndexedAt,
      this.isActive,
    );
  }

  /**
   * Update indexing status
   */
  updateIndexingStatus(status: Partial<IndexingStatus>): KnowledgeBase {
    const newStatus: IndexingStatus = { ...this.indexingStatus, ...status };
    
    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      this.chunks,
      newStatus,
      this.settings,
      this.createdAt,
      new Date(),
      this.lastIndexedAt,
      this.isActive,
    );
  }

  /**
   * Mark indexing as started
   */
  startIndexing(totalUrls: number): KnowledgeBase {
    return this.updateIndexingStatus({
      status: 'crawling',
      progress: 0,
      totalUrls,
      processedUrls: 0,
      failedUrls: 0,
      startedAt: new Date(),
      completedAt: undefined,
      errorMessage: undefined,
    });
  }

  /**
   * Update indexing progress
   */
  updateIndexingProgress(processedUrls: number, failedUrls: number = 0): KnowledgeBase {
    const progress = this.indexingStatus.totalUrls > 0 
      ? Math.floor((processedUrls / this.indexingStatus.totalUrls) * 100)
      : 0;

    return this.updateIndexingStatus({
      progress,
      processedUrls,
      failedUrls,
    });
  }

  /**
   * Complete indexing
   */
  completeIndexing(): KnowledgeBase {
    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      this.chunks,
      {
        ...this.indexingStatus,
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      },
      this.settings,
      this.createdAt,
      new Date(),
      new Date(), // lastIndexedAt
      this.isActive,
    );
  }

  /**
   * Mark indexing as failed
   */
  failIndexing(error: string): KnowledgeBase {
    return this.updateIndexingStatus({
      status: 'error',
      errorMessage: error,
      completedAt: new Date(),
    });
  }

  /**
   * Add chunk to knowledge base
   */
  addChunk(chunk: Omit<KnowledgeChunk, 'id' | 'knowledgeBaseId' | 'createdAt' | 'updatedAt'>): KnowledgeBase {
    const newChunk: KnowledgeChunk = {
      ...chunk,
      id: crypto.randomUUID(),
      knowledgeBaseId: this.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      [...this.chunks, newChunk],
      this.indexingStatus,
      this.settings,
      this.createdAt,
      new Date(),
      this.lastIndexedAt,
      this.isActive,
    );
  }

  /**
   * Remove chunk from knowledge base
   */
  removeChunk(chunkId: string): KnowledgeBase {
    const updatedChunks = this.chunks.filter(chunk => chunk.id !== chunkId);

    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      updatedChunks,
      this.indexingStatus,
      this.settings,
      this.createdAt,
      new Date(),
      this.lastIndexedAt,
      this.isActive,
    );
  }

  /**
   * Clear all chunks
   */
  clearChunks(): KnowledgeBase {
    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      [], // empty chunks
      this.indexingStatus,
      this.settings,
      this.createdAt,
      new Date(),
      this.lastIndexedAt,
      this.isActive,
    );
  }

  /**
   * Check if knowledge base needs reindexing
   */
  needsReindexing(): boolean {
    if (!this.settings.autoReindex) return false;
    if (!this.lastIndexedAt) return true;

    const reindexIntervalMs = this.settings.reindexInterval * 60 * 60 * 1000;
    const timeSinceLastIndex = Date.now() - this.lastIndexedAt.getTime();
    
    return timeSinceLastIndex >= reindexIntervalMs;
  }

  /**
   * Get knowledge base statistics
   */
  getStatistics() {
    return {
      totalChunks: this.chunks.length,
      totalContentLength: this.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0),
      averageChunkSize: this.chunks.length > 0 
        ? Math.floor(this.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / this.chunks.length)
        : 0,
      contentTypes: this.getContentTypeDistribution(),
      lastIndexed: this.lastIndexedAt,
      indexingStatus: this.indexingStatus,
      needsReindexing: this.needsReindexing(),
    };
  }

  /**
   * Get content type distribution
   */
  private getContentTypeDistribution(): Record<string, number> {
    return this.chunks.reduce((acc, chunk) => {
      const type = chunk.metadata.contentType;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Deactivate knowledge base
   */
  deactivate(): KnowledgeBase {
    return new KnowledgeBase(
      this.id,
      this.siteId,
      this.tenantId,
      this.name,
      this.description,
      this.baseUrl,
      this.chunks,
      this.indexingStatus,
      this.settings,
      this.createdAt,
      new Date(),
      this.lastIndexedAt,
      false, // isActive
    );
  }
}

/**
 * Default knowledge base settings
 */
export const getDefaultKnowledgeBaseSettings = () => ({
  crawlDepth: 3,
  crawlDelay: 1000, // ms
  excludePatterns: [
    '*/admin/*',
    '*/wp-admin/*',
    '*/wp-content/uploads/*',
    '*.pdf',
    '*.doc',
    '*.docx',
    '*.xls',
    '*.xlsx',
    '*.ppt',
    '*.pptx',
    '*.zip',
    '*.rar',
    '*.tar.gz',
  ],
  includePatterns: ['*'],
  contentTypes: ['text/html', 'text/plain', 'application/json'],
  maxChunkSize: 1000,
  chunkOverlap: 100,
  embeddingModel: 'text-embedding-3-small',
  autoReindex: true,
  reindexInterval: 24, // hours
});

/**
 * Validation schemas
 */
export const CreateKnowledgeBaseSchema = z.object({
  siteId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  baseUrl: z.string().url(),
  settings: z.object({
    crawlDepth: z.number().int().min(1).max(10).optional(),
    crawlDelay: z.number().int().min(100).max(10000).optional(),
    excludePatterns: z.array(z.string()).optional(),
    includePatterns: z.array(z.string()).optional(),
    maxChunkSize: z.number().int().min(100).max(5000).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
    embeddingModel: z.string().optional(),
    autoReindex: z.boolean().optional(),
    reindexInterval: z.number().int().min(1).max(168).optional(), // 1 hour to 1 week
  }).optional(),
});

export const UpdateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  baseUrl: z.string().url().optional(),
  settings: z.object({
    crawlDepth: z.number().int().min(1).max(10).optional(),
    crawlDelay: z.number().int().min(100).max(10000).optional(),
    excludePatterns: z.array(z.string()).optional(),
    includePatterns: z.array(z.string()).optional(),
    maxChunkSize: z.number().int().min(100).max(5000).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
    embeddingModel: z.string().optional(),
    autoReindex: z.boolean().optional(),
    reindexInterval: z.number().int().min(1).max(168).optional(),
  }).optional(),
});

export type CreateKnowledgeBaseInput = z.infer<typeof CreateKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseInput = z.infer<typeof UpdateKnowledgeBaseSchema>;