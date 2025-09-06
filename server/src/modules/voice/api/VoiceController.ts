import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { voiceProcessingService } from '../application/services/VoiceProcessingService';
import { voiceAnalyticsService } from '../application/VoiceAnalyticsService';
import { jwtService } from '../../../infrastructure/auth/jwt.js';

const logger = createLogger({ service: 'voice-controller' });

// Extend Express Request to include file upload (from multer)
interface RequestWithFile extends Request {
  file?: Express.Multer.File | undefined;
}

// Request schemas
const ProcessAudioSchema = z.object({
  sessionId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  language: z.string().optional(),
  prompt: z.string().optional(),
});

const GenerateSpeechSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
  model: z.enum(['tts-1', 'tts-1-hd']).default('tts-1'),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
  sessionId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
});

const GenerateVoiceTokenSchema = z.object({
  siteId: z.string().uuid(),
  locale: z.string().optional(),
});

export class VoiceController {
  /**
   * Process uploaded audio file (speech-to-text)
   */
  async processAudio(req: RequestWithFile, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const data = ProcessAudioSchema.parse(req.body);
      
      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided',
          code: 'MISSING_AUDIO_FILE',
          correlationId: req.correlationId,
        });
      }

      logger.info('Processing audio file', {
        userId: user.id,
        tenantId: user.tenantId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        correlationId: req.correlationId,
      });

      // Validate audio format
      const validation = voiceProcessingService.validateAudioFormat(req.file.originalname, req.file.buffer);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          code: 'INVALID_AUDIO_FORMAT',
          correlationId: req.correlationId,
        });
      }

      // Process speech to text
      const result = await voiceProcessingService.speechToText({
        audioBuffer: req.file.buffer,
        filename: req.file.originalname,
        ...(data.language && { language: data.language }),
        ...(data.prompt && { prompt: data.prompt }),
      });

      // Analyze voice for sentiment/emotion
      const analysis = await voiceProcessingService.analyzeVoice(result.transcript);

      // Record interaction in database if sessionId provided
      if (data.sessionId) {
        try {
          await voiceAnalyticsService.recordInteraction({
            sessionId: data.sessionId,
            turnId: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            type: 'question',
            transcript: result.transcript,
            confidence: result.confidence || 0.8,
            processingTime: 0, // TODO: Measure actual processing time
            intent: analysis.intent || 'speech_to_text',
            intentConfidence: analysis.confidence || 0.85,
            toolsUsed: [],
            qualityScore: result.confidence || 0.8,
            userId: user.id
          });
        } catch (error) {
          logger.warn('Failed to record voice interaction', { error, sessionId: data.sessionId });
        }
      }

      // Update tenant voice usage
      try {
        await voiceAnalyticsService.updateTenantUsage(user.tenantId, {
          minutesUsed: (result.duration || 0) / 60,
          requestsUsed: 1,
          interactionType: 'stt'
        });
      } catch (error) {
        logger.warn('Failed to update tenant voice usage', { error, tenantId: user.tenantId });
      }

      res.json({
        success: true,
        data: {
          transcript: result.transcript,
          language: result.language,
          duration: result.duration,
          confidence: result.confidence,
          analysis,
          segments: result.segments,
        },
      });
    } catch (error) {
      logger.error('Audio processing failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Generate speech from text (text-to-speech)
   */
  async generateSpeech(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const data = GenerateSpeechSchema.parse(req.body);

      logger.info('Generating speech', {
        userId: user.id,
        tenantId: user.tenantId,
        textLength: data.text.length,
        voice: data.voice,
        model: data.model,
        correlationId: req.correlationId,
      });

      // Generate speech
      const result = await voiceProcessingService.textToSpeech({
        text: data.text,
        voice: data.voice,
        model: data.model,
        speed: data.speed,
        format: data.format,
      });

      // Record interaction in database if sessionId provided
      if (data.sessionId) {
        try {
          await voiceAnalyticsService.recordInteraction({
            sessionId: data.sessionId,
            turnId: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            type: 'command',
            responseText: data.text,
            processingTime: 0, // TODO: Measure actual processing time
            intent: 'text_to_speech',
            intentConfidence: 1.0,
            toolsUsed: [],
            qualityScore: 1.0,
            userId: user.id
          });
        } catch (error) {
          logger.warn('Failed to record voice interaction', { error, sessionId: data.sessionId });
        }
      }

      // Update tenant voice usage
      try {
        await voiceAnalyticsService.updateTenantUsage(user.tenantId, {
          minutesUsed: (result.duration || 0) / 60,
          requestsUsed: 1,
          interactionType: 'tts'
        });
      } catch (error) {
        logger.warn('Failed to update tenant voice usage', { error, tenantId: user.tenantId });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', `audio/${data.format}`);
      res.setHeader('Content-Length', result.audioBuffer.length);
      res.setHeader('Content-Disposition', `attachment; filename="speech.${data.format}"`);

      // Send audio data
      res.send(result.audioBuffer);
    } catch (error) {
      logger.error('Speech generation failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get voice session analytics
   */
  async getSessionAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { sessionId } = req.params;

      // TODO: Get actual session analytics from database
      // Implement tenant isolation and user authentication
      const mockAnalytics = {
        sessionId,
        userId: user.id,
        tenantId: user.tenantId,
        totalInteractions: 15,
        duration: 8.5, // minutes
        speechToTextAccuracy: 0.92,
        averageResponseTime: 1200, // milliseconds
        emotionsDetected: ['neutral', 'happy', 'curious'],
        languagesUsed: ['en'],
        qualityScore: 0.88,
        // TODO: Replace with real analytics query filtered by user.tenantId
      };

      res.json({
        success: true,
        data: mockAnalytics,
      });
    } catch (error) {
      logger.error('Failed to get session analytics', {
        error,
        userId: req.user?.id,
        sessionId: req.params['sessionId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get voice usage statistics
   */
  async getUsageStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;

      // TODO: Get actual usage statistics from database
      // Implement tenant-specific usage tracking with proper isolation
      const mockStats = {
        userId: user.id,
        tenantId: user.tenantId,
        currentMonth: {
          voiceMinutesUsed: 45.5,
          speechToTextRequests: 120,
          textToSpeechRequests: 95,
          activeSessions: 8,
        },
        limits: {
          voiceMinutesPerMonth: 300,
          requestsPerMonth: 1000,
        },
        usage: {
          voiceMinutesPercentage: 15.2,
          requestsPercentage: 21.5,
        },
        trending: {
          thisWeek: 12.3,
          lastWeek: 8.7,
          growth: 41.4,
        },
      };

      res.json({
        success: true,
        data: mockStats,
      });
    } catch (error) {
      logger.error('Failed to get voice usage statistics', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get available voice options
   */
  async getVoiceOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const voices = voiceProcessingService.getTTSVoices();
      const formats = voiceProcessingService.getSupportedFormats();

      res.json({
        success: true,
        data: {
          voices,
          supportedFormats: formats,
          models: ['tts-1', 'tts-1-hd'],
          speedRange: { min: 0.25, max: 4.0, default: 1.0 },
          textLimits: { min: 1, max: 4096 },
          fileLimits: { min: 1024, max: 25 * 1024 * 1024 }, // 1KB to 25MB
        },
      });
    } catch (error) {
      logger.error('Failed to get voice options', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get voice service health
   */
  async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      // TODO: Check OpenAI API connectivity
      // TODO: Check temporary file system
      // TODO: Check WebSocket server

      res.json({
        success: true,
        data: {
          service: 'voice',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            openai_whisper: 'healthy',
            openai_tts: 'healthy',
            websocket: 'healthy',
            file_system: 'healthy',
          },
          supported_formats: voiceProcessingService.getSupportedFormats(),
          available_voices: voiceProcessingService.getTTSVoices().length,
        },
      });
    } catch (error) {
      logger.error('Voice health check failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Test voice processing (development endpoint)
   */
  async testVoiceProcessing(req: Request, res: Response, next: NextFunction) {
    try {
      const { text = 'Hello, this is a test of the voice processing system.' } = req.body;

      logger.info('Testing voice processing', {
        userId: req.user?.id,
        textLength: text.length,
        correlationId: req.correlationId,
      });

      // Generate speech
      const ttsResult = await voiceProcessingService.textToSpeech({
        text,
        voice: 'alloy',
        model: 'tts-1',
        speed: 1.0,
        format: 'mp3',
      });

      // Convert speech back to text (round-trip test)
      const sttResult = await voiceProcessingService.speechToText({
        audioBuffer: ttsResult.audioBuffer,
        filename: 'test_audio.mp3',
      });

      // Analyze the result
      const analysis = await voiceProcessingService.analyzeVoice(sttResult.transcript);

      res.json({
        success: true,
        data: {
          original_text: text,
          generated_audio_size: ttsResult.audioBuffer.length,
          transcribed_text: sttResult.transcript,
          accuracy_score: this.calculateAccuracy(text, sttResult.transcript),
          duration: sttResult.duration,
          analysis,
          test_passed: sttResult.transcript.length > 0,
        },
      });
    } catch (error) {
      logger.error('Voice processing test failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Generate voice session token for WebSocket authentication
   */
  async generateVoiceToken(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const data = GenerateVoiceTokenSchema.parse(req.body);

      logger.info('Generating voice session token', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId: data.siteId,
        correlationId: req.correlationId,
      });

      // Generate voice-specific token
      const voiceToken = jwtService.generateVoiceToken({
        tenantId: user.tenantId,
        siteId: data.siteId,
        userId: user.id,
        locale: data.locale || 'en-US',
      });

      res.json({
        success: true,
        data: {
          token: voiceToken,
          expiresIn: '1h',
          websocketUrl: process.env['NODE_ENV'] === 'production' 
            ? `wss://${req.get('host')}/voice` 
            : 'ws://localhost:5000/voice',
        },
      });
    } catch (error) {
      logger.error('Voice token generation failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Calculate simple accuracy score between original and transcribed text
   */
  private calculateAccuracy(original: string, transcribed: string): number {
    const originalWords = original.toLowerCase().split(/\s+/);
    const transcribedWords = transcribed.toLowerCase().split(/\s+/);
    
    let matches = 0;
    const maxLength = Math.max(originalWords.length, transcribedWords.length);
    
    for (let i = 0; i < Math.min(originalWords.length, transcribedWords.length); i++) {
      if (originalWords[i] === transcribedWords[i]) {
        matches++;
      }
    }
    
    return maxLength > 0 ? matches / maxLength : 0;
  }
}

// Export controller instance
export const voiceController = new VoiceController();