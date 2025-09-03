# SiteSpeak AI Module

The AI module is the core intelligence system of SiteSpeak, providing advanced knowledge base management, hybrid search capabilities, and conversational AI functionality. It implements production-grade features including delta-based indexing, multi-strategy search with RRF fusion, and comprehensive monitoring.

## 🏗️ Architecture Overview

The AI module is organized into distinct layers following Domain-Driven Design principles:

```plaintext
modules/ai/
├── api/                    # HTTP API endpoints and controllers
├── application/            # Application services and use cases
├── domain/                 # Domain entities and business logic
├── infrastructure/         # Infrastructure services and adapters
└── tools/                  # AI tools and integrations
```

### Key Components

- **🧠 Enhanced AI Services**: Next-generation AI assistant with hybrid search
- **🔍 Knowledge Base System**: Advanced KB with delta indexing and multi-tenant isolation
- **⚡ Hybrid Search Engine**: Multi-strategy search with RRF fusion
- **🕷️ Intelligent Crawling**: Sitemap-aware delta crawling with content change detection
- **🎯 Action System**: Dynamic action discovery and execution
- **💬 Voice Integration**: Real-time voice processing and synthesis

---

## 🚀 Quick Start

### Basic Usage

```typescript
import { enhancedUniversalAIAssistantService } from './application/services/EnhancedUniversalAIAssistantService';

// Process a conversation with enhanced AI
const response = await enhancedUniversalAIAssistantService.processConversation({
  input: 'How do I configure payment processing?',
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  context: {
    userPreferences: {
      searchStrategies: ['vector', 'fulltext', 'structured'],
      requireHighConsensus: true
    }
  }
});

console.log('Response:', response.response.text);
console.log('Citations:', response.response.citations);
console.log('Search quality:', response.response.metadata.searchMetadata.consensusScore);
```

### Hybrid Search

```typescript
import { hybridSearchService } from './infrastructure/retrieval/HybridSearchService';

// Advanced multi-strategy search
const results = await hybridSearchService.search({
  tenantId: 'tenant_abc',
  siteId: 'site_123',
  query: 'user question',
  topK: 10,
  strategies: ['vector', 'fulltext', 'bm25', 'structured'],
  fusionOptions: {
    weights: [0.5, 0.3, 0.1, 0.1],
    minConsensus: 2
  }
});

console.log(`Found ${results.totalCount} results in ${results.searchTime}ms`);
console.log(`Strategies used: ${results.strategies.executed.join(', ')}`);
```

### Incremental Knowledge Base Updates

```typescript
import { incrementalIndexer } from './application/services/IncrementalIndexer';

// Trigger delta-based update
const result = await incrementalIndexer.performIncrementalUpdate({
  knowledgeBaseId: 'kb_site123',
  tenantId: 'tenant_abc',
  siteId: 'site_123',
  baseUrl: 'https://example.com',
  sessionType: 'delta'
});

console.log(`Updated ${result.newChunks} chunks, ${result.extractedEntities} entities`);
```

---

## 📚 Module Components

### API Layer (`api/`)

Provides HTTP endpoints for AI functionality:

- **EnhancedKBRoutes**: Advanced KB management endpoints
- **AIController**: Conversation and action processing
- **ActionDispatchController**: Dynamic action execution

**Key Endpoints:**

- `POST /api/ai/kb/search/hybrid` - Multi-strategy search
- `POST /api/ai/kb/index/incremental` - Delta indexing
- `POST /api/ai/conversation` - AI conversation processing
- `POST /api/ai/actions/execute` - Action execution

### Application Services (`application/`)

Business logic and use case implementations:

- **EnhancedUniversalAIAssistantService**: Next-gen AI assistant
- **EnhancedAIOrchestrationService**: Advanced workflow coordination
- **IncrementalIndexer**: Delta-based KB updates
- **KnowledgeBaseService**: Legacy KB operations (maintained for compatibility)

