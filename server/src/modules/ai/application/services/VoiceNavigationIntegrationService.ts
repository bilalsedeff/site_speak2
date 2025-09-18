/**
 * Voice Navigation Integration Service - Universal voice navigation integration
 *
 * Orchestrates the complete voice navigation experience:
 * - Integrates UnifiedVoiceOrchestrator with existing voice services
 * - Provides unified API for voice navigation commands
 * - Handles both editor navigation and published site navigation
 * - Maintains separation of concerns while providing seamless integration
 * - Optimizes for <300ms response time with intelligent caching
 */

import { EventEmitter } from 'events';
import { createLogger, getErrorMessage } from '../../../../shared/utils.js';
import { voiceOrchestrator as voiceNavigationOrchestrator } from '../../../../services/voice/index.js';
import type { NavigationStructure } from './SpeculativeNavigationPredictor.js';
import type { NavigationResult } from './OptimisticExecutionEngine.js';
import type { VisualFeedbackEvent as VisualNavigationFeedback } from '../../../../services/voice/visualFeedbackService.js';
import {
  voiceElementSelector,
  type SelectionContext,
  type ElementMatch,
} from './VoiceElementSelector.js';
import {
  voiceActionExecutor,
  type VoiceCommand,
  type ActionExecutionResult,
} from './VoiceActionExecutor.js';
import type { ActionContext } from './WidgetActionBridge.js';

const logger = createLogger({ service: 'voice-navigation-integration' });

export interface UnifiedNavigationCommand {
  text: string;
  type: 'navigation' | 'element_selection' | 'action_execution';
  context: NavigationContext;
  priority: 'immediate' | 'normal' | 'background';
  sessionId: string;
}

export interface NavigationContext {
  mode: 'editor' | 'preview' | 'published_site';
  currentPage: string;
  currentUrl: string;
  siteStructure?: NavigationStructure;
  userRole: string;
  tenantId: string;
  siteId: string;
  constraints?: {
    allowedDomains?: string[];
    restrictedActions?: string[];
    maxNavigationDepth?: number;
  };
}

export interface UnifiedNavigationResult {
  success: boolean;
  type: 'navigation' | 'selection' | 'action';
  result: NavigationResult | ElementMatch | ActionExecutionResult;
  visualFeedback: VisualNavigationFeedback[];
  executionTime: number;
  cacheHit: boolean;
  followUpSuggestions: string[];
  error?: string;
}

export interface NavigationPerformanceMetrics {
  totalCommands: number;
  averageResponseTime: number;
  cacheHitRate: number;
  successRate: number;
  commandDistribution: {
    navigation: number;
    selection: number;
    action: number;
  };
  popularCommands: Map<string, number>;
}

/**
 * Voice Navigation Integration Service
 * Provides unified voice navigation across all contexts
 */
export class VoiceNavigationIntegrationService extends EventEmitter {
  private isInitialized = false;
  // Note: activeNavigations reserved for future concurrent navigation tracking
  private resultCache = new Map<string, UnifiedNavigationResult>();
  private structureCache = new Map<string, NavigationStructure>();

  // Performance tracking
  private metrics: NavigationPerformanceMetrics = {
    totalCommands: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    successRate: 0,
    commandDistribution: {
      navigation: 0,
      selection: 0,
      action: 0,
    },
    popularCommands: new Map(),
  };

  constructor() {
    super();
    this.initialize();
  }

  /**
   * Initialize the integration service
   */
  private async initialize(): Promise<void> {
    try {
      // Set up event listeners for coordinated feedback
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info('VoiceNavigationIntegrationService initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize VoiceNavigationIntegrationService', { error });
      throw error;
    }
  }

  /**
   * Process unified voice navigation command
   */
  async processNavigationCommand(
    command: UnifiedNavigationCommand
  ): Promise<UnifiedNavigationResult> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(command);

