import { Server as SocketIOServer, Socket } from 'socket.io';
import { createLogger } from '../../../../shared/utils.js';
import { jwtService, type VoiceJWTPayload } from '../../../../infrastructure/auth/jwt.js';
import type { UniversalAIAssistantService } from '../../../ai/application/UniversalAIAssistantService.js';

const logger = createLogger({ service: 'voice-websocket' });

export interface WsAuth {
  tenantId: string;
  userId?: string;
  siteId: string;
  locale?: string;
}

export interface VoiceSession {
  id: string;
  socket: Socket;
  auth: WsAuth;
  lastActivity: Date;
  isActive: boolean;
  pingInterval?: NodeJS.Timeout;
}

export type TurnEvent =
  | { type: 'ready' | 'mic_opened' | 'mic_closed' | 'tts_play' | 'speech_started' | 'speech_stopped'; data?: Record<string, unknown> }
  | { type: 'vad'; active: boolean; level: number }
  | { type: 'partial_asr'; text: string; confidence?: number }
  | { type: 'final_asr'; text: string; lang: string }
  | { type: 'barge_in' }
  | { type: 'agent_delta' | 'agent_tool' | 'agent_final'; data: Record<string, unknown> }
  | { type: 'error'; code: string; message: string };

export interface AudioFrame {
  data: ArrayBuffer;
  format: 'opus' | 'pcm';
  sampleRate: number;
  frameMs: number;
}

export interface VoiceMessage {
  type: 'audio_chunk' | 'text_input' | 'control';
  data?: Record<string, unknown>;
  audio?: AudioFrame;
  sessionId: string;
  timestamp: number;
}

/**
 * Voice WebSocket handler for real-time duplex voice communication
 * 
 * Handles:
 * - Binary audio upstream (Opus frames)
 * - JSON/binary downstream (TTS audio, partials, tool deltas)
 * - Health monitoring with ping/pong
 * - JWT tenant authentication
 * - Backpressure and flow control
 */
export class VoiceWebSocketHandler {
  private io: SocketIOServer;
  private sessions: Map<string, VoiceSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private metrics = {
    connectionsTotal: 0,
    activeConnections: 0,
    messagesReceived: 0,
    messagesSent: 0,
    audioFramesProcessed: 0,
    errors: 0,
  };

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupConnectionHandling();
    
    // Cleanup inactive sessions every 2 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 2 * 60 * 1000);

