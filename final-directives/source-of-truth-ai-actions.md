# `/services/ai/actions` — Source-of-Truth

## Mission

Turn every SiteSpeak site into a **self-describing, action-able surface**:

* At **publish time**, emit a deterministic `actions.json` that maps UI hooks to executable functions (names, params, selectors, side-effects).
* At **runtime**, expose a tiny, secure **postMessage bridge** inside the published site so the agent can perform actions (click, fill, navigate, submit, invoke APIs) with **origin checks, idempotency, and acknowledgements**. postMessage is the standard, secure primitive for cross-window/frame RPC; always set and verify `targetOrigin`. ([MDN Web Docs][1])

---

## Directory

```plaintext
/services/ai/actions
  manifest/generator.ts        # ✅ CANONICAL build-time emitter of actions.json (836 lines, fully implemented)
  dispatcher/widgetEmbedService.ts  # ✅ in-page bridge (postMessage RPC) - uses ActionManifestGenerator

# Related Voice Widget Integration
/services/voice/embed/voiceWidgetEmbedder.ts  # ✅ Uses canonical generator (consolidated)

# Other consumers (now using canonical generator)
/services/ai/ingestion/crawler/sitemapReader.ts    # ✅ Consolidated to use canonical generator
/services/publishing/app/siteContractGenerator.ts  # ✅ Consolidated to use canonical generator
```

---

## 1) `manifest/generator.ts` — Build-time Action Manifest

### Responsibilities

* Read **builder metadata** (component inventories, `data-action` attributes, form schemas, route table) and the **Site Contract** (JSON-LD, ARIA audit, sitemap) and emit a **versioned manifest** used by the agent for OpenAI tool/function-calling. (OpenAPI 3.1 is aligned to JSON Schema 2020-12; we rely on that dialect when exporting schemas.) ([swagger.io][2], [openapis.org][3])
* Prefer structured selectors: **`data-*` attributes** are standardized for embedding machine-readable data in HTML and are ideal for deterministic hooks. ([html.spec.whatwg.org][4])
* Validate params with Zod → export **JSON Schema 2020-12** so the tool/function definition can be handed directly to the LLM. (We feed these to OpenAI **function / tool calling**.) ([swagger.io][2], [platform.openai.com][5])

### Input (ACTUAL implementation)

**Primary Input**: `htmlContent` string (HTML document to analyze)

**Analysis Process** (via Cheerio DOM parsing):

* **Forms extraction**: Detects forms with proper field mapping (`name`, `type`, `required`, `label`)
* **Button extraction**: Identifies interactive buttons with `data-action` attributes or inferred actions  
* **Navigation extraction**: Discovers internal links and navigation structures
* **Metadata extraction**: Analyzes page structure, business type, and capabilities

**Generated from Site Discovery**:

* `DiscoveredPage[]` objects with interactions, structure, and metadata
* Global functions discovered from JavaScript analysis
* Site capabilities (ecommerce, booking, contact forms, etc.)

### Output: `SiteManifest` (ACTUAL TypeScript interface)

```typescript
export interface SiteManifest {
  siteId: string;
  version: string;  // defaults to "1.0.0"
  generatedAt: string; // ISO timestamp
  actions: SiteAction[];
  capabilities: string[];
  metadata: {
    hasContactForm: boolean;
    hasEcommerce: boolean;
    hasBooking: boolean;
    hasBlog: boolean;
    hasGallery: boolean;
    hasAuth: boolean;
    hasSearch: boolean;
  };
  privacy?: {
    indexablePages?: string[];
    excludedPages?: string[];
    excludedSelectors?: string[];
    sensitiveFields?: string[];
  };
}

export interface SiteAction {
  name: string;  // e.g. "navigate_to_home", "submit_contact_form"
  type: 'navigation' | 'form' | 'button' | 'api' | 'custom';
  selector: string;  // CSS selector for DOM targeting
  description: string;
  parameters: ActionParameter[];  // Zod-validated parameter definitions
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint?: string;
  confirmation: boolean;  // requires user confirmation
  sideEffecting: 'safe' | 'confirmation_required' | 'destructive';
  riskLevel: 'low' | 'medium' | 'high';
  requiresAuth: boolean;
  category: 'read' | 'write' | 'delete' | 'payment' | 'communication';
  metadata?: Record<string, unknown>;
}
```

### Generation Rules (ACTUAL implementation)

