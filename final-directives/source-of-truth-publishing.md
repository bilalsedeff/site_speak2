# Site Lifecycle & Publishing

Summary

Site Lifecycle & Publishing covers how a SiteSpeak site goes from an editable state in the builder to a live website accessible to end-users (with a custom domain if desired), and how it’s maintained over time. The focus is on reliable, atomic deployments – when a site is published, it should update all at once with no broken pages, and if something goes wrong, it can be rolled back instantly. Publishing also produces the Site Contract, a bundle of machine-readable artifacts (like structured data and an action manifest) that make the site friendly to the voice assistant and search engines. This area also handles site configuration (settings like domain names, environment variables, etc.), deployments to our hosting/CDN, and domain management (provisioning SSL certificates, verifying ownership of custom domains). We adhere to best practices akin to modern JAMstack platforms: each site publish is immutable (content-addressed by a hash), deployed to a CDN with proper caching headers, and uses blue-green deployment to switch new content live with zero downtime. Essentially, Site Lifecycle & Publishing ensures that when a user hits “Publish,” their site is built, packaged, and served in a secure, performant, and consistent way every time, and that things like custom domains and contract generation are all handled smoothly.

Application Architecture

Publish Pipeline (State Machine): The process of publishing a site is orchestrated by a pipeline defined in code (e.g., /publishing/app/pipeline.ts). This pipeline goes through discrete states: Build → Contract → Package → Upload → Activate → Warm → Verify → Announce
GitHub
GitHub
. Each state is idempotent (so if a step fails, you can fix the issue and retry from that step without starting over)
GitHub
. The pipeline is often implemented as a set of queue jobs or a workflow engine that marks each step’s success.

Site Contract Generation: During the publish, after building the static files, the system runs a contract generator (siteContract.ts) which scans the built site pages and outputs:

JSON-LD data for each page (structured data JSON files or inlined scripts)
GitHub
.

An ARIA/accessibility report (to ensure the site meets accessibility landmarks).

An actions.json file (Action Manifest) which enumerates all interactive actions on the site with their selectors and parameter schemas
GitHub
GitHub
.

A sitemap.xml (and if needed a sitemap_index.xml if there are lots of URLs) with last modified dates
GitHub
.

Optionally, a GraphQL schema file (schema.graphql) and TypeScript types (types.d.ts) if the site exposes a content API
GitHub
.
These outputs together form the “contract” that is stored alongside the site and later consumed by the crawler and voice agent.

Immutable Artifact Storage: Once the site is built and the contract is generated, everything (the static site files, assets, and contract files) is packaged (often tar or zip, plus a manifest with checksums) and uploaded to an artifact store (like an S3 or Cloudflare R2 bucket) under a unique path named by the content hash (release ID)
GitHub
GitHub
. For example, an upload might be to s3://.../tenant123/site456/abcdef123456/ where abcdef123456 is a hash of the site’s content. This ensures content-addressability: the ID is derived from content, so any change yields a new ID. We tag files with long cache lifetimes (since they won’t change) and serve them via CDN
GitHub
GitHub
.

Blue-Green Deployment & Activation: Instead of replacing a site in place, we keep the previous version and prepare the new one. Activation might mean updating a pointer or alias (like a Cloudflare Worker KV or a database record) that maps the site’s domain or endpoint to the new release’s files
GitHub
GitHub
. In practice, this can be a swap of an S3 bucket alias, or an update of an edge configuration. Blue-Green means the old version is still available (green) while the new (blue) is being tested, and then we flip to blue. If something fails, we can flip back to green immediately
GitHub
GitHub
. This yields zero downtime, as users either get entirely old or entirely new content, never a mix.

Cache Warming and CDN: After activation, the pipeline can trigger a cache warm step
GitHub
GitHub
. This might preload some pages (like the homepage, or perform a few navigations) to prime caches and also catch any issues (like a broken link) proactively. The CDN integration (via a /publishing/adapters/cdn.ts module) provides methods to purge caches or generate preview URLs
GitHub
GitHub
. For example, after deployment we might call cdn.purgeByPrefix(siteId) to purge old content caches if needed, though with content-addressed URLs often we can just let old content expire.

