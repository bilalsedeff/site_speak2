# Analytics Service

Privacy-safe event ingestion, durable storage, and fast reporting for voice and AI UX analytics.

## Overview

The Analytics service provides comprehensive analytics infrastructure following OpenTelemetry semantic conventions with schema-first validation, idempotent ingestion, and sub-second reporting capabilities.

### Key Features

- **Schema-first validation**: Every event validates against JSON Schema with self-describing JSON support
- **OpenTelemetry alignment**: Uses OTel semantic conventions for consistent naming
- **Idempotent ingestion**: Handles at-least-once delivery with deduplication
- **Privacy-safe**: Data sanitization and consent handling
- **Fast reporting**: Sub-second aggregates with materialized rollups
- **Real-time processing**: Event bus integration for live dashboards

## Architecture

```plaintext
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   HTTP/WS       │    │  Schema          │    │  Event Bus      │
│   Ingestion     │───▶│  Validation      │───▶│  Processing     │
│                 │    │  & Deduplication │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Reports &     │◀───│  Raw Events      │    │  Materialized   │
│   Dashboards    │    │  Storage         │───▶│  Rollups        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Directory Structure

```plaintext
analytics/
├── schemas.ts           # Event schemas and validation
├── eventsIngest.ts      # HTTP/WS ingestion service
├── reports.ts           # Query builders and reporting
├── index.ts             # Main service exports
└── README.md           # This documentation
```

## Event Schema

All events follow a consistent envelope structure:

```typescript
interface BaseEvent {
  event_id: string;           // UUID v4
  event_name: string;         // kebab.case (e.g., 'voice.turn_started')
  occurred_at: string;        // RFC 3339 timestamp
  received_at?: string;       // Set by server
  tenant_id: string;          // UUID - tenant isolation
  site_id?: string;           // UUID - site context
  session_id?: string;        // UUID - session context
  user_id?: string;           // Pseudonymous user ID
  source: 'web' | 'widget' | 'voice_ws' | 'server';
  attributes: Record<string, any>;
  context?: {
    page?: { url?: string; referrer?: string; title?: string };
    device?: { user_agent?: string; viewport?: { width: number; height: number } };
    locale?: string;
    consent?: { analytics: boolean; ads: boolean };
  };
}
```

### Supported Event Types

#### Voice UX Events

- `voice.turn_started` - Voice interaction begins
- `voice.first_response` - First AI response generated
- `voice.barge_in` - User interrupts AI speech
- `voice.asr_partial` - Partial speech recognition

#### AI Tool Events  

- `ai.tool_call_started` - Tool execution begins
- `ai.tool_call_completed` - Tool execution finished
- `ai.tool_chain_completed` - Multi-tool sequence finished

#### Knowledge Base Events

- `kb.search` - Knowledge base query
- `kb.hit` - Search result interaction

#### Commerce Events

- `commerce.view` - Product/service viewed
- `commerce.add_to_cart` - Item added to cart
- `commerce.checkout` - Checkout initiated

#### Booking Events

- `booking.slot_hold` - Time slot held
- `booking.confirmed` - Booking confirmed

## API Endpoints

### Event Ingestion

```http
POST /api/v1/analytics/events
Content-Type: application/json

{
  "event_id": "123e4567-e89b-12d3-a456-426614174000",
  "event_name": "voice.turn_started",
  "occurred_at": "2025-01-15T10:30:00.123Z",
  "tenant_id": "tenant-uuid",
  "site_id": "site-uuid",
  "source": "voice_ws",
  "attributes": {
    "voice.session_id": "session-uuid"
  }
}
```

```http
POST /api/v1/analytics/events/batch
Content-Type: application/json

{
  "events": [
    { /* event 1 */ },
    { /* event 2 */ }
  ],
  "batch_id": "batch-uuid"
}
```

### Reporting

```http
POST /api/v1/analytics/reports/timeseries
Authorization: Bearer <token>
Content-Type: application/json

{
  "tenantId": "tenant-uuid",
  "metric": "voice.first_response_ms.p95",
  "from": "2025-01-15T00:00:00Z",
  "to": "2025-01-15T23:59:59Z", 
  "grain": "1h"
}
```

```http
POST /api/v1/analytics/reports/funnel
Authorization: Bearer <token>
Content-Type: application/json

