/**
 * Feature Flags - Typed flag registry with remote overrides support
 * 
 * Provides centralized feature flag management with type safety and
 * optional remote configuration support for runtime flag changes.
 */

import { Config } from './schema.js';

export interface FeatureFlag<T = boolean> {
  key: string;
  name: string;
  description: string;
  defaultValue: T;
  type: 'boolean' | 'string' | 'number';
  category: 'ai' | 'crawler' | 'voice' | 'security' | 'monitoring' | 'development';
  stable: boolean; // true for production-ready flags
  conditions?: {
    environment?: ('development' | 'staging' | 'production' | 'test')[];
    tenantId?: string[];
    percentage?: number; // 0-100 for gradual rollout
  };
}

// Flag registry with comprehensive type information
export const FLAG_REGISTRY: Record<string, FeatureFlag> = {
  // AI Features
  INTENT_ENGINE_ENABLED: {
    key: 'INTENT_ENGINE_ENABLED',
    name: 'Intent Engine',
    description: 'Enable AI intent classification and understanding',
    defaultValue: true,
    type: 'boolean',
    category: 'ai',
    stable: true,
  },
  
  USE_LANGGRAPH_AGENT: {
    key: 'USE_LANGGRAPH_AGENT',
    name: 'LangGraph Agent',
    description: 'Use LangGraph for conversation orchestration',
    defaultValue: true,
    type: 'boolean',
    category: 'ai',
    stable: true,
  },
  
  VECTOR_SEARCH_ENABLED: {
    key: 'VECTOR_SEARCH_ENABLED',
    name: 'Vector Search',
    description: 'Enable semantic vector search in knowledge base',
    defaultValue: true,
    type: 'boolean',
    category: 'ai',
    stable: true,
  },
  
  HYBRID_SEARCH_ENABLED: {
    key: 'HYBRID_SEARCH_ENABLED',
    name: 'Hybrid Search',
    description: 'Combine vector and full-text search for better results',
    defaultValue: true,
    type: 'boolean',
    category: 'ai',
    stable: false, // Still being optimized
  },
  
  // Crawler Features
  USE_PLAYWRIGHT_CRAWLER: {
    key: 'USE_PLAYWRIGHT_CRAWLER',
    name: 'Playwright Crawler',
    description: 'Use Playwright for advanced web crawling with JS execution',
    defaultValue: true,
    type: 'boolean',
    category: 'crawler',
    stable: true,
  },
  
  AUTO_CRAWLER_ENABLED: {
    key: 'AUTO_CRAWLER_ENABLED',
    name: 'Auto Crawler',
    description: 'Enable automatic background crawling and indexing',
    defaultValue: false,
    type: 'boolean',
    category: 'crawler',
    stable: false,
    conditions: {
      environment: ['staging', 'production'],
    },
  },
  
  ADVANCED_EXTRACTION: {
    key: 'ADVANCED_EXTRACTION',
    name: 'Advanced Extraction',
    description: 'Use advanced content extraction algorithms',
    defaultValue: false,
    type: 'boolean',
    category: 'crawler',
    stable: false,
  },
  
  ENABLE_VECTOR_PERSIST: {
    key: 'ENABLE_VECTOR_PERSIST',
    name: 'Vector Persistence',
    description: 'Store embeddings in persistent vector database',
    defaultValue: true,
    type: 'boolean',
    category: 'ai',
    stable: true,
  },
  
  // Voice Features
  VOICE_ENABLED: {
    key: 'VOICE_ENABLED',
    name: 'Voice Interface',
    description: 'Enable voice interaction capabilities',
    defaultValue: true,
    type: 'boolean',
    category: 'voice',
    stable: true,
  },
  
  TTS_ENABLED: {
    key: 'TTS_ENABLED',
    name: 'Text-to-Speech',
    description: 'Enable text-to-speech synthesis',
    defaultValue: true,
    type: 'boolean',
    category: 'voice',
    stable: true,
  },
  
  STT_ENABLED: {
    key: 'STT_ENABLED',
    name: 'Speech-to-Text',
    description: 'Enable speech-to-text recognition',
    defaultValue: true,
    type: 'boolean',
    category: 'voice',
    stable: true,
  },
  
  VOICE_STREAMING: {
    key: 'VOICE_STREAMING',
    name: 'Voice Streaming',
    description: 'Enable real-time voice streaming',
    defaultValue: true,
    type: 'boolean',
    category: 'voice',
    stable: false, // WebSocket implementation needs optimization
  },
  
  // Security Features
  RBAC_ENABLED: {
    key: 'RBAC_ENABLED',
    name: 'Role-Based Access Control',
    description: 'Enable RBAC security model',
    defaultValue: true,
    type: 'boolean',
    category: 'security',
    stable: true,
  },
  
  RATE_LIMITING_ENABLED: {
    key: 'RATE_LIMITING_ENABLED',
    name: 'Rate Limiting',
    description: 'Enable API rate limiting',
    defaultValue: true,
    type: 'boolean',
    category: 'security',
    stable: true,
  },
  
  TENANT_ISOLATION: {
    key: 'TENANT_ISOLATION',
    name: 'Tenant Isolation',
    description: 'Enforce strict tenant data isolation',
    defaultValue: true,
    type: 'boolean',
    category: 'security',
    stable: true,
  },
  
  // Monitoring Features
  METRICS_ENABLED: {
    key: 'METRICS_ENABLED',
    name: 'Metrics Collection',
    description: 'Enable application metrics collection',
    defaultValue: true,
    type: 'boolean',
    category: 'monitoring',
    stable: true,
  },
  
  HEALTH_CHECKS_ENABLED: {
    key: 'HEALTH_CHECKS_ENABLED',
    name: 'Health Checks',
    description: 'Enable health check endpoints',
    defaultValue: true,
    type: 'boolean',
    category: 'monitoring',
    stable: true,
  },
  
  DETAILED_LOGGING: {
    key: 'DETAILED_LOGGING',
    name: 'Detailed Logging',
    description: 'Enable verbose logging for debugging',
    defaultValue: false,
    type: 'boolean',
    category: 'monitoring',
    stable: true,
    conditions: {
      environment: ['development', 'staging'],
    },
  },
};

