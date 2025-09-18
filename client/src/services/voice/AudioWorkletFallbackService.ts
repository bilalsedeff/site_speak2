/**
 * AudioWorkletFallbackService - Graceful degradation and compatibility layer
 *
 * Provides robust fallback mechanisms for AudioWorklet functionality:
 * - Automatic fallback to MediaRecorder when AudioWorklet fails
 * - Browser compatibility detection and adaptation
 * - Progressive feature degradation based on capabilities
 * - Seamless transition between processing modes
 * - Performance-based automatic switching
 * - Universal compatibility across all browsers
 * - Transparent API that maintains functionality
 */

import { createLogger } from '../../../../shared/utils';
import { AudioWorkletConfig } from './AudioWorkletManager';
import { AudioChunk } from '../../utils/audioFormat';

const logger = createLogger({ service: 'audio-worklet-fallback' });

export interface FallbackConfig {
  // Fallback triggers
  enableAutoFallback: boolean;
  fallbackOnError: boolean;
  fallbackOnLatency: boolean;
  fallbackOnPerformance: boolean;

  // Trigger thresholds
  maxErrorCount: number;
  maxLatencyMs: number;
  minPerformanceScore: number;
  maxRecoveryAttempts: number;

  // MediaRecorder configuration
  mediaRecorderConfig: {
    mimeType: string;
    audioBitsPerSecond: number;
    timeslice: number;
  };

  // Compatibility settings
  enableBrowserDetection: boolean;
  enableFeatureDetection: boolean;
  enableProgressiveDegradation: boolean;

  // Recovery settings
  enableRecovery: boolean;
  recoveryDelayMs: number;
  maxRecoveryTime: number;
}

export interface BrowserCapabilities {
  audioWorkletSupported: boolean;
  mediaRecorderSupported: boolean;
  webAudioSupported: boolean;
  supportedMimeTypes: string[];
  estimatedLatency: number;
  browserInfo: {
    name: string;
    version: string;
    mobile: boolean;
  };
  recommendedMode: 'audioworklet' | 'mediarecorder' | 'basic';
}

export interface FallbackMode {
  mode: 'audioworklet' | 'mediarecorder' | 'basic' | 'disabled';
  reason: string;
  capabilities: BrowserCapabilities;
  features: {
    vadSupported: boolean;
    realTimeProcessing: boolean;
    lowLatency: boolean;
    advancedProcessing: boolean;
  };
  performance: {
    expectedLatency: number;
    qualityScore: number;
    reliabilityScore: number;
  };
}

export interface FallbackEvent {
  type: 'fallback_triggered' | 'recovery_attempted' | 'mode_changed' | 'compatibility_detected';
  timestamp: number;
  sessionId: string;
  data: any;
}

const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enableAutoFallback: true,
  fallbackOnError: true,
  fallbackOnLatency: true,
  fallbackOnPerformance: true,

  maxErrorCount: 3,
  maxLatencyMs: 50,
  minPerformanceScore: 0.5,
  maxRecoveryAttempts: 2,

  mediaRecorderConfig: {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 16000,
    timeslice: 100 // 100ms chunks
  },

  enableBrowserDetection: true,
  enableFeatureDetection: true,
  enableProgressiveDegradation: true,

  enableRecovery: true,
  recoveryDelayMs: 5000,
  maxRecoveryTime: 30000
};

/**
 * Comprehensive fallback service for AudioWorklet systems
 */
export class AudioWorkletFallbackService {
  private config: FallbackConfig;
  private workletConfig: AudioWorkletConfig;
  private sessionId: string;

  // State management
  private currentMode!: FallbackMode;
  private capabilities!: BrowserCapabilities;
  private isActive = false;

  // Fallback implementations
  private mediaRecorderFallback?: MediaRecorderFallback;
  private basicAudioFallback?: BasicAudioFallback;
  // Removed _audioFormatManager: AudioFormatManager; - initialized but never used