### Infrastructure Services (`infrastructure/`)

Core infrastructure implementations:

#### Retrieval (`infrastructure/retrieval/`)

- **HybridSearchService**: Multi-strategy search with RRF fusion
- **RRFRanker**: Reciprocal Rank Fusion implementation
- **RetrievalCache**: Multi-tier caching with SWR semantics

#### Crawling (`infrastructure/crawling/`)

- **CrawlOrchestrator**: Comprehensive crawling coordination
- **SitemapReader**: RFC-compliant sitemap parsing
- **ConditionalFetcher**: Efficient HTTP fetching with conditional requests
- **RobotsComplianceChecker**: RFC 9309 robots.txt compliance

#### Extractors (`infrastructure/extractors/`)

- **JsonLdExtractor**: Structured data extraction and normalization
- **ActionExtractor**: Interactive element discovery
- **FormExtractor**: Form analysis and validation extraction

#### Vector Store (`infrastructure/vector-store/`)

- **PgVectorClient**: High-performance PostgreSQL + pgvector integration

### Domain Layer (`domain/`)

Core business entities and domain logic:

- **KnowledgeChunk**: Immutable content chunk with embeddings
- **CrawlSession**: Session lifecycle management
- **SiteContract**: Site structure and capabilities representation
- **LangGraphOrchestrator**: AI workflow orchestration

---

## 🔍 Key Features

### Advanced Hybrid Search

The AI module implements sophisticated search combining multiple strategies:

```typescript
// Search strategies available
const strategies = [
  'vector',      // Semantic similarity with pgvector
  'fulltext',    // PostgreSQL FTS with ts_rank
  'bm25',        // Term frequency scoring
  'structured'   // JSON-LD structured data boosting
];

// Reciprocal Rank Fusion for result combination
const fusionOptions = {
  weights: [0.6, 0.3, 0.1],     // Strategy weights
  minConsensus: 2,               // Minimum systems agreement
  k: 60                          // RRF constant
};
```

**Performance Characteristics:**

- **P95 Latency**: <200ms for hybrid search
- **Cache Hit Rate**: >80% with intelligent caching
- **Consensus Scoring**: Quality assessment across strategies

### Delta-First Knowledge Base

Intelligent KB management with minimal resource usage:

```typescript
// Sitemap-based change detection
const changes = await sitemapReader.findChangedUrls(
  siteId,
  baseUrl,
  lastCrawlTime
);

// Content hashing for idempotent updates
const contentHash = contentHashService.computeContentHash(content);
if (storedHash !== contentHash) {
  await updateKnowledgeChunk(chunk);
}
```

**Benefits:**

- **10-100x faster** than full reindexing
- **Idempotent operations** with content hashing
- **Automatic change detection** via sitemap lastmod
- **Robots.txt compliance** for polite crawling

### Multi-Tenant Isolation

Secure tenant separation at all levels:

```typescript
// Row-level security in database
const results = await pgVectorClient.nnSearch({
  tenantId: 'tenant_abc',  // Automatic tenant filtering
  siteId: 'site_123',     // Site-level isolation
  embedding: queryVector,
  k: 10
});

// Tenant-scoped caching
const cacheKey = {
  tenantId: 'tenant_abc',
  queryHash: embeddingHash,
  locale: 'en-US'
};
```

### Real-Time Performance Monitoring

Comprehensive observability and analytics:

