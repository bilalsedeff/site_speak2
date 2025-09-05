import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, integer, real, index, vector } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sites } from './sites';

export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Knowledge base status and configuration
  status: varchar('status', { length: 20 }).notNull().default('initializing'), // 'initializing', 'crawling', 'indexing', 'ready', 'error', 'outdated'
  version: varchar('version', { length: 20 }).notNull().default('1.0.0'),
  
  // Crawl and index timestamps
  lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
  lastIndexedAt: timestamp('last_indexed_at', { withTimezone: true }),
  nextScheduledCrawl: timestamp('next_scheduled_crawl', { withTimezone: true }),
  
  // Statistics
  totalChunks: integer('total_chunks').notNull().default(0),
  totalPages: integer('total_pages').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  sizeInMB: real('size_in_mb').notNull().default(0),
  avgChunkSize: integer('avg_chunk_size').default(0),
  lastUpdateDuration: integer('last_update_duration').default(0), // in seconds
  
  // Configuration
  configuration: jsonb('configuration').notNull().default({
    crawlDepth: 3,
    chunkSize: 1000,
    chunkOverlap: 100,
    excludePatterns: [],
    includePatterns: ['**/*'],
    autoReindex: false,
    reindexFrequency: 'weekly'
  }),
  
  // Error tracking
  lastError: text('last_error'),
  errorCount: integer('error_count').default(0),
  
  // Indexing metadata
  embeddingModel: varchar('embedding_model', { length: 100 }).default('text-embedding-3-small'),
  vectorDimensions: integer('vector_dimensions').default(1536),
  indexType: varchar('index_type', { length: 20 }).default('hnsw'), // 'hnsw', 'ivfflat'
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_knowledge_bases_site').on(table.siteId),
  index('idx_knowledge_bases_status').on(table.status),
  index('idx_knowledge_bases_crawled').on(table.lastCrawledAt),
]);

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeBaseId: uuid('knowledge_base_id').references(() => knowledgeBases.id, { onDelete: 'cascade' }).notNull(),
  
  // Content and location
  url: text('url').notNull(),
  urlHash: varchar('url_hash', { length: 64 }).notNull(), // SHA-256 of URL for fast lookups
  selector: text('selector'), // CSS selector where content was found
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(), // SHA-256 of normalized content
  
  // Vector embedding (pgvector)
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI ada-002/3-small dimensions
  
  // Chunk hierarchy and relationships
  parentChunkId: uuid('parent_chunk_id'),
  chunkOrder: integer('chunk_order').default(0),
  chunkLevel: integer('chunk_level').default(0), // 0 = root, 1 = section, 2 = subsection, etc.
  
  // Content metadata
  title: text('title'),
  description: text('description'),
  keywords: jsonb('keywords').default([]),
  language: varchar('language', { length: 5 }).notNull().default('en'),
  
  // Content classification
  contentType: varchar('content_type', { length: 20 }).notNull().default('text'), // 'text', 'code', 'list', 'table', 'form', 'navigation'
  pageType: varchar('page_type', { length: 20 }).default('other'), // 'home', 'product', 'blog', 'contact', 'about', 'service', 'other'
  importance: varchar('importance', { length: 10 }).default('medium'), // 'high', 'medium', 'low'
  
  // Crawl and processing metadata
  lastModified: timestamp('last_modified', { withTimezone: true }),
  crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  
  // Token and size information
  tokenCount: integer('token_count').default(0),
  characterCount: integer('character_count').default(0),
  
  // Quality metrics
  qualityScore: real('quality_score').default(0.5), // 0.0 to 1.0
  readabilityScore: real('readability_score').default(0.5),
  
  // Additional metadata
  metadata: jsonb('metadata').default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_knowledge_chunks_kb').on(table.knowledgeBaseId),
  index('idx_knowledge_chunks_url_hash').on(table.urlHash),
  index('idx_knowledge_chunks_content_hash').on(table.contentHash),
  index('idx_knowledge_chunks_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
  index('idx_knowledge_chunks_parent').on(table.parentChunkId),
  index('idx_knowledge_chunks_language').on(table.language),
  index('idx_knowledge_chunks_content_type').on(table.contentType),
  index('idx_knowledge_chunks_page_type').on(table.pageType),
  index('idx_knowledge_chunks_importance').on(table.importance),
  index('idx_knowledge_chunks_crawled').on(table.crawledAt),
  // Compound index for deduplication
  index('idx_knowledge_chunks_unique').on(table.knowledgeBaseId, table.contentHash),
]);

