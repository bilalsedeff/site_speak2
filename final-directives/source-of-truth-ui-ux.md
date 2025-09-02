# UI Design Source-of-Truth

## *minimal, modern, encouraging, and low-fatigue — for both SiteSpeak Admin and all published sites*

This is the **canonical** design brief for our UI. It translates “clean & calm” into concrete, testable rules: type, spacing, color, motion, layout, accessibility, voice UI affordances, and empty-state/microcopy patterns. It’s platform-agnostic (React/Tailwind/shadcn on web), and backed by reputable guidance.

---

## 1) Design Goals (what “good” looks like)

* **Low cognitive load.** Minimize options per view; defer non-essentials via progressive disclosure (Hick’s Law). ([Nielsen Norman Group][1], [Laws of UX][2])
* **Legible by default.** Comfortable line-length and type scale; never make users squint or scan excessively long rows. ([Baymard Institute][3])
* **Accessible out of the box.** Meet WCAG 2.2 minimums for contrast, target sizes, focus, and motion. ([W3C][4])
* **Helpful, not chatty.** Microcopy that nudges action; empty states teach the next step. ([Nielsen Norman Group][5])
* **Conversational + instant.** Voice UI surfaces that feel brisk, contextual, and keep the conversation moving. ([Google for Developers][6], [Google Design][7])

---

## 2) Typography & Readability

* **Body text:** default 16 px (or larger). Maintain **50–75 characters per line** for long-form reading (cards, docs, FAQs). Clamp container widths to hit this CPL range. ([Baymard Institute][3])
* **Scale:** use a modular scale (e.g., 1.125) with 6–8 steps; headings never exceed 80 CPL. Apple HIG: choose sizes most people can read easily. ([Apple Developer][8])
* **Line height:** 1.4–1.6 for body; 1.2–1.35 for headings.
* **Contrast:** meet or exceed **WCAG 2.2 SC 1.4.3** (normal text 4.5:1; large text 3:1). Build this into the token system and lint it in CI. ([W3C][9])

---

## 3) Spacing, Layout & Targets

* **Grid & rhythm:** 8-point grid (margins, paddings, gaps in 4/8 multiples). Material uses 8dp grids and prescribes responsive margin behavior; mirror that philosophy. ([Material Design][10], [Material Design][11])
* **Touch targets:** **≥44 pt** on iOS and **≥48 dp** on Android/Material; keep ≥8 dp spacing between hit areas. (Use physical units in mobile contexts.) ([Apple Developer][12], [Material Design][13])
* **Density tiers:** “Comfortable” (default) and “Compact” (tables only), never below the target minima above.

---

## 4) Color, Surfaces & States

* **Palette:** neutral-first (gray/stone) with 1–2 accent hues. Provide both **light/dark** tokens and auto-switch with `prefers-color-scheme`.
* **States:** explicit tokens for `hover`, `focus`, `active`, `selected`, `disabled`, `danger`.
* **Elevation:** use subtle shadows/overlays; avoid heavy skeuomorphism. Material’s motion & surface guidelines inform elevation and transitions. ([Google Design][14])

---

## 5) Motion (fast, meaningful, optional)

* **Durations:** **100–500 ms** for most UI transitions; faster for small changes, slower for large re-layouts. Prefer shortest non-jarring time. ([Nielsen Norman Group][15])
* **Tokens:** define `motion.fast|default|slow` per Material M3; reuse consistent easing curves. ([Material Design][16])
* **Respect user settings:** reduce or remove non-essential motion when `prefers-reduced-motion` (CSS media feature) or its client hint is present. ([developer.mozilla.org][17])

---

## 6) Voice UI Surfaces (built-in, calm, discoverable)

* **Entry point:** a single floating mic button with clear affordance; hover tooltip (“Talk to your site”).
* **During capture:** compact panel with **live waveform**, **partial transcript**, and **suggestion chips** to guide next actions (discoverability). ([WIRED][18])
* **Tone & pacing:** keep replies **brief and relevant**; move the conversation forward; leverage context. ([Google for Developers][6], [Google Design][7])
* **Accessibility:** live captions by default; keyboard triggers; focus management on open/close.

---

