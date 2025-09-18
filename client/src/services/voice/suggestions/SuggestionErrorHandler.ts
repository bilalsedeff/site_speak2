/**
 * Suggestion Error Handler
 *
 * Comprehensive error handling and fallback strategies for the voice suggestion
 * system. Provides graceful degradation, automatic recovery, circuit breaker
 * patterns, and intelligent fallback mechanisms.
 *
 * Features:
 * - Circuit breaker pattern for service protection
 * - Graceful degradation with fallback suggestions
 * - Automatic retry with exponential backoff
 * - Error categorization and routing
 * - Service health monitoring and recovery
 * - User-friendly error messages
 * - Performance impact minimization
 */

import {
  SuggestionError,
  SuggestionErrorCode,
  CommandSuggestion,
  SuggestionContext,
  SuggestionResponse
} from '@shared/types/suggestion.types';

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  requestCount: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: SuggestionErrorCode[];
}

interface FallbackStrategy {
  type: 'cache' | 'template' | 'minimal' | 'offline';
  priority: number;
  enabled: boolean;
  description: string;
}

interface ErrorStats {
  totalErrors: number;
  errorsByCode: Map<SuggestionErrorCode, number>;
  errorsByService: Map<string, number>;
  recentErrors: Array<{
    timestamp: Date;
    code: SuggestionErrorCode;
    service: string;
    message: string;
    resolved: boolean;
  }>;
}

export class SuggestionErrorHandler {
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private retryConfig: RetryConfig;
  private fallbackStrategies: FallbackStrategy[];
  private errorStats: ErrorStats;
  private isMaintenanceMode = false;
  private recoveryTimeout: NodeJS.Timeout | null = null;

  constructor(config: {
    circuitBreakerThreshold?: number;
    circuitBreakerTimeout?: number;
    retryConfig?: Partial<RetryConfig>;
  } = {}) {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: [
        'TIMEOUT',
        'AI_SERVICE_UNAVAILABLE',
        'RATE_LIMIT_EXCEEDED',
        'UNKNOWN_ERROR'
      ],
      ...config.retryConfig
    };

    this.fallbackStrategies = [
      {
        type: 'cache',
        priority: 1,
        enabled: true,
        description: 'Use cached suggestions from previous requests'
      },
      {
        type: 'template',
        priority: 2,
        enabled: true,
        description: 'Use predefined template suggestions'
      },
      {
        type: 'minimal',
        priority: 3,
        enabled: true,
        description: 'Provide minimal basic suggestions'
      },
      {
        type: 'offline',
        priority: 4,
        enabled: true,
        description: 'Offline mode with static suggestions'
      }
    ];

    this.errorStats = {
      totalErrors: 0,
      errorsByCode: new Map(),
      errorsByService: new Map(),
      recentErrors: []
    };

