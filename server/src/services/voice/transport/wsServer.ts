/**
 * WebSocket Transport Server - Duplex transport for voice interactions
 * 
 * Handles:
 * - Binary audio upstream (Opus frames) 
 * - JSON/binary downstream (TTS audio chunks, partials, tool deltas)
 * - Health monitoring with ping/pong
 * - JWT tenant authentication
 * - Backpressure and flow control
 * 
 * Uses raw WebSocket (RFC 6455) not Socket.IO for optimal performance.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/utils.js';
import { config } from '../../../infrastructure/config';

const logger = createLogger({ service: 'voice-ws-transport' });

// Authentication interface
export interface WsAuth {
  tenantId: string;
  userId?: string;
  siteId: string;
  locale?: string;
}

// Voice session interface
export interface VoiceSession {
  id: string;
  ws: WebSocket;
  auth: WsAuth;
  lastActivity: Date;
  isActive: boolean;
  pingInterval?: NodeJS.Timeout;
  metrics: SessionMetrics;
}

// Session metrics
export interface SessionMetrics {
  messagesReceived: number;
  messagesSent: number;
  audioFramesReceived: number;
  audioFramesSent: number;
  bytesReceived: number;
  bytesSent: number;
  avgLatency: number;
  errors: number;
}

// Message types
export type VoiceMessage = 
  | { type: 'audio_frame'; data: ArrayBuffer; timestamp: number }
  | { type: 'text_input'; text: string; timestamp: number }
  | { type: 'control'; action: string; params?: any; timestamp: number }
  | { type: 'asr_partial'; text: string; confidence?: number; timestamp: number }
  | { type: 'asr_final'; text: string; language: string; timestamp: number }
  | { type: 'agent_delta'; data: any; timestamp: number }
  | { type: 'agent_final'; data: any; timestamp: number }
  | { type: 'tts_audio'; data: ArrayBuffer; timestamp: number }
  | { type: 'error'; code: string; message: string; timestamp: number };

/**
 * Voice WebSocket Transport Server
 */
