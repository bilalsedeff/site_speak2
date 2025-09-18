/**
 * Voice Visual Feedback Orchestrator - Real-time visual feedback for voice actions
 *
 * Provides instant visual feedback for voice interactions:
 * - Element highlighting and selection indicators
 * - Action previews and confirmations
 * - Real-time status indicators
 * - Smooth animations and transitions
 * - Multi-modal feedback (visual + audio + haptic)
 * - Performance optimized for <50ms visual response
 */

import { EventEmitter } from 'events';
import { createLogger, getErrorMessage } from '../../../../shared/utils.js';
import type { VisualFeedbackAction } from './VoiceActionExecutor.js';
import type { EnhancedSiteAction } from './ActionManifestGenerator.js';

const logger = createLogger({ service: 'voice-visual-feedback' });

export interface VisualFeedbackConfig {
  animationDuration: number;
  highlightColor: string;
  selectionColor: string;
  errorColor: string;
  successColor: string;
  previewOpacity: number;
  enableAnimations: boolean;
  respectReducedMotion: boolean;
  feedbackQueue: boolean; // Queue multiple feedback actions
  maxQueueSize: number;
}

export interface FeedbackElement {
  selector: string;
  element?: HTMLElement;
  originalStyles?: Record<string, string>;
  feedbackId: string;
  type: VisualFeedbackAction['type'];
  startTime: number;
  duration: number;
  animationId?: number;
}

export interface VoiceStatusIndicator {
  state: 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
  level: number; // Audio level 0-1
  confidence: number; // Recognition confidence 0-1
  partialTranscript: string;
  message: string;
  timestamp: Date;
}

export interface ActionPreview {
  action: EnhancedSiteAction;
  targetElement: string;
  previewChanges: Record<string, any>;
  requiresConfirmation: boolean;
  confirmationTimeout: number;
  previewId: string;
}

/**
 * Voice Visual Feedback Orchestrator
 */
export class VoiceVisualFeedbackOrchestrator extends EventEmitter {
  private config: VisualFeedbackConfig;
  private activeFeedback = new Map<string, FeedbackElement>();
  private feedbackQueue: VisualFeedbackAction[] = [];
  private isProcessingQueue = false;
  private statusIndicator: VoiceStatusIndicator | null = null;
  private currentPreview: ActionPreview | null = null;
  private websocketConnections = new Set<any>();

  // Performance tracking
  private feedbackMetrics = {
    totalFeedbackActions: 0,
    averageRenderTime: 0,
    queuedActions: 0,
    droppedActions: 0,
  };

  constructor(config: VisualFeedbackConfig) {
    super();
    this.config = config;
    this.initializeCSS();

    logger.info('VoiceVisualFeedbackOrchestrator initialized', {
      animationDuration: config.animationDuration,
      enableAnimations: config.enableAnimations,
      maxQueueSize: config.maxQueueSize,
    });
  }

