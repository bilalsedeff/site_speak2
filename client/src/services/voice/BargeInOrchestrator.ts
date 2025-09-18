/**
 * BargeInOrchestrator - Real-time voice interruption coordinator
 *
 * Orchestrates barge-in functionality with <50ms total response time:
 * - Coordinates VoiceActivityDetector and TTSInterruptionManager
 * - Manages conversation turn states and user interruptions
 * - Handles debouncing and false positive prevention
 * - Performance monitoring and adaptive thresholds
 * - Production-ready error handling and recovery
 */

import { createLogger } from '../../../../shared/utils';
import {
  BargeInEvent,
  BargeInConfig,
  BargeInSession,
  BargeInCallbacks,
  BargeInError,
  VADDecision,
  TTSInterruptionEvent,
  AudioLevelUpdate,
  PerformanceMetrics,
  DEFAULT_BARGE_IN_CONFIG
} from '@shared/types/barge-in.types';

import { VoiceActivityDetector, VADServiceCallbacks } from './VoiceActivityDetector';
import { TTSInterruptionManager, TTSInterruptionCallbacks } from './TTSInterruptionManager';

const logger = createLogger({ service: 'barge-in-orchestrator' });

/**
 * Main orchestrator for barge-in functionality
 */
export class BargeInOrchestrator {
  private config: BargeInConfig;
  private callbacks?: BargeInCallbacks;
  private session: BargeInSession;

  // Core services
  private vad?: VoiceActivityDetector;
  private ttsManager?: TTSInterruptionManager;

  // State management
  private isActive = false;
  private lastBargeInTime = 0;
  private _vadTriggerTime = 0; // Reserved for future timing analysis

  // Performance tracking
  private bargeInHistory: number[] = [];
  private errorCount = 0;

