# AI Orchestration & Tooling

Summary

SiteSpeak’s AI Orchestration & Tooling governs how the voice assistant understands user requests, decides on actions, and executes those actions on websites. It provides a stateful agent framework (built on LangGraph) that can handle multi-step tasks reliably, using a library of deterministic tools to navigate pages, submit forms, and perform other operations. The goal is a controllable, safe, and efficient workflow: the AI agent parses intent, retrieves needed information, then calls structured functions (“tools”) to act on the site (e.g. add to cart, navigate to a page) rather than taking unpredictable free-form actions. All tools and actions are defined up front with strict schemas, so both the AI and the system know exactly what can be done and how. This ensures that complex tasks (like “find a product and purchase it”) are completed correctly, with any risky operations gated for user confirmation. Overall, AI Orchestration & Tooling bridges the gap between natural language understanding and real website operations, enabling the voice assistant to “do things” on a site in a reliable way.

Application Architecture

LangGraph Orchestrator: A stateful conversation manager (node/edge graph) that plans and coordinates the AI’s behavior (understanding user intent, retrieving info, deciding next steps, calling tools, etc.). It supports OpenAI function calling to integrate with the tool system, and enforces rules like confirmation for side-effects.

Tool Registry & Executors: A central registry of tools (functions the AI can invoke) covering navigation, search, form submission, e-commerce actions, etc. Each tool has a strict schema (parameters and results) and a lightweight executor that actually performs the action (e.g. calling an API or clicking a button). Tools are composed into the agent’s planner graph via LangChain/LangGraph
GitHub
GitHub
.

Action Manifest & Site Tools: When a site is published, the builder generates an Action Manifest (actions.json) listing all interactive elements and actions on that site (with IDs, DOM selectors, parameter schemas, etc.). This manifest is ingested into the tool system so that the AI gains site-specific tools for that site’s features
GitHub
GitHub
. For example, if a site has a “Add to Cart” button with data-action="product.addToCart", the manifest defines a tool for that action with its parameters.

Secure Action Dispatch: A runtime service that receives the AI’s chosen tool actions and dispatches them to the appropriate target (either executing directly on the backend, or instructing the front-end via a secure postMessage bridge). It handles authentication, rate limiting, and ensures the action is allowed. The dispatch system ties together the manifest, the web widget, and server-side executors
GitHub
GitHub
.

PostMessage Bridge: If an action needs to be executed in the browser (like clicking a button on the page), a Widget Action Bridge uses window.postMessage to send a message from the AI backend to the user’s browser, where a small script maps it to a DOM event. This bridge is locked down with strict origin checks and sandboxing for security
GitHub
GitHub
.

Technical Details

Deterministic Tool Definitions – Every tool is defined with a name, description, input schema, and execution function. We use Zod to define the tool’s input types and then export those as JSON Schema (2020-12), which is the format OpenAI’s function-calling expects
GitHub
GitHub
. By doing this, the AI can reliably interpret the tool’s parameters and we get runtime validation of inputs. For example, a navigation tool might be defined as: “goto(path: string) – navigates to a given URL path”, with a schema requiring a path starting with “/”. All tools declare if they have side effects (like modifying cart or data) and whether they require confirmation before execution (for potentially irreversible actions)
GitHub
GitHub
. Tools also include metadata like an idempotencyKey for safe replays (so if a tool is called twice, it won’t double-charge or duplicate an action)
GitHub
GitHub
.

Universal Tool Registry – The system maintains one central registry.ts that pulls in all tool definitions (navigation, search, commerce, booking, forms, etc.)
GitHub
GitHub
. At startup, it aggregates these and also loads any dynamic site-specific tools (from site manifests or external API specs). For instance, if a site exposes a GraphQL API, an API loader could add tools for querying that API. The registry enforces any tenant-specific policies (disabling certain tools on certain sites, applying rate limits, etc.)
GitHub
. Once compiled, the registry hands the tools (with their JSON Schemas) to the LangChain/LangGraph agent, meaning the LLM knows exactly what functions it can call in the context of a given site
GitHub
GitHub
.

LangGraph Orchestration – SiteSpeak uses a LangGraph (an extension of LangChain for structured agents) to manage conversation state and tool usage. This orchestrator is implemented as a directed graph (universalAgent.graph.ts) with nodes like: Understand (parse user intent), Retrieve (get info from Knowledge Base), Decide (decide next action), ToolCall (execute a tool), Observe (check result and update state), and potentially loops back if the task is not complete
GitHub
GitHub
. The orchestrator’s planner (conversationFlowManager.ts) is responsible for handling multi-turn conversations – for example, if the user’s request is ambiguous or missing information, it will formulate a follow-up question to clarify (“What date do you want tickets for?”)
GitHub
. The planner also implements speculative actions: if it’s highly confident about a safe action (like navigating to a page), it can trigger that optimistically in parallel to the LLM thinking, to save time
GitHub
GitHub
. All side-effecting actions (like a purchase) are funneled through a special “confirm” step – the AI must explicitly confirm with the user (or via a predefined policy) before those tools execute
GitHub
. This guards against unintended consequences.

