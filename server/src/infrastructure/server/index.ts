import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';

import { config, getCorsOrigins } from '../config';
import { initializeDatabase } from '../database';
import { createLogger } from '../../shared/utils.js';
import { metricsService } from '../monitoring';
import { authErrorHandler } from '../auth';

const logger = createLogger({ service: 'server' });

export interface ServerDependencies {
  // Will be injected when we create dependency injection container
}

export class SiteSeakServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private isShuttingDown = false;

  constructor(private dependencies: ServerDependencies = {}) {
    this.app = express();
    this.httpServer = new HTTPServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: getCorsOrigins(),
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing SiteSpeak server...');

    try {
      // Initialize database
      logger.info('Initializing database...');
      await initializeDatabase();
      logger.info('Database initialized successfully');

      // Setup middleware
      logger.info('Setting up middleware...');
      this.setupMiddleware();
      logger.info('Middleware setup completed');

      // Setup routes
      logger.info('Setting up routes...');
      await this.setupRoutes();
      logger.info('Routes setup completed');

      // Setup WebSocket handlers
      await this.setupWebSocket();

      // Setup error handling
      this.setupErrorHandling();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Server initialization completed');
    } catch (error) {
      logger.error('Failed to initialize server', { error });
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "https:", "data:"],
          connectSrc: ["'self'", "wss:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false, // Required for voice AI features
    }));

    // CORS configuration
    this.app.use(cors({
      origin: getCorsOrigins(),
      credentials: true,
      optionsSuccessStatus: 200,
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path.startsWith('/health') || req.path.startsWith('/api/health');
      },
    });

    this.app.use('/api', limiter);

    // Body parsing
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req, res, buf) => {
        // Store raw body for webhook verification
        (req as any).rawBody = buf;
      },
    }));
    
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request ID and correlation
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const correlationId = req.headers['x-correlation-id'] as string || 
                           req.headers['x-request-id'] as string ||
                           crypto.randomUUID();
      
      req.correlationId = correlationId;
      res.setHeader('X-Correlation-ID', correlationId);
      next();
    });

    // Request logging and metrics
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          correlationId: req.correlationId,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        };

        // Record metrics
        metricsService.recordHttpRequest(req.method, req.url, res.statusCode, duration);

        if (res.statusCode >= 400) {
          logger.warn('HTTP request completed with error', logData);
        } else {
          logger.info('HTTP request completed', logData);
        }
      });

      next();
    });
  }

  private async setupRoutes(): Promise<void> {
    // Health check and monitoring endpoints (before authentication)
    this.setupHealthRoutes();
    const { monitoringRoutes } = await import('../monitoring');
    this.app.use('/', monitoringRoutes);

    // Import and register all API routes
    const { authRoutes } = await import('../../modules/auth/api/routes');
    const { aiRoutes } = await import('../../modules/ai/api/routes');
    const { voiceRoutes } = await import('../../modules/voice/api/routes');
    const { siteContractRoutes } = await import('../../modules/sites/api/routes');

    // Register API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/ai', aiRoutes);
    this.app.use('/api/voice', voiceRoutes);
    this.app.use('/api/sites', siteContractRoutes);

    // API v1 info endpoint
    this.app.use('/api/v1', (req, res) => {
      res.json({ 
        message: 'SiteSpeak API v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          auth: '/api/auth',
          ai: '/api/ai',
          voice: '/api/voice',
          sites: '/api/sites',
          health: '/health',
          metrics: '/metrics',
        },
      });
    });

    // Serve static files (for published sites)
    if (config.NODE_ENV === 'production') {
      this.app.use('/sites', express.static(config.PUBLISHED_SITES_PATH));
    }

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path,
        method: req.method,
      });
    });
  }

  private setupHealthRoutes(): void {
    // Basic health check - always returns 200
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
      });
    });

    // Kubernetes liveness probe - process is alive
    this.app.get('/health/live', (req: Request, res: Response) => {
      if (this.isShuttingDown) {
        return res.status(503).json({
          status: 'shutting-down',
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Kubernetes readiness probe - ready to serve requests
    this.app.get('/health/ready', async (req: Request, res: Response) => {
      if (this.isShuttingDown) {
        return res.status(503).json({
          status: 'shutting-down',
          timestamp: new Date().toISOString(),
        });
      }

      try {
        // Check critical dependencies
        const checks = await this.performHealthChecks();
        const allHealthy = Object.values(checks).every(check => check.healthy);

        res.status(allHealthy ? 200 : 503).json({
          status: allHealthy ? 'ready' : 'not-ready',
          timestamp: new Date().toISOString(),
          checks,
        });
      } catch (error) {
        logger.error('Health check failed', { error });
        res.status(503).json({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
        });
      }
    });
  }

  private async performHealthChecks(): Promise<Record<string, any>> {
    const checks: Record<string, any> = {};

    // Database health check
    try {
      const { checkDatabaseHealth } = await import('../database');
      checks['database'] = await checkDatabaseHealth();
    } catch (error) {
      checks['database'] = {
        healthy: false,
        error: error instanceof Error ? error.message : 'Database check failed',
      };
    }

    // Redis health check (when implemented)
    // Redis health check (when implemented)
    checks['redis'] = { healthy: true, note: 'Not implemented yet' };

    // Memory check
    const memUsage = process.memoryUsage();
    checks['memory'] = {
      healthy: memUsage.heapUsed < 1000 * 1024 * 1024, // 1GB limit
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };

    return checks;
  }

  private async setupWebSocket(): Promise<void> {
    // Setup voice WebSocket handler
    const { VoiceWebSocketHandler } = await import('../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler');
    const voiceHandler = new VoiceWebSocketHandler(this.io);
    
    // Store voice handler for graceful shutdown
    (this as any).voiceHandler = voiceHandler;

    // Initialize Universal AI Assistant with voice handler
    const { UniversalAIAssistantService } = await import('../../modules/ai/application/UniversalAIAssistantService');
    const aiAssistant = new UniversalAIAssistantService({
      enableVoice: true,
      enableStreaming: true,
      defaultLocale: 'en-US',
      maxSessionDuration: 30 * 60 * 1000,
      responseTimeoutMs: 30000,
    }, voiceHandler);
    
    // Store AI assistant for graceful shutdown
    (this as any).aiAssistant = aiAssistant;

    // General WebSocket connection handling
    this.io.on('connection', (socket) => {
      logger.info('WebSocket connection established', { 
        socketId: socket.id,
        userAgent: socket.handshake.headers['user-agent'],
      });

      // Authentication will be added here
      // socket.use(socketAuthMiddleware);

      // General handlers for non-voice WebSocket events
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket connection disconnected', { 
          socketId: socket.id, 
          reason 
        });
      });

      socket.on('error', (error) => {
        logger.error('WebSocket error', { 
          socketId: socket.id, 
          error 
        });
      });
    });

    logger.info('WebSocket server setup completed with voice support');
  }

  private setupErrorHandling(): void {
    // Handle async errors
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      // Don't exit process in production, just log
      if (config.NODE_ENV !== 'production') {
        process.exit(1);
      }
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error });
      // Always exit on uncaught exceptions
      process.exit(1);
    });

    // Authentication error handler
    this.app.use(authErrorHandler());

    // Express error handler (must be last middleware)
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Express error handler', { 
        error,
        correlationId: req.correlationId,
        method: req.method,
        url: req.url,
      });

      // Don't leak error details in production
      const isDev = config.NODE_ENV === 'development';
      
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        correlationId: req.correlationId,
        ...(isDev && { 
          message: error.message,
          stack: error.stack,
        }),
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);
      this.isShuttingDown = true;

      try {
        // Cleanup AI assistant
        const aiAssistant = (this as any).aiAssistant;
        if (aiAssistant) {
          await aiAssistant.cleanup();
        }

        // End all voice sessions gracefully
        const voiceHandler = (this as any).voiceHandler;
        if (voiceHandler) {
          await voiceHandler.endAllSessions();
        }

        // Stop accepting new connections
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });

        // Close WebSocket connections
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });

        // Close database connections
        const { closeDatabase } = await import('../database');
        await closeDatabase();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(config.PORT, (error?: Error) => {
        if (error) {
          logger.error('Failed to start server', { error, port: config.PORT });
          reject(error);
        } else {
          logger.info('Server started successfully', {
            port: config.PORT,
            environment: config.NODE_ENV,
            pid: process.pid,
          });
          resolve();
        }
      });
    });
  }

  getApp(): Express {
    return this.app;
  }

  getHttpServer(): HTTPServer {
    return this.httpServer;
  }

  getSocketServer(): SocketIOServer {
    return this.io;
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: any; // Will be properly typed when auth is implemented
      rawBody?: Buffer;
    }
  }
}