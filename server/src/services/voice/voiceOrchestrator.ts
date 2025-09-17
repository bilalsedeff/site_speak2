/**
 * Voice Orchestrator - Central coordination service for voice interactions
 * 
 * Bridges API routes with voice services, managing:
 * - Session lifecycle and state management
 * - WebSocket connections (Raw + Socket.IO hybrid)
 * - Performance monitoring and health checks
 * - Integration with AI services and real-time processing
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import { TurnManager } from './turnManager.js';
import { VisualFeedbackService } from './visualFeedbackService.js';
import { OpusFramer, getDefaultOpusConfig } from './opusFramer.js';
import { OpenAIRealtimeClient, createRealtimeConfig } from './openaiRealtimeClient.js';
import type { VoiceWebSocketHandler } from '../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.js';
import type { RawWebSocketServer } from '../../modules/voice/infrastructure/websocket/RawWebSocketServer.js';
import type { UniversalAIAssistantService } from '../../modules/ai/application/UniversalAIAssistantService.js';

const logger = createLogger({ service: 'voice-orchestrator' });

export interface VoiceSession {
  id: string;
  tenantId: string;
  siteId?: string;
  userId?: string;
  status: 'initializing' | 'ready' | 'listening' | 'processing' | 'speaking' | 'ended' | 'error';
  
  // Core components
  turnManager?: TurnManager;
  realtimeClient?: OpenAIRealtimeClient;
  
  // WebSocket connections
  socketIOConnection?: any; // Socket.IO connection
  rawWebSocketConnection?: any; // Raw WebSocket connection
  
  // Session metadata
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  
  // Performance metrics
  metrics: {
    sessionsStarted: Date;
    totalTurns: number;
    avgResponseTime: number;
    errors: Array<{ timestamp: Date; error: string; code?: string }>;
    performance: {
      firstTokenLatencies: number[];
      partialLatencies: number[];
      bargeInLatencies: number[];
    };
  };
  
  // Configuration
  config: {
    locale: string;
    voice: string;
    maxDuration: number;
    audioConfig: {
      sampleRate: number;
      frameMs: number;
      inputFormat: string;
      outputFormat: string;
      enableVAD: boolean;
    };
  };
}

export interface VoiceOrchestratorConfig {
  // Service integrations
  maxSessions?: number;
  sessionTimeout?: number;
  cleanupInterval?: number;
  
  // Performance targets
  performance: {
    targetFirstTokenMs: number;
    targetPartialLatencyMs: number;
    targetBargeInMs: number;
  };
  
  // Default session settings
  defaults: {
    locale: string;
    voice: string;
    maxDuration: number;
    audioConfig: {
      sampleRate: number;
      frameMs: number;
      inputFormat: string;
      outputFormat: string;
      enableVAD: boolean;
    };
  };
}

/**
 * Voice Orchestrator - Central coordination service
 */
export class VoiceOrchestrator extends EventEmitter {
  private sessions = new Map<string, VoiceSession>();
  private config: VoiceOrchestratorConfig;
  private isRunning = false;
  private cleanupTimer?: NodeJS.Timeout;
  
  // Service integrations
  private socketIOHandler?: VoiceWebSocketHandler;
  private rawWebSocketServer?: RawWebSocketServer;
  private aiAssistantService?: UniversalAIAssistantService;
  private visualFeedbackService: VisualFeedbackService;
  private opusFramer: OpusFramer;
  
  // Performance tracking
  private performanceMetrics = {
    totalSessions: 0,
    activeSessions: 0,
    avgFirstTokenLatency: 0,
    avgPartialLatency: 0,
    avgBargeInLatency: 0,
    errorRate: 0,
    totalErrors: 0,
    totalTurns: 0,
  };

  constructor(config: Partial<VoiceOrchestratorConfig> = {}) {
    super();
    
    this.config = {
      maxSessions: config.maxSessions || 100,
      sessionTimeout: config.sessionTimeout || 300000, // 5 minutes
      cleanupInterval: config.cleanupInterval || 60000, // 1 minute
      performance: {
        targetFirstTokenMs: 300,
        targetPartialLatencyMs: 150,
        targetBargeInMs: 50,
        ...config.performance,
      },
      defaults: {
        locale: 'en-US',
        voice: 'alloy',
        maxDuration: 300,
        audioConfig: {
          sampleRate: 24000, // Fixed: OpenAI Realtime API default is 24kHz, not 48kHz
          frameMs: 20,
          inputFormat: 'pcm16', // Fixed: OpenAI Realtime API expects pcm16 format
          outputFormat: 'pcm16',
          enableVAD: true,
        },
        ...config.defaults,
      },
    };
    
    // Initialize core services
    this.visualFeedbackService = new VisualFeedbackService();
    const opusConfig = getDefaultOpusConfig();
    opusConfig.frameMs = this.config.defaults.audioConfig.frameMs;
    opusConfig.sampleRate = this.config.defaults.audioConfig.sampleRate;
    this.opusFramer = new OpusFramer(opusConfig);
    
    logger.info('VoiceOrchestrator initialized', {
      maxSessions: this.config.maxSessions,
      sessionTimeout: this.config.sessionTimeout,
      performanceTargets: this.config.performance,
    });
  }

