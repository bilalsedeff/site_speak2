# Source-of-Truth: `services/ai/tools/`

## *scope: universal tool surface for LangGraph agents; deterministic, schema-first, and voice-first*

> **Design tenets (recap)**
> • One central tool registry; tools are small, composable, strictly typed.
> • Params validated with **Zod**, exported as **JSON Schema 2020-12** so they can be given to function/tool-calling LLMs. (OpenAPI 3.1 == JSON Schema 2020-12 compatible. ([openapis.org][1]))
> • Tools declare `sideEffects`, `auth`, `latencyBudgetMs`, `idempotency`, and `confirmRequired`.
> • Optimistic execution for safe navigations; confirm before irreversible actions.
> • Dynamic tool generation from site contracts, OpenAPI and GraphQL introspection. (OpenAPI/3.1 & GraphQL introspection are designed for this. ([OpenAPI Initiative Publications][2], [graphql.org][3]))
> • Accessibility & performance hints are first-class (ARIA roles; speculation rules/prefetch). ([MDN Web Docs][4])

---

## Directory map

```plaintext
/services/ai/tools
  navigation.ts
  search.ts
  commerce.ts
  booking.ts
  forms.ts
  siteops.ts
  custom/dynamicApiTools.ts
  registry.ts
  validators.ts
```

Each file exports **pure tool descriptors** and lightweight executors. Heavy lifting (KB search, HTTP clients, DOM bridge, etc.) lives in their own packages and is injected.

---

## Shared conventions (apply to every tool)

* **Type system**: define Zod schemas in `validators.ts` and **export JSON Schema** for LLM tool/function calling via `zodToJsonSchema()`; prefer OpenAPI-compatible dialect (2020-12). ([Zod][5], [npmjs.com][6], [swagger.io][7])
* **LangChain/LangGraph wiring**: tools are registered through a single `registry.ts` and provided to the agent runtime that supports tool/function calling. (LC “Tools” & OpenAI-style functions interop). ([js.langchain.com][8], [api.js.langchain.com][9])
* **Idempotency**: any **side-effecting** tool must accept an `idempotencyKey` and implement replay protection. (Industry-standard approach; Stripe reference; HTTP semantics define which methods are idempotent). ([stripe.com][10], [rfc-editor.org][11])
* **Time & date**: tool params use **RFC 3339** timestamps and **ISO 8601** durations/intervals (e.g., `start: "2025-08-24T10:00:00+03:00"`, `window: "PT2H"`). ([IETF Datatracker][12])
* **Latency budgets**: every tool declares `latencyBudgetMs` (default 400ms; **navigation** tools 50–150ms; **checkout/booking** permits longer but streams updates).
* **Observability**: every invoke emits structured traces (tool name, tenant, logical step, success/failure, duration, bytes).
* **Security**: tools that bridge to the page use a sandboxed **postMessage** bridge and must set/verify `targetOrigin` (never `*`). ([MDN Web Docs][13], [html.spec.whatwg.org][14])
* **A11y alignment**: rely on landmarks/roles/selectors provided by the site contract to make targets deterministic. ([MDN Web Docs][4])

---

## `validators.ts`

## *responsibility: canonical Zod types + JSON Schema exporters*

## **Exports**

* Core scalars: `Url`, `Path`, `CssSelector`, `AriaRole`, `CurrencyCode`, `Quantity`, `Money`, `Email`, `Phone`, `Locale`
* Time: `Rfc3339DateTime`, `Iso8601Duration`, `IsoInterval`
* Commerce: `ProductId`, `VariantId`, `CartId`, `CouponCode`, `CheckoutToken`
* Booking: `ResourceId`, `SlotId`, `PartySize`
* Search: `Query`, `Filter`, `Sort`, `PageCursor`
* Helpers: `toJsonSchema(zodSchema, {title, description})` (wraps **zod-to-json-schema**) ([npmjs.com][6])

## **Success criteria**

* All schemas strict; `unknownKeys=strip`.
* `toJsonSchema` emits 2020-12 or OpenAPI 3.1 compatible schema (tests validate `$schema` and keywords). ([openapis.org][1])

---

## `registry.ts`

## *responsibility: single source of truth for available tools*

## **What it does**

* Aggregates tool descriptors from siblings and **dynamicApiTools**.
* Applies **tenant policy** (enable/disable, rate limits, auth scopes).
* Converts Zod → JSON Schema & registers with the agent runtime. (LangChain Tools + function-calling agent). ([js.langchain.com][8], [api.js.langchain.com][9])

## **Descriptor shape**

