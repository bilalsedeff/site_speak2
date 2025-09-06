# AI Application Services

This module contains the core application services that orchestrate AI functionality for the SiteSpeak platform. These services act as the coordination layer between domain entities, infrastructure services, and external APIs.

## Architecture Overview

```plaintext
application/services/
├── Core Services
│   ├── AIOrchestrationService.ts              # AI workflow coordination
│   ├── UniversalAIAssistantService.ts         # Main AI assistant (consolidated)
│   ├── KnowledgeBaseService.ts                # KB operations
│   ├── IncrementalIndexer.ts                  # Delta-based KB updates
│   └── EmbeddingService.ts                    # Vector embeddings
│
└── Specialized Services
    ├── ActionExecutorService.ts               # Action execution
    ├── LanguageDetectorService.ts             # Language detection
    └── WebCrawlerService.ts                   # Web crawling
```

## Service Categories

### 🤖 **Core AI Services**

#### UniversalAIAssistantService

The main AI assistant service with comprehensive features including advanced KB integration, hybrid search support, and production-grade optimizations.

**Key Features:**

- Hybrid search integration with multiple strategies (vector, fulltext, hybrid)
- Real-time KB updates and incremental indexing support
- Advanced caching and performance optimization
- Multi-strategy search with consensus scoring
- Enhanced voice processing with KB-aware responses
- Comprehensive analytics and monitoring
- Priority-based request handling
- Knowledge base operation triggering

**Enhanced Configuration:**

```typescript
export interface AIAssistantConfig {
  enableVoice: boolean;
  enableStreaming: boolean;
  defaultLocale: string;
  maxSessionDuration: number;
  responseTimeoutMs: number;
  searchStrategies?: SearchStrategy[];      // NEW: Configure search strategies
  enableAdvancedCaching?: boolean;          // NEW: Advanced caching controls
  enableAutoIndexing?: boolean;             // NEW: Auto KB indexing
  consensusThreshold?: number;              // NEW: Search consensus threshold
}
```

**Enhanced Request Interface:**

```typescript
export interface AssistantRequest {
  input: string;
  sessionId?: string;
  siteId: string;
  tenantId: string;
  userId?: string;
  context?: {
    currentUrl?: string;
    pageTitle?: string;
    userAgent?: string;
    browserLanguage?: string;
    userPreferences?: {                     // NEW: User preferences
      searchStrategies?: SearchStrategy[];
      maxResults?: number;
      enableCaching?: boolean;
      requireHighConsensus?: boolean;
    };
  };
  stream?: boolean;
  priority?: 'low' | 'normal' | 'high';     // NEW: Request priority
}
```

**Enhanced Response Metadata:**

```typescript
export interface AssistantResponse {
  sessionId: string;
  response: {
    text: string;
    audioUrl?: string;
    citations: Array<{ url: string; title: string; snippet: string; }>;
    uiHints: {
      highlightElements?: string[];
      scrollToElement?: string;
      showModal?: boolean;
      confirmationRequired?: boolean;
      suggestedActions?: Array<{            // NEW: AI-suggested actions
        name: string;
        label: string;
        parameters: Record<string, unknown>;
      }>;
    };
    metadata: {
      responseTime: number;
      tokensUsed: number;
      actionsTaken: number;
      language: string;
      intent?: string;
      searchMetadata?: {                    // NEW: Search performance metrics
        searchTime: number;
        totalResults: number;
        strategiesUsed: SearchStrategy[];
        consensusScore?: number;
      };
    };
  };
  actions?: Array<{ /* ... */ }>;
  knowledgeBase?: {                         // NEW: KB health information
    indexHealth?: number;
    coverage?: number;
  };
}
```

**Usage:**

```typescript
import { universalAIAssistantService } from './UniversalAIAssistantService';

// Basic conversation processing
const response = await universalAIAssistantService.processConversation({
  input: 'How do I configure payment processing?',
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  context: {
    userPreferences: {
      searchStrategies: ['vector', 'fulltext', 'hybrid'],
      requireHighConsensus: true
    }
  },
  priority: 'high'
});

// Stream conversation with real-time results
for await (const chunk of universalAIAssistantService.streamConversation(request)) {
  console.log('Chunk:', chunk);
}

// Enhanced site action registration
await universalAIAssistantService.registerSiteActions({
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  actions: siteActions,
  enableAutoDiscovery: true
});

// Trigger KB operations
const sessionId = await universalAIAssistantService.triggerKnowledgeBaseOperation({
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  operationType: 'incremental',
  priority: 'normal'
});
```

#### AIOrchestrationService

Core AI workflow coordination service.

**Features:**

- LangGraph orchestration
- Knowledge base integration
- Action coordination
- Session management

**Usage:**

```typescript
import { AIOrchestrationService } from './AIOrchestrationService';

const orchestrator = new AIOrchestrationService({
  kbService: knowledgeBaseService,
  websocketService: voiceHandler
});

const result = await orchestrator.processConversation(request);
```

#### KnowledgeBaseService

Knowledge base operations service.

**Features:**

- Semantic search
- Content processing
- Indexing management
- Statistics and monitoring

**Usage:**

```typescript
import { knowledgeBaseService } from './KnowledgeBaseService';

// Semantic search
const results = await knowledgeBaseService.search({
  query: 'user question',
  knowledgeBaseId: 'kb_123',
  topK: 10,
  threshold: 0.7
});

// Start site crawling
const sessionId = await knowledgeBaseService.startSiteCrawling({
  knowledgeBaseId: 'kb_123',
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  baseUrl: 'https://example.com'
});
```

---

### ⚡ **Specialized Services**

#### EmbeddingService

Vector embedding generation and management.

**Features:**

- Multiple embedding models support
- Batch processing
- Similarity search
- Caching and optimization

**Usage:**

```typescript
import { embeddingService } from './EmbeddingService';

// Generate single embedding
const embedding = await embeddingService.generateEmbedding(
  'text to embed',
  'text-embedding-3-small'
);

// Batch generation
const embeddings = await embeddingService.batchGenerateEmbeddings(
  ['text1', 'text2', 'text3'],
  50, // batch size
  'text-embedding-3-small'
);

// Similarity search
const results = await embeddingService.similaritySearch({
  queryEmbedding: embedding,
  embeddings: storedEmbeddings,
  topK: 5,
  threshold: 0.8
});
```

#### ActionExecutorService

Execute actions within sites and applications.

**Features:**

- Action validation
- Parameter processing
- Result handling
- Error recovery

**Usage:**

```typescript
import { actionExecutorService } from './ActionExecutorService';

const result = await actionExecutorService.executeAction({
  actionName: 'updateUserProfile',
  parameters: {
    userId: 'user_123',
    email: 'new@example.com'
  },
  siteId: 'site_123',
  tenantId: 'tenant_abc'
});
```

#### LanguageDetectorService

Detect and handle multiple languages.

**Features:**

- Language detection from text
- Browser language integration
- Locale management
- Confidence scoring

**Usage:**

```typescript
import { languageDetectorService } from './LanguageDetectorService';

const language = await languageDetectorService.detect(
  'Bonjour, comment allez-vous?',
  'en-US' // fallback browser language
);

console.log(language); // 'fr-FR'
```

#### WebCrawlerService

Web crawling and content extraction.

**Features:**

- Playwright-based crawling
- Robots.txt compliance
- Rate limiting
- Content extraction
- Progress tracking

**Usage:**

```typescript
import { webCrawlerService } from './WebCrawlerService';

const sessionId = await webCrawlerService.startCrawl({
  url: 'https://example.com',
  siteId: 'site_123',
  tenantId: 'tenant_abc',
  options: {
    maxDepth: 3,
    maxPages: 100,
    respectRobots: true
  }
});

const status = webCrawlerService.getCrawlStatus(sessionId);
```

#### IncrementalIndexer

Delta-based knowledge base update service.

**Features:**

- Sitemap.xml lastmod-based change detection
- Content hashing for idempotent operations
- Multi-phase processing pipeline
- Comprehensive progress tracking
- Error recovery and retry logic

**Usage:**

```typescript
import { incrementalIndexer } from './IncrementalIndexer';

const result = await incrementalIndexer.performIncrementalUpdate({
  knowledgeBaseId: 'kb_site123',
  tenantId: 'tenant_abc',
  siteId: 'site_123',
  baseUrl: 'https://example.com',
  sessionType: 'delta',
  options: {
    maxDepth: 3,
    extractStructuredData: true,
    extractActions: true,
    extractForms: true
  }
});

console.log(`Updated ${result.newChunks} chunks, ${result.extractedEntities} entities`);
```

---

## Service Integration Patterns

### Dependency Injection

Services use constructor injection for dependencies:

```typescript
export class UniversalAIAssistantService {
  constructor(
    private config: AIAssistantConfig,
    private voiceHandler?: VoiceWebSocketHandler
  ) {
    this.orchestrationService = new AIOrchestrationService({
      kbService: new KnowledgeBaseService(),
      websocketService: this.voiceHandler,
      ttsService: null
    });
  }
}
```

### Factory Pattern

Services provide factory functions for easy instantiation:

```typescript
export function createUniversalAIAssistantService(
  config?: Partial<AIAssistantConfig>,
  voiceHandler?: VoiceWebSocketHandler
): UniversalAIAssistantService {
  return new UniversalAIAssistantService(config, voiceHandler);
}

// Singleton export for compatibility
export const universalAIAssistantService = new UniversalAIAssistantService();
```

### Event-Driven Communication

Services communicate through events and callbacks:

```typescript
// WebSocket notifications
if (this.voiceHandler) {
  await this.voiceHandler.notifyActionExecuted({
    actionName: params.actionName,
    siteId: params.siteId,
    result,
    timestamp: new Date().toISOString()
  });
}

// Background operations
this.triggerBackgroundOperations(request, response).catch(error =>
  logger.error('Background operations failed', { error })
);
```

---

## Performance Optimization

### Caching Strategies

Services implement multiple caching layers:

```typescript
// Service-level caching
private responseCache = new Map<string, CacheEntry>();

// Infrastructure caching
const cacheKey = this.generateCacheKey(request);
const cached = await retrievalCache.get(cacheKey);

// Database query optimization
const results = await pgVectorClient.nnSearch({
  ...query,
  useIndex: 'hnsw' // Use optimal index
});
```

### Async Processing

Services use async patterns for performance:

```typescript
// Parallel processing
const [vectorResults, ftsResults, structuredResults] = await Promise.all([
  this.executeVectorSearch(request),
  this.executeFullTextSearch(request),
  this.executeStructuredDataSearch(request)
]);

// Streaming responses
async* streamConversation(request): AsyncGenerator<any, void, unknown> {
  // Yield immediate results
  yield { type: 'search_started', strategies: request.strategies };
  
  // Process and stream
  const results = await this.processConversation(request);
  yield { type: 'response', data: results };
}
```

### Background Processing

Non-critical operations run in background:

```typescript
// Fire-and-forget background operations
this.triggerBackgroundUpdates(request, results).catch(error => 
  logger.error('Background update failed', { error })
);

// Scheduled cleanup
setInterval(() => this.cleanupInactiveSessions(), 5 * 60 * 1000);
```

---

## Error Handling & Resilience

### Graceful Degradation

Services implement fallback strategies:

```typescript
try {
  return await this.hybridSearchService.search(request);
} catch (error) {
  logger.warn('Hybrid search failed, falling back to vector search', { error });
  return await this.vectorSearchOnly(request);
}
```

### Circuit Breaker Pattern

```typescript
private circuitBreaker = new CircuitBreaker({
  errorThreshold: 5,
  timeout: 30000,
  resetTimeout: 60000
});

async performOperation(request: any) {
  return this.circuitBreaker.execute(() => this.actualOperation(request));
}
```

### Retry Logic

```typescript
private async retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## Monitoring & Observability

### Enhanced Metrics Collection

Services collect comprehensive metrics:

```typescript
private metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
  averageSearchTime: 0,           // NEW: Search performance
  activeStreams: 0,
  totalTokensUsed: 0,
  totalActionsExecuted: 0,
  hybridSearches: 0,              // NEW: Hybrid search usage
  cacheHitRate: 0,                // NEW: Cache performance
  consensusFailures: 0,           // NEW: Search consensus failures
  autoIndexingTriggers: 0,        // NEW: Auto-indexing events
  kbUpdatesTriggered: 0           // NEW: KB update events
};

private updateMetrics(success: boolean, responseTime: number, result: any) {
  this.metrics.totalRequests++;
  if (success) {
    this.metrics.successfulRequests++;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime + responseTime) / 2;
  } else {
    this.metrics.failedRequests++;
  }
}
```

### Structured Logging

```typescript
import { createLogger } from '../../../../shared/utils';

const logger = createLogger({ service: 'universal-ai-assistant' });

logger.info('Processing conversation', {
  tenantId: request.tenantId,
  siteId: request.siteId,
  sessionId: request.sessionId,
  inputLength: request.input.length,
  priority: request.priority,
  strategies: request.context?.userPreferences?.searchStrategies,
  correlationId: req.correlationId
});
```

### Health Checks

Services provide health status:

```typescript
async getHealthStatus(): Promise<HealthStatus> {
  const [kbHealth, cacheHealth, orchestrationHealth] = await Promise.allSettled([
    this.checkKBHealth(),
    this.checkCacheHealth(), 
    this.checkOrchestrationHealth()
  ]);
  
  return {
    status: allHealthy ? 'healthy' : 'degraded',
    components: [kbHealth, cacheHealth, orchestrationHealth],
    timestamp: new Date().toISOString()
  };
}
```

---

## Configuration Management

### Environment-Based Config

```typescript
export interface AIAssistantConfig {
  // AI Settings
  enableVoice: boolean;
  enableStreaming: boolean;
  defaultLocale: string;
  
  // Search Settings
  searchStrategies?: SearchStrategy[];
  consensusThreshold?: number;
  
  // Performance Settings
  enableAdvancedCaching?: boolean;
  enableAutoIndexing?: boolean;
  maxSessionDuration: number;
  responseTimeoutMs: number;
}

// Load from environment
const config: AIAssistantConfig = {
  enableVoice: process.env.ENABLE_VOICE === 'true',
  searchStrategies: process.env.SEARCH_STRATEGIES?.split(',') as SearchStrategy[] || ['vector', 'fulltext'],
  consensusThreshold: parseFloat(process.env.CONSENSUS_THRESHOLD || '0.7')
};
```

### Runtime Configuration

```typescript
// Update configuration at runtime
service.updateConfig({
  searchStrategies: ['vector', 'fulltext', 'hybrid'],
  enableAutoIndexing: true
});
```

---

## Testing Strategies

### Unit Testing

```typescript
describe('UniversalAIAssistantService', () => {
  let service: UniversalAIAssistantService;
  let mockOrchestration: jest.Mocked<AIOrchestrationService>;

  beforeEach(() => {
    mockOrchestration = createMockOrchestrationService();
    service = new UniversalAIAssistantService(
      { enableVoice: false },
      undefined // no voice handler for tests
    );
  });

  it('should process conversation with enhanced features', async () => {
    const request = createMockRequest();
    const response = await service.processConversation(request);
    
    expect(response.response.metadata.searchMetadata).toBeDefined();
    expect(response.knowledgeBase).toBeDefined();
  });
});
```

### Integration Testing

```typescript
describe('AI Services Integration', () => {
  it('should handle end-to-end conversation flow', async () => {
    const request = {
      input: 'How do I configure payments?',
      tenantId: 'test-tenant',
      siteId: 'test-site'
    };
    
    // Test full pipeline
    const response = await universalAIAssistantService.processConversation(request);
    
    expect(response.response.citations).toHaveLength.toBeGreaterThan(0);
    expect(response.response.metadata.searchMetadata?.strategiesUsed).toContain('vector');
  });
});
```

### Performance Testing

```typescript
describe('Performance Tests', () => {
  it('should handle concurrent requests efficiently', async () => {
    const requests = Array(100).fill(null).map(() => createMockRequest());
    
    const startTime = Date.now();
    const results = await Promise.all(
      requests.map(req => service.processConversation(req))
    );
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // < 5 seconds for 100 requests
    expect(results).toHaveLength(100);
  });
});
```

---

## Best Practices

### Service Design

1. **Single Responsibility**: Each service has a clear, focused purpose
2. **Dependency Injection**: Use constructor injection for testability
3. **Interface Segregation**: Define minimal interfaces for dependencies
4. **Error Handling**: Implement graceful degradation and fallbacks
5. **Logging**: Use structured logging with correlation IDs

### Performance

1. **Async Operations**: Use async/await for I/O operations
2. **Parallel Processing**: Use Promise.all for independent operations
3. **Caching**: Implement multi-tier caching strategies
4. **Background Processing**: Move non-critical work to background
5. **Monitoring**: Track performance metrics and set up alerts

### Maintainability

1. **Type Safety**: Use TypeScript interfaces and types
2. **Documentation**: Document complex logic and decisions
3. **Testing**: Maintain high test coverage
4. **Configuration**: Make behavior configurable
5. **Monitoring**: Implement comprehensive logging and metrics

---

This documentation provides comprehensive guidance for understanding, using, and maintaining the AI application services in the SiteSpeak platform.
