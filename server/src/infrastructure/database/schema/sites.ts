import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real, index } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './users';
import { tenants } from './tenants';

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  slug: varchar('slug', { length: 100 }).notNull(),
  
  // Domain configuration
  domain: varchar('domain', { length: 255 }),
  subdomain: varchar('subdomain', { length: 50 }),
  customDomain: varchar('custom_domain', { length: 255 }),
  customDomainVerified: boolean('custom_domain_verified').default(false),
  
  // Ownership
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Template and category
  templateId: varchar('template_id', { length: 50 }).notNull(),
  category: varchar('category', { length: 30 }).notNull(), // 'business', 'ecommerce', 'blog', etc.
  
  // Site status and lifecycle
  status: varchar('status', { length: 20 }).notNull().default('draft'), // 'draft', 'published', 'archived', 'indexing', 'error'
  isPublic: boolean('is_public').default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  
  // Configuration stored as JSONB
  configuration: jsonb('configuration').notNull().default({}),
  theme: jsonb('theme').notNull().default({}),
  seoSettings: jsonb('seo_settings').notNull().default({}),
  
  // Analytics and stats
  totalViews: integer('total_views').notNull().default(0),
  uniqueVisitors: integer('unique_visitors').notNull().default(0),
  voiceInteractions: integer('voice_interactions').notNull().default(0),
  lastMonthGrowth: real('last_month_growth').default(0),
  
  // Knowledge base association
  knowledgeBaseId: uuid('knowledge_base_id'),
  lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
  lastIndexedAt: timestamp('last_indexed_at', { withTimezone: true }),
  lastIndexedPages: integer('last_indexed_pages').default(0),
  knowledgeBaseSize: real('knowledge_base_size').default(0), // in MB
  
  // Voice agent configuration
  voiceAgentEnabled: boolean('voice_agent_enabled').default(true),
  voiceAgentConfig: jsonb('voice_agent_config').notNull().default({}),
  
  // Content and pages
  pages: jsonb('pages').notNull().default([]),
  components: jsonb('components').notNull().default([]),
  assets: jsonb('assets').notNull().default([]),
  
  // Publishing metadata
  buildVersion: varchar('build_version', { length: 50 }),
  buildSize: integer('build_size'), // in bytes
  buildDuration: integer('build_duration'), // in milliseconds
  
  // Site metadata
  metadata: jsonb('metadata').default({}),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_sites_tenant').on(table.tenantId),
  index('idx_sites_user').on(table.userId),
  index('idx_sites_status').on(table.status),
  index('idx_sites_slug').on(table.slug),
  index('idx_sites_domain').on(table.domain),
  index('idx_sites_published').on(table.publishedAt),
  index('idx_sites_category').on(table.category),
]);

export const siteManifests = pgTable('site_manifests', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Manifest version and metadata
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  
  // Action manifest for voice agent
  actions: jsonb('actions').notNull().default([]),
  capabilities: jsonb('capabilities').notNull().default([]),
  metadata: jsonb('metadata').notNull().default({}),
  
  // Schema.org structured data
  structuredData: jsonb('structured_data').default([]),
  
  // Sitemap information
  sitemap: jsonb('sitemap').default({}),
  
  // GraphQL schema for content API
  graphqlSchema: text('graphql_schema'),
  
  // Validation status
  isValid: boolean('is_valid').default(true),
  validationErrors: jsonb('validation_errors').default([]),
  crawlabilityScore: integer('crawlability_score').default(0), // 0-100
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_site_manifests_site').on(table.siteId),
  index('idx_site_manifests_valid').on(table.isValid),
  index('idx_site_manifests_score').on(table.crawlabilityScore),
]);

export const siteDeployments = pgTable('site_deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull(),
  
  // Deployment metadata
  version: varchar('version', { length: 50 }).notNull(),
  environment: varchar('environment', { length: 20 }).notNull().default('production'), // 'production', 'staging', 'preview'
  
  // Build information
  buildId: varchar('build_id', { length: 100 }),
  buildStatus: varchar('build_status', { length: 20 }).notNull(), // 'pending', 'building', 'success', 'failed'
  buildStartedAt: timestamp('build_started_at', { withTimezone: true }),
  buildCompletedAt: timestamp('build_completed_at', { withTimezone: true }),
  buildDuration: integer('build_duration'), // in milliseconds
  buildLogs: text('build_logs'),
  
  // Deployment URLs
  previewUrl: text('preview_url'),
  productionUrl: text('production_url'),
  
  // Asset information
  staticAssets: jsonb('static_assets').default([]),
  totalSize: integer('total_size'), // in bytes
  
  // Performance metrics
  lighthouseScore: integer('lighthouse_score'), // 0-100
  performanceMetrics: jsonb('performance_metrics').default({}),
  
  // Deployment metadata
  deployedBy: uuid('deployed_by').references(() => users.id),
  commitHash: varchar('commit_hash', { length: 40 }),
  deploymentConfig: jsonb('deployment_config').default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_site_deployments_site').on(table.siteId),
  index('idx_site_deployments_status').on(table.buildStatus),
  index('idx_site_deployments_env').on(table.environment),
  index('idx_site_deployments_version').on(table.version),
]);

export const siteTemplates = pgTable('site_templates', {
  id: varchar('id', { length: 50 }).primaryKey(), // e.g., 'modern-business-v1'
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 30 }).notNull(),
  
  // Template metadata
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  author: varchar('author', { length: 100 }),
  license: varchar('license', { length: 50 }).default('MIT'),
  
  // Visual assets
  previewImage: text('preview_image'),
  thumbnail: text('thumbnail'),
  screenshots: jsonb('screenshots').default([]),
  
  // Template structure
  pages: jsonb('pages').notNull().default([]),
  components: jsonb('components').notNull().default([]),
  theme: jsonb('theme').notNull().default({}),
  features: jsonb('features').notNull().default([]),
  
  // Configuration
  defaultConfig: jsonb('default_config').notNull().default({}),
  requiredFeatures: jsonb('required_features').default([]),
  supportedLanguages: jsonb('supported_languages').default(['en']),
  
  // Template status
  isActive: boolean('is_active').default(true),
  isPremium: boolean('is_premium').default(false),
  sortOrder: integer('sort_order').default(0),
  
  // Usage stats
  usageCount: integer('usage_count').default(0),
  rating: real('rating').default(5.0),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_site_templates_category').on(table.category),
  index('idx_site_templates_active').on(table.isActive),
  index('idx_site_templates_popular').on(table.usageCount),
]);

// Zod schemas for validation
export const insertSiteSchema = createInsertSchema(sites, {
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(['draft', 'published', 'archived', 'indexing', 'error']),
  category: z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']),
});

export const selectSiteSchema = createSelectSchema(sites);

export const insertSiteManifestSchema = createInsertSchema(siteManifests);
export const selectSiteManifestSchema = createSelectSchema(siteManifests);

export const insertSiteDeploymentSchema = createInsertSchema(siteDeployments);
export const selectSiteDeploymentSchema = createSelectSchema(siteDeployments);

export const insertSiteTemplateSchema = createInsertSchema(siteTemplates);
export const selectSiteTemplateSchema = createSelectSchema(siteTemplates);

// Custom validation schemas
export const siteStatusSchema = z.enum(['draft', 'published', 'archived', 'indexing', 'error']);
export const siteCategorySchema = z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']);
export const deploymentStatusSchema = z.enum(['pending', 'building', 'success', 'failed']);

// Types
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type SiteManifest = typeof siteManifests.$inferSelect;
export type NewSiteManifest = typeof siteManifests.$inferInsert;
export type SiteDeployment = typeof siteDeployments.$inferSelect;
export type NewSiteDeployment = typeof siteDeployments.$inferInsert;
export type SiteTemplate = typeof siteTemplates.$inferSelect;
export type NewSiteTemplate = typeof siteTemplates.$inferInsert;