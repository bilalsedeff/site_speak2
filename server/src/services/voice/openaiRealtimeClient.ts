/**
 * OpenAI Realtime API Client - Streaming STT/TTS integration
 * 
 * Provides low-latency voice processing using OpenAI's Realtime API:
 * - Streaming speech-to-text with partial results
 * - Streaming text-to-speech with incremental audio
 * - Session management and error recovery
 * - Performance monitoring and optimization
 * 
 * Performance targets:
 * - First token ≤ 300ms
 * - Partial ASR ≤ 150ms  
 * - Audio streaming latency ≤ 50ms
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import { config } from '../../infrastructure/config';

const logger = createLogger({ service: 'openai-realtime' });

// OpenAI Realtime API configuration
export interface RealtimeConfig {
  apiKey: string;
  model: 'gpt-4o-realtime-preview';
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  inputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  outputAudioFormat: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  inputAudioTranscription?: {
    model: 'whisper-1';
  };
  turnDetection?: {
    type: 'server_vad' | 'none';
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  tools?: RealtimeTool[];
}

// Import comprehensive type definitions
import type {
  RealtimeTool,
  RealtimeEvent,
  RealtimeEventHandlers,
  SessionConfig,
  ConversationItem,
  Response,
  RealtimeError,
  ConnectionStatus,
  RealtimeMetrics,
  ClientMessage,
  JSONSchema
} from './openai-realtime-types.js';

// Re-export types for backwards compatibility
export type {
  RealtimeTool,
  RealtimeEvent,
  RealtimeEventHandlers,
  SessionConfig,
  ConversationItem,
  Response,
  RealtimeError,
  ConnectionStatus,
  RealtimeMetrics,
  ClientMessage,
  JSONSchema
} from './openai-realtime-types.js';

/**
 * OpenAI Realtime API Client
 */
export class OpenAIRealtimeClient extends EventEmitter {
  private config: RealtimeConfig;
  private ws?: WebSocket;
  private isConnected = false;
  private sessionId?: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  private metrics: RealtimeMetrics = {
    connectionLatency: 0,
    firstTokenLatency: [],
    audioStreamingLatency: [],
    transcriptionLatency: [],
    totalMessages: 0,
    audioBytesSent: 0,
    audioBytesReceived: 0,
    errors: 0,
    reconnections: 0,
  };

  // Pending requests for latency tracking
  private pendingRequests = new Map<string, { timestamp: number; type: string }>();
  private audioBufferStart?: number;

  constructor(config: RealtimeConfig) {
    super();
    this.config = { ...config };
    
    logger.info('OpenAI Realtime client initialized', {
      model: config.model,
      voice: config.voice,
      inputFormat: config.inputAudioFormat,
      outputFormat: config.outputAudioFormat,
    });
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Already connected to OpenAI Realtime API');
      return;
    }

    return new Promise((resolve, reject) => {
      const connectStart = Date.now();
      const wsUrl = 'wss://api.openai.com/v1/realtime?model=' + this.config.model;
      
      logger.info('Initiating OpenAI Realtime API connection', { 
        wsUrl,
        model: this.config.model,
        voice: this.config.voice,
        inputAudioFormat: this.config.inputAudioFormat,
        outputAudioFormat: this.config.outputAudioFormat,
        hasApiKey: !!this.config.apiKey,
        apiKeyPrefix: this.config.apiKey ? this.config.apiKey.substring(0, 7) + '...' : 'missing'
      });

      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      logger.info('WebSocket created, waiting for connection', { wsUrl });

      this.ws.on('open', () => {
        this.metrics.connectionLatency = Date.now() - connectStart;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        logger.info('Connected to OpenAI Realtime API', {
          connectionLatency: this.metrics.connectionLatency,
        });

        // Initialize session
        this.initializeSession();
        resolve();
      });

      this.ws.on('message', (data) => {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.handleMessage(buffer);
      });

      this.ws.on('close', (code, reason) => {
        this.handleDisconnection(code, reason.toString());
      });

      this.ws.on('error', (error) => {
        // Type-safe error property extraction for network errors
        const isNodeError = (err: unknown): err is NodeJS.ErrnoException => {
          return typeof err === 'object' && err !== null && 'code' in err;
        };

        const isNetworkError = (err: unknown): err is Error & {
          address?: string;
          port?: number;
          errno?: number | string;
          syscall?: string;
        } => {
          return typeof err === 'object' && err !== null && ('address' in err || 'port' in err);
        };

        const errorDetails = {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: isNodeError(error) ? error.code : undefined,
          errno: isNodeError(error) ? error.errno : undefined,
          syscall: isNodeError(error) ? error.syscall : undefined,
          address: isNetworkError(error) ? error.address : undefined,
          port: isNetworkError(error) ? error.port : undefined,
          raw: error
        };
        
        logger.error('WebSocket connection error - detailed diagnostics', { 
          error: errorDetails,
          connectionState: {
            isConnected: this.isConnected,
            wsReadyState: this.ws?.readyState,
            hasApiKey: !!this.config.apiKey,
            apiKeyPrefix: this.config.apiKey ? this.config.apiKey.substring(0, 7) + '...' : 'missing',
            wsUrl: 'wss://api.openai.com/v1/realtime?model=' + this.config.model,
            timeElapsed: Date.now() - connectStart + 'ms'
          }
        });
        this.metrics.errors++;
        
        if (!this.isConnected) {
          reject(error);
        } else {
          this.emit('error', error);
        }
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Disconnect from OpenAI Realtime API
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.ws) {return;}

    this.isConnected = false;
    this.ws.close(1000, 'Client disconnect');
    
    logger.info('Disconnected from OpenAI Realtime API');
  }

  /**
   * Initialize Realtime session
   */
  private initializeSession(): void {
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a helpful voice assistant. Respond naturally and conversationally.',
        voice: this.config.voice,
        input_audio_format: this.config.inputAudioFormat,
        output_audio_format: this.config.outputAudioFormat,
        input_audio_transcription: this.config.inputAudioTranscription,
        turn_detection: this.config.turnDetection || {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: this.config.tools || [],
        tool_choice: 'auto',
        temperature: 0.8,
        max_response_output_tokens: 4096,
      },
    };

    this.sendMessage(sessionConfig);
    logger.debug('Session configuration sent');
  }

  /**
   * Send audio data to the API
   */
  async sendAudio(audioData: ArrayBuffer): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    // Convert to base64
    const base64Audio = Buffer.from(audioData).toString('base64');
    
    // Track audio buffer start for latency measurement
    if (!this.audioBufferStart) {
      this.audioBufferStart = Date.now();
    }

    const message = {
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    };

    this.sendMessage(message);
    this.metrics.audioBytesSent += audioData.byteLength;

    logger.info('Audio data sent to OpenAI Realtime API', { 
      size: audioData.byteLength,
      base64Length: base64Audio.length,
      timestamp: Date.now()
    });

    // Auto-commit audio buffer for immediate processing
    setTimeout(() => {
      this.commitAudioBuffer().catch(error => {
        logger.error('Auto-commit audio buffer failed', { error });
      });
    }, 100); // Small delay to ensure all audio chunks are appended
  }

