import { pgTable, uuid, varchar, text, jsonb, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';

/**
 * Site contracts table - stores generated site contracts with business info, actions, and metadata
 */
export const siteContracts = pgTable('site_contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  version: integer('version').notNull().default(1),
  
  // Business information
  businessInfo: jsonb('business_info').notNull(),
  
  // Site structure
  pages: jsonb('pages').notNull(),
  actions: jsonb('actions').notNull(),
  
  // Technical specifications  
  navigation: jsonb('navigation').notNull(),
  forms: jsonb('forms').notNull(),
  
  // Generated metadata
  jsonld: jsonb('jsonld'),
  sitemap: jsonb('sitemap'),
  accessibility: jsonb('accessibility'),
  seo: jsonb('seo'),
  
  // Analytics and performance
  analytics: jsonb('analytics'),
  performance: jsonb('performance'),
  
  // Generation metadata
  generationConfig: jsonb('generation_config').notNull(),
  
  // AI-generated content
  aiInsights: jsonb('ai_insights'),
  suggestions: jsonb('suggestions'),
  
  // Status and timestamps
  status: varchar('status', { length: 20 }).notNull().default('active'),
  isArchived: boolean('is_archived').default(false),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  
  // Checksum for detecting changes
  contentHash: varchar('content_hash', { length: 64 }),
}, (table) => ({
  // Indexes for efficient queries
  idx_site_contracts_site_id: index('idx_site_contracts_site_id').on(table.siteId),
  idx_site_contracts_tenant_id: index('idx_site_contracts_tenant_id').on(table.tenantId),
  idx_site_contracts_status: index('idx_site_contracts_status').on(table.status),
  idx_site_contracts_version: index('idx_site_contracts_version').on(table.siteId, table.version),
  idx_site_contracts_updated_at: index('idx_site_contracts_updated_at').on(table.updatedAt),
  idx_site_contracts_archived: index('idx_site_contracts_archived').on(table.isArchived),
}));

/**
 * Site contract validation results
 */
export const siteContractValidations = pgTable('site_contract_validations', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').references(() => siteContracts.id, { onDelete: 'cascade' }).notNull(),
  
  // Validation results
  validationType: varchar('validation_type', { length: 50 }).notNull(), // 'accessibility', 'seo', 'structure'
  severity: varchar('severity', { length: 20 }).notNull(), // 'error', 'warning', 'info'
  component: varchar('component', { length: 100 }),
  property: varchar('property', { length: 100 }),
  message: text('message').notNull(),
  recommendation: text('recommendation'),
  
  // Metadata
  ruleName: varchar('rule_name', { length: 100 }),
  automatedFix: boolean('automated_fix').default(false),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
}, (table) => ({
  idx_contract_validations_contract_id: index('idx_contract_validations_contract_id').on(table.contractId),
  idx_contract_validations_severity: index('idx_contract_validations_severity').on(table.severity),
  idx_contract_validations_type: index('idx_contract_validations_type').on(table.validationType),
}));

/**
 * Site contract generation history
 */
export const siteContractHistory = pgTable('site_contract_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull(),
  contractId: uuid('contract_id').references(() => siteContracts.id, { onDelete: 'cascade' }).notNull(),
  
  // Change metadata
  changeType: varchar('change_type', { length: 50 }).notNull(), // 'created', 'updated', 'regenerated', 'archived'
  changeDescription: text('change_description'),
  changedBy: uuid('changed_by'),
  
  // Previous state (for rollback)
  previousVersion: integer('previous_version'),
  changesDiff: jsonb('changes_diff'), // JSON diff of what changed
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  idx_contract_history_site_id: index('idx_contract_history_site_id').on(table.siteId),
  idx_contract_history_contract_id: index('idx_contract_history_contract_id').on(table.contractId),
  idx_contract_history_created_at: index('idx_contract_history_created_at').on(table.createdAt),
}));

// Export types inferred from schema
export type DBSiteContract = typeof siteContracts.$inferSelect;
export type NewSiteContract = typeof siteContracts.$inferInsert;
export type DBSiteContractValidation = typeof siteContractValidations.$inferSelect;
export type NewSiteContractValidation = typeof siteContractValidations.$inferInsert;
export type DBSiteContractHistory = typeof siteContractHistory.$inferSelect;
export type NewSiteContractHistory = typeof siteContractHistory.$inferInsert;