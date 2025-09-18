/**
 * Intent Classification Engine - Primary layer using OpenAI GPT-4o
 *
 * Features:
 * - Advanced multi-stage prompting for accurate intent detection
 * - Confidence scoring with reasoning explanations
 * - Universal website compatibility
 * - Performance optimized for <150ms classification
 * - Contextual intent refinement
 * - Parameter extraction and validation
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createLogger, getErrorMessage } from '../../../../../shared/utils';
import type {
  IntentCategory,
  IntentClassificationResult,
  IntentProcessingRequest,
  ContextualIntentAnalysis,
  IntentProcessingError,
  SessionContext,
  ErrorDetails,
} from './types.js';

const logger = createLogger({ service: 'intent-classification-engine' });

export interface IntentClassificationConfig {
  openaiApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  enableReasoning: boolean;
  confidenceThreshold: number;
  retryAttempts: number;
}

/**
 * Primary Intent Classification Engine using OpenAI GPT-4o
 */
export class IntentClassificationEngine {
  private llm!: ChatOpenAI; // Initialized in initializeLLM() called from constructor
  private config: IntentClassificationConfig;
  private classificationCount = 0;
  private performanceMetrics = {
    totalClassifications: 0,
    averageProcessingTime: 0,
    averageConfidence: 0,
    successRate: 0,
    errorCount: 0,
  };

  constructor(config: IntentClassificationConfig) {
    this.config = config;
    this.initializeLLM();

    logger.info('IntentClassificationEngine initialized', {
      model: config.model,
      temperature: config.temperature,
      confidenceThreshold: config.confidenceThreshold,
    });
  }

  /**
   * Initialize OpenAI LLM with optimized configuration
   */
  private initializeLLM(): void {
    this.llm = new ChatOpenAI({
      apiKey: this.config.openaiApiKey,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      timeout: this.config.timeout,
      streaming: false, // Disable streaming for faster intent classification
    });
  }

  /**
   * Classify user intent with context awareness
   */
  async classifyIntent(request: IntentProcessingRequest): Promise<IntentClassificationResult> {
    const startTime = performance.now();
    const classificationId = `classification_${Date.now()}_${++this.classificationCount}`;

    try {
      logger.debug('Starting intent classification', {
        classificationId,
        text: request.text,
        contextPageType: request.context.pageContext.pageType,
        sessionId: request.metadata?.sessionId,
      });

      // Stage 1: Initial intent classification with context
      const primaryResult = await this.performPrimaryClassification(
        request.text,
        request.context,
        classificationId
      );

      // Stage 2: Confidence refinement and parameter extraction
      const refinedResult = await this.refineClassification(
        primaryResult,
        request.text,
        request.context,
        classificationId
      );

      // Update performance metrics
      const processingTime = performance.now() - startTime;
      this.updateMetrics(refinedResult, processingTime, true);

      logger.info('Intent classification completed', {
        classificationId,
        intent: refinedResult.intent,
        confidence: refinedResult.confidence,
        processingTime,
        source: refinedResult.source,
      });

      return refinedResult;

    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.updateMetrics(null, processingTime, false);

      logger.error('Intent classification failed', {
        classificationId,
        error: getErrorMessage(error),
        text: request.text,
        processingTime,
      });

      throw this.createClassificationError(
        'MODEL_ERROR',
        `Intent classification failed: ${getErrorMessage(error)}`,
        error,
        true
      );
    }
  }

