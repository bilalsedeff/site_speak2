# /publishing — Source-of-Truth

## Mission

Deliver **atomic, immutable, and cache-efficient** publishes for every SiteSpeak site, while emitting a **self-describing “Site Contract”** (JSON-LD + ARIA audit + actions.json + sitemap.xml + GraphQL types) that makes each generated site trivially crawlable and action-able by our Voice Agent. Deploys must be **content-addressed**, **idempotent**, and **instantly reversible** (blue/green). CDN caches are controlled with **precise purge mechanisms** (by URL, prefix, or surrogate key/tags).

---

## 1) `/publishing/app/pipeline.ts` — build → package → deploy state machine

### Responsibilities

* Orchestrate the full publish: **Build → Contract → Package → Upload → Activate → Warm Cache → Verify → Announce**.
* Guarantee **atomic/immutable** deploys (no partial state), and make rollback a **constant-time pointer flip** (blue/green). Atomic/immutable deploys are industry best practice to avoid mixed versions during rollout. ([netlify.com][1], [AWS Documentation][2])
* Produce **content-addressed releases** (hash = SHA-256 of artifact manifest). Content-addressing enables infinite max-age caching with safety. ([Wikipedia][3], [GitHub][4])
* Emit **provenance**: reproducible build metadata + optional Sigstore signatures for artifacts. Reproducible builds require deterministic inputs and locked tools; signing establishes integrity. ([reproducible-builds.org][5], [Wikipedia][6], [Sigstore][7])

### State Machine (idempotent transitions)

```plaintext
Draft → Building → Contracting → Packaging → Uploading → Activating
→ Warming → Verifying → Announcing → Succeeded
                          ↘ (on failure) RollingBack → RolledBack
```

### Inputs

* `siteId`, `deploymentIntent` (preview|production), `commitSha`, `buildParams`.
* Previous active `deploymentId?` (for blue/green diff & rollback).

### Outputs

* `deploymentId` (UUID), `releaseHash` (hex), `cdnUrls` (origin + CDN), `contractPaths` (JSON-LD, actions.json, sitemap.xml, schema.graphql, types.d.ts), SBOM & build logs.

### Key Steps (with contracts)

1. **Build**: run site builder; ensure build is **deterministic** (pin node/npm/pnpm, lockfile, locale, timestamps stripped). ([reproducible-builds.org][5], [FOSSA][8])

   * Produce `/dist` with fingerprinted filenames (e.g., `app.[hash].js`). ([GitHub][4])
2. **Contract**: call `siteContract.ts` to emit JSON-LD, ARIA audit report, actions.json, sitemap.xml, `/graphql` schema/types (details below).
3. **Package**: create **manifest.json** (list of files with sizes, sha256) + tarball; include integrity checks.
4. **Upload**: push to artifact store under **immutable key**:
   `s3://artifact/{tenant}/{site}/{releaseHash}/...`
   (R2/MinIO should use S3-compatible APIs & presigned URLs) ([AWS Documentation][9], [Cloudflare Docs][10])
5. **Activate**: perform **blue/green** switch by updating a single alias (e.g., `live@{site}` points to `{releaseHash}`); retain previous alias for instant rollback. ([AWS Documentation][2], [Stack Overflow][11])
6. **Warm Cache**: preconnect/prefetch critical routes; seed CDN cache for top pages. Prefer **preconnect/dns-prefetch**; avoid legacy `<link rel="prerender">` (deprecated). Consider modern **Speculation Rules** where supported. ([web.dev][12], [MDN Web Docs][13])
7. **Verify**: health probe (`/health` static & dynamic), basic synthetic checks, JSON-LD validation.
8. **Announce**: emit events (`site.published`, `kb.refreshRequested`).

### SLOs / Non-functional

* P95 publish (cold cache, medium site): **≤ 90 s** end-to-end.
* Rollback: **≤ 5 s** (alias flip; no asset re-upload).
* Zero mixed-version: requests see either old or new release (atomic). ([netlify.com][1])

### Failure & Recovery

* All transitions **idempotent** (store step markers).
* Timeouts: per step (build 15m, upload 10m, activation 60s).
* On fail during/after Activate → **RollingBack** to previous alias.

---

## 2) `/publishing/app/siteContract.ts` — JSON-LD, ARIA audit, actions.json, sitemap.xml, /graphql types

