# Knowledge Ingestion & Retrieval

Summary

Knowledge Ingestion & Retrieval is the backbone that enables SiteSpeak’s voice assistant to answer questions with facts from a site’s content. Ingestion refers to how we gather and process all the content from a website (pages, products, FAQs, etc.) into a structured Knowledge Base (KB). This involves crawling the site (or reading its provided data), extracting meaningful information (text, structured data, action hooks), cleaning and chunking that data, and storing it in an efficient way (a vector database for semantic search, plus a text index). Retrieval is how the assistant queries that knowledge base in real time to find relevant pieces of information when the user asks a question. The combination ensures that the AI agent always has up-to-date, factual information about each site and can retrieve it quickly to ground its responses (this is often called Retrieval-Augmented Generation, RAG). In simpler terms: ingestion builds the “brain” or memory of each site, and retrieval lets the AI look up answers or context from that memory whenever needed, rather than guessing. This system is designed to be standards-compliant (using sitemaps, JSON-LD, etc.), polite to the websites (no overloading them), and very fast in fetching updates (only changes are indexed) and answering queries (via optimized vector search).

Application Architecture

Site Crawler: A component that automatically discovers and fetches the pages of a site. It uses a headless browser (Playwright) to render pages like a normal user would (important for sites with dynamic content)
GitHub
. It respects robots.txt and other crawler rules. The crawler either runs on a schedule or is triggered by site updates. For SiteSpeak-built sites, it prefers the sitemap for guidance and can even do a faster fetch using simpler HTTP requests when possible (because the sites are structured predictably).

Extraction Pipeline: After a page is fetched, the system runs a series of extractors to pull out data:

Text & DOM Extractor: Grabs visible text, headings, and the HTML structure (especially ARIA landmarks and other semantic markers)
GitHub
.

JSON-LD Structured Data Extractor: Parses any JSON-LD scripts on the page (e.g., product details, events, FAQs in Schema.org format) for high-quality structured facts
GitHub
GitHub
.

Form & Action Extractor: Identifies forms and their fields (so the assistant knows what inputs exist) and any elements with data-action attributes, mapping them to the Action Manifest entries
GitHub
.

Transformation & Indexing: The extracted content then goes through transformers:

Cleaner/Sanitizer: Removes sensitive data (like user emails, API keys that might have slipped into page content) and any irrelevant markup
GitHub
GitHub
. It also normalizes whitespace, case, etc., to have a consistent text.

Chunker/Splitter: Breaks the content into manageable chunks (e.g. 200–500 words) for indexing
GitHub
GitHub
. It tries to split along semantic boundaries (paragraphs, sections) so each chunk is cohesive. Overlap is sometimes added (10% or so) to ensure context isn’t lost between chunks.

Embedder: Passes each chunk of text through an embedding model (like OpenAI’s text-embedding-ada-002) to get a vector representation
GitHub
GitHub
. These vectors capture semantic meaning, enabling similarity search (“find me content related to X”).

Indexer/Database Loader: Stores the processed chunks in the Knowledge Base storage – typically a PostgreSQL database with a pgvector extension for vector search
GitHub
. Each chunk entry includes the text, the vector, metadata (page URL, section, maybe an ID to reconstruct the context), and a hash of the content for change detection
GitHub
. We also maintain a full-text index (or at least text for keyword search) to allow hybrid searching (combining vector similarity with keyword filters)
GitHub
GitHub
.

Delta Update Manager: Rather than re-indexing everything all the time, a delta detection component figures out what’s changed:

It reads the site’s sitemap.xml and looks at the `<lastmod>` timestamps on pages
GitHub
GitHub
.

It also keeps track of content hashes for each chunk. If a page’s lastmod changed or an external webhook (like “product updated”) is received, it will crawl that page and recompute chunks, then only upsert new or changed chunks in the DB
GitHub
GitHub
. Unchanged chunks are left as-is, and removed content is marked as deleted. This way, updating a site doesn’t cause a full re-index, just an incremental one.

It uses HTTP headers (ETag and Last-Modified) for an additional layer: when fetching pages, it sends If-Modified-Since/If-None-Match, so if the server says “304 Not Modified”, we know nothing changed on that page
GitHub
. This conserves bandwidth and time.

