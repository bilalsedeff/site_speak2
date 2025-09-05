import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sites } from './sites';
import { users } from './users';

export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: varchar('session_id', { length: 100 }).notNull().unique(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional, for anonymous sessions
  
  // Session status and lifecycle
  status: varchar('status', { length: 20 }).notNull().default('initializing'), // 'initializing', 'listening', 'processing', 'speaking', 'paused', 'ended', 'error'
  
  // Language and locale settings
  language: varchar('language', { length: 5 }).notNull().default('en'),
  locale: varchar('locale', { length: 10 }).notNull().default('en-US'),
  
  // Voice configuration
  configuration: jsonb('configuration').notNull().default({
    sttProvider: 'whisper',
    ttsProvider: 'openai',
    voice: {
      name: 'alloy',
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0
    },
    audio: {
      sampleRate: 24000,
      channels: 1,
      format: 'wav',
      noiseReduction: true
    },
    behavior: {
      interruptible: true,
      pauseThreshold: 1500,
      maxSilence: 5000,
      confirmationRequired: false
    }
  }),
  
  // Session metadata
  metadata: jsonb('metadata').notNull().default({}),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  device: varchar('device', { length: 20 }), // 'desktop', 'mobile', 'tablet'
  browser: varchar('browser', { length: 50 }),
  
  // Connection and quality information
  connectionType: varchar('connection_type', { length: 20 }).default('websocket'), // 'websocket', 'sse', 'polling'
  microphonePermission: boolean('microphone_permission').default(false),
  speakerSupport: boolean('speaker_support').default(true),
  
  // Quality metrics
  audioQuality: jsonb('audio_quality').default({
    inputLevel: 0,
    outputLevel: 0,
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    signalToNoise: 0
  }),
  
  // Session statistics
  totalInteractions: integer('total_interactions').default(0),
  totalDuration: integer('total_duration').default(0), // in seconds
  averageResponseTime: real('average_response_time').default(0), // in milliseconds
  
  // Session lifecycle timestamps
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  
  // Error tracking
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_voice_sessions_session_id').on(table.sessionId),
  index('idx_voice_sessions_site').on(table.siteId),
  index('idx_voice_sessions_user').on(table.userId),
  index('idx_voice_sessions_status').on(table.status),
  index('idx_voice_sessions_started').on(table.startedAt),
  index('idx_voice_sessions_active').on(table.lastActivityAt),
]);

export const voiceInteractions = pgTable('voice_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => voiceSessions.id, { onDelete: 'cascade' }).notNull(),
  turnId: varchar('turn_id', { length: 100 }).notNull(),
  
  // Interaction type and status
  type: varchar('type', { length: 20 }).notNull(), // 'question', 'command', 'confirmation', 'clarification', 'interruption'
  status: varchar('status', { length: 20 }).notNull().default('received'), // 'received', 'processing', 'completed', 'failed', 'cancelled'
  
  // User input
  input: jsonb('input').default({}), // Contains transcript, confidence, audio data reference, etc.
  
  // Assistant output
  output: jsonb('output').default({}), // Contains response text, audio URL, SSML, emotions, etc.
  
  // Processing metadata
  processing: jsonb('processing').notNull().default({}), // Latency metrics, tokens used, models, etc.
  
  // Intent and context
  detectedIntent: varchar('detected_intent', { length: 100 }),
  intentConfidence: real('intent_confidence'),
  entities: jsonb('entities').default([]),
  context: jsonb('context').default({}),
  
  // Tool usage
  toolsCalled: jsonb('tools_called').default([]),
  actionsExecuted: jsonb('actions_executed').default([]),
  
  // Quality metrics
  userSatisfaction: integer('user_satisfaction'), // 1-5 rating if provided
  qualityScore: real('quality_score'), // Computed quality score
  
  // Error information
  error: text('error'),
  errorDetails: jsonb('error_details').default({}),
  
  // Processing timestamps
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_voice_interactions_session').on(table.sessionId),
  index('idx_voice_interactions_turn_id').on(table.turnId),
  index('idx_voice_interactions_type').on(table.type),
  index('idx_voice_interactions_status').on(table.status),
  index('idx_voice_interactions_intent').on(table.detectedIntent),
  index('idx_voice_interactions_received').on(table.receivedAt),
]);

