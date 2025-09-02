import { createLogger } from '../../../shared/utils.js';
import { LangGraphOrchestrator, SessionStateType } from '../domain/LangGraphOrchestrator';
import { ActionExecutorService, actionExecutorService } from './ActionExecutorService';
import { LanguageDetectorService, languageDetectorService } from './LanguageDetectorService';
import { KnowledgeBaseService } from './services/KnowledgeBaseService';
import type { SiteAction, ActionParameter } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ service: 'ai-orchestration' });

export interface ConversationRequest {
  input: string;
  siteId: string;
  sessionId?: string;
  userId?: string;
  browserLanguage?: string;
  context?: {
    currentUrl?: string;
    pageTitle?: string;
    userAgent?: string;
  };
}

export interface ConversationResponse {
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
    parameters: Record<string, any>;
    executed: boolean;
    result?: any;
    error?: string;
  }>;
}

/**
 * Main AI orchestration service that coordinates all AI-related functionality
 * 
 * This is the primary interface for:
 * - Voice conversation processing
 * - Intent understanding and action execution
 * - Knowledge base integration
 * - Multi-language support
 */
export class AIOrchestrationService {
  private orchestrators: Map<string, LangGraphOrchestrator> = new Map();
  private activeSessions: Map<string, { siteId: string; lastActivity: Date }> = new Map();

