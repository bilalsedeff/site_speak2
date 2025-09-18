/**
 * Consolidated Session Types - Unified session management interfaces
 *
 * This file consolidates 18+ fragmented session interfaces into a coherent
 * architecture that extends the existing UnifiedVoiceSession while preserving
 * specialized functionality and maintaining ≤200ms voice latency targets.
 *
 * Design Principles:
 * - Extend UnifiedVoiceSession (already optimized)
 * - Preserve critical performance (≤20ms VAD, ≤200ms first token)
 * - Maintain separation of concerns through modules
 * - Zero security degradation in authentication
 */

import type { UnifiedVoiceSession } from './UnifiedVoiceOrchestrator.js';
import type { VoiceInteraction } from '../../modules/voice/domain/entities/VoiceSession.js';
import type { UserSession } from '../../infrastructure/auth/session.js';
import type { VADDecision, TTSPlaybackState } from '../../../../shared/types/barge-in.types.js';
import type { UserProgress } from '../../../../client/src/services/voice/tutorial/TutorialOrchestrator.js';

// =============================================================================
// CORE CONSOLIDATED SESSION INTERFACE
// =============================================================================

/**
 * Enhanced Unified Session - Core consolidated interface
 * Extends UnifiedVoiceSession with business logic and multi-provider support
 */
export interface EnhancedUnifiedSession extends UnifiedVoiceSession {
  // Business Logic Integration (from VoiceSession domain entity)
  businessLogic: {
    interactions: VoiceInteraction[];
    conversationHistory: ConversationFlow;
    qualityMetrics: SessionQualityMetrics;

    // Business methods (will be implemented by service layer)
    methods: {
      addInteraction: (interaction: Omit<VoiceInteraction, 'id' | 'sessionId' | 'createdAt'>) => Promise<void>;
      updateVoiceSettings: (settings: Partial<VoiceSettings>) => Promise<void>;
      getConversationFlow: () => ConversationFlowItem[];
      calculateQualityMetrics: () => SessionQualityMetrics;
    };
  };

  // Multi-Provider Configuration (from shared voice types)
  providerConfig: {
    stt: {
      provider: 'whisper' | 'deepgram' | 'web-speech-api';
      settings: STTProviderSettings;
    };
    tts: {
      provider: 'openai' | 'elevenlabs' | 'azure' | 'web-speech-api';
      settings: TTSProviderSettings;
    };
    advanced: AdvancedAudioConfiguration;
  };

  // Authentication Context (reference to UserSession for security)
  authContext: {
    userSessionId: string; // FK reference to UserSession
    securityLevel: 'standard' | 'enhanced' | 'critical';
    permissions: string[];
    isolationContext: {
      tenantBoundary: string;
      dataBoundary: string;
    };
  };

  // Device and Environment Context (from shared types)
  deviceContext: {
    device: 'desktop' | 'mobile' | 'tablet';
    browser: string;
    capabilities: {
      microphonePermission: boolean;
      speakerSupport: boolean;
      audioWorkletSupport: boolean;
      webAssemblySupport: boolean;
    };
    networkInfo: {
      type: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
      effectiveType: '2g' | '3g' | '4g' | '5g';
      rtt: number; // Round trip time in ms
    };
  };

  // Specialized Session Modules (optional, attached based on use case)
  modules?: {
    bargeIn?: BargeInSessionModule;
    tutorial?: TutorialSessionModule;
    recovery?: RecoverySessionModule;
    crawling?: CrawlSessionModule;
  };
}

// =============================================================================
// SPECIALIZED SESSION MODULES
// =============================================================================

/**
 * BargeIn Session Module - Ultra-low latency voice interruption
 * Preserves ≤20ms VAD decision latency through isolated processing
 */
export interface BargeInSessionModule {
  sessionRef: string; // Reference to parent EnhancedUnifiedSession
  moduleId: string;

  // Isolated processing to preserve ultra-low latency
  isolatedProcessing: {
    vadWorker?: AudioWorklet; // Dedicated worker for VAD processing
    latencyTargets: {
      vadDecision: 20; // ms - non-negotiable
      bargeInResponse: 50; // ms - non-negotiable
      ttsInterruption: 30; // ms
    };
    fallbackStrategy: 'graceful-degrade' | 'disable' | 'bypass';
  };

  // Current state (mirrored from BargeInSession)
  vadState: {
    active: boolean;
    lastDecision: VADDecision;
    consecutiveActiveFrames: number;
    consecutiveInactiveFrames: number;
  };

  ttsState: TTSPlaybackState;

  // Performance metrics specific to barge-in
  metrics: {
    totalBargeInEvents: number;
    avgBargeInLatency: number;
    minBargeInLatency: number;
    maxBargeInLatency: number;
    falsePositives: number;
    missedDetections: number;
    latencyDistribution: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
}

/**
 * Tutorial Session Module - Educational flow management
 */
export interface TutorialSessionModule {
  sessionRef: string;
  moduleId: string;

  currentTutorial?: {
    id: string;
    title: string;
    currentStepIndex: number;
    progress: UserProgress[];
  };

