# KB Population & Ownership — Addendum to the Source-of-Truth

## 0) Who populates the KB?

### Agents/Services that write into KB

* **Publishing → Site Contract** (producer): emits `sitemap.xml` with accurate `<lastmod>`, page-level JSON-LD (preferred format), ARIA landmarks, and `actions.json` (Action Manifest). This is the **ground-truth blueprint** the crawler consumes. Google recommends JSON-LD for structured data; `sitemap.xml` provides `<lastmod>` for delta detection. ([Google for Developers][1], [sitemaps.org][2])
* **Ingestion (Crawler + Extractors + Transformers)** (writer):

  * Reads robots rules (polite), discovers URLs via **sitemap** (pref), observes canonicals, and fetches only changed pages using `<lastmod>`, ETag/If-None-Match, or Last-Modified/If-Modified-Since; computes per-page **content hash** to avoid work. ([datatracker.ietf.org][3], [sitemaps.org][2], [developer.mozilla.org][4])
  * Extracts **JSON-LD** entities first (facts), **HTML** text & headings next, then **forms** and **actions** from Action Manifest / deterministic data-attributes.
  * Splits, embeds, and upserts changed chunks only.
* **API Loaders (optional)** (writer):

  * Ingest stable entities from site-local **GraphQL/REST** when present (faster and cleaner than scraping).
* **No human needed** for routine population; admins only trigger **manual refresh** or set schedules.

> Exactly the same pipeline runs for **SiteSpeak** and for **all published client sites**. The only difference is **tenant/site scoping** and which host is crawled.

---

## 1) Where is the KB stored?

* **Primary store:** Postgres with **pgvector** for embeddings.

  * Index strategy: **HNSW** (best query latency/recall at higher memory) or **IVFFlat** (faster build, lighter memory; tune lists/probes). Use plain scan for very small tables or heavy filters. ([GitHub][5], [Amazon Web Services, Inc.][6], [Google Support][7])
  * Hybrid retrieval: Postgres **FTS (`tsvector`, `tsquery`)** alongside vector ANN, combined with **RRF** or score fusion. ([PostgreSQL][8], [plg.uwaterloo.ca][9])
* **Multi-tenant isolation:**

  * Either **separate schemas per tenant** or **pooled model with RLS** (`tenant_id`, `site_id` columns + row-level policies). Postgres RLS is built-in and designed for tenant isolation; AWS, Neon, and CrunchyData all recommend RLS for pooled tenancy. ([PostgreSQL][10], [docs.aws.amazon.com][11], [Neon][12], [Crunchy Data][13])
* **Embeddings model:** default **`text-embedding-3-small` (1536-d)** with opt-up to `…-large (3072-d)` when precision justifies cost. (Model dims & pricing in OpenAI docs/announcements.) ([platform.openai.com][14], [openai.com][15])

**Table recap (same as your base doc):**

* `kb_documents`, `kb_chunks`, `kb_embeddings`, `kb_actions`, `kb_forms`, `kb_stats` (scoped by `tenant_id`, `site_id`, `locale`, etc.).

---

## 2) Population flow: when & how (delta-only, not from zero)

### Triggers

1. **On Publish/Republish** (from builder): enqueue **Full Index** if first time; otherwise only changed URLs (from the Site Contract diff).
2. **Sitemap `<lastmod>` watcher** (15 min–hourly): enqueue URLs with newer timestamps; `lastmod` is authoritative for “page changed”. Google deprecated the old “sitemaps ping” endpoint—rely on `lastmod`. ([sitemaps.org][2], [Google for Developers][16])
3. **Webhooks** (e.g., product updated): enqueue **targeted delta** (just the affected pages/API nodes).
4. **ETag/Last-Modified** check at fetch time: avoid re-ingesting unmodified resources. ([developer.mozilla.org][4])

### Delta detector (idempotent upsert)

* Compute `page_hash` over cleaned text + JSON-LD + key attributes.
* Split to chunks (DOM/markdown-aware); compute `chunk_hash` for each.
* **Upsert only changed chunks**; keep stable chunk IDs when content hasn’t changed → avoids index churn and preserves citations.
* Tombstone deleted docs/chunks; maintain `version` + `is_deleted`.

### Canonicals & dedupe

* If the page declares **`rel="canonical"`**, index under that URL and dedupe alternates. This avoids duplicate KB rows and stabilizes citations. ([Google for Developers][17])

### Robots compliance

* Respect **RFC 9309** robots rules (they’re **not authorization** but are the politeness contract). Skip disallowed paths; treat meta robots/X-Robots-Tag as page-level signals. ([datatracker.ietf.org][3])

