import { BaseEntity, SupportedLanguage } from './common.types';

// Knowledge Base Types
export interface KnowledgeBase extends BaseEntity {
  siteId: string;
  status: KBStatus;
  lastCrawledAt?: Date;
  lastIndexedAt?: Date;
  stats: KBStats;
  configuration: KBConfiguration;
}

export type KBStatus = 'initializing' | 'crawling' | 'indexing' | 'ready' | 'error' | 'outdated';

export interface KBStats {
  totalChunks: number;
  totalPages: number;
  totalTokens: number;
  sizeInMB: number;
  avgChunkSize: number;
  lastUpdateDuration: number; // in seconds
}

export interface KBConfiguration {
  crawlDepth: number;
  chunkSize: number;
  chunkOverlap: number;
  excludePatterns: string[];
  includePatterns: string[];
  autoReindex: boolean;
  reindexFrequency: 'daily' | 'weekly' | 'monthly' | 'manual';
}

export interface KnowledgeChunk extends BaseEntity {
  knowledgeBaseId: string;
  url: string;
  selector?: string;
  content: string;
  embedding?: number[];
  contentHash: string;
  metadata: ChunkMetadata;
  parentChunkId?: string;
  childChunkIds?: string[];
}

export interface ChunkMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  language: SupportedLanguage;
  contentType: 'text' | 'code' | 'list' | 'table' | 'form' | 'navigation';
  pageType: 'home' | 'product' | 'blog' | 'contact' | 'about' | 'service' | 'other';
  importance: 'high' | 'medium' | 'low';
  lastModified?: Date;
}

// Search and Retrieval Types
export interface SearchQuery {
  query: string;
  filters?: SearchFilters;
  options?: SearchOptions;
}

export interface SearchFilters {
  siteId?: string;
  language?: SupportedLanguage;
  contentType?: string[];
  pageType?: string[];
  importance?: ('high' | 'medium' | 'low')[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  minSimilarity?: number;
  includeMetadata?: boolean;
  rerank?: boolean;
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  similarity: number;
  snippet?: string;
  highlights?: string[];
  rankScore?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  processingTime: number;
  usedLanguage: SupportedLanguage;
  suggestions?: string[];
}

// AI Agent Types
export interface AIAgent {
  id: string;
  siteId: string;
  name: string;
  personality: string;
  instructions: string;
  language: SupportedLanguage;
  capabilities: AgentCapability[];
  configuration: AgentConfiguration;
  stats: AgentStats;
}

export type AgentCapability = 
  | 'question_answering'
  | 'navigation'
  | 'search'
  | 'ecommerce'
  | 'booking'
  | 'form_filling'
  | 'content_creation'
  | 'analytics_reporting';

export interface AgentConfiguration {
  model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'claude-3-sonnet' | 'claude-3-haiku';
  temperature: number;
  maxTokens: number;
  enableMemory: boolean;
  memoryWindowSize: number;
  safetyLevel: 'strict' | 'moderate' | 'relaxed';
  responseStyle: 'concise' | 'detailed' | 'conversational' | 'professional';
}

export interface AgentStats {
  totalInteractions: number;
  averageResponseTime: number;
  successRate: number;
  mostCommonQueries: string[];
  satisfactionScore: number;
  lastInteractionAt?: Date;
}

// Conversation Types
export interface Conversation extends BaseEntity {
  siteId: string;
  sessionId: string;
  userId?: string;
  language: SupportedLanguage;
  status: ConversationStatus;
  turns: ConversationTurn[];
  metadata: ConversationMetadata;
}

export type ConversationStatus = 'active' | 'completed' | 'abandoned' | 'escalated';

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: TurnMetadata;
}

export interface TurnMetadata {
  inputType?: 'voice' | 'text';
  responseTime?: number;
  toolsCalled?: string[];
  confidence?: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface ConversationMetadata {
  userAgent?: string;
  referrer?: string;
  location?: string;
  device?: 'desktop' | 'mobile' | 'tablet';
  startedAt: Date;
  endedAt?: Date;
  satisfaction?: number; // 1-5 rating
  resolved?: boolean;
}

// Tool and Action Types
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: string; // function name to call
  category: 'navigation' | 'search' | 'ecommerce' | 'booking' | 'communication' | 'utility';
  riskLevel: 'safe' | 'requires_confirmation' | 'dangerous';
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
  validation?: any; // Zod schema
}

export interface ToolCall {
  id: string;
  tool: string;
  parameters: Record<string, any>;
  result?: any;
  error?: string;
  executedAt: Date;
  duration?: number;
}

// Intent Classification Types
export interface Intent {
  name: string;
  confidence: number;
  entities?: Entity[];
  context?: Record<string, any>;
}

export interface Entity {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
}

// Analytics and Metrics
export interface AIMetrics {
  totalQueries: number;
  avgResponseTime: number;
  successRate: number;
  topIntents: Array<{
    intent: string;
    count: number;
    avgConfidence: number;
  }>;
  languageDistribution: Record<SupportedLanguage, number>;
  errorTypes: Record<string, number>;
  userSatisfaction: number;
}