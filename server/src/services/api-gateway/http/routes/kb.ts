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
    keyGenerator: (req) => req.user?.tenantId ?? req.ip ?? 'anonymous'
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

      // Import search service dynamically
      const { HybridSearchService } = await import('../../../../modules/ai/infrastructure/retrieval/HybridSearchService');
      const hybridSearchService = new HybridSearchService();
            
      // Perform vector search with language detection and routing
      const searchResult = await hybridSearchService.search({
        query,
        tenantId,
        siteId: req.params['siteId'] || '',  // Add siteId if available from params
        topK,
        locale,
        minScore: threshold,
        strategies: rerank ? ['vector', 'fulltext', 'bm25'] as const : ['vector'] as const,
        filters: {
          ...filters,
          tenantId // Ensure tenant isolation
        },
        vectorOptions: {
          indexType: 'hnsw'
        },
        cacheOptions: {
          enabled: true,
          ttl: 300, // 5 minutes
          staleWhileRevalidate: 60
        }
      });

      // Format response according to spec
      const response = {
        matches: searchResult.items.map(item => ({
          id: item.id,
          url: item.url,
          snippet: item.relevantSnippet || item.content?.substring(0, 200) + '...',
          score: Math.round(item.score * 1000) / 1000,
          meta: includeMeta ? {
            title: item.title,
            description: item.metadata['description'],
            lastModified: item.metadata['lastModified'],
            language: item.metadata['language'],
            contentType: item.metadata['contentType'],
            section: item.metadata['section'],
            hierarchy: item.metadata['hierarchy'],
            chunkIndex: item.chunkIndex,
            fusion: item.fusion
          } : undefined
        })),
        usedLanguage: locale, // HybridSearchResult doesn't have detectedLanguage
        totalMatches: searchResult.totalCount,
        processingTime: searchResult.searchTime,
        searchId: `search_${Date.now()}_${tenantId}` // Generate a search ID
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
    keyGenerator: (req) => req.user?.tenantId ?? req.ip ?? 'anonymous'
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
      const { createQueueService } = await import('../../../_shared/queues');
      const queueService = createQueueService();

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
      // TODO: Implement proper job deduplication with queue service
      
      // Skip duplicate check for now - implement when queue service is properly integrated

      // Schedule the reindex job
      const job = await queueService.queues.crawler.add('kb-reindex', jobData, {
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
    keyGenerator: (req) => req.user?.tenantId ?? req.ip ?? 'anonymous'
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
      const { KnowledgeBaseRepositoryImpl } = await import('../../../../infrastructure/repositories/KnowledgeBaseRepositoryImpl');
      const { createKnowledgeBaseService } = await import('../../../../modules/ai/application/services/KnowledgeBaseService');
      
      // Initialize services
      const knowledgeBaseRepository = new KnowledgeBaseRepositoryImpl();
      const knowledgeBaseService = createKnowledgeBaseService(knowledgeBaseRepository);
      // const queueServiceInstance = createQueueService(); // TODO: Implement queue service integration

      // Get parallel status checks
      const [kbStats, indexStats, crawlStatus, queueStats] = await Promise.allSettled([
        knowledgeBaseService.getTenantStats(tenantId),
        // For index stats, we need a knowledge base ID - let's get the first one for tenant
        knowledgeBaseRepository.findByTenantId(tenantId).then(async (kbs) => {
          if (kbs.length > 0) {
            return await knowledgeBaseService.getIndexStats(kbs[0]!.id);
          }
          return { 
            indexSize: 0, 
            vectorCount: 0,
            type: 'HNSW' as const,
            parameters: null,
            healthy: true,
            lastOptimized: null
          };
        }),
        knowledgeBaseService.getLastCrawlInfo(tenantId),
        Promise.resolve({ 
          waitingJobs: 0, 
          activeJobs: 0,
          active: 0,
          waiting: 0,
          failed: 0
        }) // queueServiceInstance.getQueueStats(['kb-reindex', 'kb-crawl'])
      ]);

      // Format response
      const status = {
        // Knowledge base metrics
        chunkCount: kbStats.status === 'fulfilled' ? kbStats.value.totalChunks : 0,
        documentCount: kbStats.status === 'fulfilled' ? kbStats.value.totalDocuments : 0,
        indexSize: kbStats.status === 'fulfilled' ? kbStats.value.totalIndexSizeMB : 0,
        
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
        
        // Language support (would be determined from actual data)
        supportedLanguages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko'],
        
        // Performance metrics
        averageSearchLatency: kbStats.status === 'fulfilled' ? kbStats.value.avgSearchLatencyMs : null,
        searchCount24h: kbStats.status === 'fulfilled' ? kbStats.value.searchCount24h : 0,
        
        // Additional KB status info
        knowledgeBasesByStatus: kbStats.status === 'fulfilled' ? kbStats.value.knowledgeBasesByStatus : {},
        lastCrawlAt: crawlStatus.status === 'fulfilled' ? crawlStatus.value.lastCrawlAt : null,
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
    keyGenerator: (req) => req.ip ?? 'anonymous'
  }),
  async (_req: express.Request, res: express.Response) => {
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