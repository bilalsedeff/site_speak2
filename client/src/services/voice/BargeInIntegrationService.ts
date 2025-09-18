/**
 * BargeInIntegrationService - Main integration point for SiteSpeak barge-in
 *
 * Complete integration service that provides a single interface for:
 * - Ultra-low latency barge-in functionality (<50ms total)
 * - Voice Activity Detection with <20ms decision latency
 * - Real-time TTS interruption with smooth transitions
 * - Universal website compatibility
 * - Production-ready error handling and monitoring
 */

import { createLogger } from '../../../../shared/utils';
import {
  BargeInConfig,
  BargeInCallbacks,
  BargeInSession,
  BargeInEvent,
  VADDecision,
  TTSInterruptionEvent,
  AudioLevelUpdate,
  PerformanceMetrics,
  DEFAULT_BARGE_IN_CONFIG
} from '@shared/types/barge-in.types';

import { BargeInOrchestrator } from './BargeInOrchestrator';

const logger = createLogger({ service: 'barge-in-integration' });

export interface BargeInIntegrationConfig extends Partial<BargeInConfig> {
  /** Enable debug logging */
  debugMode?: boolean;
  /** Auto-start on initialization */
  autoStart?: boolean;
  /** Maximum retry attempts for failed operations */
  maxRetries?: number;
}

/**
 * Main integration service for SiteSpeak barge-in functionality
 */
export class BargeInIntegrationService {
  private config: BargeInConfig;
  private callbacks?: BargeInCallbacks;
  private orchestrator?: BargeInOrchestrator;
  private mediaStream?: MediaStream;
  private isInitialized = false;
  private isActive = false;
  private debugMode = false;
  private maxRetries = 3;

  // Integration state
  private retryCount = 0;
  private lastError?: Error;
  private integrationStartTime = 0;

  constructor(
    config: BargeInIntegrationConfig = {},
    callbacks?: BargeInCallbacks
  ) {
    const { debugMode, autoStart, maxRetries, ...bargeInConfig } = config;

    this.config = { ...DEFAULT_BARGE_IN_CONFIG, ...bargeInConfig };
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.debugMode = debugMode || false;
    this.maxRetries = maxRetries || 3;

    logger.info('BargeInIntegrationService initialized', {
      debugMode: this.debugMode,
      autoStart,
      config: this.config
    });

    if (autoStart) {
      this.initializeAsync();
    }
  }

