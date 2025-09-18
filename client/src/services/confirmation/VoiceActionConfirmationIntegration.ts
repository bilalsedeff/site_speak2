/**
 * Voice Action Confirmation Integration
 *
 * Integrates confirmation system with SiteSpeak's voice action execution
 * and optimistic navigation systems for seamless user experience
 */

import { confirmationOrchestrator } from './ConfirmationOrchestrator';
import { setupSiteSpeakVoiceUniversal } from '@/services/voice/index-enhanced';
import {
  ConfirmationAction,
  ConfirmationResponse,
  ActionContext,
  DEFAULT_CONFIRMATION_CONFIG
} from '@shared/types/confirmation';

interface VoiceAction {
  id: string;
  type: 'navigate' | 'delete' | 'modify' | 'create' | 'publish' | 'unpublish';
  command: string;
  target?: {
    id: string;
    name: string;
    type: string;
  };
  parameters?: Record<string, unknown>;
  confidence: number;
  context?: Record<string, unknown>;
}

interface OptimisticActionResult {
  success: boolean;
  transactionId?: string;
  rollbackAvailable: boolean;
  executionTime: number;
  optimistic: boolean;
}

interface DestructiveActionClassification {
  isDestructive: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
  reason: string;
  suggestions?: string[];
}

export class VoiceActionConfirmationIntegration {
  private isInitialized = false;
  private destructivePatterns: RegExp[] = [
    /delete|remove|destroy|erase|wipe|clear/i,
    /drop|purge|eliminate|trash/i,
    /replace\s+all|overwrite|reset/i,
    /publish|make\s+public|go\s+live/i,
    /unpublish|take\s+down|disable/i
  ];