  /**
   * Initialize CSS styles for voice feedback
   */
  private initializeCSS(): void {
    const styles = `
      <style id="voice-feedback-styles">
        /* Voice feedback base styles */
        .voice-feedback-highlight {
          outline: 3px solid ${this.config.highlightColor} !important;
          outline-offset: 2px !important;
          border-radius: 4px !important;
          transition: all ${this.config.animationDuration}ms ease !important;
          position: relative !important;
          z-index: 999999 !important;
        }

        .voice-feedback-selection {
          outline: 3px solid ${this.config.selectionColor} !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.3) !important;
          animation: voice-selection-pulse 1s ease-in-out !important;
        }

        .voice-feedback-error {
          outline: 3px solid ${this.config.errorColor} !important;
          outline-offset: 2px !important;
          animation: voice-error-shake 0.5s ease-in-out !important;
        }

        .voice-feedback-success {
          outline: 3px solid ${this.config.successColor} !important;
          outline-offset: 2px !important;
          animation: voice-success-glow 1s ease-in-out !important;
        }

        .voice-feedback-preview {
          opacity: ${this.config.previewOpacity} !important;
          border: 2px dashed ${this.config.highlightColor} !important;
          position: relative !important;
        }

        .voice-feedback-preview::after {
          content: "Preview Mode";
          position: absolute !important;
          top: -25px !important;
          left: 0 !important;
          background: ${this.config.highlightColor} !important;
          color: white !important;
          padding: 2px 8px !important;
          font-size: 12px !important;
          border-radius: 3px !important;
          z-index: 1000000 !important;
        }

        /* Voice status indicator */
        .voice-status-indicator {
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          width: 80px !important;
          height: 80px !important;
          border-radius: 50% !important;
          background: rgba(255, 255, 255, 0.95) !important;
          border: 3px solid ${this.config.highlightColor} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 1000000 !important;
          transition: all 300ms ease !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
        }

        .voice-status-listening {
          border-color: ${this.config.successColor} !important;
          animation: voice-listening-pulse 2s ease-in-out infinite !important;
        }

        .voice-status-processing {
          border-color: ${this.config.highlightColor} !important;
          animation: voice-processing-spin 1s linear infinite !important;
        }

        .voice-status-speaking {
          border-color: #8b5cf6 !important;
          animation: voice-speaking-wave 1s ease-in-out infinite !important;
        }

        .voice-status-error {
          border-color: ${this.config.errorColor} !important;
          animation: voice-error-flash 0.5s ease-in-out 3 !important;
        }

        /* Voice level meter */
        .voice-level-meter {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.2), transparent) !important;
          position: relative !important;
        }

        .voice-level-bar {
          position: absolute !important;
          bottom: 50% !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 3px !important;
          background: ${this.config.highlightColor} !important;
          border-radius: 1.5px !important;
          transition: height 100ms ease !important;
        }

        /* Animations */
        @keyframes voice-selection-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3); }
          50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.6); }
        }

        @keyframes voice-error-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        @keyframes voice-success-glow {
          0%, 100% { box-shadow: 0 0 10px rgba(16, 185, 129, 0.3); }
          50% { box-shadow: 0 0 25px rgba(16, 185, 129, 0.6); }
        }

        @keyframes voice-listening-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @keyframes voice-processing-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes voice-speaking-wave {
          0%, 100% { border-width: 3px; }
          50% { border-width: 6px; }
        }

        @keyframes voice-error-flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .voice-feedback-highlight,
          .voice-feedback-selection,
          .voice-feedback-error,
          .voice-feedback-success,
          .voice-feedback-preview,
          .voice-status-indicator {
            animation: none !important;
            transition: none !important;
          }
        }

        /* Voice transcript overlay */
        .voice-transcript-overlay {
          position: fixed !important;
          bottom: 120px !important;
          right: 20px !important;
          background: rgba(0, 0, 0, 0.8) !important;
          color: white !important;
          padding: 12px 16px !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          max-width: 300px !important;
          z-index: 1000000 !important;
          transform: translateY(100%) !important;
          transition: transform 200ms ease !important;
        }

        .voice-transcript-overlay.visible {
          transform: translateY(0) !important;
        }

        .voice-transcript-partial {
          opacity: 0.7 !important;
          font-style: italic !important;
        }

        .voice-transcript-final {
          opacity: 1 !important;
          font-weight: 500 !important;
        }

        /* Voice command suggestions */
        .voice-suggestions-overlay {
          position: fixed !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          background: rgba(255, 255, 255, 0.95) !important;
          border: 2px solid ${this.config.highlightColor} !important;
          border-radius: 12px !important;
          padding: 20px !important;
          z-index: 1000000 !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15) !important;
          opacity: 0 !important;
          transform: translate(-50%, -50%) scale(0.9) !important;
          transition: all 300ms ease !important;
        }

        .voice-suggestions-overlay.visible {
          opacity: 1 !important;
          transform: translate(-50%, -50%) scale(1) !important;
        }

        .voice-suggestion-item {
          padding: 8px 12px !important;
          margin: 4px 0 !important;
          background: rgba(59, 130, 246, 0.1) !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          transition: background 200ms ease !important;
        }

        .voice-suggestion-item:hover {
          background: rgba(59, 130, 246, 0.2) !important;
        }

        /* Toast notifications */
        .voice-toast {
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          background: ${this.config.successColor} !important;
          color: white !important;
          padding: 12px 20px !important;
          border-radius: 8px !important;
          z-index: 1000000 !important;
          transform: translateX(100%) !important;
          transition: transform 300ms ease !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
        }

        .voice-toast.visible {
          transform: translateX(0) !important;
        }

        .voice-toast.error {
          background: ${this.config.errorColor} !important;
        }

        .voice-toast.warning {
          background: #f59e0b !important;
        }
      </style>
    `;

    // Insert styles into document head
    this.emit('insertCSS', styles);
  }