Knowledge Base Storage: Each site (and each tenant) has an isolated knowledge store so data doesn’t mix between sites
GitHub
. In PostgreSQL, we either use separate schemas or tables partitioned by tenant/site. The main table (e.g., knowledge_chunks) holds the content chunks with their vector embeddings and metadata
GitHub
GitHub
. We create a vector index (HNSW algorithm) on the embedding column for fast ANN (Approximate Nearest Neighbor) search
GitHub
GitHub
. We also can have a text tsv column indexed with GIN for full-text search to support hybrid queries
GitHub
GitHub
.

Retrieval API/Service: A service (often within the AI Orchestrator module) that handles search queries from the agent. When the agent needs information, it formulates a query (which could be the user’s question, possibly with some filtering instructions) and calls the Retrieval service. This service does:

Language Detection & Routing: It detects the language of the query (if the site is multilingual) to search in the right index or apply the correct language model for embedding
GitHub
GitHub
. For instance, if the user asks in Turkish on a bilingual site, it ensures we search the Turkish content slices.

Vector Similarity Search: It converts the query (or key terms) into an embedding (using the same model as ingestion) and finds the nearest neighbor chunks in the vector index
GitHub
GitHub
. It may use an approximate algorithm (HNSW) with tuned parameters to balance speed and recall
GitHub
.

Hybrid Search and Re-ranking: Optionally, it can also run a traditional keyword search or use filters (e.g., only search within product descriptions if the question seems product-related). It may then combine the results using methods like Reciprocal Rank Fusion (RRF) to merge vector-based and text-based rankings
GitHub
. A re-ranker model (like a mini transformer cross-encoder) could be applied to the top results to refine quality
GitHub
.

Caching Layer: The retrieval system implements caching of recent queries. We use an in-memory cache (L1) and a distributed cache (Redis as L2) with a stale-while-revalidate policy
GitHub
GitHub
. This means if a question has been asked recently, we can return the last answer immediately (even if slightly stale) and simultaneously trigger an update in the background if needed. Cache keys might be normalized queries or embedding fingerprints.

Output: The retrieval returns a set of top-matching knowledge chunks (with scores) to the orchestrator. These chunks typically include the snippet of text and references (like page URL or element ID). The orchestrator can then use these to formulate a grounded answer (possibly quoting the site content) and also decide which action to take (e.g., if an action is associated with a snippet, like “Contact us” form, it might use that).

Knowledge Base Service & Monitoring: A coordinating service ensures the ingestion pipelines run to completion and monitors their progress. For example, when a site is published, a job is queued to “index site X”. The KnowledgeBaseService starts crawling pages via the CrawlerService and tracks how many pages are done, etc. It exposes progress via events or an API so the admin UI can show “Indexing 80% complete”. It also provides methods like getStats() (how many pages indexed, last indexed time) and clearCaches() (to drop caches if needed)
GitHub
GitHub
. For monitoring, we collect metrics like pages per minute processed, average extraction time, error rates, which are logged or sent to a monitoring dashboard.

Technical Details

Crawler Implementation – We use Playwright in headless mode for a robust crawling that can handle SPAs and dynamic content
GitHub
GitHub
. The crawler is set up with polite defaults: it will obey robots.txt (we parse it and ensure we don’t fetch disallowed URLs)
GitHub
. It also respects `<meta name="robots" content="noindex">` on pages (we may fetch the page to see the meta but then not index it) and rel="canonical" links (we use the canonical URL as the identity of the page in the KB)
GitHub
GitHub
. We throttle requests per domain to a safe rate (for example, no more than 2 pages per second by default, adjustable per site). We also implement retries with backoff for transient failures (network issues, timeouts) and give up after a certain number of attempts. For JavaScript-heavy pages, Playwright’s page.goto() is done with specific wait conditions: we usually wait for the DOMContentLoaded event and maybe a network idle (no network for X ms) – for sites with lazy loading, we might tweak this or allow a script on the site to signal readiness. For efficiency, we block unnecessary resource types (images, fonts, ads) in Playwright to speed up loads by ~3x
GitHub
GitHub
. This is configured via route interception (e.g., page.route('**/*.{png,jpg,svg,gif}', route => route.abort()), same for fonts etc.). We also utilize Playwright’s browser context reuse: using one browser instance with multiple pages (up to a limit) to avoid re-launching the browser repeatedly.

Lightweight Crawl Path – For SiteSpeak-generated sites, we have an optimization: since those sites provide a complete site contract (with JSON-LD and static HTML content), we can sometimes skip the headless browser and just use a simple HTTP fetch plus HTML parser (like Cheerio). Our design included a LightweightCrawlerService that does:

