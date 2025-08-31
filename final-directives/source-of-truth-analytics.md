# Source-of-Truth: `/services/analytics`

## *scope: privacy-safe event ingestion, durable storage, and fast reporting for voice+agent UX*

> **Owner note (my voice):** Analytics is my ground truth for product and SLAs. I want **schema-validated events**, **idempotent ingestion**, and **sub-second rollups** for dashboards (voice latency, tool usage, conversions). We align names with **OpenTelemetry semantic conventions**, validate with **JSON Schema**, and keep timestamps in **RFC 3339**. We assume **at-least-once** delivery and dedupe with event IDs.

---

## 0) Design goals (non-negotiables)

* **Schema first.** Every event validates against a JSON Schema; custom events use **self-describing JSON** (Snowplow/Iglu pattern) so payloads carry their schema key/version. ([docs.snowplow.io][1], [Medium][2])
* **Common naming.** Adopt **OpenTelemetry semantic conventions** for event/log attributes where possible; extend thoughtfully for business fields. ([OpenTelemetry][3], [betterstack.com][4])
* **Correct time.** `occurred_at` and `received_at` are **RFC 3339** timestamps (BCP-47 locale elsewhere). Track timezone/offset; RFC 9557 updates RFC 3339 nuance for `Z`. ([datatracker.ietf.org][5], [rfc-editor.org][6])
* **At-least-once + idempotency.** Duplicates happen (queues, retries). We design for **idempotent** consumers with `event_id`/fingerprints and de-dup windows. ([learn.microsoft.com][7], [Medium][8], [Medium][9])
* **Fast aggregates.** Columnar OLAP (e.g., ClickHouse) is ideal for large event volumes and sub-second aggregates; start with Postgres if small, but keep a ClickHouse adapter ready. ([ClickHouse][10], [CelerData][11])

---

## Directory

```plaintext
/services/analytics
  eventsIngest.ts   // HTTP/WS ingestion, schema validation, dedupe, enqueue, store
  reports.ts        // query helpers, rollups, funnels, SLAs, exports
```

---

## 1) `eventsIngest.ts` — Event ingestion & durability

### Responsibilities

* Accept events over **HTTP** (`POST /api/analytics/events`; gzip/brotli accepted) and optionally **WS** (batched JSON frames).
* Validate each event against a **JSON Schema** (self-describing optional) and normalize names to our **OTel-aligned** attribute map. ([OpenTelemetry][12], [betterstack.com][4])
* Enforce **idempotency**: drop duplicates by `event_id` (UUID v4) and a short-horizon fingerprint (`tenant_id + site_id + event_name + occurred_at ±ε + hash(attrs)`). ([learn.microsoft.com][7], [Medium][8])
* Attach **server-side context** (`received_at`, geo by POP/country, SDK version, consent flags).
* Write to an **append-only raw table/stream**; fan-out to a processing queue (BullMQ) for enrichment → columnar store roll-up.

### Event envelope (canonical)

```json
{
  "schema": "iglu:app.sitespeak/voice_turn/jsonschema/1-0-0",   // optional self-describing key
  "event_id": "uuid",
  "event_name": "voice.turn_started",                            // OTel-style kebab/ dot-case allowed
  "occurred_at": "2025-08-24T12:34:56.789+03:00",                // RFC 3339
  "tenant_id": "t_123",
  "site_id": "s_456",
  "session_id": "ssn_...",
  "user_id": "anon_...",                                         // pseudonymous
  "source": "web|widget|voice_ws|server",
  "attributes": { "...": "OTel-aligned attributes, plus business fields" },
  "context": {
    "page": {"url": "...", "referrer": "..."},
    "device": {"ua": "...", "viewport": {"w": 1920, "h": 1080}},
    "locale": "en-US",
    "consent": {"analytics": true, "ads": false}
  }
}
```

* **Self-describing JSON** (`schema` field) follows Iglu: vendor/name/format/version; lets us validate with the exact version used by the tracker. ([docs.snowplow.io][13])
* **Attribute naming**: prefer OTel keys where relevant (`enduser.id`, `http.user_agent`, `network.peer.address`, etc.) and put business specifics under `attributes.*`. ([OpenTelemetry][3])

### Transport & API

* `POST /api/analytics/events` supports **batch**: `{ events: Event[] }`. Return `{ accepted, duplicates, rejected[] }`.
* Require `Content-Encoding: gzip|br` for batches > 50 KB.
* **Clock skew**: accept `occurred_at` up to ±24 h skew; store `received_at` when seen.

### Storage model

* **Raw log**: immutable append table (Postgres) with GIN on `event_id`, and time-partitioned by `received_at` for retention.
* **OLAP sink**: stream to **ClickHouse** (or equivalent) for fast queries on `event_name`, `tenant_id`, `site_id`, times, buckets. Columnar stores excel at wide, aggregating queries with high compression. ([ClickHouse][10])

