/**
 * Voice Orchestrator - Integration service for all voice components
 * 
 * Orchestrates the complete voice interaction pipeline:
 * - TurnManager (AudioWorklet, VAD, barge-in)
 * - VisualFeedbackService (UI hints and feedback)
 * - OpusFramer (low-latency audio encoding)
 * - VoiceWebSocketServer (real-time transport)
 * - OpenAIRealtimeClient (streaming STT/TTS)
 * 
 * Provides high-level API for voice features while coordinating
 * all components to meet performance targets.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import { TurnManager, TurnManagerConfig, TurnEvent } from './turnManager';
import { VisualFeedbackService, visualFeedbackService } from './visualFeedbackService';
import { OpusFramer, opusFramer, PCMFrame } from './opusFramer';
import { VoiceWebSocketServer, VoiceSession } from './transport/wsServer';
import { OpenAIRealtimeClient, createRealtimeConfig, RealtimeConfig } from './openaiRealtimeClient';
import { analyticsHelpers } from '../_shared/analytics/index.js';

const logger = createLogger({ service: 'voice-orchestrator' });

// Orchestrator configuration
export interface VoiceOrchestratorConfig {
  turnManager: Partial<TurnManagerConfig>;
  realtime: Partial<RealtimeConfig>;
  transport: {
    port: number;
    maxConnections: number;
  };
  performance: {
    targetFirstTokenMs: number;
    targetPartialLatencyMs: number;
    targetBargeInMs: number;
  };
}

// Voice session state
export interface VoiceSessionState {
  id: string;
  tenantId: string;
  siteId: string;
  userId?: string;
  status: 'initializing' | 'ready' | 'listening' | 'processing' | 'speaking' | 'error';
  turnManager?: TurnManager;
  realtimeClient?: OpenAIRealtimeClient;
  metrics: {
    sessionsStarted: Date;
    totalTurns: number;
    avgResponseTime: number;
    errors: number[];
    performance: {
      firstTokenLatencies: number[];
      partialLatencies: number[];
      bargeInLatencies: number[];
    };
  };
}

/**
 * Voice Orchestrator - Main coordination service
 */
export class VoiceOrchestrator extends EventEmitter {
  private config: VoiceOrchestratorConfig;
  private wsServer: VoiceWebSocketServer;
  private visualFeedback: VisualFeedbackService;
  private opusFramer: OpusFramer;
  private activeSessions = new Map<string, VoiceSessionState>();
  private isRunning = false;

  // Performance monitoring
  private performanceMetrics = {
    totalSessions: 0,
    activeSessions: 0,
    avgFirstTokenLatency: 0,
    avgPartialLatency: 0,
    avgBargeInLatency: 0,
    errorRate: 0,
  };

  constructor(config: VoiceOrchestratorConfig) {
    super();
    this.config = config;
    
    // Initialize components
    this.wsServer = new VoiceWebSocketServer();
    this.visualFeedback = visualFeedbackService;
    this.opusFramer = opusFramer;

    this.setupEventHandlers();
    
    logger.info('Voice orchestrator initialized', {
      targetFirstTokenMs: config.performance.targetFirstTokenMs,
      targetPartialMs: config.performance.targetPartialLatencyMs,
      targetBargeInMs: config.performance.targetBargeInMs,
    });
  }

