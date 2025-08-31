# Source-of-Truth: **`/services/ai/ingestion`**

## *(Playwright crawler + ETL that powers the site-level Knowledge Base and Action Manifest discovery)*

> **Owner note (my voice):** This folder is the beating heart of “autonomous crawling → clean text → smart chunks → up-to-date vector KB + action inventory”. It must be fast, polite, and secure. It must work perfectly on any SiteSpeak-built site on day one, and degrade gracefully on third-party sites.

---

## 0) Design goals (non-negotiables)

* **Polite & standards-compliant crawling.** Obey `robots.txt`, sitemaps, conditional HTTP, and never DoS a site. Use `If-None-Match`/`If-Modified-Since` and `ETag` to avoid re-downloading unchanged content. ([IETF Datatracker][1], [MDN Web Docs][2])
* **Delta-first.** Prefer **incremental** fetch via `sitemap.xml` `<lastmod>` and HTTP validators; only run full crawls on first index or manual override. Google’s guidance: `<lastmod>` is used; `changefreq`/`priority` are ignored by Google, so don’t rely on them. ([Google for Developers][3], [sitemaps.org][4])
* **Headless speed.** Use Playwright with request interception to **block images/fonts/analytics**, rely on **auto-waiting** (no hard sleeps), and parallelize safely. ([playwright.dev][5], [scrapeops.io][6])
* **Structured-first extraction.** Prefer JSON-LD/Microdata/RDFa when present; fall back to semantic DOM. ([W3C][7], [MDN Web Docs][8])
* **Secure by default.** Trim PII/credentials; never store secrets; rate-limit ourselves; respect noindex/noarchive; log minimal data. ([owasp-aasvs.readthedocs.io][9], [owasp.org][10])
* **Form & action discovery.** Detect forms (method, enctype, labels), ARIA landmarks, and our `data-action="…"`. ([MDN Web Docs][11])
* **Chunking that works.** Token-aware splitting (200–1000 tokens) with small overlap; use recursive splitters. ([platform.openai.com][12], [python.langchain.com][13], [lagnchain.readthedocs.io][14])
* **GraphQL/REST ingestion.** When available, ingest via APIs (optionally introspection in our own sites; treat third-party as locked down). ([graphql.org][15], [apollographql.com][16])

---

## 1) Module contracts (file-by-file)

### `crawler/playwrightAdapter.ts`

**Purpose:** High-performance, polite renderer & fetcher for HTML/DOM/JS.

**Public API (TS):**

```ts
export interface CrawlRequest {
  url: string;
  tenantId: string;
  budget: { maxDepth: number; maxPages: number; timeoutMs: number; concurrency: number };
  headers?: Record<string,string>;
  userAgent?: string;
  referrer?: string;
  allowJsRendering?: boolean; // default true
  blockResources?: ("image"|"font"|"media"|"stylesheet"|"analytics")[]; // default: most
}
export interface CrawlResult {
  url: string;
  status: number;
  redirectedTo?: string;
  finalUrl: string;
  html: string; // raw
  domMetrics: { nodes: number; scripts: number; sizeKb: number; loadMs: number };
  http: { etag?: string; lastModified?: string };
  extracted: { jsonld: string[]; meta: Record<string,string>; canonical?: string };
}
export async function fetchPage(req: CrawlRequest): Promise<CrawlResult>;
```

**Key behaviors:**

* **Block non-essential resources** via `page.route` (`image`, `font`, heavy 3rd-party); huge speed-up. ([playwright.dev][5], [scrapeops.io][6])
* Use Playwright **auto-wait/actionability**; avoid brittle `waitForTimeout`. ([playwright.dev][17], [Checkly][18])
* Respect `robots.txt` decision from `robotsPolicy.ts` (pre-check). ([IETF Datatracker][1])
* Surface `ETag`/`Last-Modified` for conditional re-fetch. ([IETF Datatracker][19])

**Success criteria:** P95 page render < **2.0 s** with blocking; zero hard sleeps; all blocked resource types configurable.

---

### `crawler/sitemapReader.ts`

**Purpose:** Discover URLs and deltas from `sitemap.xml`/index sitemaps.

