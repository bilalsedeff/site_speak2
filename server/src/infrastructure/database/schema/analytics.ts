import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real, index, date } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sites } from './sites';
import { users } from './users';
import { conversations } from './conversations';

export const siteAnalytics = pgTable('site_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  
  // Date and time period
  date: date('date').notNull(),
  period: varchar('period', { length: 10 }).notNull(), // 'hour', 'day', 'week', 'month'
  
  // Traffic metrics
  pageViews: integer('page_views').default(0),
  uniqueVisitors: integer('unique_visitors').default(0),
  sessions: integer('sessions').default(0),
  bounceRate: real('bounce_rate').default(0), // 0.0 to 1.0
  avgSessionDuration: real('avg_session_duration').default(0), // in seconds
  
  // Voice AI metrics
  voiceInteractions: integer('voice_interactions').default(0),
  voiceSessions: integer('voice_sessions').default(0),
  avgVoiceSessionDuration: real('avg_voice_session_duration').default(0),
  voiceCompletionRate: real('voice_completion_rate').default(0), // 0.0 to 1.0
  voiceSatisfactionScore: real('voice_satisfaction_score').default(0), // 1.0 to 5.0
  
  // Conversation metrics
  totalConversations: integer('total_conversations').default(0),
  resolvedConversations: integer('resolved_conversations').default(0),
  escalatedConversations: integer('escalated_conversations').default(0),
  avgConversationTurns: real('avg_conversation_turns').default(0),
  avgResponseTime: real('avg_response_time').default(0), // in seconds
  
  // Popular content and queries
  topPages: jsonb('top_pages').default([]),
  topQueries: jsonb('top_queries').default([]),
  topIntents: jsonb('top_intents').default([]),
  topActions: jsonb('top_actions').default([]),
  
  // Geographic and demographic data
  countries: jsonb('countries').default({}), // { "US": 150, "UK": 75, ... }
  languages: jsonb('languages').default({}), // { "en": 200, "es": 50, ... }
  devices: jsonb('devices').default({}), // { "desktop": 180, "mobile": 120, ... }
  browsers: jsonb('browsers').default({}),
  
  // Referral data
  referrers: jsonb('referrers').default({}),
  searchEngines: jsonb('search_engines').default({}),
  socialMedia: jsonb('social_media').default({}),
  
  // Performance metrics
  avgPageLoadTime: real('avg_page_load_time').default(0), // in seconds
  coreWebVitals: jsonb('core_web_vitals').default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_site_analytics_site').on(table.siteId),
    dateIdx: index('idx_site_analytics_date').on(table.date),
    periodIdx: index('idx_site_analytics_period').on(table.period),
    siteDateIdx: index('idx_site_analytics_site_date').on(table.siteId, table.date, table.period),
  };
});

