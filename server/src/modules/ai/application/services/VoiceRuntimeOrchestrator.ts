/**
 * Voice Runtime Orchestrator - Central coordination of voice-powered site interaction
 *
 * Orchestrates the complete voice-to-action pipeline:
 * - ActionManifestGenerator → runtime execution integration
 * - Voice input → LangGraph conversation → action execution
 * - Real-time visual feedback coordination
 * - Performance optimization and monitoring
 * - Multi-tenant session management
 * - Production-ready error handling and recovery
 */

import { EventEmitter } from 'events';
import { createLogger, getErrorMessage } from '../../../../shared/utils.js';
// import type { VoiceSession } from '../../../../shared/types/voice.types'; // TODO: Implement voice session integration
import type { ActionManifestGenerator, SiteManifest, EnhancedSiteAction } from './ActionManifestGenerator.js';
import type { VoiceActionExecutor, VoiceCommand, ActionExecutionResult } from './VoiceActionExecutor.js';
import type { VoiceConversationOrchestrator, ConversationConfig, StreamingResponse } from './VoiceConversationOrchestrator.js';
import type { VoiceVisualFeedbackOrchestrator, VisualFeedbackConfig } from './VoiceVisualFeedbackOrchestrator.js';
import type { WidgetActionBridge, ActionContext } from './WidgetActionBridge.js';

const logger = createLogger({ service: 'voice-runtime-orchestrator' });

export interface VoiceRuntimeConfig {
  // Performance targets
  maxResponseTime: number; // 300ms target
  maxConcurrentSessions: number;
  sessionTimeout: number;

  // Feature flags
  enableOptimisticExecution: boolean;
  enableSpeculativePreloading: boolean;
  enableActionPreviews: boolean;
  enableAdvancedFeedback: boolean;

  // AI configuration
  conversation: ConversationConfig;
  visualFeedback: VisualFeedbackConfig;

  // Security settings
  rateLimiting: {
    maxCommandsPerMinute: number;
    maxActionsPerHour: number;
    cooldownPeriod: number;
  };
}

export interface VoiceRuntimeSession {
  id: string;
  tenantId: string;
  siteId: string;
  userId?: string;

  // Session state
  isActive: boolean;
  startedAt: Date;
  lastActivity: Date;

  // Cached resources
  siteManifest?: SiteManifest;
  manifestGenerated: Date | null;

  // Performance tracking
  metrics: {
    totalCommands: number;
    successfulActions: number;
    failedActions: number;
    averageResponseTime: number;
    lastResponseTimes: number[];
  };

  // Rate limiting
  rateLimits: {
    commandsInLastMinute: number;
    actionsInLastHour: number;
    lastCommandTime: Date;
    isThrottled: boolean;
  };
}

export interface VoiceExecutionContext {
  session: VoiceRuntimeSession;
  actionContext: ActionContext;
  startTime: number;
  optimisticMode: boolean;
  previewMode: boolean;
}

/**
 * Central Voice Runtime Orchestrator
 */
export class VoiceRuntimeOrchestrator extends EventEmitter {
  private config: VoiceRuntimeConfig;
  private activeSessions = new Map<string, VoiceRuntimeSession>();
  private isInitialized = false;

  // Core services
  private actionManifestGenerator: ActionManifestGenerator; // TODO: Implement manifest generation integration
  private voiceActionExecutor: VoiceActionExecutor;
  private conversationOrchestrator: VoiceConversationOrchestrator;
  private visualFeedbackOrchestrator: VoiceVisualFeedbackOrchestrator;
  private widgetActionBridge: WidgetActionBridge; // TODO: Implement widget bridge integration

  // Performance optimization
  private manifestCache = new Map<string, { manifest: SiteManifest; timestamp: Date }>();
  private speculativeCache = new Map<string, ActionExecutionResult>();
  private preloadedActions = new Set<string>();

  // Global metrics
  private globalMetrics = {
    totalSessions: 0,
    totalCommands: 0,
    totalActions: 0,
    averageSessionDuration: 0,
    overallSuccessRate: 0,
    performanceP95: 0,
  };

