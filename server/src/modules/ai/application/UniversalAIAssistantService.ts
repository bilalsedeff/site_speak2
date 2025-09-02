import { createLogger } from '../../../shared/utils.js';
import { LangGraphOrchestrator, SessionStateType } from '../domain/LangGraphOrchestrator';
import { AIOrchestrationService } from './AIOrchestrationService';
import { VoiceWebSocketHandler } from '../../voice/infrastructure/websocket/VoiceWebSocketHandler';
import { ActionExecutorService } from './services/ActionExecutorService';
import { LanguageDetectorService } from './services/LanguageDetectorService';
import { KnowledgeBaseService } from './services/KnowledgeBaseService';
import { SiteAction } from '../../../shared/types';

const logger = createLogger({ service: 'universal-ai-assistant' });

export interface AIAssistantConfig {
  enableVoice: boolean;
  enableStreaming: boolean;
  defaultLocale: string;
  maxSessionDuration: number;
  responseTimeoutMs: number;
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
  };
  stream?: boolean;
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
    };
    metadata: {
      responseTime: number;
      tokensUsed: number;
      actionsTaken: number;
      language: string;
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
  private voiceHandler?: VoiceWebSocketHandler;
  private actionExecutor: ActionExecutorService;
  
  // Service metrics
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    activeStreams: 0,
    totalTokensUsed: 0,
    totalActionsExecuted: 0,
  };

  constructor(
    config: Partial<AIAssistantConfig> = {},
    voiceHandler?: VoiceWebSocketHandler
  ) {
    this.config = {
      enableVoice: config.enableVoice || false,
      enableStreaming: config.enableStreaming || true,
      defaultLocale: config.defaultLocale || 'en-US',
      maxSessionDuration: config.maxSessionDuration || 30 * 60 * 1000, // 30 minutes
      responseTimeoutMs: config.responseTimeoutMs || 30000, // 30 seconds
    };

    this.voiceHandler = voiceHandler;
    this.actionExecutor = new ActionExecutorService();

    // Initialize orchestration service with dependencies
    this.orchestrationService = new AIOrchestrationService({
      kbService: new KnowledgeBaseService(),
      websocketService: this.voiceHandler,
      ttsService: null, // TODO: Implement TTS service
    });

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
      const orchestrationRequest = {
        input: request.input,
        siteId: request.siteId,
        sessionId: request.sessionId,
        userId: request.userId,
        browserLanguage: detectedLanguage,
        context: request.context,
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
      const orchestrationRequest = {
        input: request.input,
        siteId: request.siteId,
        sessionId,
        userId: request.userId,
        browserLanguage: detectedLanguage,
        context: request.context,
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
  async registerSiteActions(siteId: string, tenantId: string, actions: SiteAction[]): Promise<void> {
    logger.info('Registering site actions', {
      siteId,
      tenantId,
      actionCount: actions.length,
    });

    try {
      // Register with action executor
      await this.actionExecutor.registerActions(siteId, actions);
      
      // Register with orchestration service
      await this.orchestrationService.registerSiteActions(siteId, actions);

      logger.info('Site actions registered successfully', { siteId, actionCount: actions.length });
    } catch (error) {
      logger.error('Failed to register site actions', {
        siteId,
        tenantId,
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
   * Get service metrics
   */
  getMetrics(): typeof this.metrics & {
    orchestrationStats: unknown;
    voiceStats?: unknown;
    kbStats?: unknown;
  } {
    const orchestrationStats = this.orchestrationService.getStats();
    const voiceStats = this.voiceHandler?.getMetrics();
    
    return {
      ...this.metrics,
      orchestrationStats,
      voiceStats,
      // kbStats would be implemented when KB service is ready
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
    request: AssistantRequest,
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

    return {
      sessionId: resultObj.sessionId || this.generateSessionId(),
      response: {
        text: resultObj.response?.text || 'I processed your request successfully.',
        audioUrl: resultObj.response?.audioUrl,
        citations: resultObj.response?.citations || [],
        uiHints: resultObj.response?.uiHints || {},
        metadata: {
          responseTime,
          tokensUsed: resultObj.response?.metadata?.tokensUsed || 0,
          actionsTaken: resultObj.actions?.length || 0,
          language: resultObj.response?.metadata?.language || this.config.defaultLocale,
          intent: resultObj.response?.metadata?.intent,
        },
      },
      actions: resultObj.actions,
    };
  }

  /**
   * Build error response
   */
  private buildErrorResponse(
    request: AssistantRequest,
    error: unknown,
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
        },
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

// Export singleton instance
export const universalAIAssistantService = new UniversalAIAssistantService();