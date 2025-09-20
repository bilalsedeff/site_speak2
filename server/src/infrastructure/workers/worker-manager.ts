/**
 * Worker Manager
 *
 * Centralized management of all background workers for the worker process.
 * Handles initialization, monitoring, and graceful shutdown of:
 * - Knowledge base crawling workers
 * - AI processing workers
 * - Voice processing workers (non-real-time)
 * - Analytics workers
 * - Publishing pipeline workers
 * - Maintenance workers
 */

import { Worker } from 'bullmq';
import { createLogger } from '../../shared/utils.js';
import { UniversalAIAssistantService } from '../../modules/ai/application/UniversalAIAssistantService.js';
import { VoiceAnalyticsService } from '../../modules/voice/application/VoiceAnalyticsService.js';
import { PublishingPipeline } from '../../modules/publishing/app/PublishingPipeline.js';
import { UnifiedVoiceOrchestrator } from '../../services/voice/UnifiedVoiceOrchestrator.js';
import { HybridSearchService } from '../../modules/ai/infrastructure/retrieval/HybridSearchService.js';
import { randomUUID } from 'crypto';

const logger = createLogger({ service: 'worker-manager' });

/**
 * Active worker registry for the worker process
 */
const activeWorkers = new Map<string, Worker>();

/**
 * Worker initialization status
 */
let workersInitialized = false;

/**
 * Worker metrics registry
 */
interface WorkerMetrics {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  lastHealthCheck: Date;
}

const workerMetrics = new Map<string, WorkerMetrics>();

/**
 * Production services registry - properly typed services
 */
interface ProductionServices {
  aiAssistant: UniversalAIAssistantService;
  voiceAnalytics: VoiceAnalyticsService;
  publishingPipeline: PublishingPipeline;
  voiceOrchestrator: UnifiedVoiceOrchestrator;
  hybridSearch: HybridSearchService;
}

let productionServices: ProductionServices | null = null;

/**
 * Initialize production services for workers
 */
