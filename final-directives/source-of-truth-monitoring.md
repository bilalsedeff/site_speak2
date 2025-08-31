# Source-of-Truth: `/services/monitoring/healthController.ts`

*scope: uniform `/health`, `/live`, `/ready` endpoints, graceful shutdown, and probe telemetry*

> **Owner note (my voice):** These endpoints are contractually used by Kubernetes probes and external uptime monitors. We follow the k8s meanings strictly: **liveness** = “should the kubelet restart me?”, **readiness** = “may I receive traffic?”, **startup** (optional) = “give me time before liveness starts”. ([Kubernetes][1])

---

## 1) Endpoints & semantics

### `GET /live`  *(Liveness)*

* **Purpose:** Say whether the process is alive and able to make forward progress. Fail only on unrecoverable conditions (event loop stuck, fatal init). **Do not** include downstream dependencies (DB/Redis) here—kubelet will restart the container if this fails. ([Kubernetes][1])
* **Status:** `200 OK` healthy; `500` unhealthy.
* **Checks (fast, in-process only; complete < 10–20 ms):**

  * Event-loop lag (sampled): `lagMs < threshold` (e.g., 200 ms).
  * Process signals: not shutting down; no fatal init errors.
  * Optional: heap usage under emergency cap.
* **Body (JSON):**

  ```json
  {"status":"live","lagMs":12,"uptimeSec":1234}
  ```

### `GET /ready`  *(Readiness)*

* **Purpose:** Gate traffic routing. If any **critical dependency** is down or we’re draining, return **503** so k8s removes us from Service endpoints. ([Kubernetes][1])
* **Status:** `200 OK` when ready; **`503 Service Unavailable`** when not (temporary). ([IETF Datatracker][2], [fullstack.wiki][3])
* **Checks (parallel with short timeouts; total < 100–200 ms):**

  * Postgres/pgvector: `SELECT 1` (or `SHOW`), with 50–75 ms timeout.
  * Redis: `PING`, with 25–50 ms timeout.
  * Queue broker (BullMQ/Redis): `PING` or lightweight `XINFO`.
  * Storage (MinIO/S3) if on the critical path: signed-url HEAD or list with tight timeout.
  * Feature flags/config loaded for tenant.
  * “Drain mode” flag: if shutting down, immediately fail.
* **Body:**

  ```json
  {
    "status":"ready",
    "deps":{"postgres":"ok","redis":"ok","queues":"ok","storage":"ok"},
    "draining":false
  }
  ```

### `GET /health`  *(Aggregate human-readable)*

* **Purpose:** External uptime checks & dashboards. Summarize both liveness & readiness plus basic counters; **never 5xx** for soft degradations—use `200` with `"degraded": true` and details. Reserve `5xx` for true outages. (Probes still use `/live` & `/ready`.)
* **Body:**

  ```json
  {
    "status":"ok",
    "degraded": false,
    "live": {"ok": true, "lagMs": 8},
    "ready":{"ok": true, "failed": []},
    "version": "git:abcd123",
    "uptimeSec": 9876
  }
  ```

> **Why this split?** Kubernetes treats **liveness** as a restart signal and **readiness** as traffic gating; keeping them independent prevents restart storms during transient dependency failures. ([Kubernetes][1])

---

## 2) Kubernetes probe contracts (what ops will set)

* **Readiness probe** hits `/ready` (HTTP). If it fails, pod is removed from Service load balancers until OK. ([Kubernetes][4])
* **Liveness probe** hits `/live`. If it fails repeatedly, kubelet restarts the container. Use `initialDelaySeconds` or a **startup probe** to defer liveness during boot. ([Kubernetes][1])
* **Startup probe** (optional) hits `/live` or `/health` until success; only then do liveness/readiness start. (Prevents kill during slow boots.) ([Kubernetes][4])

Example:

```yaml
readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 5
  timeoutSeconds: 1
livenessProbe:
  httpGet: { path: /live, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 10
  timeoutSeconds: 1
startupProbe:
  httpGet: { path: /live, port: 8080 }
  failureThreshold: 30
  periodSeconds: 2
```

