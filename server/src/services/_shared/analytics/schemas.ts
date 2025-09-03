/**
 * Analytics Event Schemas - JSON Schema validation for analytics events
 * 
 * Implements schema-first validation with OpenTelemetry semantic conventions
 * and self-describing JSON (Iglu pattern) for extensibility.
 */

import { z } from 'zod';

/**
 * Base event envelope following RFC 3339 timestamps and OpenTelemetry conventions
 */
export const BaseEventSchema = z.object({
  schema: z.string().optional(), // Self-describing schema key (iglu:vendor/name/format/version)
  event_id: z.string().uuid(),
  event_name: z.string().min(1).regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/), // kebab.case
  occurred_at: z.string().datetime(), // RFC 3339
  received_at: z.string().datetime().optional(), // Set by server
  tenant_id: z.string().uuid(),
  site_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  user_id: z.string().optional(), // Pseudonymous
  source: z.enum(['web', 'widget', 'voice_ws', 'server']),
  attributes: z.record(z.any()).default({}),
  context: z.object({
    page: z.object({
      url: z.string().url().optional(),
      referrer: z.string().url().optional(),
      title: z.string().optional(),
    }).optional(),
    device: z.object({
      user_agent: z.string().optional(),
      viewport: z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }).optional(),
    }).optional(),
    locale: z.string().optional(),
    consent: z.object({
      analytics: z.boolean().default(true),
      ads: z.boolean().default(false),
    }).optional(),
  }).optional(),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export { BaseEvent };

/**
 * Voice UX Event Schemas
 */
export const VoiceTurnStartedSchema = BaseEventSchema.extend({
  event_name: z.literal('voice.turn_started'),
  attributes: z.object({
    'voice.session_id': z.string().uuid(),
    'voice.turn_id': z.string().uuid(),
    'voice.input_mode': z.enum(['speech', 'text']),
    'voice.expected_language': z.string().optional(),
  }),
});

export const VoiceFirstResponseSchema = BaseEventSchema.extend({
  event_name: z.literal('voice.first_response'),
  attributes: z.object({
    'voice.session_id': z.string().uuid(),
    'voice.turn_id': z.string().uuid(),
    'voice.first_response_ms': z.number().int().positive(),
    'voice.response_type': z.enum(['audio', 'text']),
    'voice.response_length': z.number().int().positive().optional(),
  }),
});

export const VoiceBargeInSchema = BaseEventSchema.extend({
  event_name: z.literal('voice.barge_in'),
  attributes: z.object({
    'voice.session_id': z.string().uuid(),
    'voice.turn_id': z.string().uuid(),
    'voice.barge_in_to_pause_ms': z.number().int().positive(),
  }),
});

export const VoiceASRPartialSchema = BaseEventSchema.extend({
  event_name: z.literal('voice.asr_partial'),
  attributes: z.object({
    'voice.session_id': z.string().uuid(),
    'voice.turn_id': z.string().uuid(),
    'asr.partial_latency_ms': z.number().int().positive(),
    'asr.confidence': z.number().min(0).max(1).optional(),
  }),
});

export const VoiceTTSStartedSchema = BaseEventSchema.extend({
  event_name: z.literal('voice.tts_started'),
  attributes: z.object({
    'voice.session_id': z.string().uuid(),
    'voice.turn_id': z.string().uuid(),
    'tts.stream_start_ms': z.number().int().positive(),
    'tts.text_length': z.number().int().positive().optional(),
  }),
});

/**
 * AI Tool Execution Event Schemas
 */
export const AIToolCallStartedSchema = BaseEventSchema.extend({
  event_name: z.literal('ai.tool_call_started'),
  attributes: z.object({
    'tool.name': z.string().min(1),
    'tool.category': z.enum(['navigation', 'search', 'forms', 'commerce', 'booking', 'siteops']),
    'conversation.id': z.string().uuid().optional(),
    'ai.model': z.string().optional(),
  }),
});

export const AIToolCallCompletedSchema = BaseEventSchema.extend({
  event_name: z.literal('ai.tool_call_completed'),
  attributes: z.object({
    'tool.name': z.string().min(1),
    'tool.category': z.enum(['navigation', 'search', 'forms', 'commerce', 'booking', 'siteops']),
    'tool.execution_ms': z.number().int().positive(),
    'tool.status': z.enum(['success', 'error', 'timeout']),
    'tool.optimistic': z.boolean().optional(), // For navigation optimism
    'conversation.id': z.string().uuid().optional(),
  }),
});

