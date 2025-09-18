/**
 * Voice Types - Shared interface definitions for voice services
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Contains all shared types and interfaces for the voice system
 */

import { WebSocket } from 'ws';
import { Socket } from 'socket.io';
import type { Server } from 'http';
import type { TurnManager } from '../turnManager.js';
import type { PooledConnection } from '../RealtimeConnectionPool.js';

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
    text?: string;
    confidence?: number;
    language?: string;
    level?: number;
  };
}

// Unified session interface combining all service capabilities
export interface UnifiedVoiceSession {
  id: string;
  tenantId: string;
  siteId?: string | undefined;
  userId?: string | undefined;
  status: 'initializing' | 'ready' | 'listening' | 'processing' | 'speaking' | 'ended' | 'error';

  // Core components with optimizations
  turnManager?: TurnManager | undefined;
  realtimeConnection?: PooledConnection | undefined;

  // Enhanced WebSocket connections (both types supported)
  socketIOConnection?: Socket | undefined;
  rawWebSocketConnection?: WebSocket | undefined;
  connectionType: 'socket_io' | 'raw_websocket' | 'hybrid';
  connectionMetrics: {
    establishedAt: Date;
    lastActivityAt: Date;
    totalMessages: number;
    avgMessageSize: number;
    connectionLatency: number;
  };

  // Session metadata with performance tracking
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;

  // Enhanced heartbeat with performance monitoring
  pingInterval?: NodeJS.Timeout | undefined;
  isAlive: boolean;
  heartbeatLatencies: number[];
  lastPingTime: number;
  missedPongs: number;

  // Advanced metrics with optimization triggers
  metrics: {
    sessionsStarted: Date;
    totalTurns: number;
    avgResponseTime: number;
    errors: Array<{
      timestamp: Date;
      error: string;
      code?: string;
      context?: Record<string, unknown>;
    }>;
    performance: {
      firstTokenLatencies: number[];
      partialLatencies: number[];
      bargeInLatencies: number[];
      audioProcessingLatencies: number[];
      memoryUsages: number[];
    };
    optimizations: {
      connectionReused: boolean;
      bufferPoolHits: number;
      streamingProcessingUsed: boolean;
      autoOptimizationsTriggered: number;
    };
  };

  // Enhanced configuration with optimization settings
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
      enableStreamingProcessing: boolean;
      enableOptimizedBuffering: boolean;
    };
    performance: {
      targetFirstTokenLatency: number;
      enableAutoOptimization: boolean;
      enablePredictiveProcessing: boolean;
    };
  };

  // Raw WebSocket specific state
  isStreaming: boolean;
  audioBuffer: ArrayBuffer[];
  firstTokenTime?: number;
  totalFrames: number;
}

export interface UnifiedOrchestratorConfig {
  // Base configuration
  httpServer?: Server;
  maxSessions?: number;
  sessionTimeout?: number;
  cleanupInterval?: number;
  heartbeatInterval?: number;

  // WebSocket configuration
  enableRawWebSocket?: boolean;
  enableSocketIO?: boolean;
  maxConnections?: number;
  paths?: {
    rawWebSocket: string;
    socketIO: string;
  };

  // Enhanced performance configuration
  performance: {
    targetFirstTokenMs: number;
    targetPartialLatencyMs: number;
    targetBargeInMs: number;
    enableConnectionPooling: boolean;
    enableStreamingAudio: boolean;
    enablePredictiveProcessing: boolean;
    enableAdaptiveOptimization: boolean;
    enablePerformanceMonitoring: boolean;
  };

  // Optimization settings
  optimization: {
    audioBufferPoolSize: number;
    connectionPoolSize: number;
    enableMemoryPooling: boolean;
    enableSpeculativeProcessing: boolean;
    autoOptimizationThreshold: number;
  };

  // Default session settings with optimizations
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
      enableStreamingProcessing: boolean;
      enableOptimizedBuffering: boolean;
    };
  };
}

// Performance metrics interface
export interface VoicePerformanceMetrics {
  totalSessions: number;
  activeSessions: number;
  avgFirstTokenLatency: number;
  avgPartialLatency: number;
  avgBargeInLatency: number;
  avgAudioProcessingLatency: number;
  errorRate: number;
  totalErrors: number;
  totalTurns: number;
  connectionPoolHitRate: number;
  memoryPoolHitRate: number;
  streamingProcessingRate: number;
  autoOptimizationsTriggered: number;
}

// Circuit breaker interface
export interface VoiceCircuitBreaker {
  failureCount: number;
  failureThreshold: number;
  resetTimeout: number;
  state: 'closed' | 'open' | 'half-open';
  lastFailure: number;
}

// TurnManager event types
export interface TurnManagerEvent {
  type: 'partial_asr' | 'final_asr' | 'barge_in' | 'error';
  text?: string;
  confidence?: number;
  lang?: string;
  message?: string;
  code?: string;
}

// Audio processing configuration
export interface AudioConfig {
  sampleRate: number;
  frameMs: 20 | 40;
  bitrate: number;
  enableVAD: boolean;
  enableStreamingProcessing: boolean;
  enableOptimizedBuffering: boolean;
}

// Voice service status interface
export interface VoiceServiceStatus {
  isRunning: boolean;
  activeSessions: number;
  performance: {
    totalSessions: number;
    avgFirstTokenLatency: number;
    avgPartialLatency: number;
    avgBargeInLatency: number;
    avgAudioProcessingLatency: number;
    errorRate: number;
    connectionPoolHitRate: number;
    streamingProcessingRate: number;
    autoOptimizationsTriggered: number;
  };
  optimizations: {
    connectionPooling: boolean;
    streamingAudio: boolean;
    adaptiveOptimization: boolean;
    performanceMonitoring: boolean;
  };
  components: {
    visualFeedback: any;
    connectionPool: any;
    audioConverter: any;
    performanceMonitor: any;
  };
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    failureThreshold: number;
  };
}