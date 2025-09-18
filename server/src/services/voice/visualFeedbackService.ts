/**
 * Visual Feedback Service - UI hints for voice interactions
 * 
 * Provides minimal, calm visual feedback during voice interactions:
 * - Mic state + levels (round mic button, animated level meter)
 * - Partial transcripts (gray partials → black finals)
 * - Action glow (highlight target regions during tool execution)
 * - Streaming deltas (typing dots while streaming agent tokens)
 * - Error toasts (friendly, actionable messages)
 * 
 * Respects accessibility with ARIA live regions and reduced motion preferences.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'visual-feedback' });

// Visual feedback event types
export interface VisualFeedbackEvent {
  type: 'mic_state' | 'level_update' | 'transcript_partial' | 'transcript_final' |
        'action_highlight' | 'streaming_delta' | 'error_toast' | 'clear_feedback';
  data: Record<string, unknown>;
  timestamp: Date;
  sessionId?: string;
}

// Mic states for visual feedback
export type MicState = 'idle' | 'listening' | 'processing' | 'error' | 'disabled';

// Action highlight types
export interface ActionHighlight {
  selector: string;
  type: 'glow' | 'outline' | 'pulse';
  duration: number;
  color?: string;
  intensity?: number;
}

// Error toast configuration
export interface ErrorToast {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    callback: () => void;
  };
  autoHide?: boolean;
  duration?: number;
}

// Transcript state for visual feedback
export interface TranscriptState {
  partial: string;
  final: string;
  confidence?: number;
  language?: string;
}

/**
 * Visual Feedback Service for coordinating UI feedback
 */
export class VisualFeedbackService extends EventEmitter {
  private isActive = false;
  private currentMicState: MicState = 'idle';
  private audioLevel = 0;
  private transcriptState: TranscriptState = { partial: '', final: '' };
  private activeHighlights = new Map<string, ActionHighlight>();
  private activeToasts = new Map<string, ErrorToast>();
  private streamingStates = new Set<string>();

  constructor() {
    super();
    logger.info('VisualFeedbackService initialized');
  }

  /**
   * Start the visual feedback service
   */
  start(): void {
    if (this.isActive) {
      logger.warn('VisualFeedbackService already active');
      return;
    }

    this.isActive = true;
    this.emit('feedback', {
      type: 'clear_feedback',
      data: { reason: 'service_started' },
      timestamp: new Date(),
    });

    logger.info('VisualFeedbackService started');
  }

  /**
   * Stop the visual feedback service
   */
  stop(): void {
    if (!this.isActive) {return;}

    this.isActive = false;
    this.currentMicState = 'idle';
    this.audioLevel = 0;
    this.transcriptState = { partial: '', final: '' };
    this.activeHighlights.clear();
    this.activeToasts.clear();
    this.streamingStates.clear();

    this.emit('feedback', {
      type: 'clear_feedback',
      data: { reason: 'service_stopped' },
      timestamp: new Date(),
    });

    logger.info('VisualFeedbackService stopped');
  }

