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
  // TODO: Create AI worker when implemented
  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.AI, async (job) => {
    logger.info('Processing AI job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    // TODO: Implement AI job processing
    switch (job.name) {
      case 'generate-embedding':
        // Handle embedding generation
        break;
      case 'process-query':
        // Handle AI query processing
        break;
      default:
        logger.warn('Unknown AI job type', { jobType: job.name });
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
  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.VOICE, async (job) => {
    logger.info('Processing voice job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    // TODO: Implement voice job processing
    switch (job.name) {
      case 'synthesize-tts':
        // Handle TTS synthesis
        break;
      case 'process-audio':
        // Handle audio processing
        break;
      default:
        logger.warn('Unknown voice job type', { jobType: job.name });
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
  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.ANALYTICS, async (job) => {
    logger.info('Processing analytics job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    // TODO: Implement analytics job processing
    switch (job.name) {
      case 'track-event':
        // Handle event tracking
        break;
      case 'generate-report':
        // Handle report generation
        break;
      default:
        logger.warn('Unknown analytics job type', { jobType: job.name });
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
  const { makeWorker } = await import('../../services/_shared/queues/factory.js');
  const { QueueNames } = await import('../../services/_shared/queues/conventions.js');

  const worker = makeWorker(QueueNames.CRITICAL, async (job) => {
    logger.info('Processing publishing job', {
      jobId: job.id,
      jobType: job.name,
      data: job.data,
    });

    // TODO: Implement publishing job processing
    switch (job.name) {
      case 'publish-site':
        // Handle site publishing
        break;
      case 'update-cdn':
        // Handle CDN updates
        break;
      default:
        logger.warn('Unknown publishing job type', { jobType: job.name });
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

    // TODO: Implement maintenance job processing
    switch (job.name) {
      case 'cleanup-temp-files':
        // Handle temp file cleanup
        break;
      case 'optimize-database':
        // Handle database optimization
        break;
      case 'archive-old-data':
        // Handle data archiving
        break;
      default:
        logger.warn('Unknown maintenance job type', { jobType: job.name });
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

  logger.info('Shutting down all workers...', {
    processType: 'worker',
    workers: Array.from(activeWorkers.keys()),
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

  logger.info('All workers shutdown completed', {
    processType: 'worker',
  });
}