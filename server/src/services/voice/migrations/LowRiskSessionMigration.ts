/**
 * Low-Risk Session Migration - Tutorial and Recovery Session Consolidation
 *
 * This migration script demonstrates the safe consolidation of tutorial and
 * recovery sessions into the enhanced unified session architecture. It serves
 * as a proof-of-concept for the full consolidation strategy.
 *
 * Migration Priority: LOW RISK
 * - Tutorial sessions (educational flow)
 * - Recovery sessions (error handling)
 *
 * These sessions have minimal performance impact and can be safely migrated
 * without affecting critical voice latency targets.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/utils.js';
import { ConsolidatedSessionService } from '../ConsolidatedSessionService.js';
import { TutorialSessionModuleFactory } from '../modules/TutorialSessionModule.js';
import { RecoverySessionModuleFactory } from '../modules/RecoverySessionModule.js';
import { SessionModuleManager } from '../ConsolidatedSessionTypes.js';
import type { UnifiedVoiceSession } from '../UnifiedVoiceOrchestrator.js';
import type { UserSession } from '../../../infrastructure/auth/session.js';

const logger = createLogger({ service: 'low-risk-migration' });

interface MigrationConfig {
  batchSize: number;
  delayBetweenBatches: number; // ms
  performanceValidation: boolean;
  rollbackOnError: boolean;
  dryRun: boolean;
}

interface MigrationResult {
  success: boolean;
  migratedSessions: number;
  failedSessions: number;
  totalTime: number;
  errors: Array<{
    sessionId: string;
    error: string;
    timestamp: Date;
  }>;
  performanceMetrics: {
    avgMigrationTime: number;
    maxMigrationTime: number;
    minMigrationTime: number;
  };
}

interface LegacyTutorialSession {
  id: string;
  tutorialId: string;
  userId: string;
  startTime: Date;
  currentStepIndex: number;
  progress: any[];
  isActive: boolean;
  adaptiveSettings: any;
  context: any;
}

interface LegacyRecoverySession {
  id: string;
  errorId: string;
  strategy: any;
  startTime: Date;
  currentStep: number;
  status: string;
  userInteraction: boolean;
}

/**
 * Low-Risk Session Migration Manager
 */
export class LowRiskSessionMigration extends EventEmitter {
  private config: MigrationConfig;
  private consolidatedService: ConsolidatedSessionService;
  private moduleManager: SessionModuleManager;
  private migrationInProgress = false;

  // Migration state
  private migratedSessions = new Set<string>();
  private failedMigrations = new Map<string, string>();
  private migrationStartTime?: Date;

  // Performance tracking
  private migrationTimes: number[] = [];
  private performanceIssues: Array<{
    sessionId: string;
    issue: string;
    metric: number;
    threshold: number;
  }> = [];

  constructor(config: Partial<MigrationConfig> = {}) {
    super();

    this.config = {
      batchSize: 5,
      delayBetweenBatches: 1000, // 1 second
      performanceValidation: true,
      rollbackOnError: false,
      dryRun: false,
      ...config
    };

    this.consolidatedService = new ConsolidatedSessionService({
      enablePerformanceValidation: this.config.performanceValidation,
      enableAutomaticMigration: false, // Manual migration control
      performanceThresholds: {
        maxFirstTokenLatency: 200, // ms
        maxMemoryIncrease: 1024 * 1024, // 1MB
        maxProcessingOverhead: 10 // %
      }
    });

    this.moduleManager = SessionModuleManager.getInstance();
    this.setupModuleFactories();

    logger.info('Low-Risk Session Migration initialized', {
      config: this.config
    });
  }

