import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../../../../shared/utils.js';
import { config } from '../../../../infrastructure/config';

const logger = createLogger({ service: 'voice-processing' });

export interface SpeechToTextRequest {
  audioBuffer: Buffer;
  filename: string;
  language?: string;
  prompt?: string;
  temperature?: number;
}

export interface SpeechToTextResponse {
  transcript: string;
  language: string;
  confidence?: number;
  duration: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

// Use official OpenAI types instead of custom interface to avoid duplication
type OpenAITranscriptionCreateParams = OpenAI.Audio.TranscriptionCreateParamsNonStreaming;

// OpenAI verbose_json response includes additional metadata
interface OpenAIVerboseTranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}

// Type for the actual response (could be simple text or verbose json)
type OpenAITranscriptionResponse = OpenAI.Audio.Transcription | OpenAIVerboseTranscriptionResponse;

// Type guard function for transcription response validation
function isTranscriptionWithMetadata(transcription: any): transcription is OpenAITranscriptionResponse {
  return transcription && typeof transcription.text === 'string';
}

export interface TextToSpeechRequest {
  text: string;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  model: 'tts-1' | 'tts-1-hd';
  speed?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
}

export interface TextToSpeechResponse {
  audioBuffer: Buffer;
  format: string;
  duration?: number;
  url?: string; // If saved to storage
}

export interface VoiceAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  emotion?: 'happy' | 'sad' | 'angry' | 'excited' | 'calm' | 'frustrated';
  confidence: number;
  intent?: string;
  entities?: Record<string, unknown>;
}

/**
 * Service for processing voice interactions using OpenAI
 */