{
  "tenantId": "tenant-uuid",
  "steps": ["commerce.view", "commerce.add_to_cart", "commerce.checkout"],
  "from": "2025-01-15T00:00:00Z",
  "to": "2025-01-15T23:59:59Z"
}
```

## Available Metrics

### Voice UX SLAs

- `voice.first_response_ms.p50/p95/p99` - Response time percentiles
- `voice.barge_in_count` - Interruption frequency
- `voice.asr_partial_latency_ms.p95` - ASR recognition latency

### AI Tool Performance  

- `ai.tool_calls.count` - Total tool invocations
- `ai.tool_calls.success_rate` - Success percentage (0-1)
- `ai.navigation_optimism_rate` - Optimistic navigation success
- `ai.tool_chain_length.avg` - Average tools per task

### Knowledge Base Effectiveness

- `kb.hit_rate` - Search success rate (0-1)
- `kb.search_latency_ms.p95` - Search performance
- `kb.relevance_score.avg` - Content relevance

### Business Metrics

- `commerce.conversion_rate` - Purchase conversion (0-1)
- `booking.hold_to_confirm_rate` - Booking completion (0-1)
- `system.error_rate` - System reliability (0-1)

## Integration Examples

### Voice Service Integration

```typescript
import { analyticsHelpers } from '../analytics';

// Track voice interaction metrics
await analyticsHelpers.trackVoiceMetrics(
  tenantId,
  siteId, 
  sessionId,
  {
    firstResponseMs: 450,
    bargeInMs: 200,
    asrLatencyMs: 50
  }
);
```

### AI Tool Integration

```typescript
import { analyticsHelpers } from '../analytics';

// Track tool execution
await analyticsHelpers.trackToolExecution(
  tenantId,
  siteId,
  'navigation.goto',
  'navigation',
  150, // execution time
  true, // success
  conversationId
);
```

### Knowledge Base Integration  

```typescript
import { analyticsHelpers } from '../analytics';

// Track KB search
await analyticsHelpers.trackKBSearch(
  tenantId,
  siteId,
  'product pricing information',
  5, // results count
  45, // search time
  0.89, // top score
  conversationId
);
```

## Configuration

```typescript
import { initializeAnalytics } from './analytics';

await initializeAnalytics({
  ingestion: {
    maxBatchSize: 500,
    maxPayloadSizeKb: 500,
    clockSkewToleranceMs: 24 * 60 * 60 * 1000, // 24 hours
    dedupeWindowMs: 60 * 1000, // 1 minute
  },
  reporting: {
    defaultTimeoutMs: 10 * 1000,
    cacheRollups: true,
    maxTimeseriesPoints: 10000,
  },
  privacy: {
    sanitizeEventData: true,
    retentionDays: 90,
  }
});
```

## Privacy & Security

### Data Sanitization

- PII fields automatically redacted before storage
- IP addresses stored at coarse granularity only
- Query strings truncated for privacy (max 500 chars)
- Full URLs converted to path-only for privacy

### Consent Handling

- Events with `context.consent.analytics: false` are dropped
- Consent status tracked per user/session
- GDPR compliant data handling

### Tenant Isolation

- All events require valid `tenant_id`
- Cross-tenant data access prevented
- Tenant-specific rate limiting
- Secure multi-tenancy throughout

## Performance & Reliability

### Ingestion SLAs

- P95 single event ingestion: < 60ms
- P95 batch ingestion (100 events): < 200ms  
- Duplicate rate after dedup: < 0.5%
- 100% schema validation (rejected events get clear errors)

### Reporting SLAs

- P95 timeseries query: < 300ms (day range)
- P95 timeseries query: < 2s (90-day range)
- Funnel queries: < 500ms (typical case)
- Real-time rollups: Sub-second updates

### Error Handling

- At-least-once delivery support with idempotency
- Circuit breaker for external dependencies
- Graceful degradation under load
- Comprehensive error logging and metrics

## Monitoring & Observability

The analytics service provides its own monitoring:

### Health Checks

- `/api/v1/analytics/health` - Service health
- `/api/v1/analytics/events/health` - Ingestion health
- Kubernetes-compatible liveness/readiness probes

### Metrics

- Event ingestion rates and latencies
- Schema validation success/failure rates
- Deduplication hit rates
- Query performance metrics
- System resource utilization

### Alerts

- High ingestion latency (> 200ms p95)
- Schema validation failures (> 1%)
- Duplicate rate increase (> 1%)
- Query timeout increase (> 5s p95)
- Storage errors or capacity issues

## Development

### Running Tests

```bash
npm run test:analytics        # Unit tests
npm run test:analytics:integration  # Integration tests  
npm run test:analytics:load   # Load testing
```

### Local Development

```bash
# Start with mock storage (development)
NODE_ENV=development npm run dev

