/**
 * Queue Conventions - Job naming, payload schemas, retry policies
 * 
 * Defines consistent patterns for job naming, idempotency keys,
 * retry strategies, and payload validation schemas.
 */

import { z } from 'zod';
import { registerJobSchema } from './factory.js';

/**
 * Job naming convention: domain:action
 * Examples: ai:process-query, crawler:index-site, voice:synthesize
 */
export const JobTypes = {
  // AI Domain
  AI_PROCESS_QUERY: 'ai:process-query',
  AI_GENERATE_EMBEDDING: 'ai:generate-embedding',
  AI_UPDATE_KB: 'ai:update-kb',
  AI_REINDEX_VECTORS: 'ai:reindex-vectors',
  
  // Crawler Domain
  CRAWLER_INDEX_SITE: 'crawler:index-site',
  CRAWLER_SCRAPE_PAGE: 'crawler:scrape-page',
  CRAWLER_UPDATE_SITEMAP: 'crawler:update-sitemap',
  CRAWLER_VALIDATE_LINKS: 'crawler:validate-links',
  
  // Voice Domain
  VOICE_SYNTHESIZE_TTS: 'voice:synthesize-tts',
  VOICE_PROCESS_STT: 'voice:process-stt',
  VOICE_STREAM_AUDIO: 'voice:stream-audio',
  
  // Analytics Domain
  ANALYTICS_TRACK_EVENT: 'analytics:track-event',
  ANALYTICS_COMPUTE_METRICS: 'analytics:compute-metrics',
  ANALYTICS_GENERATE_REPORT: 'analytics:generate-report',
  
  // Maintenance Domain
  MAINTENANCE_CLEANUP_TEMP: 'maintenance:cleanup-temp',
  MAINTENANCE_BACKUP_KB: 'maintenance:backup-kb',
  MAINTENANCE_OPTIMIZE_DB: 'maintenance:optimize-db',
} as const;

export type JobType = typeof JobTypes[keyof typeof JobTypes];

/**
 * Base job payload schema with common fields
 */
export const BaseJobPayloadSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  siteId: z.string().uuid('Invalid site ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  traceId: z.string().optional(), // For distributed tracing
  idempotencyKey: z.string().optional(), // For idempotent operations
  priority: z.number().int().min(1).max(10).default(5),
  metadata: z.record(z.any()).default({}),
});

/**
 * AI Job Schemas
 */
export const AIProcessQuerySchema = BaseJobPayloadSchema.extend({
  query: z.string().min(1, 'Query cannot be empty').max(1000, 'Query too long'),
  sessionId: z.string().uuid('Invalid session ID'),
  locale: z.string().optional(),
  context: z.record(z.any()).optional(),
});

export const AIGenerateEmbeddingSchema = BaseJobPayloadSchema.extend({
  content: z.string().min(1, 'Content cannot be empty'),
  contentHash: z.string().min(1, 'Content hash required'),
  chunkIndex: z.number().int().nonnegative(),
  documentId: z.string().uuid('Invalid document ID'),
});

export const AIUpdateKBSchema = BaseJobPayloadSchema.extend({
  documentIds: z.array(z.string().uuid()).min(1, 'At least one document ID required'),
  operation: z.enum(['add', 'update', 'delete']),
  force: z.boolean().default(false),
});

/**
 * Crawler Job Schemas
 */
export const CrawlerIndexSiteSchema = BaseJobPayloadSchema.extend({
  url: z.string().url('Invalid URL'),
  depth: z.number().int().min(1).max(10).default(3),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  respectRobotsTxt: z.boolean().default(true),
  userAgent: z.string().optional(),
});

export const CrawlerScrapePageSchema = BaseJobPayloadSchema.extend({
  url: z.string().url('Invalid URL'),
  parentUrl: z.string().url().optional(),
  depth: z.number().int().nonnegative(),
  headers: z.record(z.string()).optional(),
  cookies: z.record(z.string()).optional(),
});

/**
 * Voice Job Schemas
 */
export const VoiceSynthesizeTTSSchema = BaseJobPayloadSchema.extend({
  text: z.string().min(1, 'Text cannot be empty').max(4000, 'Text too long'),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4.0).default(1.0),
  format: z.enum(['mp3', 'wav', 'ogg']).default('mp3'),
  sessionId: z.string().uuid('Invalid session ID'),
});

export const VoiceProcessSTTSchema = BaseJobPayloadSchema.extend({
  audioBuffer: z.instanceof(Buffer, { message: 'Audio buffer required' }),
  format: z.enum(['mp3', 'wav', 'ogg', 'webm']),
  language: z.string().optional(),
  sessionId: z.string().uuid('Invalid session ID'),
});

/**
 * Analytics Job Schemas
 */
export const AnalyticsTrackEventSchema = BaseJobPayloadSchema.extend({
  eventType: z.string().min(1, 'Event type required'),
  eventData: z.record(z.any()),
  timestamp: z.date().default(() => new Date()),
  sessionId: z.string().uuid().optional(),
});

