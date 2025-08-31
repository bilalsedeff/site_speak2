# `/services/_shared` — Source of Truth

## **Purpose**

This package centralizes *cross-cutting* concerns for every service/process: configuration, database access, background queues, telemetry, security primitives, and eventing. It must be framework-agnostic, strictly typed, and follow 12-Factor and OWASP guidance.

## **Subfolders**

```plaintext
/config     # typed env & feature flags
/db         # Prisma/PG + pgvector clients & migrations helpers
/queues     # BullMQ factories & queue conventions
/telemetry  # OpenTelemetry (traces, metrics), logger
/security   # RBAC, authN/Z helpers, rate limits, tenancy guards
/events     # EventBus abstraction, transactional outbox, outbox consumers
```

---

## 1) `/config` — Typed configuration & feature flags

### Responsibilities

* **Single source of truth** for runtime configuration (env → typed object). Reject boot if invalid.
* Secrets come from env/secret store; **no** repo-checked config. (12-Factor “Config in the environment”.) ([12factor.net][1], [12factor.net][2], [Stack Overflow][3])
* Feature flags: boolean/tiered flags resolved here and exposed as a tiny read-only API.

### Required Artifacts

* `index.ts` — loads env, applies schema, exports `cfg`.
* `schema.ts` — **Zod** schema(s) with safe defaults; `parseStrict` on boot. ([Zod][4], [odocs-zod.vercel.app][5])
* `flags.ts` — flag registry with typed getters, optional remote overrides hook.

### Contracts

* `cfg` is immutable (freeze).
* All services import **only** from `_shared/config` (no `process.env.*` in app code).

### Success Criteria

* Boot fails fast on invalid/missing required envs.
* 100% coverage for schema parsing branches.
* No `process.env` reads outside this module (lint rule can enforce).

### Notes / Best-Practice

* Keep environments “12-Factor clean”: dev uses `.env` locally, prod uses env/secret store; do not persist config files. ([12factor.net][1])

---

## 2) `/db` — Postgres/Prisma + pgvector

### Responsibilities of db Service

* Provide **one** Prisma Client factory per process with sane pooling.
* Provide a **pgvector** helper for embeddings & vector search (create/search indexes, migrations).
* Expose **transaction helpers** (with/without outbox write).

### Required Artifacts of db Service

* `prismaClient.ts` — singleton Prisma client; `$connect()` on first use; graceful `$disconnect()` on shutdown. (Prisma manages its own pool.) ([Prisma][6])
* `pooling.md` — short note on connection limits & when to consider PgBouncer/Accelerate. ([Prisma][7], [Fly.io][8])
* `vector/pgvectorClient.ts` — typed helpers: insert/upsert by **content\_hash**, ANN queries, index mgmt. Prefer **HNSW** for low-latency voice flows; document memory/build trade-offs vs IVFFlat. ([GitHub][9], [Crunchy Data][10], [tembo.io][11])
* `migrations/` — DB migrations (includes outbox table DDL, vector index DDL).

### Contracts of db Service

* **Dedup invariant**: `(tenant_id, content_hash)` is **UNIQUE** for embeddings to prevent duplicates; upserts by stable IDs only.
* Index options are encoded in migrations (e.g., `USING hnsw (embedding vector_cosine_ops)`), with comments on recall/latency trade-offs. ([GitHub][9])

### Success Criteria of db Service

* Pool doesn’t exhaust under load; p95 query latency SLOs documented.
* Vector search p95 < 50 ms on representative corpus; reindex jobs idempotent.
* Embedding writes never duplicate rows for unchanged content (UNIQUE holds).

---

## 3) `/queues` — BullMQ factories & conventions

### Responsibilities of queues Service

* Create **factory functions** for Queue/Worker/Scheduler (BullMQ) pre-configured with Redis, backoff, DLQ, metrics hooks.
* Define **naming, payload schema, retry policy, idempotency** conventions for all jobs. (Every job payload validated with Zod.)

### Required Artifacts of queues Service

* `factory.ts` — `makeQueue(name, opts)`, `makeWorker(name, handler, opts)`, `makeScheduler(opts)` with sensible defaults.
* `conventions.ts` — job naming (`domain:action`), idempotency keys, retry/backoff table, rate-limit knobs.
* `observability.ts` — hooks that emit spans/metrics per job.

**Reference**: BullMQ official docs (Queue/Worker features, delays, retries, rate-limits). ([docs.bullmq.io][12])

### Contracts of queues Service

* Every job type exports `zod` payload schema.
* Handlers are **idempotent**; retries never create duplicate side effects.
* Global per-queue rate limits configurable to mitigate abuse. (Rate limiting is an OWASP-recognized control.) ([owasp.org][13], [cheatsheetseries.owasp.org][14])

### Success Criteria of queues Service

