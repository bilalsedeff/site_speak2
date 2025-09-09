/**
 * Raw WebSocket Server - RFC 6455 Compliant
 * 
 * High-performance WebSocket server for voice streaming with:
 * - Raw WebSocket protocol implementation (no Socket.IO overhead)
 * - JWT authentication on WebSocket upgrade
 * - AudioWorklet integration for ≤300ms first token latency
 * - 20ms Opus frame streaming with VAD
 * - Ping/pong with payload echoing for health monitoring
 */

import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createHash } from 'crypto';
import { jwtService, type VoiceJWTPayload } from '../../../../infrastructure/auth/jwt.js';
import { createLogger } from '../../../../shared/utils.js';
import { opusFramer } from '../../../../services/voice/opusFramer.js';
import { OpenAIRealtimeClient, createRealtimeConfig } from '../../../../services/voice/openaiRealtimeClient.js';
import type { UniversalAIAssistantService } from '../../../ai/application/UniversalAIAssistantService.js';

const logger = createLogger({ service: 'raw-websocket' });

// WebSocket message types for voice streaming
export interface VoiceStreamMessage {
  type: 'voice_start' | 'voice_data' | 'voice_end' | 'transcription' | 'audio_response' | 
        'barge_in' | 'vad' | 'user_transcript' | 'error' | 'ready' | 'navigation';
  data?: ArrayBuffer | string | null;
  metadata?: {
    sessionId?: string;
    sampleRate?: number;
    channels?: number;
    vadActive?: boolean;
    sequence?: number;
    timestamp?: number;
    partial?: boolean;
    streaming?: boolean;
    final?: boolean;
    active?: boolean;
    audioStartMs?: number;
    audioEndMs?: number;
    latency?: number;
    error?: string;
    page?: string;
  };
}

export interface RawVoiceSession {
  id: string;
  ws: WebSocket;
  auth: VoiceJWTPayload;
  lastActivity: Date;
  isActive: boolean;
  // Audio streaming state
  isStreaming: boolean;
  audioBuffer: ArrayBuffer[];
  lastPingTime: number;
  missedPongs: number;
  // Performance tracking
  startTime: number;
  firstTokenTime?: number;
  totalFrames: number;
  // OpenAI Realtime client instance
  realtimeClient?: OpenAIRealtimeClient;
}

/**
 * Raw WebSocket Server for Voice Streaming
 */
export class RawWebSocketServer {
  private wss!: WebSocketServer;
  private sessions = new Map<string, RawVoiceSession>();
  private aiService: UniversalAIAssistantService;
  private pingInterval!: NodeJS.Timeout;
  private cleanupInterval!: NodeJS.Timeout;

