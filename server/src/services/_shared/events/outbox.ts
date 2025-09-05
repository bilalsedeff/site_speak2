/**
 * Transactional Outbox - Reliable event publishing pattern
 * 
 * Implements transactional outbox pattern to atomically persist
 * business data and event records, with polling relay for publishing.
 */

import { db, withTransaction } from '../db/index.js';
import { 
  outboxEvents, 
  OutboxEventStatus,
  OutboxEventInsert,
} from '../../../infrastructure/database/schema/outbox-events.js';
import { logger } from '../telemetry/logger.js';
import { eventBus, Event } from './eventBus.js';
import { eq, and, sql, asc } from 'drizzle-orm';

/**
 * Database outbox event type for compatibility
 */
type DatabaseOutboxEvent = typeof outboxEvents.$inferSelect;

/**
 * Transaction helper with outbox event recording
 */
export async function withOutbox<T>(
  callback: (tx: any) => Promise<T>,
  events: OutboxEventInsert[] = []
): Promise<T> {
  return withTransaction(async (tx) => {
    // Execute business logic
    const result = await callback(tx);

    // Record outbox events if any
    if (events.length > 0) {
      const outboxRecords = events.map(event => ({
        tenantId: event.tenantId,
        aggregate: event.aggregate,
        aggregateId: event.aggregateId,
        type: event.type,
        payload: event.payload,
        correlationId: event.correlationId || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: OutboxEventStatus.PENDING,
        attempts: 0,
        maxAttempts: 5,
      }));

      // Insert into outbox table
      await tx.insert(outboxEvents).values(outboxRecords);
      
      logger.debug('Outbox events recorded', {
        count: outboxRecords.length,
        events: outboxRecords.map(e => ({ type: e.type, aggregate: e.aggregate })),
      });
    }

    return result;
  });
}

/**
 * Outbox relay service for polling and publishing events
 */
export class OutboxRelay {
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 5000; // 5 seconds
  private readonly maxAttempts = 5;
  private readonly batchSize = 100;

  constructor() {
    this.setupGracefulShutdown();
  }

  /**
   * Start the outbox relay
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Outbox relay already running');
      return;
    }

    logger.info('Starting outbox relay...');
    this.isRunning = true;

    // Start polling for unpublished events
    this.pollingInterval = setInterval(async () => {
      try {
        await this.processOutboxEvents();
      } catch (error) {
        logger.error('Outbox polling error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, this.pollIntervalMs);

    logger.info('Outbox relay started', {
      pollInterval: this.pollIntervalMs,
      batchSize: this.batchSize,
      maxAttempts: this.maxAttempts,
    });
  }

  /**
   * Stop the outbox relay
   */
  async stop(): Promise<void> {
    logger.info('Stopping outbox relay...');
    
    this.isRunning = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    logger.info('Outbox relay stopped');
  }

  /**
   * Process unpublished outbox events
   */
  private async processOutboxEvents(): Promise<void> {
    if (!this.isRunning) {return;}

    try {
      logger.debug('Processing outbox events...');

      // Query unpublished events
      const unpublishedEvents = await db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, OutboxEventStatus.PENDING))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(this.batchSize);

