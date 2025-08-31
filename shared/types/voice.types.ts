import { BaseEntity, SupportedLanguage, SupportedLocale } from './common.types';

// Voice Session Types
export interface VoiceSession extends BaseEntity {
  sessionId: string;
  siteId: string;
  userId?: string;
  status: VoiceSessionStatus;
  language: SupportedLanguage;
  locale: SupportedLocale;
  configuration: VoiceConfiguration;
  metadata: VoiceSessionMetadata;
  interactions: VoiceInteraction[];
}

export type VoiceSessionStatus = 'initializing' | 'listening' | 'processing' | 'speaking' | 'paused' | 'ended' | 'error';

export interface VoiceConfiguration {
  sttProvider: 'whisper' | 'web-speech-api' | 'deepgram';
  ttsProvider: 'openai' | 'elevenlabs' | 'web-speech-api' | 'azure';
  voice: VoiceSettings;
  audio: AudioSettings;
  behavior: VoiceBehavior;
}

export interface VoiceSettings {
  name: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'custom';
  speed: number; // 0.25 to 4.0
  pitch?: number; // for web speech API
  volume?: number; // 0.0 to 1.0
  stability?: number; // for ElevenLabs
  similarity?: number; // for ElevenLabs
}

export interface AudioSettings {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  format: 'wav' | 'mp3' | 'opus' | 'webm';
  noiseReduction: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface VoiceBehavior {
  interruptible: boolean;
  pauseThreshold: number; // ms of silence before processing
  maxSilence: number; // max silence before timeout
  confirmationRequired: boolean;
  expressiveMode: boolean; // emotional expressions in TTS
  backgroundMode: boolean; // continue listening in background
}

export interface VoiceSessionMetadata {
  userAgent: string;
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  microphonePermission: boolean;
  speakerSupport: boolean;
  connectionType: 'websocket' | 'sse' | 'polling';
  quality: AudioQuality;
  startedAt: Date;
  endedAt?: Date;
}

export interface AudioQuality {
  inputLevel: number;
  outputLevel: number;
  latency: number;
  jitter: number;
  packetLoss: number;
  signalToNoise: number;
}

// Voice Interaction Types
export interface VoiceInteraction extends BaseEntity {
  sessionId: string;
  turnId: string;
  type: VoiceInteractionType;
  status: InteractionStatus;
  input?: VoiceInput;
  output?: VoiceOutput;
  processing: ProcessingMetadata;
  error?: VoiceError;
}

export type VoiceInteractionType = 'question' | 'command' | 'confirmation' | 'clarification' | 'interruption';
export type InteractionStatus = 'received' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface VoiceInput {
  audioData?: ArrayBuffer;
  transcript: string;
  confidence: number;
  language: SupportedLanguage;
  duration: number; // in seconds
  alternatives?: TranscriptAlternative[];
  voiceActivity: VoiceActivity[];
}

export interface TranscriptAlternative {
  transcript: string;
  confidence: number;
}

export interface VoiceActivity {
  start: number;
  end: number;
  volume: number;
  pitch?: number;
}

export interface VoiceOutput {
  text: string;
  audioUrl?: string;
  audioData?: ArrayBuffer;
  ssml?: string; // Speech Synthesis Markup Language
  emotions?: EmotionMarker[];
  duration?: number;
  wordTimings?: WordTiming[];
}

export interface EmotionMarker {
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'surprised' | 'thoughtful';
  intensity: number; // 0-1
  start: number;
  end: number;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface ProcessingMetadata {
  sttLatency?: number;
  llmLatency?: number;
  ttsLatency?: number;
  totalLatency: number;
  tokensUsed?: number;
  model?: string;
  intent?: string;
  confidence?: number;
  toolsUsed?: string[];
}

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
  details?: any;
  retryable: boolean;
  suggestedAction?: string;
}

export type VoiceErrorCode = 
  | 'microphone_permission_denied'
  | 'microphone_not_available'
  | 'speaker_not_available'
  | 'network_error'
  | 'stt_service_unavailable'
  | 'tts_service_unavailable'
  | 'llm_service_unavailable'
  | 'rate_limit_exceeded'
  | 'session_expired'
  | 'invalid_audio_format'
  | 'audio_processing_failed'
  | 'insufficient_permissions'
  | 'unknown_error';

// Voice Widget Types
export interface VoiceWidget {
  id: string;
  siteId: string;
  configuration: WidgetConfiguration;
  appearance: WidgetAppearance;
  behavior: WidgetBehavior;
  analytics: WidgetAnalytics;
}

export interface WidgetConfiguration {
  enabled: boolean;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';
  size: 'small' | 'medium' | 'large';
  activationMethod: 'click' | 'hover' | 'voice-detection' | 'auto' | 'hotkey';
  hotkey?: string; // e.g., "Ctrl+Space"
  autoStart: boolean;
  persistentMode: boolean;
}

export interface WidgetAppearance {
  theme: 'light' | 'dark' | 'auto' | 'custom';
  primaryColor: string;
  secondaryColor: string;
  borderRadius: number;
  shadow: boolean;
  animation: 'pulse' | 'glow' | 'bounce' | 'wave' | 'none';
  icon: 'microphone' | 'chat' | 'assistant' | 'custom';
  customIcon?: string;
  customCSS?: string;
}

export interface WidgetBehavior {
  greetingMessage: string;
  placeholder: string;
  showTranscript: boolean;
  showSuggestions: boolean;
  showTyping: boolean;
  minimizable: boolean;
  draggable: boolean;
  fullscreenMode: boolean;
  keyboardShortcuts: boolean;
}

export interface WidgetAnalytics {
  totalSessions: number;
  avgSessionDuration: number;
  completionRate: number;
  mostUsedFeatures: string[];
  userFeedback: UserFeedback[];
  performanceMetrics: PerformanceMetrics;
}

export interface UserFeedback {
  sessionId: string;
  rating: number; // 1-5
  feedback?: string;
  timestamp: Date;
}

export interface PerformanceMetrics {
  avgLoadTime: number;
  avgResponseTime: number;
  errorRate: number;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
}

// Voice Commands and Intents
export interface VoiceCommand {
  phrase: string;
  intent: string;
  parameters?: Record<string, any>;
  confidence: number;
  alternatives?: VoiceCommand[];
}

export interface VoiceIntent {
  name: string;
  description: string;
  examples: string[];
  parameters: IntentParameter[];
  response?: string;
  action?: string;
}

export interface IntentParameter {
  name: string;
  type: 'entity' | 'slot' | 'context';
  required: boolean;
  description: string;
  values?: string[];
}

// Streaming Types for Real-time Communication
export interface VoiceStreamEvent {
  type: VoiceStreamEventType;
  data: any;
  timestamp: Date;
  sessionId: string;
}

export type VoiceStreamEventType = 
  | 'session_started'
  | 'listening_started'
  | 'speech_detected'
  | 'transcript_partial'
  | 'transcript_final'
  | 'processing_started'
  | 'response_partial'
  | 'response_final'
  | 'audio_chunk'
  | 'action_executed'
  | 'error'
  | 'session_ended';

export interface VoiceStreamData {
  transcript?: string;
  confidence?: number;
  isFinal?: boolean;
  text?: string;
  audioChunk?: ArrayBuffer;
  action?: string;
  parameters?: Record<string, any>;
  error?: VoiceError;
}