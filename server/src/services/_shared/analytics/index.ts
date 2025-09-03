/**
 * Analytics Service - Main exports and service initialization
 * 
 * Provides unified analytics infrastructure with event ingestion,
 * schema validation, deduplication, and fast reporting capabilities.
 */

// Re-export schemas and validation
export {
  BaseEventSchema,
  EventBatchSchema,
  SCHEMA_REGISTRY,
  validateEvent,
  validateEventBatch,
  sanitizeEventForStorage,
  generateEventFingerprint,
  // Event schemas
  VoiceTurnStartedSchema,
  VoiceFirstResponseSchema,
  VoiceBargeInSchema,
  VoiceASRPartialSchema,
  VoiceTTSStartedSchema,
  AIToolCallStartedSchema,
  AIToolCallCompletedSchema,
  AIToolChainCompletedSchema,
  KBSearchSchema,
  KBHitSchema,
  RetrievalHybridSearchSchema,
  RAGQualitySchema,
  CommerceViewSchema,
  CommerceAddToCartSchema,
  CommerceCheckoutSchema,
  BookingHoldSchema,
  BookingConfirmSchema,
  ErrorOccurredSchema,
} from './schemas.js';

// Re-export ingestion service
export {
  EventsIngestService,
  eventsIngestService,
  ingestHandlers,
} from './eventsIngest.js';

// Re-export reports service
export {
  AnalyticsReportsService,
  analyticsReportsService,
  reportsHandlers,
} from './reports.js';

import { eventsIngestService } from './eventsIngest.js';
import { analyticsReportsService } from './reports.js';
import { logger } from '../telemetry/logger.js';
import { eventBus } from '../events/eventBus.js';
import { metrics } from '../telemetry/metrics.js';

/**
 * Analytics service configuration
 */
interface AnalyticsConfig {
  ingestion: {
    maxBatchSize: number;
    maxPayloadSizeKb: number;
    clockSkewToleranceMs: number;
    dedupeWindowMs: number;
  };
  reporting: {
    defaultTimeoutMs: number;
    cacheRollups: boolean;
    maxTimeseriesPoints: number;
  };
  privacy: {
    sanitizeEventData: boolean;
    retentionDays: number;
  };
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  ingestion: {
    maxBatchSize: 500,
    maxPayloadSizeKb: 500,
    clockSkewToleranceMs: 24 * 60 * 60 * 1000, // 24 hours
    dedupeWindowMs: 60 * 1000, // 1 minute
  },
  reporting: {
    defaultTimeoutMs: 10 * 1000, // 10 seconds
    cacheRollups: true,
    maxTimeseriesPoints: 10000,
  },
  privacy: {
    sanitizeEventData: true,
    retentionDays: 90,
  },
};

/**
 * Analytics service state
 */
let isInitialized = false;
let config: AnalyticsConfig = DEFAULT_CONFIG;
const analyticsLogger = logger;

/**
 * Initialize analytics service
 */
export async function initializeAnalytics(customConfig?: Partial<AnalyticsConfig>): Promise<void> {
  if (isInitialized) {
    analyticsLogger.warn('Analytics service already initialized');
    return;
  }

  try {
    analyticsLogger.info('Initializing analytics service...');

    // Merge configuration
    if (customConfig) {
      config = {
        ingestion: { ...DEFAULT_CONFIG.ingestion, ...customConfig.ingestion },
        reporting: { ...DEFAULT_CONFIG.reporting, ...customConfig.reporting },
        privacy: { ...DEFAULT_CONFIG.privacy, ...customConfig.privacy },
      };
    }

    // Setup event handlers for analytics events
    await setupAnalyticsEventHandlers();

    // Setup background tasks
    setupBackgroundTasks();

    isInitialized = true;
    analyticsLogger.info('Analytics service initialized successfully', {
      config: {
        ingestionMaxBatchSize: config.ingestion.maxBatchSize,
        reportingCacheRollups: config.reporting.cacheRollups,
        privacySanitization: config.privacy.sanitizeEventData,
      },
    });

  } catch (error) {
    analyticsLogger.error('Failed to initialize analytics service', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Setup event handlers for analytics-related events
 */
async function setupAnalyticsEventHandlers(): Promise<void> {
  analyticsLogger.debug('Setting up analytics event handlers...');

  // Handle analytics event ingestion notifications
  eventBus.subscribe('analytics.event_ingested', async (event) => {
    try {
      // Update real-time metrics
      metrics.conversationsTotal.inc(1, {
        tenant_id: event.metadata.tenantId,
        event_type: event.payload.event_name,
      });

      // Track event processing for system health
      analyticsLogger.debug('Analytics event processed', {
        event_id: event.payload.event_id,
        event_name: event.payload.event_name,
        tenant_id: event.payload.tenant_id,
      });

    } catch (error) {
      analyticsLogger.error('Error processing analytics event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event_id: event.payload.event_id,
      });
    }
  });

  // Handle voice session events for real-time analytics
  eventBus.subscribe('voice.session.started', async (event) => {
    try {
      await publishAnalyticsEvent({
        event_id: crypto.randomUUID(),
        event_name: 'voice.session_started',
        occurred_at: new Date().toISOString(),
        tenant_id: event.metadata.tenantId || '',
        site_id: event.payload.siteId,
        session_id: event.payload.sessionId,
        source: 'server',
        attributes: {
          'voice.session_id': event.payload.sessionId,
        },
      });
    } catch (error) {
      analyticsLogger.warn('Failed to publish voice session analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        session_id: event.payload.sessionId,
      });
    }
  });

  // Handle AI tool execution events
  eventBus.subscribe('ai.tool.executed', async (event) => {
    try {
      await publishAnalyticsEvent({
        event_id: crypto.randomUUID(),
        event_name: 'ai.tool_call_completed',
        occurred_at: new Date().toISOString(),
        tenant_id: event.metadata.tenantId || '',
        site_id: event.payload.siteId,
        source: 'server',
        attributes: {
          'tool.name': event.payload.toolName,
          'tool.category': event.payload.category,
          'tool.execution_ms': event.payload.duration,
          'tool.status': event.payload.success ? 'success' : 'error',
        },
      });
    } catch (error) {
      analyticsLogger.warn('Failed to publish AI tool analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tool_name: event.payload.toolName,
      });
    }
  });

  analyticsLogger.debug('Analytics event handlers registered');
}

