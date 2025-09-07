/**
 * API Gateway Integration Module
 * 
 * Integrates the API Gateway into the existing SiteSpeak server
 * with backward compatibility and smooth migration
 */

import express from 'express';
import { createLogger } from '../_shared/telemetry/logger';
import { initializeAPIGateway, APIGatewayConfig } from './index';
import { createOpenAPIHandler } from './openapi/generator';

const logger = createLogger({ service: 'api-gateway-integration' });

export interface APIGatewayIntegrationConfig extends APIGatewayConfig {
  enableLegacyRoutes?: boolean;
  openAPIConfig?: {
    baseUrl?: string;
    title?: string;
    description?: string;
    version?: string;
  };
  healthChecks?: {
    includeDetailedHealth?: boolean;
    includeLegacyHealth?: boolean;
  };
}

/**
 * Setup API Gateway integration with existing server
 */
export async function setupAPIGatewayIntegration(
  app: express.Application, 
  config: APIGatewayIntegrationConfig = {}
): Promise<void> {
  const {
    enableLegacyRoutes = true,
    openAPIConfig = {},
    healthChecks = {},
    ...gatewayConfig
  } = config;

  logger.info('Setting up API Gateway integration', {
    enableLegacyRoutes,
    enableAuth: gatewayConfig.enableAuth,
    enableRateLimit: gatewayConfig.enableRateLimit,
    corsOrigins: gatewayConfig.corsOrigins
  });

  try {
    // Initialize the API Gateway
    const apiGateway = await initializeAPIGateway({
      enableAuth: true,
      enableRateLimit: true,
      enableCors: true,
      corsOrigins: gatewayConfig.corsOrigins || ['http://localhost:3000', 'http://localhost:5000'],
      apiPrefix: '/api',
      supportedLocales: [
        'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE',
        'it-IT', 'pt-PT', 'ru-RU', 'zh-CN', 'ja-JP',
        'ko-KR', 'ar-SA', 'tr-TR'
      ],
      ...gatewayConfig
    });

    // Mount the API Gateway
    app.use('/api', apiGateway);
    logger.info('API Gateway mounted at /api');

    // Setup OpenAPI documentation endpoints
    await setupOpenAPIEndpoints(app, openAPIConfig);
    
    // Setup enhanced health checks
    await setupEnhancedHealthChecks(app, healthChecks);

    // Setup legacy route compatibility (if enabled)
    if (enableLegacyRoutes) {
      await setupLegacyRouteCompatibility(app);
    }

    logger.info('API Gateway integration completed successfully');
  } catch (error) {
    logger.error('Failed to setup API Gateway integration', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Setup OpenAPI documentation endpoints
 */
async function setupOpenAPIEndpoints(
  app: express.Application, 
  config: NonNullable<APIGatewayIntegrationConfig['openAPIConfig']>
): Promise<void> {
  const {
    baseUrl = process.env['NODE_ENV'] === 'production' 
      ? 'https://api.sitespeak.ai' 
      : 'http://localhost:5000',
    title = 'SiteSpeak API Gateway',
    description = 'Comprehensive API for SiteSpeak voice-first website builder',
    version = '1.0.0'
  } = config;

  logger.info('Setting up OpenAPI documentation endpoints');

  // OpenAPI JSON specification
  app.get('/api/v1/openapi.json', createOpenAPIHandler({
    baseUrl,
    title,
    description,
    version
  }));

  // Swagger UI (if in development)
  if (process.env['NODE_ENV'] !== 'production') {
    try {
      const swaggerUi = await import('swagger-ui-express');
      const { generateOpenAPISpec } = await import('./openapi/generator');
      
      const swaggerSpec = generateOpenAPISpec({
        baseUrl,
        title,
        description,
        version
      });

      app.use('/api/v1/docs', swaggerUi.serve);
      app.get('/api/v1/docs', swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'SiteSpeak API Documentation',
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          tryItOutEnabled: true,
          filter: true,
          showExtensions: true,
          showCommonExtensions: true
        }
      }));

      logger.info('Swagger UI documentation available at /api/v1/docs');
    } catch (error) {
      logger.warn('Swagger UI setup failed, continuing without it', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  logger.info('OpenAPI endpoints configured successfully');
}

/**
 * Setup enhanced health check endpoints
 */
async function setupEnhancedHealthChecks(
  app: express.Application,
  config: NonNullable<APIGatewayIntegrationConfig['healthChecks']>
): Promise<void> {
  const { includeDetailedHealth = true, includeLegacyHealth = true } = config;

  logger.info('Setting up enhanced health check endpoints');

  // Enhanced health endpoint with detailed component status
  if (includeDetailedHealth) {
    app.get('/api/health/detailed', async (_req, res) => {
      try {
        const healthChecks = await performComprehensiveHealthCheck();
        const status = healthChecks.overall === 'healthy' ? 200 : 503;

        res.status(status).json({
          status: healthChecks.overall,
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          service: 'sitespeak-api-gateway',
          components: healthChecks.components,
          performance: healthChecks.performance,
          uptime: process.uptime(),
          environment: process.env['NODE_ENV'] || 'development'
        });
      } catch (error) {
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          service: 'sitespeak-api-gateway',
          error: 'Detailed health check failed'
        });
      }
    });
  }

  // Legacy health endpoint compatibility
  if (includeLegacyHealth) {
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        service: 'sitespeak-server'
      });
    });
  }

  logger.info('Enhanced health check endpoints configured');
}

/**
 * Setup legacy route compatibility for gradual migration
 */
