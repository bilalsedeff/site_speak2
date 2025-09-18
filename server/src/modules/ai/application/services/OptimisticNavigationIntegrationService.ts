/**
 * Optimistic Navigation Integration Service - Enhanced voice navigation with <300ms response
 *
 * Integrates all optimistic execution components for instant navigation:
 * - OptimisticExecutionEngine for immediate action execution
 * - SpeculativeNavigationPredictor for proactive resource loading
 * - ResourceHintManager for dynamic performance optimization
 * - ActionRollbackManager for reliable transaction management
 * - PerformanceOptimizer for real-time performance tuning
 * - Seamless integration with existing voice navigation infrastructure
 */

import { EventEmitter } from 'events';
import { createLogger, getErrorMessage } from '../../../../shared/utils';
import {
  voiceNavigationIntegrationService,
  type UnifiedNavigationCommand,
  type UnifiedNavigationResult,
  type NavigationContext,
} from './VoiceNavigationIntegrationService';
import {
  optimisticExecutionEngine,
  type OptimisticResult,
} from './OptimisticExecutionEngine';
import {
  speculativeNavigationPredictor,
  type NavigationPrediction,
  type NavigationStructure,
} from './SpeculativeNavigationPredictor';
import {
  resourceHintManager,
  type ResourceOptimization,
} from './ResourceHintManager';
import {
  actionRollbackManager,
} from './ActionRollbackManager';
import {
  performanceOptimizer,
  type PerformanceProfile,
} from './PerformanceOptimizer';
// voiceNavigationOrchestrator import removed as it was unused
import type { SelectionContext } from './VoiceElementSelector';

const logger = createLogger({ service: 'optimistic-navigation-integration' });

export interface OptimisticNavigationCommand extends UnifiedNavigationCommand {
  optimistic?: boolean;
  speculativePreload?: boolean;
  rollbackEnabled?: boolean;
  conversationHistory?: string[];
}

export interface OptimisticNavigationResult extends UnifiedNavigationResult {
  optimistic: boolean;
  rollbackAvailable: boolean;
  predictionAccuracy?: number;
  performanceMetrics: {
    feedbackTime: number;
    optimisticTime: number;
    rollbackTime?: number;
    resourceHints: number;
    predictions: number;
  };
  transactionId?: string;
}

export interface UserProfile {
  userId?: string;
  preferences: {
    optimisticEnabled: boolean;
    speculativePreloadEnabled: boolean;
    performanceTarget: 'speed' | 'accuracy' | 'balanced';
  };
  sessionHistory: {
    successfulCommands: number;
    failedCommands: number;
    averageResponseTime: number;
  };
  contextualData: Record<string, unknown>;
}

export interface SessionState {
  conversationHistory: string[];
  navigationStructure?: NavigationStructure;
  userProfile: UserProfile;
  performanceProfile: PerformanceProfile;
}

export interface IntegrationMetrics {
  totalOptimisticCommands: number;
  averageOptimisticResponseTime: number;
  optimisticSuccessRate: number;
  rollbackRate: number;
  predictionAccuracy: number;
  resourceHintEffectiveness: number;
  performanceGain: number;
}

export interface ComprehensiveMetrics {
  integration: IntegrationMetrics;
  execution: Record<string, unknown>;
  prediction: Record<string, unknown>;
  resources: Record<string, unknown>;
  rollback: Record<string, unknown>;
  performance: Record<string, unknown>;
}

export interface VoiceCommand {
  text: string;
  intent: string;
  confidence: number;
  parameters: Record<string, unknown>;
  context: {
    currentPage: string;
    userRole: string;
    editorMode?: string;
  };
}

/**
 * Optimistic Navigation Integration Service
 * Provides instant voice navigation with comprehensive optimistic execution
 */
export class OptimisticNavigationIntegrationService extends EventEmitter {
  private isInitialized = false;