  constructor(
    config: VoiceRuntimeConfig,
    dependencies: {
      actionManifestGenerator: ActionManifestGenerator;
      voiceActionExecutor: VoiceActionExecutor;
      conversationOrchestrator: VoiceConversationOrchestrator;
      visualFeedbackOrchestrator: VoiceVisualFeedbackOrchestrator;
      widgetActionBridge: WidgetActionBridge;
    }
  ) {
    super();
    this.config = config;

    // Inject dependencies
    this.actionManifestGenerator = dependencies.actionManifestGenerator;
    this.voiceActionExecutor = dependencies.voiceActionExecutor;
    this.conversationOrchestrator = dependencies.conversationOrchestrator;
    this.visualFeedbackOrchestrator = dependencies.visualFeedbackOrchestrator;
    this.widgetActionBridge = dependencies.widgetActionBridge;

    logger.info('VoiceRuntimeOrchestrator created', {
      maxResponseTime: config.maxResponseTime,
      maxConcurrentSessions: config.maxConcurrentSessions,
      enableOptimisticExecution: config.enableOptimisticExecution,
    });
  }

  /**
   * Initialize the voice runtime orchestrator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('VoiceRuntimeOrchestrator already initialized');
      return;
    }

    try {
      // Start cleanup interval for inactive sessions
      setInterval(() => {
        this.cleanupInactiveSessions();
      }, 60000); // Every minute

      // Start performance monitoring
      setInterval(() => {
        this.updateGlobalMetrics();
      }, 30000); // Every 30 seconds

      // Initialize speculative preloading if enabled
      if (this.config.enableSpeculativePreloading) {
        await this.initializeSpeculativePreloading();
      }

      this.isInitialized = true;

      logger.info('VoiceRuntimeOrchestrator initialized successfully', {
        activeSessions: this.activeSessions.size,
        preloadedActions: this.preloadedActions.size,
      });

    } catch (error) {
      logger.error('Failed to initialize VoiceRuntimeOrchestrator', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Process voice input with complete pipeline
   */
  async processVoiceInput(
    sessionId: string,
    audioTranscript: string,
    actionContext: ActionContext,
    options: {
      enableOptimistic?: boolean;
      enablePreview?: boolean;
      streamingCallback?: (response: StreamingResponse) => void;
    } = {}
  ): Promise<ActionExecutionResult | null> {
    const startTime = Date.now();

    try {
      // Get or create session
      const session = await this.getOrCreateSession(sessionId, actionContext);

      // Check rate limits
      if (session.rateLimits.isThrottled) {
        throw new Error('Rate limit exceeded. Please wait before sending more commands.');
      }

      // Update rate limiting
      this.updateRateLimits(session);

      // Show initial visual feedback
      this.visualFeedbackOrchestrator.updateVoiceStatus({
        state: 'processing',
        level: 0,
        confidence: 0,
        partialTranscript: audioTranscript,
        message: 'Processing your command...',
        timestamp: new Date(),
      });

      // Ensure site manifest is available
      await this.ensureSiteManifest(session, actionContext);

      // Create execution context
      const executionContext: VoiceExecutionContext = {
        session,
        actionContext,
        startTime,
        optimisticMode: options.enableOptimistic ?? this.config.enableOptimisticExecution,
        previewMode: options.enablePreview ?? this.config.enableActionPreviews,
      };

      // Process through conversation orchestrator
      const result = await this.conversationOrchestrator.processVoiceInput(
        sessionId,
        audioTranscript,
        actionContext,
        options.streamingCallback
      );

      // Update session metrics
      this.updateSessionMetrics(session, startTime, result?.success ?? false);

      // Update visual feedback based on result
      if (result) {
        await this.handleExecutionResult(result, executionContext);
      }

      logger.info('Voice input processed successfully', {
        sessionId,
        transcript: audioTranscript,
        success: result?.success,
        responseTime: Date.now() - startTime,
      });

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;

      logger.error('Voice input processing failed', {
        sessionId,
        error: getErrorMessage(error),
        transcript: audioTranscript,
        responseTime,
      });

      // Show error feedback
      this.visualFeedbackOrchestrator.updateVoiceStatus({
        state: 'error',
        level: 0,
        confidence: 0,
        partialTranscript: '',
        message: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date(),
      });

      // Update failed metrics
      const session = this.activeSessions.get(sessionId);
      if (session) {
        this.updateSessionMetrics(session, startTime, false);
      }

      return null;
    }
  }