export const userInteractionEvents = pgTable('user_interaction_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional for anonymous users
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  
  // Event information
  eventType: varchar('event_type', { length: 50 }).notNull(), // 'page_view', 'voice_interaction', 'button_click', 'form_submit', etc.
  eventCategory: varchar('event_category', { length: 30 }).notNull(), // 'navigation', 'engagement', 'conversion', etc.
  eventAction: varchar('event_action', { length: 100 }), // 'click', 'scroll', 'voice_command', etc.
  eventLabel: varchar('event_label', { length: 200 }),
  
  // Event context
  pageUrl: text('page_url'),
  pageTitle: varchar('page_title', { length: 300 }),
  referrer: text('referrer'),
  
  // User context
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  country: varchar('country', { length: 2 }),
  region: varchar('region', { length: 100 }),
  city: varchar('city', { length: 100 }),
  
  // Device and browser information
  device: varchar('device', { length: 20 }), // 'desktop', 'mobile', 'tablet'
  browser: varchar('browser', { length: 50 }),
  browserVersion: varchar('browser_version', { length: 20 }),
  os: varchar('os', { length: 50 }),
  osVersion: varchar('os_version', { length: 20 }),
  
  // Screen and viewport
  screenResolution: varchar('screen_resolution', { length: 20 }), // e.g., '1920x1080'
  viewportSize: varchar('viewport_size', { length: 20 }), // e.g., '1200x800'
  
  // Performance data
  pageLoadTime: real('page_load_time'), // in seconds
  domContentLoadedTime: real('dom_content_loaded_time'),
  
  // Event metadata
  metadata: jsonb('metadata').default({}),
  customDimensions: jsonb('custom_dimensions').default({}),
  
  // Event value (for conversion tracking)
  eventValue: real('event_value'),
  currency: varchar('currency', { length: 3 }), // ISO 4217 currency code
  
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_user_interaction_events_site').on(table.siteId),
    userIdx: index('idx_user_interaction_events_user').on(table.userId),
    sessionIdx: index('idx_user_interaction_events_session').on(table.sessionId),
    eventTypeIdx: index('idx_user_interaction_events_type').on(table.eventType),
    eventCategoryIdx: index('idx_user_interaction_events_category').on(table.eventCategory),
    timestampIdx: index('idx_user_interaction_events_timestamp').on(table.timestamp),
    countryIdx: index('idx_user_interaction_events_country').on(table.country),
    deviceIdx: index('idx_user_interaction_events_device').on(table.device),
  };
});

export const aiInteractionAnalytics = pgTable('ai_interaction_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  
  // Date and aggregation
  date: date('date').notNull(),
  hour: integer('hour'), // 0-23 for hourly aggregation
  
  // Query and intent analysis
  query: text('query'),
  queryHash: varchar('query_hash', { length: 64 }), // For privacy-preserving aggregation
  intent: varchar('intent', { length: 100 }),
  intentConfidence: real('intent_confidence'),
  
  // Response analysis
  responseType: varchar('response_type', { length: 30 }), // 'text', 'voice', 'action', 'hybrid'
  responseTime: real('response_time'), // in milliseconds
  responseLength: integer('response_length'), // characters or tokens
  
  // Tool and action usage
  toolsUsed: jsonb('tools_used').default([]),
  actionsExecuted: jsonb('actions_executed').default([]),
  
  // Quality metrics
  userSatisfaction: integer('user_satisfaction'), // 1-5 if provided
  conversationCompleted: boolean('conversation_completed').default(false),
  goalAchieved: boolean('goal_achieved').default(false),
  escalated: boolean('escalated').default(false),
  
  // Performance tracking
  tokensUsed: integer('tokens_used'),
  cost: real('cost'), // in USD
  model: varchar('model', { length: 50 }),
  
  // Error tracking
  hadError: boolean('had_error').default(false),
  errorType: varchar('error_type', { length: 50 }),
  errorMessage: text('error_message'),
  
  // Context information
  language: varchar('language', { length: 5 }),
  inputType: varchar('input_type', { length: 20 }), // 'voice', 'text'
  sessionDuration: real('session_duration'), // in seconds up to this point
  turnNumber: integer('turn_number'),
  
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_ai_interaction_analytics_site').on(table.siteId),
    dateIdx: index('idx_ai_interaction_analytics_date').on(table.date),
    intentIdx: index('idx_ai_interaction_analytics_intent').on(table.intent),
    responseTimeIdx: index('idx_ai_interaction_analytics_response_time').on(table.responseTime),
    satisfactionIdx: index('idx_ai_interaction_analytics_satisfaction').on(table.userSatisfaction),
    modelIdx: index('idx_ai_interaction_analytics_model').on(table.model),
    errorIdx: index('idx_ai_interaction_analytics_error').on(table.hadError),
    languageIdx: index('idx_ai_interaction_analytics_language').on(table.language),
    timestampIdx: index('idx_ai_interaction_analytics_timestamp').on(table.timestamp),
    queryHashIdx: index('idx_ai_interaction_analytics_query_hash').on(table.queryHash),
  };
});