    logger.info('Voice WebSocket Handler initialized', { developmentAuth: process.env['NODE_ENV'] === 'development' });
  }

  /**
   * Set the AI Assistant service for voice-to-AI integration
   * Note: Now using VoiceOrchestrator for AI integration
   */
  setAIAssistant(_aiAssistant: UniversalAIAssistantService): void {
    // AI Assistant integration now handled through VoiceOrchestrator
    logger.info('AI Assistant service integration handled through VoiceOrchestrator');
  }

  /**
   * Setup connection handling and authentication
   */
  private setupConnectionHandling(): void {
    this.io.on('connection', async (socket: Socket) => {
      this.metrics.connectionsTotal++;
      
      logger.info('WebSocket connection attempt', {
        socketId: socket.id,
        userAgent: socket.handshake.headers['user-agent'],
        origin: socket.handshake.headers.origin,
      });

      try {
        // Authenticate the connection
        const auth = await this.authenticateConnection(socket);
        
        // Create voice session
        const session: VoiceSession = {
          id: socket.id,
          socket,
          auth,
          lastActivity: new Date(),
          isActive: true,
        };

        this.sessions.set(socket.id, session);
        this.metrics.activeConnections++;

        // Setup session-specific handlers
        this.setupSessionHandlers(session);
        
        // Start ping interval
        session.pingInterval = setInterval(() => {
          this.sendPing(session);
        }, 15000); // Ping every 15 seconds

        // Send ready event
        this.sendEvent(session, {
          type: 'ready',
          data: {
            sessionId: session.id,
            supportedFormats: ['opus', 'pcm'],
            maxFrameSize: 4096,
            sampleRates: [48000, 44100, 16000],
          },
        });

        logger.info('Voice session established', {
          sessionId: session.id,
          tenantId: auth.tenantId,
          siteId: auth.siteId,
          userId: auth.userId,
        });

      } catch (error) {
        logger.error('Connection authentication failed', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        socket.emit('error', {
          type: 'error',
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        });
        
        socket.disconnect(true);
        this.metrics.errors++;
      }
    });
  }

  /**
   * Authenticate WebSocket connection using JWT (optional in development)
   */
  private async authenticateConnection(socket: Socket): Promise<WsAuth> {
    const token = socket.handshake.auth['token'] || socket.handshake.auth['accessToken'] || socket.handshake.query['token'];
    const sessionId = socket.handshake.auth['sessionId'] || socket.handshake.query['sessionId'];
    
    // For development: Allow connections without authentication
    if (process.env['NODE_ENV'] === 'development' && !token) {
      logger.info('WebSocket connection authenticated (development mode)', {
        socketId: socket.id,
        sessionId: sessionId || 'none'
      });
      
      return {
        tenantId: '00000000-0000-0000-0000-000000000000',
        siteId: '00000000-0000-0000-0000-000000000000',
        userId: `dev-ws-user-${Date.now()}`,
        locale: 'en-US',
      };
    }
    
    if (!token) {
      throw new Error('No authentication token provided');
    }

    try {
      const decoded: VoiceJWTPayload = jwtService.verifyVoiceToken(token as string);
      
      if (!decoded.tenantId || !decoded.siteId) {
        throw new Error('Invalid token: missing required claims');
      }

      const wsAuth: WsAuth = {
        tenantId: decoded.tenantId,
        siteId: decoded.siteId,
        locale: decoded.locale || 'en-US',
      };

      if (decoded.userId) {
        wsAuth.userId = decoded.userId;
      }

      return wsAuth;
    } catch (error) {
      throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * Setup handlers for a voice session
   */
  private setupSessionHandlers(session: VoiceSession): void {
    const { socket } = session;

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(session, reason);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', {
        sessionId: session.id,
        error,
      });
      this.metrics.errors++;
    });

    // Handle pong responses
    socket.on('pong', (_data) => {
      session.lastActivity = new Date();
      logger.debug('Received pong', { sessionId: session.id });
    });

    // Handle audio frames
    socket.on('audio_frame', (data: ArrayBuffer) => {
      this.handleAudioFrame(session, data);
    });

    // Handle text input
    socket.on('text_input', (data: { text: string; language?: string }) => {
      this.handleTextInput(session, data);
    });

    // Handle control messages
    socket.on('control', (data: { action: string; params?: Record<string, unknown> }) => {
      this.handleControlMessage(session, data);
    });

    // Handle voice commands
    socket.on('voice_command', (data: { command: string; params?: Record<string, unknown> }) => {
      this.handleVoiceCommand(session, data);
    });
  }

  /**
   * Handle incoming audio frames
   */
  private async handleAudioFrame(session: VoiceSession, audioData: ArrayBuffer): Promise<void> {
    try {
      session.lastActivity = new Date();
      this.metrics.audioFramesProcessed++;

      // Validate audio frame size
      if (audioData.byteLength > 4096) {
        logger.warn('Audio frame too large', {
          sessionId: session.id,
          size: audioData.byteLength,
        });
        return;
      }

      const audioFrame: AudioFrame = {
        data: audioData,
        format: 'opus', // Assume Opus by default
        sampleRate: 48000,
        frameMs: 20,
      };

      // Process audio frame (would integrate with STT service)
      await this.processAudioFrame(session, audioFrame);

    } catch (error) {
      logger.error('Audio frame processing failed', {
        sessionId: session.id,
        error,
      });
      
      this.sendEvent(session, {
        type: 'error',
        code: 'AUDIO_PROCESSING_FAILED',
        message: 'Failed to process audio frame',
      });
    }
  }

  /**
   * Process audio frame through voice orchestrator
   */
  private async processAudioFrame(session: VoiceSession, frame: AudioFrame): Promise<void> {
    logger.debug('Processing audio frame', {
      sessionId: session.id,
      size: frame.data.byteLength,
      format: frame.format,
    });

    try {
      // Import VoiceOrchestrator dynamically to avoid circular dependency
      const { voiceOrchestrator } = await import('../../../../services/voice/VoiceOrchestrator.js');
      
      // Process through voice orchestrator
      await voiceOrchestrator.processVoiceInput(session.id, frame.data);
      
    } catch (error) {
      logger.error('Audio frame processing failed through orchestrator', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Send error event
      this.sendEvent(session, {
        type: 'error',
        code: 'AUDIO_PROCESSING_FAILED',
        message: 'Failed to process audio frame',
      });
    }
  }

  /**
   * Handle text input
   */
  private async handleTextInput(session: VoiceSession, data: { text: string; language?: string }): Promise<void> {
    try {
      session.lastActivity = new Date();
      this.metrics.messagesReceived++;

      logger.info('Received text input', {
        sessionId: session.id,
        textLength: data.text.length,
        language: data.language,
      });

      // Send as final ASR result
      this.sendEvent(session, {
        type: 'final_asr',
        text: data.text,
        lang: data.language || session.auth.locale || 'en-US',
      });

      // Process through voice orchestrator
      try {
        const { voiceOrchestrator } = await import('../../../../services/voice/VoiceOrchestrator.js');
        await voiceOrchestrator.processTextInput(session.id, data.text);
      } catch (error) {
        logger.error('Text input processing failed through orchestrator', {
          sessionId: session.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

    } catch (error) {
      logger.error('Text input processing failed', {
        sessionId: session.id,
        error,
      });
    }
  }

  /**
   * Handle control messages
   */
  private handleControlMessage(session: VoiceSession, data: { action: string; params?: Record<string, unknown> }): void {
    session.lastActivity = new Date();

    logger.info('Received control message', {
      sessionId: session.id,
      action: data.action,
      params: data.params,
    });

    switch (data.action) {
      case 'start_recording':
        this.sendEvent(session, { type: 'mic_opened' });
        break;
      
      case 'stop_recording':
        this.sendEvent(session, { type: 'mic_closed' });
        break;
      
      case 'interrupt_tts':
        this.sendEvent(session, { type: 'barge_in' });
        break;
      
      default:
        logger.warn('Unknown control action', {
          sessionId: session.id,
          action: data.action,
        });
    }
  }

  /**
   * Handle voice commands
   */
  private async handleVoiceCommand(session: VoiceSession, data: { command: string; params?: Record<string, unknown> }): Promise<void> {
    session.lastActivity = new Date();

    logger.info('Received voice command', {
      sessionId: session.id,
      command: data.command,
    });

    // Process voice command through voice orchestrator
    try {
      const { voiceOrchestrator } = await import('../../../../services/voice/VoiceOrchestrator.js');
      await voiceOrchestrator.processTextInput(session.id, data.command);
    } catch (error) {
      logger.error('Voice command processing failed through orchestrator', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Note: User input processing is now handled by VoiceOrchestrator

  /**
   * Send event to client
   */
  private sendEvent(session: VoiceSession, event: TurnEvent): void {
    if (!session.isActive) {return;}

    try {
      session.socket.emit('voice_event', event);
      this.metrics.messagesSent++;
      
      logger.debug('Sent voice event', {
        sessionId: session.id,
        eventType: event.type,
      });
    } catch (error) {
      logger.error('Failed to send event', {
        sessionId: session.id,
        eventType: event.type,
        error,
      });
    }
  }

  /**
   * Send audio chunk to client
   */
  public sendAudio(sessionId: string, audioData: ArrayBuffer, format: 'opus' | 'pcm' = 'opus'): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn('Attempted to send audio to inactive session', { sessionId });
      return;
    }

    try {
      session.socket.emit('audio_chunk', {
        data: audioData,
        format,
        timestamp: Date.now(),
      });
      
      this.metrics.messagesSent++;
    } catch (error) {
      logger.error('Failed to send audio chunk', {
        sessionId,
        size: audioData.byteLength,
        error,
      });
    }
  }

  /**
   * Send voice event to client
   */
  public sendVoiceEvent(sessionId: string, event: TurnEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn('Attempted to send event to inactive session', { sessionId });
      return;
    }

    try {
      session.socket.emit('voice_event', event);
      this.metrics.messagesSent++;
    } catch (error) {
      logger.error('Failed to send voice event', {
        sessionId,
        eventType: event.type,
        error,
      });
    }
  }

  /**
   * Send ping to maintain connection
   */
  private sendPing(session: VoiceSession): void {
    if (!session.isActive) {return;}

    try {
      const pingData = {
        timestamp: Date.now(),
        sessionId: session.id,
      };

      session.socket.emit('ping', pingData);
      
      logger.debug('Sent ping', { sessionId: session.id });
    } catch (error) {
      logger.error('Failed to send ping', {
        sessionId: session.id,
        error,
      });
      
      this.handleDisconnection(session, 'ping_failed');
    }
  }

  /**
   * Handle session disconnection
   */
  private handleDisconnection(session: VoiceSession, reason: string): void {
    logger.info('Voice session disconnected', {
      sessionId: session.id,
      tenantId: session.auth.tenantId,
      reason,
    });

    // Clean up session
    session.isActive = false;
    
    if (session.pingInterval) {
      clearInterval(session.pingInterval);
    }
    
    this.sessions.delete(session.id);
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    let cleanedCount = 0;

    for (const [_sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime || !session.isActive) {
        this.handleDisconnection(session, 'inactive');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive voice sessions', {
        cleanedCount,
        remainingSessions: this.sessions.size,
      });
    }
  }

  /**
   * End all sessions gracefully
   */
  public async endAllSessions(): Promise<void> {
    logger.info('Ending all voice sessions', {
      sessionCount: this.sessions.size,
    });

    for (const session of this.sessions.values()) {
      try {
        this.sendEvent(session, {
          type: 'error',
          code: 'SERVER_SHUTDOWN',
          message: 'Server is shutting down',
        });
        
        session.socket.disconnect(true);
      } catch (error) {
        logger.error('Error ending session', {
          sessionId: session.id,
          error,
        });
      }
    }

    this.sessions.clear();
    this.metrics.activeConnections = 0;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get active session count
   */
  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Notify that an action has been executed (required by VoiceNotificationHandler interface)
   */
  public async notifyActionExecuted(data: {
    siteId: string;
    sessionId?: string;
    action: string;
    result: Record<string, unknown>;
    sideEffects: Array<{
      type: 'navigation' | 'form_submission' | 'api_call' | 'dom_change';
      description: string;
      data: Record<string, unknown>;
    }>;
  }): Promise<void> {
    logger.info('Broadcasting action execution notification', { 
      action: data.action,
      siteId: data.siteId,
      sessionId: data.sessionId,
      sideEffectsCount: data.sideEffects.length
    });
    
    // Broadcast to relevant sessions - either specific session or all sessions for the site
    let notifiedSessions = 0;
    
    for (const session of this.sessions.values()) {
      if (!session.isActive) {continue;}
      
      // Notify specific session if provided, or all sessions for the same site
      const shouldNotify = data.sessionId 
        ? session.id === data.sessionId
        : session.auth.siteId === data.siteId;
      
      if (shouldNotify) {
        try {
          this.sendEvent(session, {
            type: 'agent_tool',
            data: { 
              type: 'action_executed',
              action: data.action,
              result: data.result,
              sideEffects: data.sideEffects,
              timestamp: new Date().toISOString()
            }
          });
          notifiedSessions++;
        } catch (error) {
          logger.error('Failed to notify session about action execution', {
            sessionId: session.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
    
    logger.debug('Action execution notification completed', {
      action: data.action,
      notifiedSessions,
      totalActiveSessions: this.metrics.activeConnections
    });
  }

  /**
   * Broadcast an event to all active sessions (required by VoiceNotificationHandler interface)
   */
  public async broadcast(event: string, data: unknown): Promise<void> {
    logger.info('Broadcasting event to all sessions', { event, sessionCount: this.sessions.size });
    
    for (const session of this.sessions.values()) {
      if (session.isActive) {
        this.sendEvent(session, {
          type: 'agent_delta',
          data: { event, payload: data }
        });
      }
    }
  }
}