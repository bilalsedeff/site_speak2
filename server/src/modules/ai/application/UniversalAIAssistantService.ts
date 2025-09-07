import { createLogger } from '../../../shared/utils.js';
import { AIOrchestrationService, ConversationRequest } from './AIOrchestrationService';
import { ActionExecutorService } from './ActionExecutorService';
import { LanguageDetectorService } from './LanguageDetectorService';
import { knowledgeBaseService, type KnowledgeBaseService } from './services/KnowledgeBaseService';
import { SiteAction } from '../../../shared/types';

// Voice handler interface - making it compatible with actual implementation
export interface VoiceNotificationHandler {
  notifyActionExecuted(data: unknown): Promise<void>;
  broadcast(event: string, data: unknown): Promise<void>;
  endAllSessions(): Promise<void>;
  getMetrics?(): unknown;
}

// TTS service interface
export interface TTSServiceInterface {
  generateSpeech(text: string, options: Record<string, unknown>): Promise<string>;
}

const logger = createLogger({ service: 'universal-ai-assistant' });

// Enhanced type definitions
export type SearchStrategy = 'vector' | 'fulltext' | 'hybrid';

export interface AIAssistantConfig {
  enableVoice: boolean;
  enableStreaming: boolean;
  defaultLocale: string;
  maxSessionDuration: number;
  responseTimeoutMs: number;
  searchStrategies?: SearchStrategy[];
  enableAdvancedCaching?: boolean;
  enableAutoIndexing?: boolean;
  consensusThreshold?: number;
}

export interface AssistantRequest {
  input: string;
  sessionId?: string;
  siteId: string;
  tenantId: string;
  userId?: string;
  context?: {
    currentUrl?: string;
    pageTitle?: string;
    userAgent?: string;
    browserLanguage?: string;
    userPreferences?: {
      searchStrategies?: SearchStrategy[];
      maxResults?: number;
      enableCaching?: boolean;
      requireHighConsensus?: boolean;
    };
  };
  stream?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

export interface AssistantResponse {
  sessionId: string;
  response: {
    text: string;
    audioUrl?: string;
    citations: Array<{
      url: string;
      title: string;
      snippet: string;
    }>;
    uiHints: {
      highlightElements?: string[];
      scrollToElement?: string;
      showModal?: boolean;
      confirmationRequired?: boolean;
      suggestedActions?: Array<{
        name: string;
        label: string;
        parameters: Record<string, unknown>;
      }>;
    };
    metadata: {
      responseTime: number;
      tokensUsed: number;
      actionsTaken: number;
      language: string;
      intent?: string;
      searchMetadata?: {
        searchTime: number;
        totalResults: number;
        strategiesUsed: SearchStrategy[];
        consensusScore?: number;
      };
    };
  };
  actions?: Array<{
    name: string;
    parameters: Record<string, unknown>;
    executed: boolean;
    result?: unknown;
    error?: string;
  }>;
  knowledgeBase?: {
    indexHealth?: number;
    coverage?: number;
  };
}

export interface SiteActionRegistration {
  siteId: string;
  tenantId: string;
  actions: SiteAction[];
  enableAutoDiscovery?: boolean;
}

export interface KnowledgeBaseOperationRequest {
  siteId: string;
  tenantId: string;
  operationType: 'incremental' | 'full' | 'delta';
  baseUrl?: string;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Universal AI Assistant Service - The main entry point for all AI interactions
 * 
 * This service coordinates:
 * - LangGraph orchestration
 * - Voice processing
 * - Knowledge base retrieval
 * - Action execution
 * - Multi-tenant isolation
 * - Streaming responses
 */
export class UniversalAIAssistantService {
  private config: AIAssistantConfig;
  private orchestrationService: AIOrchestrationService;
  private voiceHandler: VoiceNotificationHandler | undefined;
  private actionExecutor: ActionExecutorService;
  
  // Service metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    averageSearchTime: 0,
    activeStreams: 0,
    totalTokensUsed: 0,
    totalActionsExecuted: 0,
    hybridSearches: 0,
    cacheHitRate: 0,
    consensusFailures: 0,
    autoIndexingTriggers: 0,
    kbUpdatesTriggered: 0
  };