Action Manifest & Function-Calling – A key innovation is that every SiteSpeak site is self-describing in terms of actions. At publish time, the system scans the site’s pages and components to produce an actions.json file listing all interactive elements and their expected behavior (this is done by the ActionManifestGenerator running on the server)
GitHub
GitHub
. The manifest includes each action’s ID, a human description, the CSS selector or endpoint it corresponds to, and the schema of parameters it accepts
GitHub
GitHub
. For example, a form submission might be an action with parameters corresponding to the form fields. This manifest is then converted to OpenAI function specs so that at runtime the LLM “sees” a function named e.g. product.addToCart(productId, qty) and knows it can call it to perform that action. The orchestrator integrates this by providing those function definitions to the model’s API call. On the backend, the Action Dispatch Service maps those calls to actual execution: if the action is a front-end UI action, it will go through the widget bridge; if it’s a backend operation (like calling a server API), it can call it directly
GitHub
GitHub
. All incoming action requests are validated (origin checks, tenant isolation so one site can’t trigger actions on another, rate limits to prevent abuse)
GitHub
GitHub
.

Executing and Observing – When the agent calls a tool, the system executes it and then observes the result. For example, the agent might call the navigate.goto tool with a path; the bridge will trigger the page navigation in the user’s browser (or in the admin preview iframe)
GitHub
GitHub
. The orchestrator then waits for an observation – e.g., did the page change? If the task was to “find a red dress in size M”, the agent might call a search tool and then expect to see some results in the knowledge base or an element on the page. The orchestrator loop continues: maybe it will next call a highlight tool to draw the user’s attention to something, or a forms.submit tool to check out. All the while, partial responses are being streamed to the user (the agent can say “Found 3 items...” before it has finished all actions). This interplay is managed by the orchestrator’s graph logic. Crucially, if anything unexpected happens (a tool fails, or the result is not what was assumed), the agent can adjust – because LangGraph allows branching logic and error handling nodes.

Security & Isolation – The tooling system is built with multi-tenant safety. Tools that interact with the page use the postMessage bridge which is locked to a specific origin (each site’s widget is configured with allowedOrigins)
GitHub
GitHub
. The Action Dispatch API on the backend ensures the siteId and tenantId for any incoming action call match the session and JWT – so one website’s agent cannot trigger actions on another’s. There are also “SecurityGuards” in the orchestrator pipeline that check each requested action against policies (for example, disallowing certain combinations or detecting if the AI is attempting something not permitted). Each tool declares an auth level (none, user session, or service) to indicate if it requires a logged-in user or special credentials
GitHub
. The orchestrator will only allow those tools if the proper auth context is present. Additionally, rate limiting is applied to tool execution to prevent rapid-fire misuse, and every action is audit-logged.

Complex Task Flow Example – As an illustrative use-case: “Find me EDM concerts by the sea near me this summer and add 2 tickets to cart.” – The orchestrator would parse this and identify sub-tasks: search for events (with filters for genre=EDM, date≈summer, location≈near user’s location if available), possibly ask the user to clarify if needed (e.g., what type of ticket). It then calls the KB.searchEvents tool (or a general search tool) with those filters, gets results, and then calls a navigate.goto tool to the specific event page that looks promising
GitHub
GitHub
. Next, it might need to add tickets, so it calls the ticket.add tool defined in the site’s actions (with parameters eventId, quantity, ticketType)
GitHub
. Since adding to cart is a side-effect action (it changes state), the orchestrator would have inserted a confirmation step: “Should I add 2 tickets for Sunset Beats on Jul 12 to your cart?” If the user says yes (or has pre-confirmed), the tool executes and the item is added
GitHub
GitHub
. The orchestrator then perhaps says the outcome: “I added them. Do you want to checkout now or keep browsing?” – which shows how it can plan several steps and maintain context. Throughout, each step corresponds to a well-defined tool call, not an open-ended script.

Best Practices

Schema-First Tools: Define every tool’s inputs/outputs with strict schemas and use those for validation and for LLM function definitions
GitHub
GitHub
. This ensures the AI’s actions are constrained and understood – a core best practice for reliable agents.

Confirm Before Side-Effects: Mark any tool that performs a destructive or irreversible action (checkout, delete, send payment, etc.) with a flag requiring explicit confirmation
GitHub
. The agent must then ask the user or have a policy to proceed, preventing unwanted actions
GitHub
.

Idempotency & Replay Safety: Design tools to be idempotent whenever possible. For example, include an idempotencyKey for purchase or booking actions
GitHub
GitHub
 – if the same operation is invoked twice, the second can be recognized and ignored. This avoids double-transactions in the event of retries or errors.

Optimize for Safe Actions: Let the agent execute safe actions optimistically to improve UX. For example, page navigations or searches (read-only actions) can be done immediately without waiting for full reasoning
GitHub
GitHub
. This is a best practice to hide latency, as long as these actions can be undone or are side-effect free.

Leverage Site Contract: Utilize the site’s contract (sitemap, JSON-LD, actions manifest) so the agent never guesses about the site’s structure
GitHub
GitHub
. For instance, target buttons by their data-action selectors rather than by fragile heuristics. This makes tool execution deterministic and reliable.