**Goal:** Every generated site doubles as an API: content is discoverable (sitemap), factual (JSON-LD), operable (actions.json), and introspectable (/graphql). This makes the Voice Agent fast and precise.

### 2.1 JSON-LD (Structured Data)

* Emit JSON-LD for **Products, Offers, FAQs, Breadcrumbs, Articles/BlogPosting, Organization**, etc. Follow Google’s structured data guidance. ([RFC Editor][14])
* Validate types and required properties; embed per page where relevant.
* Store a consolidated `contract/structured-data.json` for crawler ingestion.

### 2.2 ARIA Audit (Accessibility)

* Ensure semantic landmarks (`role="main"`, `navigation`, `search`, etc.) and proper names/labels. Use **axe-core** programmatically in CI to emit a violation report bundled with the contract. ([W3C][15], [Deque][16])
* **Why:** Better accessibility also yields better deterministic selectors for the agent.

### 2.3 `actions.json` (Action Manifest)

* Enumerate **interactive intents** discovered at build-time:

  ```json
  {
    "version":"1",
    "actions":[
      {
        "id":"product.addToCart",
        "selector":"[data-action=\"product.addToCart\"]",
        "params":{"productId":{"type":"string"},"qty":{"type":"integer","minimum":1}},
        "description":"Add product to cart",
        "sideEffects":"writes.cart"
      },
      {
        "id":"navigate.to",
        "params":{"path":{"type":"string","pattern":"^/"}},
        "description":"Navigate to route"
      }
    ]
  }
  ```

* **Selectors** MUST be deterministic (`data-action="…"`) across builds; values used to publish OpenAI tool/function signatures (JSON Schema 2020-12 via OpenAPI 3.1 dialect rules where helpful). ([OpenAPI Initiative Publications][17], [openapis.org][18])

### 2.4 `sitemap.xml` (+ index)

* Generate `sitemap.xml` including **canonical URLs** and `<lastmod>` in full W3C datetime (with timezone). Do **not** rely on `<priority>`/`<changefreq>` (Google ignores them). Split large sites using `sitemap_index.xml`. ([sitemaps.org][19], [Google for Developers][20], [Webmasters Stack Exchange][21], [Slickplan][22])
* Provide **image sitemap** entries when applicable (per spec). ([google.com][23])

### 2.5 `/graphql` schema & types

* Expose a **read-only** site-local GraphQL endpoint (content, pages, products, inventory, taxonomies). Enable introspection; rate-limit at edge; generate **TypeScript types** with GraphQL Code Generator and/or Apollo codegen. ([The Guild][24], [apollographql.com][25])
* Schema evolves with components; every publish ships `schema.graphql` and generated `types.d.ts` next to the site bundle.

### 2.6 Resource Hints (performance chapter in contract)

* Inject **`<link rel="preconnect">`** and **`dns-prefetch`** for critical origins (fonts, API, CDN). Prefer **preload** for truly critical assets (fonts/LCP image). Avoid old `<link rel="prerender">` (deprecated); evaluate **Speculation Rules** where supported. ([web.dev][12], [MDN Web Docs][13])

---

## 3) `/publishing/adapters/artifactStore.ts` — MinIO/R2/S3 abstraction

### Responsibilities of artifactStore

* Provide a **uniform S3-compatible** blob API: `putObject`, `head`, `presign`, `getObject`, `delete`, `list`.
* Enforce **immutability** by default: once a release path exists (`{tenant}/{site}/{releaseHash}/…`), writes are rejected unless `--force-replace` for admin tooling. Treat blobs as immutable for cache sanity. ([Vercel][26])
* Support **presigned URLs** for uploads/downloads across providers (S3, R2, MinIO). ([MDN Web Docs][27], [AWS Documentation][9], [Cloudflare Docs][10])

### Interface (TS)

```ts
export interface ArtifactStore {
  putObject(key: string, body: Buffer | Readable, opts?: { contentType?: string; cacheControl?: string; sha256?: string }): Promise<{ etag: string }>;
  getObject(key: string): Promise<Readable>;
  headObject(key: string): Promise<{ size: number; etag: string; lastModified: Date }>;
  presignPut(key: string, expiresSec: number, contentType?: string): Promise<{ url: string, headers?: Record<string,string> }>;
  presignGet(key: string, expiresSec: number): Promise<{ url: string }>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}
```

### Behavior & Headers

* Static assets (fingerprinted filenames) ship with
  `Cache-Control: public, max-age=31536000, immutable` (safe due to content addressing). ([MDN Web Docs][28], [KeyCDN][29])
