/**
 * Events Service - Main exports and event system initialization
 * 
 * Provides unified event infrastructure with in-process EventBus
 * and durable transactional outbox pattern.
 */

// Re-export event bus
export {
  eventBus,
  EventBus,
  EventTypes,
  events,
} from './eventBus.js';

export type { 
  Event, 
  EventHandler, 
  EventSubscription, 
  EventType 
} from './eventBus.js';

// Re-export outbox
export {
  withOutbox,
  outboxRelay,
  OutboxRelay,
  outboxHelpers,
} from './outbox.js';

export type { OutboxEvent, OutboxEventInsert } from '../../../infrastructure/database/schema/outbox-events.js';

import { eventBus, Event } from './eventBus.js';
import { outboxRelay, withOutbox } from './outbox.js';
import { logger } from '../telemetry/logger.js';

/**
 * Initialize complete event system
 */
export async function initializeEventSystem(): Promise<void> {
  try {
    logger.info('Initializing event system...');

    // Start outbox relay for durable events
    await outboxRelay.start();

    // Setup system event handlers
    setupSystemEventHandlers();

    logger.info('Event system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize event system', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Setup system-wide event handlers
 */
function setupSystemEventHandlers(): void {
  // System startup event
  eventBus.subscribe('system.startup', async (event) => {
    logger.info('System startup event received', {
      tenantId: event.metadata.tenantId,
      timestamp: event.metadata.timestamp,
    });
  });

  // System error event
  eventBus.subscribe('system.error', async (event) => {
    logger.error('System error event received', {
      error: event.payload.error,
      context: event.payload.context,
      tenantId: event.metadata.tenantId,
    });
  });

  // Knowledge base events for cache invalidation
  eventBus.subscribe('kb.document.added', async (event) => {
    logger.info('KB document added, may trigger reindexing', {
      documentId: event.payload.documentId,
      siteId: event.payload.siteId,
      tenantId: event.metadata.tenantId,
    });
  });

  eventBus.subscribe('kb.document.updated', async (event) => {
    logger.info('KB document updated, may trigger reindexing', {
      documentId: event.payload.documentId,
      siteId: event.payload.siteId,
      tenantId: event.metadata.tenantId,
    });
  });

  // Voice session tracking
  eventBus.subscribe('voice.session.started', async (event) => {
    logger.info('Voice session started', {
      sessionId: event.payload.sessionId,
      siteId: event.payload.siteId,
      tenantId: event.metadata.tenantId,
    });
  });

  eventBus.subscribe('voice.session.ended', async (event) => {
    logger.info('Voice session ended', {
      sessionId: event.payload.sessionId,
      duration: event.payload.duration,
      tenantId: event.metadata.tenantId,
    });
  });

  logger.debug('System event handlers registered');
}

/**
 * Shutdown event system gracefully
 */
export async function shutdownEventSystem(): Promise<void> {
  try {
    logger.info('Shutting down event system...');

    // Stop outbox relay
    await outboxRelay.stop();

    // Shutdown event bus
    await eventBus.shutdown();

    logger.info('Event system shutdown completed');
  } catch (error) {
    logger.error('Error shutting down event system', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Health check for event system
 */
export function checkEventSystemHealth(): {
  healthy: boolean;
  components: {
    eventBus: boolean;
    outboxRelay: boolean;
  };
  stats: {
    subscriptions: Record<string, number>;
    outboxStats: any;
  };
} {
  const eventBusStats = eventBus.getStats();
  
  return {
    healthy: true, // Basic health check
    components: {
      eventBus: true,
      outboxRelay: true, // Would check if relay is running
    },
    stats: {
      subscriptions: eventBusStats.subscriptions,
      outboxStats: {}, // Would come from outboxRelay.getStats()
    },
  };
}

/**
 * Event publishing helpers with outbox support
 */
export const publishEvent = {
  /**
   * Publish event immediately (in-process only)
   */
  immediate: async <T = any>(
    eventType: string,
    payload: T,
    metadata: Partial<Event['metadata']>
  ): Promise<void> => {
    return eventBus.publish(eventType, payload, metadata);
  },

  /**
   * Publish event with outbox pattern (durable)
   */
  durable: async <T = any>(
    tx: any,
    tenantId: string,
    aggregate: string,
    aggregateId: string,
    eventType: string,
    payload: T,
    correlationId?: string
  ): Promise<void> => {
    // Use the withOutbox helper to insert event atomically within transaction
    const outboxEvent = {
      tenantId,
      aggregate,
      aggregateId,
      type: eventType,
      payload: payload as Record<string, any>,
      correlationId: correlationId || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    logger.debug('Durable event queued for publishing', {
      type: eventType,
      aggregate,
      aggregateId,
      tenantId,
    });

    // This would typically be called like:
    // await withOutbox(async (tx) => {
    //   // business logic here
    //   return result;
    // }, [outboxEvent]);
    
    // For now, we'll insert directly since we already have a transaction
    const { outboxEvents, OutboxEventStatus } = await import('../../../infrastructure/database/schema/outbox-events.js');
    
    await tx.insert(outboxEvents).values({
      tenantId: outboxEvent.tenantId,
      aggregate: outboxEvent.aggregate,
      aggregateId: outboxEvent.aggregateId,
      type: outboxEvent.type,
      payload: outboxEvent.payload,
      correlationId: outboxEvent.correlationId,
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      maxAttempts: 5,
    });
  },
};

/**
 * Create event service for dependency injection
 */
export const createEventService = () => ({
  bus: eventBus,
  relay: outboxRelay,
  publish: publishEvent,
  withOutbox,
  initialize: initializeEventSystem,
  shutdown: shutdownEventSystem,
  health: checkEventSystemHealth,
});

export type EventService = ReturnType<typeof createEventService>;

// Setup shutdown handlers
process.on('SIGINT', shutdownEventSystem);
process.on('SIGTERM', shutdownEventSystem);
process.on('beforeExit', shutdownEventSystem);