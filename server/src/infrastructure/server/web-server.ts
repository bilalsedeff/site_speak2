/**
 * SiteSpeak Web Server
 *
 * Optimized web server for the web process that handles:
 * - HTTP API requests
 * - WebSocket connections (Socket.IO + Raw WebSocket)
 * - Real-time voice processing (≤300ms requirement)
 * - Authentication and session management
 *
 * Excludes background job processing (handled by worker process)
 */

import express, { Express } from 'express';
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, getCorsOrigins } from '../config/index.js';
import { createLogger } from '../../shared/utils.js';
import { getWebSharedServices } from '../services/web-shared.js';

const logger = createLogger({ service: 'web-server' });

export class SiteSeakWebServer {
  private app: Express;
  private httpServer: HTTPServer;
  private io: SocketIOServer;
  private _isShuttingDown = false;

  constructor() {
    this.app = express();
    this.httpServer = new HTTPServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: getCorsOrigins(),
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Suppress TypeScript warnings for architectural placeholders
    void this._isShuttingDown; // Will be used for graceful shutdown logic
  }

  async initialize(): Promise<void> {
    logger.info('Initializing SiteSpeak Web Server...', {
      processType: 'web',
    });

    try {
      // Ensure web shared services are initialized
      const sharedServices = getWebSharedServices();
      logger.info('Web shared services available', {
        services: Object.keys(sharedServices),
      });

      // Setup middleware (web-optimized)
      logger.info('Setting up web middleware...');
      this.setupWebMiddleware();

      // Setup routes (API only, no background job routes)
      logger.info('Setting up web routes...');
      await this.setupWebRoutes();

      // Setup WebSocket handlers (voice + general)
      logger.info('Setting up WebSocket handlers...');
      await this.setupWebSockets();

      // Setup error handling
      this.setupErrorHandling();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('Web server initialization completed', {
        processType: 'web',
        capabilities: [
          'HTTP API',
          'WebSocket (Socket.IO)',
          'Raw WebSocket (voice)',
          'Real-time AI',
          'Authentication',
          'Multi-tenant',
        ],
      });
    } catch (error) {
      logger.error('Failed to initialize web server', {
        processType: 'web',
        error,
      });
      throw error;
    }
  }

  private setupWebMiddleware(): void {
    // Import and reuse the existing middleware setup
    // but optimized for web process only

    // Security middleware
    this.setupSecurityMiddleware();

    // Request parsing and logging
    this.setupRequestMiddleware();

    // Authentication middleware
    this.setupAuthMiddleware();
  }

  private setupSecurityMiddleware(): void {
    // Import and configure security middleware from API Gateway
    // Web-optimized security headers and CORS
    this.app.use((_req, res, next) => {
      // Security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

      // Web process specific headers
      res.setHeader('X-Process-Type', 'web');
      res.setHeader('X-Service', 'sitespeak-web');

      next();
    });

    logger.debug('Security middleware configured for web process');
  }

  private setupRequestMiddleware(): void {
    // Import and configure request middleware for web process
    // Express JSON and URL encoded parsing
    this.app.use(express.json({
      limit: '10mb',
      type: ['application/json', 'application/vnd.api+json']
    }));

    this.app.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    // Request correlation ID middleware
    this.app.use((req, res, next) => {
      const correlationId = req.headers['x-correlation-id'] as string ||
                           `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      (req as any).correlationId = correlationId;
      res.setHeader('X-Correlation-ID', correlationId);

      next();
    });

    // Request logging middleware for web process
    this.app.use((req, res, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP request processed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          correlationId: (req as any).correlationId,
          processType: 'web',
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      });

      next();
    });

    logger.debug('Request middleware configured for web process');
  }

  private setupAuthMiddleware(): void {
    // Import and configure auth middleware for web process
    // Basic JWT token parsing middleware (optional for public endpoints)
    this.app.use((req, _res, next) => {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        (req as any).token = token;

        // Add basic token validation without blocking requests
        // Full authentication will be handled by API Gateway routes
        try {
          // Basic token structure validation
          const parts = token.split('.');
          if (parts.length === 3) {
            (req as any).hasValidTokenStructure = true;
          }
        } catch (error) {
          logger.debug('Invalid token structure in request', {
            correlationId: (req as any).correlationId,
            processType: 'web'
          });
        }
      }

      // Set auth context for web process
      (req as any).authContext = {
        processType: 'web',
        hasToken: !!authHeader,
        timestamp: new Date().toISOString()
      };

      next();
    });

    logger.debug('Auth middleware configured for web process');
  }

  private async setupWebRoutes(): Promise<void> {
    // Health check endpoints (critical for load balancers)
    this.app.get('/health', (_req, res) => {
      const health = this.getWebServerHealth();
      res.status(health.healthy ? 200 : 503).json(health);
    });

    this.app.get('/health/ready', (_req, res) => {
      // Readiness probe - return 503 if shutting down
      if (this._isShuttingDown) {
        res.status(503).json({
          status: 'not_ready',
          reason: 'shutting_down',
        });
        return;
      }

      res.status(200).json({
        status: 'ready',
        processType: 'web',
      });
    });

    // Setup API Gateway with web-specific configuration
    logger.info('Setting up web API routes...');
    try {
      const { setupAPIGatewayIntegration } = await import('../../services/api-gateway/integration.js');

      await setupAPIGatewayIntegration(this.app, {
        enableAuth: true,
        enableRateLimit: true,
        enableCors: true,
        corsOrigins: getCorsOrigins(),
        openAPIConfig: {
          baseUrl: config.NODE_ENV === 'production'
            ? 'https://api.sitespeak.ai'
            : `http://localhost:${config.PORT}`,
          title: 'SiteSpeak Web API',
          description: 'Real-time API for SiteSpeak voice-first website builder',
          version: process.env['npm_package_version'] || '1.0.0'
        },
      });

