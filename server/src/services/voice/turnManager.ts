/**
 * Turn Manager - Dialog orchestration, STT/TTS/VAD, barge-in
 * 
 * Handles full-duplex voice interactions with:
 * - AudioWorklet for low-latency capture and VAD
 * - Opus framing at 20ms for network efficiency
 * - Real-time barge-in when user interrupts TTS
 * - OpenAI Realtime API integration for streaming STT/TTS
 * - Performance targets: ≤300ms first response, ≤150ms partials, ≤50ms barge-in
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'turn-manager' });

// Turn Event Types (matching source-of-truth specification)
export type TurnEvent =
  | { type: 'ready' | 'mic_opened' | 'mic_closed' | 'tts_play'; data?: Record<string, unknown> }
  | { type: 'vad'; active: boolean; level: number }
  | { type: 'partial_asr'; text: string; confidence?: number }
  | { type: 'final_asr'; text: string; lang: string }
  | { type: 'barge_in' }
  | { type: 'agent_delta' | 'agent_tool' | 'agent_final'; data: Record<string, unknown> }
  | { type: 'error'; code: string; message: string };

export interface TurnManagerConfig {
  locale?: string;
  vad: {
    threshold: number;
    hangMs: number;
  };
  opus: {
    frameMs: 20 | 40;
    bitrate?: number;
  };
  tts: {
    enable: boolean;
    duckOnVAD: boolean;
  };
  transport: VoiceTransport;
}

export interface VoiceTransport {
  send(data: ArrayBuffer | object): Promise<void>;
  on(event: string, callback: (data: Record<string, unknown>) => void): void;
  disconnect(): void;
}

export interface AudioProcessorMessage {
  type: 'audio_data' | 'vad_state' | 'opus_frame' | 'config';
  data?: Record<string, unknown>;
  level?: number;
  active?: boolean;
  frame?: ArrayBuffer;
}

/**
 * Core Turn Manager implementation
 */
export class TurnManager extends EventEmitter {
  private config: TurnManagerConfig;
  private audioContext?: AudioContext;
  private mediaStream?: MediaStream;
  private audioWorkletNode?: AudioWorkletNode;
  private isActive = false;
  private isTTSPlaying = false;
  private vadHangTimer?: NodeJS.Timeout;
  private performanceMetrics = {
    sttLatency: [] as number[],
    ttsLatency: [] as number[],
    bargeInLatency: [] as number[],
  };

  constructor(config: TurnManagerConfig) {
    super();
    this.config = config;
    this.setupEventHandlers();
    logger.info('TurnManager initialized', { 
      locale: config.locale,
      vadThreshold: config.vad.threshold,
      opusFrameMs: config.opus.frameMs
    });
  }

