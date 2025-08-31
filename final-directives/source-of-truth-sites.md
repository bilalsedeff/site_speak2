# Source of Truth — `/services/sites`

## Scope

The `/sites` domain owns **site lifecycle** (create → edit → publish → connect domain), **site contract emission** (JSON-LD, sitemap, `actions.json`, optional `/graphql`), and **handoffs** to AI/KG (crawl/index webhooks) and hosting/CDN.

It is split into:

```plaintext
/sites
  /app        # site create/update/publish orchestration (state machine + domain services)
  /http       # REST controllers (OpenAPI 3.1), RFC 9457 errors, ETag/Link headers
  /adapters   # Prisma repos, asset store (R2/S3), DNS/ACME, CDN, artifact store
```

Design tenets you must uphold here:

* **Idempotent & observable orchestration** (saga-ish publish flows, explicit state). ([temporal.io][1])
* **Standards-first HTTP**: OpenAPI 3.1; Problem Details (RFC 9457) errors; ETag/If-Match for optimistic concurrency; Link header pagination; Cache-Control consistent with RFC 9111. ([OpenAPI Initiative Publications][2], [rfc-editor.org][3], [developer.mozilla.org][4], [datatracker.ietf.org][5])
* **Multi-tenant safety** across all code paths (tenant discriminator or schema-per-tenant, selected per environment). ([Crunchy Data][6], [Microsoft Learn][7])
* **Direct-to-object-storage uploads via presigned URLs** (no secrets in the browser; supports multipart). ([Cloudflare Docs][8])

---

## 1) `/sites/app` — Orchestration & Domain Services

### 1.1 Responsibilities

* **SiteOrchestrator**: state machine for `CREATE | UPDATE | PUBLISH | CONNECT_DOMAIN | ROLLBACK`. Favor orchestration (clear control-flow, traceable), not pure choreography. ([temporal.io][1])
* **SiteContractBuilder**: at publish time, emit a **deterministic site contract**:

  * JSON-LD blocks (products, FAQs, breadcrumbs, offers).
  * `sitemap.xml` with correct `<lastmod>` for incremental crawls.
  * `actions.json` (name/description/params/selector/sideEffects).
  * Optional **site-local `/graphql`** endpoint with introspection enabled for the agent.
    These artifacts make the site “LLM-addressable” and support delta indexing. (Sitemaps with `<lastmod>` enable differential crawls.) ([rfc-editor.org][9])
* **PublishPipeline**: build → package → upload artifacts → CDN purge → emit `site.published` event.
* **DomainManager**: **custom domain attach** (DNS checks), ACME **HTTP-01/DNS-01** challenge, and certificate provisioning. ([temporal.io][10])
* **KB Handoff**: fire `site.published`, `content.changed` events for the crawler/indexer so pgvector can refresh incrementally.
* **AssetUploadService**: issues **presigned URLs** for asset uploads (images, PDFs) to Cloudflare R2 / S3-compatible storage (incl. multipart). ([Cloudflare Docs][8])
* **Idempotency & Concurrency**:

  * Long-running actions (`/publish`) must accept **Idempotency-Key**; repeat calls with same key are safe. (Pattern popularized by Stripe.) ([swagger.io][11])
  * Resource updates use **ETag + If-Match** for optimistic concurrency (reject stale updates). ([developer.mozilla.org][4])

### 1.2 Key Modules (create as pure TS services)

* `SiteOrchestrator.ts`

  * `start(command)`, `advance(state, event)`, `compensate(step)` (saga rollbacks for failed publishes). ([temporal.io][1])
* `SiteContractBuilder.ts`

  * `emitJsonLd(page)`, `emitSitemap(pages)`, `emitActionsManifest(domMap)`, `enableGraphQL(schema)`. (Sitemap last-modified drives fast delta crawls.) ([rfc-editor.org][9])
* `PublishPipeline.ts`

  * Steps: **build** (deterministic), **package** (tarball), **store** (artifact store), **deploy** (hosting), **cdnPurge**.
* `DomainManager.ts`

  * `verifyDns()`, `provisionCert(acmeChallenge)`, `activate(domain)` supporting **HTTP-01** or **DNS-01**. ([temporal.io][10])
* `AssetUploadService.ts`

  * `presignUpload({key, contentType, acl}, multipart?:true)`, `presignDownload({key, attachment?:boolean})`. (R2 is S3-compatible; use AWS SDK v3 presigner.) ([Cloudflare Docs][8])

### 1.3 Success Criteria