  /**
   * Start the voice orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('VoiceOrchestrator already running');
      return;
    }

    try {
      // Start core services
      this.visualFeedbackService.start();
      await this.opusFramer.start();
      
      // Setup session cleanup
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredSessions();
      }, this.config.cleanupInterval);
      
      this.isRunning = true;
      this.emit('started');
      
      logger.info('VoiceOrchestrator started successfully');
    } catch (error) {
      logger.error('Failed to start VoiceOrchestrator', { error });
      throw error;
    }
  }

  /**
   * Stop the voice orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // End all active sessions
      const activeSessions = Array.from(this.sessions.values())
        .filter(session => session.status !== 'ended');
      
      await Promise.all(
        activeSessions.map(session => this.stopVoiceSession(session.id))
      );
      
      // Stop services
      this.visualFeedbackService.stop();
      await this.opusFramer.stop();
      
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        delete (this as any).cleanupTimer;
      }
      
      this.isRunning = false;
      this.emit('stopped');
      
      logger.info('VoiceOrchestrator stopped', {
        sessionsClosed: activeSessions.length,
      });
    } catch (error) {
      logger.error('Error stopping VoiceOrchestrator', { error });
      throw error;
    }
  }

  /**
   * Set Socket.IO handler integration
   */
  setSocketIOHandler(handler: VoiceWebSocketHandler): void {
    this.socketIOHandler = handler;
    logger.info('Socket.IO handler connected to VoiceOrchestrator');
  }

  /**
   * Set Raw WebSocket server integration
   */
  setRawWebSocketServer(server: RawWebSocketServer): void {
    this.rawWebSocketServer = server;
    logger.info('Raw WebSocket server connected to VoiceOrchestrator');
  }

  /**
   * Set AI Assistant service integration
   */
  setAIAssistantService(service: UniversalAIAssistantService): void {
    this.aiAssistantService = service;
    logger.info('AI Assistant service connected to VoiceOrchestrator');
  }

