/**
 * Voice Editor Integration - Enhanced with Comprehensive Error Recovery
 *
 * React component for voice-controlled site editing with integrated error recovery.
 * Provides seamless error handling, clarification dialogs, recovery strategies,
 * and learning from user interactions.
 *
 * Features:
 * - Element selection by voice ("select the header")
 * - Property editing by voice ("change color to blue")
 * - Layout manipulation ("move it to the right")
 * - Content editing ("change text to...")
 * - Panel navigation ("open component palette")
 * - Comprehensive error recovery and clarification
 * - Real-time visual feedback and highlights
 * - Learning from voice command patterns
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Settings
} from 'lucide-react';

// Import error recovery system
import {
  createErrorRecoverySystem,
  ErrorRecoveryOrchestrator,
  ErrorDisplay,
  ClarificationPanel,
  type VoiceError,
  type ClarificationRequest,
  type ClarificationResponse,
  type ErrorRecoveryCallbacks
} from '../../services/voice/error-recovery';

export interface VoiceEditorConfig {
  enabled: boolean;
  showVisualFeedback: boolean;
  showTranscripts: boolean;
  autoActivation: boolean;
  confidenceThreshold: number;
  highlightColor: string;
  errorRecovery: {
    enabled: boolean;
    voiceFirst: boolean;
    learningEnabled: boolean;
    accessibility: boolean;
    mode: 'optimal' | 'balanced' | 'compatibility';
  };
}

export interface EditorVoiceCommand {
  command: string;
  target?: string;
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  timestamp: Date;
}

export interface VoiceEditorState {
  isListening: boolean;
  isProcessing: boolean;
  partialTranscript: string;
  finalTranscript: string;
  lastCommand: EditorVoiceCommand | null;
  selectedElements: string[];
  activeMode: 'selection' | 'editing' | 'navigation' | 'idle';
  feedbackMessage: string;
  error: VoiceError | null;
  clarificationRequest: ClarificationRequest | null;
  recoveryInProgress: boolean;
  errorRecoveryEnabled: boolean;
}

interface VoiceEditorIntegrationProps {
  config?: Partial<VoiceEditorConfig>;
  onCommand?: (command: EditorVoiceCommand) => void;
  onError?: (error: VoiceError) => void;
  onRecovery?: (success: boolean) => void;
  className?: string;
}

export const VoiceEditorIntegration: React.FC<VoiceEditorIntegrationProps> = ({
  config = {},
  onCommand,
  onError,
  onRecovery,
  className = ''
}) => {
  // Default configuration with error recovery
  const defaultConfig: VoiceEditorConfig = {
    enabled: true,
    showVisualFeedback: true,
    showTranscripts: true,
    autoActivation: false,
    confidenceThreshold: 0.7,
    highlightColor: '#3b82f6',
    errorRecovery: {
      enabled: true,
      voiceFirst: true,
      learningEnabled: true,
      accessibility: true,
      mode: 'balanced'
    }
  };

  const editorConfig = { ...defaultConfig, ...config };

  // State management
  const [state, setState] = useState<VoiceEditorState>({
    isListening: false,
    isProcessing: false,
    partialTranscript: '',
    finalTranscript: '',
    lastCommand: null,
    selectedElements: [],
    activeMode: 'idle',
    feedbackMessage: '',
    error: null,
    clarificationRequest: null,
    recoveryInProgress: false,
    errorRecoveryEnabled: editorConfig.errorRecovery.enabled
  });

  // Refs
  const errorRecoveryRef = useRef<ErrorRecoveryOrchestrator | null>(null);

  // Initialize error recovery system
  useEffect(() => {
    if (editorConfig.errorRecovery.enabled && !errorRecoveryRef.current) {
      const initializeErrorRecovery = async () => {
        try {
          const errorRecoveryCallbacks: ErrorRecoveryCallbacks = {
            onErrorDetected: (error) => {
              console.log('Voice error detected:', error);
              setState(prev => ({ ...prev, error }));
              onError?.(error);
            },
            onClarificationRequested: (request) => {
              console.log('Clarification requested:', request);
              setState(prev => ({ ...prev, clarificationRequest: request }));
            },
            onRecoveryStarted: (strategy) => {
              console.log('Recovery started:', strategy);
              setState(prev => ({
                ...prev,
                recoveryInProgress: true,
                feedbackMessage: `Starting recovery: ${strategy.name}`
              }));
            },
            onRecoveryCompleted: (success, result) => {
              console.log('Recovery completed:', success, result);
              setState(prev => ({
                ...prev,
                recoveryInProgress: false,
                feedbackMessage: success ? 'Issue resolved!' : 'Recovery failed',
                error: success ? null : prev.error
              }));
              onRecovery?.(success);
            },
            onUserFeedback: (feedback) => {
              console.log('User feedback received:', feedback);
            }
          };

          const errorRecoverySystem = await createErrorRecoverySystem({
            mode: editorConfig.errorRecovery.mode,
            voiceFirst: editorConfig.errorRecovery.voiceFirst,
            learningEnabled: editorConfig.errorRecovery.learningEnabled,
            accessibility: editorConfig.errorRecovery.accessibility,
            theme: 'auto'
          }, errorRecoveryCallbacks);

          errorRecoveryRef.current = errorRecoverySystem;

          setState(prev => ({
            ...prev,
            errorRecoveryEnabled: true,
            feedbackMessage: 'Voice error recovery ready'
          }));

          console.log('Error recovery system initialized for voice editor');
        } catch (error) {
          console.error('Failed to initialize error recovery system:', error);
          setState(prev => ({
            ...prev,
            errorRecoveryEnabled: false,
            feedbackMessage: 'Error recovery unavailable'
          }));
        }
      };

      initializeErrorRecovery();
    }

    return () => {
      // Cleanup on unmount
      if (errorRecoveryRef.current) {
        errorRecoveryRef.current.cleanup();
      }
    };
  }, [editorConfig.errorRecovery]);

  // Enhanced voice command processing with error recovery
  const processVoiceCommand = useCallback(async (transcript: string, confidence: number) => {
    setState(prev => ({ ...prev, isProcessing: true, finalTranscript: transcript }));

    try {
      // Simulate voice command processing
      const command = await parseVoiceCommand(transcript, confidence);

      if (command.confidence < editorConfig.confidenceThreshold) {
        // Low confidence - trigger error recovery
        const lowConfidenceError = new Error(`Low confidence in voice command: "${transcript}"`);
        (lowConfidenceError as any).code = 'VOICE_LOW_CONFIDENCE';
        (lowConfidenceError as any).confidence = confidence;
        (lowConfidenceError as any).originalCommand = transcript;

        if (errorRecoveryRef.current) {
          await errorRecoveryRef.current.handleError(lowConfidenceError, {
            sessionId: 'voice_editor',
            pageUrl: window.location.href,
            userRole: 'editor',
            deviceType: 'desktop',
            browserInfo: {
              name: navigator.userAgent,
              version: '',
              platform: navigator.platform,
              capabilities: {
                audioWorklet: false,
                webSpeech: false,
                mediaRecorder: false,
                websockets: false,
                localStorage: false
              }
            },
            voiceConfig: {
              sttProvider: 'default',
              ttsProvider: 'default',
              language: 'en-US',
              confidenceThreshold: 0.7,
              noiseReduction: false
            },
            recentCommands: [],
            currentMode: 'editor'
          });
        } else {
          // Fallback error handling
          setState(prev => ({
            ...prev,
            error: createFallbackError('VOICE_LOW_CONFIDENCE', lowConfidenceError.message),
            feedbackMessage: "I didn't catch that clearly. Could you repeat your command?"
          }));
        }
        return;
      }

      // Execute the voice command
      await executeVoiceCommand(command);

    } catch (error) {
      console.error('Voice command processing error:', error);

      if (errorRecoveryRef.current) {
        await errorRecoveryRef.current.handleError(error, {
          sessionId: 'voice_editor',
          pageUrl: window.location.href,
          userRole: 'editor',
          deviceType: 'desktop',
          browserInfo: {
            name: navigator.userAgent,
            version: '',
            platform: navigator.platform,
            capabilities: {
              audioWorklet: false,
              webSpeech: false,
              mediaRecorder: false,
              websockets: false,
              localStorage: false
            }
          },
          voiceConfig: {
            sttProvider: 'default',
            ttsProvider: 'default',
            language: 'en-US',
            confidenceThreshold: 0.7,
            noiseReduction: false
          },
          recentCommands: [],
          currentMode: 'editor'
        });
      } else {
        // Fallback error handling
        setState(prev => ({
          ...prev,
          error: createFallbackError('SYSTEM_API_FAILURE', error instanceof Error ? error.message : 'Unknown error'),
          feedbackMessage: 'An error occurred while processing your command'
        }));
      }
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [editorConfig.confidenceThreshold]);

  // Voice command parsing
  const parseVoiceCommand = async (transcript: string, confidence: number): Promise<EditorVoiceCommand> => {
    // Simulate command parsing with potential errors
    if (transcript.toLowerCase().includes('element not found test')) {
      const error = new Error('Target element could not be found on the page');
      (error as any).code = 'ACTION_ELEMENT_NOT_FOUND';
      throw error;
    }

    if (transcript.toLowerCase().includes('ambiguous test')) {
      const error = new Error('Command is ambiguous - multiple interpretations possible');
      (error as any).code = 'INTENT_AMBIGUOUS';
      throw error;
    }

    // Normal command parsing
    return {
      command: transcript,
      action: inferActionFromTranscript(transcript),
      parameters: extractParametersFromTranscript(transcript),
      confidence,
      timestamp: new Date()
    };
  };

  // Voice command execution
  const executeVoiceCommand = async (command: EditorVoiceCommand): Promise<void> => {
    setState(prev => ({
      ...prev,
      lastCommand: command,
      feedbackMessage: `Executing: ${command.action}`,
      activeMode: getCommandMode(command.action)
    }));

    try {
      // Simulate command execution
      switch (command.action) {
        case 'select_element':
          await handleElementSelection(command);
          break;
        case 'edit_property':
          await handlePropertyEdit(command);
          break;
        case 'navigate_panel':
          await handlePanelNavigation(command);
          break;
        case 'edit_content':
          await handleContentEdit(command);
          break;
        default:
          throw new Error(`Unknown command action: ${command.action}`);
      }

      setState(prev => ({
        ...prev,
        feedbackMessage: `Command completed: ${command.action}`,
        activeMode: 'idle'
      }));

      onCommand?.(command);

    } catch (error) {
      console.error('Command execution error:', error);

      // Let error recovery system handle execution errors
      if (errorRecoveryRef.current) {
        await errorRecoveryRef.current.handleError(error, {
          sessionId: 'voice_editor',
          pageUrl: window.location.href,
          userRole: 'editor',
          deviceType: 'desktop',
          browserInfo: {
            name: navigator.userAgent,
            version: '',
            platform: navigator.platform,
            capabilities: {
              audioWorklet: false,
              webSpeech: false,
              mediaRecorder: false,
              websockets: false,
              localStorage: false
            }
          },
          voiceConfig: {
            sttProvider: 'default',
            ttsProvider: 'default',
            language: 'en-US',
            confidenceThreshold: 0.7,
            noiseReduction: false
          },
          recentCommands: [],
          currentMode: 'editor'
        });
      } else {
        setState(prev => ({
          ...prev,
          error: createFallbackError('ACTION_ELEMENT_NOT_FOUND', 'Command execution failed'),
          feedbackMessage: 'Failed to execute command'
        }));
      }
    }
  };

  // Handle clarification response
  const handleClarificationResponse = useCallback(async (response: ClarificationResponse) => {
    if (!errorRecoveryRef.current || !state.clarificationRequest) {return;}

    try {
      const result = await errorRecoveryRef.current.processClarificationResponse(
        response.requestId,
        response
      );

      if (result.resolved) {
        setState(prev => ({
          ...prev,
          clarificationRequest: null,
          feedbackMessage: 'Clarification resolved. Continuing...'
        }));
      } else if (result.followUpRequest) {
        setState(prev => ({
          ...prev,
          clarificationRequest: result.followUpRequest ?? null
        }));
      }
    } catch (error) {
      console.error('Failed to process clarification response:', error);
      setState(prev => ({
        ...prev,
        clarificationRequest: null,
        feedbackMessage: 'Failed to process clarification'
      }));
    }
  }, [state.clarificationRequest]);

  // Dismiss error
  const handleErrorDismiss = useCallback(async (reason: 'user_action' | 'auto_hide' | 'resolved') => {
    if (state.error && errorRecoveryRef.current) {
      await errorRecoveryRef.current.dismissError(state.error.id, reason);
    }

    setState(prev => ({
      ...prev,
      error: null,
      feedbackMessage: 'Error dismissed'
    }));
  }, [state.error]);

  // Cancel clarification
  const handleClarificationCancel = useCallback(() => {
    setState(prev => ({
      ...prev,
      clarificationRequest: null,
      feedbackMessage: 'Clarification cancelled'
    }));
  }, []);

  // Toggle listening state
  const toggleListening = useCallback(() => {
    if (state.isListening) {
      // Stop listening
      setState(prev => ({
        ...prev,
        isListening: false,
        partialTranscript: '',
        feedbackMessage: 'Voice input stopped'
      }));
    } else {
      // Start listening
      setState(prev => ({
        ...prev,
        isListening: true,
        feedbackMessage: 'Listening for voice commands...'
      }));

      // Simulate voice recognition (in real implementation, this would integrate with voice services)
      simulateVoiceRecognition();
    }
  }, [state.isListening]);

  // Simulate voice recognition for demonstration
  const simulateVoiceRecognition = () => {
    // This is for demonstration - real implementation would use voice services
    setTimeout(() => {
      const testCommands = [
        { text: "select the header", confidence: 0.95 },
        { text: "change color to blue", confidence: 0.85 },
        { text: "element not found test", confidence: 0.9 }, // Triggers error
        { text: "ambiguous test command", confidence: 0.8 }, // Triggers clarification
        { text: "mumbled unclear command", confidence: 0.4 } // Low confidence
      ];

      const randomCommand = testCommands[Math.floor(Math.random() * testCommands.length)];
      if (randomCommand) {
        processVoiceCommand(randomCommand.text, randomCommand.confidence);
      }

      setState(prev => ({ ...prev, isListening: false }));
    }, 2000);
  };

  // Render status indicator
  const statusSnapshot = (() => {
    if (state.recoveryInProgress) {
      return {
        label: 'Recovering',
        icon: <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-300 animate-spin" />,
        badgeClass: 'bg-blue-100/80 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
        ringClass: 'border-blue-200/70 bg-blue-50/70 dark:border-blue-500/40 dark:bg-blue-500/10'
      };
    }
    if (state.error) {
      return {
        label: 'Attention needed',
        icon: <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-300" />,
        badgeClass: 'bg-red-100/80 text-red-700 dark:bg-red-500/20 dark:text-red-200',
        ringClass: 'border-red-200/70 bg-red-50/70 dark:border-red-500/40 dark:bg-red-500/10'
      };
    }
    if (state.clarificationRequest) {
      return {
        label: 'Clarifying',
        icon: <HelpCircle className="h-5 w-5 text-amber-500 dark:text-amber-300" />,
        badgeClass: 'bg-amber-100/80 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
        ringClass: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
      };
    }
    if (state.isListening) {
      return {
        label: 'Listening',
        icon: <Mic className="h-5 w-5 text-emerald-500 dark:text-emerald-300" />,
        badgeClass: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
        ringClass: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10'
      };
    }
    if (state.isProcessing) {
      return {
        label: 'Processing',
        icon: <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-300 animate-spin" />,
        badgeClass: 'bg-blue-100/80 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
        ringClass: 'border-blue-200/70 bg-blue-50/70 dark:border-blue-500/40 dark:bg-blue-500/10'
      };
    }
    if (state.lastCommand) {
      return {
        label: 'Command complete',
        icon: <CheckCircle className="h-5 w-5 text-emerald-500 dark:text-emerald-300" />,
        badgeClass: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
        ringClass: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10'
      };
    }
    return {
      label: 'Idle',
      icon: <MicOff className="h-5 w-5 text-slate-400 dark:text-slate-500" />,
      badgeClass: 'bg-slate-100/80 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
      ringClass: 'border-slate-200/70 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-800/60'
    };
  })();

  const hasTranscripts = editorConfig.showTranscripts && Boolean(state.partialTranscript || state.finalTranscript);
  const lastCommandConfidence = state.lastCommand ? Math.round(state.lastCommand.confidence * 100) : 0;
  const clampedConfidence = Math.max(0, Math.min(100, lastCommandConfidence));
  const lastCommandTimestamp = state.lastCommand ? new Date(state.lastCommand.timestamp).toLocaleTimeString() : '';
  const selectedElementsPreview = state.selectedElements.slice(0, 2).join(', ');
  const extraSelectedCount = Math.max(state.selectedElements.length - 2, 0);

  const sectionClassName = `
    relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur-lg
    dark:border-slate-700/70 dark:bg-slate-900/60 dark:shadow-black/20
  `.trim();

  return (
    <div className={`voice-editor-integration ${className}`}>
      <div className="space-y-5">
        <section className={sectionClassName}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/15 via-transparent to-purple-500/15 dark:from-blue-500/10 dark:via-transparent dark:to-purple-500/10" />
          <div className="relative flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${statusSnapshot.ringClass} shadow-sm`}>
                  {statusSnapshot.icon}
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Voice Editing</p>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Natural command workspace</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Guide the editor hands-free with responsive feedback.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleListening}
                  disabled={state.isProcessing || state.recoveryInProgress}
                  className={`
                    inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900/10 dark:focus-visible:ring-white/30
                    disabled:cursor-not-allowed disabled:opacity-60
                    ${state.isListening
                      ? 'border-red-500/30 bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/20 hover:from-red-600 hover:to-rose-600'
                      : 'border-blue-500/30 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-indigo-700'
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    {state.isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span>{state.isListening ? 'Stop Listening' : 'Start Voice Input'}</span>
                  </span>
                </button>

                {state.errorRecoveryEnabled && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <Settings className="h-3.5 w-3.5" />
                    Recovery On
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusSnapshot.badgeClass}`}>
                <span className="inline-flex h-2 w-2 rounded-full bg-current" />
                {statusSnapshot.label}
              </span>

              {state.feedbackMessage && (
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  {state.feedbackMessage}
                </span>
              )}
            </div>
          </div>
        </section>

        {(hasTranscripts || state.lastCommand) && (
          <div className="grid gap-4 md:grid-cols-2">
            {hasTranscripts && (
              <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60">
                <header className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Voice Input</span>
                  {state.isProcessing && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Processing
                    </span>
                  )}
                </header>
                <div className="mt-3 space-y-2 text-sm">
                  {state.partialTranscript && (
                    <p className="rounded-lg border border-slate-200/60 bg-slate-50/60 px-3 py-2 text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Partial</span>: {state.partialTranscript}
                    </p>
                  )}
                  {state.finalTranscript && (
                    <p className="rounded-lg border border-blue-200/60 bg-blue-50/60 px-3 py-2 text-slate-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                      <span className="font-medium text-blue-600 dark:text-blue-200">Final</span>: {state.finalTranscript}
                    </p>
                  )}
                </div>
              </section>
            )}

            {state.lastCommand && (
              <section className="rounded-2xl border border-emerald-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-emerald-500/30 dark:bg-slate-900/60">
                <header className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Last Command</span>
                  {lastCommandTimestamp && (
                    <span className="text-xs text-emerald-500 dark:text-emerald-200">{lastCommandTimestamp}</span>
                  )}
                </header>
                <dl className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Command</dt>
                    <dd className="mt-1 rounded-lg bg-slate-900/5 px-3 py-2 text-slate-700 dark:bg-white/5 dark:text-slate-200">{state.lastCommand?.command}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Action</dt>
                    <dd className="capitalize text-slate-700 dark:text-slate-200">{state.lastCommand?.action.replace(/_/g, ' ')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-500 dark:text-slate-400">Confidence</dt>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 dark:bg-emerald-300" style={{ width: `${clampedConfidence}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-200">{lastCommandConfidence}%</span>
                    </div>
                  </div>
                </dl>
              </section>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Active Mode</p>
            <p className="mt-2 text-base font-semibold capitalize text-slate-900 dark:text-white">{state.activeMode}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Current voice interaction focus.</p>
          </section>
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Selections</p>
            <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{state.selectedElements.length ? `${state.selectedElements.length} selected` : 'None'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {state.selectedElements.length
                ? `${selectedElementsPreview}${extraSelectedCount > 0 ? ` +${extraSelectedCount}` : ''}`
                : 'Use "select" commands to target elements.'}
            </p>
          </section>
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Confidence</p>
            <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{Math.round(editorConfig.confidenceThreshold * 100)}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Minimum recognition threshold.</p>
          </section>
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Auto Activation</p>
            <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{editorConfig.autoActivation ? 'Enabled' : 'Manual'}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{editorConfig.autoActivation ? 'Listens for wake words automatically.' : 'Tap the control to start listening.'}</p>
          </section>
        </div>

        {state.error && (
          <ErrorDisplay
            error={state.error!}
            onDismiss={handleErrorDismiss}
            onRetry={() => {
              if (state.finalTranscript && state.error) {
                processVoiceCommand(state.finalTranscript, state.error.details.transcriptConfidence || 0.8);
              }
            }}
            onRequestHelp={() => {
              if (state.error) {
                console.log('Help requested for error:', state.error.id);
              }
            }}
            showRecoveryOptions={true}
            voiceAnnouncement={editorConfig.errorRecovery.voiceFirst}
          />
        )}

        {state.clarificationRequest && (
          <ClarificationPanel
            request={state.clarificationRequest!}
            onResponse={handleClarificationResponse}
            onCancel={handleClarificationCancel}
            voiceEnabled={editorConfig.errorRecovery.voiceFirst}
            showProgressiveOptions={true}
          />
        )}

                {state.recoveryInProgress && (
          <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/80 via-white to-blue-100/60 p-4 text-blue-700 shadow-sm dark:border-blue-500/40 dark:from-blue-900/20 dark:via-transparent dark:to-blue-900/30 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Recovery in progress...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper functions
function createFallbackError(code: string, message: string): VoiceError {
  return {
    id: `fallback_${Date.now()}`,
    code: code as any,
    type: 'system',
    severity: 'medium',
    message,
    details: {},
    context: {} as any,
    timestamp: new Date(),
    retryable: true,
    fallbackAvailable: true,
    recoveryStrategies: [],
    clarificationRequired: false,
    userImpact: 'moderate'
  };
}

function inferActionFromTranscript(transcript: string): string {
  const lower = transcript.toLowerCase();

  if (lower.includes('select') || lower.includes('choose')) {return 'select_element';}
  if (lower.includes('change') || lower.includes('modify')) {return 'edit_property';}
  if (lower.includes('open') || lower.includes('navigate')) {return 'navigate_panel';}
  if (lower.includes('edit') || lower.includes('write')) {return 'edit_content';}

  return 'unknown_action';
}

function extractParametersFromTranscript(transcript: string): Record<string, any> {
  // Simple parameter extraction
  const params: Record<string, any> = {};

  const colorMatch = transcript.match(/(?:color|colour)\s+(?:to\s+)?(\w+)/i);
  if (colorMatch) {
    params['color'] = colorMatch[1];
  }

  const textMatch = transcript.match(/(?:text|content)\s+(?:to\s+)?["']([^"']+)["']/i);
  if (textMatch) {
    params['text'] = textMatch[1];
  }

  return params;
}

function getCommandMode(action: string): 'selection' | 'editing' | 'navigation' | 'idle' {
  switch (action) {
    case 'select_element': return 'selection';
    case 'edit_property':
    case 'edit_content': return 'editing';
    case 'navigate_panel': return 'navigation';
    default: return 'idle';
  }
}

// Mock command handlers
async function handleElementSelection(command: EditorVoiceCommand): Promise<void> {
  console.log('Selecting element:', command.parameters);
  // Simulate potential element not found error
  if (Math.random() < 0.2) {
    throw new Error('Target element not found on the page');
  }
}

async function handlePropertyEdit(command: EditorVoiceCommand): Promise<void> {
  console.log('Editing property:', command.parameters);
  // Simulate property editing
}

async function handlePanelNavigation(command: EditorVoiceCommand): Promise<void> {
  console.log('Navigating panel:', command.parameters);
  // Simulate panel navigation
}

async function handleContentEdit(command: EditorVoiceCommand): Promise<void> {
  console.log('Editing content:', command.parameters);
  // Simulate content editing
}

export default VoiceEditorIntegration;
