/**
 * Multi-layered Intent Recognition System - Public API
 *
 * Complete intent recognition system with:
 * - Primary classification using OpenAI GPT-4o
 * - Secondary validation and ensemble decisions
 * - Context-aware analysis for universal website compatibility
 * - Intelligent caching with pattern learning
 * - Performance optimized for <300ms processing
 * - Comprehensive error handling and fallback strategies
 */

// Core Orchestrator - Main entry point
export { IntentOrchestrator } from './IntentOrchestrator.js';
// Import for local usage in helper functions
import { IntentOrchestrator } from './IntentOrchestrator.js';
import type { IntentCategory, SiteCapability, IntentProcessingError, IntentOrchestrationConfig } from './types.js';

// Individual Components
export { IntentClassificationEngine } from './IntentClassificationEngine.js';
export { ContextualIntentAnalyzer, type RawPageData, type SessionData } from './ContextualIntentAnalyzer.js';
export { IntentValidationService } from './IntentValidationService.js';
export { IntentCacheManager } from './IntentCacheManager.js';

// Import types from types.ts to re-export
export type {
  // Core types
  IntentCategory,
  IntentClassificationResult,
  IntentValidationResult,
  IntentProcessingRequest,
  IntentProcessingResponse,
  IntentProcessingError,
  
  // Context types  
  ContextualIntentAnalysis,
  PageContext,
  SessionContext,
  UserContext,
  ElementContextInfo,
  SiteCapability,
  SchemaOrgData,
  
  // Validation types
  IntentConflict,
  IntentResolution,
  IntentEnsembleDecision,
  
  // Cache types
  IntentCacheEntry,
  UserLearningProfile,
  IntentHistory,
  IntentSuggestion,
  
  // Configuration types
  IntentOrchestrationConfig
} from './types.js';

// Configuration helpers
export const createDefaultIntentConfig = (
  openaiApiKey: string,
  options: {
    enableValidation?: boolean;
    enableCaching?: boolean;
    enableLearning?: boolean;
    performanceTarget?: number;
  } = {}
): IntentOrchestrationConfig => ({
  primaryClassifier: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 300,
    timeout: 8000,
  },
  secondaryValidation: {
    enabled: options.enableValidation ?? true,
    threshold: 0.7,
    validationModels: ['gpt-3.5-turbo'],
  },
  contextAnalysis: {
    enabled: true,
    contextWeights: {
      pageType: 1.0,
      contentType: 0.8,
      capabilities: 0.6,
      userRole: 0.4,
    },
    boostThreshold: 0.2,
  },
  caching: {
    enabled: options.enableCaching ?? true,
    ttl: 300000, // 5 minutes
    maxEntries: 10000,
    keyStrategy: 'text_context',
  },
  performance: {
    targetProcessingTime: options.performanceTarget ?? 300,
    maxRetries: 2,
    fallbackTimeout: 1000,
    enablePredictive: true,
  },
  ensemble: {
    enabled: options.enableValidation ?? true,
    strategy: 'contextual_boost',
    minimumAgreement: 0.6,
    weightAdjustment: true,
  },
  learning: {
    enabled: options.enableLearning ?? true,
    adaptiveThresholds: true,
    userFeedbackWeight: 0.3,
    patternDetection: true,
  },
});

// Utility functions
export const createIntentSystem = async (
  config: IntentOrchestrationConfig
): Promise<IntentOrchestrator> => {
  const orchestrator = new IntentOrchestrator(config);
  await orchestrator.initialize();
  return orchestrator;
};

// Quick setup function for common use cases
export const createQuickIntentSystem = async (
  openaiApiKey: string,
  options: {
    mode?: 'high-performance' | 'balanced' | 'conservative';
    enableValidation?: boolean;
    enableCaching?: boolean;
    enableLearning?: boolean;
  } = {}
): Promise<IntentOrchestrator> => {
  const mode = options.mode || 'balanced';

  const modeConfigs = {
    'high-performance': {
      performanceTarget: 200,
      enableValidation: false,
      enableCaching: true,
      enableLearning: true,
    },
    'balanced': {
      performanceTarget: 300,
      enableValidation: true,
      enableCaching: true,
      enableLearning: true,
    },
    'conservative': {
      performanceTarget: 500,
      enableValidation: true,
      enableCaching: false,
      enableLearning: false,
    },
  };

  const modeConfig = modeConfigs[mode];
  const config = createDefaultIntentConfig(openaiApiKey, {
    ...modeConfig,
    ...options,
  });

  return createIntentSystem(config);
};

