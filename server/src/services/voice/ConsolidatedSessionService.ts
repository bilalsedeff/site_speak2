/**
 * Consolidated Session Service - Implementation of enhanced session management
 *
 * This service implements the business logic for the consolidated session architecture,
 * providing migration utilities and managing specialized session modules while
 * maintaining ≤200ms voice latency and preserving data integrity.
 *
 * Features:
 * - Safe migration from existing session types
 * - Module attachment/detachment for specialized functionality
 * - Performance monitoring and validation
 * - Business logic implementation for conversation tracking
 * - Multi-provider configuration management
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils.js';
import {
  SessionModuleManager,
  SessionMigrationUtils,
  type EnhancedUnifiedSession,
  type BargeInSessionModule,
  type ConversationFlowItem,
  type SessionQualityMetrics,
  type VoiceSettings,
  type PerformanceValidationResult
} from './ConsolidatedSessionTypes.js';
import type { UnifiedVoiceSession } from './UnifiedVoiceOrchestrator.js';
import type { VoiceInteraction } from '../../modules/voice/domain/entities/VoiceSession.js';
import type { UserSession } from '../../infrastructure/auth/session.js';

const logger = createLogger({ service: 'consolidated-session' });

/**
 * Configuration for the Consolidated Session Service
 */
export interface ConsolidatedSessionConfig {
  enablePerformanceValidation: boolean;
  enableAutomaticMigration: boolean;
  performanceThresholds: {
    maxFirstTokenLatency: number; // ms
    maxMemoryIncrease: number; // bytes
    maxProcessingOverhead: number; // %
  };
  moduleConfig: {
    enableBargeIn: boolean;
    enableTutorial: boolean;
    enableRecovery: boolean;
    enableCrawling: boolean;
  };
  migration: {
    batchSize: number;
    rollbackOnError: boolean;
    validateBeforeMigration: boolean;
  };
}

/**
 * Consolidated Session Service - Main service class
 */
export class ConsolidatedSessionService extends EventEmitter {
  private config: ConsolidatedSessionConfig;
  private sessions = new Map<string, EnhancedUnifiedSession>();
  private moduleManager: SessionModuleManager;
  private migrationInProgress = new Set<string>();

  // Performance monitoring
  private performanceMetrics = {
    migrationsCompleted: 0,
    migrationErrors: 0,
    avgMigrationTime: 0,
    performanceValidationFailures: 0,
    moduleAttachments: {
      bargeIn: 0,
      tutorial: 0,
      recovery: 0,
      crawling: 0
    }
  };

  constructor(config: Partial<ConsolidatedSessionConfig> = {}) {
    super();

    this.config = {
      enablePerformanceValidation: true,
      enableAutomaticMigration: false,
      performanceThresholds: {
        maxFirstTokenLatency: 200, // ms
        maxMemoryIncrease: 1024 * 1024, // 1MB
        maxProcessingOverhead: 10 // %
      },
      moduleConfig: {
        enableBargeIn: true,
        enableTutorial: true,
        enableRecovery: true,
        enableCrawling: true
      },
      migration: {
        batchSize: 10,
        rollbackOnError: true,
        validateBeforeMigration: true
      },
      ...config
    };

    // Initialize module manager
    this.moduleManager = SessionModuleManager.getInstance();
    this.setupModuleFactories();

    logger.info('ConsolidatedSessionService initialized', {
      performanceValidation: this.config.enablePerformanceValidation,
      enabledModules: Object.keys(this.config.moduleConfig).filter(
        key => this.config.moduleConfig[key as keyof typeof this.config.moduleConfig]
      )
    });
  }

