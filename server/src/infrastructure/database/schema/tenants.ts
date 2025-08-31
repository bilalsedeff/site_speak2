import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 255 }),
  subdomain: varchar('subdomain', { length: 50 }),
  plan: varchar('plan', { length: 20 }).notNull().default('free'), // 'free', 'basic', 'pro', 'enterprise'
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'suspended', 'cancelled'
  
  // Settings stored as JSONB
  settings: jsonb('settings').notNull().default({}),
  
  // Usage limits
  maxSites: integer('max_sites').notNull().default(3),
  maxKnowledgeBaseMB: real('max_knowledge_base_mb').notNull().default(50),
  maxAITokensPerMonth: integer('max_ai_tokens_per_month').notNull().default(200000),
  maxVoiceMinutesPerMonth: real('max_voice_minutes_per_month').notNull().default(30),
  
  // Current usage
  currentSites: integer('current_sites').notNull().default(0),
  currentKnowledgeBaseMB: real('current_knowledge_base_mb').notNull().default(0),
  currentAITokensThisMonth: integer('current_ai_tokens_this_month').notNull().default(0),
  currentVoiceMinutesThisMonth: real('current_voice_minutes_this_month').notNull().default(0),
  
  // Usage reset date
  usageResetDate: timestamp('usage_reset_date', { withTimezone: true }).notNull().defaultNow(),
  
  // Billing
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  
  // Metadata
  metadata: jsonb('metadata').default({}),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  
  // Trial information
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  isTrialActive: boolean('is_trial_active').default(false),
});

export const tenantSettings = pgTable('tenant_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  
  // Language and locale
  defaultLanguage: varchar('default_language', { length: 5 }).notNull().default('en'),
  defaultLocale: varchar('default_locale', { length: 10 }).notNull().default('en-US'),
  
  // Domain settings
  allowedDomains: jsonb('allowed_domains').notNull().default([]),
  customDomain: varchar('custom_domain', { length: 255 }),
  customDomainVerified: boolean('custom_domain_verified').default(false),
  
  // Branding
  brandingEnabled: boolean('branding_enabled').default(false),
  logoUrl: text('logo_url'),
  primaryColor: varchar('primary_color', { length: 7 }).default('#2563eb'),
  secondaryColor: varchar('secondary_color', { length: 7 }).default('#64748b'),
  
  // Security
  ssoEnabled: boolean('sso_enabled').default(false),
  ssoProvider: varchar('sso_provider', { length: 50 }),
  ssoConfig: jsonb('sso_config').default({}),
  
  // API Access
  apiEnabled: boolean('api_enabled').default(true),
  apiRateLimit: integer('api_rate_limit').default(1000), // requests per hour
  
  // Feature flags
  features: jsonb('features').notNull().default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Zod schemas for validation
export const insertTenantSchema = createInsertSchema(tenants);
export const selectTenantSchema = createSelectSchema(tenants);

export const insertTenantSettingsSchema = createInsertSchema(tenantSettings);
export const selectTenantSettingsSchema = createSelectSchema(tenantSettings);

// Custom validation schemas
export const tenantPlanSchema = z.enum(['free', 'basic', 'pro', 'enterprise']);
export const tenantStatusSchema = z.enum(['active', 'suspended', 'cancelled']);

// Types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;