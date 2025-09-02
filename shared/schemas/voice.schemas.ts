import { z } from 'zod';

// Voice Session schemas
export const VoiceSessionStatusSchema = z.enum([
  'initializing', 'listening', 'processing', 'speaking', 'paused', 'ended', 'error'
]);

export const VoiceSettingsSchema = z.object({
  name: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'custom']),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  pitch: z.number().min(0).max(2).optional(),
  volume: z.number().min(0).max(1).default(1.0),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
});

export const AudioSettingsSchema = z.object({
  sampleRate: z.number().int().min(8000).max(48000).default(16000),
  channels: z.number().int().min(1).max(2).default(1),
  bitDepth: z.number().int().min(8).max(32).default(16),
  format: z.enum(['wav', 'mp3', 'opus', 'webm']).default('wav'),
  noiseReduction: z.boolean().default(true),
  echoCancellation: z.boolean().default(true),
  autoGainControl: z.boolean().default(true),
});

export const VoiceBehaviorSchema = z.object({
  interruptible: z.boolean().default(true),
  pauseThreshold: z.number().int().min(100).max(5000).default(800),
  maxSilence: z.number().int().min(1000).max(30000).default(8000),
  confirmationRequired: z.boolean().default(false),
  expressiveMode: z.boolean().default(false),
  backgroundMode: z.boolean().default(false),
});

export const VoiceConfigurationSchema = z.object({
  sttProvider: z.enum(['whisper', 'web-speech-api', 'deepgram']).default('whisper'),
  ttsProvider: z.enum(['openai', 'elevenlabs', 'web-speech-api', 'azure']).default('openai'),
  voice: VoiceSettingsSchema,
  audio: AudioSettingsSchema,
  behavior: VoiceBehaviorSchema,
});

export const AudioQualitySchema = z.object({
  inputLevel: z.number().min(0).max(1),
  outputLevel: z.number().min(0).max(1),
  latency: z.number().min(0),
  jitter: z.number().min(0),
  packetLoss: z.number().min(0).max(1),
  signalToNoise: z.number().min(0),
});

export const VoiceSessionMetadataSchema = z.object({
  userAgent: z.string(),
  device: z.enum(['desktop', 'mobile', 'tablet']),
  browser: z.string(),
  microphonePermission: z.boolean(),
  speakerSupport: z.boolean(),
  connectionType: z.enum(['websocket', 'sse', 'polling']),
  quality: AudioQualitySchema,
  startedAt: z.date(),
  endedAt: z.date().optional(),
});

export const VoiceSessionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  status: VoiceSessionStatusSchema,
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  locale: z.enum(['en-US', 'tr-TR', 'es-ES', 'fr-FR', 'de-DE']),
  configuration: VoiceConfigurationSchema,
  metadata: VoiceSessionMetadataSchema,
  interactions: z.array(z.string().uuid()), // References to VoiceInteraction IDs
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Voice Interaction schemas
export const VoiceInteractionTypeSchema = z.enum([
  'question', 'command', 'confirmation', 'clarification', 'interruption'
]);
export const InteractionStatusSchema = z.enum([
  'received', 'processing', 'completed', 'failed', 'cancelled'
]);

export const TranscriptAlternativeSchema = z.object({
  transcript: z.string(),
  confidence: z.number().min(0).max(1),
});

export const VoiceActivitySchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  volume: z.number().min(0).max(1),
  pitch: z.number().optional(),
});

export const VoiceInputSchema = z.object({
  audioData: z.instanceof(ArrayBuffer).optional(),
  transcript: z.string().min(1),
  confidence: z.number().min(0).max(1),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  duration: z.number().min(0),
  alternatives: z.array(TranscriptAlternativeSchema).optional(),
  voiceActivity: z.array(VoiceActivitySchema),
});

export const EmotionMarkerSchema = z.object({
  emotion: z.enum(['happy', 'sad', 'excited', 'calm', 'surprised', 'thoughtful']),
  intensity: z.number().min(0).max(1),
  start: z.number().min(0),
  end: z.number().min(0),
});

