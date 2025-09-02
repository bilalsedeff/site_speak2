# Frontend Source-of-Truth — SiteSpeak (Admin) & All Published Sites

> Goal: a **single frontend contract** that powers both the SiteSpeak admin/builder and every published client site — with a built-in **voice widget**, deterministic **site contract output** (JSON-LD, ARIA, actions), and **instant** UX (speculative navigation, streaming voice). This doc defines architecture, packages, foldering, performance, a11y, security, testing, and how the frontend collaborates with crawler/KB/agent.

---

## 1) Tech Stack & Principles

* **React 18 + TypeScript** (Vite build) with **islands/code-split** bundles.
* **Design System** (Tailwind + shadcn/ui) with a **schema for each component**: `props.json`, `aria.json`, `jsonld.json`, `actions.json`.
* **Voice widget** shipped as a tiny embeddable script + Shadow DOM app.
* **Accessibility** first: semantic HTML + **ARIA landmarks/roles** in templates and emitted pages (explicit `role="navigation"`, `role="main"` …). MDN’s guidance on landmark roles ensures predictable navigation for assistive tech and programmatic targeting. ([developer.mozilla.org][1])
* **Structured data** first: emit **Schema.org via JSON-LD** for entities (Products, Events, FAQs, Offers…) — this is the format Google recommends as easiest and least error-prone at scale. ([Google for Developers][2])
* **Latency budget**: sub-second interactivity; drive **Core Web Vitals** (LCP, INP, CLS) with resource hints and instant navigations. ([web.dev][3])

---

## 2) Monorepo Packages (recommended)

```plaintext
apps/
  admin/                       # SiteSpeak builder/admin (React 18 + Vite)
  site-runtime-demo/           # Reference runtime for a published site (MFE-ready)

packages/
  design-system/               # UI components + tokens; each component exports metadata schemas
  site-contract/               # Emits JSON-LD, ARIA audit report, actions.json, sitemap.xml
  voice-widget/                # <script> embed + Shadow DOM app + WS client
  actions-bridge/              # postMessage bridge for page actions (selector dispatch)
  analytics-sdk/               # web-vitals, turn/voice events
  i18n/                        # i18n primitives (Intl, locale detection, dir)
  editor-engine/               # drag&drop canvas, block schema registry
  renderer/                    # SSR/SSG renderer for published bundles
```

### **Key separation**

* **apps/admin**: No-code builder + dashboards.
* **site runtime**: Consumer of design-system + contract emitter.
* **voice-widget**: Shared across admin & published sites; embeds the agent.

---

## 3) Admin/Builder UI (apps/admin)

### 3.1 Features

* **Drag-and-drop canvas** with component palette; each component carries:

  * `props.schema` (zod/JSON Schema)
  * `aria.landmarks` (semantics the component must set)
  * `jsonld.templates` (how to emit JSON-LD when rendered)
  * `actions.contract` (optional `data-action` hooks & param schemas)
* **Contract preview**: a “Contract” tab shows what will be emitted: JSON-LD, `actions.json`, ARIA audit, `sitemap.xml`.
* **Preview pane** runs the site in an **iframe** with sandbox flags; communicate via `postMessage` with **strict `targetOrigin`**. MDN mandates verifying origins for safe cross-window messaging. ([developer.mozilla.org][4])
* **Template linter**: static checks for missing landmarks/JSON-LD/action hooks.

### 3.2 Output at Publish

* Write **site contract** assets into the build:

  * `/sitemap.xml` (+ accurate `<lastmod>`),
  * JSON-LD blocks per page,
  * `/actions.json` (Action Manifest of deterministic `data-action` hooks),
  * ARIA audit (for both a11y & agent targeting).
* Inject **Speculation Rules** for prefetch/prerender of “next likely” pages (list → detail; category → product). This hides latency on navigations. ([web.dev][5], [developer.mozilla.org][6])

---

## 4) Published Site Runtime (apps/site-runtime-demo)

### 4.1 Contract-aware rendering