// Error handling utilities
export const isIntentProcessingError = (error: unknown): error is IntentProcessingError => {
  return error && typeof error.code === 'string' && typeof error.retryable === 'boolean';
};

export const shouldRetryIntentProcessing = (error: unknown): boolean => {
  return isIntentProcessingError(error) && error.retryable;
};

// Intent category helpers
export const intentCategories: IntentCategory[] = [
  // Navigation intents
  'navigate_to_page',
  'navigate_to_section',
  'navigate_back',
  'navigate_forward',
  'scroll_to_element',
  'open_menu',
  'close_menu',

  // Action intents
  'click_element',
  'submit_form',
  'clear_form',
  'select_option',
  'toggle_element',
  'drag_drop',
  'copy_content',
  'paste_content',

  // Content manipulation
  'edit_text',
  'add_content',
  'delete_content',
  'replace_content',
  'format_content',
  'undo_action',
  'redo_action',

  // Query intents
  'search_content',
  'filter_results',
  'sort_results',
  'get_information',
  'explain_feature',
  'show_details',

  // E-commerce specific
  'add_to_cart',
  'remove_from_cart',
  'view_product',
  'compare_products',
  'checkout_process',
  'track_order',

  // Control intents
  'stop_action',
  'cancel_operation',
  'pause_process',
  'resume_process',
  'reset_state',
  'save_progress',

  // Confirmation intents
  'confirm_action',
  'deny_action',
  'maybe_later',
  'need_clarification',

  // Meta intents
  'help_request',
  'tutorial_request',
  'feedback_provide',
  'error_report',
  'unknown_intent',
];

export const siteCapabilities: SiteCapability[] = [
  'navigation',
  'search',
  'forms',
  'e-commerce',
  'user-accounts',
  'content-creation',
  'media-upload',
  'real-time-updates',
  'multi-language',
  'accessibility',
  'offline-support',
  'geolocation',
  'notifications',
  'social-sharing',
  'comments',
  'ratings-reviews',
  'subscriptions',
  'payments',
  'chat-support',
  'api-integration',
];

// Validation helpers
export const isValidIntentCategory = (intent: string): intent is IntentCategory => {
  return intentCategories.includes(intent as IntentCategory);
};

export const isValidSiteCapability = (capability: string): capability is SiteCapability => {
  return siteCapabilities.includes(capability as SiteCapability);
};

// Performance monitoring helpers
export const createPerformanceMonitor = () => {
  const measurements: Array<{ timestamp: Date; processingTime: number; success: boolean }> = [];

  return {
    record: (processingTime: number, success: boolean) => {
      measurements.push({
        timestamp: new Date(),
        processingTime,
        success,
      });

      // Keep only last 1000 measurements
      if (measurements.length > 1000) {
        measurements.shift();
      }
    },

    getStats: (windowMs = 60000) => {
      const cutoff = new Date(Date.now() - windowMs);
      const recent = measurements.filter(m => m.timestamp >= cutoff);

      if (recent.length === 0) {
        return {
          count: 0,
          averageTime: 0,
          successRate: 0,
          p95: 0,
          p99: 0,
        };
      }

      const times = recent.map(m => m.processingTime).sort((a, b) => a - b);
      const successCount = recent.filter(m => m.success).length;

      return {
        count: recent.length,
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
        successRate: successCount / recent.length,
        p95: times[Math.floor(times.length * 0.95)] || 0,
        p99: times[Math.floor(times.length * 0.99)] || 0,
      };
    },

    clear: () => {
      measurements.length = 0;
    },
  };
};

// Development and testing utilities
export const createMockPageData = (overrides: Partial<RawPageData> = {}): RawPageData => ({
  url: 'https://example.com',
  title: 'Example Page',
  htmlContent: '<html><body><h1>Welcome</h1><button>Click me</button></body></html>',
  domElements: [
    {
      tagName: 'button',
      id: 'submit-btn',
      className: 'btn btn-primary',
      textContent: 'Click me',
      cssSelector: '#submit-btn',
      isVisible: true,
      boundingRect: { x: 100, y: 200, width: 120, height: 40 },
    },
  ],
  timestamp: new Date(),
  ...overrides,
});

export const createMockSessionData = (overrides: Partial<SessionData> = {}): SessionData => ({
  sessionId: `session_${Date.now()}`,
  tenantId: 'test-tenant',
  siteId: 'test-site',
  startTime: new Date(),
  previousCommands: [],
  ...overrides,
});

// Re-export types from external dependencies that users might need
import type { RawPageData, SessionData } from './ContextualIntentAnalyzer.js';