import { createLogger } from '../../../../shared/utils.js';
import { ActionExecutorService, ActionExecutionRequest, ActionExecutionResult } from '../ActionExecutorService.js';
import { ActionManifestGenerator, SiteManifest } from './ActionManifestGenerator.js';
import { WidgetActionBridge, BridgeConfig } from './WidgetActionBridge.js';
import type { SiteAction } from '../../../../shared/types.js';
import { analyticsHelpers } from '../../../../services/_shared/analytics/index.js';

const logger = createLogger({ service: 'action-dispatch' });

export interface ActionDispatchRequest {
  siteId: string;
  tenantId: string;
  actionName: string;
  parameters: Record<string, any>;
  sessionId?: string;
  userId?: string;
  origin?: string;
  requestId?: string;
}

export interface ActionDispatchResult {
  success: boolean;
  result: any;
  executionTime: number;
  sideEffects: ActionExecutionResult['sideEffects'];
  bridgeInstructions?: {
    type: 'navigation' | 'form_submission' | 'dom_interaction' | 'api_response' | 'custom_action';
    payload: any;
  };
  error?: string;
  requestId?: string;
}

export interface DispatchConfiguration {
  siteId: string;
  tenantId: string;
  manifest?: SiteManifest;
  bridgeConfig?: BridgeConfig;
  allowedOrigins: string[];
  securitySettings: {
    requireOriginValidation: boolean;
    allowCrossTenant: boolean;
    maxActionsPerMinute: number;
    riskLevelThresholds: {
      low: number;
      medium: number;
      high: number;
    };
  };
}

/**
 * Central dispatch service that orchestrates action execution across the entire AI actions infrastructure.
 * 
 * Responsibilities:
 * - Coordinate manifest generation, bridge configuration, and action execution
 * - Handle security validation and origin checking
 * - Provide unified interface for both direct API calls and widget-initiated actions
 * - Manage rate limiting and risk assessment
 * - Transform execution results into bridge-compatible instructions
 */
