/**
 * Queue Service - Main exports and initialization
 * 
 * Provides unified interface to BullMQ infrastructure with
 * proper initialization and graceful shutdown.
 */

// Re-export factory functions
export {
  makeQueue,
  makeWorker,
  shutdownQueues,
  checkQueueHealth,
  registerJobSchema,
} from './factory.js';

// Re-export conventions
export {
  JobTypes,
  RetryPolicies,
  JobPriority,
  QueueNames,
  QueueConfigs,
  generateIdempotencyKey,
  registerAllJobSchemas,
} from './conventions.js';

// Re-export types
export type {
  JobType,
  AIProcessQueryJob,
  AIGenerateEmbeddingJob,
  CrawlerIndexSiteJob,
  VoiceSynthesizeTTSJob,
  AnalyticsTrackEventJob,
} from './conventions.js';

// Re-export BullMQ types
export type { Queue, Worker, Job } from 'bullmq';

import { Queue, Worker } from 'bullmq';
import { makeQueue, makeWorker, shutdownQueues } from './factory';
import { QueueNames, QueueConfigs, registerAllJobSchemas } from './conventions';
import { logger } from '../telemetry/logger';

/**
 * Global queue instances registry
 */
const queueInstances = new Set<Queue | Worker>();

/**
 * Initialize queue system with default queues
 */
export async function initializeQueueSystem(): Promise<void> {
  try {
    logger.info('Initializing queue system...');
    
    // Register all job schemas for validation
    registerAllJobSchemas();
    
    // Create default queues
    const queues = Object.entries(QueueNames).map(([name, queueName]) => {
      const config = QueueConfigs[queueName];
      const queue = makeQueue(queueName, {
        defaultJobOptions: {
          priority: config.priority,
        },
      });
      
      queueInstances.add(queue);
      return { name, queue };
    });
    
    logger.info(`Created ${queues.length} queues:`, {
      queues: queues.map(q => q.name),
    });
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    logger.info('Queue system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize queue system:', error);
    throw error;
  }
}

/**
 * Add queue/worker instance to shutdown registry
 */
export function registerQueueInstance(
  instance: Queue | Worker
): void {
  queueInstances.add(instance);
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down queue system...`);
    
    try {
      await shutdownQueues(Array.from(queueInstances));
      logger.info('Queue system shutdown completed');
    } catch (error) {
      logger.error('Error during queue shutdown:', error);
    }
    
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('beforeExit', () => shutdown('beforeExit'));
}

/**
 * Create queue service for dependency injection
 */
export const createQueueService = () => {
  // Create default queues
  const queues = {
    critical: makeQueue(QueueNames.CRITICAL),
    ai: makeQueue(QueueNames.AI),
    crawler: makeQueue(QueueNames.CRAWLER),
    voice: makeQueue(QueueNames.VOICE),
    analytics: makeQueue(QueueNames.ANALYTICS),
    maintenance: makeQueue(QueueNames.MAINTENANCE),
  };
  
  // Register all queues for shutdown
  Object.values(queues).forEach(queue => {
    registerQueueInstance(queue);
  });
  
  return {
    queues,
    makeQueue,
    makeWorker,
    registerInstance: registerQueueInstance,
  };
};

export type QueueService = ReturnType<typeof createQueueService>;