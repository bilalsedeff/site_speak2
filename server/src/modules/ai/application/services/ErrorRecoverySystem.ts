import { createLogger } from '../../../../shared/utils.js';
// TODO: Import SessionStateType when implementing LangGraph session-aware error recovery
// import type { SessionStateType } from '../../domain/LangGraphOrchestrator';

const logger = createLogger({ service: 'error-recovery' });

export interface ErrorContext {
  sessionId: string;
  siteId: string;
  actionName?: string;
  parameters?: Record<string, unknown>;
  errorMessage: string;
  stackTrace?: string;
  timestamp: Date;
  userInput: string;
  intent?: {
    category: string;
    confidence: number;
    extractedEntities: Record<string, unknown>;
  };
  previousActions: Array<{
    name: string;
    success: boolean;
    timestamp: Date;
  }>;
}

export interface RecoveryStrategy {
  name: string;
  description: string;
  confidence: number;
  actions: Array<{
    type: 'retry' | 'alternative_action' | 'fallback' | 'human_intervention';
    details: Record<string, unknown>;
  }>;
  estimatedSuccessRate: number;
}

export interface ErrorPattern {
  type: string;
  frequency: number;
  commonCauses: string[];
  successfulRecoveries: RecoveryStrategy[];
  lastOccurrence: Date;
}

/**
 * Intelligent error recovery system that learns from failures
 * and provides adaptive recovery strategies
 */
export class ErrorRecoverySystem {
  private errorHistory: Map<string, ErrorContext[]> = new Map();
  private errorPatterns: Map<string, ErrorPattern> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _recoveryStrategies: Map<string, RecoveryStrategy[]> = new Map(); // TODO: Implement recovery strategy lookup
  private learningThreshold = 3; // Minimum occurrences to identify a pattern

  constructor() {
    // Initialize with common error patterns
    this.initializeCommonPatterns();
    
    // Clean up old error history every hour
    setInterval(() => this.cleanupOldHistory(), 60 * 60 * 1000);
  }

  /**
   * Analyze an error and provide recovery strategies
   */
  async analyzeAndRecover(context: ErrorContext): Promise<{
    errorPattern: ErrorPattern | null;
    recoveryStrategies: RecoveryStrategy[];
    shouldRetry: boolean;
    estimatedRecoveryTime: number;
  }> {
    logger.info('Analyzing error for recovery', {
      sessionId: context.sessionId,
      errorType: this.classifyError(context.errorMessage),
      actionName: context.actionName,
    });

    // Store error in history
    this.recordError(context);

    // Classify the error
    const errorType = this.classifyError(context.errorMessage);
    
    // Identify or update error patterns
    const errorPattern = await this.identifyPattern(context, errorType);
    
    // Generate recovery strategies
    const strategies = await this.generateRecoveryStrategies(context, errorPattern);

    // Determine if we should retry
    const shouldRetry = this.shouldAttemptRetry(context, strategies);

    // Estimate recovery time
    const estimatedRecoveryTime = this.estimateRecoveryTime(strategies);

    logger.info('Error analysis completed', {
      sessionId: context.sessionId,
      errorType,
      strategiesCount: strategies.length,
      shouldRetry,
      estimatedRecoveryTime,
    });

    return {
      errorPattern,
      recoveryStrategies: strategies, // TODO: Store in _recoveryStrategies map for lookup
      shouldRetry,
      estimatedRecoveryTime,
    };
  }

  /**
   * Learn from successful recovery
   */
  recordSuccessfulRecovery(
    originalError: ErrorContext,
    strategy: RecoveryStrategy,
    recoveryTime: number
  ): void {
    const errorType = this.classifyError(originalError.errorMessage);
    
    // Update pattern with successful strategy
    const pattern = this.errorPatterns.get(errorType);
    if (pattern) {
      // Add or update strategy in successful recoveries
      const existingStrategy = pattern.successfulRecoveries.find(s => s.name === strategy.name);
      if (existingStrategy) {
        existingStrategy.confidence = Math.min(existingStrategy.confidence + 0.1, 1.0);
        existingStrategy.estimatedSuccessRate = Math.min(existingStrategy.estimatedSuccessRate + 0.05, 1.0);
      } else {
        pattern.successfulRecoveries.push({
          ...strategy,
          confidence: Math.min(strategy.confidence + 0.2, 1.0),
          estimatedSuccessRate: 0.7, // Start with moderate success rate
        });
      }
    }

    logger.info('Recorded successful recovery', {
      errorType,
      strategy: strategy.name,
      recoveryTime,
    });
  }

