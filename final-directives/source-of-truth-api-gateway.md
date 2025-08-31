# `/services/api-gateway` — Source of Truth

**Purpose**
Expose a small, stable HTTP surface for all first-party clients (builder UI, voice widget, workers) with **typed contracts**, **observability**, and **strict tenancy**. The gateway does three things:

1. Terminate HTTP(S), authenticate/authorize the caller, and enforce **rate limits**. ([owasp.org][1])
2. Route to **voice** and **knowledge-base** capabilities with low-latency streaming.
3. Publish **health probes** for liveness/readiness aligned to Kubernetes. ([Kubernetes][2])

## **Subfolders**

```plaintext
/http
  /routes       # REST: /api/voice, /api/kb, /api/health (+ versioned under /api/v1)
  /middleware   # auth(tenant), rate-limit, locale-detect, cors, request-id, error
```

---

## 1) API Surface & Versioning

### Base path & versioning

* All endpoints live under **`/api/v1`**. Future breaking changes become `/api/v2`. (Keep URLs stable; versioning is explicit and documented in OpenAPI.) ([Microsoft Learn][3], [microsoft.github.io][4])
* Provide an **OpenAPI 3.1** spec (`openapi.yaml`) generated from source types (for DX and SDKs). OpenAPI 3.1 aligns with JSON Schema 2020-12; validate in CI. ([swagger.io][5], [openapis.org][6], [json-schema.org][7])

### Error model

* Use **RFC 9457 Problem Details** for all non-2xx responses. Include `type`, `title`, `status`, `detail`, `instance`, and `extensions` (like `correlationId`, `tenantId`). ([rfc-editor.org][8], [datatracker.ietf.org][9])

---

## 2) `/http/routes` — Endpoint Contracts

> All responses include `x-correlation-id`. Errors follow RFC 9457. Rate-limited responses return **429** with `Retry-After` and (if enabled) `RateLimit-*` headers. ([datatracker.ietf.org][10], [developer.mozilla.org][11])

### 2.1 `/api/health`

* `GET /api/health` → shallow dependency check (always cheap).
* `GET /api/health/live` → **liveness** probe: returns 200 if the process is alive; **never** depend on external systems. ([Kubernetes][2])
* `GET /api/health/ready` → **readiness** probe: verifies critical deps (Redis, Postgres, outbound to LLM proxy) are reachable and pool thresholds are healthy. ([Kubernetes][12])
* **SLO**: all three < 10 ms p95, no allocation spikes.

### 2.2 `/api/kb` (Knowledge Base)

* `POST /api/v1/kb/search`

  * Body: `{ query: string, topK?: number, filters?: {...}, langHint?: string }`
  * Returns: `{ matches: [{id, url, snippet, score, meta}], usedLanguage: string }`
  * Notes: `Accept-Language` is passed to retrieval as a hint for rewriter/ranker. ([rfc-editor.org][13])
* `POST /api/v1/kb/reindex` (privileged; internal & site owners)

  * Body: `{ mode: 'delta'|'full' }` → schedules crawl job; **idempotent**.
* `GET /api/v1/kb/status`

  * Returns last crawl time, last `sitemap.lastmod` observed, chunk counts, and index type (HNSW/IVFFlat).

