/**
 * Event Bus - In-process pub/sub for local events
 * 
 * Provides lightweight EventEmitter-based event bus for
 * non-durable local pub/sub within the same process.
 */

import { EventEmitter } from 'events';
import { logger } from '../telemetry/logger.js';
import { withSpan } from '../telemetry/otel.js';

/**
 * Event interface
 */
export interface Event {
  type: string;
  payload: Record<string, any>;
  metadata: {
    tenantId: string;
    timestamp: Date;
    correlationId?: string;
    source: string;
    version?: string;
  };
}

/**
 * Event handler interface
 */
export interface EventHandler<T = any> {
  (event: Event & { payload: T }): Promise<void> | void;
}

/**
 * Event subscription
 */
export interface EventSubscription {
  eventType: string;
  handler: EventHandler;
  once?: boolean;
  unsubscribe(): void;
}

/**
 * Event bus implementation
 */
export class EventBus extends EventEmitter {
  private subscriptions = new Map<string, Set<EventHandler>>();
  private onceSubscriptions = new Map<string, Set<EventHandler>>();

  constructor() {
    super();
    this.setMaxListeners(100); // Increase for high-throughput scenarios
  }

  /**
   * Publish an event
   */
  async publish<T = any>(
    eventType: string,
    payload: T,
    metadata: Partial<Event['metadata']> = {}
  ): Promise<void> {
    const event: Event = {
      type: eventType,
      payload: payload as Record<string, any>,
      metadata: {
        timestamp: new Date(),
        source: 'event-bus',
        ...metadata,
        tenantId: metadata.tenantId || 'system',
      },
    };

    return withSpan(`event.publish.${eventType}`, async (span) => {
      span.setAttributes({
        'event.type': eventType,
        'event.tenant_id': event.metadata.tenantId,
        'event.source': event.metadata.source,
        'event.correlation_id': event.metadata.correlationId || '',
      });

      logger.debug('Publishing event', {
        eventType,
        tenantId: event.metadata.tenantId,
        correlationId: event.metadata.correlationId,
        source: event.metadata.source,
      });

      try {
        // Emit event using EventEmitter
        this.emit(eventType, event);

        // Track successful publish
        logger.debug('Event published successfully', {
          eventType,
          tenantId: event.metadata.tenantId,
        });
      } catch (error) {
        logger.error('Event publish failed', {
          eventType,
          tenantId: event.metadata.tenantId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      }
    });
  }

  /**
   * Subscribe to events
   */
  subscribe<T = any>(
    eventType: string,
    handler: EventHandler<T>,
    options: { once?: boolean } = {}
  ): EventSubscription {
    const wrappedHandler = async (event: Event) => {
      return withSpan(`event.handle.${eventType}`, async (span) => {
        span.setAttributes({
          'event.type': eventType,
          'event.tenant_id': event.metadata.tenantId,
          'event.handler': handler.name || 'anonymous',
        });

        try {
          await handler(event as Event & { payload: T });
          
          logger.debug('Event handled successfully', {
            eventType,
            tenantId: event.metadata.tenantId,
            handler: handler.name || 'anonymous',
          });
        } catch (error) {
          logger.error('Event handler error', {
            eventType,
            tenantId: event.metadata.tenantId,
            handler: handler.name || 'anonymous',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          // Re-throw to let the event bus handle it
          throw error;
        }
      });
    };

    if (options.once) {
      this.once(eventType, wrappedHandler);
      
      // Track once subscriptions
      if (!this.onceSubscriptions.has(eventType)) {
        this.onceSubscriptions.set(eventType, new Set());
      }
      this.onceSubscriptions.get(eventType)!.add(handler);
    } else {
      this.on(eventType, wrappedHandler);
      
      // Track regular subscriptions
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, new Set());
      }
      this.subscriptions.get(eventType)!.add(handler);
    }

    logger.debug('Event subscription added', {
      eventType,
      handler: handler.name || 'anonymous',
      once: options.once || false,
    });

    return {
      eventType,
      handler,
      once: options.once || false,
      unsubscribe: () => {
        this.removeListener(eventType, wrappedHandler);
        
        if (options.once) {
          this.onceSubscriptions.get(eventType)?.delete(handler);
        } else {
          this.subscriptions.get(eventType)?.delete(handler);
        }

        logger.debug('Event subscription removed', {
          eventType,
          handler: handler.name || 'anonymous',
        });
      },
    };
  }

  /**
   * Unsubscribe all handlers for an event type
   */
  unsubscribeAll(eventType: string): void {
    this.removeAllListeners(eventType);
    this.subscriptions.delete(eventType);
    this.onceSubscriptions.delete(eventType);
    
    logger.debug('All subscriptions removed for event type', { eventType });
  }

  /**
   * Get subscription stats
   */
  getStats(): {
    totalEvents: number;
    subscriptions: Record<string, number>;
    onceSubscriptions: Record<string, number>;
  } {
    const subscriptions: Record<string, number> = {};
    const onceSubscriptions: Record<string, number> = {};

    // Convert to arrays to avoid iterator issues
    for (const [eventType, handlers] of Array.from(this.subscriptions.entries())) {
      subscriptions[eventType] = handlers.size;
    }

    for (const [eventType, handlers] of Array.from(this.onceSubscriptions.entries())) {
      onceSubscriptions[eventType] = handlers.size;
    }

    return {
      totalEvents: this.eventNames().length,
      subscriptions,
      onceSubscriptions,
    };
  }

  /**
   * Wait for specific event with timeout
   */
  async waitForEvent<T = any>(
    eventType: string,
    timeout: number = 30000,
    filter?: (event: Event) => boolean
  ): Promise<Event & { payload: T }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      const handler = (event: Event) => {
        if (!filter || filter(event)) {
          clearTimeout(timer);
          resolve(event as Event & { payload: T });
        }
      };

      this.once(eventType, handler);
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down event bus...');
    
    this.removeAllListeners();
    this.subscriptions.clear();
    this.onceSubscriptions.clear();
    
    logger.info('Event bus shutdown completed');
  }
}

/**
 * Global event bus instance
 */
export const eventBus = new EventBus();

/**
 * Common event types
 */
export const EventTypes = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  
  // Site events
  SITE_CREATED: 'site.created',
  SITE_UPDATED: 'site.updated',
  SITE_PUBLISHED: 'site.published',
  SITE_DELETED: 'site.deleted',
  
