# Goal

A **hexagonal Node/TS modular monolith** where:

* **Domain** is framework-free and owns business rules.
* **Application** coordinates use-cases.
* **Adapters** plug in HTTP, DB, queues, external APIs.
* **Infrastructure** wires config/telemetry/servers.
* HTTP **routes** and **controllers** stay thin; logic lives in use-cases. This separation improves scalability, testability and maintainability in Express apps. ([Medium][1], [Corey Cleary Blog][2], [MDN Web Docs][3])

Hexagonal/Ports & Adapters = domain at the center; ports (interfaces) define what the core needs; adapters implement those ports for the outside world. ([Alistair Cockburn][4], [Medium][5], [Alistair Cockburn][6])

---

## Target tree for `server/src`

```plaintext
src/
  domain/                     # pure business: entities, value-objects, domain events
    entities/
    value-objects/
    services/                 # domain services (pure functions where possible)
    ports/                    # interfaces: Repositories, ExternalServices, Queues
    errors/

  app/                        # use-cases (application layer)
    usecases/                 # e.g., PublishSite, IndexDelta, PlaceOrder
    dto/                      # input/output DTOs (zod schemas -> JSON Schema)
    mappers/                  # map adapters <-> DTOs
    policies/                 # cross-use-case rules (rate/budget/guard)
    transactions/             # unit-of-work boundaries

  adapters/                   # concrete implementations of ports
    http/
      routes/                 # Express routers per bounded context
      controllers/            # thin controllers -> call app.usecases
      middleware/             # auth(tenant), rate-limit, locale-detect
      openapi/                # OAS 3.1; schemas from zod/json-schema
    db/
      prisma/|drizzle/        # ORM + repository impls of domain ports
      migrations/
    cache/
      redis/                  # session/kv implementations
    messaging/
      bullmq/                 # queues, schedulers
    external/
      openai/stripe/...       # 3rd-party gateways implementing ports
    storage/
      s3-r2-minio/            # artifact store, signed URLs

  infrastructure/
    config/                   # env loader (zod), 12-Factor settings
    telemetry/                # pino logger, OpenTelemetry exporters
    http-server/              # Express bootstrap, health wiring
    scheduler/                # cron/queue starters
    security/                 # RBAC, rate limits, OWASP hardening

  bootstrap/
    index.ts                  # process start: load config, DI container, start HTTP/queues

  shared/                     # cross-cutting libs (types, util that are framework-free)
    types/
    utils/

  scripts/                    # one-off CLIs, maintenance
```

### How your current folders map

* `routes/` → `adapters/http/routes/` (keep per-context routers)
* `controllers/` → `adapters/http/controllers/` (thin; call use-cases)
* `middleware/` → `adapters/http/middleware/`
* `db/` → `adapters/db/` (repositories live here; **domain** defines repo ports)
* `gateway/` → `adapters/external/` (OpenAI, payment, mail, etc.)
* `jobs/` → `adapters/messaging/` + `infrastructure/scheduler/`
* `services/` (you already re-organized) → **split**: pure business → `domain/services`; orchestration/IO → `app/usecases`
* `config/` → `infrastructure/config/`
* `shared/`, `types/`, `utils/` → keep in `shared/` (framework-free helpers)
* `models/` → **rename**: if ORM models → `adapters/db/prisma/*`; domain entities live in `domain/entities/`

---

## Layer contracts & rules

## 1) Domain (`src/domain`)

**Owns:** entities, invariants, domain services, *ports* (interfaces for persistence/external needs).
**Does not import:** adapters, Express, ORM, HTTP types.
**Why:** Ports separate business rules from tech choices; you can swap adapters without touching the core. ([Alistair Cockburn][4])

## **Example ports**

```ts
// domain/ports/SiteRepository.ts
export interface SiteRepository {
  findById(id: SiteId): Promise<Site | null>;
  save(site: Site): Promise<void>;
}
```

## 2) Application (`src/app`)

