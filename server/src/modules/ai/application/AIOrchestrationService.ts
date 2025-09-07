import { createLogger } from '../../../shared/utils.js';
import { LangGraphOrchestrator, SessionStateType } from '../domain/LangGraphOrchestrator';
import { actionExecutorService } from './ActionExecutorService';
import { languageDetectorService } from './LanguageDetectorService';
import { getKnowledgeBaseService } from '../infrastructure/KnowledgeBaseService';
import type { SiteAction, ActionParameter } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { createUniversalAgentGraph, UniversalAgentGraph } from '../orchestrator/graphs/UniversalAgent.graph';
import { FunctionCallingService } from '../orchestrator/executors/FunctionCallingService';

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
    timezone?: string;
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
  private universalAgentGraphs: Map<string, UniversalAgentGraph> = new Map();
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
   * Detect if the input requires complex multi-step processing
   */
  private isComplexTask(input: string): boolean {
    const complexKeywords = [
      'find and add', 'search and book', 'find then', 'look for and',
      'by the sea', 'near me', 'this summer', 'next month', 'tonight',
      'concerts', 'tickets', 'events', 'booking', 'reservation',
      'compare', 'filter by', 'sort by', 'show me events',
      'cart', 'checkout', 'purchase', 'buy tickets'
    ];
    
    const lowerInput = input.toLowerCase();
    const complexIndicators = complexKeywords.filter(keyword => lowerInput.includes(keyword));
    
    // Complex if contains multiple steps or temporal/spatial/booking patterns
    const hasMultipleSteps = lowerInput.includes(' and ') && (
      lowerInput.includes('find') || lowerInput.includes('search') ||
      lowerInput.includes('add') || lowerInput.includes('book')
    );
    
    const hasTemporalSpatial = complexIndicators.some(indicator => 
      ['by the sea', 'near me', 'this summer', 'next month', 'tonight'].includes(indicator)
    );
    
    const hasBookingCommerce = complexIndicators.some(indicator => 
      ['tickets', 'booking', 'cart', 'checkout', 'purchase', 'buy'].includes(indicator)
    );

    return hasMultipleSteps || hasTemporalSpatial || hasBookingCommerce || complexIndicators.length >= 2;
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
      // Update session tracking
      this.activeSessions.set(sessionId, {
        siteId: request.siteId,
        lastActivity: new Date(),
      });

      // Determine if this is a complex task requiring Universal Agent
      const isComplex = this.isComplexTask(request.input);
      
      logger.info('Task complexity determined', {
        sessionId,
        isComplex,
        inputPreview: request.input.substring(0, 100)
      });

      if (isComplex) {
        // Use Universal Agent Graph for complex multi-step tasks
        const universalAgent = await this.getUniversalAgentGraph(request.siteId);
        const result = await universalAgent.processConversation({
          userInput: request.input,
          sessionId,
          siteId: request.siteId,
          tenantId: request.userId || 'default-tenant', // Use userId as tenantId fallback
          ...(request.userId !== undefined && { userId: request.userId }),
          userPreferences: {
            language: request.browserLanguage || 'en-US',
            timezone: request.context?.timezone || 'UTC', // Use timezone from context or default to UTC
          },
        });

        // Convert Universal Agent result to standard format
        const response = this.buildUniversalAgentResponse(sessionId, result, startTime);

        logger.info('Complex conversation processed successfully', {
          sessionId,
          responseTime: response.response.metadata.responseTime,
          slotFrameIntent: result.slotFrame?.intent,
          toolsExecuted: result.executedTools?.length || 0
        });

        return response;

      } else {
        // Use standard LangGraph orchestrator for simple tasks
        const orchestrator = await this.getOrchestrator(request.siteId);
        const result = await orchestrator.processConversation({
          userInput: request.input,
          sessionId,
          siteId: request.siteId,
        });

        // Build standard response
        const response = this.buildResponse(sessionId, result, startTime);

        logger.info('Standard conversation processed successfully', {
          sessionId,
          responseTime: response.response.metadata.responseTime,
          actionCount: result.toolResults?.length || 0,
          hasAudio: !!response.response.audioUrl
        });

        return response;
      }
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
      ...(request.sessionId !== undefined && { sessionId: request.sessionId }),
      ...(request.userId !== undefined && { userId: request.userId }),
    });

    return {
      success: executionResult.success,
      result: executionResult.result,
      executionTime: executionResult.executionTime,
      ...(executionResult.error !== undefined && { error: executionResult.error }),
    };
  }

  /**
   * Get conversation history for a session
   */
  async getSessionHistory(_sessionId: string): Promise<{
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
        actionExecutor: this.createActionExecutorAdapter(actionExecutorService),
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
          ...(result.intent?.category !== undefined && { intent: result.intent.category }),
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
        ...(toolResult.error !== undefined && { error: toolResult.error }),
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
        title: result.metadata['title'] || '',
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

  /**
   * Get or create Universal Agent Graph for complex tasks
   */
  private async getUniversalAgentGraph(siteId: string): Promise<UniversalAgentGraph> {
    if (!this.universalAgentGraphs.has(siteId)) {
      // Create function calling service instance
      const actionDispatchService = await this.createActionDispatchServiceAdapter(actionExecutorService);
      const functionCallingService = new FunctionCallingService(actionDispatchService); 

      // Create Universal Agent Graph with all dependencies
      const universalAgentGraph = createUniversalAgentGraph({
        functionCallingService,
        availableActions: await this.loadSiteActions(siteId), // Load from site action registry
        voiceEnabled: true,
        maxClarificationRounds: 3,
        speculativeExecutionEnabled: true,
      });

      this.universalAgentGraphs.set(siteId, universalAgentGraph);
      
      logger.info('Created Universal Agent Graph for site', { siteId });
    }

    return this.universalAgentGraphs.get(siteId)!;
  }

  /**
   * Build response from Universal Agent result
   */
  private buildUniversalAgentResponse(
    sessionId: string, 
    result: any, 
    startTime: number
  ): ConversationResponse {
    const responseTime = Date.now() - startTime;
    
    // Extract response text from Universal Agent result
    const responseText = result.finalResponse || 
      result.clarificationQuestion || 
      "I'm working on your request...";

    // Extract citations from search results
    const citations = (result.searchResults || []).slice(0, 3).map((item: any) => ({
      url: item.url,
      title: item.title || item.metadata?.title || 'Untitled',
      snippet: item.relevantSnippet || item.content?.substring(0, 200) + '...' || ''
    }));

    // Build UI hints from slot frame and tool results
    const uiHints: any = {
      highlightElements: [],
      scrollToElement: undefined,
      showModal: false,
      confirmationRequired: result.needsConfirmation || false
    };

    // Add navigation hints from executed tools
    if (result.executedTools) {
      const navTool = result.executedTools.find((tool: any) => 
        tool.toolName.includes('navigate') || tool.toolName.includes('scroll')
      );
      if (navTool) {
        uiHints.scrollToElement = navTool.parameters?.selector;
      }
    }

    return {
      sessionId,
      response: {
        text: responseText,
        citations,
        uiHints,
        metadata: {
          responseTime,
          tokensUsed: result.performanceMetrics?.tokensUsed || 0,
          actionsTaken: result.executedTools?.length || 0,
          language: result.conversationContext?.userPreferences?.language || 'en-US',
          intent: result.slotFrame?.intent,
        },
      },
      actions: result.executedTools?.map((tool: any) => ({
        name: tool.toolName,
        parameters: tool.parameters,
        success: tool.success,
        executionTime: tool.executionTime
      })) || []
    };
  }

  /**
   * Load available actions for a site
   */
  private async loadSiteActions(siteId: string): Promise<SiteAction[]> {
    try {
      // Import the tools registry dynamically
      const { aiToolsRegistry } = await import('../tools/registry.js');
      
      // Get available tools for the site
      const tools = aiToolsRegistry.getToolsForSite(siteId, 'default-tenant');
      
      // Convert RegistryToolDefinition[] to SiteAction[]  
      const actions: SiteAction[] = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.map(param => ({
          name: param.name,
          type: this.mapParameterType(param.schema),
          required: param.required,
          description: param.description,
          default: param.defaultValue,
        })),
        type: this.inferActionType(tool.name),
        selector: `[data-action="${tool.name}"]`, // Default selector
        confirmation: tool.confirmRequired,
        sideEffecting: this.mapSideEffects(tool.sideEffects),
        riskLevel: this.mapRiskLevel(tool.sideEffects),
        category: this.mapCategory(tool.name),
      }));
      
      logger.debug('Loaded site actions', { 
        siteId, 
        actionCount: actions.length 
      });
      
      return actions;
    } catch (error) {
      logger.error('Failed to load site actions', { 
        siteId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Return empty array as fallback
      return [];
    }
  }

  private mapParameterType(schema: Record<string, unknown>): ActionParameter['type'] {
    const type = schema['type'] as string;
    switch (type) {
      case 'string': return 'string';
      case 'number': case 'integer': return 'number';
      case 'boolean': return 'boolean';
      case 'object': return 'object';
      case 'array': return 'array';
      default: return 'string';
    }
  }

  private inferActionType(toolName: string): SiteAction['type'] {
    if (toolName.includes('navigation')) {return 'navigation';}
    if (toolName.includes('form')) {return 'form';}
    if (toolName.includes('button')) {return 'button';}
    if (toolName.includes('api')) {return 'api';}
    return 'custom';
  }

  private mapSideEffects(sideEffects: string): SiteAction['sideEffecting'] {
    switch (sideEffects) {
      case 'NONE':
      case 'LOW': return 'safe';
      case 'MEDIUM': return 'confirmation_required';
      case 'HIGH': return 'destructive';
      default: return 'safe';
    }
  }

  private mapRiskLevel(sideEffects: string): SiteAction['riskLevel'] {
    switch (sideEffects) {
      case 'HIGH': return 'high';
      case 'MEDIUM': return 'medium';
      case 'LOW':
      case 'NONE':
      default: return 'low';
    }
  }

  private mapCategory(toolName: string): SiteAction['category'] {
    if (toolName.includes('delete') || toolName.includes('remove')) {return 'delete';}
    if (toolName.includes('payment') || toolName.includes('checkout') || toolName.includes('pay')) {return 'payment';}
    if (toolName.includes('message') || toolName.includes('email') || toolName.includes('contact')) {return 'communication';}
    if (toolName.includes('create') || toolName.includes('add') || toolName.includes('update') || toolName.includes('edit')) {return 'write';}
    return 'read';
  }

  /**
   * Create adapter for ActionExecutorService to match LangGraph interface
   */
  private createActionExecutorAdapter(actionExecutorService: typeof import('./ActionExecutorService').actionExecutorService) {
    return {
      async execute(params: {
        siteId: string;
        actionName: string;
        parameters: Record<string, unknown>;
        sessionId?: string;
        userId?: string;
        tenantId?: string;
      }) {
        const result = await actionExecutorService.execute({
          siteId: params.siteId,
          actionName: params.actionName,
          parameters: params.parameters,
          ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
          ...(params.userId !== undefined && { userId: params.userId }),
        });

        return {
          success: result.success,
          result: result.result,
          executionTime: result.executionTime,
          ...(result.error !== undefined && { error: result.error }),
          metadata: {
            sideEffectsCount: result.sideEffects.length,
            sideEffects: result.sideEffects,
          },
        };
      },
      
      getAvailableActions(siteId: string) {
        const actions = actionExecutorService.getAvailableActions(siteId);
        return actions.map(action => ({
          name: action.name,
          description: action.description,
          parameters: action.parameters.reduce((acc, param) => {
            acc[param.name] = {
              type: param.type,
              required: param.required,
              description: param.description,
            };
            return acc;
          }, {} as Record<string, unknown>),
          ...(action.confirmation !== undefined && { confirmation: action.confirmation }),
        }));
      },
    };
  }

  /**
   * Create adapter for ActionExecutorService to match ActionDispatchService interface
   */
  private async createActionDispatchServiceAdapter(_actionExecutorService: typeof import('./ActionExecutorService').actionExecutorService) {
    const { getActionDispatchService } = await import('./services/ActionDispatchService.js');
    return getActionDispatchService();
  }
}

// Export singleton instance
export const aiOrchestrationService = new AIOrchestrationService({
  kbService: {
    async semanticSearch(params: {
      siteId: string;
      query: string;
      topK: number;
      locale: string;
    }) {
      try {
        const kbService = getKnowledgeBaseService();
        const searchResults = await kbService.semanticSearch({
          query: params.query,
          siteId: params.siteId,
          tenantId: 'default-tenant', // Use default tenant for service adapter
          limit: params.topK,
          threshold: 0.7,
          filters: {
            locale: params.locale
          }
        });
        
        return searchResults.map(result => ({
          id: result.id,
          content: result.content,
          url: result.url,
          score: result.score,
          metadata: result.metadata || {},
        }));
      } catch (error) {
        logger.error('Knowledge base search failed in adapter', {
          siteId: params.siteId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return [];
      }
    }
  },
  // Optional services are omitted instead of passing null
});