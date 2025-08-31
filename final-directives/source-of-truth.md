# SiteSpeak — Final Engineering Directive (from Bilal)

This is the master brief for the AI agents and engineers building SiteSpeak: a Wix/GoDaddy-class website builder where every published site ships with a built-in, voice-first, agentic assistant that can understand the site, take actions (navigate, filter, add to cart, book, etc.), and stay fresh by recrawling and updating its own knowledge base. Treat this document as the source of truth.

## 0) Non-Negotiables

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

1) What We’re Building (Vision in one paragraph)

SiteSpeak is a no-code builder that emits deterministic, self-describing websites. Every generated site doubles as an API for our voice agent: pages declare their structure and actions; a thin crawler keeps a pgvector knowledge base fresh; an Action Manifest maps DOM hooks and backend endpoints into callable tools. The agent plans multi-step tasks, streams responses, executes obvious steps speculatively, and asks for confirmation on side-effecting operations. (This mirrors how modern builders add AI site chat—e.g., Wix AI tools scan your content and allow data-source configuration—we go further by enabling actions, not just answers.)
support.wix.com

## 2) Competitive Reality Check (why this approach)

Wix: Has AI site creation and AI Site Chat that auto-uses site content + configured data sources. Good reference for knowledge sources and per-site control.
support.wix.com

GoDaddy: “Airo” AI builder markets instant sites; details on deep actionability are light—good UX benchmark, not a technical one.
support.wix.com

Our differentiator: Same ease of site creation but with a fully agentic, action-capable voice assistant that can navigate, click, filter, add to cart, book, and more—backed by a standard Site Contract and fast graph-based orchestration (LangGraph).
langchain-ai.github.io

## 3) The “Site Contract” (what every generated site MUST emit)

Make the builder output deterministic, machine-readable artifacts so the agent always knows where things live:

Semantic & structured markup

Inject schema.org JSON-LD for Products, Offers, FAQs, Breadcrumbs, Articles, Events, etc. (Google structured data guidelines).
playwright.dev

Wrap regions with ARIA landmarks (`<main>`, `<nav>`, `<header>`, `<footer>` or role="main", etc.) so interaction points are explicit and click targeting is robust (also improves a11y).
developer.mozilla.org
+1

Assign deterministic attributes to interactive elements: data-action="product.addToCart" / data-action="checkout.submit" and data-params schema hints.

Machine-readable navigation & freshness

Auto-publish sitemap.xml with accurate `<lastmod>` per URL; our crawler diffs only changed pages. (Google uses `<lastmod>` if it’s consistently accurate.)
Google for Developers

Add `<link rel="prefetch">` and preconnect/dns-prefetch hints for next likely pages and third-party origins to hide RTT.
developer.mozilla.org
+2
developer.mozilla.org
+2

Unified content API

Expose a site-local /graphql endpoint with introspection enabled so the agent can enumerate types and fields, discover filters/sorts, and query structured data without scraping.
playwright.dev

Action Manifest ✅ **IMPLEMENTED**

**Canonical Implementation**: `server/src/services/ai/actions/manifest/generator.ts` (836 lines)

**Actual TypeScript Interface**:

```typescript
export interface SiteManifest {
  siteId: string;
  version: string;  // "1.0.0"
  generatedAt: string;
  actions: SiteAction[];
  capabilities: string[];
  metadata: {
    hasContactForm: boolean;
    hasEcommerce: boolean;
    hasBooking: boolean;
    hasBlog: boolean;
    hasGallery: boolean;
    hasAuth: boolean;
    hasSearch: boolean;
  };
}

export interface SiteAction {
  name: string;  // "navigate_to_home", "submit_contact_form"
  type: 'navigation' | 'form' | 'button' | 'api' | 'custom';
  selector: string;  // CSS selector
  description: string;
  parameters: ActionParameter[];  // Zod-validated
  confirmation: boolean;
  sideEffecting: 'safe' | 'confirmation_required' | 'destructive';
  riskLevel: 'low' | 'medium' | 'high';
  category: 'read' | 'write' | 'delete' | 'payment' | 'communication';
}
```

**Widget Bridge Integration**: ✅ Config generation implemented, ⚠️ Runtime execution needs completion

## 4) Crawler & Indexer (Phase 1 delivered; enhance in Phase 2)

Stack: Playwright workers → Extractors (HTML/JSON-LD/forms/actions) → Transformers (chunking/cleaning/PII guards) → Embeddings → pgvector.

Our crawler already renders JS and extracts structured data; keep using Playwright as the headless engine.
OpenAI Help Center

