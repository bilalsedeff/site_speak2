/**
 * Barge-in Types - Real-time voice interruption system
 *
 * Ultra-low latency types for VAD and TTS interruption:
 * - <20ms VAD decision latency
 * - <50ms total barge-in response time
 * - AudioWorklet-based processing
 * - Production-ready error handling
 */

export interface VADDecision {
  /** Whether voice activity is detected */
  active: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Audio level (0-1) normalized */
  level: number;
  /** Timestamp of decision (high-resolution) */
  timestamp: number;
  /** Decision latency in milliseconds */
  latency: number;
  /** Audio characteristics that influenced decision */
  characteristics: {
    energy: number;
    zeroCrossingRate: number;
    isLikelySpeech: boolean;
    spectralCentroid?: number;
  };
}

export interface VADConfig {
  /** Energy threshold for voice detection */
  energyThreshold: number;
  /** Hang time in milliseconds before deactivation */
  hangMs: number;
  /** Smoothing factor for energy (0-1) */
  smoothingFactor: number;
  /** Minimum speech duration in ms to trigger */
  minSpeechDurationMs: number;
  /** Maximum decision latency target in ms */
  maxLatencyMs: number;
  /** Enable advanced spectral analysis */
  useSpectralAnalysis: boolean;
  /** Zero-crossing rate thresholds for speech detection */
  zcrThresholds: {
    min: number;
    max: number;
  };
}

export interface TTSPlaybackState {
  /** Whether TTS is currently playing */
  isPlaying: boolean;
  /** Whether TTS is currently ducked/paused */
  isDucked: boolean;
  /** Current audio position in seconds */
  currentPosition: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Audio volume level (0-1) */
  volume: number;
  /** Playback rate (0.5-2.0) */
  playbackRate: number;
  /** Audio element or source identifier */
  sourceId: string;
}

export interface TTSInterruptionEvent {
  /** Type of interruption */
  type: 'duck' | 'pause' | 'resume' | 'stop';
  /** Timestamp when interruption was triggered */
  timestamp: number;
  /** Time from VAD trigger to interruption execution */
  responseLatency: number;
  /** Reason for interruption */
  reason: 'vad_active' | 'user_command' | 'timeout' | 'error';
  /** Previous state before interruption */
  previousState: TTSPlaybackState;
  /** New state after interruption */
  newState: TTSPlaybackState;
}

export interface BargeInEvent {
  /** Event type */
  type: 'barge_in_detected' | 'barge_in_completed' | 'barge_in_failed';
  /** Timestamp of event */
  timestamp: number;
  /** Total latency from VAD to TTS interruption */
  totalLatency: number;
  /** VAD decision that triggered barge-in */
  vadDecision: VADDecision;
  /** TTS interruption event */
  ttsInterruption?: TTSInterruptionEvent;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Performance metrics */
  metrics: {
    vadLatency: number;
    ttsInterruptLatency: number;
    totalProcessingTime: number;
  };
}

export interface BargeInConfig {
  /** Enable/disable barge-in functionality */
  enabled: boolean;
  /** VAD configuration */
  vad: VADConfig;
  /** TTS interruption behavior */
  ttsInterruption: {
    /** How to handle TTS when barge-in occurs */
    mode: 'duck' | 'pause' | 'stop';
    /** Duck volume level (0-1) when mode is 'duck' */
    duckVolume: number;
    /** Fade duration for smooth transitions (ms) */
    fadeDurationMs: number;
    /** Resume behavior after user stops speaking */
    resumeBehavior: 'auto' | 'manual' | 'restart';
    /** Auto-resume delay in ms */
    autoResumeDelayMs: number;
  };
  /** Performance targets */
  performance: {
    /** Target VAD decision latency in ms */
    targetVadLatencyMs: number;
    /** Target TTS interruption latency in ms */
    targetTtsInterruptLatencyMs: number;
    /** Target total barge-in latency in ms */
    targetTotalLatencyMs: number;
  };
  /** Debounce settings to prevent false triggers */
  debounce: {
    /** Minimum time between barge-in events */
    minTimeBetweenEventsMs: number;
    /** Ignore rapid VAD state changes */
    rapidChangeThresholdMs: number;
  };
}