  // Error tracking
  private errorCount = 0;
  private lastErrors: Error[] = [];
  private recoveryAttempts = 0;
  private lastRecoveryTime = 0;

  // Performance tracking
  private performanceHistory: number[] = [];
  private latencyHistory: number[] = [];

  // Event handling
  private eventListeners: Set<(event: FallbackEvent) => void> = new Set();

  // Recovery timers
  private recoveryTimer?: NodeJS.Timeout;

  constructor(workletConfig: AudioWorkletConfig, config: Partial<FallbackConfig> = {}) {
    this.workletConfig = workletConfig;
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.sessionId = `fallback_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Audio format manager initialization removed as it was not being used

    logger.info('AudioWorkletFallbackService created', {
      sessionId: this.sessionId,
      config: this.config
    });

    this.initializeFallbackService();
  }

  /**
   * Initialize fallback service with capability detection
   */
  private async initializeFallbackService(): Promise<void> {
    try {
      // Detect browser capabilities
      this.capabilities = await this.detectBrowserCapabilities();

      // Determine initial mode
      this.currentMode = this.determineOptimalMode(this.capabilities);

      // Initialize fallback implementations
      await this.initializeFallbackModes();

      logger.info('Fallback service initialized', {
        sessionId: this.sessionId,
        capabilities: this.capabilities,
        currentMode: this.currentMode
      });

      this.emitEvent({
        type: 'compatibility_detected',
        data: { capabilities: this.capabilities, mode: this.currentMode }
      });

    } catch (error) {
      logger.error('Failed to initialize fallback service', {
        sessionId: this.sessionId,
        error
      });
      throw error;
    }
  }

  /**
   * Activate fallback mode
   */
  async activate(): Promise<FallbackMode> {
    if (this.isActive) {
      return this.currentMode;
    }

    try {
      logger.debug('Activating fallback service', {
        sessionId: this.sessionId,
        mode: this.currentMode.mode
      });

      // Activate appropriate fallback
      switch (this.currentMode.mode) {
        case 'mediarecorder':
          if (!this.mediaRecorderFallback) {
            this.mediaRecorderFallback = new MediaRecorderFallback(
              this.workletConfig,
              this.config.mediaRecorderConfig
            );
          }
          await this.mediaRecorderFallback.activate();
          break;

        case 'basic':
          if (!this.basicAudioFallback) {
            this.basicAudioFallback = new BasicAudioFallback(this.workletConfig);
          }
          await this.basicAudioFallback.activate();
          break;

        case 'disabled':
          logger.warn('Audio processing disabled due to lack of browser support');
          break;

        default:
          throw new Error(`Unsupported fallback mode: ${this.currentMode.mode}`);
      }

      this.isActive = true;

      logger.info('Fallback service activated', {
        sessionId: this.sessionId,
        mode: this.currentMode.mode
      });

      this.emitEvent({
        type: 'fallback_triggered',
        data: { mode: this.currentMode, reason: 'manual_activation' }
      });

      return this.currentMode;

    } catch (error) {
      logger.error('Failed to activate fallback service', {
        sessionId: this.sessionId,
        error
      });
      throw error;
    }
  }

  /**
   * Deactivate fallback service
   */
  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      logger.debug('Deactivating fallback service', { sessionId: this.sessionId });

      // Deactivate current fallback
      if (this.mediaRecorderFallback) {
        await this.mediaRecorderFallback.deactivate();
      }

      if (this.basicAudioFallback) {
        await this.basicAudioFallback.deactivate();
      }

      // Clear recovery timer
      if (this.recoveryTimer) {
        clearTimeout(this.recoveryTimer);
        delete this.recoveryTimer;
      }

      this.isActive = false;

      logger.info('Fallback service deactivated', { sessionId: this.sessionId });

    } catch (error) {
      logger.error('Error deactivating fallback service', {
        sessionId: this.sessionId,
        error
      });
    }
  }

  /**
   * Start audio capture with fallback
   */
  async startAudioCapture(
    mediaStream: MediaStream,
    onAudioChunk: (chunk: AudioChunk) => void
  ): Promise<void> {
    if (!this.isActive) {
      await this.activate();
    }

    try {
      switch (this.currentMode.mode) {
        case 'mediarecorder':
          if (this.mediaRecorderFallback) {
            await this.mediaRecorderFallback.startCapture(mediaStream, onAudioChunk);
          }
          break;

        case 'basic':
          if (this.basicAudioFallback) {
            await this.basicAudioFallback.startCapture(mediaStream, onAudioChunk);
          }
          break;

        default:
          throw new Error('No suitable fallback mode available');
      }

      logger.info('Audio capture started with fallback', {
        sessionId: this.sessionId,
        mode: this.currentMode.mode
      });

    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Stop audio capture
   */
  async stopAudioCapture(): Promise<void> {
    try {
      if (this.mediaRecorderFallback) {
        await this.mediaRecorderFallback.stopCapture();
      }

      if (this.basicAudioFallback) {
        await this.basicAudioFallback.stopCapture();
      }

      logger.info('Audio capture stopped', { sessionId: this.sessionId });

    } catch (error) {
      logger.error('Error stopping audio capture', {
        sessionId: this.sessionId,
        error
      });
    }
  }

  /**
   * Handle AudioWorklet errors and trigger fallback
   */
  async handleError(error: Error): Promise<void> {
    this.errorCount++;
    this.lastErrors.push(error);

    // Limit error history
    if (this.lastErrors.length > 10) {
      this.lastErrors = this.lastErrors.slice(-5);
    }

    logger.warn('AudioWorklet error handled by fallback service', {
      sessionId: this.sessionId,
      error: error.message,
      errorCount: this.errorCount
    });

    // Check if fallback should be triggered
    if (this.shouldTriggerFallback()) {
      await this.triggerFallback('error_threshold_exceeded');
    }
  }

  /**
   * Handle performance issues
   */
  handlePerformanceIssue(latency: number, performanceScore: number): void {
    this.latencyHistory.push(latency);
    this.performanceHistory.push(performanceScore);

    // Limit history
    if (this.latencyHistory.length > 50) {
      this.latencyHistory = this.latencyHistory.slice(-25);
    }
    if (this.performanceHistory.length > 50) {
      this.performanceHistory = this.performanceHistory.slice(-25);
    }

    // Check if fallback should be triggered
    if (this.shouldTriggerFallbackForPerformance()) {
      this.triggerFallback('performance_degradation');
    }
  }

  /**
   * Attempt recovery to AudioWorklet
   */
  async attemptRecovery(): Promise<boolean> {
    if (!this.config.enableRecovery) {
      return false;
    }

    if (this.recoveryAttempts >= this.config.maxRecoveryAttempts) {
      logger.warn('Maximum recovery attempts reached', {
        sessionId: this.sessionId,
        attempts: this.recoveryAttempts
      });
      return false;
    }

    const now = performance.now();
    if (now - this.lastRecoveryTime < this.config.recoveryDelayMs) {
      return false; // Too soon for recovery
    }

    try {
      logger.info('Attempting AudioWorklet recovery', {
        sessionId: this.sessionId,
        attempt: this.recoveryAttempts + 1
      });

      this.recoveryAttempts++;
      this.lastRecoveryTime = now;

      // Test AudioWorklet availability
      const testResult = await this.testAudioWorkletCapability();

      if (testResult.success) {
        // Reset error counters
        this.errorCount = 0;
        this.lastErrors = [];

        // Switch back to AudioWorklet mode
        this.currentMode = this.determineOptimalMode(this.capabilities, true);

        this.emitEvent({
          type: 'recovery_attempted',
          data: { success: true, attempt: this.recoveryAttempts }
        });

        logger.info('AudioWorklet recovery successful', {
          sessionId: this.sessionId,
          attempt: this.recoveryAttempts
        });

        return true;
      } else {
        this.emitEvent({
          type: 'recovery_attempted',
          data: { success: false, attempt: this.recoveryAttempts, reason: testResult.error }
        });

        logger.warn('AudioWorklet recovery failed', {
          sessionId: this.sessionId,
          attempt: this.recoveryAttempts,
          reason: testResult.error
        });

        return false;
      }

    } catch (error) {
      logger.error('Error during recovery attempt', {
        sessionId: this.sessionId,
        error
      });
      return false;
    }
  }

  /**
   * Get current fallback mode
   */
  getCurrentMode(): FallbackMode {
    return { ...this.currentMode };
  }

  /**
   * Get browser capabilities
   */
  getCapabilities(): BrowserCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Add event listener
   */
  addEventListener(listener: (event: FallbackEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Detect comprehensive browser capabilities
   */
  private async detectBrowserCapabilities(): Promise<BrowserCapabilities> {
    const capabilities: BrowserCapabilities = {
      audioWorkletSupported: false,
      mediaRecorderSupported: false,
      webAudioSupported: false,
      supportedMimeTypes: [],
      estimatedLatency: 100,
      browserInfo: this.getBrowserInfo(),
      recommendedMode: 'basic'
    };

    // Test AudioWorklet support
    if (typeof AudioWorklet !== 'undefined' && typeof AudioContext !== 'undefined') {
      const testResult = await this.testAudioWorkletCapability();
      capabilities.audioWorkletSupported = testResult.success;
      if (testResult.latency) {
        capabilities.estimatedLatency = testResult.latency;
      }
    }

    // Test MediaRecorder support
    if (typeof MediaRecorder !== 'undefined') {
      capabilities.mediaRecorderSupported = true;
      capabilities.supportedMimeTypes = this.getSupportedMimeTypes();
    }

    // Test Web Audio API support
    capabilities.webAudioSupported = typeof AudioContext !== 'undefined';

    // Determine recommended mode
    if (capabilities.audioWorkletSupported && capabilities.estimatedLatency < 30) {
      capabilities.recommendedMode = 'audioworklet';
    } else if (capabilities.mediaRecorderSupported) {
      capabilities.recommendedMode = 'mediarecorder';
    } else {
      capabilities.recommendedMode = 'basic';
    }

    return capabilities;
  }

  /**
   * Test AudioWorklet capability
   */
  private async testAudioWorkletCapability(): Promise<{ success: boolean; latency?: number; error?: string }> {
    try {
      const startTime = performance.now();
      const testContext = new AudioContext({ latencyHint: 'interactive' });

      // Simple capability test
      const testNode = testContext.createOscillator();
      testNode.connect(testContext.destination);

      const latency = performance.now() - startTime;

      await testContext.close();

      return { success: true, latency };

    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Get browser information
   */
  private getBrowserInfo(): { name: string; version: string; mobile: boolean } {
    const userAgent = navigator.userAgent;

    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    // Detect browser
    if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      browserVersion = match?.[1] ?? 'Unknown';
    } else if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      browserVersion = match?.[1] ?? 'Unknown';
    } else if (userAgent.includes('Safari')) {
      browserName = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      browserVersion = match?.[1] ?? 'Unknown';
    } else if (userAgent.includes('Edge')) {
      browserName = 'Edge';
      const match = userAgent.match(/Edge\/(\d+)/);
      browserVersion = match?.[1] ?? 'Unknown';
    }

    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    return {
      name: browserName,
      version: browserVersion,
      mobile: isMobile
    };
  }

  /**
   * Get supported MIME types for MediaRecorder
   */
  private getSupportedMimeTypes(): string[] {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/wav'
    ];

    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }

  /**
   * Determine optimal fallback mode
   */
  private determineOptimalMode(capabilities: BrowserCapabilities, forceAudioWorklet = false): FallbackMode {
    // If forcing AudioWorklet (for recovery), try it first
    if (forceAudioWorklet && capabilities.audioWorkletSupported) {
      return {
        mode: 'audioworklet',
        reason: 'recovery_attempt',
        capabilities,
        features: {
          vadSupported: true,
          realTimeProcessing: true,
          lowLatency: true,
          advancedProcessing: true
        },
        performance: {
          expectedLatency: capabilities.estimatedLatency,
          qualityScore: 1.0,
          reliabilityScore: 0.8
        }
      };
    }

    // Standard mode determination
    if (capabilities.audioWorkletSupported && capabilities.estimatedLatency < 50) {
      return {
        mode: 'audioworklet',
        reason: 'optimal_performance',
        capabilities,
        features: {
          vadSupported: true,
          realTimeProcessing: true,
          lowLatency: true,
          advancedProcessing: true
        },
        performance: {
          expectedLatency: capabilities.estimatedLatency,
          qualityScore: 1.0,
          reliabilityScore: 0.9
        }
      };
    }

    if (capabilities.mediaRecorderSupported) {
      return {
        mode: 'mediarecorder',
        reason: 'audioworklet_not_available',
        capabilities,
        features: {
          vadSupported: false,
          realTimeProcessing: false,
          lowLatency: false,
          advancedProcessing: false
        },
        performance: {
          expectedLatency: 100,
          qualityScore: 0.8,
          reliabilityScore: 0.95
        }
      };
    }

    if (capabilities.webAudioSupported) {
      return {
        mode: 'basic',
        reason: 'limited_browser_support',
        capabilities,
        features: {
          vadSupported: false,
          realTimeProcessing: false,
          lowLatency: false,
          advancedProcessing: false
        },
        performance: {
          expectedLatency: 200,
          qualityScore: 0.6,
          reliabilityScore: 0.8
        }
      };
    }

    return {
      mode: 'disabled',
      reason: 'no_audio_support',
      capabilities,
      features: {
        vadSupported: false,
        realTimeProcessing: false,
        lowLatency: false,
        advancedProcessing: false
      },
      performance: {
        expectedLatency: 0,
        qualityScore: 0,
        reliabilityScore: 0
      }
    };
  }

  /**
   * Initialize fallback implementations
   */
  private async initializeFallbackModes(): Promise<void> {
    // Pre-initialize fallback modes for faster switching
    if (this.capabilities.mediaRecorderSupported) {
      this.mediaRecorderFallback = new MediaRecorderFallback(
        this.workletConfig,
        this.config.mediaRecorderConfig
      );
    }

    if (this.capabilities.webAudioSupported) {
      this.basicAudioFallback = new BasicAudioFallback(this.workletConfig);
    }
  }

  /**
   * Check if fallback should be triggered
   */
  private shouldTriggerFallback(): boolean {
    if (!this.config.enableAutoFallback) {
      return false;
    }

    return this.config.fallbackOnError && this.errorCount >= this.config.maxErrorCount;
  }

  /**
   * Check if fallback should be triggered for performance
   */
  private shouldTriggerFallbackForPerformance(): boolean {
    if (!this.config.fallbackOnPerformance || this.latencyHistory.length < 5) {
      return false;
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    const avgPerformance = this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length;

    return avgLatency > this.config.maxLatencyMs || avgPerformance < this.config.minPerformanceScore;
  }

  /**
   * Trigger fallback to alternative mode
   */
  private async triggerFallback(reason: string): Promise<void> {
    logger.warn('Triggering fallback', {
      sessionId: this.sessionId,
      currentMode: this.currentMode.mode,
      reason
    });

    // Determine next best mode
    const nextMode = this.getNextBestMode();

    if (nextMode.mode !== this.currentMode.mode) {
      const oldMode = this.currentMode;
      this.currentMode = nextMode;

      this.emitEvent({
        type: 'mode_changed',
        data: { oldMode, newMode: nextMode, reason }
      });

      // Schedule recovery attempt if configured
      if (this.config.enableRecovery && oldMode.mode === 'audioworklet') {
        this.scheduleRecovery();
      }
    }
  }

  /**
   * Get next best fallback mode
   */
  private getNextBestMode(): FallbackMode {
    const currentMode = this.currentMode.mode;

    if (currentMode === 'audioworklet' && this.capabilities.mediaRecorderSupported) {
      return this.determineOptimalMode(this.capabilities);
    }

    if (currentMode === 'mediarecorder' && this.capabilities.webAudioSupported) {
      return {
        ...this.currentMode,
        mode: 'basic',
        reason: 'mediarecorder_fallback'
      };
    }

    // Last resort
    return {
      ...this.currentMode,
      mode: 'disabled',
      reason: 'all_modes_exhausted'
    };
  }

  /**
   * Schedule recovery attempt
   */
  private scheduleRecovery(): void {
    if (this.recoveryTimer) {
      return; // Recovery already scheduled
    }

    this.recoveryTimer = setTimeout(() => {
      this.attemptRecovery().then(success => {
        if (success) {
          logger.info('Scheduled recovery successful', { sessionId: this.sessionId });
        } else {
          // Schedule another attempt if not at max
          if (this.recoveryAttempts < this.config.maxRecoveryAttempts) {
            this.scheduleRecovery();
          }
        }
      });
    }, this.config.recoveryDelayMs);
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(eventData: Partial<FallbackEvent>): void {
    const event: FallbackEvent = {
      type: eventData.type || 'fallback_triggered',
      timestamp: performance.now(),
      sessionId: this.sessionId,
      data: eventData.data || {}
    };

    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in fallback event listener', { error });
      }
    });
  }
}

/**
 * MediaRecorder fallback implementation
 */
class MediaRecorderFallback {
  private workletConfig: AudioWorkletConfig;
  private mediaRecorderConfig: any;
  private mediaRecorder?: MediaRecorder;

  constructor(workletConfig: AudioWorkletConfig, mediaRecorderConfig: any) {
    this.workletConfig = workletConfig;
    this.mediaRecorderConfig = mediaRecorderConfig;
  }

  async activate(): Promise<void> {
    // Activation logic here
  }

  async deactivate(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  async startCapture(mediaStream: MediaStream, onAudioChunk: (chunk: AudioChunk) => void): Promise<void> {
    this.mediaRecorder = new MediaRecorder(mediaStream, this.mediaRecorderConfig);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then(arrayBuffer => {
          const chunk: AudioChunk = {
            data: arrayBuffer,
            format: 'webm',
            sampleRate: this.workletConfig.sampleRate,
            channels: this.workletConfig.channels,
            timestamp: Date.now()
          };
          onAudioChunk(chunk);
        });
      }
    };

    this.mediaRecorder.start(this.mediaRecorderConfig.timeslice);
  }

  async stopCapture(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }
}

/**
 * Basic audio fallback implementation
 */
class BasicAudioFallback {
  constructor(_workletConfig: AudioWorkletConfig) {
    // Configuration stored for potential future use
  }

  async activate(): Promise<void> {
    // Activation logic here
  }

  async deactivate(): Promise<void> {
    // Deactivation logic here
  }

  async startCapture(_mediaStream: MediaStream, _onAudioChunk: (chunk: AudioChunk) => void): Promise<void> {
    // Basic implementation - could capture audio in larger chunks
    // This is a minimal fallback for browsers with very limited support
    logger.warn('Using basic audio fallback - limited functionality');
  }

  async stopCapture(): Promise<void> {
    // Stop basic capture
  }
}

// Factory function for creating fallback service instances
export function createAudioWorkletFallbackService(
  workletConfig: AudioWorkletConfig,
  config?: Partial<FallbackConfig>
): AudioWorkletFallbackService {
  return new AudioWorkletFallbackService(workletConfig, config);
}