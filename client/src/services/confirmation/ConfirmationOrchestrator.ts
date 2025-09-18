/**
 * Confirmation Orchestrator Service
 *
 * Central service for managing human-in-the-loop confirmations
 * Integrates with voice systems and optimistic navigation
 */

import { EventEmitter } from 'events';
import {
  ConfirmationAction,
  ConfirmationResponse,
  ConfirmationState,
  ConfirmationSystemConfig,
  MultiStepAction,
  RiskLevel,
  ActionContext,
  DEFAULT_CONFIRMATION_CONFIG
} from '@shared/types/confirmation';

interface ConfirmationQueueItem {
  id: string;
  action: ConfirmationAction;
  resolve: (response: ConfirmationResponse) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

interface VoiceIntegration {
  isAvailable: boolean;
  isActive: boolean;
  confidence: number;
  lastActivity: number;
}

export class ConfirmationOrchestrator extends EventEmitter {
  private state: ConfirmationState;
  private config: ConfirmationSystemConfig;
  private queue: ConfirmationQueueItem[] = [];
  private voiceIntegration: VoiceIntegration;
  private isProcessing = false;
  private activeTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(config: Partial<ConfirmationSystemConfig> = {}) {
    super();

    this.config = { ...DEFAULT_CONFIRMATION_CONFIG, ...config };
    this.state = {
      isOpen: false,
      currentAction: null,
      multiStepAction: null,
      pendingActions: [],
      voiceConfirmationActive: false,
      visualFallbackActive: false,
      timeout: null,
      history: []
    };

    this.voiceIntegration = {
      isAvailable: this.checkVoiceAvailability(),
      isActive: false,
      confidence: 0,
      lastActivity: 0
    };

    this.setupEventListeners();
  }

  /**
   * Request confirmation for a destructive action
   */
  async requestConfirmation(
    actionData: Partial<ConfirmationAction>,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      timeout?: number;
      forceVisual?: boolean;
      context?: Record<string, unknown>;
    } = {}
  ): Promise<ConfirmationResponse> {
    const action = this.createConfirmationAction(actionData);

    return new Promise((resolve, reject) => {
      const queueItem: ConfirmationQueueItem = {
        id: action.id,
        action,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: options.priority || 'normal'
      };

      // Add to queue with priority sorting
      this.addToQueue(queueItem);

      // Start processing if not already active
      if (!this.isProcessing) {
        this.processQueue();
      }

      // Set timeout if specified
      if (options.timeout) {
        const timeoutId = setTimeout(() => {
          this.handleTimeout(action.id);
        }, options.timeout);

        this.activeTimeouts.set(action.id, timeoutId);
      }

      this.emit('confirmation_requested', { action, options });
    });
  }

  /**
   * Request confirmation for multi-step actions
   */
  async requestMultiStepConfirmation(
    multiStepData: Partial<MultiStepAction>,
    options: {
      batchMode?: boolean;
      pauseOnError?: boolean;
      timeout?: number;
    } = {}
  ): Promise<ConfirmationResponse[]> {
    const multiStepAction = this.createMultiStepAction(multiStepData);

    this.state.multiStepAction = multiStepAction;
    this.state.isOpen = true;

    const responses: ConfirmationResponse[] = [];

    try {
      for (let i = 0; i < multiStepAction.steps.length; i++) {
        const step = multiStepAction.steps[i];
        if (!step) {continue;}

        this.state.multiStepAction.currentStep = i;
        this.emit('multi_step_started', { multiStepAction, currentStep: i });

        const response = await this.requestConfirmation(step, {
          priority: 'high',
          ...(options.timeout !== undefined ? { timeout: options.timeout } : {})
        });

        responses.push(response);

        if (response.action === 'cancel') {
          if (multiStepAction.rollbackStrategy === 'step_by_step') {
            await this.rollbackSteps(responses.slice(0, -1));
          }
          break;
        }

        this.emit('multi_step_progress', {
          multiStepAction,
          currentStep: i,
          response,
          totalSteps: multiStepAction.steps.length
        });
      }

      this.state.multiStepAction = null;
      this.state.isOpen = false;

      this.emit('multi_step_completed', { multiStepAction, responses });
      return responses;

    } catch (error) {
      this.emit('multi_step_error', { multiStepAction, error });
      throw error;
    }
  }

  /**
   * Check if an action should auto-confirm based on risk level
   */
  shouldAutoConfirm(action: ConfirmationAction): boolean {
    const riskLevels: RiskLevel['level'][] = ['low', 'medium', 'high', 'critical'];
    const autoConfirmIndex = riskLevels.indexOf(this.config.riskThresholds.autoConfirmBelow);
    const actionRiskIndex = riskLevels.indexOf(action.riskLevel);

    return actionRiskIndex <= autoConfirmIndex;
  }

