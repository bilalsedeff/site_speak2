/**
 * Enhanced Voice Conversation Orchestrator - Advanced Intent Recognition Integration
 *
 * Enhanced version with multi-layered intent recognition:
 * - Advanced intent recognition using IntentOrchestrator
 * - Context-aware conversation management
 * - Performance optimized for <300ms response times
 * - Universal website compatibility
 * - Intelligent fallback strategies
 * - Real-time learning and adaptation
 */

// TODO: LangChain imports may need version compatibility check
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createLogger, getErrorMessage } from '../../../../shared/utils.js';
import {
  IntentOrchestrator,
  createDefaultIntentConfig,
  type IntentCategory,
  type IntentProcessingResponse,
  type RawPageData,
  type SessionData,
} from './intent/index.js';
import type { VoiceActionExecutor, VoiceCommand, ActionExecutionResult } from './VoiceActionExecutor.js';
import type { SiteManifest, EnhancedSiteAction } from './ActionManifestGenerator.js';
import type { ActionContext } from './WidgetActionBridge.js';

const logger = createLogger({ service: 'voice-conversation-orchestrator-enhanced' });

// Enhanced conversation state with intent recognition data
const EnhancedConversationState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update],
  }),
  intentProcessingResult: Annotation<IntentProcessingResponse | null>({
    reducer: (current, update) => update ?? current,
  }),
  actionCandidate: Annotation<EnhancedSiteAction | null>({
    reducer: (current, update) => update ?? current,
  }),
  context: Annotation<ActionContext>({
    reducer: (current, update) => ({ ...current, ...update }),
  }),
  pendingConfirmation: Annotation<boolean>({
    reducer: (current, update) => update ?? current,
  }),
  executionResult: Annotation<ActionExecutionResult | null>({
    reducer: (current, update) => update ?? current,
  }),
  nextSteps: Annotation<string[]>({
    reducer: (current, update) => update ?? current,
  }),
  suggestions: Annotation<string[]>({
    reducer: (current, update) => update ?? current,
  }),
  confidence: Annotation<number>({
    reducer: (current, update) => update ?? current,
  }),
  needsClarification: Annotation<boolean>({
    reducer: (current, update) => update ?? current,
  }),
});

export interface EnhancedConversationConfig {
  openaiApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  streamingEnabled: boolean;
  functionCallingEnabled: boolean;
  confirmationThreshold: number;
  intentRecognition: {
    enabled: boolean;
    mode: 'high-performance' | 'balanced' | 'conservative';
    enableValidation: boolean;
    enableCaching: boolean;
    enableLearning: boolean;
    performanceTarget: number;
  };
}

export interface EnhancedConversationSession {
  id: string;
  tenantId: string;
  siteId: string;
  userId?: string;
  startedAt: Date;
  lastActivity: Date;
  state: typeof EnhancedConversationState.State;
  isActive: boolean;
  intentHistory: Array<{
    intent: IntentCategory;
    confidence: number;
    timestamp: Date;
    wasCorrect?: boolean;
  }>;
  metrics: {
    totalTurns: number;
    averageResponseTime: number;
    averageIntentProcessingTime: number;
    successfulActions: number;
    failedActions: number;
    confirmationsRequired: number;
    clarificationsRequested: number;
    cacheHitRate: number;
    intentAccuracy: number;
  };
}

/**
 * Enhanced Voice Conversation Orchestrator with Advanced Intent Recognition
 */
export class VoiceConversationOrchestratorEnhanced {
  private llm: ChatOpenAI;
  private conversationGraph: StateGraph<typeof EnhancedConversationState>;
  private activeSessions = new Map<string, EnhancedConversationSession>();
  private voiceActionExecutor: VoiceActionExecutor;
  private siteManifest: SiteManifest | null = null;
  private config: EnhancedConversationConfig;

  // Advanced intent recognition system
  private intentOrchestrator: IntentOrchestrator | null = null;

  constructor(
    config: EnhancedConversationConfig,
    voiceActionExecutor: VoiceActionExecutor
  ) {
    this.config = config;
    this.voiceActionExecutor = voiceActionExecutor;
    this.initializeLLM();
    this.buildEnhancedConversationGraph();

    logger.info('VoiceConversationOrchestratorEnhanced initialized', {
      model: config.model,
      streamingEnabled: config.streamingEnabled,
      functionCallingEnabled: config.functionCallingEnabled,
      intentRecognitionEnabled: config.intentRecognition.enabled,
      intentMode: config.intentRecognition.mode,
    });
  }

