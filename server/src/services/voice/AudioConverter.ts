/**
 * Audio Converter Service - WebM to PCM16 conversion pipeline
 *
 * Handles real-time audio format conversion for OpenAI Realtime API:
 * - WebM/Opus input from browser MediaRecorder
 * - PCM16 output at 24kHz for OpenAI Realtime API
 * - Efficient streaming conversion with minimal latency
 * - Fallback mechanisms for different audio formats
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils';
import { spawn } from 'child_process';
// Stream utilities not currently used but may be needed for future streaming implementation
// import { Readable, Writable } from 'stream';
import * as path from 'path';
import { promises as fs } from 'fs';

const logger = createLogger({ service: 'audio-converter' });

export interface AudioConversionConfig {
  inputFormat: 'webm' | 'opus' | 'wav' | 'mp3';
  outputFormat: 'pcm16' | 'wav' | 'opus';
  inputSampleRate?: number;
  outputSampleRate: number;
  channels: number;
  bitDepth?: 8 | 16 | 24 | 32;
  useFFmpeg?: boolean;
  useOpusDecoder?: boolean;
}

export interface ConversionResult {
  data: Buffer;
  originalSize: number;
  convertedSize: number;
  conversionTime: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface AudioMetadata {
  duration: number;
  sampleRate: number;
  channels: number;
  bitRate: number;
  format: string;
  codec?: string;
}

interface ConversionStats {
  totalConversions: number;
  successfulConversions: number;
  failedConversions: number;
  avgConversionTime: number;
  avgCompressionRatio: number;
  totalInputBytes: number;
  totalOutputBytes: number;
}

/**
 * Real-time audio format converter with multiple conversion strategies
 */
export class AudioConverter extends EventEmitter {
  private isInitialized = false;
  private ffmpegAvailable = false;
  private opusDecoderAvailable = false;
  private tempDir: string;
  private stats: ConversionStats;
  private conversionTimes: number[] = [];

  constructor() {
    super();
    this.tempDir = path.join(process.cwd(), 'temp', 'audio-conversion');
    this.stats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      avgConversionTime: 0,
      avgCompressionRatio: 0,
      totalInputBytes: 0,
      totalOutputBytes: 0,
    };