Domain Manager: A subsystem that handles custom domain connections. If a site owner wants to use “www.mysite.com” for their site, the Domain Manager service guides them through pointing DNS records and obtains an SSL certificate via Let’s Encrypt. It supports verification either by them adding a DNS TXT record or by us providing an HTTP challenge on a verification URL
GitHub
GitHub
. Once verified, it requests a cert (ACME) and stores it (certificate and private key). Then our CDN/edge is updated to use that cert for the custom domain. The domain manager tracks domain status (pending, verified, active, etc.)
GitHub
GitHub
.

Site Configuration & Admin Settings: The site’s lifecycle includes not just publishing but also configuration like environment variables, feature flags, etc. These are often stored in a database or config file and injected at build time or runtime. For publishing, some config goes into the build (like API keys for third-party services maybe replaced with placeholders) and some stays server-side (like OpenAI keys, which are never in client). The pipeline uses those from a secure store (_shared/config likely) when building. Additionally, things like “mark route as not crawlable” might be a site setting that influences the contract generation (e.g., exclude from sitemap).

Lifecycle Events & Webhooks: After a successful publish, the system emits events like site.published or site.versionActivated and possibly triggers other services (like the KB ingestion to update)
GitHub
GitHub
. For example, an event might notify the ingestion pipeline to start indexing the new content (though our design tries to do ingestion incrementally via lastmod anyway). There could also be a contractGenerated event specifically for the AI modules to refresh action manifests.

Rollback: If any post-deployment verification fails (maybe we do a quick health check that pages load and return 200), the pipeline can automatically roll back by re-pointing to the previous version (blue-green flip back)
GitHub
. A manual rollback is also available to administrators at any time by selecting an older release to activate. Because each release is immutable and stored, switching is just an alias change – which happens in seconds.

Monitoring & Health: There are health endpoints (like /health, /live, /ready) for the system as a whole and for sites, ensuring that before we mark a deployment successful, the site responds on these endpoints (if dynamic content exists)
GitHub
. Also, a monitoring process might regularly check that all sites are up (maybe hitting a known URL or doing a HEAD request on the domain). If a site fails, alerts or automatic rollbacks could be triggered (but usually rollback is only on immediate failure after deploy, not later – later failures likely mean an infra issue).

Contract as Source-of-Truth: The published contract (especially JSON-LD and actions.json) is treated as the source-of-truth for the AI. It’s stored in a known path in the artifact (like contract/actions.json, contract/structured-data.json for all JSON-LDs) and possibly also accessible via an API. The crawler picks it up directly from artifact storage or from the deployed site (sometimes it could fetch sitemap.xml and find that contract data). In any case, the publishing ensures these are up-to-date. For instance, if the site owner added a new component in the builder, on publish the actions.json will include new actions, and JSON-LD will include new structured data, etc. This tight coupling means the AI always has a fresh understanding after each publish.

Technical Details

Build Process – The site’s build is usually a static site generation or an optimized SPA build. In our stack, we use Vite for the builder (and presumably for site runtime SSR). The pipeline’s Build step will run something like pnpm build which compiles React/TypeScript into static files in a dist/ directory
GitHub
. We enforce a deterministic build: same input = same output, to ensure the content hash is meaningful
GitHub
. This means pinning all dependency versions, ignoring timestamps, sorting any non-deterministic data, etc. We also might incorporate content hashing for filenames (like putting a hash in JS/CSS filenames to long-term cache them)
GitHub
GitHub
. The outcome is a folder of static content.

Contract Generation – After build, siteContract.ts runs. It likely loads the output HTML of each page (or uses the in-memory representation from the builder) and:

Scans for any components or elements that require JSON-LD. For example, if a page has a Product component with certain props, it generates a JSON-LD snippet for that product (with name, price, etc.) as per Schema.org, and inserts it in the page or stores globally
GitHub
GitHub
.

Performs an accessibility audit using something like Axe. It might generate a report (list of ARIA violations or confirmation that landmarks are in place)
GitHub
. Possibly this is output to an artifact for developers, but key is to ensure ARIA roles (nav, main, search, etc.) are present on each page by design (the builder enforces those, but we double-check).

Gathers all interactive elements. Since our components in the design system include metadata about actions (like a Button might have a data-action attribute if designated), the generator either reads those directly from the DOM or via a registry. We then compile actions.json: each unique action ID (like “product.addToCart”) gets an entry with its selector, parameter schema, and perhaps a description
GitHub
GitHub
. If forms are present without explicit data-action, we might create an action for form submission like “form.submit.contactForm” with fields. We ensure every interactive user-triggerable thing is listed.

Generate GraphQL schema: If the site has content types (maybe derived from the components used, like a Product type, Event type), the system can produce a GraphQL schema reflecting those and the site’s content model
GitHub
. For instance, a list of products and queries to get product by id, etc. This might be an optional feature. But if done, we store schema.graphql and generate TypeScript types (types.d.ts) for use by the AI or external devs
GitHub
GitHub
. This essentially turns the static content into an API as well.

We also explicitly write out the sitemap.xml file. We include all page URLs, and for each the `<lastmod>` as the publish time (or the last update time we have per page)
GitHub
. We exclude any no-index pages. For large sites, we implement sitemap index files to keep each sitemap <= 50k URLs. If pages have images that need to be indexed, we might include `<image:image>` entries (though not always necessary unless images are important for SEO)
GitHub
. All these follow standard sitemap and Google guidelines, ignoring priority/changefreq which are not really used by modern crawlers.

The contract generator logs summary metrics, e.g., “Generated JSON-LD for 10 products, 2 events; actions.json with 5 actions; sitemap.xml with 20 URLs.” That helps in verifying everything is accounted for.

Packaging & Upload – We create a manifest.json that lists each file with its size and a SHA-256 hash
GitHub
GitHub
. Then everything is bundled (perhaps tarred) for easier upload as one, or we might upload file-by-file. The artifactStore interface has methods for putObject (with optional MD5 or SHA for integrity) and presignPut etc. We use these to upload to either S3 or an R2 bucket behind the scenes
GitHub
GitHub
. The artifact store ensures immutability: if we attempt to overwrite an existing release path without a force flag, it should refuse
GitHub
GitHub
. This is to align with the idea that once a release is published it never changes (if something needs change, create a new release). We also use multi-part or streamed upload if large files are present (some sites might have videos or big images).

We set appropriate Cache-Control headers on upload: e.g., for fingerprinted static assets (like main.abcdef.js), set Cache-Control: public, max-age=31536000, immutable
GitHub
GitHub
. For HTML pages, which though content-addressed by hash might still be accessed via generic URLs (like /about might serve content from releaseHash/about.html), we usually set Cache-Control: no-cache, must-revalidate so that edge servers check back if there’s a new version on each request (which in our scenario means checking if the alias changed)
GitHub
GitHub
. At CDN level, we might use surrogate keys to purge whole site if needed, but ideally not necessary because of versioning.

Activation can be as simple as updating a database entry that holds currentReleaseHash for that site, which our CDN uses to route. Or, if using something like Cloudflare Workers, it could map a hostname to a particular bucket/namespace containing that release. Another approach is to have each site’s domain point to a general handler that looks up which release to serve (like using a KV store or a mapping service).

