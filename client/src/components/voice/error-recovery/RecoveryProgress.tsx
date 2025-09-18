/**
 * Recovery Progress Component
 *
 * React component for displaying recovery strategy execution progress
 * with step-by-step feedback, user controls, and visual progress indicators.
 * Provides clear communication of recovery steps and estimated completion.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Play, Pause, Square, SkipForward, CheckCircle, Clock, User } from 'lucide-react';
import {
  RecoveryStrategy,
  RecoveryStep,
  ErrorUIConfig
} from '@shared/types/error-recovery.types';

interface RecoveryProgressProps {
  strategy: RecoveryStrategy;
  currentStep: number;
  totalSteps: number;
  currentMessage: string;
  config?: Partial<ErrorUIConfig>;
  canCancel?: boolean;
  canSkip?: boolean;
  canPause?: boolean;
  showETA?: boolean;
  onCancel?: () => void;
  onSkip?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onUserAction?: (action: string, data: any) => void;
}

interface ProgressState {
  isPaused: boolean;
  timeElapsed: number;
  estimatedTimeRemaining: number;
  stepStartTime: number;
  showDetails: boolean;
  animating: boolean;
}

export const RecoveryProgress: React.FC<RecoveryProgressProps> = ({
  strategy,
  currentStep,
  totalSteps,
  currentMessage,
  config = {},
  canCancel = true,
  canSkip = false,
  canPause = false,
  showETA = true,
  onCancel,
  onSkip,
  onPause,
  onResume,
  onUserAction
}) => {
  // Acknowledge unused parameters
  void onUserAction;

  const [state, setState] = useState<ProgressState>({
    isPaused: false,
    timeElapsed: 0,
    estimatedTimeRemaining: strategy.estimatedTime || 0,
    stepStartTime: Date.now(),
    showDetails: false,
    animating: false
  });

  // Configuration with defaults
  const uiConfig = {
    theme: 'auto',
    voiceFirst: true,
    accessibility: true,
    animations: true,
    compactMode: false,
    ...config
  };

  // Time tracking
  useEffect(() => {
    if (state.isPaused) {return;}

    const interval = setInterval(() => {
      setState(prev => {
        const elapsed = Date.now() - prev.stepStartTime;
        const totalElapsed = prev.timeElapsed + elapsed;
        const avgStepTime = totalElapsed / Math.max(currentStep, 1);
        const remainingSteps = totalSteps - currentStep;
        const estimatedRemaining = remainingSteps * avgStepTime;

        return {
          ...prev,
          timeElapsed: totalElapsed,
          estimatedTimeRemaining: Math.max(0, estimatedRemaining)
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isPaused, currentStep, totalSteps]);

  // Reset step timer when step changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      stepStartTime: Date.now()
    }));
  }, [currentStep]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          if (canCancel) {onCancel?.();}
          break;
        case ' ':
          event.preventDefault();
          if (canPause) {
            if (state.isPaused) {
              handleResume();
            } else {
              handlePause();
            }
          }
          break;
        case 'ArrowRight':
          if (canSkip) {onSkip?.();}
          break;
        case 'd':
        case 'D':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            toggleDetails();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [canCancel, canPause, canSkip, state.isPaused]);

  const handlePause = useCallback(() => {
    setState(prev => ({ ...prev, isPaused: true }));
    onPause?.();
  }, [onPause]);

  const handleResume = useCallback(() => {
    setState(prev => ({
      ...prev,
      isPaused: false,
      stepStartTime: Date.now()
    }));
    onResume?.();
  }, [onResume]);

  const handleCancel = useCallback(() => {
    setState(prev => ({ ...prev, animating: true }));
    setTimeout(() => {
      onCancel?.();
    }, uiConfig.animations ? 200 : 0);
  }, [onCancel, uiConfig.animations]);

  const handleSkip = useCallback(() => {
    setState(prev => ({ ...prev, animating: true }));
    onSkip?.();
  }, [onSkip]);

  const toggleDetails = useCallback(() => {
    setState(prev => ({ ...prev, showDetails: !prev.showDetails }));
  }, []);

  const getProgressPercentage = () => {
    return Math.min(100, (currentStep / totalSteps) * 100);
  };

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStep - 1) {return 'completed';}
    if (stepIndex === currentStep - 1) {return 'current';}
    return 'pending';
  };

  const getStepIcon = (step: RecoveryStep, status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'current':
        return state.isPaused
          ? <Pause size={16} className="text-blue-500" />
          : <Play size={16} className="text-blue-500" />;
      default:
        return step.automated
          ? <Clock size={16} className="text-gray-400" />
          : <User size={16} className="text-gray-400" />;
    }
  };

  const formatTime = (milliseconds: number) => {
    const seconds = Math.ceil(milliseconds / 1000);
    if (seconds < 60) {return `${seconds}s`;}
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4
        ${uiConfig.animations && state.animating ? 'animate-out fade-out scale-95' : 'animate-in fade-in scale-100'}
      `}
      role="dialog"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-description"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" />

      {/* Panel */}
      <div
        className={`
          relative max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl
          ${uiConfig.animations ? 'transition-all duration-200' : ''}
          ${uiConfig.compactMode ? 'max-w-sm' : 'max-w-md'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              {state.isPaused ? (
                <Pause className="text-yellow-500" size={24} />
              ) : (
                <Play className="text-blue-500" size={24} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="recovery-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                {strategy.name}
              </h3>
              <p
                id="recovery-description"
                className="text-sm text-gray-600 dark:text-gray-300"
              >
                {state.isPaused ? 'Recovery paused' : 'Recovery in progress...'}
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {currentStep}/{totalSteps}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="p-4 pb-2">
          <div className="relative">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Progress</span>
              <span>{Math.round(getProgressPercentage())}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`
                  h-2 rounded-full transition-all duration-300
                  ${state.isPaused ? 'bg-yellow-500' : 'bg-blue-500'}
                `}
                style={{ width: `${getProgressPercentage()}%` }}
              />
            </div>
          </div>
        </div>

        {/* Current Step */}
        <div className="px-4 pb-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(strategy.steps[currentStep - 1] || {} as RecoveryStep, 'current')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Step {currentStep}: {strategy.steps[currentStep - 1]?.description || currentMessage}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {currentMessage}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Time Information */}
        {showETA && (
          <div className="px-4 pb-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Elapsed</div>
                <div className="font-mono">{formatTime(state.timeElapsed)}</div>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-500 dark:text-gray-400">Remaining</div>
                <div className="font-mono">{formatTime(state.estimatedTimeRemaining)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Step Details */}
        {state.showDetails && (
          <div className="px-4 pb-2">
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-32 overflow-y-auto">
              {strategy.steps.map((step, index) => {
                const status = getStepStatus(index);
                return (
                  <div
                    key={step.id}
                    className={`
                      flex items-center gap-3 p-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0
                      ${status === 'current' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    `}
                  >
                    <div className="flex-shrink-0">
                      {getStepIcon(step, status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`
                        text-sm
                        ${status === 'completed' ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-white'}
                      `}>
                        {step.description}
                      </div>
                      {step.userMessage && status === 'current' && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {step.userMessage}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-xs text-gray-400 font-mono">
                      {index + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              {/* Pause/Resume */}
              {canPause && (
                <button
                  type="button"
                  onClick={state.isPaused ? handleResume : handlePause}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 rounded-md hover:bg-yellow-200 dark:hover:bg-yellow-900/30 focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                >
                  {state.isPaused ? <Play size={14} /> : <Pause size={14} />}
                  {state.isPaused ? 'Resume' : 'Pause'}
                </button>
              )}

              {/* Skip */}
              {canSkip && (
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/30 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <SkipForward size={14} />
                  Skip
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {/* Details Toggle */}
              <button
                type="button"
                onClick={toggleDetails}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                {state.showDetails ? 'Hide Details' : 'Show Details'}
              </button>

              {/* Cancel */}
              {canCancel && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-900/30 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  <Square size={14} />
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Voice commands hint */}
          {uiConfig.voiceFirst && (
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <span className="font-medium">Voice commands:</span> Say "pause", "skip", or "cancel"
              </div>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            <span className="font-medium">Keyboard:</span> Space to pause/resume, → to skip, Esc to cancel
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryProgress;