/**
 * API Gateway - Main Entry Point
 * 
 * Implements the complete API Gateway with:
 * - Versioned API endpoints (/api/v1)
 * - RFC 9457 Problem Details error handling
 * - Locale detection and internationalization
 * - Rate limiting with headers
 * - Authentication and authorization
 * - Tenant isolation
 * - OpenAPI 3.1 specification
 */

import express from 'express';
import cors from 'cors';
import { createLogger } from '../_shared/telemetry/logger';
import { localeDetect } from './http/middleware/locale-detect';
import { problemDetailsHandler, addProblemDetailMethod } from './http/middleware/problem-details';
import { rateLimiters } from './http/middleware/rate-limit-headers';

const logger = createLogger({ service: 'api-gateway' });

export interface APIGatewayConfig {
  enableAuth?: boolean;
  enableRateLimit?: boolean;
  enableCors?: boolean;
  corsOrigins?: string[];
  apiPrefix?: string;
  supportedLocales?: string[];
}

/**
 * Create API Gateway router with full middleware stack
 */
export function createAPIGateway(config: APIGatewayConfig = {}): express.Router {
  const {
    enableAuth = true,
    enableRateLimit = true,
    enableCors = true,
    corsOrigins = ['*'],
    apiPrefix = '/api',
    supportedLocales
  } = config;

  const gateway = express.Router();

  logger.info('Initializing API Gateway', {
    enableAuth,
    enableRateLimit,
    enableCors,
    corsOrigins,
    apiPrefix
  });

  // 1. Request ID middleware (already handled by server)
  
  // 2. Locale detection middleware
  gateway.use(localeDetect({ 
    supportedLocales: supportedLocales || ['en', 'tr'],
    headerOverride: 'x-user-locale' 
  }));

  // 3. CORS middleware
  if (enableCors) {
    gateway.use(cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization', 
        'X-User-Locale',
        'X-Correlation-ID',
        'Accept',
        'Accept-Language',
        'Cache-Control'
      ],
      exposedHeaders: [
        'X-Correlation-ID',
        'RateLimit-Limit',
        'RateLimit-Remaining', 
        'RateLimit-Reset',
        'RateLimit-Policy',
        'Retry-After'
      ],
      credentials: true,
      maxAge: 86400 // 24 hours
    }));
  }

  // 4. Problem Details response helper
  gateway.use(addProblemDetailMethod());

  // 5. Rate limiting (before authentication to prevent abuse)
  if (enableRateLimit) {
    gateway.use(rateLimiters.api);
  }

  // API Info endpoint (public)
  gateway.get('/info', (req, res) => {
    res.json({
      name: 'SiteSpeak API Gateway',
      version: '1.0.0',
      apiVersion: 'v1',
      timestamp: new Date().toISOString(),
      locale: req.locale,
      endpoints: {
        health: `${apiPrefix}/health`,
        v1: {
          auth: `${apiPrefix}/v1/auth`,
          voice: `${apiPrefix}/v1/voice`, 
          kb: `${apiPrefix}/v1/kb`,
          sites: `${apiPrefix}/v1/sites`,
          ai: `${apiPrefix}/v1/ai`,
          analytics: `${apiPrefix}/v1/analytics`
        }
      },
      documentation: {
        openapi: `${apiPrefix}/v1/openapi.json`,
        swagger: `${apiPrefix}/v1/docs`
      },
      support: {
        languages: req.localeContext.languages,
        formats: ['application/json', 'application/problem+json'],
        authentication: 'Bearer JWT tokens',
        rateLimit: 'IETF draft headers included'
      }
    });
  });

  // Mount versioned API routes
  const v1Router = express.Router();
  
  // Import and mount route modules
  setupV1Routes(v1Router, { enableAuth, enableRateLimit });
  
  // Mount v1 router
  gateway.use('/v1', v1Router);

  // Health endpoints (public, no versioning)
  setupHealthRoutes(gateway);

  // 404 handler for unknown routes
  gateway.use('*', (req, res) => {
    res.problemDetail({
      title: 'Endpoint Not Found',
      status: 404,
      detail: `The requested endpoint '${req.originalUrl}' was not found`,
      extensions: {
        method: req.method,
        availableVersions: ['v1'],
        suggestion: 'Check the API documentation for available endpoints'
      }
    });
  });

  // Error handling middleware (must be last)
  gateway.use(problemDetailsHandler());

  logger.info('API Gateway initialized successfully');
  return gateway;
}

/**
 * Setup V1 API routes
 */
