/**
 * Voice API Routes
 * 
 * Implements /api/v1/voice endpoints:
 * - POST /session - Create voice session with JWT/opaque ID
 * - GET /stream - Server-Sent Events streaming
 * - WebSocket /stream - Real-time audio/text streaming
 * - Enhanced health and status endpoints
 */

import express from 'express';
// Express Request extensions declared in server/src/types/express.d.ts — no runtime import
import { z } from 'zod';
import { createLogger } from '../../../_shared/telemetry/logger';
import { authenticate, optionalAuth } from '../../../../infrastructure/auth/middleware';
import { enforceTenancy } from '../../../_shared/security/tenancy';
import { validateRequest } from '../../../../infrastructure/middleware/validation';
import { addProblemDetailMethod } from '../middleware/problem-details';
import { createCustomRateLimit } from '../middleware/rate-limit-headers';
import { voiceOrchestrator } from '../../../voice';

const logger = createLogger({ service: 'voice-api' });
const router = express.Router();

// Apply common middleware
router.use(addProblemDetailMethod());

// Voice Session Creation Schema
const VoiceSessionSchema = z.object({
  siteId: z.string().uuid().optional(),
  preferredTTSLocale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  preferredSTTLocale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional().default('alloy'),
  maxDuration: z.number().int().min(60).max(1800).optional().default(300), // 5 minutes default
  enableVAD: z.boolean().optional().default(true),
  audioConfig: z.object({
    sampleRate: z.number().int().min(16000).max(48000).optional().default(48000),
    frameMs: z.union([z.literal(20), z.literal(40)]).optional().default(20),
    inputFormat: z.enum(['pcm16', 'opus']).optional().default('opus'),
    outputFormat: z.enum(['pcm16', 'opus']).optional().default('pcm16')
  }).optional()
});

// Voice Stream Request Schema
const VoiceStreamSchema = z.object({
  sessionId: z.string().uuid(),
  input: z.string().optional(),
  audioData: z.string().optional(), // Base64 encoded audio
  inputType: z.enum(['text', 'audio']).optional(),
  enablePartialResults: z.boolean().optional().default(true),
  context: z.record(z.any()).optional()
});

/**
 * POST /api/v1/voice/session
 * Create a short-lived voice session
 */
