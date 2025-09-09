/**
 * WebSocket Coordinator - Unified WebSocket architecture for voice services
 * 
 * Implements best practices for real-time audio streaming:
 * - Raw WebSocket (RFC 6455) for audio streams (lower overhead, better latency)
 * - Socket.IO for general messaging, fallbacks, and client compatibility
 * - Authentication on HTTP upgrade before WebSocket handshake
 * - Heartbeat/ping-pong for connection health monitoring
 * - Proper error handling and cleanup
 * 
 * Based on WebSocket architecture research from ws library and Node.js best practices.
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server } from 'http';
import { createLogger } from '../../shared/utils.js';
import { VoiceWebSocketHandler } from '../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.js';
import { RawWebSocketServer } from '../../modules/voice/infrastructure/websocket/RawWebSocketServer.js';
import { voiceOrchestrator } from './VoiceOrchestrator.js';
import { jwtService } from '../../infrastructure/auth/jwt.js';
import type { UniversalAIAssistantService } from '../../modules/ai/application/UniversalAIAssistantService.js';

const logger = createLogger({ service: 'websocket-coordinator' });

export interface WebSocketCoordinatorConfig {
  httpServer: Server;
  aiService: UniversalAIAssistantService;
  enableRawWebSocket: boolean;
  enableSocketIO: boolean;
  heartbeatInterval: number;
  maxConnections: number;
  paths: {
    rawWebSocket: string;
    socketIO: string;
  };
}

export interface UnifiedSession {
  id: string;
  tenantId: string;
  siteId?: string;
  userId?: string;
  
  // Connection types
  rawWebSocket?: WebSocket;
  socketIOConnection?: Socket;
  
  // Session state
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
  
  // Heartbeat monitoring
  pingInterval?: NodeJS.Timeout;
  isAlive: boolean;
}

/**
 * WebSocket Coordinator - Manages both Raw WebSocket and Socket.IO connections
 * 
 * Architecture:
 * - Raw WebSocket: /voice-ws (binary audio streams)
 * - Socket.IO: /socket.io (JSON messages, fallbacks)
 * - Unified session management across both transports
 * - Voice orchestrator integration for audio processing
 */
