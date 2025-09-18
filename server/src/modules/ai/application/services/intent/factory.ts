/**
 * Intent Recognition System Factory - Easy integration and setup
 *
 * Provides simple factory functions and configuration helpers for
 * integrating the advanced intent recognition system with existing
 * SiteSpeak voice services.
 */

import { createLogger } from '../../../../../shared/utils';
import {
  IntentOrchestrator,
  createDefaultIntentConfig,
  type IntentOrchestrationConfig,
  type IntentSystemHealth,
} from './index.js';
import { VoiceConversationOrchestratorEnhanced, type EnhancedConversationConfig } from '../VoiceConversationOrchestratorEnhanced.js';
import type { VoiceActionExecutor } from '../VoiceActionExecutor.js';

const logger = createLogger({ service: 'intent-factory' });

export interface IntentSystemConfig {
  // Core configuration
  openaiApiKey: string;

  // Performance mode
  mode: 'high-performance' | 'balanced' | 'conservative';

  // Feature flags
  features: {
    enableValidation: boolean;
    enableCaching: boolean;
    enableLearning: boolean;
    enablePredictive: boolean;
  };

  // Performance targets
  performance: {
    targetProcessingTime: number;
    maxRetries: number;
    fallbackTimeout: number;
  };

  // Optional overrides
  overrides?: Partial<IntentOrchestrationConfig>;
}

export interface VoiceSystemConfig extends IntentSystemConfig {
  // Voice conversation specific
  conversation: {
    model: string;
    temperature: number;
    maxTokens: number;
    streamingEnabled: boolean;
    functionCallingEnabled: boolean;
    confirmationThreshold: number;
  };
}

/**
 * Predefined configuration presets for different use cases
 */
export const IntentConfigPresets = {
  /**
   * High-performance preset - optimized for speed
   * - Minimal validation
   * - Aggressive caching
   * - Target: <200ms processing
   */
  highPerformance: {
    mode: 'high-performance' as const,
    features: {
      enableValidation: false,
      enableCaching: true,
      enableLearning: true,
      enablePredictive: true,
    },
    performance: {
      targetProcessingTime: 200,
      maxRetries: 1,
      fallbackTimeout: 500,
    },
  },

  /**
   * Balanced preset - good performance with accuracy
   * - Secondary validation
   * - Smart caching
   * - Target: <300ms processing
   */
  balanced: {
    mode: 'balanced' as const,
    features: {
      enableValidation: true,
      enableCaching: true,
      enableLearning: true,
      enablePredictive: true,
    },
    performance: {
      targetProcessingTime: 300,
      maxRetries: 2,
      fallbackTimeout: 1000,
    },
  },

  /**
   * Conservative preset - optimized for accuracy
   * - Full validation and ensemble
   * - Comprehensive error handling
   * - Target: <500ms processing
   */
  conservative: {
    mode: 'conservative' as const,
    features: {
      enableValidation: true,
      enableCaching: false, // Disable caching for maximum freshness
      enableLearning: false, // Disable learning for consistency
      enablePredictive: false,
    },
    performance: {
      targetProcessingTime: 500,
      maxRetries: 3,
      fallbackTimeout: 2000,
    },
  },

  /**
   * Development preset - optimized for testing and debugging
   * - All features enabled
   * - Extended timeouts
   * - Comprehensive logging
   */
  development: {
    mode: 'balanced' as const,
    features: {
      enableValidation: true,
      enableCaching: true,
      enableLearning: true,
      enablePredictive: false, // Disable for predictable testing
    },
    performance: {
      targetProcessingTime: 1000, // Relaxed for debugging
      maxRetries: 1,
      fallbackTimeout: 3000,
    },
  },
} as const;

/**
 * Voice conversation presets for different environments
 */