```ts
type SideEffects = 'none'|'read-only-nav'|'writes.cart'|'writes.order'|'writes.booking'|'writes.content';
type ToolDef = {
  name: string;
  description: string;
  schema: JSONSchema7;         // from validators
  zod?: ZodSchema<any>;        // optional backref for local validation
  sideEffects: SideEffects;
  confirmRequired?: boolean;   // true for irreversible ops
  auth?: 'none'|'session'|'service';
  latencyBudgetMs?: number;
  idempotent?: boolean;        // true if executor enforces idempotencyKey
  execute: (args, ctx) => Promise<ToolResult>;
};
```

## **Success criteria of registry**

* Single export `getToolsForTenant(tenantId)` returns a consistent list.
* All tools include JSON Schema with `title`, `description`, `examples`.
* Per-tool metrics emitted on every call.

---

## `navigation.ts`

## *safe, instant actions for movement and focus*

## **Tools**

1. `goto`

* **Params**: `{ path: Path }`
* **Semantics**: pushes a route or requests MPA navigation via bridge.
* **Side-effects**: `read-only-nav` (no data mutation).
* **Optimistic execution**: allowed (dispatch immediately, continue planning).
* **Latency budget**: 50–150ms for dispatch; real nav may complete later.
* **Perf**: if contract exposes **Speculation Rules** or `<link rel="prefetch">`, instruct page to prefetch/prerender next likely URLs to hide latency. ([web.dev][15], [MDN Web Docs][16])

1. `highlight`

* **Params**: `{ selector: CssSelector }`
* Draws a transient outline to show where the agent intends to click.

1. `scrollTo`

* **Params**: `{ selector?: CssSelector, to?: 'top'|'bottom'|'anchor' }`

1. `open` (external)

* **Params**: `{ url: Url, target?: '_blank'|'_self' }`
* **Security**: enforce allowlist.

**Bridge notes**
The in-page bridge uses `window.postMessage` with exact `targetOrigin` and origin checks on listener. ([MDN Web Docs][13])

## **Success criteria of navigation**

* Optimistic nav never blocks voice streaming.
* If nav fails, reconcile softly (“I couldn’t open X — trying Y”) and roll back highlights.

---

## `search.ts`

## *semantic & structured finders across KB and site APIs*

## **Tools of search**

1. `siteSearch`

* **Params**: `{ query: Query, filters?: Filter[], page?: PageCursor }`
* **Behavior**: hybrid: calls RAG retriever + site `/search` API if present.
* **Output**: `{ items: Array<{title, snippet, url, score}> }` (deep links).

1. `suggestNext`

* **Params**: `{ context: 'catalog'|'blog'|'docs', max?: number }`
* Uses language detection to shape follow-ups; returns clickable options.

## **Success criteria of search**

* P95 under 350ms (in-memory cache first; then vector store).
* Respects tenant segmentation; no cross-site leakage.

---

## `commerce.ts`

## *cart & checkout primitives (irreversible = confirm)*

## **Tools of commerce**

1. `listVariants`

* **Params**: `{ productId: ProductId }`
* **Side-effects**: `none`

1. `addToCart`

* **Params**: `{ productId, variantId?, quantity: Quantity, notes?, idempotencyKey }`
* **Side-effects**: `writes.cart`, **idempotent** (same key ⇒ same cart line). Use idempotency pattern to prevent dupes on retries. ([stripe.com][10])

1. `removeFromCart` / `updateQuantity`

* **Side-effects**: `writes.cart`, idempotent on `(cartLineId, op)`

1. `applyCoupon`

* **Confirm**: false; reversible.

1. `startCheckout`

* **Params**: `{ cartId: CartId, returnUrl: Url, idempotencyKey }`
* **Confirm**: **true** if it triggers a payment/hold.

1. `placeOrder`

* **Confirm**: **true** (voice agent must ask).
* **Notes**: mark `confirmRequired` and gate behind human-in-the-loop.

## **Success criteria of commerce**

* No duplicate orders under retries; verify stored idempotency ledger. (HTTP idempotency semantics & industry guidance). ([rfc-editor.org][11])

---

## `booking.ts`

## *slots, availability, holds, reservations*

## **Tools of booking**

1. `searchSlots`

* **Params**: `{ resourceId?: ResourceId, interval?: IsoInterval, partySize?: number }`
* Times use **RFC 3339**; durations/intervals use **ISO 8601**. ([IETF Datatracker][12])

1. `holdSlot`

* **Params**: `{ slotId, customer: {name,email,phone}, idempotencyKey }`
* **Confirm**: false; temporary, expires.

1. `bookSlot`

* **Params**: `{ slotId, paymentToken?, notes?, idempotencyKey }`
* **Confirm**: **true** before charging or making the booking permanent.

1. `cancelBooking`

* **Confirm**: true; explain policy if provided by contract.

## **Success criteria of booking**

* `bookSlot` is idempotent; repeat with same key returns same confirmation. (Pattern modeled after payment APIs). ([docs.stripe.com][17])