export class WebSocketCoordinator extends EventEmitter {
  private config: WebSocketCoordinatorConfig;
  private rawWebSocketServer?: WebSocketServer;
  private socketIOServer?: SocketIOServer;
  private rawWebSocketHandler?: RawWebSocketServer;
  private socketIOHandler?: VoiceWebSocketHandler;
  private sessions = new Map<string, UnifiedSession>();
  private isActive = false;

  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    rawWebSocketConnections: 0,
    socketIOConnections: 0,
    messagesProcessed: 0,
    audioFramesProcessed: 0,
    errors: 0,
  };

  constructor(config: WebSocketCoordinatorConfig) {
    super();
    this.config = config;
    
    logger.info('WebSocket Coordinator initialized', {
      enableRawWebSocket: config.enableRawWebSocket,
      enableSocketIO: config.enableSocketIO,
      paths: config.paths,
    });
  }

  /**
   * Start the WebSocket coordinator
   */
  async start(): Promise<void> {
    if (this.isActive) {
      logger.warn('WebSocket Coordinator already active');
      return;
    }

    try {
      // Initialize Raw WebSocket server for audio streams
      if (this.config.enableRawWebSocket) {
        await this.initializeRawWebSocket();
      }

      // Initialize Socket.IO server for general messaging
      if (this.config.enableSocketIO) {
        await this.initializeSocketIO();
      }

      // Integrate with voice orchestrator
      this.integrateWithVoiceOrchestrator();

      this.isActive = true;
      this.emit('started');

      logger.info('WebSocket Coordinator started successfully', {
        rawWebSocket: !!this.rawWebSocketServer,
        socketIO: !!this.socketIOServer,
      });
    } catch (error) {
      logger.error('Failed to start WebSocket Coordinator', { error });
      throw error;
    }
  }

  /**
   * Stop the WebSocket coordinator
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      // Close all sessions
      const activeSessions = Array.from(this.sessions.values());
      await Promise.all(
        activeSessions.map(session => this.closeSession(session.id))
      );

      // Stop Raw WebSocket server
      if (this.rawWebSocketServer) {
        this.rawWebSocketServer.close();
      }
      if (this.rawWebSocketHandler) {
        await this.rawWebSocketHandler.shutdown();
      }

      // Stop Socket.IO server
      if (this.socketIOServer) {
        this.socketIOServer.close();
      }
      if (this.socketIOHandler) {
        await this.socketIOHandler.endAllSessions();
      }

      this.isActive = false;
      this.emit('stopped');

      logger.info('WebSocket Coordinator stopped', {
        sessionsClosed: activeSessions.length,
      });
    } catch (error) {
      logger.error('Error stopping WebSocket Coordinator', { error });
      throw error;
    }
  }

  /**
   * Initialize Raw WebSocket server for audio streams
   */
  private async initializeRawWebSocket(): Promise<void> {
    // Create Raw WebSocket server with no server (manual upgrade handling)
    this.rawWebSocketServer = new WebSocketServer({ 
      noServer: true,
      perMessageDeflate: {
        // Optimize for audio streaming
        threshold: 1024,
        concurrencyLimit: 10,
        zlibDeflateOptions: {
          level: 1, // Fast compression for real-time audio
          memLevel: 8,
        },
      },
    });

    // Setup connection handling with heartbeat
    this.rawWebSocketServer.on('connection', (ws: WebSocket, request) => {
      this.handleRawWebSocketConnection(ws, request);
    });

    // Handle HTTP upgrade for Raw WebSocket with authentication
    this.config.httpServer.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url || '', 'wss://base.url');
      
      if (pathname === this.config.paths.rawWebSocket) {
        this.authenticateRawWebSocket(request, socket, head);
      }
    });

    // Initialize Raw WebSocket handler
    this.rawWebSocketHandler = new RawWebSocketServer(this.config.aiService);
    await this.rawWebSocketHandler.attachToServer(this.config.httpServer, this.config.paths.rawWebSocket);

    logger.info('Raw WebSocket server initialized', {
      path: this.config.paths.rawWebSocket,
    });
  }

  /**
   * Initialize Socket.IO server for general messaging
   */
  private async initializeSocketIO(): Promise<void> {
    this.socketIOServer = new SocketIOServer(this.config.httpServer, {
      path: this.config.paths.socketIO,
      transports: ['websocket', 'polling'], // WebSocket preferred, polling fallback
      cors: {
        origin: process.env['NODE_ENV'] === 'development' 
          ? ['http://localhost:3000', 'http://localhost:5000']
          : false,
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Initialize Socket.IO handler
    this.socketIOHandler = new VoiceWebSocketHandler(this.socketIOServer);
    
    logger.info('Socket.IO server initialized', {
      path: this.config.paths.socketIO,
    });
  }

  /**
   * Authenticate Raw WebSocket connection on HTTP upgrade
   */
  private authenticateRawWebSocket(request: any, socket: any, head: Buffer): void {
    // Handle socket errors during authentication
    const onSocketError = (err: Error) => {
      logger.error('Raw WebSocket authentication socket error', { err });
      socket.destroy();
    };
    socket.on('error', onSocketError);

    // Extract authentication from query params or headers
    const url = new URL(request.url || '', 'wss://base.url');
    const token = url.searchParams.get('token') || request.headers.authorization?.split(' ')[1];

    // Authenticate using custom logic
    this.authenticateConnection(token, (err: Error | null, authData: any) => {
      if (err || !authData) {
        logger.warn('Raw WebSocket authentication failed', { 
          error: err?.message,
          url: request.url,
          origin: request.headers.origin,
        });
        
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Remove error handler before upgrade
      socket.removeListener('error', onSocketError);

      // Upgrade to WebSocket
      this.rawWebSocketServer!.handleUpgrade(request, socket, head, (ws) => {
        // Store auth data on the WebSocket
        (ws as any).authData = authData;
        this.rawWebSocketServer!.emit('connection', ws, request);
      });
    });
  }

  /**
   * Handle Raw WebSocket connection
   */
  private handleRawWebSocketConnection(ws: WebSocket, request: any): void {
    const authData = (ws as any).authData;
    const sessionId = this.generateSessionId();
    
    // Create unified session
    const session: UnifiedSession = {
      id: sessionId,
      tenantId: authData.tenantId,
      siteId: authData.siteId,
      userId: authData.userId,
      rawWebSocket: ws,
      createdAt: new Date(),
      lastActivity: new Date(),
      isActive: true,
      isAlive: true,
    };

    this.sessions.set(sessionId, session);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    this.metrics.rawWebSocketConnections++;

    logger.info('Raw WebSocket connection established', {
      sessionId,
      tenantId: authData.tenantId,
      siteId: authData.siteId,
      remoteAddress: request.socket.remoteAddress,
    });

    // Setup WebSocket event handlers
    this.setupRawWebSocketHandlers(ws, session);

    // Setup heartbeat
    this.startHeartbeat(session);

    // Notify voice orchestrator about new session
    this.notifyVoiceOrchestrator('session_created', session);
  }

  /**
   * Setup Raw WebSocket event handlers
   */
  private setupRawWebSocketHandlers(ws: WebSocket, session: UnifiedSession): void {
    // Handle binary audio data
    ws.on('message', async (data: Buffer, isBinary: boolean) => {
      session.lastActivity = new Date();
      
      if (isBinary && data.length > 0) {
        // Process audio frame
        try {
          this.metrics.audioFramesProcessed++;
          // Convert SharedArrayBuffer to ArrayBuffer if needed
          const audioBuffer = data.buffer instanceof SharedArrayBuffer 
            ? (data.buffer.slice(0) as unknown as ArrayBuffer) 
            : data.buffer;
          await voiceOrchestrator.processVoiceInput(session.id, audioBuffer);
        } catch (error) {
          logger.error('Audio processing failed', {
            sessionId: session.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          this.sendError(ws, 'AUDIO_PROCESSING_FAILED', 'Failed to process audio');
        }
      } else if (!isBinary) {
        // Handle control messages (JSON)
        try {
          const message = JSON.parse(data.toString());
          await this.handleControlMessage(session, message);
        } catch (error) {
          logger.error('Control message parsing failed', {
            sessionId: session.id,
            error,
          });
        }
      }
    });

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      session.isAlive = true;
      session.lastActivity = new Date();
      logger.debug('Pong received', { sessionId: session.id });
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleConnectionClose(session, 'raw_websocket', code, reason.toString());
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      logger.error('Raw WebSocket error', {
        sessionId: session.id,
        error: error.message,
      });
      this.metrics.errors++;
    });
  }

  /**
   * Handle control messages from Raw WebSocket
   */
  private async handleControlMessage(session: UnifiedSession, message: any): Promise<void> {
    try {
      this.metrics.messagesProcessed++;
      
      switch (message.type) {
        case 'text_input':
          await voiceOrchestrator.processTextInput(session.id, message.text);
          break;
          
        case 'session_config':
          // Handle session configuration updates
          logger.info('Session config updated', {
            sessionId: session.id,
            config: message.config,
          });
          break;
          
        default:
          logger.warn('Unknown control message type', {
            sessionId: session.id,
            type: message.type,
          });
      }
    } catch (error) {
      logger.error('Control message handling failed', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      if (session.rawWebSocket) {
        this.sendError(session.rawWebSocket, 'CONTROL_MESSAGE_FAILED', 'Failed to handle control message');
      }
    }
  }

  /**
   * Start heartbeat for a session
   */
  private startHeartbeat(session: UnifiedSession): void {
    session.pingInterval = setInterval(() => {
      if (!session.isActive) {
        this.stopHeartbeat(session);
        return;
      }

      if (session.rawWebSocket && !session.isAlive) {
        // Connection is dead, terminate it
        logger.warn('Terminating dead Raw WebSocket connection', {
          sessionId: session.id,
        });
        session.rawWebSocket.terminate();
        this.closeSession(session.id);
        return;
      }

      // Send ping
      session.isAlive = false;
      if (session.rawWebSocket) {
        session.rawWebSocket.ping();
      }
      
      logger.debug('Ping sent', { sessionId: session.id });
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat for a session
   */
  private stopHeartbeat(session: UnifiedSession): void {
    if (session.pingInterval) {
      clearInterval(session.pingInterval);
      delete (session as any).pingInterval;
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(session: UnifiedSession, connectionType: string, code: number, reason: string): void {
    logger.info('WebSocket connection closed', {
      sessionId: session.id,
      connectionType,
      code,
      reason,
      duration: Date.now() - session.createdAt.getTime(),
    });

    this.closeSession(session.id);
  }

  /**
   * Close a unified session
   */
  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      session.isActive = false;
      
      // Stop heartbeat
      this.stopHeartbeat(session);

      // Close Raw WebSocket
      if (session.rawWebSocket) {
        session.rawWebSocket.close();
        this.metrics.rawWebSocketConnections = Math.max(0, this.metrics.rawWebSocketConnections - 1);
      }

      // Socket.IO connections are handled by the SocketIOHandler

      // Remove from sessions
      this.sessions.delete(sessionId);
      this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);

      // Notify voice orchestrator
      await voiceOrchestrator.stopVoiceSession(sessionId);

      logger.info('Session closed', { sessionId });
    } catch (error) {
      logger.error('Error closing session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Authenticate connection (unified for both Raw WebSocket and Socket.IO)
   */
  private authenticateConnection(token: string | null, callback: (err: Error | null, authData?: any) => void): void {
    // Development mode: allow connections without token
    if (process.env['NODE_ENV'] === 'development' && !token) {
      return callback(null, {
        tenantId: '00000000-0000-0000-0000-000000000000',
        siteId: '00000000-0000-0000-0000-000000000000',
        userId: `dev-user-${Date.now()}`,
      });
    }

    if (!token) {
      return callback(new Error('No authentication token provided'));
    }

    try {
      const decoded = jwtService.verifyVoiceToken(token);
      
      if (!decoded.tenantId || !decoded.siteId) {
        return callback(new Error('Invalid token: missing required claims'));
      }

      return callback(null, {
        tenantId: decoded.tenantId,
        siteId: decoded.siteId,
        userId: decoded.userId,
      });
    } catch (error) {
      return callback(new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown'}`));
    }
  }

  /**
   * Send error message to Raw WebSocket client
   */
  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const errorMessage = JSON.stringify({
        type: 'error',
        code,
        message,
        timestamp: Date.now(),
      });
      
      ws.send(errorMessage);
    }
  }

  /**
   * Integrate with voice orchestrator
   */
  private integrateWithVoiceOrchestrator(): void {
    // Set up bi-directional integration
    if (this.socketIOHandler) {
      voiceOrchestrator.setSocketIOHandler(this.socketIOHandler);
    }
    if (this.rawWebSocketHandler) {
      voiceOrchestrator.setRawWebSocketServer(this.rawWebSocketHandler);
    }

    logger.info('Integrated with voice orchestrator');
  }

  /**
   * Notify voice orchestrator about session events
   */
  private notifyVoiceOrchestrator(eventType: string, session: UnifiedSession): void {
    logger.debug('Notifying voice orchestrator', { eventType, sessionId: session.id });
    
    // Create voice session in orchestrator
    voiceOrchestrator.startVoiceSession({
      tenantId: session.tenantId,
      ...(session.siteId && { siteId: session.siteId }),
      ...(session.userId && { userId: session.userId }),
      sessionId: session.id,
    }).catch(error => {
      logger.error('Failed to create voice session in orchestrator', {
        sessionId: session.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `unified-session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Get coordinator status and metrics
   */
  getStatus() {
    return {
      isActive: this.isActive,
      activeSessions: this.sessions.size,
      metrics: { ...this.metrics },
      services: {
        rawWebSocket: !!this.rawWebSocketServer,
        socketIO: !!this.socketIOServer,
        rawWebSocketHandler: !!this.rawWebSocketHandler,
        socketIOHandler: !!this.socketIOHandler,
      },
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UnifiedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Broadcast message to all Raw WebSocket clients
   */
  broadcastToRawWebSocket(message: any, excludeSessionId?: string): void {
    const data = JSON.stringify(message);
    
    for (const session of this.sessions.values()) {
      if (session.isActive && session.rawWebSocket && session.id !== excludeSessionId) {
        if (session.rawWebSocket.readyState === WebSocket.OPEN) {
          session.rawWebSocket.send(data);
        }
      }
    }
  }

  /**
   * Send binary data to specific Raw WebSocket client
   */
  sendBinaryToRawWebSocket(sessionId: string, data: ArrayBuffer): void {
    const session = this.sessions.get(sessionId);
    if (session?.rawWebSocket && session.rawWebSocket.readyState === WebSocket.OPEN) {
      session.rawWebSocket.send(data);
    }
  }
}

// Export default configuration factory
export function createWebSocketCoordinatorConfig(
  httpServer: Server, 
  aiService: UniversalAIAssistantService
): WebSocketCoordinatorConfig {
  return {
    httpServer,
    aiService,
    enableRawWebSocket: true,
    enableSocketIO: true,
    heartbeatInterval: 30000, // 30 seconds
    maxConnections: 1000,
    paths: {
      rawWebSocket: '/voice-ws',
      socketIO: '/socket.io',
    },
  };
}