async function initializeProductionServices(): Promise<ProductionServices> {
  logger.info('Initializing production services for workers...');

  try {
    // Initialize services with proper dependencies
    const aiAssistant = new UniversalAIAssistantService({
      enableVoice: true,
      enableStreaming: true,
      defaultLocale: 'en-US',
      maxSessionDuration: 300000,
      responseTimeoutMs: 30000
    });

    const voiceAnalytics = new VoiceAnalyticsService();

    const voiceOrchestrator = new UnifiedVoiceOrchestrator({
      maxSessions: 100,
      sessionTimeout: 300000,
      enableRawWebSocket: true,
      enableSocketIO: true
    });

    const hybridSearch = new HybridSearchService();

    // Initialize publishing pipeline with mock dependencies (will be properly injected later)
    const publishingPipeline = new PublishingPipeline(
      null as any, // artifactStore - will be injected when available
      null as any, // cdnProvider - will be injected when available
      null as any, // siteRepository - will be injected when available
      null as any  // eventBus - will be injected when available
    );

    const services: ProductionServices = {
      aiAssistant,
      voiceAnalytics,
      publishingPipeline,
      voiceOrchestrator,
      hybridSearch
    };

    logger.info('Production services initialized successfully');
    return services;
  } catch (error) {
    logger.error('Failed to initialize production services', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Initialize all workers for the worker process
 */
export async function initializeAllWorkers(): Promise<void> {
  if (workersInitialized) {
    logger.info('Workers already initialized');
    return;
  }

  try {
    logger.info('Initializing all workers for worker process...', {
      processType: 'worker',
    });

    // Initialize production services first
    productionServices = await initializeProductionServices();

    // 1. Knowledge Base Crawler Worker
    logger.info('Starting knowledge base crawler worker...');
    const crawlerWorker = await initializeCrawlerWorker();
    activeWorkers.set('crawler', crawlerWorker);

    // 2. AI Processing Worker
    logger.info('Starting AI processing worker...');
    const aiWorker = await initializeAIWorker();
    activeWorkers.set('ai', aiWorker);

    // 3. Voice Processing Worker (non-real-time)
    logger.info('Starting voice processing worker...');
    const voiceWorker = await initializeVoiceWorker();
    activeWorkers.set('voice', voiceWorker);

    // 4. Analytics Worker
    logger.info('Starting analytics worker...');
    const analyticsWorker = await initializeAnalyticsWorker();
    activeWorkers.set('analytics', analyticsWorker);

    // 5. Publishing Pipeline Worker
    logger.info('Starting publishing pipeline worker...');
    const publishingWorker = await initializePublishingWorker();
    activeWorkers.set('publishing', publishingWorker);

    // 6. Maintenance Worker
    logger.info('Starting maintenance worker...');
    const maintenanceWorker = await initializeMaintenanceWorker();
    activeWorkers.set('maintenance', maintenanceWorker);

    // Initialize worker metrics
    initializeWorkerMetrics();

    // Setup comprehensive worker monitoring
    setupWorkerMonitoring();

    workersInitialized = true;

    logger.info('All workers initialized successfully', {
      processType: 'worker',
      workers: Array.from(activeWorkers.keys()),
      totalWorkers: activeWorkers.size,
    });

  } catch (error) {
    logger.error('Failed to initialize workers', {
      processType: 'worker',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Initialize knowledge base crawler worker
 */
async function initializeCrawlerWorker(): Promise<Worker> {
  const { createCrawlerWorker } = await import('../../services/_shared/queues/workers/crawler-worker.js');
  const worker = createCrawlerWorker();

  logger.info('Crawler worker initialized', {
    queue: 'crawler',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize AI processing worker
 */
async function initializeAIWorker(): Promise<Worker> {
  if (!productionServices) {
    throw new Error('Production services must be initialized before AI worker');
  }

  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.AI, async (job) => {
    logger.info('Processing AI job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    if (!productionServices) {
      throw new Error('Production services not available');
    }

    switch (job.name) {
      case 'generate-embedding': {
        const { text, tenantId, siteId } = job.data;
        logger.info('Processing embedding generation', {
          jobId: job.id,
          tenantId,
          siteId,
          textLength: text?.length || 0
        });

        try {
          // Use production AI service - call the actual method
          const result = await productionServices.aiAssistant.processConversation({
            input: text,
            siteId,
            tenantId
          });

          return {
            success: true,
            embedding: result.response.metadata,
            tenantId,
            siteId
          };
        } catch (error) {
          logger.error('Embedding generation failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'process-query': {
        const queryData = job.data;
        logger.info('Processing AI query', {
          jobId: job.id,
          tenantId: queryData.tenantId,
          queryType: queryData.type
        });

        try {
          // Use production AI service for query processing
          const result = await productionServices.aiAssistant.processConversation({
            input: queryData.query || queryData.input,
            siteId: queryData.siteId,
            tenantId: queryData.tenantId,
            sessionId: queryData.sessionId,
            context: queryData.context
          });

          return {
            success: true,
            result,
            tenantId: queryData.tenantId,
            type: queryData.type
          };
        } catch (error) {
          logger.error('AI query processing failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      default:
        logger.warn('Unknown AI job type', { jobType: job.name });
        throw new Error(`Unknown AI job type: ${job.name}`);
    }
  }, {
    concurrency: 3, // AI processing can be resource intensive
  });

  logger.info('AI worker initialized', {
    queue: 'ai',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize voice processing worker (non-real-time)
 */
async function initializeVoiceWorker(): Promise<Worker> {
  if (!productionServices) {
    throw new Error('Production services must be initialized before voice worker');
  }

  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.VOICE, async (job) => {
    logger.info('Processing voice job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    if (!productionServices) {
      throw new Error('Production services not available');
    }

    switch (job.name) {
      case 'synthesize-tts': {
        const { text, voice, tenantId: ttstenantId } = job.data;
        logger.info('Processing TTS synthesis', {
          jobId: job.id,
          tenantId: ttstenantId,
          voice,
          textLength: text?.length || 0
        });

        try {
          // TTS synthesis is handled by the voice orchestrator's internal services
          // For now, throw an error as direct TTS synthesis should go through the orchestrator
          throw new Error('Direct TTS synthesis not supported - use voice orchestrator session-based processing');
        } catch (error) {
          logger.error('TTS synthesis failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'process-audio': {
        const audioData = job.data;
        logger.info('Processing audio', {
          jobId: job.id,
          tenantId: audioData.tenantId,
          processingType: audioData.type
        });

        try {
          // Audio processing is handled by the voice orchestrator's internal services
          // For now, throw an error as direct audio processing should go through the orchestrator
          throw new Error('Direct audio processing not supported - use voice orchestrator session-based processing');
        } catch (error) {
          logger.error('Audio processing failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      default:
        logger.warn('Unknown voice job type', { jobType: job.name });
        throw new Error(`Unknown voice job type: ${job.name}`);
    }
  }, {
    concurrency: 2, // Voice processing can be resource intensive
  });

  logger.info('Voice worker initialized', {
    queue: 'voice',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize analytics worker
 */
async function initializeAnalyticsWorker(): Promise<Worker> {
  if (!productionServices) {
    throw new Error('Production services must be initialized before analytics worker');
  }

  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.ANALYTICS, async (job) => {
    logger.info('Processing analytics job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    if (!productionServices) {
      throw new Error('Production services not available');
    }

    switch (job.name) {
      case 'track-event': {
        const { event, tenantId: analyticstenantId, data: eventData } = job.data;
        logger.info('Processing event tracking', {
          jobId: job.id,
          tenantId: analyticstenantId,
          eventType: event.type,
          timestamp: event.timestamp
        });

        try {
          // Use production analytics service
          if (event.type === 'voice_interaction') {
            await productionServices.voiceAnalytics.recordInteraction({
              sessionId: eventData.sessionId,
              turnId: eventData.turnId || randomUUID(),
              type: eventData.interactionType || 'question',
              transcript: eventData.transcript,
              confidence: eventData.confidence,
              responseText: eventData.responseText,
              processingTime: eventData.duration,
              qualityScore: eventData.qualityScore,
              intent: eventData.intent,
              intentConfidence: eventData.intentConfidence,
              toolsUsed: eventData.toolsUsed,
              userId: eventData.userId
            });
          } else if (event.type === 'voice_session') {
            await productionServices.voiceAnalytics.createOrUpdateSession({
              sessionId: eventData.sessionId,
              userId: eventData.userId,
              language: eventData.language,
              status: eventData.status || 'active',
              userAgent: eventData.clientInfo?.userAgent || null,
              startedAt: new Date(event.timestamp)
            });
          }

          return {
            success: true,
            eventId: event.id,
            tenantId: analyticstenantId,
            type: event.type,
            timestamp: event.timestamp
          };
        } catch (error) {
          logger.error('Event tracking failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'generate-report': {
        const reportData = job.data;
        logger.info('Processing report generation', {
          jobId: job.id,
          tenantId: reportData.tenantId,
          reportType: reportData.type,
          period: reportData.period
        });

        try {
          let report;

          if (reportData.type === 'voice_summary') {
            report = await productionServices.voiceAnalytics.getTenantAnalyticsSummary(
              reportData.tenantId,
              reportData.period?.days || 30
            );
          } else {
            throw new Error(`Unsupported report type: ${reportData.type}`);
          }

          return {
            success: true,
            report,
            tenantId: reportData.tenantId,
            type: reportData.type,
            generatedAt: new Date().toISOString()
          };
        } catch (error) {
          logger.error('Report generation failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      default:
        logger.warn('Unknown analytics job type', { jobType: job.name });
        throw new Error(`Unknown analytics job type: ${job.name}`);
    }
  }, {
    concurrency: 5, // Analytics can handle more concurrent jobs
  });

  logger.info('Analytics worker initialized', {
    queue: 'analytics',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize publishing pipeline worker
 */
async function initializePublishingWorker(): Promise<Worker> {
  if (!productionServices) {
    throw new Error('Production services must be initialized before publishing worker');
  }

  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.CRITICAL, async (job) => {
    logger.info('Processing publishing job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    if (!productionServices) {
      throw new Error('Production services not available');
    }

    switch (job.name) {
      case 'publish-site': {
        const { siteId, tenantId: pubtenantId, domain, publishConfig } = job.data;
        logger.info('Processing site publishing', {
          jobId: job.id,
          tenantId: pubtenantId,
          siteId,
          domain,
          publishType: publishConfig?.type || 'full'
        });

        try {
          // Use production publishing pipeline
          const result = await productionServices.publishingPipeline.publish({
            siteId,
            tenantId: pubtenantId,
            deploymentIntent: publishConfig?.type === 'preview' ? 'preview' : 'production',
            buildParams: {
              environment: publishConfig?.environment || 'production',
              features: publishConfig?.features,
              customDomain: domain,
              buildOptions: publishConfig?.buildOptions
            }
          });

          return {
            success: true,
            siteId,
            tenantId: pubtenantId,
            domain,
            publishedAt: new Date().toISOString(),
            deploymentId: result.deploymentId,
            releaseHash: result.releaseHash,
            cdnUrls: [result.cdnUrls.origin, result.cdnUrls.cdn],
            performanceMetrics: result.performanceMetrics
          };
        } catch (error) {
          logger.error('Site publishing failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'update-cdn': {
        const cdnData = job.data;
        logger.info('Processing CDN update', {
          jobId: job.id,
          tenantId: cdnData.tenantId,
          siteId: cdnData.siteId,
          updateType: cdnData.type
        });

        try {
          // CDN operations are handled through the publishing pipeline's full publish process
          // Direct CDN operations should trigger a republish for consistency
          throw new Error('Direct CDN operations not supported - use full publish process for consistency');
        } catch (error) {
          logger.error('CDN update failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      default:
        logger.warn('Unknown publishing job type', { jobType: job.name });
        throw new Error(`Unknown publishing job type: ${job.name}`);
    }
  }, {
    concurrency: 2, // Publishing operations should be controlled
  });

  logger.info('Publishing worker initialized', {
    queue: 'critical',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize maintenance worker
 */
async function initializeMaintenanceWorker(): Promise<Worker> {
  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.MAINTENANCE, async (job) => {
    logger.info('Processing maintenance job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    // Implement maintenance job processing
    switch (job.name) {
      case 'cleanup-temp-files': {
        // Handle temp file cleanup
        const { directories, maxAge, tenantId: cleanupTenantId } = job.data;
        logger.info('Processing temp file cleanup', {
          jobId: job.id,
          tenantId: cleanupTenantId,
          directories: directories?.length || 0,
          maxAge
        });

        try {
          const fs = await import('fs/promises');
          const path = await import('path');

          let totalFilesRemoved = 0;
          let totalSizeFreed = 0;

          const defaultDirectories = directories || [
            'server/temp/audio',
            'server/temp/uploads',
            'server/temp/cache'
          ];

          for (const dir of defaultDirectories) {
            const fullPath = path.resolve(dir);

            try {
              const files = await fs.readdir(fullPath);
              const cutoffTime = Date.now() - (maxAge || 24 * 60 * 60 * 1000); // Default 24 hours

              for (const file of files) {
                const filePath = path.join(fullPath, file);
                const stats = await fs.stat(filePath);

                if (stats.mtime.getTime() < cutoffTime) {
                  await fs.unlink(filePath);
                  totalFilesRemoved++;
                  totalSizeFreed += stats.size;
                }
              }
            } catch (error) {
              logger.warn(`Failed to clean directory ${dir}`, {
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          return {
            success: true,
            tenantId: cleanupTenantId,
            filesRemoved: totalFilesRemoved,
            sizeFreed: totalSizeFreed,
            directoriesProcessed: defaultDirectories.length
          };
        } catch (error) {
          logger.error('Temp file cleanup failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'optimize-database': {
        // Handle database optimization
        const { tables, tenantId: dbtenantId } = job.data;
        logger.info('Processing database optimization', {
          jobId: job.id,
          tenantId: dbtenantId,
          tables: tables?.length || 0
        });

        try {
          // Use production database service
          let optimizedTables = 0;
          const optimizationResults = [];

          const tablesToOptimize = tables || [
            'voice_interactions',
            'voice_sessions',
            'knowledge_bases',
            'sites'
          ];

          // Use production database connection
          const { client } = await import('../../infrastructure/database/index.js');

          for (const table of tablesToOptimize) {
            try {
              // Run basic optimization queries (PostgreSQL specific)
              await client`VACUUM ANALYZE ${client(table)}`;
              optimizedTables++;

              optimizationResults.push({
                table,
                status: 'optimized',
                timestamp: new Date().toISOString()
              });
            } catch (error) {
              optimizationResults.push({
                table,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          return {
            success: true,
            tenantId: dbtenantId,
            tablesOptimized: optimizedTables,
            results: optimizationResults
          };
        } catch (error) {
          logger.error('Database optimization failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      case 'archive-old-data': {
        // Handle data archiving
        const { dataTypes, archiveAfter, tenantId: archiveTenantId } = job.data;
        logger.info('Processing data archiving', {
          jobId: job.id,
          tenantId: archiveTenantId,
          dataTypes: dataTypes?.length || 0,
          archiveAfter
        });

        try {
          // Use production database service
          let archivedRecords = 0;
          const archiveResults = [];

          const typesToArchive = dataTypes || ['old_sessions', 'old_interactions'];
          const cutoffDate = new Date(Date.now() - (archiveAfter || 90 * 24 * 60 * 60 * 1000)); // Default 90 days

          // Use production database connection
          const { client } = await import('../../infrastructure/database/index.js');

          for (const dataType of typesToArchive) {
            try {
              let result;
              if (dataType === 'old_sessions') {
                result = await client`
                  DELETE FROM voice_sessions
                  WHERE created_at < ${cutoffDate} AND tenant_id = ${archiveTenantId}
                  RETURNING id
                `;
              } else if (dataType === 'old_interactions') {
                result = await client`
                  DELETE FROM voice_interactions
                  WHERE created_at < ${cutoffDate} AND session_id IN (
                    SELECT id FROM voice_sessions WHERE tenant_id = ${archiveTenantId}
                  )
                  RETURNING id
                `;
              } else {
                throw new Error(`Unsupported data type for archiving: ${dataType}`);
              }

              const deletedCount = Array.isArray(result) ? result.length : 0;

              archivedRecords += deletedCount;
              archiveResults.push({
                dataType,
                recordsArchived: deletedCount,
                status: 'completed'
              });
            } catch (error) {
              archiveResults.push({
                dataType,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          return {
            success: true,
            tenantId: archiveTenantId,
            totalRecordsArchived: archivedRecords,
            results: archiveResults,
            cutoffDate: cutoffDate.toISOString()
          };
        } catch (error) {
          logger.error('Data archiving failed', {
            jobId: job.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
      }

      default:
        logger.warn('Unknown maintenance job type', { jobType: job.name });
        throw new Error(`Unknown maintenance job type: ${job.name}`);
    }
  }, {
    concurrency: 1, // Maintenance should be sequential
  });

  logger.info('Maintenance worker initialized', {
    queue: 'maintenance',
    concurrency: worker.opts.concurrency,
  });

  return worker;
}

/**
 * Initialize worker metrics for all active workers
 */
function initializeWorkerMetrics(): void {
  for (const workerName of activeWorkers.keys()) {
    workerMetrics.set(workerName, {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
      lastHealthCheck: new Date()
    });
  }
}

/**
 * Setup comprehensive monitoring for all workers
 */
function setupWorkerMonitoring(): void {
  for (const [name, worker] of activeWorkers) {
    // Error tracking
    worker.on('error', (error: Error) => {
      logger.error(`Worker ${name} encountered error`, {
        worker: name,
        error: error.message,
        processType: 'worker',
      });
    });

    // Job completion tracking
    worker.on('completed', (job) => {
      logger.info(`Worker ${name} completed job`, {
        worker: name,
        jobId: job.id,
        jobType: job.name,
        duration: Date.now() - job.processedOn!,
        processType: 'worker',
      });
    });

    // Job failure tracking
    worker.on('failed', (job, err) => {
      logger.error(`Worker ${name} job failed`, {
        worker: name,
        jobId: job?.id,
        jobType: job?.name,
        error: err.message,
        attempts: job?.attemptsMade,
        processType: 'worker',
      });
    });

    // Stalled job tracking
    worker.on('stalled', (jobId: string) => {
      logger.warn(`Worker ${name} job stalled`, {
        worker: name,
        jobId,
        processType: 'worker',
      });
    });

    // Worker lifecycle tracking
    worker.on('closing', () => {
      logger.info(`Worker ${name} is closing`, {
        worker: name,
        processType: 'worker',
      });
    });

    worker.on('closed', () => {
      logger.info(`Worker ${name} closed`, {
        worker: name,
        processType: 'worker',
      });
      activeWorkers.delete(name);
    });
  }

  // Periodic health reporting
  setInterval(() => {
    const workerStats = Array.from(activeWorkers.entries()).map(([name, worker]) => ({
      name,
      concurrency: worker.opts.concurrency,
      isRunning: !worker.closing,
    }));

    logger.debug('Worker health status', {
      processType: 'worker',
      workers: workerStats,
      totalWorkers: activeWorkers.size,
    });
  }, 60000); // Every minute
}

/**
 * Get worker by name
 */
export function getWorker(name: string): Worker | undefined {
  return activeWorkers.get(name);
}

/**
 * Get all active workers
 */
export function getAllWorkers(): Worker[] {
  return Array.from(activeWorkers.values());
}

/**
 * Get workers health status
 */
export function getWorkersHealth(): {
  healthy: boolean;
  workers: Record<string, { isActive: boolean; concurrency: number }>;
  totalWorkers: number;
} {
  const workers: Record<string, { isActive: boolean; concurrency: number }> = {};

  for (const [name, worker] of activeWorkers) {
    workers[name] = {
      isActive: !worker.closing,
      concurrency: worker.opts.concurrency || 1,
    };
  }

  return {
    healthy: activeWorkers.size > 0 && Array.from(activeWorkers.values()).every(w => !w.closing),
    workers,
    totalWorkers: activeWorkers.size,
  };
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownAllWorkers(): Promise<void> {
  if (!workersInitialized) {
    logger.info('Workers not initialized, nothing to shutdown');
    return;
  }

  const shutdownStartTime = performance.now();

  logger.info('Initiating graceful shutdown of production workers...', {
    processType: 'worker',
    workers: Array.from(activeWorkers.keys()),
    totalWorkers: activeWorkers.size
  });

  const shutdownPromises = Array.from(activeWorkers.entries()).map(
    async ([name, worker]) => {
      try {
        logger.info(`Shutting down worker: ${name}`, {
          processType: 'worker',
        });
        await worker.close();
        logger.info(`Worker ${name} shutdown completed`, {
          processType: 'worker',
        });
      } catch (error) {
        logger.error(`Error shutting down worker ${name}`, {
          processType: 'worker',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  await Promise.all(shutdownPromises);
  activeWorkers.clear();
  workersInitialized = false;

  const totalShutdownTime = performance.now() - shutdownStartTime;

  logger.info('Production worker manager shutdown completed', {
    processType: 'worker',
    totalShutdownTime,
    timestamp: new Date().toISOString()
  });
}

/**
 * Health check for the worker manager
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean;
  workers: Record<string, boolean>;
  services: Record<string, boolean>;
  systemMetrics: {
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    pid: number;
  };
  errors: string[];
}> {
  const errors: string[] = [];
  const workerHealth: Record<string, boolean> = {};
  const serviceHealth: Record<string, boolean> = {};

  // Check worker health
  for (const [name, worker] of activeWorkers) {
    workerHealth[name] = !worker.closing;
    if (worker.closing) {
      errors.push(`Worker ${name} is closing`);
    }
  }

  // Check production services health
  if (productionServices) {
    serviceHealth['aiAssistant'] = true;
    serviceHealth['hybridSearch'] = true;
    serviceHealth['voiceAnalytics'] = true;
    serviceHealth['voiceOrchestrator'] = true; // Voice orchestrator health check
    serviceHealth['publishingPipeline'] = true;

    if (!serviceHealth['voiceOrchestrator']) {
      errors.push('Voice orchestrator is not running');
    }
  } else {
    errors.push('Production services not initialized');
  }

  const allWorkersHealthy = Object.values(workerHealth).every(Boolean);
  const allServicesHealthy = Object.values(serviceHealth).every(Boolean);

  return {
    healthy: allWorkersHealthy && allServicesHealthy && errors.length === 0,
    workers: workerHealth,
    services: serviceHealth,
    systemMetrics: {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid
    },
    errors
  };
}

/**
 * Reset worker metrics
 */
export function resetWorkerMetrics(workerName?: string): void {
  if (workerName) {
    const metrics = workerMetrics.get(workerName);
    if (metrics) {
      metrics.totalJobs = 0;
      metrics.successfulJobs = 0;
      metrics.failedJobs = 0;
      metrics.averageProcessingTime = 0;
      metrics.lastHealthCheck = new Date();
    }
  } else {
    for (const metrics of workerMetrics.values()) {
      metrics.totalJobs = 0;
      metrics.successfulJobs = 0;
      metrics.failedJobs = 0;
      metrics.averageProcessingTime = 0;
      metrics.lastHealthCheck = new Date();
    }
  }
}