### Dedupe/idempotency

* Treat pipeline as **at-least-once**; duplicates can occur by design in cloud queues/streams (Kafka/Event Hubs, etc.). Enforce **idempotent consumer** pattern using `event_id` and/or natural keys. ([learn.microsoft.com][7], [Medium][8])

### Privacy & PII

* **Data minimization** (store only what we need). No raw emails/phones; if present in free-text, redact before commit. (This mirrors widely recommended logging/privacy practices.)
* IP: store at coarse granularity or derived geo only (country/city), not full IP.

### OpenTelemetry interop

* Optionally forward **OTel-formatted logs/events** to our collector; custom attributes remain consistent with OTel semantics. ([OpenTelemetry][3])

### Success criteria

* P95 ingest < **60 ms** for single events; < **200 ms** for 100-event batches (excluding network).
* Duplicate rate < **0.5%** post-dedupe on retries.
* 100% events validate (or are rejected with clear error + schema path).

---

## 2) `reports.ts` — Query helpers, rollups & SLAs

### Responsibilities of reports

* Provide programmatic **report builders** over the OLAP store for product, ops, and SLA dashboards.
* Maintain **materialized rollups** (time-bucketed) to keep queries under 100–300 ms for typical tenants.
* Export query primitives to the UI (admin dashboards).

### Canonical metrics & reports

1. **Voice UX SLAs**

   * `p50/p95/p99 voice.first_response_ms` (start speech → first token/audio)
   * `barge_in_count`, `barge_in_to_pause_ms`
   * `asr.partial_latency_ms`
     (These map to our voice transport & turn manager events.)

2. **Agentic execution**

   * Tool call counts by `tool.name`, **success/error** rates
   * **Navigation optimism** rate (optimistic `goto` vs. confirmed)
   * Average **tool chain length** per user task

3. **KB effectiveness**

   * **RAG hit rate** (% turns with ≥1 relevant chunk)
   * MRR/MAP proxy (click-through on suggested items vs. vector rank)
   * Content freshness (age since `lastmod` vs. crawl time)

4. **Commerce/booking funnels** (where applicable)

   * `view → add_to_cart → checkout → order_placed`
   * Drop-offs per step; coupon usage; booking holds vs. confirms

5. **Errors & capacity**

   * Per-endpoint error rates, **WS ping RTT**, backpressure drops
   * Queue lag, consumer throughput

> **Why columnar?** Column stores read only the columns needed and compress well, so **aggregations on large volumes** are fast (what we need for funnels/latencies). ([ClickHouse][10])

### Query API (TypeScript)

```ts
export type TimeGrain = '1m'|'5m'|'1h'|'1d';

export interface SeriesQuery {
  tenantId: string;
  siteId?: string;
  metric: 'voice.first_response_ms.p95'|'tool.calls'|'funnel.checkout';
  from: string; // RFC 3339
  to: string;   // RFC 3339
  grain: TimeGrain;
  filters?: Record<string, string|number|boolean>;
}

export interface AnalyticsReports {
  timeseries(q: SeriesQuery): Promise<Array<{t:string,value:number}>>;
  funnel(tenantId: string, steps: string[], from: string, to: string): Promise<{counts:number[], rates:number[] }>;
  topN(tenantId: string, metric: 'tools'|'errors'|'queries', n: number, from: string, to: string): Promise<Array<{key:string, value:number}>>;
}
```

### Rollups & storage notes

* **Materialized views** (or ClickHouse AggregatingMergeTree) for hot metrics at `1m/5m/1h` grains; recompute on arrival triggers. Columnar engines support this natively for speed. ([ClickHouse][14])
* Timestamps are **RFC 3339** strings in API; database stores as native types. ([datatracker.ietf.org][5])

### OpenTelemetry alignment

* When exporting to OTel backends, map metrics to OTel semantic names and attach attributes consistently (tenant/site/tool). This keeps dashboards portable. ([OpenTelemetry][3])

### Success criteria of reports

* P95 report latency < **300 ms** for typical tenants at day-range; < **2 s** for 90-day ranges.
* Funnels and SLA percentiles match validation jobs within **±1%**.
* Reports tolerate **late events** (watermark/windowing with small grace period).

---

## 3) Validation, testing & ops

* **Schema tests:** each event type ships a JSON Schema; CI validates samples and rejects unknown fields unless marked `additionalProperties`. (Self-describing JSON encourages strict governance.) ([docs.snowplow.io][15])
* **Idempotency tests:** re-submit same batch twice; duplicates = 0 after dedupe. **At-least-once** is the default in modern event infra, so this test is load-bearing. ([learn.microsoft.com][7])
* **Clock skew tests:** past/future `occurred_at` within policy are accepted; outside rejected.
* **Backpressure:** ingestion degrades gracefully under high load; queue depth alerts fire.
* **PII redaction:** seeded emails/phones in attributes are redacted prior to commit.

