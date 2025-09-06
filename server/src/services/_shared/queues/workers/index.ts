/**
 * Worker Manager - Initialize and manage all queue workers
 * 
 * Centralizes worker lifecycle management and provides
 * a single entry point for starting all background processors.
 */

import { Worker } from 'bullmq';
import { logger } from '../../telemetry/logger.js';

// Import worker factories
import createCrawlerWorker from './crawler-worker.js';

/**
 * Active worker instances registry
 */
const activeWorkers = new Map<string, Worker>();

/**
 * Initialize all queue workers
 */
export async function initializeWorkers(): Promise<void> {
  try {
    logger.info('Initializing queue workers...');

    // Start crawler worker
    const crawlerWorker = createCrawlerWorker();
    activeWorkers.set('crawler', crawlerWorker);

    // TODO: Add other workers as they're implemented
    // const aiWorker = createAIWorker();
    // activeWorkers.set('ai', aiWorker);
    
    // const voiceWorker = createVoiceWorker();
    // activeWorkers.set('voice', voiceWorker);
    
    // const analyticsWorker = createAnalyticsWorker();
    // activeWorkers.set('analytics', analyticsWorker);

    logger.info(`Started ${activeWorkers.size} queue workers:`, {
      workers: Array.from(activeWorkers.keys())
    });

    // Setup health monitoring
    setupWorkerHealthMonitoring();
    
    logger.info('Queue workers initialization completed');
  } catch (error) {
    logger.error('Failed to initialize queue workers:', error);
    throw error;
  }
}

/**
 * Get active worker instance by name
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
 * Setup health monitoring for all workers
 */
function setupWorkerHealthMonitoring(): void {
  // Monitor worker health and restart if needed
  for (const [name, worker] of activeWorkers) {
    // Track worker errors
    worker.on('error', (error: Error) => {
      logger.error(`Worker ${name} encountered error:`, error);
      
      // TODO: Implement worker restart logic if needed
      // For now, just log the error
    });

    // Track stalled jobs
    worker.on('stalled', (jobId: string) => {
      logger.warn(`Worker ${name} job ${jobId} stalled`);
    });

    // Track worker lifecycle
    worker.on('closing', () => {
      logger.info(`Worker ${name} is closing`);
    });

    worker.on('closed', () => {
      logger.info(`Worker ${name} closed`);
      activeWorkers.delete(name);
    });

    // Track job completion rates
    let completedJobs = 0;
    let failedJobs = 0;

    worker.on('completed', () => {
      completedJobs++;
      if (completedJobs % 10 === 0) {
        logger.debug(`Worker ${name} completed ${completedJobs} jobs`);
      }
    });

    worker.on('failed', () => {
      failedJobs++;
      logger.warn(`Worker ${name} failed jobs: ${failedJobs}`);
    });
  }

  // Periodic health check
  setInterval(() => {
    const workerStats = Array.from(activeWorkers.entries()).map(([name, worker]) => ({
      name,
      concurrency: worker.opts.concurrency,
      isActive: true, // Worker is in active registry
    }));

    logger.debug('Worker health status:', { workers: workerStats });
  }, 60000); // Check every minute
}

/**
 * Gracefully shutdown all workers
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info('Shutting down queue workers...');

  const shutdownPromises = Array.from(activeWorkers.entries()).map(
    async ([name, worker]) => {
      try {
        logger.info(`Shutting down worker: ${name}`);
        await worker.close();
        logger.info(`Worker ${name} shutdown completed`);
      } catch (error) {
        logger.error(`Error shutting down worker ${name}:`, error);
      }
    }
  );

  await Promise.all(shutdownPromises);
  activeWorkers.clear();
  
  logger.info('All workers shutdown completed');
}

/**
 * Check if workers are healthy
 */
export function getWorkersHealth(): {
  healthy: boolean;
  workers: Record<string, { isActive: boolean; concurrency: number }>;
} {
  const workers: Record<string, { isActive: boolean; concurrency: number }> = {};

  for (const [name, worker] of activeWorkers) {
    workers[name] = {
      isActive: true, // Worker is registered and active
      concurrency: worker.opts.concurrency || 1,
    };
  }

  return {
    healthy: activeWorkers.size > 0,
    workers,
  };
}

// Export worker factories for direct use if needed
export { createCrawlerWorker };