Incremental refresh:

Seed from sitemap.xml; fetch only URLs whose lastmod increased or whose content hash changed (store per-URL ETag/content_hash). (Google treats `<lastmod>` as a crawl scheduling hint when accurate.)
Google for Developers

Chunking: Target 200–800 tokens; small 10–20% overlaps only when needed to preserve context; filter out highly overlapping chunks.
Medium

Vector Store (pgvector) — Best Practices & Dedup

Use pgvector with HNSW or IVFFlat indexes; prefer HNSW for low-latency interactive voice use; IVFFlat acceptable for larger corpora with more memory slack.
GitHub

Maintain (site_id, content_hash) UNIQUE to avoid duplicate embeddings; compute content_hash = sha256(normalized_text + selector + url). (General Postgres unique index guidance; LangChain indexing API emphasizes avoiding duplicates and recomputations.)
PostgreSQL
js.langchain.com

No re-embedding unchanged chunks; upsert vectors by stable IDs. (LangChain indexing API guidance.)
js.langchain.com

Regularly ANALYZE; set appropriate lists/probes for IVFFlat (if used). (See pgvector index docs & recent performance guidance.)
GitHub
Amazon Web Services, Inc.

Verdict on our KB path: With the constraints above (UNIQUE content hash, no re-embed unchanged, per-tenant isolation), the KB is standard-compliant, deduped, and efficient. If you find duplicates, enforce the unique index and add a pre-insert hash check in the ingestion pipeline.

## 5) Agent Orchestration (LangGraph + Function Calling)

Why LangGraph: JS/TS native, stateful graphs, streaming, human-in-the-loop—fits our Node stack perfectly.
langchain-ai.github.io

Graph (per session):

ingestUserInput
  → detectLanguage (choose STT/TTS locale by browser language)
  → understandIntent
  → retrieveKB (RAG over pgvector)
  → decide (answer vs tool)
      ↘ tool_call (OpenAI function calling)
        → observe (fold results)
        → decide … (loop)
  → finalize (structured output + citations + UI hints)
  ↘ confirm/humanInTheLoop for side-effects (checkout, bookings)

Function/Tool calling: Register tools from actions.json + platform tools (navigate, filter, addToCart, checkout, book, sendMessage). Use OpenAI JSON-schema tool calling and structured output for final answers.
platform.openai.com

Optimistic navigation: If the first step is clearly a non-destructive navigation (e.g., goto('/flowers?color=red')), execute immediately while continuing to plan asynchronously; stream tokens to TTS for “feels instant”. (Resource hints support helps mask nav latency.)
developer.mozilla.org
web.dev

Streaming: Always stream partial responses; keep voice session alive while DOM changes occur.

Planner alternatives: SK Sequential/Stepwise Planner can inspire multi-step policies, but we stay on LangGraph + function-calling for JS/TS cohesion.
graphql.org

## 6) Voice Subsystem

STT: Browser Web Speech API when available for low-latency; fallback to Whisper server-side for robustness.
Conductor

TTS: Browser speechSynthesis or server-side voices depending on quality/brand need.

UX: Soft “listening” tone, minimalist pulse/equalizer indicator, subtitle-style captions fade in/out; never dump chain-of-thought—show plan traces instead (goal, next action, progress).

## 7) Publishing & Packaging (how the agent ships with every site)

Goal: When a creator clicks Publish, they get (a) their static site bundle, (b) an embedded agent widget (JS snippet + bridge), (c) an isolated per-site agent backend (tenant ID, KB, action registry), and (d) an LLM proxy token for that tenant.

Pipeline:

Build

Validate JSON-LD coverage & ARIA landmarks; write actions.json; emit sitemap.xml; scaffold /graphql types.

Inject voice widget `<script>` (non-blocking; defers load).

Provision

Create tenant record; allocate per-site vector schema / namespace.

Register agent tools from actions.json; store Action Manifest in tenant config.

Crawl trigger

Fire site.published event → queue incremental crawl (seed from sitemap.xml + homepage).

LLM keying and metering

The client obtains a short-lived token from our backend; all LLM calls go to our server-side proxy. Keys never live in the browser. (OpenAI production best practices.)
platform.openai.com

Usage is metered per tenant for billing (e.g., $base + per 1k requests).

Health

Every service exposes /health, /live, /ready; the publish finish step hits these endpoints before surfacing the live URL.

## 8) Folder-by-Folder Implementation Plan (aligned to my latest migration tree)

