/**
 * Function Calling Service
 * 
 * Enhanced OpenAI function calling with confirmation gates for side-effects:
 * - Structured output validation with Zod schemas
 * - Risk-based confirmation gates for destructive actions
 * - Idempotency and retry logic for reliable execution
 * - Tool result transformation for UI integration
 * - Performance monitoring and error recovery
 * 
 * Implements source-of-truth requirement for safe action execution
 * with human-in-the-loop checkpoints for high-risk operations.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { createLogger } from '../../../../shared/utils.js';
import { config } from '../../../../infrastructure/config';
import { SiteAction } from '../../../../shared/types';
import type { ActionDispatchService } from '../../application/services/ActionDispatchService';

const logger = createLogger({ service: 'function-calling' });

export interface FunctionCallRequest {
  sessionId: string;
  siteId: string;
  tenantId: string;
  userInput: string;
  availableActions: SiteAction[];
  context: {
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>;
    userPreferences?: Record<string, any>;
    currentPage?: string;
    knowledgeBase?: Array<{
      content: string;
      url: string;
      score: number;
    }>;
  };
  confirmationThreshold: number; // 0-1, actions above this need confirmation
}

export interface FunctionCallResult {
  toolCalls: ToolCallExecution[];
  needsConfirmation: boolean;
  confirmationPrompt?: string;
  suggestedActions?: SuggestedAction[];
  reasoning: string;
  confidence: number;
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
  executionPlan: {
    immediate: ToolCallExecution[];
    conditional: ToolCallExecution[];
    fallback: ToolCallExecution[];
  };
}

export interface ToolCallExecution {
  id: string;
  actionName: string;
  parameters: Record<string, any>;
  reasoning: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresConfirmation: boolean;
  retryCount: number;
  maxRetries: number;
  idempotencyKey: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
  result?: {
    success: boolean;
    data: any;
    error?: string;
    executionTime: number;
    sideEffects: Array<{
      type: string;
      description: string;
      reversible: boolean;
    }>;
  };
  executedAt?: Date;
}

export interface SuggestedAction {
  actionName: string;
  description: string;
  parameters: Record<string, any>;
  confidence: number;
  reasoning: string;
}

// Zod schemas for function calling validation
const ToolCallSchema = z.object({
  actionName: z.string(),
  parameters: z.record(z.any()),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(['low', 'medium', 'high'])
});

const FunctionPlanSchema = z.object({
  toolCalls: z.array(ToolCallSchema),
  overallConfidence: z.number().min(0).max(1),
  reasoning: z.string(),
  riskAssessment: z.object({
    overallRisk: z.enum(['low', 'medium', 'high']),
    riskFactors: z.array(z.string()),
    mitigationStrategies: z.array(z.string())
  }),
  needsConfirmation: z.boolean(),
  confirmationPrompt: z.string().optional()
});

/**
 * Enhanced Function Calling Service
 */
export class FunctionCallingService {
  private llm: ChatOpenAI;
  private executionCache = new Map<string, ToolCallExecution>();
  private confirmationRequests = new Map<string, FunctionCallResult>();

  constructor(
    private actionDispatchService: ActionDispatchService
  ) {
    this.llm = new ChatOpenAI({
      modelName: config.AI_MODEL || 'gpt-4o',
      temperature: 0.1,
      maxTokens: 2000,
    });
    
    logger.info('Function Calling Service initialized');
  }