* **Publish** completes or compensates deterministically (no “stuck” partials).
* **Reproducible artifacts**: rerun of same commit yields byte-identical `actions.json` & `sitemap.xml`.
* **KB freshness**: on publish, a webhook fires within ≤5s; crawler diffs using sitemap `<lastmod>`. ([rfc-editor.org][9])
* **Uploads**: >95% of assets uploaded via **presigned URLs** (backend never proxies files). ([Cloudflare Docs][8])

---

## 2) `/sites/http` — REST Controllers & API Contract

### 2.1 Principles

* **OpenAPI 3.1** as the single contract (JSON Schema 2020-12). ([OpenAPI Initiative Publications][2], [openapis.org][12])
* **Problem Details (RFC 9457)** for all non-2xx responses. ([rfc-editor.org][3])
* **ETag/If-Match** on `PUT/PATCH/DELETE` to prevent lost updates. ([developer.mozilla.org][4])
* **Link header pagination** (RFC 8288) with `rel="next|prev|first|last"`. (Style popularized by GitHub.) ([datatracker.ietf.org][5], [GitHub Docs][13])
* **Cache-Control** consistent with **RFC 9111** (e.g., `no-store` for secrets; `private, max-age=…` for per-user dashboards). ([rfc-editor.org][9], [developer.mozilla.org][14])

### 2.2 Endpoints (minimum viable)

* `GET /api/sites` → list sites (tenant-scoped).

  * **Pagination**: `Link` header + `per_page`, `page` (or `cursor`). ([GitHub Docs][13])
* `POST /api/sites` → create site (idempotent if `Idempotency-Key` is present). ([swagger.io][11])
* `GET /api/sites/:id` → fetch with `ETag`. Clients should use `If-None-Match` for cache validation. ([developer.mozilla.org][4])
* `PUT|PATCH /api/sites/:id` → update; **require `If-Match`** (409 if ETag mismatches). ([developer.mozilla.org][4])
* `POST /api/sites/:id/publish` → start publish saga; returns `202 Accepted` + status URL. (Accept **Idempotency-Key**.) ([swagger.io][11])
* `GET /api/sites/:id/publish/:runId` → status, step logs, `Problem+JSON` on failure. ([rfc-editor.org][3])
* `POST /api/sites/:id/domains` → attach domain; returns verification instructions (HTTP-01/DNS-01). ([temporal.io][10])
* `POST /api/sites/:id/assets/presign` → returns **presigned PUT** (and multipart if requested). ([Cloudflare Docs][8])
* `GET /api/sites/:id/contract` → returns current `sitemap.xml`, `actions.json`, JSON-LD bundle.
* `POST /api/sites/:id/hooks/republish` → internal hook invoked by \_shared/events (outbox) on CMS updates.

**Errors:** always Problem Details (`application/problem+json`). Include `type`, `title`, `status`, `detail`, `instance`, and extensions like `errors[]`. ([rfc-editor.org][3])

**Caching:**

* Read endpoints: use validators—`ETag`, `Last-Modified`, support `If-None-Match` / `If-Modified-Since`. ([developer.mozilla.org][4])
* Sensitive responses: `Cache-Control: no-store`. Public artifacts (sitemap, robots): `public, max-age=…`. ([rfc-editor.org][9], [developer.mozilla.org][14])

### 2.3 Middleware expectations

* **Auth (tenant)** → resolves `tenantId` for every request (header, subdomain, or token).
* **Rate limit** → protect `publish` & `presign`. (OWASP API top risks cite resource exhaustion; enforce quotas & burst limits.) ([AWS Documentation][15])
* **Locale detect** → drive server messages and default site language.

### 2.4 Success Criteria

* OpenAPI 3.1 file lints clean; schema examples pass. ([OpenAPI Initiative Publications][2])
* Every 4xx/5xx is **Problem Details**; no ad-hoc error shapes. ([rfc-editor.org][3])
* List endpoints emit **Link** header and accept `per_page`/`cursor`. ([GitHub Docs][13])
* Update endpoints enforce **If-Match** (reject blind overwrites). ([developer.mozilla.org][4])

---

## 3) `/sites/adapters` — Infrastructure Adapters

Create small, composable adapters. No business logic here.

### 3.1 `PrismaSiteRepo.ts`

* **Multi-tenancy** strategies (choose per deployment tier):

  1. **Shared DB + tenant discriminator** (`tenant_id` on all rows; enforced in every query). ([Microsoft Learn][7])
  2. **Schema-per-tenant** when isolation needs increase (Postgres supports multiple schemas). ([Crunchy Data][6])
  3. **DB-per-tenant** for large or regulated customers (runtime DSNs). ([Crunchy Data][6])
