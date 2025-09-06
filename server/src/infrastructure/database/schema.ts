/**
 * Database Schema for SiteSpeak
 * 
 * Implements multi-tenant knowledge base with pgvector support
 * following the source-of-truth knowledge base requirements
 */

import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  varchar,
  integer,
  decimal,
  boolean,
  json,
  index,
  unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users and Tenancy
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  avatar: text('avatar'),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  preferences: json('preferences').default({}),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  statusIdx: index('users_status_idx').on(table.status),
}));

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  settings: json('settings').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  domainIdx: index('tenants_domain_idx').on(table.domain),
  ownerIdx: index('tenants_owner_idx').on(table.ownerId),
}));

// Sites
export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('draft'),
  contract: json('contract').notNull(),
  settings: json('settings').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('sites_tenant_idx').on(table.tenantId),
  domainIdx: index('sites_domain_idx').on(table.domain),
  statusIdx: index('sites_status_idx').on(table.status),
  tenantDomainUnique: unique('sites_tenant_domain_unique').on(table.tenantId, table.domain),
}));

// Knowledge Base Documents (per-site isolation)
export const kbDocuments = pgTable('kb_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  pageHash: varchar('page_hash', { length: 64 }).notNull(),
  lastmod: timestamp('lastmod'),
  lastCrawled: timestamp('last_crawled').notNull().defaultNow(),
  etag: varchar('etag', { length: 255 }),
  lastModified: varchar('last_modified', { length: 255 }),
  priority: decimal('priority', { precision: 2, scale: 1 }).default('0.5'),
  changefreq: varchar('changefreq', { length: 20 }).default('weekly'),
  locale: varchar('locale', { length: 10 }).default('en'),
  contentType: varchar('content_type', { length: 100 }).default('text/html'),
  wordCount: integer('word_count').default(0),
  version: integer('version').notNull().default(1),
  isDeleted: boolean('is_deleted').notNull().default(false),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('kb_documents_site_idx').on(table.siteId),
  tenantIdx: index('kb_documents_tenant_idx').on(table.tenantId),
  urlIdx: index('kb_documents_url_idx').on(table.url),
  canonicalIdx: index('kb_documents_canonical_idx').on(table.canonicalUrl),
  contentHashIdx: index('kb_documents_content_hash_idx').on(table.contentHash),
  lastmodIdx: index('kb_documents_lastmod_idx').on(table.lastmod),
  localeIdx: index('kb_documents_locale_idx').on(table.locale),
  siteCanonicalUnique: unique('kb_documents_site_canonical_unique').on(table.siteId, table.canonicalUrl),
}));

// Knowledge Base Chunks (vector embeddings)
export const kbChunks = pgTable('kb_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  chunkIndex: integer('chunk_index').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(), // Align with the service usage
  content: text('content').notNull(),
  cleanedContent: text('cleaned_content').notNull(),
  section: varchar('section', { length: 255 }),
  heading: text('heading'),
  hpath: text('hpath'), // hierarchical path like h1>h2>h3
  selector: text('selector'),
  wordCount: integer('word_count').notNull(),
  tokenCount: integer('token_count').notNull(),
  locale: varchar('locale', { length: 10 }).default('en'),
  contentType: varchar('content_type', { length: 50 }).default('text'),
  priority: decimal('priority', { precision: 2, scale: 1 }).default('0.5'),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  documentIdx: index('kb_chunks_document_idx').on(table.documentId),
  siteIdx: index('kb_chunks_site_idx').on(table.siteId),
  tenantIdx: index('kb_chunks_tenant_idx').on(table.tenantId),
  contentHashIdx: index('kb_chunks_content_hash_idx').on(table.contentHash),
  localeIdx: index('kb_chunks_locale_idx').on(table.locale),
  contentTypeIdx: index('kb_chunks_content_type_idx').on(table.contentType),
  documentChunkUnique: unique('kb_chunks_document_chunk_unique').on(table.documentId, table.chunkIndex),
}));