export const voiceAudioFiles = pgTable('voice_audio_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  interactionId: uuid('interaction_id').references(() => voiceInteractions.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => voiceSessions.id, { onDelete: 'cascade' }).notNull(),
  
  // File information
  filename: varchar('filename', { length: 255 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }),
  filePath: text('file_path').notNull(),
  fileUrl: text('file_url'),
  
  // Audio metadata
  audioType: varchar('audio_type', { length: 20 }).notNull(), // 'input', 'output', 'processed'
  format: varchar('format', { length: 10 }).notNull(), // 'wav', 'mp3', 'opus', 'webm'
  duration: real('duration'), // in seconds
  sampleRate: integer('sample_rate'),
  channels: integer('channels'),
  bitrate: integer('bitrate'),
  fileSize: integer('file_size'), // in bytes
  
  // Processing information
  processedBy: varchar('processed_by', { length: 50 }), // 'whisper', 'openai-tts', 'elevenlabs', etc.
  processingMetadata: jsonb('processing_metadata').default({}),
  
  // Quality metrics
  signalToNoise: real('signal_to_noise'),
  voiceActivity: jsonb('voice_activity').default([]), // Voice activity detection results
  
  // Storage and cleanup
  storageProvider: varchar('storage_provider', { length: 20 }).default('local'), // 'local', 's3', 'r2'
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isTemporary: boolean('is_temporary').default(true),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_voice_audio_interaction').on(table.interactionId),
  index('idx_voice_audio_session').on(table.sessionId),
  index('idx_voice_audio_type').on(table.audioType),
  index('idx_voice_audio_expires').on(table.expiresAt),
  index('idx_voice_audio_temporary').on(table.isTemporary),
]);

export const voiceWidgets = pgTable('voice_widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Widget status
  enabled: boolean('enabled').default(true),
  version: varchar('version', { length: 20 }).default('1.0.0'),
  
  // Widget configuration
  configuration: jsonb('configuration').notNull().default({
    position: 'bottom-right',
    size: 'medium',
    activationMethod: 'click',
    autoStart: false,
    persistentMode: false
  }),
  
  // Appearance settings
  appearance: jsonb('appearance').notNull().default({
    theme: 'auto',
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    borderRadius: 8,
    shadow: true,
    animation: 'pulse',
    icon: 'microphone'
  }),
  
  // Behavior settings
  behavior: jsonb('behavior').notNull().default({
    greetingMessage: 'Hi! How can I help you today?',
    placeholder: 'Click to start speaking...',
    showTranscript: true,
    showSuggestions: true,
    showTyping: true,
    minimizable: true,
    draggable: false,
    fullscreenMode: false,
    keyboardShortcuts: true
  }),
  
  // Analytics and performance
  analytics: jsonb('analytics').notNull().default({
    totalSessions: 0,
    avgSessionDuration: 0,
    completionRate: 0,
    mostUsedFeatures: [],
    userFeedback: [],
    performanceMetrics: {
      avgLoadTime: 0,
      avgResponseTime: 0,
      errorRate: 0,
      uptime: 100
    }
  }),
  
  // Widget embedding
  embedCode: text('embed_code'),
  widgetUrl: text('widget_url'),
  
  // Custom styling
  customCSS: text('custom_css'),
  customJS: text('custom_js'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_voice_widgets_site').on(table.siteId),
  index('idx_voice_widgets_enabled').on(table.enabled),
]);

// Zod schemas for validation
export const insertVoiceSessionSchema = createInsertSchema(voiceSessions, {
  status: z.enum(['initializing', 'listening', 'processing', 'speaking', 'paused', 'ended', 'error']),
  language: z.string().length(2),
  locale: z.string().max(10),
  device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  connectionType: z.enum(['websocket', 'sse', 'polling']).optional(),
});

export const selectVoiceSessionSchema = createSelectSchema(voiceSessions);

export const insertVoiceInteractionSchema = createInsertSchema(voiceInteractions, {
  type: z.enum(['question', 'command', 'confirmation', 'clarification', 'interruption']),
  status: z.enum(['received', 'processing', 'completed', 'failed', 'cancelled']),
  userSatisfaction: z.number().int().min(1).max(5).optional(),
});

export const selectVoiceInteractionSchema = createSelectSchema(voiceInteractions);

export const insertVoiceAudioFileSchema = createInsertSchema(voiceAudioFiles, {
  audioType: z.enum(['input', 'output', 'processed']),
  format: z.enum(['wav', 'mp3', 'opus', 'webm']),
  storageProvider: z.enum(['local', 's3', 'r2']),
});

export const selectVoiceAudioFileSchema = createSelectSchema(voiceAudioFiles);

export const insertVoiceWidgetSchema = createInsertSchema(voiceWidgets);
export const selectVoiceWidgetSchema = createSelectSchema(voiceWidgets);

// Custom validation schemas
export const voiceSessionStatusSchema = z.enum(['initializing', 'listening', 'processing', 'speaking', 'paused', 'ended', 'error']);
export const voiceInteractionTypeSchema = z.enum(['question', 'command', 'confirmation', 'clarification', 'interruption']);
export const voiceInteractionStatusSchema = z.enum(['received', 'processing', 'completed', 'failed', 'cancelled']);

// Types
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type NewVoiceSession = typeof voiceSessions.$inferInsert;
export type VoiceInteraction = typeof voiceInteractions.$inferSelect;
export type NewVoiceInteraction = typeof voiceInteractions.$inferInsert;
export type VoiceAudioFile = typeof voiceAudioFiles.$inferSelect;
export type NewVoiceAudioFile = typeof voiceAudioFiles.$inferInsert;
export type VoiceWidget = typeof voiceWidgets.$inferSelect;
export type NewVoiceWidget = typeof voiceWidgets.$inferInsert;