  /**
   * Start the turn manager and initialize audio worklet
   */
  async start(): Promise<void> {
    if (this.isActive) {
      logger.warn('TurnManager already active');
      return;
    }

    try {
      await this.initializeAudioContext();
      await this.setupAudioWorklet();
      await this.requestMicrophonePermission();
      
      this.isActive = true;
      this.emit('event', { type: 'ready', data: { 
        sampleRate: this.audioContext!.sampleRate,
        frameMs: this.config.opus.frameMs,
        locale: this.config.locale
      }});

      logger.info('TurnManager started successfully');
    } catch (error) {
      logger.error('Failed to start TurnManager', { error });
      this.emit('event', { 
        type: 'error', 
        code: 'START_FAILED', 
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Stop the turn manager and cleanup resources
   */
  async stop(): Promise<void> {
    if (!this.isActive) {return;}

    try {
      this.isActive = false;

      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        delete this.mediaStream;
      }

      // Disconnect audio worklet
      if (this.audioWorkletNode) {
        this.audioWorkletNode.disconnect();
        delete this.audioWorkletNode;
      }

      // Close audio context
      if (this.audioContext) {
        await this.audioContext.close();
        delete this.audioContext;
      }

      // Clear timers
      if (this.vadHangTimer) {
        clearTimeout(this.vadHangTimer);
        delete this.vadHangTimer;
      }

      this.emit('event', { type: 'mic_closed' });
      logger.info('TurnManager stopped');
    } catch (error) {
      logger.error('Error stopping TurnManager', { error });
    }
  }

  /**
   * Push text input (optional text-only turns)
   */
  async pushText(text: string): Promise<void> {
    if (!this.isActive) {
      throw new Error('TurnManager not active');
    }

    logger.info('Processing text input', { textLength: text.length });

    try {
      // Send text to transport
      await this.config.transport.send({
        type: 'text_input',
        text,
        timestamp: Date.now(),
      });

      // Emit as final ASR result
      this.emit('event', {
        type: 'final_asr',
        text,
        lang: this.config.locale || 'en-US',
      });
    } catch (error) {
      logger.error('Failed to process text input', { error, text });
      this.emit('event', {
        type: 'error',
        code: 'TEXT_INPUT_FAILED',
        message: 'Failed to process text input',
      });
    }
  }

  /**
   * Register event callback with unsubscribe function
   */
  subscribe(event: 'event', callback: (event: TurnEvent) => void): () => void {
    super.on(event, callback);
    return () => this.removeListener(event, callback);
  }

  /**
   * Initialize audio context with optimal settings
   */
  private async initializeAudioContext(): Promise<void> {
    // Use 48kHz sample rate for Opus compatibility
    this.audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: 'interactive', // Optimize for low latency
    });

    logger.debug('AudioContext initialized', {
      sampleRate: this.audioContext.sampleRate,
      state: this.audioContext.state,
    });
  }

  /**
   * Setup audio worklet for low-latency processing
   */
  private async setupAudioWorklet(): Promise<void> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    // Load the audio worklet processor
    await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
    
    this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'voice-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: {
        vadThreshold: this.config.vad.threshold,
        frameMs: this.config.opus.frameMs,
        sampleRate: this.audioContext.sampleRate,
      },
    });

    // Handle messages from the audio worklet
    this.audioWorkletNode.port.onmessage = (event) => {
      this.handleWorkletMessage(event.data);
    };

    logger.debug('AudioWorklet setup complete');
  }

  /**
   * Request microphone permission and setup stream
   */
  private async requestMicrophonePermission(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      // Connect media stream to audio worklet
      const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
      source.connect(this.audioWorkletNode!);

      this.emit('event', { type: 'mic_opened' });
      logger.info('Microphone permission granted and stream connected');
    } catch (error) {
      logger.error('Microphone permission denied or setup failed', { error });
      throw new Error('Microphone access required for voice features');
    }
  }

  /**
   * Handle messages from audio worklet processor
   */
  private handleWorkletMessage(message: AudioProcessorMessage): void {
    switch (message.type) {
      case 'vad_state':
        this.handleVADStateChange(message.active!, message.level!);
        break;

      case 'opus_frame':
        if (message.frame) {
          this.handleOpusFrame(message.frame);
        }
        break;

      case 'audio_data':
        // Raw audio data for processing
        break;

      default:
        logger.warn('Unknown worklet message type', { type: message.type });
    }
  }

  /**
   * Handle voice activity detection state changes
   */
  private handleVADStateChange(active: boolean, level: number): void {
    // Emit VAD state for UI feedback
    this.emit('event', { type: 'vad', active, level });

    if (active) {
      // Clear hang timer if speech detected
      if (this.vadHangTimer) {
        clearTimeout(this.vadHangTimer);
        delete this.vadHangTimer;
      }

      // Handle barge-in if TTS is playing
      if (this.isTTSPlaying && this.config.tts.duckOnVAD) {
        const bargeInStart = performance.now();
        this.handleBargeIn(bargeInStart);
      }
    } else {
      // Start hang timer for end-of-speech detection
      if (this.vadHangTimer) {
        clearTimeout(this.vadHangTimer);
      }

      this.vadHangTimer = setTimeout(() => {
        // Speech ended - trigger ASR finalization
        this.finalizeCurrentTurn();
      }, this.config.vad.hangMs);
    }
  }

  /**
   * Handle barge-in when user interrupts TTS
   */
  private handleBargeIn(startTime: number): void {
    logger.info('Barge-in detected, stopping TTS');

    // Stop TTS playback
    this.isTTSPlaying = false;
    
    // Send barge-in signal to transport
    this.config.transport.send({
      type: 'control',
      action: 'interrupt_tts',
      timestamp: Date.now(),
    });

    // Emit barge-in event
    this.emit('event', { type: 'barge_in' });

    // Track barge-in latency
    const latency = performance.now() - startTime;
    this.performanceMetrics.bargeInLatency.push(latency);

    // Log performance warning if barge-in is too slow
    if (latency > 50) {
      logger.warn('Barge-in latency exceeded target', { 
        latency, 
        target: 50,
        avgLatency: this.getAverageLatency('bargeIn')
      });
    }

    logger.debug('Barge-in processed', { latency });
  }

  /**
   * Handle Opus audio frames from worklet
   */
  private handleOpusFrame(frame: ArrayBuffer): void {
    // Send Opus frame to transport
    this.config.transport.send(frame);
  }

  /**
   * Finalize current speech turn
   */
  private finalizeCurrentTurn(): void {
    // This would typically trigger final ASR processing
    logger.debug('Finalizing current speech turn');
  }

  /**
   * Setup transport event handlers
   */
  private setupEventHandlers(): void {
    // Handle ASR partials
    this.config.transport.on('asr_partial', (data) => {
      if (typeof data === 'object' && data !== null && 'timestamp' in data && typeof data['timestamp'] === 'number') {
        const latency = performance.now() - data['timestamp'];
        this.performanceMetrics.sttLatency.push(latency);

        // Warn if partial latency exceeds target
        if (latency > 150) {
          logger.warn('ASR partial latency exceeded target', {
            latency,
            target: 150,
            avgLatency: this.getAverageLatency('stt')
          });
        }
      }

      this.emit('event', {
        type: 'partial_asr',
        text: data['text'],
        confidence: data['confidence'],
      });
    });

    // Handle ASR finals
    this.config.transport.on('asr_final', (data) => {
      this.emit('event', {
        type: 'final_asr',
        text: data['text'],
        lang: data['language'] || this.config.locale || 'en-US',
      });
    });

    // Handle agent responses
    this.config.transport.on('agent_delta', (data) => {
      this.emit('event', { type: 'agent_delta', data });
    });

    this.config.transport.on('agent_final', (data) => {
      this.emit('event', { type: 'agent_final', data });
    });

    // Handle TTS audio
    this.config.transport.on('tts_audio', (data) => {
      this.isTTSPlaying = true;
      this.emit('event', { type: 'tts_play', data });
    });

    // Handle OpenAI audio deltas for direct playback
    this.config.transport.on('audio_delta', async (data) => {
      if (typeof data === 'object' && data !== null && 'delta' in data && data['delta'] && this.config.tts.enable) {
        try {
          // Play PCM16 audio directly from OpenAI
          const deltaBuffer = Buffer.isBuffer(data['delta']) ? data['delta'] : Buffer.from(data['delta'] as string);
          await this.playPCM16Audio(deltaBuffer);
          this.isTTSPlaying = true;
        } catch (error) {
          logger.error('Failed to play audio delta', { error });
        }
      }
    });

    // Handle errors
    this.config.transport.on('error', (error) => {
      this.emit('event', {
        type: 'error',
        code: error['code'] || 'TRANSPORT_ERROR',
        message: error['message'] || 'Transport error',
      });
    });
  }

  /**
   * Get average latency for performance metric
   */
  private getAverageLatency(type: 'stt' | 'tts' | 'bargeIn'): number {
    let latencies: number[];
    
    switch (type) {
      case 'stt':
        latencies = this.performanceMetrics.sttLatency;
        break;
      case 'tts':
        latencies = this.performanceMetrics.ttsLatency;
        break;
      case 'bargeIn':
        latencies = this.performanceMetrics.bargeInLatency;
        break;
    }
    
    if (latencies.length === 0) {return 0;}
    
    return latencies.reduce((sum: number, lat: number) => sum + lat, 0) / latencies.length;
  }

  /**
   * Play PCM16 audio data using existing AudioContext
   */
  private async playPCM16Audio(audioData: Buffer): Promise<void> {
    if (!this.audioContext) {
      logger.warn('Cannot play audio: AudioContext not available');
      return;
    }

    try {
      // Convert Buffer to ArrayBuffer
      const arrayBuffer = audioData.buffer.slice(
        audioData.byteOffset,
        audioData.byteOffset + audioData.byteLength
      );
      
      // Convert ArrayBuffer to Float32Array for Web Audio API
      const int16Array = new Int16Array(arrayBuffer);
      const float32Array = new Float32Array(int16Array.length);
      
      // Convert PCM16 to Float32 range [-1, 1]
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i]! / 32768.0;
      }
      
      // Create audio buffer with OpenAI's sample rate (24kHz)
      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.copyToChannel(float32Array, 0);
      
      // Create and play buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      logger.debug('PCM16 audio played', { 
        duration: audioBuffer.duration,
        samples: float32Array.length 
      });
    } catch (error) {
      logger.error('Error playing PCM16 audio', { error });
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      avgSTTLatency: this.getAverageLatency('stt'),
      avgTTSLatency: this.getAverageLatency('tts'),
      avgBargeInLatency: this.getAverageLatency('bargeIn'),
      sttSamples: this.performanceMetrics.sttLatency.length,
      ttsSamples: this.performanceMetrics.ttsLatency.length,
      bargeInSamples: this.performanceMetrics.bargeInLatency.length,
    };
  }
}

// Export default configuration
export const getDefaultTurnManagerConfig = (): Partial<TurnManagerConfig> => ({
  locale: 'en-US',
  vad: {
    threshold: 0.01, // Adjust based on environment
    hangMs: 800,     // 800ms of silence before finalization
  },
  opus: {
    frameMs: 20,     // 20ms frames for optimal latency
    bitrate: 16000,  // 16kbps for speech
  },
  tts: {
    enable: true,
    duckOnVAD: true, // Enable barge-in
  },
});