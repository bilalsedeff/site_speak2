/**
 * Audio Format Utilities - Client-side audio processing
 *
 * Handles audio format conversion and optimization for voice input:
 * - Ensures optimal format for server-side processing
 * - WebM/Opus encoding for network efficiency
 * - PCM16 fallback for direct processing
 * - Audio quality optimization for real-time streaming
 */

import { createLogger } from '../../../shared/utils';

const logger = createLogger({ service: 'audio-format-client' });

export interface AudioFormatConfig {
  preferredFormat: 'webm' | 'pcm16' | 'auto';
  sampleRate: number;
  channels: number;
  bitRate?: number;
  mimeType?: string;
}

export interface AudioChunk {
  data: ArrayBuffer;
  format: string;
  sampleRate: number;
  channels: number;
  timestamp: number;
  duration?: number;
}

export interface AudioFormatCapabilities {
  webmSupported: boolean;
  opusSupported: boolean;
  mediaRecorderSupported: boolean;
  audioWorkletSupported: boolean;
  supportedMimeTypes: string[];
}

/**
 * Audio format manager for optimized voice streaming
 */
export class AudioFormatManager {
  private config: AudioFormatConfig;
  private capabilities: AudioFormatCapabilities;
  private mediaRecorder?: MediaRecorder | undefined;
  private audioContext?: AudioContext | undefined;
  private processorNode?: AudioWorkletNode | undefined;
  private isRecording = false;
  private chunks: Blob[] = [];

  constructor(config: Partial<AudioFormatConfig> = {}) {
    this.config = {
      preferredFormat: 'auto',
      sampleRate: 24000, // Match OpenAI Realtime API
      channels: 1,
      bitRate: 16000,
      ...config,
    };

    this.capabilities = this.detectCapabilities();

    logger.info('AudioFormatManager initialized', {
      config: this.config,
      capabilities: this.capabilities,
    });
  }