export class ActionDispatchService {
  private manifestCache = new Map<string, { manifest: SiteManifest; timestamp: number }>();
  private bridgeCache = new Map<string, { config: BridgeConfig; timestamp: number }>();
  private rateLimitTracker = new Map<string, { count: number; resetTime: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

  constructor(
    private actionExecutor: ActionExecutorService,
    private _manifestGenerator: ActionManifestGenerator,
    private widgetBridge: WidgetActionBridge
  ) {}

  /**
   * Initialize dispatch configuration for a site
   */
  async initializeDispatch(config: Omit<DispatchConfiguration, 'manifest' | 'bridgeConfig'>): Promise<DispatchConfiguration> {
    const startTime = Date.now();
    
    logger.info('Initializing action dispatch', {
      siteId: config.siteId,
      tenantId: config.tenantId,
      allowedOrigins: config.allowedOrigins.length
    });

    try {
      // Check cache first
      const cacheKey = `${config.tenantId}:${config.siteId}`;
      const cachedManifest = this.manifestCache.get(cacheKey);
      const cachedBridge = this.bridgeCache.get(cacheKey);

      let manifest: SiteManifest;
      let bridgeConfig: BridgeConfig;

      if (cachedManifest && cachedBridge && 
          Date.now() - cachedManifest.timestamp < this.CACHE_TTL &&
          Date.now() - cachedBridge.timestamp < this.CACHE_TTL) {
        
        manifest = cachedManifest.manifest;
        bridgeConfig = cachedBridge.config;
        
        logger.debug('Using cached configuration', {
          siteId: config.siteId,
          cacheAge: Date.now() - cachedManifest.timestamp
        });
      } else {
        // Generate fresh configuration
        // For now, we'll generate a basic manifest - in production this would
        // be generated from actual site HTML content
        manifest = await this.generateSiteManifest(config.siteId, config.tenantId);
        bridgeConfig = this.widgetBridge.initialize(manifest, config.allowedOrigins);

        // Cache the results
        this.manifestCache.set(cacheKey, {
          manifest,
          timestamp: Date.now()
        });
        this.bridgeCache.set(cacheKey, {
          config: bridgeConfig,
          timestamp: Date.now()
        });
      }

      // Register actions with the executor
      this.actionExecutor.registerActions(config.siteId, manifest.actions as SiteAction[]);

      const initializationTime = Date.now() - startTime;
      logger.info('Action dispatch initialized successfully', {
        siteId: config.siteId,
        actionsCount: manifest.actions.length,
        initializationTime
      });

      return {
        ...config,
        manifest,
        bridgeConfig
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      logger.error('Failed to initialize action dispatch', {
        siteId: config.siteId,
        error: errorMessage,
        initializationTime: Date.now() - startTime
      });
      throw new Error(`Dispatch initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Dispatch an action execution request
   */
  async dispatchAction(
    request: ActionDispatchRequest,
    configuration?: DispatchConfiguration
  ): Promise<ActionDispatchResult> {
    const startTime = Date.now();
    
    logger.info('Dispatching action', {
      siteId: request.siteId,
      actionName: request.actionName,
      origin: request.origin,
      requestId: request.requestId
    });

    try {
      // Get or create configuration
      let config = configuration;
      if (!config) {
        config = await this.initializeDispatch({
          siteId: request.siteId,
          tenantId: request.tenantId,
          allowedOrigins: request.origin ? [request.origin] : ['*'],
          securitySettings: {
            requireOriginValidation: true,
            allowCrossTenant: false,
            maxActionsPerMinute: 30,
            riskLevelThresholds: {
              low: 100,
              medium: 20,
              high: 5
            }
          }
        });
      }

      // Security validation
      await this.validateActionRequest(request, config);

      // Rate limiting
      this.enforceRateLimit(request, config);

      // Execute the action through the executor service
      const executionRequest: ActionExecutionRequest = {
        siteId: request.siteId,
        actionName: request.actionName,
        parameters: request.parameters,
        ...(request.sessionId !== undefined && { sessionId: request.sessionId }),
        ...(request.userId !== undefined && { userId: request.userId }),
      };

      const executionResult = await this.actionExecutor.execute(executionRequest);

      // Transform result into bridge-compatible format
      const bridgeInstructions = this.transformToBridgeInstructions(executionResult);

      const totalTime = Date.now() - startTime;
      
      logger.info('Action dispatched successfully', {
        siteId: request.siteId,
        actionName: request.actionName,
        success: executionResult.success,
        totalTime,
        executionTime: executionResult.executionTime,
        sideEffectsCount: executionResult.sideEffects.length
      });

      // Track analytics for tool execution
      try {
        // Determine tool category from action name
        let category = 'siteops'; // Default category
        if (request.actionName.includes('navigation') || request.actionName.includes('goto')) {
          category = 'navigation';
        } else if (request.actionName.includes('search')) {
          category = 'search';  
        } else if (request.actionName.includes('form') || request.actionName.includes('field')) {
          category = 'forms';
        } else if (request.actionName.includes('commerce') || request.actionName.includes('cart')) {
          category = 'commerce';
        } else if (request.actionName.includes('booking') || request.actionName.includes('slot')) {
          category = 'booking';
        }

        await analyticsHelpers.trackToolExecution(
          request.tenantId,
          request.siteId,
          request.actionName,
          category,
          totalTime,
          executionResult.success,
          request.sessionId
        );
      } catch (error) {
        logger.warn('Failed to track tool execution analytics', { 
          error, 
          actionName: request.actionName,
          siteId: request.siteId 
        });
      }

      return {
        success: executionResult.success,
        result: executionResult.result,
        executionTime: totalTime,
        sideEffects: executionResult.sideEffects,
        ...(bridgeInstructions !== undefined && { bridgeInstructions }),
        ...(executionResult.error !== undefined && { error: executionResult.error }),
        ...(request.requestId !== undefined && { requestId: request.requestId }),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown dispatch error';
      const totalTime = Date.now() - startTime;

      logger.error('Action dispatch failed', {
        siteId: request.siteId,
        actionName: request.actionName,
        error: errorMessage,
        totalTime
      });

      // Track analytics for failed tool execution
      try {
        let category = 'siteops'; // Default category
        if (request.actionName.includes('navigation') || request.actionName.includes('goto')) {
          category = 'navigation';
        } else if (request.actionName.includes('search')) {
          category = 'search';  
        } else if (request.actionName.includes('form') || request.actionName.includes('field')) {
          category = 'forms';
        } else if (request.actionName.includes('commerce') || request.actionName.includes('cart')) {
          category = 'commerce';
        } else if (request.actionName.includes('booking') || request.actionName.includes('slot')) {
          category = 'booking';
        }

        await analyticsHelpers.trackToolExecution(
          request.tenantId,
          request.siteId,
          request.actionName,
          category,
          totalTime,
          false, // success = false for errors
          request.sessionId
        );
      } catch (analyticsError) {
        logger.warn('Failed to track failed tool execution analytics', { 
          analyticsError, 
          actionName: request.actionName,
          siteId: request.siteId 
        });
      }

      return {
        success: false,
        result: null,
        executionTime: totalTime,
        sideEffects: [],
        error: errorMessage,
        ...(request.requestId !== undefined && { requestId: request.requestId }),
      };
    }
  }

  /**
   * Get available actions for a site
   */
  async getAvailableActions(siteId: string, tenantId: string): Promise<SiteAction[]> {
    try {
      // Try to get from cache first
      const cacheKey = `${tenantId}:${siteId}`;
      const cachedManifest = this.manifestCache.get(cacheKey);

      if (cachedManifest && Date.now() - cachedManifest.timestamp < this.CACHE_TTL) {
        return cachedManifest.manifest.actions as SiteAction[];
      }

      // Get from action executor registry
      const actions = this.actionExecutor.getAvailableActions(siteId);
      
      if (actions.length === 0) {
        // Generate fresh manifest if no actions found
        const manifest = await this.generateSiteManifest(siteId, tenantId);
        return manifest.actions as SiteAction[];
      }

      return actions;

    } catch (error) {
      logger.error('Failed to get available actions', {
        siteId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Generate bridge script for widget embedding
   */
  generateEmbedScript(
    config: DispatchConfiguration,
    _options: {
      widgetId?: string;
      theme?: 'light' | 'dark' | 'auto';
      position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
      customStyles?: Record<string, string>;
    } = {}
  ): string {
    if (!config.bridgeConfig) {
      throw new Error('Bridge configuration not initialized');
    }

    return this.widgetBridge.generateBridgeScript(config.bridgeConfig);
  }

  /**
   * Generate iframe embed code
   */
  generateIframeEmbed(
    config: DispatchConfiguration,
    options: {
      position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
      theme?: 'light' | 'dark' | 'auto';
      size?: 'small' | 'medium' | 'large';
    } = {}
  ): string {
    if (!config.bridgeConfig) {
      throw new Error('Bridge configuration not initialized');
    }

    return this.widgetBridge.generateIframeEmbed(config.bridgeConfig, options);
  }

  /**
   * Validate action execution request
   */
  private async validateActionRequest(
    request: ActionDispatchRequest,
    config: DispatchConfiguration
  ): Promise<void> {
    // Origin validation
    if (config.securitySettings.requireOriginValidation && request.origin) {
      const isAllowedOrigin = config.allowedOrigins.includes('*') ||
        config.allowedOrigins.some(allowed => 
          request.origin === allowed || 
          (allowed.startsWith('*.') && request.origin?.endsWith(allowed.slice(1)))
        );

      if (!isAllowedOrigin) {
        throw new Error(`Origin '${request.origin}' not allowed for site '${request.siteId}'`);
      }
    }

    // Tenant validation
    if (!config.securitySettings.allowCrossTenant && request.tenantId !== config.tenantId) {
      throw new Error('Cross-tenant action execution not allowed');
    }

    // Action existence validation
    if (!config.manifest) {
      throw new Error('Site manifest not available');
    }

    const action = config.manifest.actions.find(a => a.name === request.actionName);
    if (!action) {
      throw new Error(`Action '${request.actionName}' not found in site manifest`);
    }

    // Risk level validation could be added here
    if (action.riskLevel === 'high' && !request.parameters['_confirmed']) {
      logger.warn('High-risk action attempted without confirmation', {
        siteId: request.siteId,
        actionName: request.actionName
      });
    }
  }

  /**
   * Enforce rate limiting
   */
  private enforceRateLimit(
    request: ActionDispatchRequest,
    config: DispatchConfiguration
  ): void {
    const rateLimitKey = request.origin || request.sessionId || request.userId || 'anonymous';
    const now = Date.now();
    
    let tracker = this.rateLimitTracker.get(rateLimitKey);
    
    if (!tracker || now > tracker.resetTime) {
      tracker = {
        count: 0,
        resetTime: now + this.RATE_LIMIT_WINDOW
      };
    }

    tracker.count++;
    this.rateLimitTracker.set(rateLimitKey, tracker);

    if (tracker.count > config.securitySettings.maxActionsPerMinute) {
      throw new Error(`Rate limit exceeded: ${tracker.count} actions in the last minute`);
    }
  }

  /**
   * Transform execution result into bridge instructions
   */
  private transformToBridgeInstructions(
    result: ActionExecutionResult
  ): ActionDispatchResult['bridgeInstructions'] {
    if (!result.success || !result.result) {
      return undefined;
    }

    // Map result types to bridge instruction types
    switch (result.result.type) {
      case 'navigation':
        return {
          type: 'navigation',
          payload: {
            target: result.result.target,
            method: result.result.method || 'pushState',
            scrollToTop: result.result.scrollToTop !== false,
            highlightElement: result.result.highlightElement
          }
        };

      case 'form_submission':
        return {
          type: 'form_submission',
          payload: {
            selector: result.result.selector,
            formData: result.result.formData,
            method: result.result.method || 'POST',
            validation: result.result.validation
          }
        };

      case 'dom_interaction':
        return {
          type: 'dom_interaction',
          payload: {
            action: result.result.action,
            selector: result.result.selector,
            parameters: result.result.parameters
          }
        };

      case 'api_response':
        return {
          type: 'api_response',
          payload: {
            status: result.result.status,
            data: result.result.data,
            headers: result.result.headers
          }
        };

      case 'custom_action':
        return {
          type: 'custom_action',
          payload: {
            actionName: result.result.actionName,
            parameters: result.result.parameters,
            message: result.result.message
          }
        };

      default:
        logger.warn('Unknown result type for bridge transformation', {
          resultType: result.result.type
        });
        return undefined;
    }
  }

  /**
   * Generate a basic site manifest (placeholder implementation)
   */
  private async generateSiteManifest(siteId: string, tenantId: string): Promise<SiteManifest> {
    // In production, this would fetch actual site content and generate manifest
    // For now, return a basic manifest structure
    
    logger.info('Generating basic site manifest', { siteId, tenantId });

    return {
      siteId,
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      capabilities: [
        'navigation',
        'forms',
        'voice'
      ],
      actions: [
        {
          name: 'navigate_home',
          type: 'navigation',
          description: 'Navigate to home page',
          parameters: [],
          id: 'nav_home_001',
          selector: 'a[href="/"]',
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'read',
          requiresAuth: false
        },
        {
          name: 'contact_form',
          type: 'form',
          description: 'Submit contact form',
          parameters: [
            {
              name: 'name',
              type: 'string',
              required: true,
              description: 'Contact name'
            },
            {
              name: 'email',
              type: 'string',
              required: true,
              description: 'Contact email address'
            },
            {
              name: 'message',
              type: 'string',
              required: true,
              description: 'Contact message'
            }
          ],
          id: 'contact_form_001',
          selector: 'form#contact-form',
          confirmation: true,
          sideEffecting: 'write',
          riskLevel: 'medium',
          category: 'communication',
          requiresAuth: false
        }
      ],
      metadata: {
        hasContactForm: true,
        hasEcommerce: false,
        hasBooking: false,
        hasBlog: false,
        hasGallery: false,
        hasAuth: false,
        hasSearch: false,
        hasNavigation: true,
        hasFilters: false,
        hasComments: false,
        hasNewsletter: false,
        hasShoppingCart: false,
        hasPayments: false,
        hasUserProfiles: false,
        hasFileUploads: false
      },
      security: {
        allowedOrigins: ['*'],
        csrfProtection: true,
        rateLimiting: true,
        requiresHttps: false,
        allowedMethods: ['GET', 'POST']
      }
    };
  }

  /**
   * Clear caches (useful for development and testing)
   */
  clearCaches(): void {
    this.manifestCache.clear();
    this.bridgeCache.clear();
    this.rateLimitTracker.clear();
    logger.info('Action dispatch caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    manifestCacheSize: number;
    bridgeCacheSize: number;
    rateLimitTrackerSize: number;
  } {
    return {
      manifestCacheSize: this.manifestCache.size,
      bridgeCacheSize: this.bridgeCache.size,
      rateLimitTrackerSize: this.rateLimitTracker.size
    };
  }
}

// Export singleton instance with default dependencies
let defaultDispatchService: ActionDispatchService | undefined;

export async function getActionDispatchService(): Promise<ActionDispatchService> {
  if (!defaultDispatchService) {
    // Import here to avoid circular dependencies
    const { actionExecutorService } = await import('../ActionExecutorService.js');
    const manifestGenerator = new ActionManifestGenerator();
    const widgetBridge = new WidgetActionBridge();
    
    defaultDispatchService = new ActionDispatchService(
      actionExecutorService,
      manifestGenerator,
      widgetBridge
    );
  }
  
  return defaultDispatchService;
}