```typescript
// Performance metrics
const metrics = service.getEnhancedMetrics();
console.log({
  averageResponseTime: metrics.averageResponseTime,
  cacheHitRate: metrics.performance.cacheHitRate,
  consensusFailureRate: metrics.performance.consensusFailureRate,
  activeSearchStrategies: metrics.searchStrategies
});

// Health monitoring
const health = await service.getHealthStatus();
console.log(`System status: ${health.status}`);
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# Core AI Settings
OPENAI_API_KEY=sk-...                    # Required for AI features
AI_MODEL_PRIMARY=gpt-4o                  # Primary conversation model
AI_MODEL_EMBEDDINGS=text-embedding-3-small  # Embedding model

# Knowledge Base Settings
KB_ENABLE_HYBRID_SEARCH=true            # Enable multi-strategy search
KB_SEARCH_STRATEGIES=vector,fulltext     # Default search strategies
KB_CONSENSUS_THRESHOLD=0.7              # Minimum consensus score
KB_ENABLE_AUTO_INDEXING=true            # Enable automatic KB updates

# Vector Database
PGVECTOR_INDEX_TYPE=hnsw                # hnsw|ivfflat|exact
HNSW_EF_SEARCH=100                      # HNSW search parameters
IVFFLAT_PROBES=50                       # IVFFlat search parameters

# Caching Settings
RETRIEVAL_CACHE_ENABLED=true            # Enable retrieval caching
RETRIEVAL_CACHE_TTL=300000              # Cache TTL (5 minutes)
RETRIEVAL_CACHE_SWR=120000              # SWR window (2 minutes)

# Crawling Settings
CRAWL_MAX_DEPTH=3                       # Maximum crawl depth
CRAWL_MAX_PAGES=100                     # Maximum pages per session
CRAWL_DELAY=1000                        # Delay between requests (ms)
CRAWL_USER_AGENT=SiteSpeak-Crawler/1.0  # User agent string

# Performance Settings
MAX_CONCURRENT_SEARCHES=10              # Concurrent search limit
SEARCH_TIMEOUT_MS=30000                 # Search timeout
ENABLE_BACKGROUND_UPDATES=true          # Enable background KB updates
```

### Service Configuration

```typescript
// Enhanced AI Assistant Configuration
const assistantConfig = {
  enableVoice: true,
  enableStreaming: true,
  defaultLocale: 'en-US',
  searchStrategies: ['vector', 'fulltext', 'structured'],
  enableAdvancedCaching: true,
  enableAutoIndexing: true,
  consensusThreshold: 0.7,
  maxSessionDuration: 30 * 60 * 1000, // 30 minutes
  responseTimeoutMs: 30000             // 30 seconds
};

// Hybrid Search Configuration
const searchConfig = {
  strategies: ['vector', 'fulltext', 'bm25', 'structured'],
  fusionOptions: {
    weights: [0.5, 0.3, 0.15, 0.05],
    k: 60,                    // RRF constant
    minScore: 0.1,           // Minimum result score
    minConsensus: 2          // Minimum strategy agreement
  },
  cacheOptions: {
    enabled: true,
    ttl: 5 * 60 * 1000,      // 5 minutes
    staleWhileRevalidate: 2 * 60 * 1000  // 2 minutes
  }
};
```

---

## 📊 Monitoring & Analytics

### Health Checks

```bash
# Enhanced health check with component status
curl -X GET /api/ai/kb/health/enhanced

# Response includes detailed component health
{
  "status": "healthy",
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
        "hitRate": 0.82,
        "l2Connected": true
      }
    }
  ]
}
```

### Performance Metrics

```bash
# Comprehensive analytics
curl -X GET /api/ai/kb/analytics

# Key metrics returned:
{
  "vector": {
    "totalChunks": 15243,
    "indexType": "hnsw",
    "avgChunkSize": 512
  },
  "cache": {
    "overall": { "hitRate": 0.82 }
  },
  "consensus": {
    "avgPairwiseJaccard": 0.75,
    "strongConsensusItems": 892
  }
}
```

### Alert Thresholds

Recommended monitoring thresholds:

