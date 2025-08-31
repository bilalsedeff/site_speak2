# Universal Crawler + Voice AI: Ground-Truth Blueprint (for SiteSpeak & All Sites Built on It)

> This is the **source-of-truth** for how our crawler and voice AI must work so they handle “the world’s scenarios,” both inside **SiteSpeak** and in **every website published with SiteSpeak**. It binds product goals to concrete behaviors, protocols, and our codebase folders/services so any agent/dev can implement reliably.

---

## 0) First Principles (non-negotiables)

1. **Every generated site is self-describing.** The builder emits a **machine-readable site contract**: sitemap with `lastmod`, JSON-LD structured data, ARIA landmarks, standardized `data-*` action hooks, and a site-local API surface (REST/GraphQL). This lets us crawl incrementally, answer semantically, and **act** deterministically. Google’s guidelines explicitly recommend JSON-LD for structured data, and sitemaps support `lastmod` for delta refreshes. ([Google for Developers][1], [Sitemaps][2])

2. **Crawler is polite and standards-compliant.** We honor `robots.txt` (IETF **RFC 9309**), meta robots/X-Robots-Tag, and canonicals; we fetch only what’s allowed and what changed. ([RFC Editor][3], [Google for Developers][4], [MDN Web Docs][5])

3. **Voice is instant, interruptible, duplex.** We capture microphone audio with **AudioWorklet** (low-latency thread), encode short **Opus** frames (≈20 ms) and stream over **WebSocket** with proper ping/pong liveness (RFC 6455). We use a Realtime API for bidirectional audio+events. ([MDN Web Docs][6], [IETF Datatracker][7], [OpenAI Platform][8])

4. **Perceived latency is hidden.** We use **Speculation Rules** (`<script type="speculationrules">`) to **prefetch/prerender** the “obvious next page,” so navigation finishes while reasoning continues. ([MDN Web Docs][9])

---

## 1) Output Contract (what every SiteSpeak-built site must publish)

**Why:** So the crawler/agent never “guesses”. The HTML doubles as an API.

* **Sitemap:** `sitemap.xml` with **accurate `<lastmod>`** for each URL (and sitemap index for large sites). Our crawler fetches only changed pages. ([Google for Developers][10])
* **Structured data:** JSON-LD for `Product`, `FAQPage`, `BreadcrumbList`, etc., following Google’s structured data guidelines. ([Google for Developers][1])
* **ARIA landmarks:** `role="navigation" | "main" | "search" | "contentinfo"` improving both a11y and programmatic targeting. ([MDN Web Docs][11])
* **Action hooks:** deterministic **`data-action="cart.add"`**, **`data-action="checkout.submit"`** etc. (`data-*` is the standards-based way to embed custom semantics). We also emit **`actions.json`** (Action Manifest) at build time. ([MDN Web Docs][12])
* **Navigation hints:** **Speculation Rules** and `<link rel="prefetch|prerender">` so UX stays sub-second on “next likely” steps. ([MDN Web Docs][9])
* **Robots/canonicals:** respect `robots` meta/X-Robots-Tag; avoid blocking pages that **contain the rules**; set `rel="canonical"` consistently. ([Google for Developers][4], [MDN Web Docs][5])

**Folder owners:**

* `/publishing/app/siteContract.ts` (generates JSON-LD, actions.json, sitemap, speculation rules)
* `/sites/app` (enforces contract at publish)
* `/ai/actions/manifest/generator.ts` (consumes builder metadata; emits `actions.json`)

---

## 2) Crawler & Ingestion (works for SiteSpeak itself **and** every published site)

**Mission:** Render modern JS sites, extract semantics & actions, and **refresh only deltas**.

### Engine & etiquette

* **Headless rendering** with Playwright; proven for dynamic SPAs and reliable navigation/waits. (Crawlee/Apify wrap Playwright for production crawling.) ([playwright.dev][13], [docs.apify.com][14], [crawlee.dev][15])
* **Robots/canonicals/meta robots** enforced; **polite rates**; retry budgets; respect `nofollow` for traversal. ([RFC Editor][3], [Google for Developers][4])

### Incremental discovery

* **`/crawler/sitemapReader.ts`** parses `sitemap.xml` and **compares `<lastmod>`** to schedule diffs; idem for sitemap index files. ([Sitemaps][2], [Google for Developers][16])
* **`/crawler/deltaDetector.ts`** hashes rendered DOM + JSON-LD blocks; queues only changed shards.

### Render & extract

