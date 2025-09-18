/**
 * Voice Suggestion System - Main Integration Service
 *
 * Comprehensive voice command suggestion and auto-completion system that
 * integrates AI-powered contextual suggestions, real-time auto-completion,
 * universal page analysis, and modern voice-first UI components.
 *
 * Features:
 * - Context-aware AI-powered command suggestions
 * - Real-time voice input auto-completion <50ms
 * - Universal page analysis and action discovery
 * - Intelligent caching and user learning
 * - Modern voice-first UI with accessibility
 * - Command palette for visual browsing
 * - Performance monitoring and optimization
 * - Seamless integration with existing voice services
 */

import {
  SuggestionRequest,
  SuggestionContext,
  SuggestionSystemConfig,
  AutoCompletionResult,
  UserSuggestionProfile,
  CommandSuggestion,
  SuggestionSystemMetrics,
  SuggestionUICallbacks,
  VoiceIntegrationCallbacks,
  IntentIntegrationData
} from '@shared/types/suggestion.types';

import { contextDiscoveryService } from './ContextDiscoveryService';
import { commandSuggestionEngine } from './CommandSuggestionEngine';
import { autoCompletionService } from './AutoCompletionService';
import { suggestionCacheManager } from './SuggestionCacheManager';
import { createSuggestionUIOrchestrator, SuggestionUIOrchestrator } from './SuggestionUIOrchestrator';
import { commandPaletteService } from './CommandPaletteService';
import { suggestionPerformanceMonitor } from './SuggestionPerformanceMonitor';
import { suggestionErrorHandler } from './SuggestionErrorHandler';

interface SuggestionSystemCallbacks {
  onSuggestionGenerated?: (suggestions: CommandSuggestion[]) => void;
  onSuggestionSelected?: (suggestion: CommandSuggestion) => void;
  onAutoCompletionTriggered?: (completion: AutoCompletionResult) => void;
  onUserLearningUpdate?: (profile: UserSuggestionProfile) => void;
  onPerformanceAlert?: (metric: string, value: number, threshold: number) => void;
  onError?: (error: Error, context: string) => void;
}

export class VoiceSuggestionIntegrationService {
  private config: SuggestionSystemConfig;
  private callbacks: SuggestionSystemCallbacks;
  private uiOrchestrator: SuggestionUIOrchestrator | null = null;
  private currentContext: SuggestionContext | null = null;
  private currentUserProfile: UserSuggestionProfile | null = null;
  private isInitialized = false;
  private performanceMonitor: NodeJS.Timeout | null = null;
  private metrics: SuggestionSystemMetrics;

  constructor(
    config: Partial<SuggestionSystemConfig> = {},
    callbacks: SuggestionSystemCallbacks = {}
  ) {
    this.config = {
      ai: {
        model: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 1000,
        timeout: 5000,
        enableContextBoost: true,
        enableSemanticSearch: true,
        confidenceThreshold: 0.6,
        ...config.ai
      },
      cache: {
        enabled: true,
        maxEntries: 10000,
        ttl: 300000,
        strategy: 'adaptive',
        persistToDisk: true,
        compressionEnabled: true,
        ...config.cache
      },
      performance: {
        targetResponseTime: 200,
        maxConcurrentRequests: 10,
        enablePreloading: true,
        enablePredictive: true,
        batchingEnabled: true,
        batchSize: 5,
        debounceDelay: 100,
        ...config.performance
      },
      ui: {
        theme: 'auto',
        position: 'bottom',
        maxVisible: 5,
        showDescriptions: true,
        showKeyboardShortcuts: false,
        enableAnimations: true,
        autoHide: true,
        autoHideDelay: 5000,
        voiceFirst: true,
        ...config.ui
      },
      palette: {
        enableSearch: true,
        enableCategories: true,
        enableKeyboardShortcuts: true,
        enableHelp: true,
        showRecentCommands: true,
        showPopularCommands: true,
        maxRecentCommands: 10,
        maxPopularCommands: 8,
        ...config.palette
      },
      learning: {
        enabled: true,
        adaptiveThresholds: true,
        patternDetection: true,
        userFeedbackWeight: 0.3,
        retentionPeriod: 2592000000, // 30 days
        anonymizeData: true,
        ...config.learning
      },
      features: {
        autoCompletion: true,
        proactiveSuggestions: true,
        contextualHelp: true,
        voiceCommandPalette: true,
        smartFiltering: true,
        multiLanguage: false,
        accessibilityEnhancements: true,
        ...config.features
      }
    };

    this.callbacks = callbacks;

    this.metrics = {
      totalRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      cacheHitRate: 0,
      suggestionAccuracy: 0,
      userSatisfaction: 0,
      errorRate: 0,
      performanceTrends: []
    };
  }