  /**
   * Ensure site manifest is generated and cached
   */
  private async ensureSiteManifest(
    session: VoiceRuntimeSession,
    actionContext: ActionContext
  ): Promise<void> {
    const cacheKey = `${session.tenantId}-${session.siteId}`;
    const cached = this.manifestCache.get(cacheKey);

    // Check if cached manifest is still valid (1 hour)
    const isValid = cached && (Date.now() - cached.timestamp.getTime()) < 3600000;

    if (isValid && session.siteManifest) {
      logger.debug('Using cached site manifest', {
        siteId: session.siteId,
        actionCount: session.siteManifest.actions.length,
      });
      return;
    }

    logger.info('Generating new site manifest', {
      siteId: session.siteId,
      tenantId: session.tenantId,
    });

    try {
      // Generate manifest (this would typically involve crawling/analyzing the site)
      const manifest = await this.generateSiteManifest(session.siteId, actionContext);

      // Update session and cache
      session.siteManifest = manifest;
      session.manifestGenerated = new Date();
      this.manifestCache.set(cacheKey, {
        manifest,
        timestamp: new Date(),
      });

      // Update dependent services
      this.voiceActionExecutor.setActionManifest(manifest);
      this.conversationOrchestrator.setSiteManifest(manifest);

      logger.info('Site manifest generated and cached', {
        siteId: session.siteId,
        actionCount: manifest.actions.length,
        capabilities: manifest.capabilities,
      });

    } catch (error) {
      logger.error('Failed to generate site manifest', {
        siteId: session.siteId,
        error: getErrorMessage(error),
      });
      throw new Error('Could not analyze site for voice interactions');
    }
  }

  /**
   * Generate site manifest using ActionManifestGenerator
   */
  private async generateSiteManifest(
    siteId: string,
    actionContext: ActionContext
  ): Promise<SiteManifest> {
    // This would typically involve:
    // 1. Fetching site HTML/structure
    // 2. Running ActionManifestGenerator analysis
    // 3. Building comprehensive site manifest

    // For now, we'll create a minimal manifest
    // In real implementation, this would call actionManifestGenerator.generate()

    const manifest: SiteManifest = {
      siteId,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      actions: [
        // Navigation actions
        {
          id: 'navigate_home',
          name: 'Navigate to Home',
          type: 'navigation',
          description: 'Navigate to the home page',
          parameters: [],
          requiresAuth: false,
          selector: 'a[href="/"], a[href="#home"]',
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'navigation',
        },
        // Editor actions (when in editor context)
        {
          id: 'select_element',
          name: 'Select Element',
          type: 'custom',
          description: 'Select an element for editing',
          parameters: [
            {
              name: 'description',
              type: 'string',
              required: true,
              description: 'Natural language description of element to select',
            },
          ],
          requiresAuth: true,
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'editor',
        },
        {
          id: 'edit_text',
          name: 'Edit Text Content',
          type: 'custom',
          description: 'Change text content of an element',
          parameters: [
            {
              name: 'target',
              type: 'string',
              required: true,
              description: 'Element to edit',
            },
            {
              name: 'text',
              type: 'string',
              required: true,
              description: 'New text content',
            },
          ],
          requiresAuth: true,
          confirmation: false,
          sideEffecting: 'write',
          riskLevel: 'medium',
          category: 'editor',
        },
      ],
      capabilities: [
        'hasNavigation',
        'hasEditor',
        'hasVoiceControl',
      ],
      metadata: {
        hasContactForm: false,
        hasEcommerce: false,
        hasBooking: false,
        hasBlog: false,
        hasGallery: false,
        hasAuth: true,
        hasSearch: false,
        hasNavigation: true,
        hasFilters: false,
        hasComments: false,
        hasNewsletter: false,
        hasShoppingCart: false,
        hasPayments: false,
        hasUserProfiles: false,
        hasFileUploads: false,
      },
      security: {
        allowedOrigins: [actionContext.origin],
        csrfProtection: true,
        rateLimiting: true,
        requiresHttps: true,
        allowedMethods: ['GET', 'POST', 'PUT'],
      },
    };

    return manifest;
  }

  /**
   * Handle execution result with visual feedback
   */
  private async handleExecutionResult(
    result: ActionExecutionResult,
    _context: VoiceExecutionContext // TODO: Implement context-aware result handling
  ): Promise<void> {
    if (result.success) {
      // Show success feedback
      this.visualFeedbackOrchestrator.updateVoiceStatus({
        state: 'idle',
        level: 0,
        confidence: 1,
        partialTranscript: '',
        message: 'Action completed successfully',
        timestamp: new Date(),
      });

      // Show visual feedback for the action
      if (result.visualFeedback) {
        for (const feedback of result.visualFeedback) {
          await this.visualFeedbackOrchestrator.showFeedback(feedback);
        }
      }

      // Show follow-up suggestions if available
      if (result.followUpSuggestions?.length) {
        this.visualFeedbackOrchestrator.showSuggestions(
          result.followUpSuggestions,
          'What would you like to do next?'
        );
      }

    } else {
      // Show error feedback
      this.visualFeedbackOrchestrator.updateVoiceStatus({
        state: 'error',
        level: 0,
        confidence: 0,
        partialTranscript: '',
        message: result.error || 'Action failed',
        timestamp: new Date(),
      });

      // Show error toast
      await this.visualFeedbackOrchestrator.showFeedback({
        type: 'toast',
        target: 'body',
        duration: 3000,
        message: result.error || 'Action execution failed',
        style: { background: this.config.visualFeedback.errorColor },
      });
    }
  }