**Owns:** use-cases orchestrating domain + ports, DTO validation, transactions, policies, idempotency.
**Input/Output:** DTOs validated with Zod → export **JSON Schema** to drive OpenAPI 3.1 (OAS 3.1 is aligned to JSON Schema 2020-12). ([Swagger][7], [OpenAPI Initiative Publications][8], [JSON Schema][9])
**No direct** Express/ORM calls; everything via ports.

**Why:** clear separation between request handling and business orchestration; easier tests. ([Medium][1])

## 3) Adapters (`src/adapters`)

**HTTP:** Express routes/controllers, request→DTO mapping, OpenAPI 3.1 spec generation; keep handlers thin. ([MDN Web Docs][3])
**DB:** Prisma/Drizzle repositories implementing domain ports.
**External:** OpenAI/Stripe gateways implementing ports.
**Messaging/Queues:** BullMQ implementations of queue ports.
**Storage/Cache:** S3/Redis adapters.

**Rule:** Adapters depend *inwards* (on domain/app), never the reverse. That is the core Ports & Adapters rule. ([Alistair Cockburn][4])

## 4) Infrastructure (`src/infrastructure`)

* **Config:** All config comes from environment/secret stores per 12-Factor (env-injected; no config committed). ([12factor.net][10])
* **Telemetry:** Pino + OpenTelemetry—shared logger and traces.
* **HTTP server:** Express app wiring, health routes.
* **Scheduler:** starts queue workers/cron.

---

## HTTP: routes, controllers, OpenAPI

* **Routes** only define URL → controller function; controllers validate/map → call **use-case**; never contain business logic. This improves testability and scale in Express apps. ([Medium][1], [MDN Web Docs][3])
* **OpenAPI 3.1**: Generate from DTO JSON Schemas; OAS 3.1 is explicitly compatible with JSON Schema 2020-12—use one schema source for validation and docs. ([Swagger][7], [OpenAPI Initiative Publications][8], [openapis.org][11])

## **Route module example**

```plaintext
adapters/http/routes/
  voice.routes.ts         # /api/voice/*
  kb.routes.ts            # /api/kb/*
  health.routes.ts        # /health /live /ready
  sites.routes.ts         # /api/sites/*
```

---

## Config & secrets

* Use `infrastructure/config` to load and validate env (zod). Inject into adapters via DI container.
* Keep secrets outside the repo; in k8s, mount with ConfigMaps/Secrets exposed as env—classic 12-Factor interpretation. ([12factor.net][10], [Stack Overflow][12], [redhat.com][13])

---

## DB & repositories

* **Domain** defines `*Repository` ports; **adapters/db** implement them with Prisma/Drizzle.
* Keep ORM models in adapter layer; domain `entities` stay ORM-agnostic.
* Transactions handled in `app/transactions` (unit-of-work).

---

## External gateways

* Each third-party service gets a **port** in `domain/ports` (e.g., `EmbeddingsPort`, `PaymentsPort`) and an **adapter** in `adapters/external/*`.
* This avoids bleeding 3rd-party types into your core.

---

## Jobs & schedulers

* Queue interface (port) in `domain/ports` (e.g., `IndexingQueue`).
* BullMQ implementation in `adapters/messaging`.
* Startup wiring in `infrastructure/scheduler`.

---

## Express middleware

* `adapters/http/middleware`: `tenantAuth`, `rateLimit`, `localeDetect`, `errorHandler`.
* Keep middleware pure and composable; avoid business logic.

---

## Bootstrap & composition

* `bootstrap/index.ts` creates the DI container, registers adapters for each port, constructs use-cases, then starts HTTP/queues.
* Keep this as the **only** place that knows all implementations.

---

## Migration checklist (from your current tree)

1. **Create folders** above without moving code yet.
2. For one bounded context (e.g., **Sites**):

   * Extract domain `entities/ports`.
   * Move orchestration to `app/usecases/PublishSite.ts`.
   * Convert existing DB/gateway code into `adapters/db/*` and `adapters/external/*`.
   * Thin the route/controller to a mapper + use-case call.