    this.initialize();
  }

  /**
   * Initialize the audio converter and check available tools
   */
  private async initialize(): Promise<void> {
    try {
      // Create temp directory
      await this.ensureTempDirectory();

      // Check for FFmpeg availability
      this.ffmpegAvailable = await this.checkFFmpegAvailability();

      // Check for Opus decoder availability
      this.opusDecoderAvailable = await this.checkOpusDecoderAvailability();

      this.isInitialized = true;

      logger.info('AudioConverter initialized', {
        ffmpegAvailable: this.ffmpegAvailable,
        opusDecoderAvailable: this.opusDecoderAvailable,
        tempDir: this.tempDir,
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize AudioConverter', { error });
      throw error;
    }
  }

  /**
   * Convert WebM audio to PCM16 for OpenAI Realtime API
   */
  async convertWebMToPCM16(
    webmData: ArrayBuffer,
    outputSampleRate: number = 24000
  ): Promise<ConversionResult> {
    // TODO: Implement performance monitoring for this method
    // const startTime = performance.now();

    try {
      const config: AudioConversionConfig = {
        inputFormat: 'webm',
        outputFormat: 'pcm16',
        outputSampleRate,
        channels: 1, // Mono for voice
        bitDepth: 16,
        useFFmpeg: this.ffmpegAvailable,
        useOpusDecoder: this.opusDecoderAvailable,
      };

      const result = await this.convert(Buffer.from(webmData), config);

      logger.debug('WebM to PCM16 conversion completed', {
        originalSize: result.originalSize,
        convertedSize: result.convertedSize,
        conversionTime: result.conversionTime,
        compressionRatio: (result.convertedSize / result.originalSize).toFixed(3),
      });

      return result;
    } catch (error) {
      this.stats.failedConversions++;
      logger.error('WebM to PCM16 conversion failed', { error });
      throw error;
    }
  }

  /**
   * Generic audio conversion with automatic format detection
   */
  async convert(
    inputData: Buffer,
    config: AudioConversionConfig
  ): Promise<ConversionResult> {
    if (!this.isInitialized) {
      throw new Error('AudioConverter not initialized');
    }

    const startTime = performance.now();
    this.stats.totalConversions++;
    this.stats.totalInputBytes += inputData.length;

    try {
      // Detect input format if not specified
      const detectedFormat = this.detectAudioFormat(inputData);
      const actualInputFormat = config.inputFormat || detectedFormat;

      // Handle unknown format
      if (actualInputFormat === 'unknown') {
        throw new Error('Unable to detect audio format and no format specified');
      }

      logger.debug('Starting audio conversion', {
        inputFormat: actualInputFormat,
        outputFormat: config.outputFormat,
        inputSize: inputData.length,
        outputSampleRate: config.outputSampleRate,
      });

      let convertedData: Buffer;

      // Choose conversion strategy based on availability and format
      if (this.ffmpegAvailable && this.shouldUseFFmpeg(actualInputFormat, config.outputFormat)) {
        convertedData = await this.convertWithFFmpeg(inputData, {
          ...config,
          inputFormat: actualInputFormat,
        });
      } else if (this.opusDecoderAvailable && actualInputFormat === 'opus') {
        convertedData = await this.convertWithOpusDecoder(inputData, config);
      } else {
        convertedData = await this.convertWithNativeDecoder(inputData, config);
      }

      const conversionTime = performance.now() - startTime;
      this.updateStats(conversionTime, inputData.length, convertedData.length);

      const result: ConversionResult = {
        data: convertedData,
        originalSize: inputData.length,
        convertedSize: convertedData.length,
        conversionTime,
        sampleRate: config.outputSampleRate,
        channels: config.channels,
        format: config.outputFormat,
      };

      this.stats.successfulConversions++;
      this.emit('conversion_complete', result);

      return result;
    } catch (error) {
      this.stats.failedConversions++;
      const conversionTime = performance.now() - startTime;

      logger.error('Audio conversion failed', {
        error,
        inputSize: inputData.length,
        config,
        conversionTime,
      });

      throw error;
    }
  }

  /**
   * Convert using FFmpeg (most reliable, supports all formats)
   */
  private async convertWithFFmpeg(
    inputData: Buffer,
    config: AudioConversionConfig
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', 'pipe:0', // Input from stdin
        '-f', this.getFFmpegOutputFormat(config.outputFormat),
        '-ar', config.outputSampleRate.toString(),
        '-ac', config.channels.toString(),
      ];

      // Add format-specific options
      if (config.outputFormat === 'pcm16') {
        args.push('-acodec', 'pcm_s16le');
      }

      args.push('-'); // Output to stdout

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const chunks: Buffer[] = [];
      let errorOutput = '';

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          const result = Buffer.concat(chunks);
          logger.debug('FFmpeg conversion completed', {
            inputSize: inputData.length,
            outputSize: result.length,
            exitCode: code,
          });
          resolve(result);
        } else {
          logger.error('FFmpeg conversion failed', {
            exitCode: code,
            errorOutput,
            config,
          });
          reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        logger.error('FFmpeg process error', { error });
        reject(error);
      });

      // Write input data and close stdin
      ffmpeg.stdin.write(inputData);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Convert using Opus decoder (faster for Opus/WebM)
   */
  private async convertWithOpusDecoder(
    inputData: Buffer,
    config: AudioConversionConfig
  ): Promise<Buffer> {
    try {
      // Use @discordjs/opus for decoding
      const { OpusEncoder: _OpusEncoder } = await import('@discordjs/opus');

      // This is a simplified approach - in a full implementation,
      // we'd need to extract Opus packets from WebM container first
      logger.warn('Opus decoder conversion not fully implemented, using fallback');
      return this.convertWithNativeDecoder(inputData, config);
    } catch (error) {
      logger.warn('Opus decoder not available, using fallback', { error });
      return this.convertWithNativeDecoder(inputData, config);
    }
  }

  /**
   * Native JavaScript converter (fallback, limited format support)
   */
  private async convertWithNativeDecoder(
    inputData: Buffer,
    config: AudioConversionConfig
  ): Promise<Buffer> {
    logger.warn('Using native decoder fallback - limited format support');

    // For WebM/Opus, we can't do proper decoding without external tools
    // This is a last resort that just resamples if the input is already PCM
    if (config.inputFormat === 'webm' || config.inputFormat === 'opus') {
      throw new Error('WebM/Opus decoding requires FFmpeg or proper Opus decoder');
    }

    // If input is already PCM, we can do sample rate conversion
    if (this.isPCMFormat(inputData)) {
      return this.resamplePCM(inputData, config);
    }

    throw new Error(`Unsupported conversion: ${config.inputFormat} to ${config.outputFormat} without external tools`);
  }

  /**
   * Detect audio format from buffer header
   */
  private detectAudioFormat(data: Buffer): 'webm' | 'opus' | 'wav' | 'mp3' | 'unknown' {
    if (data.length < 4) {return 'unknown';}

    // WebM signature
    if (data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3) {
      return 'webm';
    }

    // WAV signature
    if (data.toString('ascii', 0, 4) === 'RIFF') {
      return 'wav';
    }

    // MP3 signature
    if (data[0] === 0xFF && (data[1] & 0xE0) === 0xE0) {
      return 'mp3';
    }

    // Opus signature (OggS header)
    if (data.toString('ascii', 0, 4) === 'OggS') {
      return 'opus';
    }

    logger.warn('Unknown audio format detected', {
      header: data.subarray(0, 8).toString('hex'),
    });

    return 'unknown';
  }

  /**
   * Check if data is already PCM format
   */
  private isPCMFormat(data: Buffer): boolean {
    // Simple heuristic - check if data looks like PCM
    // This is not foolproof but covers basic cases
    return data.length > 44 && data.toString('ascii', 0, 4) === 'RIFF';
  }

  /**
   * Resample PCM audio (basic implementation)
   */
  private resamplePCM(
    inputData: Buffer,
    _config: AudioConversionConfig
  ): Buffer {
    // This is a simplified resampling - in production, use a proper library
    logger.warn('Using basic PCM resampling - quality may be reduced');

    // For now, just return the input data
    // A proper implementation would use libsamplerate or similar
    return inputData;
  }

  /**
   * Determine if FFmpeg should be used for this conversion
   */
  private shouldUseFFmpeg(inputFormat: string, outputFormat: string): boolean {
    // FFmpeg is the most reliable for WebM/Opus conversion
    return inputFormat === 'webm' || inputFormat === 'opus' || outputFormat === 'pcm16';
  }

  /**
   * Get FFmpeg output format string
   */
  private getFFmpegOutputFormat(format: string): string {
    switch (format) {
      case 'pcm16':
        return 's16le';
      case 'wav':
        return 'wav';
      case 'opus':
        return 'opus';
      default:
        return format;
    }
  }

  /**
   * Check if FFmpeg is available
   */
  private async checkFFmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });

      ffmpeg.on('close', (code) => {
        const available = code === 0;
        logger.debug('FFmpeg availability check', { available, exitCode: code });
        resolve(available);
      });

      ffmpeg.on('error', () => {
        logger.debug('FFmpeg not available');
        resolve(false);
      });
    });
  }

  /**
   * Check if Opus decoder is available
   */
  private async checkOpusDecoderAvailability(): Promise<boolean> {
    try {
      await import('@discordjs/opus');
      logger.debug('Opus decoder available');
      return true;
    } catch {
      logger.debug('Opus decoder not available');
      return false;
    }
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create temp directory', { error, tempDir: this.tempDir });
    }
  }

  /**
   * Update conversion statistics
   */
  private updateStats(conversionTime: number, _inputSize: number, outputSize: number): void {
    this.conversionTimes.push(conversionTime);
    this.stats.totalOutputBytes += outputSize;

    // Keep only recent samples for moving average
    if (this.conversionTimes.length > 100) {
      this.conversionTimes.shift();
    }

    this.stats.avgConversionTime =
      this.conversionTimes.reduce((sum, time) => sum + time, 0) / this.conversionTimes.length;

    this.stats.avgCompressionRatio = this.stats.totalInputBytes > 0
      ? this.stats.totalOutputBytes / this.stats.totalInputBytes
      : 0;
  }

  /**
   * Get conversion statistics
   */
  getStats(): ConversionStats {
    return { ...this.stats };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      await Promise.all(
        files.map(file =>
          fs.unlink(path.join(this.tempDir, file)).catch(() => {})
        )
      );
      logger.debug('Temp files cleaned up', { count: files.length });
    } catch (error) {
      logger.warn('Temp file cleanup failed', { error });
    }
  }
}

// Export singleton instance
export const audioConverter = new AudioConverter();

// Setup cleanup interval
setInterval(() => {
  audioConverter.cleanup();
}, 30 * 60 * 1000); // Every 30 minutes