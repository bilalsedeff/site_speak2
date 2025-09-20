/**
 * AudioWorkletIntegrationService - Universal integration layer
 *
 * Seamlessly integrates the comprehensive AudioWorklet system with existing services:
 * - Universal compatibility with any website structure
 * - Clean integration with VoiceOrchestrator and audioFormat.ts
 * - Transparent API that maintains existing functionality
 * - Progressive enhancement without breaking changes
 * - Performance monitoring and health checks
 * - Automatic optimization and adaptation
 * - Complete error handling and recovery
 * - Production-ready service boundaries
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils';
import { AudioWorkletManager, AudioWorkletConfig, AudioWorkletCapabilities } from './AudioWorkletManager';
import { AudioProcessingPipeline, ProcessedAudioFrame } from './AudioProcessingPipeline';
import { AudioPerformanceMonitor, PerformanceMetrics } from './AudioPerformanceMonitor';
import { AudioWorkletFallbackService, FallbackMode } from './AudioWorkletFallbackService';
import { AudioFormatManager, AudioChunk } from '../../utils/audioFormat';
import { VoiceActivityDetector, VADServiceCallbacks } from './VoiceActivityDetector';
import { PerformanceMetrics as BargeInPerformanceMetrics } from '@shared/types/barge-in.types';

const logger = createLogger({ service: 'audio-worklet-integration' });

export interface IntegrationConfig {
  // Feature enablement
  enableAudioWorklet: boolean;
  enableFallback: boolean;
  enablePerformanceMonitoring: boolean;
  enableAutoOptimization: boolean;

  // Performance thresholds
  maxLatencyMs: number;
  minQualityScore: number;
  maxCpuUsage: number;

  // Integration settings
  seamlessIntegration: boolean;
  preserveExistingAPI: boolean;
  enableProgressiveEnhancement: boolean;

  // Compatibility
  supportLegacyBrowsers: boolean;
  enableGracefulDegradation: boolean;
  universalCompatibility: boolean;
}

export interface IntegrationStatus {
  mode: 'audioworklet' | 'fallback' | 'legacy' | 'disabled';
  capabilities: AudioWorkletCapabilities | null;
  fallbackMode: FallbackMode | null;
  performance: BargeInPerformanceMetrics | null;
  isOptimal: boolean;
  healthScore: number;
  features: {
    lowLatencyProcessing: boolean;
    realTimeVAD: boolean;
    advancedProcessing: boolean;
    qualityEnhancement: boolean;
  };
}

export interface IntegratedAudioFrame {
  // Enhanced frame data
  audioData: ArrayBuffer;
  format: string;
  timestamp: number;

  // VAD information
  vadDecision?: {
    active: boolean;
    confidence: number;
    level: number;
  };

  // Quality metrics
  quality: {
    score: number;
    snr: number;
    peakLevel: number;
    rmsLevel: number;
  };

  // Processing metadata
  metadata: {
    processingLatency: number;
    sessionId: string;
    sequenceNumber: number;
    source: 'audioworklet' | 'fallback' | 'legacy';
  };
}

export interface IntegrationCallbacks {
  onAudioFrame?: (frame: IntegratedAudioFrame) => void;
  onVADDecision?: (decision: any) => void;
  onPerformanceUpdate?: (metrics: BargeInPerformanceMetrics) => void;
  onStatusChange?: (status: IntegrationStatus) => void;
  onError?: (error: Error) => void;
}

// Interface for VoiceTutorialEngine compatibility
export interface ListeningOptions {
  enableVAD?: boolean;
  enablePartialResults?: boolean;
  confidenceThreshold?: number;
  timeout?: number;
}

const DEFAULT_INTEGRATION_CONFIG: IntegrationConfig = {
  enableAudioWorklet: true,
  enableFallback: true,
  enablePerformanceMonitoring: true,
  enableAutoOptimization: true,

  maxLatencyMs: 20,
  minQualityScore: 0.7,
  maxCpuUsage: 0.8,

  seamlessIntegration: true,
  preserveExistingAPI: true,
  enableProgressiveEnhancement: true,

  supportLegacyBrowsers: true,
  enableGracefulDegradation: true,
  universalCompatibility: true
};

/**
 * Universal AudioWorklet integration service
 */