Download HTML via fetch (since we know it’s static or nearly static content).

Use Cheerio to parse the DOM and extract needed content (text, JSON-LD by selecting `<script type="application/ld+json">` and parsing JSON, etc.)
GitHub
GitHub
.

This is much faster (no browser overhead, lower CPU and memory) – as noted, potentially 10x throughput and far less resource usage
GitHub
GitHub
.

However, if a site is not pure static or has client-side rendering, we fall back to Playwright. The SmartIngestionService chooses the path: if siteType is SiteSpeak and site has structured content flag, use lightweight, else use heavy browser ingestion
GitHub
GitHub
. (As of now, the lightweight path is planned/improving – initial implementation likely covers simpler cases.)

Content Extraction Details – We put a lot of emphasis on structured data:

JSON-LD is parsed for known schema types (Product, FAQPage, Event, Article, etc.). We might transform those into a normalized format or store them as-is in the KB under a structured field (some systems store JSON-LD separately; in our case we often merge it into text or at least use it to enrich the text). For example, if JSON-LD says {"@type": "Product", "name": "Red Dress", "price": "$40"}, we ensure that “Red Dress – $40” ends up in the index as factual content, and maybe also store a JSON blob so that if needed, the agent can retrieve structured fields
GitHub
GitHub
.

ARIA landmarks and roles from the HTML are extracted to help the agent target sections (e.g., know what is the main content vs nav). We save something like: for each page, what the `<header>`, `<nav>`, `<main>`, `<footer>` text is
GitHub
. This can help avoid indexing irrelevant boilerplate multiple times (maybe we exclude nav content or de-prioritize it in search).

Each form is extracted with its input names, labels, and validation rules if possible (e.g., required fields). This could feed into the tool schema for that form (for example, a contact form might produce a tool with parameters name/email/message).

The actions (buttons/links with data-action) are extracted with their selector and possibly context (like the text of the button). These are cross-referenced with the Action Manifest. We might store an entry like: on page X, there’s an action “product.addToCart” with selector #add-to-cart-btn and maybe a snippet of surrounding text “Add to Cart”. This way, if the user says “Add this to my cart” while on that page, the agent could identify which action to invoke.

Content hashes: we compute a hash (SHA-256 or similar) of each chunk’s core text
GitHub
GitHub
. We also may compute a page-level hash (could be a hash of all chunk hashes). These help detect changes: e.g., store the last seen hash for each page, so on re-crawl we compare and skip indexing if identical. The chunk hashes specifically allow the delta update to only re-embed changed chunks rather than everything.

Vector Store and Query – We use pgvector in Postgres to store embeddings (the vector dimension is 1536 for the ada-002 model)
GitHub
. We create an HNSW index because it gives much faster query times on larger data (with a slight recall trade-off we can manage). For smaller sites, even a brute-force might be fine, but we assume scaling. The HNSW parameters (M, ef_search, ef_construction) were chosen based on typical site content sizes (maybe M=16, ef=64 in construction, ef_search tunable at query time). These can be adjusted per dataset size for optimal performance
GitHub
GitHub
. We expose a way to tweak ef_search per query: our retrieval code can set it (e.g., set higher ef_search for more accurate results if we plan to re-rank). The vector distance used is cosine similarity, which is appropriate since we normalize vectors or use pgvector’s cosine operator directly
GitHub
. Alternatively, inner product could be used if all vectors are normalized. The important part is we ensure the distance metric aligns with the embedding’s properties (OpenAI embeddings are not unit length by default, so using cosine is standard
GitHub
).

Multi-tenant Isolation – We partition by tenant so that one site’s data never appears in another’s search results
GitHub
. If using a single table, every query filters by tenant_id AND site_id. This is enforced at multiple layers: at query time in code, and even at the database level (Row-Level Security policies can be set so that a connection with a context only “sees” its tenant’s rows). This is crucial not just for privacy but also for relevance – we don’t want the vector search returning content from the wrong site which would confuse the AI. It also helps keep indexes smaller per site, making search faster.

Cache and Performance – To make retrieval snappy, we implement a two-layer cache:

In-process LRU cache keyed by recent queries and maybe user/session (size limited to some number of entries). Good for very fast repeat queries in a single conversation (if user asks same thing twice in a row, second time is instant).

Distributed cache (Redis) keyed by query and site, storing the top N results and maybe a timestamp. We use stale-while-revalidate: meaning if a cached entry is older than, say, 10 minutes, we still return it instantly but also trigger an async re-run of the search in case content changed so the cache gets updated
GitHub
GitHub
. If the content did update, our ingestion system likely would have updated an index and perhaps invalidated relevant cache keys via events (for instance, after an ingestion job completes, we could flush the cache for that site or certain queries).

These caches are careful to include locale/language as part of the key if language-specific.

Knowledge Base Completeness – The ingestion is designed so that if something is on the site and meant to be user-visible, it should be in the knowledge index. We ensure that even images with important alt text or captions get indexed (since an assistant might be asked “what is shown in this image?” if alt text is descriptive), though by default we focus on text. We do plan for specialized ingestion like a GraphQL loader
GitHub
: if a site has a /graphql endpoint exposing its data (like product inventory or blog posts), we can directly query that for a more structured ingestion (which might give us things like product attributes in a clean form). Similarly for REST APIs. These are incorporated via the apiLoader.ts
GitHub
. Ingestion is extensible: new extractors or loaders can be plugged in without changing the high-level pipeline.

Closed-Loop and Isolation – Each site’s KB is “closed-loop,” meaning we aim to have it contain all knowledge needed for that site’s queries, without needing external info, and it doesn’t include knowledge from elsewhere that could create conflicts. For example, if a site sells apples, the knowledge base would have the info about those apples from that site, but not random Wikipedia facts about apples (unless the site itself included them). This prevents the AI from mixing contexts. Also, if a site has multiple languages or sections, we preserve context of origin: results always carry the source page info so answers can be given in the right context (and language).

Retrieval in Action – Suppose a user asks, “What are the dates for the summer EDM concerts by the sea?” The orchestrator will formulate a query to the retrieval system, possibly including filters: look for content of type Event with genre EDM, location near sea (the agent might derive keywords or use the structured fields ingested, like an Event JSON-LD with “location” containing beach venues). The retrieval engine will search the vector index for embeddings related to “EDM concerts sea summer” and might also filter to events (if we tagged chunks by type). Thanks to earlier ingestion, the KB likely has chunks from the events pages that mention “EDM” and “waterfront venue” and dates in summer. The top results come back (maybe snippets about a “Sunset Beats Festival – July 12 at Beach Club – Genre: House/EDM”). The orchestrator then uses that to answer the user’s question (“Sunset Beats is on July 12 by the sea, and there are 2 other concerts in August...”) and possibly follow up by asking if the user wants tickets (because it also saw the ticket.add action in proximity in the knowledge and actions).

Best Practices

Respect Standards & Politeness: Always honor robots.txt and similar standards when crawling
GitHub
. This prevents any unintended overstep. Use the sitemap as the primary source of truth for what to crawl and when (incremental via `<lastmod>`)
GitHub
. This is aligned with how search engines operate and ensures we’re efficient and respectful.

Structured Data First: Give priority to structured data (JSON-LD) in ingestion
GitHub
. It’s less error-prone than scraping visual text and often contains exactly the facts users will ask about. Following Schema.org and Google guidelines here yields a high-quality knowledge base. For instance, use product schema for prices, FAQ schema for Q&A – these directly inform the assistant’s answers with correct info.

No Heuristic Scraping of Actions: Do not rely on brittle heuristics to figure out what buttons or forms do – use the Action Manifest that the site publishing process provides
GitHub
. This manifest lists all the interactive capabilities deterministically, so ingestion should consume that (which it does via the actions.json file) to know what actions exist. This approach is far more reliable than guessing from button text.

Efficient Incremental Updates: Design ingestion to be delta-first – never reprocess the whole site if we can avoid it
GitHub
. Use timestamps and content hashes to only index what’s new or changed
GitHub
GitHub
. This not only is efficient but ensures the KB is updated almost in real-time after changes (within seconds or minutes rather than hours).

PII Scrubbing & Security: Scrub personal or sensitive data during ingestion
GitHub
GitHub
. This means if any user information, credentials, or secrets appear in content (they shouldn’t, but sometimes mistakes happen), the ingestion process should detect patterns like emails, phone numbers, API keys and remove or anonymize them. The knowledge base should only contain content that’s safe to be echoed back by the AI. Also, ensure knowledge indexes only public content – if certain pages are behind login or marked not for indexing, skip them.