**API:**

```ts
export interface SitemapEntry { url: string; lastmod?: string; changefreq?: string; priority?: number; }
export async function readSitemap(seedUrl: string): Promise<SitemapEntry[]>;
```

**Rules:**

* Parse `sitemap.xml` and **respect `<lastmod>`**; treat `changefreq`/`priority` as advisory/**ignored** signals (don’t plan on them). ([Google for Developers][3])
* Handle nested **sitemap index** files and common namespaces (e.g., image/news).
* Fallback: simple **frontier discovery** from root if no sitemap.

**Success:** Produces deterministic URL set; includes `lastmod` for delta checks.

---

### `crawler/deltaDetector.ts`

**Purpose:** Decide “fetch vs skip”.

**Algorithm:**

* If we have `ETag` and server supports conditional: use `If-None-Match`; fallback to `If-Modified-Since` (+ local **content hash** as tie-breaker). ([IETF Datatracker][19], [MDN Web Docs][2])
* If sitemap `<lastmod>` <= stored, skip unless forced. ([Google for Developers][3])

**API:**

```ts
export function shouldRefetch(prev: PageSnapshot, hint?: { lastmod?: string, etag?: string }): "full"|"conditional"|"skip";
```

---

### `extractors/html.ts`

**Purpose:** Normalize human-visible content from rendered DOM.

**Outputs:**

```ts
export interface HtmlExtraction {
  title?: string;
  headings: { level: number; text: string }[];
  bodyText: string; // de-boilerplated
  links: { href: string; rel?: string; text?: string }[];
  meta: Record<string,string>;
  landmarks: { role: string; label?: string; selector: string }[]; // ARIA/HTML5 regions
}
```

**Notes:**

* Capture **landmark roles** (`main`, `navigation`, `banner`, `contentinfo`, etc.) or HTML5 equivalents; they help both accessibility and **programmatic targeting**. ([W3C][20], [MDN Web Docs][21])
* Keep “boilerplate trimmer” conservative; prefer keeping content over over-pruning.

---

### `extractors/jsonld.ts`

**Purpose:** Pull **JSON-LD/Microdata/RDFa** first; they’re the gold source.

**Behavior:**

* Parse `<script type="application/ld+json">` blocks, normalize with JSON-LD 1.1 rules; support framing/contexts. ([W3C][22])
* Recognize common types: **Product, Offer, FAQPage, Event, Article, BreadcrumbList** (Google structured data patterns). ([Google for Developers][23])
* Also read Microdata/RDFa when present (lower priority). ([MDN Web Docs][8])

**Why:** Structured data is **machine-readable** and more reliable than scraping arbitrary DOM. ([W3C][7])

---

### `extractors/forms.ts`

**Purpose:** Build **form schemas** for agent actions (fields, labels, constraints).

**Behavior:**

* Enumerate `<form>`: `action`, `method`, `enctype`, target; support per-button overrides (`formmethod`, `formenctype`). ([MDN Web Docs][11])
* For each control: `name`, `type` (email/date/number/radio/checkbox/…); `required`, `min/max`, `pattern`, options. ([MDN Web Docs][24])
* Associate labels via `<label for=…>` and implicit wrapping. ([W3C][25])

**Output example:**

```ts
export interface FormSchema {
  selector: string;
  action: string; method: "GET"|"POST";
  enctype?: string;
  fields: Array<{name:string; type:string; required?:boolean; label?:string; options?:string[]}>;
}
```

---

### `extractors/actions.ts`

**Purpose:** Discover **action hooks** and navigations.

**Rules:**

* Collect `data-action="product.addToCart"`, `data-action-params="…"`, and stable selectors; lift ARIA roles for navigation zones. ([MDN Web Docs][21])
* Infer common **clickables** (links, buttons with semantic labels) and map them to candidate actions (low confidence if heuristic).

**Output →** feeds the **Action Manifest** generator downstream.

---

### `transformers/cleaner.ts`

**Purpose:** PII/secret trimming & content hygiene.

**Must:**

* Remove emails, phones, order ids, session ids from logs/chunks when not content-critical; **never store secrets** (API keys, tokens). Use secret-pattern library + our custom regex set. ([GitHub Docs][26])
* Follow OWASP ASVS/AI privacy guidance: **data minimization**, no sensitive data in URLs/logs, cache clearing. ([owasp-aasvs.readthedocs.io][9])

---

### `transformers/splitter.ts`

**Purpose:** Chunk text for embeddings.

**Defaults:**

* Token-aware size **\~300–800 tokens**, **overlap 10–15%** via recursive splitter (paragraph→sentence→word) to preserve semantics. ([lagnchain.readthedocs.io][14], [platform.openai.com][12])

**Why:** Balanced recall/latency and retrieval quality; widely used in LangChain text-splitter patterns. ([python.langchain.com][13])

---

### `loaders/apiLoader.ts`  *(REST/GraphQL ingestion)*

**Purpose:** Prefer APIs when present—clean, structured, cheaper than headless.

**GraphQL:**

* Use **introspection** on **our** SiteSpeak-built sites (allowlisted); don’t rely on it for third-party (often disabled in prod). ([graphql.org][15], [apollographql.com][16])
* Cache/persist **persisted queries** (GET where possible) to leverage HTTP/CDN caching. ([graphql.org][27])
* Apply **query cost/depth limiting** & request size limits. ([OWASP Cheat Sheet Series][28], [apollographql.com][29])

**REST:** Honor `ETag`/`Last-Modified` for incremental sync. ([IETF Datatracker][19])

---

### `pipelines/indexSite.pipeline.ts`

**Purpose:** **Full** index of a site (first time, or “rebuild all”).

**Stages:**

1. **Frontier build**: `sitemapReader` (preferred) or root crawl. ([sitemaps.org][4])
2. **Fetch** pages via `playwrightAdapter` with resource blocking and polite concurrency. ([playwright.dev][5])
3. **Extract** `jsonld`, `html`, `forms`, `actions`. ([W3C][7])
4. **Clean** with `cleaner.ts` (PII/secrets). ([GitHub Docs][26])
5. **Split** with `splitter.ts` and queue embeddings. ([lagnchain.readthedocs.io][14])
6. **Persist**: content rows + vector entries + **Action Manifest** (site-scoped).
7. **Report**: coverage metrics, crawl time, skipped by robots.

**SLAs:** 50–100 pages/min per worker baseline (with blocking); P99 memory < 250 MB/worker (guideline).

---

### `pipelines/updateDelta.pipeline.ts`

**Purpose:** **Incremental** refresh — only changed pages.

**Triggers:**

* Webhooks from publishing, inventory changes, CMS updates; timed cron.
* Check `<lastmod>` deltas first; otherwise conditional HTTP / hashing. ([Google for Developers][3], [MDN Web Docs][2])

**Flow:** same stages as full, but only for dirty URLs; re-embed changed chunks; update Action Manifest only when actions changed.

---

## 2) Cross-cutting **politeness & safety**

* **Robots Exclusion Protocol**: implement allow/disallow/Sitemap exactly as per **RFC 9309**. Note that `crawl-delay` is **non-standard**; treat as advisory only. ([IETF Datatracker][1])
* **Rate limiting & budgets**: global + per-host concurrency caps to avoid **Unrestricted Resource Consumption** risks; exponential backoff on 429/5xx. ([owasp.org][30])
* **Conditional requests**: prefer `If-None-Match`/`If-Modified-Since`; treat 304 as skip. ([IETF Datatracker][19])
* **Playwright health**: no fixed sleeps; use auto-wait and locator assertions; timeouts bounded. ([playwright.dev][17])

---

## 3) Data products (what we persist)

* **PageSnapshot** (raw): url, http meta (`etag`, `lastModified`), hash, html, extracted jsonld, meta.
* **ContentChunk**: pageId, `chunkIndex`, text, tokens, provenance (selector/landmark), embeddingId.
* **FormSchema**/**ActionHook**: normalized schemas & selectors for agent tool-calling.
* **CrawlRun**: metrics (pages fetched, skipped by delta/robots, avg fetch ms, errors).