  constructor(
    private dependencies: {
      kbService: {
        semanticSearch(params: {
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
        }>>;
      };
      websocketService?: {
        notifyActionExecuted(data: unknown): Promise<void>;
        broadcast(event: string, data: unknown): Promise<void>;
      };
      ttsService?: {
        generateSpeech(text: string, options: Record<string, unknown>): Promise<string>;
      };
    }
  ) {
    // Clean up inactive sessions every 5 minutes
    setInterval(() => this.cleanupInactiveSessions(), 5 * 60 * 1000);
  }

  /**
   * Process a conversation input and return a complete response
   */
  async processConversation(request: ConversationRequest): Promise<ConversationResponse> {
    const sessionId = request.sessionId || uuidv4();
    const startTime = Date.now();

    logger.info('Processing conversation', {
      sessionId,
      siteId: request.siteId,
      inputLength: request.input.length,
      hasContext: !!request.context
    });

    try {
      // Get or create orchestrator for this site
      const orchestrator = await this.getOrchestrator(request.siteId);
      
      // Update session tracking
      this.activeSessions.set(sessionId, {
        siteId: request.siteId,
        lastActivity: new Date(),
      });

      // Process through LangGraph
      const result = await orchestrator.processConversation({
        userInput: request.input,
        sessionId,
        siteId: request.siteId,
      });

      // Build response
      const response = this.buildResponse(sessionId, result, startTime);

      logger.info('Conversation processed successfully', {
        sessionId,
        responseTime: response.response.metadata.responseTime,
        actionCount: result.toolResults?.length || 0,
        hasAudio: !!response.response.audioUrl
      });

      return response;
    } catch (error) {
      logger.error('Conversation processing failed', {
        sessionId,
        siteId: request.siteId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return error response
      return {
        sessionId,
        response: {
          text: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
          citations: [],
          uiHints: {},
          metadata: {
            responseTime: Date.now() - startTime,
            tokensUsed: 0,
            actionsTaken: 0,
            language: 'en-US',
          },
        },
      };
    }
  }

  /**
   * Stream conversation processing for real-time updates
   */
  async *streamConversation(request: ConversationRequest): AsyncGenerator<{
    type: 'progress' | 'response' | 'error';
    data: any;
  }> {
    const sessionId = request.sessionId || uuidv4();

    try {
      const orchestrator = await this.getOrchestrator(request.siteId);

      // Update session tracking
      this.activeSessions.set(sessionId, {
        siteId: request.siteId,
        lastActivity: new Date(),
      });

      // Stream the conversation processing
      for await (const chunk of orchestrator.streamConversation({
        userInput: request.input,
        sessionId,
        siteId: request.siteId,
      })) {
        yield {
          type: 'progress',
          data: {
            step: chunk.node,
            state: this.sanitizeStateForClient(chunk.state),
          },
        };
      }

      // The final state should be available from the last chunk
      // In a real implementation, you'd need to collect the final state
      yield {
        type: 'response',
        data: {
          sessionId,
          message: 'Conversation processing completed',
        },
      };
    } catch (error) {
      logger.error('Streaming conversation failed', {
        sessionId,
        siteId: request.siteId,
        error
      });

      yield {
        type: 'error',
        data: {
          message: 'Conversation processing failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Register actions for a site
   */
  async registerSiteActions(siteId: string, actions: SiteAction[]): Promise<void> {
    logger.info('Registering site actions', {
      siteId,
      actionCount: actions.length
    });

    // Register with action executor
    actionExecutorService.registerActions(siteId, actions);

    // Update orchestrator if it exists
    const orchestrator = this.orchestrators.get(siteId);
    if (orchestrator) {
      orchestrator.registerActions(actions);
    }

    logger.info('Site actions registered successfully', { siteId });
  }

  /**
   * Get available actions for a site
   */
  getSiteActions(siteId: string): SiteAction[] {
    return actionExecutorService.getAvailableActions(siteId);
  }

  /**
   * Execute a specific action
   */
  async executeAction(request: {
    siteId: string;
    actionName: string;
    parameters: Record<string, any>;
    sessionId?: string;
    userId?: string;
  }): Promise<{
    success: boolean;
    result: any;
    executionTime: number;
    error?: string;
  }> {
    logger.info('Executing action directly', {
      siteId: request.siteId,
      actionName: request.actionName
    });

    const executionResult = await actionExecutorService.execute({
      siteId: request.siteId,
      actionName: request.actionName,
      parameters: request.parameters,
      sessionId: request.sessionId,
      userId: request.userId,
    });

    return {
      success: executionResult.success,
      result: executionResult.result,
      executionTime: executionResult.executionTime,
      error: executionResult.error,
    };
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(sessionId: string): Promise<{
    messages: Array<{
      type: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: string;
      metadata?: Record<string, any>;
    }>;
    metadata: {
      siteId: string;
      startTime: string;
      messageCount: number;
    };
  }> {
    // This would typically fetch from a database
    // For now, return empty history
    return {
      messages: [],
      metadata: {
        siteId: '',
        startTime: new Date().toISOString(),
        messageCount: 0,
      },
    };
  }

  /**
   * Get or create orchestrator for a site
   */
  private async getOrchestrator(siteId: string): Promise<LangGraphOrchestrator> {
    let orchestrator = this.orchestrators.get(siteId);

    if (!orchestrator) {
      logger.info('Creating new orchestrator', { siteId });

      orchestrator = new LangGraphOrchestrator(siteId, {
        kbService: this.dependencies.kbService,
        actionExecutor: actionExecutorService,
        languageDetector: languageDetectorService,
      });

      // Load and register actions for this site
      const actions = actionExecutorService.getAvailableActions(siteId);
      if (actions.length > 0) {
        orchestrator.registerActions(actions);
      }

      this.orchestrators.set(siteId, orchestrator);
    }

    return orchestrator;
  }

  /**
   * Build response from LangGraph result
   */
  private buildResponse(
    sessionId: string,
    result: SessionStateType,
    startTime: number
  ): ConversationResponse {
    const response: ConversationResponse = {
      sessionId,
      response: {
        text: result.finalResponse?.text || "I'm sorry, I couldn't process that request.",
        citations: result.finalResponse?.citations || [],
        uiHints: result.finalResponse?.uiHints || {},
        metadata: {
          responseTime: Date.now() - startTime,
          tokensUsed: result.finalResponse?.metadata.tokensUsed || 0,
          actionsTaken: result.toolResults?.length || 0,
          language: result.detectedLanguage || 'en-US',
          intent: result.intent?.category,
        },
      },
    };

    // Add action results if any
    if (result.toolResults && result.toolResults.length > 0) {
      response.actions = result.toolResults.map(toolResult => ({
        name: toolResult.toolName,
        parameters: toolResult.input,
        executed: toolResult.success,
        result: toolResult.output,
        error: toolResult.error,
      }));
    }

    return response;
  }

  /**
   * Remove sensitive data from state before sending to client
   */
  private sanitizeStateForClient(state: Partial<SessionStateType>): any {
    // Remove sensitive fields and return safe data
    return {
      intent: state.intent,
      detectedLanguage: state.detectedLanguage,
      actionPlan: state.actionPlan,
      kbResults: state.kbResults?.map(result => ({
        url: result.url,
        title: result.metadata.title || '',
        snippet: result.content.substring(0, 200) + '...',
      })),
    };
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive sessions', {
        cleanedCount,
        remainingCount: this.activeSessions.size
      });
    }
  }

  /**
   * Get system stats
   */
  getStats(): {
    activeOrchestrators: number;
    activeSessions: number;
    totalActionsExecuted: number;
  } {
    return {
      activeOrchestrators: this.orchestrators.size,
      activeSessions: this.activeSessions.size,
      totalActionsExecuted: actionExecutorService.getExecutionHistory().length,
    };
  }
}

// Export singleton instance
export const aiOrchestrationService = new AIOrchestrationService({
  kbService: new KnowledgeBaseService(),
  websocketService: null, // TODO: Inject WebSocket service
  ttsService: null, // TODO: Inject TTS service
});