export const AIToolChainCompletedSchema = BaseEventSchema.extend({
  event_name: z.literal('ai.tool_chain_completed'),
  attributes: z.object({
    'conversation.id': z.string().uuid(),
    'tool.chain_length': z.number().int().positive(),
    'tool.chain_duration_ms': z.number().int().positive(),
    'tool.chain_success': z.boolean(),
  }),
});

/**
 * Knowledge Base Event Schemas  
 */
export const KBSearchSchema = BaseEventSchema.extend({
  event_name: z.literal('kb.search'),
  attributes: z.object({
    'kb.query': z.string().min(1).max(500), // Limit query length for privacy
    'kb.results_count': z.number().int().min(0),
    'kb.search_ms': z.number().int().positive(),
    'kb.top_score': z.number().min(0).max(1).optional(),
    'conversation.id': z.string().uuid().optional(),
  }),
});

export const KBHitSchema = BaseEventSchema.extend({
  event_name: z.literal('kb.hit'),
  attributes: z.object({
    'kb.chunk_id': z.string().uuid(),
    'kb.rank': z.number().int().positive(),
    'kb.score': z.number().min(0).max(1),
    'kb.clicked': z.boolean().optional(), // If user interacted with result
    'conversation.id': z.string().uuid().optional(),
  }),
});

/**
 * Retrieval Performance Event Schemas
 */
export const RetrievalHybridSearchSchema = BaseEventSchema.extend({
  event_name: z.literal('retrieval.hybrid_search'),
  attributes: z.object({
    'retrieval.vector_ms': z.number().int().positive(),
    'retrieval.fts_ms': z.number().int().positive(),
    'retrieval.rerank_ms': z.number().int().positive(),
    'retrieval.rrf_used': z.boolean(),
    'retrieval.vector_results': z.number().int().min(0),
    'retrieval.fts_results': z.number().int().min(0),
    'retrieval.final_results': z.number().int().min(0),
    'conversation.id': z.string().uuid().optional(),
  }),
});

export const RAGQualitySchema = BaseEventSchema.extend({
  event_name: z.literal('rag.quality_check'),
  attributes: z.object({
    'rag.hit_rate': z.number().min(0).max(1), // Ratio of relevant results
    'rag.freshness_hours': z.number().min(0), // Hours since last crawl
    'rag.chunks_used': z.number().int().min(0),
    'rag.avg_relevance_score': z.number().min(0).max(1).optional(),
    'conversation.id': z.string().uuid().optional(),
  }),
});

/**
 * Commerce/Booking Event Schemas
 */
export const CommerceViewSchema = BaseEventSchema.extend({
  event_name: z.literal('commerce.view'),
  attributes: z.object({
    'ecommerce.item_id': z.string().min(1),
    'ecommerce.item_name': z.string().optional(),
    'ecommerce.price': z.number().positive().optional(),
    'ecommerce.currency': z.string().length(3).optional(),
  }),
});

export const CommerceAddToCartSchema = BaseEventSchema.extend({
  event_name: z.literal('commerce.add_to_cart'),
  attributes: z.object({
    'ecommerce.item_id': z.string().min(1),
    'ecommerce.quantity': z.number().int().positive(),
    'ecommerce.value': z.number().positive().optional(),
    'ecommerce.currency': z.string().length(3).optional(),
  }),
});

export const CommerceCheckoutSchema = BaseEventSchema.extend({
  event_name: z.literal('commerce.checkout'),
  attributes: z.object({
    'ecommerce.transaction_id': z.string().min(1),
    'ecommerce.value': z.number().positive(),
    'ecommerce.currency': z.string().length(3),
    'ecommerce.items_count': z.number().int().positive(),
  }),
});

export const BookingHoldSchema = BaseEventSchema.extend({
  event_name: z.literal('booking.slot_hold'),
  attributes: z.object({
    'booking.slot_id': z.string().min(1),
    'booking.hold_duration_s': z.number().int().positive(),
    'booking.service_type': z.string().optional(),
  }),
});

export const BookingConfirmSchema = BaseEventSchema.extend({
  event_name: z.literal('booking.confirmed'),
  attributes: z.object({
    'booking.slot_id': z.string().min(1),
    'booking.confirmation_id': z.string().min(1),
    'booking.value': z.number().positive().optional(),
    'booking.currency': z.string().length(3).optional(),
  }),
});

/**
 * Error Event Schemas
 */
export const ErrorOccurredSchema = BaseEventSchema.extend({
  event_name: z.literal('error.occurred'),
  attributes: z.object({
    'error.type': z.string().min(1),
    'error.message': z.string().max(500), // Limit for privacy/storage
    'error.code': z.string().optional(),
    'error.stack_trace': z.string().optional(),
    'http.status_code': z.number().int().min(100).max(599).optional(),
    'service.name': z.string().optional(),
  }),
});

/**
 * Schema Registry - Maps event names to their validation schemas
 */
export const SCHEMA_REGISTRY = {
  'voice.turn_started': VoiceTurnStartedSchema,
  'voice.first_response': VoiceFirstResponseSchema,
  'voice.barge_in': VoiceBargeInSchema,
  'voice.asr_partial': VoiceASRPartialSchema,
  'voice.tts_started': VoiceTTSStartedSchema,
  
  'ai.tool_call_started': AIToolCallStartedSchema,
  'ai.tool_call_completed': AIToolCallCompletedSchema,
  'ai.tool_chain_completed': AIToolChainCompletedSchema,
  
  'kb.search': KBSearchSchema,
  'kb.hit': KBHitSchema,
  
  'retrieval.hybrid_search': RetrievalHybridSearchSchema,
  'rag.quality_check': RAGQualitySchema,
  
  'commerce.view': CommerceViewSchema,
  'commerce.add_to_cart': CommerceAddToCartSchema,
  'commerce.checkout': CommerceCheckoutSchema,
  
  'booking.slot_hold': BookingHoldSchema,
  'booking.confirmed': BookingConfirmSchema,
  
  'error.occurred': ErrorOccurredSchema,
} as const;

export type SchemaRegistry = typeof SCHEMA_REGISTRY;
export type EventName = keyof SchemaRegistry;

/**
 * Event batch schema for bulk ingestion
 */
export const EventBatchSchema = z.object({
  events: z.array(BaseEventSchema).min(1).max(500), // Batch size limits
  batch_id: z.string().uuid().optional(),
});

export type EventBatch = z.infer<typeof EventBatchSchema>;
export { EventBatch };

/**
 * Validation helper functions
 */
export function validateEvent(eventName: EventName, eventData: unknown): {
  success: boolean;
  data?: any;
  errors?: string[];
} {
  const schema = SCHEMA_REGISTRY[eventName];
  if (!schema) {
    return {
      success: false,
      errors: [`Unknown event type: ${eventName}`],
    };
  }

  const result = schema.safeParse(eventData);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

export function validateEventBatch(batchData: unknown): {
  success: boolean;
  data?: EventBatch;
  errors?: string[];
} {
  const result = EventBatchSchema.safeParse(batchData);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Privacy helpers - Remove sensitive data before storage
 */
export function sanitizeEventForStorage(event: BaseEvent): BaseEvent {
  const sanitized = { ...event };
  
  // Remove potential PII from attributes
  if (sanitized.attributes) {
    const sensitive = ['email', 'phone', 'password', 'ssn', 'credit_card'];
    for (const key of Object.keys(sanitized.attributes)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized.attributes[key] = '[REDACTED]';
      }
    }
  }

  // Truncate long text fields
  if (sanitized.attributes?.['kb.query'] && sanitized.attributes['kb.query'].length > 500) {
    sanitized.attributes['kb.query'] = sanitized.attributes['kb.query'].substring(0, 497) + '...';
  }

  // Remove full URLs in favor of path only for privacy
  if (sanitized.context?.page?.url) {
    try {
      const url = new URL(sanitized.context.page.url);
      sanitized.context.page.url = url.pathname + url.search;
    } catch {
      // Keep as-is if not a valid URL
    }
  }

  return sanitized;
}

/**
 * Event fingerprint generation for deduplication
 */
export function generateEventFingerprint(event: BaseEvent): string {
  // Create fingerprint from key fields for deduplication
  const fingerprint = [
    event.tenant_id,
    event.site_id || 'no-site',
    event.event_name,
    event.occurred_at.substring(0, 19), // Remove milliseconds for ±1s tolerance
    JSON.stringify(event.attributes),
  ].join('|');

  // Simple hash (in production, use crypto.createHash)
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(16);
}