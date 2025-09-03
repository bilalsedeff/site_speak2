# AI API Module

This module provides comprehensive API endpoints for the SiteSpeak AI Knowledge Base system. It includes both legacy compatibility endpoints and enhanced features for hybrid search, delta indexing, and advanced KB management.

## API Overview

The API is organized into functional groups:

```plaintext
api/
├── routes.ts                    # Main AI routes (conversations, actions)
├── EnhancedKBRoutes.ts         # Enhanced KB management endpoints
├── EnhancedKBController.ts     # Enhanced KB operations controller
├── AIController.ts             # Legacy AI controller
└── ActionDispatchController.ts  # Action execution controller
```

## Enhanced Knowledge Base API

### Base URL

```plaintext
/api/ai/kb/
```

### Authentication

All endpoints require JWT authentication with tenant isolation:

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

## API Endpoints

### 🔍 **Hybrid Search**

#### `POST /search/hybrid`

Advanced multi-strategy search with RRF fusion.

```http
POST /api/ai/kb/search/hybrid
Content-Type: application/json

{
  "query": "How to configure payment processing?",
  "topK": 10,
  "siteId": "site_123",
  "strategies": ["vector", "fulltext", "structured"],
  "locale": "en-US",
  "filters": {
    "contentType": ["documentation", "faq"]
  },
  "fusionOptions": {
    "weights": [0.6, 0.3, 0.1],
    "minConsensus": 2
  },
  "cache": {
    "enabled": true,
    "ttl": 300000
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "chunk_abc123",
        "content": "Payment processing configuration...",
        "url": "https://example.com/docs/payments",
        "title": "Payment Configuration Guide",
        "relevantSnippet": "...configure payment processing...",
        "score": 0.95,
        "rank": 1,
        "fusion": {
          "rrfScore": 0.95,
          "systemScores": {
            "vector": 0.92,
            "fulltext": 0.89,
            "structured": 0.85
          },
          "consensusRatio": 1.0
        }
      }
    ],
    "totalCount": 45,
    "searchTime": 127,
    "strategies": {
      "executed": ["vector", "fulltext", "structured"],
      "failed": [],
      "totalExecuted": 3
    },
    "fusion": {
      "algorithm": "RRF",
      "combinedCount": 45,
      "averageConsensus": 0.78
    }
  }
}
```

**Rate Limits:** 200 requests/minute per tenant

---

### ⚡ **Incremental Indexing**

#### `POST /index/incremental`

Trigger delta-based incremental knowledge base update.

```http
POST /api/ai/kb/index/incremental
Content-Type: application/json

{
  "knowledgeBaseId": "kb_site123",
  "siteId": "site_123",
  "baseUrl": "https://example.com",
  "sessionType": "delta",
  "options": {
    "maxDepth": 3,
    "maxPages": 100,
    "respectRobots": true,
    "extractStructuredData": true,
    "extractActions": true,
    "extractForms": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "session_abc123",
    "processedUrls": 23,
    "newChunks": 45,
    "updatedChunks": 12,
    "deletedChunks": 3,
    "extractedEntities": 89,
    "extractedActions": 15,
    "extractedForms": 7,
    "processingTime": 45000,
    "status": "completed",
    "changesSummary": {
      "pagesAdded": 5,
      "pagesUpdated": 18,
      "pagesDeleted": 0,
      "entitiesUpdated": 23
    }
  }
}
```

**Rate Limits:** 10 requests/minute per tenant
**Required Role:** editor, admin, owner

---

### 🕷️ **Comprehensive Crawling**

#### `POST /crawl/comprehensive`

Trigger full site crawl and indexing.

```http
POST /api/ai/kb/crawl/comprehensive
Content-Type: application/json

{
  "knowledgeBaseId": "kb_site123",
  "siteId": "site_123",
  "baseUrl": "https://example.com",
  "sessionType": "full",
  "options": {
    "maxDepth": 5,
    "maxPages": 500,
    "crawlDelay": 1000,
    "respectRobots": true,
    "followRedirects": true,
    "extractImages": false
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "session_def456",
    "status": "running",
    "processedUrls": 0,
    "failedUrls": 0,
    "extractedContent": 0,
    "statistics": {
      "startTime": "2024-01-15T10:30:00.000Z",
      "estimatedDuration": 300000,
      "discoveredUrls": 245
    }
  }
}
```

