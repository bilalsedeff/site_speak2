import { z } from 'zod';

// Knowledge Base schemas
export const KBStatusSchema = z.enum(['initializing', 'crawling', 'indexing', 'ready', 'error', 'outdated']);

export const KBStatsSchema = z.object({
  totalChunks: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  sizeInMB: z.number().min(0),
  avgChunkSize: z.number().min(0),
  lastUpdateDuration: z.number().min(0),
});

export const KBConfigurationSchema = z.object({
  crawlDepth: z.number().int().min(1).max(10),
  chunkSize: z.number().int().min(100).max(2000),
  chunkOverlap: z.number().int().min(0).max(500),
  excludePatterns: z.array(z.string()),
  includePatterns: z.array(z.string()),
  autoReindex: z.boolean(),
  reindexFrequency: z.enum(['daily', 'weekly', 'monthly', 'manual']),
});

export const KnowledgeBaseSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  status: KBStatusSchema,
  lastCrawledAt: z.date().optional(),
  lastIndexedAt: z.date().optional(),
  stats: KBStatsSchema,
  configuration: KBConfigurationSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Knowledge Chunk schemas
export const ChunkMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  contentType: z.enum(['text', 'code', 'list', 'table', 'form', 'navigation']),
  pageType: z.enum(['home', 'product', 'blog', 'contact', 'about', 'service', 'other']),
  importance: z.enum(['high', 'medium', 'low']),
  lastModified: z.date().optional(),
});

export const KnowledgeChunkSchema = z.object({
  id: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
  url: z.string().url(),
  selector: z.string().optional(),
  content: z.string().min(1),
  embedding: z.array(z.number()).optional(),
  contentHash: z.string(),
  metadata: ChunkMetadataSchema,
  parentChunkId: z.string().uuid().optional(),
  childChunkIds: z.array(z.string().uuid()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Search and Retrieval schemas
export const SearchFiltersSchema = z.object({
  siteId: z.string().uuid().optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).optional(),
  contentType: z.array(z.enum(['text', 'code', 'list', 'table', 'form', 'navigation'])).optional(),
  pageType: z.array(z.enum(['home', 'product', 'blog', 'contact', 'about', 'service', 'other'])).optional(),
  importance: z.array(z.enum(['high', 'medium', 'low'])).optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
});

export const SearchOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).default(0),
  minSimilarity: z.number().min(0).max(1).default(0.7),
  includeMetadata: z.boolean().default(true),
  rerank: z.boolean().default(false),
});

export const AISearchQuerySchema = z.object({
  query: z.string().min(1),
  filters: SearchFiltersSchema.optional(),
  options: SearchOptionsSchema.optional(),
});

export const SearchResultSchema = z.object({
  chunk: KnowledgeChunkSchema,
  similarity: z.number().min(0).max(1),
  snippet: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  rankScore: z.number().optional(),
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number().int().min(0),
  query: z.string(),
  processingTime: z.number().min(0),
  usedLanguage: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  suggestions: z.array(z.string()).optional(),
});

// AI Agent schemas
export const AgentCapabilitySchema = z.enum([
  'question_answering', 'navigation', 'search', 'ecommerce', 
  'booking', 'form_filling', 'content_creation', 'analytics_reporting'
]);

export const AgentConfigurationSchema = z.object({
  model: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'claude-3-sonnet', 'claude-3-haiku']),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(1).max(4096).default(2048),
  enableMemory: z.boolean().default(true),
  memoryWindowSize: z.number().int().min(1).max(50).default(10),
  safetyLevel: z.enum(['strict', 'moderate', 'relaxed']).default('moderate'),
  responseStyle: z.enum(['concise', 'detailed', 'conversational', 'professional']).default('conversational'),
});

export const AgentStatsSchema = z.object({
  totalInteractions: z.number().int().min(0),
  averageResponseTime: z.number().min(0),
  successRate: z.number().min(0).max(1),
  mostCommonQueries: z.array(z.string()),
  satisfactionScore: z.number().min(0).max(5),
  lastInteractionAt: z.date().optional(),
});

export const AIAgentSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  name: z.string().min(1).max(100),
  personality: z.string().min(1).max(500),
  instructions: z.string().min(1).max(2000),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  capabilities: z.array(AgentCapabilitySchema),
  configuration: AgentConfigurationSchema,
  stats: AgentStatsSchema,
});