* Components render **semantic HTML** + required **ARIA** roles. Landmarks must be present on every page (nav/main/contentinfo). ([developer.mozilla.org][1])
* When entity components render (Product, Event, FAQ…), attach **JSON-LD script** blocks populated from data.
* Interactive elements carry **stable `data-action`** attributes (e.g., `data-action="cart.add"`); parameters described in `/actions.json`.

### 4.2 Resource hints & instant navigations

* **Preconnect/dns-prefetch** to API/CDN origins; **Speculation Rules** prefetch/prerender likely next routes (MPA or navigations inside hybrid apps). ([web.dev][5])
* **Code-split** by route + island; **lazy** heavy widgets; **IntersectionObserver** for on-view hydration.

### 4.3 Security

* Strong **CSP**; no inline event handlers; SRI on CDN scripts.
* If rendered inside an admin preview, **iframe sandbox** + **postMessage targetOrigin** pinned to the admin origin. ([developer.mozilla.org][4])

---

## 5) Voice Widget (packages/voice-widget)

### 5.1 Embed API

* One-line script the site owner drops into `<head>`; it attaches a floating mic button.
* The widget isolates styles/DOM via **Shadow DOM**; exposes a small **JS API** (`window.SiteSpeak.voice`).

### 5.2 Realtime audio path

* Capture mic via `getUserMedia` → **Web Audio** graph → **AudioWorklet** for framing/VAD (runs off the main thread for very low-latency processing). ([developer.mozilla.org][7])
* Encode short **Opus** frames (\~20 ms) and stream over **WebSocket** to the Realtime session. Opus is the IETF codec designed for interactive speech. WebSocket provides full-duplex, low-overhead frames over an HTTP upgrade. ([datatracker.ietf.org][8])
* The widget receives **partial transcripts + TTS audio** back and plays them with the same audio graph; supports **barge-in** (duck/stop TTS when user speaks again).

### 5.3 Action bridge (packages/actions-bridge)

* A small runtime listens for **postMessage** events from the widget and dispatches declared actions using selectors from `actions.json`. Always verify `event.origin` and use **strict `targetOrigin`** on send. ([developer.mozilla.org][4])

---

## 6) Frontend ↔ Backend Collaboration

* **Crawler/KB**: rely on the **contract** emitted at publish (JSON-LD, actions, landmarks, `sitemap.xml`) to index semantics & affordances; no scraping heuristics are required if the contract is complete.
* **Orchestrator**: tool-calls are built from **Action Manifest**; voice answers are grounded on **KB** results; optimistic navigation is enabled by **Speculation Rules**. ([web.dev][5])
* **API-Gateway**: the widget fetches a **short-lived Realtime token**; no provider keys exposed.

---

## 7) Performance & Web Vitals

### **Budgets**

* Initial interactive bundle per page ≤ **200 kB** gz.
* Idle CPU ≤ 50 ms per frame; avoid long tasks.

### **Tactics**

* Inline critical CSS (above-the-fold); lazy everything else.
* Image: intrinsic sizes, responsive sources, AVIF/WebP.
* **Core Web Vitals**: target **LCP < 2.5 s**, **INP < 200 ms**, **CLS < 0.1**; track with `web-vitals` in analytics and CI Lighthouse. Web.dev documents the metrics and improvement strategies. ([web.dev][3])

---

## 8) Accessibility & i18n

* Landmarks on every page; keyboard traps forbidden; focus order predictable. (Use `@testing-library` + axe for a11y tests.) MDN’s ARIA references define landmark usage. ([developer.mozilla.org][9])
* **Locale detection** by `navigator.language` + `Accept-Language`; wire **Intl** for dates/numbers; set `dir="rtl"` when needed.
* Voice auto-selects STT/TTS language by page locale; fallback to project default.

---

## 9) Security

* **postMessage**: verify `event.origin` and pin `targetOrigin`. ([developer.mozilla.org][4])
* **CSP** with `connect-src` restricted to your API origins; no `unsafe-inline`; SRI on third-party scripts.
* **Sandbox** admin preview iframes; disallow `allow-same-origin` unless required with extra controls.

