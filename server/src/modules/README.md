# Business Modules

Feature-based modules that implement the core business functionality of SiteSpeak.

## Architecture

Each module follows a consistent structure that combines domain-driven design with feature organization:

```plaintext
modules/
├── sites/              # Website builder and management
├── ai/                 # AI services and knowledge base
├── voice/              # Voice AI and real-time communication
├── publishing/         # Site deployment and publishing
└── analytics/          # Performance and usage analytics
```

## Module Structure

Each module follows this standard structure:

```plaintext
module-name/
├── domain/             # Domain entities and business rules
├── application/        # Use cases and application services
├── infrastructure/     # External service integrations
├── api/               # HTTP controllers and routes
└── README.md          # Module-specific documentation
```

## Sites Module (`/sites`)

**Purpose**: Website creation, editing, and management

**Key Features:**

- Drag-and-drop site editor
- Template system and component library
- Site configuration and theme management
- Multi-tenant site isolation
- Version control and revision history

**Domain Entities:**

- `Site` - Website configuration and content
- `Template` - Reusable site templates
- `Component` - Reusable UI components
- `Page` - Individual site pages
- `Asset` - Media files and resources

**API Endpoints:**

```plaintext
GET    /api/sites              # List user sites
POST   /api/sites              # Create new site
GET    /api/sites/:id          # Get site details
PUT    /api/sites/:id          # Update site
DELETE /api/sites/:id          # Delete site
POST   /api/sites/:id/publish  # Publish site
GET    /api/templates          # List templates
```

## AI Module (`/ai`)

**Purpose**: Artificial intelligence services including knowledge base, conversation management, and tool calling

**Submodules:**

- `/ingestion` - Content crawling and knowledge base creation
- `/retrieval` - Vector search and content retrieval
- `/orchestrator` - AI agent orchestration with LangGraph
- `/tools` - Tool calling and action execution
- `/actions` - Site action manifest generation

**Key Features:**

- Automated website crawling and indexing
- Vector embeddings with pgvector
- Conversational AI with OpenAI GPT-4o
- Tool calling and function execution
- Intent classification and entity extraction
- Knowledge base maintenance and optimization

**Domain Entities:**

- `KnowledgeBase` - Site-specific knowledge repository
- `KnowledgeChunk` - Indexed content pieces with embeddings
- `Conversation` - AI conversation sessions
- `Tool` - Callable functions and actions
- `Intent` - Classified user intentions

## Voice Module (`/voice`)

**Purpose**: Voice AI functionality including speech processing and real-time communication

**Submodules:**

- `/transport` - WebSocket communication for real-time voice
- `/processing` - Speech-to-text and text-to-speech
- `/embedding` - Voice widget embedding system

**Key Features:**

- Real-time voice communication via WebSocket
- Speech-to-text with OpenAI Whisper
- Text-to-speech with OpenAI TTS
- Voice activity detection
- Audio quality optimization
- Multi-language support

**Domain Entities:**

- `VoiceSession` - Individual voice interaction sessions
- `VoiceInteraction` - Single voice exchange (input/output)
- `VoiceWidget` - Embeddable voice interface configuration
- `AudioFile` - Stored audio recordings and processing results

## Publishing Module (`/publishing`)

**Purpose**: Site deployment, hosting, and content delivery

**Key Features:**

- Static site generation
- CDN integration and asset optimization
- Custom domain management
- SSL certificate provisioning
- Performance optimization
- SEO enhancement

**Domain Entities:**

- `Deployment` - Site deployment record
- `Domain` - Custom domain configuration
- `Asset` - Static assets and media files
- `SiteManifest` - Generated site metadata and actions

**Deployment Pipeline:**

1. **Build**: Generate static site from editor configuration
2. **Optimize**: Compress assets, generate responsive images
3. **Deploy**: Upload to CDN with versioning
4. **Configure**: Set up domains and SSL certificates
5. **Index**: Trigger knowledge base crawling

## Analytics Module (`/analytics`)

**Purpose**: Performance monitoring, usage tracking, and business intelligence

**Key Features:**

- Real-time analytics collection
- Voice AI interaction tracking
- Conversion funnel analysis
- Performance monitoring
- Custom event tracking
- Dashboard and reporting

**Domain Entities:**

- `SiteAnalytics` - Aggregated site performance metrics
- `UserInteractionEvent` - Individual user actions
- `ConversionEvent` - Goal completions and conversions
- `PerformanceMetrics` - Technical performance data

**Analytics Categories:**

- **Traffic Analytics**: Page views, sessions, user journeys
- **Voice AI Analytics**: Interaction success rates, satisfaction scores
- **Performance Analytics**: Load times, Core Web Vitals
- **Business Analytics**: Conversions, revenue, engagement

## Inter-Module Communication

Modules communicate through well-defined interfaces and events:

### Service Interfaces

```typescript
// Cross-module service dependencies
interface SitesService {
  getSite(siteId: string): Promise<Site>;
  updateSite(siteId: string, data: Partial<Site>): Promise<Site>;
}

interface AIService {
  indexSite(siteId: string): Promise<void>;
  searchKnowledgeBase(siteId: string, query: string): Promise<SearchResult[]>;
}
```

### Event System

```typescript
// Domain events for loose coupling
interface SitePublishedEvent {
  siteId: string;
  url: string;
  publishedAt: Date;
}

// Event handlers in different modules
// AI Module: Start knowledge base indexing
// Analytics Module: Track publishing event
// Voice Module: Update voice widget configuration
```

### Shared Dependencies

- **Database**: All modules use the same database schema
- **Configuration**: Environment configuration is shared
- **Authentication**: JWT tokens and user context
- **Logging**: Consistent logging across modules

## Development Workflow

### Adding a New Module

1. **Create Module Structure**:

   ```bash
   mkdir src/modules/new-module
   mkdir src/modules/new-module/{domain,application,infrastructure,api}
   ```

2. **Define Domain Entities**:

   ```typescript
   // domain/entities/NewEntity.ts
   export class NewEntity {
     constructor(
       public id: string,
       public name: string,
       // ... other properties
     ) {}
   }
   ```

3. **Create Application Services**:

   ```typescript
   // application/NewEntityService.ts
   export class NewEntityService {
     async create(data: CreateNewEntityRequest): Promise<NewEntity> {
       // Business logic
     }
   }
   ```

4. **Add API Controllers**:

   ```typescript
   // api/NewEntityController.ts
   export class NewEntityController {
     async create(req: Request, res: Response) {
       const result = await this.newEntityService.create(req.body);
       res.json({ success: true, data: result });
     }
   }
   ```

5. **Register Routes**:

   ```typescript
   // api/routes.ts
   router.post('/new-entities', controller.create);
   ```

### Module Dependencies

Modules can depend on other modules but should:

1. Use dependency injection for loose coupling
2. Communicate through well-defined interfaces
3. Handle failures gracefully
4. Avoid circular dependencies

### Testing Strategy

Each module has comprehensive testing:

- **Unit Tests**: Domain logic and business rules
- **Integration Tests**: Database operations and external services
- **API Tests**: HTTP endpoints and request/response handling
- **End-to-End Tests**: Complete user workflows

## Module Guidelines

1. **Single Responsibility**: Each module should have a clear, focused purpose
2. **Interface Segregation**: Define minimal, cohesive interfaces between modules
3. **Dependency Direction**: Core business modules should not depend on infrastructure
4. **Error Handling**: Consistent error handling and logging across modules
5. **Performance**: Optimize for common use cases, cache where appropriate
6. **Security**: Validate inputs, sanitize outputs, respect tenant boundaries

## Monitoring and Observability

Each module provides:

- Health checks for critical dependencies
- Performance metrics and monitoring
- Structured logging with correlation IDs
- Error tracking and alerting
- Business metrics and KPIs

This modular architecture enables:

- **Independent Development**: Teams can work on different modules
- **Selective Deployment**: Deploy only changed modules
- **Horizontal Scaling**: Scale individual modules based on load
- **Technology Diversity**: Use different technologies per module needs
