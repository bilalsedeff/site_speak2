import { pgTable, uuid, varchar, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { tenants } from './tenants';

/**
 * Outbox Events Table - Transactional Outbox Pattern
 * 
 * Stores events atomically with business data to ensure reliable 
 * event publishing without distributed transactions.
 */
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Tenant isolation
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  
  // Event identity
  aggregate: varchar('aggregate', { length: 100 }).notNull(), // 'site', 'user', 'kb-document'
  aggregateId: uuid('aggregate_id').notNull(),
  type: varchar('type', { length: 100 }).notNull(), // Event type like 'site.published'
  
  // Event data
  payload: jsonb('payload').notNull(),
  
  // Correlation tracking
  correlationId: varchar('correlation_id', { length: 100 }),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  
  // Retry management
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  
  // Error tracking
  error: text('error'),
  
  // Processing status
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'published', 'failed', 'dead_letter'
  
}, (table) => ({
  // Indexes for efficient polling and querying
  tenantIdIdx: index('outbox_events_tenant_id_idx').on(table.tenantId),
  statusIdx: index('outbox_events_status_idx').on(table.status),
  createdAtIdx: index('outbox_events_created_at_idx').on(table.createdAt),
  aggregateIdx: index('outbox_events_aggregate_idx').on(table.aggregate, table.aggregateId),
  typeIdx: index('outbox_events_type_idx').on(table.type),
  
  // Composite index for efficient polling
  pendingEventsIdx: index('outbox_events_pending_polling_idx')
    .on(table.status, table.createdAt)
    .where(eq(table.status, 'pending')),
    
  // Index for correlation tracking
  correlationIdx: index('outbox_events_correlation_idx').on(table.correlationId),
}));

/**
 * Zod schemas for validation
 */
export const insertOutboxEventSchema = createInsertSchema(outboxEvents, {
  payload: z.record(z.any()),
  correlationId: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  publishedAt: true,
  lastAttemptAt: true,
});

export const selectOutboxEventSchema = createSelectSchema(outboxEvents);

export const updateOutboxEventSchema = insertOutboxEventSchema.partial().extend({
  id: z.string().uuid(),
});

/**
 * Types for TypeScript
 */
export type OutboxEvent = z.infer<typeof selectOutboxEventSchema>;
export type OutboxEventInsert = z.infer<typeof insertOutboxEventSchema>;
export type OutboxEventUpdate = z.infer<typeof updateOutboxEventSchema>;

/**
 * Event status enum
 */
export const OutboxEventStatus = {
  PENDING: 'pending',
  PUBLISHED: 'published', 
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
} as const;

export type OutboxEventStatusType = typeof OutboxEventStatus[keyof typeof OutboxEventStatus];

/**
 * Helper functions for working with outbox events
 */
export const outboxEventHelpers = {
  /**
   * Check if event can be retried
   */
  canRetry: (event: OutboxEvent): boolean => {
    return event.status === 'failed' && event.attempts < event.maxAttempts;
  },

  /**
   * Check if event should be moved to dead letter
   */
  shouldDeadLetter: (event: OutboxEvent): boolean => {
    return event.status === 'failed' && event.attempts >= event.maxAttempts;
  },

  /**
   * Calculate next retry delay with exponential backoff
   */
  getRetryDelay: (attempts: number): number => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds
  },

  /**
   * Check if event is stale and needs attention
   */
  isStale: (event: OutboxEvent, maxAgeMs: number = 24 * 60 * 60 * 1000): boolean => {
    const age = Date.now() - event.createdAt.getTime();
    return age > maxAgeMs && event.status === 'pending';
  },
};