  /**
   * Show visual feedback for voice action
   */
  async showFeedback(feedbackAction: VisualFeedbackAction): Promise<void> {
    const startTime = Date.now();

    try {
      if (this.config.feedbackQueue && this.isProcessingQueue) {
        return this.queueFeedback(feedbackAction);
      }

      await this.renderFeedback(feedbackAction);

      const renderTime = Date.now() - startTime;
      this.updateFeedbackMetrics(renderTime);

      logger.debug('Visual feedback rendered', {
        type: feedbackAction.type,
        target: feedbackAction.target,
        renderTime,
      });

    } catch (error) {
      logger.error('Failed to show visual feedback', {
        error: getErrorMessage(error),
        feedbackAction,
      });
    }
  }

  /**
   * Render specific feedback type
   */
  private async renderFeedback(feedbackAction: VisualFeedbackAction): Promise<void> {
    const feedbackId = this.generateFeedbackId();

    switch (feedbackAction.type) {
      case 'highlight':
        await this.renderHighlight(feedbackAction, feedbackId);
        break;

      case 'animate':
        await this.renderAnimation(feedbackAction, feedbackId);
        break;

      case 'overlay':
        await this.renderOverlay(feedbackAction, feedbackId);
        break;

      case 'toast':
        await this.renderToast(feedbackAction, feedbackId);
        break;

      case 'cursor':
        await this.renderCursor(feedbackAction, feedbackId);
        break;

      default:
        logger.warn('Unknown feedback type', { type: feedbackAction.type });
    }

    // Auto-cleanup after duration
    if (feedbackAction.duration > 0) {
      setTimeout(() => {
        this.clearFeedback(feedbackId);
      }, feedbackAction.duration);
    }
  }

  /**
   * Render element highlight
   */
  private async renderHighlight(
    feedbackAction: VisualFeedbackAction,
    feedbackId: string
  ): Promise<void> {
    const message = {
      type: 'voice_feedback',
      action: 'highlight',
      data: {
        feedbackId,
        selector: feedbackAction.target,
        duration: feedbackAction.duration,
        style: feedbackAction.style,
        message: feedbackAction.message,
        className: 'voice-feedback-highlight',
      },
    };

    this.broadcastToClients(message);

    // Track feedback element
    this.activeFeedback.set(feedbackId, {
      selector: feedbackAction.target,
      feedbackId,
      type: 'highlight',
      startTime: Date.now(),
      duration: feedbackAction.duration,
    });
  }

  /**
   * Render element animation
   */
  private async renderAnimation(
    feedbackAction: VisualFeedbackAction,
    feedbackId: string
  ): Promise<void> {
    const message = {
      type: 'voice_feedback',
      action: 'animate',
      data: {
        feedbackId,
        selector: feedbackAction.target,
        duration: feedbackAction.duration,
        style: feedbackAction.style,
        message: feedbackAction.message,
      },
    };

    this.broadcastToClients(message);

    this.activeFeedback.set(feedbackId, {
      selector: feedbackAction.target,
      feedbackId,
      type: 'animate',
      startTime: Date.now(),
      duration: feedbackAction.duration,
    });
  }

  /**
   * Render overlay message
   */
  private async renderOverlay(
    feedbackAction: VisualFeedbackAction,
    feedbackId: string
  ): Promise<void> {
    const message = {
      type: 'voice_feedback',
      action: 'overlay',
      data: {
        feedbackId,
        target: feedbackAction.target,
        message: feedbackAction.message,
        duration: feedbackAction.duration,
        style: feedbackAction.style,
      },
    };

    this.broadcastToClients(message);

    this.activeFeedback.set(feedbackId, {
      selector: feedbackAction.target,
      feedbackId,
      type: 'overlay',
      startTime: Date.now(),
      duration: feedbackAction.duration,
    });
  }