export class AudioWorkletIntegrationService extends EventEmitter {
  private config: IntegrationConfig;
  private sessionId: string;
  private isInitialized = false;
  private isActive = false;

  // Core services
  private audioWorkletManager?: AudioWorkletManager;
  private processingPipeline?: AudioProcessingPipeline;
  private performanceMonitor?: AudioPerformanceMonitor;
  private fallbackService?: AudioWorkletFallbackService;

  // Legacy compatibility
  private audioFormatManager: AudioFormatManager;
  private vadDetector?: VoiceActivityDetector;

  // Integration state
  private currentStatus: IntegrationStatus;
  private callbacks?: IntegrationCallbacks;
  private frameSequence = 0;

  // Stream management
  private _currentStream?: MediaStream;
  // Removed _isCapturing as it was not being used

  constructor(config: Partial<IntegrationConfig> = {}) {
    super(); // Call EventEmitter constructor

    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...config };
    this.sessionId = `integration_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Initialize legacy compatibility
    this.audioFormatManager = new AudioFormatManager({
      preferredFormat: 'auto',
      sampleRate: 48000,
      channels: 1
    });

    this.currentStatus = this.initializeStatus();

    logger.info('AudioWorkletIntegrationService created', {
      sessionId: this.sessionId,
      config: this.config
    });
  }

  /**
   * Initialize the integration service
   */
  async initialize(): Promise<IntegrationStatus> {
    if (this.isInitialized) {
      return this.currentStatus;
    }

    try {
      logger.debug('Initializing AudioWorklet integration', { sessionId: this.sessionId });

      // Determine optimal configuration
      const workletConfig = await this.determineOptimalConfig();

      // Initialize core services based on capabilities
      if (this.config.enableAudioWorklet) {
        await this.initializeAudioWorkletServices(workletConfig);
      }

      // Initialize fallback service
      if (this.config.enableFallback) {
        this.fallbackService = new AudioWorkletFallbackService(workletConfig);
      }

      // Initialize performance monitoring
      if (this.config.enablePerformanceMonitoring) {
        this.performanceMonitor = new AudioPerformanceMonitor(this.sessionId);
        this.setupPerformanceMonitoring();
      }

      // Initialize legacy VAD for compatibility
      if (this.config.preserveExistingAPI) {
        await this.initializeLegacyVAD();
      }

      // Update status
      await this.updateIntegrationStatus();

      this.isInitialized = true;

      logger.info('AudioWorklet integration initialized', {
        sessionId: this.sessionId,
        status: this.currentStatus
      });

      this.callbacks?.onStatusChange?.(this.currentStatus);
      return this.currentStatus;

    } catch (error) {
      logger.error('Failed to initialize AudioWorklet integration', {
        sessionId: this.sessionId,
        error
      });
      throw error;
    }
  }

  /**
   * Start audio processing with universal compatibility
   */
  async startAudioProcessing(mediaStream: MediaStream): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isActive) {
      return;
    }

    try {
      logger.debug('Starting integrated audio processing', { sessionId: this.sessionId });

      this._currentStream = mediaStream;

      // Start appropriate processing mode
      if (this.currentStatus.mode === 'audioworklet' && this.audioWorkletManager) {
        await this.startAudioWorkletProcessing(mediaStream);
      } else if (this.fallbackService) {
        await this.startFallbackProcessing(mediaStream);
      } else {
        await this.startLegacyProcessing(mediaStream);
      }

      // Start performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.start();
      }

      this.isActive = true;

      logger.info('Integrated audio processing started', {
        sessionId: this.sessionId,
        mode: this.currentStatus.mode
      });

    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Stop audio processing
   */
  async stopAudioProcessing(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      logger.debug('Stopping integrated audio processing', { sessionId: this.sessionId });

      // Stop all processing
      if (this.audioWorkletManager) {
        await this.audioWorkletManager.stop();
      }

      if (this.processingPipeline) {
        await this.processingPipeline.stop();
      }

      if (this.fallbackService) {
        await this.fallbackService.stopAudioCapture();
      }

      if (this.vadDetector) {
        await this.vadDetector.stop();
      }

      if (this.performanceMonitor) {
        this.performanceMonitor.stop();
      }

      await this.audioFormatManager.stopRecording();

      this.isActive = false;
      delete this._currentStream;

      logger.info('Integrated audio processing stopped', { sessionId: this.sessionId });

    } catch (error) {
      logger.error('Error stopping integrated audio processing', {
        sessionId: this.sessionId,
        error
      });
    }
  }

  /**
   * Start listening with tutorial-compatible interface
   * Compatible with VoiceTutorialEngine expectations
   */
  async startListening(options: ListeningOptions = {}): Promise<void> {
    try {
      // Initialize if not already done
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Request microphone permission and start audio processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      await this.startAudioProcessing(stream);

      // Configure VAD if requested
      if (options.enableVAD && this.vadDetector) {
        // VAD is already initialized in startAudioProcessing
        logger.debug('VAD enabled for listening session', { sessionId: this.sessionId });
      }

      // Emit audio level events for tutorial feedback
      this.emit('audio_level', { level: 0.0 });

      logger.info('Started listening session', {
        sessionId: this.sessionId,
        options
      });

    } catch (error) {
      logger.error('Failed to start listening', {
        sessionId: this.sessionId,
        error
      });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop listening with tutorial-compatible interface
   * Compatible with VoiceTutorialEngine expectations
   */
  async stopListening(): Promise<void> {
    try {
      await this.stopAudioProcessing();

      logger.info('Stopped listening session', { sessionId: this.sessionId });

    } catch (error) {
      logger.error('Failed to stop listening', {
        sessionId: this.sessionId,
        error
      });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set integration callbacks
   */
  setCallbacks(callbacks: IntegrationCallbacks): void {
    this.callbacks = callbacks;

    // Wire up internal callbacks
    this.setupCallbackIntegration();
  }

  /**
   * Get current integration status
   */
  getStatus(): IntegrationStatus {
    return { ...this.currentStatus };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): BargeInPerformanceMetrics | null {
    const metrics = this.performanceMonitor?.getMetrics();
    if (!metrics) {return null;}

    // Convert AudioPerformanceMonitor.PerformanceMetrics to BargeInPerformanceMetrics
    return {
      avgVadLatency: metrics.avgLatency || 0,
      maxVadLatency: metrics.maxLatency || 0,
      vadDecisionsPerSecond: metrics.framesPerSecond || 0,
      audioFrameRate: metrics.framesPerSecond || 0,
      droppedFrames: metrics.framesDropped || 0,
      cpuUsage: metrics.cpuUsageEstimate || 0
    };
  }

  /**
   * Update configuration dynamically
   */
  async updateConfig(updates: Partial<IntegrationConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };

    logger.debug('Integration config updated', {
      sessionId: this.sessionId,
      updates,
      oldConfig,
      newConfig: this.config
    });

    // Update underlying services
    if (this.audioWorkletManager && updates.maxLatencyMs) {
      await this.audioWorkletManager.updateConfig({
        vadConfig: {
          energyThreshold: 0.01,
          hangMs: 50,
          smoothingFactor: 0.1,
          minSpeechDurationMs: 100,
          maxLatencyMs: updates.maxLatencyMs,
          useSpectralAnalysis: false,
          zcrThresholds: {
            min: 0.02,
            max: 0.8
          }
        }
      });
    }

    // Note: AudioPerformanceMonitor.isActive is private, so we track monitoring state separately
    if (this.performanceMonitor && updates.enablePerformanceMonitoring !== undefined) {
      if (updates.enablePerformanceMonitoring) {
        this.performanceMonitor.start();
      } else {
        this.performanceMonitor.stop();
      }
    }

    // Update status
    await this.updateIntegrationStatus();
  }

  /**
   * Manually trigger optimization
   */
  async optimize(): Promise<void> {
    if (!this.config.enableAutoOptimization) {
      return;
    }

    logger.debug('Running manual optimization', { sessionId: this.sessionId });

    // Run optimization on all services
    if (this.audioWorkletManager) {
      // AudioWorkletManager doesn't have an optimize method, but we can update config
      const currentMetrics = this.performanceMonitor?.getMetrics();
      if (currentMetrics && currentMetrics.avgLatency > this.config.maxLatencyMs) {
        // Reduce processing complexity
        await this.audioWorkletManager.updateConfig({
          enableSpectralAnalysis: false, // Disable heavy processing
          vadConfig: {
            energyThreshold: 0.01,
            hangMs: 50,
            smoothingFactor: 0.1,
            minSpeechDurationMs: 100,
            maxLatencyMs: 20,
            useSpectralAnalysis: false,
            zcrThresholds: {
              min: 0.02,
              max: 0.8
            }
          }
        });
      }
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.optimize();
    }
  }

  /**
   * Check if system is compatible
   */
  async checkCompatibility(): Promise<AudioWorkletCapabilities | null> {
    try {
      if (this.audioWorkletManager) {
        return this.audioWorkletManager.getCapabilities();
      }

      // Test compatibility without full initialization
      const testManager = new AudioWorkletManager();
      const capabilities = await testManager.initialize();
      return capabilities;

    } catch (error) {
      logger.warn('Compatibility check failed', { sessionId: this.sessionId, error });
      return null;
    }
  }

  /**
   * Determine optimal AudioWorklet configuration
   */
  private async determineOptimalConfig(): Promise<AudioWorkletConfig> {
    // Base configuration
    const baseConfig: AudioWorkletConfig = {
      sampleRate: 48000,
      frameMs: 20,
      channels: 1,
      bitRate: 16000,
      enableVAD: true,
      vadConfig: {
        energyThreshold: 0.01,
        hangMs: 50,
        smoothingFactor: 0.1,
        minSpeechDurationMs: 100,
        maxLatencyMs: this.config.maxLatencyMs,
        useSpectralAnalysis: false,
        zcrThresholds: {
          min: 0.02,
          max: 0.8
        }
      },
      enableOpusEncoding: true,
      enableNoiseSuppression: true,
      enableEchoCancellation: true,
      enableAutoGainControl: true,
      enableSpectralAnalysis: false, // Start conservative
      fallbackToMediaRecorder: this.config.enableFallback,
      performanceMonitoring: this.config.enablePerformanceMonitoring
    };

    // Optimize based on compatibility
    const capabilities = await this.checkCompatibility();

    if (capabilities) {
      // Adjust config based on capabilities
      if (capabilities.latencyRange.min > 30) {
        baseConfig.frameMs = 40; // Use larger frames for higher latency systems
      }

      if (!capabilities.processingFeatures.vadSupported) {
        baseConfig.enableVAD = false;
      }

      if (!capabilities.processingFeatures.spectralAnalysisSupported) {
        baseConfig.enableSpectralAnalysis = false;
      }
    }

    return baseConfig;
  }

  /**
   * Initialize AudioWorklet services
   */
  private async initializeAudioWorkletServices(config: AudioWorkletConfig): Promise<void> {
    try {
      // Initialize AudioWorklet manager
      this.audioWorkletManager = new AudioWorkletManager(config);
      const capabilities = await this.audioWorkletManager.initialize();

      if (capabilities.audioWorkletSupported) {
        // Initialize processing pipeline
        this.processingPipeline = new AudioProcessingPipeline(config, this.sessionId);

        // Set up integration between manager and pipeline
        this.audioWorkletManager.addEventListener('audio_frame', (event) => {
          if (this.processingPipeline) {
            this.processingPipeline.processMessage('opus_frame', event.data, event.timestamp);
          }
        });

        logger.info('AudioWorklet services initialized successfully', {
          sessionId: this.sessionId,
          capabilities
        });
      } else {
        logger.warn('AudioWorklet not supported, will use fallback', {
          sessionId: this.sessionId
        });
      }

    } catch (error) {
      logger.error('Failed to initialize AudioWorklet services', {
        sessionId: this.sessionId,
        error
      });
      throw error;
    }
  }

  /**
   * Initialize legacy VAD for compatibility
   */
  private async initializeLegacyVAD(): Promise<void> {
    try {
      const vadCallbacks: VADServiceCallbacks = {
        onVADDecision: (decision) => {
          this.callbacks?.onVADDecision?.(decision);
        },
        onAudioLevelUpdate: (levels) => {
          // Forward to performance monitor
          if (this.performanceMonitor) {
            this.performanceMonitor.processMessage('audio_level', levels);
          }
        },
        onPerformanceUpdate: ((metrics: PerformanceMetrics) => {
          // Convert AudioPerformanceMonitor.PerformanceMetrics to barge-in.types.PerformanceMetrics
          const convertedMetrics: BargeInPerformanceMetrics = {
            avgVadLatency: metrics.avgLatency || 0,
            maxVadLatency: metrics.maxLatency || 0,
            vadDecisionsPerSecond: metrics.framesPerSecond || 0,
            audioFrameRate: metrics.framesPerSecond || 0,
            droppedFrames: metrics.framesDropped || 0,
            cpuUsage: metrics.cpuUsageEstimate || 0
          };
          this.callbacks?.onPerformanceUpdate?.(convertedMetrics);

          // Auto-optimization based on performance
          if (this.config.enableAutoOptimization) {
            this.checkAndOptimize(convertedMetrics);
          }
        }) as any,
        onError: (error) => {
          this.handleError(new Error(error.message));
        }
      };

      this.vadDetector = new VoiceActivityDetector({}, vadCallbacks);

      logger.debug('Legacy VAD initialized for compatibility', { sessionId: this.sessionId });

    } catch (error) {
      logger.warn('Failed to initialize legacy VAD', { sessionId: this.sessionId, error });
    }
  }

  /**
   * Setup performance monitoring integration
   */
  private setupPerformanceMonitoring(): void {
    if (!this.performanceMonitor) {
      return;
    }

    this.performanceMonitor.setEventHandlers({
      onMetricsUpdate: (metrics) => {
        // Convert AudioPerformanceMonitor.PerformanceMetrics to BargeInPerformanceMetrics
        const convertedMetrics: BargeInPerformanceMetrics = {
          avgVadLatency: metrics.avgLatency || 0,
          maxVadLatency: metrics.maxLatency || 0,
          vadDecisionsPerSecond: metrics.framesPerSecond || 0,
          audioFrameRate: metrics.framesPerSecond || 0,
          droppedFrames: metrics.framesDropped || 0,
          cpuUsage: metrics.cpuUsageEstimate || 0
        };
        this.callbacks?.onPerformanceUpdate?.(convertedMetrics);

        // Auto-optimization based on performance
        if (this.config.enableAutoOptimization) {
          this.checkAndOptimize(convertedMetrics);
        }
      },
      onAlert: (alert) => {
        logger.warn('Performance alert', {
          sessionId: this.sessionId,
          alert
        });
      }
    });
  }

  /**
   * Setup callback integration
   */
  private setupCallbackIntegration(): void {
    // Wire up AudioWorklet callbacks
    if (this.audioWorkletManager) {
      this.audioWorkletManager.addEventListener('audio_frame', (event) => {
        this.handleAudioFrame(event.data, 'audioworklet');
      });

      this.audioWorkletManager.addEventListener('vad_decision', (event) => {
        this.callbacks?.onVADDecision?.(event.data);

        // Emit VAD events for VoiceTutorialEngine compatibility
        this.emit('vad', {
          active: event.data.isActive || false,
          level: event.data.level || 0
        });
      });

      this.audioWorkletManager.addEventListener('error', (event) => {
        const error = new Error(event.data.error);
        this.handleError(error);

        // Emit error events for VoiceTutorialEngine compatibility
        this.emit('error', error);
      });
    }

    // Wire up processing pipeline callbacks
    if (this.processingPipeline) {
      this.processingPipeline.setEventHandlers({
        onFrameProcessed: (frame) => {
          this.handleProcessedFrame(frame);
        },
        onMetricsUpdate: (metrics) => {
          if (this.performanceMonitor) {
            this.performanceMonitor.processMessage('performance_metrics', metrics);
          }
        },
        onError: (error) => {
          this.handleError(error);
        }
      });
    }

    // Wire up fallback service callbacks
    if (this.fallbackService) {
      this.fallbackService.addEventListener((event) => {
        if (event.type === 'fallback_triggered') {
          this.updateIntegrationStatus();
        }
      });
    }
  }

  /**
   * Start AudioWorklet processing
   */
  private async startAudioWorkletProcessing(mediaStream: MediaStream): Promise<void> {
    if (!this.audioWorkletManager || !this.processingPipeline) {
      throw new Error('AudioWorklet services not initialized');
    }

    await this.audioWorkletManager.start(mediaStream);
    await this.processingPipeline.start();

    logger.debug('AudioWorklet processing started', { sessionId: this.sessionId });
  }

  /**
   * Start fallback processing
   */
  private async startFallbackProcessing(mediaStream: MediaStream): Promise<void> {
    if (!this.fallbackService) {
      throw new Error('Fallback service not available');
    }

    await this.fallbackService.startAudioCapture(mediaStream, (chunk) => {
      this.handleAudioChunk(chunk, 'fallback');
    });

    // Start legacy VAD if available
    if (this.vadDetector) {
      await this.vadDetector.start(mediaStream);
    }

    logger.debug('Fallback processing started', { sessionId: this.sessionId });
  }

  /**
   * Start legacy processing
   */
  private async startLegacyProcessing(mediaStream: MediaStream): Promise<void> {
    // Use AudioFormatManager for basic recording
    await this.audioFormatManager.startRecording(mediaStream, (chunk) => {
      this.handleAudioChunk(chunk, 'legacy');
    });

    // Start legacy VAD if available
    if (this.vadDetector) {
      await this.vadDetector.start(mediaStream);
    }

    logger.debug('Legacy processing started', { sessionId: this.sessionId });
  }

  /**
   * Handle processed audio frame
   */
  private handleProcessedFrame(frame: ProcessedAudioFrame): void {
    const integratedFrame: IntegratedAudioFrame = {
      audioData: frame.data,
      format: 'opus',
      timestamp: frame.timestamp,
      ...(frame.vadDecision !== undefined && frame.vadDecision !== null ? {
        vadDecision: {
          active: frame.vadDecision.active,
          confidence: frame.vadDecision.confidence,
          level: frame.vadDecision.level
        }
      } : {}),
      quality: {
        score: frame.quality.qualityScore,
        snr: frame.quality.signalToNoiseRatio,
        peakLevel: frame.quality.peakLevel,
        rmsLevel: frame.quality.rmsLevel
      },
      metadata: {
        processingLatency: frame.metadata.processingLatency,
        sessionId: this.sessionId,
        sequenceNumber: this.frameSequence++,
        source: 'audioworklet'
      }
    };

    this.callbacks?.onAudioFrame?.(integratedFrame);
  }

  /**
   * Handle raw audio frame
   */
  private handleAudioFrame(frameData: any, source: 'audioworklet' | 'fallback' | 'legacy'): void {
    const integratedFrame: IntegratedAudioFrame = {
      audioData: frameData.frame || frameData,
      format: frameData.format || 'unknown',
      timestamp: frameData.timestamp || performance.now(),
      quality: {
        score: frameData.quality?.qualityScore || 0.8,
        snr: frameData.quality?.signalToNoiseRatio || 20,
        peakLevel: frameData.peakLevel || 0,
        rmsLevel: frameData.rmsLevel || 0
      },
      metadata: {
        processingLatency: frameData.processingLatency || 0,
        sessionId: this.sessionId,
        sequenceNumber: this.frameSequence++,
        source
      }
    };

    this.callbacks?.onAudioFrame?.(integratedFrame);

    // Emit audio level events for VoiceTutorialEngine compatibility
    this.emit('audio_level', { level: integratedFrame.quality.rmsLevel });
  }

  /**
   * Handle audio chunk from fallback/legacy
   */
  private handleAudioChunk(chunk: AudioChunk, source: 'fallback' | 'legacy'): void {
    const integratedFrame: IntegratedAudioFrame = {
      audioData: chunk.data,
      format: chunk.format,
      timestamp: chunk.timestamp,
      quality: {
        score: 0.7, // Estimated quality for fallback
        snr: 15,
        peakLevel: 0,
        rmsLevel: 0
      },
      metadata: {
        processingLatency: chunk.duration || 0,
        sessionId: this.sessionId,
        sequenceNumber: this.frameSequence++,
        source
      }
    };

    this.callbacks?.onAudioFrame?.(integratedFrame);
  }

  /**
   * Handle errors with recovery
   */
  private async handleError(error: Error): Promise<void> {
    logger.error('Integration error', {
      sessionId: this.sessionId,
      error: error.message,
      mode: this.currentStatus.mode
    });

    this.callbacks?.onError?.(error);

    // Attempt recovery
    if (this.fallbackService && this.currentStatus.mode === 'audioworklet') {
      try {
        await this.fallbackService.handleError(error);
        await this.updateIntegrationStatus();
      } catch (fallbackError) {
        logger.error('Fallback also failed', {
          sessionId: this.sessionId,
          fallbackError
        });
      }
    }
  }

  /**
   * Check performance and optimize
   */
  private async checkAndOptimize(metrics: BargeInPerformanceMetrics): Promise<void> {
    if (metrics.avgVadLatency > this.config.maxLatencyMs * 1.5) {
      // High latency - reduce processing complexity
      if (this.audioWorkletManager) {
        await this.audioWorkletManager.updateConfig({
          enableSpectralAnalysis: false,
          vadConfig: {
            energyThreshold: 0.01,
            hangMs: 50,
            smoothingFactor: 0.1,
            minSpeechDurationMs: 100,
            maxLatencyMs: 20,
            useSpectralAnalysis: false,
            zcrThresholds: {
              min: 0.02,
              max: 0.8
            }
          }
        });
      }
    }

    if (metrics.cpuUsage > this.config.maxCpuUsage) {
      // High CPU usage - reduce features
      if (this.audioWorkletManager) {
        await this.audioWorkletManager.updateConfig({
          enableAutoGainControl: false
        });
      }
    }
  }

  /**
   * Update integration status
   */
  private async updateIntegrationStatus(): Promise<void> {
    const capabilities = this.audioWorkletManager?.getCapabilities() || null;
    const fallbackMode = this.fallbackService?.getCurrentMode() || null;
    const rawPerformance = this.performanceMonitor?.getMetrics() || null;

    // Convert performance metrics if available
    const performance: BargeInPerformanceMetrics | null = rawPerformance ? {
      avgVadLatency: rawPerformance.avgLatency || 0,
      maxVadLatency: rawPerformance.maxLatency || 0,
      vadDecisionsPerSecond: rawPerformance.framesPerSecond || 0,
      audioFrameRate: rawPerformance.framesPerSecond || 0,
      droppedFrames: rawPerformance.framesDropped || 0,
      cpuUsage: rawPerformance.cpuUsageEstimate || 0
    } : null;

    // Determine current mode
    let mode: 'audioworklet' | 'fallback' | 'legacy' | 'disabled' = 'disabled';
    if (capabilities?.audioWorkletSupported && this.audioWorkletManager?.isSystemActive()) {
      mode = 'audioworklet';
    } else if (fallbackMode && this.fallbackService) {
      mode = 'fallback';
    } else if (this.audioFormatManager) {
      mode = 'legacy';
    }

    // Calculate health score
    let healthScore = 0.5; // Base score
    if (rawPerformance) {
      healthScore = rawPerformance.healthScore;
    } else if (capabilities?.audioWorkletSupported) {
      healthScore = 0.8;
    }

    this.currentStatus = {
      mode,
      capabilities,
      fallbackMode,
      performance,
      isOptimal: mode === 'audioworklet' && healthScore > 0.8,
      healthScore,
      features: {
        lowLatencyProcessing: mode === 'audioworklet',
        realTimeVAD: mode === 'audioworklet' || Boolean(this.vadDetector),
        advancedProcessing: mode === 'audioworklet',
        qualityEnhancement: mode === 'audioworklet'
      }
    };

    this.callbacks?.onStatusChange?.(this.currentStatus);
  }

  /**
   * Initialize status structure
   */
  private initializeStatus(): IntegrationStatus {
    return {
      mode: 'disabled',
      capabilities: null,
      fallbackMode: null,
      performance: null,
      isOptimal: false,
      healthScore: 0,
      features: {
        lowLatencyProcessing: false,
        realTimeVAD: false,
        advancedProcessing: false,
        qualityEnhancement: false
      }
    };
  }

  /**
   * Check if integration is active
   */
  isIntegrationActive(): boolean {
    return this.isActive;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// Factory function for creating integration service instances
export function createAudioWorkletIntegrationService(
  config?: Partial<IntegrationConfig>
): AudioWorkletIntegrationService {
  return new AudioWorkletIntegrationService(config);
}

// Export service for direct use as well
export default AudioWorkletIntegrationService;