  /**
   * Initialize the advanced intent recognition system
   */
  async initializeIntentRecognition(): Promise<void> {
    if (!this.config.intentRecognition.enabled) {
      logger.info('Intent recognition disabled, using fallback methods');
      return;
    }

    try {
      logger.info('Initializing advanced intent recognition system');

      const intentConfig = createDefaultIntentConfig(this.config.openaiApiKey, {
        enableValidation: this.config.intentRecognition.enableValidation,
        enableCaching: this.config.intentRecognition.enableCaching,
        enableLearning: this.config.intentRecognition.enableLearning,
        performanceTarget: this.config.intentRecognition.performanceTarget,
      });

      // Adjust config based on mode
      switch (this.config.intentRecognition.mode) {
        case 'high-performance':
          intentConfig.performance.targetProcessingTime = 200;
          intentConfig.secondaryValidation.enabled = false;
          break;
        case 'conservative':
          intentConfig.performance.targetProcessingTime = 500;
          intentConfig.secondaryValidation.enabled = true;
          intentConfig.ensemble.enabled = true;
          break;
        case 'balanced':
        default:
          // Use default balanced configuration
          break;
      }

      this.intentOrchestrator = new IntentOrchestrator(intentConfig);
      await this.intentOrchestrator.initialize();

      logger.info('Advanced intent recognition system initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize intent recognition system', {
        error: getErrorMessage(error),
      });

      // Continue without advanced intent recognition
      this.intentOrchestrator = null;
      logger.warn('Continuing with fallback intent recognition');
    }
  }

  /**
   * Initialize OpenAI LLM
   */
  private initializeLLM(): void {
    this.llm = new ChatOpenAI({
      apiKey: this.config.openaiApiKey,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      streaming: this.config.streamingEnabled,
    });

    if (this.config.functionCallingEnabled) {
      this.setupFunctionCalling();
    }
  }