```typescript
const alerts = {
  searchLatencyP95: 200,        // ms - Alert if > 200ms
  cacheHitRate: 0.7,           // Alert if < 70%
  consensusScore: 0.5,         // Alert if < 50%
  errorRate: 0.05,             // Alert if > 5%
  activeSessionsMax: 100,      // Alert if > 100 active sessions
  queueDepthMax: 1000          // Alert if queue > 1000 items
};
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run AI module tests
npm test -- --testPathPattern=modules/ai

# Run specific service tests
npm test -- --testPathPattern=HybridSearchService
npm test -- --testPathPattern=IncrementalIndexer
```

### Integration Tests

```bash
# Run AI integration tests
npm run test:integration -- --grep="AI Module"

# Test end-to-end workflows
npm run test:e2e -- --spec="ai-workflows.spec.ts"
```

### Performance Tests

```bash
# Run AI performance benchmarks
npm run test:performance -- --grep="AI Search Performance"

# Load testing with multiple concurrent requests
npm run test:load -- --target="hybrid-search"
```

### Test Examples

```typescript
// Unit test example
describe('HybridSearchService', () => {
  it('should combine multiple search strategies', async () => {
    const result = await hybridSearchService.search({
      tenantId: 'test-tenant',
      siteId: 'test-site', 
      query: 'test query',
      strategies: ['vector', 'fulltext']
    });
    
    expect(result.strategies.executed).toContain('vector');
    expect(result.strategies.executed).toContain('fulltext');
    expect(result.fusion.averageConsensus).toBeGreaterThan(0);
  });
});

// Integration test example
describe('AI Conversation Flow', () => {
  it('should process conversation with KB search', async () => {
    const response = await enhancedUniversalAIAssistantService.processConversation({
      input: 'How do I configure payments?',
      tenantId: 'test-tenant',
      siteId: 'test-site'
    });
    
    expect(response.response.citations).toHaveLength.toBeGreaterThan(0);
    expect(response.response.metadata.searchMetadata).toBeDefined();
  });
});
```

---

## 🔧 Troubleshooting

### Common Issues

#### Slow Search Performance

```bash
# Check cache hit rates
curl /api/ai/kb/analytics | jq '.cache.overall.hitRate'

# Verify index type and health
curl /api/ai/kb/health/enhanced | jq '.components[] | select(.component=="vector-store")'

# Monitor search strategies
# Use fewer strategies or optimize weights
```

#### Low Consensus Scores

```bash
# Analyze consensus quality
curl /api/ai/kb/analytics | jq '.consensus'

# Possible solutions:
# - Add more search strategies
# - Adjust fusion weights
# - Improve KB content quality
```

#### High Memory Usage

```bash
# Check cache sizes
curl /api/ai/kb/analytics | jq '.cache.l1.size'

# Monitor active sessions
curl /api/ai/kb/analytics | jq '.crawler.activeSessions'

# Solutions:
# - Reduce cache sizes
# - Clean up inactive sessions
# - Optimize chunk sizes
```

### Debug Commands

```bash
# Enable debug logging
export DEBUG=ai:*

# Monitor specific components
export DEBUG=ai:search,ai:crawler,ai:cache

# Check service status
curl /api/ai/health
curl /api/ai/kb/health/enhanced
```

### Performance Optimization

```typescript
// Optimize search performance
const optimizedConfig = {
  strategies: ['vector', 'fulltext'],  // Reduce strategies
  cacheOptions: {
    enabled: true,
    ttl: 10 * 60 * 1000  // Longer TTL for stable content
  },
  fusionOptions: {
    minConsensus: 1,  // Reduce consensus requirement
    maxResults: 50    // Limit result processing
  }
};

// Optimize indexing performance
const indexingConfig = {
  maxDepth: 2,         // Reduce crawl depth
  maxPages: 50,        // Limit pages per session
  chunkSize: 500,      // Optimal chunk size
  chunkOverlap: 50     // Minimal overlap
};
```

---

## 🚀 Deployment

### Production Checklist

- [ ] **Database Setup**
  - [ ] PostgreSQL 14+ with pgvector extension
  - [ ] Database migrations applied
  - [ ] Row-level security configured
  
- [ ] **Environment Configuration**
  - [ ] All required environment variables set
  - [ ] OpenAI API key configured
  - [ ] Redis connection established
  
- [ ] **Performance Tuning**
  - [ ] Vector index type selected (HNSW recommended)
  - [ ] Cache sizes optimized for available memory
  - [ ] Rate limits configured appropriately
  
- [ ] **Monitoring Setup**
  - [ ] Health check endpoints configured
  - [ ] Metrics collection enabled
  - [ ] Alerts configured for key thresholds
  
- [ ] **Security**
  - [ ] JWT authentication configured
  - [ ] Tenant isolation verified
  - [ ] Rate limiting enabled

### Docker Configuration

```dockerfile
# AI module specific environment
ENV PGVECTOR_INDEX_TYPE=hnsw
ENV KB_ENABLE_HYBRID_SEARCH=true
ENV RETRIEVAL_CACHE_ENABLED=true
ENV CRAWL_MAX_PAGES=100

# Resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV UV_THREADPOOL_SIZE=16
```

### Kubernetes Resources

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sitespeak-ai
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: ai-service
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi" 
            cpu: "1000m"
        env:
        - name: KB_ENABLE_HYBRID_SEARCH
          value: "true"
        - name: PGVECTOR_INDEX_TYPE
          value: "hnsw"
```

---

## 🔄 Migration Guide

### Upgrading from Legacy AI Services

The enhanced AI services maintain backward compatibility:

```typescript
// Legacy service usage (continues to work)
import { universalAIAssistantService } from './application/UniversalAIAssistantService';

const response = await universalAIAssistantService.processConversation(request);

// Enhanced service usage (recommended for new implementations)
import { enhancedUniversalAIAssistantService } from './application/services/EnhancedUniversalAIAssistantService';

const response = await enhancedUniversalAIAssistantService.processConversation(request);
```

### Migration Timeline

1. **Phase 1 (Weeks 1-2)**: Deploy enhanced services alongside legacy
2. **Phase 2 (Weeks 3-4)**: Migrate high-traffic endpoints to enhanced services
3. **Phase 3 (Weeks 5-8)**: Gradual migration of remaining endpoints
4. **Phase 4 (Week 12+)**: Deprecate legacy services (6+ months notice)

### Breaking Changes

**V1 → V2 Breaking Changes:**

- Search response format includes fusion metadata
- Configuration structure updated for enhanced features
- Some legacy method signatures changed (compatibility wrappers provided)

**Mitigation:**

- Use compatibility services during transition
- Update client code gradually
- Test thoroughly in staging environment

---

## 📖 API Documentation

Comprehensive API documentation is available in the `api/README.md` file, including:

- **Enhanced KB API**: Advanced search, indexing, and management
- **Legacy AI API**: Backward-compatible conversation processing
- **Action Dispatch API**: Dynamic action execution
- **Authentication**: JWT-based multi-tenant authentication
- **Rate Limiting**: Per-tenant and per-endpoint limits
- **Error Handling**: Standard error responses and codes

---

## 🤝 Contributing

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run type-check
```

### Code Standards

- **TypeScript**: Strict mode enabled, no `any` types
- **ESLint**: Airbnb configuration with custom rules
- **Prettier**: Automated code formatting
- **Testing**: Jest for unit tests, comprehensive coverage expected
- **Documentation**: JSDoc comments for public APIs

### Pull Request Checklist

- [ ] Tests pass locally
- [ ] Type checking passes
- [ ] Documentation updated
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] Breaking changes noted

---

## 📄 License

This AI module is part of the SiteSpeak platform. All rights reserved.

---

**Version**: 2.0.0  
**Last Updated**: 2024  
**Maintainers**: SiteSpeak AI Team

For questions or support, please refer to the component-specific README files or contact the development team.