* **`/crawler/playwrightAdapter.ts`** loads pages with Playwright, waits for `domcontentloaded` + optional `networkidle` (configurable per site). ([playwright.dev][13], [Autify][17])
* **`/extractors/html.ts`** lifts visible text, headings, tables, **ARIA regions**, canonical URL. ([MDN Web Docs][18])
* **`/extractors/jsonld.ts`** parses JSON-LD for Product/FAQ/etc. (preferred by Google & cleanest for us). ([Google for Developers][1])
* **`/extractors/forms.ts`** records form schemas (labels, required, input names).
* **`/extractors/actions.ts`** indexes `data-action` hooks & selectors as callable verbs (bridge to tools). ([MDN Web Docs][12])

### Transform & load

* **`/transformers/cleaner.ts`** redacts PII, drops secrets/keys from content (no creds in KB).
* **`/transformers/splitter.ts`** chunks 200–800 tokens (semantic boundaries).
* **`/loaders/apiLoader.ts`** introspects site-local GraphQL/REST when present to ingest **ground-truth** entities instead of scraping HTML.

### Pipelines

* **`/pipelines/indexSite.pipeline.ts`**: full crawl (on first publish), then steady-state delta.
* **`/pipelines/updateDelta.pipeline.ts`**: webhook-triggered (publish/product change), plus periodic `lastmod` scan.

**Folder owners:** `/ai/ingestion/*` (all submodules above), plus `/services/_shared/queues` for scheduling.

---

## 3) Voice AI (real-time, barge-in, “acts while talking”)

**Mission:** A universal, low-latency voice UX that **streams** both ways and can **act** (navigate, click, transact) without blocking speech.

### Capture & send

* **AudioWorklet** for capture/VAD (separate audio thread → **very low latency**); request AEC/NS/AGC. ([MDN Web Docs][6])
* Encode **Opus** at 48 kHz in \~**20 ms** frames (sweet spot for interactive speech per RFC 6716). ([IETF Datatracker][7])
* Stream via **WebSocket**; maintain **ping/pong** keepalive; **pong mirrors ping payload** (RFC 6455). ([IETF Datatracker][19])

### Realtime model & events

* Use an **OpenAI Realtime** session over WS: send audio buffers, receive **partial transcripts, tool/plan deltas, and TTS audio**. ([OpenAI Platform][20])

### Barge-in & optimism

* **Barge-in:** If VAD turns active while TTS plays, **pause/duck** immediately and start a new upstream turn (standard voice agent behavior; Realtime supports full-duplex). ([OpenAI Platform][20])
* **Speculative nav:** As soon as planner predicts a safe, side-effect-free next page (e.g., products list), dispatch **optimistic `navigate.goto`** and continue reasoning; page is likely **already prefetched/prerendered**. ([MDN Web Docs][9])

### In-page action bridge

* A tiny runtime listens for `window.postMessage` events from the widget and dispatches clicks/fetches to elements by **selectors from `actions.json`**. Always set a strict `targetOrigin` to prevent cross-origin leaks. ([MDN Web Docs][21])

**Folder owners:**

* `/services/voice/turnManager.ts` (mic/VAD, Opus framing, barge-in) ([MDN Web Docs][6])
* `/services/voice/transport/wsServer.ts` (WS, ping/pong, backpressure) ([MDN Web Docs][22])
* `/ai/orchestrator/*` (graph, planner, tool-calling)
* `/ai/actions/dispatcher/widgetEmbedService.ts` (postMessage bridge) ([MDN Web Docs][21])

---

## 4) End-to-End Flows (SiteSpeak admin vs. published sites)

### A) **SiteSpeak (our admin/editor)**

1. **Publish** writes the **site contract** (sitemap, JSON-LD, `actions.json`, speculation rules). ([Google for Developers][1], [MDN Web Docs][23])
2. **Ingestion** runs **full index** then **delta** on content changes (webhooks + `lastmod`). ([Google for Developers][16])
3. **Voice widget** loads with **tenant/site keys** (no raw secrets client-side), opens WS to our Realtime back-end, streams audio/partials, **speculative navigation** on obvious steps. ([OpenAI Platform][24])

### B) **Published client sites (no-code customers)**

1. Their deployed bundle includes the **voice widget** + **postMessage bridge**; everything is **per-tenant isolated**.
2. **Per-site crawler** honors their robots/meta/canonicals; indexes only their public content; **deltas only** via `lastmod`. ([RFC Editor][3], [Google for Developers][4])
3. Their **Action Manifest** maps call-ables to DOM/API; the agent chooses tools via function-calling (orchestrator).
4. **Governance:** Admin toggles “non-crawlable” routes; secrets never leave the server; widget permissions (mic) follow browser policy.

---

## 5) Cross-Cutting SLAs & Protections