export class VoiceWebSocketServer extends EventEmitter {
  private wss?: WebSocketServer;
  private sessions = new Map<string, VoiceSession>();
  private cleanupInterval?: NodeJS.Timeout;
  private pingInterval = 15000; // 15 seconds
  private pongTimeout = 10000; // 10 seconds
  private maxBackpressure = 1024 * 1024; // 1MB buffer limit
  
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    totalMessages: 0,
    totalAudioFrames: 0,
    totalBytes: 0,
    errors: 0,
  };

  /**
   * Get WebSocket server instance (for upgrade handling)
   */
  get server(): WebSocketServer | undefined {
    return this.wss;
  }

  /**
   * Start the WebSocket server
   */
  start(port: number = 8080): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port,
          perMessageDeflate: false, // Disable compression for low latency
          maxPayload: 4 * 1024, // 4KB max frame size
          verifyClient: this.verifyClient.bind(this),
        });

        this.wss.on('connection', this.handleConnection.bind(this));
        this.wss.on('error', (error) => {
          logger.error('WebSocket server error', { error });
          this.metrics.errors++;
        });

        // Start cleanup interval (every 2 minutes)
        this.cleanupInterval = setInterval(() => {
          this.cleanupInactiveSessions();
        }, 2 * 60 * 1000);

        logger.info('Voice WebSocket server started', { port });
        resolve();
      } catch (error) {
        logger.error('Failed to start WebSocket server', { error, port });
        reject(error);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      delete this.cleanupInterval;
    }

    // End all sessions gracefully
    for (const session of this.sessions.values()) {
      await this.endSession(session, 1001, 'Server shutting down');
    }

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => {
          logger.info('Voice WebSocket server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Verify client connection and authenticate
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    try {
      // Extract token from query parameters or headers
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token') || info.req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        logger.warn('Connection rejected: No token provided', { origin: info.origin });
        return false;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;
      if (!decoded.tenantId || !decoded.siteId) {
        logger.warn('Connection rejected: Invalid token claims', { 
          origin: info.origin,
          hastenantId: !!decoded.tenantId,
          hasSiteId: !!decoded.siteId
        });
        return false;
      }

      // Store auth info in request for later use
      (info.req as any).auth = {
        tenantId: decoded.tenantId,
        siteId: decoded.siteId,
        userId: decoded.userId,
        locale: decoded.locale || 'en-US',
      };

      return true;
    } catch (error) {
      logger.warn('Connection rejected: Token verification failed', { 
        error: error instanceof Error ? error.message : 'Unknown',
        origin: info.origin
      });
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;

    const auth = (req as any).auth as WsAuth;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    const session: VoiceSession = {
      id: sessionId,
      ws,
      auth,
      lastActivity: new Date(),
      isActive: true,
      metrics: {
        messagesReceived: 0,
        messagesSent: 0,
        audioFramesReceived: 0,
        audioFramesSent: 0,
        bytesReceived: 0,
        bytesSent: 0,
        avgLatency: 0,
        errors: 0,
      },
    };

    this.sessions.set(sessionId, session);

    logger.info('Voice session established', {
      sessionId,
      tenantId: auth.tenantId,
      siteId: auth.siteId,
      userId: auth.userId,
      userAgent: req.headers['user-agent'],
    });

    // Setup session handlers
    this.setupSessionHandlers(session);
    
    // Start ping interval
    this.startPingInterval(session);

    // Send ready message
    await this.sendMessage(session, {
      type: 'ready',
      data: {
        sessionId,
        supportedFormats: ['opus', 'pcm'],
        maxFrameSize: 4096,
        sampleRates: [48000, 44100, 16000],
        pingInterval: this.pingInterval,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Setup handlers for a voice session
   */
  private setupSessionHandlers(session: VoiceSession): void {
    const { ws } = session;

    // Handle incoming messages
    ws.on('message', (data, isBinary) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      this.handleMessage(session, buffer, isBinary);
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      this.handleDisconnection(session, code, reason.toString());
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { sessionId: session.id, error });
      session.metrics.errors++;
      this.metrics.errors++;
    });

    // Handle pong responses
    ws.on('pong', (data) => {
      this.handlePong(session, data);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(session: VoiceSession, data: Buffer, isBinary: boolean): void {
    try {
      session.lastActivity = new Date();
      session.metrics.messagesReceived++;
      session.metrics.bytesReceived += data.length;
      this.metrics.totalMessages++;
      this.metrics.totalBytes += data.length;

      if (isBinary) {
        // Handle binary audio data
        this.handleAudioFrame(session, data);
      } else {
        // Handle JSON messages
        const message = JSON.parse(data.toString('utf8'));
        this.handleTextMessage(session, message);
      }
    } catch (error) {
      logger.error('Error handling message', { 
        sessionId: session.id, 
        error,
        isBinary,
        dataSize: data.length 
      });
      
      session.metrics.errors++;
      this.sendError(session, 'MESSAGE_PARSE_ERROR', 'Failed to parse message');
    }
  }

  /**
   * Handle binary audio frame
   */
  private handleAudioFrame(session: VoiceSession, data: Buffer): void {
    session.metrics.audioFramesReceived++;
    this.metrics.totalAudioFrames++;

    // Validate frame size
    if (data.length > 4096) {
      logger.warn('Audio frame too large', {
        sessionId: session.id,
        size: data.length,
        maxSize: 4096,
      });
      return;
    }

    // Emit audio frame for processing
    this.emit('audio_frame', {
      sessionId: session.id,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      timestamp: Date.now(),
      tenantId: session.auth.tenantId,
      siteId: session.auth.siteId,
    });

    logger.debug('Audio frame received', {
      sessionId: session.id,
      size: data.length,
      totalFrames: session.metrics.audioFramesReceived,
    });
  }

  /**
   * Handle text/JSON message
   */
  private handleTextMessage(session: VoiceSession, message: any): void {
    const { type, ...data } = message;

    switch (type) {
      case 'text_input':
        this.emit('text_input', {
          sessionId: session.id,
          text: data.text,
          timestamp: data.timestamp || Date.now(),
          tenantId: session.auth.tenantId,
          siteId: session.auth.siteId,
        });
        break;

      case 'control':
        this.handleControlMessage(session, data);
        break;

      default:
        logger.warn('Unknown message type', { 
          sessionId: session.id, 
          type,
          keys: Object.keys(data)
        });
    }
  }

  /**
   * Handle control messages
   */
  private handleControlMessage(session: VoiceSession, data: any): void {
    const { action, params } = data;

    logger.debug('Control message received', {
      sessionId: session.id,
      action,
      params,
    });

    this.emit('control', {
      sessionId: session.id,
      action,
      params,
      tenantId: session.auth.tenantId,
      siteId: session.auth.siteId,
    });
  }

  /**
   * Send message to session
   */
  private async sendMessage(session: VoiceSession, message: any): Promise<void> {
    if (!session.isActive || session.ws.readyState !== WebSocket.OPEN) {
      logger.debug('Cannot send message: session inactive', { sessionId: session.id });
      return;
    }

    try {
      // Check backpressure
      if (session.ws.bufferedAmount > this.maxBackpressure) {
        logger.warn('Backpressure detected, dropping message', {
          sessionId: session.id,
          bufferedAmount: session.ws.bufferedAmount,
          maxBackpressure: this.maxBackpressure,
          messageType: message.type,
        });
        return;
      }

      const data = JSON.stringify(message);
      session.ws.send(data);
      
      session.metrics.messagesSent++;
      session.metrics.bytesSent += data.length;

      logger.debug('Message sent', {
        sessionId: session.id,
        type: message.type,
        size: data.length,
      });
    } catch (error) {
      logger.error('Failed to send message', { 
        sessionId: session.id, 
        error,
        messageType: message.type 
      });
      session.metrics.errors++;
    }
  }

  /**
   * Send binary audio data to session
   */
  async sendAudio(sessionId: string, audioData: ArrayBuffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive || session.ws.readyState !== WebSocket.OPEN) {
      logger.debug('Cannot send audio: session inactive', { sessionId });
      return;
    }

    try {
      // Check backpressure
      if (session.ws.bufferedAmount > this.maxBackpressure) {
        logger.warn('Backpressure detected, dropping audio frame', {
          sessionId,
          bufferedAmount: session.ws.bufferedAmount,
          audioSize: audioData.byteLength,
        });
        return;
      }

      session.ws.send(audioData);
      
      session.metrics.audioFramesSent++;
      session.metrics.bytesSent += audioData.byteLength;

      logger.debug('Audio frame sent', {
        sessionId,
        size: audioData.byteLength,
        totalFrames: session.metrics.audioFramesSent,
      });
    } catch (error) {
      logger.error('Failed to send audio', { 
        sessionId, 
        error,
        audioSize: audioData.byteLength 
      });
      session.metrics.errors++;
    }
  }

  /**
   * Send error message
   */
  private async sendError(session: VoiceSession, code: string, message: string): Promise<void> {
    await this.sendMessage(session, {
      type: 'error',
      code,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Start ping interval for session
   */
  private startPingInterval(session: VoiceSession): void {
    session.pingInterval = setInterval(() => {
      this.sendPing(session);
    }, this.pingInterval);
  }

  /**
   * Send ping to session
   */
  private sendPing(session: VoiceSession): void {
    if (!session.isActive || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const pingData = Buffer.from(JSON.stringify({
        timestamp: Date.now(),
        sessionId: session.id,
      }));

      session.ws.ping(pingData);
      
      // Set timeout for pong response
      const pongTimeout = setTimeout(() => {
        logger.warn('Pong timeout, closing session', { sessionId: session.id });
        this.endSession(session, 1002, 'Pong timeout');
      }, this.pongTimeout);

      (session as any).pongTimeout = pongTimeout;

    } catch (error) {
      logger.error('Failed to send ping', { 
        sessionId: session.id, 
        error 
      });
      this.endSession(session, 1011, 'Ping failed');
    }
  }

  /**
   * Handle pong response
   */
  private handlePong(session: VoiceSession, data: Buffer): void {
    try {
      const pongData = JSON.parse(data.toString());
      const latency = Date.now() - pongData.timestamp;
      
      // Update average latency
      session.metrics.avgLatency = session.metrics.avgLatency * 0.9 + latency * 0.1;
      
      // Clear pong timeout
      if ((session as any).pongTimeout) {
        clearTimeout((session as any).pongTimeout);
        (session as any).pongTimeout = undefined;
      }

      logger.debug('Pong received', { 
        sessionId: session.id, 
        latency,
        avgLatency: session.metrics.avgLatency.toFixed(1)
      });
    } catch (error) {
      logger.warn('Invalid pong data', { sessionId: session.id, error });
    }
  }

  /**
   * Handle session disconnection
   */
  private handleDisconnection(session: VoiceSession, code: number, reason: string): void {
    logger.info('Voice session disconnected', {
      sessionId: session.id,
      tenantId: session.auth.tenantId,
      code,
      reason,
      metrics: session.metrics,
    });

    this.cleanupSession(session);
  }

  /**
   * End session gracefully
   */
  private async endSession(session: VoiceSession, code: number, reason: string): Promise<void> {
    if (!session.isActive) {return;}

    try {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.close(code, reason);
      }
    } catch (error) {
      logger.error('Error closing WebSocket', { sessionId: session.id, error });
    }

    this.cleanupSession(session);
  }

  /**
   * Cleanup session resources
   */
  private cleanupSession(session: VoiceSession): void {
    session.isActive = false;

    if (session.pingInterval) {
      clearInterval(session.pingInterval);
    }

    if ((session as any).pongTimeout) {
      clearTimeout((session as any).pongTimeout);
    }

    this.sessions.delete(session.id);
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
  }

  /**
   * Cleanup inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    let cleanedCount = 0;

    for (const session of this.sessions.values()) {
      if (session.lastActivity < cutoffTime || !session.isActive) {
        this.endSession(session, 1000, 'Session timeout');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive sessions', {
        cleanedCount,
        remainingSessions: this.sessions.size,
      });
    }
  }

  /**
   * Get server metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.sessions.size,
      sessionMetrics: Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        tenantId: s.auth.tenantId,
        lastActivity: s.lastActivity,
        metrics: s.metrics,
      })),
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Broadcast message to all sessions of a tenant
   */
  async broadcastToTenant(tenantId: string, message: any): Promise<void> {
    const tenantSessions = Array.from(this.sessions.values())
      .filter(s => s.auth.tenantId === tenantId && s.isActive);

    await Promise.all(
      tenantSessions.map(session => this.sendMessage(session, message))
    );

    logger.debug('Message broadcasted to tenant', { 
      tenantId, 
      sessionCount: tenantSessions.length,
      messageType: message.type 
    });
  }
}

// Export utilities
export function attachVoiceWsServer(httpServer: any): VoiceWebSocketServer {
  const wsServer = new VoiceWebSocketServer();
  
  // Start WebSocket server on the HTTP server
  httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    if (request.url?.startsWith('/voice-ws')) {
      // Handle WebSocket upgrade for voice endpoints
      wsServer.server?.handleUpgrade(request, socket, head, (ws) => {
        wsServer.server?.emit('connection', ws, request);
      });
    }
  });

  return wsServer;
}

// Export singleton instance for convenience
export const voiceWebSocketServer = new VoiceWebSocketServer();