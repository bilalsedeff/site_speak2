import { StateGraph, Annotation, START, END, MemorySaver } from '@langchain/langgraph';
import { HumanMessage, BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { createLogger } from '../../../shared/utils.js';
import { config } from '../../../infrastructure/config';
import { SiteAction, ActionParameter } from '../../../shared/types';

const logger = createLogger({ service: 'langraph' });

// Session State Definition
const SessionState = Annotation.Root({
  sessionId: Annotation<string>(),
  siteId: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
  }),
  userInput: Annotation<string>(),
  detectedLanguage: Annotation<string | null>({ default: () => null }),
  intent: Annotation<{
    category: string;
    confidence: number;
    extractedEntities: Record<string, any>;
  } | null>({ default: () => null }),
  kbResults: Annotation<Array<{
    id: string;
    content: string;
    url: string;
    score: number;
    metadata: Record<string, any>;
  }>>({ default: () => [] }),
  actionPlan: Annotation<Array<{
    actionName: string;
    parameters: Record<string, any>;
    reasoning: string;
    riskLevel: string;
  }>>({ default: () => [] }),
  toolResults: Annotation<Array<{
    toolName: string;
    input: Record<string, any>;
    output: any;
    success: boolean;
    error?: string;
  }>>({ default: () => [] }),
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
  } | null>({ default: () => null }),
  needsConfirmation: Annotation<boolean>({ default: () => false }),
  confirmationReceived: Annotation<boolean>({ default: () => false }),
  error: Annotation<string | null>({ default: () => null }),
});

export type SessionStateType = typeof SessionState.State;

export interface LangGraphDependencies {
  kbService: any;
  actionExecutor: any;
  languageDetector: any;
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
  private graph: any;
  private availableActions: Map<string, SiteAction> = new Map();

  constructor(
    private siteId: string,
    private dependencies: LangGraphDependencies
  ) {
    this.llm = new ChatOpenAI({
      modelName: config.AI_MODEL || 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000,
    });

    this.checkpointer = new MemorySaver();
    this.graph = this.buildGraph();
    
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
   * Process a complete conversation turn
   */
  async processConversation(input: {
    userInput: string;
    sessionId: string;
    siteId: string;
  }): Promise<SessionStateType> {
    const config = { configurable: { thread_id: input.sessionId } };
    
    const initialState: Partial<SessionStateType> = {
      sessionId: input.sessionId,
      siteId: input.siteId,
      userInput: input.userInput,
      messages: [new HumanMessage(input.userInput)],
    };

    try {
      const result = await this.graph.invoke(initialState, config);
      return result;
    } catch (error) {
      logger.error('Conversation processing failed', { 
        sessionId: input.sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
  }): AsyncGenerator<{ node: string; state: Partial<SessionStateType> }> {
    const config = { configurable: { thread_id: input.sessionId } };
    
    const initialState: Partial<SessionStateType> = {
      sessionId: input.sessionId,
      siteId: input.siteId,
      userInput: input.userInput,
      messages: [new HumanMessage(input.userInput)],
    };

    try {
      for await (const chunk of this.graph.stream(initialState, config)) {
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
  private buildGraph(): any {
    const workflow = new StateGraph(SessionState)
      .addNode('ingestUserInput', this.ingestUserInput.bind(this))
      .addNode('detectLanguage', this.detectLanguage.bind(this))
      .addNode('understandIntent', this.understandIntent.bind(this))
      .addNode('retrieveKB', this.retrieveKB.bind(this))
      .addNode('decide', this.decide.bind(this))
      .addNode('toolCall', this.toolCall.bind(this))
      .addNode('finalize', this.finalize.bind(this))
      .addNode('humanInTheLoop', this.humanInTheLoop.bind(this))
      .addNode('observe', this.observe.bind(this))

    // Define the flow
    workflow.addEdge(START, 'ingestUserInput');
    workflow.addEdge('ingestUserInput', 'detectLanguage');
    workflow.addEdge('detectLanguage', 'understandIntent');
    workflow.addEdge('understandIntent', 'retrieveKB');
    workflow.addEdge('retrieveKB', 'decide');
    
    // Conditional routing from decide
    workflow.addConditionalEdges(
      'decide',
      (state: SessionStateType) => {
        if (state.error) return 'finalize';
        if (state.needsConfirmation) return 'humanInTheLoop';
        if (state.actionPlan.length > 0) return 'toolCall';
        return 'finalize';
      }
    );

    workflow.addEdge('toolCall', 'observe');
    workflow.addEdge('observe', 'decide'); // Loop back for multi-step
    workflow.addEdge('humanInTheLoop', 'toolCall');
    workflow.addEdge('finalize', END);

    return workflow.compile({ checkpointer: this.checkpointer });
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
      const needsConfirmation = actionPlan.some((action: any) => {
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
    const newToolResults: any[] = [];

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
          error: result.error,
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
    if (state.toolResults.length === 0) return false;
    
    const lastResult = state.toolResults[state.toolResults.length - 1];
    return lastResult && lastResult.success && state.intent?.category !== 'multi_step';
  }
}