# Crawler & Voice AI Implementation

This document provides comprehensive documentation for the crawler and voice AI components implementation based on the `final-directives/source-of-truth-crawler-behaviour.md` requirements.

## Overview

The implementation follows the source-of-truth principles:

1. **Every generated site is self-describing** with machine-readable contracts
2. **Crawler is polite and standards-compliant** (RFC 9309, robots.txt, canonicals)
3. **Voice is instant, interruptible, duplex** with AudioWorklet & WebSocket streaming
4. **Perceived latency is hidden** via Speculation Rules prefetching

## Architecture

### Core Components

#### 1. Crawler Infrastructure (`server/src/modules/ai/infrastructure/crawling/`)

- **CrawlOrchestrator.ts**: Main orchestration service coordinating the entire crawling process
- **PlaywrightAdapter.ts**: Headless rendering for modern JS sites with dynamic SPAs
- **ConditionalFetcher.ts**: HTTP conditional requests using ETag/Last-Modified headers
- **SitemapReader.ts**: Sitemap parsing with `lastmod` comparison for delta detection
- **RobotsComplianceChecker.ts**: RFC 9309 compliant robots.txt validation

#### 2. Content Extractors (`server/src/modules/ai/infrastructure/extractors/`)

- **HtmlExtractor.ts**: Extracts visible text, headings, tables, ARIA regions
- **JsonLdExtractor.ts**: Parses JSON-LD structured data (Google's preferred method)
- **ActionExtractor.ts**: Indexes `data-action` hooks as callable verbs
- **FormExtractor.ts**: Records form schemas with labels, validation, input types

#### 3. Action System (`server/src/modules/ai/application/services/`)

- **ActionManifestGenerator.ts**: Generates comprehensive action manifests from HTML analysis
- **WidgetActionBridge.ts**: PostMessage RPC for cross-origin action execution
- **ActionDispatchService.ts**: Central dispatch coordinating manifest generation and action execution

#### 4. Site Contract Generation (`server/src/modules/publishing/app/`)

- **siteContract.ts**: Implements "self-describing sites" contract generation
  - Sitemap.xml with accurate `lastmod`
  - JSON-LD structured data
  - Actions.json manifest
  - Speculation Rules for prefetching
  - ARIA landmarks audit

## Key Features Implementation

### 1. Incremental Crawling

**Location**: `CrawlOrchestrator.executeCrawlPipeline()`

- Sitemap `lastmod` comparison for delta detection
- Content hashing to avoid re-processing unchanged pages
- Delta vs full crawl session types
- Conditional HTTP requests with ETag/Last-Modified headers

```typescript
// Delta detection implementation
if (request.sessionType === 'delta' && request.lastCrawlInfo) {
  urlsToProcess = await this.deltaDetectionService.filterChangedUrls(
    urls,
    request.lastCrawlInfo
  );
}
```

### 2. Action Hooks with Data Attributes

**Location**: `ActionManifestGenerator.generateManifest()`

Deterministic `data-action` attributes for AI agent interaction:

```html
<button data-action="cart.add" data-product="123">Add to Cart</button>
<form data-action="contact.submit">...</form>
<a data-action="navigate.product" href="/products/123">View Product</a>
```

The system generates comprehensive action manifests with:

- Security validation (risk levels, confirmation requirements)
- Parameter schemas (Zod + JSON Schema for OpenAI compatibility)
- Execution context (selectors, methods, endpoints)

### 3. PostMessage Bridge for Cross-Origin Actions

**Location**: `WidgetActionBridge.generateBridgeScript()`

Secure iframe communication with:

- Origin validation against allowed origins
- Parameter validation using Zod schemas
- Confirmation prompts for destructive actions
- Fallback action execution via DOM manipulation

```javascript
// Bridge handshake protocol
function handleMessage(event) {
  if (!ALLOWED_ORIGINS.has(event.origin)) {
    console.warn('[SiteSpeak Bridge] Rejected message from unauthorized origin:', event.origin);
    return;
  }
  // Process action execution...
}
```

### 4. Site Contract Generation

**Location**: `SiteContractGenerator.generateContract()`

Every generated site includes:

- **sitemap.xml**: Accurate `lastmod` dates for delta crawling
- **actions.json**: Complete action manifest with OpenAI-compatible schemas
- **JSON-LD blocks**: Structured data for Product, FAQ, BreadcrumbList
- **Speculation Rules**: Prefetch/prerender hints for performance
- **ARIA landmarks**: Programmatic targeting with role attributes

### 5. Playwright Integration

**Location**: `PlaywrightAdapter.renderPage()`

Production-ready headless rendering:

- Wait strategies (`domcontentloaded`, `networkidle`)
- Resource blocking (images, fonts, videos) for performance
- JavaScript error tracking
- Screenshot capture for debugging
- Performance metrics collection

## API Integration

### Crawler API

```typescript
// Start crawling session
const result = await crawlOrchestrator.startCrawl({
  siteId: 'site123',
  tenantId: 'tenant456',
  knowledgeBaseId: 'kb789',
  baseUrl: 'https://example.com',
  sessionType: 'full' | 'delta',
  options: { /* crawl options */ }
});
```

### Action Dispatch API

```typescript
// Initialize site actions
const config = await actionDispatchService.initializeDispatch({
  siteId: 'site123',
  tenantId: 'tenant456',
  allowedOrigins: ['https://example.com'],
  securitySettings: { /* security config */ }
});

// Execute action
const result = await actionDispatchService.dispatchAction({
  siteId: 'site123',
  tenantId: 'tenant456',
  actionName: 'submit_contact_form',
  parameters: { name: 'John', email: 'john@example.com' },
  sessionId: 'session123'
});
```

### Site Contract API

```typescript
// Generate site contract
const contract = await siteContractGenerator.generateContract({
  siteId: 'site123',
  tenantId: 'tenant456',
  domain: 'example.com',
  pages: [ /* page definitions */ ],
  siteConfig: { /* site configuration */ },
  buildMetadata: { /* build info */ }
});

// Access generated files
console.log(contract.files['sitemap.xml']);
console.log(contract.files['actions.json']);
console.log(contract.files['speculation-rules.json']);
```

## Security & Compliance

### 1. Robots.txt Compliance (RFC 9309)

- Parse and respect robots.txt directives
- Honor crawl delays and rate limits
- Validate user agent permissions
- Skip disallowed paths

### 2. Origin Validation

- Strict origin checking for postMessage communication
- Allowed origins whitelist per tenant
- CSRF protection with token validation
- Rate limiting per origin/session

### 3. Data Privacy

- PII field detection and exclusion
- Sensitive selector filtering
- Content sanitization during extraction
- Secure secret handling (no client-side API keys)

## Performance Optimizations

### 1. Speculation Rules

Automatic prefetch/prerender for likely navigation paths:

```json
{
  "prerender": [
    {
      "where": { "href_matches": "/products/*" },
      "eagerness": "moderate"
    }
  ]
}
```

### 2. Conditional Fetching

- ETag and Last-Modified header support
- 304 Not Modified response handling
- Content hash comparison
- Bandwidth optimization

### 3. Resource Management

- Browser context reuse in Playwright
- Connection pooling for HTTP requests
- Memory management for large crawls
- Graceful cleanup and shutdown

## Error Handling & Monitoring

### 1. Comprehensive Logging

All services include structured logging with:

- Request tracing with correlation IDs
- Performance metrics (timing, resource usage)
- Error categorization and severity levels
- Security event logging

### 2. Retry Logic

- Exponential backoff for failed requests
- Circuit breaker patterns for external services
- Timeout handling with configurable limits
- Graceful degradation on partial failures

### 3. Health Checks

- Browser health monitoring for Playwright
- Service dependency validation
- Cache statistics and cleanup
- Session lifecycle management

## Configuration

### Environment Variables

```bash
# Crawler settings
CRAWLER_MAX_PAGES=1000
CRAWLER_DELAY_MS=1000
PLAYWRIGHT_TIMEOUT=30000

# Action system
ACTIONS_RATE_LIMIT=30
ACTIONS_REQUIRE_HTTPS=true

# Security
ALLOWED_ORIGINS="*.sitespeak.com,localhost:*"
CSRF_PROTECTION=true
```

### Site-Level Configuration

Each site can override default settings:

```typescript
interface SiteConfiguration {
  crawling: {
    maxPages: number;
    respectRobots: boolean;
    delayMs: number;
  };
  actions: {
    allowedOrigins: string[];
    rateLimits: Record<string, number>;
  };
  security: {
    requireAuth: boolean;
    csrfProtection: boolean;
  };
}
```

## Integration with Voice AI

The crawler and action system integrate with voice AI through:

1. **Action Discovery**: Extracted actions become callable tools for the AI agent
2. **Context Enrichment**: Crawled content provides semantic context for responses
3. **Execution Bridge**: Actions are executed via the widget bridge during conversations
4. **Real-time Updates**: Delta crawling keeps action manifests current

## Development & Testing

### Running Tests

```bash
# Unit tests
npm run test:crawler
npm run test:actions

# Integration tests
npm run test:e2e:crawler
npm run test:performance

# Playwright tests
npm run test:playwright
```

### Local Development

```bash
# Start development services
npm run dev:server

# Test crawler locally
npm run crawler:test-local

# Generate sample contracts
npm run contract:generate-sample
```

## Monitoring & Analytics

The implementation includes comprehensive analytics tracking:

- **Tool Execution Metrics**: Success rates, latencies, error categorization
- **Crawl Performance**: Pages processed, extraction success, delta efficiency
- **Action Usage**: Most used actions, conversion funnels, user patterns
- **Security Events**: Failed authentications, blocked requests, rate limit hits

## Future Enhancements

Planned improvements based on the source-of-truth vision:

1. **Voice Streaming**: AudioWorklet integration for low-latency voice capture
2. **Advanced AI Tools**: Dynamic tool generation from crawled patterns
3. **Multi-tenant Optimization**: Shared crawling infrastructure
4. **Real-time Synchronization**: WebSocket-based live updates
5. **Advanced Analytics**: ML-powered user behavior prediction

---

This implementation provides a production-ready foundation for universal crawling and voice AI interaction, following web standards and best practices while maintaining the flexibility to handle diverse website patterns and user scenarios.