  /**
   * Classify risk level based on action context
   */
  classifyRiskLevel(context: ActionContext): RiskLevel['level'] {
    // Critical actions
    if (
      context.type === 'delete' &&
      (context.targetType === 'site' || context.targetType === 'user_data') &&
      !context.recoverable
    ) {
      return 'critical';
    }

    // High risk actions
    if (
      context.type === 'delete' &&
      context.estimatedImpact === 'severe' ||
      context.type === 'transfer' ||
      (context.type === 'publish' && context.targetType === 'site')
    ) {
      return 'high';
    }

    // Medium risk actions
    if (
      context.type === 'modify' &&
      context.estimatedImpact === 'significant' ||
      context.type === 'unpublish' ||
      context.dependencies && context.dependencies.length > 3
    ) {
      return 'medium';
    }

    // Low risk by default
    return 'low';
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConfirmationSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', this.config);
  }

  /**
   * Get current state
   */
  getState(): ConfirmationState {
    return { ...this.state };
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    pending: number;
    processing: boolean;
    nextPriority: string | null;
  } {
    return {
      pending: this.queue.length,
      processing: this.isProcessing,
      nextPriority: this.queue[0]?.priority || null
    };
  }

  /**
   * Clear pending confirmations
   */
  clearQueue(): void {
    // Cancel all pending timeouts
    this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.activeTimeouts.clear();

    // Reject all queued items
    this.queue.forEach(item => {
      item.reject(new Error('Confirmation queue cleared'));
    });

    this.queue = [];
    this.isProcessing = false;

    this.emit('queue_cleared');
  }

  /**
   * Force visual confirmation mode
   */
  forceVisualMode(): void {
    this.state.voiceConfirmationActive = false;
    this.state.visualFallbackActive = true;
    this.voiceIntegration.isActive = false;

    this.emit('visual_mode_forced');
  }

  /**
   * Enable voice confirmation if available
   */
  enableVoiceConfirmation(): boolean {
    if (!this.voiceIntegration.isAvailable) {
      return false;
    }

    this.state.voiceConfirmationActive = true;
    this.state.visualFallbackActive = false;
    this.voiceIntegration.isActive = true;

    this.emit('voice_mode_enabled');
    return true;
  }