  /**
   * Commit audio buffer and start processing
   */
  async commitAudioBuffer(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    const message = { type: 'input_audio_buffer.commit' };
    this.sendMessage(message);
    
    logger.debug('Audio buffer committed');
  }

  /**
   * Clear audio buffer
   */
  async clearAudioBuffer(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    const message = { type: 'input_audio_buffer.clear' };
    this.sendMessage(message);
    delete this.audioBufferStart;
    
    logger.debug('Audio buffer cleared');
  }

  /**
   * Send text message to the API
   */
  async sendText(text: string): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    };

    this.sendMessage(message);
    
    // Trigger response
    await this.createResponse();
    
    logger.info('Text message sent', { textLength: text.length });
  }

  /**
   * Create response from the API
   */
  async createResponse(): Promise<void> {
    const requestId = this.generateRequestId();
    this.pendingRequests.set(requestId, {
      timestamp: Date.now(),
      type: 'response',
    });

    const message = {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: 'Please respond naturally and helpfully.',
      },
    };

    this.sendMessage(message);
    logger.debug('Response creation requested', { requestId });
  }

  /**
   * Cancel ongoing response
   */
  async cancelResponse(): Promise<void> {
    if (!this.isConnected || !this.ws) {return;}

    const message = { type: 'response.cancel' };
    this.sendMessage(message);
    
    logger.debug('Response cancellation requested');
  }

  /**
   * Handle incoming messages from the API
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as RealtimeEvent;
      this.metrics.totalMessages++;

      logger.debug('Received message', { type: message.type });

      // Handle different message types
      switch (message.type) {
        case 'session.created':
          this.sessionId = message.session.id;
          this.emit('session_ready', message.session);
          break;

        case 'input_audio_buffer.speech_started':
          logger.info('Speech started detected', { 
            audioStartMs: message.audio_start_ms,
            itemId: message.item_id
          });
          this.emit('speech_started', {
            audioStartMs: message.audio_start_ms,
            itemId: message.item_id,
          });
          break;

        case 'input_audio_buffer.speech_stopped':
          logger.info('Speech stopped detected', { 
            audioEndMs: message.audio_end_ms,
            itemId: message.item_id
          });
          this.emit('speech_stopped', {
            audioEndMs: message.audio_end_ms,
            itemId: message.item_id,
          });
          break;

        case 'conversation.item.input_audio_transcription.completed':
          { const transcriptionLatency = this.audioBufferStart ? 
            Date.now() - this.audioBufferStart : 0;
          this.metrics.transcriptionLatency.push(transcriptionLatency);
          delete this.audioBufferStart;

          this.emit('conversation.item.input_audio_transcription.completed', {
            itemId: message.item_id,
            transcript: message.transcript,
            latency: transcriptionLatency,
          });
          break; }

        case 'response.audio.delta':
          { const audioData = Buffer.from(message.delta, 'base64');
          this.metrics.audioBytesReceived += audioData.length;
          
          this.emit('response.audio.delta', {
            delta: audioData,
            timestamp: Date.now(),
          });
          break; }

        case 'response.audio_transcript.delta':
          this.emit('response.text.delta', {
            delta: message.delta,
            timestamp: Date.now(),
          });
          break;

        case 'response.audio_transcript.done':
          this.emit('response.text.done', {
            text: message.transcript,
            timestamp: Date.now(),
          });
          break;

        case 'response.function_call_arguments.delta':
          this.emit('function_call_delta', {
            callId: message.call_id,
            delta: message.delta,
          });
          break;

        case 'response.function_call_arguments.done':
          this.emit('function_call_complete', {
            callId: message.call_id,
            arguments: message.arguments,
          });
          break;

        case 'response.done':
          this.trackResponseLatency();
          this.emit('response_complete', message.response);
          break;

        case 'error':
          this.metrics.errors++;
          this.emit('error', message.error);
          break;

        default:
          logger.debug('Unhandled message type', { type: message.type });
      }
    } catch (error) {
      logger.error('Error parsing message', { error, data: data.toString() });
      this.metrics.errors++;
    }
  }

  /**
   * Send message to the API
   */
  private sendMessage(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message: WebSocket not open');
      return;
    }

    try {
      const data = JSON.stringify(message);
      this.ws.send(data);
      
      logger.debug('Message sent', { 
        type: message.type,
        size: data.length 
      });
    } catch (error) {
      logger.error('Error sending message', { error, messageType: message.type });
      this.metrics.errors++;
    }
  }

  /**
   * Handle disconnection and attempt reconnection
   */
  private handleDisconnection(code: number, reason: string): void {
    this.isConnected = false;
    delete this.sessionId;
    delete this.audioBufferStart;
    this.pendingRequests.clear();

    logger.warn('Disconnected from OpenAI Realtime API', { code, reason });

    // Attempt reconnection if not intentional
    if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnection();
    } else {
      this.emit('disconnected', { code, reason });
    }
  }

  /**
   * Attempt to reconnect to the API
   */
  private async attemptReconnection(): Promise<void> {
    this.reconnectAttempts++;
    this.metrics.reconnections++;

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info('Attempting reconnection', { 
      attempt: this.reconnectAttempts,
      delay,
      maxAttempts: this.maxReconnectAttempts
    });

    setTimeout(async () => {
      try {
        await this.connect();
        this.emit('reconnected');
      } catch (error) {
        logger.error('Reconnection failed', { error, attempt: this.reconnectAttempts });
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        } else {
          this.emit('reconnection_failed');
        }
      }
    }, delay);
  }

  /**
   * Track response latency
   */
  private trackResponseLatency(): void {
    const responseRequests = Array.from(this.pendingRequests.entries())
      .filter(([_, req]) => req.type === 'response');

    if (responseRequests.length > 0) {
      const firstRequest = responseRequests[0];
      if (firstRequest) {
        const [requestId, request] = firstRequest;
        const latency = Date.now() - request.timestamp;
        this.metrics.firstTokenLatency.push(latency);
        this.pendingRequests.delete(requestId);
        logger.debug('Response latency tracked', { latency });
      }
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Play PCM16 audio data directly using Web Audio API
   */
  async playAudio(audioData: ArrayBuffer, sampleRate: number = 24000): Promise<void> {
    // Use the global AudioContext or create one
    const audioContext = (globalThis as any).audioContext || new AudioContext({ sampleRate });
    
    // Convert ArrayBuffer to Float32Array for Web Audio API
    const int16Array = new Int16Array(audioData);
    const float32Array = new Float32Array(int16Array.length);
    
    // Convert PCM16 to Float32 range [-1, 1]
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i]! / 32768.0;
    }
    
    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.copyToChannel(float32Array, 0);
    
    // Create and play buffer source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
    
    logger.debug('Audio played', { 
      duration: audioBuffer.duration,
      sampleRate,
      samples: float32Array.length 
    });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): RealtimeMetrics {
    return {
      ...this.metrics,
      firstTokenLatency: [...this.metrics.firstTokenLatency],
      audioStreamingLatency: [...this.metrics.audioStreamingLatency],
      transcriptionLatency: [...this.metrics.transcriptionLatency],
    };
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      reconnectAttempts: this.reconnectAttempts,
      wsReadyState: this.ws?.readyState,
    };
  }
}

// Default configuration factory
export function createRealtimeConfig(overrides: Partial<RealtimeConfig> = {}): RealtimeConfig {
  return {
    apiKey: config.OPENAI_API_KEY,
    model: 'gpt-4o-realtime-preview',
    voice: 'alloy',
    inputAudioFormat: 'pcm16',
    outputAudioFormat: 'pcm16',
    inputAudioTranscription: {
      model: 'whisper-1',
    },
    turnDetection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 800,
    },
    ...overrides,
  };
}

// Export singleton instance for convenience
export const openaiRealtimeClient = new OpenAIRealtimeClient(createRealtimeConfig());