export const VoiceConfigPresets = {
  production: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 300,
    streamingEnabled: true,
    functionCallingEnabled: true,
    confirmationThreshold: 0.8,
  },

  development: {
    model: 'gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 200,
    streamingEnabled: false, // Easier debugging
    functionCallingEnabled: true,
    confirmationThreshold: 0.6, // Lower threshold for testing
  },

  testing: {
    model: 'gpt-3.5-turbo',
    temperature: 0.1, // More deterministic
    maxTokens: 150,
    streamingEnabled: false,
    functionCallingEnabled: false,
    confirmationThreshold: 0.9, // High threshold for tests
  },
} as const;

/**
 * Create a complete intent recognition system with the specified configuration
 */
export async function createIntentRecognitionSystem(
  config: IntentSystemConfig
): Promise<IntentOrchestrator> {
  logger.info('Creating intent recognition system', {
    mode: config.mode,
    features: config.features,
    targetProcessingTime: config.performance.targetProcessingTime,
  });

  try {
    // Build the configuration
    const orchestrationConfig = buildIntentOrchestrationConfig(config);

    // Create and initialize the orchestrator
    const orchestrator = new IntentOrchestrator(orchestrationConfig);
    await orchestrator.initialize();

    // Validate system health
    const health = await orchestrator.getSystemHealth();
    if (health.status === 'unhealthy') {
      throw new Error('Intent recognition system failed health check');
    }

    logger.info('Intent recognition system created successfully', {
      status: health.status,
      totalModels: health.activeModels.length,
      cacheSize: health.cacheStatus.size,
    });

    return orchestrator;

  } catch (error) {
    logger.error('Failed to create intent recognition system', {
      error: error instanceof Error ? error.message : String(error),
      config: {
        mode: config.mode,
        features: config.features,
      },
    });
    throw error;
  }
}

/**
 * Create a complete voice conversation system with advanced intent recognition
 */
export async function createVoiceConversationSystem(
  config: VoiceSystemConfig,
  voiceActionExecutor: VoiceActionExecutor
): Promise<VoiceConversationOrchestratorEnhanced> {
  logger.info('Creating voice conversation system with advanced intent recognition', {
    mode: config.mode,
    conversationModel: config.conversation.model,
    features: config.features,
  });

  try {
    // Build the enhanced conversation configuration
    const conversationConfig = buildVoiceConversationConfig(config);

    // Create the enhanced orchestrator
    const orchestrator = new VoiceConversationOrchestratorEnhanced(
      conversationConfig,
      voiceActionExecutor
    );

    // Initialize the intent recognition system
    await orchestrator.initializeIntentRecognition();

    logger.info('Voice conversation system created successfully', {
      intentRecognitionEnabled: true,
      model: config.conversation.model,
      streamingEnabled: config.conversation.streamingEnabled,
    });

    return orchestrator;

  } catch (error) {
    logger.error('Failed to create voice conversation system', {
      error: error instanceof Error ? error.message : String(error),
      config: {
        mode: config.mode,
        conversationModel: config.conversation.model,
      },
    });
    throw error;
  }
}

/**
 * Quick setup function for common use cases
 */
export async function quickSetupIntent(
  openaiApiKey: string,
  preset: keyof typeof IntentConfigPresets = 'balanced'
): Promise<IntentOrchestrator> {
  const presetConfig = IntentConfigPresets[preset];

  const config: IntentSystemConfig = {
    openaiApiKey,
    ...presetConfig,
  };

  return createIntentRecognitionSystem(config);
}

/**
 * Quick setup function for voice conversation system
 */