  /**
   * Get or create voice session
   */
  private async getOrCreateSession(
    sessionId: string,
    actionContext: ActionContext
  ): Promise<VoiceRuntimeSession> {
    let session = this.activeSessions.get(sessionId);

    if (!session) {
      // Check concurrent session limit
      if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
        throw new Error('Maximum concurrent sessions reached');
      }

      session = {
        id: sessionId,
        tenantId: actionContext.tenantId,
        siteId: actionContext.siteId,
        ...(actionContext.userId !== undefined && { userId: actionContext.userId }),
        isActive: true,
        startedAt: new Date(),
        lastActivity: new Date(),
        manifestGenerated: null,
        metrics: {
          totalCommands: 0,
          successfulActions: 0,
          failedActions: 0,
          averageResponseTime: 0,
          lastResponseTimes: [],
        },
        rateLimits: {
          commandsInLastMinute: 0,
          actionsInLastHour: 0,
          lastCommandTime: new Date(),
          isThrottled: false,
        },
      };

      this.activeSessions.set(sessionId, session);
      this.globalMetrics.totalSessions++;

      logger.info('New voice session created', {
        sessionId,
        tenantId: actionContext.tenantId,
        siteId: actionContext.siteId,
        activeSessions: this.activeSessions.size,
      });
    } else {
      session.lastActivity = new Date();
    }

    return session;
  }

  /**
   * Update rate limiting for session
   */
  private updateRateLimits(session: VoiceRuntimeSession): void {
    const now = new Date();
    const timeSinceLastCommand = now.getTime() - session.rateLimits.lastCommandTime.getTime();

    // Reset minute counter if needed
    if (timeSinceLastCommand > 60000) {
      session.rateLimits.commandsInLastMinute = 0;
    }

    // Reset hour counter if needed
    if (timeSinceLastCommand > 3600000) {
      session.rateLimits.actionsInLastHour = 0;
    }

    // Increment counters
    session.rateLimits.commandsInLastMinute++;
    session.rateLimits.lastCommandTime = now;

    // Check rate limits
    const { rateLimiting } = this.config;
    session.rateLimits.isThrottled =
      session.rateLimits.commandsInLastMinute > rateLimiting.maxCommandsPerMinute ||
      session.rateLimits.actionsInLastHour > rateLimiting.maxActionsPerHour;

    if (session.rateLimits.isThrottled) {
      logger.warn('Session rate limited', {
        sessionId: session.id,
        commandsInLastMinute: session.rateLimits.commandsInLastMinute,
        actionsInLastHour: session.rateLimits.actionsInLastHour,
      });
    }
  }

  /**
   * Update session performance metrics
   */
  private updateSessionMetrics(
    session: VoiceRuntimeSession,
    startTime: number,
    success: boolean
  ): void {
    const responseTime = Date.now() - startTime;

    session.metrics.totalCommands++;
    if (success) {
      session.metrics.successfulActions++;
    } else {
      session.metrics.failedActions++;
    }

    // Update response time tracking
    session.metrics.lastResponseTimes.push(responseTime);
    if (session.metrics.lastResponseTimes.length > 10) {
      session.metrics.lastResponseTimes.shift(); // Keep last 10
    }

    session.metrics.averageResponseTime =
      session.metrics.lastResponseTimes.reduce((sum, time) => sum + time, 0) /
      session.metrics.lastResponseTimes.length;

    // Global metrics update
    this.globalMetrics.totalCommands++;
    if (success) {
      this.globalMetrics.totalActions++;
    }
  }

  /**
   * Initialize speculative preloading
   */
  private async initializeSpeculativePreloading(): Promise<void> {
    // Preload common voice actions
    const commonActions = [
      'navigate_home',
      'select_element',
      'edit_text',
      'help',
    ];

    for (const actionName of commonActions) {
      this.preloadedActions.add(actionName);
    }

    logger.info('Speculative preloading initialized', {
      preloadedActions: this.preloadedActions.size,
    });
  }

  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const inactiveTime = now - session.lastActivity.getTime();

      if (inactiveTime > this.config.sessionTimeout) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;

        logger.debug('Inactive session cleaned up', {
          sessionId,
          inactiveTime: Math.round(inactiveTime / 1000),
          commands: session.metrics.totalCommands,
        });
      }
    }

    if (cleanedCount > 0) {
      logger.info('Session cleanup completed', {
        cleanedSessions: cleanedCount,
        activeSessions: this.activeSessions.size,
      });
    }
  }

  /**
   * Update global performance metrics
   */
  private updateGlobalMetrics(): void {
    const sessions = Array.from(this.activeSessions.values());

    if (sessions.length === 0) {return;}

    // Calculate averages
    const totalDuration = sessions.reduce(
      (sum, s) => sum + (Date.now() - s.startedAt.getTime()),
      0
    );
    this.globalMetrics.averageSessionDuration = totalDuration / sessions.length;

    const totalActions = sessions.reduce(
      (sum, s) => sum + s.metrics.successfulActions + s.metrics.failedActions,
      0
    );
    const successfulActions = sessions.reduce(
      (sum, s) => sum + s.metrics.successfulActions,
      0
    );
    this.globalMetrics.overallSuccessRate = totalActions > 0 ? successfulActions / totalActions : 0;

    // Calculate P95 response time
    const allResponseTimes = sessions.flatMap(s => s.metrics.lastResponseTimes);
    if (allResponseTimes.length > 0) {
      allResponseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(allResponseTimes.length * 0.95);
      this.globalMetrics.performanceP95 = allResponseTimes[p95Index] || 0;
    }
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): VoiceRuntimeSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get global metrics for monitoring
   */
  getGlobalMetrics(): {
    totalSessions: number;
    totalCommands: number;
    totalActions: number;
    averageSessionDuration: number;
    overallSuccessRate: number;
    performanceP95: number;
  } {
    return { ...this.globalMetrics };
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    isInitialized: boolean;
    activeSessions: number;
    manifestsCached: number;
    preloadedActions: number;
    globalMetrics: {
      totalSessions: number;
      totalCommands: number;
      totalActions: number;
      averageSessionDuration: number;
      overallSuccessRate: number;
      performanceP95: number;
    };
  } {
    return {
      isInitialized: this.isInitialized,
      activeSessions: this.activeSessions.size,
      manifestsCached: this.manifestCache.size,
      preloadedActions: this.preloadedActions.size,
      globalMetrics: this.getGlobalMetrics(),
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down VoiceRuntimeOrchestrator', {
      activeSessions: this.activeSessions.size,
      totalCommands: this.globalMetrics.totalCommands,
    });

    // Close all active sessions
    for (const [sessionId, _session] of this.activeSessions.entries()) { // TODO: Implement session cleanup based on session data
      this.conversationOrchestrator.closeSession(sessionId);
    }

    // Clear caches
    this.activeSessions.clear();
    this.manifestCache.clear();
    this.speculativeCache.clear();
    this.preloadedActions.clear();

    this.isInitialized = false;

    logger.info('VoiceRuntimeOrchestrator shutdown complete');
  }
}

