/**
 * Audio Worklet Processor for Voice Turn Manager
 * 
 * Handles low-latency audio processing on the audio thread:
 * - Voice Activity Detection (VAD)
 * - Opus frame packetization (20ms frames)
 * - Audio level monitoring
 * - Zero-crossing rate analysis for VAD
 */

// Register the processor
class VoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // Initialize configuration from options
    this.vadThreshold = options.processorOptions?.vadThreshold || 0.01;
    this.frameMs = options.processorOptions?.frameMs || 20;
    this.sampleRate = options.processorOptions?.sampleRate || 48000;
    
    // Calculate frame size in samples
    this.frameSize = Math.floor(this.sampleRate * this.frameMs / 1000);
    
    // VAD state
    this.vadActive = false;
    this.vadHangSamples = Math.floor(this.sampleRate * 0.05); // 50ms hang time
    this.vadHangCounter = 0;
    this.smoothedEnergy = 0;
    this.energySmoothingFactor = 0.1;
    
    // Audio buffering for Opus frames
    this.audioBuffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;
    
    // Performance tracking
    this.processedFrames = 0;
    this.lastReportTime = currentTime;
    
    console.log('[VoiceProcessor] Initialized', {
      vadThreshold: this.vadThreshold,
      frameMs: this.frameMs,
      sampleRate: this.sampleRate,
      frameSize: this.frameSize
    });
  }

  /**
   * Process audio data on the audio thread
   * This runs at high priority with minimal latency
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Skip processing if no input
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    if (!inputChannel) {
      return true;
    }

    // Process each sample in the input buffer
    for (let i = 0; i < inputChannel.length; i++) {
      const sample = inputChannel[i];
      
      // Add sample to frame buffer
      this.audioBuffer[this.bufferIndex] = sample;
      this.bufferIndex++;
      
      // Process complete frame
      if (this.bufferIndex >= this.frameSize) {
        this.processAudioFrame(this.audioBuffer);
        this.bufferIndex = 0;
      }
    }

    // Performance monitoring (every second)
    this.processedFrames++;
    if (currentTime - this.lastReportTime >= 1.0) {
      this.reportPerformanceMetrics();
      this.lastReportTime = currentTime;
    }

    return true; // Keep processor alive
  }

  /**
   * Process complete audio frame for VAD and packetization
   */
  processAudioFrame(frameData) {
    try {
      // Calculate audio metrics
      const metrics = this.calculateAudioMetrics(frameData);
      
      // Update VAD state
      const vadChanged = this.updateVADState(metrics);
      
      // Send VAD state updates
      if (vadChanged) {
        this.port.postMessage({
          type: 'vad_state',
          active: this.vadActive,
          level: metrics.normalizedLevel
        });
      }
      
      // Always send opus frame for streaming
      if (this.vadActive || this.vadHangCounter > 0) {
        this.sendOpusFrame(frameData);
      }
      
    } catch (error) {
      console.error('[VoiceProcessor] Frame processing error:', error);
    }
  }

  /**
   * Calculate audio metrics for VAD
   */
  calculateAudioMetrics(frameData) {
    let energy = 0;
    let zeroCrossings = 0;
    let maxAmplitude = 0;
    
    // Calculate energy and zero-crossings
    for (let i = 0; i < frameData.length; i++) {
      const sample = frameData[i];
      const absSample = Math.abs(sample);
      
      energy += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, absSample);
      
      // Count zero crossings (sign changes)
      if (i > 0) {
        const prevSample = frameData[i - 1];
        if ((sample >= 0 && prevSample < 0) || (sample < 0 && prevSample >= 0)) {
          zeroCrossings++;
        }
      }
    }
    
    // Calculate RMS energy
    const rmsEnergy = Math.sqrt(energy / frameData.length);
    
    // Smooth energy with exponential averaging
    this.smoothedEnergy = this.energySmoothingFactor * rmsEnergy + 
                         (1 - this.energySmoothingFactor) * this.smoothedEnergy;
    
    // Zero crossing rate (normalized)
    const zcr = zeroCrossings / frameData.length;
    
    return {
      energy: rmsEnergy,
      smoothedEnergy: this.smoothedEnergy,
      normalizedLevel: Math.min(rmsEnergy / this.vadThreshold, 1.0),
      maxAmplitude,
      zeroCrossingRate: zcr,
      isLikelySpeech: zcr > 0.02 && zcr < 0.8, // Typical speech ZCR range
    };
  }

  /**
   * Update Voice Activity Detection state
   */
  updateVADState(metrics) {
    const wasActive = this.vadActive;
    
    // Multi-criteria VAD decision
    const energyActive = metrics.smoothedEnergy > this.vadThreshold;
    const speechCharacteristics = metrics.isLikelySpeech && metrics.maxAmplitude > 0.001;
    
    if (energyActive && speechCharacteristics) {
      // Speech detected
      this.vadActive = true;
      this.vadHangCounter = this.vadHangSamples; // Reset hang counter
    } else if (this.vadActive) {
      // In active state, apply hang time before deactivating
      this.vadHangCounter--;
      if (this.vadHangCounter <= 0) {
        this.vadActive = false;
      }
    }
    
    return this.vadActive !== wasActive;
  }

  /**
   * Send Opus frame to main thread
   */
  sendOpusFrame(frameData) {
    try {
      // Convert Float32Array to Int16Array for Opus encoding
      // (Opus encoding would happen in the main thread or server)
      const int16Data = new Int16Array(frameData.length);
      for (let i = 0; i < frameData.length; i++) {
        // Convert to 16-bit signed integer
        const sample = Math.max(-1, Math.min(1, frameData[i]));
        int16Data[i] = Math.floor(sample * 32767);
      }
      
      // Send frame to main thread
      this.port.postMessage({
        type: 'opus_frame',
        frame: int16Data.buffer,
        timestamp: currentTime,
        vadActive: this.vadActive,
        frameSize: this.frameSize,
        sampleRate: this.sampleRate
      });
      
    } catch (error) {
      console.error('[VoiceProcessor] Error sending Opus frame:', error);
    }
  }

  /**
   * Report performance metrics
   */
  reportPerformanceMetrics() {
    const fps = this.processedFrames;
    const expectedFps = 1000 / this.frameMs; // Expected frames per second
    const cpuUsage = (fps / expectedFps) * 100;
    
    console.log(`[VoiceProcessor] Performance: ${fps} frames/sec (${cpuUsage.toFixed(1)}% of expected)`);
    
    // Reset counter
    this.processedFrames = 0;
    
    // Warn about performance issues
    if (fps < expectedFps * 0.9) {
      console.warn(`[VoiceProcessor] Performance warning: Processing ${fps} frames/sec, expected ${expectedFps}`);
    }
  }

  /**
   * Handle parameter changes from main thread
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'vadThreshold',
        defaultValue: 0.01,
        minValue: 0.001,
        maxValue: 0.1
      },
      {
        name: 'vadSensitivity',
        defaultValue: 1.0,
        minValue: 0.1,
        maxValue: 2.0
      }
    ];
  }
}

// Register the processor with the audio worklet
registerProcessor('voice-processor', VoiceProcessor);