  /**
   * Start the voice orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Voice orchestrator already running');
      return;
    }

    try {
      // Start transport server
      await this.wsServer.start(this.config.transport.port);
      
      // Start visual feedback service
      this.visualFeedback.start();
      
      // Start Opus framer
      this.opusFramer.start();

      this.isRunning = true;
      
      logger.info('Voice orchestrator started', {
        transportPort: this.config.transport.port,
      });

      this.emit('orchestrator_started');
    } catch (error) {
      logger.error('Failed to start voice orchestrator', { error });
      throw error;
    }
  }

  /**
   * Stop the voice orchestrator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Stop all active sessions
      for (const sessionId of this.activeSessions.keys()) {
        await this.stopVoiceSession(sessionId);
      }

      // Stop components
      await this.wsServer.stop();
      this.visualFeedback.stop();
      this.opusFramer.stop();

      this.isRunning = false;
      
      logger.info('Voice orchestrator stopped');
      this.emit('orchestrator_stopped');
    } catch (error) {
      logger.error('Error stopping voice orchestrator', { error });
    }
  }

  /**
   * Start voice session for a WebSocket connection
   */
  async startVoiceSession(wsSession: VoiceSession): Promise<string> {
    if (!this.isRunning) {
      throw new Error('Voice orchestrator not running');
    }

    const sessionId = wsSession.id;
    const { tenantId, siteId, userId } = wsSession.auth;

    try {
      logger.info('Starting voice session', { 
        sessionId, 
        tenantId, 
        siteId,
        userId 
      });

      // Create session state
      const sessionState: VoiceSessionState = {
        id: sessionId,
        tenantId,
        siteId,
        ...(userId && { userId }),
        status: 'initializing',
        metrics: {
          sessionsStarted: new Date(),
          totalTurns: 0,
          avgResponseTime: 0,
          errors: [],
          performance: {
            firstTokenLatencies: [],
            partialLatencies: [],
            bargeInLatencies: [],
          },
        },
      };

      // Initialize OpenAI Realtime client
      const realtimeConfig = createRealtimeConfig({
        ...this.config.realtime,
        // Add tenant-specific configuration if needed
      });
      
      sessionState.realtimeClient = new OpenAIRealtimeClient(realtimeConfig);
      await sessionState.realtimeClient.connect();

      // Initialize TurnManager
      const turnManagerConfig: TurnManagerConfig = {
        vad: {
          threshold: 0.5,
          hangMs: 500,
        },
        opus: {
          frameMs: 20,
          bitrate: 24000,
        },
        tts: {
          enable: true,
          duckOnVAD: true,
        },
        ...this.config.turnManager,
        transport: {
          send: async (data) => {
            if (data instanceof ArrayBuffer) {
              // Send audio frame to OpenAI
              await sessionState.realtimeClient!.sendAudio(data);
            } else {
              // Send control message
              wsSession.ws.send(JSON.stringify(data));
            }
          },
          on: (event, callback) => {
            // Bridge events from WebSocket to TurnManager
            this.wsServer.on(event, callback);
          },
          disconnect: () => {
            wsSession.ws.close();
          },
        },
      };

      sessionState.turnManager = new TurnManager(turnManagerConfig);
      
      // Setup session-specific event handlers
      this.setupSessionEventHandlers(sessionState, wsSession);
      
      // Start components
      await sessionState.turnManager.start();
      
      sessionState.status = 'ready';
      this.activeSessions.set(sessionId, sessionState);
      this.performanceMetrics.totalSessions++;
      this.performanceMetrics.activeSessions++;

      // Update visual feedback
      this.visualFeedback.updateMicState('idle', sessionId);

      // Track analytics event for voice session started
      try {
        await analyticsHelpers.trackVoiceMetrics(tenantId, siteId, sessionId, {
          // Will track specific metrics when turn events occur
        });
      } catch (error) {
        logger.warn('Failed to track voice session analytics', { error, sessionId });
      }

      logger.info('Voice session started successfully', { sessionId });
      
      this.emit('session_started', { sessionId, sessionState });
      return sessionId;

    } catch (error) {
      logger.error('Failed to start voice session', { 
        error, 
        sessionId,
        tenantId 
      });
      
      // Cleanup on error
      if (this.activeSessions.has(sessionId)) {
        await this.stopVoiceSession(sessionId);
      }
      
      throw error;
    }
  }

  /**
   * Stop voice session
   */
  async stopVoiceSession(sessionId: string): Promise<void> {
    const sessionState = this.activeSessions.get(sessionId);
    if (!sessionState) {
      logger.warn('Voice session not found', { sessionId });
      return;
    }

    try {
      logger.info('Stopping voice session', { sessionId });

      // Stop components
      if (sessionState.turnManager) {
        await sessionState.turnManager.stop();
      }

      if (sessionState.realtimeClient) {
        await sessionState.realtimeClient.disconnect();
      }

      // Clear visual feedback
      this.visualFeedback.clearAll(sessionId);

      // Remove session
      this.activeSessions.delete(sessionId);
      this.performanceMetrics.activeSessions--;

      logger.info('Voice session stopped', { 
        sessionId,
        duration: Date.now() - sessionState.metrics.sessionsStarted.getTime(),
        totalTurns: sessionState.metrics.totalTurns,
      });

      this.emit('session_stopped', { sessionId, sessionState });

    } catch (error) {
      logger.error('Error stopping voice session', { error, sessionId });
    }
  }

  /**
   * Setup component event handlers
   */
  private setupEventHandlers(): void {
    // WebSocket transport events
    this.wsServer.on('connection', async (sessionData) => {
      await this.startVoiceSession(sessionData.session);
    });

    this.wsServer.on('disconnection', async (sessionData) => {
      await this.stopVoiceSession(sessionData.sessionId);
    });

    this.wsServer.on('audio_frame', async (data) => {
      await this.handleIncomingAudioFrame(data);
    });

    this.wsServer.on('text_input', async (data) => {
      await this.handleIncomingTextInput(data);
    });

    this.wsServer.on('control', async (data) => {
      await this.handleControlMessage(data);
    });

    // Opus framer events
    this.opusFramer.on('opus_frame', (frame) => {
      this.handleOpusFrame(frame);
    });
  }

