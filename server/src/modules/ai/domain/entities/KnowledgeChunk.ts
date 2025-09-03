import { z } from 'zod';

/**
 * Knowledge Chunk Domain Entity
 * 
 * Represents a processed chunk of content with embedding and metadata.
 * Immutable entity following domain-driven design patterns.
 */
export class KnowledgeChunk {
  constructor(
    public readonly id: string,
    public readonly knowledgeBaseId: string,
    public readonly content: string,
    public readonly embedding: number[],
    public readonly metadata: ChunkMetadata,
    public readonly hierarchy: ChunkHierarchy,
    public readonly processing: ProcessingInfo,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  /**
   * Create a new chunk with updated content
   */
  updateContent(newContent: string, newEmbedding: number[]): KnowledgeChunk {
    return new KnowledgeChunk(
      this.id,
      this.knowledgeBaseId,
      newContent,
      newEmbedding,
      {
        ...this.metadata,
        hash: this.computeContentHash(newContent)
      },
      this.hierarchy,
      {
        ...this.processing,
        lastProcessedAt: new Date()
      },
      this.createdAt,
      new Date() // updatedAt
    );
  }

  /**
   * Update chunk metadata
   */
  updateMetadata(updates: Partial<ChunkMetadata>): KnowledgeChunk {
    return new KnowledgeChunk(
      this.id,
      this.knowledgeBaseId,
      this.content,
      this.embedding,
      { ...this.metadata, ...updates },
      this.hierarchy,
      this.processing,
      this.createdAt,
      new Date()
    );
  }

  /**
   * Update chunk hierarchy information
   */
  updateHierarchy(hierarchy: Partial<ChunkHierarchy>): KnowledgeChunk {
    return new KnowledgeChunk(
      this.id,
      this.knowledgeBaseId,
      this.content,
      this.embedding,
      this.metadata,
      { ...this.hierarchy, ...hierarchy },
      this.processing,
      this.createdAt,
      new Date()
    );
  }

  /**
   * Check if chunk content has changed based on hash
   */
  hasContentChanged(otherContent: string): boolean {
    return this.metadata.hash !== this.computeContentHash(otherContent);
  }

  /**
   * Get chunk statistics
   */
  getStatistics() {
    return {
      contentLength: this.content.length,
      tokenCount: this.processing.tokenCount,
      embeddingDimensions: this.embedding.length,
      qualityScore: this.processing.qualityScore,
      chunkLevel: this.hierarchy.level,
      lastProcessed: this.processing.lastProcessedAt,
    };
  }

  /**
   * Check if chunk is stale and needs reprocessing
   */
  isStale(maxAge: number = 7 * 24 * 60 * 60 * 1000): boolean { // 7 days default
    return Date.now() - this.processing.lastProcessedAt.getTime() > maxAge;
  }

  /**
   * Compute content hash for deduplication
   */
  private computeContentHash(content: string): string {
    // Simple hash function - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Chunk metadata interface
 */
export interface ChunkMetadata {
  url: string;
  canonicalUrl?: string;
  title?: string;
  section?: string;
  contentType: 'text' | 'json-ld' | 'code' | 'list' | 'table' | 'form' | 'navigation';
  pageType?: 'home' | 'product' | 'blog' | 'contact' | 'about' | 'service' | 'other';
  language: string;
  hash: string;
  lastModified?: Date;
  importance: 'high' | 'medium' | 'low';
  keywords?: string[];
  entities?: ExtractedEntity[];
}

/**
 * Chunk hierarchy information
 */
export interface ChunkHierarchy {
  parentChunkId?: string;
  order: number;
  level: number; // 0 = root, 1 = section, 2 = subsection, etc.
  selector?: string; // CSS selector where content was found
  hpath?: string; // Hierarchical path (e.g., "h1[0]/h2[1]/p[0]")
}

/**
 * Processing information
 */
export interface ProcessingInfo {
  tokenCount: number;
  characterCount: number;
  qualityScore: number; // 0.0 to 1.0
  readabilityScore?: number;
  extractionMethod: 'json-ld' | 'html' | 'markdown' | 'api';
  lastProcessedAt: Date;
  processingVersion: string; // Track algorithm version
}

/**
 * Extracted entity from structured data
 */
export interface ExtractedEntity {
  type: string; // schema.org type
  id?: string;
  name?: string;
  description?: string;
  properties: Record<string, any>;
  confidence: number; // 0.0 to 1.0
}

/**
 * Validation schemas
 */
export const ChunkMetadataSchema = z.object({
  url: z.string().url(),
  canonicalUrl: z.string().url().optional(),
  title: z.string().optional(),
  section: z.string().optional(),
  contentType: z.enum(['text', 'json-ld', 'code', 'list', 'table', 'form', 'navigation']),
  pageType: z.enum(['home', 'product', 'blog', 'contact', 'about', 'service', 'other']).optional(),
  language: z.string().min(2).max(5),
  hash: z.string(),
  lastModified: z.date().optional(),
  importance: z.enum(['high', 'medium', 'low']),
  keywords: z.array(z.string()).optional(),
  entities: z.array(z.any()).optional()
});

export const ChunkHierarchySchema = z.object({
  parentChunkId: z.string().uuid().optional(),
  order: z.number().int().min(0),
  level: z.number().int().min(0).max(10),
  selector: z.string().optional(),
  hpath: z.string().optional()
});

export const ProcessingInfoSchema = z.object({
  tokenCount: z.number().int().min(0),
  characterCount: z.number().int().min(0),
  qualityScore: z.number().min(0).max(1),
  readabilityScore: z.number().min(0).max(1).optional(),
  extractionMethod: z.enum(['json-ld', 'html', 'markdown', 'api']),
  lastProcessedAt: z.date(),
  processingVersion: z.string()
});

export const KnowledgeChunkSchema = z.object({
  id: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
  content: z.string().min(1),
  embedding: z.array(z.number()),
  metadata: ChunkMetadataSchema,
  hierarchy: ChunkHierarchySchema,
  processing: ProcessingInfoSchema,
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Factory function for creating chunks
 */
export function createKnowledgeChunk(
  data: Omit<ConstructorParameters<typeof KnowledgeChunk>[0], 'id' | 'createdAt' | 'updatedAt'>
): KnowledgeChunk {
  const now = new Date();
  return new KnowledgeChunk(
    crypto.randomUUID(),
    data.knowledgeBaseId,
    data.content,
    data.embedding,
    data.metadata,
    data.hierarchy,
    data.processing,
    now,
    now
  );
}