  /**
   * Render toast notification
   */
  private async renderToast(
    feedbackAction: VisualFeedbackAction,
    feedbackId: string
  ): Promise<void> {
    const message = {
      type: 'voice_feedback',
      action: 'toast',
      data: {
        feedbackId,
        message: feedbackAction.message,
        duration: feedbackAction.duration,
        style: feedbackAction.style,
        className: 'voice-toast',
      },
    };

    this.broadcastToClients(message);

    this.activeFeedback.set(feedbackId, {
      selector: 'body',
      feedbackId,
      type: 'toast',
      startTime: Date.now(),
      duration: feedbackAction.duration,
    });
  }

  /**
   * Render cursor indication
   */
  private async renderCursor(
    feedbackAction: VisualFeedbackAction,
    feedbackId: string
  ): Promise<void> {
    const message = {
      type: 'voice_feedback',
      action: 'cursor',
      data: {
        feedbackId,
        selector: feedbackAction.target,
        duration: feedbackAction.duration,
        style: { cursor: 'pointer', ...feedbackAction.style },
      },
    };

    this.broadcastToClients(message);

    this.activeFeedback.set(feedbackId, {
      selector: feedbackAction.target,
      feedbackId,
      type: 'cursor',
      startTime: Date.now(),
      duration: feedbackAction.duration,
    });
  }

  /**
   * Update voice status indicator
   */
  updateVoiceStatus(status: VoiceStatusIndicator): void {
    this.statusIndicator = status;

    const message = {
      type: 'voice_status',
      data: {
        state: status.state,
        level: status.level,
        confidence: status.confidence,
        partialTranscript: status.partialTranscript,
        message: status.message,
        timestamp: status.timestamp.toISOString(),
      },
    };

    this.broadcastToClients(message);

    logger.debug('Voice status updated', {
      state: status.state,
      level: status.level,
      confidence: status.confidence,
    });
  }

  /**
   * Show action preview
   */
  showActionPreview(preview: ActionPreview): void {
    this.currentPreview = preview;

    const message = {
      type: 'voice_preview',
      action: 'show',
      data: {
        previewId: preview.previewId,
        action: preview.action,
        targetElement: preview.targetElement,
        previewChanges: preview.previewChanges,
        requiresConfirmation: preview.requiresConfirmation,
        confirmationTimeout: preview.confirmationTimeout,
      },
    };

    this.broadcastToClients(message);

    // Auto-hide preview after timeout
    if (preview.confirmationTimeout > 0) {
      setTimeout(() => {
        this.hideActionPreview(preview.previewId);
      }, preview.confirmationTimeout);
    }

    logger.debug('Action preview shown', {
      previewId: preview.previewId,
      action: preview.action.name,
      targetElement: preview.targetElement,
    });
  }

  /**
   * Hide action preview
   */
  hideActionPreview(previewId: string): void {
    if (this.currentPreview?.previewId === previewId) {
      this.currentPreview = null;
    }

    const message = {
      type: 'voice_preview',
      action: 'hide',
      data: { previewId },
    };

    this.broadcastToClients(message);

    logger.debug('Action preview hidden', { previewId });
  }

  /**
   * Show voice command suggestions
   */
  showSuggestions(suggestions: string[], context?: string): void {
    const message = {
      type: 'voice_suggestions',
      action: 'show',
      data: {
        suggestions,
        context,
        timestamp: new Date().toISOString(),
      },
    };

    this.broadcastToClients(message);

    logger.debug('Voice suggestions shown', {
      suggestionCount: suggestions.length,
      context,
    });
  }

  /**
   * Hide voice command suggestions
   */
  hideSuggestions(): void {
    const message = {
      type: 'voice_suggestions',
      action: 'hide',
      data: {},
    };

    this.broadcastToClients(message);
  }