  /**
   * Execute the migration process
   */
  async executeMigration(
    unifiedSessions: UnifiedVoiceSession[],
    userSessions: UserSession[],
    legacyTutorialSessions: LegacyTutorialSession[] = [],
    legacyRecoverySessions: LegacyRecoverySession[] = []
  ): Promise<MigrationResult> {
    if (this.migrationInProgress) {
      throw new Error('Migration already in progress');
    }

    this.migrationInProgress = true;
    this.migrationStartTime = new Date();

    const result: MigrationResult = {
      success: true,
      migratedSessions: 0,
      failedSessions: 0,
      totalTime: 0,
      errors: [],
      performanceMetrics: {
        avgMigrationTime: 0,
        maxMigrationTime: 0,
        minMigrationTime: Infinity
      }
    };

    try {
      logger.info('Starting low-risk session migration', {
        unifiedSessions: unifiedSessions.length,
        legacyTutorialSessions: legacyTutorialSessions.length,
        legacyRecoverySessions: legacyRecoverySessions.length,
        dryRun: this.config.dryRun
      });

      // Phase 1: Migrate unified sessions with tutorial/recovery modules
      await this.migrateUnifiedSessions(unifiedSessions, userSessions, result);

      // Phase 2: Migrate legacy tutorial sessions
      await this.migrateLegacyTutorialSessions(legacyTutorialSessions, userSessions, result);

      // Phase 3: Migrate legacy recovery sessions
      await this.migrateLegacyRecoverySessions(legacyRecoverySessions, userSessions, result);

      // Calculate final metrics
      result.totalTime = Date.now() - this.migrationStartTime!.getTime();
      this.calculateFinalMetrics(result);

      // Validate overall migration performance
      if (this.config.performanceValidation) {
        await this.validateMigrationPerformance(result);
      }

      this.emit('migration_completed', result);

      logger.info('Low-risk session migration completed', {
        success: result.success,
        migratedSessions: result.migratedSessions,
        failedSessions: result.failedSessions,
        totalTime: result.totalTime,
        performanceMetrics: result.performanceMetrics
      });

      return result;

    } catch (error) {
      result.success = false;
      result.errors.push({
        sessionId: 'migration_process',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });

      this.emit('migration_failed', result);

      logger.error('Low-risk session migration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        migratedSessions: result.migratedSessions,
        failedSessions: result.failedSessions
      });

      // Rollback if configured
      if (this.config.rollbackOnError) {
        await this.rollbackMigration(result);
      }

      throw error;

    } finally {
      this.migrationInProgress = false;
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): {
    inProgress: boolean;
    migratedCount: number;
    failedCount: number;
    startTime?: Date;
    performanceIssues: number;
  } {
    const status = {
      inProgress: this.migrationInProgress,
      migratedCount: this.migratedSessions.size,
      failedCount: this.failedMigrations.size,
      performanceIssues: this.performanceIssues.length
    } as const;

    return this.migrationStartTime
      ? { ...status, startTime: this.migrationStartTime }
      : status;
  }

  // ================= PRIVATE METHODS =================