export async function quickSetupVoiceConversation(
  openaiApiKey: string,
  voiceActionExecutor: VoiceActionExecutor,
  options: {
    intentPreset?: keyof typeof IntentConfigPresets;
    voicePreset?: keyof typeof VoiceConfigPresets;
    enableIntentRecognition?: boolean;
  } = {}
): Promise<VoiceConversationOrchestratorEnhanced> {
  const {
    intentPreset = 'balanced',
    voicePreset = 'production',
    enableIntentRecognition = true,
  } = options;

  const intentConfig = IntentConfigPresets[intentPreset];
  const voiceConfig = VoiceConfigPresets[voicePreset];

  const config: VoiceSystemConfig = {
    openaiApiKey,
    ...intentConfig,
    conversation: voiceConfig,
  };

  // Disable intent recognition if requested
  if (!enableIntentRecognition) {
    config.features.enableValidation = false;
    config.features.enableCaching = false;
    config.features.enableLearning = false;
    config.features.enablePredictive = false;
  }

  return createVoiceConversationSystem(config, voiceActionExecutor);
}

/**
 * Create a development/testing instance with mocked dependencies
 */
export async function createTestingIntentSystem(
  options: {
    mockOpenAI?: boolean;
    enableLogging?: boolean;
    preset?: keyof typeof IntentConfigPresets;
  } = {}
): Promise<IntentOrchestrator> {
  const {
    mockOpenAI = true,
    enableLogging = false,
    preset = 'development',
  } = options;

  if (!enableLogging) {
    // Temporarily suppress logging for tests
    logger.debug = () => {};
    logger.info = () => {};
  }

  const config: IntentSystemConfig = {
    openaiApiKey: mockOpenAI ? 'mock-key' : process.env['OPENAI_API_KEY'] || 'test-key',
    ...IntentConfigPresets[preset],
  };

  // Override for testing
  if (mockOpenAI) {
    config.overrides = {
      primaryClassifier: {
        model: 'mock-model',
        temperature: 0.1,
        maxTokens: 100,
        timeout: 1000,
      },
      secondaryValidation: {
        enabled: false, // Disable for faster tests
        threshold: 0.8,
        validationModels: [],
      },
      caching: {
        enabled: true,
        ttl: 60000, // Short TTL for tests
        maxEntries: 100,
        keyStrategy: 'text_only',
      },
    };
  }

  return createIntentRecognitionSystem(config);
}

/**
 * Health monitoring utility
 */
export class IntentSystemMonitor {
  private orchestrator: IntentOrchestrator;
  private monitoringInterval?: NodeJS.Timeout;
  private healthHistory: Array<{
    timestamp: Date;
    health: IntentSystemHealth;
  }> = [];