* **Latency targets:** first partial transcript ≤ **150 ms**; first audio token ≤ **300 ms**; optimistic nav immediately (prefetch/prerender). ([MDN Web Docs][25])
* **Crawl budget:** respect robots; throttle by host; backoff on 4xx/5xx; never fetch disallowed paths. ([RFC Editor][3])
* **Liveness:** WS **ping/pong** interval (e.g., 15 s), close on missed pongs, measure RTT. ([IETF Datatracker][19])
* **Content integrity:** prefer **JSON-LD** and **canonical** URLs to avoid duplicate/conflicting entries. ([Google for Developers][1])
* **Safety:** data minimization and PII trimming during ingestion; **targetOrigin** required for `postMessage`. ([MDN Web Docs][21])

---

## 6) Exact Folder/Service Responsibilities

### `/publishing`

* **`app/siteContract.ts`** – Assembles contract: JSON-LD blocks, ARIA audit, `actions.json`, `sitemap.xml`, and **Speculation Rules** script. ([Google for Developers][1], [MDN Web Docs][23])
* **`app/pipeline.ts`** – Build→Package→Deploy; triggers “indexed” webhooks.

### `/ai/ingestion`

* **`crawler/sitemapReader.ts`** – reads sitemap & **`lastmod`** diffs, schedules jobs. ([Sitemaps][2])
* **`crawler/playwrightAdapter.ts`** – renders JS sites with Playwright; robust waits. ([playwright.dev][13])
* **`crawler/deltaDetector.ts`** – DOM+JSON-LD hashing to avoid re-ingest.
* **`extractors/*`** – HTML, JSON-LD, forms, `data-action` hooks. ([MDN Web Docs][12])
* **`transformers/*`** – cleanup, chunking.
* **`loaders/apiLoader.ts`** – GraphQL/REST ingestion if present.
* **`pipelines/*.pipeline.ts`** – full vs. delta indexers.

### `/ai/actions`

* **`manifest/generator.ts`** – compiles `actions.json` from builder metadata.
* **`dispatcher/widgetEmbedService.ts`** – in-page **postMessage** bridge; strict `targetOrigin`. ([MDN Web Docs][21])

### `/ai/orchestrator`

* **`graphs/universalAgent.graph.ts`** – understand→retrieve→decide→tool→observe loop.
* **`executors/*`** – function-calling + action executor.
* **`planners/conversationFlowManager.ts`** – speculative nav, async planning.
* **`guards/*`** – privacy/security policies.

### `/services/voice`

* **`turnManager.ts`** – mic, **AudioWorklet** VAD, Opus frames, barge-in. ([MDN Web Docs][6])
* **`transport/wsServer.ts`** – WS upgrade, **ping/pong** (RFC 6455), backpressure. ([IETF Datatracker][19])
* **`visualFeedbackService.ts`** – mic levels, partials, action glow.

### `/api-gateway`

* **`/api/voice`** – session tokens for Realtime WS; **no static API keys** in client. ([OpenAI Platform][24])
* **`/api/kb`** – KB queries; health for crawler workers.

### `/monitoring`

* **`/health`, `/live`, `/ready`** – k8s probes and graceful drain semantics.

### `/analytics`

* **`eventsIngest.ts`** – idempotent, schema-validated events.
* **`reports.ts`** – voice SLA, tool success, RAG hit-rate, funnels.

---

## 7) Failure Modes & Mitigations

* **Robots disallow:** Respect and skip; if meta robots needed, don’t block via robots.txt (or you’ll never read meta). ([Google for Developers][4])
* **Duplicate pages:** use `rel="canonical"`; de-dupe in ingestion by canonical URL. ([Google for Developers][26])
* **Long-loading pages in Playwright:** switch wait strategy (`domcontentloaded` vs `networkidle`) and add element-based waits. ([Autify][17])
* **WS half-open:** rely on **ping/pong** and close handshake; drop to reconnection path. ([MDN Web Docs][22])
* **Voice stalls:** jitter buffer for downlink audio; auto-resume after brief gaps; barge-in always wins.
* **KB drift:** delta detector + `lastmod` + publish webhooks keep freshness without re-crawling all. ([Google for Developers][16])

---

## 8) Definition of Done (system-level)

* **Contract emitted** on publish (JSON-LD, ARIA pass, actions.json, sitemap with `lastmod`, speculation rules). ([Google for Developers][1], [MDN Web Docs][23])
* **Crawler** honors **RFC 9309** robots, meta robots, canonicals; **delta-only** ingestion. ([RFC Editor][3], [Google for Developers][4])
* **Voice**: first partial ≤ 150 ms; first audio ≤ 300 ms; **barge-in** ≤ 50 ms; WS pings; Opus 20 ms frames. ([MDN Web Docs][6], [IETF Datatracker][7])
* **Speculative nav** live on likely next step; page already prefetched/prerendered. ([MDN Web Docs][25])
* **Analytics** captures turn/latency/tool events; reports deliver p95s under 300 ms.