---

## 3) Closed-loop, site-encapsulated knowledge (it must “know everything”)

“Closed-loop” means the KB for a site is **complete for that site** yet **sealed from others**:

* **Scope boundary:** tenant/site scoping in storage, in queries, and in the **crawler frontier** (we only traverse URLs within the site’s allowed scope and canonicals). Robots and canonicals help keep that boundary clean. ([datatracker.ietf.org][3], [Google for Developers][17])
* **UI affordances:** index **actions** (`data-action`, `actions.json`) and **form schemas** so the orchestrator can **act**, not just answer.
* **Backend affordances:** if `/graphql` or REST exists, **introspect** and index **capabilities** (queries/mutations/routes), mapping to tool definitions (your Action Manifest → Tools bridge).
* **Static + dynamic:** store **page structure** (headings, ARIA regions), **component props** (when emitted by builder), and **entity facts** (from JSON-LD). JSON-LD is the preferred factual source. ([Google for Developers][1])
* **No secrets:** ingestion **redacts** tokens/keys/PII. KB is public-content & contract only.

**Result:** each site’s KB becomes a **self-contained “site brain”**: pages, sections, buttons (selectors), forms (fields/validation), entities (products, offers), and callable actions. Voice + Orchestrator ask the KB for **evidence + affordances** in one shot.

---

## 4) Who updates what, exactly? (responsibility matrix)

| Concern                   | Who writes                      | What is written                               | Where                                |
| ------------------------- | ------------------------------- | --------------------------------------------- | ------------------------------------ |
| URL discovery & freshness | `sitemapReader`                 | URL, `<lastmod>`, canonical, priority hints   | crawl queue; `kb_documents` metadata |
| Page fetch & change test  | `playwrightAdapter`             | ETag/Last-Modified, `page_hash`               | `kb_documents.version/hash`          |
| Semantics (facts)         | `jsonld.ts`                     | normalized Product/FAQ/etc.                   | `kb_chunks` text/facts + metadata    |
| Text/sections             | `html.ts`                       | visible text, `hpath`, headings, ARIA regions | `kb_chunks`                          |
| Actions                   | `actions.ts` + builder manifest | `kb_actions` (id, selector, params schema)    | `kb_actions`                         |
| Forms                     | `forms.ts`                      | fields, validations, method, action           | `kb_forms`                           |
| Embeddings                | `embedding worker`              | vectors per chunk (1536/3072-d)               | `kb_embeddings` (pgvector)           |

## *(All upserts are idempotent & chunk-scoped. Only changed rows are touched.)*

---

## 5) Scheduling & parallelism (so “periodically they go on a journey” without conflicts)

* **Queues:** one **site-scoped queue**; **per-URL** jobs deduplicated; `site_id` concurrency = 1–2 (avoid hitting the same page concurrently).
* **Locks:** Postgres **advisory locks** per `canonical_url` during write to prevent “double-upsert”.
* **Backoff:** polite crawl rates; respect robots; exponential backoff on 429/5xx. Robots is the politeness contract; not authorization. ([datatracker.ietf.org][3])
* **Periodic deltas:** cron (e.g., 15 min) looks at sitemap `<lastmod>`, then the **delta pipeline** only touches changed pages. ([sitemaps.org][2])
* **Event-driven updates:** on **publish** or **product change**, fire an **outbox/event** and enqueue targeted re-index. (Transactional outbox/CDC are standard ways to keep downstream indexes consistent.) ([microservices.io][18], [martinfowler.com][19], [Confluent][20])

---

## 6) Retrieval contracts (so voice can “act while talking”—fast)

* **Hybrid search**: vector ANN (pgvector HNSW/IVFFlat) + Postgres FTS (`tsvector/tsquery`), fused with **RRF** → better recall for exact terms like SKUs or codes while staying semantic. ([GitHub][5], [PostgreSQL][8], [plg.uwaterloo.ca][9])
* **Rerank**: cross-encoder rerank on top-50/100 for quality under tight latency budgets.
* **Output always includes**: snippets **and** nearby **actions/forms** (affordances), with canonical URL for citation and hpath for UI anchoring.
* **Streaming**: return early top-k so the voice can start speaking while planning continues.

---

## 7) SiteSpeak vs. published client sites (same brain, different tenants)

