/**
 * VoiceActivityDetector - Ultra-low latency VAD service
 *
 * Real-time voice activity detection with <20ms decision latency:
 * - AudioWorklet-based processing on audio thread
   getCurrentState(): {
    isActive: boolean;
    lastDecision?: VADDecision;
    consecutiveActiveFrames: number;
    consecutiveInactiveFrames: number;
    averageLatency: number;
  } {
    const baseState = {
      isActive: this.isActive,
      consecutiveActiveFrames: this.consecutiveActiveFrames,
      consecutiveInactiveFrames: this.consecutiveInactiveFrames,
      averageLatency: this.calculateAverageLatency()
    };

    return this.lastDecision 
      ? { ...baseState, lastDecision: this.lastDecision }
      : baseState;
  }ro-crossing analysis
 * - Spectral analysis for advanced detection
 * - Debouncing and smoothing for stability
 * - Production-ready error handling
 */

import { createLogger } from '../../../../shared/utils';
import {
  VADDecision,
  VADConfig,
  AudioWorkletBargeInMessage,
  PerformanceMetrics,
  AudioLevelUpdate,
  BargeInError,
  DEFAULT_VAD_CONFIG
} from '@shared/types/barge-in.types';

const logger = createLogger({ service: 'voice-activity-detector' });

export interface VADServiceCallbacks {
  onVADDecision: (decision: VADDecision) => void;
  onAudioLevelUpdate: (levels: AudioLevelUpdate) => void;
  onPerformanceUpdate: (metrics: PerformanceMetrics) => void;
  onError: (error: BargeInError) => void;
}

/**
 * Voice Activity Detector with ultra-low latency processing
 */
export class VoiceActivityDetector {
  private config: VADConfig;
  private callbacks?: VADServiceCallbacks;
  private audioContext?: AudioContext;
  private processorNode?: AudioWorkletNode;
  private mediaStreamSource?: MediaStreamAudioSourceNode;
  private isActive = false;
  private sessionId: string;

  // Performance tracking
  private startTime = 0;
  private frameCount = 0;
  private latencyHistory: number[] = [];
  private lastDecision?: VADDecision;

  // State tracking
  private consecutiveActiveFrames = 0;
  private consecutiveInactiveFrames = 0;
  private lastDecisionTime = 0;