// Conversation schemas
export const ConversationStatusSchema = z.enum(['active', 'completed', 'abandoned', 'escalated']);

export const TurnMetadataSchema = z.object({
  inputType: z.enum(['voice', 'text']).optional(),
  responseTime: z.number().min(0).optional(),
  toolsCalled: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
});

export const ConversationTurnSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  timestamp: z.date(),
  metadata: TurnMetadataSchema.optional(),
});

export const ConversationMetadataSchema = z.object({
  userAgent: z.string().optional(),
  referrer: z.string().optional(),
  location: z.string().optional(),
  device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  satisfaction: z.number().min(1).max(5).optional(),
  resolved: z.boolean().optional(),
});

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  sessionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  status: ConversationStatusSchema,
  turns: z.array(ConversationTurnSchema),
  metadata: ConversationMetadataSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Tool and Action schemas
export const ToolParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().min(1),
  required: z.boolean(),
  enum: z.array(z.string()).optional(),
  validation: z.any().optional(),
});

export const ToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(ToolParameterSchema),
  handler: z.string().min(1),
  category: z.enum(['navigation', 'search', 'ecommerce', 'booking', 'communication', 'utility']),
  riskLevel: z.enum(['safe', 'requires_confirmation', 'dangerous']),
});

export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  tool: z.string().min(1),
  parameters: z.record(z.any()),
  result: z.any().optional(),
  error: z.string().optional(),
  executedAt: z.date(),
  duration: z.number().min(0).optional(),
});

// Intent and Entity schemas
export const EntitySchema = z.object({
  type: z.string().min(1),
  value: z.string().min(1),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
});

export const IntentSchema = z.object({
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  entities: z.array(EntitySchema).optional(),
  context: z.record(z.any()).optional(),
});

// AI Metrics schema
export const AIMetricsSchema = z.object({
  totalQueries: z.number().int().min(0),
  avgResponseTime: z.number().min(0),
  successRate: z.number().min(0).max(1),
  topIntents: z.array(z.object({
    intent: z.string(),
    count: z.number().int().min(0),
    avgConfidence: z.number().min(0).max(1),
  })),
  languageDistribution: z.record(z.enum(['en', 'tr', 'es', 'fr', 'de']), z.number().int().min(0)),
  errorTypes: z.record(z.string(), z.number().int().min(0)),
  userSatisfaction: z.number().min(0).max(5),
});

// Request/Response schemas for API endpoints
export const CreateKnowledgeBaseRequestSchema = z.object({
  siteId: z.string().uuid(),
  configuration: KBConfigurationSchema.partial().optional(),
});

export const UpdateKnowledgeBaseRequestSchema = z.object({
  configuration: KBConfigurationSchema.partial().optional(),
  triggerReindex: z.boolean().optional(),
});

export const IndexContentRequestSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url(),
  content: z.string().min(1),
  metadata: ChunkMetadataSchema.partial().optional(),
  forceReindex: z.boolean().default(false),
});

export const CreateConversationRequestSchema = z.object({
  siteId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).default('en'),
  initialMessage: z.string().min(1).optional(),
  metadata: ConversationMetadataSchema.partial().optional(),
});

export const AddMessageRequestSchema = z.object({
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  metadata: TurnMetadataSchema.optional(),
});

export const UpdateAgentConfigRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  personality: z.string().min(1).max(500).optional(),
  instructions: z.string().min(1).max(2000).optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).optional(),
  capabilities: z.array(AgentCapabilitySchema).optional(),
  configuration: AgentConfigurationSchema.partial().optional(),
});

// Type exports
export type KBStatus = z.infer<typeof KBStatusSchema>;
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;
export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;
export type AISearchQuery = z.infer<typeof AISearchQuerySchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type AIAgent = z.infer<typeof AIAgentSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ToolParameter = z.infer<typeof ToolParameterSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type AIMetrics = z.infer<typeof AIMetricsSchema>;
export type CreateKnowledgeBaseRequest = z.infer<typeof CreateKnowledgeBaseRequestSchema>;
export type UpdateKnowledgeBaseRequest = z.infer<typeof UpdateKnowledgeBaseRequestSchema>;
export type IndexContentRequest = z.infer<typeof IndexContentRequestSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;
export type AddMessageRequest = z.infer<typeof AddMessageRequestSchema>;
export type UpdateAgentConfigRequest = z.infer<typeof UpdateAgentConfigRequestSchema>;
