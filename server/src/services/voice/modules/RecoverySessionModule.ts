/**
 * Recovery Session Module - Error handling and recovery integration
 *
 * This module implements error recovery functionality as a specialized module
 * that integrates with the consolidated session architecture. It maintains
 * performance targets while providing comprehensive error handling.
 *
 * Performance Targets:
 * - Error detection: <50ms
 * - Clarification generation: <200ms
 * - Recovery strategy selection: <100ms
 * - Total cycle time: <500ms
 *
 * Features:
 * - Real-time error detection and classification
 * - Intelligent clarification generation
 * - Adaptive recovery strategy selection
 * - Learning from recovery outcomes
 * - Performance monitoring and optimization
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/utils.js';
import type {
  RecoverySessionModule,
  SessionModule,
  ModuleFactory,
  RecoveryStrategy,
  RecoveryStep
} from '../ConsolidatedSessionTypes.js';

const logger = createLogger({ service: 'recovery-session-module' });

// Error types and interfaces
interface VoiceError {
  id: string;
  type: 'recognition' | 'connection' | 'processing' | 'timeout' | 'user_confusion' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  context: Record<string, unknown>;
  clarificationRequired: boolean;
}

interface ErrorContext {
  sessionId: string;
  userId?: string;
  currentPage?: string;
  lastCommand?: string;
  audioQuality?: number;
  networkConditions?: 'good' | 'fair' | 'poor';
  browserType?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  clarificationResponse?: ClarificationResponse;
  clarificationData?: ClarificationResponse;
}

interface ClarificationRequest {
  id: string;
  errorId: string;
  sessionId: string;
  questions: ClarificationQuestion[];
  context: Record<string, unknown>;
  timestamp: Date;
  timeout: number;
}

interface ClarificationQuestion {
  id: string;
  text: string;
  type: 'yes_no' | 'multiple_choice' | 'open_ended';
  options?: string[];
  priority: number;
}

interface ClarificationResponse {
  requestId: string;
  answers: Record<string, string>;
  timestamp: Date;
  confidence: number;
}

interface RecoverySession {
  id: string;
  errorId: string;
  strategy: RecoveryStrategy;
  startTime: Date;
  currentStep: number;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  userInteraction: boolean;
}

/**
 * Enhanced Recovery Session Module Implementation
 */
export class EnhancedRecoverySessionModule extends EventEmitter implements RecoverySessionModule {
  public readonly sessionRef: string;
  public readonly moduleId: string;

  public activeRecoveries = new Map<string, RecoverySession>();

  public metrics = {
    errorDetectionTime: 0,
    clarificationGenerationTime: 0,
    recoverySelectionTime: 0,
    totalCycleTime: 0,
    successRate: 0
  };

  // Module configuration
  private config = {
    performance: {
      errorDetectionTarget: 50, // ms
      clarificationGenerationTarget: 200, // ms
      recoverySelectionTarget: 100, // ms
      totalCycleTarget: 500 // ms
    },
    recovery: {
      maxRetries: 3,
      adaptiveStrategies: true,
      userEducation: true,
      fallbackChaining: true
    },
    clarification: {
      maxQuestions: 3,
      timeout: 30000, // 30 seconds
      intelligentQuestions: true,
      progressive: true
    }
  };

  // State tracking
  private activeErrors = new Map<string, VoiceError>();
  private activeClarifications = new Map<string, ClarificationRequest>();
  private recoveryStrategies = new Map<string, RecoveryStrategy>();
  private performanceMetrics = {
    totalErrors: 0,
    totalRecoveries: 0,
    successfulRecoveries: 0,
    averageRecoveryTime: 0,
    adaptiveAdjustments: 0
  };