  /**
   * Plan and prepare function calls based on user intent
   */
  async planFunctionCalls(request: FunctionCallRequest): Promise<FunctionCallResult> {
    const startTime = Date.now();
    
    logger.info('Planning function calls', {
      sessionId: request.sessionId,
      siteId: request.siteId,
      availableActions: request.availableActions.length,
      confirmationThreshold: request.confirmationThreshold
    });

    try {
      // Build function calling prompt with available actions
      const prompt = this.buildFunctionCallingPrompt(request);
      
      // Get structured function plan from LLM
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      
      let functionPlan;
      try {
        const responseContent = response.content as string;
        functionPlan = JSON.parse(responseContent);
        
        // Validate with Zod schema
        const validation = FunctionPlanSchema.safeParse(functionPlan);
        if (!validation.success) {
          logger.warn('Function plan validation failed', { 
            errors: validation.error.errors,
            plan: functionPlan 
          });
          functionPlan = this.createFallbackPlan(request);
        } else {
          functionPlan = validation.data;
        }
      } catch (parseError) {
        logger.warn('Failed to parse function plan, using fallback', { parseError });
        functionPlan = this.createFallbackPlan(request);
      }

      // Convert to execution format
      const toolExecutions = await this.convertToExecutions(functionPlan.toolCalls, request);
      
      // Determine confirmation needs
      const needsConfirmation = this.assessConfirmationNeed(
        toolExecutions,
        request.confirmationThreshold,
        functionPlan.riskAssessment
      );

      // Build execution plan
      const executionPlan = this.buildExecutionPlan(toolExecutions);

      const result: FunctionCallResult = {
        toolCalls: toolExecutions,
        needsConfirmation,
        confirmationPrompt: functionPlan.confirmationPrompt,
        suggestedActions: await this.generateSuggestedActions(request),
        reasoning: functionPlan.reasoning,
        confidence: functionPlan.overallConfidence,
        riskAssessment: functionPlan.riskAssessment,
        executionPlan
      };

      // Cache for potential confirmation
      if (needsConfirmation) {
        this.confirmationRequests.set(request.sessionId, result);
      }

      const planningTime = Date.now() - startTime;
      logger.info('Function call planning completed', {
        sessionId: request.sessionId,
        toolCallsPlanned: toolExecutions.length,
        needsConfirmation,
        overallRisk: functionPlan.riskAssessment.overallRisk,
        planningTime
      });

      return result;

    } catch (error) {
      logger.error('Function call planning failed', {
        sessionId: request.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return safe fallback
      return this.createSafeFallbackResult(request);
    }
  }

  /**
   * Execute approved function calls with retries and idempotency
   */
  async executeFunctionCalls(
    sessionId: string,
    toolCallIds: string[],
    userConfirmation?: boolean
  ): Promise<ToolCallExecution[]> {
    logger.info('Executing function calls', {
      sessionId,
      toolCallCount: toolCallIds.length,
      userConfirmation
    });

    const executions: ToolCallExecution[] = [];
    
    for (const toolCallId of toolCallIds) {
      const execution = this.executionCache.get(toolCallId);
      if (!execution) {
        logger.warn('Tool call not found in cache', { toolCallId });
        continue;
      }

      // Check confirmation requirements
      if (execution.requiresConfirmation && !userConfirmation) {
        execution.status = 'cancelled';
        execution.result = {
          success: false,
          data: null,
          error: 'User confirmation required but not provided',
          executionTime: 0,
          sideEffects: []
        };
        executions.push(execution);
        continue;
      }

      // Execute with retry logic
      const result = await this.executeWithRetry(execution);
      executions.push(result);
    }

    logger.info('Function calls execution completed', {
      sessionId,
      successful: executions.filter(e => e.result?.success).length,
      failed: executions.filter(e => !e.result?.success).length
    });

    return executions;
  }

  /**
   * Get pending confirmation request
   */
  getPendingConfirmation(sessionId: string): FunctionCallResult | null {
    return this.confirmationRequests.get(sessionId) || null;
  }

  /**
   * Clear confirmation request
   */
  clearConfirmation(sessionId: string): void {
    this.confirmationRequests.delete(sessionId);
  }

  /**
   * Build comprehensive function calling prompt
   */
  private buildFunctionCallingPrompt(request: FunctionCallRequest): string {
    const actionsSchema = this.buildActionsSchema(request.availableActions);
    const contextSummary = this.buildContextSummary(request.context);
    
    return `You are an AI assistant that can execute actions on behalf of users. Analyze the user's request and plan the most appropriate function calls.

User Request: "${request.userInput}"

Available Actions:
${actionsSchema}

Context:
${contextSummary}

Your task is to:
1. Understand the user's intent and desired outcome
2. Plan the sequence of function calls needed to fulfill the request
3. Assess risks and determine if confirmation is needed
4. Provide clear reasoning for each action

IMPORTANT RULES:
- Only use actions that are explicitly available
- Be conservative with destructive actions (purchases, deletions, bookings)
- Always provide clear reasoning for each action
- Assess risk levels honestly (low/medium/high)
- Request confirmation for any action that modifies data or has side effects
- Consider the user's context and preferences

Return JSON in this exact format:
{
  "toolCalls": [
    {
      "actionName": "exact_action_name_from_available_list",
      "parameters": {"param1": "value1", "param2": "value2"},
      "reasoning": "Why this action is needed and how it helps achieve the goal",
      "confidence": 0.0-1.0,
      "riskLevel": "low|medium|high"
    }
  ],
  "overallConfidence": 0.0-1.0,
  "reasoning": "Overall strategy and how the actions work together",
  "riskAssessment": {
    "overallRisk": "low|medium|high",
    "riskFactors": ["factor1", "factor2"],
    "mitigationStrategies": ["strategy1", "strategy2"]
  },
  "needsConfirmation": boolean,
  "confirmationPrompt": "What to ask the user for confirmation (if needed)"
}`;
  }

  /**
   * Build actions schema for prompt
   */
  private buildActionsSchema(actions: SiteAction[]): string {
    return actions.map(action => {
      const paramsDesc = action.parameters?.map(p => 
        `${p.name}: ${p.type}${p.required ? ' (required)' : ''} - ${p.description}`
      ).join(', ') || 'No parameters';

      return `${action.name}: ${action.description}
  Parameters: ${paramsDesc}
  Risk Level: ${action.riskLevel || 'medium'}
  Side Effects: ${action.sideEffecting || 'unknown'}`;
    }).join('\n\n');
  }

  /**
   * Build context summary for prompt
   */
  private buildContextSummary(context: FunctionCallRequest['context']): string {
    const parts = [];
    
    if (context.currentPage) {
      parts.push(`Current Page: ${context.currentPage}`);
    }
    
    if (context.conversationHistory.length > 0) {
      const recent = context.conversationHistory.slice(-3);
      parts.push(`Recent Conversation:\n${recent.map(h => `${h.role}: ${h.content}`).join('\n')}`);
    }
    
    if (context.knowledgeBase && context.knowledgeBase.length > 0) {
      const topResults = context.knowledgeBase.slice(0, 2);
      parts.push(`Relevant Information:\n${topResults.map(kb => kb.content.substring(0, 200) + '...').join('\n')}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Convert planned tool calls to execution format
   */
  private async convertToExecutions(
    toolCalls: any[],
    request: FunctionCallRequest
  ): Promise<ToolCallExecution[]> {
    const executions: ToolCallExecution[] = [];
    
    for (const [index, toolCall] of toolCalls.entries()) {
      const action = request.availableActions.find(a => a.name === toolCall.actionName);
      if (!action) {
        logger.warn('Action not found in available actions', { actionName: toolCall.actionName });
        continue;
      }

      const execution: ToolCallExecution = {
        id: `${request.sessionId}_${Date.now()}_${index}`,
        actionName: toolCall.actionName,
        parameters: toolCall.parameters,
        reasoning: toolCall.reasoning,
        confidence: toolCall.confidence,
        riskLevel: toolCall.riskLevel,
        requiresConfirmation: this.shouldRequireConfirmation(action, toolCall.riskLevel),
        retryCount: 0,
        maxRetries: action.sideEffecting === 'safe' ? 3 : 1,
        idempotencyKey: this.generateIdempotencyKey(request.sessionId, toolCall),
        status: 'pending'
      };

      // Cache for later execution
      this.executionCache.set(execution.id, execution);
      executions.push(execution);
    }
    
    return executions;
  }

  /**
   * Assess if confirmation is needed
   */
  private assessConfirmationNeed(
    executions: ToolCallExecution[],
    threshold: number,
    riskAssessment: any
  ): boolean {
    // Any high-risk action needs confirmation
    if (riskAssessment.overallRisk === 'high') {
      return true;
    }

    // Any execution that explicitly requires confirmation
    if (executions.some(e => e.requiresConfirmation)) {
      return true;
    }

    // Low overall confidence needs confirmation
    const avgConfidence = executions.reduce((sum, e) => sum + e.confidence, 0) / executions.length;
    if (avgConfidence < threshold) {
      return true;
    }

    return false;
  }

  /**
   * Build execution plan with immediate, conditional, and fallback actions
   */
  private buildExecutionPlan(executions: ToolCallExecution[]): FunctionCallResult['executionPlan'] {
    return {
      immediate: executions.filter(e => 
        e.riskLevel === 'low' && e.confidence > 0.8 && !e.requiresConfirmation
      ),
      conditional: executions.filter(e => 
        e.riskLevel === 'medium' || e.requiresConfirmation
      ),
      fallback: executions.filter(e => 
        e.riskLevel === 'high' || e.confidence < 0.5
      )
    };
  }

  /**
   * Execute tool call with retry logic
   */
  private async executeWithRetry(execution: ToolCallExecution): Promise<ToolCallExecution> {
    let attempt = 0;
    
    while (attempt <= execution.maxRetries) {
      try {
        execution.status = 'executing';
        execution.retryCount = attempt;
        execution.executedAt = new Date();

        const startTime = Date.now();
        
        // Execute via action dispatch service
        const idParts = execution.id.split('_');
        const siteId = idParts[0] || 'default_site';
        const tenantId = idParts[1] || 'default_tenant';
        
        const result = await this.actionDispatchService.dispatchAction({
          siteId,
          tenantId,
          actionName: execution.actionName,
          parameters: execution.parameters,
          sessionId: execution.id,
          requestId: execution.idempotencyKey
        });

        const executionTime = Date.now() - startTime;

        execution.result = {
          success: result.success,
          data: result.result,
          ...(result.error && { error: result.error }),
          executionTime,
          sideEffects: (result.sideEffects || []).map(effect => ({
            type: effect.type || 'unknown',
            description: effect.description || 'No description provided',
            reversible: this.inferReversibilityFromEffect(effect)
          }))
        };

        execution.status = result.success ? 'completed' : 'failed';
        
        logger.info('Tool call executed successfully', {
          executionId: execution.id,
          actionName: execution.actionName,
          success: result.success,
          attempt,
          executionTime
        });

        return execution;

      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
        
        if (attempt > execution.maxRetries) {
          execution.status = 'failed';
          execution.result = {
            success: false,
            data: null,
            error: errorMessage,
            executionTime: 0,
            sideEffects: []
          };
          
          logger.error('Tool call failed after all retries', {
            executionId: execution.id,
            actionName: execution.actionName,
            attempts: attempt,
            error: errorMessage
          });
          
          return execution;
        }

        logger.warn('Tool call attempt failed, retrying', {
          executionId: execution.id,
          actionName: execution.actionName,
          attempt,
          error: errorMessage,
          maxRetries: execution.maxRetries
        });

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return execution;
  }

  /**
   * Generate suggested actions for user
   */
  private async generateSuggestedActions(request: FunctionCallRequest): Promise<SuggestedAction[]> {
    const safeActions = request.availableActions.filter(a => 
      a.sideEffecting === 'safe' || a.riskLevel === 'low'
    ).slice(0, 3);

    return safeActions.map(action => ({
      actionName: action.name,
      description: action.description,
      parameters: {},
      confidence: 0.6,
      reasoning: `Safe alternative action related to "${request.userInput}"`
    }));
  }

  // Helper methods

  private inferReversibilityFromEffect(effect: { type: string; description?: string; data?: any }): boolean {
    // Infer reversibility based on action type and side effects
    switch (effect.type) {
      case 'navigation':
        return true; // Navigation can usually be reversed by going back
      case 'dom_change':
        return false; // DOM changes might be hard to reverse without specific logic
      case 'api_call':
        return false; // API calls typically have side effects that aren't easily reversible
      case 'form_submission':
        return false; // Form submissions usually create permanent changes
      default:
        return false; // Default to non-reversible for safety
    }
  }
  
  private shouldRequireConfirmation(action: SiteAction, riskLevel: string): boolean {
    if (action.confirmation) {return true;}
    if (riskLevel === 'high') {return true;}
    if (action.sideEffecting === 'write') {return true;}
    return false;
  }

  private generateIdempotencyKey(sessionId: string, toolCall: any): string {
    const content = JSON.stringify({
      sessionId,
      actionName: toolCall.actionName,
      parameters: toolCall.parameters
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
  }

  private createFallbackPlan(_request: FunctionCallRequest): any {
    // TODO: Use request context (userInput, availableActions) for more sophisticated fallback strategies
    return {
      toolCalls: [],
      overallConfidence: 0.3,
      reasoning: 'Unable to create specific action plan. Falling back to safe information gathering.',
      riskAssessment: {
        overallRisk: 'low',
        riskFactors: ['Unable to parse user intent clearly'],
        mitigationStrategies: ['Ask for clarification', 'Suggest specific alternatives']
      },
      needsConfirmation: false
    };
  }

  private createSafeFallbackResult(_request: FunctionCallRequest): FunctionCallResult {
    // TODO: Use request context for more personalized and context-aware fallback messages
    return {
      toolCalls: [],
      needsConfirmation: false,
      reasoning: 'Unable to determine appropriate actions. Please provide more specific instructions.',
      confidence: 0.2,
      riskAssessment: {
        overallRisk: 'low',
        riskFactors: ['Unclear user intent'],
        mitigationStrategies: ['Request clarification']
      },
      executionPlan: {
        immediate: [],
        conditional: [],
        fallback: []
      }
    };
  }
}

// Factory function
export function createFunctionCallingService(
  actionDispatchService: ActionDispatchService
): FunctionCallingService {
  return new FunctionCallingService(actionDispatchService);
}