# Start with database (testing)
NODE_ENV=test npm run test:setup
npm run dev
```

### Schema Development

When adding new event types:

1. **Define Schema**: Add to `schemas.ts` with validation rules
2. **Add to Registry**: Include in `SCHEMA_REGISTRY` mapping  
3. **Test Validation**: Add unit tests for edge cases
4. **Update Docs**: Document new events in this README
5. **Add Tracking**: Create helper functions if needed

Example:

```typescript
// 1. Define schema
export const NewEventSchema = BaseEventSchema.extend({
  event_name: z.literal('new.event_type'),
  attributes: z.object({
    'new.field': z.string().min(1),
    'new.metric': z.number().positive(),
  }),
});

// 2. Add to registry  
export const SCHEMA_REGISTRY = {
  // ... existing schemas
  'new.event_type': NewEventSchema,
} as const;

// 3. Add helper (optional)
export const analyticsHelpers = {
  // ... existing helpers
  trackNewEvent: async (tenantId: string, siteId: string, data: NewEventData) => {
    // Implementation
  }
};
```

## Deployment

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...  # For caching and rate limiting

# Optional  
ANALYTICS_MAX_BATCH_SIZE=500
ANALYTICS_RETENTION_DAYS=90
ANALYTICS_ENABLE_ROLLUPS=true
ANALYTICS_DEBUG_MODE=false
```

### Database Setup

The analytics service requires these database tables:

```sql
-- Raw event storage (append-only)
CREATE TABLE analytics_events_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  event_id UUID UNIQUE NOT NULL,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id UUID,
  user_id TEXT,
  source TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}',
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_analytics_events_tenant_time ON analytics_events_raw (tenant_id, occurred_at);
CREATE INDEX idx_analytics_events_name_time ON analytics_events_raw (event_name, occurred_at);
CREATE INDEX idx_analytics_events_site_time ON analytics_events_raw (site_id, occurred_at) WHERE site_id IS NOT NULL;

-- Rollup tables (materialized views)
-- These would be created by the rollup system
```

### Production Scaling

For high-volume tenants:

1. **Clickhouse Integration**: Add ClickHouse adapter for columnar storage
2. **Queue Processing**: Add background job processing for heavy aggregations  
3. **Caching**: Redis caching for frequently accessed reports
4. **Sharding**: Partition by tenant_id for horizontal scaling
5. **CDN**: Cache static aggregated reports

## Troubleshooting

### Common Issues

#### **Schema Validation Errors**

- Check event structure matches expected schema exactly
- Verify all required fields are present
- Check data types (strings vs numbers vs booleans)

#### **High Duplicate Rates**  

- Check clock synchronization between clients
- Verify event_id generation is truly unique
- Review deduplication window settings

#### **Slow Query Performance**

- Check if proper indexes exist on query dimensions
- Consider enabling rollup tables for frequently queried metrics
- Verify time ranges are reasonable (avoid full table scans)

#### **Missing Events**

- Verify network connectivity and DNS resolution
- Check rate limiting hasn't been exceeded  
- Review error logs for rejected events
- Confirm consent settings allow analytics

### Debug Mode

Enable debug logging:

```typescript
process.env.ANALYTICS_DEBUG_MODE = 'true';
```

This provides detailed logging for:

- Schema validation results
- Deduplication decisions  
- Query execution plans
- Performance timing data

## Support

For questions or issues:

1. **Logs**: Check analytics service logs for detailed error information
2. **Metrics**: Use `/api/v1/analytics/stats` for service statistics  
3. **Health**: Monitor `/api/v1/analytics/health` for service status
4. **Documentation**: Refer to OpenTelemetry semantic conventions for standard attributes

The analytics service is designed to be self-monitoring and self-healing, with comprehensive observability built in.