  /**
   * Get performance insights
   */
  getPerformanceInsights(): {
    totalErrors: number;
    mostCommonErrors: Array<{
      type: string;
      frequency: number;
      averageRecoveryTime?: number;
    }>;
    recoverySuccessRate: number;
    topRecoveryStrategies: Array<{
      name: string;
      successRate: number;
      usageCount: number;
    }>;
  } {
    const totalErrors = Array.from(this.errorHistory.values())
      .reduce((sum, errors) => sum + errors.length, 0);

    const mostCommonErrors = Array.from(this.errorPatterns.entries())
      .sort((a, b) => b[1].frequency - a[1].frequency)
      .slice(0, 5)
      .map(([type, pattern]) => ({
        type,
        frequency: pattern.frequency,
        averageRecoveryTime: this.calculateAverageRecoveryTime(type),
      }));

    // Calculate overall recovery success rate
    const recoverySuccessRate = this.calculateOverallSuccessRate();

    // Get top recovery strategies
    const topRecoveryStrategies = this.getTopRecoveryStrategies();

    return {
      totalErrors,
      mostCommonErrors,
      recoverySuccessRate,
      topRecoveryStrategies,
    };
  }

  /**
   * Record error in history
   */
  private recordError(context: ErrorContext): void {
    const sessionErrors = this.errorHistory.get(context.sessionId) || [];
    sessionErrors.push(context);
    this.errorHistory.set(context.sessionId, sessionErrors);

    // Keep only last 50 errors per session
    if (sessionErrors.length > 50) {
      sessionErrors.splice(0, sessionErrors.length - 50);
    }
  }

  /**
   * Classify error type
   */
  private classifyError(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('connection')) {
      return 'network';
    }
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'permission';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'not_found';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    if (message.includes('rate limit') || message.includes('quota')) {
      return 'rate_limit';
    }
    if (message.includes('server error') || message.includes('500')) {
      return 'server_error';
    }