  // Private methods

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) {continue;}

        await this.processConfirmationItem(item);
      }
    } catch (error) {
      this.emit('processing_error', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processConfirmationItem(item: ConfirmationQueueItem): Promise<void> {
    try {
      // Check for auto-confirmation
      if (this.shouldAutoConfirm(item.action)) {
        const autoResponse: ConfirmationResponse = {
          action: 'confirm',
          method: 'visual',
          timestamp: Date.now()
        };

        item.resolve(autoResponse);
        this.addToHistory(autoResponse);
        this.emit('auto_confirmed', { action: item.action, response: autoResponse });
        return;
      }

      // Set current action
      this.state.currentAction = item.action;
      this.state.isOpen = true;

      // Determine confirmation method
      const useVoice = this.shouldUseVoiceConfirmation(item.action);

      if (useVoice) {
        await this.startVoiceConfirmation(item);
      } else {
        await this.startVisualConfirmation(item);
      }

    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
      this.emit('confirmation_error', { action: item.action, error });
    }
  }

  private shouldUseVoiceConfirmation(action: ConfirmationAction): boolean {
    return (
      this.config.voice.enabled &&
      this.voiceIntegration.isAvailable &&
      !this.state.visualFallbackActive &&
      action.riskLevel !== 'critical' // Never use voice for critical actions
    );
  }

  private async startVoiceConfirmation(item: ConfirmationQueueItem): Promise<void> {
    this.state.voiceConfirmationActive = true;

    // Set voice timeout
    const voiceTimeout = this.config.timeout.byRiskLevel[item.action.riskLevel];
    this.state.timeout = Date.now() + voiceTimeout;

    this.emit('voice_confirmation_started', { action: item.action });

    // Voice confirmation will resolve through event handlers
  }

  private async startVisualConfirmation(item: ConfirmationQueueItem): Promise<void> {
    this.state.visualFallbackActive = true;
    this.state.voiceConfirmationActive = false;

    this.emit('visual_confirmation_started', { action: item.action });

    // Visual confirmation will resolve through event handlers
  }

  private addToQueue(item: ConfirmationQueueItem): void {
    // Insert based on priority
    const priorityOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
    const insertIndex = this.queue.findIndex(
      existing => priorityOrder[item.priority] > priorityOrder[existing.priority]
    );

    if (insertIndex === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(insertIndex, 0, item);
    }

    this.state.pendingActions = this.queue.map(qi => qi.action);
    this.emit('queue_updated', { queue: this.queue });
  }

  private createConfirmationAction(data: Partial<ConfirmationAction>): ConfirmationAction {
    const context = data.context!;
    const riskLevel = data.riskLevel || this.classifyRiskLevel(context);

    return {
      id: data.id || `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: data.title || `${context.type} ${context.targetName}`,
      description: data.description || `Confirm ${context.type} action on ${context.targetName}`,
      context,
      riskLevel,
      ...(data.beforeState !== undefined ? { beforeState: data.beforeState } : {}),
      ...(data.afterState !== undefined ? { afterState: data.afterState } : {}),
      warnings: data.warnings || [],
      ...(data.recoveryInstructions !== undefined ? { recoveryInstructions: data.recoveryInstructions } : {}),
      ...(data.estimatedDuration !== undefined ? { estimatedDuration: data.estimatedDuration } : {}),
      requiresExplicitConfirmation: riskLevel === 'critical' || riskLevel === 'high',
      ...(riskLevel === 'critical' ? { confirmationPhrase: data.confirmationPhrase || context.targetName } : {})
    };
  }

  private createMultiStepAction(data: Partial<MultiStepAction>): MultiStepAction {
    return {
      id: data.id || `multi_${Date.now()}`,
      title: data.title || 'Multi-step Action',
      description: data.description || 'Multiple actions require confirmation',
      steps: data.steps || [],
      currentStep: data.currentStep || 0,
      allowStepSkipping: data.allowStepSkipping ?? true,
      allowBatchConfirmation: data.allowBatchConfirmation ?? false,
      rollbackStrategy: data.rollbackStrategy || 'step_by_step'
    };
  }

  private checkVoiceAvailability(): boolean {
    return typeof window !== 'undefined' &&
           'webkitSpeechRecognition' in window ||
           'SpeechRecognition' in window;
  }

  private handleTimeout(actionId: string): void {
    const timeoutHandler = this.activeTimeouts.get(actionId);
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
      this.activeTimeouts.delete(actionId);
    }

    // Find and reject the timed-out action
    const itemIndex = this.queue.findIndex(item => item.id === actionId);
    if (itemIndex !== -1) {
      const item = this.queue.splice(itemIndex, 1)[0];
      if (item) {
        item.reject(new Error('Confirmation timeout'));
        this.emit('confirmation_timeout', { action: item.action });
      }
    }

    // Fallback to visual if voice timed out
    if (this.state.voiceConfirmationActive) {
      this.forceVisualMode();
    }
  }

  private addToHistory(response: ConfirmationResponse): void {
    this.state.history.push(response);

    // Keep history limited to last 100 items
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(-100);
    }
  }

  private async rollbackSteps(responses: ConfirmationResponse[]): Promise<void> {
    this.emit('rollback_started', { responses });

    // Implementation would depend on the specific rollback strategy
    // This is a placeholder for the actual rollback logic

    this.emit('rollback_completed', { responses });
  }

  private setupEventListeners(): void {
    // Handle voice confirmation responses
    this.on('voice_response', (response: ConfirmationResponse) => {
      this.handleConfirmationResponse(response);
    });

    // Handle visual confirmation responses
    this.on('visual_response', (response: ConfirmationResponse) => {
      this.handleConfirmationResponse(response);
    });

    // Handle voice fallback
    this.on('voice_fallback', () => {
      this.forceVisualMode();
    });
  }

  private handleConfirmationResponse(response: ConfirmationResponse): void {
    if (!this.state.currentAction) {return;}

    // Clear timeout for current action
    const timeoutHandler = this.activeTimeouts.get(this.state.currentAction.id);
    if (timeoutHandler) {
      clearTimeout(timeoutHandler);
      this.activeTimeouts.delete(this.state.currentAction.id);
    }

    // Add to history
    this.addToHistory(response);

    // Reset state
    this.state.currentAction = null;
    this.state.isOpen = false;
    this.state.voiceConfirmationActive = false;
    this.state.visualFallbackActive = false;

    // Find and resolve the corresponding queue item
    const itemIndex = this.queue.findIndex(item =>
      item.action.id === this.state.currentAction?.id
    );

    if (itemIndex !== -1) {
      const item = this.queue.splice(itemIndex, 1)[0];
      if (item) {
        item.resolve(response);
      }
    }

    this.emit('confirmation_completed', { response });

    // Continue processing queue
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }
}

// Export singleton instance
export const confirmationOrchestrator = new ConfirmationOrchestrator();