  /**
   * Update microphone state
   */
  updateMicState(state: MicState, sessionId?: string): void {
    if (!this.isActive) {return;}

    const previousState = this.currentMicState;
    this.currentMicState = state;

    this.emit('feedback', {
      type: 'mic_state',
      data: {
        state,
        previousState,
        transition: `${previousState}->${state}`,
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Mic state updated', { state, previousState, sessionId });
  }

  /**
   * Update audio level for visual meter
   */
  updateAudioLevel(level: number, sessionId?: string): void {
    if (!this.isActive || this.currentMicState !== 'listening') {return;}

    // Smooth level changes to avoid jittery UI
    this.audioLevel = this.audioLevel * 0.7 + level * 0.3;

    this.emit('feedback', {
      type: 'level_update',
      data: {
        level: this.audioLevel,
        rawLevel: level,
        normalized: Math.min(this.audioLevel, 1.0),
      },
      timestamp: new Date(),
      sessionId,
    });

    // Only log periodically to avoid spam
    if (Math.random() < 0.01) { // ~1% of updates
      logger.debug('Audio level updated', { 
        level: this.audioLevel.toFixed(3), 
        sessionId 
      });
    }
  }

  /**
   * Show partial transcript (gray text)
   */
  showPartialTranscript(text: string, confidence?: number, sessionId?: string): void {
    if (!this.isActive) {return;}

    this.transcriptState.partial = text;
    if (confidence !== undefined) {
      this.transcriptState.confidence = confidence;
    }

    this.emit('feedback', {
      type: 'transcript_partial',
      data: {
        text,
        confidence,
        length: text.length,
        isPartial: true,
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Partial transcript updated', { 
      textLength: text.length, 
      confidence, 
      sessionId 
    });
  }

  /**
   * Show final transcript (black text)
   */
  showFinalTranscript(text: string, language?: string, sessionId?: string): void {
    if (!this.isActive) {return;}

    this.transcriptState.final = text;
    this.transcriptState.partial = ''; // Clear partial
    if (language !== undefined) {
      this.transcriptState.language = language;
    }

    this.emit('feedback', {
      type: 'transcript_final',
      data: {
        text,
        language,
        length: text.length,
        isFinal: true,
        previousPartial: this.transcriptState.partial,
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.info('Final transcript updated', { 
      textLength: text.length, 
      language, 
      sessionId 
    });
  }

  /**
   * Highlight DOM element during tool execution
   */
  highlightElement(selector: string, options: Partial<ActionHighlight> = {}, sessionId?: string): string {
    if (!this.isActive) {return '';}

    const highlightId = `highlight-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const highlight: ActionHighlight = {
      selector,
      type: options.type || 'glow',
      duration: options.duration || 2000,
      color: options.color || '#0066cc',
      intensity: options.intensity || 0.8,
    };

    this.activeHighlights.set(highlightId, highlight);

    this.emit('feedback', {
      type: 'action_highlight',
      data: {
        highlightId,
        ...highlight,
        action: 'start',
      },
      timestamp: new Date(),
      sessionId,
    });

    // Auto-remove highlight after duration
    setTimeout(() => {
      this.removeHighlight(highlightId, sessionId);
    }, highlight.duration);

    logger.info('Element highlight started', { 
      highlightId, 
      selector, 
      type: highlight.type,
      duration: highlight.duration,
      sessionId 
    });

    return highlightId;
  }

  /**
   * Remove element highlight
   */
  removeHighlight(highlightId: string, sessionId?: string): void {
    if (!this.isActive || !this.activeHighlights.has(highlightId)) {return;}

    const highlight = this.activeHighlights.get(highlightId);
    this.activeHighlights.delete(highlightId);

    this.emit('feedback', {
      type: 'action_highlight',
      data: {
        highlightId,
        selector: highlight?.selector,
        action: 'stop',
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Element highlight removed', { highlightId, sessionId });
  }

  /**
   * Show streaming delta (typing indicator)
   */
  startStreaming(streamId: string, type: 'agent' | 'tool' | 'search' = 'agent', sessionId?: string): void {
    if (!this.isActive) {return;}

    this.streamingStates.add(streamId);

    this.emit('feedback', {
      type: 'streaming_delta',
      data: {
        streamId,
        type,
        action: 'start',
        activeStreams: Array.from(this.streamingStates),
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Streaming indicator started', { streamId, type, sessionId });
  }

  /**
   * Update streaming progress
   */
  updateStreaming(streamId: string, progress: { text?: string; tokens?: number }, sessionId?: string): void {
    if (!this.isActive || !this.streamingStates.has(streamId)) {return;}

    this.emit('feedback', {
      type: 'streaming_delta',
      data: {
        streamId,
        action: 'update',
        progress,
      },
      timestamp: new Date(),
      sessionId,
    });
  }

  /**
   * Stop streaming indicator
   */
  stopStreaming(streamId: string, sessionId?: string): void {
    if (!this.isActive) {return;}

    this.streamingStates.delete(streamId);

    this.emit('feedback', {
      type: 'streaming_delta',
      data: {
        streamId,
        action: 'stop',
        activeStreams: Array.from(this.streamingStates),
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Streaming indicator stopped', { streamId, sessionId });
  }

  /**
   * Show error toast
   */
  showErrorToast(toast: Omit<ErrorToast, 'id'>, sessionId?: string): string {
    if (!this.isActive) {return '';}

    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const errorToast: ErrorToast = {
      id: toastId,
      ...toast,
      autoHide: toast.autoHide !== false, // Default to true
      duration: toast.duration || 5000,
    };

    this.activeToasts.set(toastId, errorToast);

    this.emit('feedback', {
      type: 'error_toast',
      data: {
        action: 'show',
        ...errorToast,
      },
      timestamp: new Date(),
      sessionId,
    });

    // Auto-hide if configured
    if (errorToast.autoHide) {
      setTimeout(() => {
        this.hideErrorToast(toastId, sessionId);
      }, errorToast.duration);
    }

    logger.info('Error toast shown', { 
      toastId, 
      type: errorToast.type, 
      title: errorToast.title,
      sessionId 
    });

    return toastId;
  }

  /**
   * Hide error toast
   */
  hideErrorToast(toastId: string, sessionId?: string): void {
    if (!this.isActive || !this.activeToasts.has(toastId)) {return;}

    this.activeToasts.delete(toastId);

    this.emit('feedback', {
      type: 'error_toast',
      data: {
        action: 'hide',
        toastId,
      },
      timestamp: new Date(),
      sessionId,
    });

    logger.debug('Error toast hidden', { toastId, sessionId });
  }

  /**
   * Clear all visual feedback
   */
  clearAll(sessionId?: string): void {
    if (!this.isActive) {return;}

    this.audioLevel = 0;
    this.transcriptState = { partial: '', final: '' };
    this.activeHighlights.clear();
    this.activeToasts.clear();
    this.streamingStates.clear();

    this.emit('feedback', {
      type: 'clear_feedback',
      data: { reason: 'manual_clear' },
      timestamp: new Date(),
      sessionId,
    });

    logger.info('All visual feedback cleared', { sessionId });
  }

  /**
   * Get current state for debugging
   */
  getCurrentState() {
    return {
      isActive: this.isActive,
      micState: this.currentMicState,
      audioLevel: this.audioLevel,
      transcript: this.transcriptState,
      activeHighlights: Array.from(this.activeHighlights.keys()),
      activeToasts: Array.from(this.activeToasts.keys()),
      activeStreams: Array.from(this.streamingStates),
    };
  }

  /**
   * Register feedback event listener
   */
  onFeedback(callback: (event: VisualFeedbackEvent) => void): () => void {
    this.on('feedback', callback);
    return () => this.removeListener('feedback', callback);
  }
}

// Export singleton instance
export const visualFeedbackService = new VisualFeedbackService();