export const conversionEvents = pgTable('conversion_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  sessionId: varchar('session_id', { length: 100 }).notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  
  // Conversion information
  conversionType: varchar('conversion_type', { length: 50 }).notNull(), // 'purchase', 'signup', 'contact_form', 'booking', etc.
  conversionCategory: varchar('conversion_category', { length: 30 }), // 'ecommerce', 'lead_generation', 'engagement'
  
  // Value and revenue
  conversionValue: real('conversion_value'),
  currency: varchar('currency', { length: 3 }),
  revenueType: varchar('revenue_type', { length: 20 }), // 'transaction', 'subscription', 'lead_value'
  
  // Attribution
  firstTouchSource: varchar('first_touch_source', { length: 100 }), // First referrer
  lastTouchSource: varchar('last_touch_source', { length: 100 }), // Last referrer before conversion
  
  // AI assistance attribution
  aiAssisted: boolean('ai_assisted').default(false),
  aiInteractions: integer('ai_interactions').default(0), // Number of AI interactions before conversion
  aiSessionDuration: real('ai_session_duration'), // Time spent with AI assistant
  keyAiActions: jsonb('key_ai_actions').default([]), // Actions that led to conversion
  
  // Funnel and journey
  funnelStage: varchar('funnel_stage', { length: 50 }),
  journeyLength: integer('journey_length'), // Number of touchpoints
  timeToConversion: real('time_to_conversion'), // in hours
  
  // Product/service information (for ecommerce)
  products: jsonb('products').default([]), // Product details if applicable
  orderId: varchar('order_id', { length: 100 }),
  transactionId: varchar('transaction_id', { length: 100 }),
  
  // Event metadata
  metadata: jsonb('metadata').default({}),
  
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_conversion_events_site').on(table.siteId),
    userIdx: index('idx_conversion_events_user').on(table.userId),
    sessionIdx: index('idx_conversion_events_session').on(table.sessionId),
    conversationIdx: index('idx_conversion_events_conversation').on(table.conversationId),
    typeIdx: index('idx_conversion_events_type').on(table.conversionType),
    categoryIdx: index('idx_conversion_events_category').on(table.conversionCategory),
    valueIdx: index('idx_conversion_events_value').on(table.conversionValue),
    aiAssistedIdx: index('idx_conversion_events_ai_assisted').on(table.aiAssisted),
    timestampIdx: index('idx_conversion_events_timestamp').on(table.timestamp),
  };
});

export const performanceMetrics = pgTable('performance_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  
  // Measurement period
  date: date('date').notNull(),
  period: varchar('period', { length: 10 }).notNull(), // 'hour', 'day'
  
  // Core Web Vitals
  largestContentfulPaint: real('largest_contentful_paint'), // LCP in seconds
  firstInputDelay: real('first_input_delay'), // FID in milliseconds
  cumulativeLayoutShift: real('cumulative_layout_shift'), // CLS score
  firstContentfulPaint: real('first_contentful_paint'), // FCP in seconds
  timeToInteractive: real('time_to_interactive'), // TTI in seconds
  
  // Page performance
  avgPageLoadTime: real('avg_page_load_time'),
  avgDomContentLoadedTime: real('avg_dom_content_loaded_time'),
  avgFirstByteTime: real('avg_first_byte_time'), // TTFB
  
  // AI performance
  avgAiResponseTime: real('avg_ai_response_time'), // in milliseconds
  aiUptime: real('ai_uptime'), // 0.0 to 1.0
  aiErrorRate: real('ai_error_rate'), // 0.0 to 1.0
  avgVoiceLatency: real('avg_voice_latency'), // Voice processing latency
  
  // Infrastructure metrics
  serverResponseTime: real('server_response_time'),
  databaseResponseTime: real('database_response_time'),
  cacheHitRate: real('cache_hit_rate'), // 0.0 to 1.0
  cdnHitRate: real('cdn_hit_rate'), // 0.0 to 1.0
  
  // Error rates
  jsErrorRate: real('js_error_rate'), // Client-side error rate
  httpErrorRate: real('http_error_rate'), // HTTP 4xx/5xx error rate
  
  // Resource usage
  avgMemoryUsage: real('avg_memory_usage'), // in MB
  avgCpuUsage: real('avg_cpu_usage'), // 0.0 to 1.0
  bandwidthUsage: real('bandwidth_usage'), // in GB
  
  // Lighthouse scores
  performanceScore: integer('performance_score'), // 0-100
  accessibilityScore: integer('accessibility_score'), // 0-100
  bestPracticesScore: integer('best_practices_score'), // 0-100
  seoScore: integer('seo_score'), // 0-100
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
  return {
    siteIdx: index('idx_performance_metrics_site').on(table.siteId),
    dateIdx: index('idx_performance_metrics_date').on(table.date),
    periodIdx: index('idx_performance_metrics_period').on(table.period),
    siteDateIdx: index('idx_performance_metrics_site_date').on(table.siteId, table.date, table.period),
  };
});

