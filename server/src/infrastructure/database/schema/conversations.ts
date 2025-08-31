import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sites } from './sites';
import { users } from './users';
import { voiceSessions } from './voice-sessions';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional for anonymous users
  voiceSessionId: uuid('voice_session_id').references(() => voiceSessions.id, { onDelete: 'set null' }), // Optional, for voice conversations
  
  // Conversation metadata
  title: varchar('title', { length: 200 }),
  summary: text('summary'),
  language: varchar('language', { length: 5 }).notNull().default('en'),
  
  // Conversation status and lifecycle
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'completed', 'abandoned', 'escalated'
  
  // Context and classification
  category: varchar('category', { length: 50 }), // 'support', 'sales', 'information', 'navigation', etc.
  tags: jsonb('tags').default([]),
  priority: varchar('priority', { length: 10 }).default('normal'), // 'low', 'normal', 'high', 'urgent'
  
  // Conversation metadata
  metadata: jsonb('metadata').notNull().default({
    userAgent: null,
    referrer: null,
    location: null,
    device: null,
    startPage: null,
    currentPage: null
  }),
  
  // Quality and satisfaction
  satisfactionScore: integer('satisfaction_score'), // 1-5 rating
  resolved: boolean('resolved').default(false),
  escalated: boolean('escalated').default(false),
  escalatedTo: varchar('escalated_to', { length: 100 }), // 'human', 'supervisor', etc.
  escalationReason: text('escalation_reason'),
  
  // Performance metrics
  responseTime: real('response_time'), // Average response time in seconds
  totalTurns: integer('total_turns').default(0),
  userMessages: integer('user_messages').default(0),
  assistantMessages: integer('assistant_messages').default(0),
  
  // Conversation lifecycle
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  
  // Follow-up tracking
  followUpRequired: boolean('follow_up_required').default(false),
  followUpAt: timestamp('follow_up_at', { withTimezone: true }),
  followUpCompleted: boolean('follow_up_completed').default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_conversations_site').on(table.siteId),
    sessionIdx: index('idx_conversations_session').on(table.sessionId),
    userIdx: index('idx_conversations_user').on(table.userId),
    voiceSessionIdx: index('idx_conversations_voice_session').on(table.voiceSessionId),
    statusIdx: index('idx_conversations_status').on(table.status),
    startedAtIdx: index('idx_conversations_started').on(table.startedAt),
    lastMessageIdx: index('idx_conversations_last_message').on(table.lastMessageAt),
    categoryIdx: index('idx_conversations_category').on(table.category),
    priorityIdx: index('idx_conversations_priority').on(table.priority),
    resolvedIdx: index('idx_conversations_resolved').on(table.resolved),
  };
});

export const conversationTurns = pgTable('conversation_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  turnNumber: integer('turn_number').notNull(),
  
  // Turn metadata
  role: varchar('role', { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  type: varchar('type', { length: 20 }).default('message'), // 'message', 'action', 'system_notification', 'error'
  
  // Message content
  content: text('content').notNull(),
  originalContent: text('original_content'), // Before any processing/sanitization
  
  // Input/output metadata
  inputType: varchar('input_type', { length: 20 }), // 'voice', 'text', 'action'
  outputType: varchar('output_type', { length: 20 }), // 'voice', 'text', 'action', 'ui_update'
  
  // Processing information
  processingMetadata: jsonb('processing_metadata').default({
    responseTime: null,
    tokensUsed: null,
    model: null,
    confidence: null,
    intent: null,
    entities: [],
    toolsCalled: [],
    actionsExecuted: []
  }),
  
  // Voice-specific data
  voiceData: jsonb('voice_data').default({
    transcript: null,
    confidence: null,
    audioUrl: null,
    duration: null,
    language: null
  }),
  
  // Sentiment and analysis
  sentiment: varchar('sentiment', { length: 15 }), // 'positive', 'negative', 'neutral'
  sentimentScore: real('sentiment_score'), // -1.0 to 1.0
  emotionalTone: varchar('emotional_tone', { length: 20 }), // 'happy', 'frustrated', 'confused', etc.
  
  // Context and state
  contextData: jsonb('context_data').default({}),
  stateChanges: jsonb('state_changes').default([]),
  
  // Quality metrics
  qualityScore: real('quality_score'),
  flagged: boolean('flagged').default(false),
  flagReason: varchar('flag_reason', { length: 100 }),
  
  // Timestamps
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    conversationIdx: index('idx_conversation_turns_conversation').on(table.conversationId),
    roleIdx: index('idx_conversation_turns_role').on(table.role),
    typeIdx: index('idx_conversation_turns_type').on(table.type),
    timestampIdx: index('idx_conversation_turns_timestamp').on(table.timestamp),
    turnNumberIdx: index('idx_conversation_turns_number').on(table.conversationId, table.turnNumber),
    sentimentIdx: index('idx_conversation_turns_sentiment').on(table.sentiment),
    flaggedIdx: index('idx_conversation_turns_flagged').on(table.flagged),
  };
});

