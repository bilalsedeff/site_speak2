import OpenAI from 'openai';
import { createLogger } from '../../../../shared/utils.js';
import { config } from '../../../../infrastructure/config';

const logger = createLogger({ service: 'embedding' });

export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  model: string;
}

export interface SimilaritySearchRequest {
  queryEmbedding: number[];
  embeddings: Array<{
    id: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>;
  topK: number;
  threshold?: number;
}

export interface SimilaritySearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Service for generating text embeddings using OpenAI
 */
export class EmbeddingService {
  private openai: OpenAI;
  private defaultModel: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    this.defaultModel = config.EMBEDDING_MODEL;
  }

  /**
   * Generate embeddings for texts
   */
  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      const model = request.model || this.defaultModel;
      
      logger.debug('Generating embeddings', {
        textCount: request.texts.length,
        model,
        totalLength: request.texts.reduce((sum, text) => sum + text.length, 0),
      });

      // Filter out empty texts
      const validTexts = request.texts.filter(text => text.trim().length > 0);
      
      if (validTexts.length === 0) {
        throw new Error('No valid texts provided for embedding');
      }

      const response = await this.openai.embeddings.create({
        model,
        input: validTexts,
        encoding_format: 'float',
      });

      const embeddings = response.data.map(item => item.embedding);
      
      // Handle case where some texts were filtered out
      if (validTexts.length !== request.texts.length) {
        const fullEmbeddings: number[][] = [];
        let validIndex = 0;
        
        for (let i = 0; i < request.texts.length; i++) {
          if (request.texts[i].trim().length > 0) {
            const embedding = embeddings && embeddings[validIndex];
            if (embedding) {
              fullEmbeddings.push(embedding);
              validIndex++;
            } else {
              fullEmbeddings.push(new Array(1536).fill(0));
            }
          } else {
            // Return zero embedding for empty texts
            fullEmbeddings.push(new Array(embeddings?.[0]?.length || 1536).fill(0));
          }
        }
        
        logger.info('Generated embeddings successfully', {
          textCount: request.texts.length,
          validTextCount: validTexts.length,
          model,
          usage: response.usage,
        });
        
        return {
          embeddings: fullEmbeddings,
          usage: {
            promptTokens: response.usage.prompt_tokens,
            totalTokens: response.usage.total_tokens,
          },
          model,
        };
      }

      logger.info('Generated embeddings successfully', {
        textCount: request.texts.length,
        model,
        usage: response.usage,
      });

      return {
        embeddings,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens,
        },
        model,
      };
    } catch (error) {
      logger.error('Failed to generate embeddings', {
        error,
        textCount: request.texts.length,
        model: request.model || this.defaultModel,
      });
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const response = await this.generateEmbeddings({
      texts: [text],
      model: model || this.defaultModel,
    });
    
    return response.embeddings[0] || new Array(1536).fill(0);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] || 0;
      const bVal = b[i] || 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Perform similarity search
   */
  async similaritySearch(request: SimilaritySearchRequest): Promise<SimilaritySearchResult[]> {
    try {
      logger.debug('Performing similarity search', {
        candidateCount: request.embeddings.length,
        topK: request.topK,
        threshold: request.threshold,
      });

      const results = request.embeddings
        .map(item => ({
          id: item.id,
          score: this.cosineSimilarity(request.queryEmbedding, item.embedding),
          metadata: item.metadata || {},
        }))
        .filter(result => !request.threshold || result.score >= request.threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, request.topK);

      logger.debug('Similarity search completed', {
        resultsCount: results.length,
        topScore: results[0]?.score,
        avgScore: results.length > 0 
          ? results.reduce((sum, r) => sum + r.score, 0) / results.length 
          : 0,
      });

      return results;
    } catch (error) {
      logger.error('Similarity search failed', { error });
      throw error;
    }
  }

  /**
   * Batch generate embeddings with automatic chunking
   */
  async batchGenerateEmbeddings(
    texts: string[], 
    batchSize: number = 100,
    model?: string
  ): Promise<number[][]> {
    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      logger.debug('Processing embedding batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(texts.length / batchSize),
        batchSize: batch.length,
      });
      
      const response = await this.generateEmbeddings({
        texts: batch,
        model: model || this.defaultModel,
      });
      
      allEmbeddings.push(...response.embeddings);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info('Batch embedding generation completed', {
      totalTexts: texts.length,
      totalEmbeddings: allEmbeddings.length,
    });
    
    return allEmbeddings;
  }

  /**
   * Calculate embedding dimensions for a model
   */
  getEmbeddingDimensions(model?: string): number {
    const modelDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };
    
    return modelDimensions[model || this.defaultModel] || 1536;
  }

  /**
   * Validate embedding vector
   */
  validateEmbedding(embedding: number[], expectedDimension?: number): boolean {
    if (!Array.isArray(embedding)) {return false;}
    if (embedding.length === 0) {return false;}
    if (!embedding.every(num => typeof num === 'number' && !isNaN(num))) {return false;}
    
    if (expectedDimension && embedding.length !== expectedDimension) {
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();