async function setupLegacyRouteCompatibility(app: express.Application): Promise<void> {
  logger.info('Setting up legacy route compatibility');

  // Redirect old API endpoints to new versioned ones
  const legacyRedirects = [
    // Auth endpoints
    { from: '/api/auth/login', to: '/api/v1/auth/login' },
    { from: '/api/auth/register', to: '/api/v1/auth/register' },
    { from: '/api/auth/refresh', to: '/api/v1/auth/refresh' },
    { from: '/api/auth/logout', to: '/api/v1/auth/logout' },
    
    // AI endpoints
    { from: '/api/ai/conversation', to: '/api/v1/ai/conversation' },
    { from: '/api/ai/conversation/stream', to: '/api/v1/ai/conversation/stream' },
    { from: '/api/ai/actions/execute', to: '/api/v1/ai/actions/execute' },
    
    // Sites endpoints
    { from: '/api/sites/contracts', to: '/api/v1/sites/contracts' },
    
    // Voice endpoints (enhanced)
    { from: '/api/voice/health', to: '/api/v1/voice/health' },
    { from: '/api/voice/session', to: '/api/v1/voice/session' },
    { from: '/api/voice/stream', to: '/api/v1/voice/stream' }
  ];

  // Setup redirects with deprecation warnings
  legacyRedirects.forEach(({ from, to }) => {
    app.use(from, (req, res, _next) => {
      // Add deprecation warning header
      res.setHeader('X-API-Deprecation', 'true');
      res.setHeader('X-API-Deprecation-Info', `This endpoint is deprecated. Use ${to} instead.`);
      res.setHeader('X-API-Migration-Guide', '/api/v1/docs');
      
      logger.warn('Legacy API endpoint accessed', {
        from: req.originalUrl,
        to,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        correlationId: req.correlationId
      });

      // Redirect to new endpoint
      const newUrl = req.originalUrl.replace(from, to);
      res.redirect(301, newUrl);
    });
  });

  // Legacy health endpoint with warning
  app.get('/health', (_req, res, next) => {
    res.setHeader('X-API-Deprecation', 'true');
    res.setHeader('X-API-Deprecation-Info', 'Use /api/health for basic health checks or /api/health/detailed for comprehensive status');
    next();
  });

  logger.info(`Set up ${legacyRedirects.length} legacy route redirects`);
}

/**
 * Perform comprehensive health check across all components
 */
async function performComprehensiveHealthCheck(): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: Record<string, any>;
  performance: Record<string, any>;
}> {
  const components: Record<string, any> = {};
  const performance: Record<string, any> = {};
  let healthyCount = 0;
  let totalChecks = 0;

  // Database health
  try {
    const { checkDatabaseHealth } = await import('../../infrastructure/database');
    components['database'] = await checkDatabaseHealth();
    if (components['database'].healthy) {healthyCount++;}
    totalChecks++;
  } catch (error) {
    components['database'] = { healthy: false, error: 'Database health check failed' };
    totalChecks++;
  }

  // Voice services health
  try {
    const { voiceOrchestrator } = await import('../../services/voice');
    const voiceStatus = voiceOrchestrator.getStatus();
    components['voice'] = {
      healthy: voiceStatus.isRunning,
      activeSessions: voiceStatus.activeSessions,
      performance: voiceStatus.performance
    };
    if (components['voice'].healthy) {healthyCount++;}
    totalChecks++;
    
    // Voice performance metrics
    // Voice performance metrics
    performance['voice'] = {
      avgFirstTokenLatency: voiceStatus.performance.avgFirstTokenLatency,
      avgPartialLatency: voiceStatus.performance.avgPartialLatency,
      avgBargeInLatency: voiceStatus.performance.avgBargeInLatency,
      errorRate: voiceStatus.performance.errorRate
    };
  } catch (error) {
    components['voice'] = { healthy: false, error: 'Voice health check failed' };
    totalChecks++;
  }

  // AI services health
  try {
    const { knowledgeBaseService } = await import('../../modules/ai/application/services/KnowledgeBaseService');
    const kbHealth = await knowledgeBaseService.healthCheck();
    components['knowledgeBase'] = kbHealth;
    if (kbHealth.healthy) {healthyCount++;}
    totalChecks++;
  } catch (error) {
    components['knowledgeBase'] = { healthy: false, error: 'KB health check failed' };
    totalChecks++;
  }

  // OpenAI connectivity
  // OpenAI connectivity
  components['openai'] = {
    healthy: !!process.env['OPENAI_API_KEY'],
    configured: !!process.env['OPENAI_API_KEY']
  };
  if (components['openai'].healthy) {healthyCount++;}
  totalChecks++;

  // Memory health
  const memUsage = process.memoryUsage();
  const memoryHealthy = memUsage.heapUsed < 1000 * 1024 * 1024; // 1GB
  components['memory'] = {
    healthy: memoryHealthy,
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    rss: memUsage.rss
  };
  if (memoryHealthy) {healthyCount++;}
  totalChecks++;

  // Overall performance metrics
  // Overall performance metrics
  performance['system'] = {
    uptime: process.uptime(),
    memoryUsage: memUsage,
    nodeVersion: process.version,
    platform: process.platform
  };

  // Determine overall health
  const healthRatio = totalChecks > 0 ? healthyCount / totalChecks : 0;
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  
  if (healthRatio >= 0.9) {
    overall = 'healthy';
  } else if (healthRatio >= 0.7) {
    overall = 'degraded';
  } else {
    overall = 'unhealthy';
  }

  return { overall, components, performance };
}

/**
 * Graceful shutdown handler for API Gateway
 */
export async function shutdownAPIGateway(): Promise<void> {
  logger.info('Shutting down API Gateway...');
  
  try {
    // Cleanup any API Gateway specific resources
    // This would include closing connections, stopping services, etc.
    
    logger.info('API Gateway shutdown completed');
  } catch (error) {
    logger.error('Error during API Gateway shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

export default setupAPIGatewayIntegration;