* **Same pipeline, same contract**: builder emits Site Contract; crawler/ingester obey REP & `<lastmod>`; KB stores chunks/embeddings/actions/forms; orchestrator consumes. (Identical mechanics.) ([Google for Developers][1], [sitemaps.org][2])
* **Isolation**: **RLS** or per-schema isolation—no cross-tenant retrieval; **canonical URL** keeps duplicate structures from bleeding between hosts. ([PostgreSQL][10])
* **Admin controls**: site admin can mark routes non-crawlable (we respect robots/meta), set refresh cadence, and see freshness/coverage dashboards.
* **Key management**: client sites use **our** embed token; the widget never sees raw provider keys.

---

## 8) What it means to be “parallel info-keeping”

The KB holds **parallel layers** for the same page:

* **Surface:** clean text + headings + ARIA regions (for answering & citation).
* **Facts:** JSON-LD entities (for precise attributes like price, SKU, brand). ([Google for Developers][1])
* **Affordances:** actions (selectors + params) and forms (fields + validations) for **doing**.
* **Backend:** optional API capability map (queries/mutations/routes) derived at publish.

These layers are **linked by stable IDs** (`doc_id`, `chunk_id`, `action_id`, `form_id`) so a change to “Buy button” updates **only** the `kb_actions` row, leaving text chunks intact. A copy change updates the affected chunks only. A product price change updates the JSON-LD-derived chunk rows only. **No full reindex** needed.

---

## 9) Operational guardrails

* **Robots/REP**: obey **RFC 9309**; treat “not auth” note seriously—never use robots to gate internal/admin data; use real auth for that. ([datatracker.ietf.org][3])
* **Canonicalization**: always honor `rel="canonical"` when deduping; Google’s docs explain why. ([Google for Developers][17])
* **Conditional fetch**: ETag/Last-Modified to minimize bandwidth and avoid re-ingest. ([developer.mozilla.org][4])
* **Index choices**: choose HNSW vs IVFFlat based on latency/memory/build-time tradeoffs, per pgvector docs and independent deep-dives. ([GitHub][5], [Amazon Web Services, Inc.][6])
* **Hybrid retrieval**: Postgres FTS + ANN; RRF is a proven rank fusion method. ([PostgreSQL][8], [plg.uwaterloo.ca][9])

---

## 10) Concretely: which code writes/touches what?

* **`/publishing/app/siteContract.ts`**
  Emits: `sitemap.xml` (`<lastmod>`), JSON-LD, `actions.json`, ARIA audit, speculation hints. (KB depends on these.) ([sitemaps.org][2], [Google for Developers][1])
* **`/ai/ingestion/crawler/sitemapReader.ts`**
  Reads sitemap + `<lastmod>`, schedules deltas. ([sitemaps.org][2])
* **`/ai/ingestion/crawler/playwrightAdapter.ts`**
  Fetches pages; handles conditional requests (ETag/Last-Modified) and computes `page_hash`. ([developer.mozilla.org][4])
* **`/ai/ingestion/extractors/jsonld.ts`**
  Preferred fact source (Product/FAQ/Offer/etc.). ([Google for Developers][1])
* **`/ai/ingestion/extractors/html.ts`**
  Visible text + hpaths + ARIA; de-boilerplate.
* **`/ai/ingestion/extractors/actions.ts` & `/actions/manifest/generator.ts`**
  Deterministic action IDs/selectors/param schemas from builder hooks.
* **`/ai/ingestion/extractors/forms.ts`**
  Fields, validations, submit URLs.
* **`/ai/ingestion/transformers/cleaner.ts`**
  Redacts secrets/PII.
* **`/ai/ingestion/transformers/splitter.ts`**
  Chunking (200–800 tokens) + `chunk_hash`.
* **`/ai/retrieval/vector-store/pgvectorClient.ts`**
  Upsert embeddings; HNSW/IVFFlat; hybrid FTS; filters by tenant/site/doctype/locale. ([GitHub][5], [PostgreSQL][8])
* **`/ai/orchestrator/*`**
  Calls `KB.search()`; consumes `actions/forms`; performs tool-calling.
* **`/api-gateway/http/routes/kb`**
  Exposes `/api/kb/search` (JWT tenant auth, rate-limit).

---

## 11) “Who is responsible” (quick checklist you can paste into issues)

* **Publishing** team: Site Contract emission complete and valid on every publish (JSON-LD, `actions.json`, sitemap `<lastmod>`, ARIA).
* **Ingestion** team: delta-only pipeline, robots/canonicals/ETag respected; idempotent chunk upsert; per-site queue & locks.
* **Retrieval** team: pgvector HNSW/IVFFlat indexes, Postgres FTS fusion with **RRF**, reranker; filters & streaming.
* **Orchestrator/Voice** team: fast path (streaming & speculative), action execution, confirmations.
* **Ops**: RLS or per-schema isolation; `/ready` verifies DB/Redis/indexes; metrics on freshness, hit-rate, P95 latency.