Domain Connection – This involves external steps (DNS propagation). The Domain Manager first verifies the user owns the domain: for HTTP-01, it will serve a token at `http://yourdomain/.well-known/acme-challenge/<token>` from our system and ask Let’s Encrypt to validate. For DNS-01, it asks the user to put a specific TXT record. We have logic to either check the DNS (using a DNS resolver library) or the HTTP endpoint (which is simpler if the domain already points to us)
GitHub
GitHub
. After verification, we use a ACME client library to request a cert. The result is stored in our DB (and likely also in a secret manager, since it includes private key)
GitHub
. Then, when traffic comes to that custom domain, our edge sees the Host header and uses the right certificate for TLS. We also ensure HSTS headers and so on are set for security.

Domain management also deals with renewals: Let’s Encrypt certs expire ~90 days, so we schedule auto-renew around day 60-70. Our service should handle renewal transparently (likely via the same ACME library’s renewal function) and update the stored cert.

Environment Management – We support preview/staging vs production deploys. For example, a “Preview” publish might go to a temporary URL or not get indexed by search. Our pipeline likely takes a parameter deploymentIntent (preview or production)
GitHub
. If preview, maybe we don’t do certain steps (maybe skip some announcements or different caching strategy). Also preview deploys might auto-expire or be tied to a certain branch. The pipeline and artifact storage key could incorporate that (like using a separate prefix for preview). But logically, it’s the same process, just separated.

Security & Compliance – During publishing, we incorporate security steps:

We ensure no secret credentials end up in client bundle (maybe a check in build output).

Set a strong Content Security Policy (CSP) on pages by default (to only allow scripts from our CDN, etc.). Possibly the builder injects this by default or we add meta tags in HTML.

Provide a Sigstore signature: as a bonus, we might sign the artifact with Sigstore’s cosign, so we can verify supply chain integrity
GitHub
GitHub
. This is a future-forward thing mentioned (Sigstore).

Generate a Software Bill of Materials (SBOM) for the build (like listing dependencies used), which can be stored as well.

When deploying on our infra, isolate each site’s processes (if any dynamic runtime) by container or functions. But since it’s static, mostly not an issue.

Announcements & Webhooks – After success, pipeline triggers:

site.activated event (the site is live on new version).

kb.refreshRequested event or direct call to ingestion to update the knowledge base
GitHub
GitHub
.

Possibly analytics event “publish done in X seconds”.

If we integrate with external systems, maybe a webhook to a Slack or an email to the customer “Your site is published!” etc.

Site Lifecycle Management – Besides publish, lifecycle might include unpublishing or archiving a site. In that case, domain routing could be removed or point to a “site not available” page. We maintain older releases (perhaps we keep the last N for rollback and reference), cleaning up older ones if not needed (since they are content-addressed, if storage is a concern we could prune after some time, except if needed for legal/archive).

Also, contract versioning: if our contract format updates, we might version those files (like actions.json version property, which we have as "version": "1" in it)
GitHub
GitHub
.

Best Practices

Atomic Deploys: Never serve partial updates. Use blue-green or similar so that at the moment of switch, either the old or the new version is served to any given user
GitHub
GitHub
. This avoids cases where some static files updated but others not, leading to inconsistent behavior. Achieve this by content-addressing and one-time alias switch. This is a core practice from places like Netlify/Vercel
GitHub
.

Immutability & Caching: Treat each deployment as immutable. This lets us set aggressive caching (far-future expiration) on static assets because they won’t change (the URL would change if content does)
GitHub
GitHub
. This yields better performance. Also, no manual “cache flush” is needed for content, since new content = new URL. For HTML and certain APIs, use no-cache so that CDN/clients revalidate on each request to catch new versions on switch
GitHub
.

Use Sitemaps & `<lastmod>`: Always generate accurate sitemaps with last modified dates
GitHub
GitHub
. This is both good SEO practice and vital for our incremental crawler to know what changed when. Avoid including things like priority/changefreq which do nothing. If a site is huge, paginate into a sitemap index to keep files reasonably sized.