Keep Knowledge Base Isolated: Each site’s knowledge base should only contain that site’s data. This sounds obvious, but the key is to enforce it at every layer (crawler doesn’t follow external links, search doesn’t cross tenant boundaries). This prevents any data leakage across clients and also keeps search results contextually relevant.

Tune Vector Search for High Recall: For semantic search, especially on smaller corpora (most sites are relatively small compared to the internet), aim for very high recall. It’s better the retrieval returns a few extra somewhat-relevant snippets than to miss the crucial one. So we might use a slightly larger ef_search or return top 10 instead of top 3 results to the orchestrator, which can then filter. Also, consider using hybrid search: if the query contains specific keywords (names, numbers), ensure those are used as filters or boost in results. A pure vector approach might miss something exact-match would catch.

Use Caching with SWR: Implement caching for repeated queries, but always have a strategy to refresh. Stale-while-revalidate ensures users get fast answers even if the first answer is slightly outdated, and then the next user will get updated info
GitHub
GitHub
. For example, if inventory changed, an answer about stock might be stale – SWR allows quick response then triggers an update so subsequent answers are correct.

Leverage DB Capabilities: Use database features for reliability – e.g., wrap the ingestion of a page in a transaction so that if something fails halfway, you don’t end up with half-indexed content. Use UPSERTs for content chunks by unique keys (like content hash or composite keys of page+position) to simplify updates
GitHub
GitHub
. Also, have database constraints to avoid duplicates (we set a unique constraint on (site, content_hash) to not store the same chunk twice)
GitHub
GitHub
.

Monitoring and Alerting: Treat the ingestion pipeline as critical infrastructure. Monitor how long indexing jobs take, and set up alerts if, say, a site’s indexing suddenly fails or slows down dramatically. Also monitor retrieval: if queries are taking too long or returning too many/few results, that might indicate an issue (like index not built or search parameters off).

Fallback for Non-JS Content: If some sites (maybe third-party ones) don’t require headless browser, have a simple crawler fallback to use just HTTP GET and parse. This conserves resources for those cases. Conversely, for very dynamic sites (like ones requiring login or user interaction), consider whether those can be supported or if we document that as a limitation (could incorporate an authenticated crawl if needed for certain content).

Periodic Full Crawls: Even with delta updates, plan to do a full recrawl of each site once in a while (say, weekly or monthly) to catch any changes that might be missed or to clean up (if some content was removed and somehow not caught). This full crawl can also validate that our delta logic is working (compare what full finds vs delta). Since it’s heavy, schedule these in off-peak times or staggered.

Metadata for Tools: When indexing, tie content to actions. For example, if a chunk is from a product page, link it to the product.addToCart action if that’s on the page
GitHub
. This way, when the user asks something and we retrieve that chunk, the agent knows not just the info but also that “hey, there’s an action to add this to cart right here.” This is part of enabling the agent to act while it answers.

Evaluation with Sample Queries: After indexing a site, automatically run a set of sample queries (if available) to ensure the retrieval returns sensible results. For instance, for an e-commerce site, query the KB for “price of [a known product]” or “return policy” – see if the correct content comes. This can be part of automated tests or a QA checklist for new clients.

Acceptance Criteria / Success Metrics

Complete Site Coverage: After ingestion, 100% of pages intended for indexing are indexed, and their key content is stored. Acceptance test: For a given site, pick random pages or sections (especially those containing critical info like product details, FAQs, etc.), and verify that asking a question whose answer is on that page yields the correct info, indicating it was ingested. Every published site should emit a sitemap and contract, and our system should confirm that all those pages were processed (e.g., the number of pages indexed equals number of pages in sitemap minus any intentionally skipped by robots rules).

Freshness (Low Staleness): The knowledge base updates within a few minutes of site content changes. Metric: If a site owner updates a product price or adds a new FAQ and republishes, the system (via webhook or lastmod scan) ingests the change typically in < 5 minutes (often faster if event-driven). We can simulate this in staging: change content, see that the pipeline picks it up (crawl -> new chunk in DB) quickly. The acceptance threshold might be something like 95% of updates reflect in the KB under 5 min, 99% under 15 min.

Polite Crawling & No Overload: The crawling system should never overwhelm a site or violate robots rules. Monitoring: Check server logs of target sites (or ask site owners) to ensure no complaints of high traffic. We can also track our crawler’s fetch rates and ensure it stays under a configured limit (e.g., <N concurrent fetches per site). A formal criterion: no single site sees more than e.g. 1 request per second sustained from our crawler, except transient bursts with small resources, and robots.txt “Crawl-delay” directives (if present) are respected.