* **Naming:** Snake_case with descriptive verbs (e.g., `navigate_to_home`, `submit_contact_form`, `add_to_cart`)
* **Selectors:**
  * Primary: `[data-action="..."]` attributes when available
  * Fallback: Form selectors (`form[name="contact"]`), button selectors (`.btn`, `button`)
  * ARIA roles: `role="navigation"`, `role="button"` for accessibility
* **Parameter Generation:**
  * **Zod Schemas** → **JSON Schema 2020-12** export via `zodToJsonSchema()`
  * Form fields automatically mapped to parameters with proper types
  * Required/optional inference from HTML attributes
* **Risk Assessment:**
  * `sideEffecting`: 'safe' (read-only), 'confirmation_required' (writes), 'destructive' (delete/payment)
  * `riskLevel`: 'low' (navigation), 'medium' (forms), 'high' (payments/bookings)
  * `confirmation`: `true` for destructive operations (checkout, booking, delete)
* **Security Categories:** 'read', 'write', 'delete', 'payment', 'communication'
* **Cheerio-based HTML Analysis:** Robust DOM parsing, not regex-based

### Validation & QA

* **Schema lint:** every `paramsSchema` has `$schema: 2020-12` and validates with a JSON Schema validator suitable for OAS 3.1. ([json-schema.org][8])
* **Coverage report:** % of interactive components with `data-action` hooks; % forms exported; % routes labeled with ARIA landmark/navigation. ([W3C][6])
* **Determinism:** same source input → byte-identical `actions.json`.

### Success criteria

* `actions.json` loads under **5 ms** and is ≤ **20 KB** for typical sites.
* 100% of interactive elements from the builder component library expose stable hooks via `data-action` (or are intentionally ignored).

---

## 2) Widget Integration Architecture (ACTUAL implementation)

### Primary Components

**A) `dispatcher/widgetEmbedService.ts`** — Action Bridge Configuration

* ✅ **Uses canonical ActionManifestGenerator**
* Creates `BridgeConfig` from `SiteManifest`
* Converts canonical actions to bridge-compatible `ActionDef[]` format
* Handles postMessage protocol setup

**B) `voice/embed/voiceWidgetEmbedder.ts`** — Voice Widget Integration  

* ✅ **Consolidated to use canonical ActionManifestGenerator**
* Embeds voice AI widget into published sites
* Generates widget script with proper configuration
* Handles action manifest generation for voice interactions

### Responsibilities of voiceWidgetEmbedder Service

* Provide a **small runtime script** that the publishing pipeline injects into the site (or serves via an **iframe widget**). It listens for **`message`** events, verifies origin, executes the referenced action (click/fill/submit/router/API), and posts a result back. The only safe way to talk cross-origin is `window.postMessage()` with strict `targetOrigin` checks—this is the web standard for cross-document messaging. ([MDN Web Docs][1], [html.spec.whatwg.org][9])
* Support both **embedded script** (same origin) and **iframe widget** (cross origin). For iframe, enforce **`sandbox`** and **Permissions Policy** (`allow="microphone …"`) minimal surface. ([MDN Web Docs][10])

### Embed/iframe guidance

* **postMessage security:** On receive, **check `event.origin`** matches the configured agent/parent origin; on send, pass a concrete **`targetOrigin`** (never `"*"`). ([MDN Web Docs][1])
* **`sandbox` attribute:** enable only what you need; start with `allow-scripts` and add tokens incrementally. (Sandbox reduces the power of embedded content.) ([MDN Web Docs][11], [html.spec.whatwg.org][12])
* **Microphone access (voice):** grant via **Permissions Policy** header + iframe `allow="microphone"` for the widget origin; both sides must allow. ([MDN Web Docs][13])
* You can additionally constrain via **CSP `sandbox`** for the widget origin. ([MDN Web Docs][14])

### Message Protocol (ACTUAL implementation)

**Widget Configuration** (from VoiceWidgetEmbedder):

```typescript
interface WidgetConfig {
  siteId: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  enableVoice: boolean;
  enableText: boolean;
  greeting: string;
  language: 'en' | 'tr' | 'auto';
  showBranding: boolean;
  customCSS?: string;
}

// Sanitized for client-side
const clientConfig = {
  siteId: config.siteId,
  position: config.position,
  // ... other safe properties
  apiUrl: process.env.BACKEND_URL || 'http://localhost:5000',
  version: this.widgetVersion
};
```

**Bridge Configuration** (from WidgetEmbedService):

```typescript
interface BridgeConfig {
  siteId: string;
  actions: ActionDef[];  // converted from canonical SiteManifest
  allowedOrigins: string[];
  version: string;
}

interface ActionDef {
  id: string;
  name: string;
  description: string;
  selector: string;
  parameters: Record<string, { type: string; required: boolean; description: string }>;
  method?: string;
  endpoint?: string;
  confirmation: boolean;
}
```