    return 'unknown';
  }

  /**
   * Identify or update error patterns
   */
  private async identifyPattern(context: ErrorContext, errorType: string): Promise<ErrorPattern | null> {
    let pattern = this.errorPatterns.get(errorType);

    if (!pattern) {
      pattern = {
        type: errorType,
        frequency: 1,
        commonCauses: [this.extractCause(context.errorMessage)],
        successfulRecoveries: [],
        lastOccurrence: context.timestamp,
      };
      this.errorPatterns.set(errorType, pattern);
    } else {
      pattern.frequency++;
      pattern.lastOccurrence = context.timestamp;
      
      // Update common causes
      const cause = this.extractCause(context.errorMessage);
      if (!pattern.commonCauses.includes(cause)) {
        pattern.commonCauses.push(cause);
      }
    }

    return pattern.frequency >= this.learningThreshold ? pattern : null;
  }

  /**
   * Generate recovery strategies based on context and patterns
   */
  private async generateRecoveryStrategies(
    context: ErrorContext,
    pattern: ErrorPattern | null
  ): Promise<RecoveryStrategy[]> {
    const strategies: RecoveryStrategy[] = [];
    const errorType = this.classifyError(context.errorMessage);

    // Add pattern-based strategies if available
    if (pattern && pattern.successfulRecoveries.length > 0) {
      strategies.push(...pattern.successfulRecoveries);
    }

    // Add generic strategies based on error type
    switch (errorType) {
      case 'timeout':
        strategies.push({
          name: 'retry_with_increased_timeout',
          description: 'Retry the action with increased timeout',
          confidence: 0.7,
          actions: [{
            type: 'retry',
            details: { timeout: 30000, retryCount: 1 },
          }],
          estimatedSuccessRate: 0.6,
        });
        break;

      case 'network':
        strategies.push({
          name: 'retry_after_delay',
          description: 'Wait and retry after network stabilizes',
          confidence: 0.6,
          actions: [{
            type: 'retry',
            details: { delay: 5000, retryCount: 2 },
          }],
          estimatedSuccessRate: 0.5,
        });
        break;

      case 'validation':
        strategies.push({
          name: 'parameter_correction',
          description: 'Ask user to correct invalid parameters',
          confidence: 0.8,
          actions: [{
            type: 'human_intervention',
            details: { 
              reason: 'Invalid parameters detected',
              suggestedCorrection: this.suggestParameterCorrection(context),
            },
          }],
          estimatedSuccessRate: 0.9,
        });
        break;

      case 'rate_limit':
        strategies.push({
          name: 'backoff_retry',
          description: 'Wait for rate limit reset',
          confidence: 0.9,
          actions: [{
            type: 'retry',
            details: { 
              delay: 60000, // Wait 1 minute
              retryCount: 1,
            },
          }],
          estimatedSuccessRate: 0.95,
        });
        break;

      default:
        strategies.push({
          name: 'fallback_response',
          description: 'Provide fallback response to user',
          confidence: 0.5,
          actions: [{
            type: 'fallback',
            details: {
              message: 'I encountered an unexpected error. Let me try a different approach.',
            },
          }],
          estimatedSuccessRate: 0.3,
        });
    }

    // Sort by confidence descending
    return strategies.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Determine if we should attempt retry
   */
  private shouldAttemptRetry(context: ErrorContext, strategies: RecoveryStrategy[]): boolean {
    // Don't retry if we've already tried too many times for this session
    const sessionErrors = this.errorHistory.get(context.sessionId) || [];
    const recentRetries = sessionErrors.filter(error => 
      Date.now() - error.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
    ).length;

    if (recentRetries >= 3) {
      return false;
    }

    // Check if we have high-confidence retry strategies
    const retryStrategies = strategies.filter(s => 
      s.actions.some(action => action.type === 'retry') && s.confidence > 0.6
    );

    return retryStrategies.length > 0;
  }

  /**
   * Estimate recovery time based on strategies
   */
  private estimateRecoveryTime(strategies: RecoveryStrategy[]): number {
    if (strategies.length === 0) {return 0;}

    const topStrategy = strategies[0];
    if (!topStrategy) {return 0;}
    
    const retryAction = topStrategy.actions.find(action => action.type === 'retry');
    
    if (retryAction) {
      const delay = retryAction.details['delay'] as number || 1000;
      const retryCount = retryAction.details['retryCount'] as number || 1;
      return delay * retryCount;
    }

    // Default estimation
    return 5000; // 5 seconds
  }

  /**
   * Extract probable cause from error message
   */
  private extractCause(errorMessage: string): string {
    const message = errorMessage.toLowerCase();
    
    if (message.includes('selector')) {return 'invalid_selector';}
    if (message.includes('parameter')) {return 'invalid_parameter';}
    if (message.includes('permission')) {return 'insufficient_permission';}
    if (message.includes('network')) {return 'network_issue';}
    if (message.includes('timeout')) {return 'request_timeout';}
    
    return 'unknown_cause';
  }

  /**
   * Suggest parameter correction
   */
  private suggestParameterCorrection(context: ErrorContext): string {
    if (!context.parameters) {return 'Please check your input parameters';}
    
    const params = Object.keys(context.parameters);
    return `Please verify the following parameters: ${params.join(', ')}`;
  }

  /**
   * Initialize common error patterns
   */
  private initializeCommonPatterns(): void {
    // Common patterns based on experience
    this.errorPatterns.set('timeout', {
      type: 'timeout',
      frequency: 0,
      commonCauses: ['request_timeout', 'server_overload'],
      successfulRecoveries: [],
      lastOccurrence: new Date(),
    });

    this.errorPatterns.set('network', {
      type: 'network',
      frequency: 0,
      commonCauses: ['connection_lost', 'dns_failure'],
      successfulRecoveries: [],
      lastOccurrence: new Date(),
    });
  }

  /**
   * Calculate average recovery time for error type
   */
  private calculateAverageRecoveryTime(errorType: string): number {
    // This would be calculated from actual recovery data
    // For now, return estimates
    const estimates: Record<string, number> = {
      'timeout': 10000,
      'network': 15000,
      'validation': 5000,
      'rate_limit': 60000,
    };

    return estimates[errorType] || 10000;
  }

  /**
   * Calculate overall success rate
   */
  private calculateOverallSuccessRate(): number {
    let totalAttempts = 0;
    let successfulAttempts = 0;

    for (const pattern of Array.from(this.errorPatterns.values())) {
      totalAttempts += pattern.frequency;
      successfulAttempts += pattern.successfulRecoveries.length;
    }

    return totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
  }

  /**
   * Get top recovery strategies
   */
  private getTopRecoveryStrategies(): Array<{
    name: string;
    successRate: number;
    usageCount: number;
  }> {
    const strategyStats: Map<string, { successRate: number; usageCount: number }> = new Map();

    for (const pattern of Array.from(this.errorPatterns.values())) {
      for (const strategy of pattern.successfulRecoveries) {
        const existing = strategyStats.get(strategy.name);
        if (existing) {
          existing.usageCount++;
          existing.successRate = (existing.successRate + strategy.estimatedSuccessRate) / 2;
        } else {
          strategyStats.set(strategy.name, {
            successRate: strategy.estimatedSuccessRate,
            usageCount: 1,
          });
        }
      }
    }

    return Array.from(strategyStats.entries())
      .sort((a, b) => b[1].successRate * b[1].usageCount - a[1].successRate * a[1].usageCount)
      .slice(0, 5)
      .map(([name, stats]) => ({ name, ...stats }));
  }

  /**
   * Clean up old error history
   */
  private cleanupOldHistory(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;

    for (const [sessionId, errors] of Array.from(this.errorHistory.entries())) {
      const recentErrors = errors.filter(error => error.timestamp > cutoffTime);
      
      if (recentErrors.length !== errors.length) {
        if (recentErrors.length === 0) {
          this.errorHistory.delete(sessionId);
        } else {
          this.errorHistory.set(sessionId, recentErrors);
        }
        cleanedCount += errors.length - recentErrors.length;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up old error history', { cleanedCount });
    }
  }
}

// Export singleton instance
export const errorRecoverySystem = new ErrorRecoverySystem();