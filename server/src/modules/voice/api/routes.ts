import express from 'express';
import multer from 'multer';
import { voiceController } from './VoiceController.js';
import { authMiddleware } from '../../../infrastructure/auth/middleware.js';

const router = express.Router();

// Configure multer for audio file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/webm',
      'audio/ogg',
      'audio/flac',
      'audio/x-m4a',
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format. Supported formats: MP3, MP4, WAV, WebM, OGG, FLAC, M4A'));
    }
  },
});

// Voice session token generation (requires authentication)
router.post('/session/token', authMiddleware, voiceController.generateVoiceToken.bind(voiceController));

// Speech to text processing (requires authentication and file upload)
router.post('/stt', authMiddleware, upload.single('audio'), voiceController.processAudio.bind(voiceController));

// Text to speech generation (requires authentication)
router.post('/tts', authMiddleware, voiceController.generateSpeech.bind(voiceController));

// Voice analytics endpoints (require authentication)
router.get('/analytics/session/:sessionId', authMiddleware, voiceController.getSessionAnalytics.bind(voiceController));
router.get('/analytics/usage', authMiddleware, voiceController.getUsageStatistics.bind(voiceController));

// Voice service information
router.get('/options', voiceController.getVoiceOptions.bind(voiceController));
router.get('/health', voiceController.getHealth.bind(voiceController));

// Development testing endpoint (requires authentication)
router.post('/test', authMiddleware, voiceController.testVoiceProcessing.bind(voiceController));

export { router as voiceRoutes };