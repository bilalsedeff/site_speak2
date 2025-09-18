/**
 * Error Recovery Orchestrator
 *
 * Main orchestrator for SiteSpeak's comprehensive error recovery and clarification system.
 * Integrates error classification, clarification, recovery strategies, UI presentation,
 * and learning to provide a seamless error handling experience.
 *
 * Features:
 * - Comprehensive error detection and classification (<50ms)
 * - Intelligent clarification generation (<200ms)
 * - Adaptive recovery strategy selection (<100ms)
 * - Modern error UI presentation (<100ms)
 * - Pattern learning and system improvement
 * - Universal website compatibility
 * - Voice-first error communication
 */

import {
  VoiceError,
  VoiceErrorCode,
  ErrorContext,
  ClarificationRequest,
  ClarificationResponse,
  RecoveryStrategy,
  ErrorRecoveryConfig,
  ErrorRecoveryCallbacks,
  ErrorRecoveryEvent,
  UserFeedback,
  DEFAULT_ERROR_RECOVERY_CONFIG
} from '@shared/types/error-recovery.types';

import { ErrorClassificationEngine } from './ErrorClassificationEngine';
import { ClarificationOrchestrator } from './ClarificationOrchestrator';
import { RecoveryStrategyManager } from './RecoveryStrategyManager';
import { ErrorUIOrchestrator } from './ErrorUIOrchestrator';
import { ErrorLearningService } from './ErrorLearningService';

interface ErrorRecoveryState {
  activeErrors: Map<string, VoiceError>;
  activeClarifications: Map<string, ClarificationRequest>;
  activeRecoveries: Map<string, RecoverySession>;
  systemHealth: SystemHealth;
  performanceMetrics: PerformanceMetrics;
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

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  errorRate: number;
  resolutionRate: number;
  averageResolutionTime: number;
  lastUpdated: Date;
}

interface PerformanceMetrics {
  errorDetectionTime: number;
  clarificationGenerationTime: number;
  recoverySelectionTime: number;
  uiTransitionTime: number;
  totalCycleTime: number;
}

export class ErrorRecoveryOrchestrator {
  private config: ErrorRecoveryConfig;
  private callbacks: ErrorRecoveryCallbacks;
  private state: ErrorRecoveryState;

  private classificationEngine: ErrorClassificationEngine;
  private clarificationOrchestrator: ClarificationOrchestrator;
  private recoveryManager: RecoveryStrategyManager;
  private uiOrchestrator: ErrorUIOrchestrator;
  private learningService: ErrorLearningService;

  private performanceTracker: PerformanceTracker;
  private eventBus: EventBus;

  constructor(
    config: Partial<ErrorRecoveryConfig> = {},
    callbacks: ErrorRecoveryCallbacks = {}
  ) {
    this.config = {
      ...DEFAULT_ERROR_RECOVERY_CONFIG,
      ...config
    };

    this.callbacks = callbacks;

    this.state = {
      activeErrors: new Map(),
      activeClarifications: new Map(),
      activeRecoveries: new Map(),
      systemHealth: {
        status: 'healthy',
        errorRate: 0,
        resolutionRate: 0,
        averageResolutionTime: 0,
        lastUpdated: new Date()
      },
      performanceMetrics: {
        errorDetectionTime: 0,
        clarificationGenerationTime: 0,
        recoverySelectionTime: 0,
        uiTransitionTime: 0,
        totalCycleTime: 0
      }
    };

    this.initializeServices();
    this.performanceTracker = new PerformanceTracker(this.config.performance);
    this.eventBus = new EventBus();

    this.setupEventListeners();
  }

