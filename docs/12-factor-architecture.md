# SiteSpeak 12-Factor Architecture Implementation

## Overview

This document describes the implementation of proper 12-Factor architecture for SiteSpeak, separating web and worker processes while maintaining the critical ≤300ms voice latency requirement.

## Architecture Separation

### Web Process (`server/web.ts`)

**Responsibilities:**
- HTTP API request handling (Express.js)
- WebSocket connections (Socket.IO + Raw WebSocket)
- Real-time voice processing (≤300ms requirement)
- Authentication and session management
- Request routing and middleware
- Immediate user feedback and interactions

**Optimization for Voice Latency:**
- Real-time AI inference stays in web process
- Voice WebSocket connections handled directly
- OpenAI Realtime API integration for immediate response
- Optimistic execution for instant feedback
- Resource hints and speculative navigation

**Excluded from Web Process:**
- Background job processing
- Knowledge base crawling
- Heavy AI model processing
- Site publishing pipelines
- Analytics data processing

### Worker Process (`server/worker.ts`)

**Responsibilities:**
- Background job processing (BullMQ workers)
- Knowledge base crawling and indexing
- AI model processing (non-real-time)
- Site publishing pipeline
- Analytics data processing
- Maintenance and cleanup tasks

**Worker Types:**
- **Crawler Worker**: Knowledge base indexing, site crawling
- **AI Worker**: Embedding generation, model processing
- **Voice Worker**: Non-real-time voice processing (TTS synthesis)
- **Analytics Worker**: Event processing, report generation
- **Publishing Worker**: Site deployment, CDN updates
- **Maintenance Worker**: Cleanup, optimization tasks

## Inter-Process Communication

### Queue-Based Architecture (Redis + BullMQ)

```
Web Process              Redis/BullMQ              Worker Process
    |                         |                         |
    |---> Submit Job -------->|                         |
    |                         |---> Process Job ------>|
    |<--- Job Status ---------|<--- Job Complete ------|
```

**Queue Types:**
- `CRITICAL`: Real-time operations, site publishing
- `AI`: AI processing, embeddings, model inference
- `CRAWLER`: Knowledge base updates, site indexing
- `VOICE`: Non-real-time voice processing
- `ANALYTICS`: Event tracking, metrics
- `MAINTENANCE`: Cleanup, optimization

### Shared Resources

**Database (PostgreSQL):**
- Shared connection pools
- Multi-tenant isolation maintained
- Read replicas for worker processes (future optimization)

**Redis:**
- Queue backend (BullMQ)
- Session storage
- Caching layer

**File System:**
- Shared volumes for uploads, published sites
- Temporary file cleanup by worker process

## Voice Latency Preservation (≤300ms)

### Critical Requirements Met

1. **Real-Time Processing in Web Process:**
   ```typescript
   // Voice WebSocket connections stay in web process
   const aiAssistant = getUniversalAIAssistantService({
     enableVoice: true,
     enableStreaming: true,
     responseTimeoutMs: 300, // ≤300ms requirement
     processType: 'web'
   });
   ```

2. **Direct WebSocket Handling:**
   - Socket.IO for compatibility
   - Raw WebSocket for performance (`/voice-ws` endpoint)
   - No queue overhead for real-time voice

3. **Optimistic Execution:**
   - Immediate feedback while background processing continues
   - Speculative navigation for perceived performance
   - Resource hints for faster loading

4. **Background Updates:**
   - Knowledge base updates happen in worker process
   - Real-time voice uses cached/indexed data
   - Non-blocking architecture for voice interactions

### Voice Architecture Flow

```
User Voice Input --> Web Process (≤300ms) --> Immediate Response
                         |
                         |--> Queue Job --> Worker Process
                                               |
                                         Knowledge Base Update
                                         (Asynchronous)
```

## Deployment Architecture

### Development Environment

```bash
# Start both processes in development
npm run dev              # Starts web + worker + client
npm run dev:web          # Web process only
npm run dev:worker       # Worker process only
```

### Docker Compose (12-Factor Compliant)

```yaml
services:
  # Web Process (Multiple replicas for scaling)
  sitespeak-web:
    build:
      target: web
    deploy:
      replicas: 2
    environment:
      - PROCESS_TYPE=web
    ports:
      - "5000:5000"

  # Worker Process (Scalable background processing)
  sitespeak-worker:
    build:
      target: worker
    deploy:
      replicas: 1
    environment:
      - PROCESS_TYPE=worker
```

### Production Scaling

**Web Process Scaling:**
- Horizontal scaling with load balancers
- Multiple web process replicas
- Session affinity for WebSocket connections
- Auto-scaling based on request volume

**Worker Process Scaling:**
- Scale based on queue depth
- Different worker types can scale independently
- Resource allocation based on job types
- Auto-scaling based on job volume

## Process Communication Patterns

### Job Submission (Web → Worker)

```typescript
// Web process submits background job
const queueService = getWebSharedServices().queues.clients;
await queueService.queues.crawler.add('index-site', {
  siteId,
  tenantId,
  url,
  priority: 'high'
});
```

### Real-Time Updates (Worker → Web)

```typescript
// Worker process publishes updates via Redis
const eventService = getWorkerSharedServices().events;
await eventService.publish('knowledge-base.updated', {
  siteId,
  tenantId,
  status: 'completed'
});
```

## Health Checks and Monitoring

### Web Process Health

```http
GET /health/ready    # Readiness probe (503 if shutting down)
GET /health          # General health check
```

### Worker Process Health

- Queue worker status monitoring
- Job processing metrics
- Resource utilization tracking
- Failed job retry policies

## Migration Strategy

### Phase 1: Parallel Deployment
- Deploy both processes alongside existing monolith
- Route traffic gradually to new web process
- Background jobs processed by new worker process

### Phase 2: Full Migration
- Complete traffic migration to separated processes
- Decommission monolith process
- Monitor performance and adjust scaling

### Phase 3: Optimization
- Fine-tune worker scaling policies
- Optimize queue configurations
- Implement advanced monitoring

## Benefits Achieved

1. **12-Factor Compliance**: Proper process separation
2. **Scalability**: Independent scaling of web and worker processes
3. **Reliability**: Isolated failure domains
4. **Performance**: Voice latency ≤300ms maintained
5. **Maintainability**: Clear separation of concerns
6. **Resource Efficiency**: Optimized resource allocation per process type

## File Structure

```
server/
├── web.ts                              # Web process entry point
├── worker.ts                           # Worker process entry point
├── index.ts                            # Legacy monolith (backward compatibility)
├── src/
│   ├── infrastructure/
│   │   ├── services/
│   │   │   ├── web-shared.ts          # Web process shared services
│   │   │   └── worker-shared.ts       # Worker process shared services
│   │   ├── server/
│   │   │   └── web-server.ts          # Web-optimized server
│   │   └── workers/
│   │       └── worker-manager.ts      # Worker process manager
│   └── services/_shared/
│       └── queues/                    # Queue system (Redis + BullMQ)
```

## Development Commands

```bash
# Development (separated processes)
npm run dev                 # All processes + client
npm run dev:web            # Web process only
npm run dev:worker         # Worker process only

# Building (separated)
npm run build:web          # Build web process
npm run build:worker       # Build worker process

# Production (separated)
npm run start:web          # Start web process
npm run start:worker       # Start worker process

# Docker (12-Factor)
docker-compose up          # Both processes + dependencies
```

This architecture ensures SiteSpeak maintains its voice-first, real-time capabilities while achieving proper 12-Factor compliance and scalability.