Branch to base on: replit-agent2 (treat as reference).
Conventions: monorepo; web (Next/Vite) & server (Node/Express) + workers (BullMQ); TypeScript everywhere.

```plaintext
/services
  /_shared
    /config           # zod env schemas; central feature flags
    /db               # Prisma/PG; vector client; migrations
    /queues           # BullMQ factories
    /telemetry        # OpenTelemetry + logger (per tool-call, per crawl step)
    /security         # RBAC, rate limits, tenant auth
    /events           # EventBus + outbox (site.published, product.changed, etc.)

  /api-gateway
    /http/routes      # REST: /api/voice, /api/kb, /api/health
    /http/middleware  # auth(tenant), rate-limit, locale-detect

  /sites
    /app              # site create/update/publish orchestration
    /http             # site CRUD controllers
    /adapters         # PrismaSiteRepo, asset store adapters

  /publishing
    /app/pipeline.ts               # build → package → deploy state machine
    /app/siteContract.ts           # JSON-LD, ARIA audit, actions.json, sitemap.xml, /graphql types
    /adapters/artifactStore.ts     # MinIO/R2 or S3
    /adapters/cdn.ts               # CDN purge, preview links

  /ai
    /ingestion
      /crawler/playwrightAdapter.ts
      /crawler/sitemapReader.ts          # ✅ CONSOLIDATED - now uses canonical ActionManifestGenerator
      /crawler/deltaDetector.ts
      /extractors/contentExtractors.ts  # ✅ ACTUAL - global functions, API endpoints, custom actions
      /transformers/pageAnalyzer.ts     # ✅ ACTUAL - page content analysis
      /transformers/splitter.ts         # ✅ EXISTS - content chunking for embeddings
      /loaders/apiLoader.ts             # ✅ ACTUAL - REST/GraphQL ingestion
      /pipelines/websiteContentIndexer.ts # ✅ ACTUAL - main indexing pipeline

    /retrieval
      /vector-store/pgvectorClient.ts   # ⚠️ EXISTS - needs pgvector migration (currently text storage)
      # /indexes/hnsw.ts /ivfflat.ts    # 🏗️ PLANNED - not yet implemented
      # /rewriter/languageDetection.ts  # 🏗️ PLANNED - not yet implemented
      # /cache/                         # 🏗️ PLANNED - not yet implemented

    /tools
      /navigation.ts  /search.ts  /commerce.ts  /booking.ts  /forms.ts  # ✅ ACTUAL tool implementations
      /index.ts /registry.ts /validators.ts                            # ✅ ACTUAL - Zod JSON-schema validation
      # /custom/dynamicApiTools.ts      # 🏗️ PLANNED - not yet implemented

    /actions
      /manifest/generator.ts            # ✅ CANONICAL - 836 lines, fully implemented, single source of truth
      /dispatcher/widgetEmbedService.ts # ✅ ACTUAL - uses canonical generator for bridge config

    /orchestrator
      /guards/security.ts /guards/privacy.ts     # ✅ ACTUAL - RBAC, tenant isolation, PII protection
      # /graphs/universalAgent.graph.ts           # 🏗️ PLANNED - LangGraph implementation
      # /planners/conversationFlowManager.ts      # 🏗️ PLANNED - conversation state management
      # /executors/functionCalling.ts             # 🏗️ PLANNED - OpenAI tools/structured output
      # /executors/actionExecutor.ts              # 🏗️ PLANNED - action dispatch system
      # /state/sessionMemoryBridge.ts             # 🏗️ PLANNED - session state
      # /api/universalAiAssistantService.ts       # 🏗️ PLANNED - main AI service API

    /voice
      /embed/voiceWidgetEmbedder.ts     # ✅ CONSOLIDATED - now uses canonical ActionManifestGenerator
      # /turnManager.ts                  # 🏗️ PLANNED - conversation turns
      # /visualFeedbackService.ts        # 🏗️ PLANNED - UI feedback
      # /transport/wsServer.ts           # 🏗️ PLANNED - WebSocket transport

  /monitoring
    /healthController.ts   # /health, /live, /ready

  /analytics
    /eventsIngest.ts  /reports.ts
```

Notes

Put all tool registrations in ai/tools/registry.ts and feed them to the graph. Keep the tool set small (≈20) and well-documented; use JSON-schema params. (OpenAI tool-calling guidance.)
platform.openai.com

Retrieval single entry: All vector search via pgvectorClient.ts (avoid split-brain retrieval).

Workers vs web: Crawl/ingest in separate worker dynos; HTTP stays lean.