  // Performance monitoring
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    totalFramesProcessed: 0,
    averageLatency: 0,
    peakConcurrentSessions: 0,
  };

  constructor(aiService: UniversalAIAssistantService) {
    this.aiService = aiService;
    
    // Note: aiService will be used for voice interaction processing
    // Currently handled by direct OpenAI Realtime API integration
    // Suppress unused variable warning as this is an architectural placeholder
    void this.aiService;
    
    this.startPerformanceMonitoring();
    
    logger.info('Raw WebSocket Server initialized');
  }

  /**
   * Attach to existing HTTP server with specific path
   */
  attachToServer(server: import('http').Server, path: string = '/voice-ws'): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ 
          server,
          path,
          verifyClient: this.authenticateWebSocket.bind(this),
          maxPayload: 1024 * 1024,
          perMessageDeflate: false,
        });
        
        this.setupEventHandlers();
        
        logger.info('Raw WebSocket Server attached to HTTP server', { path });
        resolve();
      } catch (error) {
        logger.error('Failed to attach Raw WebSocket Server', { error, path });
        reject(error);
      }
    });
  }

  /**
   * Start server on specified port (legacy method)
   */
  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const server = require('http').createServer();
        this.wss = new WebSocketServer({ 
          server,
          verifyClient: this.authenticateWebSocket.bind(this),
          maxPayload: 1024 * 1024,
          perMessageDeflate: false,
        });
        
        this.setupEventHandlers();
        
        server.listen(port, () => {
          logger.info('Raw WebSocket Server listening', { port });
          resolve();
        });
      } catch (error) {
        logger.error('Failed to start Raw WebSocket Server', { error, port });
        reject(error);
      }
    });
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

      // Verify JWT token
      const payload = jwtService.verifyVoiceToken(token);
      if (!payload) {
        logger.warn('WebSocket upgrade rejected: Invalid token');
        return false;
      }

      // Attach auth info to request for later use
      (req as IncomingMessage & { auth?: VoiceJWTPayload }).auth = payload;
      
      logger.debug('WebSocket upgrade authenticated', {
        userId: payload.userId,
        tenantId: payload.tenantId,
        siteId: payload.siteId,
      });

      return true;
    } catch (error) {
      logger.error('WebSocket authentication error', { error });
      return false;
    }
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });

    // Start periodic tasks
    this.pingInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Every 30 seconds

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, 60000); // Every minute
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const auth = (req as IncomingMessage & { auth?: VoiceJWTPayload }).auth;
    if (!auth) {
      ws.close(1008, 'Authentication required');
      return;
    }

    // Create session
    const sessionId = this.generateSessionId();
    const session: RawVoiceSession = {
      id: sessionId,
      ws,
      auth,
      lastActivity: new Date(),
      isActive: true,
      isStreaming: false,
      audioBuffer: [],
      lastPingTime: Date.now(),
      missedPongs: 0,
      startTime: Date.now(),
      totalFrames: 0,
    };

    this.sessions.set(sessionId, session);
    this.metrics.totalConnections++;
    this.metrics.activeConnections++;
    this.metrics.peakConcurrentSessions = Math.max(
      this.metrics.peakConcurrentSessions, 
      this.metrics.activeConnections
    );

    logger.info('Raw WebSocket connection established', {
      sessionId,
      userId: auth.userId,
      tenantId: auth.tenantId,
      siteId: auth.siteId,
      totalSessions: this.sessions.size,
    });

    // Setup session event handlers
    this.setupSessionHandlers(session);

    // Send ready message
    this.sendToSession(session, {
      type: 'voice_start',
      metadata: { 
        sessionId,
        sampleRate: 48000,
        channels: 1,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Setup handlers for individual session
   */
  private setupSessionHandlers(session: RawVoiceSession): void {
    const { ws } = session;

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      this.handleSessionMessage(session, data);
    });

    // Handle pong responses
    ws.on('pong', (data: Buffer) => {
      this.handlePong(session, data);
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleSessionClose(session, code, reason.toString());
    });

    // Handle connection errors
    ws.on('error', (error: Error) => {
      this.handleSessionError(session, error);
    });
  }

  /**
   * Handle incoming session messages
   */
  private async handleSessionMessage(session: RawVoiceSession, data: Buffer): Promise<void> {
    session.lastActivity = new Date();
    session.totalFrames++;
    this.metrics.totalFramesProcessed++;

    try {
      // Check if this is binary audio data
      if (data.length > 0 && data[0] !== 123) { // Not JSON (starts with '{')
        const audioBuffer = data.buffer instanceof ArrayBuffer 
          ? data.buffer 
          : data.buffer instanceof SharedArrayBuffer 
          ? new ArrayBuffer(data.buffer.byteLength)
          : new ArrayBuffer(0);
        await this.handleAudioData(session, audioBuffer);
        return;
      }

      // Parse JSON message
      const message: VoiceStreamMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'voice_start':
          await this.handleVoiceStart(session);
          break;
        case 'voice_data':
          if (message.data) {
            await this.handleAudioData(session, message.data as ArrayBuffer);
          }
          break;
        case 'voice_end':
          await this.handleVoiceEnd(session);
          break;
        default:
          logger.warn('Unknown message type', { 
            type: message.type,
            sessionId: session.id 
          });
      }
    } catch (error) {
      logger.error('Session message handling error', { 
        error,
        sessionId: session.id,
        dataLength: data.length,
      });
    }
  }

  /**
   * Handle voice stream start
   */
  private async handleVoiceStart(session: RawVoiceSession): Promise<void> {
    session.isStreaming = true;
    session.audioBuffer = [];
    
    logger.debug('Voice streaming started', { sessionId: session.id });
    
    // Initialize Opus framer for this session
    opusFramer.start();
    
    // Create and configure OpenAI Realtime client for this session
    const realtimeConfig = createRealtimeConfig({
      voice: 'alloy', // High-quality voice for SiteSpeak
      inputAudioFormat: 'pcm16',
      outputAudioFormat: 'pcm16', 
      turnDetection: {
        type: 'server_vad', // Let OpenAI handle VAD for barge-in
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 800,
      },
    });
    
    session.realtimeClient = new OpenAIRealtimeClient(realtimeConfig);
    
    // Setup event handlers for voice interactions
    this.setupRealtimeEventHandlers(session);
    
    // Connect to OpenAI Realtime API
    await session.realtimeClient.connect();
    
    // Note: Session configuration is handled during connection initialization
    // OpenAI Realtime API automatically configures based on createRealtimeConfig()
    
    // Add tool handling
    this.setupToolHandling(session);
    
    logger.info('Voice session initialized with OpenAI Realtime API', {
      sessionId: session.id,
      siteId: session.auth.siteId,
    });
  }

  /**
   * Handle audio data (20ms Opus frames from AudioWorklet)
   */
  private async handleAudioData(session: RawVoiceSession, audioData: ArrayBuffer): Promise<void> {
    if (!session.isStreaming) {
      return;
    }

    try {
      // Convert ArrayBuffer to Int16Array (PCM from AudioWorklet)
      const pcmData = new Int16Array(audioData);
      
      // Process through Opus framer
      await opusFramer.processPCMFrame({
        data: pcmData,
        sampleRate: 48000,
        channels: 1,
        timestamp: Date.now(),
      });

      // Forward to OpenAI Realtime API
      if (session.realtimeClient) {
        // Send audio data to OpenAI Realtime API
        await session.realtimeClient.sendAudio(audioData);
      }
      
    } catch (error) {
      logger.error('Audio data processing error', { 
        error,
        sessionId: session.id,
        dataLength: audioData.byteLength,
      });
    }
  }

  /**
   * Handle voice stream end
   */
  private async handleVoiceEnd(session: RawVoiceSession): Promise<void> {
    session.isStreaming = false;
    
    logger.debug('Voice streaming ended', { 
      sessionId: session.id,
      totalFrames: session.totalFrames,
    });
    
    // Finalize processing
    await opusFramer.stop();
    
    // Disconnect OpenAI Realtime client
    if (session.realtimeClient) {
      await session.realtimeClient.disconnect();
    }
  }

  /**
   * Setup OpenAI Realtime API event handlers for a voice session
   */
  private setupRealtimeEventHandlers(session: RawVoiceSession): void {
    if (!session.realtimeClient) {return;}
    
    const client = session.realtimeClient;
    
    // Handle conversation updates (main response handler)
    client.on('conversation.updated', ({ item, delta }) => {
      logger.debug('Conversation updated', { 
        sessionId: session.id,
        itemType: item.type,
        hasDelta: !!delta 
      });
      
      if (delta) {
        // Handle streaming audio response
        if (delta.audio) {
          this.sendToSession(session, {
            type: 'audio_response',
            data: delta.audio.buffer,
            metadata: {
              streaming: true,
              timestamp: Date.now(),
            },
          });
          
          // Track first audio token latency
          if (!session.firstTokenTime) {
            session.firstTokenTime = Date.now();
            const latency = session.firstTokenTime - session.startTime;
            logger.info('First audio token latency achieved', {
              sessionId: session.id,
              latencyMs: latency,
              targetMs: 300,
              achieved: latency <= 300,
            });
          }
        }
        
        // Handle streaming transcript
        if (delta.transcript) {
          this.sendToSession(session, {
            type: 'transcription',
            data: delta.transcript,
            metadata: {
              partial: true,
              streaming: true,
              timestamp: Date.now(),
            },
          });
        }
      }
      
      // Handle completed items
      if (item.status === 'completed') {
        if (item.type === 'message' && item.role === 'assistant') {
          // Send final transcript
          const transcript = item.content?.find((c: any) => c.type === 'text')?.text;
          if (transcript) {
            this.sendToSession(session, {
              type: 'transcription',
              data: transcript,
              metadata: {
                partial: false,
                final: true,
                timestamp: Date.now(),
              },
            });
          }
        }
      }
    });
    
    // Handle conversation interruption (user barge-in)
    client.on('conversation.interrupted', () => {
      logger.debug('Conversation interrupted (barge-in)', { 
        sessionId: session.id 
      });
      
      this.sendToSession(session, {
        type: 'barge_in',
        data: null,
        metadata: {
          timestamp: Date.now(),
        },
      });
    });
    
    // Handle speech detection
    client.on('speech_started', (data) => {
      logger.debug('Speech started', { 
        sessionId: session.id,
        audioStartMs: data.audioStartMs 
      });
      
      this.sendToSession(session, {
        type: 'vad',
        data: 'vad_start',
        metadata: {
          active: true,
          audioStartMs: data.audioStartMs,
          timestamp: Date.now(),
        },
      });
    });
    
    client.on('speech_stopped', (data) => {
      logger.debug('Speech stopped', { 
        sessionId: session.id,
        audioEndMs: data.audioEndMs 
      });
      
      this.sendToSession(session, {
        type: 'vad', 
        data: 'vad_end',
        metadata: {
          active: false,
          audioEndMs: data.audioEndMs,
          timestamp: Date.now(),
        },
      });
    });
    
    // Handle transcription from user speech
    client.on('transcription', (data) => {
      logger.debug('User transcription', { 
        sessionId: session.id,
        transcript: data.transcript,
        latency: data.latency 
      });
      
      this.sendToSession(session, {
        type: 'user_transcript',
        data: data.transcript,
        metadata: {
          latency: data.latency,
          timestamp: Date.now(),
        },
      });
    });
    
    // Handle errors
    client.on('error', (error) => {
      logger.error('OpenAI Realtime API error', { 
        sessionId: session.id,
        error 
      });
      
      this.sendToSession(session, {
        type: 'error',
        data: null,
        metadata: {
          error: error.message || 'OpenAI Realtime API error',
          timestamp: Date.now(),
        },
      });
    });
    
    // Handle session ready
    client.on('session_ready', (sessionData) => {
      logger.info('OpenAI Realtime session ready', { 
        sessionId: session.id,
        realtimeSessionId: sessionData.id 
      });
      
      this.sendToSession(session, {
        type: 'ready',
        data: JSON.stringify({
          sessionId: session.id,
          realtimeSessionId: sessionData.id,
          capabilities: ['audio', 'text', 'vad', 'barge_in'],
        }),
        metadata: {
          timestamp: Date.now(),
        },
      });
    });
    
    logger.debug('OpenAI Realtime event handlers setup complete', { 
      sessionId: session.id 
    });
  }



  /**
   * Setup tool handling for function calls
   */
  private setupToolHandling(session: RawVoiceSession): void {
    if (!session.realtimeClient) {return;}
    
    const client = session.realtimeClient;
    
    // Handle function call completion
    client.on('function_call_complete', async ({ callId, arguments: args }) => {
      try {
        logger.debug('Function call completed', { 
          sessionId: session.id,
          callId,
          args 
        });
        
        const parsedArgs = JSON.parse(args);
        let result = '';
        
        // Handle different function calls
        if (callId.includes('search_site')) {
          result = await this.handleSearchSite(session, parsedArgs);
        } else if (callId.includes('navigate_to_page')) {
          result = await this.handleNavigateToPage(session, parsedArgs);
        } else if (callId.includes('get_site_info')) {
          result = await this.handleGetSiteInfo(session, parsedArgs);
        } else {
          result = 'Tool execution not available';
        }
        
        // Note: Function call result integration with OpenAI Realtime API
        // would require additional implementation based on the specific API version
        logger.debug('Function call completed', { callId, result: result.slice(0, 100) });
        
      } catch (error) {
        logger.error('Error handling function call', { 
          sessionId: session.id,
          callId,
          error 
        });
        
        // Log function call error
        logger.debug('Function call error response prepared', { callId });
      }
    });
  }

  /**
   * Handle site search tool
   */
  private async handleSearchSite(session: RawVoiceSession, args: any): Promise<string> {
    try {
      // Process search query through AI assistant
      const response = await this.aiService.processConversation({
        input: `Search for: ${args.query}`,
        sessionId: session.id,
        siteId: session.auth.siteId || '',
        tenantId: session.auth.tenantId,
        ...(session.auth.userId && { userId: session.auth.userId }),
        context: {
          currentUrl: 'voice-search',
          pageTitle: 'Voice Search',
        },
      });
      
      return response.response.text || 'No results found for your search.';
    } catch (error) {
      logger.error('Error in site search', { sessionId: session.id, error });
      return 'Sorry, I encountered an error while searching.';
    }
  }

  /**
   * Handle navigation tool
   */
  private async handleNavigateToPage(session: RawVoiceSession, args: any): Promise<string> {
    try {
      // Send navigation command to client
      this.sendToSession(session, {
        type: 'navigation',
        data: JSON.stringify({ page: args.page, path: args.path }),
        metadata: {
          page: args.page,
          timestamp: Date.now(),
        },
      });
      
      return `Navigated to ${args.page}${args.path ? ` (${args.path})` : ''}.`;
    } catch (error) {
      logger.error('Error in navigation', { sessionId: session.id, error });
      return 'Sorry, I encountered an error while navigating.';
    }
  }

  /**
   * Handle site info tool
   */
  private async handleGetSiteInfo(session: RawVoiceSession, args: any): Promise<string> {
    try {
      // Get site information through AI assistant
      const response = await this.aiService.processConversation({
        input: args.topic ? `Tell me about ${args.topic} on this website` : 'Tell me about this website',
        sessionId: session.id,
        siteId: session.auth.siteId || '',
        tenantId: session.auth.tenantId,
        ...(session.auth.userId && { userId: session.auth.userId }),
        context: {
          currentUrl: 'voice-info',
          pageTitle: 'Site Information',
        },
      });
      
      return response.response.text || 'Information not available.';
    } catch (error) {
      logger.error('Error getting site info', { sessionId: session.id, error });
      return 'Sorry, I encountered an error while retrieving information.';
    }
  }

  /**
   * Handle pong response for health monitoring
   */
  private handlePong(session: RawVoiceSession, data: Buffer): void {
    const now = Date.now();
    const latency = now - session.lastPingTime;
    
    // Update latency metrics
    this.metrics.averageLatency = 
      (this.metrics.averageLatency + latency) / 2;
    
    session.missedPongs = 0;
    session.lastActivity = new Date();
    
    logger.debug('Pong received', { 
      sessionId: session.id,
      latency,
      payload: data.toString(),
    });
  }

  /**
   * Handle session close
   */
  private handleSessionClose(session: RawVoiceSession, code: number, reason: string): void {
    logger.info('WebSocket session closed', {
      sessionId: session.id,
      code,
      reason,
      duration: Date.now() - session.startTime,
      totalFrames: session.totalFrames,
    });

    this.cleanupSession(session);
  }

  /**
   * Handle session error
   */
  private handleSessionError(session: RawVoiceSession, error: Error): void {
    logger.error('WebSocket session error', {
      sessionId: session.id,
      error,
    });

    // Close session on error
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.close(1011, 'Internal server error');
    }
    
    this.cleanupSession(session);
  }

  /**
   * Send message to specific session
   */
  private sendToSession(session: RawVoiceSession, message: VoiceStreamMessage): void {
    if (session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const data = message.data instanceof ArrayBuffer 
        ? Buffer.from(message.data)
        : JSON.stringify(message);
        
      session.ws.send(data);
    } catch (error) {
      logger.error('Failed to send message to session', {
        sessionId: session.id,
        error,
        messageType: message.type,
      });
    }
  }

  /**
   * Perform health checks with ping/pong
   */
  private performHealthChecks(): void {
    const now = Date.now();
    
    for (const session of Array.from(this.sessions.values())) {
      if (session.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      // Send ping with timestamp payload for latency measurement
      const pingData = Buffer.from(now.toString());
      session.lastPingTime = now;
      
      try {
        session.ws.ping(pingData);
      } catch (error) {
        logger.error('Failed to ping session', {
          sessionId: session.id,
          error,
        });
        session.missedPongs++;
      }

      // Close sessions with too many missed pongs
      if (session.missedPongs > 3) {
        logger.warn('Closing session due to missed pongs', {
          sessionId: session.id,
          missedPongs: session.missedPongs,
        });
        session.ws.close(1002, 'Ping timeout');
      }
    }
  }

  /**
   * Cleanup inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const session of Array.from(this.sessions.values())) {
      const inactive = now - session.lastActivity.getTime() > timeout;
      
      if (inactive || session.ws.readyState !== WebSocket.OPEN) {
        logger.info('Cleaning up inactive session', {
          sessionId: session.id,
          inactive,
          readyState: session.ws.readyState,
        });
        
        this.cleanupSession(session);
      }
    }
  }

  /**
   * Cleanup session resources
   */
  private cleanupSession(session: RawVoiceSession): void {
    // Remove from sessions map
    this.sessions.delete(session.id);
    this.metrics.activeConnections--;

    // Cleanup audio resources
    if (session.isStreaming) {
      opusFramer.stop().catch(error => {
        logger.error('Error stopping opus framer', { error });
      });
      
      if (session.realtimeClient) {
        session.realtimeClient.disconnect().catch(error => {
          logger.error('Error disconnecting OpenAI client', { error });
        });
      }
    }

    session.isActive = false;
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      logger.info('Raw WebSocket Server metrics', {
        ...this.metrics,
        activeSessions: this.sessions.size,
        timestamp: new Date().toISOString(),
      });
    }, 60000); // Every minute
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get server metrics
   */
  getMetrics(): Record<string, unknown> {
    return {
      ...this.metrics,
      activeSessions: this.sessions.size,
      uptime: Date.now() - (this.metrics.totalConnections > 0 ? Date.now() : 0),
    };
  }

  /**
   * Shutdown server gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Raw WebSocket Server');
    
    // Clear intervals
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Close all sessions
    for (const session of Array.from(this.sessions.values())) {
      session.ws.close(1001, 'Server shutdown');
    }
    
    // Close server
    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info('Raw WebSocket Server shut down complete');
        resolve();
      });
    });
  }
}

// Export singleton instance
export let rawWebSocketServer: RawWebSocketServer;

export function initializeRawWebSocketServer(aiService: UniversalAIAssistantService): RawWebSocketServer {
  rawWebSocketServer = new RawWebSocketServer(aiService);
  return rawWebSocketServer;
}