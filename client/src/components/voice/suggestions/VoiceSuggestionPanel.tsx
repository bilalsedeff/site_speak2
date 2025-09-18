/**
 * Voice Suggestion Panel
 *
 * Modern, voice-first suggestion panel with smooth Framer Motion animations
 * and accessibility compliance. Displays contextual command suggestions with
 * intelligent positioning and interactive feedback.
 *
 * Features:
 * - Smooth Framer Motion animations
 * - Voice-first design with visual enhancements
 * - Keyboard and voice navigation support
 * - ARIA compliance for screen readers
 * - Context-aware positioning
 * - Real-time suggestion updates
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Mic,
  Search,
  HelpCircle,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  Lightbulb,
  Navigation,
  MousePointer,
  MessageSquare,
  Settings
} from 'lucide-react';
import {
  CommandSuggestion,
  SuggestionUIState,
  SuggestionUIConfig,
  SuggestionCategory
} from '@shared/types/suggestion.types';

interface VoiceSuggestionPanelProps {
  suggestions: CommandSuggestion[];
  state: SuggestionUIState;
  config: SuggestionUIConfig;
  onSuggestionSelect: (suggestion: CommandSuggestion) => void;
  onSuggestionHover: (suggestion: CommandSuggestion) => void;
  onFeedback: (suggestion: CommandSuggestion, feedback: 'positive' | 'negative') => void;
  onDismiss: () => void;
  className?: string;
}

const categoryIcons: Record<SuggestionCategory, React.ComponentType<any>> = {
  navigation: Navigation,
  action: MousePointer,
  content: MessageSquare,
  query: Search,
  control: Settings,
  help: HelpCircle,
  discovery: Lightbulb
};

const categoryColors: Record<SuggestionCategory, string> = {
  navigation: 'text-blue-600 dark:text-blue-400',
  action: 'text-green-600 dark:text-green-400',
  content: 'text-purple-600 dark:text-purple-400',
  query: 'text-orange-600 dark:text-orange-400',
  control: 'text-gray-600 dark:text-gray-400',
  help: 'text-indigo-600 dark:text-indigo-400',
  discovery: 'text-yellow-600 dark:text-yellow-400'
};

export function VoiceSuggestionPanel({
  suggestions,
  state,
  config,
  onSuggestionSelect,
  onSuggestionHover,
  onFeedback,
  onDismiss,
  className = ''
}: VoiceSuggestionPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!state.isVisible) {return;}

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          navigateUp();
          break;
        case 'ArrowDown':
          event.preventDefault();
          navigateDown();
          break;
        case 'Enter':
          { event.preventDefault();
          const selectedSuggestion = suggestions[state.selectedIndex];
          if (state.selectedIndex >= 0 && selectedSuggestion) {
            onSuggestionSelect(selectedSuggestion);
          }
          break; }
        case 'Escape':
          event.preventDefault();
          onDismiss();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.isVisible, state.selectedIndex, suggestions, onSuggestionSelect, onDismiss]);

  const navigateUp = useCallback(() => {
    const newIndex = state.selectedIndex <= 0
      ? suggestions.length - 1
      : state.selectedIndex - 1;

    const suggestion = suggestions[newIndex];
    if (suggestion) {
      onSuggestionHover(suggestion);
    }
  }, [state.selectedIndex, suggestions, onSuggestionHover]);

  const navigateDown = useCallback(() => {
    const newIndex = state.selectedIndex >= suggestions.length - 1
      ? 0
      : state.selectedIndex + 1;

    const suggestion = suggestions[newIndex];
    if (suggestion) {
      onSuggestionHover(suggestion);
    }
  }, [state.selectedIndex, suggestions, onSuggestionHover]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (state.selectedIndex >= 0 && panelRef.current) {
      const selectedElement = panelRef.current.querySelector(
        `[data-suggestion-index="${state.selectedIndex}"]`
      ) as HTMLElement;

      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }
    }
  }, [state.selectedIndex]);

  // Panel animations
  const panelVariants = {
    hidden: {
      opacity: 0,
      y: config.position === 'top' ? -20 : 20,
      scale: 0.95
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0.1 : 0.2,
        ease: 'easeOut',
        staggerChildren: shouldReduceMotion ? 0 : 0.05
      }
    },
    exit: {
      opacity: 0,
      y: config.position === 'top' ? -10 : 10,
      scale: 0.95,
      transition: {
        duration: shouldReduceMotion ? 0.1 : 0.15,
        ease: 'easeIn'
      }
    }
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -20
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0.1 : 0.15,
        ease: 'easeOut'
      }
    }
  };

  const renderSuggestionItem = (suggestion: CommandSuggestion, index: number) => {
    const isSelected = index === state.selectedIndex;
    const isHovered = index === hoveredIndex;
    const CategoryIcon = categoryIcons[suggestion.category] || HelpCircle;
    const categoryColor = categoryColors[suggestion.category] || 'text-gray-600';

    return (
      <motion.div
        key={suggestion.id}
        variants={itemVariants}
        data-suggestion-index={index}
        className={`
          relative group cursor-pointer p-3 rounded-lg border transition-all duration-200
          ${isSelected || isHovered
            ? 'bg-primary/10 border-primary/30 shadow-md'
            : 'bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50/80 dark:hover:bg-gray-700/80'
          }
          ${config.showDescriptions ? 'min-h-[4rem]' : 'min-h-[3rem]'}
        `}
        whileHover={shouldReduceMotion ? {} : {
          scale: 1.02,
          transition: { duration: 0.15 }
        }}
        whileTap={shouldReduceMotion ? {} : {
          scale: 0.98,
          transition: { duration: 0.1 }
        }}
        onClick={() => onSuggestionSelect(suggestion)}
        onMouseEnter={() => {
          setHoveredIndex(index);
          onSuggestionHover(suggestion);
        }}
        onMouseLeave={() => setHoveredIndex(-1)}
        role="option"
        aria-selected={isSelected}
        aria-describedby={`suggestion-${index}-description`}
        tabIndex={isSelected ? 0 : -1}
      >
        {/* Selection indicator */}
        <motion.div
          className={`absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full ${
            isSelected ? 'opacity-100' : 'opacity-0'
          }`}
          animate={{ opacity: isSelected ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        />

        <div className="flex items-start space-x-3">
          {/* Category icon */}
          <div className={`flex-shrink-0 p-1.5 rounded-md bg-gray-100/50 dark:bg-gray-700/50 ${categoryColor}`}>
            <CategoryIcon className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {suggestion.command}
              </p>

              {/* Confidence indicator */}
              <div className="flex items-center space-x-1 ml-2">
                <div className={`h-2 w-2 rounded-full ${
                  suggestion.confidence > 0.8
                    ? 'bg-green-500'
                    : suggestion.confidence > 0.6
                    ? 'bg-yellow-500'
                    : 'bg-gray-400'
                }`} />
                {config.showDescriptions && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(suggestion.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {config.showDescriptions && suggestion.description && (
              <p
                id={`suggestion-${index}-description`}
                className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
              >
                {suggestion.description}
              </p>
            )}

            {/* Examples */}
            {config.showDescriptions && suggestion.examples.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {suggestion.examples.slice(0, 2).map((example, exIndex) => (
                  <span
                    key={exIndex}
                    className="inline-block px-2 py-0.5 text-xs bg-gray-100/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 rounded-full"
                  >
                    "{example}"
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Feedback buttons */}
          {(isSelected || isHovered) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center space-x-1"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(suggestion, 'positive');
                }}
                className="p-1 rounded-full hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-colors"
                aria-label="Mark as helpful"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(suggestion, 'negative');
                }}
                className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                aria-label="Mark as not helpful"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {state.isVisible && (
        <motion.div
          ref={panelRef}
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`
            fixed z-50 max-w-md w-full mx-auto
            ${config.position === 'top' ? 'top-4' : 'bottom-4'}
            ${config.position === 'center' ? 'top-1/2 -translate-y-1/2' : ''}
            left-1/2 -translate-x-1/2
            ${className}
          `}
          role="listbox"
          aria-label="Voice command suggestions"
          aria-multiselectable={false}
        >
          {/* Main panel */}
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center space-x-2">
                <motion.div
                  animate={{
                    scale: state.loading ? [1, 1.1, 1] : 1
                  }}
                  transition={{
                    repeat: state.loading ? Infinity : 0,
                    duration: 1
                  }}
                  className="p-2 rounded-full bg-primary/10 text-primary"
                >
                  <Mic className="h-4 w-4" />
                </motion.div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Voice Suggestions
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {state.loading
                      ? 'Loading suggestions...'
                      : `${suggestions.length} command${suggestions.length !== 1 ? 's' : ''} available`
                    }
                  </p>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={onDismiss}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                aria-label="Close suggestions"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search query display */}
            {state.searchQuery && (
              <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center space-x-2 text-sm">
                  <Search className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Matching: "<span className="font-medium">{state.searchQuery}</span>"
                  </span>
                </div>
              </div>
            )}

            {/* Loading state */}
            {state.loading && (
              <div className="flex items-center justify-center p-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full"
                />
              </div>
            )}

            {/* Suggestions list */}
            {!state.loading && suggestions.length > 0 && (
              <motion.div
                className="max-h-80 overflow-y-auto p-2 space-y-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {suggestions.slice(0, config.maxVisible).map((suggestion, index) =>
                  renderSuggestionItem(suggestion, index)
                )}
              </motion.div>
            )}

            {/* Empty state */}
            {!state.loading && suggestions.length === 0 && (
              <div className="text-center p-8">
                <HelpCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No suggestions available
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Try saying "What can I do here?" for help
                </p>
              </div>
            )}

            {/* Navigation hints */}
            {!state.loading && suggestions.length > 0 && config.showKeyboardShortcuts && (
              <div className="px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center justify-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center space-x-1">
                    <ArrowUp className="h-3 w-3" />
                    <ArrowDown className="h-3 w-3" />
                    <span>Navigate</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd>
                    <span>Select</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Esc</kbd>
                    <span>Close</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Voice input indicator */}
          {config.voiceFirst && (
            <motion.div
              className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400">
                🎤 Say a command or use keyboard navigation
              </p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}