/**
 * Intent Validation Service - Multi-model validation and conflict resolution
 *
 * Features:
 * - Cross-validation between multiple models/approaches
 * - Intelligent conflict detection and resolution
 * - Ensemble decision making with weighted voting
 * - Ambiguity detection and clarification prompts
 * - Adaptive confidence thresholds
 * - Performance optimized for <100ms validation
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createLogger, getErrorMessage } from '../../../../../shared/utils';
import type {
  IntentCategory,
  IntentClassificationResult,
  IntentValidationResult,
  IntentConflict,
  IntentResolution,
  IntentEnsembleDecision,
  ContextualIntentAnalysis,
} from './types.js';

const logger = createLogger({ service: 'intent-validation-service' });

export interface ValidationConfig {
  enabled: boolean;
  secondaryModels: string[];
  openaiApiKey: string;
  confidenceThreshold: number;
  conflictThreshold: number;
  ensembleStrategy: 'weighted_average' | 'majority_vote' | 'confidence_threshold' | 'contextual_boost';
  timeoutMs: number;
  enableClarification: boolean;
  adaptiveThresholds: boolean;
}

export interface ValidationModel {
  name: string;
  model: ChatOpenAI;
  weight: number;
  confidence: number;
  reliability: number;
}

/**
 * Advanced Intent Validation Service
 */
export class IntentValidationService {
  private config: ValidationConfig;
  private validationModels = new Map<string, ValidationModel>();
  private conflictHistory = new Map<string, IntentConflict[]>();
  private performanceMetrics = {
    totalValidations: 0,
    averageValidationTime: 0,
    conflictRate: 0,
    resolutionSuccessRate: 0,
    ensembleAccuracy: 0,
  };

  constructor(config: ValidationConfig) {
    this.config = config;
    this.initializeValidationModels();

    logger.info('IntentValidationService initialized', {
      enabled: config.enabled,
      secondaryModels: config.secondaryModels.length,
      ensembleStrategy: config.ensembleStrategy,
      confidenceThreshold: config.confidenceThreshold,
    });
  }