  /**
   * Migrate unified sessions by attaching tutorial/recovery modules
   */
  private async migrateUnifiedSessions(
    unifiedSessions: UnifiedVoiceSession[],
    userSessions: UserSession[],
    result: MigrationResult
  ): Promise<void> {
    logger.info('Starting unified session module attachment', {
      sessionCount: unifiedSessions.length
    });

    const batches = this.createBatches(unifiedSessions, this.config.batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      if (!batch) {
        logger.warn('Unexpected undefined batch', { batchIndex });
        continue;
      }

      logger.debug('Processing batch', {
        batchIndex: batchIndex + 1,
        totalBatches: batches.length,
        batchSize: batch.length
      });

      // Process batch in parallel
      const batchPromises = batch.map(async (session) => {
        const migrationStart = performance.now();

        try {
          // Find corresponding user session
          const userSession = userSessions.find(us => us.tenantId === session.tenantId);
          if (!userSession) {
            throw new Error(`User session not found for tenant ${session.tenantId}`);
          }

          if (!this.config.dryRun) {
            // Migrate to enhanced unified session
            const enhanced = await this.consolidatedService.migrateSession(
              session,
              userSession,
              {
                attachModules: ['tutorial', 'recovery'],
                validatePerformance: this.config.performanceValidation,
                preserveOptimizations: true
              }
            );

            // Verify modules were attached successfully
            if (!enhanced.modules?.tutorial || !enhanced.modules?.recovery) {
              throw new Error('Failed to attach required modules');
            }
          }

          const migrationTime = performance.now() - migrationStart;
          this.migrationTimes.push(migrationTime);
          this.migratedSessions.add(session.id);
          result.migratedSessions++;

          this.emit('session_migrated', {
            sessionId: session.id,
            migrationTime,
            modulesAttached: ['tutorial', 'recovery']
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.failedMigrations.set(session.id, errorMessage);
          result.failedSessions++;
          result.errors.push({
            sessionId: session.id,
            error: errorMessage,
            timestamp: new Date()
          });

          logger.error('Failed to migrate unified session', {
            sessionId: session.id,
            error: errorMessage
          });
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches to avoid overwhelming the system
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenBatches));
      }
    }

    logger.info('Unified session module attachment completed', {
      migratedSessions: result.migratedSessions,
      failedSessions: result.failedSessions
    });
  }

  /**
   * Migrate legacy tutorial sessions
   */
  private async migrateLegacyTutorialSessions(
    legacySessions: LegacyTutorialSession[],
    userSessions: UserSession[],
    result: MigrationResult
  ): Promise<void> {
    logger.info('Starting legacy tutorial session migration', {
      sessionCount: legacySessions.length
    });

    for (const legacySession of legacySessions) {
      const migrationStart = performance.now();

      try {
        // Find corresponding user session
        const userSession = userSessions.find(us => us.userId === legacySession.userId);
        if (!userSession) {
          throw new Error(`User session not found for user ${legacySession.userId}`);
        }

        if (!this.config.dryRun) {
          // Create a mock unified session for migration
          const mockUnifiedSession: UnifiedVoiceSession = this.createMockUnifiedSession(
            legacySession.id,
            userSession
          );

          // Migrate to enhanced session
          const enhanced = await this.consolidatedService.migrateSession(
            mockUnifiedSession,
            userSession,
            {
              attachModules: ['tutorial'],
              validatePerformance: false // Less strict for legacy sessions
            }
          );

          // Restore tutorial state
          if (enhanced.modules?.tutorial) {
            await this.restoreTutorialState(enhanced.modules.tutorial, legacySession);
          }
        }

        const migrationTime = performance.now() - migrationStart;
        this.migrationTimes.push(migrationTime);
        result.migratedSessions++;

        this.emit('legacy_tutorial_migrated', {
          sessionId: legacySession.id,
          migrationTime
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.failedSessions++;
        result.errors.push({
          sessionId: legacySession.id,
          error: errorMessage,
          timestamp: new Date()
        });

        logger.error('Failed to migrate legacy tutorial session', {
          sessionId: legacySession.id,
          error: errorMessage
        });
      }
    }
  }

  /**
   * Migrate legacy recovery sessions
   */
  private async migrateLegacyRecoverySessions(
    legacySessions: LegacyRecoverySession[],
    userSessions: UserSession[],
    result: MigrationResult
  ): Promise<void> {
    logger.info('Starting legacy recovery session migration', {
      sessionCount: legacySessions.length
    });

    for (const legacySession of legacySessions) {
      const migrationStart = performance.now();

      try {
        // Find any user session (recovery sessions are less tied to specific users)
        const userSession = userSessions[0];
        if (!userSession) {
          throw new Error('No user session available for recovery session migration');
        }

        if (!this.config.dryRun) {
          // Create a mock unified session for migration
          const mockUnifiedSession: UnifiedVoiceSession = this.createMockUnifiedSession(
            legacySession.id,
            userSession
          );

          // Migrate to enhanced session
          const enhanced = await this.consolidatedService.migrateSession(
            mockUnifiedSession,
            userSession,
            {
              attachModules: ['recovery'],
              validatePerformance: false
            }
          );

          // Restore recovery state
          if (enhanced.modules?.recovery) {
            await this.restoreRecoveryState(enhanced.modules.recovery, legacySession);
          }
        }

        const migrationTime = performance.now() - migrationStart;
        this.migrationTimes.push(migrationTime);
        result.migratedSessions++;

        this.emit('legacy_recovery_migrated', {
          sessionId: legacySession.id,
          migrationTime
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.failedSessions++;
        result.errors.push({
          sessionId: legacySession.id,
          error: errorMessage,
          timestamp: new Date()
        });

        logger.error('Failed to migrate legacy recovery session', {
          sessionId: legacySession.id,
          error: errorMessage
        });
      }
    }
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Create mock unified session for legacy migration
   */
  private createMockUnifiedSession(
    sessionId: string,
    userSession: UserSession
  ): UnifiedVoiceSession {
    const now = new Date();

    return {
      id: sessionId,
      tenantId: userSession.tenantId,
      userId: userSession.userId,
      connectionType: 'socket_io',
      status: 'ready',
      createdAt: now,
      lastActivity: now,
      expiresAt: new Date(now.getTime() + 300000), // 5 minutes
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
        locale: 'en-US',
        voice: 'alloy',
        maxDuration: 300,
        audioConfig: {
          sampleRate: 24000,
          frameMs: 20,
          inputFormat: 'pcm16',
          outputFormat: 'pcm16',
          enableVAD: true,
          enableStreamingProcessing: true,
          enableOptimizedBuffering: true,
        },
        performance: {
          targetFirstTokenLatency: 200,
          enableAutoOptimization: true,
          enablePredictiveProcessing: true,
        },
      },
    };
  }

  /**
   * Restore tutorial state from legacy session
   */
  private async restoreTutorialState(
    _tutorialModule: any,
    legacySession: LegacyTutorialSession
  ): Promise<void> {
    // Would restore tutorial progress and state
    logger.debug('Restoring tutorial state', {
      sessionId: legacySession.id,
      currentStepIndex: legacySession.currentStepIndex
    });
  }

  /**
   * Restore recovery state from legacy session
   */
  private async restoreRecoveryState(
    _recoveryModule: any,
    legacySession: LegacyRecoverySession
  ): Promise<void> {
    // Would restore recovery progress and state
    logger.debug('Restoring recovery state', {
      sessionId: legacySession.id,
      currentStep: legacySession.currentStep
    });
  }

  /**
   * Calculate final performance metrics
   */
  private calculateFinalMetrics(result: MigrationResult): void {
    if (this.migrationTimes.length > 0) {
      result.performanceMetrics.avgMigrationTime =
        this.migrationTimes.reduce((sum, time) => sum + time, 0) / this.migrationTimes.length;
      result.performanceMetrics.maxMigrationTime = Math.max(...this.migrationTimes);
      result.performanceMetrics.minMigrationTime = Math.min(...this.migrationTimes);
    }
  }

  /**
   * Validate migration performance
   */
  private async validateMigrationPerformance(result: MigrationResult): Promise<void> {
    const avgMigrationTime = result.performanceMetrics.avgMigrationTime;
    const maxAcceptableTime = 5000; // 5 seconds per session

    if (avgMigrationTime > maxAcceptableTime) {
      this.performanceIssues.push({
        sessionId: 'migration_process',
        issue: 'Average migration time exceeded threshold',
        metric: avgMigrationTime,
        threshold: maxAcceptableTime
      });

      logger.warn('Migration performance issue detected', {
        avgMigrationTime,
        threshold: maxAcceptableTime
      });
    }

    // Validate that no critical performance degradation occurred
    if (result.failedSessions > result.migratedSessions * 0.1) { // More than 10% failure rate
      throw new Error(`High failure rate detected: ${result.failedSessions}/${result.migratedSessions + result.failedSessions} sessions failed`);
    }
  }

  /**
   * Rollback migration
   */
  private async rollbackMigration(result: MigrationResult): Promise<void> {
    logger.warn('Rolling back migration due to errors', {
      migratedSessions: result.migratedSessions
    });

    // Would implement rollback logic here
    // For now, just log the rollback attempt
    this.emit('migration_rollback', {
      migratedSessions: Array.from(this.migratedSessions),
      reason: 'Error threshold exceeded'
    });
  }

  /**
   * Setup module factories
   */
  private setupModuleFactories(): void {
    this.moduleManager.registerModuleFactory('tutorial', new TutorialSessionModuleFactory());
    this.moduleManager.registerModuleFactory('recovery', new RecoverySessionModuleFactory());

    logger.debug('Module factories registered for migration');
  }
}

/**
 * Factory function for creating migration manager
 */
export function createLowRiskSessionMigration(
  config?: Partial<MigrationConfig>
): LowRiskSessionMigration {
  return new LowRiskSessionMigration(config);
}

/**
 * Execute a demonstration migration
 */
export async function demonstrateLowRiskMigration(): Promise<MigrationResult> {
  const migration = createLowRiskSessionMigration({
    batchSize: 3,
    delayBetweenBatches: 500,
    performanceValidation: true,
    rollbackOnError: false,
    dryRun: true // Safe demonstration mode
  });

  // Create mock data for demonstration
  const mockUnifiedSessions: UnifiedVoiceSession[] = []; // Would be populated with real sessions
  const mockUserSessions: UserSession[] = []; // Would be populated with real user sessions
  const mockTutorialSessions: LegacyTutorialSession[] = [];
  const mockRecoverySessions: LegacyRecoverySession[] = [];

  logger.info('Starting demonstration migration (dry run mode)');

  return await migration.executeMigration(
    mockUnifiedSessions,
    mockUserSessions,
    mockTutorialSessions,
    mockRecoverySessions
  );
}