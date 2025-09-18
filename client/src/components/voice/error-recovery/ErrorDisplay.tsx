/**
 * Error Display Component
 *
 * React component for displaying voice errors with modern UI design,
 * accessibility compliance, and voice-first communication.
 * Provides clear error messages, recovery options, and user-friendly interactions.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, RefreshCw, HelpCircle, X, Volume2, VolumeX } from 'lucide-react';
import {
  VoiceError,
  ErrorUIConfig
} from '@shared/types/error-recovery.types';

interface ErrorDisplayProps {
  error: VoiceError;
  config?: Partial<ErrorUIConfig>;
  onDismiss?: (reason: 'user_action' | 'auto_hide' | 'resolved') => void;
  onRetry?: () => void;
  onRequestHelp?: () => void;
  onRecoverySelected?: (strategyId: string) => void;
  showRecoveryOptions?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
  voiceAnnouncement?: boolean;
}

interface ErrorDisplayState {
  visible: boolean;
  expanded: boolean;
  voiceEnabled: boolean;
  animating: boolean;
  timeRemaining: number;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  config = {},
  onDismiss,
  onRetry,
  onRequestHelp,
  onRecoverySelected,
  showRecoveryOptions = true,
  autoHide = true,
  autoHideDelay = 5000,
  voiceAnnouncement = true
}) => {
  const [state, setState] = useState<ErrorDisplayState>({
    visible: true,
    expanded: false,
    voiceEnabled: voiceAnnouncement,
    animating: false,
    timeRemaining: autoHideDelay
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);
  const autoHideRef = useRef<NodeJS.Timeout>();
  const countdownRef = useRef<NodeJS.Timeout>();

  // Configuration with defaults
  const uiConfig = {
    theme: 'auto',
    position: 'center',
    voiceFirst: true,
    accessibility: true,
    animations: true,
    compactMode: false,
    ...config
  };

  // Auto-hide countdown
  useEffect(() => {
    if (autoHide && state.visible) {
      countdownRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          timeRemaining: Math.max(0, prev.timeRemaining - 100)
        }));
      }, 100);

      autoHideRef.current = setTimeout(() => {
        handleDismiss('auto_hide');
      }, autoHideDelay);

      return () => {
        if (countdownRef.current) {clearInterval(countdownRef.current);}
        if (autoHideRef.current) {clearTimeout(autoHideRef.current);}
      };
    }
    return undefined;
  }, [autoHide, autoHideDelay, state.visible]);

  // Voice announcement
  useEffect(() => {
    if (state.voiceEnabled && announceRef.current) {
      // Screen reader announcement
      announceRef.current.textContent = `Error: ${error.message}`;
    }
  }, [error.message, state.voiceEnabled]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!state.visible) {return;}

      switch (event.key) {
        case 'Escape':
          handleDismiss('user_action');
          break;
        case 'Enter':
          if (error.retryable) {
            handleRetry();
          }
          break;
        case 'h':
        case 'H':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            handleRequestHelp();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.visible, error.retryable]);

  // Focus management
  useEffect(() => {
    if (state.visible && containerRef.current) {
      containerRef.current.focus();
    }
  }, [state.visible]);

  const handleDismiss = useCallback((reason: 'user_action' | 'auto_hide' | 'resolved') => {
    setState(prev => ({ ...prev, animating: true }));

    setTimeout(() => {
      setState(prev => ({ ...prev, visible: false }));
      onDismiss?.(reason);
    }, uiConfig.animations ? 200 : 0);

    // Clear timers
    if (autoHideRef.current) {clearTimeout(autoHideRef.current);}
    if (countdownRef.current) {clearInterval(countdownRef.current);}
  }, [onDismiss, uiConfig.animations]);

  const handleRetry = useCallback(() => {
    setState(prev => ({ ...prev, animating: true }));
    onRetry?.();
  }, [onRetry]);

  const handleRequestHelp = useCallback(() => {
    setState(prev => ({ ...prev, expanded: true }));
    onRequestHelp?.();
  }, [onRequestHelp]);

  const handleRecoverySelection = useCallback((strategyId: string) => {
    onRecoverySelected?.(strategyId);
  }, [onRecoverySelected]);

  const toggleExpanded = useCallback(() => {
    setState(prev => ({ ...prev, expanded: !prev.expanded }));
  }, []);

  const toggleVoice = useCallback(() => {
    setState(prev => ({ ...prev, voiceEnabled: !prev.voiceEnabled }));
  }, []);

  const getErrorIcon = () => {
    switch (error.severity) {
      case 'critical':
        return <AlertCircle className="text-red-500" size={24} />;
      case 'high':
        return <AlertCircle className="text-orange-500" size={24} />;
      case 'medium':
        return <AlertCircle className="text-yellow-500" size={24} />;
      case 'low':
        return <AlertCircle className="text-blue-500" size={24} />;
      default:
        return <AlertCircle className="text-gray-500" size={24} />;
    }
  };

  const getErrorTitle = () => {
    const titles = {
      'VOICE_LOW_CONFIDENCE': 'Voice Not Clear',
      'VOICE_NOISE_INTERFERENCE': 'Background Noise Detected',
      'INTENT_AMBIGUOUS': 'Command Unclear',
      'ACTION_ELEMENT_NOT_FOUND': 'Element Not Found',
      'SYSTEM_API_FAILURE': 'Service Issue',
      'CONTEXT_UNAVAILABLE_ACTION': 'Action Not Available'
    } as any;

    return titles[error.code] || 'Voice Assistant Issue';
  };

  const getProgressBarColor = () => {
    const progress = (state.timeRemaining / autoHideDelay) * 100;
    if (progress > 60) {return 'bg-green-500';}
    if (progress > 30) {return 'bg-yellow-500';}
    return 'bg-red-500';
  };

  if (!state.visible) {return null;}

  return (
    <>
      {/* Screen reader announcement */}
      <div
        ref={announceRef}
        className="sr-only"
        aria-live="assertive"
        aria-atomic="true"
      />

      {/* Main error display */}
      <div
        ref={containerRef}
        className={`
          fixed inset-0 z-50 flex items-center justify-center p-4
          ${uiConfig.animations && state.animating ? 'animate-out fade-out' : 'animate-in fade-in'}
        `}
        role="alertdialog"
        aria-labelledby="error-title"
        aria-describedby="error-message"
        aria-modal="true"
        tabIndex={-1}
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={() => handleDismiss('user_action')}
        />

        {/* Error panel */}
        <div
          className={`
            relative max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl
            ${uiConfig.animations ? 'transition-all duration-200' : ''}
            ${state.animating ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
            ${uiConfig.compactMode ? 'max-w-sm' : 'max-w-md'}
          `}
        >
          {/* Auto-hide progress bar */}
          {autoHide && state.timeRemaining > 0 && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-t-lg overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${getProgressBarColor()}`}
                style={{ width: `${(state.timeRemaining / autoHideDelay) * 100}%` }}
              />
            </div>
          )}

          {/* Header */}
          <div className="flex items-start gap-3 p-4 pb-2">
            <div className="flex-shrink-0 mt-0.5">
              {getErrorIcon()}
            </div>

            <div className="flex-1 min-w-0">
              <h3
                id="error-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {getErrorTitle()}
              </h3>
              <p
                id="error-message"
                className="text-sm text-gray-600 dark:text-gray-300 mt-1"
              >
                {error.message}
              </p>
            </div>

            <div className="flex items-center gap-1">
              {/* Voice toggle */}
              <button
                type="button"
                onClick={toggleVoice}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label={state.voiceEnabled ? 'Disable voice' : 'Enable voice'}
              >
                {state.voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>

              {/* Close button */}
              <button
                type="button"
                onClick={() => handleDismiss('user_action')}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Close error"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-4 pb-4">
            {/* Error details (expandable) */}
            {state.expanded && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div><span className="font-medium">Error Code:</span> {error.code}</div>
                  <div><span className="font-medium">Type:</span> {error.type}</div>
                  <div><span className="font-medium">Severity:</span> {error.severity}</div>
                  {error.details.originalCommand && (
                    <div><span className="font-medium">Command:</span> "{error.details.originalCommand}"</div>
                  )}
                  <div><span className="font-medium">Time:</span> {error.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-4">
              {/* Primary actions */}
              {error.retryable && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium"
                >
                  <RefreshCw size={14} />
                  Try Again
                </button>
              )}

              {error.clarificationRequired && (
                <button
                  type="button"
                  onClick={handleRequestHelp}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 text-sm font-medium"
                >
                  <HelpCircle size={14} />
                  Get Help
                </button>
              )}

              {/* Secondary actions */}
              <button
                type="button"
                onClick={toggleExpanded}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
              >
                {state.expanded ? 'Hide Details' : 'Show Details'}
              </button>
            </div>

            {/* Recovery strategies */}
            {showRecoveryOptions && error.recoveryStrategies.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Recovery Options:
                </h4>
                <div className="space-y-2">
                  {error.recoveryStrategies.slice(0, 3).map((strategy) => (
                    <button
                      key={strategy.id}
                      type="button"
                      onClick={() => handleRecoverySelection(strategy.id)}
                      className="w-full text-left p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {strategy.name}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {strategy.description}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Success rate: {Math.round(strategy.successProbability * 100)}%
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Voice commands hint */}
            {uiConfig.voiceFirst && (
              <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <span className="font-medium">Voice commands:</span> Say "retry", "help", or "dismiss"
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ErrorDisplay;