  /**
   * Validate intent classification with multi-model approach
   */
  async validateIntent(
    primaryResult: IntentClassificationResult,
    originalText: string,
    context: ContextualIntentAnalysis,
    validationId?: string
  ): Promise<IntentValidationResult> {
    if (!this.config.enabled) {
      return this.createPassthroughValidation(primaryResult);
    }

    const startTime = performance.now();
    const id = validationId || `validation_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    try {
      logger.debug('Starting intent validation', {
        validationId: id,
        primaryIntent: primaryResult.intent,
        primaryConfidence: primaryResult.confidence,
        text: originalText,
      });

      // Stage 1: Cross-validation with secondary models
      const secondaryResults = await this.performCrossValidation(
        originalText,
        context,
        id
      );

      // Stage 2: Conflict detection
      const conflicts = this.detectConflicts(
        primaryResult,
        secondaryResults,
        context
      );

      // Stage 3: Ensemble decision making
      const ensembleDecision = this.makeEnsembleDecision(
        primaryResult,
        secondaryResults,
        conflicts,
        context
      );

      // Stage 4: Resolution strategy
      const resolution = await this.resolveConflicts(
        conflicts,
        ensembleDecision,
        originalText,
        context,
        id
      );

      const validationTime = performance.now() - startTime;
      const result = this.buildValidationResult(
        ensembleDecision,
        conflicts,
        resolution,
        validationTime
      );

      this.updateMetrics(validationTime, conflicts.length > 0, result.isValid);

      logger.info('Intent validation completed', {
        validationId: id,
        isValid: result.isValid,
        conflicts: conflicts.length,
        finalConfidence: result.confidence,
        validationTime,
      });

      return result;

    } catch (error) {
      const validationTime = performance.now() - startTime;
      this.updateMetrics(validationTime, false, false);

      logger.error('Intent validation failed', {
        validationId: id,
        error: getErrorMessage(error),
        validationTime,
      });

      // Return validation with warning
      return {
        isValid: true, // Assume valid to not block execution
        confidence: Math.max(0.3, primaryResult.confidence - 0.2),
        validationTime,
        conflicts: [{
          conflictType: 'insufficient_context',
          conflictingIntents: [primaryResult.intent],
          confidence: 0.3,
          description: `Validation failed: ${getErrorMessage(error)}`,
        }],
      };
    }
  }

  /**
   * Perform cross-validation with secondary models
   */
  private async performCrossValidation(
    text: string,
    context: ContextualIntentAnalysis,
    validationId: string
  ): Promise<IntentClassificationResult[]> {
    if (this.validationModels.size === 0) {
      return [];
    }

    const validationPromises = Array.from(this.validationModels.values()).map(
      model => this.validateWithModel(model, text, context, validationId)
    );

    try {
      const results = await Promise.allSettled(validationPromises);

      return results
        .filter((result): result is PromiseFulfilledResult<IntentClassificationResult> =>
          result.status === 'fulfilled'
        )
        .map(result => result.value);

    } catch (error) {
      logger.error('Cross-validation failed', {
        validationId,
        error: getErrorMessage(error),
      });
      return [];
    }
  }

  /**
   * Validate with specific model
   */
  private async validateWithModel(
    model: ValidationModel,
    text: string,
    context: ContextualIntentAnalysis,
    validationId: string
  ): Promise<IntentClassificationResult> {
    const prompt = this.buildValidationPrompt(text, context, model.name);

    try {
      const response = await Promise.race([
        model.model.invoke([new SystemMessage(prompt), new HumanMessage(text)]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Validation timeout')), this.config.timeoutMs)
        ),
      ]);

      const result = this.parseValidationResponse(
        (response as any).content,
        model.name,
        validationId
      );

      // Apply model weight to confidence
      result.confidence = result.confidence * model.weight;

      return result;

    } catch (error) {
      logger.warn('Model validation failed', {
        validationId,
        model: model.name,
        error: getErrorMessage(error),
      });

      // Return low-confidence fallback
      return {
        intent: 'unknown_intent',
        confidence: 0.1,
        parameters: {},
        reasoning: `Model ${model.name} validation failed: ${getErrorMessage(error)}`,
        source: 'secondary',
        processingTime: 0,
        modelUsed: model.name,
      };
    }
  }

  /**
   * Detect conflicts between different classification results
   */
  private detectConflicts(
    primaryResult: IntentClassificationResult,
    secondaryResults: IntentClassificationResult[],
    context: ContextualIntentAnalysis
  ): IntentConflict[] {
    const conflicts: IntentConflict[] = [];
    const allResults = [primaryResult, ...secondaryResults];

    // Check for intent disagreements
    const intentCounts = new Map<IntentCategory, number>();
    for (const result of allResults) {
      const count = intentCounts.get(result.intent) || 0;
      intentCounts.set(result.intent, count + 1);
    }

    const uniqueIntents = Array.from(intentCounts.keys());

    // Conflict detection scenarios
    if (uniqueIntents.length > 1) {
      // Multiple different intents detected
      const dominantIntent = Array.from(intentCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]![0];

      const confidence = intentCounts.get(dominantIntent)! / allResults.length;

      if (confidence < 0.7) {
        conflicts.push({
          conflictType: 'ambiguous',
          conflictingIntents: uniqueIntents,
          confidence: 1 - confidence,
          description: `Multiple intents detected with low agreement: ${uniqueIntents.join(', ')}`,
          suggestedResolution: {
            strategy: 'clarification',
            selectedIntent: dominantIntent,
            confidence,
            clarificationQuestion: this.generateClarificationQuestion(uniqueIntents, context),
          },
        });
      }
    }

    // Check for contradictory intents
    const contradictoryPairs = this.findContradictoryIntents(uniqueIntents);
    for (const [intent1, intent2] of contradictoryPairs) {
      conflicts.push({
        conflictType: 'contradictory',
        conflictingIntents: [intent1, intent2],
        confidence: 0.8,
        description: `Contradictory intents detected: ${intent1} vs ${intent2}`,
        suggestedResolution: {
          strategy: 'context_boost',
          selectedIntent: this.selectIntentByContext(intent1, intent2, context),
          confidence: 0.6,
          contextFactors: this.getContextFactors(context),
        },
      });
    }

    // Check for insufficient confidence
    const averageConfidence = allResults.reduce((sum, r) => sum + r.confidence, 0) / allResults.length;
    if (averageConfidence < this.config.confidenceThreshold) {
      conflicts.push({
        conflictType: 'insufficient_context',
        conflictingIntents: [primaryResult.intent],
        confidence: 1 - averageConfidence,
        description: `Low confidence across all models: ${averageConfidence.toFixed(2)}`,
        suggestedResolution: {
          strategy: 'user_confirmation',
          selectedIntent: primaryResult.intent,
          confidence: averageConfidence,
          clarificationQuestion: `I'm not completely sure about your intent. Did you want to ${this.intentToDescription(primaryResult.intent)}?`,
        },
      });
    }

    return conflicts;
  }

  /**
   * Make ensemble decision based on all classification results
   */
  private makeEnsembleDecision(
    primaryResult: IntentClassificationResult,
    secondaryResults: IntentClassificationResult[],
    conflicts: IntentConflict[],
    context: ContextualIntentAnalysis
  ): IntentEnsembleDecision {
    const allResults = [primaryResult, ...secondaryResults];
    const startTime = performance.now();

    let finalIntent: IntentCategory;
    let confidence: number;
    let ensembleStrategy = this.config.ensembleStrategy;

    switch (ensembleStrategy) {
      case 'majority_vote':
        ({ intent: finalIntent, confidence } = this.majorityVoteDecision(allResults));
        break;

      case 'weighted_average':
        ({ intent: finalIntent, confidence } = this.weightedAverageDecision(allResults));
        break;

      case 'confidence_threshold':
        ({ intent: finalIntent, confidence } = this.confidenceThresholdDecision(allResults));
        break;

      case 'contextual_boost':
        ({ intent: finalIntent, confidence } = this.contextualBoostDecision(allResults, context));
        break;

      default:
        finalIntent = primaryResult.intent;
        confidence = primaryResult.confidence;
    }

    const contributingModels = allResults.map(r => r.modelUsed || 'unknown');
    const weights = this.calculateModelWeights(allResults);

    const agreements = this.countAgreements(allResults, finalIntent);
    const disagreements = allResults.length - agreements;

    return {
      finalIntent,
      confidence,
      contributingModels,
      weights,
      agreements,
      disagreements,
      ensembleStrategy,
      decisionTime: performance.now() - startTime,
    };
  }

  /**
   * Majority vote decision strategy
   */
  private majorityVoteDecision(results: IntentClassificationResult[]): {
    intent: IntentCategory;
    confidence: number;
  } {
    const intentCounts = new Map<IntentCategory, { count: number; totalConfidence: number }>();

    for (const result of results) {
      const existing = intentCounts.get(result.intent) || { count: 0, totalConfidence: 0 };
      intentCounts.set(result.intent, {
        count: existing.count + 1,
        totalConfidence: existing.totalConfidence + result.confidence,
      });
    }

    const winner = Array.from(intentCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)[0];

    return {
      intent: winner[0],
      confidence: winner[1].totalConfidence / winner[1].count,
    };
  }

  /**
   * Weighted average decision strategy
   */
  private weightedAverageDecision(results: IntentClassificationResult[]): {
    intent: IntentCategory;
    confidence: number;
  } {
    const intentScores = new Map<IntentCategory, number>();

    for (const result of results) {
      const weight = this.getModelWeight(result.modelUsed || 'unknown');
      const score = result.confidence * weight;
      const existing = intentScores.get(result.intent) || 0;
      intentScores.set(result.intent, existing + score);
    }

    const winner = Array.from(intentScores.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      intent: winner[0],
      confidence: Math.min(1, winner[1] / results.length),
    };
  }

  /**
   * Confidence threshold decision strategy
   */
  private confidenceThresholdDecision(results: IntentClassificationResult[]): {
    intent: IntentCategory;
    confidence: number;
  } {
    // Select the result with highest confidence above threshold
    const highConfidenceResults = results.filter(
      r => r.confidence >= this.config.confidenceThreshold
    );

    if (highConfidenceResults.length > 0) {
      const best = highConfidenceResults.sort((a, b) => b.confidence - a.confidence)[0]!;
      return { intent: best.intent, confidence: best.confidence };
    }

    // Fallback to highest confidence result
    const best = results.sort((a, b) => b.confidence - a.confidence)[0]!;
    return { intent: best.intent, confidence: best.confidence };
  }

  /**
   * Contextual boost decision strategy
   */
  private contextualBoostDecision(
    results: IntentClassificationResult[],
    context: ContextualIntentAnalysis
  ): { intent: IntentCategory; confidence: number } {
    const boostedResults = results.map(result => {
      const boost = context.contextualBoosts[result.intent] || 0;
      const isConstrained = context.constrainedIntents.includes(result.intent);

      return {
        ...result,
        confidence: isConstrained ?
          result.confidence * 0.5 : // Penalize constrained intents
          result.confidence + boost,
      };
    });

    // Select highest boosted confidence
    const best = boostedResults.sort((a, b) => b.confidence - a.confidence)[0]!;
    return { intent: best.intent, confidence: Math.min(1, best.confidence) };
  }

  /**
   * Resolve conflicts using appropriate strategies
   */
  private async resolveConflicts(
    conflicts: IntentConflict[],
    ensembleDecision: IntentEnsembleDecision,
    originalText: string,
    context: ContextualIntentAnalysis,
    validationId: string
  ): Promise<IntentResolution | undefined> {
    if (conflicts.length === 0) {
      return undefined;
    }

    // Select most critical conflict to resolve
    const criticalConflict = conflicts.sort((a, b) => b.confidence - a.confidence)[0]!;

    try {
      switch (criticalConflict.suggestedResolution?.strategy) {
        case 'clarification':
          return await this.createClarificationResolution(
            criticalConflict,
            ensembleDecision,
            originalText,
            context
          );

        case 'context_boost':
          return this.createContextBoostResolution(
            criticalConflict,
            ensembleDecision,
            context
          );

        case 'user_confirmation':
          return this.createUserConfirmationResolution(
            criticalConflict,
            ensembleDecision,
            originalText
          );

        case 'fallback':
          return this.createFallbackResolution(criticalConflict, ensembleDecision);

        default:
          return this.createEnsembleVoteResolution(ensembleDecision, criticalConflict);
      }

    } catch (error) {
      logger.error('Conflict resolution failed', {
        validationId,
        conflictType: criticalConflict.conflictType,
        error: getErrorMessage(error),
      });

      return this.createFallbackResolution(criticalConflict, ensembleDecision);
    }
  }

  /**
   * Create clarification resolution
   */
  private async createClarificationResolution(
    conflict: IntentConflict,
    ensembleDecision: IntentEnsembleDecision,
    originalText: string,
    context: ContextualIntentAnalysis
  ): Promise<IntentResolution> {
    const clarificationQuestion = conflict.suggestedResolution?.clarificationQuestion ||
      this.generateClarificationQuestion(conflict.conflictingIntents, context);

    return {
      strategy: 'clarification',
      selectedIntent: ensembleDecision.finalIntent,
      confidence: Math.max(0.4, ensembleDecision.confidence - 0.2),
      clarificationQuestion,
      contextFactors: this.getContextFactors(context),
    };
  }

  /**
   * Generate clarification question
   */
  private generateClarificationQuestion(
    conflictingIntents: IntentCategory[],
    context: ContextualIntentAnalysis
  ): string {
    if (conflictingIntents.length === 2) {
      const [intent1, intent2] = conflictingIntents;
      return `I'm not sure if you want to ${this.intentToDescription(intent1)} or ${this.intentToDescription(intent2)}. Which one did you mean?`;
    }

    if (conflictingIntents.length > 2) {
      const descriptions = conflictingIntents.map(intent => this.intentToDescription(intent));
      return `I detected multiple possible actions: ${descriptions.join(', ')}. Which one would you like to do?`;
    }

    return `I'm not completely sure about your request. Could you please clarify what you'd like to do?`;
  }

  /**
   * Convert intent to human description
   */
  private intentToDescription(intent: IntentCategory): string {
    const descriptions: Partial<Record<IntentCategory, string>> = {
      'navigate_to_page': 'navigate to a page',
      'click_element': 'click on something',
      'edit_text': 'edit text',
      'add_to_cart': 'add to cart',
      'search_content': 'search for content',
      'submit_form': 'submit a form',
      'help_request': 'get help',
    };

    return descriptions[intent] || intent.replace(/_/g, ' ');
  }

  /**
   * Find contradictory intent pairs
   */
  private findContradictoryIntents(intents: IntentCategory[]): [IntentCategory, IntentCategory][] {
    const contradictoryPairs: Record<IntentCategory, IntentCategory[]> = {
      'add_to_cart': ['remove_from_cart'],
      'remove_from_cart': ['add_to_cart'],
      'edit_text': ['delete_content'],
      'delete_content': ['edit_text', 'add_content'],
      'undo_action': ['redo_action'],
      'redo_action': ['undo_action'],
      'confirm_action': ['deny_action', 'cancel_operation'],
      'deny_action': ['confirm_action'],
    };

    const pairs: [IntentCategory, IntentCategory][] = [];

    for (const intent1 of intents) {
      const contradictory = contradictoryPairs[intent1] || [];
      for (const intent2 of contradictory) {
        if (intents.includes(intent2)) {
          pairs.push([intent1, intent2]);
        }
      }
    }

    return pairs;
  }

  /**
   * Select intent based on context
   */
  private selectIntentByContext(
    intent1: IntentCategory,
    intent2: IntentCategory,
    context: ContextualIntentAnalysis
  ): IntentCategory {
    const boost1 = context.contextualBoosts[intent1] || 0;
    const boost2 = context.contextualBoosts[intent2] || 0;

    const constrained1 = context.constrainedIntents.includes(intent1);
    const constrained2 = context.constrainedIntents.includes(intent2);

    if (constrained1 && !constrained2) {return intent2;}
    if (constrained2 && !constrained1) {return intent1;}

    return boost1 > boost2 ? intent1 : intent2;
  }

  /**
   * Get context factors for resolution
   */
  private getContextFactors(context: ContextualIntentAnalysis): string[] {
    const factors = [];

    factors.push(`Page type: ${context.pageContext.pageType}`);
    factors.push(`Content type: ${context.pageContext.contentType}`);
    factors.push(`Mode: ${context.pageContext.currentMode}`);

    if (context.pageContext.capabilities.length > 0) {
      factors.push(`Capabilities: ${context.pageContext.capabilities.slice(0, 3).join(', ')}`);
    }

    if (context.sessionContext.previousIntents.length > 0) {
      const lastIntent = context.sessionContext.previousIntents.slice(-1)[0]!;
      factors.push(`Previous action: ${lastIntent.intent}`);
    }

    return factors;
  }

  /**
   * Build validation prompt for secondary models
   */
  private buildValidationPrompt(
    text: string,
    context: ContextualIntentAnalysis,
    modelName: string
  ): string {
    return `You are a specialized intent validator (${modelName}). Your task is to verify and classify user voice commands.

CONTEXT:
- Page: ${context.pageContext.pageType} (${context.pageContext.contentType})
- Mode: ${context.pageContext.currentMode}
- Capabilities: ${context.pageContext.capabilities.join(', ')}

AVAILABLE INTENTS: navigate_to_page, navigate_to_section, click_element, edit_text, add_content, delete_content, search_content, add_to_cart, remove_from_cart, submit_form, help_request, confirm_action, deny_action, unknown_intent

VALIDATION RULES:
1. Consider context appropriateness
2. Validate against available capabilities
3. Check for ambiguity or conflicts
4. Provide confidence based on clarity and context match

Return JSON: {"intent": "category", "confidence": 0.85, "reasoning": "explanation"}`;
  }

  /**
   * Parse validation response
   */
  private parseValidationResponse(
    responseText: string,
    modelName: string,
    validationId: string
  ): IntentClassificationResult {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in validation response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        intent: parsed.intent || 'unknown_intent',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        parameters: parsed.parameters || {},
        reasoning: parsed.reasoning || 'No reasoning provided',
        source: 'secondary',
        processingTime: 0,
        modelUsed: modelName,
      };

    } catch (error) {
      logger.warn('Failed to parse validation response', {
        validationId,
        modelName,
        error: getErrorMessage(error),
      });

      return {
        intent: 'unknown_intent',
        confidence: 0.2,
        parameters: {},
        reasoning: `Parse error in ${modelName}: ${getErrorMessage(error)}`,
        source: 'secondary',
        processingTime: 0,
        modelUsed: modelName,
      };
    }
  }

  /**
   * Build final validation result
   */
  private buildValidationResult(
    ensembleDecision: IntentEnsembleDecision,
    conflicts: IntentConflict[],
    resolution: IntentResolution | undefined,
    validationTime: number
  ): IntentValidationResult {
    const hasConflicts = conflicts.length > 0;
    const isValid = !hasConflicts || (resolution?.confidence || 0) >= 0.5;

    return {
      isValid,
      confidence: resolution?.confidence || ensembleDecision.confidence,
      conflicts: hasConflicts ? conflicts : undefined,
      resolution,
      fallbackIntent: !isValid ? 'help_request' : undefined,
      validationTime,
    };
  }

  /**
   * Create passthrough validation for disabled mode
   */
  private createPassthroughValidation(
    primaryResult: IntentClassificationResult
  ): IntentValidationResult {
    return {
      isValid: true,
      confidence: primaryResult.confidence,
      validationTime: 0,
    };
  }

  /**
   * Create fallback resolution
   */
  private createFallbackResolution(
    conflict: IntentConflict,
    ensembleDecision: IntentEnsembleDecision
  ): IntentResolution {
    return {
      strategy: 'fallback',
      selectedIntent: 'help_request',
      confidence: 0.3,
      clarificationQuestion: 'I\'m having trouble understanding your request. Could you please try again or ask for help?',
    };
  }

  /**
   * Create other resolution types
   */
  private createContextBoostResolution(
    conflict: IntentConflict,
    ensembleDecision: IntentEnsembleDecision,
    context: ContextualIntentAnalysis
  ): IntentResolution {
    return {
      strategy: 'context_boost',
      selectedIntent: ensembleDecision.finalIntent,
      confidence: Math.min(0.9, ensembleDecision.confidence + 0.2),
      contextFactors: this.getContextFactors(context),
    };
  }

  private createUserConfirmationResolution(
    conflict: IntentConflict,
    ensembleDecision: IntentEnsembleDecision,
    originalText: string
  ): IntentResolution {
    return {
      strategy: 'user_confirmation',
      selectedIntent: ensembleDecision.finalIntent,
      confidence: Math.max(0.4, ensembleDecision.confidence),
      clarificationQuestion: `Just to confirm, you want to ${this.intentToDescription(ensembleDecision.finalIntent)}?`,
    };
  }

  private createEnsembleVoteResolution(
    ensembleDecision: IntentEnsembleDecision,
    conflict: IntentConflict
  ): IntentResolution {
    return {
      strategy: 'ensemble_vote',
      selectedIntent: ensembleDecision.finalIntent,
      confidence: ensembleDecision.confidence,
    };
  }

  /**
   * Helper methods for ensemble decision making
   */
  private calculateModelWeights(results: IntentClassificationResult[]): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const result of results) {
      const modelName = result.modelUsed || 'unknown';
      weights[modelName] = this.getModelWeight(modelName);
    }
    return weights;
  }

  private getModelWeight(modelName: string): number {
    const model = this.validationModels.get(modelName);
    return model?.weight || 1.0;
  }

  private countAgreements(results: IntentClassificationResult[], finalIntent: IntentCategory): number {
    return results.filter(r => r.intent === finalIntent).length;
  }

  /**
   * Initialize validation models
   */
  private initializeValidationModels(): void {
    if (!this.config.enabled || this.config.secondaryModels.length === 0) {
      return;
    }

    for (const modelName of this.config.secondaryModels) {
      try {
        const model = new ChatOpenAI({
          apiKey: this.config.openaiApiKey,
          model: modelName,
          temperature: 0.3, // Lower temperature for validation
          maxTokens: 150,   // Shorter responses for validation
          timeout: this.config.timeoutMs,
        });

        this.validationModels.set(modelName, {
          name: modelName,
          model,
          weight: 1.0, // Default weight, can be adjusted based on performance
          confidence: 0.8,
          reliability: 0.9,
        });

        logger.debug('Validation model initialized', { modelName });

      } catch (error) {
        logger.error('Failed to initialize validation model', {
          modelName,
          error: getErrorMessage(error),
        });
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(
    validationTime: number,
    hasConflicts: boolean,
    resolutionSuccess: boolean
  ): void {
    this.performanceMetrics.totalValidations++;

    this.performanceMetrics.averageValidationTime =
      (this.performanceMetrics.averageValidationTime * (this.performanceMetrics.totalValidations - 1) + validationTime) /
      this.performanceMetrics.totalValidations;

    if (hasConflicts) {
      this.performanceMetrics.conflictRate =
        (this.performanceMetrics.conflictRate * (this.performanceMetrics.totalValidations - 1) + 1) /
        this.performanceMetrics.totalValidations;

      if (resolutionSuccess) {
        this.performanceMetrics.resolutionSuccessRate =
          (this.performanceMetrics.resolutionSuccessRate * (this.performanceMetrics.totalValidations - 1) + 1) /
          this.performanceMetrics.totalValidations;
      }
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Update model weights based on performance
   */
  updateModelWeight(modelName: string, newWeight: number): void {
    const model = this.validationModels.get(modelName);
    if (model) {
      model.weight = Math.max(0.1, Math.min(2.0, newWeight));
      logger.debug('Model weight updated', { modelName, newWeight: model.weight });
    }
  }

  /**
   * Health check for validation service
   */
  async healthCheck(): Promise<{ healthy: boolean; models: string[]; errors?: string[] }> {
    const errors: string[] = [];
    const activeModels: string[] = [];

    for (const [modelName, model] of this.validationModels.entries()) {
      try {
        await model.model.invoke([
          new SystemMessage('Health check'),
          new HumanMessage('test'),
        ]);
        activeModels.push(modelName);
      } catch (error) {
        errors.push(`${modelName}: ${getErrorMessage(error)}`);
      }
    }

    return {
      healthy: errors.length === 0,
      models: activeModels,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.validationModels.clear();
    this.conflictHistory.clear();

    logger.info('IntentValidationService cleanup completed', {
      totalValidations: this.performanceMetrics.totalValidations,
      conflictRate: this.performanceMetrics.conflictRate,
      resolutionSuccessRate: this.performanceMetrics.resolutionSuccessRate,
    });
  }
}