  constructor(
    config: Partial<BargeInConfig> = {},
    callbacks?: BargeInCallbacks
  ) {
    this.config = { ...DEFAULT_BARGE_IN_CONFIG, ...config };
    if (callbacks) {
      this.callbacks = callbacks;
    }

    // Initialize session
    this.session = {
      sessionId: `barge_in_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      startTime: Date.now(),
      config: this.config,
      vadState: {
        active: false,
        lastDecision: {} as VADDecision,
        consecutiveActiveFrames: 0,
        consecutiveInactiveFrames: 0
      },
      ttsState: {
        isPlaying: false,
        isDucked: false,
        currentPosition: 0,
        totalDuration: 0,
        volume: 1.0,
        playbackRate: 1.0,
        sourceId: ''
      },
      stats: {
        totalBargeInEvents: 0,
        avgBargeInLatency: 0,
        minBargeInLatency: Infinity,
        maxBargeInLatency: 0,
        falsePositives: 0,
        missedDetections: 0
      },
      errors: []
    };

    logger.info('BargeInOrchestrator initialized', {
      sessionId: this.session.sessionId,
      config: this.config
    });

    this.initializeServices();
  }

  /**
   * Start barge-in functionality with audio stream
   */
  async start(mediaStream: MediaStream): Promise<void> {
    if (this.isActive) {
      throw new Error('BargeInOrchestrator is already active');
    }

    if (!this.config.enabled) {
      logger.info('Barge-in functionality is disabled');
      return;
    }

    try {
      logger.info('Starting barge-in orchestration', {
        sessionId: this.session.sessionId
      });

      // Start VAD
      if (this.vad) {
        await this.vad.start(mediaStream);
      }

      this.isActive = true;
      this.session.startTime = Date.now();

      logger.info('Barge-in orchestration started successfully', {
        sessionId: this.session.sessionId
      });

    } catch (error) {
      const bargeInError: BargeInError = {
        code: 'VAD_FAILED',
        message: `Failed to start barge-in orchestration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
        timestamp: Date.now(),
        context: {
          sessionId: this.session.sessionId,
          error
        },
        recovery: ['Check microphone permissions', 'Restart barge-in service', 'Verify audio stream']
      };

      this.handleError(bargeInError);
      throw error;
    }
  }

  /**
   * Stop barge-in functionality
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    logger.info('Stopping barge-in orchestration', {
      sessionId: this.session.sessionId
    });

    // Stop VAD
    if (this.vad) {
      await this.vad.stop();
    }

    // Stop all TTS
    if (this.ttsManager) {
      await this.ttsManager.stopAll();
    }

    this.isActive = false;

    // Log final statistics
    const runTime = Date.now() - this.session.startTime;
    logger.info('Barge-in orchestration stopped', {
      sessionId: this.session.sessionId,
      runTime,
      totalBargeIns: this.session.stats.totalBargeInEvents,
      avgLatency: this.session.stats.avgBargeInLatency,
      errorCount: this.errorCount
    });
  }

  /**
   * Register TTS audio source for interruption
   */
  registerTTSSource(
    id: string,
    element: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode,
    audioContext?: AudioContext
  ): void {
    if (!this.ttsManager) {
      throw new Error('TTS interruption manager not initialized');
    }

    this.ttsManager.registerAudioSource(id, element, audioContext);

    logger.debug('TTS source registered for barge-in', {
      sessionId: this.session.sessionId,
      sourceId: id
    });
  }

  /**
   * Unregister TTS audio source
   */
  unregisterTTSSource(id: string): void {
    if (this.ttsManager) {
      this.ttsManager.unregisterAudioSource(id);
    }

    logger.debug('TTS source unregistered from barge-in', {
      sessionId: this.session.sessionId,
      sourceId: id
    });
  }

  /**
   * Initialize core services
   */
  private initializeServices(): void {
    // Initialize VAD with callbacks
    const vadCallbacks: VADServiceCallbacks = {
      onVADDecision: (decision) => this.handleVADDecision(decision),
      onAudioLevelUpdate: (levels) => this.handleAudioLevelUpdate(levels),
      onPerformanceUpdate: (metrics) => this.handlePerformanceUpdate(metrics),
      onError: (error) => this.handleError(error)
    };

    this.vad = new VoiceActivityDetector(this.config.vad, vadCallbacks);

    // Initialize TTS interruption manager with callbacks
    const ttsCallbacks: TTSInterruptionCallbacks = {
      onInterrupted: (event) => this.handleTTSInterrupted(event),
      onResumed: (event) => this.handleTTSResumed(event),
      onStopped: (event) => this.handleTTSStopped(event),
      onError: (error) => this.handleError(error)
    };

    this.ttsManager = new TTSInterruptionManager(this.config.ttsInterruption, ttsCallbacks);

    logger.debug('Core services initialized', {
      sessionId: this.session.sessionId
    });
  }

  /**
   * Handle VAD decision and trigger barge-in if appropriate
   */
  private async handleVADDecision(decision: VADDecision): Promise<void> {
    // Update session VAD state
    this.session.vadState.lastDecision = decision;
    this.session.vadState.active = decision.active;

    if (decision.active) {
      this.session.vadState.consecutiveActiveFrames++;
      this.session.vadState.consecutiveInactiveFrames = 0;
    } else {
      this.session.vadState.consecutiveInactiveFrames++;
      this.session.vadState.consecutiveActiveFrames = 0;
    }

    // Notify callback
    this.callbacks?.onVADStateChange(decision);

    // Check if we should trigger barge-in
    if (decision.active && this.shouldTriggerBargeIn(decision)) {
      await this.triggerBargeIn(decision);
    } else if (!decision.active && this.shouldResumeAfterBargeIn()) {
      await this.resumeAfterBargeIn();
    }
  }

  /**
   * Determine if barge-in should be triggered
   */
  private shouldTriggerBargeIn(decision: VADDecision): boolean {
    // Check if barge-in is enabled
    if (!this.config.enabled) {
      return false;
    }

    // Check if any TTS is currently playing
    const ttsAudioSources = this.ttsManager?.getAudioSources() || [];
    const hasPlayingTTS = ttsAudioSources.some(source => source.state.isPlaying);
    if (!hasPlayingTTS) {
      return false;
    }

    // Check debounce rules
    const now = performance.now();
    const timeSinceLastBarge = now - this.lastBargeInTime;
    if (timeSinceLastBarge < this.config.debounce.minTimeBetweenEventsMs) {
      logger.debug('Barge-in debounced - too soon after last event', {
        timeSinceLastBarge,
        minTime: this.config.debounce.minTimeBetweenEventsMs
      });
      return false;
    }

    // Check confidence threshold
    if (decision.confidence < 0.6) { // Minimum confidence for barge-in
      return false;
    }

    // Check for rapid VAD changes (false positives)
    if (this.session.vadState.consecutiveActiveFrames < 3) {
      return false; // Need at least 3 consecutive active frames
    }

    return true;
  }

  /**
   * Trigger barge-in interruption
   */
  private async triggerBargeIn(vadDecision: VADDecision): Promise<void> {
    const startTime = performance.now();
    this._vadTriggerTime = startTime; // Reserved for future timing analysis
    this.lastBargeInTime = startTime;

    try {
      logger.debug('Triggering barge-in', {
        sessionId: this.session.sessionId,
        vadConfidence: vadDecision.confidence,
        vadLevel: vadDecision.level
      });

      // Interrupt TTS
      const ttsEvents = await this.ttsManager!.interrupt('vad_active');

      const totalLatency = performance.now() - startTime;

      // Create barge-in event
      const bargeInEvent: BargeInEvent = {
        type: 'barge_in_detected',
        timestamp: Date.now(),
        totalLatency,
        vadDecision,
        ...(ttsEvents[0] && { ttsInterruption: ttsEvents[0] }), // Conditionally include if exists
        metrics: {
          vadLatency: vadDecision.latency,
          ttsInterruptLatency: ttsEvents[0]?.responseLatency || 0,
          totalProcessingTime: totalLatency
        }
      };

      // Update session statistics
      this.updateSessionStats(bargeInEvent);

      // Track performance
      this.bargeInHistory.push(totalLatency);
      if (this.bargeInHistory.length > 100) {
        this.bargeInHistory = this.bargeInHistory.slice(-50);
      }

      // Check performance targets
      if (totalLatency > this.config.performance.targetTotalLatencyMs) {
        const error: BargeInError = {
          code: 'LATENCY_EXCEEDED',
          message: `Barge-in total latency exceeded target: ${totalLatency.toFixed(2)}ms > ${this.config.performance.targetTotalLatencyMs}ms`,
          severity: 'medium',
          timestamp: Date.now(),
          context: {
            sessionId: this.session.sessionId,
            totalLatency,
            vadLatency: vadDecision.latency,
            ttsLatency: ttsEvents[0]?.responseLatency || 0
          },
          recovery: ['Optimize VAD processing', 'Optimize TTS interruption', 'Check system performance']
        };

        this.handleError(error);
      }

      // Notify callback
      this.callbacks?.onBargeInDetected(bargeInEvent);

      logger.info('Barge-in triggered successfully', {
        sessionId: this.session.sessionId,
        totalLatency,
        vadLatency: vadDecision.latency,
        ttsInterruptedSources: ttsEvents.length
      });

    } catch (error) {
      const bargeInError: BargeInError = {
        code: 'TTS_INTERRUPT_FAILED',
        message: `Barge-in trigger failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'high',
        timestamp: Date.now(),
        context: {
          sessionId: this.session.sessionId,
          vadDecision,
          error
        },
        recovery: ['Retry barge-in', 'Check TTS interruption manager', 'Restart services']
      };

      this.handleError(bargeInError);

      // Create failed barge-in event
      const failedEvent: BargeInEvent = {
        type: 'barge_in_failed',
        timestamp: Date.now(),
        totalLatency: performance.now() - startTime,
        vadDecision,
        error: {
          code: bargeInError.code,
          message: bargeInError.message,
          details: bargeInError.context
        },
        metrics: {
          vadLatency: vadDecision.latency,
          ttsInterruptLatency: 0,
          totalProcessingTime: performance.now() - startTime
        }
      };

      this.callbacks?.onBargeInDetected(failedEvent);
    }
  }

  /**
   * Determine if TTS should resume after barge-in
   */
  private shouldResumeAfterBargeIn(): boolean {
    if (this.config.ttsInterruption.resumeBehavior !== 'auto') {
      return false;
    }

    // Check if enough time has passed since VAD went inactive
    const timeSinceInactive = this.session.vadState.consecutiveInactiveFrames * 20; // 20ms per frame
    return timeSinceInactive >= this.config.ttsInterruption.autoResumeDelayMs;
  }

  /**
   * Resume TTS after barge-in ends
   */
  private async resumeAfterBargeIn(): Promise<void> {
    if (!this.ttsManager) {
      return;
    }

    try {
      const resumeEvents = await this.ttsManager.resume();

      logger.debug('TTS resumed after barge-in', {
        sessionId: this.session.sessionId,
        resumedSources: resumeEvents.length
      });

    } catch (error) {
      logger.error('Failed to resume TTS after barge-in', {
        sessionId: this.session.sessionId,
        error
      });
    }
  }

  /**
   * Handle TTS interruption event
   */
  private handleTTSInterrupted(event: TTSInterruptionEvent): void {
    this.callbacks?.onTTSInterrupted(event);

    // Update session TTS state
    this.session.ttsState = { ...event.newState };

    logger.debug('TTS interrupted', {
      sessionId: this.session.sessionId,
      type: event.type,
      responseLatency: event.responseLatency
    });
  }

  /**
   * Handle TTS resume event
   */
  private handleTTSResumed(event: TTSInterruptionEvent): void {
    this.callbacks?.onTTSInterrupted(event);

    // Update session TTS state
    this.session.ttsState = { ...event.newState };

    logger.debug('TTS resumed', {
      sessionId: this.session.sessionId,
      type: event.type
    });
  }

  /**
   * Handle TTS stop event
   */
  private handleTTSStopped(event: TTSInterruptionEvent): void {
    this.callbacks?.onTTSInterrupted(event);

    // Update session TTS state
    this.session.ttsState = { ...event.newState };

    logger.debug('TTS stopped', {
      sessionId: this.session.sessionId,
      type: event.type
    });
  }

  /**
   * Handle audio level updates
   */
  private handleAudioLevelUpdate(levels: AudioLevelUpdate): void {
    this.callbacks?.onAudioLevelUpdate(levels);
  }

  /**
   * Handle performance updates
   */
  private handlePerformanceUpdate(metrics: PerformanceMetrics): void {
    this.callbacks?.onPerformanceUpdate(metrics);
  }

  /**
   * Handle errors from services
   */
  private handleError(error: BargeInError): void {
    this.errorCount++;

    // Add to session error tracking
    this.session.errors.push({
      timestamp: error.timestamp,
      error: error.message,
      context: error.context
    });

    // Keep error history limited
    if (this.session.errors.length > 50) {
      this.session.errors = this.session.errors.slice(-25);
    }

    this.callbacks?.onError(error);

    logger.error('Barge-in error occurred', {
      sessionId: this.session.sessionId,
      errorCode: error.code,
      errorMessage: error.message,
      severity: error.severity
    });
  }

  /**
   * Update session statistics
   */
  private updateSessionStats(event: BargeInEvent): void {
    this.session.stats.totalBargeInEvents++;

    // Update latency statistics
    const currentAvg = this.session.stats.avgBargeInLatency;
    const count = this.session.stats.totalBargeInEvents;
    this.session.stats.avgBargeInLatency = ((currentAvg * (count - 1)) + event.totalLatency) / count;

    this.session.stats.minBargeInLatency = Math.min(this.session.stats.minBargeInLatency, event.totalLatency);
    this.session.stats.maxBargeInLatency = Math.max(this.session.stats.maxBargeInLatency, event.totalLatency);
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BargeInConfig>): void {
    this.config = { ...this.config, ...updates };
    this.session.config = this.config;

    // Update service configurations
    if (this.vad && updates.vad) {
      this.vad.updateConfig(updates.vad);
    }

    if (this.ttsManager && updates.ttsInterruption) {
      this.ttsManager.updateConfig(updates.ttsInterruption);
    }

    logger.debug('Barge-in configuration updated', {
      sessionId: this.session.sessionId,
      updates
    });
  }

  /**
   * Get current session state
   */
  getSession(): BargeInSession {
    return { ...this.session };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    avgBargeInLatency: number;
    maxBargeInLatency: number;
    totalBargeInEvents: number;
    errorRate: number;
    vadMetrics?: PerformanceMetrics;
    ttsMetrics?: any;
  } {
    const avgLatency = this.bargeInHistory.length > 0
      ? this.bargeInHistory.reduce((a, b) => a + b, 0) / this.bargeInHistory.length
      : 0;

    const maxLatency = this.bargeInHistory.length > 0
      ? Math.max(...this.bargeInHistory)
      : 0;

    const errorRate = this.session.stats.totalBargeInEvents > 0
      ? this.errorCount / this.session.stats.totalBargeInEvents
      : 0;

    const vadMetrics = this.vad?.getPerformanceMetrics();
    const ttsMetrics = this.ttsManager?.getPerformanceMetrics();

    return {
      avgBargeInLatency: avgLatency,
      maxBargeInLatency: maxLatency,
      totalBargeInEvents: this.session.stats.totalBargeInEvents,
      errorRate,
      ...(vadMetrics && { vadMetrics }),
      ...(ttsMetrics && { ttsMetrics })
    };
  }

  /**
   * Get timing information for debugging (reserved for future timing analysis)
   */
  getTimingInfo(): { vadTriggerTime: number } {
    return {
      vadTriggerTime: this._vadTriggerTime
    };
  }

  /**
   * Enable/disable barge-in
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.session.config.enabled = enabled;

    if (this.ttsManager) {
      this.ttsManager.setEnabled(enabled);
    }

    logger.info('Barge-in enabled state changed', {
      sessionId: this.session.sessionId,
      enabled
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();

    if (this.ttsManager) {
      this.ttsManager.cleanup();
    }

    logger.info('BargeInOrchestrator cleaned up', {
      sessionId: this.session.sessionId
    });
  }
}

// Factory function
export function createBargeInOrchestrator(
  config?: Partial<BargeInConfig>,
  callbacks?: BargeInCallbacks
): BargeInOrchestrator {
  return new BargeInOrchestrator(config, callbacks);
}