  /**
   * Primary classification using advanced prompting
   */
  private async performPrimaryClassification(
    text: string,
    context: ContextualIntentAnalysis,
    classificationId: string
  ): Promise<IntentClassificationResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userPrompt = this.buildUserPrompt(text, context);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    try {
      const response = await this.llm.invoke(messages);
      const responseText = response.content as string;

      return this.parseClassificationResponse(responseText, 'primary', classificationId);

    } catch (error) {
      logger.error('Primary classification failed', {
        classificationId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Refine classification with parameter extraction
   */
  private async refineClassification(
    primaryResult: IntentClassificationResult,
    originalText: string,
    context: ContextualIntentAnalysis,
    classificationId: string
  ): Promise<IntentClassificationResult> {
    // Skip refinement if confidence is already high
    if (primaryResult.confidence >= 0.9) {
      return primaryResult;
    }

    const refinementPrompt = this.buildRefinementPrompt(
      primaryResult,
      originalText,
      context
    );

    try {
      const response = await this.llm.invoke([
        new SystemMessage(refinementPrompt),
        new HumanMessage(`Refine this classification: ${JSON.stringify(primaryResult)}`),
      ]);

      const refinedResponse = this.parseClassificationResponse(
        response.content as string,
        'primary',
        classificationId
      );

      // Merge results, keeping higher confidence
      const baseResult = {
        ...primaryResult,
        confidence: Math.max(primaryResult.confidence, refinedResponse.confidence),
        parameters: { ...primaryResult.parameters, ...refinedResponse.parameters },
        processingTime: primaryResult.processingTime + refinedResponse.processingTime,
      };

      const reasoning = refinedResponse.reasoning || primaryResult.reasoning;
      if (reasoning !== undefined) {
        (baseResult as any).reasoning = reasoning;
      }

      return baseResult;

    } catch (error) {
      logger.warn('Classification refinement failed, using primary result', {
        classificationId,
        error: getErrorMessage(error),
      });
      return primaryResult;
    }
  }

  /**
   * Build system prompt with context awareness
   */
  private buildSystemPrompt(context: ContextualIntentAnalysis): string {
    const { pageContext, sessionContext, userContext } = context;

    return `You are an expert voice interface intent classifier for website interactions. Your task is to analyze user voice commands and classify them into the most appropriate intent category.

CONTEXT INFORMATION:
- Website Type: ${pageContext.contentType}
- Page Type: ${pageContext.pageType}
- Current Mode: ${pageContext.currentMode}
- Available Capabilities: ${pageContext.capabilities.join(', ')}
- User Role: ${userContext.role}
- Previous Intents: ${this.formatPreviousIntents(sessionContext)}

INTENT CATEGORIES:
Navigation: navigate_to_page, navigate_to_section, navigate_back, navigate_forward, scroll_to_element, open_menu, close_menu
Actions: click_element, submit_form, clear_form, select_option, toggle_element, drag_drop, copy_content, paste_content
Content: edit_text, add_content, delete_content, replace_content, format_content, undo_action, redo_action
Query: search_content, filter_results, sort_results, get_information, explain_feature, show_details
E-commerce: add_to_cart, remove_from_cart, view_product, compare_products, checkout_process, track_order
Control: stop_action, cancel_operation, pause_process, resume_process, reset_state, save_progress
Confirmation: confirm_action, deny_action, maybe_later, need_clarification
Meta: help_request, tutorial_request, feedback_provide, error_report, unknown_intent

CLASSIFICATION RULES:
1. Always consider the current page context and available capabilities
2. Prioritize intents that make sense for the current website type
3. Extract specific parameters when possible (element names, values, etc.)
4. Provide confidence scores based on clarity and context alignment
5. Include reasoning for your classification decision
6. Consider user's role and permissions when classifying intents
7. Be context-aware: "click submit" on a form page vs "click submit" on a blank page

RESPONSE FORMAT:
Return ONLY a JSON object with this exact structure:
{
  "intent": "intent_category",
  "confidence": 0.85,
  "subIntents": ["optional", "sub", "intents"],
  "parameters": {
    "target": "element_name",
    "value": "specific_value",
    "direction": "up|down|left|right",
    "quantity": "number"
  },
  "reasoning": "Brief explanation of why this intent was chosen and confidence level"
}

IMPORTANT:
- Confidence should reflect both intent clarity and context appropriateness
- Lower confidence (0.6-0.7) for ambiguous commands
- Higher confidence (0.8-0.9) for clear, context-appropriate commands
- Maximum confidence (0.9+) only for unambiguous, perfect matches
- Always extract actionable parameters when present in the command`;
  }

  /**
   * Build user prompt with command and context
   */
  private buildUserPrompt(text: string, context: ContextualIntentAnalysis): string {
    const availableElements = context.pageContext.availableElements
      .filter(el => el.isInteractable)
      .slice(0, 10) // Limit to prevent prompt bloat
      .map(el => `${el.tagName}${el.id ? `#${el.id}` : ''}${el.className ? `.${el.className.split(' ')[0]}` : ''}: "${el.textContent?.slice(0, 50) || 'N/A'}"`)
      .join(', ');

    return `USER COMMAND: "${text}"

CURRENT PAGE ELEMENTS: ${availableElements || 'None detected'}

RECENT CONTEXT: ${this.buildRecentContext(context)}

Classify this voice command considering:
1. The specific words used and their clarity
2. The current page context and available elements
3. The user's previous actions and session state
4. Whether the requested action is actually possible on this page

Provide your classification as a JSON object.`;
  }

  /**
   * Build refinement prompt for confidence improvement
   */
  private buildRefinementPrompt(
    primaryResult: IntentClassificationResult,
    originalText: string,
    _context: ContextualIntentAnalysis
  ): string {
    return `You are refining an intent classification to improve confidence and parameter extraction.

ORIGINAL COMMAND: "${originalText}"
INITIAL CLASSIFICATION: ${JSON.stringify(primaryResult)}

REFINEMENT TASKS:
1. Validate the intent choice against available page capabilities
2. Extract more specific parameters if possible
3. Improve confidence scoring based on context alignment
4. Provide more detailed reasoning

Consider these factors for confidence adjustment:
- Command specificity and clarity
- Availability of target elements on current page
- Context appropriateness (e.g. "add to cart" on product page vs blog page)
- Parameter completeness and validity
- User permission and role alignment

Return the refined classification as JSON with the same structure.`;
  }

  /**
   * Parse LLM response into structured result
   */
  private parseClassificationResponse(
    responseText: string,
    source: IntentClassificationResult['source'],
    classificationId: string
  ): IntentClassificationResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.intent || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid response format: missing intent or confidence');
      }

      // Validate intent category
      if (!this.isValidIntentCategory(parsed.intent)) {
        logger.warn('Invalid intent category, fallback to unknown_intent', {
          classificationId,
          invalidIntent: parsed.intent,
        });
        parsed.intent = 'unknown_intent';
        parsed.confidence = Math.min(parsed.confidence, 0.3);
      }

      // Ensure confidence is within valid range
      parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        subIntents: parsed.subIntents || [],
        parameters: parsed.parameters || {},
        reasoning: parsed.reasoning || 'No reasoning provided',
        source,
        processingTime: 0, // Will be set by caller
        modelUsed: this.config.model,
      };

    } catch (error) {
      logger.error('Failed to parse classification response', {
        classificationId,
        responseText,
        error: getErrorMessage(error),
      });

      // Return fallback classification
      return {
        intent: 'unknown_intent',
        confidence: 0.1,
        parameters: {},
        reasoning: `Parse error: ${getErrorMessage(error)}`,
        source,
        processingTime: 0,
        modelUsed: this.config.model,
      };
    }
  }

