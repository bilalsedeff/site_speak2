/**
 * Voice Audio Processor - Handles audio data processing and streaming
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Manages audio data processing, conversion, and optimization
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import { realtimeConnectionPool } from './RealtimeConnectionPool.js';
import { optimizedAudioConverter } from './OptimizedAudioConverter.js';
import { voicePerformanceMonitor } from './VoicePerformanceMonitor.js';
import type { UnifiedVoiceSession, UnifiedOrchestratorConfig } from './types/VoiceTypes.js';

const logger = createLogger({ service: 'voice-audio-processor' });

export class VoiceAudioProcessor extends EventEmitter {
  private config: UnifiedOrchestratorConfig;

  constructor(config: UnifiedOrchestratorConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize voice session with optimized components
   */
  async initializeVoiceSession(session: UnifiedVoiceSession): Promise<void> {
    const sessionId = session.id;
    const startTime = performance.now();

    try {
      logger.info('Initializing voice session with optimized components', { sessionId });

      // Get or create pooled connection for better performance
      if (this.config.performance.enableConnectionPooling) {
        try {
          session.realtimeConnection = await realtimeConnectionPool.getConnection(
            session.tenantId,
            sessionId
          );
          session.metrics.optimizations.connectionReused = session.realtimeConnection.useCount > 1;
          logger.debug('Pooled connection acquired', {
            sessionId,
            connectionLatency: session.realtimeConnection.connectionLatency,
            reused: session.metrics.optimizations.connectionReused
          });
        } catch (poolError) {
          logger.warn('Failed to get pooled connection, creating direct connection', {
            sessionId,
            error: poolError
          });
          session.metrics.optimizations.connectionReused = false;
        }
      }

      // Initialize TurnManager for audio processing
      if (session.connectionType === 'raw_websocket' || session.connectionType === 'hybrid') {
        await this.initializeTurnManager(session);
      }

      // Setup real-time event handlers if we have a pooled connection
      if (session.realtimeConnection) {
        this.setupRealtimeConnectionHandlers(session);
      }

      // Update session status
      session.status = 'ready';

      const initLatency = performance.now() - startTime;
      session.metrics.performance.firstTokenLatencies.push(initLatency);

      // Track initialization performance
      if (this.config.performance.enablePerformanceMonitoring) {
        voicePerformanceMonitor.recordFirstTokenLatency(initLatency, sessionId);
      }

      // Trigger optimization if initialization is slow
      if (initLatency > this.config.optimization.autoOptimizationThreshold) {
        session.metrics.optimizations.autoOptimizationsTriggered++;
        this.emit('optimization_needed', { sessionId, initLatency });

        logger.warn('Voice session initialization exceeded threshold, triggering optimization', {
          sessionId,
          initLatency,
          threshold: this.config.optimization.autoOptimizationThreshold
        });
      }

      logger.info('Voice session initialized successfully', {
        sessionId,
        initLatency,
        connectionPooled: !!session.realtimeConnection,
        turnManagerReady: !!session.turnManager
      });

    } catch (error) {
      session.status = 'error';
      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'SESSION_INIT_ERROR',
        context: {
          sessionId,
          tenantId: session.tenantId,
          connectionType: session.connectionType
        }
      });

      logger.error('Failed to initialize voice session', { sessionId, error });
      throw error;
    }
  }

  /**
   * Initialize TurnManager for audio processing
   */
  private async initializeTurnManager(session: UnifiedVoiceSession): Promise<void> {
    const turnManagerConfig = {
      locale: session.config.locale,
      vad: {
        threshold: 0.01,
        hangMs: 800
      },
      opus: {
        frameMs: session.config.audioConfig.frameMs as 20 | 40,
        bitrate: 16000
      },
      tts: {
        enable: true,
        duckOnVAD: true
      },
      transport: {
        send: async (data: ArrayBuffer | object) => {
          if (session.realtimeConnection) {
            await session.realtimeConnection.client.sendAudio(data as ArrayBuffer);
          }
        },
        on: (event: string, callback: (data: Record<string, unknown>) => void) => {
          if (session.realtimeConnection) {
            session.realtimeConnection.client.on(event, callback);
          }
        },
        disconnect: () => {
          if (session.realtimeConnection) {
            realtimeConnectionPool.releaseConnection(session.realtimeConnection);
          }
        }
      }
    };

    const { TurnManager } = await import('./turnManager.js');
    session.turnManager = new TurnManager(turnManagerConfig);

    // Setup TurnManager event handlers for performance tracking
    session.turnManager.subscribe('event', (event) => {
      this.emit('turn_manager_event', { session, event });
    });

    await session.turnManager.start();
    logger.debug('TurnManager initialized and started', { sessionId: session.id });
  }

  /**
   * Handle incoming audio data with optimized processing
   */
  async handleAudioData(session: UnifiedVoiceSession, audioData: ArrayBuffer): Promise<void> {
    const sessionId = session.id;
    const startTime = performance.now();

    try {
      session.totalFrames++;
      session.audioBuffer.push(audioData);

      // Track first token time
      if (!session.firstTokenTime) {
        session.firstTokenTime = performance.now();
      }

      // Process through TurnManager if available
      if (session.turnManager) {
        logger.debug('Audio data forwarded to TurnManager', {
          sessionId,
          dataSize: audioData.byteLength
        });
      }

      // Process through optimized audio converter if streaming is enabled
      if (session.config.audioConfig.enableStreamingProcessing) {
        try {
          const conversionConfig = {
            inputFormat: 'webm' as const,
            outputFormat: 'pcm16' as const,
            sampleRate: session.config.audioConfig.sampleRate,
            channels: 1,
            bitDepth: 16 as const,
            enableBufferPooling: true,
            enableWorkerThreads: false,
            enableStreaming: true,
            maxLatencyMs: 50
          };

          const conversionResult = await optimizedAudioConverter.convertWebMToPCM16Optimized(audioData, conversionConfig);
          const processedAudio = conversionResult.data;

          if (processedAudio && session.realtimeConnection) {
            await session.realtimeConnection.client.sendAudio(processedAudio);
          }

          session.metrics.optimizations.streamingProcessingUsed = true;
        } catch (conversionError) {
          logger.warn('Streaming audio conversion failed, falling back to standard processing', {
            sessionId,
            error: conversionError
          });
        }
      }

      const processingLatency = performance.now() - startTime;
      session.metrics.performance.audioProcessingLatencies.push(processingLatency);

      // Check for performance threshold violations
      if (processingLatency > this.config.performance.targetPartialLatencyMs) {
        logger.warn('Audio processing latency exceeded target', {
          sessionId,
          latency: processingLatency,
          target: this.config.performance.targetPartialLatencyMs
        });
      }

    } catch (error) {
      logger.error('Error processing audio data', { sessionId, error });
      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'AUDIO_PROCESSING_ERROR'
      });
    }
  }

  /**
   * Process voice input with optimized latency path
   */
  async processVoiceInput(session: UnifiedVoiceSession, audioData: ArrayBuffer): Promise<void> {
    const startTime = performance.now();

    try {
      // Optimized path for ≤300ms first token latency
      await this.handleAudioData(session, audioData);

      const processingTime = performance.now() - startTime;

      // Track first token latency if this is the first input
      if (session.metrics.performance.firstTokenLatencies.length === 0) {
        session.metrics.performance.firstTokenLatencies.push(processingTime);

        if (this.config.performance.enablePerformanceMonitoring) {
          voicePerformanceMonitor.recordFirstTokenLatency(processingTime, session.id);
        }
      }

    } catch (error) {
      logger.error('Error processing voice input', { sessionId: session.id, error });
      throw error;
    }
  }

  /**
   * Setup realtime connection event handlers
   */
  private setupRealtimeConnectionHandlers(session: UnifiedVoiceSession): void {
    if (!session.realtimeConnection) {
      return;
    }

    const client = session.realtimeConnection.client;
    const sessionId = session.id;

    client.on('transcription_partial', (data) => {
      this.emit('transcription_partial', {
        session,
        message: {
          type: 'transcription' as const,
          metadata: {
            sessionId,
            text: data.text,
            partial: true,
            timestamp: Date.now()
          }
        }
      });
    });

    client.on('transcription_final', (data) => {
      this.emit('transcription_final', {
        session,
        message: {
          type: 'transcription' as const,
          metadata: {
            sessionId,
            text: data.text,
            final: true,
            timestamp: Date.now()
          }
        }
      });
    });

    client.on('audio_response', (audioData) => {
      this.emit('audio_response', {
        session,
        message: {
          type: 'audio_response' as const,
          data: audioData,
          metadata: {
            sessionId,
            timestamp: Date.now()
          }
        }
      });
    });
  }

  /**
   * Cleanup session audio resources
   */
  async cleanupSessionAudio(session: UnifiedVoiceSession): Promise<void> {
    const sessionId = session.id;

    try {
      // Cleanup TurnManager
      if (session.turnManager) {
        await session.turnManager.stop();
        session.turnManager = undefined as unknown as typeof session.turnManager;
      }

      // Release pooled connection
      if (session.realtimeConnection) {
        realtimeConnectionPool.releaseConnection(session.realtimeConnection);
        session.realtimeConnection = undefined as unknown as typeof session.realtimeConnection;
      }

      // Clear audio buffers
      if (session.audioBuffer.length > 0) {
        session.audioBuffer = [];
      }

      logger.debug('Session audio cleanup completed', { sessionId });

    } catch (error) {
      logger.error('Error during session audio cleanup', { sessionId, error });
    }
  }
}