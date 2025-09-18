/**
 * SiteSpeak Web Process Entry Point
 *
 * 12-Factor compliant web process that handles:
 * - HTTP API requests (Express)
 * - WebSocket connections (Socket.IO + Raw WebSocket for voice)
 * - Real-time voice processing (≤300ms requirement)
 * - Authentication and session management
 * - Request routing and middleware
 *
 * This process is optimized for:
 * - Low latency voice interactions
 * - Real-time WebSocket connections
 * - HTTP request/response cycles
 * - Immediate user feedback
 */

import { createLogger } from './src/shared/utils.js';

const logger = createLogger({ service: 'web-process' });

async function startWebProcess() {
  console.log('🌐 Starting SiteSpeak Web Process...');

  try {
    logger.info('Initializing web process configuration...');
    const { config } = await import('./src/infrastructure/config/index.js');

    logger.info('Starting SiteSpeak Web Process', {
      environment: config.NODE_ENV,
      port: config.PORT,
      version: process.env['npm_package_version'] || '1.0.0',
      processType: 'web',
      features: {
        voiceLatency: '≤300ms',
        realTimeWebSocket: 'enabled',
        httpAPI: 'enabled',
        backgroundJobs: 'disabled (worker process only)',
      },
    });

    // Initialize shared services (config, database, security, telemetry)
    // But NOT the queue workers - those run in worker process
    logger.info('Initializing shared services for web process...');
    const { initializeWebSharedServices } = await import('./src/infrastructure/services/web-shared.js');
    await initializeWebSharedServices();

    // Create and initialize web server (HTTP + WebSocket)
    logger.info('Creating web server...');
    const { SiteSeakWebServer } = await import('./src/infrastructure/server/web-server.js');
    const webServer = new SiteSeakWebServer();

    logger.info('Initializing web server...');
    await webServer.initialize();

    // Start listening for connections
    await webServer.start();

    logger.info('🌐 SiteSpeak Web Process started successfully!', {
      port: config.PORT,
      environment: config.NODE_ENV,
      processType: 'web',
      endpoints: {
        api: `http://localhost:${config.PORT}/api`,
        health: `http://localhost:${config.PORT}/health`,
        metrics: `http://localhost:${config.PORT}/metrics`,
        voice: `ws://localhost:${config.PORT}/voice`,
        voiceRaw: `ws://localhost:${config.PORT}/voice-ws`,
      },
      capabilities: {
        voiceLatency: '≤300ms first token',
        webSockets: 'Socket.IO + Raw WebSocket',
        realTimeAI: 'OpenAI Realtime API',
        authentication: 'JWT with refresh tokens',
        multiTenant: 'Isolated per tenant',
      },
    });

    // Setup health monitoring for web process
    setupWebProcessMonitoring();

  } catch (error) {
    logger.error('Failed to start SiteSpeak Web Process', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
      processType: 'web',
    });

    process.exit(1);
  }
}

/**
 * Setup monitoring and health checks specific to web process
 */
function setupWebProcessMonitoring() {
  // Monitor web process specific metrics
  const monitoringInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    logger.debug('Web process health check', {
      processType: 'web',
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

// Handle unhandled promise rejections (web process specific)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection in Web Process', {
    reason,
    promise,
    processType: 'web',
  });

  // In production, we might want to exit
  if (process.env['NODE_ENV'] === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions (web process specific)
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in Web Process', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    processType: 'web',
  });

  // Always exit on uncaught exceptions
  process.exit(1);
});

// Graceful shutdown handling
async function gracefulShutdown(signal: string) {
  logger.info(`Web process received ${signal}, starting graceful shutdown...`);

  try {
    const { shutdownWebSharedServices } = await import('./src/infrastructure/services/web-shared.js');
    await shutdownWebSharedServices();

    logger.info('Web process graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during web process shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the web process
console.log('🔍 Checking if should start web process...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

console.log('✅ Starting web process...');
startWebProcess().catch((error) => {
  console.error('Failed to start web process:', error);
  process.exit(1);
});