  /**
   * Queue feedback action for later processing
   */
  private queueFeedback(feedbackAction: VisualFeedbackAction): void {
    if (this.feedbackQueue.length >= this.config.maxQueueSize) {
      // Drop oldest action
      this.feedbackQueue.shift();
      this.feedbackMetrics.droppedActions++;
    }

    this.feedbackQueue.push(feedbackAction);
    this.feedbackMetrics.queuedActions++;

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  /**
   * Process queued feedback actions
   */
  private async processQueue(): Promise<void> {
    this.isProcessingQueue = true;

    while (this.feedbackQueue.length > 0) {
      const feedbackAction = this.feedbackQueue.shift();
      if (feedbackAction) {
        await this.renderFeedback(feedbackAction);
        // Small delay to prevent overwhelming the UI
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Clear specific feedback
   */
  clearFeedback(feedbackId: string): void {
    const feedback = this.activeFeedback.get(feedbackId);
    if (feedback) {
      const message = {
        type: 'voice_feedback',
        action: 'clear',
        data: { feedbackId },
      };

      this.broadcastToClients(message);
      this.activeFeedback.delete(feedbackId);

      logger.debug('Feedback cleared', {
        feedbackId,
        type: feedback.type,
        duration: Date.now() - feedback.startTime,
      });
    }
  }

  /**
   * Clear all active feedback
   */
  clearAllFeedback(): void {
    const feedbackIds = Array.from(this.activeFeedback.keys());

    for (const feedbackId of feedbackIds) {
      this.clearFeedback(feedbackId);
    }

    this.feedbackQueue = [];
    this.currentPreview = null;

    const message = {
      type: 'voice_feedback',
      action: 'clear_all',
      data: {},
    };

    this.broadcastToClients(message);

    logger.info('All feedback cleared', {
      clearedCount: feedbackIds.length,
    });
  }

  /**
   * Add WebSocket connection for real-time feedback
   */
  addWebSocketConnection(ws: any): void {
    this.websocketConnections.add(ws);

    ws.on('close', () => {
      this.websocketConnections.delete(ws);
    });

    logger.debug('WebSocket connection added for voice feedback', {
      connectionCount: this.websocketConnections.size,
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcastToClients(message: any): void {
    const messageStr = JSON.stringify(message);

    for (const ws of this.websocketConnections) {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(messageStr);
        }
      } catch (error) {
        logger.warn('Failed to send message to WebSocket client', {
          error: getErrorMessage(error),
        });
        this.websocketConnections.delete(ws);
      }
    }
  }

  /**
   * Update feedback performance metrics
   */
  private updateFeedbackMetrics(renderTime: number): void {
    this.feedbackMetrics.totalFeedbackActions++;
    this.feedbackMetrics.averageRenderTime =
      (this.feedbackMetrics.averageRenderTime * (this.feedbackMetrics.totalFeedbackActions - 1) + renderTime) /
      this.feedbackMetrics.totalFeedbackActions;
  }

  /**
   * Generate unique feedback ID
   */
  private generateFeedbackId(): string {
    return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Get feedback metrics
   */
  getMetrics(): typeof this.feedbackMetrics {
    return { ...this.feedbackMetrics };
  }

  /**
   * Get current status
   */
  getStatus(): {
    activeFeedback: number;
    queuedFeedback: number;
    connections: number;
    statusIndicator: VoiceStatusIndicator | null;
    currentPreview: ActionPreview | null;
  } {
    return {
      activeFeedback: this.activeFeedback.size,
      queuedFeedback: this.feedbackQueue.length,
      connections: this.websocketConnections.size,
      statusIndicator: this.statusIndicator,
      currentPreview: this.currentPreview,
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.clearAllFeedback();
    this.websocketConnections.clear();
    this.feedbackQueue = [];
    this.activeFeedback.clear();

    this.emit('removeCSS', 'voice-feedback-styles');

    logger.info('VoiceVisualFeedbackOrchestrator destroyed');
  }
}

/**
 * Factory function to create feedback orchestrator
 */
export function createVoiceVisualFeedbackOrchestrator(
  config: VisualFeedbackConfig
): VoiceVisualFeedbackOrchestrator {
  return new VoiceVisualFeedbackOrchestrator(config);
}

/**
 * Default configuration
 */
export const defaultVisualFeedbackConfig: VisualFeedbackConfig = {
  animationDuration: 300,
  highlightColor: '#3b82f6',
  selectionColor: '#8b5cf6',
  errorColor: '#ef4444',
  successColor: '#10b981',
  previewOpacity: 0.7,
  enableAnimations: true,
  respectReducedMotion: true,
  feedbackQueue: true,
  maxQueueSize: 10,
};