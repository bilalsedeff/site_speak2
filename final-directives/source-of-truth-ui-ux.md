# UI/UX & Frontend Standards

Summary

UI/UX & Frontend Standards define how SiteSpeak’s user interface is built and what principles it follows, for both the SiteSpeak Admin (builder interface) and all the published client sites. The goal is to deliver a clean, accessible, and high-performance web experience that is consistent across the board. This encompasses visual design rules (like typography, spacing, color schemes), interaction patterns (responsive layout, navigation, voice interface cues), and the technical framework (React 18 with a monorepo of front-end packages) that implements those rules. Each published site isn’t a custom codebase but is generated from a common contract, meaning we maintain one unified frontend “design system” and “site runtime” that all sites share. We emphasize accessibility (WCAG compliance, ARIA roles), SEO-friendly practices (semantic HTML, JSON-LD structured data), and modern performance techniques (island architecture, code splitting, prefetching). In essence, this standard ensures that whether a user is using the site builder or browsing a live site, they encounter a user-friendly, fast, and voice-enabled interface that looks professional and works well on any device.

Application Architecture

Monorepo & Packages: The frontend code is organized into a monorepo with multiple packages for different concerns
GitHub
GitHub
. Key packages include:

Design System: A library of reusable UI components (built with React + Tailwind CSS and using something like shadcn/UI for base components). Each component in the design system comes with metadata files (JSON) defining its props schema, ARIA roles, and JSON-LD template if it represents an entity
GitHub
GitHub
.

Site Runtime: The code that runs on published sites (could be an app or a static renderer). It’s essentially a client-side application that uses the components to render the site pages and includes any client-side logic needed (for example, a cart functionality, or hydration for interactive parts)
GitHub
GitHub
.

Admin App: The SiteSpeak builder interface (React 18 app) where users drag and drop components, configure their site, and preview changes
GitHub
GitHub
.

Voice Widget: A package for the embeddable voice assistant UI, delivered as a small JS snippet that injects a Shadow DOM component into the site
GitHub
GitHub
.

Actions Bridge: A small script for the in-page action dispatcher (listens for messages from the voice widget and triggers DOM events)
GitHub
GitHub
.

Site Contract Generator: A package (or part of publishing) that given the page data can output JSON-LD, actions, etc. (This might be partly in backend, but the schema definitions lie in design system).

Analytics SDK: A package that collects front-end metrics (web vitals, voice interaction events) to send to our analytics service
GitHub
.

i18n: Utilities for internationalization (locale detection, right-to-left support)
GitHub
.

Separation of Concerns: We maintain a clear separation:

The Admin App is only used by site owners/editors, not in published sites. It includes heavier dev tools (like the component editor canvas).

The Site Runtime code (the part that goes into published sites) is optimized to be as lean as possible, focusing on rendering pages and enabling the voice widget and actions. It uses the design system to ensure the site looks and behaves like the admin preview.

The Voice Widget is shared by both admin (for preview/testing voice) and published sites, so it’s a standalone package that can be updated centrally.

Islands Architecture & Code-Splitting: We use an “islands” approach where pages are mostly server-rendered static HTML (for published sites), and only interactive widgets (islands) hydrate on the client. Each island or page route is code-split, meaning the JS for that part of the page is loaded only when needed
GitHub
. For example, a carousel or map might be an interactive island; its script loads lazily when the user scrolls to it or interacts.

Shadow DOM & Micro Frontend: The voice widget is implemented in a Shadow DOM container so it doesn’t conflict with site styles
GitHub
GitHub
. Also, the architecture anticipates possibly hosting the site runtime as a micro-frontend (MFE) if needed (for integration into existing sites), hence it’s encapsulated and communicates via postMessage for certain features.

Builder Features: In the Admin UI, there’s a drag-and-drop editor canvas. When you drag a component from the palette onto a page, it uses the design system component under the hood to render it. The builder likely stores a JSON representation of pages (like a tree of components with props). The “Contract preview” in admin shows what JSON-LD and actions will be output for the current page
GitHub
GitHub
. The admin also runs a preview iframe sandboxed, which renders the site using the site runtime code, to show exactly how it will behave live
GitHub
.