  /**
   * Validate intent category
   */
  private isValidIntentCategory(intent: string): intent is IntentCategory {
    const validIntents: IntentCategory[] = [
      'navigate_to_page', 'navigate_to_section', 'navigate_back', 'navigate_forward',
      'scroll_to_element', 'open_menu', 'close_menu',
      'click_element', 'submit_form', 'clear_form', 'select_option', 'toggle_element',
      'drag_drop', 'copy_content', 'paste_content',
      'edit_text', 'add_content', 'delete_content', 'replace_content', 'format_content',
      'undo_action', 'redo_action',
      'search_content', 'filter_results', 'sort_results', 'get_information',
      'explain_feature', 'show_details',
      'add_to_cart', 'remove_from_cart', 'view_product', 'compare_products',
      'checkout_process', 'track_order',
      'stop_action', 'cancel_operation', 'pause_process', 'resume_process',
      'reset_state', 'save_progress',
      'confirm_action', 'deny_action', 'maybe_later', 'need_clarification',
      'help_request', 'tutorial_request', 'feedback_provide', 'error_report',
      'unknown_intent',
    ];

    return validIntents.includes(intent as IntentCategory);
  }

  /**
   * Format previous intents for context
   */
  private formatPreviousIntents(sessionContext: SessionContext): string {
    if (!sessionContext.previousIntents || sessionContext.previousIntents.length === 0) {
      return 'None';
    }

    return sessionContext.previousIntents
      .slice(-3) // Last 3 intents
      .map(intent => `${intent.intent}(${intent.confidence.toFixed(2)})`)
      .join(' → ');
  }