---

## 12) Definition of Done (population & closed loop)

* **Delta indexing only** via sitemap `<lastmod>` + conditional fetch; **no full wipes** unless schema changes. ([sitemaps.org][2], [developer.mozilla.org][4])
* **Every page element discoverable** (JSON-LD entities, actions, forms, sections). JSON-LD present where applicable. ([Google for Developers][1])
* **Per-site isolation** (RLS or per-schema). ([PostgreSQL][10])
* **Hybrid + rerank** under P95 ≤ 250 ms; streaming first tokens to voice immediately.
* **Citations** include canonical URLs; dedupe using `rel="canonical"`. ([Google for Developers][17])
* **Closed loop** dashboards: freshness (age vs `<lastmod>`), coverage (docs/chunks/actions/forms), and RAG hit-rate.

---

### TL;DR

* **Who populates?** Publishing emits the **contract**; **Ingestion** (crawler + ETL) writes **delta-only** rows; optional **APIs** enrich entities.
* **Where stored?** Postgres + **pgvector** (HNSW/IVFFlat), hybrid with Postgres FTS, per-tenant isolation via **RLS** or per-schema. ([GitHub][5], [PostgreSQL][8])
* **How kept fresh?** **Sitemap `<lastmod>`**, **ETag/Last-Modified**, **hash**, **webhooks**, idempotent upserts; **canonicals** for dedupe. ([sitemaps.org][2], [developer.mozilla.org][4], [Google for Developers][17])
* **Closed loop?** Yes—site-scoped; contains **facts + text + actions + forms + optional API map**; nothing crosses tenants; voice acts on surfaced **affordances** instantly.

If you want this codified as acceptance tests, I can generate a **KB Population Test Pack** (Playwright fixtures + seed sites) that asserts: (1) JSON-LD → chunks, (2) `<lastmod>` delta only, (3) canonical de-dupe, (4) actions/forms round-trip, (5) RLS isolation, (6) HNSW vs IVFFlat latency budget.

[1]: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?utm_source=chatgpt.com "Intro to How Structured Data Markup Works"
[2]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[3]: https://datatracker.ietf.org/doc/rfc9309/?utm_source=chatgpt.com "RFC 9309 - Robots Exclusion Protocol"
[4]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag?utm_source=chatgpt.com "ETag header - MDN - Mozilla"
[5]: https://github.com/pgvector/pgvector?utm_source=chatgpt.com "pgvector/pgvector: Open-source vector similarity search for ..."
[6]: https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/?utm_source=chatgpt.com "Optimize generative AI applications with pgvector indexing"
[7]: https://support.google.com/webmasters/thread/198003552/help-with-using-canonical-tag?hl=en&utm_source=chatgpt.com "Help with using canonical tag - Google Search Central Community"
[8]: https://www.postgresql.org/docs/current/textsearch-controls.html?utm_source=chatgpt.com "Documentation: 17: 12.3. Controlling Text Search"
[9]: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf?utm_source=chatgpt.com "Reciprocal Rank Fusion outperforms Condorcet and ... - PLG"
[10]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html?utm_source=chatgpt.com "Documentation: 17: 5.9. Row Security Policies"
[11]: https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html?utm_source=chatgpt.com "Row-level security recommendations"
[12]: https://neon.com/postgresql/postgresql-administration/postgresql-row-level-security?utm_source=chatgpt.com "PostgreSQL Row-Level Security"
[13]: https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres?utm_source=chatgpt.com "Row Level Security for Tenants in Postgres"
[14]: https://platform.openai.com/docs/guides/embeddings/second-generation-models?utm_source=chatgpt.com "Vector embeddings - OpenAI API"
[15]: https://openai.com/index/new-embedding-models-and-api-updates/?utm_source=chatgpt.com "New embedding models and API updates"
[16]: https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping?utm_source=chatgpt.com "Sitemaps ping endpoint is going away"
[17]: https://developers.google.com/search/docs/crawling-indexing/canonicalization?utm_source=chatgpt.com "What is URL Canonicalization | Google Search Central"
[18]: https://microservices.io/patterns/microservices.html?utm_source=chatgpt.com "Pattern: Microservice Architecture"
[19]: https://martinfowler.com/articles/201701-event-driven.html?utm_source=chatgpt.com "What do you mean by “Event-Driven”?"
[20]: https://www.confluent.io/blog/how-change-data-capture-works-patterns-solutions-implementation/?utm_source=chatgpt.com "How Change Data Capture (CDC) Works"