---

## 4) Observability & metrics

* **Per page:** TTFB, render ms, bytes, blocked requests count, auto-wait retries. ([Checkly][18])
* **Per run:** pages/min, %304, %robots-skipped, %sitemap-discovered, errors by type.
* **Quality:** #JSON-LD entities/page, landmark coverage, forms discovered, actions discovered. ([W3C][7])

---

## 5) Security checklist

* PII trimming enabled, secrets scrubbing rules up-to-date (GitHub patterns + custom). ([GitHub Docs][26])
* No session IDs/API keys in logs; hash if correlation needed (OWASP). ([OWASP Cheat Sheet Series][31])
* GraphQL: introspection **off** on public endpoints (except site-local ingress); enable **request size** & **complexity** limits. ([apollographql.com][16], [OWASP Cheat Sheet Series][28])

---

## 6) Performance playbook (what keeps us under 3–5 s)

* **Interception:** abort images/fonts/analytics. ([playwright.dev][5])
* **Parallelism:** small pool per host (e.g., 2–4) + global cap to stay polite.
* **Delta-only:** lean on `<lastmod>` and `ETag` to avoid unnecessary work. ([Google for Developers][3], [IETF Datatracker][19])
* **Chunk smart:** recursive splitting with small overlap (less tokens → faster embed/search). ([lagnchain.readthedocs.io][14])