  adaptiveSettings: {
    difficultyLevel: number; // 0-1
    paceMultiplier: number; // 0.5-2.0
    hintsEnabled: boolean;
    skipAllowed: boolean;
  };

  context: {
    websiteType?: 'ecommerce' | 'blog' | 'landing' | 'dashboard' | 'other';
    userExperience?: 'novice' | 'intermediate' | 'expert';
    previousSessions?: number;
  };
}

/**
 * Recovery Session Module - Error handling and recovery
 */
export interface RecoverySessionModule {
  sessionRef: string;
  moduleId: string;

  activeRecoveries: Map<string, {
    id: string;
    errorId: string;
    strategy: RecoveryStrategy;
    startTime: Date;
    currentStep: number;
    status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  }>;

  metrics: {
    errorDetectionTime: number;
    clarificationGenerationTime: number;
    recoverySelectionTime: number;
    totalCycleTime: number;
    successRate: number;
  };
}

/**
 * Crawl Session Module - Knowledge base management
 */
export interface CrawlSessionModule {
  sessionRef: string;
  moduleId: string;

  crawlState: {
    sessionType: 'full' | 'delta' | 'manual' | 'scheduled';
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: {
      urlsCrawled: number;
      totalUrls: number;
      percentage: number;
    };
  };

  statistics: {
    pagesProcessed: number;
    embeddingsGenerated: number;
    tokensConsumed: number;
    processingTime: number;
  };
}

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface ConversationFlow {
  items: ConversationFlowItem[];
  totalTurns: number;
  avgResponseTime: number;
  languages: string[];
}

export interface ConversationFlowItem {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    confidence?: number;
    processingTime?: number;
    emotion?: string;
    intent?: string;
  };
}

export interface SessionQualityMetrics {
  speechRecognitionAccuracy: number; // 0-1
  averageResponseTime: number; // ms
  totalInteractions: number;
  sessionDuration: number; // ms
  languageConsistency: boolean;
  userSatisfaction?: number; // 0-1, if available
  errorRate: number; // errors per interaction
}

export interface VoiceSettings {
  name: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'custom';
  speed: number; // 0.25 to 4.0
  pitch?: number; // for web speech API
  volume?: number; // 0.0 to 1.0
  stability?: number; // for ElevenLabs
  similarity?: number; // for ElevenLabs
}

export interface STTProviderSettings {
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface TTSProviderSettings {
  model?: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  format?: string;
}

export interface AdvancedAudioConfiguration {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: 'wav' | 'mp3' | 'opus' | 'webm';
  processing: {
    noiseReduction: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
    vadEnabled: boolean;
    compressionEnabled: boolean;
  };
  optimization: {
    enableStreamingProcessing: boolean;
    enableOptimizedBuffering: boolean;
    bufferSize: number;
    lowLatencyMode: boolean;
  };
}

export interface RecoveryStrategy {
  id: string;
  name: string;
  type: 'automatic' | 'guided' | 'manual';
  steps: RecoveryStep[];
  automated: boolean;
  estimatedTime: number;
  successRate: number;
}

export interface RecoveryStep {
  id: string;
  description: string;
  action: string;
  automated: boolean;
  estimatedTime: number;
}

// =============================================================================
// SESSION MODULE MANAGER
// =============================================================================

/**
 * Session Module Manager - Handles attachment/detachment of specialized modules
 */
export class SessionModuleManager {
  private static instance: SessionModuleManager;
  private moduleFactories = new Map<string, ModuleFactory>();

  static getInstance(): SessionModuleManager {
    if (!SessionModuleManager.instance) {
      SessionModuleManager.instance = new SessionModuleManager();
    }
    return SessionModuleManager.instance;
  }

  /**
   * Attach a specialized module to a session
   */
  async attachModule<T extends SessionModule>(
    session: EnhancedUnifiedSession,
    moduleType: 'bargeIn' | 'tutorial' | 'recovery' | 'crawling',
    config?: Record<string, unknown>
  ): Promise<T> {
    const factory = this.moduleFactories.get(moduleType);
    if (!factory) {
      throw new Error(`Module factory not found for type: ${moduleType}`);
    }

    const module = await factory.create(session.id, config) as T;

    if (!session.modules) {
      session.modules = {};
    }

    (session.modules as any)[moduleType] = module;

    return module;
  }

  /**
   * Detach a module from a session
   */
  async detachModule(
    session: EnhancedUnifiedSession,
    moduleType: 'bargeIn' | 'tutorial' | 'recovery' | 'crawling'
  ): Promise<void> {
    if (!session.modules?.[moduleType]) {
      return;
    }

    const module = session.modules[moduleType];

    // Cleanup module resources
    if ('cleanup' in module && typeof module.cleanup === 'function') {
      await module.cleanup();
    }

    delete session.modules[moduleType];
  }

