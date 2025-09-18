/**
 * Voice Event Handler - Handles TurnManager events and control messages
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Manages event processing, control messages, and WebSocket message handling
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { createLogger } from '../../shared/utils.js';
import { voicePerformanceMonitor } from './VoicePerformanceMonitor.js';
import type {
  UnifiedVoiceSession,
  VoiceStreamMessage,
  TurnManagerEvent,
  UnifiedOrchestratorConfig
} from './types/VoiceTypes.js';

const logger = createLogger({ service: 'voice-event-handler' });

export class VoiceEventHandler extends EventEmitter {
  private config: UnifiedOrchestratorConfig;

  constructor(config: UnifiedOrchestratorConfig) {
    super();
    this.config = config;
  }

  /**
   * Setup Raw WebSocket handlers for a session
   */
  setupRawWebSocketHandlers(ws: WebSocket, session: UnifiedVoiceSession): void {
    const sessionId = session.id;
    logger.debug('Setting up Raw WebSocket handlers', { sessionId });

    const startTime = performance.now();

    // Handle incoming binary audio data
    ws.on('message', async (data: Buffer | ArrayBuffer, isBinary: boolean) => {
      try {
        session.lastActivity = new Date();
        session.connectionMetrics.totalMessages++;
        session.connectionMetrics.lastActivityAt = new Date();

        if (isBinary && data instanceof Buffer) {
          // Handle binary audio data
          const audioStartTime = performance.now();
          const audioBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

          this.emit('audio_data', { session, audioData: audioBuffer });

          // Track audio processing latency
          const audioLatency = performance.now() - audioStartTime;
          session.metrics.performance.audioProcessingLatencies.push(audioLatency);

          if (this.config.performance.enablePerformanceMonitoring) {
            voicePerformanceMonitor.recordAudioProcessingLatency(audioLatency, 'raw_websocket');
          }

          // Update metrics
          session.connectionMetrics.avgMessageSize =
            (session.connectionMetrics.avgMessageSize * (session.connectionMetrics.totalMessages - 1) + data.length) /
            session.connectionMetrics.totalMessages;

        } else if (!isBinary && typeof data === 'object') {
          // Handle JSON control messages
          try {
            const message = JSON.parse(data.toString()) as VoiceStreamMessage;
            await this.handleControlMessage(session, message);
          } catch (parseError) {
            logger.warn('Failed to parse JSON message', { sessionId, error: parseError });
          }
        }
      } catch (error) {
        logger.error('Error handling WebSocket message', { sessionId, error });
        this.handleWebSocketError(session, error, 'MESSAGE_HANDLING_ERROR');
      }
    });

    // Handle WebSocket pong (keepalive response)
    ws.on('pong', (data: Buffer) => {
      this.handlePong(session, data);
    });

    // Handle WebSocket close
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleWebSocketClose(session, code, reason);
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      this.handleWebSocketError(session, error, 'WEBSOCKET_ERROR');
    });

    const setupLatency = performance.now() - startTime;
    logger.info('Raw WebSocket handlers setup completed', { sessionId, setupLatency });
  }

  /**
   * Handle control messages from WebSocket
   */
  async handleControlMessage(session: UnifiedVoiceSession, message: VoiceStreamMessage): Promise<void> {
    const sessionId = session.id;

    try {
      logger.debug('Handling control message', { sessionId, type: message.type });

      switch (message.type) {
        case 'voice_start':
          session.status = 'listening';
          session.isStreaming = true;
          this.emit('voice_start', { session });
          break;

        case 'voice_end':
          session.status = 'processing';
          session.isStreaming = false;
          this.emit('voice_end', { session });
          break;

        case 'barge_in':
          logger.info('Processing barge-in request', { sessionId });
          this.emit('barge_in', { session });
          break;

        case 'vad': {
          const vadActive = message.metadata?.vadActive || false;
          const vadLevel = message.metadata?.level || 0;

          this.emit('vad_update', {
            session,
            message: {
              type: 'vad' as const,
              metadata: {
                sessionId,
                active: vadActive,
                level: vadLevel,
                timestamp: Date.now()
              }
            }
          });
          break;
        }

        default:
          logger.warn('Unknown control message type', { sessionId, type: message.type });
      }

    } catch (error) {
      logger.error('Error handling control message', { sessionId, error });
      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'CONTROL_MESSAGE_ERROR'
      });
    }
  }

  /**
   * Handle TurnManager events with performance tracking
   */
  handleTurnManagerEvent(session: UnifiedVoiceSession, event: TurnManagerEvent): void {
    const sessionId = session.id;

    try {
      switch (event.type) {
        case 'partial_asr': {
          const partialLatency = performance.now() - (session.firstTokenTime || Date.now());
          session.metrics.performance.partialLatencies.push(partialLatency);

          this.emit('transcription_partial', {
            session,
            message: {
              type: 'transcription' as const,
              metadata: {
                sessionId,
                text: event.text,
                partial: true,
                confidence: event.confidence,
                latency: partialLatency,
                timestamp: Date.now()
              }
            }
          });

          // Track performance for monitoring
          if (this.config.performance.enablePerformanceMonitoring) {
            voicePerformanceMonitor.recordFirstTokenLatency(partialLatency, sessionId);
          }
          break;
        }

        case 'final_asr':
          session.metrics.totalTurns++;

          this.emit('transcription_final', {
            session,
            message: {
              type: 'transcription' as const,
              metadata: {
                sessionId,
                text: event.text,
                final: true,
                language: event.lang,
                timestamp: Date.now()
              }
            }
          });
          break;

        case 'barge_in': {
          const bargeInLatency = performance.now() - (session.lastActivity?.getTime() || Date.now());
          session.metrics.performance.bargeInLatencies.push(bargeInLatency);

          this.emit('barge_in_detected', {
            session,
            message: {
              type: 'barge_in' as const,
              metadata: {
                sessionId,
                latency: bargeInLatency,
                timestamp: Date.now()
              }
            }
          });
          break;
        }

        case 'error':
          session.metrics.errors.push({
            timestamp: new Date(),
            error: event.message || 'TurnManager error',
            code: event.code || 'TURN_MANAGER_ERROR'
          });
          this.emit('turn_manager_error', { session, event });
          break;
      }

    } catch (error) {
      logger.error('Error handling TurnManager event', { sessionId, error });
    }
  }

  /**
   * Start heartbeat for a session
   */
  startHeartbeat(session: UnifiedVoiceSession): void {
    const sessionId = session.id;
    logger.debug('Starting heartbeat for session', { sessionId });

    // Clear any existing interval
    if (session.pingInterval) {
      clearInterval(session.pingInterval);
    }

    // Start ping interval for connection keepalive
    session.pingInterval = setInterval(() => {
      if (!session.isActive || session.status === 'ended') {
        if (session.pingInterval) {
          clearInterval(session.pingInterval);
          session.pingInterval = undefined as unknown as typeof session.pingInterval;
        }
        return;
      }

      try {
        session.lastPingTime = Date.now();

        if (session.rawWebSocketConnection) {
          const pingData = Buffer.from(JSON.stringify({
            type: 'ping',
            timestamp: session.lastPingTime,
            sessionId
          }));

          session.rawWebSocketConnection.ping(pingData);
          logger.debug('Sent WebSocket ping', { sessionId });
        }

        if (session.socketIOConnection) {
          session.socketIOConnection.emit('ping', {
            timestamp: session.lastPingTime,
            sessionId
          });
          logger.debug('Sent Socket.IO ping', { sessionId });
        }

        // Check for missed pongs
        session.missedPongs++;
        if (session.missedPongs > 3) {
          logger.warn('Multiple missed pongs, closing session', {
            sessionId,
            missedPongs: session.missedPongs
          });

          this.emit('session_timeout', { sessionId, reason: 'multiple_missed_pongs' });
        }

      } catch (error) {
        logger.error('Error sending ping', { sessionId, error });
        session.metrics.errors.push({
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'PING_ERROR'
        });
      }
    }, this.config.heartbeatInterval);

    logger.info('Heartbeat started', {
      sessionId,
      interval: this.config.heartbeatInterval
    });
  }

  /**
   * Handle WebSocket pong response
   */
  private handlePong(session: UnifiedVoiceSession, _data: Buffer): void {
    const pongTime = Date.now();
    const latency = pongTime - session.lastPingTime;
    session.heartbeatLatencies.push(latency);
    session.connectionMetrics.connectionLatency = latency;
    session.isAlive = true;
    session.missedPongs = 0;

    logger.debug('Received pong', { sessionId: session.id, latency });

    // Track connection performance
    if (this.config.performance.enablePerformanceMonitoring) {
      voicePerformanceMonitor.recordConnectionLatency(latency, session.metrics.optimizations.connectionReused);
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleWebSocketClose(session: UnifiedVoiceSession, code: number, reason: Buffer): void {
    logger.info('Raw WebSocket connection closed', {
      sessionId: session.id,
      code,
      reason: reason.toString(),
      duration: Date.now() - session.createdAt.getTime()
    });

    session.status = 'ended';
    session.isActive = false;

    this.emit('websocket_closed', { session, code, reason: reason.toString() });
  }

  /**
   * Handle WebSocket errors
   */
  private handleWebSocketError(session: UnifiedVoiceSession, error: Error | unknown, code: string): void {
    logger.error('WebSocket error', { sessionId: session.id, error });

    session.metrics.errors.push({
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
      code,
      context: { errorType: error instanceof Error ? error.name : 'unknown' }
    });

    this.emit('websocket_error', { session, error, code });
  }

  /**
   * Emit event to a specific session
   */
  emitToSession(sessionId: string, event: {
    type: 'agent_final' | 'error' | 'ready';
    code?: string;
    message?: string;
    data?: unknown;
  }): void {
    this.emit('session_event', { sessionId, event });
    logger.debug('Event emitted to session', { sessionId, eventType: event.type });
  }
}