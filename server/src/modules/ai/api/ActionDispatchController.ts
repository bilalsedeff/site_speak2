import { Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { getActionDispatchService } from '../application/services/ActionDispatchService.js';

const logger = createLogger({ service: 'action-dispatch-controller' });

// Validation schemas
const ActionDispatchRequestSchema = z.object({
  siteId: z.string().min(1),
  tenantId: z.string().min(1),
  actionName: z.string().min(1),
  parameters: z.record(z.any()).default({}),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  origin: z.string().optional(),
  requestId: z.string().optional()
});

const DispatchConfigSchema = z.object({
  siteId: z.string().min(1),
  tenantId: z.string().min(1),
  allowedOrigins: z.array(z.string()).default(['*']),
  securitySettings: z.object({
    requireOriginValidation: z.boolean().default(true),
    allowCrossTenant: z.boolean().default(false),
    maxActionsPerMinute: z.number().int().min(1).max(1000).default(30),
    riskLevelThresholds: z.object({
      low: z.number().int().min(1).default(100),
      medium: z.number().int().min(1).default(20),
      high: z.number().int().min(1).default(5)
    }).default({})
  }).default({})
});

const EmbedOptionsSchema = z.object({
  widgetId: z.string().optional(),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).default('bottom-right'),
  customStyles: z.record(z.string()).optional()
});

const IframeOptionsSchema = z.object({
  width: z.string().default('400px'),
  height: z.string().default('600px'),
  sandbox: z.string().default('allow-scripts allow-same-origin'),
  customStyles: z.record(z.string()).optional()
});

export class ActionDispatchController {
  private async getDispatchService() {
    return await getActionDispatchService();
  }

  /**
   * Initialize action dispatch for a site
   * POST /api/ai/actions/dispatch/init
   */
  initializeDispatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const configData = DispatchConfigSchema.parse(req.body);
      
      logger.info('Initializing action dispatch', {
        siteId: configData.siteId,
        tenantId: configData.tenantId,
        allowedOrigins: configData.allowedOrigins.length
      });

      const dispatchService = await this.getDispatchService();
      const configuration = await dispatchService.initializeDispatch(configData);