---

## 3) Graceful shutdown & drain behavior

* On **SIGTERM** (typical in k8s rollout), immediately flip **readiness → false** so `/ready` starts returning **503**, causing removal from LB; stop accepting new work; wait up to `terminationGracePeriodSeconds` to finish in-flight requests; then exit. ([Kubernetes][5], [Google Cloud][6])
* Keep **liveness true** while draining unless the process is truly wedged; this avoids premature restarts during a normal rollout. ([Kubernetes][1])

Node patterns & libraries:

* **Lightship** exposes opinionated `/live`/`/ready` and integrates shutdown handlers. ([GitHub][7], [npmjs.com][8])
* **@godaddy/terminus** adds graceful shutdown & probes to any HTTP server. ([GitHub][9], [GoDaddy][10])
* Express docs: handle SIGTERM, stop accepting traffic, finish requests, clean resources. ([expressjs.com][11])

---

## 4) Controller contract (TypeScript)

```ts
// healthController.ts
export interface ProbeConfig {
  timeouts: { dbMs: number; redisMs: number; storageMs: number };
  thresholds: { lagMs: number };
  getState(): { draining: boolean; fatalInitError?: string | null };
  deps: {
    db: { ping: (ms: number) => Promise<void> };
    redis: { ping: (ms: number) => Promise<void> };
    queues?: { ping: (ms: number) => Promise<void> };
    storage?: { ping: (ms: number) => Promise<void> };
  };
  metrics: {
    observeProbe(name: 'live'|'ready'|'health', ok: boolean, ms: number): void;
  };
}

export function mountHealthRoutes(app: import('express').Express, cfg: ProbeConfig): void;
export function setDraining(v: boolean): void; // used by SIGTERM handler
```

## **Implementation notes**

* **Event-loop lag:** compute via `setTimeout` drift or `perf_hooks.monitorEventLoopDelay`. If `lagMs > thresholds.lagMs`, `/live` = 500.
* **Parallel readiness checks:** race promises with per-dep timeouts; collect failures with reason. If any critical dep fails → **503**.
* **Fast path:** cache `/ready` result for \~100–200 ms (debounce repeated hits).
* **Errors:** `/ready` returns `503` with JSON body; **no stack traces**.

---

## 5) Observability & metrics

Expose Prometheus-style counters/histograms for:

* `probe_live_success_total`, `probe_ready_success_total`
* `probe_duration_seconds` (Histogram by route/result)
  Follow Prometheus naming & labels guidance (e.g., `_total` counters). ([prometheus.io][12])
  If you use OpenTelemetry Metrics, create Counter/Histogram instruments for these and export via OTel SDK; Node OTel setup guide is here. ([OpenTelemetry][13], [betterstack.com][14])

---

## 6) Security & responses

* `/live`, `/ready`, `/health` **must not** expose secrets or stack traces.
* `/ready` failure uses **`503 Service Unavailable`** with short JSON payload and optional `Retry-After` header (seconds). 503 is intended for temporary unavailability. ([IETF Datatracker][2], [varnish-cache.org][15])

---

## 7) Acceptance tests (DoD)

1. **Happy path:** All deps OK → `/live` 200, `/ready` 200, `/health` 200 with `degraded:false`.
2. **DB down:** Simulate DB ping timeout → `/ready` 503 (body shows `postgres:"fail"`), `/live` still 200. (Matches k8s readiness behavior.) ([Kubernetes][1])
3. **Drain mode:** After `setDraining(true)`, `/ready` immediately 503; existing requests finish. SIGTERM path verified per k8s lifecycle docs. ([Kubernetes][5])
4. **Event-loop stall:** Inject synthetic lag > threshold → `/live` 500.
5. **Probe perf:** P95 `/ready` execution < **200 ms** under dependency success; controller emits Prom/OTel metrics. ([OpenTelemetry][13], [prometheus.io][16])

---

## 8) Optional: library integrations