// Vector Embeddings (pgvector)
export const kbEmbeddings = pgTable('kb_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  chunkId: uuid('chunk_id').notNull().references(() => kbChunks.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  model: varchar('model', { length: 50 }).notNull().default('text-embedding-3-small'),
  dimensions: integer('dimensions').notNull().default(1536),
  embedding: text('embedding').notNull(), // Will store as text until pgvector is properly set up
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  chunkIdx: index('kb_embeddings_chunk_idx').on(table.chunkId),
  siteIdx: index('kb_embeddings_site_idx').on(table.siteId),
  tenantIdx: index('kb_embeddings_tenant_idx').on(table.tenantId),
  modelIdx: index('kb_embeddings_model_idx').on(table.model),
}));

// Site Actions (from action manifest)
export const kbActions = pgTable('kb_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  selector: text('selector').notNull(),
  description: text('description').notNull(),
  parameters: json('parameters').default([]),
  confirmation: boolean('confirmation').notNull().default(false),
  sideEffecting: varchar('side_effecting', { length: 50 }).notNull().default('safe'),
  riskLevel: varchar('risk_level', { length: 20 }).notNull().default('low'),
  category: varchar('category', { length: 50 }).notNull(),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  documentIdx: index('kb_actions_document_idx').on(table.documentId),
  siteIdx: index('kb_actions_site_idx').on(table.siteId),
  tenantIdx: index('kb_actions_tenant_idx').on(table.tenantId),
  nameIdx: index('kb_actions_name_idx').on(table.name),
  typeIdx: index('kb_actions_type_idx').on(table.type),
  categoryIdx: index('kb_actions_category_idx').on(table.category),
  riskIdx: index('kb_actions_risk_idx').on(table.riskLevel),
  siteNameUnique: unique('kb_actions_site_name_unique').on(table.siteId, table.name),
}));

// Site Forms (from form extraction)
export const kbForms = pgTable('kb_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => kbDocuments.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  selector: text('selector').notNull(),
  action: text('action'),
  method: varchar('method', { length: 10 }).default('POST'),
  enctype: varchar('enctype', { length: 50 }).default('application/x-www-form-urlencoded'),
  fields: json('fields').notNull().default([]),
  validation: json('validation').default({}),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  documentIdx: index('kb_forms_document_idx').on(table.documentId),
  siteIdx: index('kb_forms_site_idx').on(table.siteId),
  tenantIdx: index('kb_forms_tenant_idx').on(table.tenantId),
  selectorIdx: index('kb_forms_selector_idx').on(table.selector),
}));

// Conversation Sessions
export const conversationSessions = pgTable('conversation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  lastActivity: timestamp('last_activity').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  language: varchar('language', { length: 10 }).default('en-US'),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('conversation_sessions_site_idx').on(table.siteId),
  tenantIdx: index('conversation_sessions_tenant_idx').on(table.tenantId),
  userIdx: index('conversation_sessions_user_idx').on(table.userId),
  statusIdx: index('conversation_sessions_status_idx').on(table.status),
  lastActivityIdx: index('conversation_sessions_last_activity_idx').on(table.lastActivity),
}));

// Conversation Messages
export const conversationMessages = pgTable('conversation_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => conversationSessions.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  type: varchar('type', { length: 20 }).notNull(),
  content: text('content').notNull(),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('conversation_messages_session_idx').on(table.sessionId),
  siteIdx: index('conversation_messages_site_idx').on(table.siteId),
  tenantIdx: index('conversation_messages_tenant_idx').on(table.tenantId),
  typeIdx: index('conversation_messages_type_idx').on(table.type),
  createdAtIdx: index('conversation_messages_created_at_idx').on(table.createdAt),
}));