  /**
   * Initialize the suggestion system
   */
  async initialize(
    openaiApiKey: string,
    uiCallbacks?: Partial<SuggestionUICallbacks>
  ): Promise<void> {
    if (this.isInitialized) {return;}

    try {
      // Initialize command suggestion engine with API key
      commandSuggestionEngine.constructor(openaiApiKey, this.config.ai);

      // Initialize UI orchestrator if callbacks provided
      if (uiCallbacks) {
        this.uiOrchestrator = createSuggestionUIOrchestrator(
          this.config.ui,
          {
            onSuggestionSelect: this.handleSuggestionSelection.bind(this),
            onSuggestionHover: this.handleSuggestionHover.bind(this),
            onFeedback: this.handleFeedback.bind(this),
            onDismiss: this.handleDismiss.bind(this),
            ...uiCallbacks
          }
        );
      }

      // Initialize command palette
      commandPaletteService.constructor(this.config.palette);

      // Start performance monitoring
      if (this.config.performance.targetResponseTime) {
        this.startPerformanceMonitoring();
      }

      // Initialize context discovery with initial page analysis
      await this.updatePageContext();

      this.isInitialized = true;

      console.log('Voice Suggestion System initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Voice Suggestion System:', error);
      this.callbacks.onError?.(error as Error, 'initialization');
      throw error;
    }
  }

  /**
   * Generate contextual suggestions for current page
   */
  async generateSuggestions(
    options: {
      maxSuggestions?: number;
      categories?: string[];
      includeProactive?: boolean;
      useCache?: boolean;
    } = {}
  ): Promise<CommandSuggestion[]> {
    const startTime = performance.now();

    return suggestionErrorHandler.executeWithRetry(async () => {
      if (!this.currentContext) {
        await this.updatePageContext();
      }

      const request: SuggestionRequest = {
        context: this.currentContext!,
        maxSuggestions: options.maxSuggestions || 5,
        categories: options.categories as any,
        ...(this.currentUserProfile && { userProfile: this.currentUserProfile }),
        options: {
          useCache: options.useCache !== false,
          timeout: this.config.ai.timeout
        }
      };

      const response = await commandSuggestionEngine.generateSuggestions(request);

      // Record performance metrics
      const responseTime = performance.now() - startTime;
      suggestionPerformanceMonitor.recordSample('suggestion_generation_time', responseTime);

      // Update metrics
      this.updateMetrics('suggestion_generation', responseTime);

      // Cache suggestions
      if (this.config.cache.enabled) {
        await suggestionCacheManager.setSuggestions(
          this.generateCacheKey(request),
          response.suggestions,
          this.currentContext!,
          this.currentUserProfile?.userId
        );
      }

      // Add to auto-completion index
      if (this.config.features.autoCompletion) {
        autoCompletionService.addSuggestionsToIndex(
          response.suggestions,
          this.currentUserProfile?.userId
        );
      }

      // Add to command palette
      commandPaletteService.addCommands(response.suggestions);

      // Notify callback
      this.callbacks.onSuggestionGenerated?.(response.suggestions);

      return response.suggestions;

    }, 'suggestion_engine', 'generateSuggestions').catch(async (error) => {
      // Handle error with fallback
      const fallbackResponse = await suggestionErrorHandler.handleSuggestionError(
        error,
        this.currentContext!,
        'suggestion_engine'
      );

      this.callbacks.onError?.(error as Error, 'suggestion_generation');
      return fallbackResponse.suggestions;
    });
  }