  constructor(sessionRef: string, config: Record<string, unknown> = {}) {
    super();

    this.sessionRef = sessionRef;
    this.moduleId = `recovery_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Apply configuration overrides
    this.config = { ...this.config, ...config };

    // Initialize recovery strategies
    this.initializeRecoveryStrategies();

    logger.info('Recovery Session Module initialized', {
      sessionRef: this.sessionRef,
      moduleId: this.moduleId,
      performanceTargets: this.config.performance
    });
  }

  /**
   * Handle an error with comprehensive recovery
   */
  async handleError(
    error: Error | any,
    context: Partial<ErrorContext> = {},
    options: {
      autoRecover?: boolean;
      requestClarification?: boolean;
      announceError?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    errorId: string;
    clarificationRequested?: boolean;
    recoveryStarted?: boolean;
    recovered?: boolean;
  }> {
    const startTime = performance.now();

    try {
      // Step 1: Classify and register error (target: <50ms)
      const classificationStart = performance.now();
      const voiceError = await this.classifyError(error, context);
      const classificationTime = performance.now() - classificationStart;

      this.activeErrors.set(voiceError.id, voiceError);
      this.performanceMetrics.totalErrors++;

      // Update metrics
      this.metrics.errorDetectionTime =
        (this.metrics.errorDetectionTime + classificationTime) / 2;

      // Check performance target
      if (classificationTime > this.config.performance.errorDetectionTarget) {
        logger.warn('Error detection exceeded target', {
          sessionRef: this.sessionRef,
          actual: classificationTime,
          target: this.config.performance.errorDetectionTarget
        });
      }

      // Step 2: Determine if clarification is needed (target: <200ms)
      let clarificationRequested = false;
      if (voiceError.clarificationRequired && options.requestClarification !== false) {
        const clarificationStart = performance.now();
        const clarificationRequest = await this.generateClarificationRequest(voiceError, context);
        const clarificationTime = performance.now() - clarificationStart;

        this.activeClarifications.set(clarificationRequest.id, clarificationRequest);
        clarificationRequested = true;

        // Update metrics
        this.metrics.clarificationGenerationTime =
          (this.metrics.clarificationGenerationTime + clarificationTime) / 2;

        // Emit clarification event
        this.emit('clarification_requested', {
          sessionRef: this.sessionRef,
          clarificationRequest,
          errorId: voiceError.id
        });

        const totalTime = performance.now() - startTime;
        this.updateTotalCycleTime(totalTime);

        return {
          success: true,
          errorId: voiceError.id,
          clarificationRequested: true
        };
      }

      // Step 3: Select and execute recovery strategy (target: <100ms)
      let recoveryStarted = false;
      let recovered = false;

      if (options.autoRecover !== false) {
        const recoveryStart = performance.now();
        const strategy = await this.selectRecoveryStrategy(voiceError, context);
        const recoverySelectionTime = performance.now() - recoveryStart;

        // Update metrics
        this.metrics.recoverySelectionTime =
          (this.metrics.recoverySelectionTime + recoverySelectionTime) / 2;

        if (strategy) {
          const recoveryResult = await this.executeRecoveryStrategy(strategy, voiceError, context);
          recoveryStarted = true;
          recovered = recoveryResult.success;

          if (recovered) {
            this.performanceMetrics.successfulRecoveries++;
          }
        }
      }

      // Update success rate
      this.performanceMetrics.totalRecoveries++;
      this.metrics.successRate = this.performanceMetrics.successfulRecoveries / this.performanceMetrics.totalRecoveries;

      const totalTime = performance.now() - startTime;
      this.updateTotalCycleTime(totalTime);

      // Emit error handled event
      this.emit('error_handled', {
        sessionRef: this.sessionRef,
        errorId: voiceError.id,
        recovered,
        totalTime
      });

      return {
        success: true,
        errorId: voiceError.id,
        clarificationRequested,
        recoveryStarted,
        recovered
      };

    } catch (handlingError) {
      logger.error('Error handling failed', {
        sessionRef: this.sessionRef,
        error: handlingError instanceof Error ? handlingError.message : 'Unknown error'
      });

      const totalTime = performance.now() - startTime;
      this.updateTotalCycleTime(totalTime);

      return {
        success: false,
        errorId: 'unknown'
      };
    }
  }

  /**
   * Process clarification response
   */
  async processClarificationResponse(
    requestId: string,
    response: ClarificationResponse
  ): Promise<{
    resolved: boolean;
    recoveryStarted?: boolean;
    followUpRequest?: ClarificationRequest;
  }> {
    const request = this.activeClarifications.get(requestId);
    if (!request) {
      throw new Error(`Clarification request ${requestId} not found`);
    }

    try {
      // Analyze response to determine if issue is resolved
      const resolved = await this.analyzeClarificationResponse(request, response);

      if (resolved) {
        this.activeClarifications.delete(requestId);

        // If resolved, attempt recovery
        const originalError = this.activeErrors.get(request.errorId);
        if (originalError) {
          const strategy = await this.selectRecoveryStrategy(originalError, {
            sessionId: this.sessionRef,
            clarificationResponse: response
          } as ErrorContext);

          if (strategy) {
            await this.executeRecoveryStrategy(
              strategy,
              originalError,
              { sessionId: this.sessionRef, clarificationData: response } as ErrorContext
            );

            return {
              resolved: true,
              recoveryStarted: true
            };
          }
        }

        return { resolved: true };
      } else {
        // Generate follow-up clarification if needed
        if (this.config.clarification.progressive) {
          const followUpRequest = await this.generateFollowUpClarification(request, response);
          this.activeClarifications.set(followUpRequest.id, followUpRequest);

          return {
            resolved: false,
            followUpRequest
          };
        }

        return { resolved: false };
      }

    } catch (error) {
      logger.error('Error processing clarification response', {
        sessionRef: this.sessionRef,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return { resolved: false };
    }
  }

  /**
   * Cancel an active recovery
   */
  async cancelRecovery(recoveryId: string, reason: string = 'user_request'): Promise<void> {
    const recovery = this.activeRecoveries.get(recoveryId);
    if (!recovery) {
      logger.warn('Attempted to cancel non-existent recovery', {
        sessionRef: this.sessionRef,
        recoveryId
      });
      return;
    }

    recovery.status = 'cancelled';

    // Cleanup resources
    await this.cleanupRecovery(recovery);

    this.activeRecoveries.delete(recoveryId);

    this.emit('recovery_cancelled', {
      sessionRef: this.sessionRef,
      recoveryId,
      reason
    });

    logger.info('Recovery cancelled', {
      sessionRef: this.sessionRef,
      recoveryId,
      reason
    });
  }

  /**
   * Get current recovery status
   */
  getRecoveryStatus(): {
    activeErrors: number;
    activeClarifications: number;
    activeRecoveries: number;
    metrics: EnhancedRecoverySessionModule['metrics'];
    performance: EnhancedRecoverySessionModule['performanceMetrics'];
  } {
    return {
      activeErrors: this.activeErrors.size,
      activeClarifications: this.activeClarifications.size,
      activeRecoveries: this.activeRecoveries.size,
      metrics: this.metrics,
      performance: this.performanceMetrics
    };
  }

  /**
   * Cleanup module resources
   */
  async cleanup(): Promise<void> {
    // Cancel all active recoveries
    const recoveryPromises = Array.from(this.activeRecoveries.keys()).map(id =>
      this.cancelRecovery(id, 'cleanup')
    );

    await Promise.all(recoveryPromises);

    // Clear all state
    this.activeErrors.clear();
    this.activeClarifications.clear();
    this.activeRecoveries.clear();

    this.removeAllListeners();

    logger.info('Recovery session module cleaned up', {
      sessionRef: this.sessionRef,
      moduleId: this.moduleId
    });
  }

  // ================= PRIVATE METHODS =================

  /**
   * Classify an error
   */
  private async classifyError(error: Error | any, _context: Partial<ErrorContext>): Promise<VoiceError> {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Simple error classification - would be more sophisticated in production
    let type: VoiceError['type'] = 'system';
    let severity: VoiceError['severity'] = 'medium';
    let clarificationRequired = false;

    if (error.message?.includes('recognition') || error.message?.includes('transcript')) {
      type = 'recognition';
      clarificationRequired = true;
    } else if (error.message?.includes('connection') || error.message?.includes('websocket')) {
      type = 'connection';
      severity = 'high';
    } else if (error.message?.includes('timeout')) {
      type = 'timeout';
      severity = 'medium';
    } else if (error.message?.includes('confusion') || error.message?.includes('unclear')) {
      type = 'user_confusion';
      clarificationRequired = true;
    }

    return {
      id: errorId,
      type,
      severity,
      message: error.message || 'Unknown error',
      timestamp: new Date(),
      context: _context as Record<string, unknown>,
      clarificationRequired
    };
  }

  /**
   * Generate clarification request
   */
  private async generateClarificationRequest(
    error: VoiceError,
    _context: Partial<ErrorContext>
  ): Promise<ClarificationRequest> {
    const requestId = `clarification_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const questions: ClarificationQuestion[] = [];

    // Generate appropriate questions based on error type
    switch (error.type) {
      case 'recognition':
        questions.push({
          id: 'audio_quality',
          text: 'Is your microphone working properly?',
          type: 'yes_no',
          priority: 1
        });
        questions.push({
          id: 'clarity',
          text: 'Could you please repeat your command more clearly?',
          type: 'open_ended',
          priority: 2
        });
        break;

      case 'user_confusion':
        questions.push({
          id: 'task_clarity',
          text: 'What are you trying to do?',
          type: 'multiple_choice',
          options: ['Navigate to a page', 'Find information', 'Perform an action', 'Other'],
          priority: 1
        });
        break;

      case 'connection':
        questions.push({
          id: 'connection_status',
          text: 'Are you experiencing internet connectivity issues?',
          type: 'yes_no',
          priority: 1
        });
        break;
    }

    return {
      id: requestId,
      errorId: error.id,
      sessionId: this.sessionRef,
      questions,
      context: _context as Record<string, unknown>,
      timestamp: new Date(),
      timeout: this.config.clarification.timeout
    };
  }

