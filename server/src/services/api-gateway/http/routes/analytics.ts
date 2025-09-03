/**
 * Analytics API Routes - HTTP endpoints for analytics ingestion and reporting
 * 
 * Provides REST endpoints for event ingestion, reporting, and analytics management
 * following OpenAPI/REST conventions with proper authentication and validation.
 */

import { Router } from 'express';
import { ingestHandlers, reportsHandlers } from '../../../_shared/analytics/index.js';
import { authenticate, requireTenantAccess } from '../../../../infrastructure/auth/middleware.js';
import { createMetricsMiddleware } from '../../../_shared/telemetry/metrics.js';
import { createCustomRateLimit } from '../middleware/rate-limit-headers.js';
import { validateContentType, validatePayloadSize } from '../middleware/validation.js';

const router = Router();

// Apply common middleware
router.use(createMetricsMiddleware());

/**
 * Analytics Event Ingestion Endpoints
 * 
 * These endpoints handle real-time analytics event ingestion with 
 * schema validation, deduplication, and at-least-once delivery guarantees.
 */

// Ingestion rate limiter - higher limits for analytics data
const ingestionRateLimit = createCustomRateLimit('analytics-ingestion', {
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 events per minute per IP
});

// Single event ingestion
router.post('/events', 
  ingestionRateLimit,
  validateContentType(['application/json']),
  validatePayloadSize({ maxSizeKb: 100 }), // Single events should be small
  ingestHandlers.event
);

// Batch event ingestion  
router.post('/events/batch',
  ingestionRateLimit,
  validateContentType(['application/json']),
  validatePayloadSize({ maxSizeKb: 500 }), // Larger limit for batches
  ingestHandlers.batch
);

// Ingestion health check
router.get('/events/health', ingestHandlers.health);

// Ingestion statistics (admin only)
router.get('/events/stats', 
  authenticate(),
  requireRole('admin'),
  ingestHandlers.stats
);

/**
 * Analytics Reporting Endpoints
 * 
 * These endpoints provide query capabilities for dashboards, SLA monitoring,
 * and business intelligence with tenant isolation and proper authorization.
 */

// Reporting rate limiter - moderate limits for dashboard queries
const reportingRateLimit = createCustomRateLimit('analytics-reporting', {
  windowMs: 1 * 60 * 1000, // 1 minute  
  max: 100, // 100 queries per minute per IP
});

// All reporting endpoints require authentication and tenant access
router.use('/reports', 
  reportingRateLimit,
  authenticate(),
  requireTenantAccess()
);

// Time series data for dashboards
router.post('/reports/timeseries',
  validateContentType(['application/json']),
  validatePayloadSize({ maxSizeKb: 10 }),
  reportsHandlers.timeseries
);

// Funnel analysis
router.post('/reports/funnel',
  validateContentType(['application/json']),
  validatePayloadSize({ maxSizeKb: 10 }),
  reportsHandlers.funnel
);

// Top N analysis (top tools, errors, etc.)
router.post('/reports/topn',
  validateContentType(['application/json']),
  validatePayloadSize({ maxSizeKb: 10 }),
  reportsHandlers.topn  
);

// Available metrics list
router.get('/reports/metrics', reportsHandlers.metrics);

/**
 * Analytics Management Endpoints
 * 
 * Administrative endpoints for analytics service management,
 * configuration, and monitoring.
 */

// Service health check
router.get('/health', async (req, res) => {
  try {
    const { checkAnalyticsHealth } = await import('../../../_shared/analytics/index.js');
    const health = checkAnalyticsHealth();
    
    res.status(health.healthy ? 200 : 503).json({
      success: health.healthy,
      service: 'analytics',
      components: health.components,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      service: 'analytics',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Service statistics (admin only)
router.get('/stats',
  authenticate(),
  requireRole('admin'), 
  async (req, res) => {
    try {
      const { getAnalyticsStats } = await import('../../../_shared/analytics/index.js');
      const stats = getAnalyticsStats();
      
      res.status(200).json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get analytics statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * OpenAPI/Swagger Documentation Schema
 * 
 * This would typically be generated automatically, but here's the manual schema
 * for key endpoints to demonstrate the API structure.
 */
export const analyticsApiSchema = {
  '/analytics/events': {
    post: {
      summary: 'Ingest single analytics event',
      tags: ['Analytics', 'Ingestion'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['event_id', 'event_name', 'occurred_at', 'tenant_id', 'source'],
              properties: {
                event_id: { type: 'string', format: 'uuid' },
                event_name: { type: 'string', pattern: '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' },
                occurred_at: { type: 'string', format: 'date-time' },
                tenant_id: { type: 'string', format: 'uuid' },
                site_id: { type: 'string', format: 'uuid' },
                session_id: { type: 'string', format: 'uuid' },
                user_id: { type: 'string' },
                source: { type: 'string', enum: ['web', 'widget', 'voice_ws', 'server'] },
                attributes: { type: 'object', additionalProperties: true },
                context: { type: 'object' }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Event ingested successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  stats: {
                    type: 'object',
                    properties: {
                      accepted: { type: 'number' },
                      duplicates: { type: 'number' },
                      rejected: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Validation error' },
        429: { description: 'Rate limit exceeded' },
        500: { description: 'Internal server error' }
      }
    }
  },
  '/analytics/reports/timeseries': {
    post: {
      summary: 'Get time series data for metrics',
      tags: ['Analytics', 'Reporting'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['tenantId', 'metric', 'from', 'to', 'grain'],
              properties: {
                tenantId: { type: 'string', format: 'uuid' },
                siteId: { type: 'string', format: 'uuid' },
                metric: { 
                  type: 'string',
                  enum: [
                    'voice.first_response_ms.p95',
                    'ai.tool_calls.success_rate',
                    'kb.hit_rate',
                    'commerce.conversion_rate',
                    'system.error_rate'
                  ]
                },
                from: { type: 'string', format: 'date-time' },
                to: { type: 'string', format: 'date-time' },
                grain: { type: 'string', enum: ['1m', '5m', '1h', '1d'] },
                filters: { type: 'object', additionalProperties: true }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Time series data',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        t: { type: 'string', format: 'date-time' },
                        value: { type: 'number' }
                      }
                    }
                  },
                  meta: {
                    type: 'object',
                    properties: {
                      metric: { type: 'string' },
                      grain: { type: 'string' },
                      from: { type: 'string' },
                      to: { type: 'string' },
                      points: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: 'Invalid query parameters' },
        401: { description: 'Authentication required' },
        403: { description: 'Access denied' },
        500: { description: 'Internal server error' }
      }
    }
  }
};

// Helper middleware functions (would be imported from shared middleware)
function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: role,
        current: req.user?.role
      });
    }
    next();
  };
}

export default router;