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
import { createLogger } from '../../../../shared/utils/index.js';
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
  private _isShuttingDown = false;

  constructor(private _dependencies: ServerDependencies = {}) {
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

      // Initialize analytics service
      logger.info('Initializing analytics service...');
      const { initializeAnalytics } = await import('../../services/_shared/analytics/index.js');
      await initializeAnalytics();
      logger.info('Analytics service initialized successfully');

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
      verify: (req, _res, buf) => {
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
    const { monitoringRoutes } = await import('../monitoring');
    this.app.use('/', monitoringRoutes);

    // Setup API Gateway with comprehensive middleware stack
    logger.info('Setting up API Gateway...');
    try {
      const { setupAPIGatewayIntegration } = await import('../../services/api-gateway/integration');
      
      await setupAPIGatewayIntegration(this.app, {
        enableAuth: true,
        enableRateLimit: true,
        enableCors: true,
        enableLegacyRoutes: true, // Maintain backward compatibility
        corsOrigins: getCorsOrigins(),
        openAPIConfig: {
          baseUrl: config.NODE_ENV === 'production' 
            ? 'https://api.sitespeak.ai' 
            : `http://localhost:${config.PORT}`,
          title: 'SiteSpeak API Gateway',
          description: 'Comprehensive API for SiteSpeak voice-first website builder with AI assistant capabilities',
          version: process.env['npm_package_version'] || '1.0.0'
        },
        healthChecks: {
          includeDetailedHealth: true,
          includeLegacyHealth: true
        }
      });
      
      logger.info('API Gateway setup completed successfully');
    } catch (error) {
      logger.error('Failed to setup API Gateway', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }

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
    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
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
      
      // CRITICAL: Set drain mode immediately so readiness probes return 503
      // This removes the pod from load balancer service endpoints
      this._isShuttingDown = true;
      metricsService.setDraining(true);
      
      logger.info('Drain mode enabled - readiness probes will return 503');

      try {
        // Give a small delay for load balancer to receive 503 responses
        // and stop sending new traffic to this instance
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Cleanup AI assistant
        const aiAssistant = (this as any).aiAssistant;
        if (aiAssistant) {
          logger.info('Cleaning up AI assistant...');
          await aiAssistant.cleanup();
        }

        // End all voice sessions gracefully
        const voiceHandler = (this as any).voiceHandler;
        if (voiceHandler) {
          logger.info('Ending voice sessions...');
          await voiceHandler.endAllSessions();
        }

        // Stop accepting new connections but allow existing ones to finish
        const gracefulTimeout = 30000; // 30 seconds for in-flight requests
        
        logger.info(`Stopping HTTP server with ${gracefulTimeout}ms grace period...`);
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });

        // Close WebSocket connections gracefully
        logger.info('Closing WebSocket connections...');
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });

        // Wait for in-flight requests to complete or timeout
        await new Promise((resolve, _reject) => {
          const timeout = setTimeout(() => {
            logger.warn('Graceful shutdown timeout reached, forcing exit');
            resolve(void 0);
          }, gracefulTimeout);

          // Clear timeout if server closes naturally
          this.httpServer.on('close', () => {
            clearTimeout(timeout);
            resolve(void 0);
          });
        });

        // Close database connections
        logger.info('Closing database connections...');
        const { closeDatabase } = await import('../database');
        await closeDatabase();

        // Cleanup metrics service
        logger.info('Cleaning up metrics service...');
        metricsService.cleanup();

        logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions during shutdown
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
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

// Express Request interface extensions moved to server/src/types/express.d.ts