// Zod schemas for validation
export const insertSiteAnalyticsSchema = createInsertSchema(siteAnalytics, {
  period: z.enum(['hour', 'day', 'week', 'month']),
  bounceRate: z.number().min(0).max(1),
  voiceCompletionRate: z.number().min(0).max(1),
  voiceSatisfactionScore: z.number().min(1).max(5),
});

export const selectSiteAnalyticsSchema = createSelectSchema(siteAnalytics);

export const insertUserInteractionEventSchema = createInsertSchema(userInteractionEvents, {
  device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  country: z.string().length(2).optional(),
});

export const selectUserInteractionEventSchema = createSelectSchema(userInteractionEvents);

export const insertAiInteractionAnalyticsSchema = createInsertSchema(aiInteractionAnalytics, {
  userSatisfaction: z.number().int().min(1).max(5).optional(),
  language: z.string().length(2).optional(),
  inputType: z.enum(['voice', 'text']).optional(),
});

export const selectAiInteractionAnalyticsSchema = createSelectSchema(aiInteractionAnalytics);

export const insertConversionEventSchema = createInsertSchema(conversionEvents, {
  currency: z.string().length(3).optional(),
  revenueType: z.enum(['transaction', 'subscription', 'lead_value']).optional(),
});

export const selectConversionEventSchema = createSelectSchema(conversionEvents);

export const insertPerformanceMetricsSchema = createInsertSchema(performanceMetrics, {
  period: z.enum(['hour', 'day']),
  aiUptime: z.number().min(0).max(1).optional(),
  aiErrorRate: z.number().min(0).max(1).optional(),
  performanceScore: z.number().int().min(0).max(100).optional(),
});

export const selectPerformanceMetricsSchema = createSelectSchema(performanceMetrics);

// Custom validation schemas
export const analyticsPeriodSchema = z.enum(['hour', 'day', 'week', 'month']);
export const eventCategorySchema = z.enum(['navigation', 'engagement', 'conversion']);
export const conversionCategorySchema = z.enum(['ecommerce', 'lead_generation', 'engagement']);

// Types
export type SiteAnalytics = typeof siteAnalytics.$inferSelect;
export type NewSiteAnalytics = typeof siteAnalytics.$inferInsert;
export type UserInteractionEvent = typeof userInteractionEvents.$inferSelect;
export type NewUserInteractionEvent = typeof userInteractionEvents.$inferInsert;
export type AiInteractionAnalytics = typeof aiInteractionAnalytics.$inferSelect;
export type NewAiInteractionAnalytics = typeof aiInteractionAnalytics.$inferInsert;
export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type NewConversionEvent = typeof conversionEvents.$inferInsert;
export type PerformanceMetrics = typeof performanceMetrics.$inferSelect;
export type NewPerformanceMetrics = typeof performanceMetrics.$inferInsert;