/**
 * Events Ingestion Service - HTTP/WS ingestion with schema validation and deduplication
 * 
 * Handles analytics event ingestion following the OpenTelemetry-aligned, 
 * schema-first approach with at-least-once delivery and idempotent processing.
 */

import { Request, Response } from 'express';
import { logger } from '../telemetry/logger.js';
import { metrics } from '../telemetry/metrics.js';
import { eventBus } from '../events/eventBus.js';
import { 
  BaseEvent, 
  EventBatch, 
  EventName, 
  validateEvent, 
  validateEventBatch, 
  sanitizeEventForStorage,
  generateEventFingerprint 
} from './schemas.js';

/**
 * Ingestion configuration
 */
interface IngestionConfig {
  maxBatchSize: number;
  maxPayloadSizeKb: number;
  clockSkewToleranceMs: number;
  dedupeWindowMs: number;
  requireGzipForLargeBatches: boolean;
}

const DEFAULT_CONFIG: IngestionConfig = {
  maxBatchSize: 500,
  maxPayloadSizeKb: 500,
  clockSkewToleranceMs: 24 * 60 * 60 * 1000, // 24 hours
  dedupeWindowMs: 60 * 1000, // 1 minute
  requireGzipForLargeBatches: true,
};

/**
 * Deduplication cache - In production, use Redis
 */
const dedupeCache = new Map<string, number>();

/**
 * Ingestion result types
 */
interface IngestionResult {
  accepted: number;
  duplicates: number;
  rejected: Array<{
    event_id?: string;
    event_name?: string;
    errors: string[];
  }>;
}

/**
 * Event ingestion service
 */
export class EventsIngestService {
  private config: IngestionConfig;
  private ingestionLogger = logger;