Prefetch and Preconnect: Inject resource hints (like `<link rel="preconnect" href="https://api.sitespeak.com">` or `link rel="dns-prefetch" ...>`) for any external origins (analytics, APIs) so browsers can resolve DNS early
GitHub
GitHub
. Use `<link rel="prefetch">` or the modern Speculation Rules for pages likely to be visited next (like the builder can determine logical next pages – category to product, etc.)
GitHub
GitHub
. This significantly improves perceived speed as next pages load almost instantly when user navigates (the assistant also benefits, enabling optimistic navigation).

Reproducible Builds: Pin dependency versions, lock the build environment (node version, etc.), and avoid nondeterminism (like embedding timestamps)
GitHub
. This way, a given commit always produces the same site output. It’s easier to debug issues (because you can rebuild the same version) and needed for any build signing or verification. Use tools like Docker for build environment consistency or at least document exact build setup.

Gradual Rollout in DNS (if needed): For custom domains, after first provisioning, subsequent updates don’t need DNS changes, but if we had multiple edge locations, sometimes people do phased rollouts (not typically for static though). Our approach is usually all-or-nothing activation, which is fine for static content changes. Ensure DNS TTLs are moderate (not too high in case we need to re-point).

SSL Best Practices: Always use HTTPS (which we do with Let’s Encrypt). Redirect HTTP to HTTPS. Include HSTS header with a sensible duration once we’re confident (to enforce HTTPS on clients). Renew certs proactively.

Monitoring & Alerting: Set up monitors for site uptime. Immediately after deploy, run a quick check: e.g., fetch the homepage and a couple important pages (maybe via the verify step)
GitHub
GitHub
. If any fail (like a 500 or missing resource), trigger auto-rollback. Also, keep historical logs of deployments – who published, version hash, time, to have traceability.

Keep Old Versions (for rollback & history): Don’t delete the previous version immediately after a new deploy. Keep at least one (or several) old versions available so rollback is instant. Possibly even serve a “preview” on old version for debugging if needed. Clean them up eventually to save space, but maybe keep some for record (especially if each is content-addressed by hash, storage of differences might not be big since many assets could repeat across versions – though our content address implies new hash if anything changes, so not deduping across versions necessarily).

One-button Rollback: Provide an easy mechanism to revert to last good state. This should be nearly as fast as deploy (just flipping pointer), and ideally not require a full rebuild (since we still have the files stored).

CDN Configuration: Use CDN features smartly:

Set up surrogate keys/tags for purging related content (our adapter supports purge by tag
GitHub
). e.g., tag all pages of a site with site: `<siteId>` so we can purge them if needed, or tag certain content groups. This gives selective cache clearing if ever needed (like if a legal issue requires immediate removal of something – we could purge by tag rather than wait for TTL).

Consider enabling stale-while-revalidate on HTML pages so even if they are set to no-cache, the CDN can serve a slightly stale page while fetching new one to reduce wait times
GitHub
GitHub
. But since we do blue-green, that might not be needed or might complicate immediate switch – likely we keep it straightforward (explicit must-revalidate).

Use CDN-level rewrite rules if needed for some dynamic behavior (though prefer to bake everything in statically).

Deploy Safety Checks: Before deploying, maybe run tests. For example, if we have end-to-end tests or even a quick lighthouse audit on the built site, do that in the Verify stage. Also check that the JSON-LD passes Google’s structured data linter (maybe an automated check or at least our contract generator ensures required fields).

Transactionality: The pipeline steps should be transactional where possible. E.g., do not “Activate” (flip to new site) until Upload is fully done and verified. If any step fails, ensure the system is still in a consistent state (like if build succeeded but upload failed, the old site is still live, and we didn’t partially switch anything).

Parallelize where possible: Build and contract generation are CPU-bound; packaging and upload are I/O-bound; warming is network-bound. We could parallelize some steps (like start uploading large assets while still generating some smaller ones, etc.) but only if it doesn’t complicate the pipeline correctness. Typically, pipeline is linear to be safe.

