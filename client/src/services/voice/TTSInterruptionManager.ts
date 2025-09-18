/**
 * TTSInterruptionManager - Real-time TTS interruption service
 *
 * Ultra-low latency TTS interruption with <50ms response time:
 * - Duck, pause, or stop TTS playback instantly
 * - Smooth audio transitions with fade effects
 * - State management for resume/restart functionality
 * - Multiple audio source support (HTML5 Audio, Web Audio API)
 * - Production-ready error handling and recovery
 */

import { createLogger } from '../../../../shared/utils';
import {
  TTSPlaybackState,
  TTSInterruptionEvent,
  BargeInConfig,
  BargeInError
} from '@shared/types/barge-in.types';

const logger = createLogger({ service: 'tts-interruption-manager' });

export interface TTSAudioSource {
  /** Unique identifier for the audio source */
  id: string;
  /** Audio element or Web Audio source */
  element: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode;
  /** Gain node for volume control (Web Audio API) */
  gainNode?: GainNode;
  /** Current playback state */
  state: TTSPlaybackState;
  /** Original volume before ducking */
  originalVolume: number;
  /** Audio context (if using Web Audio API) */
  audioContext?: AudioContext;
}

export interface TTSInterruptionCallbacks {
  onInterrupted: (event: TTSInterruptionEvent) => void;
  onResumed: (event: TTSInterruptionEvent) => void;
  onStopped: (event: TTSInterruptionEvent) => void;
  onError: (error: BargeInError) => void;
}

/**
 * Manager for real-time TTS interruption with multiple audio sources
 */
export class TTSInterruptionManager {
  private audioSources = new Map<string, TTSAudioSource>();
  private callbacks?: TTSInterruptionCallbacks;
  private config: BargeInConfig['ttsInterruption'];
  private sessionId: string;
  private isEnabled = true;

  // Performance tracking
  private interruptionHistory: number[] = [];
  private lastInterruptionTime = 0;

