/**
 * Worker Process Shared Services
 *
 * Initializes services needed for the worker process:
 * - Configuration
 * - Database connections
 * - Queue system with workers
 * - Background job processors
 * - AI processing services
 * - Telemetry and monitoring
 *
 * Excludes:
 * - HTTP server
 * - WebSocket handlers
 * - Real-time services
 */

import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'worker-shared-services' });

/**
 * Worker-specific shared services container
 */
export interface WorkerSharedServices {
  config: any;
  database: any;
  queues: {
    system: any; // Full queue system with workers
    workers: any; // Active worker instances
  };
  telemetry: any;
  ai: {
    crawler: any;
    indexer: any;
    processor: any;
  };
  publishing: any;
  analytics: any;
}

let workerSharedServices: WorkerSharedServices | null = null;

/**
 * Initialize shared services for worker process only
 */
export async function initializeWorkerSharedServices(): Promise<WorkerSharedServices> {
  if (workerSharedServices) {
    return workerSharedServices;
  }

  try {
    logger.info('Initializing worker process shared services...', {
      processType: 'worker',
    });

    // 1. Configuration (always first)
    logger.info('Step 1/7: Loading configuration...');
    const { config } = await import('../config/index.js');

    // 2. Telemetry (provides observability)
    logger.info('Step 2/7: Initializing telemetry...');
    const { initializeTelemetry, createTelemetryService } = await import('../../services/_shared/telemetry/index.js');
    await initializeTelemetry();
    const telemetry = createTelemetryService();

    // 3. Database (needed for job processing)
    logger.info('Step 3/7: Initializing database...');
    const { initializeDatabase } = await import('../database/index.js');
    await initializeDatabase();
    const { createDatabaseService } = await import('../../services/_shared/db/index.js');
    const database = createDatabaseService();

    // 4. Queue system with workers (FULL system for worker process)
    logger.info('Step 4/7: Initializing queue system with workers...');
    const { initializeQueueSystem, createQueueService } = await import('../../services/_shared/queues/index.js');
    await initializeQueueSystem(); // This starts the workers
    const queueSystem = createQueueService();

    // Get worker instances for monitoring
    const { getAllWorkers } = await import('../../services/_shared/queues/workers/index.js');
    const workers = getAllWorkers();

    // 5. AI processing services (background only)
    logger.info('Step 5/7: Initializing AI processing services...');
    const aiServices = await initializeAIServices();

    // 6. Publishing pipeline
    logger.info('Step 6/7: Initializing publishing pipeline...');
    const publishingService = await initializePublishingService();

    // 7. Analytics processing
    logger.info('Step 7/7: Initializing analytics processing...');
    const analyticsService = await initializeAnalyticsService();

    workerSharedServices = {
      config,
      database,
      queues: {
        system: queueSystem,
        workers,
      },
      telemetry,
      ai: aiServices,
      publishing: publishingService,
      analytics: analyticsService,
    };

    logger.info('Worker process shared services initialized successfully', {
      processType: 'worker',
      services: Object.keys(workerSharedServices),
      environment: config.NODE_ENV,
      workers: workers.length,
      includedServices: [
        'queue-workers',
        'background-processors',
        'ai-services',
        'publishing-pipeline',
        'analytics-processing',
      ],
    });

    return workerSharedServices;
  } catch (error) {
    logger.error('Failed to initialize worker process shared services', {
      processType: 'worker',
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
      } : error,
    });
    throw error;
  }
}

/**
 * Initialize AI processing services for worker process
 */
async function initializeAIServices() {
  try {
    // These would be actual implementations based on existing services
    // For now, creating placeholder structure

    const aiServices = {
      crawler: null, // CrawlerAdapter instance
      indexer: null, // IncrementalIndexer instance
      processor: null, // AI processing service instance
    };

    // TODO: Initialize actual AI services
    // const { CrawlerAdapter } = await import('../../modules/ai/application/services/CrawlerAdapter.js');
    // aiServices.crawler = new CrawlerAdapter();

    // const { IncrementalIndexer } = await import('../../modules/ai/application/services/IncrementalIndexer.js');
    // aiServices.indexer = new IncrementalIndexer();

    logger.info('AI services initialized for worker process', {
      services: Object.keys(aiServices),
    });

    return aiServices;
  } catch (error) {
    logger.error('Failed to initialize AI services', { error });
    throw error;
  }
}

/**
 * Initialize publishing pipeline for worker process
 */
async function initializePublishingService() {
  try {
    // TODO: Initialize actual publishing service
    // const { PublishingPipeline } = await import('../../modules/publishing/app/PublishingPipeline.js');
    // return new PublishingPipeline();

    logger.info('Publishing service initialized for worker process');
    return {}; // Placeholder
  } catch (error) {
    logger.error('Failed to initialize publishing service', { error });
    throw error;
  }
}