/**
 * Factory function to create orchestrator with all dependencies
 */
export function createVoiceRuntimeOrchestrator(
  config: VoiceRuntimeConfig,
  dependencies: {
    actionManifestGenerator: ActionManifestGenerator;
    voiceActionExecutor: VoiceActionExecutor;
    conversationOrchestrator: VoiceConversationOrchestrator;
    visualFeedbackOrchestrator: VoiceVisualFeedbackOrchestrator;
    widgetActionBridge: WidgetActionBridge;
  }
): VoiceRuntimeOrchestrator {
  return new VoiceRuntimeOrchestrator(config, dependencies);
}

/**
 * Default configuration for voice runtime
 */
export const defaultVoiceRuntimeConfig: VoiceRuntimeConfig = {
  maxResponseTime: 300,
  maxConcurrentSessions: 100,
  sessionTimeout: 1800000, // 30 minutes

  enableOptimisticExecution: true,
  enableSpeculativePreloading: true,
  enableActionPreviews: true,
  enableAdvancedFeedback: true,

  conversation: {
    openaiApiKey: process.env['OPENAI_API_KEY'] || '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4000,
    streamingEnabled: true,
    functionCallingEnabled: true,
    confirmationThreshold: 0.8,
  },

  visualFeedback: {
    animationDuration: 300,
    highlightColor: '#3b82f6',
    selectionColor: '#8b5cf6',
    errorColor: '#ef4444',
    successColor: '#10b981',
    previewOpacity: 0.7,
    enableAnimations: true,
    respectReducedMotion: true,
    feedbackQueue: true,
    maxQueueSize: 10,
  },

  rateLimiting: {
    maxCommandsPerMinute: 30,
    maxActionsPerHour: 100,
    cooldownPeriod: 5000,
  },
};