  /**
   * Detect browser audio capabilities
   */
  private detectCapabilities(): AudioFormatCapabilities {
    const capabilities: AudioFormatCapabilities = {
      webmSupported: false,
      opusSupported: false,
      mediaRecorderSupported: typeof MediaRecorder !== 'undefined',
      audioWorkletSupported: typeof AudioWorklet !== 'undefined',
      supportedMimeTypes: [],
    };

    if (capabilities.mediaRecorderSupported) {
      // Test common audio formats
      const testTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/wav',
      ];

      for (const mimeType of testTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          capabilities.supportedMimeTypes.push(mimeType);

          if (mimeType.includes('webm')) {
            capabilities.webmSupported = true;
          }
          if (mimeType.includes('opus')) {
            capabilities.opusSupported = true;
          }
        }
      }
    }

    logger.debug('Audio capabilities detected', capabilities);
    return capabilities;
  }

  /**
   * Get optimal audio format based on capabilities and config
   */
  getOptimalFormat(): { mimeType: string; format: string } {
    if (this.config.preferredFormat !== 'auto') {
      if (this.config.preferredFormat === 'webm' && this.capabilities.webmSupported) {
        return {
          mimeType: 'audio/webm;codecs=opus',
          format: 'webm',
        };
      }
      if (this.config.preferredFormat === 'pcm16') {
        return {
          mimeType: 'audio/pcm',
          format: 'pcm16',
        };
      }
    }

    // Auto-detect optimal format
    if (this.capabilities.webmSupported && this.capabilities.opusSupported) {
      return {
        mimeType: 'audio/webm;codecs=opus',
        format: 'webm',
      };
    }

    if (this.capabilities.supportedMimeTypes.length > 0) {
      return {
        mimeType: this.capabilities.supportedMimeTypes[0]!,
        format: this.capabilities.supportedMimeTypes[0]!.split('/')[1]!.split(';')[0]!,
      };
    }

    // Fallback to PCM16
    return {
      mimeType: 'audio/pcm',
      format: 'pcm16',
    };
  }

  /**
   * Start recording with optimal format
   */
  async startRecording(
    stream: MediaStream,
    onDataAvailable: (chunk: AudioChunk) => void
  ): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const optimal = this.getOptimalFormat();

    try {
      if (optimal.format === 'webm' && this.capabilities.mediaRecorderSupported) {
        await this.startMediaRecorderRecording(stream, optimal, onDataAvailable);
      } else {
        await this.startAudioWorkletRecording(stream, onDataAvailable);
      }

      this.isRecording = true;
      logger.info('Recording started with format', { format: optimal });
    } catch (error) {
      logger.error('Failed to start recording', { error, format: optimal });
      throw error;
    }
  }

  /**
   * Start recording using MediaRecorder (for WebM/Opus)
   */
  private async startMediaRecorderRecording(
    stream: MediaStream,
    format: { mimeType: string; format: string },
    onDataAvailable: (chunk: AudioChunk) => void
  ): Promise<void> {
    this.chunks = [];

    const options: MediaRecorderOptions = {
      mimeType: format.mimeType,
    };

    // Add bitrate if supported
    if (this.config.bitRate) {
      options.audioBitsPerSecond = this.config.bitRate;
    }

    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);

        // Convert Blob to ArrayBuffer
        event.data.arrayBuffer().then((arrayBuffer) => {
          const chunk: AudioChunk = {
            data: arrayBuffer,
            format: format.format,
            sampleRate: this.config.sampleRate,
            channels: this.config.channels,
            timestamp: Date.now(),
            ...(event.data.size === 0 && { duration: 0 }), // Only include duration if it's 0
          };

          onDataAvailable(chunk);
        }).catch((error) => {
          logger.error('Failed to convert audio data', { error });
        });
      }
    };

    this.mediaRecorder.onerror = (event) => {
      logger.error('MediaRecorder error', { event });
    };

    // Start recording with small timeslices for real-time streaming
    this.mediaRecorder.start(100); // 100ms chunks
  }

  /**
   * Start recording using AudioWorklet (for PCM16)
   */
  private async startAudioWorkletRecording(
    stream: MediaStream,
    onDataAvailable: (chunk: AudioChunk) => void
  ): Promise<void> {
    if (!this.capabilities.audioWorkletSupported) {
      throw new Error('AudioWorklet not supported');
    }

    // Create AudioContext with optimal settings
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
      latencyHint: 'interactive',
    });

    // Load audio processor if not already loaded
    try {
      await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
    } catch (error) {
      // Processor might already be loaded
      logger.debug('Audio worklet processor already loaded or failed to load', { error });
    }

    // Create processor node
    this.processorNode = new AudioWorkletNode(
      this.audioContext,
      'voice-processor',
      {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: {
          sampleRate: this.config.sampleRate,
          frameMs: 100, // 100ms chunks for real-time streaming
          channels: this.config.channels,
        },
      }
    );

    // Handle audio frames from worklet
    this.processorNode.port.onmessage = (event) => {
      const { type, frame, timestamp } = event.data;

      if (type === 'opus_frame' && frame) {
        // Convert Int16Array to ArrayBuffer
        const arrayBuffer = frame instanceof ArrayBuffer ? frame : frame.buffer;

        const chunk: AudioChunk = {
          data: arrayBuffer,
          format: 'pcm16',
          sampleRate: this.config.sampleRate,
          channels: this.config.channels,
          timestamp: timestamp || Date.now(),
        };

        onDataAvailable(chunk);
      }
    };

    // Connect audio stream to processor
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.processorNode);

    logger.debug('AudioWorklet recording initialized');
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
        this.mediaRecorder = undefined;
      }

      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = undefined;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = undefined;
      }

      this.isRecording = false;
      this.chunks = [];

      logger.info('Recording stopped');
    } catch (error) {
      logger.error('Error stopping recording', { error });
    }
  }

  /**
   * Convert audio chunk to optimal format for transmission
   */
  async optimizeForTransmission(chunk: AudioChunk): Promise<AudioChunk> {
    // If already in optimal format, return as-is
    const optimal = this.getOptimalFormat();
    if (chunk.format === optimal.format) {
      return chunk;
    }

    try {
      // For now, pass through - server will handle conversion
      // In a full implementation, we could do client-side conversion
      logger.debug('Audio chunk optimization skipped - server will handle conversion', {
        currentFormat: chunk.format,
        optimalFormat: optimal.format,
      });

      return chunk;
    } catch (error) {
      logger.error('Audio optimization failed', { error });
      return chunk; // Return original on error
    }
  }

  /**
   * Validate audio chunk quality
   */
  validateAudioChunk(chunk: AudioChunk): {
    valid: boolean;
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check size
    if (chunk.data.byteLength === 0) {
      return {
        valid: false,
        warnings: ['Empty audio chunk'],
        recommendations: ['Check audio input source'],
      };
    }

    if (chunk.data.byteLength < 1024) {
      warnings.push('Very small audio chunk (< 1KB)');
      recommendations.push('Consider increasing chunk duration');
    }

    if (chunk.data.byteLength > 1024 * 1024) {
      warnings.push('Large audio chunk (> 1MB)');
      recommendations.push('Consider reducing chunk duration or bitrate');
    }

    // Check sample rate
    if (chunk.sampleRate !== this.config.sampleRate) {
      warnings.push(`Sample rate mismatch: ${chunk.sampleRate} vs ${this.config.sampleRate}`);
      recommendations.push('Ensure AudioContext sample rate matches config');
    }

    // Check format compatibility
    const optimal = this.getOptimalFormat();
    if (chunk.format !== optimal.format && !this.isFormatSupported(chunk.format)) {
      warnings.push(`Suboptimal audio format: ${chunk.format}`);
      recommendations.push(`Consider using ${optimal.format} format`);
    }

    return {
      valid: warnings.length === 0,
      warnings,
      recommendations,
    };
  }

  /**
   * Check if audio format is supported
   */
  private isFormatSupported(format: string): boolean {
    return this.capabilities.supportedMimeTypes.some(mimeType =>
      mimeType.includes(format)
    );
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): AudioFormatCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioFormatConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AudioFormatConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.debug('Audio format config updated', { updates });
  }
}

// Utility functions

/**
 * Create default audio format manager
 */
export function createAudioFormatManager(config?: Partial<AudioFormatConfig>): AudioFormatManager {
  return new AudioFormatManager(config);
}

/**
 * Detect browser audio support
 */
export function detectAudioSupport(): AudioFormatCapabilities {
  const manager = new AudioFormatManager();
  return manager.getCapabilities();
}

/**
 * Get recommended audio format for current browser
 */
export function getRecommendedFormat(): { mimeType: string; format: string } {
  const manager = new AudioFormatManager();
  return manager.getOptimalFormat();
}