export const WordTimingSchema = z.object({
  word: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

export const VoiceOutputSchema = z.object({
  text: z.string().min(1),
  audioUrl: z.string().url().optional(),
  audioData: z.instanceof(ArrayBuffer).optional(),
  ssml: z.string().optional(),
  emotions: z.array(EmotionMarkerSchema).optional(),
  duration: z.number().min(0).optional(),
  wordTimings: z.array(WordTimingSchema).optional(),
});

export const ProcessingMetadataSchema = z.object({
  sttLatency: z.number().min(0).optional(),
  llmLatency: z.number().min(0).optional(),
  ttsLatency: z.number().min(0).optional(),
  totalLatency: z.number().min(0),
  tokensUsed: z.number().int().min(0).optional(),
  model: z.string().optional(),
  intent: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  toolsUsed: z.array(z.string()).optional(),
});

export const VoiceErrorCodeSchema = z.enum([
  'microphone_permission_denied',
  'microphone_not_available',
  'speaker_not_available',
  'network_error',
  'stt_service_unavailable',
  'tts_service_unavailable',
  'llm_service_unavailable',
  'rate_limit_exceeded',
  'session_expired',
  'invalid_audio_format',
  'audio_processing_failed',
  'insufficient_permissions',
  'unknown_error'
]);

export const VoiceErrorSchema = z.object({
  code: VoiceErrorCodeSchema,
  message: z.string().min(1),
  details: z.any().optional(),
  retryable: z.boolean(),
  suggestedAction: z.string().optional(),
});

export const VoiceInteractionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  turnId: z.string().uuid(),
  type: VoiceInteractionTypeSchema,
  status: InteractionStatusSchema,
  input: VoiceInputSchema.optional(),
  output: VoiceOutputSchema.optional(),
  processing: ProcessingMetadataSchema,
  error: VoiceErrorSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Voice Widget schemas
export const WidgetConfigurationSchema = z.object({
  enabled: z.boolean().default(true),
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'custom']).default('bottom-right'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
  activationMethod: z.enum(['click', 'hover', 'voice-detection', 'auto', 'hotkey']).default('click'),
  hotkey: z.string().optional(),
  autoStart: z.boolean().default(false),
  persistentMode: z.boolean().default(false),
});

export const WidgetAppearanceSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto', 'custom']).default('auto'),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#0066cc'),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).default('#f0f0f0'),
  borderRadius: z.number().min(0).max(50).default(12),
  shadow: z.boolean().default(true),
  animation: z.enum(['pulse', 'glow', 'bounce', 'wave', 'none']).default('pulse'),
  icon: z.enum(['microphone', 'chat', 'assistant', 'custom']).default('microphone'),
  customIcon: z.string().url().optional(),
  customCSS: z.string().max(5000).optional(),
});

export const WidgetBehaviorSchema = z.object({
  greetingMessage: z.string().max(200).default('Hi! I\'m your voice assistant. How can I help you today?'),
  placeholder: z.string().max(100).default('Click to start talking...'),
  showTranscript: z.boolean().default(true),
  showSuggestions: z.boolean().default(true),
  showTyping: z.boolean().default(true),
  minimizable: z.boolean().default(true),
  draggable: z.boolean().default(false),
  fullscreenMode: z.boolean().default(false),
  keyboardShortcuts: z.boolean().default(true),
});

export const UserFeedbackSchema = z.object({
  sessionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(1000).optional(),
  timestamp: z.date(),
});

export const PerformanceMetricsSchema = z.object({
  avgLoadTime: z.number().min(0),
  avgResponseTime: z.number().min(0),
  errorRate: z.number().min(0).max(1),
  uptime: z.number().min(0).max(1),
  memoryUsage: z.number().min(0),
  cpuUsage: z.number().min(0).max(1),
});

export const WidgetAnalyticsSchema = z.object({
  totalSessions: z.number().int().min(0),
  avgSessionDuration: z.number().min(0),
  completionRate: z.number().min(0).max(1),
  mostUsedFeatures: z.array(z.string()),
  userFeedback: z.array(UserFeedbackSchema),
  performanceMetrics: PerformanceMetricsSchema,
});

export const VoiceWidgetSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  configuration: WidgetConfigurationSchema,
  appearance: WidgetAppearanceSchema,
  behavior: WidgetBehaviorSchema,
  analytics: WidgetAnalyticsSchema,
});

// Voice Commands and Intents
export const VoiceCommandSchema = z.object({
  phrase: z.string().min(1),
  intent: z.string().min(1),
  parameters: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.object({
    phrase: z.string(),
    intent: z.string(),
    confidence: z.number().min(0).max(1),
  })).optional(),
});

export const IntentParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['entity', 'slot', 'context']),
  required: z.boolean(),
  description: z.string().min(1),
  values: z.array(z.string()).optional(),
});

export const VoiceIntentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  examples: z.array(z.string().min(1)),
  parameters: z.array(IntentParameterSchema),
  response: z.string().optional(),
  action: z.string().optional(),
});

// Streaming Events
export const VoiceStreamEventTypeSchema = z.enum([
  'session_started',
  'listening_started',
  'speech_detected',
  'transcript_partial',
  'transcript_final',
  'processing_started',
  'response_partial',
  'response_final',
  'audio_chunk',
  'action_executed',
  'error',
  'session_ended'
]);

export const VoiceStreamDataSchema = z.object({
  transcript: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  isFinal: z.boolean().optional(),
  text: z.string().optional(),
  audioChunk: z.instanceof(ArrayBuffer).optional(),
  action: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  error: VoiceErrorSchema.optional(),
});