* No unhandled rejections in workers; failed jobs land in DLQ with reason + traceId.
* Queue dashboards show retries/backoffs; no hot-looping jobs.

---

## 4) `/telemetry` — OpenTelemetry + logger

### Responsibilities of telemetry Service

* Initialize **OpenTelemetry** for Node: traces (HTTP, DB, Redis, BullMQ), metrics (process, queue depth, DB), and structured logs with trace correlation.
* Exporters: OTLP gRPC/HTTP to collector; sampling policy default 1–5% (raise on incidents).

### Required Artifacts of telemetry Service

* `otel.ts` — SDK bootstrap, Resource (service.name, service.version), auto-instrumentation for HTTP/Express, PG/Prisma, Redis, BullMQ. ([OpenTelemetry][15])
* `logger.ts` — Pino/Winston wrapper that injects `traceId`, `spanId`.
* `metrics.ts` — common meters: request duration, queue depth & processing time, DB latency, cache hit ratio.

### Contracts of telemetry Service

* **Every request** gets a trace; tool-calls/crawl steps are spans with attributes: `tenant.id`, `site.id`, `action.name`, `kb.chunk_id`, `queue.job_id`.
* Health endpoints exclude heavy instrumentation.

### Success Criteria of telemetry Service

* Traces visible end-to-end (HTTP → queue → worker → DB).
* Golden signals dashboards: latency, errors, saturation, traffic are live.

---

## 5) `/security` — AuthN/Z, rate limiting, tenancy guards

### Responsibilities of security Service

* Provide **RBAC** primitives, tenant isolation checks, secure JWT utilities (sign/verify/rotate), CSRF helpers for state-changing web forms, and **rate-limit** middleware.
* Input validation helpers (Zod) and centralized error normalization.

### Required Artifacts of security Service

* `auth.ts` — JWT with short-lived access tokens + rotation helpers; per-tenant claims.
* `rbac.ts` — role → permission map; decorators/helpers for handlers.
* `tenancy.ts` — extract and verify `tenantId` on every request/job/trace.
* `ratelimit.ts` — token bucket/sliding window adapters (per IP + per tenant + per user).
* `headers.ts` — standard security headers (HSTS, CSP hints for widget/agent domains).

### Contracts of security Service

* **ASVS alignment**: implement verification items for auth, session mgmt, input validation, and rate limiting (map checklist to code). ([owasp.org][16])
* Rate limits enforced at app level complement infra limits; lack of limits is a known API risk. ([owasp.org][13])

### Success Criteria of security Service

* AuthZ tests prove least-privilege role matrices.
* Fuzzed inputs never crash handlers; validation errors are sanitized.
* Abuse tests trip rate-limits with 429 and emit telemetry.

---

## 6) `/events` — EventBus, transactional outbox, consumers

### Responsibilities of events Service

* Give the platform a **reliable event pipeline** without dual-writes: write business data + **outbox** in one DB transaction; a relay publishes to the message bus; consumers handle idempotently.
* Provide a lightweight in-process EventBus for local pub/sub (non-durable) and a durable bus (Redis/Kafka) via the outbox.

### Required Artifacts of events Service

* `eventBus.ts` — simple interface (`publish`, `subscribe`) for in-proc listeners.
* `outbox.ts` — helpers to append outbox records **inside** app transactions; polling or CDC-based relayer.
* `outbox.schema.sql` — append-only table: `id, tenant_id, aggregate, type, payload(jsonb), created_at, published_at, attempts`.
* `relay/` — **polling** relay (MVP) with exponential backoff; plug-point for **Debezium CDC** later.

**Why Outbox**
The **transactional outbox** pattern lets a service atomically persist state and record an event, then a relay (polling or CDC) publishes reliably; it avoids distributed 2PC and dual-write races. Debezium’s Outbox Event Router is a battle-tested CDC option. ([Debezium][17], [ChairNerd][18])
(Use judiciously—don’t overuse outbox where simpler integration suffices.) ([SQUER][19])

### Contracts of events Service

* Writes that should trigger events **must** call `withOutbox(tx, () => …)` helpers.
* Consumers are **idempotent** and store processed offsets/ids.
* Publishing guarantees: *at-least-once* delivery; handlers must tolerate duplicates.

### Success Criteria of events Service

* No lost events under crash/restart.
* Outbox stays append-only; `published_at` set exactly once by relay.
* Chaos tests (kill relay, kill workers) show eventual delivery after restart.

---

## Cross-module Non-Functionals

* **Typing**: All public APIs in `_shared` are fully typed; Zod used at boundaries. ([Zod][4])
* **Docs**: Each submodule has a `README.md` with usage snippets.
* **Health**: `_shared/telemetry` exports a simple probe helper so all services expose `/health`, `/live`, `/ready`.
* **Testing**: Unit tests for parsing/validation; integration tests that spin ephemeral Postgres/Redis for `/db`, `/queues`, `/events`.