Logging and Visibility: For each publish, provide logs to developers (in admin UI perhaps) – so if something goes wrong, they can see “Build failed: error in code on line X” or “Publish failed at Upload: S3 permission denied” etc. Also version each release and allow downloading the artifact or its manifest for debugging.

Contract Consistency: Make sure the published contract always matches the deployed site files. It’s generated from them, so it should. But e.g., if a page is generated after the contract step (unlikely), it might be missing. So always generate contract after final site output is ready. If any manual changes happen (not in our flow, but imagine someone manually editing a file on storage – which we should avoid by immutability), contract would be out of sync. So treat contract as authoritative – any change means republish so contract regenerates.

Scale Considerations: If a site has thousands of pages, ensure our pipeline can handle it (maybe parallelize page processing in contract generation). For very large sites, consider incremental build (but that’s advanced; static site gens often do full build). Our architecture possibly expects sites not to be extremely huge (maybe under a few thousand pages in most cases? If user added a blog with 10k posts, we need to handle that – perhaps by lazy loading or splitting into multiple sitemaps).

Tenant and Site Isolation in Infra: Keep each site’s publish artifacts separate (which we do by separate keys). Also isolate compute if needed (one site’s heavy build shouldn’t starve others – use a queue with concurrency limits per tenant or so if needed).

Documentation & Transparency: Provide documentation to site owners about the deployment: e.g., how long it usually takes, how domain setup works, etc. Possibly even a status indicator during publish (“Building... Uploading...”). We have those steps enumerated, can surface them in UI.

Acceptance Criteria / Success Metrics

Successful Deploy Rate: Over a given period, ~100% of publish attempts result in a live site or a proper rollback without impacting uptime. Acceptable metric: No failed deployment ever leaves the site in a broken state. Either it succeeds or it rolls back automatically. Any errors are caught internally. We track the number of deployments and any that ended in a manual intervention – target zero manual interventions for deploy issues.

Deployment Speed: Publishing a site should be reasonably fast. For a typical medium site (say 50 pages, moderate assets), aim for < 2 minutes end-to-end (build to live) at p95
GitHub
. SLA might be p95 ≤ 90s as in the doc
GitHub
. We measure from the time user hits publish to the time site is live and accessible. This includes build time – which depends on complexity – but we can optimize our hosting steps to be quick (upload and flip are often seconds). Large sites (hundreds of pages) might take a few minutes more due to upload size – still should be under, say, 5-10 minutes for thousands of pages.

Instant Rollback: If a rollback is triggered, it completes in < 5 seconds
GitHub
. Essentially just a pointer update. We test this by performing a manual rollback in staging and measure time to old version being served. The acceptance is that rollback feels instant to end-users (no prolonged outage).

No Mixed-Version Serving: At no point during deployment should a user see a mix of new and old content. Test: Rapidly refresh the site or fetch resources via script during a deployment – ensure that either all old or all new resources are returned, not a scenario where new HTML tries to load an old JS (which could break). Our blue-green approach inherently ensures this. We can also simulate slow clients in the middle of deployment and verify consistency.

Cache Efficacy: After deployment, repeat visits (with caching) load quickly and always get the current version when they should. Metric: After a new publish, within TTL (since HTML is no-cache, the user’s browser will revalidate and get new content immediately). Static assets use different URLs so no stale cache issues. The presence of the content hash in asset URLs ensures near 0% cache miss on unchanged assets across deploys and no stale asset served for changed content. Essentially, measure that a second view of the site (with cached unchanged assets) still works with new pages – which it will because of our hashing.

Contract Integrity: Verify that each publish produces a valid contract. Acceptance tests: The actions.json should include all expected actions (e.g., if we add a new button and publish, verify it appears in actions.json). JSON-LD should pass Google’s Rich Results Test for applicable content (we could automate checking one page’s JSON-LD per type). Also, run the ARIA audit and ensure it passes thresholds (the doc suggests ARIA audit score ≥ 90% or similar)
GitHub
GitHub
. We define a criterion like: zero critical accessibility violations post-publish (if any are found by our audit, we consider it not meeting internal quality, though we might not block publish, but it should be addressed).

