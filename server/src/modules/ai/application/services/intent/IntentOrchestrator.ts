/**
 * Intent Orchestrator - Multi-layered intent recognition coordinator
 *
 * Features:
 * - Coordinates all intent recognition layers
 * - Manages performance and fallback strategies
 * - Provides unified interface for intent processing
 * - Real-time performance monitoring and optimization
 * - Adaptive threshold management
 * - Universal website compatibility
 * - <300ms total processing time guarantee
 */

import { createLogger } from '../../../../../shared/utils';
import { IntentClassificationEngine, type IntentClassificationConfig } from './IntentClassificationEngine.js';
import { ContextualIntentAnalyzer, type ContextAnalysisConfig, type RawPageData, type SessionData } from './ContextualIntentAnalyzer.js';
import { IntentValidationService, type ValidationConfig } from './IntentValidationService.js';
import { IntentCacheManager, type CacheConfig } from './IntentCacheManager.js';
import type {
  IntentCategory,
  IntentClassificationResult,
  IntentValidationResult,
  IntentProcessingRequest,
  IntentProcessingResponse,
  IntentOrchestrationConfig,
  IntentProcessingError,
  IntentSystemHealth,
  IntentClassificationMetrics,
  ContextualIntentAnalysis,
  UserContext,
  IntentEnsembleDecision,
  IntentSuggestion,
  ErrorDetails,
} from './types.js';

const logger = createLogger({ service: 'intent-orchestrator' });

export interface OrchestrationMetrics {
  totalRequests: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  validationRate: number;
  successRate: number;
  fallbackRate: number;
  performanceTarget: number;
  currentThroughput: number;
  errorRate: number;
  layerBreakdown: {
    classification: number;
    contextAnalysis: number;
    validation: number;
    caching: number;
  };
}

/**
 * Master Intent Recognition Orchestrator
 */
export class IntentOrchestrator {
  private config: IntentOrchestrationConfig;
  private classificationEngine!: IntentClassificationEngine;
  private contextAnalyzer!: ContextualIntentAnalyzer;
  private validationService!: IntentValidationService;
  private cacheManager!: IntentCacheManager;

  private processingQueue = new Map<string, Promise<IntentProcessingResponse>>();
  private performanceMonitor = new Map<string, number[]>(); // Track processing times
  private errorTracker = new Map<string, { count: number; lastError: Date }>();

  private metrics: OrchestrationMetrics = {
    totalRequests: 0,
    averageProcessingTime: 0,
    cacheHitRate: 0,
    validationRate: 0,
    successRate: 0,
    fallbackRate: 0,
    performanceTarget: 300,
    currentThroughput: 0,
    errorRate: 0,
    layerBreakdown: {
      classification: 0,
      contextAnalysis: 0,
      validation: 0,
      caching: 0,
    },
  };

  private isInitialized = false;
  private healthStatus: IntentSystemHealth['status'] = 'healthy';
  private throughputWindow: number[] = [];

  constructor(config: IntentOrchestrationConfig) {
    this.config = config;

    logger.info('IntentOrchestrator initializing', {
      primaryModel: config.primaryClassifier.model,
      validationEnabled: config.secondaryValidation.enabled,
      contextAnalysisEnabled: config.contextAnalysis.enabled,
      cachingEnabled: config.caching.enabled,
      ensembleEnabled: config.ensemble.enabled,
      learningEnabled: config.learning.enabled,
    });
  }

