/**
 * React hook for confirmation system integration
 *
 * Provides easy access to confirmation functionality in React components
 */

import { useCallback, useEffect, useState } from 'react';
import { confirmationOrchestrator } from '@/services/confirmation/ConfirmationOrchestrator';
import {
  ConfirmationAction,
  ConfirmationResponse,
  ConfirmationState,
  MultiStepAction,
  ActionContext,
  ConfirmationSystemConfig
} from '@shared/types/confirmation';

interface UseConfirmationOptions {
  autoInit?: boolean;
  voiceEnabled?: boolean;
  defaultTimeout?: number;
}

interface ConfirmationHookReturn {
  // State
  state: ConfirmationState;
  isProcessing: boolean;
  queueStatus: {
    pending: number;
    processing: boolean;
    nextPriority: string | null;
  };

  // Core functions
  confirm: (
    actionData: Partial<ConfirmationAction>,
    options?: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      timeout?: number;
      forceVisual?: boolean;
    }
  ) => Promise<ConfirmationResponse>;

  confirmMultiStep: (
    multiStepData: Partial<MultiStepAction>,
    options?: {
      batchMode?: boolean;
      pauseOnError?: boolean;
      timeout?: number;
    }
  ) => Promise<ConfirmationResponse[]>;

  // Quick confirmation helpers
  confirmDelete: (
    target: { id: string; name: string; type: string },
    options?: { recoverable?: boolean; dependencies?: string[] }
  ) => Promise<ConfirmationResponse>;

  confirmPublish: (
    target: { id: string; name: string },
    options?: { makePublic?: boolean }
  ) => Promise<ConfirmationResponse>;

  confirmModify: (
    target: { id: string; name: string; type: string },
    changes: Record<string, unknown>,
    options?: { impact?: 'minimal' | 'moderate' | 'significant' | 'severe' }
  ) => Promise<ConfirmationResponse>;

  // Control functions
  cancel: () => void;
  clearQueue: () => void;
  forceVisualMode: () => void;
  enableVoiceMode: () => boolean;

  // Configuration
  updateConfig: (config: Partial<ConfirmationSystemConfig>) => void;
  getConfig: () => ConfirmationSystemConfig;
}