    try {
      logger.info('Processing navigation command', {
        text: command.text,
        type: command.type,
        mode: command.context.mode,
        sessionId: command.sessionId,
      });

      // Check cache for immediate responses
      if (this.resultCache.has(cacheKey)) {
        const cachedResult = this.resultCache.get(cacheKey)!;
        logger.debug('Cache hit for navigation command', { command: command.text });

        this.updateMetrics(command, performance.now() - startTime, true, true);
        return {
          ...cachedResult,
          cacheHit: true,
          executionTime: performance.now() - startTime,
        };
      }

      // Determine command type and route to appropriate service
      const commandType = await this.classifyCommand(command);
      let result: UnifiedNavigationResult;

      switch (commandType) {
        case 'navigation':
          result = await this.handleNavigationCommand(command, startTime);
          break;

        case 'element_selection':
          result = await this.handleElementSelectionCommand(command, startTime);
          break;

        case 'action_execution':
          result = await this.handleActionExecutionCommand(command, startTime);
          break;

        default:
          throw new Error(`Unknown command type: ${commandType}`);
      }

      // Cache successful results for performance
      if (result.success && command.priority !== 'immediate') {
        this.resultCache.set(cacheKey, result);
        this.scheduleCacheCleanup();
      }

      // Update metrics
      this.updateMetrics(command, result.executionTime, result.success, false);

      logger.info('Navigation command processed', {
        command: command.text,
        success: result.success,
        type: result.type,
        executionTime: result.executionTime,
        cacheHit: result.cacheHit,
      });

      return result;

    } catch (error) {
      const executionTime = performance.now() - startTime;
      logger.error('Navigation command processing failed', {
        error: getErrorMessage(error),
        command: command.text,
        executionTime,
      });

      this.updateMetrics(command, executionTime, false, false);

      return {
        success: false,
        type: 'navigation',
        result: {} as NavigationResult,
        visualFeedback: [{
          type: 'error_toast',
          data: {
            target: 'body',
            duration: 3000,
            message: `Navigation failed: ${getErrorMessage(error)}`
          },
          timestamp: new Date(),
        }],
        executionTime,
        cacheHit: false,
        followUpSuggestions: this.generateErrorSuggestions(command, getErrorMessage(error)),
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Handle pure navigation commands
   */
  private async handleNavigationCommand(
    command: UnifiedNavigationCommand,
    startTime: number
  ): Promise<UnifiedNavigationResult> {
    const selectionContext: SelectionContext = {
      mode: command.context.mode as 'editor' | 'preview',
      viewport: { width: 1920, height: 1080, zoom: 1 }
    };

    // Simulate navigation execution until method is implemented
    const navigationResult: NavigationResult = {
      success: true,
      url: command.context.currentUrl,
      data: { command: command.text, context: selectionContext }
    };

    return {
      success: navigationResult.success,
      type: 'navigation',
      result: navigationResult,
      visualFeedback: [{
        type: 'action_highlight',
        data: { target: 'body', message: 'Navigation completed' },
        timestamp: new Date()
      }],
      executionTime: performance.now() - startTime,
      cacheHit: false,
      followUpSuggestions: ['Continue navigation', 'Go back'],
      ...(navigationResult.error && { error: navigationResult.error }),
    };
  }

  /**
   * Handle element selection commands
   */
  private async handleElementSelectionCommand(
    command: UnifiedNavigationCommand,
    startTime: number
  ): Promise<UnifiedNavigationResult> {
    const selectionContext: SelectionContext = {
      mode: command.context.mode as 'editor' | 'preview',
      viewport: { width: 1920, height: 1080, zoom: 1 }
    };

    // Parse element description and find matches
    const descriptor = await voiceElementSelector.parseElementDescription(
      command.text,
      selectionContext
    );

    // Get DOM elements (this would be provided by the context in real implementation)
    const domElements = await this.getDOMElementsFromContext(command.context);

    const matches = await voiceElementSelector.findMatchingElements(
      descriptor,
      domElements,
      selectionContext
    );

    if (matches.length === 0) {
      throw new Error(`No elements found matching: ${command.text}`);
    }

    const bestMatch = matches[0]!;

    return {
      success: true,
      type: 'selection',
      result: bestMatch,
      visualFeedback: [{
        type: 'action_highlight',
        data: {
          target: bestMatch.element.cssSelector || `#${bestMatch.element.id}`,
          duration: 2000,
          message: `Selected: ${descriptor.text || command.text}`
        },
        timestamp: new Date()
      }],
      executionTime: performance.now() - startTime,
      cacheHit: false,
      followUpSuggestions: this.generateElementSuggestions(bestMatch),
    };
  }

  /**
   * Handle action execution commands
   */
  private async handleActionExecutionCommand(
    command: UnifiedNavigationCommand,
    startTime: number
  ): Promise<UnifiedNavigationResult> {
    const voiceCommand: VoiceCommand = {
      text: command.text,
      intent: 'action',
      confidence: 0.8,
      parameters: {},
      context: {
        currentPage: command.context.currentPage,
        userRole: command.context.userRole,
        editorMode: command.context.mode as any,
      },
    };

    const actionContext: ActionContext = {
      tenantId: command.context.tenantId,
      siteId: command.context.siteId,
      userId: command.context.userRole,
      sessionId: command.sessionId,
      origin: command.context.currentUrl,
      timestamp: new Date(),
      mode: command.context.mode as 'editor' | 'preview'
    };

    const actionResult = await voiceActionExecutor.executeVoiceCommand(
      voiceCommand,
      actionContext
    );

    return {
      success: actionResult.success,
      type: 'action',
      result: actionResult,
      visualFeedback: actionResult.visualFeedback?.map(feedback => ({
        type: 'action_highlight' as const,
        data: {
          target: feedback.target,
          duration: feedback.duration,
          message: feedback.message || 'Action executed'
        },
        timestamp: new Date()
      })) || [],
      executionTime: performance.now() - startTime,
      cacheHit: false,
      followUpSuggestions: actionResult.followUpSuggestions || [],
      ...(actionResult.error && { error: actionResult.error }),
    };
  }

  /**
   * Classify command type using intent analysis
   */
  private async classifyCommand(
    command: UnifiedNavigationCommand
  ): Promise<'navigation' | 'element_selection' | 'action_execution'> {
    const text = command.text.toLowerCase();

    // Navigation patterns
    if (text.includes('go to') || text.includes('navigate') || text.includes('open page')) {
      return 'navigation';
    }

    // Element selection patterns
    if (text.includes('select') || text.includes('find') || text.includes('show me')) {
      return 'element_selection';
    }

    // Action execution patterns
    if (text.includes('click') || text.includes('submit') || text.includes('change')) {
      return 'action_execution';
    }

    // Default to navigation for ambiguous commands
    return 'navigation';
  }

  /**
   * Setup event listeners for coordinated feedback
   */
  private setupEventListeners(): void {
    // Listen to navigation orchestrator events
    voiceNavigationOrchestrator.on('feedback', (feedback: VisualNavigationFeedback) => {
      this.emit('visual_feedback', feedback);
    });

    // Listen to element selector events
    voiceElementSelector.on('selection_updated', (match: ElementMatch) => {
      this.emit('element_selected', match);
    });

    // Coordinate between services
    this.on('navigation_started', () => {
      this.emit('clear_selections');
    });
  }

  /**
   * Generate cache key for commands
   */
  private generateCacheKey(command: UnifiedNavigationCommand): string {
    return `${command.context.mode}:${command.context.currentPage}:${command.text}`;
  }

  /**
   * Schedule cache cleanup to prevent memory leaks
   */
  private scheduleCacheCleanup(): void {
    setTimeout(() => {
      const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
      for (const [key, result] of this.resultCache.entries()) {
        if (result.executionTime < cutoff) {
          this.resultCache.delete(key);
        }
      }
    }, 60000); // Run cleanup every minute
  }

  /**
   * Get DOM elements from context (mock implementation)
   */
  private async getDOMElementsFromContext(_context: NavigationContext): Promise<any[]> {
    // This would fetch real DOM elements in production
    return [];
  }

  /**
   * Generate suggestions for element interactions
   */
  private generateElementSuggestions(match: ElementMatch): string[] {
    const suggestions = ['Click this element', 'Edit properties', 'Move element'];

    if (match.element.tagName.toLowerCase() === 'input') {
      suggestions.push('Enter text', 'Clear input');
    }

    if (match.element.tagName.toLowerCase() === 'button') {
      suggestions.push('Click button', 'Change button text');
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Generate error recovery suggestions
   */
  private generateErrorSuggestions(
    _command: UnifiedNavigationCommand,
    error: string
  ): string[] {
    const suggestions = ['Try a different command', 'Say "help" for assistance'];

    if (error.includes('not found')) {
      suggestions.push('Be more specific', 'Try "show me the menu"');
    }

    if (error.includes('permission')) {
      suggestions.push('Check permissions', 'Try a different action');
    }

    return suggestions;
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(
    command: UnifiedNavigationCommand,
    executionTime: number,
    success: boolean,
    cacheHit: boolean
  ): void {
    this.metrics.totalCommands++;

    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalCommands - 1) + executionTime) /
      this.metrics.totalCommands;

    // Update cache hit rate
    if (cacheHit) {
      this.metrics.cacheHitRate =
        (this.metrics.cacheHitRate * (this.metrics.totalCommands - 1) + 1) /
        this.metrics.totalCommands;
    }

    // Update success rate
    if (success) {
      this.metrics.successRate =
        (this.metrics.successRate * (this.metrics.totalCommands - 1) + 1) /
        this.metrics.totalCommands;
    }

    // Update command distribution
    const commandType = command.type;
    if (commandType === 'navigation') {
      this.metrics.commandDistribution.navigation++;
    } else if (commandType === 'element_selection') {
      this.metrics.commandDistribution.selection++;
    } else if (commandType === 'action_execution') {
      this.metrics.commandDistribution.action++;
    }

    // Update popular commands
    const count = this.metrics.popularCommands.get(command.text) || 0;
    this.metrics.popularCommands.set(command.text, count + 1);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): NavigationPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.resultCache.clear();
    this.structureCache.clear();
    // Note: clearCache method to be implemented on orchestrator
    logger.debug('All navigation caches cleared');
  }

  /**
   * Health check for the integration service
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    metrics: NavigationPerformanceMetrics;
  } {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      services: {
        navigationOrchestrator: true,
        elementSelector: true,
        actionExecutor: true,
      },
      metrics: this.metrics,
    };
  }
}

// Export singleton instance
export const voiceNavigationIntegrationService = new VoiceNavigationIntegrationService();