**Rate Limits:** 5 requests/minute per tenant
**Required Role:** admin, owner

---

### 📊 **Analytics and Monitoring**

#### `GET /analytics`

Get detailed knowledge base analytics and metrics.

```http
GET /api/ai/kb/analytics?siteId=site_123
```

**Response:**

```json
{
  "success": true,
  "data": {
    "vector": {
      "totalChunks": 15243,
      "totalEmbeddings": 15243,
      "indexType": "hnsw",
      "avgChunkSize": 512
    },
    "cache": {
      "l1": {
        "size": 1850,
        "maxSize": 2000,
        "hitRate": 0.84
      },
      "l2": {
        "hitRate": 0.67,
        "connected": true
      },
      "overall": {
        "hitRate": 0.82
      }
    },
    "crawler": {
      "activeSessions": 2,
      "completedSessions": 45,
      "totalSessions": 47
    },
    "consensus": {
      "avgPairwiseJaccard": 0.75,
      "strongConsensusItems": 892,
      "totalSystems": 3
    }
  }
}
```

---

### 🔄 **Session Management**

#### `GET /crawl/:sessionId/status`

Get crawl session status and progress.

```http
GET /api/ai/kb/crawl/session_abc123/status
```

**Response:**

```json
{
  "success": true,
  "data": {
    "sessionId": "session_abc123",
    "tenantId": "tenant_def",
    "siteId": "site_123",
    "status": "running",
    "sessionType": "delta",
    "startedAt": "2024-01-15T10:30:00.000Z",
    "progress": {
      "totalUrls": 150,
      "processedUrls": 75,
      "failedUrls": 2,
      "currentUrl": "https://example.com/docs/api",
      "percentage": 50
    },
    "statistics": {
      "pagesPerMinute": 25,
      "averageProcessingTime": 2400,
      "errorRate": 0.013
    },
    "errors": [
      {
        "type": "http-error",
        "message": "404 Not Found",
        "url": "https://example.com/old-page",
        "timestamp": "2024-01-15T10:35:00.000Z",
        "severity": "warning"
      }
    ]
  }
}
```

#### `POST /crawl/:sessionId/cancel`

Cancel a running crawl session.

```http
POST /api/ai/kb/crawl/session_abc123/cancel
Content-Type: application/json

{
  "reason": "User requested cancellation"
}
```

---

### 🧹 **Cache Management**

#### `POST /cache/clear`

Clear all caches for tenant.

```http
POST /api/ai/kb/cache/clear
Content-Type: application/json

{
  "siteId": "site_123"  // Optional: clear specific site only
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "deletedCacheEntries": 1247,
    "clearedCrawlerCaches": true,
    "tenantId": "tenant_def",
    "siteId": "site_123"
  }
}
```

**Rate Limits:** 10 requests/minute per tenant
**Required Role:** admin, owner

---

### 🏥 **Health Checks**

#### `GET /health/enhanced`

Enhanced health check with detailed component status.

```http
GET /api/ai/kb/health/enhanced
```

**Response:**

```json
{
  "status": "healthy",
  "service": "enhanced-knowledge-base",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.0.0",
  "components": [
    {
      "component": "vector-store",
      "healthy": true,
      "details": {
        "indexType": "hnsw",
        "totalChunks": 15243
      }
    },
    {
      "component": "retrieval-cache",
      "healthy": true,
      "details": {
        "l1Size": 1850,
        "l2Connected": true,
        "hitRate": 0.82
      }
    },
    {
      "component": "crawler",
      "healthy": true,
      "details": {
        "activeSessions": 2,
        "completedSessions": 45
      }
    }
  ],
  "summary": {
    "totalComponents": 3,
    "healthyComponents": 3,
    "degradedComponents": 0
  }
}
```

---

## Legacy AI API

### Base URL of /health/enhanced