    this.initializeCircuitBreakers();
  }

  /**
   * Handle suggestion generation errors with fallback strategies
   */
  async handleSuggestionError(
    error: Error | SuggestionError,
    context: SuggestionContext,
    serviceName: string,
    _originalRequest?: any
  ): Promise<SuggestionResponse> {
    const suggestionError = this.normalizeSuggestionError(error);

    // Record error statistics
    this.recordError(suggestionError, serviceName);

    // Check circuit breaker
    if (this.isCircuitOpen(serviceName)) {
      return this.getFallbackResponse(context, 'CIRCUIT_OPEN');
    }

    // Update circuit breaker
    this.recordFailure(serviceName);

    // Try recovery strategies
    const fallbackResponse = await this.tryFallbackStrategies(
      suggestionError,
      context,
      serviceName
    );

    if (fallbackResponse) {
      return fallbackResponse;
    }

    // Return minimal fallback if all strategies fail
    return this.getMinimalFallbackResponse(context, suggestionError);
  }

  /**
   * Handle auto-completion errors
   */
  async handleAutoCompletionError(
    error: Error,
    partialInput: string,
    _context: SuggestionContext
  ): Promise<any> {
    const suggestionError = this.normalizeSuggestionError(error);

    // For auto-completion, we want fast fallbacks
    if (suggestionError.code === 'TIMEOUT' || suggestionError.code === 'AI_SERVICE_UNAVAILABLE') {
      return {
        completions: this.getBasicCompletions(partialInput),
        partialInput,
        confidence: 0.5,
        processingTime: 10,
        fallbackUsed: true,
        suggestions: []
      };
    }

    return {
      completions: [],
      partialInput,
      confidence: 0,
      processingTime: 10,
      fallbackUsed: true,
      suggestions: []
    };
  }

  /**
   * Handle context discovery errors
   */
  async handleContextError(
    error: Error,
    _document?: Document
  ): Promise<any> {
    console.warn('Context discovery failed, using fallback:', error);

    // Return minimal page context
    return {
      pageType: 'other',
      contentType: 'other',
      capabilities: ['navigation'],
      elements: [],
      actions: this.getBasicActions(),
      structure: {
        landmarks: [],
        navigation: [],
        forms: [],
        content: [],
        interactive: []
      },
      accessibility: {
        score: 0,
        landmarks: 0,
        headingStructure: false,
        keyboardNavigable: false,
        screenReaderFriendly: false,
        issues: []
      },
      performance: {
        totalTime: 0,
        elementAnalysisTime: 0,
        structureAnalysisTime: 0,
        capabilityDetectionTime: 0,
        elementsAnalyzed: 0
      }
    };
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    serviceName: string,
    _context?: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();

        // Record success for circuit breaker
        this.recordSuccess(serviceName);

        return result;
      } catch (error) {
        lastError = error as Error;
        const suggestionError = this.normalizeSuggestionError(lastError);

        // Check if error is retryable
        if (!this.isRetryableError(suggestionError.code) || attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Wait before retry
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    // All retries failed
    this.recordFailure(serviceName);
    throw lastError;
  }

  /**
   * Check if service is available
   */
  isServiceAvailable(serviceName: string): boolean {
    return !this.isCircuitOpen(serviceName) && !this.isMaintenanceMode;
  }

  /**
   * Enter maintenance mode
   */
  enterMaintenanceMode(durationMs: number = 300000): void {
    this.isMaintenanceMode = true;
    console.warn('Entering maintenance mode for suggestion system');

    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }

    this.recoveryTimeout = setTimeout(() => {
      this.exitMaintenanceMode();
    }, durationMs);
  }

  /**
   * Exit maintenance mode
   */
  exitMaintenanceMode(): void {
    this.isMaintenanceMode = false;
    console.log('Exiting maintenance mode for suggestion system');

    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = null;
    }

    // Reset circuit breakers
    this.resetAllCircuitBreakers();
  }

  /**
   * Get error statistics
   */
  getErrorStats(): ErrorStats {
    return {
      ...this.errorStats,
      errorsByCode: new Map(this.errorStats.errorsByCode),
      errorsByService: new Map(this.errorStats.errorsByService),
      recentErrors: [...this.errorStats.recentErrors]
    };
  }

  /**
   * Clear error statistics
   */
  clearErrorStats(): void {
    this.errorStats = {
      totalErrors: 0,
      errorsByCode: new Map(),
      errorsByService: new Map(),
      recentErrors: []
    };
  }

  // ======================= PRIVATE METHODS =======================

  private initializeCircuitBreakers(): void {
    const services = [
      'suggestion_engine',
      'auto_completion',
      'context_discovery',
      'cache_manager'
    ];

    services.forEach(service => {
      this.circuitBreakers.set(service, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        requestCount: 0
      });
    });
  }

  private normalizeSuggestionError(error: Error | SuggestionError): SuggestionError {
    if (this.isSuggestionError(error)) {
      return error;
    }

    // Convert generic errors to SuggestionError
    let code: SuggestionErrorCode = 'UNKNOWN_ERROR';
    let retryable = true;
    let fallbackAvailable = true;

    if (error.message.includes('timeout')) {
      code = 'TIMEOUT';
    } else if (error.message.includes('rate limit')) {
      code = 'RATE_LIMIT_EXCEEDED';
    } else if (error.message.includes('API') || error.message.includes('service')) {
      code = 'AI_SERVICE_UNAVAILABLE';
    } else if (error.message.includes('permission')) {
      code = 'PERMISSIONS_ERROR';
      retryable = false;
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      code = 'INVALID_INPUT';
      retryable = false;
    }

    const suggestionError = new Error(error.message) as SuggestionError;
    suggestionError.code = code;
    suggestionError.retryable = retryable;
    suggestionError.fallbackAvailable = fallbackAvailable;

    return suggestionError;
  }

  private isSuggestionError(error: any): error is SuggestionError {
    return error && typeof error.code === 'string' && typeof error.retryable === 'boolean';
  }

  private recordError(error: SuggestionError, serviceName: string): void {
    this.errorStats.totalErrors++;

    // Record by error code
    const codeCount = this.errorStats.errorsByCode.get(error.code) || 0;
    this.errorStats.errorsByCode.set(error.code, codeCount + 1);

    // Record by service
    const serviceCount = this.errorStats.errorsByService.get(serviceName) || 0;
    this.errorStats.errorsByService.set(serviceName, serviceCount + 1);

    // Record recent error
    this.errorStats.recentErrors.push({
      timestamp: new Date(),
      code: error.code,
      service: serviceName,
      message: error.message,
      resolved: false
    });

    // Keep only recent errors (last 100)
    if (this.errorStats.recentErrors.length > 100) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(-100);
    }
  }

  private isCircuitOpen(serviceName: string): boolean {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {return false;}

    if (breaker.state === 'open') {
      // Check if enough time has passed to try half-open
      if (Date.now() - breaker.lastFailureTime > 30000) { // 30 seconds
        breaker.state = 'half-open';
        breaker.successCount = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  private recordFailure(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {return;}

    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();
    breaker.requestCount++;

    // Open circuit if failure threshold reached
    if (breaker.failureCount >= 5) {
      breaker.state = 'open';
      console.warn(`Circuit breaker opened for ${serviceName}`);
    }
  }

  private recordSuccess(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (!breaker) {return;}

    breaker.successCount++;
    breaker.requestCount++;

    if (breaker.state === 'half-open') {
      // Close circuit after successful requests
      if (breaker.successCount >= 3) {
        breaker.state = 'closed';
        breaker.failureCount = 0;
        console.log(`Circuit breaker closed for ${serviceName}`);
      }
    } else if (breaker.state === 'closed') {
      // Reset failure count on success
      breaker.failureCount = Math.max(0, breaker.failureCount - 1);
    }
  }

  private resetAllCircuitBreakers(): void {
    for (const [_serviceName, breaker] of this.circuitBreakers) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.requestCount = 0;
    }
  }

  private isRetryableError(code: SuggestionErrorCode): boolean {
    return this.retryConfig.retryableErrors.includes(code);
  }

  private calculateRetryDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async tryFallbackStrategies(
    error: SuggestionError,
    context: SuggestionContext,
    serviceName: string
  ): Promise<SuggestionResponse | null> {
    const enabledStrategies = this.fallbackStrategies
      .filter(strategy => strategy.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const strategy of enabledStrategies) {
      try {
        const result = await this.executeFallbackStrategy(strategy, context, error);
        if (result) {
          console.log(`Fallback strategy '${strategy.type}' succeeded for ${serviceName}`);
          return result;
        }
      } catch (fallbackError) {
        console.warn(`Fallback strategy '${strategy.type}' failed:`, fallbackError);
      }
    }

    return null;
  }

  private async executeFallbackStrategy(
    strategy: FallbackStrategy,
    context: SuggestionContext,
    error: SuggestionError
  ): Promise<SuggestionResponse | null> {
    switch (strategy.type) {
      case 'cache':
        return this.getCachedFallback(context);

      case 'template':
        return this.getTemplateFallback(context);

      case 'minimal':
        return this.getMinimalFallbackResponse(context, error);

      case 'offline':
        return this.getOfflineFallback(context);

      default:
        return null;
    }
  }

  private async getCachedFallback(_context: SuggestionContext): Promise<SuggestionResponse | null> {
    // Try to get cached suggestions for similar contexts
    // This would integrate with the cache manager
    // For now, return null to indicate cache miss
    return null;
  }

  private getTemplateFallback(context: SuggestionContext): SuggestionResponse {
    const templateSuggestions = this.getTemplateSuggestions(context);

    return {
      suggestions: templateSuggestions,
      metadata: {
        requestId: `fallback_${Date.now()}`,
        processingTime: 10,
        cacheHit: false,
        confidence: 0.7,
        contextAnalysisTime: 0,
        suggestionGenerationTime: 0
      },
      fallbackUsed: true
    };
  }

  private getMinimalFallbackResponse(
    context: SuggestionContext,
    error: SuggestionError
  ): SuggestionResponse {
    const minimalSuggestions: CommandSuggestion[] = [
      {
        id: 'fallback-help',
        command: 'Help me with this page',
        intent: 'help_request',
        confidence: 0.8,
        priority: 'high',
        context,
        category: 'help',
        description: 'Get assistance with using this page',
        examples: ['How do I use this?', 'What can I do here?'],
        keywords: ['help', 'assistance'],
        variations: ['Show me help', 'I need help'],
        reasoning: 'Fallback help suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 500,
          isLearned: false,
          source: 'template'
        }
      }
    ];

    return {
      suggestions: minimalSuggestions,
      metadata: {
        requestId: `minimal_fallback_${Date.now()}`,
        processingTime: 5,
        cacheHit: false,
        confidence: 0.5,
        contextAnalysisTime: 0,
        suggestionGenerationTime: 0
      },
      fallbackUsed: true,
      error: `Service unavailable: ${error.message}`
    };
  }

  private getOfflineFallback(_context: SuggestionContext): SuggestionResponse {
    const offlineSuggestions = this.getOfflineSuggestions();

    return {
      suggestions: offlineSuggestions,
      metadata: {
        requestId: `offline_${Date.now()}`,
        processingTime: 1,
        cacheHit: false,
        confidence: 0.6,
        contextAnalysisTime: 0,
        suggestionGenerationTime: 0
      },
      fallbackUsed: true
    };
  }

  private getFallbackResponse(_context: SuggestionContext, reason: string): SuggestionResponse {
    return {
      suggestions: [],
      metadata: {
        requestId: `circuit_breaker_${Date.now()}`,
        processingTime: 1,
        cacheHit: false,
        confidence: 0,
        contextAnalysisTime: 0,
        suggestionGenerationTime: 0
      },
      fallbackUsed: true,
      error: `Service temporarily unavailable: ${reason}`
    };
  }

  private getTemplateSuggestions(context: SuggestionContext): CommandSuggestion[] {
    return [
      {
        id: 'template-navigate',
        command: 'Navigate around the site',
        intent: 'navigate_to_section',
        confidence: 0.7,
        priority: 'medium',
        context,
        category: 'navigation',
        description: 'Explore different sections of the website',
        examples: ['Go to home', 'Open menu'],
        keywords: ['navigate', 'go', 'menu'],
        variations: ['Browse the site', 'Look around'],
        reasoning: 'Template navigation suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.7,
          avgExecutionTime: 1000,
          isLearned: false,
          source: 'template'
        }
      },
      {
        id: 'template-help',
        command: 'What can I do here?',
        intent: 'help_request',
        confidence: 0.8,
        priority: 'high',
        context,
        category: 'help',
        description: 'Get help with available actions',
        examples: ['Show me options', 'Help me'],
        keywords: ['help', 'what', 'can', 'do'],
        variations: ['Show me commands', 'I need help'],
        reasoning: 'Template help suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 500,
          isLearned: false,
          source: 'template'
        }
      }
    ];
  }

  private getOfflineSuggestions(): CommandSuggestion[] {
    const context = {} as SuggestionContext;

    return [
      {
        id: 'offline-basic',
        command: 'Basic navigation help',
        intent: 'help_request',
        confidence: 0.6,
        priority: 'medium',
        context,
        category: 'help',
        description: 'Basic help when offline',
        examples: [],
        keywords: ['help', 'basic'],
        variations: [],
        reasoning: 'Offline mode basic help',
        metadata: {
          frequency: 0,
          successRate: 0.6,
          avgExecutionTime: 100,
          isLearned: false,
          source: 'template'
        }
      }
    ];
  }

  private getBasicCompletions(partialInput: string): any[] {
    const basic = [
      'Help me with this page',
      'Go to home page',
      'Search for something',
      'What can I do here?'
    ];

    return basic
      .filter(command => command.toLowerCase().includes(partialInput.toLowerCase()))
      .map(command => ({
        text: command,
        intent: 'help_request',
        confidence: 0.5,
        matchType: 'fuzzy',
        highlightRanges: [],
        reasoning: 'Basic fallback completion'
      }));
  }

  private getBasicActions(): any[] {
    return [
      {
        id: 'basic-help',
        name: 'Get Help',
        description: 'Get assistance with this page',
        category: 'help',
        intent: 'help_request',
        triggers: ['help', 'assistance'],
        requirements: [],
        parameters: [],
        examples: ['Help me', 'I need help'],
        confidence: 0.8
      }
    ];
  }
}

export const suggestionErrorHandler = new SuggestionErrorHandler();