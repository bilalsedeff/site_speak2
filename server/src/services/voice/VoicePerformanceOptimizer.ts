/**
 * Voice Performance Optimizer - Handles performance monitoring and optimization
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Manages adaptive optimization, circuit breaker, and performance metrics
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import { voicePerformanceMonitor } from './VoicePerformanceMonitor.js';
import { realtimeConnectionPool } from './RealtimeConnectionPool.js';
import type {
  UnifiedVoiceSession,
  VoicePerformanceMetrics,
  VoiceCircuitBreaker,
  UnifiedOrchestratorConfig
} from './types/VoiceTypes.js';

const logger = createLogger({ service: 'voice-performance-optimizer' });

export class VoicePerformanceOptimizer extends EventEmitter {
  private config: UnifiedOrchestratorConfig;
  private optimizationTimer?: NodeJS.Timeout;

  // Enhanced performance tracking
  private performanceMetrics: VoicePerformanceMetrics = {
    totalSessions: 0,
    activeSessions: 0,
    avgFirstTokenLatency: 0,
    avgPartialLatency: 0,
    avgBargeInLatency: 0,
    avgAudioProcessingLatency: 0,
    errorRate: 0,
    totalErrors: 0,
    totalTurns: 0,
    connectionPoolHitRate: 0,
    memoryPoolHitRate: 0,
    streamingProcessingRate: 0,
    autoOptimizationsTriggered: 0,
  };

  // Circuit breaker for error handling
  private circuitBreaker: VoiceCircuitBreaker = {
    failureCount: 0,
    failureThreshold: 10,
    resetTimeout: 30000, // 30 seconds
    state: 'closed',
    lastFailure: 0,
  };

  constructor(config: UnifiedOrchestratorConfig) {
    super();
    this.config = config;
  }

  /**
   * Start performance monitoring and optimization
   */
  start(): void {
    if (this.config.performance.enablePerformanceMonitoring) {
      this.initializePerformanceMonitoring();
    }

    if (this.config.performance.enableAdaptiveOptimization) {
      this.startOptimizationTimer();
    }

    logger.info('VoicePerformanceOptimizer started', {
      performanceMonitoring: this.config.performance.enablePerformanceMonitoring,
      adaptiveOptimization: this.config.performance.enableAdaptiveOptimization
    });
  }

  /**
   * Stop performance optimization
   */
  stop(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined as unknown as typeof this.optimizationTimer;
    }

    if (this.config.performance.enablePerformanceMonitoring) {
      voicePerformanceMonitor.stop();
    }

    logger.info('VoicePerformanceOptimizer stopped');
  }

  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    voicePerformanceMonitor.start();
    logger.info('Performance monitoring initialized');
  }

  /**
   * Start automatic optimization monitoring
   */
  private startOptimizationTimer(): void {
    this.optimizationTimer = setInterval(() => {
      this.performAdaptiveOptimization();
    }, 10000); // Check every 10 seconds

    logger.info('Adaptive optimization timer started');
  }

  /**
   * Perform adaptive optimization based on performance metrics
   */
  private async performAdaptiveOptimization(): Promise<void> {
    const snapshot = voicePerformanceMonitor.getCurrentSnapshot();
    let optimizationsApplied = 0;

    try {
      // Check first token latency optimization
      if (snapshot.firstTokenLatency.p95 > this.config.performance.targetFirstTokenMs) {
        logger.warn('First token latency exceeding target, applying optimizations', {
          current: snapshot.firstTokenLatency.p95,
          target: this.config.performance.targetFirstTokenMs
        });

        // Enable speculative processing if not already enabled
        if (!this.config.optimization.enableSpeculativeProcessing) {
          this.config.optimization.enableSpeculativeProcessing = true;
          optimizationsApplied++;
          logger.info('Enabled speculative processing for latency optimization');
        }

        // Suggest connection pool optimization
        const currentPoolSize = realtimeConnectionPool.getConfig().maxTotalConnections;
        if (currentPoolSize < 150) {
          optimizationsApplied++;
          logger.info('Connection pool optimization suggested', {
            currentSize: currentPoolSize,
            suggestedIncrease: 25
          });
        }
      }

      // Check audio processing latency optimization
      if (snapshot.audioProcessing.avgLatency > this.config.performance.targetPartialLatencyMs) {
        logger.warn('Audio processing latency high, optimizing audio pipeline', {
          current: snapshot.audioProcessing.avgLatency,
          target: this.config.performance.targetPartialLatencyMs
        });

        this.emit('audio_optimization_needed', {
          currentLatency: snapshot.audioProcessing.avgLatency,
          target: this.config.performance.targetPartialLatencyMs
        });

        optimizationsApplied++;
      }

      // Check memory optimization
      if (snapshot.memoryUsage.poolEfficiency < 0.7) {
        logger.warn('Buffer pool efficiency low, optimizing memory usage', {
          efficiency: snapshot.memoryUsage.poolEfficiency
        });

        this.emit('memory_optimization_needed', {
          efficiency: snapshot.memoryUsage.poolEfficiency
        });

        optimizationsApplied++;
      }

      // Check circuit breaker state
      if (this.circuitBreaker.state === 'open') {
        const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
        if (timeSinceLastFailure > this.circuitBreaker.resetTimeout) {
          this.circuitBreaker.state = 'half-open';
          this.circuitBreaker.failureCount = Math.floor(this.circuitBreaker.failureCount / 2);
          logger.info('Circuit breaker transitioning to half-open state');
          optimizationsApplied++;
        }
      }

      // Update metrics
      if (optimizationsApplied > 0) {
        this.performanceMetrics.autoOptimizationsTriggered += optimizationsApplied;

        logger.info('Adaptive optimization completed', {
          optimizationsApplied,
          totalOptimizations: this.performanceMetrics.autoOptimizationsTriggered
        });

        this.emit('optimization_applied', {
          optimizationsApplied,
          snapshot,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error('Error during adaptive optimization', { error });
    }
  }

  /**
   * Handle circuit breaker failure
   */
  handleCircuitBreakerFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'open';
      logger.warn('Circuit breaker opened due to excessive failures', {
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.circuitBreaker.failureThreshold
      });

      this.emit('circuit_breaker_opened', {
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.circuitBreaker.failureThreshold
      });
    }
  }

  /**
   * Update session performance metrics
   */
  updateSessionMetrics(session: UnifiedVoiceSession, _duration: number): void {
    // Calculate averages
    const avgFirstToken = session.metrics.performance.firstTokenLatencies.length > 0
      ? session.metrics.performance.firstTokenLatencies.reduce((a, b) => a + b) / session.metrics.performance.firstTokenLatencies.length
      : 0;

    const avgAudioProcessing = session.metrics.performance.audioProcessingLatencies.length > 0
      ? session.metrics.performance.audioProcessingLatencies.reduce((a, b) => a + b) / session.metrics.performance.audioProcessingLatencies.length
      : 0;

    // Update global metrics
    this.performanceMetrics.avgFirstTokenLatency =
      (this.performanceMetrics.avgFirstTokenLatency + avgFirstToken) / 2;

    this.performanceMetrics.avgAudioProcessingLatency =
      (this.performanceMetrics.avgAudioProcessingLatency + avgAudioProcessing) / 2;

    this.performanceMetrics.totalErrors += session.metrics.errors.length;
    this.performanceMetrics.totalTurns += session.metrics.totalTurns;
    this.performanceMetrics.errorRate =
      this.performanceMetrics.totalSessions > 0
        ? this.performanceMetrics.totalErrors / this.performanceMetrics.totalSessions
        : 0;
  }

  /**
   * Update performance metrics for new session
   */
  recordSessionStart(): void {
    this.performanceMetrics.totalSessions++;
    this.performanceMetrics.activeSessions++;
  }

  /**
   * Update performance metrics for session end
   */
  recordSessionEnd(): void {
    this.performanceMetrics.activeSessions = Math.max(0, this.performanceMetrics.activeSessions - 1);
  }

  /**
   * Optimize session configuration based on performance data
   */
  optimizeSessionConfig(sessions: Map<string, UnifiedVoiceSession>): void {
    // Enable streaming processing for sessions with high latency
    for (const [sessionId, session] of sessions) {
      const avgAudioLatency = session.metrics.performance.audioProcessingLatencies.length > 0
        ? session.metrics.performance.audioProcessingLatencies.reduce((a, b) => a + b) / session.metrics.performance.audioProcessingLatencies.length
        : 0;

      if (avgAudioLatency > this.config.performance.targetPartialLatencyMs) {
        if (!session.metrics.optimizations.streamingProcessingUsed) {
          session.config.audioConfig.enableStreamingProcessing = true;
          session.metrics.optimizations.streamingProcessingUsed = true;
          logger.debug('Enabled streaming processing for session', { sessionId });
        }
      }

      // Enable optimized buffering for sessions with low buffer pool efficiency
      if (!session.config.audioConfig.enableOptimizedBuffering) {
        session.config.audioConfig.enableOptimizedBuffering = true;
        session.metrics.optimizations.bufferPoolHits++;
        logger.debug('Enabled optimized buffering for session', { sessionId });
      }

      // Track optimization counts
      if (session.metrics.optimizations.autoOptimizationsTriggered > 0) {
        session.metrics.optimizations.autoOptimizationsTriggered++;
      }
    }
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): VoicePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): VoiceCircuitBreaker {
    return { ...this.circuitBreaker };
  }

  /**
   * Get optimization status
   */
  getOptimizationStatus() {
    return {
      isRunning: !!this.optimizationTimer,
      performanceMonitoring: this.config.performance.enablePerformanceMonitoring,
      adaptiveOptimization: this.config.performance.enableAdaptiveOptimization,
      connectionPooling: this.config.performance.enableConnectionPooling,
      streamingAudio: this.config.performance.enableStreamingAudio,
      currentSnapshot: this.config.performance.enablePerformanceMonitoring
        ? voicePerformanceMonitor.getCurrentSnapshot()
        : null,
    };
  }
}