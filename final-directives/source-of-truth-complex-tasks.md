# Voice Agent Source-of-Truth — Complex Task Playbook

## *use-case: “Find me EDM/House concerts by the sea near me this summer and add 2 tickets to cart.”*

> This is the ground-truth doc for how our **universal voice agent** handles multi-step, ambiguous, side-effecting tasks on **any SiteSpeak-built site** (including SiteSpeak itself). It ties the UX to concrete services/files, preconditions (what must already be indexed), online planning & tool-calling (LangGraph), safety/confirmations, performance targets, and telemetry.

---

## 0) Preconditions (“what must be ready before the user speaks”)

**Site Contract is emitted at publish time** (by the builder):

* `sitemap.xml` (+ accurate `<lastmod>`) so we can do **delta** refreshes. ([Google for Developers][1], [sitemaps.org][2])
* Page-level **JSON-LD** structured data for events/tickets (Schema.org `MusicEvent`, `Event`, `Offer`, `Place`), which we treat as the primary source of truth for facts (dates, genres, location, prices). ([Google for Developers][3], [schema.org][4])
* Deterministic **action hooks** (`data-action="cart.add"`, `...="ticket.add"`) in the DOM and a generated `actions.json` manifest (so the agent can *act* deterministically).
* (Optional but recommended) a site-local **/graphql** or REST surface to read catalog/tickets without scraping.

**Crawler & Ingester have already run (delta-only):**

* URL discovery via sitemap; **robots** honored (polite; not authorization), **canonicals** respected. ([datatracker.ietf.org][5])
* Conditional fetch using ETag/Last-Modified and `<lastmod>` so we only touch changed pages. ([Google for Developers][6])
* Extracted layers per page: text/sections, JSON-LD facts for `Event/MusicEvent/Offer/Place`, forms (checkout), actions (selectors), and optional API capability map. Google explicitly recommends **JSON-LD** for structured data. ([Google for Developers][3])
* KB populated in Postgres+**pgvector** with **HNSW/IVFFlat** indexes; FTS is ready for hybrid retrieval. (HNSW = better query recall/latency; IVFFlat = faster/lighter to build.) ([GitHub][7], [tembo.io][8])

---

## 1) Online flow (what happens when the user speaks)

### 1.1 Realtime, duplex UX

* Browser mic → **AudioWorklet** low-latency capture; client streams \~20 ms Opus frames over **WebSocket** to our Realtime session; server streams partial transcripts + tool/plan deltas + TTS back. ([platform.openai.com][9])
* The model/agent supports barge-in and partials; the user hears the first response within \~300 ms while planning continues. (OpenAI Realtime provides event types for audio buffers and incremental responses.) ([platform.openai.com][9])

### 1.2 Intent understanding & slot frame (Planner)

* Parse intent = `buy_tickets`.
* Extract/normalize slots:

  * **Time**: “this summer” → resolve to season window in the site’s locale/timezone (e.g., Jun–Aug north-hemisphere).
  * **Geo**: “near me” → use site/session location (Geolocation permission or configured city).
  * **Context**: “by the sea” → a *place* or *venue feature* filter (waterfront/beach/marina synonyms).
  * **Genre**: EDM/House (taxonomy terms).
  * **Quantity**: 2 tickets; **Ticket type**: unknown → will ask if multiple types exist.
* Planner emits a structured **plan trace** (goal, slots, missing\_slots, constraints).

### 1.3 Candidate generation (Retriever)

* Call **KB.search** with filters: `{doctype: Event|MusicEvent, date_range: summer, geo: near(user), genre: edm|house, facets: place_features: waterfront}`.
* Retrieval is **hybrid**: vector ANN (pgvector HNSW/IVFFlat) + Postgres FTS; merge with **Reciprocal Rank Fusion (RRF)**; rerank top-k with a cross-encoder for quality. ([GitHub][7], [tembo.io][8], [OpenSearch][10], [dl.acm.org][11])
* Results include **actions/forms** near the snippet (e.g., `ticket.add`, `cart.view`) so we can act immediately.

### 1.4 Missing info → clarifications (dialog policy)

* If multiple ticket types exist (VIP/Standard) or seating sections, the agent asks a **single, crisp** question; it keeps streaming context (e.g., “I found 3 seaside EDM shows within 10 km. Do you want VIP or Standard for Sunset Beats on Jul 12?”).

### 1.5 Safe actions & confirmations (Tool-calling)

* LangGraph graph: `understand → retrieve → decide → callTool → observe → (loop) → finalize`.
* Side-effecting steps (cart/checkout) require a **confirm** edge before execution. LangGraph is built for controllable, stateful agents with human-in-the-loop checkpoints. ([LangChain AI][12], [LangChain][13])
* Obvious, safe steps (e.g., navigate to the event detail) are executed **speculatively** while the model continues reasoning—hiding latency.

### 1.6 Add to cart