  /**
   * Handle an error occurrence with comprehensive recovery
   */
  async handleError(
    error: Error | any,
    context: Partial<ErrorContext>,
    options: {
      autoRecover?: boolean;
      showUI?: boolean;
      announceVoice?: boolean;
      requestClarification?: boolean;
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
      // Step 1: Classify the error
      const classificationResult = await this.classificationEngine.classifyError(
        error,
        context
      );

      const voiceError = classificationResult.error;
      this.state.activeErrors.set(voiceError.id, voiceError);

      // Record error occurrence
      this.recordEvent('error_detected', { error: voiceError });
      this.callbacks.onErrorDetected?.(voiceError);

      // Learn from error occurrence
      if (this.config.learning.enabled) {
        await this.learningService.learnFromError(
          voiceError,
          context.userId,
          voiceError.context
        );
      }

      // Step 2: Determine if clarification is needed
      let clarificationRequested = false;
      if (voiceError.clarificationRequired && this.config.clarification.enabled) {
        const clarificationRequest = await this.requestClarification(voiceError, context);
        clarificationRequested = true;

        // Show clarification UI
        if (options.showUI !== false) {
          await this.uiOrchestrator.displayClarification(clarificationRequest);
        }

        const totalTime = performance.now() - startTime;
        this.performanceTracker.recordCycle(totalTime);

        return {
          success: true,
          errorId: voiceError.id,
          clarificationRequested: true
        };
      }

      // Step 3: Select and execute recovery strategy
      let recoveryStarted = false;
      let recovered = false;

      if (options.autoRecover !== false && this.config.recovery.enabled) {
        const recoveryResult = await this.executeRecovery(voiceError, context);
        recoveryStarted = true;
        recovered = recoveryResult.success;
      }

      // Step 4: Show error UI if needed
      if (options.showUI !== false && !recovered) {
        await this.uiOrchestrator.displayError(voiceError, {
          announceImmediately: options.announceVoice !== false,
          showRecoveryOptions: !recoveryStarted
        });
      }

      const totalTime = performance.now() - startTime;
      this.performanceTracker.recordCycle(totalTime);

      // Check performance target
      if (totalTime > this.config.performance.totalCycle) {
        console.warn(`Error recovery cycle took ${totalTime}ms (target: ${this.config.performance.totalCycle}ms)`);
      }

      return {
        success: true,
        errorId: voiceError.id,
        clarificationRequested,
        recoveryStarted,
        recovered
      };

    } catch (error) {
      console.error('Error recovery failed:', error);

      const totalTime = performance.now() - startTime;
      this.performanceTracker.recordCycle(totalTime);

      return {
        success: false,
        errorId: 'unknown',
        clarificationRequested: false,
        recoveryStarted: false,
        recovered: false
      };
    }
  }