---

## 7) Acceptance tests (Definition of Done)

1. **Robots**: a disallowed path is never fetched; allowed path fetched once, then **304** honored with conditional headers. Logs prove both. ([IETF Datatracker][1], [MDN Web Docs][2])
2. **Sitemap delta**: changing `<lastmod>` on one URL triggers only that URL’s re-index. ([Google for Developers][3])
3. **Speed**: with resource blocking, median **< 1.2 s** DOM ready on a 2-MB homepage. ([scrapeops.io][6])
4. **JSON-LD**: a Product page yields normalized Product/Offer entities in the output. ([Google for Developers][23])
5. **Forms**: extractor returns correct `method`, `enctype`, required fields, and labels. ([MDN Web Docs][11])
6. **Split**: content is chunked \~500 tokens with 10% overlap via recursive splitter. ([lagnchain.readthedocs.io][14])
7. **Security**: a seeded API key like `sk-...` is redacted from all persisted artifacts. ([GitHub Docs][26])

---

## 8) Implementation notes & snippets

* **Blocking resources (Node, Playwright):**

```ts
await page.route('**/*', (route) => {
  const t = route.request().resourceType();
  if (['image', 'font', 'media', 'stylesheet'].includes(t)) return route.abort();
  return route.continue();
});
```

Playwright shows this pattern and it’s a standard way to speed up crawls. ([playwright.dev][5])

* **Conditional GET:**

  * Send `If-None-Match: <etag>`; on 304, mark page **unchanged**. This follows HTTP semantics. ([IETF Datatracker][19])

* **ARIA landmarks:** prefer native HTML5 (`<main>`, `<nav>`, `<header>`, `<footer>`) and map to roles for programmatic navigation. ([W3C][32])

* **GraphQL:** allow introspection only on **site-local** endpoint we own; many prod APIs disable it for security. ([apollographql.com][16])

---

## 9) Where this plugs into the rest

* **Publishing** emits a **Site Contract** (JSON-LD/ARIA/action hooks/sitemap/GraphQL types). The crawler and extractors are built to take advantage of that contract first, and fall back to heuristics when missing.
* **Retrieval** consumes `ContentChunk` rows and embeddings; **Action Manifest** feeds the tool registry for **voice-agent** function calling.

---

### TL;DR for the agent teams

* Use **Playwright** + **polite controls** + **interception** for speed. ([playwright.dev][5])
* Drive deltas off **`sitemap.xml` `<lastmod>`** + **HTTP validators**. ([Google for Developers][3], [MDN Web Docs][2])
* Prefer **JSON-LD**; map **forms/actions** to schemas; then **chunk** smartly and embed. ([W3C][7], [lagnchain.readthedocs.io][14])
* Enforce **privacy & rate limits** always. ([owasp-aasvs.readthedocs.io][9], [owasp.org][30])