  /**
   * Build recent context summary
   */
  private buildRecentContext(context: ContextualIntentAnalysis): string {
    const { sessionContext, pageContext } = context;

    const contextParts = [];

    if (sessionContext.currentTask) {
      contextParts.push(`Task: ${sessionContext.currentTask.taskType} (${sessionContext.currentTask.progress}%)`);
    }

    if (sessionContext.conversationState.currentTopic) {
      contextParts.push(`Topic: ${sessionContext.conversationState.currentTopic}`);
    }

    if (pageContext.currentMode !== 'view') {
      contextParts.push(`Mode: ${pageContext.currentMode}`);
    }

    return contextParts.join(', ') || 'No specific context';
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(
    result: IntentClassificationResult | null,
    processingTime: number,
    success: boolean
  ): void {
    this.performanceMetrics.totalClassifications++;

    // Update average processing time
    this.performanceMetrics.averageProcessingTime =
      (this.performanceMetrics.averageProcessingTime * (this.performanceMetrics.totalClassifications - 1) + processingTime) /
      this.performanceMetrics.totalClassifications;

    if (success && result) {
      // Update average confidence
      this.performanceMetrics.averageConfidence =
        (this.performanceMetrics.averageConfidence * (this.performanceMetrics.totalClassifications - 1) + result.confidence) /
        this.performanceMetrics.totalClassifications;
    } else {
      this.performanceMetrics.errorCount++;
    }

    // Update success rate
    this.performanceMetrics.successRate =
      (this.performanceMetrics.totalClassifications - this.performanceMetrics.errorCount) /
      this.performanceMetrics.totalClassifications;
  }

  /**
   * Create typed error for intent processing
   */
  private createClassificationError(
    code: IntentProcessingError['code'],
    message: string,
    originalError?: Error | unknown,
    retryable = false
  ): IntentProcessingError {
    const error = new Error(message) as IntentProcessingError;
    error.code = code;
    const errorDetails = this.convertToErrorDetails(originalError);
    if (errorDetails) {
      error.details = errorDetails;
    }
    error.retryable = retryable;
    error.suggestedAction = this.getSuggestedAction(code);
    return error;
  }

  /**
   * Convert unknown error to ErrorDetails format
   */
  private convertToErrorDetails(error: unknown): ErrorDetails | undefined {
    if (!error) {return undefined;}

    if (error instanceof Error) {
      return {
        originalError: error,
        errorCode: 'CLASSIFICATION_ERROR',
        context: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date(),
      };
    }

    if (typeof error === 'string') {
      return {
        errorCode: 'STRING_ERROR',
        context: {
          message: error,
        },
        timestamp: new Date(),
      };
    }

    if (typeof error === 'object' && error !== null) {
      return {
        errorCode: 'OBJECT_ERROR',
        context: {
          serializedError: JSON.stringify(error),
        },
        timestamp: new Date(),
      };
    }

    return {
      errorCode: 'UNKNOWN_ERROR',
      context: {
        type: typeof error,
        value: String(error),
      },
      timestamp: new Date(),
    };
  }

  /**
   * Get suggested action for error recovery
   */
  private getSuggestedAction(code: IntentProcessingError['code']): string {
    switch (code) {
      case 'TIMEOUT':
        return 'Retry with shorter timeout or fallback to cached result';
      case 'MODEL_ERROR':
        return 'Retry with different model or use rule-based fallback';
      case 'VALIDATION_FAILED':
        return 'Use lower confidence threshold or request clarification';
      case 'CONTEXT_INSUFFICIENT':
        return 'Request more context or use simplified classification';
      default:
        return 'Log error and use fallback intent classification';
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.performanceMetrics = {
      totalClassifications: 0,
      averageProcessingTime: 0,
      averageConfidence: 0,
      successRate: 0,
      errorCount: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<IntentClassificationConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.openaiApiKey || newConfig.model || newConfig.temperature) {
      this.initializeLLM();
    }

    logger.info('Intent classification config updated', {
      updatedFields: Object.keys(newConfig),
      newModel: this.config.model,
      newTemperature: this.config.temperature,
    });
  }

  /**
   * Health check for the classification engine
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }> {
    try {
      const startTime = performance.now();

      // Test with simple classification
      await this.llm.invoke([
        new SystemMessage('You are a test classifier. Return {"intent": "test", "confidence": 1.0}'),
        new HumanMessage('test command'),
      ]);

      const latency = performance.now() - startTime;

      return {
        healthy: true,
        latency,
      };

    } catch (error) {
      return {
        healthy: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    logger.info('IntentClassificationEngine cleanup completed', {
      totalClassifications: this.performanceMetrics.totalClassifications,
      averageProcessingTime: this.performanceMetrics.averageProcessingTime,
      successRate: this.performanceMetrics.successRate,
    });
  }
}