  constructor(
    config: Partial<AIAssistantConfig> = {},
    voiceHandler?: VoiceNotificationHandler
  ) {
    this.config = {
      enableVoice: config.enableVoice || false,
      enableStreaming: config.enableStreaming || true,
      defaultLocale: config.defaultLocale || 'en-US',
      maxSessionDuration: config.maxSessionDuration || 30 * 60 * 1000, // 30 minutes
      responseTimeoutMs: config.responseTimeoutMs || 30000, // 30 seconds
      searchStrategies: config.searchStrategies || ['vector', 'fulltext'],
      enableAdvancedCaching: config.enableAdvancedCaching ?? true,
      enableAutoIndexing: config.enableAutoIndexing ?? true,
      consensusThreshold: config.consensusThreshold || 0.7
    };

    this.voiceHandler = voiceHandler;
    this.actionExecutor = new ActionExecutorService();

    // Create knowledge base adapter
    const kbServiceAdapter = this.createKnowledgeBaseAdapter(knowledgeBaseService);
    
    // Initialize orchestration service with dependencies
    const orchestrationDependencies: {
      kbService: typeof kbServiceAdapter;
      websocketService?: {
        notifyActionExecuted(data: unknown): Promise<void>;
        broadcast(event: string, data: unknown): Promise<void>;
      };
      ttsService?: {
        generateSpeech(text: string, options: Record<string, unknown>): Promise<string>;
      };
    } = {
      kbService: kbServiceAdapter,
      // Only include websocketService if voiceHandler exists
      ...(this.voiceHandler && {
        websocketService: {
          notifyActionExecuted: (data: unknown) => this.voiceHandler!.notifyActionExecuted(data),
          broadcast: (event: string, data: unknown) => this.voiceHandler!.broadcast(event, data)
        }
      })
    };
    
    this.orchestrationService = new AIOrchestrationService(orchestrationDependencies);

    // Initialize AI tools system
    this.initializeAITools();

    logger.info('Universal AI Assistant Service initialized', {
      config: this.config,
      hasVoiceHandler: !!this.voiceHandler,
      toolsEnabled: true,
    });
  }

  /**
   * Initialize AI Tools system
   */
  private initializeAITools(): void {
    try {
      // Dynamic import to avoid circular dependencies
      import('../tools').then(toolsModule => {
        toolsModule.initializeAITools();
        logger.info('AI Tools system initialized', {
          stats: toolsModule.getAIToolsStats(),
        });
      }).catch(error => {
        logger.warn('AI Tools initialization failed', { error });
      });
    } catch (error) {
      logger.warn('AI Tools not available', { error });
    }
  }

  /**
   * Process a conversation request (text or voice)
   */
  async processConversation(request: AssistantRequest): Promise<AssistantResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    logger.info('Processing conversation request', {
      siteId: request.siteId,
      tenantId: request.tenantId,
      sessionId: request.sessionId,
      inputLength: request.input.length,
      hasContext: !!request.context,
    });

    try {
      // Validate request
      this.validateRequest(request);

      // Detect language if not provided
      const languageDetector = new LanguageDetectorService();
      const detectedLanguage = await languageDetector.detect(
        request.input,
        request.context?.browserLanguage
      );

      // Process through orchestration service
      const orchestrationRequest: ConversationRequest = {
        input: request.input,
        siteId: request.siteId,
        browserLanguage: detectedLanguage,
        // Only include optional properties if they have values
        ...(request.sessionId && { sessionId: request.sessionId }),
        ...(request.userId && { userId: request.userId }),
        ...(request.context && {
          context: {
            ...(request.context.currentUrl && { currentUrl: request.context.currentUrl }),
            ...(request.context.pageTitle && { pageTitle: request.context.pageTitle }),
            ...(request.context.userAgent && { userAgent: request.context.userAgent })
          }
        })
      };

      const result = await this.orchestrationService.processConversation(orchestrationRequest);
      
      // Build final response
      const response = await this.buildResponse(request, result, startTime);

      // Update metrics
      this.updateMetrics(true, Date.now() - startTime, result);

      logger.info('Conversation processed successfully', {
        sessionId: response.sessionId,
        responseTime: response.response.metadata.responseTime,
        actionCount: result.actions?.length || 0,
        language: detectedLanguage,
      });

      return response;

    } catch (error) {
      this.metrics.failedRequests++;
      
      logger.error('Conversation processing failed', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        sessionId: request.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return error response
      return this.buildErrorResponse(request, error, startTime);
    }
  }

