# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Core Development

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:client` - Start only frontend (Vite dev server on port 3000)
- `npm run dev:server` - Start only backend (Express server on port 5000)
- `npm run build` - Build both client and server for production
- `npm run start` - Start production server

### Database Operations

- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with initial data
- `npm run db:setup` - Run migrations and seed (full setup)
- `npm run db:push` - Push schema changes to database (Drizzle)

### Code Quality

- `npm run lint` - Run ESLint on server, client, and tests
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run type-check` - Run TypeScript compiler check
- `npm run format` - Format code with Prettier
- `npm run verify` - Run full verification (lint + type-check + build + test)

### Testing

- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:e2e` - Run Cypress end-to-end tests
- `npm run test:performance` - Run performance tests with Artillery

### Docker Development

- `npm run docker:dev` - Start all services in Docker development mode
- `npm run docker:dev:logs` - Watch Docker development logs
- `npm run docker:dev:down` - Stop Docker development services
- `npm run docker:reset` - Complete Docker reset (volumes included)

## High-Level Architecture

### Monorepo Structure

This is a monorepo containing a full-stack TypeScript application with these key components:

- **Root**: Shared configuration, Docker compose, scripts
- **client/**: React frontend with Vite build system
- **server/**: Express.js backend with TypeScript
- **shared/**: Shared types and utilities
- **docs/**: Documentation and protocols

### Technology Stack

**Frontend (client/)**:

- React 18 with TypeScript
- Vite for development and building
- Wouter for routing (not React Router)
- Redux Toolkit + Zustand for state management
- Radix UI components with Tailwind CSS
- React Query for API state management
- React DnD for drag-and-drop functionality

**Backend (server/)**:

- Node.js with Express.js and TypeScript
- Drizzle ORM with PostgreSQL database
- Redis for caching and sessions
- Socket.io for real-time communication
- OpenAI integration for AI features
- LangChain/LangGraph for AI workflows
- Bull/BullMQ for job queues

**AI/Voice Features**:

- OpenAI GPT-4o for conversation and text generation
- Whisper API for speech-to-text
- Custom voice AI assistant with widget embedding
- Knowledge base auto-crawling and indexing
- Vector embeddings for semantic search
- Intent engine with tool calling

### Key Architectural Patterns

**Database Layer**:

- Uses Drizzle ORM with PostgreSQL
- Schema defined in `server/src/db/schema.ts`
- UUID primary keys with pgcrypto extension
- Vector embeddings stored as text (plan to migrate to pgvector)

**API Structure**:

- RESTful API with Express.js
- Routes organized by feature in `server/src/routes/`
- Middleware for auth, rate limiting, monitoring
- Real-time features via Socket.io

**Frontend Architecture**:

- Component-based React with TypeScript
- Feature-based folder organization
- Custom hooks for business logic
- Global state with Redux Toolkit slices
- Real-time UI updates via Socket.io client

**AI Integration**:

- Knowledge base auto-crawling from localhost during development
- LangGraph for complex AI workflows
- Dynamic tool calling and intent recognition
- Voice AI widget that embeds in published sites

### Development Environment Setup

**Required Services**:

- PostgreSQL (port 5433 in development)
- Redis (port 6380 in development)
- Frontend dev server (port 3000)
- Backend API server (port 5000)

**Environment Variables**:
Essential variables that must be set in `.env`:

- `OPENAI_API_KEY` - Required for AI features
- `JWT_SECRET` - For authentication (32+ characters)
- `ENCRYPTION_KEY` - Exactly 32 characters for encryption
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

**Feature Flags**:

- `INTENT_ENGINE_ENABLED` - Enable/disable intent classification
- `USE_PLAYWRIGHT_CRAWLER` - Use Playwright for advanced crawling
- `AUTO_CRAWLER_ENABLED` - Enable automatic knowledge base crawling

### Important Development Notes

**Database Migrations**:

- Migrations are managed by Drizzle Kit
- Schema changes require running `npm run db:push` or migrations
- Development database can be reset with Docker commands

**Knowledge Base System**:

- Auto-crawls localhost:3000 and localhost:5000 during development
- Creates structured knowledge base in `server/knowledge-base/`
- Generates embeddings for semantic search
- See `docs/knowledge-base-protocol.md` for detailed protocol

**Voice AI Development**:

- Voice widgets are embeddable JavaScript that can be added to any website
- Development testing requires HTTPS for microphone access (use localhost exception)
- TTS/STT processing creates temporary files in `server/temp/audio/`

**Code Quality Standards**:

- Strict TypeScript configuration with comprehensive type checking
- ESLint with React and TypeScript rules
- Prettier for consistent formatting
- No console.log allowed (use console.warn/error)
- Comprehensive test coverage expected

**Testing Strategy**:

- Unit tests with Jest for business logic
- Integration tests for API endpoints
- E2E tests with Cypress for user workflows
- Performance tests with Artillery for load testing

This codebase implements a sophisticated AI-powered website builder with integrated voice assistance. The architecture supports both rapid development iteration and production deployment with Docker.

- There are readmes everywhere, before doing something, make sure to read the readme file in the relevant folder
- Make sure to check todo-highlevel folder before doing something, every todo, gap, vision and every plan is in that folder. make sure to read first
- Always act like senior fullstack developer with 20+ years experience, make precise, to the point and wise
- Check for errors after your works done
- We are trying to make the crawler as universal as possible we dont hardcode things about websites
- Dont use any, try to do narrowing
- We want to use PlayWright, make sure it is implemented properly
- Handle unused variables carefully, we did not write it there without purpose, try to understand the problem. If they are really not needed and legacy, try to remove them without breaking anything.
- Use context7 when you cannot find a way to solve a problem.

- This is the master brief for the AI agents and engineers building SiteSpeak: a Wix/GoDaddy-class website builder where every published site ships with a built-in, voice-first, agentic assistant that can understand the site, take actions (navigate, filter, add to cart, book, etc.), and stay fresh by recrawling and updating its own knowledge base. Treat this document as the source of truth.

- ## 0) Non-Negotiables

Speed: First audible/visible feedback ≤ 300 ms; first concrete action (e.g., obvious navigation) may start optimistically before full planning completes. Use resource hints and speculative navigation to hide latency (MDN/web.dev).
developer.mozilla.org
web.dev
+1

Privacy & tenancy: Each customer site has an isolated KB + vector index. No cross-tenant leakage.

Key security: Never expose OpenAI keys in the browser; all LLM calls go through our server-side proxy with per-tenant auth & metering. (OpenAI production best practices.)
platform.openai.com

Standards: Embrace JSON-LD (schema.org), ARIA landmarks, sitemaps with accurate lastmod, and an introspectable GraphQL layer so the site is machine-readable out of the box.
playwright.dev
+1
developer.mozilla.org
Google for Developers

Architecture: Hexagonal + 12-Factor; web (HTTP) and workers (crawl/index) are distinct processes.

Agent runtime: LangGraph (JS/TS) for stateful agent graphs + OpenAI function calling for tool execution; SK planners are optional references, not the main path.
langchain-ai.github.io
platform.openai.com