  constructor(
    config: BargeInConfig['ttsInterruption'],
    callbacks?: TTSInterruptionCallbacks
  ) {
    this.config = config;
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.sessionId = `tts_int_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info('TTSInterruptionManager initialized', {
      sessionId: this.sessionId,
      config: this.config
    });
  }

  /**
   * Register an audio source for interruption management
   */
  registerAudioSource(
    id: string,
    element: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode,
    audioContext?: AudioContext
  ): TTSAudioSource {
    if (this.audioSources.has(id)) {
      throw new Error(`Audio source with ID '${id}' already registered`);
    }

    const source: TTSAudioSource = {
      id,
      element,
      ...(audioContext && { audioContext }),
      originalVolume: this.getElementVolume(element),
      state: {
        isPlaying: false,
        isDucked: false,
        currentPosition: 0,
        totalDuration: 0,
        volume: this.getElementVolume(element),
        playbackRate: this.getElementPlaybackRate(element),
        sourceId: id
      }
    };

    // Set up Web Audio API gain node if using AudioContext
    if (audioContext && (element instanceof AudioBufferSourceNode || element instanceof AudioWorkletNode)) {
      source.gainNode = audioContext.createGain();
      source.gainNode.gain.value = source.originalVolume;

      // Connect the audio source through the gain node
      if (element instanceof AudioBufferSourceNode) {
        element.connect(source.gainNode);
        source.gainNode.connect(audioContext.destination);
      }
    }

    // Set up event listeners for HTML5 Audio
    if (element instanceof HTMLAudioElement) {
      this.setupHTMLAudioListeners(source);
    }

    this.audioSources.set(id, source);

    logger.debug('Audio source registered', {
      sessionId: this.sessionId,
      sourceId: id,
      hasAudioContext: !!audioContext,
      hasGainNode: !!source.gainNode
    });

    return source;
  }

  /**
   * Unregister an audio source
   */
  unregisterAudioSource(id: string): void {
    const source = this.audioSources.get(id);
    if (!source) {
      return;
    }

    // Clean up Web Audio connections
    if (source.gainNode) {
      source.gainNode.disconnect();
    }

    this.audioSources.delete(id);

    logger.debug('Audio source unregistered', {
      sessionId: this.sessionId,
      sourceId: id
    });
  }

  /**
   * Interrupt TTS playback with specified mode
   */
  async interrupt(
    reason: 'vad_active' | 'user_command' | 'timeout' | 'error' = 'vad_active',
    sourceIds?: string[]
  ): Promise<TTSInterruptionEvent[]> {
    if (!this.isEnabled) {
      logger.debug('TTS interruption disabled, skipping interrupt');
      return [];
    }

    const startTime = performance.now();
    const events: TTSInterruptionEvent[] = [];
    const targetSources = sourceIds
      ? sourceIds.map(id => this.audioSources.get(id)).filter(Boolean) as TTSAudioSource[]
      : Array.from(this.audioSources.values());

    // Prevent rapid interruptions
    const timeSinceLastInterruption = startTime - this.lastInterruptionTime;
    if (timeSinceLastInterruption < 50) { // 50ms minimum between interruptions
      logger.debug('Skipping interruption due to rapid consecutive calls', {
        timeSinceLastInterruption
      });
      return [];
    }

    try {
      logger.debug('Starting TTS interruption', {
        sessionId: this.sessionId,
        reason,
        mode: this.config.mode,
        targetSources: targetSources.length
      });

      // Process each target source
      for (const source of targetSources) {
        if (!source.state.isPlaying) {
          continue; // Skip sources that aren't playing
        }

        const previousState = { ...source.state };

        try {
          await this.interruptAudioSource(source, reason);

          const responseLatency = performance.now() - startTime;

          const event: TTSInterruptionEvent = {
            type: this.config.mode as 'duck' | 'pause' | 'stop',
            timestamp: Date.now(),
            responseLatency,
            reason,
            previousState,
            newState: { ...source.state }
          };

          events.push(event);
          this.callbacks?.onInterrupted(event);

          logger.debug('Audio source interrupted successfully', {
            sessionId: this.sessionId,
            sourceId: source.id,
            responseLatency
          });

        } catch (error) {
          const bargeInError: BargeInError = {
            code: 'TTS_INTERRUPT_FAILED',
            message: `Failed to interrupt audio source ${source.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: 'high',
            timestamp: Date.now(),
            context: {
              sessionId: this.sessionId,
              sourceId: source.id,
              reason,
              error
            },
            recovery: ['Retry interruption', 'Reset audio source', 'Check audio context state']
          };

          this.callbacks?.onError(bargeInError);
        }
      }

      // Track performance
      const totalLatency = performance.now() - startTime;
      this.interruptionHistory.push(totalLatency);
      this.lastInterruptionTime = startTime;

      // Keep history limited
      if (this.interruptionHistory.length > 100) {
        this.interruptionHistory = this.interruptionHistory.slice(-50);
      }

      // Check performance target
      if (totalLatency > 50) { // 50ms target
        const bargeInError: BargeInError = {
          code: 'LATENCY_EXCEEDED',
          message: `TTS interruption latency exceeded target: ${totalLatency.toFixed(2)}ms > 50ms`,
          severity: 'medium',
          timestamp: Date.now(),
          context: {
            sessionId: this.sessionId,
            latency: totalLatency,
            targetLatency: 50,
            reason
          },
          recovery: ['Optimize audio processing', 'Reduce fade duration', 'Check system performance']
        };

        this.callbacks?.onError(bargeInError);
      }

      logger.info('TTS interruption completed', {
        sessionId: this.sessionId,
        totalLatency,
        interruptedSources: events.length,
        reason
      });

      return events;

    } catch (error) {
      const bargeInError: BargeInError = {
        code: 'TTS_INTERRUPT_FAILED',
        message: `TTS interruption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
        timestamp: Date.now(),
        context: {
          sessionId: this.sessionId,
          reason,
          error
        },
        recovery: ['Restart TTS interruption manager', 'Check audio context state']
      };

      this.callbacks?.onError(bargeInError);
      throw error;
    }
  }

  /**
   * Resume interrupted TTS playback
   */
  async resume(sourceIds?: string[]): Promise<TTSInterruptionEvent[]> {
    const events: TTSInterruptionEvent[] = [];
    const targetSources = sourceIds
      ? sourceIds.map(id => this.audioSources.get(id)).filter(Boolean) as TTSAudioSource[]
      : Array.from(this.audioSources.values());

    for (const source of targetSources) {
      if (!source.state.isDucked && this.config.mode !== 'pause') {
        continue; // Skip sources that aren't interrupted
      }

      const previousState = { ...source.state };

      try {
        await this.resumeAudioSource(source);

        const event: TTSInterruptionEvent = {
          type: 'resume',
          timestamp: Date.now(),
          responseLatency: 0, // Resume is typically immediate
          reason: 'user_command',
          previousState,
          newState: { ...source.state }
        };

        events.push(event);
        this.callbacks?.onResumed(event);

      } catch (error) {
        logger.error('Failed to resume audio source', {
          sessionId: this.sessionId,
          sourceId: source.id,
          error
        });
      }
    }

    logger.debug('TTS resume completed', {
      sessionId: this.sessionId,
      resumedSources: events.length
    });

    return events;
  }

  /**
   * Stop all TTS playback
   */
  async stopAll(): Promise<TTSInterruptionEvent[]> {
    const events: TTSInterruptionEvent[] = [];

    for (const source of this.audioSources.values()) {
      if (!source.state.isPlaying) {
        continue;
      }

      const previousState = { ...source.state };

      try {
        this.stopAudioSource(source);

        const event: TTSInterruptionEvent = {
          type: 'stop',
          timestamp: Date.now(),
          responseLatency: 0,
          reason: 'user_command',
          previousState,
          newState: { ...source.state }
        };

        events.push(event);
        this.callbacks?.onStopped(event);

      } catch (error) {
        logger.error('Failed to stop audio source', {
          sessionId: this.sessionId,
          sourceId: source.id,
          error
        });
      }
    }

    return events;
  }

  /**
   * Interrupt a specific audio source
   */
  private async interruptAudioSource(
    source: TTSAudioSource,
    _reason: string
  ): Promise<void> {
    const startTime = performance.now();

    switch (this.config.mode) {
      case 'duck':
        await this.duckAudioSource(source);
        break;

      case 'pause':
        this.pauseAudioSource(source);
        break;

      case 'stop':
        this.stopAudioSource(source);
        break;

      default:
        throw new Error(`Unknown interruption mode: ${this.config.mode}`);
    }

    const latency = performance.now() - startTime;
    logger.debug('Audio source interruption completed', {
      sessionId: this.sessionId,
      sourceId: source.id,
      mode: this.config.mode,
      latency
    });
  }

  /**
   * Duck audio source (reduce volume)
   */
  private async duckAudioSource(source: TTSAudioSource): Promise<void> {
    const targetVolume = this.config.duckVolume;
    const fadeDuration = this.config.fadeDurationMs / 1000; // Convert to seconds

    if (source.gainNode && source.audioContext) {
      // Use Web Audio API for smooth fading
      const currentTime = source.audioContext.currentTime;
      source.gainNode.gain.setValueAtTime(source.originalVolume, currentTime);
      source.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration);

    } else if (source.element instanceof HTMLAudioElement) {
      // Use HTML5 Audio with manual fade
      await this.fadeAudioElement(source.element, source.originalVolume, targetVolume, fadeDuration);
    }

    source.state.isDucked = true;
    source.state.volume = targetVolume;
  }

  /**
   * Pause audio source
   */
  private pauseAudioSource(source: TTSAudioSource): void {
    if (source.element instanceof HTMLAudioElement) {
      source.state.currentPosition = source.element.currentTime;
      source.element.pause();
    } else if (source.element instanceof AudioBufferSourceNode) {
      // AudioBufferSourceNode can't be paused, so we need to stop and recreate
      source.element.stop();
    }

    source.state.isPlaying = false;
    source.state.isDucked = true;
  }

  /**
   * Stop audio source
   */
  private stopAudioSource(source: TTSAudioSource): void {
    if (source.element instanceof HTMLAudioElement) {
      source.element.pause();
      source.element.currentTime = 0;
    } else if (source.element instanceof AudioBufferSourceNode) {
      source.element.stop();
    }

    source.state.isPlaying = false;
    source.state.isDucked = false;
    source.state.currentPosition = 0;
  }

  /**
   * Resume audio source
   */
  private async resumeAudioSource(source: TTSAudioSource): Promise<void> {
    if (this.config.mode === 'duck' && source.state.isDucked) {
      // Restore original volume
      const fadeDuration = this.config.fadeDurationMs / 1000;

      if (source.gainNode && source.audioContext) {
        const currentTime = source.audioContext.currentTime;
        source.gainNode.gain.setValueAtTime(source.state.volume, currentTime);
        source.gainNode.gain.linearRampToValueAtTime(source.originalVolume, currentTime + fadeDuration);

      } else if (source.element instanceof HTMLAudioElement) {
        await this.fadeAudioElement(source.element, source.state.volume, source.originalVolume, fadeDuration);
      }

      source.state.isDucked = false;
      source.state.volume = source.originalVolume;

    } else if (this.config.mode === 'pause') {
      // Resume playback from current position
      if (source.element instanceof HTMLAudioElement) {
        try {
          await source.element.play();
          source.state.isPlaying = true;
        } catch (error) {
          logger.error('Failed to resume HTML audio element', { error });
        }
      }

      source.state.isDucked = false;
    }
  }

  /**
   * Fade audio element volume smoothly
   */
  private async fadeAudioElement(
    element: HTMLAudioElement,
    startVolume: number,
    endVolume: number,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      const steps = 20; // Number of fade steps
      const stepDuration = duration * 1000 / steps; // Convert to ms
      const volumeStep = (endVolume - startVolume) / steps;
      let currentStep = 0;

      const fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = startVolume + (volumeStep * currentStep);
        element.volume = Math.max(0, Math.min(1, newVolume));

        if (currentStep >= steps) {
          clearInterval(fadeInterval);
          element.volume = endVolume;
          resolve();
        }
      }, stepDuration);
    });
  }

  /**
   * Set up event listeners for HTML5 Audio elements
   */
  private setupHTMLAudioListeners(source: TTSAudioSource): void {
    const element = source.element as HTMLAudioElement;

    element.addEventListener('play', () => {
      source.state.isPlaying = true;
      source.state.currentPosition = element.currentTime;
    });

    element.addEventListener('pause', () => {
      source.state.isPlaying = false;
      source.state.currentPosition = element.currentTime;
    });

    element.addEventListener('ended', () => {
      source.state.isPlaying = false;
      source.state.currentPosition = 0;
      source.state.isDucked = false;
    });

    element.addEventListener('timeupdate', () => {
      source.state.currentPosition = element.currentTime;
      source.state.totalDuration = element.duration || 0;
    });
  }

  /**
   * Get element volume
   */
  private getElementVolume(element: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode): number {
    if (element instanceof HTMLAudioElement) {
      return element.volume;
    }
    return 1.0; // Default volume for Web Audio API sources
  }

  /**
   * Get element playback rate
   */
  private getElementPlaybackRate(element: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode): number {
    if (element instanceof HTMLAudioElement) {
      return element.playbackRate;
    }
    return 1.0; // Default playback rate
  }

  /**
   * Enable/disable interruption
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.debug('TTS interruption enabled state changed', {
      sessionId: this.sessionId,
      enabled
    });
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<BargeInConfig['ttsInterruption']>): void {
    this.config = { ...this.config, ...updates };
    logger.debug('TTS interruption config updated', {
      sessionId: this.sessionId,
      updates
    });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    avgInterruptionLatency: number;
    maxInterruptionLatency: number;
    totalInterruptions: number;
  } {
    const avgLatency = this.interruptionHistory.length > 0
      ? this.interruptionHistory.reduce((a, b) => a + b, 0) / this.interruptionHistory.length
      : 0;

    const maxLatency = this.interruptionHistory.length > 0
      ? Math.max(...this.interruptionHistory)
      : 0;

    return {
      avgInterruptionLatency: avgLatency,
      maxInterruptionLatency: maxLatency,
      totalInterruptions: this.interruptionHistory.length
    };
  }

  /**
   * Get all registered audio sources
   */
  getAudioSources(): TTSAudioSource[] {
    return Array.from(this.audioSources.values());
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    for (const source of this.audioSources.values()) {
      if (source.gainNode) {
        source.gainNode.disconnect();
      }
    }

    this.audioSources.clear();

    logger.info('TTSInterruptionManager cleaned up', {
      sessionId: this.sessionId
    });
  }
}

// Factory function
export function createTTSInterruptionManager(
  config: BargeInConfig['ttsInterruption'],
  callbacks?: TTSInterruptionCallbacks
): TTSInterruptionManager {
  return new TTSInterruptionManager(config, callbacks);
}