      logger.info('Web API routes setup completed');
    } catch (error) {
      logger.error('Failed to setup web API routes', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.status(200).json({
        status: 'online',
        message: 'SiteSpeak Web Process is running',
        version: '1.0.0',
        processType: 'web',
        environment: config.NODE_ENV,
        capabilities: [
          'HTTP API',
          'WebSocket (Socket.IO)',
          'Raw WebSocket (voice)',
          'Real-time AI (≤300ms)',
          'Authentication',
          'Multi-tenant',
        ],
        endpoints: {
          api: '/api/v1/',
          health: '/health',
          voice: 'ws://' + req.get('host') + '/voice',
          voiceRaw: 'ws://' + req.get('host') + '/voice-ws',
        },
        timestamp: new Date().toISOString()
      });
    });
  }

  private async setupWebSockets(): Promise<void> {
    // Initialize Universal AI Assistant for real-time processing
    const { getUniversalAIAssistantService } = await import('../../modules/ai/application/UniversalAIAssistantService.js');

    // Setup Socket.IO WebSocket handler (optimized for web process)
    const { VoiceWebSocketHandler } = await import('../../modules/voice/infrastructure/websocket/VoiceWebSocketHandler.js');
    const voiceHandler = new VoiceWebSocketHandler(this.io);

    // Initialize AI Assistant for web process (real-time only)
    const aiAssistant = getUniversalAIAssistantService({
      enableVoice: true,
      enableStreaming: true,
      defaultLocale: 'en-US',
      maxSessionDuration: 30 * 60 * 1000, // 30 minutes
      responseTimeoutMs: 30000, // 30 seconds
    }, voiceHandler);

    // Connect AI Assistant to Voice WebSocket Handler
    voiceHandler.setAIAssistant(aiAssistant);

    // Initialize Unified Voice Orchestrator for ≤300ms voice performance
    const { createUnifiedVoiceOrchestrator } = await import('../../services/voice/index.js');

    // Create a properly configured orchestrator instance
    const rawWebSocketServer = createUnifiedVoiceOrchestrator(this.httpServer, aiAssistant, {
      enableRawWebSocket: true,
      enableSocketIO: true,
      paths: {
        rawWebSocket: '/voice-ws',
        socketIO: '/socket.io',
      },
      performance: {
        targetFirstTokenMs: 200,
        targetPartialLatencyMs: 100,
        targetBargeInMs: 30,
        enableConnectionPooling: true,
        enableStreamingAudio: true,
        enablePredictiveProcessing: true,
        enableAdaptiveOptimization: true,
        enablePerformanceMonitoring: true,
      },
      optimization: {
        audioBufferPoolSize: 100,
        connectionPoolSize: 50,
        enableMemoryPooling: true,
        enableSpeculativeProcessing: true,
        autoOptimizationThreshold: 300,
      }
    });

    // Start the orchestrator with both WebSocket servers
    await rawWebSocketServer.start();

    logger.info('WebSocket servers attached', {
      socketIO: 'enabled',
      rawWebSocket: 'enabled (/voice-ws)',
      voiceLatency: '≤300ms',
      processType: 'web',
    });

    // Store handlers for graceful shutdown
    (this as any).voiceHandler = voiceHandler;
    (this as any).rawWebSocketServer = rawWebSocketServer;
    (this as any).aiAssistant = aiAssistant;

    // General WebSocket connection handling
    this.io.on('connection', (socket) => {
      logger.info('WebSocket connection established', {
        socketId: socket.id,
        processType: 'web',
      });

      socket.on('disconnect', (reason) => {
        logger.info('WebSocket connection disconnected', {
          socketId: socket.id,
          reason,
          processType: 'web',
        });
      });
    });
  }

  private setupErrorHandling(): void {
    // Web process specific error handling
    this.app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Web server error', {
        error,
        processType: 'web',
        correlationId: (req as any).correlationId,
      });

      const isDev = config.NODE_ENV === 'development';

      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        processType: 'web',
        correlationId: (req as any).correlationId,
        ...(isDev && {
          message: error.message,
          stack: error.stack,
        }),
      });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Web server received ${signal}, starting graceful shutdown`);

      this._isShuttingDown = true;

      try {
        // Shutdown WebSocket servers
        const rawWebSocketServer = (this as any).rawWebSocketServer;
        if (rawWebSocketServer) {
          await rawWebSocketServer.shutdown();
        }

        const voiceHandler = (this as any).voiceHandler;
        if (voiceHandler) {
          await voiceHandler.endAllSessions();
        }

        // Close HTTP server
        this.httpServer.close(() => {
          logger.info('Web server closed');
        });

        this.io.close(() => {
          logger.info('WebSocket server closed');
        });

        logger.info('Web server graceful shutdown completed');
      } catch (error) {
        logger.error('Error during web server shutdown', { error });
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(config.PORT, (error?: Error) => {
        if (error) {
          logger.error('Failed to start web server', {
            error,
            port: config.PORT,
            processType: 'web',
          });
          reject(error);
        } else {
          logger.info('Web server started successfully', {
            port: config.PORT,
            environment: config.NODE_ENV,
            processType: 'web',
            pid: process.pid,
          });
          resolve();
        }
      });
    });
  }

  private getWebServerHealth() {
    return {
      healthy: !this._isShuttingDown,
      processType: 'web',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
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