3. Repeat for **AI/Kb**, **Voice**, **Publishing**, **Analytics**.
4. Introduce **OpenAPI 3.1** build (DTOs → JSON Schema) and serve `/api-docs`. OAS 3.1 natively uses JSON Schema 2020-12, so no dual schema maintenance. ([Swagger][7], [OpenAPI Initiative Publications][8])
5. Centralize config in `infrastructure/config` per 12-Factor. ([12factor.net][10])

---

## Success criteria (Definition of Done)

* **Imports flow inward only** (adapters→app→domain). No domain file imports Express/Prisma. That’s the Ports & Adapters contract. ([Alistair Cockburn][4])
* **Routes/controllers** have ≤ \~50 lines each; all business logic in use-cases. ([Medium][1])
* **OpenAPI 3.1** served at `/api-docs`; schemas generated from the same JSON Schemas used at runtime. ([Swagger][7], [OpenAPI Initiative Publications][8])
* **Config** sourced from env; no secrets in repo; follows 12-Factor. ([12factor.net][10])
* Each domain has **ports** and **adapters**; swapping an adapter (e.g., S3→R2) requires **no domain/app changes**.

---

## Why this works

* Hexagonal keeps the **core stable** while tech evolves; you can add adapters over time (new DB, new API) without touching business rules. ([Alistair Cockburn][4], [Alistair Cockburn][6])
* Express stays clean: routes/controllers thin, logic in use-cases, which is the recommended modular pattern for growing apps. ([MDN Web Docs][3], [Medium][1])
* OAS 3.1 + JSON Schema aligns validation and documentation into **one schema source of truth**, eliminating drift. ([Swagger][7], [OpenAPI Initiative Publications][8])
* 12-Factor config decouples code from environment, easing deploys and secrets management. ([12factor.net][10])

If you want, I can turn this into a **migration PR plan** that lists exact file moves for your `routes/*.ts` (e.g., `routes/health.routes.ts` → `adapters/http/routes/health.ts`, controllers added, use-cases created) and a minimal DI container so you can refactor incrementally without breaking runtime.

[1]: https://medium.com/%40finnkumar6/mastering-express-js-controllers-the-key-to-clean-and-scalable-applications-45e35f206d0b?utm_source=chatgpt.com "Mastering Express.js Controllers: The Key to Clean and ..."
[2]: https://www.coreycleary.me/why-should-you-separate-controllers-from-services-in-node-rest-apis?utm_source=chatgpt.com "Why should you separate Controllers from Services in ..."
[3]: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/Express_Nodejs/routes?utm_source=chatgpt.com "Express Tutorial Part 4: Routes and controllers - MDN"
[4]: https://alistair.cockburn.us/hexagonal-architecture?utm_source=chatgpt.com "hexagonal-architecture - Alistair Cockburn"
[5]: https://medium.com/%40yecaicedo/structuring-a-node-js-project-with-hexagonal-architecture-7be2ef1364e2?utm_source=chatgpt.com "Structuring a Node.js Project with Hexagonal Architecture"
[6]: https://alistaircockburn.com/hexarch%20v1.1b%20DIFFS%2020250420-1012%20paper%2Bepub.docx.pdf?utm_source=chatgpt.com "Hexagonal Architecture Explained"
[7]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[8]: https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com "OpenAPI Specification v3.1.0"
[9]: https://json-schema.org/blog/posts/validating-openapi-and-json-schema?utm_source=chatgpt.com "Validating OpenAPI and JSON Schema"
[10]: https://12factor.net/config?utm_source=chatgpt.com "Store config in the environment"
[11]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[12]: https://stackoverflow.com/questions/46309522/where-to-store-config-parameters?utm_source=chatgpt.com "Where to store config parameters? - 12factor"
[13]: https://www.redhat.com/en/blog/12-factor-app?utm_source=chatgpt.com "An illustrated guide to 12 Factor Apps"
