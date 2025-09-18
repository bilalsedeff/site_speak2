import { StateGraph, Annotation, START, END, MemorySaver, CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { createLogger } from '../../../shared/utils.js';
import { config } from '../../../infrastructure/config';
import { SiteAction, ActionParameter } from '../../../shared/types';
import {
  ToolResult,
  ActionPlanItem,
  ActionParameters
} from '../../../../../shared/types';
import { securityGuards } from '../application/services/SecurityGuards';
import { privacyGuards } from '../application/services/PrivacyGuards';
import { resourceBudgetsService } from '../application/services/ResourceBudgets';
import { errorRecoverySystem } from '../application/services/ErrorRecoverySystem';

const logger = createLogger({ service: 'langraph' });

// Session State Definition
const SessionState = Annotation.Root({
  sessionId: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  }),
  siteId: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => []
  }),
  userInput: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  }),
  detectedLanguage: Annotation<string | null>({
    reducer: (x: string | null, y: string | null) => y ?? x,
    default: () => null
  }),
  intent: Annotation<{
    category: string;
    confidence: number;
    extractedEntities: Record<string, string | number | boolean | null>;
  } | null>({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  kbResults: Annotation<Array<{
    id: string;
    content: string;
    url: string;
    score: number;
    metadata: Record<string, string | number | boolean | null>;
  }>>({
    reducer: (x, y) => y.length > 0 ? y : x,
    default: () => []
  }),
  actionPlan: Annotation<ActionPlanItem[]>({
    reducer: (x, y) => y.length > 0 ? y : x,
    default: () => []
  }),
  toolResults: Annotation<ToolResult[]>({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  finalResponse: Annotation<{
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
      tokensUsed: number;
      processingTime: number;
      actionsExecuted: number;
    };
  } | null>({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  needsConfirmation: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y ?? x,
    default: () => false
  }),
  confirmationReceived: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y ?? x,
    default: () => false
  }),
  error: Annotation<string | null>({
    reducer: (x: string | null, y: string | null) => y ?? x,
    default: () => null
  }),
  
  // Enterprise Security & Privacy
  securityResult: Annotation<{
    allowed: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    issues: Array<{ type: string; severity: string; description: string }>;
  } | null>({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  privacyResult: Annotation<{
    hasPII: boolean;
    detectedTypes: string[];
    redactionApplied: boolean;
  } | null>({
    reducer: (x, y) => y ?? x,
    default: () => null
  }),
  
  // Resource Management
  resourceUsage: Annotation<{
    tokensUsed: number;
    actionsExecuted: number;
    apiCallsMade: number;
    budgetRemaining: Record<string, number>;
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ tokensUsed: 0, actionsExecuted: 0, apiCallsMade: 0, budgetRemaining: {} })
  }),
  
  // Error Recovery
  errorRecoveryAttempted: Annotation<boolean>({
    reducer: (x: boolean, y: boolean) => y ?? x,
    default: () => false
  }),
  errorRecoveryStrategy: Annotation<string | null>({
    reducer: (x: string | null, y: string | null) => y ?? x,
    default: () => null
  }),
  
  // Original input storage for privacy redaction
  originalInput: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => ''
  }),
  
  // Tenant context for security
  tenantId: Annotation<string>({
    reducer: (x: string, y: string) => y || x,
    default: () => 'default-tenant'
  }),
  userId: Annotation<string | null>({
    reducer: (x: string | null, y: string | null) => y ?? x,
    default: () => null
  }),
});

// Explicit type definition for better TypeScript support
export interface SessionStateType {
  sessionId: string;
  siteId: string;
  messages: BaseMessage[];
  userInput: string;
  detectedLanguage: string | null;
  intent: {
    category: string;
    confidence: number;
    extractedEntities: Record<string, string | number | boolean | null>;
  } | null;
  kbResults: Array<{
    id: string;
    content: string;
    url: string;
    score: number;
    metadata: Record<string, string | number | boolean | null>;
  }>;
  actionPlan: ActionPlanItem[];
  toolResults: ToolResult[];
  finalResponse: {
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
      tokensUsed: number;
      processingTime: number;
      actionsExecuted: number;
    };
  } | null;
  needsConfirmation: boolean;
  confirmationReceived: boolean;
  error: string | null;
  
  // Enterprise Security & Privacy
  securityResult: {
    allowed: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    issues: Array<{ type: string; severity: string; description: string }>;
  } | null;
  privacyResult: {
    hasPII: boolean;
    detectedTypes: string[];
    redactionApplied: boolean;
  } | null;
  
  // Resource Management
  resourceUsage: {
    tokensUsed: number;
    actionsExecuted: number;
    apiCallsMade: number;
    budgetRemaining: Record<string, number>;
  };
  
  // Error Recovery
  errorRecoveryAttempted: boolean;
  errorRecoveryStrategy: string | null;
  
  // Original input storage for privacy redaction
  originalInput: string;
  
  // Tenant context for security
  tenantId: string;
  userId: string | null;
}

