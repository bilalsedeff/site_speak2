/**
 * VAD AudioWorklet Processor - Ultra-low latency voice activity detection
 *
 * Handles real-time VAD processing on the audio thread:
 * - <20ms decision latency target
 * - Energy + zero-crossing analysis
 * - Spectral analysis for advanced detection
 * - 10-20ms frame processing with debounce
 * - Opus-compatible 48kHz operation
 */

// Register the VAD processor
class VADProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Initialize configuration
    const vadConfig = options.processorOptions?.vadConfig || {};
    this.sessionId = options.processorOptions?.sessionId || 'unknown';

    // VAD Configuration
    this.energyThreshold = vadConfig.energyThreshold || 0.01;
    this.hangMs = vadConfig.hangMs || 50;
    this.smoothingFactor = vadConfig.smoothingFactor || 0.1;
    this.minSpeechDurationMs = vadConfig.minSpeechDurationMs || 100;
    this.maxLatencyMs = vadConfig.maxLatencyMs || 20;
    this.useSpectralAnalysis = vadConfig.useSpectralAnalysis || false;
    this.zcrMin = vadConfig.zcrThresholds?.min || 0.02;
    this.zcrMax = vadConfig.zcrThresholds?.max || 0.8;

    // Audio processing settings
    this.sampleRate = 48000; // Standard for Opus
    this.frameMs = 20; // 20ms frames for optimal latency
    this.frameSize = Math.floor(this.sampleRate * this.frameMs / 1000);

    // VAD state
    this.vadActive = false;
    this.hangSamples = Math.floor(this.sampleRate * this.hangMs / 1000);
    this.hangCounter = 0;
    this.smoothedEnergy = 0;
    this.speechFrameCounter = 0;
    this.minSpeechFrames = Math.floor(this.minSpeechDurationMs / this.frameMs);

    // Audio buffering
    this.audioBuffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;

    // Performance tracking
    this.frameCount = 0;
    this.startTime = currentTime;
    this.lastReportTime = currentTime;
    this.processingTimes = [];

    // Spectral analysis (if enabled)
    if (this.useSpectralAnalysis) {
      this.setupSpectralAnalysis();
    }

    console.log('[VADProcessor] Initialized', {
      sessionId: this.sessionId,
      energyThreshold: this.energyThreshold,
      frameMs: this.frameMs,
      frameSize: this.frameSize,
      spectralAnalysis: this.useSpectralAnalysis
    });
  }

  /**
   * Process audio data on the audio thread
   */
  process(inputs, outputs, parameters) {
    const startProcessingTime = currentTime;
    const input = inputs[0];

    // Skip processing if no input
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    if (!inputChannel || inputChannel.length === 0) {
      return true;
    }

    try {
      // Process each sample in the input buffer
      for (let i = 0; i < inputChannel.length; i++) {
        const sample = inputChannel[i];

        // Add sample to frame buffer
        this.audioBuffer[this.bufferIndex] = sample;
        this.bufferIndex++;

        // Process complete frame
        if (this.bufferIndex >= this.frameSize) {
          this.processAudioFrame(this.audioBuffer.slice(0, this.frameSize), startProcessingTime);
          this.bufferIndex = 0;
        }
      }

      // Track processing performance
      const processingTime = (currentTime - startProcessingTime) * 1000; // Convert to ms
      this.processingTimes.push(processingTime);

      // Report performance metrics periodically
      if (currentTime - this.lastReportTime >= 1.0) {
        this.reportPerformanceMetrics();
        this.lastReportTime = currentTime;
      }

    } catch (error) {
      console.error('[VADProcessor] Processing error:', error);
    }

    return true; // Keep processor alive
  }

  /**
   * Process complete audio frame for VAD analysis
   */
  processAudioFrame(frameData, processingStartTime) {
    try {
      const frameStartTime = currentTime;

      // Calculate audio metrics
      const metrics = this.calculateAudioMetrics(frameData);

      // Perform VAD decision
      const decision = this.makeVADDecision(metrics, frameStartTime);

      // Calculate decision latency
      const decisionLatency = (currentTime - frameStartTime) * 1000; // Convert to ms

      // Send VAD decision to main thread
      this.port.postMessage({
        type: 'vad_decision',
        payload: {
          ...decision,
          latency: decisionLatency
        },
        timestamp: frameStartTime
      });

      // Send audio level updates
      this.port.postMessage({
        type: 'audio_level',
        payload: {
          level: metrics.normalizedLevel,
          peak: metrics.maxAmplitude,
          rms: metrics.energy,
          aboveThreshold: metrics.energy > this.energyThreshold
        },
        timestamp: frameStartTime
      });

      this.frameCount++;

    } catch (error) {
      console.error('[VADProcessor] Frame processing error:', error);
    }
  }

  /**
   * Calculate comprehensive audio metrics
   */
  calculateAudioMetrics(frameData) {
    let energy = 0;
    let zeroCrossings = 0;
    let maxAmplitude = 0;
    let spectralCentroid = 0;

    // Basic audio analysis
    for (let i = 0; i < frameData.length; i++) {
      const sample = frameData[i];
      const absSample = Math.abs(sample);

      // Energy calculation
      energy += sample * sample;
      maxAmplitude = Math.max(maxAmplitude, absSample);

      // Zero crossings (sign changes)
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
    this.smoothedEnergy = this.smoothingFactor * rmsEnergy +
                         (1 - this.smoothingFactor) * this.smoothedEnergy;

    // Zero crossing rate (normalized)
    const zcr = zeroCrossings / frameData.length;

    // Spectral analysis (if enabled)
    if (this.useSpectralAnalysis) {
      spectralCentroid = this.calculateSpectralCentroid(frameData);
    }

    return {
      energy: rmsEnergy,
      smoothedEnergy: this.smoothedEnergy,
      normalizedLevel: Math.min(this.smoothedEnergy / this.energyThreshold, 1.0),
      maxAmplitude,
      zeroCrossingRate: zcr,
      spectralCentroid,
      isLikelySpeech: zcr >= this.zcrMin && zcr <= this.zcrMax,
      hasSignificantEnergy: rmsEnergy > this.energyThreshold * 0.5
    };
  }

  /**
   * Make VAD decision based on audio metrics
   */
  makeVADDecision(metrics, timestamp) {
    const wasActive = this.vadActive;

    // Multi-criteria VAD decision
    const energyActive = metrics.smoothedEnergy > this.energyThreshold;
    const speechCharacteristics = metrics.isLikelySpeech && metrics.hasSignificantEnergy;
    const spectralValid = !this.useSpectralAnalysis || this.isValidSpeechSpectrum(metrics.spectralCentroid);

    // Determine if speech is detected
    const speechDetected = energyActive && speechCharacteristics && spectralValid;

    if (speechDetected) {
      this.speechFrameCounter++;

      // Activate VAD if we have enough consecutive speech frames
      if (this.speechFrameCounter >= this.minSpeechFrames) {
        this.vadActive = true;
        this.hangCounter = this.hangSamples; // Reset hang counter
      }
    } else {
      this.speechFrameCounter = 0;

      // Apply hang time if currently active
      if (this.vadActive) {
        this.hangCounter--;
        if (this.hangCounter <= 0) {
          this.vadActive = false;
        }
      }
    }

    // Calculate confidence based on how far above threshold we are
    let confidence = 0;
    if (speechDetected) {
      const energyRatio = metrics.smoothedEnergy / this.energyThreshold;
      const zcrScore = metrics.isLikelySpeech ? 1.0 : 0.5;
      confidence = Math.min((energyRatio * zcrScore), 1.0);
    }

    return {
      active: this.vadActive,
      confidence,
      level: metrics.normalizedLevel,
      timestamp: timestamp * 1000, // Convert to milliseconds
      characteristics: {
        energy: metrics.energy,
        zeroCrossingRate: metrics.zeroCrossingRate,
        isLikelySpeech: metrics.isLikelySpeech,
        spectralCentroid: metrics.spectralCentroid
      }
    };
  }

  /**
   * Setup spectral analysis (simplified FFT for spectral centroid)
   */
  setupSpectralAnalysis() {
    // For simplicity, we'll use a basic spectral centroid calculation
    // In a full implementation, you might use a proper FFT library
    this.spectralBufferSize = Math.min(this.frameSize, 512);
    console.log('[VADProcessor] Spectral analysis enabled', {
      bufferSize: this.spectralBufferSize
    });
  }

  /**
   * Calculate spectral centroid (simplified)
   */
  calculateSpectralCentroid(frameData) {
    if (!this.useSpectralAnalysis || frameData.length < 32) {
      return 0;
    }

    // Simple spectral centroid estimation
    // In practice, you'd use proper FFT for accurate results
    let weightedSum = 0;
    let magnitudeSum = 0;

    const stepSize = Math.max(1, Math.floor(frameData.length / 32));

    for (let i = 0; i < frameData.length; i += stepSize) {
      const magnitude = Math.abs(frameData[i]);
      const frequency = (i / frameData.length) * (this.sampleRate / 2);

      weightedSum += frequency * magnitude;
      magnitudeSum += magnitude;
    }

    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }

  /**
   * Check if spectral centroid indicates valid speech
   */
  isValidSpeechSpectrum(spectralCentroid) {
    if (!this.useSpectralAnalysis) {
      return true;
    }

    // Typical speech has spectral centroid between 500Hz and 4000Hz
    return spectralCentroid >= 500 && spectralCentroid <= 4000;
  }

  /**
   * Report performance metrics
   */
  reportPerformanceMetrics() {
    const runTime = currentTime - this.startTime;
    const framesPerSecond = this.frameCount / runTime;
    const expectedFps = 1000 / this.frameMs;

    // Calculate average processing time
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0;

    const maxProcessingTime = this.processingTimes.length > 0
      ? Math.max(...this.processingTimes)
      : 0;

    const metrics = {
      avgVadLatency: avgProcessingTime,
      maxVadLatency: maxProcessingTime,
      vadDecisionsPerSecond: framesPerSecond,
      audioFrameRate: framesPerSecond,
      droppedFrames: Math.max(0, (expectedFps * runTime) - this.frameCount),
      cpuUsage: Math.min(1.0, avgProcessingTime / this.frameMs)
    };

    // Send to main thread
    this.port.postMessage({
      type: 'performance_update',
      payload: metrics,
      timestamp: currentTime
    });

    // Log performance
    console.log(`[VADProcessor] Performance: ${framesPerSecond.toFixed(1)} fps, avg latency: ${avgProcessingTime.toFixed(2)}ms`);

    // Reset tracking arrays to prevent memory growth
    this.processingTimes = this.processingTimes.slice(-50);

    // Warn about performance issues
    if (maxProcessingTime > this.maxLatencyMs) {
      console.warn(`[VADProcessor] Latency warning: ${maxProcessingTime.toFixed(2)}ms > ${this.maxLatencyMs}ms target`);
    }

    if (framesPerSecond < expectedFps * 0.9) {
      console.warn(`[VADProcessor] Frame rate warning: ${framesPerSecond.toFixed(1)} fps < ${expectedFps} expected`);
    }
  }

  /**
   * Handle configuration updates from main thread
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'energyThreshold',
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
registerProcessor('vad-processor', VADProcessor);