If you follow this doc, the `/ai/ingestion` layer will keep every SiteSpeak site’s knowledge fresh, structured, and action-ready—without users ever feeling the background work.

[1]: https://datatracker.ietf.org/doc/html/rfc9309?utm_source=chatgpt.com "RFC 9309 - Robots Exclusion Protocol"
[2]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests?utm_source=chatgpt.com "HTTP conditional requests - MDN - Mozilla"
[3]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?utm_source=chatgpt.com "Build and Submit a Sitemap | Google Search Central"
[4]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[5]: https://playwright.dev/docs/network?utm_source=chatgpt.com "Network"
[6]: https://scrapeops.io/playwright-web-scraping-playbook/nodejs-playwright-blocking-images-resources/?utm_source=chatgpt.com "Playwright Guide - How To Block Images and Resources"
[7]: https://www.w3.org/TR/json-ld11/?utm_source=chatgpt.com "JSON-LD 1.1 - W3C"
[8]: https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Microformats?utm_source=chatgpt.com "Using microformats in HTML - MDN - Mozilla"
[9]: https://owasp-aasvs.readthedocs.io/en/latest/level3.html?utm_source=chatgpt.com "Level 3: Advanced"
[10]: https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure?utm_source=chatgpt.com "A3:2017-Sensitive Data Exposure"
[11]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form?utm_source=chatgpt.com "The Form element - MDN - Mozilla"
[12]: https://platform.openai.com/docs/guides/embeddings?utm_source=chatgpt.com "Vector embeddings - OpenAI API"
[13]: https://python.langchain.com/api_reference/text_splitters/character/langchain_text_splitters.character.RecursiveCharacterTextSplitter.html?utm_source=chatgpt.com "RecursiveCharacterTextSplitter"
[14]: https://lagnchain.readthedocs.io/en/stable/modules/indexes/text_splitters/examples/recursive_text_splitter.html?utm_source=chatgpt.com "RecursiveCharacterTextSplitter — LangChain 0.0.149"
[15]: https://graphql.org/learn/introspection/?utm_source=chatgpt.com "Introspection"
[16]: https://www.apollographql.com/docs/graphos/platform/security/overview?utm_source=chatgpt.com "Graph Security"
[17]: https://playwright.dev/docs/actionability?utm_source=chatgpt.com "Auto-waiting"
[18]: https://www.checklyhq.com/learn/playwright/waits-and-timeouts/?utm_source=chatgpt.com "Dealing with waits and timeouts in Playwright"
[19]: https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com "RFC 9110 - HTTP Semantics"
[20]: https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/?utm_source=chatgpt.com "Landmark Regions | APG | WAI"
[21]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/landmark_role?utm_source=chatgpt.com "ARIA: landmark role - MDN - Mozilla"
[22]: https://www.w3.org/TR/json-ld11-framing/?utm_source=chatgpt.com "JSON-LD 1.1 Framing - W3C"
[23]: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?utm_source=chatgpt.com "Intro to How Structured Data Markup Works"
[24]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input?utm_source=chatgpt.com "<input>: The HTML Input element - HTML"
[25]: https://www.w3.org/TR/WCAG20-TECHS/H44.html?utm_source=chatgpt.com "H44: Using label elements to associate text ..."
[26]: https://docs.github.com/enterprise-cloud%40latest/code-security/secret-scanning?utm_source=chatgpt.com "Keeping secrets secure with secret scanning"
[27]: https://graphql.org/learn/performance/?utm_source=chatgpt.com "Performance"
[28]: https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html?utm_source=chatgpt.com "GraphQL - OWASP Cheat Sheet Series"
[29]: https://www.apollographql.com/docs/graphos/routing/security/request-limits?utm_source=chatgpt.com "Request Limits - Apollo GraphQL Docs"
[30]: https://owasp.org/API-Security/editions/2023/en/0x11-t10/?utm_source=chatgpt.com "OWASP Top 10 API Security Risks – 2023"
[31]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html?utm_source=chatgpt.com "Session Management Cheat Sheet"
[32]: https://www.w3.org/WAI/ARIA/apg/?utm_source=chatgpt.com "ARIA Authoring Practices Guide | APG | WAI"