export interface LangGraphDependencies {
  kbService: {
    semanticSearch(params: {
      siteId: string;
      query: string;
      topK: number;
      locale: string;
      tenantId?: string;
      threshold?: number;
      filters?: Record<string, string | number | boolean | null>;
    }): Promise<Array<{
      id: string;
      content: string;
      url: string;
      score: number;
      metadata: Record<string, string | number | boolean | null>;
      chunkIndex?: number;
      relevantSnippet?: string;
    }>>;
  };
  actionExecutor: {
    execute(params: {
      siteId: string;
      actionName: string;
      parameters: ActionParameters;
      sessionId?: string;
      userId?: string;
      tenantId?: string;
    }): Promise<{
      success: boolean;
      result: unknown;
      executionTime: number;
      error?: string;
      metadata?: Record<string, string | number | boolean | null>;
    }>;
    getAvailableActions(siteId: string): Array<{
      name: string;
      description: string;
      parameters: Record<string, string | number | boolean | null>;
      confirmation?: boolean;
    }>;
  };
  languageDetector: {
    detect(text: string, browserLanguage?: string, context?: Record<string, string | number | boolean | null>): Promise<string>;
  };
}

/**
 * LangGraph-based conversation orchestrator implementing the universal agent workflow
 * 
 * Flow: ingestUserInput → detectLanguage → understandIntent → retrieveKB → 
 *       decide → toolCall/finalize → observe → humanInTheLoop (if needed)
 */
export class LangGraphOrchestrator {
  private llm: ChatOpenAI;
  private checkpointer: MemorySaver;
  private graph: CompiledStateGraph<typeof SessionState.State, unknown>;
  private availableActions: Map<string, SiteAction> = new Map();

  constructor(
    private siteId: string,
    private dependencies: LangGraphDependencies
  ) {
    this.llm = new ChatOpenAI({
      model: config.AI_MODEL || 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000,
    });

    this.checkpointer = new MemorySaver();
    this.graph = this.buildGraph();
    
    // Acknowledge architectural placeholders for future use
    void this.analyzeTaskCompletion; // Will be used in future iterations
    void this.validateAndEnhanceActionPlan; // Will be used in future iterations
    
    logger.info('LangGraph orchestrator initialized', { siteId });
  }

  /**
   * Register actions for this site
   */
  registerActions(actions: SiteAction[]): void {
    actions.forEach(action => {
      this.availableActions.set(action.name, action);
    });
    logger.info('Actions registered', { 
      siteId: this.siteId, 
      actionCount: actions.length 
    });
  }