## 7) Empty States, Microcopy & Feedback

* **Empty states teach.** Show 1-2 “next best actions,” sample content, or import options. Don’t just say “Nothing here.” ([Nielsen Norman Group][19])
* **UX writing:** short, actionable, context-aware. Prefer verbs (“Connect a domain”) and confirm outcomes (“2 tickets added”). ([Nielsen Norman Group][5])
* **Notifications:** non-blocking toasts/snackbars for success; inline errors tied to fields. Respect reduced-motion setting for celebratory effects. ([developer.mozilla.org][17])

---

## 8) Forms & Tables (fatigue-aware)

* **Forms:** group related fields; progressive disclosure for advanced options. Inline validation and clear error text.
* **Tables:** zebra rows + sticky header; density toggle. Keep row actions visible on focus/hover; don’t hide primary actions.

---

## 9) Performance & Comfort

* **Core Web Vitals targets:** **LCP ≤ 2.5 s**, **INP ≤ 200 ms**, **CLS ≤ 0.1** at p75; enforce in CI (Lighthouse/Web-Vitals). ([web.dev][20])
* **Perceived speed:** prefetch likely next routes (speculation rules), skeletons for long lists, and optimistic UI when safe.
* **Reduce strain:** consistent spacing, sane line lengths (above), soft elevation changes, and motion that aids orientation—not decoration. ([Baymard Institute][3])

---

## 10) Component Library (shadcn/ui + Tailwind)

Ship these with metadata so the builder and crawler can produce the site contract automatically:

* **Button, Link, IconButton** (sizes, states, loading).
* **Input, Select, Combobox, DateRange, FileDrop** (labels, help, error slots).
* **Card, List, EmptyState, Toast/Snackbar, Modal/Sheet** (focus traps, escape to close).
* **Breadcrumbs, Tabs, Stepper** (progressive navigation).
* **VoiceWidget** (panel + chips + captions), **AnalyticsBanner**.

Each component exports **ARIA roles**, **JSON-LD templates** (where relevant, e.g., EventCard), and allowed **actions** for the Action Manifest.

---

## 11) Dark Mode & Theming

* Provide **light/dark** by default; allow a “system” toggle.
* Keep contrast compliant in both modes; don’t use pure black for backgrounds.
* Respect `prefers-color-scheme` and persist user choice.

---

## 12) Accessibility Checklist (must-pass)

* Contrast meets WCAG 2.2; focus outline visible and non-ambiguous; all interactive elements meet size minima (44 pt/48 dp). ([W3C][9], [Apple Developer][12], [Material Design][13])
* Landmarks are present (`header`, `nav`, `main`, `footer`); captions for voice; `aria-live` for async results.
* `prefers-reduced-motion` respected; no auto-playing motion/looping confetti for success. ([developer.mozilla.org][17])

---

## 13) Page Types & Layout Recipes

* **Dashboard:** 3-column responsive grid; hero KPI at top; secondary cards below; “Create…” primary CTA.
* **Catalog/List:** sticky filters left/top; card density toggle; infinite load with sentry trigger; speculation prefetch to detail.
* **Detail:** left content, right actions/summary. Keep primary action above the fold.
* **Checkout/Forms:** single-column, 2–4 field groups; progress stepper across top; inline validation.

---

## 14) Motion Library (defaults)

* **Enter/exit:** 150–250 ms (small), 200–300 ms (modal/sheet).
* **Shared-element transitions:** 250–350 ms with ease-in-out; shorten reverse transitions. Use Material’s motion principles to convey hierarchy. ([Material Design][21])

---

## 15) Acceptance Criteria (per release)

1. **Readability:** ≥95% of long text blocks render within **50–75 CPL**; baseline body 16 px+. ([Baymard Institute][3])
2. **Touch/Click:** all interactive controls meet **44 pt/48 dp** minima with ≥8 dp separation. ([Apple Developer][12], [Material Design][13])
3. **A11y:** WCAG 2.2 color contrast pass; keyboard-only flows complete; reduced-motion honored. ([W3C][4], [developer.mozilla.org][17])
4. **Voice surfaces:** mic → transcript → chips present; captions on; suggestion chips tested for discoverability. ([WIRED][18])
5. **Performance:** p75 **LCP ≤ 2.5 s**, **INP ≤ 200 ms**, **CLS ≤ 0.1** on key pages in production RUM. ([web.dev][20])