  /**
   * Get auto-completion for partial voice input
   */
  async getAutoCompletion(
    partialInput: string,
    options: {
      immediate?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<AutoCompletionResult> {
    if (!this.config.features.autoCompletion || !this.currentContext) {
      return {
        completions: [],
        partialInput,
        confidence: 0,
        processingTime: 0,
        fallbackUsed: true,
        suggestions: []
      };
    }

    const startTime = performance.now();

    try {
      const result = await autoCompletionService.getCompletions(
        partialInput,
        this.currentContext,
        this.currentUserProfile || undefined,
        {
          ...(options.immediate !== undefined && { immediate: options.immediate }),
          maxResults: options.maxResults || 10,
          includeSemanticMatches: this.config.ai.enableSemanticSearch
        }
      );

      // Update metrics
      this.updateMetrics('auto_completion', performance.now() - startTime);

      // Notify callback
      this.callbacks.onAutoCompletionTriggered?.(result);

      return result;

    } catch (error) {
      console.error('Auto-completion failed:', error);
      this.callbacks.onError?.(error as Error, 'auto_completion');

      return {
        completions: [],
        partialInput,
        confidence: 0,
        processingTime: performance.now() - startTime,
        fallbackUsed: true,
        suggestions: []
      };
    }
  }

  /**
   * Show suggestions in UI
   */
  async showSuggestions(
    suggestions?: CommandSuggestion[],
    options: {
      highlightFirst?: boolean;
      voiceTriggered?: boolean;
      immediate?: boolean;
    } = {}
  ): Promise<void> {
    if (!this.uiOrchestrator) {return;}

    const suggestionsToShow = suggestions || await this.generateSuggestions();

    await this.uiOrchestrator.showSuggestions(
      suggestionsToShow,
      this.currentContext!,
      options
    );
  }

  /**
   * Hide suggestions UI
   */
  async hideSuggestions(immediate = false): Promise<void> {
    if (!this.uiOrchestrator) {return;}
    await this.uiOrchestrator.hideSuggestions(immediate);
  }

  /**
   * Open command palette
   */
  async openCommandPalette(options: {
    searchQuery?: string;
    category?: string;
  } = {}): Promise<void> {
    await commandPaletteService.openPalette({
      ...(options.searchQuery && { searchQuery: options.searchQuery }),
      ...(options.category && { category: options.category as any }),
      ...(this.currentContext && { context: this.currentContext })
    });
  }

  /**
   * Update page context from current DOM
   */
  async updatePageContext(): Promise<void> {
    try {
      const pageAnalysis = await contextDiscoveryService.analyzePage();

      this.currentContext = {
        pageType: pageAnalysis.pageType,
        availableElements: pageAnalysis.elements
          .filter(e => e.isInteractable)
          .map(e => e.selector),
        userRole: 'user', // Would be determined from auth context
        currentMode: 'view', // Would be determined from app state
        capabilities: pageAnalysis.capabilities,
        restrictions: [],
        sessionHistory: [],
        userPatterns: this.currentUserProfile?.frequentPatterns.map(p => p.pattern) || []
      };

    } catch (error) {
      console.error('Failed to update page context:', error);
      this.callbacks.onError?.(error as Error, 'context_update');
    }
  }

  /**
   * Set user profile for personalization
   */
  setUserProfile(profile: UserSuggestionProfile): void {
    this.currentUserProfile = profile;

    // Update cache manager
    suggestionCacheManager.updateUserProfile(profile.userId!, profile);

    // Update command palette
    commandPaletteService.setUserProfile(profile);

    this.callbacks.onUserLearningUpdate?.(profile);
  }

  /**
   * Learn from user feedback
   */
  async learnFromFeedback(
    suggestion: CommandSuggestion,
    wasUsed: boolean,
    feedback: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    if (!this.config.learning.enabled) {return;}

    try {
      // Update command suggestion engine
      await commandSuggestionEngine.learnFromFeedback(
        suggestion,
        wasUsed,
        feedback,
        this.currentUserProfile?.userId
      );

      // Update auto-completion service if used
      if (wasUsed) {
        autoCompletionService.learnFromSelection(
          {
            text: suggestion.command,
            intent: suggestion.intent,
            confidence: suggestion.confidence,
            matchType: 'exact',
            highlightRanges: [],
            reasoning: 'User selected'
          },
          suggestion.command,
          this.currentUserProfile?.userId
        );
      }

      // Update user profile if available
      if (this.currentUserProfile) {
        const historyEntry = {
          command: suggestion.command,
          intent: suggestion.intent,
          context: this.currentContext?.pageType || 'unknown',
          success: wasUsed && feedback !== 'negative',
          confidence: suggestion.confidence,
          timestamp: new Date(),
          executionTime: 0,
          feedback
        };

        this.currentUserProfile.learningData.commandHistory.push(historyEntry);

        // Update user profile
        this.setUserProfile(this.currentUserProfile);
      }

    } catch (error) {
      console.error('Failed to learn from feedback:', error);
      this.callbacks.onError?.(error as Error, 'learning');
    }
  }

  /**
   * Get system metrics and performance data
   */
  getMetrics(): SuggestionSystemMetrics {
    const cacheStats = suggestionCacheManager.getCacheStats();
    const completionStats = autoCompletionService.getCompletionStats();

    return {
      ...this.metrics,
      cacheHitRate: cacheStats.hitRate,
      suggestionAccuracy: completionStats.averageConfidence,
      userSatisfaction: this.calculateUserSatisfaction()
    };
  }

  /**
   * Get discovery suggestions for "What can I do here?"
   */
  async getDiscoverySuggestions(): Promise<CommandSuggestion[]> {
    if (!this.currentContext) {
      await this.updatePageContext();
    }

    return commandSuggestionEngine.getDiscoverySuggestions(this.currentContext!);
  }

  /**
   * Integration with voice services
   */
  integrateWithVoiceServices(callbacks: VoiceIntegrationCallbacks): void {
    // Set up voice integration callbacks
    callbacks.onPartialTranscription = (text) => {
      if (this.config.features.autoCompletion) {
        this.getAutoCompletion(text, { immediate: true });
      }
    };

    callbacks.onFinalTranscription = async (text) => {
      // Generate contextual suggestions based on transcription
      const suggestions = await this.generateSuggestions();

      // Show suggestions if relevant
      const relevantSuggestions = suggestions.filter(s =>
        s.command.toLowerCase().includes(text.toLowerCase()) ||
        s.keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))
      );

      if (relevantSuggestions.length > 0) {
        await this.showSuggestions(relevantSuggestions, { voiceTriggered: true });
      }
    };
  }