      if (unpublishedEvents.length > 0) {
        logger.info('Processing outbox events', { count: unpublishedEvents.length });

        for (const event of unpublishedEvents) {
          await this.publishEvent(event);
        }
      }
    } catch (error) {
      logger.error('Error processing outbox events', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Publish a single outbox event
   */
  private async publishEvent(outboxEvent: DatabaseOutboxEvent): Promise<void> {
    try {
      // Convert outbox event to internal event format
      const event: Event = {
        type: outboxEvent.type,
        payload: outboxEvent.payload as Record<string, any>,
        metadata: {
          tenantId: outboxEvent.tenantId,
          timestamp: outboxEvent.createdAt,
          source: 'outbox',
          correlationId: outboxEvent.correlationId || crypto.randomUUID(),
        },
      };

      // Publish to event bus
      await eventBus.publish(event.type, event.payload, event.metadata);

      // Mark as published in database
      await this.markAsPublished(outboxEvent.id);

      logger.debug('Outbox event published', {
        id: outboxEvent.id,
        type: outboxEvent.type,
        tenantId: outboxEvent.tenantId,
      });
    } catch (error) {
      await this.markAsFailed(outboxEvent.id, error instanceof Error ? error.message : 'Unknown error');
      
      logger.error('Failed to publish outbox event', {
        id: outboxEvent.id,
        type: outboxEvent.type,
        tenantId: outboxEvent.tenantId,
        attempts: outboxEvent.attempts,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Mark outbox event as published
   */
  private async markAsPublished(eventId: string): Promise<void> {
    try {
      await db
        .update(outboxEvents)
        .set({ 
          status: OutboxEventStatus.PUBLISHED,
          publishedAt: new Date() 
        })
        .where(eq(outboxEvents.id, eventId));
      
      logger.debug('Outbox event marked as published', { eventId });
    } catch (error) {
      logger.error('Failed to mark outbox event as published', {
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Mark outbox event as failed
   */
  private async markAsFailed(eventId: string, errorMessage: string): Promise<void> {
    try {
      // Get current event to check attempts
      const [currentEvent] = await db
        .select({ attempts: outboxEvents.attempts, maxAttempts: outboxEvents.maxAttempts })
        .from(outboxEvents)
        .where(eq(outboxEvents.id, eventId));

      if (!currentEvent) {
        logger.warn('Outbox event not found for failure marking', { eventId });
        return;
      }

      const newAttempts = currentEvent.attempts + 1;
      const status = newAttempts >= currentEvent.maxAttempts 
        ? OutboxEventStatus.DEAD_LETTER 
        : OutboxEventStatus.FAILED;

      await db
        .update(outboxEvents)
        .set({
          attempts: newAttempts,
          lastAttemptAt: new Date(),
          error: errorMessage,
          status,
        })
        .where(eq(outboxEvents.id, eventId));
      
      logger.debug('Outbox event marked as failed', { 
        eventId, 
        errorMessage,
        attempts: newAttempts,
        status,
      });
    } catch (error) {
      logger.error('Failed to mark outbox event as failed', {
        eventId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      await this.stop();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }

  /**
   * Get outbox statistics
   */
  async getStats(): Promise<{
    pendingEvents: number;
    failedEvents: number;
    publishedToday: number;
    oldestPending?: Date;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get counts by status
      const [pendingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(outboxEvents)
        .where(eq(outboxEvents.status, OutboxEventStatus.PENDING));

      const [failedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(outboxEvents)
        .where(eq(outboxEvents.status, OutboxEventStatus.FAILED));

      const [publishedTodayCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, OutboxEventStatus.PUBLISHED),
            sql`${outboxEvents.publishedAt} >= ${today}`
          )
        );

      // Get oldest pending event
      const [oldestPending] = await db
        .select({ createdAt: outboxEvents.createdAt })
        .from(outboxEvents)
        .where(eq(outboxEvents.status, OutboxEventStatus.PENDING))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(1);

      const stats = {
        pendingEvents: pendingCount?.count || 0,
        failedEvents: failedCount?.count || 0,
        publishedToday: publishedTodayCount?.count || 0,
        ...(oldestPending && { oldestPending: oldestPending.createdAt }),
      };

      return stats;
    } catch (error) {
      logger.error('Failed to get outbox stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        pendingEvents: 0,
        failedEvents: 0,
        publishedToday: 0,
      };
    }
  }

  /**
   * Retry failed events
   */
  async retryFailedEvents(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const cutoffTime = new Date(Date.now() - maxAge);

      // First, count the events that will be retried
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, OutboxEventStatus.FAILED),
            sql`${outboxEvents.createdAt} >= ${cutoffTime}`,
            sql`${outboxEvents.attempts} < ${outboxEvents.maxAttempts}`
          )
        );

      const retryCount = countResult?.count || 0;

      if (retryCount > 0) {
        // Reset failed events within the age limit that haven't exceeded max attempts
        await db
          .update(outboxEvents)
          .set({
            status: OutboxEventStatus.PENDING,
            error: null,
            lastAttemptAt: null,
          })
          .where(
            and(
              eq(outboxEvents.status, OutboxEventStatus.FAILED),
              sql`${outboxEvents.createdAt} >= ${cutoffTime}`,
              sql`${outboxEvents.attempts} < ${outboxEvents.maxAttempts}`
            )
          );
      }
      
      logger.info('Retrying failed outbox events', { 
        maxAge, 
        retriedCount: retryCount 
      });
      
      return retryCount;
    } catch (error) {
      logger.error('Failed to retry outbox events', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }
}

/**
 * Global outbox relay instance
 */
export const outboxRelay = new OutboxRelay();

/**
 * Helper functions for outbox operations
 */
export const outboxHelpers = {
  /**
   * Create outbox event record
   */
  createEvent: (
    tenantId: string,
    aggregate: string,
    aggregateId: string,
    type: string,
    payload: Record<string, any>,
    correlationId?: string
  ): OutboxEventInsert => ({
    tenantId,
    aggregate,
    aggregateId,
    type,
    payload,
    correlationId: correlationId || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  }),

  /**
   * Batch create multiple outbox events
   */
  createEvents: (
    events: Array<{
      tenantId: string;
      aggregate: string;
      aggregateId: string;
      type: string;
      payload: Record<string, any>;
    }>
  ): OutboxEventInsert[] => events.map(event => outboxHelpers.createEvent(
    event.tenantId,
    event.aggregate,
    event.aggregateId,
    event.type,
    event.payload
  )),
};

// Types already exported as interfaces above