* Execute `ticket.add` from `actions.json` with `{eventId, offerId, qty:2, ticketType}`; observe DOM/API response; if capacity error, propose alternatives.
* Then propose: “Added 2 Standard tickets for Sunset Beats on Jul 12. Want to checkout now or keep browsing?”

---

## 2) Who does what (services & files that run)

## **Voice / transport**

* `/services/voice/turnManager.ts` — mic/VAD, partials, barge-in, backpressure.
* `/services/voice/transport/wsServer.ts` — WS upgrades, ping/pong, session → Realtime bridge. (OpenAI Realtime supports audio buffer append and event streaming.) ([platform.openai.com][9])

## **Orchestrator (LangGraph)**

* `/ai/orchestrator/graphs/universalAgent.graph.ts` — node/edge graph (stateful). ([LangChain AI][12])
* `/ai/orchestrator/planners/conversationFlowManager.ts` — slot frame; missing-slot prompts; speculative nav policy.
* `/ai/orchestrator/executors/functionCalling.ts` — OpenAI tool/structured outputs; confirmation gate for side-effects.
* `/ai/orchestrator/executors/actionExecutor.ts` — dispatch `actions.json` tools to DOM/API; idempotency + retries.

## **Retrieval (KB)**

* `/ai/retrieval/vector-store/pgvectorClient.ts` — ANN query (HNSW/IVFFlat), filters (tenant/site/locale/time), **hybrid** with Postgres FTS, **RRF** merge, rerank. ([GitHub][7], [tembo.io][8], [OpenSearch][10])

## **KB ingestion (already done beforehand)**

* `/ai/ingestion/crawler/sitemapReader.ts` — discover/compare `<lastmod>`. ([sitemaps.org][2])
* `/ai/ingestion/crawler/playwrightAdapter.ts` — fetch with ETag/Last-Modified; robots respected (RFC 9309). ([datatracker.ietf.org][5], [Google for Developers][6])
* `/ai/ingestion/extractors/jsonld.ts` — parse **Schema.org** `Event/MusicEvent/Offer/Place`; genres, dates, geo. ([schema.org][14])
* `/ai/actions/manifest/generator.ts` — action registry from builder data.

## **Publishing**

* `/publishing/app/siteContract.ts` — JSON-LD, `actions.json`, sitemap `<lastmod>`, ARIA audit.

## **API-gateway**

* `/api-gateway/http/routes/voice` — session tokens for Realtime;
* `/api-gateway/http/routes/kb` — search/suggest endpoints (tenant-scoped).

## **Monitoring & Analytics**

* `/monitoring/healthController.ts` — `/live`, `/ready`, `/health`.
* `/analytics/eventsIngest.ts` — voice/turn latency, tool success, RAG hit-rate.

---

## 3) Data the crawler/KB must have captured for this use-case

* **Events** (`Event`/`MusicEvent`) with: `startDate`, `endDate`, `location` (with `Place`→`geo`), `description` (keywords like “beach”, “seaside”, “coast”, “marina”), `genre`/`musicBy`. ([schema.org][14])
* **Offers/Tickets** (`Offer`): price, availability, category (“VIP”, “Standard”), purchase URLs. ([schema.org][15])
* **Place features**: waterfront synonyms embedded as text & in embeddings (so “by the sea” matches).
* **Actions**: `ticket.add`, `cart.view`, `checkout.start` (selectors + param schemas).
* **Forms**: checkout form schema (fields/validations).

---

## 4) Dialogue + action timeline (happy path)

1. **T0s**: user speaks → partial transcript; agent: “Got it—looking for EDM/House concerts near you this summer by the sea…” (streams while planning). ([platform.openai.com][9])
2. **T0.1–0.3s**: speculative navigate to `/events` (safe); KB hybrid search+rerank runs in parallel. **RRF** merges ANN+FTS; top-k arrives. ([OpenSearch][10])
3. **T0.5–1.0s**: agent summarizes: “I found Sunset Beats on Jul 12 at Marina Park (3 km). VIP or Standard?”
4. **User**: “Standard.” → **tool call** `ticket.add({eventId, offerId:standard, qty:2})`; observe success.
5. **Agent**: “Added 2 Standard tickets. Proceed to checkout or keep browsing?”

**Confirmation policy**: Any side-effect (cart/checkout) requires an **explicit confirm** edge in the graph (LangGraph human-in-the-loop pattern). ([LangChain][13])

---

## 5) Edge cases & fallbacks

* **Ambiguous “summer”** at hemisphere boundaries → agent asks: “Do you mean June–August for your region?”
* **Inventory changed** during add → catch error, re-query `Offer` via KB/API, present alternates.
* **No “seaside” matches** → relax place filter; explain: “Nothing by the sea within 10 km; closest is 18 km. Want that?”
* **Geo denied** → fall back to configured city; disclose: “Using Istanbul as your location—OK?”
* **Robots-disallowed** ticket page → we **don’t** index; rely on public catalog or site API; we never bypass REP (robots.txt is a politeness standard, not auth). ([datatracker.ietf.org][5])

