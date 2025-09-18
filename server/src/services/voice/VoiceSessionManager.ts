/**
 * Voice Session Manager - Handles session lifecycle and management
 *
 * Extracted from UnifiedVoiceOrchestrator.ts to maintain ≤300 line limit
 * Manages session creation, cleanup, heartbeat, and expiration
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { createLogger } from '../../shared/utils.js';
import type { UnifiedVoiceSession, UnifiedOrchestratorConfig } from './types/VoiceTypes.js';

const logger = createLogger({ service: 'voice-session-manager' });

export class VoiceSessionManager extends EventEmitter {
  private sessions = new Map<string, UnifiedVoiceSession>();
  private config: UnifiedOrchestratorConfig;
  private cleanupTimer?: NodeJS.Timeout | undefined;

  constructor(config: UnifiedOrchestratorConfig) {
    super();
    this.config = config;
  }

  /**
   * Create a new voice session with optimized configuration
   */
  createSession(tenantId: string, siteId?: string, userId?: string): UnifiedVoiceSession {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionTimeout!);

    const session: UnifiedVoiceSession = {
      id: sessionId,
      tenantId,
      siteId: siteId || undefined,
      userId: userId || undefined,
      connectionType: 'raw_websocket',
      status: 'initializing',
      createdAt: now,
      lastActivity: now,
      expiresAt,
      isActive: true,
      isAlive: true,
      heartbeatLatencies: [],
      lastPingTime: Date.now(),
      missedPongs: 0,
      isStreaming: false,
      audioBuffer: [],
      totalFrames: 0,
      connectionMetrics: {
        establishedAt: now,
        lastActivityAt: now,
        totalMessages: 0,
        avgMessageSize: 0,
        connectionLatency: 0,
      },
      metrics: {
        sessionsStarted: now,
        totalTurns: 0,
        avgResponseTime: 0,
        errors: [],
        performance: {
          firstTokenLatencies: [],
          partialLatencies: [],
          bargeInLatencies: [],
          audioProcessingLatencies: [],
          memoryUsages: [],
        },
        optimizations: {
          connectionReused: false,
          bufferPoolHits: 0,
          streamingProcessingUsed: false,
          autoOptimizationsTriggered: 0,
        },
      },
      config: {
        ...this.config.defaults,
        performance: {
          targetFirstTokenLatency: this.config.performance.targetFirstTokenMs,
          enableAutoOptimization: this.config.performance.enableAdaptiveOptimization,
          enablePredictiveProcessing: this.config.performance.enablePredictiveProcessing,
        },
      },
    };

    this.sessions.set(sessionId, session);
    this.emit('session_created', { sessionId, session });

    logger.info('Voice session created', {
      sessionId,
      tenantId,
      siteId,
      userId,
    });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): UnifiedVoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): UnifiedVoiceSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Get sessions count
   */
  getSessionsCount(): number {
    return this.sessions.size;
  }

  /**
   * Close a session and cleanup resources
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn('Attempted to close non-existent session', { sessionId });
      return;
    }

    try {
      logger.info('Closing voice session', { sessionId, tenantId: session.tenantId });

      // Update session status
      session.status = 'ended';
      session.isActive = false;

      // Stop heartbeat
      if (session.pingInterval) {
        clearInterval(session.pingInterval);
        session.pingInterval = undefined as NodeJS.Timeout | undefined;
      }

      // Clear audio buffers
      if (session.audioBuffer.length > 0) {
        session.audioBuffer = [];
      }

      // Calculate final metrics
      const sessionDuration = Date.now() - session.createdAt.getTime();
      const avgFirstTokenLatency = session.metrics.performance.firstTokenLatencies.length > 0
        ? session.metrics.performance.firstTokenLatencies.reduce((a, b) => a + b) / session.metrics.performance.firstTokenLatencies.length
        : 0;

      logger.info('Session closed with metrics', {
        sessionId,
        duration: sessionDuration,
        totalTurns: session.metrics.totalTurns,
        avgFirstTokenLatency,
        errors: session.metrics.errors.length,
        connectionReused: session.metrics.optimizations.connectionReused
      });

      // Remove from sessions map
      this.sessions.delete(sessionId);
      this.emit('session_closed', { sessionId, session });

    } catch (error) {
      logger.error('Error closing session', { sessionId, error });
      // Force removal even if cleanup failed
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Start session cleanup timer
   */
  startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);

    logger.info('Session cleanup timer started', {
      interval: this.config.cleanupInterval
    });
  }

  /**
   * Stop session cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined as NodeJS.Timeout | undefined;
      logger.info('Session cleanup timer stopped');
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    let inactiveSessions = 0;

    for (const [sessionId, session] of this.sessions) {
      const sessionAge = now - session.createdAt.getTime();
      const lastActivityAge = now - session.lastActivity.getTime();

      // Check if session should be cleaned up
      const shouldCleanup = (
        sessionAge > this.config.sessionTimeout! ||
        lastActivityAge > (this.config.sessionTimeout! / 2) ||
        session.status === 'ended' ||
        session.status === 'error' ||
        (!session.isActive && lastActivityAge > 60000) // 1 minute of inactivity
      );

      if (shouldCleanup) {
        expiredSessions.push(sessionId);
      } else if (!session.isActive) {
        inactiveSessions++;
      }
    }

    // Cleanup expired sessions
    if (expiredSessions.length > 0) {
      logger.info('Cleaning up expired sessions', {
        expiredCount: expiredSessions.length,
        totalSessions: this.sessions.size
      });

      for (const sessionId of expiredSessions) {
        this.closeSession(sessionId).catch(error => {
          logger.error('Error during session cleanup', { sessionId, error });
        });
      }
    }

    // Log cleanup statistics
    if (expiredSessions.length > 0 || inactiveSessions > 0) {
      logger.debug('Session cleanup completed', {
        cleanedSessions: expiredSessions.length,
        inactiveSessions,
        remainingSessions: this.sessions.size - expiredSessions.length
      });
    }
  }

  /**
   * Update session activity
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      session.connectionMetrics.lastActivityAt = new Date();
      session.connectionMetrics.totalMessages++;
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return createHash('sha256')
      .update(`unified-${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Stop session manager and cleanup all sessions
   */
  async stop(): Promise<void> {
    this.stopCleanupTimer();

    // Close all active sessions
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.status !== 'ended');

    await Promise.all(
      activeSessions.map(session => this.closeSession(session.id))
    );

    logger.info('VoiceSessionManager stopped', {
      sessionsClosed: activeSessions.length
    });
  }
}