```plaintext
/api/ai/
```

### Core Endpoints

#### `POST /conversation`

Process a conversation input and return AI response.

```http
POST /api/ai/conversation
Content-Type: application/json

{
  "input": "How do I configure email notifications?",
  "siteId": "site_123",
  "sessionId": "session_abc",
  "userId": "user_def",
  "browserLanguage": "en-US",
  "context": {
    "currentUrl": "https://example.com/settings",
    "pageTitle": "Settings Page"
  }
}
```

#### `POST /conversation/stream`

Stream conversation response in real-time using Server-Sent Events.

```http
POST /api/ai/conversation/stream
Content-Type: application/json

{
  "input": "Explain the payment process step by step",
  "siteId": "site_123",
  "context": {}
}
```

**Response (Stream):**

```plaintext
data: {"type": "chunk", "text": "To configure payments, you need to:", "sessionId": "session_123"}

data: {"type": "chunk", "text": " first navigate to the payment settings", "sessionId": "session_123"}

data: [DONE]
```

#### `POST /actions/execute`

Execute a specific action directly.

```http
POST /api/ai/actions/execute
Content-Type: application/json

{
  "siteId": "site_123",
  "actionName": "updateUserProfile",
  "parameters": {
    "userId": "user_123",
    "email": "new@example.com"
  },
  "sessionId": "session_abc"
}
```

#### `POST /actions/register`

Register actions for a site.

```http
POST /api/ai/actions/register
Content-Type: application/json

{
  "siteId": "site_123",
  "actions": [
    {
      "name": "searchProducts",
      "description": "Search for products in the catalog",
      "parameters": [
        {
          "name": "query",
          "type": "string",
          "required": true
        },
        {
          "name": "category",
          "type": "string",
          "required": false
        }
      ]
    }
  ]
}
```

---

## Action Dispatch API

### Base URL of /actions/register

```plaintext
/api/ai/actions/dispatch/
```

### Key Endpoints

#### `POST /init`

Initialize dispatch configuration for a site.

#### `POST /execute`

Execute action via dispatch system.

#### `GET /:siteId/:tenantId`

Get available actions for site/tenant.

#### `POST /embed/script`

Generate JavaScript embed script.

#### `POST /embed/iframe`

Generate iframe embed code.

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "detail": "Detailed error description",
  "correlationId": "req_123456",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error
- `503` - Service Unavailable (health check failed)

### Common Error Types

```json
{
  "success": false,
  "error": "Validation Error",
  "detail": "Query parameter is required",
  "extensions": {
    "field": "query",
    "value": null
  }
}
```

```json
{
  "success": false,
  "error": "Rate Limit Exceeded",
  "detail": "Maximum 200 requests per minute exceeded",
  "extensions": {
    "limit": 200,
    "window": "1 minute",
    "remaining": 0,
    "resetTime": "2024-01-15T10:31:00.000Z"
  }
}
```

---

## Rate Limiting

### Limits by Endpoint Type

| Endpoint Group | Limit | Window | Scope |
|---|---|---|---|
| Search endpoints | 200 req/min | 1 minute | Per tenant |
| Indexing operations | 10 req/min | 1 minute | Per tenant |
| Crawling operations | 5 req/min | 1 minute | Per tenant |
| Analytics | 60 req/min | 1 minute | Per tenant |
| Health checks | 120 req/min | 1 minute | Per IP |

### Rate Limit Headers

```http
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 195
X-RateLimit-Reset: 1642251600
X-RateLimit-Policy: 200;w=60;comment="per tenant per minute"
```

---

## Authentication & Authorization

### JWT Token Requirements

```javascript
{
  "sub": "user_123",
  "tenantId": "tenant_abc",
  "roles": ["editor", "admin"],
  "permissions": ["kb:read", "kb:write", "kb:admin"],
  "exp": 1642251600
}
```

### Required Roles by Endpoint

| Endpoint | Minimum Role | Permissions |
|---|---|---|
| `/search/hybrid` | viewer | `kb:read` |
| `/index/incremental` | editor | `kb:write` |
| `/crawl/comprehensive` | admin | `kb:admin` |
| `/analytics` | viewer | `kb:read` |
| `/cache/clear` | admin | `kb:admin` |

