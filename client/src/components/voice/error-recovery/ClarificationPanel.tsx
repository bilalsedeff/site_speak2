/**
 * Clarification Panel Component
 *
 * React component for displaying clarification requests with multi-modal interface,
 * voice-first interactions, and progressive disclosure of options.
 * Provides intelligent question presentation and user-friendly response collection.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MessageCircle, Mic, Keyboard, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import {
  ClarificationRequest,
  ClarificationResponse,
  ErrorUIConfig
} from '@shared/types/error-recovery.types';

interface ClarificationPanelProps {
  request: ClarificationRequest;
  config?: Partial<ErrorUIConfig>;
  onResponse?: (response: ClarificationResponse) => void;
  onCancel?: () => void;
  showProgressiveOptions?: boolean;
  voiceEnabled?: boolean;
  maxOptions?: number;
}

interface ClarificationState {
  visible: boolean;
  selectedOptionId: string | null;
  userInput: string;
  showAllOptions: boolean;
  responseMethod: 'voice' | 'click' | 'keyboard' | null;
  confidence: number;
  submitting: boolean;
  timeRemaining: number;
}

export const ClarificationPanel: React.FC<ClarificationPanelProps> = ({
  request,
  config = {},
  onResponse,
  onCancel,
  showProgressiveOptions = true,
  voiceEnabled = true,
  maxOptions = 4
}) => {
  // Acknowledge unused parameters
  void showProgressiveOptions;

  const [state, setState] = useState<ClarificationState>({
    visible: true,
    selectedOptionId: null,
    userInput: '',
    showAllOptions: false,
    responseMethod: null,
    confidence: 0.8,
    submitting: false,
    timeRemaining: request.timeout
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  void timeoutRef; // Acknowledge unused variable
  const countdownRef = useRef<NodeJS.Timeout>();

  // Configuration with defaults
  const uiConfig = {
    theme: 'auto',
    voiceFirst: true,
    accessibility: true,
    animations: true,
    ...config
  };

  // Timeout countdown
  useEffect(() => {
    if (request.timeout > 0) {
      countdownRef.current = setInterval(() => {
        setState(prev => {
          const newTimeRemaining = Math.max(0, prev.timeRemaining - 100);
          if (newTimeRemaining === 0) {
            handleTimeout();
          }
          return { ...prev, timeRemaining: newTimeRemaining };
        });
      }, 100);

      return () => {
        if (countdownRef.current) {clearInterval(countdownRef.current);}
      };
    }
    return undefined;
  }, [request.timeout]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!state.visible) {return;}

      switch (event.key) {
        case 'Escape':
          handleCancel();
          break;
        case 'Enter':
          if (state.selectedOptionId) {
            handleOptionSelect(state.selectedOptionId, 'keyboard');
          } else if (state.userInput.trim()) {
            handleTextSubmit();
          }
          break;
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault();
          handleArrowNavigation(event.key === 'ArrowDown' ? 1 : -1);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const optionIndex = parseInt(event.key) - 1;
            const visibleOptions = getVisibleOptions();
            if (visibleOptions[optionIndex]) {
              handleOptionSelect(visibleOptions[optionIndex].id, 'keyboard');
            }
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.visible, state.selectedOptionId, state.userInput]);

  // Focus management
  useEffect(() => {
    if (state.visible && containerRef.current) {
      containerRef.current.focus();
    }
  }, [state.visible]);

  const handleTimeout = useCallback(() => {
    const response: ClarificationResponse = {
      requestId: request.id,
      optionId: '',
      confidence: 0,
      method: 'timeout',
      timestamp: new Date(),
      satisfied: false,
      needsFollowUp: false
    };
    onResponse?.(response);
  }, [request.id, onResponse]);

  const handleOptionSelect = useCallback((optionId: string, method: 'voice' | 'click' | 'keyboard') => {
    setState(prev => ({ ...prev, submitting: true, selectedOptionId: optionId, responseMethod: method }));

    const option = request.options.find(opt => opt.id === optionId);
    const confidence = option?.confidence || 0.8;

    setTimeout(() => {
      const response: ClarificationResponse = {
        requestId: request.id,
        optionId,
        confidence,
        method,
        timestamp: new Date(),
        satisfied: true,
        needsFollowUp: false
      };
      onResponse?.(response);
    }, 300); // Brief delay for visual feedback
  }, [request.id, request.options, onResponse]);

  const handleTextSubmit = useCallback(() => {
    if (!state.userInput.trim()) {return;}

    setState(prev => ({ ...prev, submitting: true, responseMethod: 'keyboard' }));

    const response: ClarificationResponse = {
      requestId: request.id,
      optionId: 'custom',
      userInput: state.userInput,
      confidence: 0.7, // Lower confidence for custom input
      method: 'keyboard',
      timestamp: new Date(),
      satisfied: true,
      needsFollowUp: true // Custom input might need follow-up
    };

    setTimeout(() => {
      onResponse?.(response);
    }, 300);
  }, [request.id, state.userInput, onResponse]);

  const handleCancel = useCallback(() => {
    setState(prev => ({ ...prev, visible: false }));
    onCancel?.();
  }, [onCancel]);

  const handleArrowNavigation = useCallback((direction: 1 | -1) => {
    const visibleOptions = getVisibleOptions();
    const currentIndex = state.selectedOptionId
      ? visibleOptions.findIndex(opt => opt.id === state.selectedOptionId)
      : -1;

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {nextIndex = visibleOptions.length - 1;}
    if (nextIndex >= visibleOptions.length) {nextIndex = 0;}

    setState(prev => ({
      ...prev,
      selectedOptionId: visibleOptions[nextIndex]?.id || null
    }));
  }, [state.selectedOptionId]);

  const getVisibleOptions = useCallback(() => {
    if (state.showAllOptions) {return request.options;}
    return request.options.slice(0, maxOptions);
  }, [request.options, state.showAllOptions, maxOptions]);

  const toggleShowAllOptions = useCallback(() => {
    setState(prev => ({ ...prev, showAllOptions: !prev.showAllOptions }));
  }, []);

  const getQuestionText = () => {
    if (request.question.voiceText && uiConfig.voiceFirst) {
      return request.question.voiceText;
    }
    return request.question.text;
  };

  const getTimeRemainingSeconds = () => {
    return Math.ceil(state.timeRemaining / 1000);
  };

  const getProgressBarColor = () => {
    const progress = (state.timeRemaining / request.timeout) * 100;
    if (progress > 60) {return 'bg-green-500';}
    if (progress > 30) {return 'bg-yellow-500';}
    return 'bg-red-500';
  };

  if (!state.visible) {return null;}

  const visibleOptions = getVisibleOptions();
  const hasMoreOptions = request.options.length > maxOptions && !state.showAllOptions;

  return (
    <div
      ref={containerRef}
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4
        ${uiConfig.animations ? 'animate-in fade-in slide-in-from-bottom-4' : ''}
      `}
      role="dialog"
      aria-labelledby="clarification-title"
      aria-describedby="clarification-description"
      aria-modal="true"
      tabIndex={-1}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" />

      {/* Panel */}
      <div
        className={`
          relative max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl
          ${uiConfig.animations ? 'transition-all duration-200' : ''}
          ${state.submitting ? 'scale-95 opacity-75' : 'scale-100 opacity-100'}
        `}
      >
        {/* Timeout progress bar */}
        {request.timeout > 0 && state.timeRemaining > 0 && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-t-lg overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${getProgressBarColor()}`}
              style={{ width: `${(state.timeRemaining / request.timeout) * 100}%` }}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-2">
          <div className="flex-shrink-0 mt-0.5">
            <MessageCircle className="text-blue-500" size={24} />
          </div>

          <div className="flex-1 min-w-0">
            <h3
              id="clarification-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Need Clarification
            </h3>
            <p
              id="clarification-description"
              className="text-sm text-gray-600 dark:text-gray-300 mt-1"
            >
              {getQuestionText()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Time remaining */}
            {request.timeout > 0 && state.timeRemaining > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {getTimeRemainingSeconds()}s
              </div>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={handleCancel}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Cancel clarification"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {/* Options */}
          <div className="space-y-2">
            {visibleOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleOptionSelect(option.id, 'click')}
                disabled={state.submitting}
                className={`
                  w-full text-left p-3 rounded-lg border-2 transition-all
                  ${state.selectedOptionId === option.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                  ${state.submitting && state.selectedOptionId === option.id
                    ? 'opacity-75 cursor-not-allowed'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                  focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                `}
                aria-pressed={state.selectedOptionId === option.id}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center
                      ${state.selectedOptionId === option.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                      }
                    `}>
                      {state.selectedOptionId === option.id && (
                        <Check size={12} className="text-white" />
                      )}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {option.text}
                    </div>
                    {option.description && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {option.description}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        Confidence: {Math.round(option.confidence * 100)}%
                      </div>
                      {option.keyboardShortcut && (
                        <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                          {option.keyboardShortcut}
                        </kbd>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {index + 1}
                  </div>
                </div>
              </button>
            ))}

            {/* Show more options button */}
            {hasMoreOptions && (
              <button
                type="button"
                onClick={toggleShowAllOptions}
                className="w-full p-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-dashed border-blue-300 dark:border-blue-700"
              >
                <div className="flex items-center justify-center gap-2">
                  <ChevronDown size={16} />
                  Show {request.options.length - maxOptions} more options
                </div>
              </button>
            )}

            {/* Show fewer options button */}
            {state.showAllOptions && request.options.length > maxOptions && (
              <button
                type="button"
                onClick={toggleShowAllOptions}
                className="w-full p-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-dashed border-gray-300 dark:border-gray-600"
              >
                <div className="flex items-center justify-center gap-2">
                  <ChevronUp size={16} />
                  Show fewer options
                </div>
              </button>
            )}
          </div>

          {/* Custom input option */}
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <label htmlFor="custom-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Or describe what you meant:
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="custom-input"
                type="text"
                value={state.userInput}
                onChange={(e) => setState(prev => ({ ...prev, userInput: e.target.value }))}
                disabled={state.submitting}
                placeholder="Type your clarification here..."
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTextSubmit();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!state.userInput.trim() || state.submitting}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Submit
              </button>
            </div>
          </div>

          {/* Voice commands hint */}
          {uiConfig.voiceFirst && voiceEnabled && (
            <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
                <Mic size={12} />
                <span className="font-medium">Voice commands:</span>
                <span>Say the number (1-{visibleOptions.length}) or option text</span>
              </div>
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <Keyboard size={12} />
              <span className="font-medium">Keyboard:</span>
              <span>↑↓ to navigate, Enter to select, Esc to cancel</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClarificationPanel;