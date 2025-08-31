# SiteSpeak Server

The backend API server for SiteSpeak - a voice-first website builder with integrated AI assistant.

## Architecture

This server follows hexagonal architecture patterns with feature-based modules:

```plaintext
src/
├── domain/              # Pure business logic (entities, value objects, domain services)
├── application/         # Use cases and application services
├── infrastructure/      # Configuration, database, external services
├── adapters/           # HTTP controllers, database repositories, external APIs
└── modules/            # Feature-based business modules
```

## Key Features

- **Voice AI Integration**: OpenAI GPT-4o + Whisper for speech processing
- **Knowledge Base**: Automated site crawling with pgvector embeddings
- **Site Builder**: Drag-and-drop editor with voice agent integration
- **Real-time Communication**: WebSocket support for voice interactions
- **Multi-tenant**: Secure tenant isolation with role-based access control

## Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Drizzle ORM with Zod validation
- **Cache**: Redis for sessions and caching
- **AI**: OpenAI API, LangChain/LangGraph
- **WebSocket**: Socket.io for real-time features

## Quick Start

1. **Environment Setup**:

   ```bash
   cp ../environment.example ../.env
   # Edit .env with your configuration
   ```

2. **Install Dependencies**:

   ```bash
   npm install
   ```

3. **Database Setup**:

   ```bash
   # Start PostgreSQL and Redis (via Docker)
   npm run docker:dev
   
   # Run migrations
   npm run db:migrate
   npm run db:seed
   ```

4. **Development**:

   ```bash
   npm run dev
   # Server runs on http://localhost:5000
   ```

## Module Overview

### `/infrastructure`

Core infrastructure services including:

- Configuration management with environment validation
- Database connection and migration management
- Monitoring and observability setup

### `/modules/ai`

AI and machine learning features:

- Knowledge base ingestion and retrieval
- Voice processing and conversation management
- Tool calling and action orchestration
- Intent classification and entity extraction

### `/modules/voice`

Voice AI functionality:

- WebSocket transport for real-time voice
- Speech-to-text and text-to-speech processing
- Voice session management
- Widget embedding system

### `/modules/sites`

Website builder core:

- Site creation and management
- Template system and component library
- Publishing pipeline
- Site contract generation (JSON-LD, ARIA, manifests)

### `/modules/publishing`

Site deployment and publishing:

- Static site generation
- CDN integration
- Domain management
- Performance optimization

### `/modules/analytics`

Analytics and monitoring:

- User interaction tracking
- Voice AI performance metrics
- Conversion tracking
- Real-time dashboards

## Environment Variables

See `../environment.example` for complete configuration options. Key required variables:

```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-char-encryption-key

# AI Services
OPENAI_API_KEY=sk-your-openai-key
```

## API Endpoints

### Health & Status

- `GET /api/health` - Basic health check
- `GET /api/health/live` - Liveness probe
- `GET /api/health/ready` - Readiness probe

### Authentication

- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Token refresh

### Sites

- `GET /api/sites` - List user sites
- `POST /api/sites` - Create new site
- `PUT /api/sites/:id` - Update site
- `POST /api/sites/:id/publish` - Publish site

### Voice AI

- `POST /api/voice/session` - Create voice session
- `WS /api/voice/stream` - Voice WebSocket endpoint
- `GET /api/voice/analytics` - Voice interaction analytics

### Knowledge Base

- `POST /api/kb/search` - Search knowledge base
- `POST /api/kb/reindex` - Trigger reindexing
- `GET /api/kb/status` - Indexing status

## Database Schema

The database uses PostgreSQL with pgvector extension for embeddings:

- **Users & Tenants**: Multi-tenant user management
- **Sites**: Website configuration and content
- **Knowledge Base**: Crawled content with vector embeddings
- **Voice Sessions**: Real-time voice interaction tracking
- **Conversations**: AI conversation history and analytics
- **Analytics**: Performance metrics and user behavior

## Development Guidelines

1. **Code Organization**: Follow hexagonal architecture principles
2. **Type Safety**: Use TypeScript with strict mode
3. **Validation**: All inputs validated with Zod schemas
4. **Error Handling**: Comprehensive error handling with proper HTTP status codes
5. **Testing**: Unit tests for business logic, integration tests for API endpoints
6. **Security**: Input sanitization, rate limiting, JWT authentication

## Monitoring & Observability

- **Health Checks**: Kubernetes-compatible health endpoints
- **Metrics**: Performance metrics and business KPIs
- **Logging**: Structured logging with correlation IDs
- **Tracing**: OpenTelemetry integration for distributed tracing

## Production Deployment

See the main README for production deployment instructions including:

- Docker containerization
- Environment configuration
- Database migrations
- Scaling considerations