  /**
   * Integration with intent recognition
   */
  integrateWithIntentRecognition(data: IntentIntegrationData): void {
    // Use intent analysis to boost relevant suggestions
    if (this.currentContext) {
      this.currentContext = {
        ...this.currentContext,
        capabilities: [...this.currentContext.capabilities, ...data.availableIntents],
        // Additional integration logic
      };
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.performanceMonitor) {
      clearInterval(this.performanceMonitor);
    }

    this.uiOrchestrator?.destroy();
    suggestionCacheManager.shutdown();

    this.isInitialized = false;
  }

  // ======================= PRIVATE METHODS =======================

  private handleSuggestionSelection(suggestion: CommandSuggestion): void {
    this.callbacks.onSuggestionSelected?.(suggestion);

    // Learn from selection
    this.learnFromFeedback(suggestion, true, 'positive');
  }

  private handleSuggestionHover(_suggestion: CommandSuggestion): void {
    // Could be used for preview or additional context
  }

  private handleFeedback(suggestion: CommandSuggestion, feedback: 'positive' | 'negative'): void {
    this.learnFromFeedback(suggestion, false, feedback);
  }

  private handleDismiss(): void {
    // Handle UI dismissal
  }

  private generateCacheKey(request: SuggestionRequest): string {
    return `${request.context.pageType}-${request.context.currentMode}-${request.maxSuggestions}`;
  }

