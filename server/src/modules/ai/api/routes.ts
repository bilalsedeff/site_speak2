import express from 'express';
import { createLogger } from '../../../shared/utils.js';
import { universalAIAssistantService } from '../application/UniversalAIAssistantService.js';

const logger = createLogger({ service: 'ai-routes' });
const router = express.Router();

/**
 * POST /api/ai/conversation
 * Process a conversation input and return AI response
 */
router.post('/conversation', async (req, res) => {
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
  } catch (error) {
    logger.error('Conversation processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });

    res.status(500).json({
      success: false,
      error: { code: 'PROCESSING_FAILED', message: 'Failed to process conversation' },
    });
  }
});

/**
 * POST /api/ai/actions/register
 * Register actions for a site
 */
router.post('/actions/register', async (req, res) => {
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
  } catch (error) {
    logger.error('Action registration failed', { error, correlationId: req.correlationId });
    res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_FAILED', message: 'Failed to register actions' },
    });
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
  }
});

/**
 * POST /api/ai/conversation/stream
 * Stream a conversation response in real-time
 */
router.post('/conversation/stream', async (req, res) => {
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
  }
});

/**
 * POST /api/ai/actions/execute
 * Execute a specific action directly
 */
router.post('/actions/execute', async (req, res) => {
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
  } catch (error) {
    logger.error('Action execution failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId
    });

    res.status(500).json({
      success: false,
      error: { code: 'EXECUTION_FAILED', message: 'Failed to execute action' },
    });
  }
});

/**
 * GET /api/ai/sessions/:sessionId/history
 * Get session history
 */
router.get('/sessions/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await universalAIAssistantService.getSessionHistory(sessionId);

    res.json({
      success: true,
      data: { sessionId, history },
    });
  } catch (error) {
    logger.error('Failed to get session history', { 
      sessionId: req.params.sessionId, 
      error,
      correlationId: req.correlationId 
    });
    
    res.status(500).json({
      success: false,
      error: { code: 'HISTORY_FETCH_FAILED', message: 'Failed to get session history' },
    });
  }
});

/**
 * GET /api/ai/metrics
 * Get service metrics and statistics
 */
router.get('/metrics', async (req, res) => {
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
  }
});

/**
 * GET /api/ai/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'healthy', timestamp: new Date().toISOString(), service: 'universal-ai-assistant' },
  });
});

export { router as aiRoutes };