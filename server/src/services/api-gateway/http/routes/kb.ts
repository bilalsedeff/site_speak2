/**
 * Knowledge Base API Routes
 * 
 * Implements /api/v1/kb endpoints:
 * - POST /search - Vector search with language hints
 * - POST /reindex - Trigger crawl/reindex jobs
 * - GET /status - Crawl and index status
 */

import express from 'express';
import { z } from 'zod';
import { createLogger } from '../../../_shared/telemetry/logger';
import { authenticate, requireRole } from '../../../../infrastructure/auth/middleware';
import { enforceTenancy } from '../../../_shared/security/tenancy';
import { validateRequest } from '../../../../infrastructure/middleware/validation';
import { addProblemDetailMethod } from '../middleware/problem-details';
import { createCustomRateLimit } from '../middleware/rate-limit-headers';

const logger = createLogger({ service: 'kb-api' });
const router = express.Router();

// Apply common middleware
router.use(addProblemDetailMethod());

// Knowledge Base Search Schema
const KBSearchSchema = z.object({
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(50).optional().default(10),
  filters: z.record(z.any()).optional(),
  langHint: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  threshold: z.number().min(0).max(1).optional().default(0.7),
  includeMeta: z.boolean().optional().default(true),
  rerank: z.boolean().optional().default(true)
});

// Knowledge Base Reindex Schema
const KBReindexSchema = z.object({
  mode: z.enum(['delta', 'full']).default('delta'),
  siteId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
  options: z.object({
    crawlDepth: z.number().int().min(1).max(10).optional(),
    respectRobots: z.boolean().optional().default(true),
    followExternalLinks: z.boolean().optional().default(false),
    extractImages: z.boolean().optional().default(true)
  }).optional()
});

/**
 * POST /api/v1/kb/search
 * Vector search with language hints and filtering
 */
router.post('/search',
  createCustomRateLimit('kb_search', { 
    windowMs: 60 * 1000, 
    max: 100,
    keyGenerator: (req) => req.user?.tenantId || req.ip
  }),
  authenticate(),
  enforceTenancy(),
  validateRequest({ body: KBSearchSchema }),
  async (req: express.Request, res: express.Response) => {
    try {
      const { query, topK, filters, langHint, threshold, includeMeta, rerank } = req.body;
      const tenantId = req.user!.tenantId;
      const locale = langHint || req.locale || 'en-US';

      logger.info('Processing knowledge base search', {
        tenantId,
        queryLength: query.length,
        topK,
        langHint: locale,
        correlationId: req.correlationId
      });

      // Import knowledge base service dynamically
      const { knowledgeBaseService } = await import('../../../modules/ai/application/services/KnowledgeBaseService');
      
      // Perform vector search with language detection and routing
      const searchResult = await knowledgeBaseService.search({
        query,
        tenantId,
        topK,
        filters: {
          ...filters,
          tenantId // Ensure tenant isolation
        },
        options: {
          languageHint: locale,
          threshold,
          includeMetadata: includeMeta,
          rerank,
          useLanguageDetection: true
        }
      });

      // Format response according to spec
      const response = {
        matches: searchResult.matches.map(match => ({
          id: match.id,
          url: match.metadata.url,
          snippet: match.snippet || match.content?.substring(0, 200) + '...',
          score: Math.round(match.score * 1000) / 1000,
          meta: includeMeta ? {
            title: match.metadata.title,
            description: match.metadata.description,
            lastModified: match.metadata.lastModified,
            language: match.metadata.language,
            contentType: match.metadata.contentType,
            section: match.metadata.section,
            hierarchy: match.metadata.hierarchy
          } : undefined
        })),
        usedLanguage: searchResult.detectedLanguage || locale,
        totalMatches: searchResult.total,
        processingTime: searchResult.processingTimeMs,
        searchId: searchResult.searchId
      };

      logger.info('Knowledge base search completed', {
        tenantId,
        matchCount: response.matches.length,
        usedLanguage: response.usedLanguage,
        processingTime: response.processingTime,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: response,
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId,
          processingTime: response.processingTime
        }
      });

    } catch (error) {
      logger.error('Knowledge base search failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: req.user?.tenantId,
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Search Failed',
        status: 500,
        detail: 'An error occurred while searching the knowledge base',
        extensions: {
          searchQuery: req.body.query ? 'provided' : 'missing'
        }
      });
    }
  }
);

/**
 * POST /api/v1/kb/reindex
 * Trigger knowledge base reindexing (privileged endpoint)
 */