## **Handshake**

1. Widget → parent: `{kind:'hello', widgetVersion}`
2. Parent (agent shell) → widget: `{kind:'hello'}` with `targetOrigin` set to widget origin. ([MDN Web Docs][1])

## **Execute flow**

* Parent posts `{kind:'execute', id, actionId, args}` to widget **with a concrete `targetOrigin`**.
* Widget verifies `event.origin` (strict match), validates `args` against the action’s **JSON Schema**, executes, then replies `{kind:'result'|'error', id, ...}`. ([MDN Web Docs][1], [swagger.io][2])

### Action dispatchers inside the widget

* **DOM actions:** query by `data-action` selector → focus/scroll → click (or fill/submit).
* **Router actions:** call site router (`navigate.goto`) without DOM.
* **Form actions:** fill via label/name mapping; honor `formmethod`/`formenctype`.
* **API actions:** if the Site Contract exposes `/graphql` or OpenAPI endpoints, call via site-local adapter (same origin). (OpenAPI 3.1 schemas are JSON Schema 2020-12 compatible, so the same schemas can validate inputs.) ([swagger.io][2])

### Security hardening

* **Origin checks** on every inbound message; drop unknown kinds. ([MDN Web Docs][1])
* **Permissions Policy** & iframe `allow` set explicitly for mic/camera if the **voice UI** is inside the iframe. ([MDN Web Docs][13])
* Minimal sandbox: start with `sandbox="allow-scripts"`; avoid `allow-same-origin` unless necessary. ([MDN Web Docs][11])
* No secrets in messages; only **opaque IDs** and public params.
* **Idempotency:** pass through and persist `idempotencyKey` for writes.
* **A11y targets:** prefer ARIA landmarks and deterministic data-selectors to avoid brittle heuristics. ([MDN Web Docs][7])

### Performance notes

* Use **MutationObserver** to re-resolve selectors if components mount late; batch reads/writes; instrument with `Performance.now()` and User Timing marks.
* Don’t block the UI thread; for expensive prep, defer with `requestIdleCallback` or microtasks; keep **P95 dispatch < 50–150 ms** for navigation (optimistic).
* Pre-navigation hints are allowed by the page (prefetch/speculation rules); the bridge can request them to hide latency. ([html.spec.whatwg.org][9])

### Public API (TypeScript surface of the service)

```ts
export interface WidgetConfig {
  parentOrigin: string;            // the only allowed sender
  actions: ActionDef[];            // loaded from actions.json
  log?: (e: any) => void;
}

export function mountWidgetBridge(cfg: WidgetConfig): { dispose(): void };
```

### DOM helpers (pseudo)

```ts
function clickByActionId(id: string, args: any) {
  const sel = lookupSelector(id);
  const el = document.querySelector(sel);
  if (!el) throw new Error('selector_not_found');
  (el as HTMLElement).focus();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
```

---

## Telemetry (both files)

* Emit traces for: `action.resolveSelector`, `action.domClick`, `action.formSubmit`, `action.apiCall`, `rpc.recv`, `rpc.send`.
* Include: duration, bytes, outcome, `actionId`, `tenantId`, `siteId`.

---

## Acceptance tests (DoD)

## **manifest/generator.ts**

1. Every interactive element from the component library yields an action with a **stable** `data-action` selector. (HTML data-attributes are the sanctioned path.) ([html.spec.whatwg.org][4])
2. Every `paramsSchema` validates as **JSON Schema 2020-12**; OpenAPI 3.1 export passes a linter. ([swagger.io][2], [json-schema.org][8])
3. Forms export correct required fields and constraints; routes include ARIA landmark hints. ([MDN Web Docs][7])

**ACTUAL Implementation Status** (✅ = Complete, ⚠️ = Needs work)

**ActionManifestGenerator** (manifest/generator.ts):

1. ✅ **Cheerio-based HTML parsing** with comprehensive form/button extraction
2. ✅ **Zod schema validation** with JSON Schema 2020-12 export  
3. ✅ **Risk assessment** system (safe/confirmation_required/destructive)
4. ✅ **Security categorization** (read/write/delete/payment/communication)
5. ✅ **Single source of truth** - all other services now use this canonical generator

**Widget Integration**:

