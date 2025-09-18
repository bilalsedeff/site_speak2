/**
 * AI Application Services
 *
 * Service layer for AI functionality including embeddings,
 * conversations, knowledge base management, and voice orchestration.
 */

export * from './EmbeddingService';
export * from './ConversationService';
export * from './KnowledgeBaseService';

// Voice Services
export * from './VoiceNavigationOrchestrator';
export * from './VoiceNavigationIntegrationService';
export * from './VoiceElementSelector';
export * from './VoiceActionExecutor';
export * from './VoiceVisualFeedbackOrchestrator';

// Re-export service instances
export { embeddingService } from './EmbeddingService';
export { conversationService } from './ConversationService';
export { knowledgeBaseService, createKnowledgeBaseService } from './KnowledgeBaseService';

// Voice service instances
export { voiceNavigationOrchestrator } from './VoiceNavigationOrchestrator';
export { voiceNavigationIntegrationService } from './VoiceNavigationIntegrationService';
export { voiceElementSelector } from './VoiceElementSelector';
export { voiceActionExecutor } from './VoiceActionExecutor';

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