Accessibility & Internationalization: All components are built to be accessible by default – e.g., using proper semantic elements and ARIA attributes. The design system likely includes ARIA landmarks in templates (like every page template ensures there’s a `<nav role="navigation">`, a `<main role="main">`, etc.)
GitHub
GitHub
. For i18n, the system can detect language (maybe via `<html lang>` and user preferences) and set text direction (auto-detect if Arabic/Hebrew to dir="rtl" for example)
GitHub
GitHub
. There is also logic to choose the correct voice (STT/TTS language) based on page locale
GitHub
GitHub
.

Security Considerations: The front-end is built with security in mind:

We enforce Content Security Policy (no inline scripts except our own, and ensure any third-party scripts are allowed via appropriate rules)
GitHub
GitHub
.

We use sandbox for the preview iframe in admin (so the previewed site can’t mess with the parent editor)
GitHub
.

We avoid dangerous React practices (like dangerouslySetInnerHTML) unless absolutely necessary and then sanitization is required.

We ensure any user-generated content (like if they add raw HTML in a component) is sanitized to prevent XSS.

Testing: The front-end code is covered by unit tests (for components), and end-to-end tests (maybe using Playwright) for critical flows like building a page, publishing, loading the site, using voice to do an action
GitHub
GitHub
. We also integrate Lighthouse CI to catch performance or SEO regressions (fail the build if core vitals metrics degrade beyond threshold)
GitHub
GitHub
. We also run axe-core in tests for accessibility.

UI Design Principles: The design guidelines are codified:

Use an 8px grid for spacing
GitHub
GitHub
.

Use a modular scale for typography (like a consistent step between heading sizes)
GitHub
GitHub
.

Enforce contrast ratios and font sizes per WCAG – e.g., no text below 16px for body, at least 4.5:1 contrast for normal text
GitHub
GitHub
.

Keep interfaces minimal, with progressive disclosure for complexity (don’t overwhelm the user with too many options at once)
GitHub
.

Provide feedback and guidance in the UI: e.g., empty states that educate, microcopy that nudges (like if a form is empty, show a hint “You can add a new entry by clicking +”)
GitHub
GitHub
.

Use consistent color and states: define in design tokens what primary, secondary colors are, and their hover/active/disabled variants
GitHub
. Possibly adopt a dual theme (light/dark mode) by default.

Motion should be subtle: only use animations to aid understanding, not for decoration, and respect prefers-reduced-motion
GitHub
GitHub
.

Ensure interactive elements are big enough: at least 44px height for touch
GitHub
GitHub
, and spaced so that they’re not too close together (to avoid wrong taps).

Frontend Output Standards: The published site’s HTML should be well-structured:

Proper use of headings (h1, h2, etc.) in logical order.

All images have alt attributes, all form inputs have labels.

Use of landmark roles (nav, main, footer, etc.) so screen readers and the voice agent can navigate content easily
GitHub
.

JSON-LD scripts in head or where appropriate for SEO/AI.

Minimal inline scripts/styles: ideally none, except the small loader for voice widget (which might be inline for performance but with CSP nonce or SRI)
GitHub
.

Include prefetch links or `<script type="speculationrules">` for likely next pages to speed up multi-page navigation
GitHub
.

Possibly include link rel=preload for key assets (like hero image or main CSS) to ensure they load quickly on first paint.

Collaboration with Backend: The frontend contract ensures the backend (crawler, orchestrator) doesn’t need to guess. For example, by outputting data-action attributes, the front-end directly communicates what elements do. The front-end also might produce a static JSON for search (if we have a search feature) so the voice agent can use it. Essentially, the front-end is built to be introspectable and agent-friendly by design.

Technical Details

Design System Components – These are implemented in React (with Tailwind for styling). Each component lives in its folder with:

Component.jsx/tsx – the actual component code.

props.json – a JSON schema or Zod schema definition of its props (for builder form and for ensuring valid usage).

aria.json – detailing any ARIA roles or attributes the component should have or enforce (e.g., a NavigationMenu component must render a `<nav role="navigation">` and maybe ensure children are list items).

jsonld.json – a template or mapping for if this component’s content should generate a JSON-LD snippet. For example, an EventCard component might have fields (name, date, location, etc.) and the jsonld.json could be something like a mini template: "@type": "MusicEvent", "name": "$props.title", "startDate": "$props.date"....