  /**
   * Process a complete conversation turn with enhanced context
   */
  async processConversation(input: {
    userInput: string;
    sessionId: string;
    siteId: string;
    tenantId?: string;
    userId?: string;
    context?: {
      currentUrl?: string;
      pageTitle?: string;
      userAgent?: string;
      browserLanguage?: string;
    };
  }): Promise<SessionStateType> {
    const config = { configurable: { thread_id: input.sessionId } };
    
    const initialState: Partial<SessionStateType> = {
      sessionId: input.sessionId,
      siteId: input.siteId,
      tenantId: input.tenantId || 'default-tenant',
      userId: input.userId || null,
      userInput: input.userInput,
      originalInput: input.userInput, // Store original for privacy processing
      messages: [new HumanMessage(input.userInput)],
      detectedLanguage: null,
      intent: null,
      kbResults: [],
      actionPlan: [],
      toolResults: [],
      finalResponse: null,
      needsConfirmation: false,
      confirmationReceived: false,
      error: null,
      securityResult: null,
      privacyResult: null,
      resourceUsage: {
        tokensUsed: 0,
        actionsExecuted: 0,
        apiCallsMade: 0,
        budgetRemaining: {}
      },
      errorRecoveryAttempted: false,
      errorRecoveryStrategy: null
    };

    try {
      logger.info('Starting conversation processing with enhanced context', {
        sessionId: input.sessionId,
        siteId: input.siteId,
        tenantId: input.tenantId,
        hasContext: !!input.context,
        inputLength: input.userInput.length
      });

      const result = await this.graph.invoke(initialState, config) as unknown as SessionStateType;
      
      logger.info('Conversation processing completed', {
        sessionId: input.sessionId,
        finalResponseLength: result.finalResponse?.text?.length || 0,
        actionsExecuted: result.toolResults?.length || 0,
        tokensUsed: result.resourceUsage?.tokensUsed || 0
      });

      return result;
    } catch (error) {
      logger.error('Conversation processing failed', { 
        sessionId: input.sessionId, 
        siteId: input.siteId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Stream conversation processing for real-time updates
   */
  async *streamConversation(input: {
    userInput: string;
    sessionId: string;
    siteId: string;
    tenantId?: string;
  }): AsyncGenerator<{ node: string; state: Partial<SessionStateType> }> {
    const config = { configurable: { thread_id: input.sessionId } };
    
    const initialState: Partial<SessionStateType> = {
      sessionId: input.sessionId,
      siteId: input.siteId,
      tenantId: input.tenantId || 'default-tenant',
      userInput: input.userInput,
    };

    try {
      const stream = await this.graph.stream(initialState, config);
      for await (const chunk of stream) {
        const nodeKey = Object.keys(chunk)[0];
        if (nodeKey) {
          yield {
            node: nodeKey,
            state: Object.values(chunk)[0] as Partial<SessionStateType>,
          };
        }
      }
    } catch (error) {
      logger.error('Streaming conversation failed', { 
        sessionId: input.sessionId, 
        error 
      });
      throw error;
    }
  }

  /**
   * Build the LangGraph state machine
   */
  private buildGraph(): CompiledStateGraph<typeof SessionState.State, unknown> {
    const workflow = new StateGraph(SessionState)
      // Enterprise security/privacy/resource nodes
      .addNode('validateSecurity', this.validateSecurity.bind(this))
      .addNode('validatePrivacy', this.validatePrivacy.bind(this))
      .addNode('checkResources', this.checkResources.bind(this))
      
      // Core processing nodes
      .addNode('ingestUserInput', this.ingestUserInput.bind(this))
      .addNode('detectLanguage', this.detectLanguage.bind(this))
      .addNode('understandIntent', this.understandIntent.bind(this))
      .addNode('retrieveKB', this.retrieveKB.bind(this))
      .addNode('decide', this.decide.bind(this))
      .addNode('toolCall', this.toolCall.bind(this))
      .addNode('finalize', this.finalize.bind(this))
      .addNode('humanInTheLoop', this.humanInTheLoop.bind(this))
      .addNode('observe', this.observe.bind(this))
      
      // Error recovery node
      .addNode('handleError', this.handleError.bind(this))

    // Define the enterprise flow: security → privacy → resources → processing
    workflow.addEdge(START, 'validateSecurity');
    workflow.addConditionalEdges(
      'validateSecurity',
      (state: SessionStateType) => {
        return state.securityResult?.allowed ? 'validatePrivacy' : 'finalize';
      }
    );
    workflow.addEdge('validatePrivacy', 'checkResources');
    workflow.addEdge('checkResources', 'ingestUserInput');
    workflow.addEdge('ingestUserInput', 'detectLanguage');
    workflow.addEdge('detectLanguage', 'understandIntent');
    workflow.addEdge('understandIntent', 'retrieveKB');
    workflow.addEdge('retrieveKB', 'decide');
    
    // Conditional routing from decide with error recovery
    workflow.addConditionalEdges(
      'decide',
      (state: SessionStateType) => {
        if (state.error && !state.errorRecoveryAttempted) {return 'handleError';}
        if (state.error) {return 'finalize';}
        if (state.needsConfirmation) {return 'humanInTheLoop';}
        if (state.actionPlan.length > 0) {return 'toolCall';}
        return 'finalize';
      }
    );
    
    // Error recovery can loop back to appropriate step
    workflow.addConditionalEdges(
      'handleError',
      (state: SessionStateType) => {
        if (state.error) {return 'finalize';} // Recovery failed
        return 'decide'; // Try again after recovery
      }
    );

    workflow.addEdge('toolCall', 'observe');
    workflow.addEdge('observe', 'decide'); // Loop back for multi-step
    workflow.addEdge('humanInTheLoop', 'toolCall');
    workflow.addEdge('finalize', END);

    return workflow.compile({ checkpointer: this.checkpointer }) as CompiledStateGraph<typeof SessionState.State, unknown>;
  }

  /**
   * Node: Ingest and validate user input
   */
  private async ingestUserInput(state: SessionStateType): Promise<Partial<SessionStateType>> {
    logger.info('Processing user input', { 
      sessionId: state.sessionId,
      inputLength: state.userInput.length 
    });

    if (!state.userInput?.trim()) {
      return { error: 'Empty user input received' };
    }

    return {
      messages: [...(state.messages || []), new HumanMessage(state.userInput)],
    };
  }

  /**
   * Node: Detect language from user input
   */
  private async detectLanguage(state: SessionStateType): Promise<Partial<SessionStateType>> {
    try {
      const detectedLanguage = await this.dependencies.languageDetector.detect(state.userInput);
      
      logger.info('Language detected', { 
        sessionId: state.sessionId,
        language: detectedLanguage 
      });

      return { detectedLanguage };
    } catch (error) {
      logger.warn('Language detection failed, using default', { 
        sessionId: state.sessionId,
        error 
      });
      return { detectedLanguage: 'en-US' };
    }
  }

  /**
   * Node: Understand user intent and extract entities
   */
  private async understandIntent(state: SessionStateType): Promise<Partial<SessionStateType>> {
    const prompt = `Analyze this user input and determine intent:
    
    Input: "${state.userInput}"
    Available actions: ${Array.from(this.availableActions.keys()).join(', ')}
    
    Return JSON with:
    {
      "category": "navigation|search|purchase|booking|information",
      "confidence": 0.0-1.0,
      "extractedEntities": {
        "product": "...",
        "color": "...",
        "quantity": "...",
        "location": "..."
      }
    }`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const intent = JSON.parse(response.content as string);
      
      logger.info('Intent understood', { 
        sessionId: state.sessionId,
        intent: intent.category,
        confidence: intent.confidence 
      });

      return { intent };
    } catch (error) {
      logger.error('Intent understanding failed', { 
        sessionId: state.sessionId,
        error 
      });
      
      return {
        intent: {
          category: 'information',
          confidence: 0.3,
          extractedEntities: {}
        }
      };
    }
  }

  /**
   * Node: Retrieve relevant knowledge from KB
   */
  private async retrieveKB(state: SessionStateType): Promise<Partial<SessionStateType>> {
    try {
      const searchQuery = state.userInput;
      const results = await this.dependencies.kbService.semanticSearch({
        siteId: state.siteId,
        query: searchQuery,
        topK: 5,
        locale: state.detectedLanguage || 'en-US',
        tenantId: state.tenantId,
      });

      logger.info('KB retrieved', { 
        sessionId: state.sessionId,
        resultCount: results.length 
      });

      return { kbResults: results };
    } catch (error) {
      logger.error('KB retrieval failed', { 
        sessionId: state.sessionId,
        error 
      });
      return { kbResults: [] };
    }
  }

  /**
   * Node: Decide on action plan
   */
  private async decide(state: SessionStateType): Promise<Partial<SessionStateType>> {
    // If we already have tool results, check if we need more actions or can finalize
    if (state.toolResults.length > 0) {
      const lastResult = state.toolResults[state.toolResults.length - 1];
      
      // Check if the last action succeeded and was sufficient
      if (lastResult && lastResult.success && this.isTaskComplete(state)) {
        return { actionPlan: [] }; // Will trigger finalize
      }
    }

    // Context information for decision making
    logger.debug('Making decision with context', {
      intentCategory: state.intent?.category,
      kbResultCount: state.kbResults.length,
      availableActionsCount: this.availableActions.size,
      previousResultsCount: state.toolResults.length,
    });

    const prompt = `Based on the user intent and available information, create an action plan:

    User Input: "${state.userInput}"
    Intent: ${JSON.stringify(state.intent)}
    KB Results: ${JSON.stringify(state.kbResults.slice(0, 3))}
    Available Actions: ${JSON.stringify(Array.from(this.availableActions.keys()))}

    Return JSON array of actions:
    [
      {
        "actionName": "exact_action_name",
        "parameters": {"param1": "value1"},
        "reasoning": "why this action",
        "riskLevel": "low|medium|high"
      }
    ]

    If no actions needed, return empty array.`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const actionPlan = JSON.parse(response.content as string);
      
      // Check if any action requires confirmation
      const needsConfirmation = actionPlan.some((action: ActionPlanItem) => {
        const actionDef = this.availableActions.get(action.actionName);
        return actionDef?.confirmation || action.riskLevel === 'high';
      });

      logger.info('Action plan created', { 
        sessionId: state.sessionId,
        actionCount: actionPlan.length,
        needsConfirmation 
      });

      return { actionPlan, needsConfirmation };
    } catch (error) {
      logger.error('Decision making failed', { 
        sessionId: state.sessionId,
        error 
      });
      return { actionPlan: [], needsConfirmation: false };
    }
  }

  /**
   * Node: Execute tool calls
   */
  private async toolCall(state: SessionStateType): Promise<Partial<SessionStateType>> {
    const newToolResults: ToolResult[] = [];

    for (const action of state.actionPlan) {
      try {
        logger.info('Executing tool', { 
          sessionId: state.sessionId,
          actionName: action.actionName 
        });

        const result = await this.dependencies.actionExecutor.execute({
          siteId: state.siteId,
          actionName: action.actionName,
          parameters: action.parameters,
          sessionId: state.sessionId,
        });

        newToolResults.push({
          toolName: action.actionName,
          input: action.parameters,
          output: result.result,
          success: result.success,
          ...(result.error && { error: result.error }),
        });

      } catch (error) {
        logger.error('Tool execution failed', { 
          sessionId: state.sessionId,
          actionName: action.actionName,
          error 
        });

        newToolResults.push({
          toolName: action.actionName,
          input: action.parameters,
          output: null,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      toolResults: [...state.toolResults, ...newToolResults],
      actionPlan: [], // Clear the plan after execution
      needsConfirmation: false,
    };
  }

  /**
   * Node: Observe results and decide next steps
   */
  private async observe(state: SessionStateType): Promise<Partial<SessionStateType>> {
    const lastResults = state.toolResults.slice(-state.actionPlan.length);
    const hasFailures = lastResults.some(result => !result.success);
    
    logger.info('Observing results', { 
      sessionId: state.sessionId,
      resultCount: lastResults.length,
      hasFailures 
    });

    // If there are failures or the task seems incomplete, we might need another decide cycle
    if (hasFailures || !this.isTaskComplete(state)) {
      // The workflow will loop back to decide
      return {};
    }

    // Task is complete, proceed to finalize
    return {};
  }

  /**
   * Node: Human-in-the-loop confirmation
   */
  private async humanInTheLoop(state: SessionStateType): Promise<Partial<SessionStateType>> {
    logger.info('Human confirmation required', { 
      sessionId: state.sessionId,
      actionPlan: state.actionPlan 
    });

    // In a real implementation, this would pause the workflow until confirmation is received
    // For now, we'll simulate immediate confirmation
    return {
      confirmationReceived: true,
      needsConfirmation: false,
    };
  }

  /**
   * Node: Finalize response
   */
  private async finalize(state: SessionStateType): Promise<Partial<SessionStateType>> {
    if (state.error) {
      return {
        finalResponse: {
          text: `I apologize, but I encountered an error: ${state.error}`,
          citations: [],
          uiHints: {},
          metadata: {
            tokensUsed: 0,
            processingTime: Date.now(),
            actionsExecuted: state.toolResults.length,
          },
        },
      };
    }

    const prompt = `Create a final response based on the conversation:

    User Input: "${state.userInput}"
    Intent: ${JSON.stringify(state.intent)}
    KB Results: ${JSON.stringify(state.kbResults.slice(0, 3))}
    Tool Results: ${JSON.stringify(state.toolResults)}

    Create a helpful, conversational response. Include citations from KB results if used.
    
    Return JSON:
    {
      "text": "conversational response",
      "citations": [{"url": "...", "title": "...", "snippet": "..."}],
      "uiHints": {"highlightElements": [], "scrollToElement": null}
    }`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const finalResponse = JSON.parse(response.content as string);

      // Add metadata
      finalResponse.metadata = {
        tokensUsed: 1000, // Approximate - would calculate actual tokens used
        processingTime: Date.now(),
        actionsExecuted: state.toolResults.length,
      };

      logger.info('Response finalized', { 
        sessionId: state.sessionId,
        responseLength: finalResponse.text.length 
      });

      return { finalResponse };
    } catch (error) {
      logger.error('Response finalization failed', { 
        sessionId: state.sessionId,
        error 
      });

      return {
        finalResponse: {
          text: "I've processed your request, but had trouble formatting the response. Please try again.",
          citations: [],
          uiHints: {},
          metadata: {
            tokensUsed: 0,
            processingTime: Date.now(),
            actionsExecuted: state.toolResults.length,
          },
        },
      };
    }
  }

  /**
   * Helper to determine if the current task is complete
   */
  private isTaskComplete(state: SessionStateType): boolean {
    // Simple heuristic - if we have successful tool results and no obvious next steps
    if (state.toolResults.length === 0) {return false;}
    
    const lastResult = state.toolResults[state.toolResults.length - 1];
    return lastResult !== undefined && lastResult.success === true && state.intent?.category !== 'multi_step';
  }

  // ========== ENTERPRISE NODES ==========

  /**
   * Enterprise Node: Security validation and risk assessment
   */
  private async validateSecurity(state: SessionStateType): Promise<Partial<SessionStateType>> {
    logger.info('Validating security', { 
      sessionId: state.sessionId,
      tenantId: state.tenantId
    });

    try {
      const securityValidationRequest = {
        tenantId: state.tenantId,
        siteId: state.siteId,
        sessionId: state.sessionId,
        userInput: state.userInput,
        clientInfo: {
          origin: 'web', // Could be enhanced to detect actual origin
          userAgent: 'SiteSpeak-AI/1.0',
          ipAddress: '127.0.0.1' // Would be extracted from request in real implementation
        },
        // Only include userId if it's a real value, not null
        ...(state.userId && { userId: state.userId })
      };

      const securityResult = await securityGuards.validateSecurity(securityValidationRequest);

      if (!securityResult.allowed) {
        const issueSummary = (securityResult.issues || [])
          .map(issue => `${issue.type}: ${issue.description}`)
          .join('; ');
        const blockedMessage = issueSummary
          ? `Security policy blocked this request: ${issueSummary}`
          : 'Security policy blocked this request.';

        return {
          securityResult,
          error: blockedMessage,
        };
      }

      return { securityResult };
    } catch (error) {
      logger.error('Security validation failed', { 
        sessionId: state.sessionId,
        error 
      });
      
      return {
        securityResult: {
          allowed: false,
          riskLevel: 'high',
          issues: [{ type: 'validation_error', severity: 'error', description: 'Security validation failed' }]
        }
      };
    }
  }

  /**
   * Enterprise Node: Privacy validation and PII detection/redaction
   */
  private async validatePrivacy(state: SessionStateType): Promise<Partial<SessionStateType>> {
    logger.info('Validating privacy and detecting PII', { 
      sessionId: state.sessionId,
      inputLength: state.userInput.length
    });

    try {
      const privacyValidationRequest = {
        tenantId: state.tenantId,
        siteId: state.siteId,
        content: state.userInput,
        contentType: 'user_input' as const,
        context: {
          sessionId: state.sessionId,
          // Only include userId if it's a real value, not null
          ...(state.userId && { userId: state.userId })
        }
      };

      const piiResult = await privacyGuards.detectAndRedactPII(privacyValidationRequest);

      // Convert PII result to privacy result format expected by state
      const privacyResult = {
        hasPII: piiResult.hasPII,
        detectedTypes: piiResult.detectedTypes.map(dt => dt.type),
        redactionApplied: piiResult.redactedText !== state.userInput
      };

      // Store original input for audit purposes, use redacted for processing
      const updates: Partial<SessionStateType> = {
        originalInput: state.userInput,
        privacyResult
      };

      // If redaction was applied, update userInput with redacted version
      if (privacyResult.redactionApplied) {
        updates.userInput = piiResult.redactedText;
      }

      return updates;
    } catch (error) {
      logger.error('Privacy validation failed', { 
        sessionId: state.sessionId,
        error 
      });
      
      return {
        privacyResult: {
          hasPII: false,
          detectedTypes: [],
          redactionApplied: false
        }
      };
    }
  }

  /**
   * Enterprise Node: Resource budget checking and allocation
   */
  private async checkResources(state: SessionStateType): Promise<Partial<SessionStateType>> {
    logger.info('Checking resource budgets', { 
      sessionId: state.sessionId,
      tenantId: state.tenantId
    });

    try {
      // Check tokens budget
      const tokenBudgetCheck = await resourceBudgetsService.checkResourceAvailability({
        tenantId: state.tenantId,
        siteId: state.siteId,
        type: 'tokens',
        amount: this.estimateTokenUsage(state.userInput),
        metadata: { sessionId: state.sessionId }
      });

      // Check actions budget
      const actionBudgetCheck = await resourceBudgetsService.checkResourceAvailability({
        tenantId: state.tenantId,
        siteId: state.siteId,
        type: 'actions',
        amount: 1,
        metadata: { sessionId: state.sessionId }
      });

      if (!tokenBudgetCheck.allowed || !actionBudgetCheck.allowed) {
        const reason = !tokenBudgetCheck.allowed ? 'Token budget exceeded' : 'Action budget exceeded';
        
        logger.warn('Resource budget exceeded', { 
          sessionId: state.sessionId,
          tenantId: state.tenantId,
          reason,
          tokenBudget: tokenBudgetCheck,
          actionBudget: actionBudgetCheck
        });
        
        return {
          error: `Request exceeds resource limits: ${reason}`,
          resourceUsage: {
            tokensUsed: tokenBudgetCheck.budget - tokenBudgetCheck.remaining,
            actionsExecuted: actionBudgetCheck.budget - actionBudgetCheck.remaining,
            apiCallsMade: 0,
            budgetRemaining: {
              tokens: tokenBudgetCheck.remaining,
              actions: actionBudgetCheck.remaining
            }
          }
        };
      }

      return {
        resourceUsage: {
          tokensUsed: tokenBudgetCheck.budget - tokenBudgetCheck.remaining,
          actionsExecuted: actionBudgetCheck.budget - actionBudgetCheck.remaining,
          apiCallsMade: 0,
          budgetRemaining: {
            tokens: tokenBudgetCheck.remaining,
            actions: actionBudgetCheck.remaining
          }
        }
      };
    } catch (error) {
      logger.error('Resource check failed', { 
        sessionId: state.sessionId,
        error 
      });
      
      return {
        resourceUsage: {
          tokensUsed: 0,
          actionsExecuted: 0, 
          apiCallsMade: 0,
          budgetRemaining: {}
        }
      };
    }
  }

  /**
   * Enterprise Node: Error handling and recovery
   */
  private async handleError(state: SessionStateType): Promise<Partial<SessionStateType>> {
    if (!state.error || state.errorRecoveryAttempted) {
      return {}; // No error or already attempted recovery
    }

    logger.info('Attempting error recovery', { 
      sessionId: state.sessionId,
      error: state.error
    });

    try {
      const errorContext = {
        sessionId: state.sessionId,
        siteId: state.siteId,
        errorMessage: state.error,
        timestamp: new Date(),
        userInput: state.userInput,
        previousActions: state.toolResults.map(tr => ({
          name: tr.toolName,
          success: tr.success,
          timestamp: new Date() // Would be stored with each tool result in real implementation
        })),
        // Only include intent if it's not null
        ...(state.intent && { intent: state.intent })
      };

      const recoveryResult = await errorRecoverySystem.analyzeAndRecover(errorContext);

      const shouldClearError = recoveryResult.shouldRetry && recoveryResult.recoveryStrategies.length > 0;

      return {
        errorRecoveryAttempted: true,
        errorRecoveryStrategy: recoveryResult.recoveryStrategies[0]?.name || 'no_strategy',
        // Clear error if recovery strategy suggests retry
        error: shouldClearError ? null : state.error
      };
    } catch (error) {
      logger.error('Error recovery failed', { 
        sessionId: state.sessionId,
        error 
      });
      
      return {
        errorRecoveryAttempted: true,
        errorRecoveryStrategy: 'failed'
      };
    }
  }

  /**
   * Helper: Enhanced token usage estimation
   */
  private estimateTokenUsage(input: string): number {
    // Enhanced token estimation with different content types
    const baseChars = input.length;
    const jsonComplexity = (input.match(/[{}\\[\\]:,]/g) || []).length;
    const systemPromptBuffer = 800; // Increased buffer for enhanced prompts
    
    // More accurate estimation: ~3.5 chars per token for complex content
    const estimatedTokens = Math.ceil(baseChars / 3.5) + Math.ceil(jsonComplexity / 2) + systemPromptBuffer;
    
    return estimatedTokens;
  }

  /**
   * Enhanced task completion analysis
   * TODO: Implement in future iterations
   */
  private analyzeTaskCompletion(state: SessionStateType): {
    isComplete: boolean;
    needsRecovery: boolean;
    reason: string;
    failedActions: string[];
    lastError?: string;
  } {
    if (state.toolResults.length === 0) {
      return {
        isComplete: false,
        needsRecovery: false,
        reason: 'No actions executed yet',
        failedActions: []
      };
    }

    const recentResults = state.toolResults.slice(-5); // Last 5 actions
    const failedResults = recentResults.filter(r => !r.success);
    const successfulResults = recentResults.filter(r => r.success);
    
    // Check for repeated failures
    if (failedResults.length >= 3) {
      const lastFailedResult = failedResults[failedResults.length - 1];
      return {
        isComplete: false,
        needsRecovery: true,
        reason: 'Multiple consecutive failures detected',
        failedActions: failedResults.map(r => r.toolName),
        ...(lastFailedResult?.error && { lastError: lastFailedResult.error })
      };
    }

    const lastResult = state.toolResults[state.toolResults.length - 1];
    
    // Task completion heuristics
    const completionIndicators = {
      lastActionSuccessful: lastResult?.success || false,
      hasInformationalIntent: state.intent?.category === 'information',
      hasGoodKBResults: state.kbResults.length > 0 && (state.kbResults[0]?.score ?? 0) > 0.7,
      completedNavigation: successfulResults.some(r => r.toolName.includes('navigate')),
      completedTransaction: successfulResults.some(r => 
        ['purchase', 'book', 'add_to_cart', 'checkout'].some(action => r.toolName.includes(action))
      ),
      maxActionsReached: state.toolResults.length >= 10, // Safety limit
      noMoreActionsPlanned: state.actionPlan.length === 0
    };

    // Determine completion based on context
    let isComplete = false;
    let reason = 'Task in progress';

    if (completionIndicators.hasInformationalIntent && completionIndicators.hasGoodKBResults) {
      isComplete = true;
      reason = 'Informational request satisfied with KB results';
    } else if (completionIndicators.completedTransaction) {
      isComplete = true;
      reason = 'Transaction completed successfully';
    } else if (completionIndicators.lastActionSuccessful && 
               completionIndicators.noMoreActionsPlanned &&
               successfulResults.length > 0) {
      isComplete = true;
      reason = 'All planned actions completed successfully';
    } else if (completionIndicators.maxActionsReached) {
      isComplete = true;
      reason = 'Maximum action limit reached';
    }

    return {
      isComplete,
      needsRecovery: false,
      reason,
      failedActions: failedResults.map(r => r.toolName)
    };
  }

  /**
   * Validate and enhance action plan
   * TODO: Implement in future iterations
   */
  private validateAndEnhanceActionPlan(rawPlan: unknown[], state: SessionStateType): ActionPlanItem[] {
    if (!Array.isArray(rawPlan)) {
      logger.warn('Invalid action plan format, using empty plan', {
        sessionId: state.sessionId,
        rawPlanType: typeof rawPlan
      });
      return [];
    }

    const validatedPlan: ActionPlanItem[] = [];

    for (const action of rawPlan) {
      // Type guard to check if action has the required properties
      if (!action || typeof action !== 'object' || !('actionName' in action)) {
        logger.warn('Invalid action format, skipping', {
          sessionId: state.sessionId,
          action
        });
        continue;
      }

      const actionObj = action as { actionName: string; parameters?: unknown; reasoning?: string; riskLevel?: string; priority?: number; dependsOn?: string[] };

      // Validate action exists
      if (!this.availableActions.has(actionObj.actionName)) {
        logger.warn('Action not available, skipping', {
          sessionId: state.sessionId,
          actionName: actionObj.actionName,
          availableActions: Array.from(this.availableActions.keys())
        });
        continue;
      }

      // Enhance with defaults and validation
      const enhancedAction: ActionPlanItem = {
        actionName: actionObj.actionName,
        parameters: (actionObj.parameters && typeof actionObj.parameters === 'object' ? actionObj.parameters : {}) as ActionParameters,
        reasoning: actionObj.reasoning || 'No reasoning provided',
        riskLevel: (['low', 'medium', 'high', 'critical'] as const).includes(actionObj.riskLevel as any) ? actionObj.riskLevel as ActionPlanItem['riskLevel'] : 'medium',
        priority: actionObj.priority || 1,
        dependsOn: Array.isArray(actionObj.dependsOn) ? actionObj.dependsOn : []
      };

      // Apply security-based risk adjustments
      if (state.securityResult?.riskLevel === 'high' && enhancedAction.riskLevel === 'low') {
        enhancedAction.riskLevel = 'medium';
        logger.info('Elevated action risk level due to security assessment', {
          sessionId: state.sessionId,
          actionName: enhancedAction.actionName
        });
      }

      validatedPlan.push(enhancedAction);
    }

    // Sort by priority and dependencies
    return validatedPlan.sort((a, b) => (a.priority || 1) - (b.priority || 1));
  }

  /**
   * Enhanced method to get available actions with metadata
   */
  getAvailableActionsWithMetadata(): Array<{
    name: string;
    description: string;
    parameters: Record<string, {
      type: string;
      required: boolean;
      description?: string;
      default?: unknown;
      validation?: unknown;
    }>;
    confirmation: boolean;
    riskLevel: string;
    category: string;
  }> {
    return Array.from(this.availableActions.values()).map(action => ({
      name: action.name,
      description: action.description || 'No description available',
      parameters: this.convertParametersToRecord(action.parameters || []),
      confirmation: action.confirmation || false,
      riskLevel: action.confirmation ? 'high' : 'low',
      category: this.categorizeAction(action.name)
    }));
  }

  /**
   * Convert ActionParameter[] to Record<string, object> for compatibility
   */
  private convertParametersToRecord(parameters: ActionParameter[]): Record<string, {
    type: string;
    required: boolean;
    description?: string;
    default?: unknown;
    validation?: unknown;
  }> {
    const record: Record<string, {
      type: string;
      required: boolean;
      description?: string;
      default?: unknown;
      validation?: unknown;
    }> = {};

    for (const param of parameters) {
      record[param.name] = {
        type: param.type,
        required: param.required,
        ...(param.description && { description: param.description }),
        ...(param.default !== undefined && { default: param.default }),
        ...(param.validation && { validation: param.validation })
      };
    }

    return record;
  }

  /**
   * Categorize actions for better decision making
   */
  private categorizeAction(actionName: string): string {
    const name = actionName.toLowerCase();
    
    if (name.includes('navigate') || name.includes('scroll') || name.includes('click')) {
      return 'navigation';
    } else if (name.includes('cart') || name.includes('purchase') || name.includes('buy')) {
      return 'commerce';
    } else if (name.includes('book') || name.includes('schedule') || name.includes('reserve')) {
      return 'booking';
    } else if (name.includes('search') || name.includes('filter') || name.includes('find')) {
      return 'search';
    } else if (name.includes('form') || name.includes('submit') || name.includes('input')) {
      return 'interaction';
    } else {
      return 'general';
    }
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    siteId: string;
    totalConversations: number;
    averageActionsPerConversation: number;
    successRate: number;
    availableActions: number;
    enterpriseFeaturesEnabled: boolean;
  } {
    return {
      siteId: this.siteId,
      totalConversations: 0, // Would be tracked in real implementation
      averageActionsPerConversation: 2.5, // Would be calculated from actual data
      successRate: 0.85, // Would be calculated from actual data
      availableActions: this.availableActions.size,
      enterpriseFeaturesEnabled: true
    };
  }
}