export const conversationIntents = pgTable('conversation_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  turnId: uuid('turn_id').references(() => conversationTurns.id, { onDelete: 'cascade' }),
  
  // Intent information
  intent: varchar('intent', { length: 100 }).notNull(),
  confidence: real('confidence').notNull(),
  
  // Entities and parameters
  entities: jsonb('entities').default([]),
  parameters: jsonb('parameters').default({}),
  
  // Intent classification metadata
  classifier: varchar('classifier', { length: 50 }).default('default'), // 'openai', 'custom', 'rule-based'
  classifierVersion: varchar('classifier_version', { length: 20 }),
  
  // Intent resolution
  resolved: boolean('resolved').default(false),
  resolution: text('resolution'),
  resolutionType: varchar('resolution_type', { length: 30 }), // 'automated', 'human', 'escalated', 'failed'
  
  // Context
  context: jsonb('context').default({}),
  
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    conversationIdx: index('idx_conversation_intents_conversation').on(table.conversationId),
    turnIdx: index('idx_conversation_intents_turn').on(table.turnId),
    intentIdx: index('idx_conversation_intents_intent').on(table.intent),
    confidenceIdx: index('idx_conversation_intents_confidence').on(table.confidence),
    resolvedIdx: index('idx_conversation_intents_resolved').on(table.resolved),
    timestampIdx: index('idx_conversation_intents_timestamp').on(table.timestamp),
  };
});

export const conversationActions = pgTable('conversation_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  turnId: uuid('turn_id').references(() => conversationTurns.id, { onDelete: 'cascade' }),
  
  // Action information
  actionName: varchar('action_name', { length: 100 }).notNull(),
  actionType: varchar('action_type', { length: 30 }).notNull(), // 'navigation', 'form_submission', 'api_call', 'ui_update', etc.
  
  // Action parameters and context
  parameters: jsonb('parameters').default({}),
  context: jsonb('context').default({}),
  
  // Execution information
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'executing', 'completed', 'failed', 'cancelled'
  result: jsonb('result').default({}),
  
  // Error handling
  error: text('error'),
  errorDetails: jsonb('error_details').default({}),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  
  // Execution metadata
  executedBy: varchar('executed_by', { length: 50 }), // 'system', 'user_confirmation', 'automatic'
  executionDuration: integer('execution_duration'), // in milliseconds
  
  // Confirmation and safety
  requiresConfirmation: boolean('requires_confirmation').default(false),
  confirmed: boolean('confirmed').default(false),
  confirmationPrompt: text('confirmation_prompt'),
  
  // Risk assessment
  riskLevel: varchar('risk_level', { length: 10 }).default('low'), // 'low', 'medium', 'high'
  sideEffecting: boolean('side_effecting').default(false),
  reversible: boolean('reversible').default(true),
  
  // Timestamps
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => {
  return {
    conversationIdx: index('idx_conversation_actions_conversation').on(table.conversationId),
    turnIdx: index('idx_conversation_actions_turn').on(table.turnId),
    actionNameIdx: index('idx_conversation_actions_name').on(table.actionName),
    actionTypeIdx: index('idx_conversation_actions_type').on(table.actionType),
    statusIdx: index('idx_conversation_actions_status').on(table.status),
    requestedAtIdx: index('idx_conversation_actions_requested').on(table.requestedAt),
    riskLevelIdx: index('idx_conversation_actions_risk').on(table.riskLevel),
  };
});

// Zod schemas for validation
export const insertConversationSchema = createInsertSchema(conversations, {
  status: z.enum(['active', 'completed', 'abandoned', 'escalated']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  language: z.string().length(2),
  satisfactionScore: z.number().int().min(1).max(5).optional(),
});

export const selectConversationSchema = createSelectSchema(conversations);

export const insertConversationTurnSchema = createInsertSchema(conversationTurns, {
  role: z.enum(['user', 'assistant', 'system']),
  type: z.enum(['message', 'action', 'system_notification', 'error']),
  inputType: z.enum(['voice', 'text', 'action']).optional(),
  outputType: z.enum(['voice', 'text', 'action', 'ui_update']).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  sentimentScore: z.number().min(-1).max(1).optional(),
});

export const selectConversationTurnSchema = createSelectSchema(conversationTurns);

export const insertConversationIntentSchema = createInsertSchema(conversationIntents, {
  confidence: z.number().min(0).max(1),
  resolutionType: z.enum(['automated', 'human', 'escalated', 'failed']).optional(),
});

export const selectConversationIntentSchema = createSelectSchema(conversationIntents);

export const insertConversationActionSchema = createInsertSchema(conversationActions, {
  status: z.enum(['pending', 'executing', 'completed', 'failed', 'cancelled']),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export const selectConversationActionSchema = createSelectSchema(conversationActions);

// Custom validation schemas
export const conversationStatusSchema = z.enum(['active', 'completed', 'abandoned', 'escalated']);
export const conversationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
export const conversationTurnRoleSchema = z.enum(['user', 'assistant', 'system']);
export const actionStatusSchema = z.enum(['pending', 'executing', 'completed', 'failed', 'cancelled']);

// Types
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationTurn = typeof conversationTurns.$inferSelect;
export type NewConversationTurn = typeof conversationTurns.$inferInsert;
export type ConversationIntent = typeof conversationIntents.$inferSelect;
export type NewConversationIntent = typeof conversationIntents.$inferInsert;
export type ConversationAction = typeof conversationActions.$inferSelect;
export type NewConversationAction = typeof conversationActions.$inferInsert;