export function useConfirmation(options: UseConfirmationOptions = {}): ConfirmationHookReturn {
  const [state, setState] = useState<ConfirmationState>(confirmationOrchestrator.getState());
  const [isProcessing, setIsProcessing] = useState(false);
  const [queueStatus, setQueueStatus] = useState(confirmationOrchestrator.getQueueStatus());

  // Update state when orchestrator state changes
  useEffect(() => {
    const handleStateChange = () => {
      setState(confirmationOrchestrator.getState());
      setQueueStatus(confirmationOrchestrator.getQueueStatus());
    };

    const handleProcessingStart = () => setIsProcessing(true);
    const handleProcessingEnd = () => setIsProcessing(false);

    // Subscribe to orchestrator events
    confirmationOrchestrator.on('confirmation_requested', handleStateChange);
    confirmationOrchestrator.on('confirmation_completed', handleStateChange);
    confirmationOrchestrator.on('queue_updated', handleStateChange);
    confirmationOrchestrator.on('config_updated', handleStateChange);
    confirmationOrchestrator.on('voice_confirmation_started', handleProcessingStart);
    confirmationOrchestrator.on('visual_confirmation_started', handleProcessingStart);
    confirmationOrchestrator.on('confirmation_completed', handleProcessingEnd);
    confirmationOrchestrator.on('confirmation_error', handleProcessingEnd);

    return () => {
      confirmationOrchestrator.removeListener('confirmation_requested', handleStateChange);
      confirmationOrchestrator.removeListener('confirmation_completed', handleStateChange);
      confirmationOrchestrator.removeListener('queue_updated', handleStateChange);
      confirmationOrchestrator.removeListener('config_updated', handleStateChange);
      confirmationOrchestrator.removeListener('voice_confirmation_started', handleProcessingStart);
      confirmationOrchestrator.removeListener('visual_confirmation_started', handleProcessingStart);
      confirmationOrchestrator.removeListener('confirmation_completed', handleProcessingEnd);
      confirmationOrchestrator.removeListener('confirmation_error', handleProcessingEnd);
    };
  }, []);

  // Initialize configuration
  useEffect(() => {
    if (options.autoInit !== false) {
      const config: Partial<ConfirmationSystemConfig> = {};

      if (options.voiceEnabled !== undefined) {
        config.voice = { enabled: options.voiceEnabled } as any;
      }

      if (options.defaultTimeout) {
        config.timeout = { default: options.defaultTimeout } as any;
      }

      if (Object.keys(config).length > 0) {
        confirmationOrchestrator.updateConfig(config);
      }
    }
  }, [options.autoInit, options.voiceEnabled, options.defaultTimeout]);

  // Core confirmation function
  const confirm = useCallback(async (
    actionData: Partial<ConfirmationAction>,
    requestOptions: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      timeout?: number;
      forceVisual?: boolean;
    } = {}
  ): Promise<ConfirmationResponse> => {
    return confirmationOrchestrator.requestConfirmation(actionData, {
      ...requestOptions,
      ...(requestOptions.timeout !== undefined ? { timeout: requestOptions.timeout } :
          options.defaultTimeout !== undefined ? { timeout: options.defaultTimeout } : {})
    });
  }, [options.defaultTimeout]);

  // Multi-step confirmation function
  const confirmMultiStep = useCallback(async (
    multiStepData: Partial<MultiStepAction>,
    requestOptions: {
      batchMode?: boolean;
      pauseOnError?: boolean;
      timeout?: number;
    } = {}
  ): Promise<ConfirmationResponse[]> => {
    return confirmationOrchestrator.requestMultiStepConfirmation(multiStepData, {
      ...requestOptions,
      ...(requestOptions.timeout !== undefined ? { timeout: requestOptions.timeout } :
          options.defaultTimeout !== undefined ? { timeout: options.defaultTimeout } : {})
    });
  }, [options.defaultTimeout]);

  // Helper function for delete confirmations
  const confirmDelete = useCallback(async (
    target: { id: string; name: string; type: string },
    deleteOptions: { recoverable?: boolean; dependencies?: string[] } = {}
  ): Promise<ConfirmationResponse> => {
    const context: ActionContext = {
      type: 'delete',
      targetType: target.type as any,
      targetId: target.id,
      targetName: target.name,
      ...(deleteOptions.dependencies !== undefined ? { dependencies: deleteOptions.dependencies } : {}),
      recoverable: deleteOptions.recoverable ?? false,
      estimatedImpact: deleteOptions.dependencies?.length ? 'significant' : 'moderate'
    };

    return confirm({
      title: `Delete ${target.name}`,
      description: `Are you sure you want to delete "${target.name}"? This action ${deleteOptions.recoverable ? 'can be undone' : 'cannot be undone'}.`,
      context,
      ...(deleteOptions.dependencies?.length ? {
        warnings: [
          `This will affect ${deleteOptions.dependencies.length} other items`,
          ...(deleteOptions.dependencies.map(dep => `Dependency: ${dep}`))
        ]
      } : {}),
      ...(deleteOptions.recoverable === true ? {} : { confirmationPhrase: target.name })
    }, {
      priority: deleteOptions.recoverable ? 'normal' : 'high'
    });
  }, [confirm]);

  // Helper function for publish confirmations
  const confirmPublish = useCallback(async (
    target: { id: string; name: string },
    publishOptions: { makePublic?: boolean } = {}
  ): Promise<ConfirmationResponse> => {
    const context: ActionContext = {
      type: 'publish',
      targetType: 'site',
      targetId: target.id,
      targetName: target.name,
      recoverable: true,
      estimatedImpact: publishOptions.makePublic ? 'significant' : 'moderate'
    };

    return confirm({
      title: `Publish ${target.name}`,
      description: `Publish "${target.name}" and make it ${publishOptions.makePublic ? 'publicly' : 'privately'} accessible?`,
      context,
      ...(publishOptions.makePublic ? {
        warnings: [
          'This site will be visible to the public',
          'Make sure all content is ready for publication'
        ]
      } : {})
    }, {
      priority: 'normal'
    });
  }, [confirm]);

  // Helper function for modify confirmations
  const confirmModify = useCallback(async (
    target: { id: string; name: string; type: string },
    changes: Record<string, unknown>,
    modifyOptions: { impact?: 'minimal' | 'moderate' | 'significant' | 'severe' } = {}
  ): Promise<ConfirmationResponse> => {
    const context: ActionContext = {
      type: 'modify',
      targetType: target.type as any,
      targetId: target.id,
      targetName: target.name,
      recoverable: true,
      estimatedImpact: modifyOptions.impact || 'moderate'
    };

    const changeCount = Object.keys(changes).length;

    return confirm({
      title: `Modify ${target.name}`,
      description: `Apply ${changeCount} change${changeCount === 1 ? '' : 's'} to "${target.name}"?`,
      context,
      beforeState: target as any,
      afterState: { ...target, ...changes } as any,
      ...(modifyOptions.impact === 'severe' ? {
        warnings: [
          'These changes may have significant impact',
          'Please review carefully before proceeding'
        ]
      } : {})
    }, {
      priority: modifyOptions.impact === 'severe' ? 'high' : 'normal'
    });
  }, [confirm]);

  // Control functions
  const cancel = useCallback(() => {
    confirmationOrchestrator.clearQueue();
  }, []);

  const clearQueue = useCallback(() => {
    confirmationOrchestrator.clearQueue();
  }, []);

  const forceVisualMode = useCallback(() => {
    confirmationOrchestrator.forceVisualMode();
  }, []);

  const enableVoiceMode = useCallback(() => {
    return confirmationOrchestrator.enableVoiceConfirmation();
  }, []);

  // Configuration functions
  const updateConfig = useCallback((config: Partial<ConfirmationSystemConfig>) => {
    confirmationOrchestrator.updateConfig(config);
  }, []);

  const getConfig = useCallback(() => {
    return confirmationOrchestrator['config']; // Access private config
  }, []);

  return {
    state,
    isProcessing,
    queueStatus,
    confirm,
    confirmMultiStep,
    confirmDelete,
    confirmPublish,
    confirmModify,
    cancel,
    clearQueue,
    forceVisualMode,
    enableVoiceMode,
    updateConfig,
    getConfig
  };
}

// Helper hook for quick confirmations
export function useQuickConfirm() {
  const { confirm } = useConfirmation();

  return useCallback(async (
    message: string,
    options: {
      title?: string;
      type?: 'info' | 'warning' | 'danger';
      confirmText?: string;
      cancelText?: string;
    } = {}
  ): Promise<boolean> => {
    try {
      const riskLevel = options.type === 'danger' ? 'high' :
                       options.type === 'warning' ? 'medium' : 'low';

      const response = await confirm({
        title: options.title || 'Confirm Action',
        description: message,
        context: {
          type: 'modify',
          targetType: 'content',
          targetId: 'quick-confirm',
          targetName: 'Action',
          recoverable: true,
          estimatedImpact: 'minimal'
        },
        riskLevel
      });

      return response.action === 'confirm';
    } catch {
      return false;
    }
  }, [confirm]);
}