---

## 4) Practical defaults

* **Envelope:** `event_id` (uuid), `event_name` (lowercase dot-separated), `occurred_at`/`received_at` (RFC 3339), `tenant_id`, `site_id`, `session_id`, `user_id` (pseudonymous), `attributes`, `context`. ([datatracker.ietf.org][5])
* **Batch limits:** ≤ 500 events or 500 KB compressed per request.
* **Retention:** raw log 30–90 days; OLAP rollups kept longer.
* **Store:** start on Postgres; enable **ClickHouse** for high-volume tenants. ([ClickHouse][10])

---

## 5) Why these standards

* **OpenTelemetry semantic conventions** give portable, well-named attributes across logs/events/metrics. ([OpenTelemetry][3])
* **Self-describing JSON** (Iglu) enables strict, versioned schemas for custom events. ([docs.snowplow.io][13])
* **RFC 3339** timestamps keep time portable in APIs; **RFC 9557** clarifies timezone semantics. ([datatracker.ietf.org][5], [rfc-editor.org][6])
* **At-least-once + idempotency** reflects reality of modern event buses; dedupe patterns are standard practice. ([learn.microsoft.com][7], [Medium][8])
* **Columnar OLAP** is the right tool for event analytics at scale. ([ClickHouse][10])

---

### Definition of Done (folder)

* `eventsIngest.ts` implements HTTP batch endpoint with schema validation, dedupe, consent handling, and writes to raw log + queue.
* `reports.ts` exposes typed timeseries/funnel/topN queries, with rollups and SLA metrics.
* Unit + integration tests pass (schema, idempotency, skew, perf).
* P95 ingest < 200 ms for 100-event batches; P95 report < 300 ms (day range).
* OTel exporter optional but working; naming matches semantic conventions. ([OpenTelemetry][3])

This spec gives the agents everything to build ingestion and reporting that’s **accurate, fast, and privacy-aware**, and it plugs directly into our voice+agent SLAs.

[1]: https://docs.snowplow.io/docs/events/custom-events/self-describing-events/?utm_source=chatgpt.com "Self-describing events"
[2]: https://medium.com/snowplow-analytics/re-thinking-the-structure-of-event-data-e328485934b2?utm_source=chatgpt.com "Re-thinking the structure of event data - Snowplow Analytics"
[3]: https://opentelemetry.io/docs/concepts/semantic-conventions/?utm_source=chatgpt.com "Semantic Conventions"
[4]: https://betterstack.com/community/guides/observability/opentelemetry-semantic-conventions/?utm_source=chatgpt.com "The Missing Guide to OpenTelemetry Semantic Conventions"
[5]: https://datatracker.ietf.org/doc/html/rfc3339?utm_source=chatgpt.com "RFC 3339 - Date and Time on the Internet: Timestamps"
[6]: https://www.rfc-editor.org/rfc/rfc9557?utm_source=chatgpt.com "RFC 9557: Date and Time on the Internet: Timestamps with ..."
[7]: https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/resilient-design?utm_source=chatgpt.com "Resilient Event Hubs and Functions design"
[8]: https://medium.com/%40connectmadhukar/idempotency-patterns-when-stream-processing-messages-3df44637b6af?utm_source=chatgpt.com "Idempotency Patterns when Stream Processing Messages"
[9]: https://eliasmsedano.medium.com/taming-duplicate-kafka-messages-with-idempotent-processing-part-1-2d46db9e54c3?utm_source=chatgpt.com "Taming Duplicate Kafka Messages with Idempotent ..."
[10]: https://clickhouse.com/docs/faq/general/columnar-database?utm_source=chatgpt.com "What is a columnar database? | ClickHouse Docs"
[11]: https://celerdata.com/blog/understanding-clickhouse-benefits-and-limitations?utm_source=chatgpt.com "Understanding ClickHouse: Benefits and Limitations"
[12]: https://opentelemetry.io/docs/specs/semconv/general/events/?utm_source=chatgpt.com "Semantic conventions for events"
[13]: https://docs.snowplow.io/docs/api-reference/iglu/common-architecture/self-describing-json-schemas/?utm_source=chatgpt.com "Self-describing JSON Schemas"
[14]: https://clickhouse.com/engineering-resources/what-is-columnar-database?utm_source=chatgpt.com "Columnar databases explained"
[15]: https://docs.snowplow.io/docs/fundamentals/schemas/?utm_source=chatgpt.com "Structuring your data with schemas"