---

## 16) Quick References

* **Hick’s Law & cognitive load:** NN/g, Laws of UX. ([Nielsen Norman Group][1], [Laws of UX][2])
* **Line length:** Baymard (50–75 CPL). ([Baymard Institute][3])
* **Contrast & WCAG 2.2:** W3C. ([W3C][4])
* **Target sizes:** Apple **44 pt**; Material **48 dp**. ([Apple Developer][12], [Material Design][13])
* **Motion & reduced motion:** NNg duration ranges; Material motion tokens; MDN media feature. ([Nielsen Norman Group][15], [Material Design][16], [developer.mozilla.org][17])
* **Voice conversation design:** Google Assistant guidelines; Google design library. ([Google for Developers][6], [Google Design][7])
* **Core Web Vitals thresholds:** web.dev. ([web.dev][20])

With this, designers and engineers can ship a **calm, modern UI** that encourages action without noise, scales across sites, and cooperates perfectly with our crawler + agent stack.

[1]: https://www.nngroup.com/articles/psychology-study-guide/?utm_source=chatgpt.com "Psychology for UX: Study Guide"
[2]: https://lawsofux.com/hicks-law/?utm_source=chatgpt.com "Hick's Law"
[3]: https://baymard.com/blog/line-length-readability?utm_source=chatgpt.com "Readability: The Optimal Line Length"
[4]: https://www.w3.org/TR/WCAG22/?utm_source=chatgpt.com "Web Content Accessibility Guidelines (WCAG) 2.2 - W3C"
[5]: https://www.nngroup.com/articles/ux-writing-study-guide/?utm_source=chatgpt.com "UX Writing: Study Guide"
[6]: https://developers.google.com/assistant/conversation-design/learn-about-conversation?utm_source=chatgpt.com "Conversation Design - Cooperative Principle"
[7]: https://design.google/library/speaking-the-same-language-vui?utm_source=chatgpt.com "UI & UX Principles for Voice Assistants"
[8]: https://developer.apple.com/design/human-interface-guidelines/typography?utm_source=chatgpt.com "Typography | Apple Developer Documentation"
[9]: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum?utm_source=chatgpt.com "Understanding Success Criterion 1.4.3: Contrast (Minimum)"
[10]: https://m2.material.io/design/layout/responsive-layout-grid.html?utm_source=chatgpt.com "Responsive layout grid"
[11]: https://m3.material.io/foundations/layout/understanding-layout/spacing?utm_source=chatgpt.com "layout and spacing"
[12]: https://developer.apple.com/design/tips/?utm_source=chatgpt.com "UI Design Dos and Don'ts"
[13]: https://m2.material.io/design/layout/spacing-methods.html?utm_source=chatgpt.com "Spacing methods"
[14]: https://design.google/library/making-motion-meaningful?utm_source=chatgpt.com "Motion Design - Make Interfaces Meaningful"
[15]: https://www.nngroup.com/articles/animation-duration/?utm_source=chatgpt.com "Executing UX Animations: Duration and Motion ..."
[16]: https://m3.material.io/styles/motion/overview/how-it-works?utm_source=chatgpt.com "Motion – Material Design 3"
[17]: https://developer.mozilla.org/en-US/docs/Web/CSS/%40media/prefers-reduced-motion?utm_source=chatgpt.com "prefers-reduced-motion - MDN - Mozilla"
[18]: https://www.wired.com/2016/05/googles-new-virtual-assistant-chattier-heres?utm_source=chatgpt.com "Google's New Chatbot Won't Shut Up-And That's a Good Thing"
[19]: https://www.nngroup.com/articles/empty-state-interface-design/?utm_source=chatgpt.com "Designing Empty States in Complex Applications"
[20]: https://web.dev/articles/vitals?utm_source=chatgpt.com "Web Vitals | Articles"
[21]: https://m2.material.io/design/motion/understanding-motion.html?utm_source=chatgpt.com "Understanding motion"