1. ✅ **VoiceWidgetEmbedder** consolidated to use canonical generator
2. ✅ **WidgetEmbedService** creates bridge config from canonical manifest
3. ⚠️ **PostMessage bridge** needs implementation (currently just config generation)
4. ⚠️ **Origin validation** and security hardening needed in runtime bridge
5. ⚠️ **Action execution** dispatch system needs implementation

**Site Discovery Integration**:

1. ✅ **SitemapReader** consolidated to use canonical generator
2. ✅ **SiteContractGenerator** consolidated to use canonical generator
3. ✅ **Type safety** achieved across all modules (no 'any' types)
4. ✅ **Backward compatibility** maintained through conversion functions

---

## Why these standards & choices matter (load-bearing)

* **postMessage with origin checks** is the safe primitive for cross-document RPC; never use `*` for `targetOrigin`. ([MDN Web Docs][1])
* **`data-*` attributes** are the HTML-standard way to bind machine-readable hooks to DOM; ideal for action selectors. ([html.spec.whatwg.org][4])
* **ARIA landmarks** make navigation targets and regions programmatically discoverable and accessible—great for both users and the agent. ([W3C][6])
* **OpenAPI 3.1 ↔ JSON Schema 2020-12** compatibility lets us export one schema set for both OpenAI function-calling and API docs. ([swagger.io][2], [openapis.org][3])
* **OpenAI function/tool calling** is the intended mechanism to bind these actions as callable functions from the model. ([platform.openai.com][5])

---

## Current Implementation Status Summary

### ✅ **COMPLETED** - Consolidation Phase

* **Eliminated ~600 lines** of duplicate action manifest generation code

* **Single canonical source**: `ActionManifestGenerator` (836 lines, fully functional)
* **All consumers updated**: VoiceWidgetEmbedder, SitemapReader, SiteContractGenerator
* **Type safety achieved**: Proper TypeScript interfaces, no 'any' types
* **Standards compliance**: JSON Schema 2020-12, OpenAPI 3.1 compatible

### ⚠️ **NEXT PRIORITIES** - Runtime Implementation  

1. **PostMessage Bridge Runtime**: Implement actual action execution dispatch
2. **Security Hardening**: Origin validation, iframe sandbox enforcement
3. **Action Execution Engine**: DOM manipulation, form submission, navigation
4. **Voice Widget Runtime**: Complete integration with action manifest
5. **Performance Optimization**: P95 < 150ms dispatch, action batching

### 🏗️ **Architecture Achieved**

* **No duplication**: Single source of truth for all action manifest generation

* **Modular design**: Clean separation between manifest generation and execution
* **Standards-based**: Follows HTML standards for `data-*` attributes and ARIA
* **OpenAI Compatible**: Direct integration with function/tool calling APIs
* **Type-safe**: Full TypeScript coverage with proper interface definitions

[1]: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage?utm_source=chatgpt.com "Window: postMessage() method - MDN - Mozilla"
[2]: https://swagger.io/specification/?utm_source=chatgpt.com "OpenAPI Specification - Version 3.1.0"
[3]: https://www.openapis.org/blog/2021/02/18/openapi-specification-3-1-released?utm_source=chatgpt.com "OpenAPI Specification 3.1.0 Released"
[4]: https://html.spec.whatwg.org/dev/?utm_source=chatgpt.com "HTML Standard, Edition for Web Developers - whatwg"
[5]: https://platform.openai.com/docs/guides/function-calling?utm_source=chatgpt.com "Function calling - OpenAI API"
[6]: https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/?utm_source=chatgpt.com "Landmark Regions | APG | WAI"
[7]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles?utm_source=chatgpt.com "WAI-ARIA Roles"
[8]: https://json-schema.org/blog/posts/validating-openapi-and-json-schema?utm_source=chatgpt.com "Validating OpenAPI and JSON Schema"
[9]: https://html.spec.whatwg.org/multipage/web-messaging.html?utm_source=chatgpt.com "9.3 Cross-document messaging - HTML Standard - whatwg"
[10]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement/sandbox?utm_source=chatgpt.com "HTMLIFrameElement: sandbox property - MDN - Mozilla"
[11]: https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/General_embedding_technologies?utm_source=chatgpt.com "From object to iframe — general embedding technologies - MDN"
[12]: https://html.spec.whatwg.org/multipage/iframe-embed-object.html?utm_source=chatgpt.com "4.8.5 The iframe element - HTML Standard - whatwg"
[13]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy?utm_source=chatgpt.com "Permissions Policy - MDN - Mozilla"
[14]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox?utm_source=chatgpt.com "Content-Security-Policy: sandbox directive - MDN Web Docs"