actions.json (or part of props meta) – if the component includes interactive elements, specify their data-action and semantics. E.g., a ProductCard might include an “Add to Cart” button internally with data-action="product.addToCart". The component’s metadata declares that it provides that action and what parameters (maybe productId).
These metadata files allow the builder and the contract generator to know what to emit without hardcoding per component in those separate tools.

Routing & Rendering – The site runtime likely uses a framework or our own code for routing. Possibly a file-based router mapping to pages created in the builder. For published sites, we can do Static Site Generation: at publish time, render each page to HTML (with hydration data). Or we do SSR on the fly (less likely for static hosting). Probably at publish, we generate HTML for each page (since we know all content). That HTML includes the structured data scripts and minimal JS to hydrate interactive parts.

We generate a sitemap.xml enumerating all these pages.

We might generate an actions.json and structured-data.json (like a big JSON with all JSON-LD for the crawler’s benefit or redundancy).

If GraphQL is enabled, we generate a schema by introspecting our component content. E.g., if the site has a collection of products, we form a type Product { name, price, ... } and queries like allProducts, productById etc.
GitHub
. This probably requires the builder to have concept of collections and items.

The frontend includes logic for dynamic things like search filters (maybe using URL query parameters to filter a list and update results live). We ensure these dynamic parts don’t break SSR or accessibility.

Performance Tactics – We inline critical CSS for above-the-fold content in the HTML to avoid an extra round-trip
GitHub
GitHub
. The rest of CSS is loaded async. We use modern image formats (WebP/AVIF) and include srcset for responsive images
GitHub
GitHub
. We optimize fonts (maybe using system fonts or a font loading strategy if using custom ones, possibly preloading them).

Use IntersectionObserver to defer loading components until they appear (for example, heavy carousels or maps).

Idle and offscreen tasks: any non-critical work (like analytics injection) is done after initial render, ideally after a short delay or when browser is idle.

We measure Core Web Vitals via an Analytics SDK on real user sessions and aggregate that to catch regressions in the wild.

Voice Integration – The front-end includes hooks for voice. For example:

The voice widget JS, once loaded, might look for data-action attributes in the DOM to know what actions are available or to highlight them on command. We ensure those attributes remain in rendered HTML (they are, since SSR includes them).

ARIA roles and labels help the voice agent (and accessibility tech) to refer to parts of the page (like “the main content” or “the navigation”).

We might mark certain sections with custom attributes if needed (maybe if the agent needs to know what part is a list of products vs a single product, though JSON-LD handles that through structured data).

The front-end also sends analytics events for voice interactions (like user clicked mic, or an action got executed by voice, etc.), via analytics-sdk/voiceEvents.ts
GitHub
.

The bridging script (actions-bridge) listens for messages like {type: 'executeAction', action: 'product.addToCart', params: {...}} from the voice widget (which gets it from the backend), and finds the element with matching data-action to perform the click or submits a form. It is small and included in site runtime.

Admin Preview & Sandbox – In the builder, when user clicks “Preview” or just in an embedded preview panel, we serve the site within an `<iframe sandbox="allow-scripts allow-same-origin">` with a specific origin (like a preview domain). We pass the site data to that preview either by loading the static build from a preview server or generating on the fly. Communication between admin and preview is done via postMessage, but locked: the admin knows the preview’s window and sends messages with a specific targetOrigin (which is the origin of the preview iframe)
GitHub
, and preview responds similarly. We do this to e.g. notify when a page is loaded or when the user triggers something in preview. The voice widget is operational in preview too, but probably configured to a test mode (maybe it uses a dev realtime endpoint).

Also the builder likely has a “Contract” tab where we show JSON outputs. This could be done by running the contract generator on the fly for the current page and showing the JSON/LD, actions, etc., or by instrumenting the preview to expose those (for example, the preview might have a global var with current page’s JSON-LD).

Template linting: The admin likely includes lint rules that check if required ARIA landmarks are present (should always due to templates) or if any component is missing a required prop. Possibly implemented as a background check or on publish as well.

UI/UX Specifics –

Typography: base font 16px, headings scale up by ~1.125× each level
GitHub
. Use system fonts or a specified web font loaded in a performant way (maybe tailwind includes a default).