  /**
   * Initialize barge-in functionality
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('BargeInIntegrationService already initialized');
      return;
    }

    try {
      logger.info('Initializing barge-in integration service');
      this.integrationStartTime = performance.now();

      // Create orchestrator with enhanced callbacks
      const enhancedCallbacks: BargeInCallbacks = {
        onBargeInDetected: (event) => this.handleBargeInDetected(event),
        onTTSInterrupted: (event) => this.handleTTSInterrupted(event),
        onVADStateChange: (decision) => this.handleVADStateChange(decision),
        onAudioLevelUpdate: (levels) => this.handleAudioLevelUpdate(levels),
        onPerformanceUpdate: (metrics) => this.handlePerformanceUpdate(metrics),
        onError: (error) => this.handleError(error)
      };

      this.orchestrator = new BargeInOrchestrator(this.config, enhancedCallbacks);
      this.isInitialized = true;
      this.retryCount = 0;

      const initTime = performance.now() - this.integrationStartTime;
      logger.info('BargeInIntegrationService initialized successfully', {
        initTime: `${initTime.toFixed(2)}ms`
      });

    } catch (error) {
      logger.error('Failed to initialize BargeInIntegrationService', { error });
      this.lastError = error instanceof Error ? error : new Error('Unknown initialization error');
      throw this.lastError;
    }
  }

  /**
   * Start barge-in functionality with microphone access
   */
  async start(constraints?: MediaStreamConstraints): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isActive) {
      logger.debug('BargeInIntegrationService already active');
      return;
    }

    try {
      logger.info('Starting barge-in functionality');

      // Get microphone access with optimal settings for voice detection
      const defaultConstraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
          // latency: { ideal: 0.01 } // 10ms latency hint - removed as invalid property
        },
        video: false
      };

      const finalConstraints = { ...defaultConstraints, ...constraints };
      this.mediaStream = await navigator.mediaDevices.getUserMedia(finalConstraints);

      // Start orchestrator
      await this.orchestrator!.start(this.mediaStream);
      this.isActive = true;

      logger.info('BargeInIntegrationService started successfully', {
        audioTracks: this.mediaStream.getAudioTracks().length,
        sampleRate: this.mediaStream.getAudioTracks()[0]?.getSettings()?.sampleRate
      });

    } catch (error) {
      logger.error('Failed to start BargeInIntegrationService', { error });
      await this.handleStartError(error);
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

    try {
      logger.info('Stopping barge-in functionality');

      // Stop orchestrator
      if (this.orchestrator) {
        await this.orchestrator.stop();
      }

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        delete this.mediaStream;
      }

      this.isActive = false;

      logger.info('BargeInIntegrationService stopped successfully');

    } catch (error) {
      logger.error('Error stopping BargeInIntegrationService', { error });
    }
  }

  /**
   * Register TTS audio source for interruption
   */
  registerTTSAudio(
    id: string,
    audioElement: HTMLAudioElement | AudioBufferSourceNode | AudioWorkletNode,
    audioContext?: AudioContext
  ): void {
    if (!this.orchestrator) {
      throw new Error('BargeInIntegrationService not initialized');
    }

    this.orchestrator.registerTTSSource(id, audioElement, audioContext);

    if (this.debugMode) {
      logger.debug('TTS audio source registered', { id, hasAudioContext: !!audioContext });
    }
  }

  /**
   * Unregister TTS audio source
   */
  unregisterTTSAudio(id: string): void {
    if (this.orchestrator) {
      this.orchestrator.unregisterTTSSource(id);
    }

    if (this.debugMode) {
      logger.debug('TTS audio source unregistered', { id });
    }
  }

  /**
   * Update barge-in configuration
   */
  updateConfiguration(updates: Partial<BargeInConfig>): void {
    this.config = { ...this.config, ...updates };

    if (this.orchestrator) {
      this.orchestrator.updateConfig(updates);
    }

    logger.debug('BargeIn configuration updated', { updates });
  }

  /**
   * Enable or disable barge-in functionality
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;

    if (this.orchestrator) {
      this.orchestrator.setEnabled(enabled);
    }

    logger.info('BargeIn enabled state changed', { enabled });
  }

  /**
   * Get current session information
   */
  getSession(): BargeInSession | null {
    return this.orchestrator?.getSession() || null;
  }

  /**
   * Get comprehensive performance metrics
   */
  getPerformanceMetrics(): {
    integration: {
      isInitialized: boolean;
      isActive: boolean;
      initTime: number;
      retryCount: number;
      lastError?: string | undefined;
    };
    bargeIn?: ReturnType<BargeInOrchestrator['getPerformanceMetrics']>;
  } {
    const result: {
      integration: {
        isInitialized: boolean;
        isActive: boolean;
        initTime: number;
        retryCount: number;
        lastError?: string | undefined;
      };
      bargeIn?: ReturnType<BargeInOrchestrator['getPerformanceMetrics']>;
    } = {
      integration: {
        isInitialized: this.isInitialized,
        isActive: this.isActive,
        initTime: this.integrationStartTime ? performance.now() - this.integrationStartTime : 0,
        retryCount: this.retryCount,
        lastError: this.lastError?.message || undefined
      }
    };

    const bargeInMetrics = this.orchestrator?.getPerformanceMetrics();
    if (bargeInMetrics) {
      result.bargeIn = bargeInMetrics;
    }

    return result;
  }

  /**
   * Run comprehensive performance test
   */
  async runPerformanceTest(duration: number = 10000): Promise<{
    testDuration: number;
    vadLatency: { avg: number; max: number; min: number };
    bargeInLatency: { avg: number; max: number; min: number };
    totalEvents: number;
    errorCount: number;
    targetsMet: {
      vadUnder20ms: boolean;
      bargeInUnder50ms: boolean;
    };
  }> {
    if (!this.isActive) {
      throw new Error('BargeInIntegrationService must be active to run performance test');
    }

    logger.info('Starting barge-in performance test', { duration });

    const testStartTime = performance.now();
    const vadLatencies: number[] = [];
    const bargeInLatencies: number[] = [];
    let totalEvents = 0;
    let errorCount = 0;

    // Set up test callbacks
    const testCallbacks: BargeInCallbacks = {
      onVADStateChange: (decision: VADDecision) => {
        vadLatencies.push(decision.latency);
        totalEvents++;
      },
      onBargeInDetected: (event: BargeInEvent) => {
        bargeInLatencies.push(event.totalLatency);
      },
      onTTSInterrupted: () => {
        // TTS interruption during performance test
      },
      onAudioLevelUpdate: () => {
        // Audio level updates during performance test
      },
      onPerformanceUpdate: () => {
        // Performance updates during test
      },
      onError: () => {
        errorCount++;
      }
    };

    // Store original callbacks
    const originalCallbacks = this.callbacks;

    // Set test callbacks temporarily
    this.callbacks = {
      ...this.callbacks,
      ...testCallbacks
    };

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Restore original callbacks
    if (originalCallbacks) {
      this.callbacks = originalCallbacks;
    }

    const testDuration = performance.now() - testStartTime;

    // Calculate results
    const avgVadLatency = vadLatencies.length > 0
      ? vadLatencies.reduce((a, b) => a + b, 0) / vadLatencies.length
      : 0;
    const maxVadLatency = vadLatencies.length > 0 ? Math.max(...vadLatencies) : 0;
    const minVadLatency = vadLatencies.length > 0 ? Math.min(...vadLatencies) : 0;

    const avgBargeInLatency = bargeInLatencies.length > 0
      ? bargeInLatencies.reduce((a, b) => a + b, 0) / bargeInLatencies.length
      : 0;
    const maxBargeInLatency = bargeInLatencies.length > 0 ? Math.max(...bargeInLatencies) : 0;
    const minBargeInLatency = bargeInLatencies.length > 0 ? Math.min(...bargeInLatencies) : 0;

    const results = {
      testDuration,
      vadLatency: { avg: avgVadLatency, max: maxVadLatency, min: minVadLatency },
      bargeInLatency: { avg: avgBargeInLatency, max: maxBargeInLatency, min: minBargeInLatency },
      totalEvents,
      errorCount,
      targetsMet: {
        vadUnder20ms: avgVadLatency < 20,
        bargeInUnder50ms: avgBargeInLatency < 50
      }
    };

    logger.info('Performance test completed', results);
    return results;
  }

  /**
   * Handle barge-in detected events
   */
  private handleBargeInDetected(event: BargeInEvent): void {
    if (this.debugMode) {
      logger.debug('Barge-in detected', {
        type: event.type,
        totalLatency: event.totalLatency,
        vadLatency: event.metrics.vadLatency,
        ttsLatency: event.metrics.ttsInterruptLatency
      });
    }

    this.callbacks?.onBargeInDetected(event);
  }

  /**
   * Handle TTS interruption events
   */
  private handleTTSInterrupted(event: TTSInterruptionEvent): void {
    if (this.debugMode) {
      logger.debug('TTS interrupted', {
        type: event.type,
        responseLatency: event.responseLatency,
        reason: event.reason
      });
    }

    this.callbacks?.onTTSInterrupted(event);
  }

  /**
   * Handle VAD state changes
   */
  private handleVADStateChange(decision: VADDecision): void {
    if (this.debugMode && decision.active) {
      logger.debug('VAD state change', {
        active: decision.active,
        confidence: decision.confidence,
        latency: decision.latency
      });
    }

    this.callbacks?.onVADStateChange(decision);
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
    if (this.debugMode) {
      logger.debug('Performance update', {
        avgVadLatency: metrics.avgVadLatency,
        maxVadLatency: metrics.maxVadLatency,
        vadDecisionsPerSecond: metrics.vadDecisionsPerSecond
      });
    }

    this.callbacks?.onPerformanceUpdate(metrics);
  }

  /**
   * Handle errors with retry logic
   */
  private async handleError(error: any): Promise<void> {
    logger.error('BargeIn error occurred', { error: error.message || error });

    this.callbacks?.onError(error);

    // Implement retry logic for recoverable errors
    if (this.retryCount < this.maxRetries && this.isRecoverableError(error)) {
      this.retryCount++;
      logger.info(`Attempting recovery (attempt ${this.retryCount}/${this.maxRetries})`);

      try {
        await this.attemptRecovery(error);
      } catch (recoveryError) {
        logger.error('Recovery attempt failed', { recoveryError });
      }
    }
  }

  /**
   * Handle start errors with specific recovery
   */
  private async handleStartError(error: any): Promise<void> {
    if (error.name === 'NotAllowedError') {
      logger.error('Microphone access denied by user');
    } else if (error.name === 'NotFoundError') {
      logger.error('No microphone found');
    } else if (error.name === 'NotSupportedError') {
      logger.error('Audio features not supported in this browser');
    } else {
      logger.error('Unknown error starting barge-in service', { error });
    }

    this.lastError = error instanceof Error ? error : new Error('Start error');
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverableError(error: any): boolean {
    const recoverableCodes = ['LATENCY_EXCEEDED', 'VAD_FAILED', 'TTS_INTERRUPT_FAILED'];
    return recoverableCodes.includes(error.code);
  }

  /**
   * Attempt to recover from error
   */
  private async attemptRecovery(error: any): Promise<void> {
    switch (error.code) {
      case 'LATENCY_EXCEEDED':
        // Reduce processing complexity
        this.updateConfiguration({
          vad: {
            ...this.config.vad,
            useSpectralAnalysis: false,
            maxLatencyMs: this.config.vad.maxLatencyMs * 1.5
          }
        });
        break;

      case 'VAD_FAILED':
        // Restart VAD
        if (this.orchestrator && this.mediaStream) {
          await this.orchestrator.stop();
          await this.orchestrator.start(this.mediaStream);
        }
        break;

      case 'TTS_INTERRUPT_FAILED':
        // Reset TTS interruption
        this.updateConfiguration({
          ttsInterruption: {
            ...this.config.ttsInterruption,
            fadeDurationMs: Math.max(10, this.config.ttsInterruption.fadeDurationMs / 2)
          }
        });
        break;
    }
  }

  /**
   * Initialize asynchronously
   */
  private async initializeAsync(): Promise<void> {
    try {
      await this.initialize();
    } catch (error) {
      logger.error('Async initialization failed', { error });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.stop();

    if (this.orchestrator) {
      await this.orchestrator.cleanup();
      delete this.orchestrator;
    }

    this.isInitialized = false;

    logger.info('BargeInIntegrationService cleaned up');
  }
}

// Factory function for easy instantiation
export function createBargeInService(
  config?: BargeInIntegrationConfig,
  callbacks?: BargeInCallbacks
): BargeInIntegrationService {
  return new BargeInIntegrationService(config, callbacks);
}

// Default export for convenience
export default BargeInIntegrationService;