## 9) Phases & Definition of Done

Phase 1 — ✅ Crawler foundation (already delivered)

Playwright headless crawl with JSON-LD extraction; respectful robots; queue-driven; pgvector schema stub. (Keep.)

Phase 2 — Knowledge Base & Incremental Sync ⚠️ **PARTIAL IMPLEMENTATION**

✅ **Completed**:

- Content extraction pipeline with Playwright crawler
- Chunking and embedding generation
- Basic pgvector integration (text storage)
- Site discovery with capability detection
- Incremental crawling based on content changes

⚠️ **Needs Implementation**:

- Migrate from text storage to proper pgvector embedding columns
- Implement content_hash dedup + (site_id, content_hash) UNIQUE constraints
- Build HNSW index for performance (currently using basic queries)
- Optimize embedding strategy (currently using text-embedding-3-small)

🏗️ **Current Status**: Basic functionality working, performance optimization needed

DoD: No duplicate rows; reindex job shows only deltas; top-k RAG < 50 ms p95 on tenant-scale corpora.

Phase 3 — Standardized Site Output (Builder changes)

Emit JSON-LD, ARIA landmarks, actions.json, sitemap.xml with accurate `<lastmod>`, /graphql introspection.
playwright.dev
+1
developer.mozilla.org
Google for Developers

DoD: “Crawlability score” ≥ 90%; failing sites get dashboard warnings; crawler picks up only changed URLs on republish.

Phase 4 — Agentic Fast Path ⚠️ **FOUNDATION COMPLETE, RUNTIME NEEDED**

✅ **Infrastructure Ready**:

- ActionManifestGenerator provides OpenAI-compatible function schemas
- Security & privacy guards implemented
- Tool registry with Zod validation
- Widget embedding system ready

🏗️ **Implementation Needed**:

- LangGraph agent orchestration graph
- OpenAI function/tool calling integration  
- Optimistic navigation execution
- Streaming response system
- Human-in-the-loop confirmation flows
- Action execution dispatch system

**Current Challenge**: Need to connect manifest generation to actual runtime execution

DoD: First token ≤ 300 ms; first nav ≤ 1 s perceived; all tool-calls logged with traces (LangGraph graph run visible).

Phase 5 — Voice UX & Packaging

Embed voice widget (SSE/WebSocket) and per-tenant agent backend; server-side LLM proxy; usage metering per tenant. (OpenAI best practices re keys.)
platform.openai.com

DoD: Publish → live site includes assistant; /health,/live,/ready return 200; demo flows:

“Create a red bouquet” (e-com)

“List German cars <100k km before 2019 near me” (listings)

“Book Thursday 9–12 haircut” (booking)
all succeed end-to-end.

## 10) Linting, CI, Health

Adopt Flat ESLint config; eliminate errors; warnings < 10; run in CI with --max-warnings 0.

Add GH Action that hits /health post-deploy; fail build on ≠200.

Nightly job: crawl --all-sites --diff-only to prove freshness.

## 11) Answers to my earlier questions (explicit)

Is the vector DB “best-practice”?
With HNSW/IVFFlat indexes, per-tenant isolation, content_hash UNIQUE, no re-embed unchanged chunks, and accurate `<lastmod>` driven refresh—yes. If you see dupe growth, enforce the unique constraint and pre-insert hash check.
GitHub
js.langchain.com
Google for Developers

Duplication risk?
Solved by (site_id, content_hash) UNIQUE and upserts. (General Postgres uniqueness + LangChain Indexing API.)
PostgreSQL
js.langchain.com

Does the agent build its KB well?
Yes—with the Site Contract + incremental crawl (JSON-LD, sitemap `<lastmod>`, GraphQL), it can extract facts and actions reliably and stay fresh.
playwright.dev
+1
Google for Developers

Do SK/LangChain add value if I already have my workflow?
Keep LangGraph/LangChain JS as the core (stateful graphs + tool calling). Treat SK planners as conceptual references for multi-step planning but don’t split stacks.
langchain-ai.github.io
graphql.org

AI services ↔ knowledge-base integration sound?
Yes, provided all retrieval goes through pgvectorClient (single entry), we dedup on hash, and we drive refresh from publish/webhooks + lastmod.

## 12) Developer TODO (pasteable)

Builder: Inject JSON-LD & ARIA; emit actions.json, sitemap.xml with accurate `<lastmod>`; scaffold /graphql.
playwright.dev
+1
developer.mozilla.org
Google for Developers

KB: Implement content hashing + UNIQUE; HNSW index; no re-embedding on unchanged; partial crawls via sitemap diffs.
GitHub
js.langchain.com