export interface AudioWorkletBargeInMessage {
  /** Message type */
  type: 'vad_decision' | 'audio_level' | 'performance_update' | 'config_update';
  /** Message payload */
  payload: VADDecision | AudioLevelUpdate | PerformanceMetrics | VADConfig;
  /** High-resolution timestamp */
  timestamp: number;
}

export interface AudioLevelUpdate {
  /** Current audio level (0-1) */
  level: number;
  /** Peak level in recent window */
  peak: number;
  /** RMS level */
  rms: number;
  /** Whether level exceeds threshold */
  aboveThreshold: boolean;
}

export interface PerformanceMetrics {
  /** Average VAD decision latency */
  avgVadLatency: number;
  /** Maximum VAD decision latency */
  maxVadLatency: number;
  /** VAD decisions per second */
  vadDecisionsPerSecond: number;
  /** Audio processing frame rate */
  audioFrameRate: number;
  /** Dropped frames count */
  droppedFrames: number;
  /** CPU usage estimate (0-1) */
  cpuUsage: number;
}

export interface BargeInSession {
  /** Unique session identifier */
  sessionId: string;
  /** Session start timestamp */
  startTime: number;
  /** Current configuration */
  config: BargeInConfig;
  /** Current VAD state */
  vadState: {
    active: boolean;
    lastDecision: VADDecision;
    consecutiveActiveFrames: number;
    consecutiveInactiveFrames: number;
  };
  /** Current TTS state */
  ttsState: TTSPlaybackState;
  /** Session statistics */
  stats: {
    totalBargeInEvents: number;
    avgBargeInLatency: number;
    minBargeInLatency: number;
    maxBargeInLatency: number;
    falsePositives: number;
    missedDetections: number;
  };
  /** Error tracking */
  errors: Array<{
    timestamp: number;
    error: string;
    context: Record<string, unknown>;
  }>;
}

export interface BargeInCallbacks {
  /** Called when barge-in is detected */
  onBargeInDetected: (event: BargeInEvent) => void;
  /** Called when TTS is interrupted */
  onTTSInterrupted: (event: TTSInterruptionEvent) => void;
  /** Called when VAD state changes */
  onVADStateChange: (decision: VADDecision) => void;
  /** Called when audio levels update */
  onAudioLevelUpdate: (levels: AudioLevelUpdate) => void;
  /** Called on performance updates */
  onPerformanceUpdate: (metrics: PerformanceMetrics) => void;
  /** Called on errors */
  onError: (error: BargeInError) => void;
}

export interface BargeInError {
  /** Error code for categorization */
  code: 'VAD_FAILED' | 'TTS_INTERRUPT_FAILED' | 'LATENCY_EXCEEDED' | 'CONFIG_INVALID' | 'AUDIO_CONTEXT_LOST';
  /** Human-readable error message */
  message: string;
  /** Error severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp when error occurred */
  timestamp: number;
  /** Additional context */
  context: {
    sessionId?: string;
    vadDecision?: VADDecision;
    ttsState?: TTSPlaybackState;
    latency?: number;
    [key: string]: unknown;
  };
  /** Recovery suggestions */
  recovery: string[];
}

// Default configurations
export const DEFAULT_VAD_CONFIG: VADConfig = {
  energyThreshold: 0.01,
  hangMs: 50,
  smoothingFactor: 0.1,
  minSpeechDurationMs: 100,
  maxLatencyMs: 20,
  useSpectralAnalysis: false,
  zcrThresholds: {
    min: 0.02,
    max: 0.8,
  },
};

export const DEFAULT_BARGE_IN_CONFIG: BargeInConfig = {
  enabled: true,
  vad: DEFAULT_VAD_CONFIG,
  ttsInterruption: {
    mode: 'duck',
    duckVolume: 0.2,
    fadeDurationMs: 50,
    resumeBehavior: 'auto',
    autoResumeDelayMs: 500,
  },
  performance: {
    targetVadLatencyMs: 20,
    targetTtsInterruptLatencyMs: 30,
    targetTotalLatencyMs: 50,
  },
  debounce: {
    minTimeBetweenEventsMs: 200,
    rapidChangeThresholdMs: 50,
  },
};