---

## `forms.ts`

## *generic form fill & submit bound to site contract*

## **Tools of forms**

1. `fillField`

* **Params**: `{ selector: CssSelector, value: string }`
* Bridges to DOM; respects HTML form semantics (method/enctype). ([html.spec.whatwg.org][18])

1. `submitForm`

* **Params**: `{ formSelector: CssSelector, idempotencyKey?, validate?: boolean }`
* For POST-ing forms that create server state, use `idempotencyKey`.
* **Security**: never inject secrets; only public fields; CSRF handled by site.

## **Success criteria of forms**

* Works on both SPA and MPA; obeys `formmethod`/`formenctype` overrides. ([MDN Web Docs][19], [html.spec.whatwg.org][18])

---

## `siteops.ts`

## *operational helpers the agent can call sparingly*

## **Tools of siteops**

1. `readSitemap`

* Reads `sitemap.xml` (and index files) to guide incremental crawling; respects `<lastmod>` (W3C datetime). ([sitemaps.org][20])

1. `warmupCache`

* Pre-navigates a list of URLs; hints the page to **prefetch/prerender** via Speculation Rules when available. ([web.dev][15])

1. `respectRobots`

* Checks robots policies (RFC 9309), **advisory not auth**. ([rfc-editor.org][21])

## **Success criteria of siteops**

* Never runs in-path of user interactions; only pre-compute or background.

---

## `custom/dynamicApiTools.ts`

## *generate tools from OpenAPI/GraphQL automatically*

## **Inputs**

* **OpenAPI 3.1** documents discovered via site contract `/openapi.json`
* **GraphQL** schema via **introspection** (`__schema`, `__type`). ([OpenAPI Initiative Publications][2], [graphql.org][3])

## **Behavior**

* For OpenAPI: generate one tool per **operationId**, map request bodies & params to Zod → JSON Schema. (OpenAPI 3.1 fully aligned with JSON Schema keywords, easing generation). ([Stoplight][22])
* For GraphQL: generate tools for common **queries/mutations** with strictly typed variables from introspection. ([spec.graphql.org][23])
* Tag tools with `auth: 'service'` if security schemes are required.
* Respect `x-agent: {action: true}` vendor extension to allowlist ops.

## **Security**

* Never expose secrets; all calls go through server-side adapter with per-tenant credentials.

## **Success criteria of dynamicApiTools**

* Cold start under 300ms for <200 operations; caches generation by `(hash(spec), tenant)`.

---

## Interop with the in-page Action Bridge

Many tools ultimately signal the **in-page bridge** (loaded with the published site). The bridge listens to `window.postMessage`, validates `event.origin`, and dispatches to DOM handlers or fetches. **Always set `targetOrigin`** when posting from the agent process. ([MDN Web Docs][13])

**Data hooks**: all interactive elements have deterministic `data-*` attributes (`data-action="product.addToCart"`), which are both human- and machine-readable per HTML spec. ([MDN Web Docs][24])

---

## Voice UX rules (apply at the tool layer)

* **Optimistic navigation**: dispatch `goto()` immediately when it’s the obvious first step, continue reasoning/plan asynchronously.
* **Streaming**: echo short confirmations within 300ms (“Heading to products… filtering red roses now.”).
* **Confirm**: read back critical params for `placeOrder`, `bookSlot`, `cancelBooking`.
* **Fallbacks**: if a selector is missing, ask the page for landmark-based candidates first (ARIA navigation/main/region). ([MDN Web Docs][4])

---

## Testing & acceptance

* **Contract tests**: each tool has happy-path + validation error + timeout + idempotency replay tests.
* **Perf tests**: verify budgets (P95), especially for navigation & search.
* **Schema tests**: `validators.test.ts` asserts RFC 3339/ISO 8601 parsing and exported JSON Schema dialect tags. ([IETF Datatracker][12])
* **Security tests**: postMessage origin enforcement and payload sanitization. ([MDN Web Docs][13])

---

## Example (abbreviated) — `addToCart` tool

```ts
// commerce.ts
const AddToCart = makeTool({
  name: "commerce.addToCart",
  description: "Add a product variant to the user's cart.",
  zod: z.object({
    productId: ProductId,
    variantId: VariantId.optional(),
    quantity: Quantity.default(1),
    notes: z.string().max(400).optional(),
    idempotencyKey: z.string().uuid()
  }),
  sideEffects: "writes.cart",
  idempotent: true,
  confirmRequired: false,
  auth: "session",
  latencyBudgetMs: 350,
  async execute(args, ctx) {
    // server-side adapter calls site cart API with an Idempotency-Key header
    // and returns the updated cart summary
    return ctx.adapters.cart.addLine(args);
  }
});
```