  constructor(config: Partial<IngestionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ingest single event via HTTP POST
   */
  ingestEvent = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      // Basic validation
      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Invalid event data',
          details: ['Request body must be a valid JSON object']
        });
        return;
      }

      // Convert single event to batch format
      const batch: EventBatch = {
        events: [req.body],
        batch_id: `single_${req.body.event_id || Date.now()}`
      };

      const result = await this.processBatch(batch, {
        ...(req.headers.origin && { origin: req.headers.origin }),
        ...(req.headers.referer && !req.headers.origin && { origin: req.headers.referer }),
        ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
        ...(req.headers['content-encoding'] && { contentEncoding: req.headers['content-encoding'] }),
      });

      const duration = Date.now() - startTime;
      
      // Record metrics
      metrics.httpRequestDuration.observe(duration, { 
        endpoint: 'analytics_event',
        status: result.rejected.length > 0 ? 'partial' : 'success'
      });

      if (result.rejected.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Event validation failed',
          details: result.rejected[0]?.errors || 'Validation failed',
          stats: result
        });
      } else {
        res.status(200).json({
          success: true,
          message: 'Event ingested successfully',
          stats: result
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.ingestionLogger.error('Event ingestion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });

      metrics.httpRequestDuration.observe(duration, { 
        endpoint: 'analytics_event',
        status: 'error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Event ingestion failed'
      });
    }
  };

  /**
   * Ingest event batch via HTTP POST
   */
  ingestEventBatch = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    
    try {
      // Validate batch structure
      const batchValidation = validateEventBatch(req.body);
      if (!batchValidation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid batch format',
          details: batchValidation.errors
        });
        return;
      }

      const batch = batchValidation.data!;

      // Check batch size limits
      if (batch.events.length > this.config.maxBatchSize) {
        res.status(413).json({
          success: false,
          error: 'Batch too large',
          message: `Maximum batch size is ${this.config.maxBatchSize} events`
        });
        return;
      }

      // Check if compression required for large batches
      const payloadSizeKb = JSON.stringify(req.body).length / 1024;
      if (payloadSizeKb > 50 && this.config.requireGzipForLargeBatches) {
        const contentEncoding = req.headers['content-encoding'];
        if (!contentEncoding || !['gzip', 'br'].includes(contentEncoding)) {
          res.status(400).json({
            success: false,
            error: 'Compression required',
            message: 'Batches over 50KB must be compressed with gzip or brotli'
          });
          return;
        }
      }

      const result = await this.processBatch(batch, {
        ...(req.headers.origin && { origin: req.headers.origin }),
        ...(req.headers.referer && !req.headers.origin && { origin: req.headers.referer }),
        ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
        ...(req.headers['content-encoding'] && { contentEncoding: req.headers['content-encoding'] }),
      });

      const duration = Date.now() - startTime;
      
      // Record metrics
      metrics.httpRequestDuration.observe(duration, { 
        endpoint: 'analytics_batch',
        status: result.rejected.length > 0 ? 'partial' : 'success'
      });

      const statusCode = result.rejected.length > 0 ? 
        (result.accepted > 0 ? 207 : 400) : // 207 for partial success
        200;

      res.status(statusCode).json({
        success: result.accepted > 0,
        message: `Processed ${result.accepted} events, ${result.duplicates} duplicates, ${result.rejected.length} rejected`,
        stats: result
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.ingestionLogger.error('Batch ingestion failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        batchSize: req.body?.events?.length || 0,
        duration,
      });

      metrics.httpRequestDuration.observe(duration, { 
        endpoint: 'analytics_batch',
        status: 'error'
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Batch ingestion failed'
      });
    }
  };

  /**
   * Process event batch with validation, deduplication, and storage
   */
  private async processBatch(
    batch: EventBatch, 
    context: {
      origin?: string;
      userAgent?: string;
      contentEncoding?: string;
    }
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      accepted: 0,
      duplicates: 0,
      rejected: []
    };

    const receivedAt = new Date().toISOString();
    const validEvents: BaseEvent[] = [];

    // Phase 1: Validate each event
    for (const eventData of batch.events) {
      try {
        // Add server context
        const enrichedEvent = {
          ...eventData,
          received_at: receivedAt,
          context: {
            ...eventData.context,
            // Add server-detected context
            ...(context.userAgent && {
              device: {
                ...eventData.context?.device,
                user_agent: context.userAgent,
              }
            }),
          }
        };

        // Validate event structure
        const validation = validateEvent(
          enrichedEvent.event_name as EventName, 
          enrichedEvent
        );

        if (!validation.success) {
          result.rejected.push({
            event_id: eventData.event_id,
            event_name: eventData.event_name,
            errors: validation.errors || ['Validation failed']
          });
          continue;
        }

        const validEvent = validation.data;

        // Clock skew validation
        const occurredAt = new Date(validEvent.occurred_at).getTime();
        const now = Date.now();
        const skew = Math.abs(now - occurredAt);
        
        if (skew > this.config.clockSkewToleranceMs) {
          result.rejected.push({
            event_id: validEvent.event_id,
            event_name: validEvent.event_name,
            errors: [`Clock skew too large: ${skew}ms (max: ${this.config.clockSkewToleranceMs}ms)`]
          });
          continue;
        }

        // Consent validation
        if (validEvent.context?.consent?.analytics === false) {
          // Skip events where analytics consent is explicitly denied
          this.ingestionLogger.debug('Event skipped due to analytics consent', {
            event_id: validEvent.event_id,
            tenant_id: validEvent.tenant_id
          });
          continue;
        }

        validEvents.push(validEvent);

      } catch (error) {
        result.rejected.push({
          event_id: (eventData as any)?.event_id,
          event_name: (eventData as any)?.event_name,
          errors: [error instanceof Error ? error.message : 'Processing error']
        });
      }
    }

    // Phase 2: Deduplication
    const uniqueEvents: BaseEvent[] = [];
    
    for (const event of validEvents) {
      const fingerprint = generateEventFingerprint(event);
      const now = Date.now();
      
      // Check deduplication cache
      const lastSeen = dedupeCache.get(fingerprint);
      if (lastSeen && (now - lastSeen) < this.config.dedupeWindowMs) {
        result.duplicates++;
        this.ingestionLogger.debug('Duplicate event detected', {
          event_id: event.event_id,
          fingerprint,
          tenant_id: event.tenant_id
        });
        continue;
      }

      // Update deduplication cache
      dedupeCache.set(fingerprint, now);
      uniqueEvents.push(event);
    }

    // Clean up old deduplication cache entries periodically
    this.cleanupDedupeCache();

    // Phase 3: Storage and event publishing
    if (uniqueEvents.length > 0) {
      try {
        await this.storeEvents(uniqueEvents);
        result.accepted = uniqueEvents.length;

        // Publish to event bus for real-time processing
        for (const event of uniqueEvents) {
          await this.publishAnalyticsEvent(event);
        }

        this.ingestionLogger.info('Events ingested successfully', {
          accepted: result.accepted,
          duplicates: result.duplicates,
          rejected: result.rejected.length,
          batch_id: batch.batch_id
        });

      } catch (error) {
        this.ingestionLogger.error('Failed to store events', {
          error: error instanceof Error ? error.message : 'Unknown error',
          events_count: uniqueEvents.length
        });
        
        // Mark all events as rejected
        for (const event of uniqueEvents) {
          result.rejected.push({
            event_id: event.event_id,
            event_name: event.event_name,
            errors: ['Storage failed']
          });
        }
        result.accepted = 0;
      }
    }

    // Record ingestion metrics
    metrics.cacheOperations.inc(result.accepted, { operation: 'analytics_ingest' });
    
    return result;
  }

  /**
   * Store events in database
   */
  private async storeEvents(events: BaseEvent[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Sanitize events for storage
      const sanitizedEvents = events.map(sanitizeEventForStorage);

      // In a real implementation, this would insert into analytics tables
      // For now, we'll simulate the storage operation
      
      // Example SQL structure:
      // INSERT INTO analytics_events_raw (
      //   id, tenant_id, site_id, event_name, occurred_at, received_at,
      //   session_id, user_id, source, attributes, context
      // ) VALUES ...
      
      this.ingestionLogger.debug('Storing events to database', {
        events_count: sanitizedEvents.length,
        table: 'analytics_events_raw'
      });

      // Simulate async storage operation
      await new Promise(resolve => setTimeout(resolve, 10));

      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'insert',
        table: 'analytics_events'
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'insert',
        table: 'analytics_events',
        status: 'error'
      });
      throw error;
    }
  }

  /**
   * Publish analytics events to event bus for real-time processing
   */
  private async publishAnalyticsEvent(event: BaseEvent): Promise<void> {
    try {
      await eventBus.publish('analytics.event_ingested', {
        event_id: event.event_id,
        event_name: event.event_name,
        tenant_id: event.tenant_id,
        site_id: event.site_id,
        occurred_at: event.occurred_at,
      }, {
        tenantId: event.tenant_id,
        correlationId: event.event_id,
        source: 'analytics-ingest'
      });
    } catch (error) {
      this.ingestionLogger.warn('Failed to publish analytics event', {
        event_id: event.event_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up old deduplication cache entries
   */
  private cleanupDedupeCache(): void {
    const now = Date.now();
    const cutoff = now - (this.config.dedupeWindowMs * 2); // Keep 2x window for safety
    
    // Convert to array to avoid iterator issues
    const entries = Array.from(dedupeCache.entries());
    for (const [key, timestamp] of entries) {
      if (timestamp < cutoff) {
        dedupeCache.delete(key);
      }
    }
  }

  /**
   * Health check for ingestion service
   */
  getHealthStatus(): {
    healthy: boolean;
    stats: {
      cacheSize: number;
      configMaxBatchSize: number;
      uptime: number;
    };
  } {
    return {
      healthy: true,
      stats: {
        cacheSize: dedupeCache.size,
        configMaxBatchSize: this.config.maxBatchSize,
        uptime: process.uptime(),
      }
    };
  }

  /**
   * Get ingestion statistics
   */
  getStats(): {
    cacheSize: number;
    config: IngestionConfig;
  } {
    return {
      cacheSize: dedupeCache.size,
      config: this.config,
    };
  }
}

/**
 * Singleton service instance
 */
export const eventsIngestService = new EventsIngestService();

/**
 * Express route handlers
 */
export const ingestHandlers = {
  event: eventsIngestService.ingestEvent,
  batch: eventsIngestService.ingestEventBatch,
  health: (_req: Request, res: Response) => {
    const health = eventsIngestService.getHealthStatus();
    res.status(health.healthy ? 200 : 503).json(health);
  },
  stats: (_req: Request, res: Response) => {
    const stats = eventsIngestService.getStats();
    res.status(200).json({
      success: true,
      data: stats
    });
  }
};