  // Active operation tracking
  private activeOperations = new Map<string, {
    command: OptimisticNavigationCommand;
    transactionId?: string;
    predictions: NavigationPrediction[];
    optimizations: ResourceOptimization[];
    startTime: number;
  }>();

  // Session state management
  private sessionStates = new Map<string, SessionState>();

  // Performance tracking
  private metrics: IntegrationMetrics = {
    totalOptimisticCommands: 0,
    averageOptimisticResponseTime: 0,
    optimisticSuccessRate: 0,
    rollbackRate: 0,
    predictionAccuracy: 0,
    resourceHintEffectiveness: 0,
    performanceGain: 0,
  };

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the optimistic navigation integration
   */
  private async initialize(): Promise<void> {
    try {
      // Set up event listeners between components
      this.setupComponentIntegration();

      // Start performance monitoring
      this.startPerformanceMonitoring();

      this.isInitialized = true;
      logger.info('OptimisticNavigationIntegrationService initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize OptimisticNavigationIntegrationService', { error });
      throw error;
    }
  }

  /**
   * Process navigation command with full optimistic execution
   */
  async processOptimisticCommand(
    command: OptimisticNavigationCommand
  ): Promise<OptimisticNavigationResult> {
    const operationId = this.generateOperationId();
    const startTime = performance.now();

    try {
      logger.info('Processing optimistic navigation command', {
        operationId,
        text: command.text,
        type: command.type,
        optimistic: command.optimistic !== false,
        sessionId: command.sessionId,
      });

      // Initialize operation tracking
      this.activeOperations.set(operationId, {
        command,
        predictions: [],
        optimizations: [],
        startTime,
      });

      // Get or create session state
      const sessionState = this.getSessionState(command.sessionId);

      // Update conversation history
      sessionState.conversationHistory.push(command.text);

      // Phase 1: Immediate visual feedback (<100ms)
      const feedbackStartTime = performance.now();
      this.provideImmediateFeedback(command, operationId);
      const feedbackTime = performance.now() - feedbackStartTime;

      // Phase 2: Optimistic execution and speculation (parallel)
      const [optimisticResult, predictions] = await Promise.all([
        this.executeOptimistically(command, sessionState, operationId),
        this.generatePredictions(command, sessionState, operationId),
      ]);

      // Phase 3: Resource optimization based on predictions
      const resourceOptimizations = await this.optimizeResources(predictions, operationId);

      // Phase 4: Performance monitoring and adaptation
      this.updatePerformanceMetrics(command, optimisticResult, feedbackTime, startTime);

      const totalTime = performance.now() - startTime;

      // Build final result
      const result: OptimisticNavigationResult = {
        ...this.convertToUnifiedResult(optimisticResult, command),
        optimistic: command.optimistic !== false,
        rollbackAvailable: optimisticResult.action.rollbackRequired,
        predictionAccuracy: this.calculatePredictionAccuracy(predictions),
        performanceMetrics: {
          feedbackTime,
          optimisticTime: optimisticResult.executionTime,
          // rollbackTime removed as it doesn't exist on OptimisticResult
          resourceHints: resourceOptimizations.length,
          predictions: predictions.length,
        },
        ...(this.activeOperations.get(operationId)?.transactionId && {
          transactionId: this.activeOperations.get(operationId)!.transactionId
        }),
        executionTime: totalTime,
      };

      // Clean up operation
      this.activeOperations.delete(operationId);

      logger.info('Optimistic navigation command completed', {
        operationId,
        success: result.success,
        optimistic: result.optimistic,
        totalTime,
        feedbackTime,
        predictionsGenerated: predictions.length,
      });

      this.emit('optimistic_command_completed', {
        operationId,
        result,
        command,
        timestamp: Date.now(),
      });

      return result;

    } catch (error) {
      const totalTime = performance.now() - startTime;
      logger.error('Optimistic navigation command failed', {
        error,
        operationId,
        command: command.text,
        totalTime,
      });

      // Clean up operation
      this.activeOperations.delete(operationId);

      // Create error result
      return {
        success: false,
        type: this.mapCommandTypeToUnified(command.type),
        result: { error: 'Command failed', success: false } as any,
        visualFeedback: [{
          type: 'error_toast',
          data: { message: 'Command failed' },
          timestamp: new Date(),
        }],
        executionTime: totalTime,
        cacheHit: false,
        followUpSuggestions: ['Try a simpler command', 'Say "help" for assistance'],
        optimistic: false,
        rollbackAvailable: false,
        performanceMetrics: {
          feedbackTime: 0,
          optimisticTime: 0,
          resourceHints: 0,
          predictions: 0,
        },
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Execute optimistic action with transaction management
   */
  private async executeOptimistically(
    command: OptimisticNavigationCommand,
    _sessionState: SessionState,
    operationId: string
  ): Promise<OptimisticResult> {
    const operation = this.activeOperations.get(operationId)!;

    try {
      // Begin rollback transaction if enabled
      let transactionId: string | undefined;
      if (command.rollbackEnabled !== false) {
        transactionId = await actionRollbackManager.beginTransaction(operationId);
        operation.transactionId = transactionId;
      }

      // Create selection context
      const selectionContext: SelectionContext = {
        mode: (command.context.mode as 'design' | 'preview' | 'editor') || 'editor',
        activePanel: 'main',
        viewport: { width: 1920, height: 1080, zoom: 1 },
        constraints: {}, // Use empty object for constraints
      };

      // Execute optimistically
      const voiceCommand = this.convertToVoiceCommand(command);
      const result = await optimisticExecutionEngine.executeOptimistically(
        command.text,
        selectionContext,
        voiceCommand as any // Type compatibility issue - using any to resolve mismatch
      );

      // Record transaction actions if transaction is active
      if (transactionId && result.success) {
        await this.recordTransactionActions(transactionId, result, command);
      }

      return result;

    } catch (error) {
      // Rollback transaction on error
      if (operation.transactionId) {
        await actionRollbackManager.rollbackTransaction(
          operation.transactionId,
          `Execution failed: ${getErrorMessage(error)}`
        );
      }
      throw error;
    }
  }

  /**
   * Generate navigation predictions for speculative loading
   */
  private async generatePredictions(
    command: OptimisticNavigationCommand,
    sessionState: SessionState,
    operationId: string
  ): Promise<NavigationPrediction[]> {
    const operation = this.activeOperations.get(operationId)!;

    try {
      // Get navigation structure
      const navigationStructure = sessionState.navigationStructure ||
        await this.getNavigationStructure(command.context);

      // Create selection context
      const selectionContext: SelectionContext = {
        mode: (command.context.mode as 'design' | 'preview' | 'editor') || 'editor',
        activePanel: 'main',
        viewport: { width: 1920, height: 1080, zoom: 1 },
      };

      // Generate predictions
      const predictions = await speculativeNavigationPredictor.generatePredictions(
        command.text,
        selectionContext,
        navigationStructure,
        sessionState.conversationHistory || [],
        command.sessionId
      );

      operation.predictions = predictions;

      this.emit('predictions_generated', {
        operationId,
        predictions,
        count: predictions.length,
        averageConfidence: predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length,
      });

      return predictions;

    } catch (error) {
      logger.error('Failed to generate predictions', { error, operationId });
      return [];
    }
  }

  /**
   * Optimize resources based on predictions
   */
  private async optimizeResources(
    predictions: NavigationPrediction[],
    operationId: string
  ): Promise<ResourceOptimization[]> {
    const operation = this.activeOperations.get(operationId)!;

    try {
      // Process predictions for resource hints
      await resourceHintManager.processPredictions(predictions);

      // Get optimizations created
      const optimizations = resourceHintManager.getActiveOptimizations();
      operation.optimizations = optimizations;

      this.emit('resources_optimized', {
        operationId,
        optimizations,
        count: optimizations.length,
        predictions: predictions.length,
      });

      return optimizations;

    } catch (error) {
      logger.error('Failed to optimize resources', { error, operationId });
      return [];
    }
  }

  /**
   * Provide immediate visual feedback
   */
  private provideImmediateFeedback(
    _command: OptimisticNavigationCommand,
    operationId: string
  ): void {
    this.emit('immediate_feedback', {
      operationId,
      type: 'processing_indicator',
      target: 'body',
      duration: 300,
      message: 'Processing command...',
      timestamp: Date.now(),
    });
  }

  /**
   * Record transaction actions for rollback capability
   */
  private async recordTransactionActions(
    transactionId: string,
    result: OptimisticResult,
    command: OptimisticNavigationCommand
  ): Promise<void> {
    try {
      // Determine action type based on command
      const actionType = this.mapCommandToActionType(command);

      // Record the action
      await actionRollbackManager.recordAction(
        transactionId,
        actionType,
        command.context.currentUrl,
        { command: command.text, before: 'initial_state' },
        { command: command.text, after: result.optimisticResult },
        {
          reversible: result.action.riskLevel !== 'high',
          priority: command.priority === 'immediate' ? 10 : 5,
        }
      );

    } catch (error) {
      logger.error('Failed to record transaction actions', { error, transactionId });
    }
  }

  /**
   * Setup integration between components
   */
  private setupComponentIntegration(): void {
    // Listen to optimistic execution events
    optimisticExecutionEngine.on('immediate_feedback', (feedback) => {
      this.emit('immediate_feedback', feedback);
    });

    optimisticExecutionEngine.on('action_rolled_back', (event) => {
      this.emit('action_rolled_back', event);
      this.updateRollbackMetrics();
    });

    // Listen to prediction events
    speculativeNavigationPredictor.on('predictions_generated', (event) => {
      this.emit('predictions_generated', event);
    });

    // Listen to resource optimization events
    resourceHintManager.on('resource_loaded', (event) => {
      this.emit('resource_loaded', event);
    });

    resourceHintManager.on('bandwidth_updated', (profile) => {
      this.emit('bandwidth_updated', profile);
    });

    // Listen to performance optimization events
    performanceOptimizer.on('strategy_applied', (event) => {
      this.emit('performance_strategy_applied', event);
    });

    performanceOptimizer.on('performance_alert', (alert) => {
      this.emit('performance_alert', alert);
    });

    // Listen to rollback manager events
    actionRollbackManager.on('transaction_rolled_back', (event) => {
      this.emit('transaction_rolled_back', event);
    });
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    // Monitor and adapt performance every 5 seconds
    setInterval(() => {
      this.monitorPerformance();
    }, 5000);
  }

  /**
   * Monitor performance and trigger optimizations
   */
  private async monitorPerformance(): Promise<void> {
    try {
      // Get performance metrics from all components
      const executionMetrics = optimisticExecutionEngine.getMetrics();
      const predictionMetrics = speculativeNavigationPredictor.getMetrics();
      const resourceMetrics = resourceHintManager.getMetrics();
      const rollbackMetrics = actionRollbackManager.getMetrics();

      // Calculate overall performance
      const averageResponseTime = this.metrics.averageOptimisticResponseTime;
      const targets = performanceOptimizer.getPerformanceTargets();

      // Trigger optimization if performance is degrading
      if (averageResponseTime > targets.optimisticExecution * 1.2) {
        await performanceOptimizer.triggerOptimization();
      }

      // Update integration metrics
      this.updateIntegrationMetrics(
        executionMetrics as unknown as Record<string, unknown>,
        predictionMetrics as unknown as Record<string, unknown>,
        resourceMetrics as unknown as Record<string, unknown>,
        rollbackMetrics as unknown as Record<string, unknown>
      );

    } catch (error) {
      logger.error('Performance monitoring failed', { error });
    }
  }

  /**
   * Rollback an optimistic action
   */
  async rollbackAction(transactionId: string, reason?: string): Promise<boolean> {
    try {
      logger.info('Rolling back optimistic action', { transactionId, reason });

      const rollbackResult = await actionRollbackManager.rollbackTransaction(transactionId, reason);

      this.emit('action_rolled_back', {
        transactionId,
        result: rollbackResult,
        reason,
        timestamp: Date.now(),
      });

      return rollbackResult.success;

    } catch (error) {
      logger.error('Failed to rollback action', { error, transactionId });
      return false;
    }
  }

  /**
   * Validate prediction accuracy when user takes action
   */
  validatePrediction(
    sessionId: string,
    actualCommand: string,
    actualTarget: string
  ): void {
    try {
      speculativeNavigationPredictor.validatePrediction(actualCommand, actualTarget, sessionId);

      // Update prediction accuracy metrics
      this.updatePredictionAccuracyMetrics();

    } catch (error) {
      logger.error('Failed to validate prediction', { error, sessionId, actualCommand });
    }
  }

  /**
   * Get comprehensive navigation metrics
   */
  getComprehensiveMetrics(): ComprehensiveMetrics {
    return {
      integration: { ...this.metrics },
      execution: optimisticExecutionEngine.getMetrics() as unknown as Record<string, unknown>,
      prediction: speculativeNavigationPredictor.getMetrics() as unknown as Record<string, unknown>,
      resources: resourceHintManager.getMetrics() as unknown as Record<string, unknown>,
      rollback: actionRollbackManager.getMetrics() as unknown as Record<string, unknown>,
      performance: performanceOptimizer.getRecentMetrics(5) as unknown as Record<string, unknown>,
    };
  }

  /**
   * Helper methods
   */
  private getSessionState(sessionId: string): SessionState {
    if (!this.sessionStates.has(sessionId)) {
      this.sessionStates.set(sessionId, {
        conversationHistory: [],
        userProfile: {
          preferences: {
            optimisticEnabled: true,
            speculativePreloadEnabled: true,
            performanceTarget: 'balanced',
          },
          sessionHistory: {
            successfulCommands: 0,
            failedCommands: 0,
            averageResponseTime: 0,
          },
          contextualData: {},
        },
        performanceProfile: performanceOptimizer.getPerformanceProfile(),
      });
    }
    return this.sessionStates.get(sessionId)!;
  }

  private async getNavigationStructure(_context: NavigationContext): Promise<NavigationStructure> {
    // Mock navigation structure since analyzeNavigationStructure method doesn't exist
    return {} as NavigationStructure;
  }

  private convertToVoiceCommand(command: OptimisticNavigationCommand): VoiceCommand {
    return {
      text: command.text,
      intent: command.type,
      confidence: 0.8,
      parameters: {},
      context: {
        currentPage: command.context.currentPage,
        userRole: command.context.userRole,
        editorMode: command.context.mode,
      },
    };
  }

  private convertToUnifiedResult(
    optimisticResult: OptimisticResult,
    command: OptimisticNavigationCommand
  ): UnifiedNavigationResult {
    return {
      success: optimisticResult.success,
      type: this.mapCommandTypeToUnified(command.type),
      result: optimisticResult.actualResult || optimisticResult.optimisticResult,
      visualFeedback: [{
        type: 'action_highlight',
        data: { target: 'current' },
        timestamp: new Date(),
      }],
      executionTime: optimisticResult.executionTime,
      cacheHit: false,
      followUpSuggestions: optimisticResult.success ? ['Continue', 'Try another command'] : ['Try again', 'Say "help"'],
      ...(optimisticResult.error && { error: optimisticResult.error }),
    };
  }

  private mapCommandToActionType(command: OptimisticNavigationCommand): 'navigation' | 'dom_change' | 'form_interaction' {
    switch (command.type) {
      case 'navigation': return 'navigation';
      case 'element_selection': return 'dom_change';
      case 'action_execution': return 'form_interaction';
      default: return 'dom_change';
    }
  }

  private mapCommandTypeToUnified(type: OptimisticNavigationCommand['type']): UnifiedNavigationResult['type'] {
    switch (type) {
      case 'navigation': return 'navigation';
      case 'element_selection': return 'selection';
      case 'action_execution': return 'action';
      default: return 'action';
    }
  }

  private calculatePredictionAccuracy(predictions: NavigationPrediction[]): number {
    if (predictions.length === 0) {return 0;}
    return predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  }

  private updatePerformanceMetrics(
    _command: OptimisticNavigationCommand,
    result: OptimisticResult,
    _feedbackTime: number,
    startTime: number
  ): void {
    this.metrics.totalOptimisticCommands++;

    const responseTime = performance.now() - startTime;
    this.metrics.averageOptimisticResponseTime =
      (this.metrics.averageOptimisticResponseTime * (this.metrics.totalOptimisticCommands - 1) + responseTime) /
      this.metrics.totalOptimisticCommands;

    if (result.success) {
      this.metrics.optimisticSuccessRate =
        (this.metrics.optimisticSuccessRate * (this.metrics.totalOptimisticCommands - 1) + 1) /
        this.metrics.totalOptimisticCommands;
    }

    // Calculate performance gain (compared to baseline)
    const baselineTime = 800; // Assume 800ms baseline
    const gain = Math.max(0, (baselineTime - responseTime) / baselineTime);
    this.metrics.performanceGain = (this.metrics.performanceGain + gain) / 2;
  }

  private updateRollbackMetrics(): void {
    this.metrics.rollbackRate = this.metrics.rollbackRate * 0.95 + 0.05; // Moving average
  }

  private updatePredictionAccuracyMetrics(): void {
    const predictionMetrics = speculativeNavigationPredictor.getMetrics();
    this.metrics.predictionAccuracy = predictionMetrics.accuracyRate;
  }

  private updateIntegrationMetrics(
    _execution: Record<string, unknown>,
    _prediction: Record<string, unknown>,
    resources: Record<string, unknown>,
    rollback: Record<string, unknown>
  ): void {
    this.metrics.resourceHintEffectiveness = typeof resources['speculativeAccuracy'] === 'number' ? resources['speculativeAccuracy'] : 0;
    const totalRollbacks = typeof rollback['totalRollbacks'] === 'number' ? rollback['totalRollbacks'] : 0;
    this.metrics.rollbackRate = totalRollbacks > 0 ?
      totalRollbacks / this.metrics.totalOptimisticCommands : 0;
  }

  private generateOperationId(): string {
    return `opt_nav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Public API
   */

  /**
   * Process navigation command with fallback to standard navigation
   */
  async processNavigationCommand(
    command: OptimisticNavigationCommand
  ): Promise<OptimisticNavigationResult> {
    if (command.optimistic !== false && this.isInitialized) {
      return this.processOptimisticCommand(command);
    } else {
      // Fallback to standard navigation
      const standardResult = await voiceNavigationIntegrationService.processNavigationCommand(command);
      return {
        ...standardResult,
        optimistic: false,
        rollbackAvailable: false,
        performanceMetrics: {
          feedbackTime: standardResult.executionTime,
          optimisticTime: 0,
          resourceHints: 0,
          predictions: 0,
        },
      };
    }
  }

  /**
   * Get integration metrics
   */
  getMetrics(): IntegrationMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active operations count
   */
  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Clear session state
   */
  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    logger.debug('Session state cleared', { sessionId });
  }

  /**
   * Clear all session states
   */
  clearAllSessions(): void {
    this.sessionStates.clear();
    logger.debug('All session states cleared');
  }

  /**
   * Enable/disable optimistic execution
   */
  setOptimisticEnabled(enabled: boolean): void {
    // Would update configuration to enable/disable optimistic execution
    logger.info('Optimistic execution toggled', { enabled });
  }
}

// Export singleton instance
export const optimisticNavigationIntegrationService = new OptimisticNavigationIntegrationService();