---

## Quick Start (for agents)

1. Implement `/config` first; block boot on invalid env. (12-Factor). ([12factor.net][1])
2. Wire `/telemetry` early so all subsequent work emits spans/metrics. ([OpenTelemetry][15])
3. Land `/db` with pooling defaults and `pgvectorClient` + HNSW helpers. ([GitHub][9])
4. Add `/queues` factories; make a “hello-job” with Zod schema & retries. ([docs.bullmq.io][12])
5. Add `/events` with polling outbox; document the Debezium CDC upgrade path. ([Debezium][20])
6. Finish `/security` (RBAC, tenancy guards, rate limits) and turn on ASVS checklist tracking. ([owasp.org][16])

---

### Reference Links (used in this spec)

* 12-Factor Config & Principles. ([12factor.net][1], [12factor.net][2])
* Zod (TypeScript-first schema validation). ([Zod][4], [GitHub][21])
* Prisma connection pooling (and Accelerate/PgBouncer context). ([Prisma][6], [Fly.io][8])
* pgvector HNSW vs IVFFlat, trade-offs & DDL. ([Crunchy Data][10], [GitHub][9], [tembo.io][11])
* BullMQ core docs (queues/workers). ([docs.bullmq.io][12])
* OpenTelemetry for Node.js & instrumentation. ([OpenTelemetry][15])
* OWASP ASVS & rate-limiting guidance. ([owasp.org][16], [cheatsheetseries.owasp.org][14])
* Outbox pattern, Debezium Outbox Event Router, and cautions. ([Debezium][17], [ChairNerd][18], [SQUER][19])

---

If you want, I can now do the same for the next subtree (e.g., `/services/ai/ingestion` or `/publishing/app`).

[1]: https://12factor.net/config?utm_source=chatgpt.com "Store config in the environment"
[2]: https://www.12factor.net/?utm_source=chatgpt.com "The Twelve-Factor App"
[3]: https://stackoverflow.com/questions/53708864/whats-the-process-of-storing-the-configuration-for-a-12-factor-application?utm_source=chatgpt.com "What's the process of storing the configuration for a 12- ..."
[4]: https://zod.dev/?utm_source=chatgpt.com "Zod: Intro"
[5]: https://odocs-zod.vercel.app/?utm_source=chatgpt.com "Zod | Documentation"
[6]: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool?utm_source=chatgpt.com "Connection pool | Prisma Documentation"
[7]: https://www.prisma.io/dataguide/database-tools/connection-pooling?utm_source=chatgpt.com "What is connection pooling in database management? - Prisma"
[8]: https://community.fly.io/t/how-to-setup-and-use-pgbouncer-with-fly-postgres/3035?utm_source=chatgpt.com "How to setup and use PGBouncer with Fly Postgres"
[9]: https://github.com/pgvector/pgvector?utm_source=chatgpt.com "pgvector/pgvector: Open-source vector similarity search for ..."
[10]: https://www.crunchydata.com/blog/hnsw-indexes-with-postgres-and-pgvector?utm_source=chatgpt.com "HNSW Indexes with Postgres and pgvector"
[11]: https://tembo.io/blog/vector-indexes-in-pgvector?utm_source=chatgpt.com "Vector Indexes in Postgres using pgvector: IVFFlat vs HNSW"
[12]: https://docs.bullmq.io/?utm_source=chatgpt.com "What is BullMQ | BullMQ"
[13]: https://owasp.org/API-Security/editions/2019/en/0xa4-lack-of-resources-and-rate-limiting/?utm_source=chatgpt.com "API4:2019 Lack of Resources & Rate Limiting"
[14]: https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html?utm_source=chatgpt.com "Denial of Service - OWASP Cheat Sheet Series"
[15]: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/?utm_source=chatgpt.com "Node.js"
[16]: https://owasp.org/www-project-application-security-verification-standard/?utm_source=chatgpt.com "OWASP Application Security Verification Standard (ASVS)"
[17]: https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/?utm_source=chatgpt.com "Reliable Microservices Data Exchange With the Outbox ..."
[18]: https://chairnerd.seatgeek.com/transactional-outbox-pattern/?utm_source=chatgpt.com "The Transactional Outbox Pattern: Transforming Real-Time ..."
[19]: https://www.squer.io/blog/stop-overusing-the-outbox-pattern?utm_source=chatgpt.com "Stop overusing the outbox pattern | Blog"
[20]: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html?utm_source=chatgpt.com "Outbox Event Router"
[21]: https://github.com/colinhacks/zod?utm_source=chatgpt.com "colinhacks/zod: TypeScript-first schema validation with ..."