/**
 * Initialize analytics processing for worker process
 */
async function initializeAnalyticsService() {
  try {
    // TODO: Initialize actual analytics service
    // const { AnalyticsProcessor } = await import('../../services/_shared/analytics/index.js');
    // return new AnalyticsProcessor();

    logger.info('Analytics service initialized for worker process');
    return {}; // Placeholder
  } catch (error) {
    logger.error('Failed to initialize analytics service', { error });
    throw error;
  }
}

/**
 * Get initialized worker shared services
 */
export function getWorkerSharedServices(): WorkerSharedServices {
  if (!workerSharedServices) {
    throw new Error('Worker shared services not initialized. Call initializeWorkerSharedServices() first.');
  }
  return workerSharedServices;
}

/**
 * Shutdown worker process shared services
 */
export async function shutdownWorkerSharedServices(): Promise<void> {
  if (!workerSharedServices) {
    logger.info('Worker shared services not initialized, nothing to shutdown');
    return;
  }

  try {
    logger.info('Shutting down worker process shared services...', {
      processType: 'worker',
    });

    // Shutdown in reverse order

    // 7. Analytics service
    if (workerSharedServices.analytics?.shutdown) {
      await workerSharedServices.analytics.shutdown();
    }

    // 6. Publishing service
    if (workerSharedServices.publishing?.shutdown) {
      await workerSharedServices.publishing.shutdown();
    }

    // 5. AI services
    if (workerSharedServices.ai?.crawler?.shutdown) {
      await workerSharedServices.ai.crawler.shutdown();
    }
    if (workerSharedServices.ai?.indexer?.shutdown) {
      await workerSharedServices.ai.indexer.shutdown();
    }
    if (workerSharedServices.ai?.processor?.shutdown) {
      await workerSharedServices.ai.processor.shutdown();
    }

    // 4. Queue workers (important - stop processing first)
    const { shutdownWorkers } = await import('../../services/_shared/queues/workers/index.js');
    await shutdownWorkers();

    // 3. Queue system
    if (workerSharedServices.queues?.system?.shutdown) {
      await workerSharedServices.queues.system.shutdown();
    }

    // 2. Database connections (shared, so graceful close)
    if (workerSharedServices.database?.shutdown) {
      await workerSharedServices.database.shutdown();
    }

    // 1. Telemetry (last to capture shutdown metrics)
    if (workerSharedServices.telemetry?.shutdown) {
      await workerSharedServices.telemetry.shutdown();
    }

    workerSharedServices = null;

    logger.info('Worker process shared services shutdown completed', {
      processType: 'worker',
    });
  } catch (error) {
    logger.error('Error during worker process shared services shutdown', {
      processType: 'worker',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Health check for worker process shared services
 */
export function checkWorkerSharedServicesHealth(): {
  healthy: boolean;
  services: Record<string, any>;
  timestamp: Date;
  processType: string;
} {
  const timestamp = new Date();

  if (!workerSharedServices) {
    return {
      healthy: false,
      services: {},
      timestamp,
      processType: 'worker',
    };
  }

  try {
    const services = {
      config: { healthy: !!workerSharedServices.config },
      database: workerSharedServices.database?.health?.() || { healthy: true },
      queueSystem: workerSharedServices.queues?.system?.health?.() || { healthy: true },
      workers: {
        healthy: Array.isArray(workerSharedServices.queues?.workers) && workerSharedServices.queues.workers.length > 0,
        count: workerSharedServices.queues?.workers?.length || 0,
      },
      telemetry: workerSharedServices.telemetry?.health?.() || { healthy: true },
      ai: {
        crawler: workerSharedServices.ai?.crawler?.health?.() || { healthy: true },
        indexer: workerSharedServices.ai?.indexer?.health?.() || { healthy: true },
        processor: workerSharedServices.ai?.processor?.health?.() || { healthy: true },
      },
      publishing: workerSharedServices.publishing?.health?.() || { healthy: true },
      analytics: workerSharedServices.analytics?.health?.() || { healthy: true },
    };

    const healthy = Object.values(services).every(service => {
      if (service && typeof service === 'object') {
        if ('healthy' in service) {
          return service.healthy;
        }
        // For nested objects, check if all sub-services are healthy
        return Object.values(service).every(subService => {
          if (subService && typeof subService === 'object' && 'healthy' in subService) {
            return subService.healthy;
          }
          return true;
        });
      }
      return true;
    });

    return {
      healthy,
      services,
      timestamp,
      processType: 'worker',
    };
  } catch (error) {
    logger.error('Worker process health check failed', {
      processType: 'worker',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      healthy: false,
      services: {},
      timestamp,
      processType: 'worker',
    };
  }
}