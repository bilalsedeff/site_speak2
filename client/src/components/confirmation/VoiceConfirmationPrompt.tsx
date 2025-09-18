import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  CheckCircle,
  XCircle,
  Pause,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ConfirmationAction, ConfirmationResponse, VoiceConfirmationConfig } from '@shared/types/confirmation';

// Web Speech API type declarations
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface VoiceConfirmationPromptProps {
  action: ConfirmationAction;
  config: VoiceConfirmationConfig;
  onResponse: (response: ConfirmationResponse) => void;
  onFallbackToVisual: () => void;
  isActive: boolean;
  className?: string;
}

interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  recognizedText: string;
  partialText: string;
  confidence: number;
  error: string | null;
}

const CONFIRMATION_PHRASES = {
  confirm: ['yes', 'confirm', 'proceed', 'do it', 'go ahead', 'continue'],
  cancel: ['no', 'cancel', 'stop', 'abort', 'dont', 'nope'],
  repeat: ['repeat', 'say again', 'pardon', 'what']
} as const;

export function VoiceConfirmationPrompt({
  action,
  config,
  onResponse,
  onFallbackToVisual,
  isActive,
  className
}: VoiceConfirmationPromptProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    audioLevel: 0,
    recognizedText: '',
    partialText: '',
    confidence: 0,
    error: null
  });

  const [timeRemaining, setTimeRemaining] = useState(config.timeout);
  const [hasSpoken, setHasSpoken] = useState(false);
  const [canRetry, _setCanRetry] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const timeoutRef = useRef<NodeJS.Timeout>();
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance>();
  const recognitionRef = useRef<any>();

  // Initialize speech recognition
  useEffect(() => {
    if (!isActive || !config.enabled) {return;}

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceState(prev => ({
        ...prev,
        error: 'Speech recognition not supported in this browser'
      }));
      onFallbackToVisual();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceState(prev => ({ ...prev, isListening: true, error: null }));
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript || '';
        if (result?.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const lastResult = event.results[event.results.length - 1];
      const confidence = lastResult?.[0]?.confidence || 0;

      setVoiceState(prev => ({
        ...prev,
        recognizedText: finalTranscript,
        partialText: interimTranscript,
        confidence,
        isProcessing: finalTranscript.length > 0
      }));

      // Process final transcript
      if (finalTranscript) {
        processVoiceCommand(finalTranscript.toLowerCase().trim(), confidence);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setVoiceState(prev => ({
        ...prev,
        error: `Speech recognition error: ${event.error}`,
        isListening: false
      }));

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        onFallbackToVisual();
      }
    };

    recognition.onend = () => {
      setVoiceState(prev => ({ ...prev, isListening: false }));
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [isActive, config.enabled]);

  // Start voice prompt
  useEffect(() => {
    if (isActive && config.enabled && !hasSpoken) {
      speakPrompt();
      startListening();
      startTimeout();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (speechSynthesisRef.current) {
        speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isActive, config.enabled, hasSpoken]);

  // Timeout countdown
  useEffect(() => {
    if (!isActive || timeRemaining <= 0) {return;}

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 100) {
          onFallbackToVisual();
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, timeRemaining]);

  const speakPrompt = useCallback(() => {
    if (!config.enabled || voiceState.isSpeaking) {return;}

    const promptText = generatePromptText(action);
    const utterance = new SpeechSynthesisUtterance(promptText);

    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;

    utterance.onstart = () => {
      setVoiceState(prev => ({ ...prev, isSpeaking: true }));
    };

    utterance.onend = () => {
      setVoiceState(prev => ({ ...prev, isSpeaking: false }));
      setHasSpoken(true);
    };

    utterance.onerror = () => {
      setVoiceState(prev => ({ ...prev, isSpeaking: false, error: 'Text-to-speech failed' }));
    };

    speechSynthesisRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [action, config.enabled, voiceState.isSpeaking]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || voiceState.isListening) {return;}

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      setVoiceState(prev => ({
        ...prev,
        error: 'Failed to start voice recognition'
      }));
    }
  }, [voiceState.isListening]);

  const startTimeout = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      if (config.fallbackToVisual) {
        onFallbackToVisual();
      }
    }, config.timeout);
  }, [config.timeout, config.fallbackToVisual]);

  const processVoiceCommand = useCallback((text: string, confidence: number) => {
    if (confidence < config.confidence_threshold) {
      return; // Ignore low confidence results
    }

    const isConfirm = CONFIRMATION_PHRASES.confirm.some(phrase =>
      text.includes(phrase)
    );
    const isCancel = CONFIRMATION_PHRASES.cancel.some(phrase =>
      text.includes(phrase)
    );
    const isRepeat = CONFIRMATION_PHRASES.repeat.some(phrase =>
      text.includes(phrase)
    );

    if (isRepeat && retryCount < 2) {
      setRetryCount(prev => prev + 1);
      setHasSpoken(false);
      setTimeRemaining(config.timeout);
      speakPrompt();
      return;
    }

    if (isConfirm || isCancel) {
      const response: ConfirmationResponse = {
        action: isConfirm ? 'confirm' : 'cancel',
        method: 'voice',
        timestamp: Date.now(),
        confidence
      };

      setVoiceState(prev => ({ ...prev, isProcessing: false }));
      onResponse(response);
    }
  }, [config.confidence_threshold, retryCount, onResponse, speakPrompt]);

  const handleManualAction = useCallback((actionType: 'confirm' | 'cancel') => {
    const response: ConfirmationResponse = {
      action: actionType,
      method: 'visual',
      timestamp: Date.now()
    };
    onResponse(response);
  }, [onResponse]);

  const handleRetry = useCallback(() => {
    if (!canRetry || retryCount >= 2) {return;}

    setRetryCount(prev => prev + 1);
    setHasSpoken(false);
    setTimeRemaining(config.timeout);
    setVoiceState(prev => ({
      ...prev,
      recognizedText: '',
      partialText: '',
      error: null,
      isProcessing: false
    }));

    speakPrompt();
    startListening();
  }, [canRetry, retryCount, config.timeout, speakPrompt, startListening]);

  const toggleMute = useCallback(() => {
    if (voiceState.isSpeaking) {
      speechSynthesis.cancel();
    } else if (hasSpoken) {
      speakPrompt();
    }
  }, [voiceState.isSpeaking, hasSpoken, speakPrompt]);

  const timeoutProgress = (timeRemaining / config.timeout) * 100;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'bg-card border border-border rounded-xl shadow-lg p-6',
            'max-w-md mx-auto',
            className
          )}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold mb-2">Voice Confirmation</h3>
            <p className="text-sm text-muted-foreground">
              Say "yes" to confirm or "no" to cancel
            </p>
          </div>

          {/* Voice status indicator */}
          <div className="flex items-center justify-center mb-6">
            <motion.div
              className={cn(
                'relative w-20 h-20 rounded-full flex items-center justify-center',
                voiceState.isListening && 'bg-green-100 border-2 border-green-300',
                voiceState.isSpeaking && 'bg-blue-100 border-2 border-blue-300',
                voiceState.isProcessing && 'bg-amber-100 border-2 border-amber-300',
                voiceState.error && 'bg-red-100 border-2 border-red-300',
                !voiceState.isListening && !voiceState.isSpeaking && !voiceState.isProcessing && !voiceState.error && 'bg-muted'
              )}
              animate={voiceState.isListening ? {
                scale: [1, 1.1, 1],
                transition: { duration: 1.5, repeat: Infinity }
              } : {}}
            >
              {voiceState.isSpeaking && <Volume2 className="w-8 h-8 text-blue-600" />}
              {voiceState.isListening && <Mic className="w-8 h-8 text-green-600" />}
              {voiceState.isProcessing && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full"
                />
              )}
              {voiceState.error && <MicOff className="w-8 h-8 text-red-600" />}

              {/* Audio level visualization */}
              {voiceState.isListening && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-green-400"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5]
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
              )}
            </motion.div>
          </div>

          {/* Timeout progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Time remaining</span>
              <span className="text-xs font-medium">
                {Math.ceil(timeRemaining / 1000)}s
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <motion.div
                className="h-2 bg-primary rounded-full"
                initial={{ width: '100%' }}
                animate={{ width: `${timeoutProgress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>
          </div>

          {/* Recognized text */}
          {(voiceState.recognizedText || voiceState.partialText) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-muted/50 rounded-lg"
            >
              <p className="text-sm">
                <span className="font-medium text-foreground">
                  {voiceState.recognizedText}
                </span>
                <span className="text-muted-foreground">
                  {voiceState.partialText}
                </span>
              </p>
              {voiceState.confidence > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Confidence: {Math.round(voiceState.confidence * 100)}%
                </p>
              )}
            </motion.div>
          )}

          {/* Error message */}
          {voiceState.error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <p className="text-sm text-red-700">{voiceState.error}</p>
            </motion.div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              disabled={!hasSpoken && !voiceState.isSpeaking}
              className="gap-2"
            >
              {voiceState.isSpeaking ? (
                <>
                  <VolumeX className="w-4 h-4" />
                  Mute
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  Repeat
                </>
              )}
            </Button>

            {canRetry && retryCount < 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Retry
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={onFallbackToVisual}
              className="gap-2"
            >
              <Pause className="w-4 h-4" />
              Use Visual
            </Button>
          </div>

          {/* Manual confirmation buttons */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => handleManualAction('cancel')}
              className="flex-1 gap-2"
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={() => handleManualAction('confirm')}
              className="flex-1 gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Confirm
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function generatePromptText(action: ConfirmationAction): string {
  const riskLevel = action.riskLevel;
  const targetName = action.context.targetName;
  const actionType = action.context.type;

  let promptText = `You are about to ${actionType} ${targetName}. `;

  switch (riskLevel) {
    case 'critical':
      promptText += `This is a critical action that may be irreversible. `;
      break;
    case 'high':
      promptText += `This is a high-risk action that will have significant impact. `;
      break;
    case 'medium':
      promptText += `This action will have moderate impact. `;
      break;
    case 'low':
      promptText += `This is a low-risk action. `;
      break;
  }

  promptText += `Say "yes" to confirm, or "no" to cancel.`;

  return promptText;
}