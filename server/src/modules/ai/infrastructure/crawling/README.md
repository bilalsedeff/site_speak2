# Crawling Infrastructure

This directory contains the core crawling infrastructure implementing standards-compliant, incremental web crawling with modern JavaScript support.

## Components

### CrawlOrchestrator.ts

Main orchestration service coordinating the entire crawling pipeline:

- URL discovery via sitemap parsing
- Delta detection for incremental crawling  
- Content fetching with robots.txt compliance
- Multi-extractor content processing
- Session management and progress tracking
- Site contract generation integration

### PlaywrightAdapter.ts

Headless browser rendering for dynamic SPAs:

- Chromium automation with optimal crawling settings
- Wait strategies (domcontentloaded, networkidle, element-specific)
- Resource blocking for performance (images, fonts, videos)
- JavaScript error tracking and request failure monitoring
- Screenshot capture for debugging
- Parallel rendering with concurrency control

### ConditionalFetcher.ts

HTTP conditional request handling:

- ETag and Last-Modified header support
- 304 Not Modified response processing
- Content hash comparison for change detection
- Bandwidth optimization through conditional GET
- Batch fetching with rate limiting
- Error handling and retry logic

### SitemapReader.ts

Sitemap discovery and parsing:

- Automatic sitemap.xml discovery
- Sitemap index file support
- `lastmod` date comparison for delta crawling
- URL priority and changefreq processing
- Nested sitemap traversal
- XML validation and error recovery

### RobotsComplianceChecker.ts  

RFC 9309 compliant robots.txt validation:

- Robots.txt parsing and caching
- User agent directive matching
- Crawl delay enforcement
- Disallow pattern matching
- Rate limiting and politeness controls
- Compliance reporting and logging

## Usage

```typescript
import { createCrawlOrchestrator } from './CrawlOrchestrator';

const orchestrator = createCrawlOrchestrator();

// Start full crawl
const result = await orchestrator.startCrawl({
  siteId: 'site123',
  tenantId: 'tenant456', 
  knowledgeBaseId: 'kb789',
  baseUrl: 'https://example.com',
  sessionType: 'full',
  options: {
    maxPages: 1000,
    respectRobots: true,
    delayMs: 1000
  }
});

// Start delta crawl
const deltaResult = await orchestrator.startCrawl({
  siteId: 'site123',
  tenantId: 'tenant456',
  knowledgeBaseId: 'kb789', 
  baseUrl: 'https://example.com',
  sessionType: 'delta',
  lastCrawlInfo: {
    lastCrawledAt: new Date('2024-01-01'),
    contentHashes: { '/page1': 'hash123' }
  }
});
```

## Configuration

### Environment Variables

- `PLAYWRIGHT_TIMEOUT`: Playwright navigation timeout (default: 30000ms)
- `CRAWLER_MAX_PAGES`: Maximum pages per crawl session (default: 1000)
- `CRAWLER_DELAY_MS`: Delay between requests (default: 1000ms)
- `CRAWLER_RESPECT_ROBOTS`: Honor robots.txt (default: true)

### Crawl Options

```typescript
interface CrawlOptions {
  maxPages?: number;
  delayMs?: number;
  respectRobots?: boolean;
  sessionTimeout?: number;
  retryAttempts?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}
```

## Error Handling

The crawling infrastructure includes comprehensive error handling:

- **Network Errors**: Retry with exponential backoff
- **JavaScript Errors**: Logged but don't stop processing
- **Robots.txt Violations**: Skipped with warning logs
- **Resource Timeouts**: Graceful timeout with partial results
- **Memory Limits**: Session cleanup and resource management

## Performance Features

- **Concurrent Processing**: Configurable concurrency limits
- **Resource Optimization**: Selective resource loading
- **Delta Detection**: Process only changed content
- **Session Caching**: Browser context reuse
- **Memory Management**: Automatic cleanup of large objects

## Monitoring

All components include structured logging and metrics:

```typescript
// Example log output
{
  "service": "crawl-orchestrator",
  "level": "info", 
  "sessionId": "session_123",
  "siteId": "site_456",
  "processedUrls": 150,
  "failedUrls": 2,
  "extractedContent": 148,
  "duration": 45000
}
```

## Integration

The crawling infrastructure integrates with:

- **Extractors**: Content processing pipeline
- **Knowledge Base**: Indexed content storage
- **Site Contracts**: Self-describing site generation
- **Action System**: Interactive element discovery
- **Analytics**: Performance and usage tracking