router.post('/reindex',
  createCustomRateLimit('kb_reindex', { 
    windowMs: 60 * 1000, 
    max: 10,
    keyGenerator: (req) => req.user?.tenantId || req.ip
  }),
  authenticate(),
  enforceTenancy(),
  requireRole('owner', 'admin'),
  validateRequest({ body: KBReindexSchema }),
  async (req: express.Request, res: express.Response) => {
    try {
      const { mode, siteId, priority, options } = req.body;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      logger.info('Triggering knowledge base reindex', {
        tenantId,
        userId,
        mode,
        siteId,
        priority,
        correlationId: req.correlationId
      });

      // Import reindexing service
      const { webCrawlerService } = await import('../../../modules/ai/application/services/WebCrawlerService');
      const { queueService } = await import('../../../_shared/queues');

      // Create reindex job
      const jobData = {
        tenantId,
        siteId,
        mode,
        priority,
        options: {
          crawlDepth: options?.crawlDepth || 3,
          respectRobots: options?.respectRobots ?? true,
          followExternalLinks: options?.followExternalLinks ?? false,
          extractImages: options?.extractImages ?? true,
          triggeredBy: userId,
          correlationId: req.correlationId
        }
      };

      // Check for existing running jobs to prevent duplicates
      const existingJob = await queueService.getActiveJob('kb-reindex', tenantId);
      if (existingJob && mode === 'delta') {
        logger.info('Reindex job already running, skipping duplicate', {
          tenantId,
          existingJobId: existingJob.id,
          correlationId: req.correlationId
        });

        return res.json({
          success: true,
          data: {
            status: 'skipped',
            reason: 'reindex_already_running',
            existingJobId: existingJob.id,
            message: 'A reindex job is already running for this tenant'
          },
          metadata: {
            timestamp: new Date().toISOString(),
            correlationId: req.correlationId
          }
        });
      }

      // Schedule the reindex job
      const job = await queueService.add('kb-reindex', jobData, {
        priority: priority === 'high' ? 10 : priority === 'low' ? 1 : 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000 // 30 seconds
        },
        removeOnComplete: 50,
        removeOnFail: 20
      });

      logger.info('Knowledge base reindex job scheduled', {
        tenantId,
        jobId: job.id,
        mode,
        priority,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          jobId: job.id,
          mode,
          priority,
          status: 'scheduled',
          estimatedStartTime: new Date(Date.now() + (job.delay || 0)).toISOString(),
          message: `${mode === 'full' ? 'Full' : 'Delta'} reindex job scheduled successfully`
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });

    } catch (error) {
      logger.error('Knowledge base reindex failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: req.user?.tenantId,
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Reindex Failed',
        status: 500,
        detail: 'An error occurred while scheduling the reindex job',
        extensions: {
          mode: req.body.mode,
          siteId: req.body.siteId
        }
      });
    }
  }
);

/**
 * GET /api/v1/kb/status
 * Get knowledge base status and metrics
 */
router.get('/status',
  createCustomRateLimit('kb_status', { 
    windowMs: 60 * 1000, 
    max: 60,
    keyGenerator: (req) => req.user?.tenantId || req.ip
  }),
  authenticate(),
  enforceTenancy(),
  async (req: express.Request, res: express.Response) => {
    try {
      const tenantId = req.user!.tenantId;

      logger.debug('Fetching knowledge base status', {
        tenantId,
        correlationId: req.correlationId
      });

      // Import required services
      const { knowledgeBaseService } = await import('../../../modules/ai/application/services/KnowledgeBaseService');
      const { queueService } = await import('../../../_shared/queues');
      const { pgVectorClient } = await import('../../../modules/ai/infrastructure/vector-store/PgVectorClient');

      // Get parallel status checks
      const [kbStats, indexStats, crawlStatus, queueStats] = await Promise.allSettled([
        knowledgeBaseService.getStats(tenantId),
        pgVectorClient.getIndexStats(tenantId),
        knowledgeBaseService.getLastCrawlInfo(tenantId),
        queueService.getQueueStats(['kb-reindex', 'kb-crawl'])
      ]);

      // Format response
      const status = {
        // Knowledge base metrics
        chunkCount: kbStats.status === 'fulfilled' ? kbStats.value.totalChunks : 0,
        documentCount: kbStats.status === 'fulfilled' ? kbStats.value.totalDocuments : 0,
        indexSize: kbStats.status === 'fulfilled' ? kbStats.value.indexSizeMB : 0,
        
        // Index information
        indexType: indexStats.status === 'fulfilled' ? indexStats.value.type : 'HNSW',
        indexParameters: indexStats.status === 'fulfilled' ? indexStats.value.parameters : null,
        
        // Last crawl information
        lastCrawlTime: crawlStatus.status === 'fulfilled' ? crawlStatus.value.lastCrawlTime : null,
        lastSitemapCheck: crawlStatus.status === 'fulfilled' ? crawlStatus.value.lastSitemapCheck : null,
        lastSuccessfulCrawl: crawlStatus.status === 'fulfilled' ? crawlStatus.value.lastSuccessfulCrawl : null,
        
        // Processing status
        isProcessing: queueStats.status === 'fulfilled' ? queueStats.value.active > 0 : false,
        pendingJobs: queueStats.status === 'fulfilled' ? queueStats.value.waiting : 0,
        failedJobs: queueStats.status === 'fulfilled' ? queueStats.value.failed : 0,
        
        // Health indicators
        health: {
          indexHealthy: indexStats.status === 'fulfilled' && indexStats.value.healthy,
          crawlerHealthy: crawlStatus.status === 'fulfilled',
          queueHealthy: queueStats.status === 'fulfilled'
        },
        
        // Language support
        supportedLanguages: knowledgeBaseService.getSupportedLanguages(),
        
        // Performance metrics
        averageSearchLatency: kbStats.status === 'fulfilled' ? kbStats.value.avgSearchLatencyMs : null,
        searchCount24h: kbStats.status === 'fulfilled' ? kbStats.value.searchCount24h : 0
      };

      res.json({
        success: true,
        data: status,
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId,
          tenantId
        }
      });

    } catch (error) {
      logger.error('Knowledge base status check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: req.user?.tenantId,
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Status Check Failed',
        status: 500,
        detail: 'An error occurred while checking knowledge base status'
      });
    }
  }
);

/**
 * GET /api/v1/kb/health
 * Lightweight health check
 */
router.get('/health',
  createCustomRateLimit('health', { 
    windowMs: 60 * 1000, 
    max: 120,
    keyGenerator: (req) => req.ip
  }),
  async (req: express.Request, res: express.Response) => {
    try {
      // Quick health check without heavy operations
      const health = {
        status: 'healthy',
        service: 'knowledge-base',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      res.json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        service: 'knowledge-base',
        timestamp: new Date().toISOString(),
        error: 'Service check failed'
      });
    }
  }
);

export { router as kbRoutes };