/**
 * AI Application Services
 * 
 * Service layer for AI functionality including embeddings,
 * conversations, and knowledge base management.
 */

export * from './EmbeddingService';
export * from './ConversationService';
export * from './KnowledgeBaseService';

// Re-export service instances
export { embeddingService } from './EmbeddingService';
export { conversationService } from './ConversationService';
export { knowledgeBaseService } from './KnowledgeBaseService';

// Export types
export type { 
  EmbeddingRequest, 
  EmbeddingResponse,
  SimilaritySearchRequest,
  SimilaritySearchResult,
} from './EmbeddingService';

export type { 
  ChatCompletionRequest, 
  ChatCompletionResponse,
  ToolDefinition,
} from './ConversationService';

export type { 
  SearchRequest, 
  SearchResult,
  CrawlRequest,
  CrawlResult,
  IndexingProgress,
} from './KnowledgeBaseService';