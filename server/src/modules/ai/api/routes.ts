import express, { Request, Response } from 'express';
// Express Request extensions declared in server/src/types/express.d.ts — no runtime import
import { createLogger } from '../../../shared/utils.js';
import { universalAIAssistantService } from '../application/UniversalAIAssistantService.js';
import { authenticateRequest, requireTenantAccess, requireAdminAccess } from '../../../shared/middleware/auth.js';
import { createRateLimiter } from '../../../shared/middleware/rateLimit.js';
import { actionDispatchController } from './ActionDispatchController.js';

const logger = createLogger({ service: 'ai-routes' });
const router = express.Router();

/**
 * Wrapper for rate limiting middleware that accepts policy name and simplified config
 */
function rateLimitMiddleware(_policyName: string, config: { requests: number; windowMs: number }) {
  return createRateLimiter({
    max: config.requests,
    windowMs: config.windowMs,
  });
}

/**
 * POST /api/ai/conversation
 * Process a conversation input and return AI response
 */
router.post('/conversation', async (req: Request, res: Response) => {
  try {
    const { input, siteId, sessionId, userId, browserLanguage, context } = req.body;

    if (!input || !siteId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'input and siteId are required' },
      });
    }

    logger.info('Processing conversation request', {
      siteId,
      sessionId: sessionId || 'new',
      inputLength: input.length,
      correlationId: req.correlationId
    });

    

    // Extract tenantId from request context (will be properly implemented with auth middleware)
    const tenantId = req.headers['x-tenant-id'] as string || 'default-tenant';

    const response = await universalAIAssistantService.processConversation({
      input, 
      siteId, 
      tenantId,
      sessionId, 
      userId, 
      context: {
        ...context,
        browserLanguage
      }
    });

    res.json({
      success: true,
      data: response,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
        duration: response.response.metadata.responseTime,
      },
    });
    return;
  } catch (error) {
    logger.error('Conversation processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });

    res.status(500).json({
      success: false,
      error: { code: 'PROCESSING_FAILED', message: 'Failed to process conversation' },
    });
    return;
  }
});

/**
 * POST /api/ai/actions/register
 * Register actions for a site
 */
router.post('/actions/register', async (req: Request, res: Response) => {
  try {
    const { siteId, actions } = req.body;

    if (!siteId || !actions || !Array.isArray(actions)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'siteId and actions array are required' },
      });
    }

    // Extract tenantId from request context (will be properly implemented with auth middleware)
    const tenantId = req.headers['x-tenant-id'] as string || 'default-tenant';

    await universalAIAssistantService.registerSiteActions(siteId, tenantId, actions);

    res.json({
      success: true,
      data: { siteId, registeredActions: actions.length, timestamp: new Date().toISOString() },
    });
    return;
  } catch (error) {
    logger.error('Action registration failed', { error, correlationId: req.correlationId });
    res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_FAILED', message: 'Failed to register actions' },
    });
    return;
  }
});

/**
 * GET /api/ai/actions/:siteId
 * Get available actions for a site
 */
router.get('/actions/:siteId', async (req, res) => {
  try {
    const { siteId } = req.params;
    const actions = universalAIAssistantService.getSiteActions(siteId);

    res.json({
      success: true,
      data: { siteId, actions, count: actions.length },
    });
  } catch (error) {
    logger.error('Failed to get site actions', { siteId: req.params.siteId, error });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to get site actions' },
    });
    return;
  }
});

/**
 * POST /api/ai/conversation/stream
 * Stream a conversation response in real-time
 */
