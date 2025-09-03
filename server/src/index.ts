console.log('📁 Loading server/src/index.ts...');
import { createLogger } from './shared/utils.js';

const logger = createLogger({ service: 'main' });

/**
 * SiteSpeak Server Entry Point
 * 
 * Modern hexagonal architecture with comprehensive features:
 * - JWT Authentication & Session Management
 * - Voice AI with WebSocket real-time communication
 * - AI Services (Chat, Embeddings, Knowledge Base)
 * - Site Contract & Manifest Generation
 * - Health Monitoring & Metrics
 * - Multi-tenant isolation
 */
async function startServer() {
  console.log('🚀 Starting SiteSpeak server...');
  try {
    logger.info('Loading configuration...');
    const { config } = await import('./infrastructure/config/index.ts');
    logger.info('Configuration loaded successfully');
    
    logger.info('Starting SiteSpeak server...', {
      environment: config.NODE_ENV,
      port: config.PORT,
      version: process.env['npm_package_version'] || '1.0.0',
    });

    // Create and initialize server
    const { SiteSeakServer } = await import('./infrastructure/server/index.ts');
    const server = new SiteSeakServer();
    logger.info('Initializing server...');
    await server.initialize();
    logger.info('Server initialization completed');

    // Start listening
    await server.start();

    logger.info('🚀 SiteSpeak server started successfully!', {
      port: config.PORT,
      environment: config.NODE_ENV,
      endpoints: {
        api: `http://localhost:${config.PORT}/api`,
        health: `http://localhost:${config.PORT}/health`,
        metrics: `http://localhost:${config.PORT}/metrics`,
        voice: `ws://localhost:${config.PORT}/voice`,
      },
      features: {
        authentication: 'JWT with refresh tokens',
        voiceAI: 'OpenAI Whisper + TTS with WebSocket',
        knowledgeBase: 'pgvector with semantic search',
        siteContracts: 'JSON-LD + ARIA + Action Manifests',
        monitoring: 'Health checks + Prometheus metrics',
      },
    });

    // Log important configuration
    logger.info('Server configuration loaded', {
      database: config.DATABASE_URL ? 'Configured' : 'Missing',
      redis: config.REDIS_URL ? 'Configured' : 'Missing',
      openai: config.OPENAI_API_KEY ? 'Configured' : 'Missing',
      jwt: config.JWT_SECRET ? 'Configured' : 'Missing',
      cors: config.CORS_ORIGINS,
      rateLimit: {
        max: config.RATE_LIMIT_MAX,
        windowMs: config.RATE_LIMIT_WINDOW_MS,
      },
    });

  } catch (error) {
    logger.error('Failed to start SiteSpeak server', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    });
    
    // Exit with error code
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason,
    promise,
  });
  
  // In production, we might want to exit
      if (process.env['NODE_ENV'] === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
  });
  
  // Always exit on uncaught exceptions
  process.exit(1);
});

// Start the server
console.log('🔍 Checking if should start server...');
console.log('import.meta.url:', import.meta.url);
console.log('process.argv[1]:', process.argv[1]);

// Always start the server when this module is loaded
console.log('✅ Starting server...');
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});