  /**
   * Stream a conversation (for real-time responses)
   */
  async *streamConversation(request: AssistantRequest): AsyncGenerator<{
    type: 'progress' | 'partial' | 'final' | 'error';
    data: unknown;
    sessionId: string;
  }> {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.activeStreams++;

    logger.info('Starting conversation stream', {
      siteId: request.siteId,
      sessionId: request.sessionId,
    });

    try {
      // Validate request
      this.validateRequest(request);

      const sessionId = request.sessionId || this.generateSessionId();

      // Detect language
      yield {
        type: 'progress',
        data: { step: 'language-detection', status: 'processing' },
        sessionId,
      };

      const languageDetector = new LanguageDetectorService();
      const detectedLanguage = await languageDetector.detect(
        request.input,
        request.context?.browserLanguage
      );

      yield {
        type: 'progress',
        data: { step: 'language-detection', status: 'completed', language: detectedLanguage },
        sessionId,
      };

      // Stream through orchestration
      const orchestrationRequest: ConversationRequest = {
        input: request.input,
        siteId: request.siteId,
        sessionId,
        browserLanguage: detectedLanguage,
        // Only include optional properties if they have values
        ...(request.userId && { userId: request.userId }),
        ...(request.context && {
          context: {
            ...(request.context.currentUrl && { currentUrl: request.context.currentUrl }),
            ...(request.context.pageTitle && { pageTitle: request.context.pageTitle }),
            ...(request.context.userAgent && { userAgent: request.context.userAgent })
          }
        })
      };

      let finalResult: unknown = null;

      for await (const chunk of this.orchestrationService.streamConversation(orchestrationRequest)) {
        yield {
          type: 'progress',
          data: {
            step: chunk.type,
            ...chunk.data,
          },
          sessionId,
        };

        if (chunk.type === 'response') {
          finalResult = chunk.data;
        }
      }

      // Send final response
      if (finalResult) {
        const response = await this.buildResponse(request, finalResult, startTime);
        
        yield {
          type: 'final',
          data: response,
          sessionId,
        };

        this.updateMetrics(true, Date.now() - startTime, finalResult);
      }

      logger.info('Conversation stream completed', { sessionId });

    } catch (error) {
      this.metrics.failedRequests++;
      
      logger.error('Conversation streaming failed', {
        siteId: request.siteId,
        sessionId: request.sessionId,
        error,
      });

      yield {
        type: 'error',
        data: {
          message: 'Streaming failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        sessionId: request.sessionId || 'unknown',
      };
    } finally {
      this.metrics.activeStreams--;
    }
  }

  /**
   * Register actions for a site
   */
  async registerSiteActions(siteId: string, tenantId: string, actions: SiteAction[]): Promise<void>;
  async registerSiteActions(registration: SiteActionRegistration): Promise<void>;
  async registerSiteActions(
    siteIdOrRegistration: string | SiteActionRegistration,
    tenantId?: string,
    actions?: SiteAction[]
  ): Promise<void> {
    // Handle both signatures for backward compatibility
    const registration: SiteActionRegistration = typeof siteIdOrRegistration === 'string'
      ? { siteId: siteIdOrRegistration, tenantId: tenantId!, actions: actions! }
      : siteIdOrRegistration;

    logger.info('Registering site actions', {
      siteId: registration.siteId,
      tenantId: registration.tenantId,
      actionCount: registration.actions.length,
      autoDiscovery: registration.enableAutoDiscovery
    });

    try {
      // Register with action executor
      await this.actionExecutor.registerActions(registration.siteId, registration.actions);
      
      // Register with orchestration service
      await this.orchestrationService.registerSiteActions(registration.siteId, registration.actions);

      // TODO: Implement auto-discovery if enabled
      if (registration.enableAutoDiscovery) {
        logger.info('Auto-discovery enabled for site actions', {
          siteId: registration.siteId,
          tenantId: registration.tenantId
        });
        // Auto-discovery implementation would go here
      }

      logger.info('Site actions registered successfully', {
        siteId: registration.siteId,
        actionCount: registration.actions.length
      });
    } catch (error) {
      logger.error('Failed to register site actions', {
        siteId: registration.siteId,
        tenantId: registration.tenantId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get available actions for a site
   */
  getSiteActions(siteId: string): SiteAction[] {
    return this.orchestrationService.getSiteActions(siteId);
  }

  /**
   * Execute a specific action directly
   */
  async executeAction(request: {
    siteId: string;
    tenantId: string;
    actionName: string;
    parameters: Record<string, unknown>;
    sessionId?: string;
    userId?: string;
  }): Promise<{
    success: boolean;
    result: unknown;
    executionTime: number;
    error?: string;
  }> {
    logger.info('Executing direct action', {
      siteId: request.siteId,
      actionName: request.actionName,
    });

    try {
      const result = await this.orchestrationService.executeAction(request);
      
      logger.info('Action executed successfully', {
        siteId: request.siteId,
        actionName: request.actionName,
        success: result.success,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      logger.error('Action execution failed', {
        siteId: request.siteId,
        actionName: request.actionName,
        error,
      });
      throw error;
    }
  }

  /**
   * Get session history
   */
  async getSessionHistory(sessionId: string): Promise<unknown> {
    return this.orchestrationService.getSessionHistory(sessionId);
  }

  /**
   * Trigger knowledge base operations
   */
  async triggerKnowledgeBaseOperation(request: KnowledgeBaseOperationRequest): Promise<string> {
    logger.info('Triggering KB operation', {
      siteId: request.siteId,
      tenantId: request.tenantId,
      operationType: request.operationType,
      priority: request.priority
    });

    try {
      // TODO: Implement actual KB operations when crawling services are available
      const sessionId = `${request.operationType}_${Date.now()}_${request.siteId}`;
      
      logger.info('KB operation triggered', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        sessionId,
        operationType: request.operationType
      });
      
      // Update metrics
      this.metrics.kbUpdatesTriggered++;
      
      return sessionId;
    } catch (error) {
      logger.error('KB operation failed', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        operationType: request.operationType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get service metrics
   */
  getMetrics(): typeof this.metrics & {
    orchestrationStats: unknown;
    voiceStats?: unknown;
    kbStats?: unknown;
  } {
    const orchestrationStats = this.orchestrationService.getStats();
    const voiceStats = this.voiceHandler?.getMetrics?.();
    
    const result = {
      ...this.metrics,
      orchestrationStats
    };
    
    // Only include voiceStats if it exists
    if (voiceStats) {
      (result as typeof result & { voiceStats: unknown }).voiceStats = voiceStats;
    }
    
    return result as typeof this.metrics & {
      orchestrationStats: unknown;
      voiceStats?: unknown;
      kbStats?: unknown;
    };
  }

  /**
   * Validate incoming request
   */
  private validateRequest(request: AssistantRequest): void {
    if (!request.input?.trim()) {
      throw new Error('Input is required and cannot be empty');
    }

    if (!request.siteId) {
      throw new Error('Site ID is required');
    }

    if (!request.tenantId) {
      throw new Error('Tenant ID is required');
    }

    if (request.input.length > 10000) {
      throw new Error('Input is too long (max 10,000 characters)');
    }
  }

  /**
   * Build final response
   */
  private async buildResponse(
    _request: AssistantRequest,
    result: unknown,
    startTime: number
  ): Promise<AssistantResponse> {
    const responseTime = Date.now() - startTime;
    
    // Type guard for the result object
    const resultObj = result as {
      sessionId?: string;
      response?: {
        text?: string;
        audioUrl?: string;
        citations?: Array<{ url: string; title: string; snippet: string }>;
        uiHints?: Record<string, unknown>;
        metadata?: {
          tokensUsed?: number;
          language?: string;
          intent?: string;
        };
      };
      actions?: Array<{
        name: string;
        parameters: Record<string, unknown>;
        executed: boolean;
        result?: unknown;
        error?: string;
      }>;
    };

    const responseObj: AssistantResponse = {
      sessionId: resultObj.sessionId || this.generateSessionId(),
      response: {
        text: resultObj.response?.text || 'I processed your request successfully.',
        citations: resultObj.response?.citations || [],
        uiHints: (resultObj.response?.uiHints as { 
          highlightElements?: string[];
          scrollToElement?: string;
          showModal?: boolean;
          confirmationRequired?: boolean;
          suggestedActions?: Array<{
            name: string;
            label: string;
            parameters: Record<string, unknown>;
          }>;
        }) || {},
        metadata: {
          responseTime,
          tokensUsed: resultObj.response?.metadata?.tokensUsed || 0,
          actionsTaken: resultObj.actions?.length || 0,
          language: resultObj.response?.metadata?.language || this.config.defaultLocale,
          // Only include intent if it exists
          ...(resultObj.response?.metadata?.intent && { intent: resultObj.response.metadata.intent }),
          searchMetadata: {
            searchTime: this.metrics.averageSearchTime,
            totalResults: 0,
            strategiesUsed: this.config.searchStrategies || ['vector', 'fulltext'],
            consensusScore: 0.8
          }
        },
        // Only include audioUrl if it exists
        ...(resultObj.response?.audioUrl && { audioUrl: resultObj.response.audioUrl })
      },
      knowledgeBase: {
        indexHealth: 0.9, // Placeholder - would come from actual KB health check
        coverage: 0.85 // Placeholder - would come from actual coverage analysis
      },
      // Only include actions if they exist
      ...(resultObj.actions && { actions: resultObj.actions })
    };
    
    return responseObj;
  }

  /**
   * Build error response
   */
  private buildErrorResponse(
    request: AssistantRequest,
    _error: unknown,
    startTime: number
  ): AssistantResponse {
    const responseTime = Date.now() - startTime;

    return {
      sessionId: request.sessionId || this.generateSessionId(),
      response: {
        text: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
        citations: [],
        uiHints: {},
        metadata: {
          responseTime,
          tokensUsed: 0,
          actionsTaken: 0,
          language: this.config.defaultLocale,
          searchMetadata: {
            searchTime: 0,
            totalResults: 0,
            strategiesUsed: this.config.searchStrategies || ['vector', 'fulltext'],
            consensusScore: 0
          }
        }
      },
    };
  }

  /**
   * Update service metrics
   */
  private updateMetrics(success: boolean, responseTime: number, result?: unknown): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time
    const totalProcessedRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (totalProcessedRequests - 1) + responseTime) / totalProcessedRequests;

    if (result) {
      const resultObj = result as {
        response?: { metadata?: { tokensUsed?: number } };
        actions?: unknown[];
      };
      
      this.metrics.totalTokensUsed += resultObj.response?.metadata?.tokensUsed || 0;
      this.metrics.totalActionsExecuted += resultObj.actions?.length || 0;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create knowledge base adapter to bridge interface differences
   */
  private createKnowledgeBaseAdapter(kbService: KnowledgeBaseService) {
    return {
      async semanticSearch(params: {
        siteId: string;
        query: string;
        topK: number;
        locale: string;
      }): Promise<Array<{
        id: string;
        content: string;
        url: string;
        score: number;
        metadata: Record<string, unknown>;
      }>> {
        try {
          // Adapt the interface to match infrastructure service
          const searchResults = await kbService.semanticSearch({
            query: params.query,
            siteId: params.siteId,
            tenantId: 'default', // TODO: Get from context
            limit: params.topK,
            threshold: 0.7,
            filters: {
              locale: params.locale
            }
          });

          // Transform results to match expected interface
          return searchResults.map((result) => ({
            id: result.id,
            content: result.content,
            url: result.url,
            score: result.score,
            metadata: result.metadata || {}
          }));
        } catch (error) {
          logger.error('Knowledge base search failed', { error });
          return [];
        }
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up Universal AI Assistant Service');
    
    // Cleanup would include closing database connections, etc.
    if (this.voiceHandler) {
      await this.voiceHandler.endAllSessions();
    }

    logger.info('Universal AI Assistant Service cleanup completed');
  }
}

// Singleton instance
let _instance: UniversalAIAssistantService | null = null;

/**
 * Get or create singleton instance of Universal AI Assistant Service
 */
export function getUniversalAIAssistantService(
  config?: Partial<AIAssistantConfig>,
  voiceHandler?: VoiceNotificationHandler
): UniversalAIAssistantService {
  if (!_instance) {
    _instance = new UniversalAIAssistantService(config, voiceHandler);
  }
  return _instance;
}

// Export singleton instance (backwards compatibility)
export const universalAIAssistantService = getUniversalAIAssistantService();