* Provide **transactions** for publish snapshots and **version column** (map to ETag).
* Repository methods **must** take `tenantId` explicitly; no hidden globals.

### 3.2 `AssetStore/*`

* **Cloudflare R2 (S3-API)** implementation:

  * `getPresignedPut(key, contentType[, expires])`
  * `getPresignedMultipartInit/Part/Complete`
  * `getPresignedGet(key[, attachment])`
    Use AWS SDK v3 presigner; R2 is S3-compatible; multipart supported with S3 semantics. ([Cloudflare Docs][8])
* Notes: presigned URLs keep credentials off the client and reduce server load. ([Ruan Martinelli][16])

### 3.3 `ArtifactStore.ts`

* Write/read build artifacts (site bundles) with content-addressed keys (e.g., commit hash).
* Return immutable URLs suitable for CDN caching (`Cache-Control: public, max-age=31536000, immutable`). ([rfc-editor.org][9])

### 3.4 `CdnAdapter.ts`

* Purge paths on publish; optional **stale-while-revalidate** for soft rollouts. (Honor RFC 9111 directives.) ([rfc-editor.org][9])

### 3.5 `DnsAdapter.ts` & `AcmeAdapter.ts`

* DNS queries (CNAME/A/AAAA/TXT) to guide users during **custom domain** connection (e.g., apex vs subdomain patterns used by modern hosts). ([Vercel][17])
* ACME client for **HTTP-01** or **DNS-01** challenges (Let’s Encrypt). ([temporal.io][10])

### 3.6 `QueuePort.ts`

* Bridge to `_shared/queues` for long jobs (`publish`, `artifact-build`, `cdn-purge`).

### 3.7 Success Criteria

* Repo methods are **pure** and fully tested (cover tenancy & ETag mapping).
* Asset uploads run **entirely browser→R2** (no proxy), including multipart for large files. ([Cloudflare Docs][18])
* Domain connect flow provisions valid cert via ACME; verification UX uses precise DNS/HTTP instructions. ([temporal.io][10])

---

## 4) Data Contracts

### 4.1 `actions.json` (excerpt)

```json
{
  "version": "1",
  "actions": [
    {
      "id": "product.addToCart",
      "description": "Add a product variant to the cart",
      "selector": "[data-action='product.addToCart']",
      "params": {
        "type": "object",
        "properties": { "productId": { "type": "string" }, "qty": { "type": "integer", "minimum": 1 } },
        "required": ["productId"]
      },
      "sideEffects": "writes"
    }
  ]
}
```

Used as **OpenAI tool definitions** (function calling) by the voice agent; emitted by `SiteContractBuilder` at publish.

### 4.2 HTTP Headers You MUST Implement

* **ETag** on all site resources; require **`If-Match`** on writes. ([developer.mozilla.org][4])
* **Link** on all list endpoints with `rel="next|prev|first|last"`. ([GitHub Docs][13])
* **Cache-Control**: follow RFC 9111 semantics (`no-store` vs `no-cache` vs `private`). ([rfc-editor.org][9], [developer.mozilla.org][14])

---

## 5) Observability & Health

* Expose `/api/health` (basic), `/live`, `/ready` via **Lightship**; wire readiness to DB, queue, storage, DNS/ACME reachability. ([GitHub][19], [Kubernetes][20])
* Emit structured logs around publish steps; surface saga state and idempotency key reuse.

---

## 6) Test Matrix (Definition of Done)

* **Contract tests** for:

  * OpenAPI 3.1 validity; example requests/responses compile. ([OpenAPI Initiative Publications][2])
  * Problem Details on representative failures. ([rfc-editor.org][3])
* **Concurrency**: double `PUT` with stale ETag returns `412 Precondition Failed`. ([developer.mozilla.org][4])
* **Pagination**: large site list returns proper `Link` relations like GitHub style. ([GitHub Docs][13])
* **Uploads**: client can PUT to **presigned** URL; multipart path verified for ≥100MB files. ([Cloudflare Docs][18])
* **Domain connect**: DNS/ACME path validated for both HTTP-01 and DNS-01. ([temporal.io][10])

---

## 7) Handoffs & Events

From `/sites/app` emit:

* `site.published` → ai/ingestion pipeline (incremental crawl using `sitemap.xml`’s `<lastmod>`). ([rfc-editor.org][9])
* `site.contract.updated` → voice/widget to refresh `actions.json`.
* `assets.changed` → CDN purge adapter.

All events travel through `_shared/events` (outbox), then queues to the right workers.

---

## 8) Notes on Multi-Tenancy Choice