  private updateMetrics(operation: string, responseTime: number): void {
    this.metrics.totalRequests++;

    // Update average response time
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;

    // Update P95 response time (simplified)
    this.metrics.p95ResponseTime = Math.max(this.metrics.p95ResponseTime, responseTime);

    // Add to performance trends
    this.metrics.performanceTrends.push({
      timestamp: new Date(),
      metric: `${operation}_response_time`,
      value: responseTime,
      target: 100 // Target response time in ms
    });

    // Keep only recent trends
    if (this.metrics.performanceTrends.length > 1000) {
      this.metrics.performanceTrends = this.metrics.performanceTrends.slice(-500);
    }

    // Check for performance alerts
    if (responseTime > this.config.performance.targetResponseTime * 2) {
      this.callbacks.onPerformanceAlert?.(
        `${operation}_response_time`,
        responseTime,
        this.config.performance.targetResponseTime
      );
    }
  }

  private calculateUserSatisfaction(): number {
    if (!this.currentUserProfile || this.currentUserProfile.learningData.commandHistory.length === 0) {
      return 0.5; // Neutral baseline
    }

    const recentHistory = this.currentUserProfile.learningData.commandHistory.slice(-100);
    const positiveCount = recentHistory.filter(h => h.feedback === 'positive').length;
    const totalWithFeedback = recentHistory.filter(h => h.feedback).length;

    return totalWithFeedback > 0 ? positiveCount / totalWithFeedback : 0.5;
  }

  private startPerformanceMonitoring(): void {
    this.performanceMonitor = setInterval(() => {
      const metrics = this.getMetrics();

      // Check performance thresholds
      if (metrics.avgResponseTime > this.config.performance.targetResponseTime * 1.5) {
        this.callbacks.onPerformanceAlert?.(
          'avg_response_time',
          metrics.avgResponseTime,
          this.config.performance.targetResponseTime
        );
      }

      if (metrics.cacheHitRate < 0.6) {
        this.callbacks.onPerformanceAlert?.(
          'cache_hit_rate',
          metrics.cacheHitRate,
          0.8
        );
      }

      if (metrics.errorRate > 0.1) {
        this.callbacks.onPerformanceAlert?.(
          'error_rate',
          metrics.errorRate,
          0.05
        );
      }
    }, 60000); // Check every minute
  }
}

// Export individual services for direct use
export {
  contextDiscoveryService,
  commandSuggestionEngine,
  autoCompletionService,
  suggestionCacheManager,
  commandPaletteService,
  createSuggestionUIOrchestrator,
  suggestionPerformanceMonitor,
  suggestionErrorHandler
};

// Export types
export * from '@shared/types/suggestion.types';

// Factory function for easy setup
export async function createVoiceSuggestionSystem(
  openaiApiKey: string,
  config: Partial<SuggestionSystemConfig> = {},
  callbacks: SuggestionSystemCallbacks = {},
  uiCallbacks?: Partial<SuggestionUICallbacks>
): Promise<VoiceSuggestionIntegrationService> {
  const system = new VoiceSuggestionIntegrationService(config, callbacks);
  await system.initialize(openaiApiKey, uiCallbacks);
  return system;
}

// Default export
export default VoiceSuggestionIntegrationService;