* **Lightship**: run as sidecar HTTP service or embed; it exposes `/live` & `/ready` and `registerShutdownHandler`. Good for quick wins. ([GitHub][7], [npmjs.com][8])
* **Terminus**: wraps your HTTP server to add graceful shutdown and probe endpoints. ([GitHub][9])

---

## 9) Example Express wiring (sketch)

```ts
import express from 'express';
import { mountHealthRoutes, setDraining } from './healthController';
import { monitorEventLoopDelay } from 'perf_hooks';

const app = express();
// ... normal routes

const loop = monitorEventLoopDelay(); loop.enable();
process.on('SIGTERM', async () => { setDraining(true); /* stop accept; flush; close */ });

mountHealthRoutes(app, {
  timeouts: { dbMs: 75, redisMs: 50, storageMs: 100 },
  thresholds: { lagMs: 200 },
  getState: () => ({ draining }),
  deps: { db, redis, queues, storage },
  metrics: promAdapter
});

app.listen(8080);
```

Express recommends handling SIGTERM by stopping new requests, finishing in-flight work, and cleaning up connections—this is what we do in the handler above. ([expressjs.com][11])

---

### Why these choices

* **Kubernetes probes** define clear roles for liveness/readiness/startup; aligning prevents restart flapping and bad rollouts. ([Kubernetes][1])
* **503 on readiness** fits HTTP semantics for temporary unavailability. ([IETF Datatracker][2])
* **Lightship/Terminus** are proven Node libs for probes & graceful shutdown. ([GitHub][7])
* **OpenTelemetry/Prometheus** provide standard metrics & naming; we instrument probe latency/success properly. ([OpenTelemetry][13], [prometheus.io][12])

This spec gives everything needed to implement `healthController.ts`, wire it into Express, satisfy Kubernetes, and emit the right telemetry without leaking internals.

[1]: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/?utm_source=chatgpt.com "Liveness, Readiness, and Startup Probes"
[2]: https://datatracker.ietf.org/doc/html/rfc7231?utm_source=chatgpt.com "RFC 7231 - Hypertext Transfer Protocol (HTTP/1.1)"
[3]: https://fullstack.wiki/http/status-codes/503?utm_source=chatgpt.com "503 Service Unavailable - Fullstack.wiki"
[4]: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/?utm_source=chatgpt.com "Configure Liveness, Readiness and Startup Probes"
[5]: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/?utm_source=chatgpt.com "Pod Lifecycle"
[6]: https://cloud.google.com/blog/products/containers-kubernetes/kubernetes-best-practices-terminating-with-grace?utm_source=chatgpt.com "Kubernetes best practices: terminating with grace"
[7]: https://github.com/gajus/lightship?utm_source=chatgpt.com "gajus/lightship: Abstracts readiness, liveness and startup ..."
[8]: https://www.npmjs.com/package/lightship/v/3.0.1?utm_source=chatgpt.com "lightship"
[9]: https://github.com/godaddy/terminus?utm_source=chatgpt.com "godaddy/terminus: Graceful shutdown and Kubernetes ..."
[10]: https://www.godaddy.com/resources/news/announcing-terminus?utm_source=chatgpt.com "Health Checks and Graceful Shutdown for Node.js ..."
[11]: https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html?utm_source=chatgpt.com "Health Checks and Graceful Shutdown"
[12]: https://prometheus.io/docs/concepts/data_model/?utm_source=chatgpt.com "Data model"
[13]: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/?utm_source=chatgpt.com "Node.js - OpenTelemetry"
[14]: https://betterstack.com/community/guides/observability/opentelemetry-metrics-nodejs/?utm_source=chatgpt.com "Monitoring Node.js Apps with OpenTelemetry Metrics - Better Stack"
[15]: https://varnish-cache.org/rfc/rfc7231.html?utm_source=chatgpt.com "rfc7231 Varnish Src Refs"
[16]: https://prometheus.io/docs/specs/om/open_metrics_spec/?utm_source=chatgpt.com "OpenMetrics 1.0"