  /**
   * Utility method to handle unknown error types safely
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Utility method to get error details safely
   */
  private getErrorDetails(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        ...(error.stack && { stack: error.stack }),
      };
    }
    return {
      message: String(error),
    };
  }

  /**
   * Initialize all intent recognition components
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing intent recognition components...');

      // Initialize classification engine
      const classificationConfig: IntentClassificationConfig = {
        openaiApiKey: process.env['OPENAI_API_KEY']!,
        model: this.config.primaryClassifier.model,
        temperature: this.config.primaryClassifier.temperature,
        maxTokens: this.config.primaryClassifier.maxTokens,
        timeout: this.config.primaryClassifier.timeout,
        enableReasoning: true,
        confidenceThreshold: 0.7,
        retryAttempts: 2,
      };

      this.classificationEngine = new IntentClassificationEngine(classificationConfig);

      // Initialize context analyzer
      const contextConfig: ContextAnalysisConfig = {
        maxElementsToAnalyze: 50,
        enableSchemaDetection: true,
        enableCapabilityDetection: this.config.contextAnalysis.enabled,
        enableLearningProfile: this.config.learning.enabled,
        contextCacheTimeout: 300000, // 5 minutes
        performanceTargetMs: 50,
      };

      this.contextAnalyzer = new ContextualIntentAnalyzer(contextConfig);

      // Initialize validation service
      const validationConfig: ValidationConfig = {
        enabled: this.config.secondaryValidation.enabled,
        secondaryModels: this.config.secondaryValidation.validationModels,
        openaiApiKey: process.env['OPENAI_API_KEY']!,
        confidenceThreshold: this.config.secondaryValidation.threshold,
        conflictThreshold: 0.3,
        ensembleStrategy: this.config.ensemble.strategy,
        timeoutMs: 5000,
        enableClarification: true,
        adaptiveThresholds: this.config.learning.adaptiveThresholds,
      };

      this.validationService = new IntentValidationService(validationConfig);

      // Initialize cache manager
      const cacheConfig: CacheConfig = {
        enabled: this.config.caching.enabled,
        maxEntries: this.config.caching.maxEntries,
        defaultTtl: this.config.caching.ttl,
        keyStrategy: this.config.caching.keyStrategy,
        enableLearning: this.config.learning.enabled,
        enablePatternRecognition: this.config.learning.patternDetection,
        enableAdaptiveThresholds: this.config.learning.adaptiveThresholds,
        learningDecayFactor: 0.95,
        patternMinOccurrences: 3,
        memoryLimitMb: 100,
      };

      this.cacheManager = new IntentCacheManager(cacheConfig);

      // Start performance monitoring
      this.startPerformanceMonitoring();

      // Perform health checks
      await this.performHealthChecks();

      this.isInitialized = true;
      this.metrics.performanceTarget = this.config.performance.targetProcessingTime;

      logger.info('IntentOrchestrator initialized successfully', {
        healthStatus: this.healthStatus,
        componentsInitialized: 4,
      });

    } catch (error) {
      this.healthStatus = 'unhealthy';
      const errorDetails = this.getErrorDetails(error);
      logger.error('Failed to initialize IntentOrchestrator', errorDetails);
      throw new Error(`Intent orchestrator initialization failed: ${errorDetails.message}`);
    }
  }

  /**
   * Process intent with full multi-layered recognition
   */
  async processIntent(
    text: string,
    pageData: RawPageData,
    sessionData: SessionData,
    userRole: UserContext['role'] = 'guest',
    options: {
      skipCache?: boolean;
      skipValidation?: boolean;
      requireHighConfidence?: boolean;
      timeoutMs?: number;
      preferredModels?: string[];
    } = {}
  ): Promise<IntentProcessingResponse> {
    if (!this.isInitialized) {
      throw new Error('IntentOrchestrator not initialized');
    }

    const startTime = performance.now();
    const requestId = this.generateRequestId();
    const timeoutMs = options.timeoutMs || this.config.performance.targetProcessingTime;

    this.metrics.totalRequests++;

    try {
      logger.debug('Processing intent request', {
        requestId,
        text: text.slice(0, 100),
        userRole,
        options,
        sessionId: sessionData.sessionId,
      });

      // Check for duplicate requests in queue
      const existingRequest = this.processingQueue.get(text);
      if (existingRequest) {
        logger.debug('Returning existing request from queue', { requestId });
        return await existingRequest;
      }

      // Create processing promise and add to queue
      const processingPromise = this.executeIntentProcessing(
        text,
        pageData,
        sessionData,
        userRole,
        options,
        requestId,
        timeoutMs
      );

      this.processingQueue.set(text, processingPromise);

      try {
        const result = await processingPromise;
        return result;
      } finally {
        this.processingQueue.delete(text);
      }

    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.updateMetrics(processingTime, false);
      const errorMessage = this.getErrorMessage(error);
      this.recordError(errorMessage);

      logger.error('Intent processing failed', {
        requestId,
        error: errorMessage,
        processingTime,
        text: text.slice(0, 50),
      });

      throw this.createProcessingError(
        'UNKNOWN',
        `Intent processing failed: ${errorMessage}`,
        error,
        true
      );
    }
  }

  /**
   * Execute the full intent processing pipeline
   */
  private async executeIntentProcessing(
    text: string,
    pageData: RawPageData,
    sessionData: SessionData,
    userRole: UserContext['role'],
    options: IntentProcessingRequest['options'],
    requestId: string,
    timeoutMs: number
  ): Promise<IntentProcessingResponse> {
    const startTime = performance.now();
    const layerTimes = {
      contextAnalysis: 0,
      caching: 0,
      classification: 0,
      validation: 0,
    };

    try {
      // Create processing request with timeout
      const processingResult = await Promise.race([
        this.executeProcessingStages(
          text,
          pageData,
          sessionData,
          userRole,
          options,
          requestId,
          layerTimes
        ),
        this.createTimeoutPromise(timeoutMs),
      ]);

      if (processingResult === 'TIMEOUT') {
        throw this.createProcessingError(
          'TIMEOUT',
          `Intent processing exceeded ${timeoutMs}ms timeout`,
          undefined,
          true
        );
      }

      const totalProcessingTime = performance.now() - startTime;
      this.updateMetrics(totalProcessingTime, true);
      this.updateLayerBreakdown(layerTimes);

      logger.info('Intent processing completed', {
        requestId,
        totalTime: totalProcessingTime,
        intent: processingResult.classification.intent,
        confidence: processingResult.classification.confidence,
        cacheHit: processingResult.metrics.cacheHit,
        validated: !!processingResult.validation.isValid,
      });

      return processingResult;

    } catch (error) {
      const totalProcessingTime = performance.now() - startTime;
      this.updateMetrics(totalProcessingTime, false);

      throw error;
    }
  }

  /**
   * Execute all processing stages
   */
  private async executeProcessingStages(
    text: string,
    pageData: RawPageData,
    sessionData: SessionData,
    userRole: UserContext['role'],
    options: IntentProcessingRequest['options'],
    requestId: string,
    layerTimes: Record<string, number>
  ): Promise<IntentProcessingResponse> {
    // Stage 1: Context Analysis
    const contextStartTime = performance.now();
    const contextAnalysis = await this.contextAnalyzer.analyzeContext(
      pageData,
      sessionData,
      userRole
    );
    layerTimes['contextAnalysis'] = performance.now() - contextStartTime;

    // Create processing request
    const request: IntentProcessingRequest = {
      text,
      context: contextAnalysis,
      ...(options && { options }),
      metadata: {
        sessionId: sessionData.sessionId,
        ...(sessionData.userId && { userId: sessionData.userId }),
        timestamp: new Date(),
        correlationId: requestId,
      },
    };

    let classification: IntentClassificationResult | undefined;
    let cacheHit = false;

    // Stage 2: Cache Check
    if (!options?.skipCache) {
      const cacheStartTime = performance.now();
      const cachedResult = await this.cacheManager.getCachedIntent(request);
      layerTimes['caching'] = performance.now() - cacheStartTime;

      if (cachedResult) {
        classification = cachedResult;
        cacheHit = true;
        logger.debug('Using cached intent', { requestId, intent: cachedResult.intent });
      }
    }

    // Stage 3: Primary Classification
    if (!classification) {
      const classificationStartTime = performance.now();
      classification = await this.classificationEngine.classifyIntent(request);
      layerTimes['classification'] = performance.now() - classificationStartTime;

      // Cache the result
      if (this.config.caching.enabled) {
        await this.cacheManager.cacheIntent(request, classification, 'classification');
      }
    }

    // Ensure classification was successful
    if (!classification) {
      throw new Error('Classification failed - no result obtained');
    }

    // Type narrowing: classification is now guaranteed to be defined
    const finalClassification: IntentClassificationResult = classification;

    // Stage 4: Validation (if enabled and needed)
    let validation: IntentValidationResult;
    let ensemble: IntentEnsembleDecision | undefined;

    if (!options?.skipValidation && this.config.secondaryValidation.enabled) {
      const validationStartTime = performance.now();

      // Skip validation for high-confidence cached results
      if (cacheHit && finalClassification.confidence >= 0.9) {
        validation = {
          isValid: true,
          confidence: finalClassification.confidence,
          validationTime: 0,
        };
      } else {
        validation = await this.validationService.validateIntent(
          finalClassification,
          text,
          contextAnalysis,
          requestId
        );
      }

      layerTimes['validation'] = performance.now() - validationStartTime;
    } else {
      validation = {
        isValid: true,
        confidence: classification.confidence,
        validationTime: 0,
      };
    }

    // Stage 5: Generate recommendations
    const recommendations = await this.generateRecommendations(
      classification,
      contextAnalysis,
      validation
    );

    // Stage 6: Prepare response
    const response: IntentProcessingResponse = {
      classification: finalClassification,
      validation,
      contextualAnalysis: contextAnalysis,
      ...(ensemble && { ensemble }),
      recommendations,
      metrics: {
        totalProcessingTime: Object.values(layerTimes).reduce((sum, time) => sum + time, 0),
        cacheHit,
        modelsUsed: [finalClassification.modelUsed || 'unknown'],
        confidenceBreakdown: {
          primary: finalClassification.confidence,
          validation: validation.confidence,
        },
      },
      warnings: this.generateWarnings(finalClassification, validation, options),
      errors: [],
    };

    return response;
  }

  /**
   * Get default intent distribution with all intents initialized to 0
   */
  private getDefaultIntentDistribution(): Record<IntentCategory, number> {
    const distribution: Record<string, number> = {};

    // Initialize all intent categories with 0
    const intentCategories: IntentCategory[] = [
      // Navigation intents
      'navigate_to_page', 'navigate_to_section', 'navigate_back', 'navigate_forward',
      'scroll_to_element', 'open_menu', 'close_menu',
      // Action intents
      'click_element', 'submit_form', 'clear_form', 'select_option', 'toggle_element',
      'drag_drop', 'copy_content', 'paste_content',
      // Content manipulation
      'edit_text', 'add_content', 'delete_content', 'replace_content', 'format_content',
      'undo_action', 'redo_action',
      // Query intents
      'search_content', 'filter_results', 'sort_results', 'get_information',
      'explain_feature', 'show_details',
      // E-commerce specific
      'add_to_cart', 'remove_from_cart', 'view_product', 'compare_products',
      'checkout_process', 'track_order',
      // Control intents
      'stop_action', 'cancel_operation', 'pause_process', 'resume_process',
      'reset_state', 'save_progress',
      // Confirmation intents
      'confirm_action', 'deny_action', 'maybe_later', 'need_clarification',
      // Meta intents
      'help_request', 'tutorial_request', 'feedback_provide', 'error_report', 'unknown_intent'
    ];

    intentCategories.forEach(intent => {
      distribution[intent] = 0;
    });

    return distribution as Record<IntentCategory, number>;
  }

  /**
   * Generate intelligent recommendations based on results
   */
  private async generateRecommendations(
    classification: IntentClassificationResult,
    context: ContextualIntentAnalysis,
    validation: IntentValidationResult
  ): Promise<IntentSuggestion[]> {
    const recommendations: IntentSuggestion[] = [];

    // Add context-specific suggestions
    if (context.suggestionOverrides) {
      recommendations.push(...context.suggestionOverrides.slice(0, 3));
    }

    // Add low-confidence alternatives
    if (classification.confidence < 0.7) {
      const alternatives = this.generateAlternativeIntents(classification, context);
      recommendations.push(...alternatives);
    }

    // Add clarification suggestions for conflicts
    if (validation.conflicts && validation.conflicts.length > 0) {
      const clarificationSuggestions = validation.conflicts
        .filter(conflict => conflict.suggestedResolution?.clarificationQuestion)
        .map(conflict => ({
          intent: conflict.suggestedResolution!.selectedIntent,
          phrase: conflict.suggestedResolution!.clarificationQuestion!,
          context: 'Clarification needed',
          confidence: conflict.suggestedResolution!.confidence,
          reasoning: 'Based on detected conflicts',
        }));

      recommendations.push(...clarificationSuggestions);
    }

    return recommendations.slice(0, 5); // Limit to 5 recommendations
  }

  /**
   * Generate alternative intent suggestions
   */
  private generateAlternativeIntents(
    classification: IntentClassificationResult,
    context: ContextualIntentAnalysis
  ): IntentSuggestion[] {
    const alternatives: IntentSuggestion[] = [];

    // Based on page capabilities
    const pageCapabilities = context.pageContext.capabilities;

    if (pageCapabilities.includes('e-commerce') && classification.intent !== 'add_to_cart') {
      alternatives.push({
        intent: 'add_to_cart',
        phrase: 'Add to cart',
        context: 'E-commerce capability detected',
        confidence: 0.6,
        reasoning: 'Page supports e-commerce functionality',
      });
    }

    if (pageCapabilities.includes('search') && classification.intent !== 'search_content') {
      alternatives.push({
        intent: 'search_content',
        phrase: 'Search for something',
        context: 'Search capability detected',
        confidence: 0.6,
        reasoning: 'Page has search functionality',
      });
    }

    if (pageCapabilities.includes('forms') && classification.intent !== 'submit_form') {
      alternatives.push({
        intent: 'submit_form',
        phrase: 'Submit the form',
        context: 'Form capability detected',
        confidence: 0.6,
        reasoning: 'Page contains forms',
      });
    }

    // Based on current mode
    if (context.pageContext.currentMode === 'edit') {
      alternatives.push({
        intent: 'edit_text',
        phrase: 'Edit content',
        context: 'Edit mode active',
        confidence: 0.7,
        reasoning: 'Page is in edit mode',
      });
    }

    return alternatives;
  }

  /**
   * Generate warnings for the response
   */
  private generateWarnings(
    classification: IntentClassificationResult,
    validation: IntentValidationResult,
    options: IntentProcessingRequest['options']
  ): string[] {
    const warnings: string[] = [];

    if (classification.confidence < 0.5) {
      warnings.push('Low confidence classification - consider requesting clarification');
    }

    if (validation.conflicts && validation.conflicts.length > 0) {
      warnings.push(`${validation.conflicts.length} intent conflicts detected`);
    }

    if (classification.source === 'cache' && options?.requireHighConfidence) {
      warnings.push('Result from cache may not reflect latest context changes');
    }

    if (!validation.isValid) {
      warnings.push('Intent validation failed - using fallback strategy');
    }

    return warnings;
  }

  /**
   * Learn from user feedback to improve accuracy
   */
  async learnFromFeedback(
    originalText: string,
    actualIntent: IntentCategory,
    wasCorrect: boolean,
    userFeedback?: 'positive' | 'negative' | 'neutral',
    contextData?: {
      pageData: RawPageData;
      sessionData: SessionData;
      userRole: UserContext['role'];
    }
  ): Promise<void> {
    if (!this.config.learning.enabled) {
      return;
    }

    try {
      // Create request for learning
      if (contextData) {
        const context = await this.contextAnalyzer.analyzeContext(
          contextData.pageData,
          contextData.sessionData,
          contextData.userRole
        );

        const request: IntentProcessingRequest = {
          text: originalText,
          context,
          metadata: {
            sessionId: contextData.sessionData.sessionId,
            ...(contextData.sessionData.userId && { userId: contextData.sessionData.userId }),
            timestamp: new Date(),
          },
        };

        // Update cache with feedback
        await this.cacheManager.learnFromFeedback(
          request,
          actualIntent,
          wasCorrect,
          userFeedback
        );
      }

      logger.debug('Learned from user feedback', {
        originalText: originalText.slice(0, 50),
        actualIntent,
        wasCorrect,
        userFeedback,
      });

    } catch (error) {
      logger.error('Failed to learn from feedback', {
        error: this.getErrorMessage(error),
        actualIntent,
        wasCorrect,
      });
    }
  }

  /**
   * Predict next likely intent for optimistic execution
   */
  async predictNextIntent(
    userId: string,
    recentIntents: IntentCategory[],
    context: ContextualIntentAnalysis
  ): Promise<{ intent: IntentCategory; confidence: number } | null> {
    if (!this.config.performance.enablePredictive) {
      return null;
    }

    try {
      return this.cacheManager.predictNextIntent(userId, recentIntents, context);
    } catch (error) {
      logger.error('Intent prediction failed', {
        error: this.getErrorMessage(error),
        userId,
        recentIntents,
      });
      return null;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<IntentSystemHealth> {
    try {
      const [
        classificationHealth,
        validationHealth,
        cacheStats,
      ] = await Promise.all([
        this.classificationEngine.healthCheck(),
        this.validationService.healthCheck(),
        this.cacheManager.getStatistics(),
      ]);

      const errors: IntentSystemHealth['errors'] = [];

      if (!classificationHealth.healthy) {
        errors.push({
          timestamp: new Date(),
          error: `Classification engine: ${classificationHealth.error}`,
          frequency: 1,
        });
      }

      if (!validationHealth.healthy) {
        errors.push({
          timestamp: new Date(),
          error: `Validation service: ${validationHealth.errors?.join(', ')}`,
          frequency: 1,
        });
      }

      const status: IntentSystemHealth['status'] = errors.length === 0 ? 'healthy' :
        errors.length === 1 ? 'degraded' : 'unhealthy';

      return {
        status,
        uptime: Date.now() - (this.isInitialized ? 0 : Date.now()),
        totalRequests: this.metrics.totalRequests,
        recentPerformance: this.getClassificationMetrics(),
        activeModels: [
          this.config.primaryClassifier.model,
          ...this.config.secondaryValidation.validationModels,
        ],
        cacheStatus: {
          size: cacheStats.cacheSize,
          hitRate: cacheStats.hitRate,
          memoryUsage: cacheStats.memoryUsage,
        },
        errors,
      };

    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.error('Health check failed', { error: errorMessage });

      return {
        status: 'unhealthy',
        uptime: 0,
        totalRequests: this.metrics.totalRequests,
        recentPerformance: this.getClassificationMetrics(),
        activeModels: [],
        cacheStatus: {
          size: 0,
          hitRate: 0,
          memoryUsage: 0,
        },
        errors: [{
          timestamp: new Date(),
          error: `Health check failed: ${errorMessage}`,
          frequency: 1,
        }],
      };
    }
  }

  /**
   * Get classification metrics
   */
  getClassificationMetrics(): IntentClassificationMetrics {
    const classificationMetrics = this.classificationEngine.getMetrics();
    const validationMetrics = this.validationService.getMetrics();
    const cacheStats = this.cacheManager.getStatistics();

    return {
      totalClassifications: this.metrics.totalRequests,
      averageProcessingTime: this.metrics.averageProcessingTime,
      averageConfidence: classificationMetrics.averageConfidence,
      successRate: this.metrics.successRate,
      cacheHitRate: this.metrics.cacheHitRate,
      modelPerformance: {
        [this.config.primaryClassifier.model]: {
          name: this.config.primaryClassifier.model,
          totalRequests: classificationMetrics.totalClassifications,
          averageLatency: classificationMetrics.averageProcessingTime,
          errorRate: classificationMetrics.errorCount / Math.max(1, classificationMetrics.totalClassifications),
          confidenceDistribution: [classificationMetrics.averageConfidence],
          lastUsed: new Date(),
        },
      },
      intentDistribution: this.getDefaultIntentDistribution(), // Would be populated from actual usage
      errorRates: {
        classification: classificationMetrics.errorCount / Math.max(1, classificationMetrics.totalClassifications),
        validation: validationMetrics.totalValidations > 0 ?
          (1 - validationMetrics.resolutionSuccessRate) : 0,
        cache: 1 - cacheStats.hitRate,
      },
      performanceTrends: [], // Would be populated from historical data
    };
  }

  /**
   * Get current orchestration metrics
   */
  getMetrics(): OrchestrationMetrics {
    return { ...this.metrics };
  }

  /**
   * Update configuration at runtime
   */
  async updateConfiguration(newConfig: Partial<IntentOrchestrationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };

    // Update component configurations
    if (newConfig.primaryClassifier) {
      this.classificationEngine.updateConfig({
        model: newConfig.primaryClassifier.model,
        temperature: newConfig.primaryClassifier.temperature,
        maxTokens: newConfig.primaryClassifier.maxTokens,
        timeout: newConfig.primaryClassifier.timeout,
      });
    }

    logger.info('Configuration updated', {
      updatedFields: Object.keys(newConfig),
    });
  }

  /**
   * Helper methods
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  private async createTimeoutPromise(timeoutMs: number): Promise<'TIMEOUT'> {
    return new Promise((resolve) => {
      setTimeout(() => resolve('TIMEOUT'), timeoutMs);
    });
  }

  private createProcessingError(
    code: IntentProcessingError['code'],
    message: string,
    originalError?: Error | unknown,
    retryable = false
  ): IntentProcessingError {
    const error = new Error(message) as IntentProcessingError;
    error.code = code;

    // Convert unknown error to ErrorDetails format
    if (originalError) {
      const errorDetails: ErrorDetails = {
        ...(originalError instanceof Error && { originalError }),
        ...(originalError instanceof Error && originalError.name && { errorCode: originalError.name }),
        context: {
          input: originalError instanceof Error ? originalError.message : String(originalError)
        },
        timestamp: new Date(),
      };
      error.details = errorDetails;
    }

    error.retryable = retryable;
    error.suggestedAction = this.getSuggestedAction(code);
    return error;
  }

  private getSuggestedAction(code: IntentProcessingError['code']): string {
    switch (code) {
      case 'TIMEOUT':
        return 'Retry with extended timeout or use cached result';
      case 'MODEL_ERROR':
        return 'Check API key and model availability';
      case 'VALIDATION_FAILED':
        return 'Use primary classification result with lower confidence';
      case 'CONTEXT_INSUFFICIENT':
        return 'Request more page context or use simplified processing';
      case 'CACHE_ERROR':
        return 'Bypass cache and use direct classification';
      default:
        return 'Check system health and retry';
    }
  }

  private updateMetrics(processingTime: number, success: boolean): void {
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (this.metrics.totalRequests - 1) + processingTime) /
      this.metrics.totalRequests;

    this.metrics.successRate = success ?
      (this.metrics.successRate * (this.metrics.totalRequests - 1) + 1) / this.metrics.totalRequests :
      this.metrics.successRate * (this.metrics.totalRequests - 1) / this.metrics.totalRequests;

    // Update throughput window
    this.throughputWindow.push(Date.now());
    this.throughputWindow = this.throughputWindow.filter(
      timestamp => Date.now() - timestamp < 60000 // Keep last minute
    );
    this.metrics.currentThroughput = this.throughputWindow.length;

    // Update error rate
    if (!success) {
      this.metrics.errorRate = (this.metrics.errorRate * (this.metrics.totalRequests - 1) + 1) / this.metrics.totalRequests;
    } else {
      this.metrics.errorRate = this.metrics.errorRate * (this.metrics.totalRequests - 1) / this.metrics.totalRequests;
    }
  }

  private updateLayerBreakdown(layerTimes: Record<string, number>): void {
    const total = Object.values(layerTimes).reduce((sum: number, time: number) => sum + time, 0);

    if (total > 0) {
      this.metrics.layerBreakdown.contextAnalysis = (layerTimes['contextAnalysis'] || 0) / total;
      this.metrics.layerBreakdown.caching = (layerTimes['caching'] || 0) / total;
      this.metrics.layerBreakdown.classification = (layerTimes['classification'] || 0) / total;
      this.metrics.layerBreakdown.validation = (layerTimes['validation'] || 0) / total;
    }
  }

  private recordError(errorMessage: string): void {
    const errorKey = errorMessage.slice(0, 50);
    const existing = this.errorTracker.get(errorKey);

    if (existing) {
      existing.count++;
      existing.lastError = new Date();
    } else {
      this.errorTracker.set(errorKey, {
        count: 1,
        lastError: new Date(),
      });
    }
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.performPerformanceCheck();
    }, 30000); // Check every 30 seconds
  }

  private performPerformanceCheck(): void {
    // Check if performance is degrading
    if (this.metrics.averageProcessingTime > this.metrics.performanceTarget * 1.5) {
      logger.warn('Performance degradation detected', {
        averageTime: this.metrics.averageProcessingTime,
        target: this.metrics.performanceTarget,
        throughput: this.metrics.currentThroughput,
      });

      // Could trigger automatic optimization here
      this.optimizePerformance();
    }

    // Check error rates
    if (this.metrics.errorRate > 0.1) { // 10% error rate threshold
      logger.warn('High error rate detected', {
        errorRate: this.metrics.errorRate,
        totalRequests: this.metrics.totalRequests,
      });

      this.healthStatus = 'degraded';
    } else if (this.metrics.errorRate > 0.05) {
      this.healthStatus = 'degraded';
    } else {
      this.healthStatus = 'healthy';
    }
  }

  private optimizePerformance(): void {
    // Automatic performance optimization strategies
    logger.info('Initiating performance optimization');

    // Could implement:
    // - Increase cache TTL
    // - Reduce validation threshold
    // - Skip validation for high-confidence results
    // - Use faster models for non-critical requests
  }

  private async performHealthChecks(): Promise<void> {
    try {
      const [classificationHealth, validationHealth] = await Promise.all([
        this.classificationEngine.healthCheck(),
        this.validationService.healthCheck(),
      ]);

      if (!classificationHealth.healthy) {
        logger.warn('Classification engine health check failed', {
          error: classificationHealth.error,
        });
      }

      if (!validationHealth.healthy) {
        logger.warn('Validation service health check failed', {
          errors: validationHealth.errors,
        });
      }

      const allHealthy = classificationHealth.healthy && validationHealth.healthy;
      this.healthStatus = allHealthy ? 'healthy' : 'degraded';

    } catch (error) {
      logger.error('Health check failed', { error: this.getErrorMessage(error) });
      this.healthStatus = 'unhealthy';
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up IntentOrchestrator');

    // Clear processing queue
    this.processingQueue.clear();

    // Cleanup components
    await Promise.all([
      this.classificationEngine?.cleanup(),
      this.validationService?.cleanup(),
      this.contextAnalyzer?.cleanup(),
      this.cacheManager?.cleanup(),
    ]);

    this.isInitialized = false;

    logger.info('IntentOrchestrator cleanup completed', {
      totalRequestsProcessed: this.metrics.totalRequests,
      averageProcessingTime: this.metrics.averageProcessingTime,
      successRate: this.metrics.successRate,
      cacheHitRate: this.metrics.cacheHitRate,
    });
  }
}