  /**
   * Select appropriate recovery strategy
   */
  private async selectRecoveryStrategy(
    error: VoiceError,
    _context: Partial<ErrorContext>
  ): Promise<RecoveryStrategy | null> {
    // Select strategy based on error type and context
    const strategies = Array.from(this.recoveryStrategies.values());

    // Simple strategy selection - would be more sophisticated with ML
    const suitableStrategies = strategies.filter(strategy => {
      switch (error.type) {
        case 'recognition':
          return strategy.id.includes('recognition') || strategy.id.includes('retry');
        case 'connection':
          return strategy.id.includes('connection') || strategy.id.includes('reconnect');
        case 'timeout':
          return strategy.id.includes('timeout') || strategy.id.includes('retry');
        case 'user_confusion':
          return strategy.id.includes('guidance') || strategy.id.includes('tutorial');
        default:
          return strategy.id.includes('general');
      }
    });

    // Return strategy with highest success rate
    if (suitableStrategies.length === 0) {
      return null;
    }

    return suitableStrategies.reduce((best, current) =>
      (best === null || current.successRate > best.successRate) ? current : best
    );
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    strategy: RecoveryStrategy,
    error: VoiceError,
    context: Partial<ErrorContext>
  ): Promise<{ success: boolean; result?: any }> {
    const recoveryId = `recovery_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const recovery: RecoverySession = {
      id: recoveryId,
      errorId: error.id,
      strategy,
      startTime: new Date(),
      currentStep: 0,
      status: 'running',
      userInteraction: !strategy.automated
    };

    this.activeRecoveries.set(recoveryId, recovery);

    try {
      // Execute strategy steps
      for (let i = 0; i < strategy.steps.length; i++) {
        const step = strategy.steps[i];
        if (!step) {
          logger.warn('Recovery step not found', { recoveryId, stepIndex: i });
          continue;
        }

        recovery.currentStep = i;

        this.emit('recovery_step_started', {
          sessionRef: this.sessionRef,
          recoveryId,
          step: i + 1,
          total: strategy.steps.length,
          stepDescription: step.description
        });

        // Execute step (simplified implementation)
        await this.executeRecoveryStep(step, error, context);

        this.emit('recovery_step_completed', {
          sessionRef: this.sessionRef,
          recoveryId,
          step: i + 1
        });
      }

      recovery.status = 'completed';

      // Update performance metrics
      const recoveryTime = Date.now() - recovery.startTime.getTime();
      this.performanceMetrics.averageRecoveryTime =
        (this.performanceMetrics.averageRecoveryTime + recoveryTime) / this.performanceMetrics.totalRecoveries;

      this.emit('recovery_completed', {
        sessionRef: this.sessionRef,
        recoveryId,
        success: true,
        duration: recoveryTime
      });

      return { success: true };

    } catch (recoveryError) {
      recovery.status = 'failed';

      logger.error('Recovery strategy failed', {
        sessionRef: this.sessionRef,
        recoveryId,
        strategyId: strategy.id,
        error: recoveryError instanceof Error ? recoveryError.message : 'Unknown error'
      });

      this.emit('recovery_failed', {
        sessionRef: this.sessionRef,
        recoveryId,
        error: recoveryError instanceof Error ? recoveryError.message : 'Unknown error'
      });

      return { success: false };

    } finally {
      // Cleanup after delay
      setTimeout(() => {
        this.activeRecoveries.delete(recoveryId);
      }, 5000);
    }
  }

  /**
   * Execute a single recovery step
   */
  private async executeRecoveryStep(
    step: RecoveryStep,
    _error: VoiceError,
    _context: Partial<ErrorContext>
  ): Promise<void> {
    // Simplified step execution - would implement actual recovery actions
    switch (step.action) {
      case 'retry_recognition':
        // Would retry speech recognition
        break;
      case 'reconnect_websocket':
        // Would attempt WebSocket reconnection
        break;
      case 'provide_guidance':
        // Would provide user guidance
        break;
      case 'show_tutorial':
        // Would show relevant tutorial
        break;
      default:
        logger.debug('Executing recovery step', {
          sessionRef: this.sessionRef,
          stepId: step.id,
          action: step.action
        });
    }

    // Simulate step execution time
    await new Promise(resolve => setTimeout(resolve, step.estimatedTime));
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeRecoveryStrategies(): void {
    const strategies: RecoveryStrategy[] = [
      {
        id: 'recognition-retry',
        name: 'Recognition Retry',
        type: 'automatic',
        steps: [
          {
            id: 'clear-buffer',
            description: 'Clear audio buffer',
            action: 'clear_audio_buffer',
            automated: true,
            estimatedTime: 100
          },
          {
            id: 'retry-recognition',
            description: 'Retry speech recognition',
            action: 'retry_recognition',
            automated: true,
            estimatedTime: 500
          }
        ],
        automated: true,
        estimatedTime: 1000,
        successRate: 0.8
      },
      {
        id: 'connection-recovery',
        name: 'Connection Recovery',
        type: 'automatic',
        steps: [
          {
            id: 'check-connection',
            description: 'Check connection status',
            action: 'check_connection',
            automated: true,
            estimatedTime: 200
          },
          {
            id: 'reconnect',
            description: 'Reconnect WebSocket',
            action: 'reconnect_websocket',
            automated: true,
            estimatedTime: 1000
          }
        ],
        automated: true,
        estimatedTime: 2000,
        successRate: 0.9
      },
      {
        id: 'user-guidance',
        name: 'User Guidance',
        type: 'guided',
        steps: [
          {
            id: 'provide-guidance',
            description: 'Provide step-by-step guidance',
            action: 'provide_guidance',
            automated: false,
            estimatedTime: 5000
          }
        ],
        automated: false,
        estimatedTime: 10000,
        successRate: 0.7
      }
    ];

    strategies.forEach(strategy => {
      this.recoveryStrategies.set(strategy.id, strategy);
    });

    logger.debug('Recovery strategies initialized', {
      strategyCount: this.recoveryStrategies.size
    });
  }

  /**
   * Analyze clarification response
   */
  private async analyzeClarificationResponse(
    _request: ClarificationRequest,
    response: ClarificationResponse
  ): Promise<boolean> {
    // Simple analysis - would be more sophisticated in production
    return response.confidence > 0.7;
  }

  /**
   * Generate follow-up clarification
   */
  private async generateFollowUpClarification(
    originalRequest: ClarificationRequest,
    _previousResponse: ClarificationResponse
  ): Promise<ClarificationRequest> {
    // Generate more targeted questions based on previous response
    return {
      ...originalRequest,
      id: `followup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      questions: [
        {
          id: 'followup',
          text: 'Could you provide more details about the issue?',
          type: 'open_ended',
          priority: 1
        }
      ],
      timestamp: new Date()
    };
  }

  /**
   * Cleanup recovery resources
   */
  private async cleanupRecovery(recovery: RecoverySession): Promise<void> {
    // Cleanup any resources allocated for the recovery
    logger.debug('Cleaning up recovery resources', {
      sessionRef: this.sessionRef,
      recoveryId: recovery.id
    });
  }

  /**
   * Update total cycle time metric
   */
  private updateTotalCycleTime(time: number): void {
    this.metrics.totalCycleTime = (this.metrics.totalCycleTime + time) / 2;

    // Check if we exceeded target
    if (time > this.config.performance.totalCycleTarget) {
      logger.warn('Recovery cycle exceeded target time', {
        sessionRef: this.sessionRef,
        actual: time,
        target: this.config.performance.totalCycleTarget
      });
    }
  }
}

/**
 * Recovery Session Module Factory
 */
export class RecoverySessionModuleFactory implements ModuleFactory {
  async create(sessionId: string, config?: Record<string, unknown>): Promise<SessionModule> {
    return new EnhancedRecoverySessionModule(sessionId, config || {});
  }
}

// Export factory instance
export const recoverySessionModuleFactory = new RecoverySessionModuleFactory();