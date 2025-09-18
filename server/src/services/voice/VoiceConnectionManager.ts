/**
 * Voice Connection Manager - Handles WebSocket and Socket.IO connections
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Manages Raw WebSocket and Socket.IO server initialization and connections
 */

import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIOServer } from 'socket.io';
import { IncomingMessage } from 'http';
import { createLogger } from '../../shared/utils.js';
import { voiceAuthService, type VoiceAuthData } from '../_shared/auth/voice-auth.js';
import type { VoiceWebSocketHandler } from '../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.js';
import type { UniversalAIAssistantService } from '../../modules/ai/application/UniversalAIAssistantService.js';
import type { UnifiedOrchestratorConfig, UnifiedVoiceSession, VoiceStreamMessage } from './types/VoiceTypes.js';

const logger = createLogger({ service: 'voice-connection-manager' });

export class VoiceConnectionManager extends EventEmitter {
  private config: UnifiedOrchestratorConfig;
  private rawWebSocketServer?: WebSocketServer | undefined;
  private socketIOServer?: SocketIOServer | undefined;
  private socketIOHandler?: VoiceWebSocketHandler | undefined;
  private aiAssistantService?: UniversalAIAssistantService | undefined;

  constructor(config: UnifiedOrchestratorConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize Raw WebSocket server with RFC 6455 compliance
   */
  async initializeRawWebSocket(): Promise<void> {
    if (!this.config.httpServer) {
      throw new Error('HTTP server required for Raw WebSocket initialization');
    }

    this.rawWebSocketServer = new WebSocketServer({
      noServer: true,
      verifyClient: this.authenticateWebSocket.bind(this),
      maxPayload: 1024 * 1024,
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
        zlibDeflateOptions: {
          level: 1,
          memLevel: 8,
        },
      },
    });

    this.rawWebSocketServer.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleRawWebSocketConnection(ws, request);
    });

    this.config.httpServer.on('upgrade', (request, socket, head) => {
      const { pathname } = new URL(request.url || '', 'wss://base.url');
      if (pathname === this.config.paths!.rawWebSocket) {
        this.authenticateRawWebSocketUpgrade(request, socket, head);
      }
    });

    logger.info('Raw WebSocket server initialized', {
      path: this.config.paths!.rawWebSocket,
    });
  }

  /**
   * Initialize Socket.IO server
   */
  async initializeSocketIO(): Promise<void> {
    if (!this.config.httpServer) {
      throw new Error('HTTP server required for Socket.IO initialization');
    }

    try {
      const { Server } = await import('socket.io');

      this.socketIOServer = new Server(this.config.httpServer, {
        path: this.config.paths!.socketIO,
        cors: {
          origin: process.env['NODE_ENV'] === 'development' ? '*' : false,
          methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        upgradeTimeout: 5000,
        pingTimeout: 10000,
        pingInterval: 5000,
        maxHttpBufferSize: 1e6,
        allowEIO3: true,
      });

      const { VoiceWebSocketHandler } = await import('../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.js');
      this.socketIOHandler = new VoiceWebSocketHandler(this.socketIOServer);

      if (this.aiAssistantService) {
        this.socketIOHandler.setAIAssistant(this.aiAssistantService);
      }

      this.socketIOServer.on('connection', async (socket) => {
        try {
          this.emit('socket_io_connection', socket);
        } catch (error) {
          logger.error('Failed to handle Socket.IO connection', {
            socketId: socket.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          socket.disconnect(true);
        }
      });

      logger.info('Socket.IO server initialized successfully', {
        path: this.config.paths!.socketIO,
        transports: ['websocket', 'polling']
      });

    } catch (error) {
      logger.error('Failed to initialize Socket.IO server', { error });
      throw error;
    }
  }

  /**
   * RFC 6455 WebSocket authentication during upgrade
   */
  private authenticateWebSocket(
    info: { origin: string; secure: boolean; req: IncomingMessage }
  ): boolean {
    try {
      const { req } = info;
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        logger.warn('WebSocket upgrade rejected: No token provided');
        return false;
      }

      const authData = voiceAuthService.extractToken({ httpRequest: req });
      if (!authData) {
        logger.warn('WebSocket upgrade rejected: Invalid token');
        return false;
      }

      (req as IncomingMessage & { auth?: VoiceAuthData }).auth = authData as unknown as VoiceAuthData;

      logger.debug('WebSocket upgrade authenticated', {
        tenantId: (authData as unknown as VoiceAuthData).tenantId,
        siteId: (authData as unknown as VoiceAuthData).siteId,
      });

      return true;
    } catch (error) {
      logger.error('WebSocket authentication error', { error });
      return false;
    }
  }

  /**
   * Authenticate Raw WebSocket connection on HTTP upgrade
   */
  private authenticateRawWebSocketUpgrade(request: IncomingMessage, socket: unknown, head: Buffer): void {
    const onSocketError = (err: Error) => {
      logger.error('Raw WebSocket authentication socket error', { err });
      (socket as any).destroy();
    };
    (socket as any).on('error', onSocketError);

    voiceAuthService.authenticateWithCallback(
      { httpRequest: request },
      (err: Error | null, authData?: VoiceAuthData) => {
        if (err || !authData) {
          logger.warn('Raw WebSocket authentication failed', {
            error: err?.message,
            url: request.url,
            origin: request.headers.origin,
          });

          (socket as any).write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          (socket as any).destroy();
          return;
        }

        (socket as any).removeListener('error', onSocketError);

        this.rawWebSocketServer!.handleUpgrade(request, socket as any, head, (ws) => {
          (ws as any).authData = authData;
          this.rawWebSocketServer!.emit('connection', ws, request);
        });
      },
      { logAuthAttempts: true }
    );
  }

  /**
   * Handle Raw WebSocket connection
   */
  private handleRawWebSocketConnection(ws: WebSocket, request: IncomingMessage): void {
    const authData = (ws as any).authData as VoiceAuthData;
    if (!authData) {
      ws.close(1008, 'Authentication required');
      return;
    }

    logger.info('Raw WebSocket connection established', {
      tenantId: authData.tenantId,
      siteId: authData.siteId,
      remoteAddress: (request.socket as any).remoteAddress,
    });

    this.emit('raw_websocket_connection', { ws, authData, request });
  }

  /**
   * Send Raw WebSocket message
   */
  sendRawWebSocketMessage(session: UnifiedVoiceSession, message: VoiceStreamMessage): void {
    if (!session.rawWebSocketConnection || session.status === 'ended') {
      logger.warn('Cannot send message - WebSocket not available', { sessionId: session.id });
      return;
    }

    try {
      const ws = session.rawWebSocketConnection;

      if (message.data && message.data instanceof ArrayBuffer) {
        ws.send(message.data);
      } else {
        const jsonMessage = {
          type: message.type,
          metadata: message.metadata || {},
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(jsonMessage));
      }

      session.connectionMetrics.totalMessages++;
      session.lastActivity = new Date();

      logger.debug('Sent Raw WebSocket message', {
        sessionId: session.id,
        type: message.type,
        hasData: !!message.data,
        dataType: message.data instanceof ArrayBuffer ? 'binary' : 'json'
      });

    } catch (error) {
      logger.error('Failed to send Raw WebSocket message', {
        sessionId: session.id,
        type: message.type,
        error
      });

      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'MESSAGE_SEND_ERROR',
        context: { messageType: message.type }
      });
    }
  }

  /**
   * Set AI assistant service
   */
  setAIAssistantService(aiService: UniversalAIAssistantService): void {
    this.aiAssistantService = aiService;
    if (this.socketIOHandler) {
      this.socketIOHandler.setAIAssistant(aiService);
    }
  }

  /**
   * Get AI assistant service
   */
  getAIAssistantService(): UniversalAIAssistantService | undefined {
    return this.aiAssistantService;
  }

  /**
   * Get Socket.IO handler
   */
  getSocketIOHandler(): VoiceWebSocketHandler | undefined {
    return this.socketIOHandler;
  }

  /**
   * Stop connection manager
   */
  async stop(): Promise<void> {
    if (this.rawWebSocketServer) {
      this.rawWebSocketServer.close();
      this.rawWebSocketServer = undefined as unknown as typeof this.rawWebSocketServer;
    }

    if (this.socketIOServer) {
      this.socketIOServer.close();
      this.socketIOServer = undefined as unknown as typeof this.socketIOServer;
    }

    this.socketIOHandler = undefined as unknown as typeof this.socketIOHandler;
    logger.info('VoiceConnectionManager stopped');
  }
}