  /**
   * Migrate UnifiedVoiceSession to EnhancedUnifiedSession
   */
  async migrateSession(
    originalSession: UnifiedVoiceSession,
    userSession: UserSession,
    options: {
      attachModules?: string[];
      validatePerformance?: boolean;
      preserveOptimizations?: boolean;
    } = {}
  ): Promise<EnhancedUnifiedSession> {
    const sessionId = originalSession.id;
    const startTime = performance.now();

    // Prevent concurrent migrations
    if (this.migrationInProgress.has(sessionId)) {
      throw new Error(`Migration already in progress for session ${sessionId}`);
    }

    this.migrationInProgress.add(sessionId);

    try {
      logger.info('Starting session migration', {
        sessionId,
        tenantId: originalSession.tenantId,
        connectionType: originalSession.connectionType
      });

      // Step 1: Pre-migration validation
      if (this.config.migration.validateBeforeMigration) {
        await this.validateSessionForMigration(originalSession);
      }

      // Step 2: Perform the core migration
      const enhanced = await this.performCoreMigration(originalSession, userSession, options);

      // Step 3: Attach requested modules
      if (options.attachModules && options.attachModules.length > 0) {
        await this.attachRequestedModules(enhanced, options.attachModules);
      }

      // Step 4: Performance validation
      if (options.validatePerformance || this.config.enablePerformanceValidation) {
        const validation = await this.validateMigrationPerformance(originalSession, enhanced);
        if (!validation.passed) {
          throw new Error(`Performance validation failed: ${validation.issues.map(i => i.message).join(', ')}`);
        }
      }

      // Step 5: Store and emit success
      this.sessions.set(sessionId, enhanced);

      const migrationTime = performance.now() - startTime;
      this.updateMigrationMetrics(migrationTime, true);

      this.emit('session_migrated', {
        sessionId,
        migrationTime,
        modulesAttached: options.attachModules || []
      });

      logger.info('Session migration completed successfully', {
        sessionId,
        migrationTime,
        modulesAttached: options.attachModules?.length || 0
      });

      return enhanced;

    } catch (error) {
      this.updateMigrationMetrics(performance.now() - startTime, false);

      logger.error('Session migration failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.emit('session_migration_failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;

    } finally {
      this.migrationInProgress.delete(sessionId);
    }
  }

  /**
   * Attach a specialized module to an existing session
   */
  async attachModule(
    sessionId: string,
    moduleType: 'bargeIn' | 'tutorial' | 'recovery' | 'crawling',
    config?: Record<string, unknown>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if module type is enabled
    const moduleKey = moduleType as keyof typeof this.config.moduleConfig;
    if (!this.config.moduleConfig[moduleKey]) {
      throw new Error(`Module type ${moduleType} is disabled in configuration`);
    }

    try {
      logger.info('Attaching module to session', { sessionId, moduleType });

      const module = await this.moduleManager.attachModule(session, moduleType, config);

      // Update metrics
      this.performanceMetrics.moduleAttachments[moduleType]++;

      // Special handling for performance-critical modules
      if (moduleType === 'bargeIn') {
        await this.validateBargeInPerformance(module as BargeInSessionModule);
      }

      this.emit('module_attached', { sessionId, moduleType, moduleId: module.moduleId });

      logger.info('Module attached successfully', {
        sessionId,
        moduleType,
        moduleId: module.moduleId
      });

    } catch (error) {
      logger.error('Failed to attach module', {
        sessionId,
        moduleType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Detach a module from a session
   */
  async detachModule(
    sessionId: string,
    moduleType: 'bargeIn' | 'tutorial' | 'recovery' | 'crawling'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      await this.moduleManager.detachModule(session, moduleType);

      this.emit('module_detached', { sessionId, moduleType });

      logger.info('Module detached successfully', { sessionId, moduleType });

    } catch (error) {
      logger.error('Failed to detach module', {
        sessionId,
        moduleType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Add interaction to session with business logic
   */
  async addInteraction(
    sessionId: string,
    interaction: Omit<VoiceInteraction, 'id' | 'sessionId' | 'createdAt'>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const fullInteraction: VoiceInteraction = {
      ...interaction,
      id: crypto.randomUUID(),
      sessionId,
      createdAt: new Date()
    };

    // Add to interactions array
    session.businessLogic.interactions.push(fullInteraction);

    // Update conversation history
    const flowItem: ConversationFlowItem = {
      id: fullInteraction.id,
      type: interaction.type === 'user_speech' ? 'user' :
            interaction.type === 'assistant_speech' ? 'assistant' : 'system',
      content: interaction.transcript || '[Audio]',
      timestamp: fullInteraction.createdAt,
      metadata: {
        ...(interaction.confidence !== undefined && { confidence: interaction.confidence }),
        ...(interaction.metadata?.processingTime !== undefined && { processingTime: interaction.metadata.processingTime }),
        ...(interaction.metadata?.emotion !== undefined && { emotion: interaction.metadata.emotion }),
        ...(interaction.metadata?.intent !== undefined && { intent: interaction.metadata.intent })
      }
    };

    session.businessLogic.conversationHistory.items.push(flowItem);
    session.businessLogic.conversationHistory.totalTurns++;

    // Update quality metrics
    session.businessLogic.qualityMetrics = this.calculateQualityMetrics(session);

    // Update language tracking
    if (interaction.metadata?.language) {
      const languages = session.businessLogic.conversationHistory.languages;
      if (!languages.includes(interaction.metadata.language)) {
        languages.push(interaction.metadata.language);
      }
    }

    logger.debug('Interaction added to session', {
      sessionId,
      interactionId: fullInteraction.id,
      type: interaction.type,
      totalInteractions: session.businessLogic.interactions.length
    });

    this.emit('interaction_added', {
      sessionId,
      interaction: fullInteraction
    });
  }

  /**
   * Update voice settings for a session
   */
  async updateVoiceSettings(
    sessionId: string,
    settings: Partial<VoiceSettings>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update TTS provider settings
    session.providerConfig.tts.settings = {
      ...session.providerConfig.tts.settings,
      ...settings
    };

    // Update the base session config as well for compatibility
    if (settings.name) {
      session.config.voice = settings.name;
    }

    logger.debug('Voice settings updated', { sessionId, settings });

    this.emit('voice_settings_updated', { sessionId, settings });
  }

  /**
   * Get conversation flow for a session
   */
  getConversationFlow(sessionId: string): ConversationFlowItem[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return session.businessLogic.conversationHistory.items;
  }

  /**
   * Get session quality metrics
   */
  getQualityMetrics(sessionId: string): SessionQualityMetrics {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return session.businessLogic.qualityMetrics;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): EnhancedUnifiedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a tenant
   */
  getSessionsByTenant(tenantId: string): EnhancedUnifiedSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.tenantId === tenantId
    );
  }

  /**
   * Get service performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      activeSessions: this.sessions.size,
      sessionsInMigration: this.migrationInProgress.size
    };
  }

  // ================= PRIVATE METHODS =================

  /**
   * Perform the core migration logic
   */
  private async performCoreMigration(
    originalSession: UnifiedVoiceSession,
    userSession: UserSession,
    options: { preserveOptimizations?: boolean }
  ): Promise<EnhancedUnifiedSession> {
    // Use the migration utility from ConsolidatedSessionTypes
    const enhanced = await SessionMigrationUtils.migrateToEnhanced(
      originalSession,
      userSession,
      {
        ...(options.preserveOptimizations !== undefined && { preserveModules: options.preserveOptimizations }),
        validatePerformance: true
      }
    );

    // Implement the business logic methods
    enhanced.businessLogic.methods = {
      addInteraction: async (interaction) => {
        await this.addInteraction(enhanced.id, interaction);
      },
      updateVoiceSettings: async (settings) => {
        await this.updateVoiceSettings(enhanced.id, settings);
      },
      getConversationFlow: () => {
        return this.getConversationFlow(enhanced.id);
      },
      calculateQualityMetrics: () => {
        return this.calculateQualityMetrics(enhanced);
      }
    };

    // Populate device context from user agent if available
    if (userSession.userAgent) {
      enhanced.deviceContext = this.parseDeviceContext(userSession.userAgent);
    }

    // Set authentication permissions (would typically come from auth service)
    enhanced.authContext.permissions = ['voice:use', 'session:manage']; // Default permissions

    return enhanced;
  }

  /**
   * Attach requested modules to the session
   */
  private async attachRequestedModules(
    session: EnhancedUnifiedSession,
    moduleTypes: string[]
  ): Promise<void> {
    for (const moduleType of moduleTypes) {
      if (this.isValidModuleType(moduleType)) {
        await this.attachModule(session.id, moduleType as any);
      } else {
        logger.warn('Invalid module type requested', { moduleType });
      }
    }
  }

  /**
   * Validate session before migration
   */
  private async validateSessionForMigration(session: UnifiedVoiceSession): Promise<void> {
    // Check if session is in a valid state for migration
    if (session.status === 'error') {
      throw new Error('Cannot migrate session in error state');
    }

    if (!session.tenantId) {
      throw new Error('Session missing tenant ID');
    }

    // Check for any active operations that would block migration
    if (session.isStreaming) {
      logger.warn('Migrating session while streaming is active', { sessionId: session.id });
    }
  }

  /**
   * Validate migration performance impact
   */
  private async validateMigrationPerformance(
    original: UnifiedVoiceSession,
    enhanced: EnhancedUnifiedSession
  ): Promise<PerformanceValidationResult> {
    const validation = SessionMigrationUtils.validatePerformance(original, enhanced);

    // Additional service-level validations
    if (enhanced.config.performance.targetFirstTokenLatency > this.config.performanceThresholds.maxFirstTokenLatency) {
      validation.passed = false;
      validation.issues.push({
        level: 'error',
        message: `First token latency target ${enhanced.config.performance.targetFirstTokenLatency}ms exceeds limit ${this.config.performanceThresholds.maxFirstTokenLatency}ms`,
        impact: 'latency'
      });
    }

    if (!validation.passed) {
      this.performanceMetrics.performanceValidationFailures++;
    }

    return validation;
  }

  /**
   * Validate barge-in module performance
   */
  private async validateBargeInPerformance(module: BargeInSessionModule): Promise<void> {
    const vadLatencyTarget = module.isolatedProcessing.latencyTargets.vadDecision;
    const bargeInLatencyTarget = module.isolatedProcessing.latencyTargets.bargeInResponse;

    if (vadLatencyTarget > 20) {
      throw new Error(`VAD latency target ${vadLatencyTarget}ms exceeds 20ms limit`);
    }

    if (bargeInLatencyTarget > 50) {
      throw new Error(`Barge-in latency target ${bargeInLatencyTarget}ms exceeds 50ms limit`);
    }

    logger.info('Barge-in module performance validated', {
      moduleId: module.moduleId,
      vadTarget: vadLatencyTarget,
      bargeInTarget: bargeInLatencyTarget
    });
  }

  /**
   * Calculate quality metrics for a session
   */
  private calculateQualityMetrics(session: EnhancedUnifiedSession): SessionQualityMetrics {
    const interactions = session.businessLogic.interactions;
    const userInteractions = interactions.filter(i => i.type === 'user_speech');
    const assistantInteractions = interactions.filter(i => i.type === 'assistant_speech');

    const avgConfidence = userInteractions.length > 0
      ? userInteractions.reduce((sum, i) => sum + (i.confidence || 0), 0) / userInteractions.length
      : 0;

    const avgResponseTime = assistantInteractions.length > 0
      ? assistantInteractions.reduce((sum, i) => sum + (i.metadata?.processingTime || 0), 0) / assistantInteractions.length
      : 0;

    const sessionDuration = Date.now() - session.createdAt.getTime();
    const errorRate = session.metrics.errors.length / Math.max(interactions.length, 1);
    const languages = session.businessLogic.conversationHistory.languages;

    return {
      speechRecognitionAccuracy: avgConfidence,
      averageResponseTime: avgResponseTime,
      totalInteractions: interactions.length,
      sessionDuration,
      languageConsistency: languages.length <= 1,
      errorRate
    };
  }

  /**
   * Parse device context from user agent
   */
  private parseDeviceContext(userAgent: string) {
    // Simple user agent parsing - would be more sophisticated in production
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    const isTablet = /iPad|Android.*(?!.*Mobile)/.test(userAgent);

    let device: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (isTablet) {device = 'tablet';}
    else if (isMobile) {device = 'mobile';}

    const browser = this.getBrowserFromUserAgent(userAgent);

    return {
      device,
      browser,
      capabilities: {
        microphonePermission: true, // Would need to check actual permissions
        speakerSupport: true,
        audioWorkletSupport: true, // Would need to check browser support
        webAssemblySupport: true
      },
      networkInfo: {
        type: 'unknown' as const,
        effectiveType: '4g' as const,
        rtt: 50 // Default estimate
      }
    };
  }

  /**
   * Extract browser name from user agent
   */
  private getBrowserFromUserAgent(userAgent: string): string {
    if (userAgent.includes('Chrome')) {return 'Chrome';}
    if (userAgent.includes('Firefox')) {return 'Firefox';}
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {return 'Safari';}
    if (userAgent.includes('Edge')) {return 'Edge';}
    return 'Unknown';
  }

  /**
   * Check if module type is valid
   */
  private isValidModuleType(moduleType: string): boolean {
    return ['bargeIn', 'tutorial', 'recovery', 'crawling'].includes(moduleType);
  }

  /**
   * Update migration performance metrics
   */
  private updateMigrationMetrics(migrationTime: number, success: boolean): void {
    if (success) {
      this.performanceMetrics.migrationsCompleted++;
      this.performanceMetrics.avgMigrationTime =
        (this.performanceMetrics.avgMigrationTime + migrationTime) / 2;
    } else {
      this.performanceMetrics.migrationErrors++;
    }
  }

  /**
   * Setup module factories for different module types
   */
  private setupModuleFactories(): void {
    // Register factories for each module type
    // These would be implemented based on the specific module requirements

    this.moduleManager.registerModuleFactory('bargeIn', {
      create: async (sessionId: string, _config?: Record<string, unknown>) => {
        // BargeIn module factory implementation
        return {
          sessionRef: sessionId,
          moduleId: `bargein_${Date.now()}`,
          isolatedProcessing: {
            latencyTargets: {
              vadDecision: 20,
              bargeInResponse: 50,
              ttsInterruption: 30
            },
            fallbackStrategy: 'graceful-degrade' as const
          },
          vadState: {
            active: false,
            lastDecision: {
              active: false,
              confidence: 0,
              level: 0,
              timestamp: Date.now(),
              latency: 0,
              characteristics: {
                energy: 0,
                zeroCrossingRate: 0,
                isLikelySpeech: false
              }
            },
            consecutiveActiveFrames: 0,
            consecutiveInactiveFrames: 0
          },
          ttsState: {
            isPlaying: false,
            isDucked: false,
            currentPosition: 0,
            totalDuration: 0,
            volume: 1.0,
            playbackRate: 1.0,
            sourceId: ''
          },
          metrics: {
            totalBargeInEvents: 0,
            avgBargeInLatency: 0,
            minBargeInLatency: Infinity,
            maxBargeInLatency: 0,
            falsePositives: 0,
            missedDetections: 0,
            latencyDistribution: {
              p50: 0,
              p95: 0,
              p99: 0
            }
          }
        } as BargeInSessionModule;
      }
    });

    // Additional module factories would be registered here
    logger.debug('Module factories registered');
  }
}

/**
 * Factory function for creating ConsolidatedSessionService
 */
export function createConsolidatedSessionService(
  config?: Partial<ConsolidatedSessionConfig>
): ConsolidatedSessionService {
  return new ConsolidatedSessionService(config);
}

/**
 * Singleton instance for global use
 */
export const consolidatedSessionService = new ConsolidatedSessionService();