export interface RemoteConfigProvider {
  getFlag<T>(key: string): Promise<T | undefined>;
  setFlag<T>(key: string, value: T): Promise<void>;
  subscribe(callback: (key: string, value: any) => void): void;
}

export class FeatureFlagService {
  private config: Config;
  private remoteProvider?: RemoteConfigProvider;
  private overrides: Map<string, any> = new Map();
  
  constructor(config: Config, remoteProvider?: RemoteConfigProvider) {
    this.config = config;
    if (remoteProvider) {
      this.remoteProvider = remoteProvider;
    }
    
    // Subscribe to remote changes if provider is available
    if (this.remoteProvider) {
      this.remoteProvider.subscribe((key, value) => {
        this.overrides.set(key, value);
      });
    }
  }
  
  /**
   * Get feature flag value with type safety
   */
  getFlag<T = boolean>(key: keyof typeof FLAG_REGISTRY): T {
    const flag = FLAG_REGISTRY[key];
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }
    
    // Check remote override first
    if (this.overrides.has(key)) {
      return this.overrides.get(key) as T;
    }
    
    // Get from environment config
    const envValue = (this.config as any)[key];
    if (envValue !== undefined) {
      return envValue as T;
    }
    
    // Fall back to default
    return flag.defaultValue as T;
  }
  
  /**
   * Check if flag is enabled (convenience method for boolean flags)
   */
  isEnabled(key: keyof typeof FLAG_REGISTRY): boolean {
    return this.getFlag<boolean>(key) === true;
  }
  
  /**
   * Get flag with environment and conditions checking
   */
  getFlagWithConditions<T = boolean>(
    key: keyof typeof FLAG_REGISTRY,
    context: {
      environment?: string;
      tenantId?: string;
      userId?: string;
    } = {}
  ): T {
    const flag = FLAG_REGISTRY[key];
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }
    
    // Check environment conditions
    if (flag.conditions?.environment && context.environment) {
      if (!flag.conditions.environment.includes(context.environment as any)) {
        return flag.defaultValue as T;
      }
    }
    
    // Check tenant conditions
    if (flag.conditions?.tenantId && context.tenantId) {
      if (!flag.conditions.tenantId.includes(context.tenantId)) {
        return flag.defaultValue as T;
      }
    }
    
    // Check percentage rollout
    if (flag.conditions?.percentage && context.userId) {
      const hash = this.hashString(context.userId + key);
      const percentage = (hash % 100) + 1;
      if (percentage > flag.conditions.percentage) {
        return flag.defaultValue as T;
      }
    }
    
    return this.getFlag<T>(key);
  }
  
  /**
   * Set flag override (for testing or admin control)
   */
  async setFlagOverride<T>(key: string, value: T): Promise<void> {
    this.overrides.set(key, value);
    
    if (this.remoteProvider) {
      await this.remoteProvider.setFlag(key, value);
    }
  }
  
  /**
   * Get all flags for debugging/admin interface
   */
  getAllFlags(): Record<string, any> {
    const flags: Record<string, any> = {};
    
    for (const key of Object.keys(FLAG_REGISTRY)) {
      flags[key] = {
        ...FLAG_REGISTRY[key],
        currentValue: this.getFlag(key),
        isOverridden: this.overrides.has(key),
      };
    }
    
    return flags;
  }
  
  /**
   * Get flags by category
   */
  getFlagsByCategory(category: FeatureFlag['category']): Record<string, any> {
    const flags: Record<string, any> = {};
    
    for (const [key, flag] of Object.entries(FLAG_REGISTRY)) {
      if (flag.category === category) {
        flags[key] = {
          ...flag,
          currentValue: this.getFlag(key),
          isOverridden: this.overrides.has(key),
        };
      }
    }
    
    return flags;
  }
  
  /**
   * Clear all overrides
   */
  clearOverrides(): void {
    this.overrides.clear();
  }
  
  /**
   * Simple hash function for percentage rollouts
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Type-safe flag getters
export const createFlagGetters = (service: FeatureFlagService) => ({
  // AI Features
  isIntentEngineEnabled: () => service.isEnabled('INTENT_ENGINE_ENABLED'),
  isLangGraphAgentEnabled: () => service.isEnabled('USE_LANGGRAPH_AGENT'),
  isVectorSearchEnabled: () => service.isEnabled('VECTOR_SEARCH_ENABLED'),
  isHybridSearchEnabled: () => service.isEnabled('HYBRID_SEARCH_ENABLED'),
  
  // Crawler Features
  isPlaywrightCrawlerEnabled: () => service.isEnabled('USE_PLAYWRIGHT_CRAWLER'),
  isAutoCrawlerEnabled: () => service.isEnabled('AUTO_CRAWLER_ENABLED'),
  isAdvancedExtractionEnabled: () => service.isEnabled('ADVANCED_EXTRACTION'),
  isVectorPersistEnabled: () => service.isEnabled('ENABLE_VECTOR_PERSIST'),
  
  // Voice Features
  isVoiceEnabled: () => service.isEnabled('VOICE_ENABLED'),
  isTtsEnabled: () => service.isEnabled('TTS_ENABLED'),
  isSttEnabled: () => service.isEnabled('STT_ENABLED'),
  isVoiceStreamingEnabled: () => service.isEnabled('VOICE_STREAMING'),
  
  // Security Features
  isRbacEnabled: () => service.isEnabled('RBAC_ENABLED'),
  isRateLimitingEnabled: () => service.isEnabled('RATE_LIMITING_ENABLED'),
  isTenantIsolationEnabled: () => service.isEnabled('TENANT_ISOLATION'),
  
  // Monitoring Features
  isMetricsEnabled: () => service.isEnabled('METRICS_ENABLED'),
  isHealthChecksEnabled: () => service.isEnabled('HEALTH_CHECKS_ENABLED'),
  isDetailedLoggingEnabled: () => service.isEnabled('DETAILED_LOGGING'),
});

export type FlagGetters = ReturnType<typeof createFlagGetters>;