---

## 9) Why this will generalize to “all scenarios”

* **Standards over heuristics:** JSON-LD, ARIA, data-attributes, sitemaps, robots, canonicals—universal web contracts we can rely on across industries and templates. ([Google for Developers][1], [MDN Web Docs][11], [Sitemaps][2])
* **Headless rendering for SPAs:** Playwright executes JS like real users, covering JS-rendered catalogs, booking flows, dashboards. ([playwright.dev][13])
* **Realtime voice over WS:** AudioWorklet + Opus + WS + Realtime API is the portable stack for low-latency “speech-in, actions-out”. ([MDN Web Docs][6], [IETF Datatracker][7], [OpenAI Platform][24])
* **Prefetch/prerender** hides latency even when tasks chain (navigate now, reason while the page is warm). ([MDN Web Docs][25])

---

### Quick hand-off checklist (what each team/agent builds)

* **Publishing:** siteContract generator (JSON-LD, `actions.json`, speculation rules, sitemap).
* **Ingestion:** sitemapReader (lastmod), Playwright adapter, extractors (html/jsonld/forms/actions), deltaDetector, pipelines.
* **Orchestrator:** universal graph + speculative planner; function-calling to tools from Action Manifest.
* **Voice:** turnManager (AudioWorklet+VAD, Opus), wsServer (RFC 6455 pings), visual feedback.
* **API-gateway:** token-issuing for Realtime WS; KB endpoints.
* **Monitoring/Analytics:** health probes; SLA metrics pipeline.

With this blueprint, **SiteSpeak and every site built on it behave like an API the agent can crawl, understand, and act on in real-time**, while staying polite to the web, fast to the user, and maintainable for us.

[1]: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?utm_source=chatgpt.com "Intro to How Structured Data Markup Works"
[2]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[3]: https://www.rfc-editor.org/info/rfc9309?utm_source=chatgpt.com "Information on RFC 9309"
[4]: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag?utm_source=chatgpt.com "Robots Meta Tags Specifications | Google Search Central"
[5]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Robots-Tag?utm_source=chatgpt.com "X-Robots-Tag header - MDN - Mozilla"
[6]: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet?utm_source=chatgpt.com "AudioWorklet - MDN - Mozilla"
[7]: https://datatracker.ietf.org/doc/html/rfc6716?utm_source=chatgpt.com "RFC 6716 - Definition of the Opus Audio Codec"
[8]: https://platform.openai.com/docs/guides/realtime?utm_source=chatgpt.com "OpenAI Realtime API Documentation"
[9]: https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API?utm_source=chatgpt.com "Speculation Rules API - MDN - Mozilla"
[10]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?utm_source=chatgpt.com "Build and Submit a Sitemap | Google Search Central"
[11]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/landmark_role?utm_source=chatgpt.com "ARIA: landmark role - MDN - Mozilla"
[12]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/data-%2A?utm_source=chatgpt.com "HTML data-* global attribute - MDN"
[13]: https://playwright.dev/docs/navigations?utm_source=chatgpt.com "Navigations"
[14]: https://docs.apify.com/sdk/js/docs/examples/playwright-crawler?utm_source=chatgpt.com "Playwright crawler | SDK for JavaScript"
[15]: https://crawlee.dev/js/docs/quick-start?utm_source=chatgpt.com "Quick Start | Crawlee for JavaScript · Build reliable crawlers ..."
[16]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps?utm_source=chatgpt.com "Manage Your Sitemaps With Sitemap Index Files"
[17]: https://autify.com/blog/playwright-wait-for-page-to-load?utm_source=chatgpt.com "A Guide to Wait for Page to Load in Playwright - Autify"
[18]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles?utm_source=chatgpt.com "WAI-ARIA Roles"
[19]: https://datatracker.ietf.org/doc/html/rfc6455?utm_source=chatgpt.com "RFC 6455 - The WebSocket Protocol - IETF Datatracker"
[20]: https://platform.openai.com/docs/guides/realtime-conversations?utm_source=chatgpt.com "Realtime conversations - OpenAI API"
[21]: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage?utm_source=chatgpt.com "Window: postMessage() method - MDN - Mozilla"
[22]: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers?utm_source=chatgpt.com "Writing WebSocket servers - Web APIs | MDN"
[23]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/speculationrules?utm_source=chatgpt.com "<script type=\"speculationrules\"> - MDN"
[24]: https://platform.openai.com/docs/guides/realtime-websocket?utm_source=chatgpt.com "Realtime + WebSockets integration"
[25]: https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Speculative_loading?utm_source=chatgpt.com "Speculative loading - MDN - Mozilla"
[26]: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls?utm_source=chatgpt.com "How to specify a canonical URL with rel=\"canonical\" and ..."