  // Knowledge base events
  KB_DOCUMENT_ADDED: 'kb.document.added',
  KB_DOCUMENT_UPDATED: 'kb.document.updated',
  KB_DOCUMENT_DELETED: 'kb.document.deleted',
  KB_REINDEX_REQUESTED: 'kb.reindex.requested',
  KB_REINDEX_COMPLETED: 'kb.reindex.completed',
  
  // AI events
  AI_QUERY_RECEIVED: 'ai.query.received',
  AI_QUERY_COMPLETED: 'ai.query.completed',
  AI_TRAINING_STARTED: 'ai.training.started',
  AI_TRAINING_COMPLETED: 'ai.training.completed',
  
  // Voice events
  VOICE_SESSION_STARTED: 'voice.session.started',
  VOICE_SESSION_ENDED: 'voice.session.ended',
  VOICE_TTS_REQUESTED: 'voice.tts.requested',
  VOICE_STT_COMPLETED: 'voice.stt.completed',
  
  // System events
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_ERROR: 'system.error',
  SYSTEM_HEALTH_CHECK: 'system.health.check',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

/**
 * Event publishing helpers
 */
export const events = {
  // User events
  userCreated: (userId: string, tenantId: string, userData: Record<string, any>) =>
    eventBus.publish(EventTypes.USER_CREATED, { userId, ...userData }, { tenantId }),

  userUpdated: (userId: string, tenantId: string, changes: Record<string, any>) =>
    eventBus.publish(EventTypes.USER_UPDATED, { userId, changes }, { tenantId }),

  // Site events
  siteCreated: (siteId: string, tenantId: string, siteData: Record<string, any>) =>
    eventBus.publish(EventTypes.SITE_CREATED, { siteId, ...siteData }, { tenantId }),

  sitePublished: (siteId: string, tenantId: string, url: string) =>
    eventBus.publish(EventTypes.SITE_PUBLISHED, { siteId, url }, { tenantId }),

  // Knowledge base events
  kbDocumentAdded: (documentId: string, siteId: string, tenantId: string) =>
    eventBus.publish(EventTypes.KB_DOCUMENT_ADDED, { documentId, siteId }, { tenantId }),

  kbReindexRequested: (siteId: string, tenantId: string, reason: string) =>
    eventBus.publish(EventTypes.KB_REINDEX_REQUESTED, { siteId, reason }, { tenantId }),

  // AI events
  aiQueryReceived: (sessionId: string, tenantId: string, query: string) =>
    eventBus.publish(EventTypes.AI_QUERY_RECEIVED, { sessionId, query }, { tenantId }),

  // Voice events
  voiceSessionStarted: (sessionId: string, tenantId: string, siteId: string) =>
    eventBus.publish(EventTypes.VOICE_SESSION_STARTED, { sessionId, siteId }, { tenantId }),

  // System events
  systemError: (error: Error, context: Record<string, any>) =>
    eventBus.publish(EventTypes.SYSTEM_ERROR, { 
      error: error.message, 
      stack: error.stack,
      ...context 
    }, { tenantId: 'system' }),
};

// Types already exported as interfaces above