Color: probably a neutral palette with one accent that can be customized by the user for their site brand (the design system might allow theme customization to some extent: e.g., pick a primary color and everything uses that for buttons/links). Ensure any custom color chosen still meets contrast guidelines by constraining the palette or auto-adjusting text color (like black/white depending on brightness).

States: focus outlines visible (don’t remove them without replacement)
GitHub
GitHub
, hover styles for buttons/links (like slight darken or underline).

Dark mode: provided out of box (maybe default theme has both and auto-switch via CSS prefers-color-scheme or user toggle).

Forms: show inline validation errors with clear text and maybe color (and ARIA announce them or tie to inputs via aria-describedby)
GitHub
. Group fields logically and don’t clutter.

Tables: use zebra striping and adequate padding, allow a compact mode toggle but not too compact to break touch rules
GitHub
.

Microcopy: guidelines on phrasing – e.g., use action verbs, be concise, don’t blame user in error messages, etc.
GitHub
GitHub
.

Empty states: design them to have maybe an illustration or a prompt, plus a call-to-action to create or import content
GitHub
.

Voice UI surfaces: the design describes a floating mic button with possibly a text bubble or panel showing partial transcript and suggestions (chips)
GitHub
. Those suggestion chips might be context-based quick questions user can click, which is a nice UX (maybe based on page content, e.g., on a product page show “What’s the price?” chip). We incorporate that into design system as well (the voice widget likely is responsible).

Internationalization: possibly use an i18n library for admin UI (if it’s multilingual for editors; maybe just English at first), but definitely for published sites content is whatever user enters plus any UI text (like the voice widget’s messages or default labels) are localized.

Frontend Third-Party Integrations: If any third-party analytics (like Google Analytics) or widgets are allowed, we ensure they load async and don’t block core functions, and they adhere to privacy (only if user enabled, etc.). But likely our own analytics covers most needs.

Best Practices

Consistent Design Language: All UI should follow the single design system to ensure consistency. Avoid using custom styles outside the design tokens or ad-hoc CSS that isn’t in Tailwind config or design system components. This ensures uniform look and easier maintenance.

Mobile-First, Responsive Design: Design components mobile-first (small screens) and enhance for larger screens. Use fluid layouts that adapt; test on common breakpoints (mobile, tablet, desktop). Ensure key interactions (nav menus, modals) work on touch and small screens (for example, collapse a menu into a hamburger on mobile, ensure the builder is usable on at least tablet if not phone).

Accessibility First: Treat accessibility not as an afterthought but as a requirement for each feature. E.g., when creating a modal component, automatically trap focus inside it, and restore focus when closed. Use semantic HTML wherever possible instead of ARIA (e.g., `<button>` not `<div role="button">`). If using ARIA, follow proper patterns as per W3C ARIA Authoring Practices. Test with screen readers (NVDA/VoiceOver) periodically.

Optimize for Core Web Vitals: Continuously measure and optimize LCP, CLS, INP. Strategies: precompute layout to avoid layout shifts (reserve space for images with known dimensions to avoid CLS), load above-the-fold content quickly (inline critical CSS, preload hero image). Keep main thread work low for good input response (break up long JS tasks, use web workers if needed). Already using React 18 concurrent features can help with responsiveness.

Minimize JS and Polyfills: Ship only the JavaScript that is necessary. For older browser support, consider dropping very old ones rather than adding heavy polyfills, since modern users are target and it’s a controlled environment (maybe we support last 2 versions of major browsers). If polyfills are needed (like for IntersectionObserver if supporting IE11, which likely we don’t), load them conditionally.

Tailwind and Utility-first CSS: Use Tailwind utility classes as per our configured design tokens for quick styling, but don’t abuse it to hack around design guidelines. If something requires weird styling that’s not covered, consider updating design system rather than one-off solutions.

Use ARIA Landmarks: Ensure every page has at least the main landmarks: one main content region (`<main>` or role main), a navigation region (nav), possibly a search region if applicable, and a footer (`<footer role="contentinfo">`)
GitHub
. This not only helps screen readers but also our voice agent to target sections easily.

No Inline Event Handlers: Avoid things like onclick= in HTML; instead, attach via JS. This is both a security and a cleanliness guideline (CSP can block inline scripts).