router.post('/conversation/stream', async (req: Request, res: Response) => {
  try {
    const { input, siteId, sessionId, userId, context } = req.body;

    if (!input || !siteId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'input and siteId are required' },
      });
    }

    // Extract tenantId from request context (will be properly implemented with auth middleware)
    const tenantId = req.headers['x-tenant-id'] as string || 'default-tenant';

    logger.info('Starting conversation stream', {
      siteId,
      sessionId: sessionId || 'new',
      correlationId: req.correlationId
    });

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    const streamGenerator = universalAIAssistantService.streamConversation({
      input,
      siteId,
      tenantId,
      sessionId,
      userId,
      context,
    });

    for await (const chunk of streamGenerator) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
    return;
  } catch (error) {
    logger.error('Conversation streaming failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      data: { message: 'Streaming failed' },
      sessionId: req.body.sessionId || 'unknown',
    })}\n\n`);
    res.end();
    return;
  }
});

/**
 * POST /api/ai/actions/execute
 * Execute a specific action directly
 */
router.post('/actions/execute', async (req: Request, res: Response) => {
  try {
    const { siteId, actionName, parameters, sessionId, userId } = req.body;

    if (!siteId || !actionName) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'siteId and actionName are required' },
      });
    }

    // Extract tenantId from request context (will be properly implemented with auth middleware)
    const tenantId = req.headers['x-tenant-id'] as string || 'default-tenant';

    logger.info('Executing direct action', {
      siteId,
      actionName,
      correlationId: req.correlationId
    });

    const result = await universalAIAssistantService.executeAction({
      siteId,
      tenantId,
      actionName,
      parameters: parameters || {},
      sessionId,
      userId,
    });

    res.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId,
      },
    });
    return;
  } catch (error) {
    logger.error('Action execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });

    res.status(500).json({
      success: false,
      error: { code: 'EXECUTION_FAILED', message: 'Failed to execute action' },
    });
    return;
  }
});

/**
 * GET /api/ai/sessions/:sessionId/history
 * Get session history
 */
router.get('/sessions/:sessionId/history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
      });
    }
    
    const history = await universalAIAssistantService.getSessionHistory(sessionId);

    res.json({
      success: true,
      data: { sessionId, history },
    });
    return;
  } catch (error) {
    logger.error('Failed to get session history', { 
      sessionId: req.params['sessionId'], 
      error,
      correlationId: req.correlationId 
    });
    
    res.status(500).json({
      success: false,
      error: { code: 'HISTORY_FETCH_FAILED', message: 'Failed to get session history' },
    });
    return;
  }
});

/**
 * GET /api/ai/metrics
 * Get service metrics and statistics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = universalAIAssistantService.getMetrics();
    
    res.json({
      success: true,
      data: {
        metrics,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get AI metrics', { 
      error,
      correlationId: req.correlationId 
    });
    
    res.status(500).json({
      success: false,
      error: { code: 'METRICS_FETCH_FAILED', message: 'Failed to get metrics' },
    });
    return;
  }
});

/**
 * GET /api/ai/health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: 'healthy', timestamp: new Date().toISOString(), service: 'universal-ai-assistant' },
  });
});

// Action dispatch routes
const dispatchRoutes = express.Router();

// Initialize dispatch configuration
dispatchRoutes.post(
  '/init',
  authenticateRequest,
  requireTenantAccess,
  rateLimitMiddleware('dispatch_init', { requests: 10, windowMs: 60000 }),
  actionDispatchController.initializeDispatch
);

// Execute action
dispatchRoutes.post(
  '/execute',
  // Note: Authentication is optional for execute to support widget calls
  // Security is handled within the dispatch service via origin validation
  rateLimitMiddleware('dispatch_execute', { requests: 100, windowMs: 60000 }),
  actionDispatchController.executeAction
);

// Get available actions
dispatchRoutes.get(
  '/:siteId/:tenantId',
  authenticateRequest,
  requireTenantAccess,
  rateLimitMiddleware('dispatch_actions', { requests: 50, windowMs: 60000 }),
  actionDispatchController.getAvailableActions
);

// Generate embed script
dispatchRoutes.post(
  '/embed/script',
  authenticateRequest,
  requireTenantAccess,
  rateLimitMiddleware('dispatch_embed', { requests: 20, windowMs: 60000 }),
  actionDispatchController.generateEmbedScript
);

// Generate iframe embed
dispatchRoutes.post(
  '/embed/iframe',
  authenticateRequest,
  requireTenantAccess,
  rateLimitMiddleware('dispatch_embed', { requests: 20, windowMs: 60000 }),
  actionDispatchController.generateIframeEmbed
);

// Get statistics
dispatchRoutes.get(
  '/stats',
  authenticateRequest,
  rateLimitMiddleware('dispatch_stats', { requests: 10, windowMs: 60000 }),
  actionDispatchController.getStats
);

// Admin routes
dispatchRoutes.post(
  '/admin/clear-cache',
  authenticateRequest,
  requireAdminAccess,
  rateLimitMiddleware('admin_cache', { requests: 5, windowMs: 60000 }),
  actionDispatchController.clearCaches
);

// Health check for dispatch service (public)
dispatchRoutes.get(
  '/health',
  rateLimitMiddleware('health', { requests: 30, windowMs: 60000 }),
  actionDispatchController.healthCheck
);

// Mount dispatch routes under /actions/dispatch
router.use('/actions/dispatch', dispatchRoutes);

// KB routes are handled by the API gateway at /api/v1/kb
// No duplication needed - use existing kbRoutes in api-gateway

export { router as aiRoutes };