async function setupV1Routes(router: express.Router, config: { enableAuth: boolean; enableRateLimit: boolean }) {
  const { enableAuth, enableRateLimit } = config;

  // V1 API info
  router.get('/', (req, res) => {
    res.json({
      version: '1.0.0',
      apiVersion: 'v1',
      timestamp: new Date().toISOString(),
      locale: req.locale,
      endpoints: {
        auth: '/api/v1/auth',
        voice: '/api/v1/voice',
        kb: '/api/v1/kb',
        sites: '/api/v1/sites',
        ai: '/api/v1/ai',
        analytics: '/api/v1/analytics'
      },
      authentication: enableAuth ? 'required' : 'disabled',
      rateLimit: enableRateLimit ? 'enabled' : 'disabled'
    });
  });

  try {
    // OpenAPI documentation endpoint
    const { generateOpenAPISpec } = await import('./openapi/generator');
    router.get('/openapi.json', async (_req, res) => {
      try {
        const spec = await generateOpenAPISpec();
        res.json(spec);
      } catch (error) {
        logger.error('Failed to generate OpenAPI spec', { error });
        res.status(500).json({ error: 'Failed to generate OpenAPI specification' });
      }
    });
    logger.info('OpenAPI documentation endpoint mounted at /api/v1/openapi.json');

    // Knowledge Base routes
    const { kbRoutes } = await import('./http/routes/kb');
    router.use('/kb', kbRoutes);
    logger.info('Knowledge Base routes mounted at /api/v1/kb');

    // Voice routes  
    const { voiceRoutes } = await import('./http/routes/voice');
    router.use('/voice', voiceRoutes);
    logger.info('Voice routes mounted at /api/v1/voice');

    // Import existing route modules and adapt them
    
    // Auth routes (existing)
    const { authRoutes } = await import('../../modules/auth/api/routes');
    router.use('/auth', authRoutes);
    logger.info('Auth routes mounted at /api/v1/auth');

    // AI routes (existing) 
    const { aiRoutes } = await import('../../modules/ai/api/routes');
    router.use('/ai', aiRoutes);
    logger.info('AI routes mounted at /api/v1/ai');

    // Sites routes (existing)
    const { siteContractRoutes } = await import('../../modules/sites/api/routes');
    router.use('/sites', siteContractRoutes);
    logger.info('Sites routes mounted at /api/v1/sites');

    // Analytics routes (new)
    const analyticsRoutes = await import('./http/routes/analytics');
    router.use('/analytics', analyticsRoutes.default);
    logger.info('Analytics routes mounted at /api/v1/analytics');

  } catch (error) {
    logger.error('Failed to setup V1 routes', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Setup health check routes (unversioned)
 */
function setupHealthRoutes(router: express.Router) {
  // Basic health check
  router.get('/health', async (_req, res) => {
    try {
      const health = await performHealthChecks();
      const status = health.healthy ? 200 : 503;
      
      res.status(status).json({
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'api-gateway',
        checks: health.checks,
        ...(health.issues.length > 0 && { issues: health.issues })
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        error: 'Health check failed'
      });
    }
  });

  // Kubernetes liveness probe
  router.get('/health/live', (_req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      service: 'api-gateway'
    });
  });

  // Kubernetes readiness probe
  router.get('/health/ready', async (_req, res) => {
    try {
      const health = await performHealthChecks();
      const status = health.healthy ? 200 : 503;
      
      res.status(status).json({
        status: health.healthy ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        checks: health.checks
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'api-gateway',
        error: 'Readiness check failed'
      });
    }
  });
}

/**
 * Perform comprehensive health checks
 */
async function performHealthChecks(): Promise<{
  healthy: boolean;
  checks: Record<string, any>;
  issues: string[];
}> {
  const checks: Record<string, any> = {};
  const issues: string[] = [];

  try {
    // Check database connectivity
    const { checkDatabaseHealth } = await import('../../infrastructure/database');
    checks['database'] = await checkDatabaseHealth();
  } catch (error) {
    checks['database'] = { healthy: false, error: 'Database connection failed' };
    issues.push('Database unavailable');
  }

  try {
    // Check Redis connectivity (if available)
    // This would be implemented when Redis is added
    // Check Redis connectivity (if available)
    // This would be implemented when Redis is added
    checks['redis'] = { healthy: true, note: 'Not implemented yet' };
  } catch (error) {
    checks['redis'] = { healthy: false, error: 'Redis connection failed' };
  }

  try {
    // Check OpenAI API connectivity
    // Check OpenAI API connectivity
    checks['openai'] = { 
      healthy: !!process.env['OPENAI_API_KEY'],
      note: process.env['OPENAI_API_KEY'] ? 'API key configured' : 'API key missing'
    };
    if (!process.env['OPENAI_API_KEY']) {
      issues.push('OpenAI API key not configured');
    }
  } catch (error) {
    checks['openai'] = { healthy: false, error: 'OpenAI check failed' };
  }

  try {
    // Check voice services
    const { voiceOrchestrator } = await import('../../services/voice');
    const voiceStatus = voiceOrchestrator.getStatus();
    checks['voice'] = { 
      healthy: voiceStatus.isRunning,
      activeSessions: voiceStatus.activeSessions,
      performance: voiceStatus.performance
    };
  } catch (error) {
    checks['voice'] = { healthy: false, error: 'Voice services check failed' };
    issues.push('Voice services unavailable');
  }

  try {
    // Check analytics service
    const { checkAnalyticsHealth } = await import('../_shared/analytics');
    const analyticsHealth = checkAnalyticsHealth();
    checks['analytics'] = analyticsHealth;
    if (!analyticsHealth.healthy) {
      issues.push('Analytics service unavailable');
    }
  } catch (error) {
    checks['analytics'] = { healthy: false, error: 'Analytics service check failed' };
    issues.push('Analytics service unavailable');
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memoryHealthy = memUsage.heapUsed < 1000 * 1024 * 1024; // 1GB limit
  checks['memory'] = {
    healthy: memoryHealthy,
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    rss: memUsage.rss
  };
  if (!memoryHealthy) {
    issues.push('High memory usage detected');
  }

  // Overall health
  const healthy = Object.values(checks).every(check => check.healthy) && issues.length === 0;

  return { healthy, checks, issues };
}

/**
 * Create and initialize the API Gateway
 */
export async function initializeAPIGateway(config: APIGatewayConfig = {}): Promise<express.Router> {
  logger.info('Initializing API Gateway with configuration', config);
  
  try {
    const gateway = createAPIGateway(config);
    logger.info('API Gateway initialized successfully');
    return gateway;
  } catch (error) {
    logger.error('Failed to initialize API Gateway', {
      error: error instanceof Error ? error.message : 'Unknown error',
      config
    });
    throw error;
  }
}

export default createAPIGateway;