export class VoiceProcessingService {
  private openai: OpenAI;
  private tempDir: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    this.tempDir = path.join(process.cwd(), 'temp', 'audio');
    this.ensureTempDirectory();
  }

  /**
   * Convert speech to text using Whisper
   */
  async speechToText(request: SpeechToTextRequest): Promise<SpeechToTextResponse> {
    let tempFilePath: string | null = null;

    try {
      logger.debug('Starting speech-to-text processing', {
        filename: request.filename,
        bufferSize: request.audioBuffer.length,
        language: request.language,
      });

      // Save audio buffer to temporary file
      tempFilePath = await this.saveAudioToTemp(request.audioBuffer, request.filename);

      // Create file stream for OpenAI
      const audioFile = await fs.open(tempFilePath, 'r');
      const fileStream = audioFile.createReadStream();

      const startTime = Date.now();

      // Call OpenAI Whisper API - using non-streaming type
      const transcriptionParams: OpenAITranscriptionCreateParams = {
        file: fileStream,
        model: 'whisper-1',
        temperature: request.temperature || 0,
        response_format: 'verbose_json',
        ...(request.language && { language: request.language }),
        ...(request.prompt && { prompt: request.prompt }),
      };

      const transcription = await this.openai.audio.transcriptions.create(transcriptionParams);

      // Validate transcription response using type guard
      if (!isTranscriptionWithMetadata(transcription)) {
        throw new Error('Invalid transcription response from OpenAI API');
      }

      await audioFile.close();

      const processingTime = Date.now() - startTime;

      logger.info('Speech-to-text completed successfully', {
        filename: request.filename,
        transcriptLength: transcription.text.length,
        language: transcription.language,
        duration: transcription.duration,
        processingTime,
      });

      return {
        transcript: transcription.text,
        language: transcription.language || request.language || 'en',
        duration: transcription.duration,
        segments: transcription.segments?.map(segment => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
        })) || [],
      };
    } catch (error) {
      logger.error('Speech-to-text failed', {
        error,
        filename: request.filename,
        bufferSize: request.audioBuffer.length,
      });
      throw error;
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (error) {
          logger.warn('Failed to cleanup temporary audio file', {
            tempFilePath,
            error,
          });
        }
      }
    }
  }

  /**
   * Convert text to speech using OpenAI TTS
   */
  async textToSpeech(request: TextToSpeechRequest): Promise<TextToSpeechResponse> {
    try {
      logger.debug('Starting text-to-speech processing', {
        textLength: request.text.length,
        voice: request.voice,
        model: request.model,
        speed: request.speed,
      });

      const startTime = Date.now();

      // Call OpenAI TTS API
      const mp3Response = await this.openai.audio.speech.create({
        model: request.model,
        voice: request.voice,
        input: request.text,
        speed: request.speed || 1.0,
        response_format: request.format || 'mp3',
      });

      // Convert response to buffer
      const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
      const processingTime = Date.now() - startTime;

      logger.info('Text-to-speech completed successfully', {
        textLength: request.text.length,
        voice: request.voice,
        model: request.model,
        audioSize: audioBuffer.length,
        processingTime,
      });

      return {
        audioBuffer,
        format: request.format || 'mp3',
      };
    } catch (error) {
      logger.error('Text-to-speech failed', {
        error,
        textLength: request.text.length,
        voice: request.voice,
        model: request.model,
      });
      throw error;
    }
  }

  /**
   * Analyze speech for sentiment and intent
   */
  async analyzeVoice(transcript: string): Promise<VoiceAnalysis> {
    try {
      logger.debug('Analyzing voice transcript', {
        transcriptLength: transcript.length,
      });

      // Use OpenAI to analyze the transcript
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a voice analysis expert. Analyze the following transcript and return a JSON object with:
            - sentiment: "positive", "negative", or "neutral"
            - emotion: one of "happy", "sad", "angry", "excited", "calm", "frustrated" (optional)
            - confidence: a number between 0 and 1
            - intent: brief description of user intent (optional)
            - entities: any important entities mentioned (optional object)
            
            Return only valid JSON, no additional text.`,
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const analysisText = completion.choices[0]?.message?.content;
      if (!analysisText) {
        throw new Error('No analysis result received');
      }

      const analysis = JSON.parse(analysisText) as VoiceAnalysis;

      logger.info('Voice analysis completed', {
        transcriptLength: transcript.length,
        sentiment: analysis.sentiment,
        emotion: analysis.emotion,
        confidence: analysis.confidence,
      });

      return analysis;
    } catch (error) {
      logger.error('Voice analysis failed', {
        error,
        transcriptLength: transcript.length,
      });

      // Return default analysis if AI analysis fails
      return {
        sentiment: 'neutral',
        confidence: 0.5,
      };
    }
  }

  /**
   * Save audio to temporary file
   */
  private async saveAudioToTemp(audioBuffer: Buffer, originalFilename: string): Promise<string> {
    const timestamp = Date.now();
    const extension = path.extname(originalFilename) || '.webm';
    const filename = `audio_${timestamp}_${Math.random().toString(36).substring(7)}${extension}`;
    const filePath = path.join(this.tempDir, filename);

    await fs.writeFile(filePath, audioBuffer);
    
    logger.debug('Audio saved to temporary file', {
      filePath,
      originalFilename,
      bufferSize: audioBuffer.length,
    });

    return filePath;
  }

  /**
   * Ensure temporary directory exists
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temporary directory', {
        error,
        tempDir: this.tempDir,
      });
    }
  }

  /**
   * Validate audio format
   */
  validateAudioFormat(filename: string, buffer: Buffer): { valid: boolean; error?: string } {
    const allowedExtensions = ['.wav', '.mp3', '.m4a', '.webm', '.mp4', '.mpeg', '.mpga'];
    const extension = path.extname(filename).toLowerCase();

    if (!allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: `Unsupported audio format: ${extension}. Supported formats: ${allowedExtensions.join(', ')}`,
      };
    }

    // Check minimum file size (1KB)
    if (buffer.length < 1024) {
      return {
        valid: false,
        error: 'Audio file too small (minimum 1KB required)',
      };
    }

    // Check maximum file size (25MB)
    const maxSize = 25 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return {
        valid: false,
        error: 'Audio file too large (maximum 25MB allowed)',
      };
    }

    return { valid: true };
  }

  /**
   * Cleanup old temporary files
   */
  async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 60 * 60 * 1000; // 1 hour

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.debug('Cleaned up old temporary file', { filePath });
        }
      }
    } catch (error) {
      logger.warn('Temporary file cleanup failed', { error });
    }
  }

  /**
   * Get supported audio formats
   */
  getSupportedFormats(): string[] {
    return ['.wav', '.mp3', '.m4a', '.webm', '.mp4', '.mpeg', '.mpga'];
  }

  /**
   * Get TTS voice options
   */
  getTTSVoices(): Array<{ id: string; name: string; description: string }> {
    return [
      { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced voice' },
      { id: 'echo', name: 'Echo', description: 'Warm and friendly voice' },
      { id: 'fable', name: 'Fable', description: 'Storytelling voice' },
      { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative voice' },
      { id: 'nova', name: 'Nova', description: 'Bright and energetic voice' },
      { id: 'shimmer', name: 'Shimmer', description: 'Soft and gentle voice' },
    ];
  }
}

// Export singleton instance
export const voiceProcessingService = new VoiceProcessingService();

// Setup cleanup interval
setInterval(() => {
  voiceProcessingService.cleanupTempFiles();
}, 30 * 60 * 1000); // Every 30 minutes