---

## SDK and Client Libraries

### JavaScript/TypeScript Client

```typescript
import { SiteSpeakKB } from '@sitespeak/kb-client';

const kb = new SiteSpeakKB({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.sitespeak.ai'
});

// Hybrid search
const results = await kb.search({
  query: 'user question',
  strategies: ['vector', 'fulltext'],
  topK: 10
});

// Incremental update
const session = await kb.triggerIncrementalUpdate({
  siteId: 'site_123',
  baseUrl: 'https://example.com'
});

// Monitor progress
const status = await kb.getSessionStatus(session.sessionId);
```

### cURL Examples

```bash
# Search with authentication
curl -X POST "https://api.sitespeak.ai/api/ai/kb/search/hybrid" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How to configure payments?",
    "strategies": ["vector", "fulltext"],
    "topK": 5
  }'

# Trigger incremental update
curl -X POST "https://api.sitespeak.ai/api/ai/kb/index/incremental" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "knowledgeBaseId": "kb_site123",
    "siteId": "site_123",
    "baseUrl": "https://example.com"
  }'

# Check health
curl -X GET "https://api.sitespeak.ai/api/ai/kb/health/enhanced"
```

---

## Webhook Integration

### KB Update Webhooks

Configure webhooks to receive notifications about KB operations:

```json
{
  "event": "kb.incremental_update.completed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "sessionId": "session_abc123",
    "tenantId": "tenant_def",
    "siteId": "site_123",
    "status": "completed",
    "changes": {
      "newChunks": 45,
      "updatedChunks": 12,
      "deletedChunks": 3
    }
  }
}
```

### Available Events

- `kb.incremental_update.started`
- `kb.incremental_update.completed`
- `kb.incremental_update.failed`
- `kb.crawl.started`
- `kb.crawl.completed`
- `kb.crawl.failed`
- `kb.search.high_latency` (performance alert)
- `kb.consensus.low_score` (quality alert)

---

## Best Practices

### Search Optimization

1. **Use appropriate strategies**: Vector for semantic, fulltext for exact matches
2. **Optimize cache settings**: Longer TTL for stable content
3. **Monitor consensus scores**: Low scores indicate poor search quality
4. **Filter by content type**: Reduce search space for better performance

### Indexing Best Practices

1. **Prefer incremental updates**: 10-100x faster than full reindex
2. **Monitor sitemap freshness**: Ensure lastmod timestamps are accurate
3. **Use delta sessions**: For regular content updates
4. **Schedule full crawls**: Weekly or monthly for comprehensive updates

### Performance Guidelines

1. **Monitor rate limits**: Implement exponential backoff
2. **Use caching**: Enable cache for repeated queries
3. **Batch operations**: Group similar requests
4. **Monitor health**: Set up alerts for degraded performance

### Error Handling Best Practices

```typescript
try {
  const results = await kb.search(params);
} catch (error) {
  if (error.status === 429) {
    // Rate limit - implement backoff
    await delay(error.retryAfter * 1000);
    return kb.search(params);
  } else if (error.status === 503) {
    // Service degraded - use cached results
    return getCachedResults(params.query);
  }
  throw error;
}
```

---

## Migration from Legacy API

### Compatibility Layer

The new API maintains backward compatibility:

```typescript
// Legacy (still works)
const results = await kb.semanticSearch({
  query: 'user question',
  topK: 10
});

// Enhanced (recommended)
const results = await kb.hybridSearch({
  query: 'user question',
  strategies: ['vector', 'fulltext'],
  topK: 10
});
```

### Migration Timeline

1. **Phase 1**: Deploy enhanced API alongside legacy
2. **Phase 2**: Update clients to use enhanced endpoints
3. **Phase 3**: Deprecate legacy endpoints (6 months notice)
4. **Phase 4**: Remove legacy endpoints

---

This API documentation provides comprehensive coverage of all available endpoints, authentication requirements, and best practices for integrating with the SiteSpeak Knowledge Base system.
