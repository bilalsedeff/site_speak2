/**
 * BullMQ Factory - Pre-configured Queue/Worker/Scheduler factories
 * 
 * Creates BullMQ instances with sensible defaults, metrics hooks,
 * and proper Redis connection management.
 */

import { Queue, Worker, WorkerOptions, QueueOptions, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';
import { z } from 'zod';

/**
 * Create Redis connection for BullMQ
 */
function createRedisConnection(): Redis {
  return new Redis(cfg.REDIS_URL, {
    family: parseInt(cfg.REDIS_FAMILY),
    connectTimeout: cfg.REDIS_CONNECT_TIMEOUT,
    lazyConnect: cfg.REDIS_LAZY_CONNECT,
    maxRetriesPerRequest: cfg.REDIS_MAX_RETRIES_PER_REQUEST,
    enableReadyCheck: false,
  });
}

/**
 * Base queue options with our defaults
 */
const baseQueueOptions: Partial<QueueOptions> = {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: cfg.QUEUE_DEFAULT_ATTEMPTS,
    backoff: {
      type: cfg.QUEUE_BACKOFF_TYPE,
      delay: cfg.QUEUE_BACKOFF_DELAY,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    delay: cfg.QUEUE_DEFAULT_DELAY,
  },
};

/**
 * Base worker options with our defaults
 */
const baseWorkerOptions: Partial<WorkerOptions> = {
  connection: createRedisConnection(),
  concurrency: cfg.QUEUE_CONCURRENCY,
  stalledInterval: cfg.QUEUE_STALLED_INTERVAL,
  maxStalledCount: cfg.QUEUE_MAX_STALLED_COUNT,
  limiter: {
    max: cfg.QUEUE_LIMITER_MAX,
    duration: cfg.QUEUE_LIMITER_DURATION,
  },
};

/**
 * Job payload schema registry
 */
const jobSchemas = new Map<string, z.ZodSchema>();

/**
 * Register a job payload schema for validation
 */
export function registerJobSchema<T extends z.ZodSchema>(
  jobType: string,
  schema: T
): void {
  jobSchemas.set(jobType, schema);
}

/**
 * Validate job payload against registered schema
 */
function validateJobPayload(jobType: string, data: any): any {
  const schema = jobSchemas.get(jobType);
  if (!schema) {
    logger.warn(`No schema registered for job type: ${jobType}`);
    return data;
  }

  try {
    return schema.parse(data);
  } catch (error) {
    logger.error(`Job payload validation failed for ${jobType}:`, error);
    throw new Error(`Invalid job payload for ${jobType}: ${error}`);
  }
}

/**
 * Create a Queue with our defaults and observability hooks
 */
export function makeQueue(
  name: string,
  options: Partial<QueueOptions> = {}
): Queue {
  const mergedOptions: QueueOptions = {
    ...baseQueueOptions,
    ...options,
    connection: options.connection || createRedisConnection(),
  };

  const queue = new Queue(name, mergedOptions);

  // Add observability hooks
  queue.on('waiting', (job: Job) => {
    logger.debug(`Job ${job.id} waiting in queue ${name}`, {
      jobId: job.id,
      queue: name,
      jobType: job.name,
    });
  });

  queue.on('active' as any, (job: Job) => {
    logger.info(`Job ${job.id} started in queue ${name}`, {
      jobId: job.id,
      queue: name,
      jobType: job.name,
    });
  });

  queue.on('completed' as any, (job: Job, result: any) => {
    logger.info(`Job ${job.id} completed in queue ${name}`, {
      jobId: job.id,
      queue: name,
      jobType: job.name,
      duration: Date.now() - job.timestamp,
      result: cfg.DETAILED_LOGGING ? result : undefined,
    });
  });

  queue.on('failed' as any, (job: Job | undefined, error: Error) => {
    logger.error(`Job ${job?.id || 'unknown'} failed in queue ${name}`, {
      jobId: job?.id,
      queue: name,
      jobType: job?.name,
      error: error.message,
      attempts: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
    });
  });

  queue.on('stalled' as any, (jobId: string) => {
    logger.warn(`Job ${jobId} stalled in queue ${name}`, {
      jobId,
      queue: name,
    });
  });

  queue.on('error', (error: Error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  return queue;
}

/**
 * Create a Worker with our defaults and observability hooks
 */
export function makeWorker<T = any, R = any>(
  name: string,
  processor: (job: Job<T, R>) => Promise<R>,
  options: Partial<WorkerOptions> = {}
): Worker<T, R> {
  const mergedOptions = {
    ...baseWorkerOptions,
    ...options,
  } as WorkerOptions;

  // Wrap processor with validation and error handling
  const wrappedProcessor = async (job: Job<T, R>): Promise<R> => {
    const startTime = Date.now();
    
    try {
      // Validate job payload if schema is registered
      const validatedData = validateJobPayload(job.name, job.data);
      job.data = validatedData;

      // Add job context to logger
      logger.info(`Processing job ${job.id} of type ${job.name}`, {
        jobId: job.id,
        jobType: job.name,
        queue: name,
        tenantId: (job.data as any)?.tenantId,
        attempts: job.attemptsMade + 1,
      });

      // Execute the actual processor
      const result = await processor(job);

      const duration = Date.now() - startTime;
      logger.info(`Job ${job.id} processed successfully`, {
        jobId: job.id,
        jobType: job.name,
        queue: name,
        duration,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Job ${job.id} processing failed`, {
        jobId: job.id,
        jobType: job.name,
        queue: name,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        attempts: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts,
      });

      // Re-throw to let BullMQ handle retries
      throw error;
    }
  };

  const worker = new Worker<T, R>(name, wrappedProcessor, mergedOptions);

  // Add worker-level event handlers
  worker.on('active', (job: Job<T, R>) => {
    logger.debug(`Worker ${name} started processing job ${job.id}`);
  });

  worker.on('completed', (job: Job<T, R>) => {
    logger.debug(`Worker ${name} completed job ${job.id}`);
  });

  worker.on('failed', (job: Job<T, R> | undefined, error: Error) => {
    logger.error(`Worker ${name} job ${job?.id || 'unknown'} failed:`, error);
  });

  worker.on('error', (error: Error) => {
    logger.error(`Worker ${name} error:`, error);
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn(`Worker ${name} job ${jobId} stalled`);
  });

  return worker;
}

// QueueScheduler is deprecated in BullMQ v4+
// Use delayed jobs and cron patterns directly in queues instead

/**
 * Graceful shutdown helper for all BullMQ instances
 */
export async function shutdownQueues(
  instances: Array<Queue | Worker>
): Promise<void> {
  logger.info('Shutting down BullMQ instances...');

  const shutdownPromises = instances.map(async (instance) => {
    try {
      if (instance instanceof Worker) {
        await instance.close();
      } else if (instance instanceof Queue) {
        await instance.close();
      }
    } catch (error) {
      logger.error('Error shutting down BullMQ instance:', error);
    }
  });

  await Promise.all(shutdownPromises);
  logger.info('BullMQ shutdown completed');
}

/**
 * Health check for queue system
 */
export async function checkQueueHealth(queue: Queue): Promise<{
  healthy: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const counts = await queue.getJobCounts();
    
    return {
      healthy: true,
      waiting: counts['waiting'] || 0,
      active: counts['active'] || 0,
      completed: counts['completed'] || 0,
      failed: counts['failed'] || 0,
      delayed: counts['delayed'] || 0,
    };
  } catch (error) {
    logger.error('Queue health check failed:', error);
    return {
      healthy: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };
  }
}