/**
 * Maintenance Job Schemas
 */
export const MaintenanceCleanupTempSchema = BaseJobPayloadSchema.extend({
  olderThanHours: z.number().int().min(1).default(24),
  dryRun: z.boolean().default(false),
});

/**
 * Register all schemas
 */
export function registerAllJobSchemas(): void {
  // AI Jobs
  registerJobSchema(JobTypes.AI_PROCESS_QUERY, AIProcessQuerySchema);
  registerJobSchema(JobTypes.AI_GENERATE_EMBEDDING, AIGenerateEmbeddingSchema);
  registerJobSchema(JobTypes.AI_UPDATE_KB, AIUpdateKBSchema);
  
  // Crawler Jobs
  registerJobSchema(JobTypes.CRAWLER_INDEX_SITE, CrawlerIndexSiteSchema);
  registerJobSchema(JobTypes.CRAWLER_SCRAPE_PAGE, CrawlerScrapePageSchema);
  
  // Voice Jobs
  registerJobSchema(JobTypes.VOICE_SYNTHESIZE_TTS, VoiceSynthesizeTTSSchema);
  registerJobSchema(JobTypes.VOICE_PROCESS_STT, VoiceProcessSTTSchema);
  
  // Analytics Jobs
  registerJobSchema(JobTypes.ANALYTICS_TRACK_EVENT, AnalyticsTrackEventSchema);
  
  // Maintenance Jobs
  registerJobSchema(JobTypes.MAINTENANCE_CLEANUP_TEMP, MaintenanceCleanupTempSchema);
}

/**
 * Retry policies for different job types
 */
export const RetryPolicies = {
  // Quick operations - fast retry, few attempts
  FAST: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
  },
  
  // Standard operations - balanced retry
  STANDARD: {
    attempts: 5,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
  
  // Heavy operations - slower retry, more attempts
  HEAVY: {
    attempts: 8,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
  },
  
  // Critical operations - many attempts, longer delays
  CRITICAL: {
    attempts: 12,
    backoff: {
      type: 'exponential' as const,
      delay: 10000,
    },
  },
  
  // No retry for operations that should not be retried
  NO_RETRY: {
    attempts: 1,
    backoff: {
      type: 'fixed' as const,
      delay: 0,
    },
  },
} as const;

/**
 * Job priority levels
 */
export const JobPriority = {
  CRITICAL: 1,    // System-critical operations
  HIGH: 3,        // User-facing operations
  NORMAL: 5,      // Standard background tasks
  LOW: 7,         // Maintenance, cleanup
  BULK: 10,       // Bulk operations, reports
} as const;

/**
 * Generate idempotency key for job deduplication
 */
export function generateIdempotencyKey(
  jobType: JobType,
  tenantId: string,
  ...identifiers: string[]
): string {
  const parts = [jobType, tenantId, ...identifiers];
  return parts.join(':');
}

/**
 * Job queue names based on priority and type
 */
export const QueueNames = {
  CRITICAL: 'critical-queue',    // High priority, low latency
  AI: 'ai-queue',               // AI processing jobs
  CRAWLER: 'crawler-queue',     // Web crawling jobs
  VOICE: 'voice-queue',         // Voice processing jobs
  ANALYTICS: 'analytics-queue', // Analytics processing
  MAINTENANCE: 'maintenance-queue', // Background maintenance
} as const;

/**
 * Queue-specific configurations
 */
export const QueueConfigs = {
  [QueueNames.CRITICAL]: {
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
    priority: JobPriority.CRITICAL,
  },
  
  [QueueNames.AI]: {
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
    priority: JobPriority.HIGH,
  },
  
  [QueueNames.CRAWLER]: {
    concurrency: 3,
    limiter: { max: 10, duration: 1000 },
    priority: JobPriority.NORMAL,
  },
  
  [QueueNames.VOICE]: {
    concurrency: 8,
    limiter: { max: 30, duration: 1000 },
    priority: JobPriority.HIGH,
  },
  
  [QueueNames.ANALYTICS]: {
    concurrency: 2,
    limiter: { max: 5, duration: 1000 },
    priority: JobPriority.LOW,
  },
  
  [QueueNames.MAINTENANCE]: {
    concurrency: 1,
    limiter: { max: 2, duration: 1000 },
    priority: JobPriority.LOW,
  },
} as const;

/**
 * Type exports for consuming modules
 */
export type AIProcessQueryJob = z.infer<typeof AIProcessQuerySchema>;
export type AIGenerateEmbeddingJob = z.infer<typeof AIGenerateEmbeddingSchema>;
export type CrawlerIndexSiteJob = z.infer<typeof CrawlerIndexSiteSchema>;
export type VoiceSynthesizeTTSJob = z.infer<typeof VoiceSynthesizeTTSSchema>;
export type AnalyticsTrackEventJob = z.infer<typeof AnalyticsTrackEventSchema>;