// Analytics and Metrics
export const kbStats = pgTable('kb_stats', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  date: timestamp('date').notNull(),
  documentCount: integer('document_count').default(0),
  chunkCount: integer('chunk_count').default(0),
  actionCount: integer('action_count').default(0),
  formCount: integer('form_count').default(0),
  conversationCount: integer('conversation_count').default(0),
  avgResponseTime: decimal('avg_response_time', { precision: 10, scale: 2 }),
  searchQueries: integer('search_queries').default(0),
  metadata: json('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  siteIdx: index('kb_stats_site_idx').on(table.siteId),
  tenantIdx: index('kb_stats_tenant_idx').on(table.tenantId),
  dateIdx: index('kb_stats_date_idx').on(table.date),
  siteDateUnique: unique('kb_stats_site_date_unique').on(table.siteId, table.date),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedTenants: many(tenants),
  sessions: many(conversationSessions),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  owner: one(users, { fields: [tenants.ownerId], references: [users.id] }),
  sites: many(sites),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  tenant: one(tenants, { fields: [sites.tenantId], references: [tenants.id] }),
  documents: many(kbDocuments),
  chunks: many(kbChunks),
  actions: many(kbActions),
  forms: many(kbForms),
  sessions: many(conversationSessions),
  stats: many(kbStats),
}));

export const kbDocumentsRelations = relations(kbDocuments, ({ one, many }) => ({
  site: one(sites, { fields: [kbDocuments.siteId], references: [sites.id] }),
  tenant: one(tenants, { fields: [kbDocuments.tenantId], references: [tenants.id] }),
  chunks: many(kbChunks),
  actions: many(kbActions),
  forms: many(kbForms),
}));

export const kbChunksRelations = relations(kbChunks, ({ one, many }) => ({
  document: one(kbDocuments, { fields: [kbChunks.documentId], references: [kbDocuments.id] }),
  site: one(sites, { fields: [kbChunks.siteId], references: [sites.id] }),
  tenant: one(tenants, { fields: [kbChunks.tenantId], references: [tenants.id] }),
  embeddings: many(kbEmbeddings),
}));

export const kbEmbeddingsRelations = relations(kbEmbeddings, ({ one }) => ({
  chunk: one(kbChunks, { fields: [kbEmbeddings.chunkId], references: [kbChunks.id] }),
  site: one(sites, { fields: [kbEmbeddings.siteId], references: [sites.id] }),
  tenant: one(tenants, { fields: [kbEmbeddings.tenantId], references: [tenants.id] }),
}));

export const conversationSessionsRelations = relations(conversationSessions, ({ one, many }) => ({
  site: one(sites, { fields: [conversationSessions.siteId], references: [sites.id] }),
  tenant: one(tenants, { fields: [conversationSessions.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [conversationSessions.userId], references: [users.id] }),
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  session: one(conversationSessions, { fields: [conversationMessages.sessionId], references: [conversationSessions.id] }),
  site: one(sites, { fields: [conversationMessages.siteId], references: [sites.id] }),
  tenant: one(tenants, { fields: [conversationMessages.tenantId], references: [tenants.id] }),
}));

// Voice Sessions (specific for voice interactions)
export const voiceSessions = pgTable('voice_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: varchar('session_id', { length: 100 }).notNull().unique(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  
  // Session status and lifecycle
  status: varchar('status', { length: 20 }).notNull().default('initializing'),
  
  // Language and locale settings
  language: varchar('language', { length: 5 }).notNull().default('en'),
  locale: varchar('locale', { length: 10 }).notNull().default('en-US'),
  
  // Voice configuration
  configuration: json('configuration').notNull().default({
    sttProvider: 'whisper',
    ttsProvider: 'openai',
    voice: { name: 'alloy', speed: 1.0, pitch: 1.0, volume: 1.0 },
    audio: { sampleRate: 24000, channels: 1, format: 'wav', noiseReduction: true },
    behavior: { interruptible: true, pauseThreshold: 1500, maxSilence: 5000, confirmationRequired: false }
  }),
  
  // Session metadata
  metadata: json('metadata').default({}),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  device: varchar('device', { length: 20 }),
  browser: varchar('browser', { length: 50 }),
  
  // Connection and quality information
  connectionType: varchar('connection_type', { length: 20 }).default('websocket'),
  microphonePermission: boolean('microphone_permission').default(false),
  speakerSupport: boolean('speaker_support').default(true),
  
  // Quality metrics
  audioQuality: json('audio_quality').default({
    inputLevel: 0, outputLevel: 0, latency: 0, jitter: 0, packetLoss: 0, signalToNoise: 0
  }),
  
  // Session statistics
  totalInteractions: integer('total_interactions').default(0),
  totalDuration: integer('total_duration').default(0),
  averageResponseTime: decimal('average_response_time', { precision: 10, scale: 2 }).default('0'),
  
  // Session lifecycle timestamps
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  lastActivityAt: timestamp('last_activity_at').notNull().defaultNow(),
  
  // Error tracking
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdIdx: index('voice_sessions_session_id_idx').on(table.sessionId),
  siteIdx: index('voice_sessions_site_idx').on(table.siteId),
  userIdx: index('voice_sessions_user_idx').on(table.userId),
  statusIdx: index('voice_sessions_status_idx').on(table.status),
  startedIdx: index('voice_sessions_started_idx').on(table.startedAt),
  activityIdx: index('voice_sessions_activity_idx').on(table.lastActivityAt),
}));

