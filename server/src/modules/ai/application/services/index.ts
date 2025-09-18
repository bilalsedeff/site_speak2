/**
 * AI Application Services
 *
 * Service layer for AI functionality including embeddings,
 * conversations, knowledge base management, and voice orchestration.
 */

export * from './EmbeddingService';
export * from './ConversationService';
export * from './KnowledgeBaseService';

// Voice Services - Using Unified Voice Orchestrator
export * from './VoiceNavigationIntegrationService';
export * from './VoiceElementSelector';
export * from './VoiceActionExecutor';

// Unified Voice Orchestrator Integration
export {
  unifiedVoiceOrchestrator,
  createUnifiedVoiceOrchestrator,
  type UnifiedVoiceSession,
  type UnifiedOrchestratorConfig
} from '../../../../services/voice/index.js';

// Re-export service instances
export { embeddingService } from './EmbeddingService';
export { conversationService } from './ConversationService';
export { knowledgeBaseService, createKnowledgeBaseService } from './KnowledgeBaseService';

// Voice service instances (non-duplicated)
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