---

## 10) Testing & CI

* **Unit**: Vitest + React Testing Library.
* **E2E**: Playwright scenarios covering editor flows, widget mic permissions, action dispatch, speculation navigation.
* **Performance**: Lighthouse CI per template; block merges if budgets or CWV regress.
* **A11y**: axe automated checks + manual screen reader runs (NVDA/VoiceOver).
* **Contract tests**: snapshot generated JSON-LD, `actions.json`, ARIA audit, `sitemap.xml`.

---

## 11) Suggested Frontend Foldering

```plaintext
apps/admin/src/
  pages/
  modules/editor/
  modules/contract-preview/
  modules/publish/
  widgets/voice/               # dev-only mounting of shared voice-widget
  routes.tsx

packages/design-system/src/
  components/Button/ +meta/
  components/ProductCard/ +meta/
  components/EventCard/ +meta/
  ...

packages/site-contract/src/
  emitJsonLd.ts
  emitActions.ts
  emitSitemap.ts
  ariaAudit.ts

packages/voice-widget/src/
  embed.ts                     # loader inserted via <script>
  app/                         # Shadow DOM app
  audio/AudioWorkletProcessor.js
  net/wsClient.ts              # RFC 6455 framing via browser WS
  state/store.ts

packages/actions-bridge/src/
  bridge.ts                    # window.postMessage <-> DOM selectors

packages/analytics-sdk/src/
  webVitals.ts                 # CWV hooks
  voiceEvents.ts               # turn, asr, tts metrics
```

---

## 12) Definition of Done (Frontend)

1. **Admin** emits complete **site contract** at publish: JSON-LD present, actions.json consistent with `data-action` hooks, sitemap `<lastmod>` correct, ARIA audit ≥ 90%. ([Google for Developers][2])
2. **Runtime** integrates **Speculation Rules** for likely next pages; navigations feel instant under normal network. ([web.dev][5])
3. **Voice widget** streams audio via **AudioWorklet** → **Opus** → **WebSocket**; supports barge-in and partials (duplex). ([developer.mozilla.org][7], [datatracker.ietf.org][8])
4. **postMessage** bridge uses strict `targetOrigin` and origin checks. ([developer.mozilla.org][4])
5. **Core Web Vitals** pass thresholds on starter templates; budgets enforced in CI. ([web.dev][3])

---

## 13) What this enables

* Crawler indexes semantics & actions with **zero heuristics** thanks to the contract.
* The agent can **act** deterministically (buttons/forms) and **answer** factually (JSON-LD + KB).
* Voice stays **instant** via background prefetch/prerender and realtime streaming.

If you want, I can also produce a **front-end acceptance checklist** (per package) and a **starter template** PR that demonstrates: landmarked layout, JSON-LD for Events/Offers, actions for add-to-cart/checkout, Speculation Rules, and the embedded voice widget working end-to-end.

[1]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/landmark_role?utm_source=chatgpt.com "ARIA: landmark role - MDN - Mozilla"
[2]: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?utm_source=chatgpt.com "Intro to How Structured Data Markup Works"
[3]: https://web.dev/articles/vitals?utm_source=chatgpt.com "Web Vitals | Articles"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage?utm_source=chatgpt.com "Window: postMessage() method - MDN - Mozilla"
[5]: https://web.dev/learn/performance/prefetching-prerendering-precaching?utm_source=chatgpt.com "Prefetching, prerendering, and service worker precaching"
[6]: https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API?utm_source=chatgpt.com "Speculation Rules API - MDN - Mozilla"
[7]: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet?utm_source=chatgpt.com "AudioWorklet - MDN - Mozilla"
[8]: https://datatracker.ietf.org/doc/html/rfc6716?utm_source=chatgpt.com "RFC 6716 - Definition of the Opus Audio Codec"
[9]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles?utm_source=chatgpt.com "WAI-ARIA Roles"