  /**
   * Request clarification for an ambiguous error
   */
  async requestClarification(
    error: VoiceError,
    context: Partial<ErrorContext>
  ): Promise<ClarificationRequest> {
    const startTime = performance.now();

    try {
      const request = await this.clarificationOrchestrator.createClarificationRequest(
        error,
        context.sessionId || 'unknown',
        context
      );

      this.state.activeClarifications.set(request.id, request);

      this.recordEvent('clarification_requested', { clarification: request });
      this.callbacks.onClarificationRequested?.(request);

      const processingTime = performance.now() - startTime;
      this.performanceTracker.recordClarificationGeneration(processingTime);

      return request;

    } catch (error) {
      console.error('Failed to request clarification:', error);
      throw error;
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
    followUpRequest?: ClarificationRequest;
    recovery?: any;
  }> {
    try {
      const result = await this.clarificationOrchestrator.processClarificationResponse(
        requestId,
        response
      );

      const request = this.state.activeClarifications.get(requestId);
      if (request && this.config.learning.enabled) {
        await this.learningService.learnFromClarification(
          request,
          response,
          result.resolved
        );
      }

      if (result.resolved) {
        this.state.activeClarifications.delete(requestId);

        // If clarification resolved the issue, attempt recovery
        if (request) {
          const originalError = this.state.activeErrors.get(request.errorId);
          if (originalError) {
            const recoveryResult = await this.executeRecovery(originalError, {});
            return {
              resolved: true,
              recovery: recoveryResult
            };
          }
        }
      }

      return result;

    } catch (error) {
      console.error('Failed to process clarification response:', error);
      return { resolved: false };
    }
  }

  /**
   * Execute recovery strategy for an error
   */
  async executeRecovery(
    error: VoiceError,
    context: Partial<ErrorContext>
  ): Promise<{
    success: boolean;
    strategy?: RecoveryStrategy;
    result?: any;
    metrics?: any;
  }> {
    const startTime = performance.now();

    try {
      // Select recovery strategy
      const strategy = await this.recoveryManager.selectRecoveryStrategy(
        error,
        context.sessionId || 'unknown',
        context
      );

      const selectionTime = performance.now() - startTime;
      this.performanceTracker.recordRecoverySelection(selectionTime);

      // Create recovery session
      const session: RecoverySession = {
        id: this.generateSessionId(),
        errorId: error.id,
        strategy,
        startTime: new Date(),
        currentStep: 0,
        status: 'running',
        userInteraction: !strategy.automated
      };

      this.state.activeRecoveries.set(session.id, session);

      this.recordEvent('recovery_started', { recovery: strategy });
      this.callbacks.onRecoveryStarted?.(strategy);

      // Execute recovery strategy
      const executionResult = await this.recoveryManager.executeRecoveryStrategy(
        strategy,
        error,
        context.sessionId || 'unknown',
        (step, total, message) => {
          // Progress callback
          session.currentStep = step;
          this.uiOrchestrator.showRecoveryProgress(strategy, step, total, message);
        },
        async (message, options) => {
          // Confirmation callback
          return new Promise((resolve) => {
            // Would integrate with UI for user confirmation
            resolve('Yes');
          });
        }
      );

      session.status = executionResult.success ? 'completed' : 'failed';

      // Learn from recovery outcome
      if (this.config.learning.enabled) {
        await this.learningService.learnFromRecovery(
          error,
          strategy,
          {
            strategyId: strategy.id,
            success: executionResult.success,
            duration: Date.now() - session.startTime.getTime(),
            userSatisfaction: 0.8, // Would get from user feedback
            timestamp: new Date(),
            context: error.context
          }
        );
      }

      this.recordEvent('recovery_completed', { recovery: strategy });
      this.callbacks.onRecoveryCompleted?.(executionResult.success, executionResult.result);

      // Show success feedback
      if (executionResult.success) {
        await this.uiOrchestrator.showSuccessFeedback(
          'Issue resolved successfully!',
          3000
        );
      }

      // Clean up
      setTimeout(() => {
        this.state.activeRecoveries.delete(session.id);
      }, 5000);

      return {
        success: executionResult.success,
        strategy,
        result: executionResult.result,
        metrics: executionResult.metrics
      };

    } catch (error) {
      console.error('Recovery execution failed:', error);
      return { success: false };
    }
  }

  /**
   * Dismiss an error
   */
  async dismissError(
    errorId: string,
    reason: 'user_action' | 'auto_hide' | 'resolved' = 'user_action'
  ): Promise<void> {
    try {
      await this.uiOrchestrator.dismissError(errorId, reason);

      // Clean up related sessions
      this.state.activeErrors.delete(errorId);

      // Cancel related clarifications
      for (const [id, request] of this.state.activeClarifications) {
        if (request.errorId === errorId) {
          await this.clarificationOrchestrator.cancelClarification(id, reason);
          this.state.activeClarifications.delete(id);
        }
      }

      // Cancel related recoveries
      for (const [id, session] of this.state.activeRecoveries) {
        if (session.errorId === errorId) {
          await this.recoveryManager.cancelRecovery(id, reason);
          this.state.activeRecoveries.delete(id);
        }
      }

    } catch (error) {
      console.error('Failed to dismiss error:', error);
    }
  }

  /**
   * Provide user feedback for learning
   */
  async provideFeedback(
    errorId: string,
    feedback: UserFeedback
  ): Promise<void> {
    try {
      if (this.config.learning.enabled) {
        await this.learningService.learnFromUserFeedback(
          feedback,
          errorId,
          undefined, // recovery strategy would be tracked
          feedback.sessionId
        );
      }

      this.recordEvent('user_feedback', { feedback });
      this.callbacks.onUserFeedback?.(feedback);

    } catch (error) {
      console.error('Failed to process feedback:', error);
    }
  }

  /**
   * Get system status and metrics
   */
  getSystemStatus(): {
    health: SystemHealth;
    performance: PerformanceMetrics;
    activeErrors: number;
    activeClarifications: number;
    activeRecoveries: number;
  } {
    return {
      health: this.state.systemHealth,
      performance: this.state.performanceMetrics,
      activeErrors: this.state.activeErrors.size,
      activeClarifications: this.state.activeClarifications.size,
      activeRecoveries: this.state.activeRecoveries.size
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorRecoveryConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update individual services
    this.uiOrchestrator.updateConfig(this.config.ui);
    // Other services would be updated similarly
  }

  /**
   * Get learning insights and recommendations
   */
  getLearningInsights(): {
    patterns: any[];
    recommendations: any[];
    metrics: any;
  } {
    if (!this.config.learning.enabled) {
      return { patterns: [], recommendations: [], metrics: {} };
    }

    return {
      patterns: this.learningService.getErrorPatterns(),
      recommendations: this.learningService.getSystemRecommendations(),
      metrics: this.learningService.getLearningMetrics()
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      // Cancel all active sessions
      for (const errorId of this.state.activeErrors.keys()) {
        await this.dismissError(errorId, 'user_action');
      }

      // Clear state
      this.state.activeErrors.clear();
      this.state.activeClarifications.clear();
      this.state.activeRecoveries.clear();

    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // ================= PRIVATE METHODS =================

  private initializeServices(): void {
    // Initialize classification engine
    this.classificationEngine = new ErrorClassificationEngine({
      multiTypeDetection: this.config.classification.multiTypeDetection,
      contextAnalysis: this.config.classification.contextAnalysis,
      patternRecognition: this.config.classification.patternRecognition,
      confidenceThreshold: this.config.classification.confidenceThreshold,
      maxAnalysisTime: this.config.performance.errorDetection
    });

    // Initialize clarification orchestrator
    this.clarificationOrchestrator = new ClarificationOrchestrator({
      intelligentQuestions: this.config.clarification.intelligentQuestions,
      multiModal: this.config.clarification.multiModal,
      progressive: this.config.clarification.progressive,
      learningEnabled: this.config.clarification.learningEnabled,
      maxAttempts: this.config.clarification.maxAttempts,
      timeout: this.config.clarification.timeout
    });

    // Initialize recovery manager
    this.recoveryManager = new RecoveryStrategyManager({
      adaptiveStrategies: this.config.recovery.adaptiveStrategies,
      fallbackChaining: this.config.recovery.fallbackChaining,
      userEducation: this.config.recovery.userEducation,
      successOptimization: this.config.recovery.successOptimization,
      maxRetries: this.config.recovery.maxRetries
    });

    // Initialize UI orchestrator
    this.uiOrchestrator = new ErrorUIOrchestrator(
      {
        voiceFirst: this.config.ui.voiceFirst,
        accessibility: this.config.ui.accessibility,
        animations: this.config.ui.animations,
        compactMode: this.config.ui.compactMode,
        theme: this.config.ui.theme
      },
      {
        onErrorSeen: (errorId) => {
          // Handle error seen event
        },
        onClarificationResponse: (response) => {
          this.processClarificationResponse(response.requestId, response);
        },
        onRecoverySelected: (strategyId) => {
          // Handle recovery selection
        },
        onUserFeedback: (feedback) => {
          this.provideFeedback(feedback.errorId, feedback);
        },
        onDismiss: (errorId, reason) => {
          this.dismissError(errorId, reason);
        }
      }
    );

    // Initialize learning service
    this.learningService = new ErrorLearningService({
      patternRecognition: this.config.learning.patternRecognition,
      userSpecific: this.config.learning.userSpecific,
      proactivePreventions: this.config.learning.proactivePreventions,
      performanceOptimization: this.config.learning.performanceOptimization
    });
  }

  private setupEventListeners(): void {
    // Set up event listeners for cross-service communication
    this.eventBus.on('error_detected', (_data: unknown) => {
      this.updateSystemHealth();
    });

    this.eventBus.on('recovery_completed', (_data: unknown) => {
      this.updateSystemHealth();
    });
  }

  private recordEvent(type: ErrorRecoveryEvent['type'], data: any): void {
    const event: ErrorRecoveryEvent = {
      type,
      timestamp: new Date(),
      ...data
    };

    this.eventBus.emit(type, data);
  }

  private updateSystemHealth(): void {
    // Update system health metrics
    const now = new Date();

    // Calculate error rate (errors per minute)
    const recentErrors = Array.from(this.state.activeErrors.values())
      .filter(error => now.getTime() - error.timestamp.getTime() < 60000);

    this.state.systemHealth = {
      status: recentErrors.length > 10 ? 'critical' : recentErrors.length > 5 ? 'degraded' : 'healthy',
      errorRate: recentErrors.length,
      resolutionRate: 0.85, // Would calculate from actual resolution data
      averageResolutionTime: 3000, // Would calculate from actual resolution times
      lastUpdated: now
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Helper classes
class PerformanceTracker {
  private metrics: {
    errorDetection: number[];
    clarificationGeneration: number[];
    recoverySelection: number[];
    uiTransition: number[];
    totalCycle: number[];
  };

  constructor(private targets: ErrorRecoveryConfig['performance']) {
    this.metrics = {
      errorDetection: [],
      clarificationGeneration: [],
      recoverySelection: [],
      uiTransition: [],
      totalCycle: []
    };
  }

  recordErrorDetection(time: number): void {
    this.metrics.errorDetection.push(time);
    this.checkTarget('errorDetection', time, this.targets.errorDetection);
  }

  recordClarificationGeneration(time: number): void {
    this.metrics.clarificationGeneration.push(time);
    this.checkTarget('clarificationGeneration', time, this.targets.clarificationGeneration);
  }

  recordRecoverySelection(time: number): void {
    this.metrics.recoverySelection.push(time);
    this.checkTarget('recoverySelection', time, this.targets.recoverySelection);
  }

  recordUITransition(time: number): void {
    this.metrics.uiTransition.push(time);
    this.checkTarget('uiTransition', time, this.targets.uiTransition);
  }

  recordCycle(time: number): void {
    this.metrics.totalCycle.push(time);
    this.checkTarget('totalCycle', time, this.targets.totalCycle);
  }

  private checkTarget(metric: string, actual: number, target: number): void {
    if (actual > target) {
      console.warn(`${metric} exceeded target: ${actual}ms > ${target}ms`);
    }
  }

  getMetrics(): PerformanceMetrics {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b) / arr.length : 0;

    return {
      errorDetectionTime: avg(this.metrics.errorDetection),
      clarificationGenerationTime: avg(this.metrics.clarificationGeneration),
      recoverySelectionTime: avg(this.metrics.recoverySelection),
      uiTransitionTime: avg(this.metrics.uiTransition),
      totalCycleTime: avg(this.metrics.totalCycle)
    };
  }
}

class EventBus {
  private listeners = new Map<string, Function[]>();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Event listener error for ${event}:`, error);
        }
      });
    }
  }

  off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
}

// Factory function
export function createErrorRecoveryOrchestrator(
  config?: Partial<ErrorRecoveryConfig>,
  callbacks?: ErrorRecoveryCallbacks
): ErrorRecoveryOrchestrator {
  return new ErrorRecoveryOrchestrator(config, callbacks);
}

export default ErrorRecoveryOrchestrator;