Security at Every Layer: Follow security best practices: never allow wildcard postMessage (always specify exact targetOrigin)
GitHub
, isolate each tenant’s data and tools, run input validation on all tool parameters (using Zod/JSON Schema), and implement thorough origin and auth checks on any user-initiated action. Assume malicious inputs could come via the AI or user and handle accordingly (e.g., the AI shouldn’t be able to call admin-only tools).

Observability & Logging: Instrument the orchestration. Emit structured events for every tool invocation and outcome (success/failure, latency, etc.)
GitHub
. This allows monitoring the agent’s behavior and performance. Align event names with a standard (like OpenTelemetry) for consistency. Logging every AI decision and tool result also aids in debugging complex sequences.

Modular Tool Design: Keep tools small and composable (each doing one thing like “go to page”, “fill form”, “submit form”, “highlight element”). This adheres to the single-responsibility principle and makes it easier for the AI to mix and match tools for a task
GitHub
. Complex actions can be achieved by sequentially calling multiple simple tools, giving the orchestrator flexibility.

Fallback and Error Handling: Design the orchestrator graph to handle failures gracefully. If a tool execution fails (e.g., navigation times out or an element isn’t found), have a strategy: the agent might try a different approach or apologize to the user. Incorporate guard rails so that one failure doesn’t cascade into confusion – often by having the planner explicitly check results and have alternative paths (e.g., if no search results, say “Sorry, I couldn’t find any” rather than doing something wrong).

Align with LLM Limits: Make sure the set of tools and their descriptions provided to the LLM are concise and relevant. Too many tools or overly verbose descriptions can confuse the model. Group tools logically and, if the list is large, consider dynamic enable/disable based on context (for example, if on an e-commerce site enable commerce tools, on a content site maybe some are not needed). This improves the quality of the model’s choices.

Acceptance Criteria / Success Metrics

Full Coverage of Site Actions: For each published site, 100% of interactive functionalities (navigational links, buttons, forms) are reflected in the Action Manifest and corresponding tool definitions. No important action is “hidden” from the AI. Metric: compare the site contract’s actions.json with the registry – they should match one-to-one.

Successful Multi-Step Task Execution: The orchestrator can complete representative complex user tasks (booking a ticket, placing an order, finding and displaying content) without developer intervention. Test: end-to-end scenarios (like the EDM concert example) reliably go through plan → tools → outcome, confirmed by integration tests.

Tool Invocation Accuracy: The majority of AI-invoked tools should be the correct ones for achieving the user’s intent (as judged by test scenarios), with minimal misfires. Metric: tool success rate (percentage of tool calls that successfully advanced the task) should be high. For instance, if the AI calls a tool, it should be the appropriate one 95%+ of the time in known scenarios.

Latency within Bounds: Using tools should not significantly degrade response time. The voice agent is expected to send the first partial response within ~150 ms and first full answer token within 300 ms
GitHub
 – even when using tools, due to parallel execution. Metric: voice turn P95 latency meets these targets with tool calls in the loop (confirmed via analytics events on tool timing).

No Unauthorized Actions: The security mechanisms prevent any action execution that is outside the user’s scope or intent. Criteria: Attempts to invoke disallowed tools (wrong tenant, admin-only, etc.) are blocked and logged, with zero successful security breaches in testing. All postMessage communications specify the correct target origin, and automated security tests confirm that actions cannot be triggered from unauthorized contexts.

Graceful Failure Handling: If a tool fails or the plan goes awry, the system responds with a safe fallback (an apology or alternative). Acceptance: In chaos testing (e.g., intentionally break one step), the agent does not get stuck or produce a harmful action – it should either recover or fail safely (“I couldn’t complete that”). No uncaught exceptions or crashes occur in the orchestration layer during such tests.

Auditability: Every action taken by the agent is recorded (with what tool, parameters, result, and user confirmation if applicable). Success: When reviewing logs for a conversation, an engineer or auditor can trace the sequence of decisions and tool calls exactly. This is crucial both for debugging and for compliance (e.g., proving what the AI did or did not do on a transaction).

Integration with Knowledge Base: The orchestrator effectively uses the knowledge retrieval system when needed. Check: For questions that require information, the agent is seen calling the retrieval tool (search) and then proceeding, rather than hallucinating. This is indicated by the presence of KB query events before answer formulation. A success metric might be a high “RAG usage rate” for factual questions (the AI uses the Retrieval-Augmented Generation approach whenever appropriate, rather than guessing facts).

User Confirmation Flow: In testing of actions that need confirmation (like a purchase), the agent always asks for confirmation and only proceeds when given. Test: Simulate a request to perform a sensitive action; verify that without a confirmation from the user, the action executor does not run. This should be true 100% of the time for marked tools.

Developer & QA Signoff: All orchestrator and tools code passes rigorous unit and integration tests (covering validators, execution logic, and security checks). Additionally, a manual QA of key user journeys (one per major tool category) is completed. The feature is considered done when those tests are green and product owners have signed off that the AI reliably handles the specified scenarios end-to-end