* HTML entry points: `Cache-Control: no-cache, must-revalidate` so blue/green flips are visible instantly (CDN still caches with short TTL via CDN-specific headers if needed).

### Data Layout

```plaintext
{tenantId}/{siteId}/{releaseHash}/
  manifest.json
  contract/
    actions.json
    structured-data.json
    schema.graphql
    types.d.ts
    sitemap.xml (plus sitemap_index.xml if sharded)
  public/… (all site files)
```

---

## 4) `/publishing/adapters/cdn.ts` — CDN purge, preview links, cache strategy

### Responsibilities of cdn

* Drive **precise, fast purges**: by URL, by **tag/surrogate key**, by prefix, and “purge all” as last resort.
* Publish **preview links** per deployment; clamp cache behavior to our headers.

### API

```ts
export interface Cdn {
  purgeUrls(urls: string[]): Promise<void>;
  purgeByTag(tags: string[]): Promise<void>;      // uses Surrogate-Key / tag headers if provider supports
  purgeByPrefix(prefix: string): Promise<void>;
  createPreviewUrl(originUrl: string, releaseHash: string): string;
  setDefaultCachingRules(): Promise<void>;
}
```

### Implementation Notes

* **Cloudflare**: Purge by URL, prefix, host; if using custom cache keys, include the relevant headers in purge calls. ([Cloudflare Docs][30])
* **Fastly**: Prefer **Surrogate-Key** tags to group related content (e.g., `site:{siteId}`, `page:{slug}`, `product:{sku}`) for selective purges. ([fastly.com][31])
* Respect HTTP caching semantics; when using **stale-while-revalidate**, follow RFC 9111. ([datatracker.ietf.org][32])

### Header Strategy (defaults)