Shadow DOM Isolation for Widgets: Encapsulate third-party or cross-cutting widgets (voice, etc.) to avoid CSS conflicts. Our voice widget does that. Also consider any similar case (like if an e-commerce integration or external chat widget is added in future).

Statically Render When Possible: Prefer generating static HTML (with hydration) over client-rendering content, especially for primary content, to ensure faster first paint and better SEO. Use client-side rendering only for highly dynamic parts (like filtering a list without reload).

Progressive Enhancement: The sites should not break if JS fails – core content and navigation should be accessible. E.g., ensure links are real `<a href>` so they work even if our single-page app routing fails. Forms should have normal <form action= to a basic endpoint if JS is off (maybe not fully applicable if backend doesn’t have those endpoints, but could degrade gracefully by showing an informative message).

Logging and Error Handling: On the frontend, catch errors (e.g., with an ErrorBoundary in React or window.onerror) to report issues. Possibly send them to our monitoring (though careful not to flood). Provide user-friendly error messages for common failures (like “Failed to load data, please try again” if any dynamic fetch fails).

Feature Flags in UI: Use our config/flags system to conditionally enable new or experimental UI features (ensuring they can be turned off easily if problems).

Documentation for Custom Code: If any front-end code is non-trivial, ensure we comment it or document in our developer docs. For example, the algorithm for slotting voice suggestions or the logic for speculation rules usage might be documented for future devs.

High-Quality Code Review: All UI code should be reviewed for adherence to these standards. Linting and formatting (ESLint, Prettier) enforce code consistency. Also, an accessibility checklist is part of PR review (e.g., “if you introduced a new component, did you include ARIA labels, keyboard handlers?”).

SEO Considerations: Use proper meta tags, titles, and allow adding meta description in builder. Output structured data for SEO (which we do via JSON-LD). Ensure that we don’t accidentally block content (like if we had an infinite scroll, we provide an SSR fallback so content is crawlable).

Third-Party Libraries: Choose stable, well-supported libraries (for example, for any carousel or date picker use accessible ones rather than writing from scratch). But keep an eye on their size; sometimes better to implement a simple feature in a few lines than pull in a big dependency.

Continuous UI Testing: Visual regression tests (perhaps via Storybook and snapshots or Percy) could catch unintended changes in appearance. Not mandatory but a nice practice if feasible.

Acceptance Criteria / Success Metrics

UI Consistency: All pages and components of both admin and generated sites adhere to the design guidelines (spacing, colors, typography). Acceptance: Conduct a UI audit on a sample site and the admin – check a checklist: base font size is 16px, headings sizing follows scale, spacing is multiples of 8px, etc. There should be no instances of tiny illegible text or off-brand colors. If designers provided a style guide, our implementation across the app should match it pixel-perfectly for key components.

Accessibility Compliance: Achieve at least WCAG 2.1 AA compliance on both the builder and published sites. Testing: Run accessibility scanning (like axe) – should report zero critical issues (like missing alt, missing label, contrast failures). Manual tests: keyboard navigate through the site – all interactive elements reachable and operable. Screen reader test on key flows: it announces content logically. Metric: 100% of pages have proper landmarks (header, main, footer)
GitHub
GitHub
, 100% of forms have labels, etc. We can also use tools like Lighthouse Accessibility score – aim for 90+ score on all main pages. The doc’s acceptance indicated e.g., focus outlines visible, contrast pass, etc., so we must meet all those specifics
GitHub
GitHub
.

Performance Benchmarks: Achieve good Core Web Vitals. Targets: p75 of real-user LCP ≤ 2.5s, CLS ≤ 0.1, INP (or FID) ≤ 200ms for published sites
GitHub
GitHub
. Our internal Lighthouse CI should pass (no performance budget regression)
GitHub
GitHub
. Check that initial bundle size for a basic page is within budget (say < 200KB gz JS total as mentioned
GitHub
GitHub
). If our budget was 200KB gz per page for interactive bundle, ensure we’re at or below that. Also measure admin performance: builder app should load reasonably (< say 3s for main dashboard).

Cross-Browser Compatibility: The UI works in all modern browsers and devices. Test matrix: latest Chrome, Firefox, Safari, Edge, plus Safari on iPhone, Chrome on Android. It should degrade gracefully on any older browser (e.g., IE11 might not be fully supported, which is fine, but it shouldn’t outright crash – we might explicitly not support it). Acceptance is visually and functionally consistent in all tested environments, with no major layout bugs or broken functionality.