/**
 * Publish analytics event (helper function)
 */
async function publishAnalyticsEvent(event: any): Promise<void> {
  try {
    // In a real implementation, this would add the event to ingestion queue
    // For now, we'll just log it
    analyticsLogger.debug('Analytics event published', {
      event_name: event.event_name,
      tenant_id: event.tenant_id,
      event_id: event.event_id,
    });
  } catch (error) {
    analyticsLogger.warn('Failed to publish analytics event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Setup background tasks for analytics maintenance
 */
function setupBackgroundTasks(): void {
  // Cleanup old deduplication cache entries every 5 minutes
  setInterval(() => {
    try {
      analyticsLogger.debug('Running analytics maintenance tasks...');
      // Maintenance tasks would go here
    } catch (error) {
      analyticsLogger.error('Analytics maintenance task failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Update rollup tables every hour (in a real implementation)
  setInterval(() => {
    try {
      if (config.reporting.cacheRollups) {
        analyticsLogger.debug('Updating analytics rollup tables...');
        // Rollup table updates would go here
      }
    } catch (error) {
      analyticsLogger.error('Analytics rollup update failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 60 * 60 * 1000); // 1 hour

  analyticsLogger.debug('Background analytics tasks scheduled');
}

/**
 * Health check for analytics service
 */
export function checkAnalyticsHealth(): {
  healthy: boolean;
  components: {
    ingestion: boolean;
    reports: boolean;
    eventHandlers: boolean;
  };
  stats: {
    initialized: boolean;
    config: AnalyticsConfig;
    ingestionStats: any;
  };
} {
  const ingestionHealth = eventsIngestService.getHealthStatus();
  
  return {
    healthy: isInitialized && ingestionHealth.healthy,
    components: {
      ingestion: ingestionHealth.healthy,
      reports: true, // Reports service doesn't have complex dependencies
      eventHandlers: isInitialized,
    },
    stats: {
      initialized: isInitialized,
      config,
      ingestionStats: ingestionHealth.stats,
    },
  };
}

/**
 * Get analytics service statistics
 */
export function getAnalyticsStats(): {
  initialized: boolean;
  config: AnalyticsConfig;
  ingestion: any;
  uptime: number;
} {
  return {
    initialized: isInitialized,
    config,
    ingestion: eventsIngestService.getStats(),
    uptime: process.uptime(),
  };
}

/**
 * Shutdown analytics service gracefully
 */
export async function shutdownAnalytics(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  try {
    analyticsLogger.info('Shutting down analytics service...');

    // Clear any background intervals/timers would go here
    // In a real implementation, we'd also flush any pending events

    isInitialized = false;
    analyticsLogger.info('Analytics service shutdown completed');

  } catch (error) {
    analyticsLogger.error('Error shutting down analytics service', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Analytics service factory for dependency injection
 */
export const createAnalyticsService = () => ({
  ingestion: eventsIngestService,
  reports: analyticsReportsService,
  initialize: initializeAnalytics,
  shutdown: shutdownAnalytics,
  health: checkAnalyticsHealth,
  stats: getAnalyticsStats,
});

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;

/**
 * Helper functions for common analytics operations
 */
export const analyticsHelpers = {
  /**
   * Track voice interaction metrics
   */
  trackVoiceMetrics: async (
    tenantId: string,
    siteId: string,
    sessionId: string,
    metrics: {
      firstResponseMs?: number;
      bargeInMs?: number;
      asrLatencyMs?: number;
    }
  ) => {
    const events = [];
    const now = new Date().toISOString();

    if (metrics.firstResponseMs) {
      events.push({
        event_id: crypto.randomUUID(),
        event_name: 'voice.first_response',
        occurred_at: now,
        tenant_id: tenantId,
        site_id: siteId,
        session_id: sessionId,
        source: 'server' as const,
        attributes: {
          'voice.session_id': sessionId,
          'voice.first_response_ms': metrics.firstResponseMs,
          'voice.response_type': 'audio',
        },
      });
    }

    if (metrics.bargeInMs) {
      events.push({
        event_id: crypto.randomUUID(),
        event_name: 'voice.barge_in',
        occurred_at: now,
        tenant_id: tenantId,
        site_id: siteId,
        session_id: sessionId,
        source: 'server' as const,
        attributes: {
          'voice.session_id': sessionId,
          'voice.barge_in_to_pause_ms': metrics.bargeInMs,
        },
      });
    }

    // In a real implementation, these would be sent to the ingestion service
    for (const event of events) {
      await publishAnalyticsEvent(event);
    }
  },

  /**
   * Track AI tool execution
   */
  trackToolExecution: async (
    tenantId: string,
    siteId: string,
    toolName: string,
    category: string,
    executionMs: number,
    success: boolean,
    conversationId?: string
  ) => {
    await publishAnalyticsEvent({
      event_id: crypto.randomUUID(),
      event_name: 'ai.tool_call_completed',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      site_id: siteId,
      source: 'server' as const,
      attributes: {
        'tool.name': toolName,
        'tool.category': category,
        'tool.execution_ms': executionMs,
        'tool.status': success ? 'success' : 'error',
        ...(conversationId && { 'conversation.id': conversationId }),
      },
    });
  },

  /**
   * Track knowledge base search
   */
  trackKBSearch: async (
    tenantId: string,
    siteId: string,
    query: string,
    resultsCount: number,
    searchMs: number,
    topScore?: number,
    conversationId?: string
  ) => {
    await publishAnalyticsEvent({
      event_id: crypto.randomUUID(),
      event_name: 'kb.search',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      site_id: siteId,
      source: 'server' as const,
      attributes: {
        'kb.query': query.substring(0, 500), // Truncate for privacy
        'kb.results_count': resultsCount,
        'kb.search_ms': searchMs,
        ...(topScore && { 'kb.top_score': topScore }),
        ...(conversationId && { 'conversation.id': conversationId }),
      },
    });
  },

  /**
   * Track TTS streaming metrics
   */
  trackTTSMetrics: async (
    tenantId: string,
    siteId: string,
    sessionId: string,
    turnId: string,
    streamStartMs: number,
    textLength?: number
  ) => {
    await publishAnalyticsEvent({
      event_id: crypto.randomUUID(),
      event_name: 'voice.tts_started',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      site_id: siteId,
      session_id: sessionId,
      source: 'server' as const,
      attributes: {
        'voice.session_id': sessionId,
        'voice.turn_id': turnId,
        'tts.stream_start_ms': streamStartMs,
        ...(textLength && { 'tts.text_length': textLength }),
      },
    });
  },

  /**
   * Track hybrid search performance
   */
  trackHybridSearch: async (
    tenantId: string,
    siteId: string,
    vectorMs: number,
    ftsMs: number,
    rerankMs: number,
    rrfUsed: boolean,
    vectorResults: number,
    ftsResults: number,
    finalResults: number,
    conversationId?: string
  ) => {
    await publishAnalyticsEvent({
      event_id: crypto.randomUUID(),
      event_name: 'retrieval.hybrid_search',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      site_id: siteId,
      source: 'server' as const,
      attributes: {
        'retrieval.vector_ms': vectorMs,
        'retrieval.fts_ms': ftsMs,
        'retrieval.rerank_ms': rerankMs,
        'retrieval.rrf_used': rrfUsed,
        'retrieval.vector_results': vectorResults,
        'retrieval.fts_results': ftsResults,
        'retrieval.final_results': finalResults,
        ...(conversationId && { 'conversation.id': conversationId }),
      },
    });
  },

  /**
   * Track RAG quality metrics
   */
  trackRAGQuality: async (
    tenantId: string,
    siteId: string,
    hitRate: number,
    freshnessHours: number,
    chunksUsed: number,
    avgRelevanceScore?: number,
    conversationId?: string
  ) => {
    await publishAnalyticsEvent({
      event_id: crypto.randomUUID(),
      event_name: 'rag.quality_check',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      site_id: siteId,
      source: 'server' as const,
      attributes: {
        'rag.hit_rate': hitRate,
        'rag.freshness_hours': freshnessHours,
        'rag.chunks_used': chunksUsed,
        ...(avgRelevanceScore && { 'rag.avg_relevance_score': avgRelevanceScore }),
        ...(conversationId && { 'conversation.id': conversationId }),
      },
    });
  },
};

// Setup shutdown handlers
process.on('SIGINT', shutdownAnalytics);
process.on('SIGTERM', shutdownAnalytics);
process.on('beforeExit', shutdownAnalytics);