  /**
   * Setup session-specific event handlers
   */
  private setupSessionEventHandlers(sessionState: VoiceSessionState, _wsSession: VoiceSession): void {
    const { turnManager, realtimeClient } = sessionState;
    const sessionId = sessionState.id;

    if (!turnManager || !realtimeClient) return;

    // TurnManager events
    turnManager.on('event', (event: TurnEvent) => {
      this.handleTurnManagerEvent(sessionState, event);
    });

    // OpenAI Realtime events
    realtimeClient.on('session_ready', () => {
      logger.debug('Realtime session ready', { sessionId });
    });

    realtimeClient.on('transcription', (data) => {
      this.visualFeedback.showFinalTranscript(data.transcript, undefined, sessionId);
      
      // Track transcription latency
      sessionState.metrics.performance.partialLatencies.push(data.latency);
      this.updatePerformanceMetrics();
      
      this.emit('transcription', { sessionId, ...data });
    });

    realtimeClient.on('transcript_delta', (data) => {
      this.visualFeedback.showPartialTranscript(data.delta, undefined, sessionId);
      this.emit('transcript_partial', { sessionId, ...data });
    });

    realtimeClient.on('audio_delta', async (data) => {
      // Send audio response back to client
      await this.wsServer.sendAudio(sessionId, data.delta.buffer);
      
      this.visualFeedback.updateMicState('processing', sessionId);
      this.emit('audio_response', { sessionId, ...data });
    });

    realtimeClient.on('response_complete', () => {
      sessionState.metrics.totalTurns++;
      this.visualFeedback.updateMicState('idle', sessionId);
      
      // Track first token latency
      const metrics = realtimeClient.getMetrics();
      if (metrics.firstTokenLatency.length > 0) {
        const latency = metrics.firstTokenLatency[metrics.firstTokenLatency.length - 1];
        sessionState.metrics.performance.firstTokenLatencies.push(latency);
        this.updatePerformanceMetrics();
        
        // Warn if performance target missed
        if (latency > this.config.performance.targetFirstTokenMs) {
          logger.warn('First token latency exceeded target', {
            sessionId,
            latency,
            target: this.config.performance.targetFirstTokenMs,
          });
        }
      }
      
      this.emit('response_complete', { sessionId });
    });

    realtimeClient.on('error', (error) => {
      logger.error('Realtime API error', { sessionId, error });
      sessionState.metrics.errors.push(error);
      this.visualFeedback.showErrorToast({
        type: 'error',
        title: 'Voice Processing Error',
        message: 'There was an issue processing your voice input. Please try again.',
      }, sessionId);
    });
  }

  /**
   * Handle TurnManager events
   */
  private handleTurnManagerEvent(sessionState: VoiceSessionState, event: TurnEvent): void {
    const sessionId = sessionState.id;

    switch (event.type) {
      case 'ready':
        sessionState.status = 'ready';
        break;

      case 'mic_opened':
        this.visualFeedback.updateMicState('listening', sessionId);
        sessionState.status = 'listening';
        break;

      case 'mic_closed':
        this.visualFeedback.updateMicState('idle', sessionId);
        sessionState.status = 'ready';
        break;

      case 'vad':
        this.visualFeedback.updateAudioLevel(event.level ?? 0, sessionId);
        if (event.active && sessionState.status !== 'listening') {
          sessionState.status = 'listening';
        }
        break;

      case 'barge_in':
        const bargeInLatency = Date.now();
        sessionState.metrics.performance.bargeInLatencies.push(bargeInLatency);
        this.updatePerformanceMetrics();
        
        if (bargeInLatency > this.config.performance.targetBargeInMs) {
          logger.warn('Barge-in latency exceeded target', {
            sessionId,
            latency: bargeInLatency,
            target: this.config.performance.targetBargeInMs,
          });
        }
        break;

      case 'partial_asr':
        this.visualFeedback.showPartialTranscript(event.text, event.confidence, sessionId);
        break;

      case 'final_asr':
        this.visualFeedback.showFinalTranscript(event.text, event.lang, sessionId);
        sessionState.status = 'processing';
        break;

      case 'error':
        logger.error('TurnManager error', { sessionId, error: event });
        sessionState.status = 'error';
        sessionState.metrics.errors.push(Date.now());
        break;
    }

    this.emit('turn_event', { sessionId, event });
  }

  /**
   * Handle incoming audio frame from WebSocket
   */
  private async handleIncomingAudioFrame(data: any): Promise<void> {
    const sessionState = this.activeSessions.get(data.sessionId);
    if (!sessionState) return;

    try {
      // Convert to PCM frame for processing
      const pcmFrame: PCMFrame = {
        data: new Int16Array(data.data),
        sampleRate: 48000, // Assuming 48kHz
        channels: 1,
        timestamp: data.timestamp,
      };

      // Process through Opus framer
      await this.opusFramer.processPCMFrame(pcmFrame);

    } catch (error) {
      logger.error('Error processing audio frame', { 
        error, 
        sessionId: data.sessionId 
      });
    }
  }