  constructor(
    config: Partial<VADConfig> = {},
    callbacks?: VADServiceCallbacks
  ) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.sessionId = `vad_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info('VoiceActivityDetector initialized', {
      sessionId: this.sessionId,
      config: this.config
    });
  }

  /**
   * Start VAD processing with audio stream
   */
  async start(mediaStream: MediaStream): Promise<void> {
    if (this.isActive) {
      throw new Error('VAD is already active');
    }

    try {
      logger.debug('Starting VAD processing', { sessionId: this.sessionId });

      // Create AudioContext with optimal settings for low latency
      this.audioContext = new AudioContext({
        sampleRate: 48000, // Match Opus encoding requirements
        latencyHint: 'interactive', // Minimize latency
      });

      // Load audio worklet processor
      await this.loadAudioWorklet();

      // Create VAD processor node
      this.processorNode = new AudioWorkletNode(
        this.audioContext,
        'vad-processor',
        {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          processorOptions: {
            vadConfig: this.config,
            sessionId: this.sessionId,
          },
        }
      );

      // Set up message handling from audio worklet
      this.setupWorkletMessageHandling();

      // Connect audio stream
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(mediaStream);
      this.mediaStreamSource.connect(this.processorNode);

      this.isActive = true;
      this.startTime = performance.now();

      logger.info('VAD processing started successfully', {
        sessionId: this.sessionId,
        sampleRate: this.audioContext.sampleRate,
        latencyHint: 'interactive'
      });

    } catch (error) {
      await this.cleanup();
      const vadError: BargeInError = {
        code: 'VAD_FAILED',
        message: `Failed to start VAD: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical',
        timestamp: Date.now(),
        context: { sessionId: this.sessionId, error },
        recovery: ['Check microphone permissions', 'Verify audio context support', 'Try restarting VAD']
      };

      this.callbacks?.onError(vadError);
      throw error;
    }
  }

  /**
   * Stop VAD processing
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    logger.debug('Stopping VAD processing', { sessionId: this.sessionId });

    await this.cleanup();
    this.isActive = false;

    logger.info('VAD processing stopped', {
      sessionId: this.sessionId,
      totalFrames: this.frameCount,
      avgLatency: this.getAverageLatency()
    });
  }

  /**
   * Update VAD configuration
   */
  updateConfig(updates: Partial<VADConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };

    logger.debug('VAD config updated', {
      sessionId: this.sessionId,
      updates,
      oldConfig,
      newConfig: this.config
    });

    // Send config update to audio worklet
    if (this.processorNode) {
      this.processorNode.port.postMessage({
        type: 'config_update',
        payload: this.config,
        timestamp: performance.now()
      } as AudioWorkletBargeInMessage);
    }
  }

  /**
   * Get current VAD state
   */
  getCurrentState(): {
    isActive: boolean;
    lastDecision?: VADDecision;
    consecutiveActiveFrames: number;
    consecutiveInactiveFrames: number;
    averageLatency: number;
  } {
    const baseState = {
      isActive: this.isActive,
      consecutiveActiveFrames: this.consecutiveActiveFrames,
      consecutiveInactiveFrames: this.consecutiveInactiveFrames,
      averageLatency: this.getAverageLatency()
    };

    return this.lastDecision 
      ? { ...baseState, lastDecision: this.lastDecision }
      : baseState;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = performance.now();
    const runTime = (now - this.startTime) / 1000; // Convert to seconds

    return {
      avgVadLatency: this.getAverageLatency(),
      maxVadLatency: Math.max(...this.latencyHistory, 0),
      vadDecisionsPerSecond: this.frameCount / Math.max(runTime, 1),
      audioFrameRate: this.frameCount / Math.max(runTime, 1),
      droppedFrames: 0, // Would need to track from worklet
      cpuUsage: 0, // Would need to estimate from frame processing times
    };
  }

  /**
   * Load audio worklet processor
   */
  private async loadAudioWorklet(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    try {
      // Try to load the worklet module
      await this.audioContext.audioWorklet.addModule('/vad-worklet-processor.js');
      logger.debug('VAD worklet processor loaded successfully');
    } catch (error) {
      // If the worklet is already loaded, this will fail silently
      logger.debug('VAD worklet processor already loaded or failed to load', { error });

      // Check if the processor is available
      if (!this.audioContext.audioWorklet) {
        throw new Error('AudioWorklet not supported in this browser');
      }
    }
  }

  /**
   * Set up message handling from audio worklet
   */
  private setupWorkletMessageHandling(): void {
    if (!this.processorNode) {
      return;
    }

    this.processorNode.port.onmessage = (event) => {
      try {
        const message = event.data as AudioWorkletBargeInMessage;
        this.handleWorkletMessage(message);
      } catch (error) {
        logger.error('Error handling worklet message', {
          sessionId: this.sessionId,
          error,
          messageData: event.data
        });
      }
    };

    this.processorNode.port.addEventListener('error', (error) => {
      const vadError: BargeInError = {
        code: 'VAD_FAILED',
        message: `Audio worklet error: ${error instanceof ErrorEvent ? error.message : 'Unknown error'}`,
        severity: 'high',
        timestamp: Date.now(),
        context: { sessionId: this.sessionId, error },
        recovery: ['Restart VAD', 'Check audio worklet support']
      };

      this.callbacks?.onError(vadError);
    });
  }

  /**
   * Handle messages from audio worklet
   */
  private handleWorkletMessage(message: AudioWorkletBargeInMessage): void {
    const now = performance.now();

    switch (message.type) {
      case 'vad_decision': {
        const decision = message.payload as VADDecision;
        this.processVADDecision(decision, now);
        break;
      }

      case 'audio_level': {
        const levels = message.payload as AudioLevelUpdate;
        this.callbacks?.onAudioLevelUpdate(levels);
        break;
      }

      case 'performance_update': {
        const metrics = message.payload as PerformanceMetrics;
        this.callbacks?.onPerformanceUpdate(metrics);
        break;
      }

      default:
        logger.warn('Unknown message type from VAD worklet', {
          sessionId: this.sessionId,
          messageType: message.type
        });
    }
  }

  /**
   * Process VAD decision from worklet
   */
  private processVADDecision(decision: VADDecision, currentTime: number): void {
    // Calculate actual latency
    const actualLatency = currentTime - decision.timestamp;
    this.latencyHistory.push(actualLatency);

    // Keep latency history limited to last 100 measurements
    if (this.latencyHistory.length > 100) {
      this.latencyHistory = this.latencyHistory.slice(-50);
    }

    // Update frame counters
    this.frameCount++;
    if (decision.active) {
      this.consecutiveActiveFrames++;
      this.consecutiveInactiveFrames = 0;
    } else {
      this.consecutiveInactiveFrames++;
      this.consecutiveActiveFrames = 0;
    }

    // Check latency performance
    if (actualLatency > this.config.maxLatencyMs) {
      const vadError: BargeInError = {
        code: 'LATENCY_EXCEEDED',
        message: `VAD latency exceeded target: ${actualLatency.toFixed(2)}ms > ${this.config.maxLatencyMs}ms`,
        severity: 'medium',
        timestamp: Date.now(),
        context: {
          sessionId: this.sessionId,
          actualLatency,
          targetLatency: this.config.maxLatencyMs,
          decision
        },
        recovery: ['Reduce VAD processing complexity', 'Increase target latency', 'Check system performance']
      };

      this.callbacks?.onError(vadError);
    }

    // Apply debouncing based on config
    const timeSinceLastDecision = currentTime - this.lastDecisionTime;
    if (timeSinceLastDecision < this.config.hangMs / 2) {
      // Skip if too soon after last decision (rapid changes)
      return;
    }

    // Update state
    this.lastDecision = {
      ...decision,
      latency: actualLatency
    };
    this.lastDecisionTime = currentTime;

    // Notify callbacks
    this.callbacks?.onVADDecision(this.lastDecision);

    logger.debug('VAD decision processed', {
      sessionId: this.sessionId,
      active: decision.active,
      confidence: decision.confidence,
      latency: actualLatency,
      consecutiveActiveFrames: this.consecutiveActiveFrames
    });
  }

  /**
   * Calculate average latency
   */
  private getAverageLatency(): number {
    if (this.latencyHistory.length === 0) {
      return 0;
    }

    const sum = this.latencyHistory.reduce((acc, latency) => acc + latency, 0);
    return sum / this.latencyHistory.length;
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    try {
      if (this.mediaStreamSource) {
        this.mediaStreamSource.disconnect();
        delete this.mediaStreamSource;
      }

      if (this.processorNode) {
        this.processorNode.disconnect();
        delete this.processorNode;
      }

      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        delete this.audioContext;
      }
    } catch (error) {
      logger.error('Error during VAD cleanup', {
        sessionId: this.sessionId,
        error
      });
    }
  }

  /**
   * Get configuration
   */
  getConfig(): VADConfig {
    return { ...this.config };
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// Factory function for creating VAD instances
export function createVoiceActivityDetector(
  config?: Partial<VADConfig>,
  callbacks?: VADServiceCallbacks
): VoiceActivityDetector {
  return new VoiceActivityDetector(config, callbacks);
}