  async initialize(): Promise<void> {
    if (this.isInitialized) {return;}

    try {
      // Initialize voice system integration
      await setupSiteSpeakVoiceUniversal({
        preferAudioWorklet: true,
        performance: 'optimal',
        debugMode: false
      });

      // Configure confirmation system for voice integration
      confirmationOrchestrator.updateConfig({
        voice: {
          ...DEFAULT_CONFIRMATION_CONFIG.voice,
          enabled: true,
          confidence_threshold: 0.85, // Higher threshold for voice confirmations
          enableBargeIn: true,
          fallbackToVisual: true
        },
        riskThresholds: {
          autoConfirmBelow: 'low',
          requireExplicitAbove: 'high'
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize voice action confirmation integration:', error);
      throw error;
    }
  }

  /**
   * Intercept voice action and check if confirmation is needed
   */
  async interceptVoiceAction(action: VoiceAction): Promise<{
    shouldProceed: boolean;
    confirmed?: boolean;
    response?: ConfirmationResponse;
    modifiedAction?: VoiceAction;
  }> {
    const classification = this.classifyDestructiveAction(action);

    if (!classification.isDestructive || !classification.requiresConfirmation) {
      return { shouldProceed: true };
    }

    try {
      const confirmationAction = this.createConfirmationAction(action, classification);
      const response = await confirmationOrchestrator.requestConfirmation(confirmationAction, {
        priority: classification.riskLevel === 'critical' ? 'urgent' :
                 classification.riskLevel === 'high' ? 'high' : 'normal',
        timeout: this.getTimeoutForRisk(classification.riskLevel)
      });

      const shouldProceed = response.action === 'confirm';

      return {
        shouldProceed,
        confirmed: shouldProceed,
        response,
        ...(shouldProceed ? { modifiedAction: action } : {})
      };

    } catch (error) {
      console.error('Confirmation failed for voice action:', error);
      return { shouldProceed: false };
    }
  }

  /**
   * Handle optimistic action execution with confirmation
   */
  async executeWithOptimisticConfirmation(
    action: VoiceAction,
    executeFunction: () => Promise<OptimisticActionResult>
  ): Promise<OptimisticActionResult> {
    const classification = this.classifyDestructiveAction(action);

    // For low-risk actions, execute optimistically without confirmation
    if (!classification.isDestructive || classification.riskLevel === 'low') {
      return executeFunction();
    }

    // For higher-risk actions, get confirmation first
    const interceptResult = await this.interceptVoiceAction(action);

    if (!interceptResult.shouldProceed) {
      return {
        success: false,
        rollbackAvailable: false,
        executionTime: 0,
        optimistic: false
      };
    }

    // Execute the action
    const result = await executeFunction();

    // If execution failed and was optimistic, we might need to handle rollback
    if (!result.success && result.rollbackAvailable) {
      const rollbackConfirmation = await this.confirmRollback(action);
      if (rollbackConfirmation) {
        // Trigger rollback through optimistic navigation system
        this.triggerRollback(result.transactionId);
      }
    }

    return result;
  }

  /**
   * Create voice prompts for confirmation
   */
  generateVoicePrompt(action: VoiceAction, classification: DestructiveActionClassification): string {
    const { target, type } = action;
    const targetName = target?.name || 'this item';

    let basePrompt = '';

    switch (type) {
      case 'delete':
        basePrompt = `You asked me to delete ${targetName}. `;
        break;
      case 'publish':
        basePrompt = `You want to publish ${targetName} and make it live. `;
        break;
      case 'unpublish':
        basePrompt = `You want to unpublish ${targetName} and take it offline. `;
        break;
      case 'modify':
        basePrompt = `You want to modify ${targetName}. `;
        break;
      default:
        basePrompt = `You want to ${type} ${targetName}. `;
    }

    // Add risk-appropriate warning
    switch (classification.riskLevel) {
      case 'critical':
        basePrompt += 'This is a critical action that may be irreversible. ';
        break;
      case 'high':
        basePrompt += 'This is a high-risk action with significant impact. ';
        break;
      case 'medium':
        basePrompt += 'This action will have moderate impact. ';
        break;
    }

    basePrompt += 'Say "yes" to confirm, or "no" to cancel.';

    return basePrompt;
  }

  /**
   * Process voice confirmation response
   */
  async processVoiceConfirmationResponse(
    voiceInput: string,
    action: VoiceAction,
    confidence: number
  ): Promise<ConfirmationResponse | null> {
    const normalizedInput = voiceInput.toLowerCase().trim();

    // Confirmation phrases
    const confirmPhrases = ['yes', 'confirm', 'proceed', 'do it', 'go ahead', 'continue'];
    const cancelPhrases = ['no', 'cancel', 'stop', 'abort', 'dont', 'nope'];

    const isConfirm = confirmPhrases.some(phrase => normalizedInput.includes(phrase));
    const isCancel = cancelPhrases.some(phrase => normalizedInput.includes(phrase));

    if (!isConfirm && !isCancel) {
      return null; // Unclear response
    }

    // For critical actions, require explicit target name confirmation
    const classification = this.classifyDestructiveAction(action);
    if (classification.riskLevel === 'critical' && isConfirm) {
      const targetName = action.target?.name?.toLowerCase();
      if (targetName && !normalizedInput.includes(targetName)) {
        return null; // Explicit confirmation required
      }
    }

    return {
      action: isConfirm ? 'confirm' : 'cancel',
      method: 'voice',
      timestamp: Date.now(),
      confidence
    };
  }

  // Private methods

  private classifyDestructiveAction(action: VoiceAction): DestructiveActionClassification {
    const { type, command, target, confidence } = action;

    // Check for destructive action types
    const isInherentlyDestructive = ['delete', 'publish', 'unpublish'].includes(type);

    // Check for destructive language in command
    const hasDestructiveLanguage = this.destructivePatterns.some(pattern =>
      pattern.test(command)
    );

    const isDestructive = isInherentlyDestructive || hasDestructiveLanguage;

    if (!isDestructive) {
      return {
        isDestructive: false,
        riskLevel: 'low',
        requiresConfirmation: false,
        reason: 'Action is not destructive'
      };
    }

    // Classify risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let reason = 'Moderate risk action';

    // Critical risk factors
    if (
      type === 'delete' && target?.type === 'site' ||
      type === 'publish' && command.includes('public') ||
      command.includes('all') || command.includes('everything')
    ) {
      riskLevel = 'critical';
      reason = 'Critical action affecting entire site or making content public';
    }
    // High risk factors
    else if (
      type === 'delete' && target?.type === 'page' ||
      type === 'publish' ||
      type === 'unpublish' ||
      confidence < 0.8
    ) {
      riskLevel = 'high';
      reason = 'High impact action or low confidence command';
    }
    // Medium risk factors
    else if (
      type === 'modify' && command.includes('replace') ||
      type === 'delete' && target?.type === 'component'
    ) {
      riskLevel = 'medium';
      reason = 'Moderate impact modification or component deletion';
    }
    // Low risk (destructive but minor)
    else {
      riskLevel = 'low';
      reason = 'Minor destructive action';
    }

    const requiresConfirmation = riskLevel !== 'low';

    return {
      isDestructive,
      riskLevel,
      requiresConfirmation,
      reason,
      suggestions: this.generateActionSuggestions(action, riskLevel)
    };
  }

  private createConfirmationAction(
    action: VoiceAction,
    classification: DestructiveActionClassification
  ): ConfirmationAction {
    const context: ActionContext = {
      type: action.type as any,
      targetType: (action.target?.type || 'content') as any,
      targetId: action.target?.id || action.id,
      targetName: action.target?.name || 'Unknown',
      recoverable: classification.riskLevel !== 'critical',
      estimatedImpact: this.mapRiskToImpact(classification.riskLevel)
    };

    return {
      id: `voice_action_${action.id}`,
      title: `Voice Command: ${action.command}`,
      description: this.generateActionDescription(action, classification),
      context,
      riskLevel: classification.riskLevel,
      warnings: classification.suggestions ? [
        classification.reason,
        ...classification.suggestions
      ] : [classification.reason],
      requiresExplicitConfirmation: classification.riskLevel === 'critical',
      ...(classification.riskLevel === 'critical' && action.target?.name ? { confirmationPhrase: action.target.name } : {})
    };
  }

  private generateActionDescription(
    action: VoiceAction,
    classification: DestructiveActionClassification
  ): string {
    const targetName = action.target?.name || 'the selected item';

    switch (action.type) {
      case 'delete':
        return `Delete "${targetName}" permanently. ${classification.reason}`;
      case 'publish':
        return `Publish "${targetName}" and make it live. This will be visible to visitors.`;
      case 'unpublish':
        return `Unpublish "${targetName}" and take it offline. Visitors will no longer see it.`;
      case 'modify':
        return `Modify "${targetName}" as requested. ${classification.reason}`;
      default:
        return `Perform ${action.type} action on "${targetName}". ${classification.reason}`;
    }
  }

  private generateActionSuggestions(
    action: VoiceAction,
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): string[] {
    const suggestions: string[] = [];

    if (riskLevel === 'critical') {
      suggestions.push('Consider creating a backup before proceeding');
      suggestions.push('This action may not be reversible');
    }

    if (action.type === 'delete') {
      suggestions.push('Deleted items may not be recoverable');
      if (action.target?.type === 'page') {
        suggestions.push('This will break any links to this page');
      }
    }

    if (action.type === 'publish') {
      suggestions.push('Make sure all content is ready for public viewing');
      suggestions.push('Check that all links and images work correctly');
    }

    return suggestions;
  }

  private mapRiskToImpact(riskLevel: 'low' | 'medium' | 'high' | 'critical'): 'minimal' | 'moderate' | 'significant' | 'severe' {
    switch (riskLevel) {
      case 'low': return 'minimal';
      case 'medium': return 'moderate';
      case 'high': return 'significant';
      case 'critical': return 'severe';
    }
  }

  private getTimeoutForRisk(riskLevel: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (riskLevel) {
      case 'low': return 5000;
      case 'medium': return 10000;
      case 'high': return 15000;
      case 'critical': return 30000;
    }
  }

  private async confirmRollback(
    action: VoiceAction
  ): Promise<boolean> {
    try {
      const response = await confirmationOrchestrator.requestConfirmation({
        title: 'Action Failed - Rollback?',
        description: `The ${action.type} action failed. Would you like to undo any changes that were made?`,
        context: {
          type: 'modify',
          targetType: 'content',
          targetId: action.id,
          targetName: 'Failed Action',
          recoverable: true,
          estimatedImpact: 'minimal'
        },
        riskLevel: 'low'
      }, {
        priority: 'normal',
        timeout: 10000
      });

      return response.action === 'confirm';
    } catch {
      return false;
    }
  }

  private triggerRollback(transactionId?: string): void {
    if (!transactionId) {return;}

    // This would integrate with the optimistic navigation system
    // to trigger actual rollback
    console.log('Triggering rollback for transaction:', transactionId);

    // Emit event for optimistic navigation system to handle
    window.dispatchEvent(new CustomEvent('optimistic_rollback_requested', {
      detail: { transactionId }
    }));
  }
}

// Export singleton instance
export const voiceActionConfirmationIntegration = new VoiceActionConfirmationIntegration();