  /**
   * Register a module factory
   */
  registerModuleFactory(moduleType: string, factory: ModuleFactory): void {
    this.moduleFactories.set(moduleType, factory);
  }
}

// =============================================================================
// MODULE FACTORY INTERFACES
// =============================================================================

export interface SessionModule {
  sessionRef: string;
  moduleId: string;
  cleanup?(): Promise<void>;
}

export interface ModuleFactory {
  create(sessionId: string, config?: Record<string, unknown>): Promise<SessionModule>;
}

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

/**
 * Session Migration Utilities - Safe migration between session types
 */
export class SessionMigrationUtils {
  /**
   * Convert UnifiedVoiceSession to EnhancedUnifiedSession
   */
  static async migrateToEnhanced(
    session: UnifiedVoiceSession,
    userSession: UserSession,
    options: {
      preserveModules?: boolean;
      validatePerformance?: boolean;
    } = {}
  ): Promise<EnhancedUnifiedSession> {
    const enhanced: EnhancedUnifiedSession = {
      ...session, // Preserve all existing properties

      businessLogic: {
        interactions: [],
        conversationHistory: {
          items: [],
          totalTurns: 0,
          avgResponseTime: session.metrics.avgResponseTime,
          languages: []
        },
        qualityMetrics: {
          speechRecognitionAccuracy: 0,
          averageResponseTime: session.metrics.avgResponseTime,
          totalInteractions: 0,
          sessionDuration: Date.now() - session.createdAt.getTime(),
          languageConsistency: true,
          errorRate: session.metrics.errors.length / Math.max(session.metrics.totalTurns, 1)
        },
        methods: {
          addInteraction: async (_interaction) => {
            // Implementation will be provided by service layer
            throw new Error('Method implementation required');
          },
          updateVoiceSettings: async (_settings) => {
            // Implementation will be provided by service layer
            throw new Error('Method implementation required');
          },
          getConversationFlow: () => {
            return enhanced.businessLogic.conversationHistory.items;
          },
          calculateQualityMetrics: () => {
            return enhanced.businessLogic.qualityMetrics;
          }
        }
      },

      providerConfig: {
        stt: {
          provider: 'whisper',
          settings: {
            model: 'whisper-1',
            language: session.config.locale
          }
        },
        tts: {
          provider: 'openai',
          settings: {
            model: 'tts-1',
            voice: session.config.voice,
            speed: 1.0
          }
        },
        advanced: {
          sampleRate: session.config.audioConfig.sampleRate,
          channels: 1,
          bitDepth: 16,
          format: 'opus',
          processing: {
            noiseReduction: true,
            echoCancellation: true,
            autoGainControl: true,
            vadEnabled: session.config.audioConfig.enableVAD,
            compressionEnabled: false
          },
          optimization: {
            enableStreamingProcessing: session.config.audioConfig.enableStreamingProcessing,
            enableOptimizedBuffering: session.config.audioConfig.enableOptimizedBuffering,
            bufferSize: 4096,
            lowLatencyMode: true
          }
        }
      },

      authContext: {
        userSessionId: userSession.id,
        securityLevel: 'standard',
        permissions: [], // Will be populated from user session
        isolationContext: {
          tenantBoundary: session.tenantId,
          dataBoundary: `tenant-${session.tenantId}`
        }
      },

      deviceContext: {
        device: 'desktop', // Default, should be detected
        browser: 'unknown', // Should be populated from user agent
        capabilities: {
          microphonePermission: true,
          speakerSupport: true,
          audioWorkletSupport: true,
          webAssemblySupport: true
        },
        networkInfo: {
          type: 'unknown',
          effectiveType: '4g',
          rtt: session.connectionMetrics.connectionLatency
        }
      }
    };

    // Preserve existing modules if requested
    if (options.preserveModules) {
      enhanced.modules = {};
    }

    return enhanced;
  }

  /**
   * Validate performance impact after migration
   */
  static validatePerformance(
    original: UnifiedVoiceSession,
    enhanced: EnhancedUnifiedSession
  ): PerformanceValidationResult {
    const validation: PerformanceValidationResult = {
      passed: true,
      issues: [],
      metrics: {
        memorySizeIncrease: 0, // Would need to measure actual memory
        latencyImpact: 0,
        processingOverhead: 0
      }
    };

    // Check if session structure size increased significantly
    const originalKeys = Object.keys(original).length;
    const enhancedKeys = Object.keys(enhanced).length;
    const structureIncrease = (enhancedKeys - originalKeys) / originalKeys;

    if (structureIncrease > 0.3) { // More than 30% increase in keys
      validation.issues.push({
        level: 'warning',
        message: `Session structure increased by ${Math.round(structureIncrease * 100)}%`,
        impact: 'memory'
      });
    }

    // Validate critical performance properties are preserved
    if (enhanced.config.performance.targetFirstTokenLatency > 200) {
      validation.passed = false;
      validation.issues.push({
        level: 'error',
        message: 'First token latency target exceeds 200ms limit',
        impact: 'latency'
      });
    }

    return validation;
  }
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface PerformanceValidationResult {
  passed: boolean;
  issues: PerformanceIssue[];
  metrics: {
    memorySizeIncrease: number; // bytes
    latencyImpact: number; // ms
    processingOverhead: number; // %
  };
}

export interface PerformanceIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  impact: 'memory' | 'latency' | 'processing' | 'security';
}