export const VoiceStreamEventSchema = z.object({
  type: VoiceStreamEventTypeSchema,
  data: VoiceStreamDataSchema,
  timestamp: z.date(),
  sessionId: z.string().uuid(),
});

// API Request/Response schemas
export const CreateVoiceSessionRequestSchema = z.object({
  siteId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).default('en'),
  locale: z.enum(['en-US', 'tr-TR', 'es-ES', 'fr-FR', 'de-DE']).default('en-US'),
  configuration: VoiceConfigurationSchema.partial().optional(),
});

export const UpdateVoiceSessionRequestSchema = z.object({
  status: VoiceSessionStatusSchema.optional(),
  configuration: VoiceConfigurationSchema.partial().optional(),
});

export const ProcessVoiceInputRequestSchema = z.object({
  sessionId: z.string().uuid(),
  audioData: z.instanceof(ArrayBuffer).optional(),
  transcript: z.string().min(1).optional(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).optional(),
}).refine(data => data.audioData || data.transcript, {
  message: "Either audioData or transcript must be provided",
});

export const SpeechToTextRequestSchema = z.object({
  audioData: z.instanceof(ArrayBuffer),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']).optional(),
  model: z.string().default('whisper-1'),
});

export const SpeechToTextResponseSchema = z.object({
  transcript: z.string(),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  duration: z.number().min(0),
  segments: z.array(z.object({
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string(),
  })).optional(),
});

export const TextToSpeechRequestSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
});

export const UpdateVoiceWidgetRequestSchema = z.object({
  configuration: WidgetConfigurationSchema.partial().optional(),
  appearance: WidgetAppearanceSchema.partial().optional(),
  behavior: WidgetBehaviorSchema.partial().optional(),
});

export const VoiceAnalyticsRequestSchema = z.object({
  siteId: z.string().uuid(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
  metrics: z.array(z.enum([
    'total_sessions',
    'avg_session_duration',
    'completion_rate',
    'error_rate',
    'user_satisfaction',
    'most_used_features'
  ])).optional(),
});

// Type exports
export type VoiceSessionStatus = z.infer<typeof VoiceSessionStatusSchema>;
export type VoiceSession = z.infer<typeof VoiceSessionSchema>;
export type VoiceConfiguration = z.infer<typeof VoiceConfigurationSchema>;
export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>;
export type AudioSettings = z.infer<typeof AudioSettingsSchema>;
export type VoiceBehavior = z.infer<typeof VoiceBehaviorSchema>;
export type VoiceSessionMetadata = z.infer<typeof VoiceSessionMetadataSchema>;
export type AudioQuality = z.infer<typeof AudioQualitySchema>;
export type VoiceInteraction = z.infer<typeof VoiceInteractionSchema>;
export type VoiceInteractionType = z.infer<typeof VoiceInteractionTypeSchema>;
export type InteractionStatus = z.infer<typeof InteractionStatusSchema>;
export type VoiceInput = z.infer<typeof VoiceInputSchema>;
export type VoiceOutput = z.infer<typeof VoiceOutputSchema>;
export type VoiceError = z.infer<typeof VoiceErrorSchema>;
export type VoiceErrorCode = z.infer<typeof VoiceErrorCodeSchema>;
export type VoiceWidget = z.infer<typeof VoiceWidgetSchema>;
export type WidgetConfiguration = z.infer<typeof WidgetConfigurationSchema>;
export type WidgetAppearance = z.infer<typeof WidgetAppearanceSchema>;
export type WidgetBehavior = z.infer<typeof WidgetBehaviorSchema>;
export type WidgetAnalytics = z.infer<typeof WidgetAnalyticsSchema>;
export type VoiceCommand = z.infer<typeof VoiceCommandSchema>;
export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;
export type VoiceStreamEvent = z.infer<typeof VoiceStreamEventSchema>;
export type VoiceStreamEventType = z.infer<typeof VoiceStreamEventTypeSchema>;
export type VoiceStreamData = z.infer<typeof VoiceStreamDataSchema>;
export type CreateVoiceSessionRequest = z.infer<typeof CreateVoiceSessionRequestSchema>;
export type UpdateVoiceSessionRequest = z.infer<typeof UpdateVoiceSessionRequestSchema>;
export type ProcessVoiceInputRequest = z.infer<typeof ProcessVoiceInputRequestSchema>;
export type SpeechToTextRequest = z.infer<typeof SpeechToTextRequestSchema>;
export type SpeechToTextResponse = z.infer<typeof SpeechToTextResponseSchema>;
export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>;
export type UpdateVoiceWidgetRequest = z.infer<typeof UpdateVoiceWidgetRequestSchema>;
export type VoiceAnalyticsRequest = z.infer<typeof VoiceAnalyticsRequestSchema>;
