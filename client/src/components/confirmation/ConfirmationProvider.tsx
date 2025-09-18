/**
 * Confirmation Provider Component
 *
 * Global provider that renders confirmation dialogs and manages voice integration
 */

import React, { useEffect, useState, useCallback } from 'react';
import { confirmationOrchestrator } from '@/services/confirmation/ConfirmationOrchestrator';
import { useVoice } from '@/providers/VoiceProvider';
import { ConfirmationDialog } from './ConfirmationDialog';
import { VoiceConfirmationPrompt } from './VoiceConfirmationPrompt';
import { MultiStepConfirmation } from './MultiStepConfirmation';
import {
  ConfirmationAction,
  ConfirmationResponse,
  ConfirmationState,
  MultiStepAction,
  DEFAULT_CONFIRMATION_CONFIG
} from '@shared/types/confirmation';

interface ConfirmationProviderProps {
  children: React.ReactNode;
  voiceEnabled?: boolean;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'center' | 'top' | 'bottom';
  className?: string;
}

export function ConfirmationProvider({
  children,
  voiceEnabled = true,
  theme = 'auto',
  position = 'center',
  className
}: ConfirmationProviderProps) {
  const [state, setState] = useState<ConfirmationState>(confirmationOrchestrator.getState());
  const [currentAction, setCurrentAction] = useState<ConfirmationAction | null>(null);
  const [multiStepAction, setMultiStepAction] = useState<MultiStepAction | null>(null);
  const [showVoicePrompt, setShowVoicePrompt] = useState(false);
  const [showVisualDialog, setShowVisualDialog] = useState(false);
  const [showMultiStep, setShowMultiStep] = useState(false);

  const voice = useVoice();

  // Subscribe to orchestrator events
  useEffect(() => {
    const handleStateUpdate = () => {
      const newState = confirmationOrchestrator.getState();
      setState(newState);
    };

    const handleVoiceConfirmationStart = (event: { action: ConfirmationAction }) => {
      setCurrentAction(event.action);
      setShowVoicePrompt(true);
      setShowVisualDialog(false);
    };

    const handleVisualConfirmationStart = (event: { action: ConfirmationAction }) => {
      setCurrentAction(event.action);
      setShowVisualDialog(true);
      setShowVoicePrompt(false);
    };

    const handleMultiStepStart = (event: { multiStepAction: MultiStepAction }) => {
      setMultiStepAction(event.multiStepAction);
      setShowMultiStep(true);
    };

    const handleConfirmationComplete = () => {
      setShowVoicePrompt(false);
      setShowVisualDialog(false);
      setCurrentAction(null);
    };

    const handleMultiStepComplete = () => {
      setShowMultiStep(false);
      setMultiStepAction(null);
    };

    const handleVoiceFallback = () => {
      setShowVoicePrompt(false);
      setShowVisualDialog(true);
    };

    // Register event listeners
    confirmationOrchestrator.on('confirmation_requested', handleStateUpdate);
    confirmationOrchestrator.on('voice_confirmation_started', handleVoiceConfirmationStart);
    confirmationOrchestrator.on('visual_confirmation_started', handleVisualConfirmationStart);
    confirmationOrchestrator.on('multi_step_started', handleMultiStepStart);
    confirmationOrchestrator.on('confirmation_completed', handleConfirmationComplete);
    confirmationOrchestrator.on('multi_step_completed', handleMultiStepComplete);
    confirmationOrchestrator.on('voice_fallback', handleVoiceFallback);
    confirmationOrchestrator.on('visual_mode_forced', handleVoiceFallback);

    return () => {
      confirmationOrchestrator.removeAllListeners();
    };
  }, []);

  // Configure voice integration
  useEffect(() => {
    if (voiceEnabled && voice) {
      confirmationOrchestrator.updateConfig({
        voice: {
          ...DEFAULT_CONFIRMATION_CONFIG.voice,
          enabled: true
        }
      });

      // Enable voice confirmation if voice system is available
      if (voice.isConnected) {
        confirmationOrchestrator.enableVoiceConfirmation();
      }
    } else {
      confirmationOrchestrator.updateConfig({
        voice: {
          ...DEFAULT_CONFIRMATION_CONFIG.voice,
          enabled: false
        }
      });
    }
  }, [voiceEnabled, voice?.isConnected]);

  // Handle voice responses
  const handleVoiceResponse = useCallback((response: ConfirmationResponse) => {
    confirmationOrchestrator.emit('voice_response', response);
  }, []);

  // Handle visual responses
  const handleVisualResponse = useCallback((response: ConfirmationResponse) => {
    confirmationOrchestrator.emit('visual_response', response);
  }, []);

  // Handle voice fallback
  const handleVoiceFallback = useCallback(() => {
    confirmationOrchestrator.emit('voice_fallback');
  }, []);

  // Handle multi-step responses
  const handleMultiStepResponse = useCallback((stepIndex: number, response: ConfirmationResponse) => {
    confirmationOrchestrator.emit('multi_step_response', { stepIndex, response });
  }, []);

  const handleMultiStepComplete = useCallback(() => {
    confirmationOrchestrator.emit('multi_step_completed', { multiStepAction });
  }, [multiStepAction]);

  const handleMultiStepCancel = useCallback(() => {
    confirmationOrchestrator.emit('multi_step_cancelled', { multiStepAction });
  }, [multiStepAction]);

  const handleMultiStepPause = useCallback(() => {
    confirmationOrchestrator.emit('multi_step_paused', { multiStepAction });
  }, [multiStepAction]);

  // Handle dialog close
  const handleDialogClose = useCallback(() => {
    const cancelResponse: ConfirmationResponse = {
      action: 'cancel',
      method: 'visual',
      timestamp: Date.now()
    };
    handleVisualResponse(cancelResponse);
  }, [handleVisualResponse]);

  return (
    <>
      {children}

      {/* Voice Confirmation Prompt */}
      {showVoicePrompt && currentAction && (
        <VoiceConfirmationPrompt
          action={currentAction}
          config={DEFAULT_CONFIRMATION_CONFIG.voice}
          onResponse={handleVoiceResponse}
          onFallbackToVisual={handleVoiceFallback}
          isActive={true}
          {...(className && { className })}
          {...(theme && { theme })}
          {...(position && { position })}
        />
      )}

      {/* Visual Confirmation Dialog */}
      {showVisualDialog && currentAction && (
        <ConfirmationDialog
          action={currentAction}
          isOpen={true}
          onConfirm={handleVisualResponse}
          onCancel={handleDialogClose}
          {...(className && { className })}
          {...(theme && { theme })}
          {...(position && { position })}
          showVoicePrompt={state.voiceConfirmationActive}
          voiceTimeout={DEFAULT_CONFIRMATION_CONFIG.timeout.default}
        />
      )}

      {/* Multi-Step Confirmation */}
      {showMultiStep && multiStepAction && (
        <MultiStepConfirmation
          multiStepAction={multiStepAction}
          isOpen={true}
          onStepConfirm={handleMultiStepResponse}
          onComplete={handleMultiStepComplete}
          onCancel={handleMultiStepCancel}
          onPause={handleMultiStepPause}
          {...(className && { className })}
          {...(theme && { theme })}
          {...(position && { position })}
        />
      )}
    </>
  );
}

// HOC for components that need confirmation capabilities
export function withConfirmation<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P & { confirmationEnabled?: boolean }> {
  return function ConfirmationWrappedComponent(props) {
    const { confirmationEnabled = true, ...componentProps } = props as P & { confirmationEnabled?: boolean };

    if (!confirmationEnabled) {
      return <Component {...(componentProps as P)} />;
    }

    return (
      <ConfirmationProvider>
        <Component {...(componentProps as P)} />
      </ConfirmationProvider>
    );
  };
}

// Context for accessing confirmation state in nested components
export const ConfirmationContext = React.createContext<{
  state: ConfirmationState;
  isProcessing: boolean;
} | null>(null);

export function useConfirmationContext() {
  const context = React.useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmationContext must be used within a ConfirmationProvider');
  }
  return context;
}