* **Static hashed assets**: `Cache-Control: public, max-age=31536000, immutable`. ([MDN Web Docs][28])
* **HTML**: `Cache-Control: no-cache` (or short `max-age=0, must-revalidate`), rely on blue/green switch.
* Optional CDN knobs (provider-specific), e.g., Vercel’s `CDN-Cache-Control`. ([https://www.getfishtank.com/][33])

---

## Cross-cutting Best Practices & Rationale

1. **Atomic + Immutable Deploys**
   Publish the whole site, then atomically switch—no half-updated states. Keep old version available for instant rollback. This is how Netlify/Vercel and well-architected CDNs operate. ([netlify.com][1])

2. **Content-Addressed Artifacts**
   Hash in filenames and release keys allows **year-long caching** with `immutable` and eliminates cache-busting hacks. ([GitHub][4], [MDN Web Docs][28])

3. **Sitemaps with `<lastmod>`**
   Emit accurate `<lastmod>` timestamps; avoid `<priority>` & `<changefreq>` (not used by Google). Include image sitemaps where relevant. ([Google for Developers][20], [Slickplan][22], [sitemaps.org][19])

4. **Resource Hints**
   Use **preconnect/dns-prefetch** and minimal **preload** for critical resources; treat legacy `<link rel="prerender">` as deprecated, evaluate **Speculation Rules** instead. ([web.dev][12], [MDN Web Docs][13])

5. **Structured Data + ARIA**
   Ship JSON-LD and pass an **axe-core** audit. This benefits SEO, accessibility, and gives the agent stable hooks. ([RFC Editor][14], [Deque][34])

6. **GraphQL Types & Introspection**
   Generated types (`types.d.ts`) keep our agent/tools strictly typed; rate-limit introspection in production. ([The Guild][24])

7. **Reproducible Builds & Signatures**
   Deterministic builds reduce surprises; optional Sigstore **cosign** attests artifact integrity. ([reproducible-builds.org][5], [Sigstore][7])

---

## Validation & Success Criteria (per file)

### `/app/pipeline.ts`

* ✅ Atomic switch (no mixed assets during deploy).
* ✅ Rollback ≤ 5s.
* ✅ Release is content-addressed; manifest checksums verified post-upload.
* ✅ Events emitted: `site.published`, `site.activated`, `kb.refreshRequested`.
* ✅ SLOs measured: durations for build, upload, warm, verify.

### `/app/siteContract.ts`

* ✅ `actions.json` present; all interactive controls have `data-action` selectors; JSON Schema is 2020-12 compatible where used. ([OpenAPI Initiative Publications][17])
* ✅ JSON-LD valid for site’s content types (Products/Offers/FAQ/etc.). ([RFC Editor][14])
* ✅ `sitemap.xml` + optional `sitemap_index.xml` with `<lastmod>`; large sites chunked; image sitemap where applicable. ([sitemaps.org][19])
* ✅ `/graphql` schema + generated `types.d.ts`. ([The Guild][24])
* ✅ ARIA audit report (axe) attached; critical violations < threshold. ([Deque][34])

### `/adapters/artifactStore.ts`

* ✅ S3 API parity (R2/MinIO/S3) with **presigned URL** tests passing. ([MDN Web Docs][27], [AWS Documentation][9], [Cloudflare Docs][10])
* ✅ Writes default to **immutable**; headers correct for static vs HTML. ([MDN Web Docs][28])

### `/adapters/cdn.ts`

* ✅ Purge by URL, prefix, and tags (surrogate key) supported where provider allows it. ([Cloudflare Docs][30], [fastly.com][35])
* ✅ `stale-while-revalidate` rules and RFC-compliant cache semantics documented. ([datatracker.ietf.org][32])

---

## Developer Notes (pseudo-code fragments)

## **Atomic activation (blue/green)**

```ts
await cdn.setDefaultCachingRules();

const newAlias = `releases/${releaseHash}`;
await aliasStore.point(`sites/${tenant}/${site}/live`, newAlias); // atomic pointer flip

await cdn.purgeByTag([`site:${site}`, `release:${releaseHash}`]); // warm follows
await warmTopRoutes(cdnBaseUrl, ['/','/products','/faq']); // HEAD/GET to seed caches

emit('site.activated', { siteId: site, releaseHash });
```

## **Cache headers**

```ts
// hashed assets
res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // safe long-term caching
// HTML
res.setHeader('Cache-Control', 'no-cache, must-revalidate');
```

## **Sitemap generation**

```xml
<url>
  <loc>https://example.com/products/rose-bouquet</loc>
  <lastmod>2025-08-23T19:55:12+03:00</lastmod>
</url>
```

(Include image entries under `<image:image>` when present.) ([google.com][23])

## **Resource hints**

```html
<link rel="preconnect" href="https://cdn.sitespeak.app">
<link rel="dns-prefetch" href="//cdn.sitespeak.app">
<link rel="preload" as="font" href="/fonts/inter-var.woff2" type="font/woff2" crossorigin>
```

(Avoid `<link rel="prerender">`; consider Speculation Rules API.) ([web.dev][12], [MDN Web Docs][13])

---

## Security, Privacy, Tenancy

* All artifact keys are namespaced `{tenant}/{site}/…`. No cross-tenant reads.
* Presigned URLs expire in **≤ 10 minutes**; write presigns are single-use.
* `/graphql` is **read-only** and rate-limited; introspection allowed but throttled.
* Contract generation must strip secrets/PII from HTML before JSON-LD snapshot.

---

## Ops & Observability

* Metrics: build duration, upload throughput, activation latency, cache hit rate post-warm, purge latency.
* Traces on steps: `publishing.build`, `publishing.contract`, `publishing.upload`, `publishing.activate`, `publishing.warm`.
* Health endpoints: `/health`, `/live`, `/ready` already standardized in your API gateway; pipeline calls and asserts 200s.

---

## Hand-offs to other subsystems

* Emit `kb.refreshRequested(siteId, releaseHash)` so the **crawler/ingester** performs **delta indexing** using `sitemap lastmod` and contract artifacts (JSON-LD, actions.json). (Your crawler already respects structured data and deltas; this makes refreshes cheap.) ([sitemaps.org][19])
* Voice Agent consumes `actions.json` as OpenAI tool/function definitions (aligned with JSON Schema 2020-12 / OpenAPI 3.1 dialect guidance). ([OpenAPI Initiative Publications][17])

---

If you want, I can now draft the **TypeScript skeletons** for each file and the **acceptance tests** (including an end-to-end publish that validates headers, sitemap, JSON-LD, and a synthetic CDN purge + warm).

[1]: https://www.netlify.com/blog/2021/02/23/terminology-explained-atomic-and-immutable-deploys/?utm_source=chatgpt.com "Terminology explained: Atomic and immutable deploys"
[2]: https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_tracking_change_management_immutable_infrastructure.html?utm_source=chatgpt.com "REL08-BP04 Deploy using immutable infrastructure"
[3]: https://en.wikipedia.org/wiki/Content-addressable_storage?utm_source=chatgpt.com "Content-addressable storage"
[4]: https://github.com/webpack/webpack/issues/9038?utm_source=chatgpt.com "Way of determining if an asset's filename contains a hash"
[5]: https://reproducible-builds.org/?utm_source=chatgpt.com "Reproducible Builds — a set of software development ..."
[6]: https://en.wikipedia.org/wiki/Reproducible_builds?utm_source=chatgpt.com "Reproducible builds"
[7]: https://docs.sigstore.dev/cosign/?utm_source=chatgpt.com "Cosign"
[8]: https://fossa.com/blog/three-pillars-reproducible-builds/?utm_source=chatgpt.com "The Three Pillars of Reproducible Builds | FOSSA Blog"
[9]: https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html?utm_source=chatgpt.com "Sharing objects with presigned URLs - AWS Documentation"
[10]: https://developers.cloudflare.com/r2/api/s3/presigned-urls/?utm_source=chatgpt.com "Presigned URLs · Cloudflare R2 docs"
[11]: https://stackoverflow.com/questions/65925489/in-aws-difference-between-immutable-and-blue-green-deployments?utm_source=chatgpt.com "In AWS - difference between Immutable and Blue/Green ..."
[12]: https://web.dev/articles/preconnect-and-dns-prefetch?utm_source=chatgpt.com "Establish network connections early to improve perceived ..."
[13]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/prerender?utm_source=chatgpt.com "rel=prerender - MDN"
[14]: https://www.rfc-editor.org/rfc/rfc9111.html?utm_source=chatgpt.com "RFC 9111: HTTP Caching"
[15]: https://www.w3.org/WAI/ARIA/apg/?utm_source=chatgpt.com "ARIA Authoring Practices Guide | APG | WAI"
[16]: https://www.deque.com/axe/core-documentation/?utm_source=chatgpt.com "axe-core Documentation"
[17]: https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com "OpenAPI Specification v3.1.0"
[18]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[19]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[20]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?utm_source=chatgpt.com "Build and Submit a Sitemap | Google Search Central"
[21]: https://webmasters.stackexchange.com/questions/144088/google-search-console-doesnt-seem-to-be-correctly-scraping-my-sitemap-index?utm_source=chatgpt.com "Google search console doesn't seem to be correctly ..."
[22]: https://slickplan.com/blog/xml-sitemap-priority-changefreq?utm_source=chatgpt.com "XML Sitemap Priority & Sitemap Change Frequency"
[23]: https://www.google.com/schemas/sitemap-image/1.1/?utm_source=chatgpt.com "Image Sitemaps"
[24]: https://the-guild.dev/graphql/codegen?utm_source=chatgpt.com "GraphQL Codegen"
[25]: https://www.apollographql.com/docs/apollo-server/workflow/generate-types?utm_source=chatgpt.com "Generating Types from a GraphQL Schema"
[26]: https://vercel.com/docs/vercel-blob?utm_source=chatgpt.com "Vercel Blob"
[27]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/landmark_role?utm_source=chatgpt.com "ARIA: landmark role - MDN - Mozilla"
[28]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching?utm_source=chatgpt.com "HTTP caching - MDN - Mozilla"
[29]: https://www.keycdn.com/blog/cache-control-immutable?utm_source=chatgpt.com "Improving Performance with Cache-Control: immutable"
[30]: https://developers.cloudflare.com/api/node/resources/cache/methods/purge/?utm_source=chatgpt.com "Cache › purge - Cloudflare API"
[31]: https://www.fastly.com/documentation/guides/full-site-delivery/purging/working-with-surrogate-keys/?utm_source=chatgpt.com "Working with surrogate keys | Fastly Documentation"
[32]: https://datatracker.ietf.org/doc/rfc9111/?utm_source=chatgpt.com "RFC 9111 - HTTP Caching"
[33]: https://www.getfishtank.com/insights/what-is-vercels-edge-cache-and-what-level-of-control-do-you-have?utm_source=chatgpt.com "What is Vercel's Edge Cache and What Level of Control Do ..."
[34]: https://www.deque.com/axe/core-documentation/api-documentation/?utm_source=chatgpt.com "Axe API Documentation | Deque Systems"
[35]: https://www.fastly.com/documentation/guides/full-site-delivery/purging/purging-with-surrogate-keys/?utm_source=chatgpt.com "Purging with surrogate keys"