// Voice Interactions
export const voiceInteractions = pgTable('voice_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => voiceSessions.id, { onDelete: 'cascade' }),
  turnId: varchar('turn_id', { length: 100 }).notNull(),
  
  // Interaction type and status
  type: varchar('type', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('received'),
  
  // User input
  input: json('input').default({}),
  
  // Assistant output
  output: json('output').default({}),
  
  // Processing metadata
  processing: json('processing').default({}),
  
  // Intent and context
  detectedIntent: varchar('detected_intent', { length: 100 }),
  intentConfidence: decimal('intent_confidence', { precision: 3, scale: 2 }),
  entities: json('entities').default([]),
  context: json('context').default({}),
  
  // Tool usage
  toolsCalled: json('tools_called').default([]),
  actionsExecuted: json('actions_executed').default([]),
  
  // Quality metrics
  userSatisfaction: integer('user_satisfaction'),
  qualityScore: decimal('quality_score', { precision: 3, scale: 2 }),
  
  // Error information
  error: text('error'),
  errorDetails: json('error_details').default({}),
  
  // Processing timestamps
  receivedAt: timestamp('received_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('voice_interactions_session_idx').on(table.sessionId),
  turnIdx: index('voice_interactions_turn_idx').on(table.turnId),
  typeIdx: index('voice_interactions_type_idx').on(table.type),
  statusIdx: index('voice_interactions_status_idx').on(table.status),
  intentIdx: index('voice_interactions_intent_idx').on(table.detectedIntent),
  receivedIdx: index('voice_interactions_received_idx').on(table.receivedAt),
}));

// Voice Sessions Relations
export const voiceSessionsRelations = relations(voiceSessions, ({ one, many }) => ({
  site: one(sites, { fields: [voiceSessions.siteId], references: [sites.id] }),
  user: one(users, { fields: [voiceSessions.userId], references: [users.id] }),
  interactions: many(voiceInteractions),
}));

export const voiceInteractionsRelations = relations(voiceInteractions, ({ one }) => ({
  session: one(voiceSessions, { fields: [voiceInteractions.sessionId], references: [voiceSessions.id] }),
}));

// Voice types
export type VoiceSession = typeof voiceSessions.$inferSelect;
export type NewVoiceSession = typeof voiceSessions.$inferInsert;
export type VoiceInteraction = typeof voiceInteractions.$inferSelect;
export type NewVoiceInteraction = typeof voiceInteractions.$inferInsert;