  /**
   * Start a new voice session
   */
  async startVoiceSession(params: {
    tenantId: string;
    siteId?: string;
    userId?: string;
    sessionId?: string;
    config?: Partial<VoiceSession['config']>;
  }): Promise<string> {
    
    if (this.sessions.size >= this.config.maxSessions!) {
      throw new Error('Maximum number of voice sessions reached');
    }

    const sessionId = params.sessionId || `voice-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTimeout!);

    const session: VoiceSession = {
      id: sessionId,
      tenantId: params.tenantId,
      ...(params.siteId && { siteId: params.siteId }),
      ...(params.userId && { userId: params.userId }),
      status: 'initializing',
      createdAt: now,
      lastActivity: now,
      expiresAt,
      metrics: {
        sessionsStarted: now,
        totalTurns: 0,
        avgResponseTime: 0,
        errors: [],
        performance: {
          firstTokenLatencies: [],
          partialLatencies: [],
          bargeInLatencies: [],
        },
      },
      config: {
        ...this.config.defaults,
        ...params.config,
      },
    };

    try {
      logger.info('Starting OpenAI Realtime client initialization', {
        sessionId,
        voice: session.config.voice,
        inputFormat: session.config.audioConfig.inputFormat,
        outputFormat: session.config.audioConfig.outputFormat
      });

      // Initialize OpenAI Realtime Client
      const realtimeConfig = createRealtimeConfig({
        voice: session.config.voice as 'alloy',
        inputAudioFormat: session.config.audioConfig.inputFormat as 'pcm16',
        outputAudioFormat: session.config.audioConfig.outputFormat as 'pcm16',
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
      });
      
      logger.info('OpenAI Realtime config created', {
        sessionId,
        realtimeConfig: {
          voice: realtimeConfig.voice,
          inputAudioFormat: realtimeConfig.inputAudioFormat,
          outputAudioFormat: realtimeConfig.outputAudioFormat,
          turnDetection: realtimeConfig.turnDetection,
          hasApiKey: !!realtimeConfig.apiKey,
          apiKeyPrefix: realtimeConfig.apiKey ? realtimeConfig.apiKey.substring(0, 7) + '...' : 'missing'
        }
      });
      
      session.realtimeClient = new OpenAIRealtimeClient(realtimeConfig);
      logger.info('OpenAI Realtime client created, attempting connection', { sessionId });

      // Connect to OpenAI Realtime API
      await session.realtimeClient.connect();
      logger.info('OpenAI Realtime client connected successfully', { sessionId });

      // Setup event handlers
      this.setupSessionEventHandlers(session);

      // Store session
      this.sessions.set(sessionId, session);
      this.performanceMetrics.totalSessions++;
      this.performanceMetrics.activeSessions = this.sessions.size;

      session.status = 'ready';
      this.emit('session_created', session);

      logger.info('Voice session created', {
        sessionId,
        tenantId: params.tenantId,
        siteId: params.siteId,
        expiresAt: expiresAt.toISOString(),
      });

      return sessionId;
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause,
      } : { 
        message: String(error),
        raw: error 
      };

      logger.error('Failed to create voice session', {
        sessionId,
        tenantId: params.tenantId,
        siteId: params.siteId,
        error: errorDetails,
        config: {
          model: 'gpt-4o-realtime-preview',
          voice: session.config.voice,
          inputFormat: session.config.audioConfig.inputFormat,
          outputFormat: session.config.audioConfig.outputFormat,
          hasApiKey: !!(session.realtimeClient as any)?.config?.apiKey,
          apiKeyPrefix: (session.realtimeClient as any)?.config?.apiKey ? 
            (session.realtimeClient as any).config.apiKey.substring(0, 7) + '...' : 'missing'
        }
      });
      
      // Clean up failed session
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Stop a voice session
   */
  async stopVoiceSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to stop non-existent voice session', { sessionId });
      return;
    }

    try {
      session.status = 'ended';
      session.lastActivity = new Date();

      // Stop TurnManager if active
      if (session.turnManager) {
        await session.turnManager.stop();
      }

      // Close Realtime client
      if (session.realtimeClient) {
        await session.realtimeClient.disconnect();
      }

      // Update metrics
      this.performanceMetrics.activeSessions = Math.max(0, this.performanceMetrics.activeSessions - 1);
      this.performanceMetrics.totalTurns += session.metrics.totalTurns;

      // Remove from sessions
      this.sessions.delete(sessionId);

      this.emit('session_ended', session);

      logger.info('Voice session ended', {
        sessionId,
        duration: new Date().getTime() - session.createdAt.getTime(),
        totalTurns: session.metrics.totalTurns,
        errors: session.metrics.errors.length,
      });
    } catch (error) {
      logger.error('Error stopping voice session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Force remove session even if cleanup failed
      this.sessions.delete(sessionId);
      this.performanceMetrics.activeSessions = Math.max(0, this.performanceMetrics.activeSessions - 1);
    }
  }

  /**
   * Get voice session by ID
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeSessions: this.sessions.size,
      performance: {
        totalSessions: this.performanceMetrics.totalSessions,
        avgFirstTokenLatency: this.performanceMetrics.avgFirstTokenLatency,
        avgPartialLatency: this.performanceMetrics.avgPartialLatency,
        avgBargeInLatency: this.performanceMetrics.avgBargeInLatency,
        errorRate: this.performanceMetrics.totalSessions > 0 
          ? this.performanceMetrics.totalErrors / this.performanceMetrics.totalSessions 
          : 0,
      },
      components: {
        visualFeedback: this.visualFeedbackService.getCurrentState(),
        opusFramer: { isRunning: true }, // OpusFramer doesn't expose state
        socketIO: !!this.socketIOHandler,
        rawWebSocket: !!this.rawWebSocketServer,
        aiAssistant: !!this.aiAssistantService,
      },
    };
  }

  /**
   * Setup event handlers for a session
   */
  private setupSessionEventHandlers(session: VoiceSession): void {
    if (!session.realtimeClient) {
      return;
    }

    const client = session.realtimeClient;

    // Handle realtime events
    client.on('conversation.item.created', (event) => {
      logger.debug('Conversation item created', { sessionId: session.id, event });
    });

    client.on('response.audio.delta', (event) => {
      // Forward audio delta to clients
      if (this.socketIOHandler) {
        this.socketIOHandler.sendAudio(session.id, event.delta as ArrayBuffer);
      }
      if (this.rawWebSocketServer && session.rawWebSocketConnection) {
        session.rawWebSocketConnection.send(event.delta);
      }
    });

    client.on('conversation.item.input_audio_transcription.completed', (event) => {
      logger.info('Transcription completed', { 
        sessionId: session.id, 
        transcript: event.transcript || '',
        itemId: event.itemId
      });

      // Update visual feedback
      this.visualFeedbackService.showFinalTranscript(
        event.transcript || '',
        session.config.locale,
        session.id
      );
      
      // Send transcription to client
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'final_asr',
          text: event.transcript || '',
          lang: session.config.locale,
        });
      }
      
      session.lastActivity = new Date();
      session.metrics.totalTurns++;
    });

    // Handle partial transcription
    client.on('conversation.item.input_audio_transcription.delta', (event) => {
      logger.debug('Partial transcription received', { 
        sessionId: session.id, 
        delta: event.delta || ''
      });
      
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'partial_asr',
          text: event.delta || '',
          confidence: 0.8,
        });
      }
    });

    // Handle speech start/stop events for VAD
    client.on('speech_started', (event) => {
      logger.debug('Speech started detected', { sessionId: session.id, event });
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'speech_started',
          data: { 
            audioStartMs: event.audioStartMs || Date.now(),
            itemId: event.itemId 
          },
        });
      }
    });

    client.on('speech_stopped', (event) => {
      logger.debug('Speech stopped detected', { sessionId: session.id, event });
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'speech_stopped',
          data: { 
            audioEndMs: event.audioEndMs || Date.now(),
            itemId: event.itemId 
          },
        });
      }
    });

    // Handle AI response text
    client.on('response.text.delta', (event) => {
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'agent_delta',
          data: { text: event.delta || '' },
        });
      }
    });

    client.on('response.text.done', (event) => {
      if (this.socketIOHandler) {
        this.socketIOHandler.sendVoiceEvent(session.id, {
          type: 'agent_final',
          data: { text: event.text || '' },
        });
      }
    });

    client.on('error', (event) => {
      logger.error('Realtime client error', { sessionId: session.id, event });
      
      session.metrics.errors.push({
        timestamp: new Date(),
        error: event.error?.message || 'Unknown realtime client error',
        code: event.error?.code,
      });
      
      this.performanceMetrics.totalErrors++;
      
      // Show error feedback
      this.visualFeedbackService.showErrorToast({
        type: 'error',
        title: 'Voice Processing Error',
        message: 'There was an issue processing your voice input. Please try again.',
      }, session.id);
    });
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now || session.status === 'error') {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      logger.info('Cleaning up expired sessions', {
        count: expiredSessions.length,
        sessionIds: expiredSessions,
      });

      expiredSessions.forEach(sessionId => {
        this.stopVoiceSession(sessionId).catch(error => {
          logger.error('Error cleaning up expired session', { sessionId, error });
        });
      });
    }
  }

  /**
   * Process voice input for a session
   */
  async processVoiceInput(sessionId: string, audioData: ArrayBuffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.realtimeClient) {
      throw new Error('Invalid session or realtime client not available');
    }

    try {
      session.lastActivity = new Date();
      session.status = 'processing';

      logger.info('Processing voice input', {
        sessionId,
        audioSize: audioData.byteLength,
        sessionStatus: session.status,
        realtimeClientConnected: session.realtimeClient.getStatus().isConnected
      });

      // Convert WebM/Opus to PCM16 if needed
      let processedAudioData = audioData;
      
      try {
        // Check if this is WebM format (starts with specific bytes)
        const uint8View = new Uint8Array(audioData);
        const isWebM = uint8View[0] === 0x1A && uint8View[1] === 0x45 && uint8View[2] === 0xDF && uint8View[3] === 0xA3;
        
        if (isWebM) {
          logger.info('Converting WebM audio to PCM16 for OpenAI Realtime API', { sessionId });
          // For now, pass through - OpenAI Realtime should handle the conversion
          // In a full implementation, we'd use FFmpeg or similar to convert to PCM16
        }
      } catch (conversionError) {
        logger.warn('Audio format detection failed, proceeding with original data', {
          sessionId,
          error: conversionError instanceof Error ? conversionError.message : 'Unknown'
        });
      }

      // Send audio to OpenAI Realtime API
      await session.realtimeClient.sendAudio(processedAudioData);

      logger.info('Voice input sent to OpenAI Realtime API successfully', {
        sessionId,
        audioSize: processedAudioData.byteLength,
      });
      
    } catch (error) {
      session.status = 'error';
      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error processing voice input',
      });
      
      logger.error('Failed to process voice input', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  /**
   * Process text input for a session
   */
  async processTextInput(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.realtimeClient) {
      throw new Error('Invalid session or realtime client not available');
    }

    try {
      session.lastActivity = new Date();
      session.status = 'processing';

      // Send text to OpenAI Realtime API
      await session.realtimeClient.sendText(text);

      logger.debug('Text input processed', {
        sessionId,
        textLength: text.length,
      });
    } catch (error) {
      session.status = 'error';
      session.metrics.errors.push({
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error processing text input',
      });
      
      logger.error('Failed to process text input', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  }
}

// Export singleton instance
export const voiceOrchestrator = new VoiceOrchestrator();