      res.status(200).json({
        success: true,
        data: {
          siteId: configuration.siteId,
          tenantId: configuration.tenantId,
          actionsCount: configuration.manifest?.actions.length || 0,
          capabilities: configuration.manifest?.capabilities,
          security: configuration.manifest?.security,
          bridgeConfigured: !!configuration.bridgeConfig
        },
        message: 'Action dispatch initialized successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize dispatch';
      
      logger.error('Failed to initialize action dispatch', {
        error: errorMessage,
        body: req.body
      });

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorMessage
        });
      }
    }
  };

  /**
   * Execute an action
   * POST /api/ai/actions/dispatch/execute
   */
  executeAction = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData = ActionDispatchRequestSchema.parse(req.body);
      
      // Extract origin from request headers if not provided in body
      if (!requestData.origin) {
        const headerOrigin = req.headers.origin || req.headers.referer;
        if (headerOrigin) {
          requestData.origin = headerOrigin;
        }
      }

      // Generate request ID if not provided
      if (!requestData.requestId) {
        requestData.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      logger.info('Executing action via dispatch', {
        siteId: requestData.siteId,
        actionName: requestData.actionName,
        origin: requestData.origin,
        requestId: requestData.requestId
      });

      // Create clean request object for exactOptionalPropertyTypes
      const cleanRequestData = {
        siteId: requestData.siteId,
        tenantId: requestData.tenantId,
        actionName: requestData.actionName,
        parameters: requestData.parameters,
        ...(requestData.sessionId && { sessionId: requestData.sessionId }),
        ...(requestData.userId && { userId: requestData.userId }),
        ...(requestData.origin && { origin: requestData.origin }),
        ...(requestData.requestId && { requestId: requestData.requestId }),
      };

      const dispatchService = await this.getDispatchService();
      const result = await dispatchService.dispatchAction(cleanRequestData);

      // Set appropriate status code based on result
      const statusCode = result.success ? 200 : 400;

      res.status(statusCode).json({
        success: result.success,
        data: {
          result: result.result,
          executionTime: result.executionTime,
          sideEffects: result.sideEffects,
          bridgeInstructions: result.bridgeInstructions,
          requestId: result.requestId
        },
        error: result.error,
        message: result.success ? 'Action executed successfully' : 'Action execution failed'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute action';
      
      logger.error('Failed to execute action', {
        error: errorMessage,
        body: req.body
      });

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorMessage
        });
      }
    }
  };

  /**
   * Get available actions for a site
   * GET /api/ai/actions/dispatch/:siteId/:tenantId
   */
  getAvailableActions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { siteId, tenantId } = req.params;

      if (!siteId || !tenantId) {
        res.status(400).json({
          success: false,
          error: 'Site ID and Tenant ID are required'
        });
        return;
      }

      logger.info('Getting available actions', { siteId, tenantId });

      const dispatchService = await this.getDispatchService();
      const actions = await dispatchService.getAvailableActions(siteId, tenantId);

      res.status(200).json({
        success: true,
        data: {
          siteId,
          tenantId,
          actions,
          actionsCount: actions.length
        },
        message: 'Actions retrieved successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get actions';
      
      logger.error('Failed to get available actions', {
        error: errorMessage,
        params: req.params
      });

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  };

  /**
   * Generate embed script for widget
   * POST /api/ai/actions/dispatch/embed/script
   */
  generateEmbedScript = async (req: Request, res: Response): Promise<void> => {
    try {
      const configData = DispatchConfigSchema.parse(req.body.config);
      const parsedEmbedOptions = EmbedOptionsSchema.parse(req.body.options || {});
      
      // Create clean options object for exactOptionalPropertyTypes
      const embedOptions = {
        theme: parsedEmbedOptions.theme,
        position: parsedEmbedOptions.position,
        ...(parsedEmbedOptions.widgetId && { widgetId: parsedEmbedOptions.widgetId }),
        ...(parsedEmbedOptions.customStyles && { customStyles: parsedEmbedOptions.customStyles }),
      };

      logger.info('Generating embed script', {
        siteId: configData.siteId,
        tenantId: configData.tenantId
      });

      const dispatchService = await this.getDispatchService();
      
      // Initialize dispatch configuration
      const configuration = await dispatchService.initializeDispatch(configData);

      // Generate embed script
      const embedScript = await dispatchService.generateEmbedScript(configuration, embedOptions);

      res.status(200).json({
        success: true,
        data: {
          script: embedScript,
          siteId: configuration.siteId,
          tenantId: configuration.tenantId,
          options: embedOptions
        },
        message: 'Embed script generated successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate embed script';
      
      logger.error('Failed to generate embed script', {
        error: errorMessage,
        body: req.body
      });

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorMessage
        });
      }
    }
  };

  /**
   * Generate iframe embed code
   * POST /api/ai/actions/dispatch/embed/iframe
   */
  generateIframeEmbed = async (req: Request, res: Response): Promise<void> => {
    try {
      const configData = DispatchConfigSchema.parse(req.body.config);
      const parsedIframeOptions = IframeOptionsSchema.parse(req.body.options || {});
      
      // Create clean options object for exactOptionalPropertyTypes
      const iframeOptions = {
        width: parsedIframeOptions.width,
        height: parsedIframeOptions.height,
        sandbox: parsedIframeOptions.sandbox,
        ...(parsedIframeOptions.customStyles && { customStyles: parsedIframeOptions.customStyles }),
      };

      logger.info('Generating iframe embed', {
        siteId: configData.siteId,
        tenantId: configData.tenantId
      });

      const dispatchService = await this.getDispatchService();
      
      // Initialize dispatch configuration
      const configuration = await dispatchService.initializeDispatch(configData);

      // Generate iframe embed
      const iframeEmbed = await dispatchService.generateIframeEmbed(configuration, iframeOptions);

      res.status(200).json({
        success: true,
        data: {
          iframe: iframeEmbed,
          siteId: configuration.siteId,
          tenantId: configuration.tenantId,
          options: iframeOptions
        },
        message: 'Iframe embed generated successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate iframe embed';
      
      logger.error('Failed to generate iframe embed', {
        error: errorMessage,
        body: req.body
      });

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      } else {
        res.status(500).json({
          success: false,
          error: errorMessage
        });
      }
    }
  };

  /**
   * Get dispatch service statistics
   * GET /api/ai/actions/dispatch/stats
   */
  getStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const dispatchService = await this.getDispatchService();
      const stats = await dispatchService.getCacheStats();

      res.status(200).json({
        success: true,
        data: stats,
        message: 'Statistics retrieved successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get statistics';
      
      logger.error('Failed to get dispatch statistics', {
        error: errorMessage
      });

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  };

  /**
   * Clear dispatch caches (admin only)
   * POST /api/ai/actions/dispatch/admin/clear-cache
   */
  clearCaches = async (req: Request, res: Response): Promise<void> => {
    try {
      const dispatchService = await this.getDispatchService();
      await dispatchService.clearCaches();

      logger.info('Dispatch caches cleared', {
        adminUser: req.user?.id,
        tenantId: req.user?.tenantId
      });

      res.status(200).json({
        success: true,
        message: 'Caches cleared successfully'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear caches';
      
      logger.error('Failed to clear caches', {
        error: errorMessage
      });

      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  };

  /**
   * Health check endpoint
   * GET /api/ai/actions/dispatch/health
   */
  healthCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Simple health check - just verify service is available
      await this.getDispatchService();
      
      res.status(200).json({
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        },
        message: 'Action dispatch service is healthy'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      
      logger.error('Health check failed', {
        error: errorMessage
      });

      res.status(503).json({
        success: false,
        error: errorMessage,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString()
        }
      });
    }
  };
}

export const actionDispatchController = new ActionDispatchController();