export const crawlSessions = pgTable('crawl_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  knowledgeBaseId: uuid('knowledge_base_id').references(() => knowledgeBases.id, { onDelete: 'cascade' }).notNull(),
  
  // Session metadata
  sessionType: varchar('session_type', { length: 20 }).notNull(), // 'full', 'delta', 'manual', 'scheduled'
  status: varchar('status', { length: 20 }).notNull().default('running'), // 'running', 'completed', 'failed', 'cancelled'
  
  // Crawl configuration
  startUrls: jsonb('start_urls').notNull().default([]),
  maxDepth: integer('max_depth').default(3),
  maxPages: integer('max_pages').default(1000),
  respectRobots: boolean('respect_robots').default(true),
  followSitemaps: boolean('follow_sitemaps').default(true),
  
  // Progress tracking
  pagesDiscovered: integer('pages_discovered').default(0),
  pagesCrawled: integer('pages_crawled').default(0),
  pagesSkipped: integer('pages_skipped').default(0),
  pagesFailed: integer('pages_failed').default(0),
  chunksCreated: integer('chunks_created').default(0),
  chunksUpdated: integer('chunks_updated').default(0),
  
  // Performance metrics
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  duration: integer('duration'), // in seconds
  avgPageTime: real('avg_page_time'), // in seconds
  
  // Error tracking
  errors: jsonb('errors').default([]),
  warnings: jsonb('warnings').default([]),
  
  // Configuration snapshot
  crawlerVersion: varchar('crawler_version', { length: 20 }),
  crawlerConfig: jsonb('crawler_config').default({}),
  
  // Results summary
  summary: jsonb('summary').default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_crawl_sessions_kb').on(table.knowledgeBaseId),
  index('idx_crawl_sessions_status').on(table.status),
  index('idx_crawl_sessions_type').on(table.sessionType),
  index('idx_crawl_sessions_started').on(table.startedAt),
]);

export const crawlPages = pgTable('crawl_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  crawlSessionId: uuid('crawl_session_id').references(() => crawlSessions.id, { onDelete: 'cascade' }).notNull(),
  
  // Page information
  url: text('url').notNull(),
  urlHash: varchar('url_hash', { length: 64 }).notNull(),
  title: text('title'),
  status: varchar('status', { length: 20 }).notNull(), // 'pending', 'crawled', 'skipped', 'failed'
  
  // HTTP response data
  httpStatus: integer('http_status'),
  httpHeaders: jsonb('http_headers').default({}),
  contentType: varchar('content_type', { length: 100 }),
  contentLength: integer('content_length'),
  
  // Content analysis
  language: varchar('language', { length: 5 }),
  textContent: text('text_content'),
  htmlContent: text('html_content'),
  structuredData: jsonb('structured_data').default([]),
  
  // Extracted metadata
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImage: text('og_image'),
  
  // Links and references
  internalLinks: jsonb('internal_links').default([]),
  externalLinks: jsonb('external_links').default([]),
  assets: jsonb('assets').default([]),
  
  // Performance and quality
  loadTime: real('load_time'), // in seconds
  size: integer('size'), // in bytes
  qualityScore: real('quality_score'),
  
  // Error information
  error: text('error'),
  errorDetails: jsonb('error_details').default({}),
  
  // Processing timestamps
  crawledAt: timestamp('crawled_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_crawl_pages_session').on(table.crawlSessionId),
  index('idx_crawl_pages_url_hash').on(table.urlHash),
  index('idx_crawl_pages_status').on(table.status),
  index('idx_crawl_pages_crawled').on(table.crawledAt),
]);

// Zod schemas for validation
export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases, {
  status: z.enum(['initializing', 'crawling', 'indexing', 'ready', 'error', 'outdated']),
  indexType: z.enum(['hnsw', 'ivfflat']),
});

export const selectKnowledgeBaseSchema = createSelectSchema(knowledgeBases);

export const insertKnowledgeChunkSchema = createInsertSchema(knowledgeChunks, {
  content: z.string().min(1),
  language: z.string().length(2),
  contentType: z.enum(['text', 'code', 'list', 'table', 'form', 'navigation']),
  pageType: z.enum(['home', 'product', 'blog', 'contact', 'about', 'service', 'other']),
  importance: z.enum(['high', 'medium', 'low']),
});

export const selectKnowledgeChunkSchema = createSelectSchema(knowledgeChunks);

export const insertCrawlSessionSchema = createInsertSchema(crawlSessions, {
  sessionType: z.enum(['full', 'delta', 'manual', 'scheduled']),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
});

export const selectCrawlSessionSchema = createSelectSchema(crawlSessions);

export const insertCrawlPageSchema = createInsertSchema(crawlPages, {
  status: z.enum(['pending', 'crawled', 'skipped', 'failed']),
});

export const selectCrawlPageSchema = createSelectSchema(crawlPages);

// Custom validation schemas
export const kbStatusSchema = z.enum(['initializing', 'crawling', 'indexing', 'ready', 'error', 'outdated']);
export const crawlSessionTypeSchema = z.enum(['full', 'delta', 'manual', 'scheduled']);
export const crawlSessionStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled']);

// Types
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
export type CrawlSession = typeof crawlSessions.$inferSelect;
export type NewCrawlSession = typeof crawlSessions.$inferInsert;
export type CrawlPage = typeof crawlPages.$inferSelect;
export type NewCrawlPage = typeof crawlPages.$inferInsert;