Agent: Register tools from Action Manifest; add optimistic nav + streaming; human-in-the-loop for side-effects.
platform.openai.com

Voice: Web Speech API + server Whisper fallback; keep captions minimal and ephemeral.
Conductor

Security: Server-side LLM proxy; short-lived client tokens; metering per tenant; never ship keys to browser.
platform.openai.com

Ops/CI: ESLint clean; add /health//live//ready; deploy checks; nightly diff crawl.

## 13) Example User Journeys (what must work end-to-end)

Flowers: “Make me a bouquet heavy on red under 1200₺.” → agent filters catalog, navigates, highlights candidate, offers variants, adds to cart on confirmation.

Döner: “We’re 4 people, add an et döner set with 1L cola + 1L ayran.” → agent builds a bundle, checks availability, shows total, asks to confirm checkout.

Cars: “List German cars <100k km, pre-2019, near me.” → agent uses site filters + location; paginates; proposes narrowing, then opens relevant listing.

These flows must act, not just answer.

## 14) Why this will hold at scale

The Site Contract makes every site behave like a documented API—zero scraping heuristics.

Incremental crawling + accurate lastmod keep KB fresh at low cost.
Google for Developers

LangGraph gives us deterministic state machines with streaming & HITL hooks; OpenAI tool calling keeps actions typed and safe.
langchain-ai.github.io
platform.openai.com

pgvector is proven in Postgres ecosystems with HNSW/IVFFlat for speed/recall trade-offs.
GitHub

## 15) CURRENT IMPLEMENTATION STATUS (Updated Aug 2025)

### ✅ **PHASE 1 - COMPLETED**: Action Manifest Consolidation

**Problem Solved**: Eliminated 5 duplicate action manifest generators across the codebase

**Achievement**:

- **Single Source of Truth**: `server/src/services/ai/actions/manifest/generator.ts` (836 lines)
- **~600 lines of duplicate code removed** from VoiceWidgetEmbedder, SitemapReader, SiteContractGenerator  
- **Type safety achieved**: No 'any' types, proper TypeScript interfaces throughout
- **Standards compliance**: JSON Schema 2020-12, OpenAPI 3.1 compatible schemas
- **All consumers updated**: Every service now uses the canonical ActionManifestGenerator

### 🏗️ **CURRENT ARCHITECTURE STATUS**

**✅ Ready for Production:**

- Action manifest generation (canonical, comprehensive, validated)
- Site discovery and capability detection
- HTML analysis with Cheerio (forms, buttons, navigation)
- Security/privacy guards and tenant isolation
- Widget configuration and embedding system
- Tool registry with Zod validation

**⚠️ Implementation Needed:**

- LangGraph orchestration (planned architecture ready)
- PostMessage bridge runtime execution  
- OpenAI function calling integration
- Voice UI transport (WebSocket/SSE)
- HNSW vector indexing optimization

### 📋 **NEXT CRITICAL PATH**

1. **Runtime Bridge**: Implement action execution dispatch from widget to site DOM
2. **Agent Orchestration**: Wire ActionManifest to LangGraph + OpenAI function calling  
3. **Voice Transport**: Complete WebSocket/SSE for real-time voice interaction
4. **Performance**: Optimize vector search (pgvector → HNSW), sub-300ms first response
5. **Production**: Deploy with per-tenant LLM proxy and usage metering

---

## Final Word

Build everything so the agent never feels like a bolt-on. Users talk; the site quietly thinks, moves, and does—instantly. The background orchestration must be invisible and fast. If something is obviously the next step, do it now, not after the token stream finishes.

**Current Status**: Foundation is solid. Action manifest generation is bulletproof and consolidated

## ✅ **UPDATED ARCHITECTURE - Aug 2025**

**Implemented Modern Hexagonal Architecture:**

- Monorepo structure with clean separation of concerns
- Hexagonal architecture with Domain/Application/Infrastructure/Adapters layers
- Feature-based modules (AI, Voice, Sites, Publishing, Analytics)
- Comprehensive type system with Zod validation
- Modern Node.js/TypeScript best practices

**Key Architectural Decisions:**

1. **Hexagonal Architecture** over microservices for initial development
2. **Feature-based modules** within hexagonal structure for business logic organization
3. **Drizzle ORM** instead of Prisma for better TypeScript integration and performance
4. **Comprehensive configuration system** with environment validation
5. **Shared utilities and types** package for client-server consistency

Ready to build the runtime execution layer.