---

## 6) Security & privacy

* **Tenant isolation** at query/storage level (RLS or per-schema).
* **postMessage bridge** uses strict `targetOrigin` for in-page actions.
* **Robots/meta/canonicals** honored; **no secrets** ever stored in KB; structured data pages shouldn’t be blocked (Google guideline). ([Google for Developers][16])

---

## 7) Performance targets (SLA)

* **First partial** (ASR) ≤ **150 ms**; **first spoken token** ≤ **300 ms** (Realtime streaming). ([platform.openai.com][9])
* **KB retrieval** (hybrid+rerank) P95 ≤ **250 ms** (HNSW preferred for big catalogs). ([GitHub][7])
* **Speculative nav** started < **100 ms** after intent classification.

---

## 8) Telemetry we must emit

* `voice.first_response_ms`, `asr.partial_latency_ms`, `tts.stream_start_ms`.
* `retrieval.vector_ms`, `retrieval.fts_ms`, `rerank_ms`, `rrf_used`. ([OpenSearch][10])
* `tool.ticket_add.success/error`, `cart.items_count`.
* `rag.hit_rate` (did snippets support the answer?), `freshness_hours` (doc vs. `<lastmod>`). ([sitemaps.org][2])

---

## 9) Definition of Done (for this & similar complex tasks)

* Builder emits **Event/Offer JSON-LD** for concerts/tickets; sitemap `<lastmod>` correct. ([Google for Developers][3])
* Ingestion honors **robots (RFC 9309)** + conditional fetch; delta-only updates; actions/forms captured. ([datatracker.ietf.org][5])
* KB hybrid retrieval (**pgvector HNSW/IVFFlat** + FTS + **RRF**) with rerank; returns snippets **and** actionable hooks. ([GitHub][7], [tembo.io][8], [OpenSearch][10])
* Orchestrator (LangGraph) runs **confirm gates** for side-effects; speculative nav; streaming voice via **Realtime** WS. ([LangChain AI][12], [LangChain][13], [platform.openai.com][9])
* UX: single clarification for missing slot (ticket type); **cart add succeeds**; checkout offered.

---

### Why this generalizes

* Facts & affordances come from **standards**: JSON-LD (`Event/MusicEvent/Offer`) + sitemap `<lastmod>` + robots/canonicals → works for any site we generate. ([Google for Developers][3], [schema.org][4], [sitemaps.org][2])
* Planning/execution uses **LangGraph** (stateful, human-in-the-loop), and **OpenAI Realtime** for instant, duplex voice. ([LangChain AI][12], [LangChain][13], [platform.openai.com][9])
* Retrieval uses **pgvector** + **RRF** hybridization, a well-established approach to improve recall/precision for semantic + exact filters (genres, SKUs, dates). ([GitHub][7], [OpenSearch][10])

This is the exact behavior we’ll ship across **SiteSpeak** and all **published client sites**—same pipeline, same agent brain, tenant-scoped data.

[1]: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?utm_source=chatgpt.com "Build and Submit a Sitemap | Google Search Central"
[2]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[3]: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?utm_source=chatgpt.com "Intro to How Structured Data Markup Works"
[4]: https://schema.org/MusicEvent?utm_source=chatgpt.com "MusicEvent - Schema.org Type"
[5]: https://datatracker.ietf.org/doc/html/rfc9309?utm_source=chatgpt.com "RFC 9309 - Robots Exclusion Protocol - IETF Datatracker"
[6]: https://developers.google.com/search/blog/2006/04/using-lastmod-attribute?utm_source=chatgpt.com "Using the lastmod attribute | Google Search Central Blog"
[7]: https://github.com/pgvector/pgvector?utm_source=chatgpt.com "pgvector/pgvector: Open-source vector similarity search for ..."
[8]: https://tembo.io/blog/vector-indexes-in-pgvector?utm_source=chatgpt.com "Vector Indexes in Postgres using pgvector: IVFFlat vs HNSW"
[9]: https://platform.openai.com/docs/guides/realtime-conversations?utm_source=chatgpt.com "Realtime conversations - OpenAI API"
[10]: https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/?utm_source=chatgpt.com "Introducing reciprocal rank fusion for hybrid search"
[11]: https://dl.acm.org/doi/10.1145/1571941.1572114?utm_source=chatgpt.com "Reciprocal rank fusion outperforms condorcet and individual ..."
[12]: https://langchain-ai.github.io/langgraph/?utm_source=chatgpt.com "LangGraph - GitHub Pages"
[13]: https://www.langchain.com/langgraph?utm_source=chatgpt.com "LangGraph"
[14]: https://schema.org/Event?utm_source=chatgpt.com "Event - Schema.org Type"
[15]: https://schema.org/Offer?utm_source=chatgpt.com "Offer - Schema.org Type"
[16]: https://developers.google.com/search/docs/appearance/structured-data/sd-policies?utm_source=chatgpt.com "General Structured Data Guidelines | Google Search Central"