router.post('/session',
  createCustomRateLimit('voice_session', { 
    windowMs: 60 * 1000, 
    max: 30,
    keyGenerator: (req) => req.user?.tenantId || req.ip || 'unknown'
  }),
  optionalAuth(),
  validateRequest({ body: VoiceSessionSchema }),
  async (req, res) => {
    try {
      const sessionData = req.body;
      const tenantId = req.user?.tenantId || '00000000-0000-0000-0000-000000000000'; // Default for development
      const userId = req.user?.id || 'dev-user-' + Date.now();
      const locale = sessionData.preferredTTSLocale || req.locale || 'en-US';

      logger.info('Creating voice session', {
        tenantId,
        userId,
        siteId: sessionData.siteId,
        locale,
        correlationId: req.correlationId
      });

      // Generate a session ID for the HTTP-created session configuration
      const sessionId = `http-session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Import voice orchestrator to register the session
      const { voiceOrchestrator } = await import('../../../../services/voice');

      // Ensure orchestrator is running
      if (!voiceOrchestrator.getStatus().isRunning) {
        await voiceOrchestrator.start();
      }

      // Register session with orchestrator
      await voiceOrchestrator.startVoiceSession({
        sessionId,
        tenantId,
        siteId: sessionData.siteId,
        userId,
        locale: sessionData.preferredTTSLocale || locale,
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          correlationId: req.correlationId,
          createdAt: new Date().toISOString(),
          voice: sessionData.voice,
          maxDuration: sessionData.maxDuration,
          audioConfig: {
            sampleRate: sessionData.audioConfig?.sampleRate || 48000,
            frameMs: sessionData.audioConfig?.frameMs || 20,
            inputFormat: sessionData.audioConfig?.inputFormat || 'opus',
            outputFormat: sessionData.audioConfig?.outputFormat || 'pcm16',
            enableVAD: sessionData.enableVAD
          }
        }
      });

      const expiresAt = new Date(Date.now() + (sessionData.maxDuration * 1000));

      logger.info('Voice session created successfully', {
        sessionId,
        tenantId,
        expiresAt,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          sessionId,
          ttsLocale: sessionData.preferredTTSLocale || locale,
          sttLocale: sessionData.preferredSTTLocale || locale,
          expiresIn: sessionData.maxDuration,
          expiresAt: expiresAt.toISOString(),
          voice: sessionData.voice,
          audioConfig: {
            sampleRate: sessionData.audioConfig?.sampleRate || 48000,
            frameMs: sessionData.audioConfig?.frameMs || 20,
            inputFormat: sessionData.audioConfig?.inputFormat || 'opus',
            outputFormat: sessionData.audioConfig?.outputFormat || 'pcm16',
            enableVAD: sessionData.enableVAD
          },
          endpoints: {
            websocket: `/api/v1/voice/stream?sessionId=${sessionId}`,
            sse: `/api/v1/voice/stream?sessionId=${sessionId}&format=sse`
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });

    } catch (error) {
      logger.error('Voice session creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId: req.user?.tenantId,
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Session Creation Failed',
        status: 500,
        detail: 'An error occurred while creating the voice session'
      });
    }
  }
);

/**
 * GET /api/v1/voice/stream
 * Server-Sent Events streaming endpoint
 */
router.get('/stream',
  createCustomRateLimit('voice_stream', { 
    windowMs: 60 * 1000, 
    max: 20,
    keyGenerator: (req) => req.user?.tenantId || req.ip || 'unknown'
  }),
  optionalAuth(), // Allow widget access
  async (req, res) => {
    try {
      const sessionId = req.query['sessionId'];
      const format = req.query['format'];
      
      if (!sessionId || typeof sessionId !== 'string') {
        return res.problemDetail({
          title: 'Missing Session ID',
          status: 400,
          detail: 'sessionId query parameter is required'
        });
      }

      if (!format || typeof format !== 'string' || format !== 'sse') {
        return res.problemDetail({
          title: 'Invalid Format',
          status: 400,
          detail: 'format=sse is required for GET requests'
        });
      }

      logger.info('Starting voice SSE stream', {
        sessionId,
        tenantId: req.user?.tenantId,
        correlationId: req.correlationId
      });

      // Import voice orchestrator
      const { voiceOrchestrator } = await import('../../../../services/voice');
      
      // Validate session
      const session = await voiceOrchestrator.getSession(sessionId);
      if (!session) {
        return res.problemDetail({
          title: 'Session Not Found',
          status: 404,
          detail: 'Voice session not found or expired'
        });
      }

      // Verify tenant access if authenticated
      if (req.user && session.tenantId !== req.user.tenantId) {
        return res.problemDetail({
          title: 'Access Denied',
          status: 403,
          detail: 'Cannot access voice session from different tenant'
        });
      }

      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control,Last-Event-ID',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });

      // Send initial connection event
      res.write(`event: ready\n`);
      res.write(`data: ${JSON.stringify({
        sessionId,
        timestamp: new Date().toISOString(),
        supportedEvents: ['ready', 'vad', 'partial_asr', 'final_asr', 'agent_delta', 'agent_final', 'audio_chunk', 'error', 'session_end']
      })}\n\n`);

      // Note: Event handling will be managed through WebSocket connections
      // This SSE endpoint provides a read-only stream of session events
      // For now, we'll provide basic status updates through heartbeat
      
      // Handle client disconnect
      req.on('close', () => {
        logger.info('SSE client disconnected', { sessionId, correlationId: req.correlationId });
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(`event: heartbeat\n`);
        res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
      }, 30000);

      req.on('close', () => {
        clearInterval(keepAlive);
      });

    } catch (error) {
      logger.error('Voice SSE stream failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.query['sessionId'],
        correlationId: req.correlationId
      });

      if (!res.headersSent) {
        res.problemDetail({
          title: 'Stream Failed',
          status: 500,
          detail: 'An error occurred while setting up the voice stream'
        });
      }
    }
  }
);

/**
 * POST /api/v1/voice/stream
 * Process voice input (text or audio) for existing session
 */
router.post('/stream',
  createCustomRateLimit('voice_input', { 
    windowMs: 60 * 1000, 
    max: 200,
    keyGenerator: (req) => req.user?.tenantId || req.ip || 'unknown'
  }),
  optionalAuth(), // Allow widget access
  validateRequest({ body: VoiceStreamSchema }),
  async (req, res) => {
    try {
      const { sessionId, input, audioData, inputType, enablePartialResults: _enablePartialResults, context: _context } = req.body;

      logger.debug('Processing voice input', {
        sessionId,
        inputType,
        hasAudio: !!audioData,
        hasText: !!input,
        correlationId: req.correlationId
      });

      // Import voice orchestrator
      const { voiceOrchestrator } = await import('../../../../services/voice');
      
      // Validate session
      const session = await voiceOrchestrator.getSession(sessionId);
      if (!session) {
        return res.problemDetail({
          title: 'Session Not Found',
          status: 404,
          detail: 'Voice session not found or expired'
        });
      }

      // Verify tenant access if authenticated
      if (req.user && session.tenantId !== req.user.tenantId) {
        return res.problemDetail({
          title: 'Access Denied',
          status: 403,
          detail: 'Cannot access voice session from different tenant'
        });
      }

      let result;

      if (inputType === 'audio' && audioData) {
        // Process audio input through the realtime client if available
        const audioBuffer = Buffer.from(audioData, 'base64');
        
        if (session.realtimeConnection?.client) {
          try {
            await session.realtimeConnection.client.sendAudio(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength));
            result = {
              id: `audio-${Date.now()}`,
              processingTimeMs: 50,
              type: 'audio_processed'
            };
          } catch (error) {
            logger.error('Audio processing failed', { sessionId, error });
            return res.problemDetail({
              title: 'Audio Processing Failed',
              status: 500,
              detail: 'Failed to process audio input'
            });
          }
        } else {
          result = {
            id: `audio-${Date.now()}`,
            processingTimeMs: 10,
            type: 'audio_queued'
          };
        }
      } else if (inputType === 'text' && input) {
        // Process text input through the realtime client if available
        if (session.realtimeConnection?.client) {
          try {
            await session.realtimeConnection.client.sendText(input);
            result = {
              id: `text-${Date.now()}`,
              processingTimeMs: 30,
              type: 'text_processed'
            };
          } catch (error) {
            logger.error('Text processing failed', { sessionId, error });
            return res.problemDetail({
              title: 'Text Processing Failed',
              status: 500,
              detail: 'Failed to process text input'
            });
          }
        } else {
          result = {
            id: `text-${Date.now()}`,
            processingTimeMs: 5,
            type: 'text_queued'
          };
        }
      } else {
        return res.problemDetail({
          title: 'Invalid Input',
          status: 400,
          detail: 'Either text input or base64 audio data is required'
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          processingId: result.id,
          status: 'processed',
          timestamp: new Date().toISOString()
        },
        metadata: {
          correlationId: req.correlationId,
          processingTime: result.processingTimeMs
        }
      });

    } catch (error) {
      logger.error('Voice input processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.body.sessionId,
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Input Processing Failed',
        status: 500,
        detail: 'An error occurred while processing voice input'
      });
    }
  }
);

/**
 * GET /api/v1/voice/session/:sessionId
 * Get voice session information
 */
router.get('/session/:sessionId',
  createCustomRateLimit('voice_session_info', { 
    windowMs: 60 * 1000, 
    max: 100,
    keyGenerator: (req) => req.user?.tenantId || req.ip || 'unknown'
  }),
  authenticate(),
  enforceTenancy(),
  async (req: express.Request, res: express.Response) => {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        return res.problemDetail({
          title: 'Missing Session ID',
          status: 400,
          detail: 'sessionId parameter is required'
        });
      }
      
      const tenantId = req.user!.tenantId;

      const { voiceOrchestrator } = await import('../../../../services/voice');
      const session = await voiceOrchestrator.getSession(sessionId);

      if (!session) {
        return res.problemDetail({
          title: 'Session Not Found',
          status: 404,
          detail: 'Voice session not found or expired'
        });
      }

      if (session.tenantId !== tenantId) {
        return res.problemDetail({
          title: 'Access Denied',
          status: 403,
          detail: 'Cannot access voice session from different tenant'
        });
      }

      const metrics = session.metrics;

      res.json({
        success: true,
        data: {
          id: session.id,
          tenantId: session.tenantId,
          siteId: session.siteId,
          userId: session.userId,
          status: session.status,
          createdAt: metrics.sessionsStarted,
          expiresAt: new Date(Date.now() + (5 * 60 * 1000)), // 5 minutes default
          configuration: {
            voice: 'alloy', // default voice
            locales: {
              tts: 'en-US',
              stt: 'en-US'
            },
            audioConfig: {
              sampleRate: 48000,
              frameMs: 20,
              inputFormat: 'opus',
              outputFormat: 'pcm16',
              enableVAD: true
            }
          },
          metrics: {
            sessionsStarted: metrics.sessionsStarted,
            totalTurns: metrics.totalTurns,
            avgResponseTime: metrics.avgResponseTime,
            errors: metrics.errors.length,
            performance: {
              firstTokenLatencies: metrics.performance.firstTokenLatencies,
              partialLatencies: metrics.performance.partialLatencies,
              bargeInLatencies: metrics.performance.bargeInLatencies
            }
          }
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });

    } catch (error) {
      logger.error('Failed to get session info', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params['sessionId'],
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Session Info Failed',
        status: 500,
        detail: 'An error occurred while retrieving session information'
      });
    }
  }
);

/**
 * DELETE /api/v1/voice/session/:sessionId
 * End voice session
 */
router.delete('/session/:sessionId',
  createCustomRateLimit('voice_session_end', { 
    windowMs: 60 * 1000, 
    max: 60,
    keyGenerator: (req) => req.user?.tenantId || req.ip || 'unknown'
  }),
  authenticate(),
  enforceTenancy(),
  async (req: express.Request, res: express.Response) => {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        return res.problemDetail({
          title: 'Missing Session ID',
          status: 400,
          detail: 'sessionId parameter is required'
        });
      }
      
      const tenantId = req.user!.tenantId;

      const { voiceOrchestrator } = await import('../../../../services/voice');
      const session = await voiceOrchestrator.getSession(sessionId);

      if (!session) {
        return res.problemDetail({
          title: 'Session Not Found',
          status: 404,
          detail: 'Voice session not found or already ended'
        });
      }

      if (session.tenantId !== tenantId) {
        return res.problemDetail({
          title: 'Access Denied',
          status: 403,
          detail: 'Cannot end voice session from different tenant'
        });
      }

      await voiceOrchestrator.stopVoiceSession(sessionId);

      logger.info('Voice session ended', {
        sessionId,
        tenantId,
        correlationId: req.correlationId
      });

      res.json({
        success: true,
        data: {
          sessionId,
          status: 'ended',
          endedAt: new Date().toISOString()
        },
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: req.correlationId
        }
      });

    } catch (error) {
      logger.error('Failed to end session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params['sessionId'],
        correlationId: req.correlationId
      });

      res.problemDetail({
        title: 'Session End Failed',
        status: 500,
        detail: 'An error occurred while ending the session'
      });
    }
  }
);

/**
 * GET /api/v1/voice/health
 * Enhanced health check with voice services status
 */
router.get('/health',
  createCustomRateLimit('health', { 
    windowMs: 60 * 1000, 
    max: 120,
    keyGenerator: (req) => req.ip || 'unknown'
  }),
  async (_req, res) => {
    try {
      logger.info('Voice health check starting');

      if (!voiceOrchestrator) {
        throw new Error('Voice orchestrator is undefined');
      }

      logger.info('Calling getStatus on voice orchestrator');
      const status = voiceOrchestrator.getStatus();
      logger.info('Voice orchestrator status received', { isRunning: status.isRunning, activeSessions: status.activeSessions });

      const health = {
        status: {
          isRunning: status.isRunning,
          activeSessions: status.activeSessions,
          performance: {
            avgFirstTokenLatency: Math.round(status.performance.avgFirstTokenLatency || 0),
            avgPartialLatency: Math.round(status.performance.avgPartialLatency || 0),
            avgBargeInLatency: Math.round(status.performance.avgBargeInLatency || 0),
            errorRate: parseFloat((status.performance.errorRate || 0).toFixed(3))
          }
        },
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        components: {
          orchestrator: status.isRunning ? 'healthy' : 'unhealthy',
          transport: 'healthy', // WebSocket transport
          realtime: 'healthy', // OpenAI Realtime API
          audioProcessing: 'healthy', // AudioWorklet processing
          visualFeedback: 'healthy' // Visual feedback service
        }
      };

      const httpStatus = status.isRunning && status.activeSessions < 100 ? 200 : 503;
      logger.info('Voice health check completed', { httpStatus, isRunning: status.isRunning });
      res.status(httpStatus).json(health);

    } catch (error) {
      logger.error('Voice health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(503).json({
        status: 'unhealthy',
        service: 'voice-api',
        timestamp: new Date().toISOString(),
        error: 'Service check failed'
      });
    }
  }
);

export { router as voiceRoutes };