**Why idempotency here?** Because voice/agent flows often retry on flaky networks; the **Stripe-style idempotency key** prevents duplicate order lines. ([stripe.com][10])

---

## What’s “load-bearing” in this spec (and where it’s standardized)

* **OpenAPI 3.1 ↔ JSON Schema 2020-12 compatibility** affects our schema tooling and dynamic tool generation. ([openapis.org][1])
* **LangChain tool surface & OpenAI function-calling agents** is the mechanism we use to wire tools into the planner/graph. ([js.langchain.com][8], [api.js.langchain.com][9])
* **Speculation Rules / prefetch/prerender** underpins our “optimistic navigation” UX. ([web.dev][15])
* **Robots.txt RFC 9309 + Sitemaps `<lastmod>`** define how `siteops.readSitemap` behaves and why it’s advisory. ([rfc-editor.org][21], [sitemaps.org][25])
* **Idempotency for POST-like actions** avoids duplicate bookings/orders under retries. ([stripe.com][10], [rfc-editor.org][11])

---

## Definition of Done (for this folder)

* All tools export: `name`, `description`, `zod`, `schema`, `sideEffects`, `latencyBudgetMs`, `execute`.
* `registry.ts` returns tenant-filtered tools with **valid JSON Schema 2020-12**.
* Unit tests cover inputs, idempotency behavior, and error cases.
* PostMessage bridge calls always specify `targetOrigin` and check `event.origin`. ([MDN Web Docs][13])
* P95 latency ≤ budgets; `navigation.goto` dispatch ≤150ms.
* Telemetry present for every call (trace + metrics).

---

If you want, I can now generate **scaffolded code stubs** for each file with the Zod types pre-wired and a minimal `registry.ts` that your LangGraph agent can import immediately.

[1]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[2]: https://spec.openapis.org/oas/v3.1.0.html?utm_source=chatgpt.com "OpenAPI Specification v3.1.0"
[3]: https://graphql.org/learn/introspection/?utm_source=chatgpt.com "Introspection"
[4]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/navigation_role?utm_source=chatgpt.com "ARIA: navigation role - MDN - Mozilla"
[5]: https://zod.dev/?utm_source=chatgpt.com "Zod: Intro"
[6]: https://www.npmjs.com/package/json-schema-to-zod?utm_source=chatgpt.com "json-schema-to-zod"
[7]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[8]: https://js.langchain.com/docs/concepts/tools/?utm_source=chatgpt.com "Tools | 🦜️🔗 Langchain"
[9]: https://api.js.langchain.com/functions/langchain_agents.createOpenAIFunctionsAgent.html?utm_source=chatgpt.com "Function createOpenAIFunctionsAgent"
[10]: https://stripe.com/blog/idempotency?utm_source=chatgpt.com "Designing robust and predictable APIs with idempotency"
[11]: https://www.rfc-editor.org/rfc/rfc9110.html?utm_source=chatgpt.com "RFC 9110: HTTP Semantics"
[12]: https://datatracker.ietf.org/doc/html/rfc3339?utm_source=chatgpt.com "RFC 3339 - Date and Time on the Internet: Timestamps"
[13]: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage?utm_source=chatgpt.com "Window: postMessage() method - MDN - Mozilla"
[14]: https://html.spec.whatwg.org/multipage/web-messaging.html?utm_source=chatgpt.com "9.3 Cross-document messaging - HTML Standard - whatwg"
[15]: https://web.dev/learn/performance/prefetching-prerendering-precaching?utm_source=chatgpt.com "Prefetching, prerendering, and service worker precaching"
[16]: https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API?utm_source=chatgpt.com "Speculation Rules API - MDN - Mozilla"
[17]: https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com "Idempotent requests | Stripe API Reference"
[18]: https://html.spec.whatwg.org/multipage/forms.html?utm_source=chatgpt.com "4.10 Forms - HTML Standard - whatwg"
[19]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form?utm_source=chatgpt.com "The Form element - MDN - Mozilla"
[20]: https://www.sitemaps.org/protocol.html?utm_source=chatgpt.com "sitemaps.org - Protocol"
[21]: https://www.rfc-editor.org/rfc/rfc9309.html?utm_source=chatgpt.com "RFC 9309: Robots Exclusion Protocol"
[22]: https://blog.stoplight.io/difference-between-open-v2-v3-v31?utm_source=chatgpt.com "What's the Difference Between OpenAPI Types 2.0, 3.0, ..."
[23]: https://spec.graphql.org/October2021/?utm_source=chatgpt.com "GraphQL Specification"
[24]: https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/Use_data_attributes?utm_source=chatgpt.com "Use data attributes - MDN - Mozilla"
[25]: https://www.sitemaps.org/faq.html?utm_source=chatgpt.com "sitemaps.org - FAQ"