* **Default**: **shared DB + `tenant_id`** discriminator (fastest to ship). Later, promote big tenants to **schema-per-tenant** or **DB-per-tenant** without breaking contracts. Evaluate per scale/isolation needs. ([Crunchy Data][6])

---

## 9) Example Controller Snippets (behavioral, not framework-specific)

* **ETag + If-Match update path (pseudo)**:

```ts
const etag = hash(siteRow.version); // strong ETag
res.setHeader('ETag', etag);

if (!req.headers['if-match'] || req.headers['if-match'] !== etag) {
  return problem(412, 'Precondition Failed', 'ETag mismatch'); // RFC 9457
}
await repo.update(tenantId, id, patch);
```

(Guard follows HTTP conditional semantics for safe concurrent edits.) ([developer.mozilla.org][4])

* **Pagination headers (Link)**:

```plaintext
Link: <.../api/sites?page=3&per_page=20>; rel="next",
      <.../api/sites?page=10&per_page=20>; rel="last",
      <.../api/sites?page=1&per_page=20>; rel="first"
```

(Modeled after widely used GitHub pattern.) ([GitHub Docs][13])

---

## 10) Deliverables Checklist (what each agent must produce)

* `/sites/app`

  * `SiteOrchestrator.ts`, `PublishPipeline.ts`, `SiteContractBuilder.ts`, `DomainManager.ts`, `AssetUploadService.ts`
  * Unit tests + integration tests for publish flow
* `/sites/http`

  * Controllers for endpoints above
  * **OpenAPI 3.1** spec covering all routes + **Problem Details** schemas ([OpenAPI Initiative Publications][2], [rfc-editor.org][3])
  * Middleware: auth(tenant), rate-limit, locale
* `/sites/adapters`

  * `PrismaSiteRepo.ts` with tenancy filters
  * `AssetStoreR2.ts` (presign PUT/GET, multipart) ([Cloudflare Docs][8])
  * `ArtifactStore.ts`, `CdnAdapter.ts`, `DnsAdapter.ts`, `AcmeAdapter.ts`

---

If you want, I can follow this with the same level of detail for the next subtree (e.g., `/publishing`, `/ai/actions`, or `/voice`).

[1]: https://temporal.io/blog/to-choreograph-or-orchestrate-your-saga-that-is-the-question "Saga Orchestration vs Choreography | Temporal"
[2]: https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com "OpenAPI Specification v3.1.0"
[3]: https://www.rfc-editor.org/rfc/rfc9457.html?utm_source=chatgpt.com "RFC 9457: Problem Details for HTTP APIs"
[4]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests?utm_source=chatgpt.com "HTTP conditional requests - MDN - Mozilla"
[5]: https://datatracker.ietf.org/doc/html/rfc8288?utm_source=chatgpt.com "RFC 8288 - Web Linking"
[6]: https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy?utm_source=chatgpt.com "Designing Your Postgres Database for Multi-tenancy"
[7]: https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql&utm_source=chatgpt.com "Multitenant SaaS Patterns - Azure SQL Database"
[8]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/?utm_source=chatgpt.com "Presigned URLs · Cloudflare R2 docs"
[9]: https://www.rfc-editor.org/rfc/rfc9111.html?utm_source=chatgpt.com "RFC 9111: HTTP Caching"
[10]: https://temporal.io/blog/to-choreograph-or-orchestrate-your-saga-that-is-the-question?utm_source=chatgpt.com "Saga Orchestration vs Choreography"
[11]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[12]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[13]: https://docs.github.com/rest/guides/using-pagination-in-the-rest-api?utm_source=chatgpt.com "Using pagination in the REST API"
[14]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching?utm_source=chatgpt.com "HTTP caching - MDN - Mozilla"
[15]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html?utm_source=chatgpt.com "Download and upload objects with presigned URLs"
[16]: https://ruanmartinelli.com/blog/cloudflare-r2-pre-signed-urls?utm_source=chatgpt.com "Uploading Files to Cloudflare R2 with Pre-Signed URLs"
[17]: https://vercel.com/docs/domains/working-with-domains/add-a-domain?utm_source=chatgpt.com "Adding & Configuring a Custom Domain"
[18]: https://developers.cloudflare.com/r2/objects/multipart-objects/?utm_source=chatgpt.com "Multipart upload · Cloudflare R2 docs"
[19]: https://github.com/gajus/lightship?utm_source=chatgpt.com "gajus/lightship: Abstracts readiness, liveness and startup ..."
[20]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/?utm_source=chatgpt.com "Configure Liveness, Readiness and Startup Probes"