**429 behavior**: respond with **429** + `Retry-After` seconds; optionally include draft **RateLimit** headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` or `RateLimit-Policy`) to help clients back off. ([developer.mozilla.org][14], [datatracker.ietf.org][10])

### 2.3 `/api/voice`

* `POST /api/v1/voice/session`

  * Creates a short-lived **voice session** (JWT or opaque id bound to tenant + site).
  * Returns `{ sessionId, ttsLocale, sttLocale, expiresIn }`.
* **Streaming channel**

  * `GET /api/v1/voice/stream` (SSE) or `WS /api/v1/voice/stream` (WebSocket).
  * Accepts audio/text turns; emits partial tokens and **action traces**; tolerant to client retries (resume via `Last-Event-ID` for SSE).
* **Internationalization**

  * Default locales derive from **`Accept-Language`** with RFC 5646 language tags; clients can override via `x-user-locale` query/header. ([rfc-editor.org][13])

---

## 3) `/http/middleware` — Cross-Cutting Policies

> Order matters (from top to bottom):

1. **request-id**

   * Generate a UUID if missing; propagate to logs/traces as `x-correlation-id`.

2. **locale-detect**

   * Parse `Accept-Language` per **RFC 9110 §12.5.4** to set `req.locale` (`en-US` fallback). Expose on `res.locals`. ([rfc-editor.org][13])

3. **auth (tenant & user)**

   * Expect **`Authorization: Bearer <token>`**; verify per **RFC 6750**. Support service tokens (machine-to-machine) and end-user tokens; both must carry `tenantId`. Reject missing/invalid with 401 (Problem Details). ([datatracker.ietf.org][15])
   * For browser flows, also accept a short-lived session cookie (HttpOnly, Secure) that maps to the same claims server-side.

4. **rbac / tenancy guard**

   * Enforce least-privilege on every route: `role ∈ {owner, editor, widget}` and `req.tenantId === token.tenantId`. (Maps to `_shared/security`.)

5. **rate-limit**

   * Sliding-window or token-bucket per **tenant** and **IP**; return **429** with `Retry-After`. Consider publishing draft **RateLimit** headers so clients can self-throttle. OWASP API Top-10 (2023) calls out **Unrestricted Resource Consumption**—this middleware is mandatory. ([owasp.org][16], [salt.security][17])
   * Backoff guidance: clients should honor `Retry-After`; some Microsoft APIs document this pattern for 429s. ([Microsoft Learn][18])

6. **input validation**

   * Zod-based validation for params/body/query; fail fast with RFC 9457 payloads. ([datatracker.ietf.org][9])

7. **cors**

   * Allow the **voice widget** origin + admin UI; deny `*` for `Authorization`ed routes.

8. **compression & caching**

   * Gzip/Brotli for JSON; set cache headers per **RFC 9111** (most endpoints are `Cache-Control: no-store` except public health). ([IETF HTTP Working Group][19])

9. **otel tracing**

   * Start a span; tag `tenant.id`, `route`, `user.id?`; hand off to workers via trace context.

10. **error handler**

* Normalize all thrown errors into **Problem Details**; never leak stack traces to clients. ([rfc-editor.org][8])

---

## 4) Headers, Status Codes & Retries

* **Auth**: `Authorization: Bearer <token>` per **RFC 6750**. Always over TLS. ([datatracker.ietf.org][15])
* **Language**: `Accept-Language: tr-TR, en;q=0.8` parsed per **RFC 9110**. ([rfc-editor.org][13])
* **429**: Use 429 for throttling; include `Retry-After` seconds/date. (Defined in RFC 6585; MDN clarifies semantics.) ([datatracker.ietf.org][10], [developer.mozilla.org][14])
* **RateLimit** (optional but recommended): publish **RateLimit** headers per current IETF draft to document quotas. ([datatracker.ietf.org][20])

---

## 5) Observability & Health

* Every request has a trace; `/voice/stream` spans include **planning**, **tool-call**, and **emit** subspans.
* **Probes**:

  * `/api/health/live` → container is alive (no external deps).
  * `/api/health/ready` → DB/Redis/LLM proxy reachable; pool within thresholds. (Matches K8s liveness/readiness guidance.) ([Kubernetes][2])

---

## 6) Security Checklist (gateway level)

* Enforce **Bearer** on protected routes; reject mixed-origin cookies without CSRF tokens if ever used on state-changing endpoints. ([datatracker.ietf.org][15])
* Strict **rate limits** (per tenant/IP) to mitigate API4:2023. ([owasp.org][16])
* Validate `content-type` and size; reject oversized bodies early (413).
* Sanitize errors via RFC 9457; never leak stack traces. ([rfc-editor.org][8])

---

## 7) Success Criteria (DoD)

* **OpenAPI 3.1** published; `pnpm test:contract` passes; examples round-trip. ([swagger.io][5])
* **Latency**: `/voice/stream` first event ≤ **300 ms**; `/kb/search` p95 ≤ **50 ms** after cache warm.
* **Security**: 100% routes behind auth (except health); OWASP API Top-10 checks green for **API4:2023** (rate limits), **API2:2023** (auth). ([owasp.org][16])
* **Probes**: K8s liveness/readiness wired and green under rolling restarts. ([Kubernetes][12])

---

## 8) Implementation Hints

* **Problem Details** helper to map Zod errors → `application/problem+json`. ([datatracker.ietf.org][9])
* Adopt **Retry-After** semantics consistently (429/503). ([rfc-editor.org][13], [developer.mozilla.org][14])
* Emit draft **RateLimit** headers to improve client behavior under load. ([datatracker.ietf.org][20])
* Respect **Accept-Language** for both NLU and TTS defaults (fallback to `en-US`). ([rfc-editor.org][13])

---

If you want, I can now do the same “source-of-truth” spec for the next subtree (e.g., `/publishing/app` or `/ai/ingestion`).

[1]: https://owasp.org/API-Security/editions/2023/en/0x11-t10/?utm_source=chatgpt.com "OWASP Top 10 API Security Risks – 2023"
[2]: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/?utm_source=chatgpt.com "Liveness, Readiness, and Startup Probes"
[3]: https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design?utm_source=chatgpt.com "Web API Design Best Practices - Azure Architecture Center"
[4]: https://microsoft.github.io/code-with-engineering-playbook/design/design-patterns/rest-api-design-guidance/?utm_source=chatgpt.com "REST API Design Guidance - Microsoft Open Source"
[5]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[6]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[7]: https://json-schema.org/blog/posts/validating-openapi-and-json-schema?utm_source=chatgpt.com "Validating OpenAPI and JSON Schema"
[8]: https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com "RFC 9457: Problem Details for HTTP APIs"
[9]: https://datatracker.ietf.org/doc/html/rfc9457?utm_source=chatgpt.com "RFC 9457 - Problem Details for HTTP APIs"
[10]: https://datatracker.ietf.org/doc/html/rfc6585?utm_source=chatgpt.com "RFC 6585 - Additional HTTP Status Codes"
[11]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After?utm_source=chatgpt.com "Retry-After header - MDN - Mozilla"
[12]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/?utm_source=chatgpt.com "Configure Liveness, Readiness and Startup Probes"
[13]: https://www.rfc-editor.org/rfc/rfc9110.html?utm_source=chatgpt.com "RFC 9110: HTTP Semantics"
[14]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429?utm_source=chatgpt.com "429 Too Many Requests - MDN - Mozilla"
[15]: https://datatracker.ietf.org/doc/html/rfc6750?utm_source=chatgpt.com "RFC 6750 - The OAuth 2.0 Authorization Framework"
[16]: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/?utm_source=chatgpt.com "API4:2023 Unrestricted Resource Consumption"
[17]: https://salt.security/blog/owasp-api-security-top-10-explained?utm_source=chatgpt.com "OWASP API Security Top 10 2023 Explained"
[18]: https://learn.microsoft.com/en-us/graph/best-practices-concept?utm_source=chatgpt.com "Best practices for working with Microsoft Graph"
[19]: https://httpwg.org/specs/rfc9111.html?utm_source=chatgpt.com "RFC 9111 - HTTP Caching"
[20]: https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers?utm_source=chatgpt.com "draft-ietf-httpapi-ratelimit-headers-09"