Domain Setup Success: For custom domains, the process from user initiating domain connect to domain being live with SSL should be smooth. Acceptance: 100% of domains that are correctly configured by users become active (we can check domain status transitions in our logs). Also certificate issuance success rate ~100%. Time to provision typically within a minute after DNS propagation. We ensure domain verification logic is robust (no false negatives). Also, check that our system serves the correct cert and HTTP -> HTTPS redirect works. We might manually test a couple domains or have an automated check on new domains.

Security Compliance: A security audit of the deployment process yields no major issues. For example, content is served over HTTPS, no sensitive data accidentally in public content, and our config respects things like not including secrets in client bundle. Also, headers on the site are set: Content Security Policy (as strict as possible without breaking site), and other security headers (XSS-Protection, etc.). We can use security scanner tools on a deployed site; aim for A+ on security header tests and no obvious vulnerabilities.

Performance Benchmarks: Deployed sites should hit performance benchmarks: e.g., Core Web Vitals for the default templates should be within targets (LCP under 2.5s, etc.)
GitHub
GitHub
. While content affects this, our platform provides things like prefetch and optimized assets out of the box. We verify on a sample deployed site (with default content) using Lighthouse or WebPageTest that baseline performance is good (first contentful paint, etc.). Also, our pipeline’s addition of resource hints and preconnect should yield quick navigation. At least, the deployment process should not introduce performance regressions (like heavy scripts).

Operational Metrics: The publishing system should expose metrics and meet them: e.g., database entries for each deployment, artifacts stored, etc. Uptime: The publishing service (the API that triggers build and orchestrates) should have high availability (nearly 100% outside scheduled maintenance), though since publishing is user-initiated and not end-user facing, slight downtime isn’t as critical as site availability. But aim for no downtime in deployment pipeline. If the service is down, queue requests or fail gracefully and alert.

User Experience: For site editors, the publishing experience should be clear and reliable. Survey or Feedback: Users feel confident that when they hit publish, changes will be live and if something goes wrong, they are notified (through error messages or rollback without them noticing issues). If publish fails, UI informs them rather than silently failing. So acceptance includes robust error reporting: any pipeline failure is communicated via the admin UI with a clear message.

Eventing and Integration: Ensure the site.published event triggers follow-on processes like crawling. Test: After a publish, confirm that an ingestion job was queued (via logs or the knowledge base updating). The criterion is that all dependent systems are notified and react accordingly, within a short timeframe (e.g., ingestion starts within seconds of publish Announce step).

Scalability: The system can handle multiple sites being published concurrently (e.g., at peak hours many users hit publish). Acceptance: No significant delay is added in queue – if 5 publishes happen at once, all should start and complete in reasonable time. We may measure pipeline throughput (maybe can do at least e.g. 10 parallel publishes per build server, scale out horizontally if needed). Essentially, the architecture (with queue and possibly separate workers for build vs deploy) should scale without single bottleneck (except perhaps artifact store I/O, which typically can handle it).

Accurate Version Tracking: Each deployment is uniquely identified (e.g., by commit hash or build number and content hash) and that information is visible. This is achieved by content hash in URLs and maybe a version displayed in admin. Acceptance: the system can tell exactly which version is live for a site (and correspond it to a git commit or builder state). If a user says “my site looks wrong”, support can see “they’re on release abcdef which correlates to code version Y”. This traceability is a success criterion for maintainability. We consider it passed if our logs/DB clearly record that mapping and we’ve tested retrieving it.

No Data Loss: No content should be lost between publishes. If a user had something on the site and didn’t change it, it should remain. (Should be obvious, but e.g., our pipeline should include everything; nothing gets accidentally omitted because of a bug in contract generation or packaging). We test by doing multiple sequential publishes (with minor changes) and verifying content not touched stays live.
