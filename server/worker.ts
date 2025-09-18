#!/usr/bin/env node
/**
 * SiteSpeak Worker Process Entry Point
 *
 * 12-Factor App compliant worker process that handles:
 * - Background job processing (BullMQ)
 * - Knowledge base crawling and indexing
 * - AI processing (non-real-time)
 * - Analytics aggregation
 * - File processing and uploads
 * - Email/notification sending
 * - Database maintenance tasks
 * - Cache warming and optimization
 *
 * Does NOT handle:
 * - HTTP requests (handled by web process)
 * - WebSocket connections (handled by web process)
 * - Real-time voice processing (handled by web process)
 * - User-facing interactions (handled by web process)
 *
 * Start with: npm run dev:worker or node worker.js
 */

import { createLogger } from './src/shared/utils.js';

const logger = createLogger({ service: 'worker-process' });

async function startWorkerProcess() {
  console.log('⚙️  Starting SiteSpeak Worker Process...');

  try {
    logger.info('Initializing worker process configuration...');
    const { config } = await import('./src/infrastructure/config/index.js');

    logger.info('Starting SiteSpeak Worker Process', {
      environment: config.NODE_ENV,
      version: process.env['npm_package_version'] || '1.0.0',
      processType: 'worker',
      features: {
        backgroundJobs: 'enabled',
        knowledgeBaseCrawling: 'enabled',
        aiProcessing: 'enabled',
        analyticsAggregation: 'enabled',
        httpAPI: 'disabled (web process only)',
        realTimeWebSocket: 'disabled (web process only)',
      },
    });

    // Initialize shared services for worker process (database, redis, etc.)
    // But NOT the HTTP server or WebSocket connections
    logger.info('Initializing shared services for worker process...');
    const { initializeWorkerSharedServices } = await import('./src/infrastructure/services/worker-shared.js');
    await initializeWorkerSharedServices();

    // Initialize all background workers
    logger.info('Initializing background workers...');
    const { initializeAllWorkers } = await import('./src/infrastructure/workers/worker-manager.js');
    await initializeAllWorkers();

    logger.info('⚙️  SiteSpeak Worker Process started successfully!', {
      environment: config.NODE_ENV,
      processType: 'worker',
      capabilities: {
        jobProcessing: 'BullMQ with Redis',
        knowledgeBase: 'Auto-crawling and indexing',
        aiProcessing: 'OpenAI API integration',
        analytics: 'Real-time data aggregation',
        fileProcessing: 'Upload and conversion',
        backgroundTasks: 'Scheduled maintenance',
      },
      workers: {
        crawler: 'Knowledge base crawler',
        ai: 'AI processing pipeline',
        analytics: 'Analytics aggregation',
        fileProcessor: 'File upload processing',
        emailSender: 'Email notifications',
        maintenance: 'Database cleanup',
      },
    });

    // Setup health monitoring for worker process
    setupWorkerProcessMonitoring();

  } catch (error) {
    logger.error('Failed to start SiteSpeak Worker Process', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
      processType: 'worker',
    });

    process.exit(1);
  }
}

/**
 * Setup monitoring and health checks specific to worker process
 */
function setupWorkerProcessMonitoring() {
  // Monitor worker process specific metrics
  const monitoringInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    logger.debug('Worker process health check', {
      processType: 'worker',
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      uptime: `${Math.round(process.uptime())}s`,
    });
  }, 60000); // Every minute

  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    clearInterval(monitoringInterval);
  });
  process.on('SIGINT', () => {
    clearInterval(monitoringInterval);
  });
}

// Handle unhandled promise rejections (worker process specific)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection in Worker Process', {
    reason,
    promise,
    processType: 'worker',
  });

  // In production, we might want to exit
  if (process.env['NODE_ENV'] === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions (worker process specific)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in Worker Process', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    processType: 'worker',
  });

  // Always exit on uncaught exceptions
  process.exit(1);
});

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  logger.info(`Worker process received ${signal}, starting graceful shutdown...`);

  try {
    // Shutdown all workers gracefully
    const { shutdownAllWorkers } = await import('./src/infrastructure/workers/worker-manager.js');
    await shutdownAllWorkers();

    // Shutdown shared services
    const { shutdownWorkerSharedServices } = await import('./src/infrastructure/services/worker-shared.js');
    await shutdownWorkerSharedServices();

    logger.info('Worker process graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker process shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the worker process
console.log('🔍 Checking if should start worker process...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

console.log('✅ Starting worker process...');
startWorkerProcess().catch((error) => {
  console.error('Failed to start worker process:', error);
  process.exit(1);
});