  /**
   * Setup OpenAI function calling with dynamic action tools
   */
  private setupFunctionCalling(): void {
    if (!this.siteManifest) {
      logger.warn('No site manifest available for function calling setup');
      return;
    }

    const tools = this.siteManifest.actions.map(action => ({
      type: 'function' as const,
      function: {
        name: action.name.replace(/\s+/g, '_').toLowerCase(),
        description: action.description,
        parameters: action.jsonSchema || {
          type: 'object',
          properties: {},
        },
      },
    }));

    // Add standard voice interface functions
    tools.push(
      {
        type: 'function',
        function: {
          name: 'select_element',
          description: 'Select an element on the page for interaction',
          parameters: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Natural language description of the element',
              },
              selector: {
                type: 'string',
                description: 'CSS selector if known',
              },
            },
            required: ['description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit_element',
          description: 'Edit properties of an element',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Element to edit' },
              property: { type: 'string', description: 'Property to change' },
              value: { type: 'string', description: 'New value' },
            },
            required: ['target', 'property', 'value'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'request_clarification',
          description: 'Request clarification from the user when intent is unclear',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'Clarification question to ask the user',
              },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Possible options for the user to choose from',
              },
            },
            required: ['question'],
          },
        },
      }
    );

    this.llm = this.llm.bind({ tools });

    logger.info('Enhanced function calling setup complete', {
      toolCount: tools.length,
      siteActions: this.siteManifest.actions.length,
    });
  }

  /**
   * Build enhanced conversation flow with advanced intent recognition
   */
  private buildEnhancedConversationGraph(): void {
    const graph = new StateGraph(EnhancedConversationState);

    // Define enhanced conversation nodes
    graph.addNode('understand_intent_advanced', this.understandIntentAdvanced.bind(this));
    graph.addNode('validate_intent', this.validateIntent.bind(this));
    graph.addNode('retrieve_context', this.retrieveContext.bind(this));
    graph.addNode('plan_action', this.planAction.bind(this));
    graph.addNode('confirm_action', this.confirmAction.bind(this));
    graph.addNode('execute_action', this.executeAction.bind(this));
    graph.addNode('generate_response', this.generateResponse.bind(this));
    graph.addNode('handle_clarification', this.handleClarification.bind(this));
    graph.addNode('handle_error', this.handleError.bind(this));

    // Define enhanced conversation flow
    graph.addEdge(START, 'understand_intent_advanced');

    graph.addConditionalEdges(
      'understand_intent_advanced',
      this.shouldValidateIntent.bind(this),
      {
        validate: 'validate_intent',
        clarify: 'handle_clarification',
        proceed: 'retrieve_context',
        error: 'handle_error',
      }
    );

    graph.addConditionalEdges(
      'validate_intent',
      this.shouldProceedWithIntent.bind(this),
      {
        proceed: 'retrieve_context',
        clarify: 'handle_clarification',
        error: 'handle_error',
      }
    );

    graph.addEdge('handle_clarification', 'generate_response');

    graph.addConditionalEdges(
      'retrieve_context',
      this.shouldPlanAction.bind(this),
      {
        plan: 'plan_action',
        respond: 'generate_response',
      }
    );

    graph.addConditionalEdges(
      'plan_action',
      this.shouldConfirmAction.bind(this),
      {
        confirm: 'confirm_action',
        execute: 'execute_action',
        respond: 'generate_response',
      }
    );

    graph.addConditionalEdges(
      'confirm_action',
      this.shouldExecuteAction.bind(this),
      {
        execute: 'execute_action',
        respond: 'generate_response',
        error: 'handle_error',
      }
    );

    graph.addEdge('execute_action', 'generate_response');
    graph.addEdge('generate_response', END);
    graph.addEdge('handle_error', END);

    this.conversationGraph = graph.compile();

    logger.info('Enhanced conversation graph built successfully');
  }

  /**
   * Process voice input with advanced intent recognition
   */
  async processVoiceInput(
    sessionId: string,
    audioTranscript: string,
    context: ActionContext,
    onStreaming?: (response: any) => void
  ): Promise<ActionExecutionResult | null> {
    const session = this.getOrCreateSession(sessionId, context);
    const startTime = Date.now();

    try {
      logger.info('Processing voice input with advanced intent recognition', {
        sessionId,
        transcript: audioTranscript.slice(0, 100),
        contextSiteId: context.siteId,
        intentRecognitionEnabled: !!this.intentOrchestrator,
      });

      // Update session state with new input
      session.state = {
        ...session.state,
        messages: [...session.state.messages, new HumanMessage(audioTranscript)],
        context,
        needsClarification: false,
      };

      // Stream initial acknowledgment
      if (onStreaming) {
        onStreaming({
          type: 'partial',
          content: 'Understanding your request...',
          timestamp: new Date(),
        });
      }

      // Execute enhanced conversation graph
      const result = await this.conversationGraph.invoke(session.state);

      // Update session with result
      session.state = result;
      session.lastActivity = new Date();
      session.metrics.totalTurns++;

      // Update intent history
      if (result.intentProcessingResult) {
        session.intentHistory.push({
          intent: result.intentProcessingResult.classification.intent,
          confidence: result.intentProcessingResult.classification.confidence,
          timestamp: new Date(),
        });

        // Keep only last 20 intents
        session.intentHistory = session.intentHistory.slice(-20);
      }

      // Calculate metrics
      const responseTime = Date.now() - startTime;
      const intentProcessingTime = result.intentProcessingResult?.metrics.totalProcessingTime || 0;

      session.metrics.averageResponseTime =
        (session.metrics.averageResponseTime * (session.metrics.totalTurns - 1) + responseTime) /
        session.metrics.totalTurns;

      session.metrics.averageIntentProcessingTime =
        (session.metrics.averageIntentProcessingTime * (session.metrics.totalTurns - 1) + intentProcessingTime) /
        session.metrics.totalTurns;

      if (result.intentProcessingResult?.metrics.cacheHit) {
        session.metrics.cacheHitRate =
          (session.metrics.cacheHitRate * (session.metrics.totalTurns - 1) + 1) /
          session.metrics.totalTurns;
      }

      if (result.needsClarification) {
        session.metrics.clarificationsRequested++;
      }

      logger.info('Enhanced voice input processed successfully', {
        sessionId,
        responseTime,
        intentProcessingTime,
        intent: result.intentProcessingResult?.classification.intent,
        confidence: result.intentProcessingResult?.classification.confidence,
        actionExecuted: !!result.executionResult,
        cacheHit: result.intentProcessingResult?.metrics.cacheHit,
        needsClarification: result.needsClarification,
      });

      return result.executionResult;

    } catch (error) {
      session.metrics.totalTurns++;

      logger.error('Enhanced voice input processing failed', {
        sessionId,
        error: getErrorMessage(error),
        transcript: audioTranscript.slice(0, 50),
      });

      if (onStreaming) {
        onStreaming({
          type: 'error',
          content: 'I encountered an error processing your request. Please try again.',
          metadata: { error: getErrorMessage(error) },
          timestamp: new Date(),
        });
      }

      return null;
    }
  }

  /**
   * Advanced intent understanding using IntentOrchestrator
   */
  private async understandIntentAdvanced(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage || lastMessage.constructor.name !== 'HumanMessage') {
      throw new Error('No user message to process');
    }

    const userInput = lastMessage.content as string;
    let intentProcessingResult: IntentProcessingResponse | null = null;

    try {
      if (this.intentOrchestrator) {
        // Use advanced intent recognition
        const pageData = this.createPageDataFromContext(state.context);
        const sessionData = this.createSessionDataFromContext(state.context);
        const userRole = this.getUserRoleFromContext(state.context);

        intentProcessingResult = await this.intentOrchestrator.processIntent(
          userInput,
          pageData,
          sessionData,
          userRole,
          {
            timeoutMs: this.config.intentRecognition.performanceTarget,
          }
        );

        logger.debug('Advanced intent recognition completed', {
          intent: intentProcessingResult.classification.intent,
          confidence: intentProcessingResult.classification.confidence,
          processingTime: intentProcessingResult.metrics.totalProcessingTime,
          cacheHit: intentProcessingResult.metrics.cacheHit,
          warnings: intentProcessingResult.warnings?.length || 0,
        });

      } else {
        // Fallback to simple intent recognition
        intentProcessingResult = await this.fallbackIntentRecognition(userInput, state.context);

        logger.debug('Fallback intent recognition used', {
          intent: intentProcessingResult.classification.intent,
          confidence: intentProcessingResult.classification.confidence,
        });
      }

      return {
        intentProcessingResult,
        confidence: intentProcessingResult.classification.confidence,
        needsClarification: intentProcessingResult.classification.confidence < 0.6,
        suggestions: intentProcessingResult.recommendations?.map(r => r.phrase) || [],
      };

    } catch (error) {
      logger.error('Intent understanding failed', {
        error: getErrorMessage(error),
        userInput: userInput.slice(0, 50),
      });

      // Create fallback intent result
      const fallbackResult: IntentProcessingResponse = {
        classification: {
          intent: 'unknown_intent',
          confidence: 0.3,
          parameters: {},
          reasoning: `Error in intent recognition: ${getErrorMessage(error)}`,
          source: 'fallback',
          processingTime: 0,
        },
        validation: {
          isValid: false,
          confidence: 0.3,
          validationTime: 0,
        },
        contextualAnalysis: {
          pageContext: {
            url: state.context.origin || '',
            domain: '',
            pageType: 'other',
            contentType: 'other',
            availableElements: [],
            capabilities: [],
            currentMode: 'view',
          },
          sessionContext: {
            sessionId: state.context.sessionId,
            tenantId: state.context.tenantId,
            siteId: state.context.siteId,
            startTime: new Date(),
            previousIntents: [],
            conversationState: {
              entities: {},
              context: {},
              pendingActions: [],
            },
          },
          userContext: {
            role: 'guest',
            permissions: [],
            previousSessions: [],
          },
          availableActions: [],
          contextualBoosts: {},
          constrainedIntents: [],
        },
        metrics: {
          totalProcessingTime: 0,
          cacheHit: false,
          modelsUsed: ['fallback'],
          confidenceBreakdown: { fallback: 0.3 },
        },
        warnings: ['Intent recognition system unavailable'],
        errors: [getErrorMessage(error)],
      };

      return {
        intentProcessingResult: fallbackResult,
        confidence: 0.3,
        needsClarification: true,
        suggestions: ['Could you please rephrase your request?', 'Try asking for help'],
      };
    }
  }

  /**
   * Validate intent processing results
   */
  private async validateIntent(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const result = state.intentProcessingResult;

    if (!result) {
      return { needsClarification: true };
    }

    // Check if validation passed and confidence is acceptable
    const isValid = result.validation.isValid && result.classification.confidence >= 0.5;

    if (!isValid) {
      logger.debug('Intent validation failed or low confidence', {
        isValid: result.validation.isValid,
        confidence: result.classification.confidence,
        conflicts: result.validation.conflicts?.length || 0,
      });

      return {
        needsClarification: true,
        suggestions: result.recommendations?.map(r => r.phrase) || [],
      };
    }

    return {
      needsClarification: false,
      confidence: result.classification.confidence,
    };
  }

  /**
   * Handle clarification requests
   */
  private async handleClarification(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const result = state.intentProcessingResult;
    const suggestions = state.suggestions || [];

    let clarificationMessage: string;

    if (result?.validation.resolution?.clarificationQuestion) {
      clarificationMessage = result.validation.resolution.clarificationQuestion;
    } else if (suggestions.length > 0) {
      clarificationMessage = `I'm not sure what you'd like to do. Did you mean:\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    } else {
      clarificationMessage = "I'm not sure what you'd like to do. Could you please be more specific? For example, you can say 'click the submit button' or 'navigate to the home page'.";
    }

    const clarificationResponse = new AIMessage(clarificationMessage);

    return {
      messages: [...state.messages, clarificationResponse],
      needsClarification: false,
    };
  }

  /**
   * Retrieve context (enhanced with intent processing result)
   */
  private async retrieveContext(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const result = state.intentProcessingResult;

    if (!result) {
      return {};
    }

    const contextInfo = {
      intent: result.classification.intent,
      confidence: result.classification.confidence,
      availableActions: result.contextualAnalysis.availableActions,
      pageCapabilities: result.contextualAnalysis.pageContext.capabilities,
      currentPage: result.contextualAnalysis.pageContext.url,
      processingTime: result.metrics.totalProcessingTime,
      cacheHit: result.metrics.cacheHit,
    };

    logger.debug('Enhanced context retrieved', {
      intent: result.classification.intent,
      confidence: result.classification.confidence,
      availableActions: result.contextualAnalysis.availableActions.length,
      capabilities: result.contextualAnalysis.pageContext.capabilities.length,
    });

    return {
      messages: [...state.messages, new AIMessage(`Context: ${JSON.stringify(contextInfo)}`)],
    };
  }

  /**
   * Plan action based on advanced intent recognition
   */
  private async planAction(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const result = state.intentProcessingResult;

    if (!result) {
      throw new Error('No intent processing result available for action planning');
    }

    const userInput = state.messages.find(m => m.constructor.name === 'HumanMessage')?.content as string;

    // Map intent to action
    const actionCandidate = await this.mapIntentToAction(
      result.classification.intent,
      result.classification.parameters,
      result.contextualAnalysis
    );

    if (!actionCandidate) {
      logger.warn('No action found for intent', {
        intent: result.classification.intent,
        parameters: result.classification.parameters,
      });

      return {
        messages: [...state.messages, new AIMessage(`I understand you want to ${result.classification.intent.replace(/_/g, ' ')}, but I'm not sure how to do that on this page.`)],
      };
    }

    logger.debug('Action planned from intent', {
      intent: result.classification.intent,
      actionName: actionCandidate.name,
      confidence: result.classification.confidence,
    });

    return {
      actionCandidate,
      messages: [...state.messages, new AIMessage(`Planning to: ${actionCandidate.description}`)],
    };
  }

  /**
   * Map intent to executable action
   */
  private async mapIntentToAction(
    intent: IntentCategory,
    parameters: Record<string, any>,
    contextAnalysis: any
  ): Promise<EnhancedSiteAction | null> {
    // Try to find matching action from site manifest
    if (this.siteManifest) {
      const matchingAction = this.siteManifest.actions.find(action => {
        const actionName = action.name.toLowerCase();
        const intentName = intent.replace(/_/g, ' ').toLowerCase();
        return actionName.includes(intentName) || intentName.includes(actionName);
      });

      if (matchingAction) {
        return matchingAction;
      }
    }

    // Create generic action based on intent
    return this.createGenericAction(intent, parameters, contextAnalysis);
  }

  /**
   * Create generic action for intent
   */
  private createGenericAction(
    intent: IntentCategory,
    parameters: Record<string, any>,
    contextAnalysis: any
  ): EnhancedSiteAction {
    const intentDescriptions: Partial<Record<IntentCategory, string>> = {
      'click_element': 'Click on an element',
      'navigate_to_page': 'Navigate to a page',
      'edit_text': 'Edit text content',
      'submit_form': 'Submit a form',
      'search_content': 'Search for content',
      'add_to_cart': 'Add item to shopping cart',
      'help_request': 'Provide help information',
    };

    return {
      id: `generic_${intent}`,
      name: intent.replace(/_/g, ' '),
      type: 'custom',
      description: intentDescriptions[intent] || `Perform ${intent.replace(/_/g, ' ')}`,
      parameters: Object.keys(parameters).map(key => ({
        name: key,
        type: typeof parameters[key] === 'string' ? 'string' : 'object',
        required: true,
        description: `Parameter: ${key}`,
      })),
      requiresAuth: false,
      riskLevel: intent.includes('delete') ? 'high' : 'low',
      sideEffecting: intent.includes('edit') || intent.includes('delete') || intent.includes('add') ? 'write' : 'read',
      confirmation: intent.includes('delete') || intent.includes('submit'),
    };
  }

  /**
   * Create page data from action context
   */
  private createPageDataFromContext(context: ActionContext): RawPageData {
    return {
      url: context.origin || 'https://localhost',
      title: 'Current Page',
      htmlContent: '', // Would be populated from actual page data
      domElements: [], // Would be populated from actual DOM analysis
      timestamp: new Date(),
    };
  }

  /**
   * Create session data from action context
   */
  private createSessionDataFromContext(context: ActionContext): SessionData {
    return {
      sessionId: context.sessionId,
      userId: context.userId,
      tenantId: context.tenantId,
      siteId: context.siteId,
      startTime: new Date(),
      previousCommands: [], // Would be populated from session history
    };
  }

  /**
   * Get user role from context
   */
  private getUserRoleFromContext(context: ActionContext): 'admin' | 'editor' | 'viewer' | 'guest' {
    // This would be determined from the actual user context
    return context.userId ? 'editor' : 'guest';
  }

  /**
   * Fallback intent recognition for when advanced system is unavailable
   */
  private async fallbackIntentRecognition(
    userInput: string,
    context: ActionContext
  ): Promise<IntentProcessingResponse> {
    // Simple keyword-based intent recognition
    const text = userInput.toLowerCase();
    let intent: IntentCategory = 'unknown_intent';
    let confidence = 0.5;

    if (text.includes('click') || text.includes('press') || text.includes('button')) {
      intent = 'click_element';
      confidence = 0.7;
    } else if (text.includes('navigate') || text.includes('go to') || text.includes('open')) {
      intent = 'navigate_to_page';
      confidence = 0.7;
    } else if (text.includes('edit') || text.includes('change') || text.includes('modify')) {
      intent = 'edit_text';
      confidence = 0.6;
    } else if (text.includes('search') || text.includes('find')) {
      intent = 'search_content';
      confidence = 0.7;
    } else if (text.includes('help')) {
      intent = 'help_request';
      confidence = 0.8;
    }

    return {
      classification: {
        intent,
        confidence,
        parameters: {},
        reasoning: 'Fallback keyword-based recognition',
        source: 'fallback',
        processingTime: 5,
      },
      validation: {
        isValid: confidence >= 0.5,
        confidence,
        validationTime: 0,
      },
      contextualAnalysis: {
        pageContext: {
          url: context.origin || '',
          domain: '',
          pageType: 'other',
          contentType: 'other',
          availableElements: [],
          capabilities: [],
          currentMode: 'view',
        },
        sessionContext: {
          sessionId: context.sessionId,
          tenantId: context.tenantId,
          siteId: context.siteId,
          startTime: new Date(),
          previousIntents: [],
          conversationState: {
            entities: {},
            context: {},
            pendingActions: [],
          },
        },
        userContext: {
          role: 'guest',
          permissions: [],
          previousSessions: [],
        },
        availableActions: [],
        contextualBoosts: {},
        constrainedIntents: [],
      },
      metrics: {
        totalProcessingTime: 5,
        cacheHit: false,
        modelsUsed: ['fallback'],
        confidenceBreakdown: { fallback: confidence },
      },
      warnings: ['Using fallback intent recognition'],
      errors: [],
    };
  }

  /**
   * Conditional edge functions for enhanced flow
   */
  private shouldValidateIntent(state: typeof EnhancedConversationState.State): string {
    const result = state.intentProcessingResult;

    if (!result) {
      return 'error';
    }

    if (result.classification.confidence < 0.4) {
      return 'clarify';
    }

    if (result.validation.conflicts && result.validation.conflicts.length > 0) {
      return 'validate';
    }

    return 'proceed';
  }

  private shouldProceedWithIntent(state: typeof EnhancedConversationState.State): string {
    if (state.needsClarification) {
      return 'clarify';
    }

    return 'proceed';
  }

  private shouldPlanAction(state: typeof EnhancedConversationState.State): string {
    const result = state.intentProcessingResult;

    if (!result) {
      return 'respond';
    }

    const actionableIntents = [
      'navigate_to_page', 'click_element', 'edit_text', 'submit_form',
      'add_to_cart', 'search_content', 'delete_content'
    ];

    return actionableIntents.includes(result.classification.intent) ? 'plan' : 'respond';
  }

  private shouldConfirmAction(state: typeof EnhancedConversationState.State): string {
    if (!state.actionCandidate) {
      return 'respond';
    }

    const needsConfirmation =
      state.actionCandidate.confirmation ||
      state.actionCandidate.riskLevel === 'high' ||
      state.confidence < this.config.confirmationThreshold;

    return needsConfirmation ? 'confirm' : 'execute';
  }

  private shouldExecuteAction(state: typeof EnhancedConversationState.State): string {
    if (!state.pendingConfirmation) {
      return 'execute';
    }

    const lastMessage = state.messages[state.messages.length - 1];
    const userInput = lastMessage?.content as string || '';

    if (userInput.toLowerCase().includes('yes') || userInput.toLowerCase().includes('confirm')) {
      return 'execute';
    } else if (userInput.toLowerCase().includes('no') || userInput.toLowerCase().includes('cancel')) {
      return 'respond';
    }

    return 'error';
  }

  /**
   * Confirm action (enhanced with intent confidence)
   */
  private async confirmAction(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    if (!state.actionCandidate) {
      throw new Error('No action to confirm');
    }

    const intentResult = state.intentProcessingResult;
    const confidenceText = intentResult ?
      ` (${Math.round(intentResult.classification.confidence * 100)}% confidence)` : '';

    const confirmationMessage = new AIMessage(
      `I'm about to ${state.actionCandidate.description}${confidenceText}. ` +
      `This action is marked as ${state.actionCandidate.riskLevel} risk. ` +
      `Say "yes" to confirm or "no" to cancel.`
    );

    return {
      pendingConfirmation: true,
      messages: [...state.messages, confirmationMessage],
    };
  }

  /**
   * Execute action (enhanced with intent tracking)
   */
  private async executeAction(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    if (!state.actionCandidate) {
      throw new Error('No action to execute');
    }

    const userInput = state.messages.find(m => m.constructor.name === 'HumanMessage')?.content as string;
    const intentResult = state.intentProcessingResult;

    // Create enhanced voice command with intent data
    const voiceCommand: VoiceCommand = {
      text: userInput || '',
      intent: intentResult?.classification.intent || 'unknown_intent',
      confidence: intentResult?.classification.confidence || 0.5,
      parameters: intentResult?.classification.parameters || {},
      context: {
        currentPage: state.context.origin,
        editorMode: 'design',
        userRole: 'editor',
        selectedElement: intentResult?.classification.parameters?.['target'],
      },
    };

    // Execute action with enhanced context
    const executionResult = await this.voiceActionExecutor.executeVoiceCommand(
      voiceCommand,
      state.context
    );

    // Update session metrics
    const session = this.activeSessions.get(state.context.sessionId);
    if (session) {
      if (executionResult.success) {
        session.metrics.successfulActions++;

        // Update intent accuracy if we know it was correct
        const totalIntents = session.intentHistory.length;
        if (totalIntents > 0) {
          session.metrics.intentAccuracy =
            (session.metrics.intentAccuracy * (totalIntents - 1) + 1) / totalIntents;
        }
      } else {
        session.metrics.failedActions++;
      }

      // Mark the last intent as correct/incorrect based on execution success
      if (session.intentHistory.length > 0) {
        session.intentHistory[session.intentHistory.length - 1]!.wasCorrect = executionResult.success;
      }
    }

    logger.info('Enhanced action executed', {
      actionName: state.actionCandidate.name,
      intent: intentResult?.classification.intent,
      confidence: intentResult?.classification.confidence,
      success: executionResult.success,
      executionTime: executionResult.executionTime,
    });

    return {
      executionResult,
      pendingConfirmation: false,
    };
  }

  /**
   * Generate enhanced response with intent insights
   */
  private async generateResponse(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    let responseContent = '';
    const intentResult = state.intentProcessingResult;

    if (state.executionResult) {
      if (state.executionResult.success) {
        responseContent = `Action completed successfully: ${state.executionResult.action.description}`;

        if (state.executionResult.followUpSuggestions?.length) {
          responseContent += ` You can also try: ${state.executionResult.followUpSuggestions.join(', ')}`;
        }
      } else {
        responseContent = `Sorry, I couldn't complete that action: ${state.executionResult.error}`;

        // Add intent-based suggestions for recovery
        if (intentResult?.recommendations?.length) {
          responseContent += ` You might try: ${intentResult.recommendations.map(r => r.phrase).join(', ')}`;
        }
      }
    } else if (state.needsClarification) {
      // Already handled in handleClarification
      return {};
    } else {
      // Generate conversational response with intent context
      const responsePrompt = new SystemMessage(`
Generate a helpful response to the user based on the conversation context and intent analysis.
Keep it conversational and brief.

Intent: ${intentResult?.classification.intent || 'unknown'}
Confidence: ${intentResult?.classification.confidence || 0}
Context: Voice interface for website builder
Available actions: ${intentResult?.contextualAnalysis.availableActions.join(', ') || 'none'}
`);

      const response = await this.llm.invoke([
        responsePrompt,
        ...state.messages,
      ]);

      responseContent = response.content as string;
    }

    const finalResponse = new AIMessage(responseContent);

    return {
      messages: [...state.messages, finalResponse],
    };
  }

  /**
   * Enhanced error handling with intent diagnostics
   */
  private async handleError(
    state: typeof EnhancedConversationState.State
  ): Promise<Partial<typeof EnhancedConversationState.State>> {
    const intentResult = state.intentProcessingResult;
    let errorResponse: string;

    if (intentResult?.errors && intentResult.errors.length > 0) {
      errorResponse = "I encountered an issue understanding your request. ";

      if (intentResult.recommendations && intentResult.recommendations.length > 0) {
        errorResponse += `You might try: ${intentResult.recommendations.map(r => r.phrase).slice(0, 2).join(' or ')}.`;
      } else {
        errorResponse += "Could you please rephrase your request or ask for help?";
      }
    } else {
      errorResponse =
        "I'm sorry, I didn't understand that. Could you please rephrase your request? " +
        "You can say things like 'select the header', 'change the color to blue', or 'help' for more options.";
    }

    const aiMessage = new AIMessage(errorResponse);

    return {
      messages: [...state.messages, aiMessage],
      pendingConfirmation: false,
      actionCandidate: null,
      needsClarification: false,
    };
  }

  /**
   * Learn from user feedback
   */
  async learnFromFeedback(
    sessionId: string,
    wasCorrect: boolean,
    userFeedback?: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    if (!this.intentOrchestrator) {
      return;
    }

    const session = this.activeSessions.get(sessionId);
    if (!session || session.intentHistory.length === 0) {
      return;
    }

    const lastIntent = session.intentHistory[session.intentHistory.length - 1]!;
    const lastMessage = session.state.messages
      .filter(m => m.constructor.name === 'HumanMessage')
      .slice(-1)[0];

    if (lastMessage) {
      try {
        await this.intentOrchestrator.learnFromFeedback(
          lastMessage.content as string,
          lastIntent.intent,
          wasCorrect,
          userFeedback
        );

        // Update session intent accuracy
        const correctIntents = session.intentHistory.filter(h => h.wasCorrect === true).length;
        const totalRatedIntents = session.intentHistory.filter(h => h.wasCorrect !== undefined).length;

        if (totalRatedIntents > 0) {
          session.metrics.intentAccuracy = correctIntents / totalRatedIntents;
        }

        logger.debug('Learned from user feedback', {
          sessionId,
          intent: lastIntent.intent,
          wasCorrect,
          userFeedback,
          newAccuracy: session.metrics.intentAccuracy,
        });

      } catch (error) {
        logger.error('Failed to learn from feedback', {
          sessionId,
          error: getErrorMessage(error),
        });
      }
    }
  }

  /**
   * Get or create enhanced conversation session
   */
  private getOrCreateSession(sessionId: string, context: ActionContext): EnhancedConversationSession {
    let session = this.activeSessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        tenantId: context.tenantId,
        siteId: context.siteId,
        userId: context.userId,
        startedAt: new Date(),
        lastActivity: new Date(),
        state: {
          messages: [],
          intentProcessingResult: null,
          actionCandidate: null,
          context,
          pendingConfirmation: false,
          executionResult: null,
          nextSteps: [],
          suggestions: [],
          confidence: 0,
          needsClarification: false,
        },
        isActive: true,
        intentHistory: [],
        metrics: {
          totalTurns: 0,
          averageResponseTime: 0,
          averageIntentProcessingTime: 0,
          successfulActions: 0,
          failedActions: 0,
          confirmationsRequired: 0,
          clarificationsRequested: 0,
          cacheHitRate: 0,
          intentAccuracy: 0,
        },
      };

      this.activeSessions.set(sessionId, session);

      logger.info('New enhanced conversation session created', {
        sessionId,
        tenantId: context.tenantId,
        siteId: context.siteId,
        intentRecognitionEnabled: !!this.intentOrchestrator,
      });
    } else {
      session.lastActivity = new Date();
    }

    return session;
  }

  /**
   * Set site manifest for enhanced function calling
   */
  setSiteManifest(manifest: SiteManifest): void {
    this.siteManifest = manifest;
    this.voiceActionExecutor.setActionManifest(manifest);

    if (this.config.functionCallingEnabled) {
      this.setupFunctionCalling();
    }

    logger.info('Site manifest updated for enhanced orchestrator', {
      actionCount: manifest.actions.length,
      capabilities: manifest.capabilities,
    });
  }

  /**
   * Get enhanced session metrics
   */
  getSessionMetrics(sessionId: string): EnhancedConversationSession['metrics'] | null {
    const session = this.activeSessions.get(sessionId);
    return session ? { ...session.metrics } : null;
  }

  /**
   * Get intent orchestrator health
   */
  async getIntentSystemHealth(): Promise<any> {
    if (!this.intentOrchestrator) {
      return { status: 'disabled' };
    }

    return await this.intentOrchestrator.getSystemHealth();
  }

  /**
   * Get overall orchestrator metrics including intent processing
   */
  getMetrics(): {
    activeSessions: number;
    totalSessions: number;
    averageSessionDuration: number;
    averageIntentProcessingTime: number;
    totalActions: number;
    successRate: number;
    intentAccuracy: number;
    cacheHitRate: number;
    clarificationRate: number;
  } {
    const sessions = Array.from(this.activeSessions.values());
    const totalActions = sessions.reduce((sum, s) => sum + s.metrics.successfulActions + s.metrics.failedActions, 0);
    const successfulActions = sessions.reduce((sum, s) => sum + s.metrics.successfulActions, 0);
    const totalClarifications = sessions.reduce((sum, s) => sum + s.metrics.clarificationsRequested, 0);
    const totalTurns = sessions.reduce((sum, s) => sum + s.metrics.totalTurns, 0);

    return {
      activeSessions: this.activeSessions.size,
      totalSessions: sessions.length,
      averageSessionDuration: sessions.reduce((sum, s) => sum + (Date.now() - s.startedAt.getTime()), 0) / Math.max(1, sessions.length),
      averageIntentProcessingTime: sessions.reduce((sum, s) => sum + s.metrics.averageIntentProcessingTime, 0) / Math.max(1, sessions.length),
      totalActions,
      successRate: totalActions > 0 ? successfulActions / totalActions : 0,
      intentAccuracy: sessions.reduce((sum, s) => sum + s.metrics.intentAccuracy, 0) / Math.max(1, sessions.length),
      cacheHitRate: sessions.reduce((sum, s) => sum + s.metrics.cacheHitRate, 0) / Math.max(1, sessions.length),
      clarificationRate: totalTurns > 0 ? totalClarifications / totalTurns : 0,
    };
  }

  /**
   * Close enhanced session
   */
  closeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);

      logger.info('Enhanced conversation session closed', {
        sessionId,
        totalTurns: session.metrics.totalTurns,
        successfulActions: session.metrics.successfulActions,
        intentAccuracy: session.metrics.intentAccuracy,
        averageIntentProcessingTime: session.metrics.averageIntentProcessingTime,
        duration: Date.now() - session.startedAt.getTime(),
      });
    }
  }

  /**
   * Cleanup enhanced orchestrator
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up VoiceConversationOrchestratorEnhanced');

    // Cleanup intent orchestrator
    if (this.intentOrchestrator) {
      await this.intentOrchestrator.cleanup();
    }

    // Clear sessions
    this.activeSessions.clear();

    logger.info('VoiceConversationOrchestratorEnhanced cleanup completed');
  }
}