No Critical Frontend Errors: In production use, there are no uncaught exceptions from our JS. Monitoring: We review logs or Sentry (if integrated) and see zero (or extremely few) errors thrown by the UI during normal use. This indicates robust error handling. Also, no console errors should appear (that would indicate something is undefined or failed to load).

SEO-friendly Output: Confirm that search engines can index the site properly. Test: Use Google’s Mobile-Friendly Test or Rich Results Test on a sample published site. It should report all structured data is valid, page is mobile-friendly, and no blocked resources. Also, ensure the `<title>` and meta description are set (builder likely lets user set those per page, and they are output).

Smooth Voice Integration: The voice assistant UI should appear and function without breaking the page layout. Test: On a published site, when the voice widget is activated, it shows the mic, partial transcripts, etc., and doesn’t overlap crucial content or get hidden behind other elements. The suggestion chips (if present) are readable and clickable. And voice highlights on actions appear correctly on target elements (the CSS for highlight is working). This ties into UI/UX because it’s part of the user experience.

High Editor Usability: For the SiteSpeak builder interface – new users can intuitively create pages and use components (this can be gauged via usability studies). But as acceptance: all interactive controls in builder (buttons, drag handles, menus) are easily discoverable (with icons + labels or tooltips). Drag-and-drop works reliably. There are no frustrating UI quirks (like clicking to add component always works, etc.). Perhaps measured by support tickets or user feedback. But we can test basic flows: add component, configure it, move it around – everything responds correctly.

Touch & Keyboard Support: The UI, especially for end-users on sites, is fully functional on touch devices (e.g., mobile nav menus can be opened by tapping, swiping carousels works if we have those). Also, the builder likely is desktop-first but should still be usable on tablet. Test: simulate touches and ensure no hover-only interactions that don’t have a tap equivalent. For keyboard, ensure that for any custom components (like custom dropdowns) we implemented arrow key navigation if needed.

Minimal Redundancy in Code: Ensure we don’t have duplicate implementations or conflicting methods in the monorepo. Code audit: For instance, no two different components doing the same thing in slightly different ways. The design system centralizes things like button styles, so we always reuse that rather than custom styling a new button somewhere.

Client-Side Security: Confirm CSP is effectively applied. Test: When serving a published site, check the response headers: CSP should be present (and not too permissive), SRI on any external scripts, no inline scripts except our widget which should either have a nonce or be part of allowed script. Also ensure any user input on front-end is sanitized before output (this might be more in builder’s domain to restrict script injection).

Internationalization Correctness: If a site is set to a certain language, verify that things like date formats, etc., appear in that locale’s format (if we support that). If we have languages in the admin, switching language changes the UI text appropriately. At least ensure the architecture is there (maybe not fully in use if only English is launched initially).

Satisfactory Lighthouse Scores: Getting specific, our built site pages should score high on Lighthouse: 90+ in Performance, Accessibility, Best Practices, SEO for a baseline site. We can run this on a deployed sample site (with content similar to template) to verify. The acceptance from doc: items like no blocking resources, images optimized, etc., all contribute to a high score. Particularly, Accessibility should ideally be 100 or close.

Definition of Done Criteria: The doc had specific DoD points for front-end
GitHub
GitHub
, such as:

Contract Emitted: That’s more publishing, but front-end side means ensure builder actually triggers contract generation. Since pipeline handles it, we ensure builder passes necessary data. So yes, actions.json etc. present on deploy.

Speculation Rules integrated: Check that pages indeed include speculation rules script or prefetch links for likely next routes
GitHub
.

Voice widget streaming works: That we partly test above (the widget yields partials and barge-in on actual site).

PostMessage secure: Validate the targetOrigin usage in our code (we do, per docs referencing it).

Core Web Vitals pass on templates: Already covered, ensure our starter templates (the site default) score well on CWVs, which we test.

Each of those should be ticked off in final QA.

In summary, if both the builder and output sites show a polished UI that is consistent, accessible, fast, and seamlessly integrated with voice, we consider the UI/UX & Frontend standards successfully implemented and met.