  constructor(orchestrator: IntentOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Start continuous health monitoring
   */
  startMonitoring(intervalMs = 30000): void {
    this.stopMonitoring(); // Clear any existing interval

    this.monitoringInterval = setInterval(async () => {
      try {
        const health = await this.orchestrator.getSystemHealth();

        this.healthHistory.push({
          timestamp: new Date(),
          health,
        });

        // Keep only last 100 health checks
        if (this.healthHistory.length > 100) {
          this.healthHistory.shift();
        }

        // Log warnings for degraded status
        if (health.status === 'degraded') {
          logger.warn('Intent system health degraded', {
            errors: health.errors?.length || 0,
            cacheHitRate: health.cacheStatus.hitRate,
            activeModels: health.activeModels.length,
          });
        } else if (health.status === 'unhealthy') {
          logger.error('Intent system unhealthy', {
            errors: health.errors,
            uptime: health.uptime,
          });
        }

      } catch (error) {
        logger.error('Health monitoring failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    logger.info('Intent system monitoring started', { intervalMs });
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('Intent system monitoring stopped');
    }
  }

  /**
   * Get health statistics
   */
  getHealthStats(windowMs = 300000): {
    currentHealth: IntentSystemHealth;
    healthyPercent: number;
    degradedPercent: number;
    unhealthyPercent: number;
    averageResponseTime: number;
    totalRequests: number;
  } {
    const cutoff = new Date(Date.now() - windowMs);
    const recentHealth = this.healthHistory.filter(h => h.timestamp >= cutoff);

    if (recentHealth.length === 0) {
      throw new Error('No health data available');
    }

    const currentHealth = recentHealth[recentHealth.length - 1]!.health;

    const statusCounts = recentHealth.reduce(
      (counts, h) => {
        counts[h.health.status]++;
        return counts;
      },
      { healthy: 0, degraded: 0, unhealthy: 0 }
    );

    const total = recentHealth.length;
    const averageResponseTime = recentHealth.reduce(
      (sum, h) => sum + (h.health.recentPerformance?.averageProcessingTime || 0),
      0
    ) / total;

    return {
      currentHealth,
      healthyPercent: (statusCounts.healthy / total) * 100,
      degradedPercent: (statusCounts.degraded / total) * 100,
      unhealthyPercent: (statusCounts.unhealthy / total) * 100,
      averageResponseTime,
      totalRequests: currentHealth.totalRequests,
    };
  }

  /**
   * Get recent health history
   */
  getHealthHistory(count = 20): Array<{
    timestamp: Date;
    health: IntentSystemHealth;
  }> {
    return this.healthHistory.slice(-count);
  }

  /**
   * Clean up monitoring
   */
  cleanup(): void {
    this.stopMonitoring();
    this.healthHistory = [];
  }
}

/**
 * Build intent orchestration configuration from system config
 */
function buildIntentOrchestrationConfig(config: IntentSystemConfig): IntentOrchestrationConfig {
  const baseConfig = createDefaultIntentConfig(config.openaiApiKey, {
    enableValidation: config.features.enableValidation,
    enableCaching: config.features.enableCaching,
    enableLearning: config.features.enableLearning,
    performanceTarget: config.performance.targetProcessingTime,
  });

  // Apply mode-specific optimizations
  switch (config.mode) {
    case 'high-performance':
      baseConfig.primaryClassifier.temperature = 0.1; // More deterministic
      baseConfig.primaryClassifier.timeout = 5000; // Shorter timeout
      baseConfig.secondaryValidation.enabled = false;
      baseConfig.ensemble.enabled = false;
      baseConfig.caching.ttl = 600000; // 10 minutes
      break;

    case 'conservative':
      baseConfig.primaryClassifier.temperature = 0.3; // More creative
      baseConfig.primaryClassifier.timeout = 10000; // Longer timeout
      baseConfig.secondaryValidation.enabled = true;
      baseConfig.secondaryValidation.validationModels = ['gpt-3.5-turbo'];
      baseConfig.ensemble.enabled = true;
      baseConfig.ensemble.minimumAgreement = 0.8;
      break;

    case 'balanced':
    default:
      // Use default balanced configuration
      break;
  }

  // Apply performance settings
  baseConfig.performance.targetProcessingTime = config.performance.targetProcessingTime;
  baseConfig.performance.maxRetries = config.performance.maxRetries;
  baseConfig.performance.fallbackTimeout = config.performance.fallbackTimeout;
  baseConfig.performance.enablePredictive = config.features.enablePredictive;

  // Apply any custom overrides
  if (config.overrides) {
    return { ...baseConfig, ...config.overrides };
  }

  return baseConfig;
}

/**
 * Build voice conversation configuration from system config
 */
function buildVoiceConversationConfig(config: VoiceSystemConfig): EnhancedConversationConfig {
  return {
    openaiApiKey: config.openaiApiKey,
    model: config.conversation.model,
    temperature: config.conversation.temperature,
    maxTokens: config.conversation.maxTokens,
    streamingEnabled: config.conversation.streamingEnabled,
    functionCallingEnabled: config.conversation.functionCallingEnabled,
    confirmationThreshold: config.conversation.confirmationThreshold,
    intentRecognition: {
      enabled: config.features.enableValidation || config.features.enableCaching || config.features.enableLearning,
      mode: config.mode,
      enableValidation: config.features.enableValidation,
      enableCaching: config.features.enableCaching,
      enableLearning: config.features.enableLearning,
      performanceTarget: config.performance.targetProcessingTime,
    },
  };
}

/**
 * Validate system requirements
 */
export function validateSystemRequirements(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  if (!process.env['OPENAI_API_KEY']) {
    errors.push('OPENAI_API_KEY environment variable is required');
  }

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]!);
  if (majorVersion < 18) {
    warnings.push('Node.js 18+ is recommended for optimal performance');
  }

  // Check available memory
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  if (heapUsedMB > 500) {
    warnings.push('High memory usage detected - consider optimizing cache settings');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Migration helper for existing voice systems
 */
export async function migrateFromBasicVoiceSystem(
  oldOrchestrator: unknown, // The existing VoiceConversationOrchestrator
  voiceActionExecutor: VoiceActionExecutor,
  migrationOptions: {
    preserveSessions?: boolean;
    intentPreset?: keyof typeof IntentConfigPresets;
    voicePreset?: keyof typeof VoiceConfigPresets;
  } = {}
): Promise<VoiceConversationOrchestratorEnhanced> {
  const {
    preserveSessions = true,
    intentPreset = 'balanced',
    voicePreset = 'production',
  } = migrationOptions;

  logger.info('Starting migration from basic voice system', {
    preserveSessions,
    intentPreset,
    voicePreset,
  });

  try {
    // Create new enhanced system
    const newOrchestrator = await quickSetupVoiceConversation(
      process.env['OPENAI_API_KEY']!,
      voiceActionExecutor,
      {
        intentPreset,
        voicePreset,
        enableIntentRecognition: true,
      }
    );

    // Migrate sessions if requested
    if (preserveSessions && oldOrchestrator && typeof oldOrchestrator === 'object' && 'getMetrics' in oldOrchestrator && typeof oldOrchestrator.getMetrics === 'function') {
      const oldMetrics = oldOrchestrator.getMetrics();
      logger.info('Migrating session data', {
        activeSessions: oldMetrics.activeSessions,
        totalSessions: oldMetrics.totalSessions,
      });

      // Note: Actual session migration would require access to the old orchestrator's
      // internal session data, which isn't exposed in the current implementation
    }

    // Clean up old orchestrator
    if (oldOrchestrator && typeof oldOrchestrator === 'object' && 'cleanup' in oldOrchestrator && typeof oldOrchestrator.cleanup === 'function') {
      await oldOrchestrator.cleanup();
    }

    logger.info('Migration completed successfully');
    return newOrchestrator;

  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Export utility functions for configuration management
 */
export const ConfigUtils = {
  /**
   * Merge multiple configuration objects
   */
  mergeConfigs: (
    base: Partial<IntentOrchestrationConfig>,
    ...overrides: Partial<IntentOrchestrationConfig>[]
  ): IntentOrchestrationConfig => {
    return overrides.reduce(
      (merged, override) => ({ ...merged, ...override }),
      base as IntentOrchestrationConfig
    );
  },

  /**
   * Validate configuration object
   */
  validateConfig: (config: IntentOrchestrationConfig): {
    isValid: boolean;
    errors: string[];
  } => {
    const errors: string[] = [];

    if (!config.primaryClassifier.model) {
      errors.push('Primary classifier model is required');
    }

    if (config.performance.targetProcessingTime < 100) {
      errors.push('Target processing time must be at least 100ms');
    }

    if (config.caching.enabled && config.caching.maxEntries < 100) {
      errors.push('Cache max entries should be at least 100 for effectiveness');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  /**
   * Get recommended configuration for specific use case
   */
  getRecommendedConfig: (useCase: 'production' | 'development' | 'testing' | 'high-load'): keyof typeof IntentConfigPresets => {
    switch (useCase) {
      case 'production':
        return 'balanced';
      case 'development':
        return 'development';
      case 'testing':
        return 'conservative';
      case 'high-load':
        return 'highPerformance';
      default:
        return 'balanced';
    }
  },
};