  /**
   * Handle incoming text input
   */
  private async handleIncomingTextInput(data: any): Promise<void> {
    const sessionState = this.activeSessions.get(data.sessionId);
    if (!sessionState?.realtimeClient) return;

    try {
      await sessionState.realtimeClient.sendText(data.text);
      sessionState.status = 'processing';
      
      this.visualFeedback.showFinalTranscript(data.text, undefined, data.sessionId);
      
    } catch (error) {
      logger.error('Error processing text input', { 
        error, 
        sessionId: data.sessionId 
      });
    }
  }

  /**
   * Handle control messages
   */
  private async handleControlMessage(data: any): Promise<void> {
    const sessionState = this.activeSessions.get(data.sessionId);
    if (!sessionState) return;

    switch (data.action) {
      case 'start_recording':
        if (sessionState.turnManager) {
          // Trigger mic opening through turn manager
          this.visualFeedback.updateMicState('listening', data.sessionId);
        }
        break;

      case 'stop_recording':
        if (sessionState.realtimeClient) {
          await sessionState.realtimeClient.commitAudioBuffer();
        }
        break;

      case 'clear_session':
        if (sessionState.realtimeClient) {
          await sessionState.realtimeClient.clearAudioBuffer();
        }
        this.visualFeedback.clearAll(data.sessionId);
        break;
    }
  }

  /**
   * Handle Opus frame for transmission
   */
  private handleOpusFrame(frame: any): void {
    // Send frame to all active sessions that are listening
    for (const [sessionId, sessionState] of this.activeSessions.entries()) {
      if (sessionState.status === 'listening' && sessionState.realtimeClient) {
        // Convert Opus frame back to PCM for OpenAI (they expect PCM16)
        // In a real implementation, you'd decode the Opus frame
        sessionState.realtimeClient.sendAudio(frame.data);
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    let totalFirstToken = 0;
    let totalPartial = 0;
    let totalBargeIn = 0;
    let totalSamples = 0;

    for (const session of this.activeSessions.values()) {
      const perf = session.metrics.performance;
      totalFirstToken += perf.firstTokenLatencies.reduce((a, b) => a + b, 0);
      totalPartial += perf.partialLatencies.reduce((a, b) => a + b, 0);
      totalBargeIn += perf.bargeInLatencies.reduce((a, b) => a + b, 0);
      totalSamples += perf.firstTokenLatencies.length + 
                     perf.partialLatencies.length + 
                     perf.bargeInLatencies.length;
    }

    if (totalSamples > 0) {
      this.performanceMetrics.avgFirstTokenLatency = totalFirstToken / totalSamples;
      this.performanceMetrics.avgPartialLatency = totalPartial / totalSamples;
      this.performanceMetrics.avgBargeInLatency = totalBargeIn / totalSamples;
    }

    // Calculate error rate
    const totalErrors = Array.from(this.activeSessions.values())
      .reduce((sum, s) => sum + s.metrics.errors.length, 0);
    this.performanceMetrics.errorRate = totalErrors / Math.max(this.performanceMetrics.totalSessions, 1);
  }

  /**
   * Get orchestrator status and metrics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeSessions: this.activeSessions.size,
      performance: this.performanceMetrics,
      sessions: Array.from(this.activeSessions.values()).map(s => ({
        id: s.id,
        tenantId: s.tenantId,
        status: s.status,
        turns: s.metrics.totalTurns,
        errors: s.metrics.errors.length,
      })),
      components: {
        wsServer: this.wsServer.getMetrics(),
        visualFeedback: this.visualFeedback.getCurrentState(),
        opusFramer: this.opusFramer.getStats(),
      },
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): VoiceSessionState | undefined {
    return this.activeSessions.get(sessionId);
  }
}

// Default configuration
export function getDefaultVoiceOrchestratorConfig(): VoiceOrchestratorConfig {
  return {
    turnManager: {
      locale: 'en-US',
      vad: {
        threshold: 0.01,
        hangMs: 800,
      },
      opus: {
        frameMs: 20,
        bitrate: 16000,
      },
      tts: {
        enable: true,
        duckOnVAD: true,
      },
    },
    realtime: {
      voice: 'alloy',
      inputAudioFormat: 'pcm16',
      outputAudioFormat: 'pcm16',
    },
    transport: {
      port: 8080,
      maxConnections: 100,
    },
    performance: {
      targetFirstTokenMs: 300,
      targetPartialLatencyMs: 150,
      targetBargeInMs: 50,
    },
  };
}

// Export singleton instance
export const voiceOrchestrator = new VoiceOrchestrator(getDefaultVoiceOrchestratorConfig());