Accuracy of Retrieved Info: When the user asks factual questions, the retrieval provides the correct supporting facts that lead to correct answers. Evaluation: Using a set of test queries (covering product info, business info, etc.) for each site, the assistant’s answers should contain factual content that matches the site exactly. This depends on the LLM too, but at least the retrieval must bring back the relevant snippet. We could measure Recall@K: for a benchmark of question-answer pairs, the correct answer’s source is in the top K retrieved chunks, say K=5, for 90%+ of cases.

Retrieval Latency: Queries to the knowledge base should be fast – typically < 100 ms for vector search on a moderately sized site (hundreds or thousands of pages)
GitHub
GitHub
. Metric: p95 vector query time (server-side) is under 200 ms even as the data grows (with HNSW, maybe at 10k-100k vectors scale this holds). Including any re-rank or multi-step, it might be a bit more, but the user should not feel lag from the retrieval. The overall voice agent pipeline budget is tight (300 ms to first word includes retrieval), so retrieval ideally in tens of ms for typical cases.

Low Redundancy / No Dups: The ingestion process should not store duplicate content. Acceptance: If a piece of text is present on multiple pages (say a boilerplate footer or repeated product description), our design using content hashes and canonical URLs should avoid indexing it multiple times (or at least mark duplicates). In the KB, the number of unique chunks should roughly equal unique content pieces. We verify that by checking the DB for duplicate hashes – our unique constraint should ensure none or minimal duplicates (like maybe small duplicates for overlapping chunk boundaries, which is acceptable). Essentially, each distinct piece of information lives once, which improves search quality by not overweighting duplicated text.

Effective Delta Updates: No unnecessary full re-crawls happen. Test: When a site is republished with only 1 page changed, the system should ideally only fetch and re-index that page (plus perhaps neighbors if configured) rather than everything. We inspect logs after such an event: it should show something like “Detected 1 page changed via lastmod -> only crawling that page”
GitHub
GitHub
. And verify others were skipped (e.g., using cached 304 responses or by not scheduling them at all).

Resource Usage: Ingestion tasks operate within resource limits (so they can run in the background continuously). Metric: a single crawling worker can process, say, at least 20-30 pages per minute with Playwright (observed in tests)
GitHub
, and much more with lightweight fetch for static pages (50+ pages/minute)
GitHub
GitHub
. Also, memory per worker should be bounded (e.g., a browser instance using < 500 MB typically)
GitHub
. We consider it a pass if our infrastructure can handle the number of sites we have concurrently without timeouts or crashes, and scale horizontally by adding workers if needed.

Search Results Integration: Retrieved chunks come with metadata enabling the agent to cite or use them. Acceptance: For each chunk, we store the source (URL or page title) and maybe an anchor. The assistant can then say “According to [SiteName]’s FAQ, …” if needed. Also, if the chunk corresponds to a specific element (like an answer in FAQ), having that reference allows the agent to scroll or highlight if in a live context. We ensure metadata like page_id or element_id is present in the KB records and accessible. Tests could confirm that when an answer is given, the agent outputs a reference or that it can fetch the full context via the page_id if needed.

Multi-Language Handling: If a site has content in multiple languages, the system indexes each language correctly and the retrieval returns matches in the correct language for the query. Test: On a bilingual site, ask questions in language A and ensure results are not from language B section. Language detection in retrieval should route queries accordingly
GitHub
GitHub
. We can measure that by instrumenting a query’s detected language vs. the language of top results – they should match.

Data Integrity: The knowledge base should not accumulate stale data indefinitely. Check: If pages are removed or content changes drastically, the old content should either be deleted or marked outdated so it doesn’t surface. Our tombstone mechanism and canonical deduping should ensure that. We validate by removing a page on a test site and re-running ingestion – then searching the KB for unique terms from that page should yield nothing. And the total count of chunks should drop or those entries marked deleted.

Successful Integration with Orchestrator: The ultimate measure: the orchestrator uses the retrieval effectively to answer user queries correctly. Acceptance: In end-to-end tests where users ask factual questions (“What are your store hours?”, “Is this product available in red?”), the assistant gives correct answers grounded in site content. That implies retrieval pulled the right info. While this is more of a system test including the LLM, a high success rate here (with no hallucinated answers) would confirm the ingestion & retrieval did their job in providing the facts to the AI.
