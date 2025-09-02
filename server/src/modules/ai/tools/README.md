# AI Tools Module

**Universal tool surface for LangGraph agents with deterministic, schema-first, voice-first design.**

## Purpose

The AI Tools module provides a **centralized registry** of callable functions that the voice AI agent can use to interact with websites. Tools are:

- **Schema-validated** with Zod and exported as JSON Schema 2020-12 for OpenAI function calling
- **Type-safe** with comprehensive TypeScript coverage  
- **Performance-optimized** with latency budgets and caching
- **Security-focused** with confirmation requirements and side-effect classification
- **Tenant-isolated** with per-tenant tool policies

## Architecture

```plaintext
tools/
├── validators.ts           # Zod schemas + JSON Schema export
├── registry.ts            # Central tool registry with OpenAI compatibility
├── navigation.ts          # Safe navigation and page interaction tools
├── search.ts              # Knowledge base and site search tools  
├── forms.ts               # Form interaction and submission tools
├── commerce.ts            # E-commerce cart and checkout tools
├── booking.ts             # Appointment and reservation tools
├── siteops.ts             # Operational helpers and site introspection
└── index.ts               # Main export and initialization
```

## Integration with Existing Services

The tools module **enhances** existing services without duplication:

- **Wraps ActionExecutorService**: Tools delegate actual execution to existing action system
- **Uses KnowledgeBaseService**: Search tools leverage existing semantic search
- **Integrates with ActionDispatchService**: Maintains existing dispatch and caching
- **Extends WidgetActionBridge**: Tools generate bridge-compatible instructions

## Tool Categories

### 🧭 **Navigation Tools** (`navigation.ts`)

- `navigation.goto` - Navigate to pages with optimistic execution
- `navigation.highlight` - Highlight elements before interaction
- `navigation.scrollTo` - Scroll to specific elements or positions  
- `navigation.openExternal` - Open external URLs with security validation

**Performance Target**: 50-150ms dispatch for optimistic navigation

### 🔍 **Search Tools** (`search.ts`)

- `search.siteSearch` - Semantic search across site knowledge base
- `search.suggestNext` - Generate contextual next-action suggestions
- `search.quickAnswer` - Get direct answers from knowledge base

**Performance Target**: P95 < 350ms with caching

### 📝 **Forms Tools** (`forms.ts`)

- `forms.fillField` - Fill individual form fields
- `forms.submitForm` - Submit forms with validation
- `forms.contactForm` - Complete contact form workflow
- `forms.newsletterSignup` - Newsletter subscription handling

**Security**: Contact forms require confirmation; idempotency keys prevent duplicates

### 🛒 **Commerce Tools** (`commerce.ts`)

- `commerce.listVariants` - Get product variants and options
- `commerce.addToCart` - Add products to cart with idempotency
- `commerce.startCheckout` - Initialize checkout flow

**Security**: Cart operations use idempotency keys; checkout requires confirmation

### 📅 **Booking Tools** (`booking.ts`)

- `booking.searchSlots` - Find available time slots
- `booking.holdSlot` - Temporarily hold slots during booking
- `booking.bookSlot` - Permanently book appointments

**Time Handling**: RFC 3339 timestamps; ISO 8601 durations

### ⚙️ **Site Operations Tools** (`siteops.ts`)

- `siteops.readSitemap` - Parse sitemaps for URL discovery
- `siteops.warmupCache` - Prefetch URLs for performance
- `siteops.checkRobots` - Validate robots.txt compliance

**Usage**: Background operations only; not in critical user paths

## Registry and OpenAI Integration

### Tool Registration

```typescript
import { aiToolsRegistry, initializeAITools } from './tools';

// Initialize all built-in tools
initializeAITools();

// Register site-specific actions as tools
registerSiteActions(siteId, actions);
```

### OpenAI Function Calling

```typescript
import { getToolsForLLM } from './tools';

// Get OpenAI-compatible function definitions
const tools = getToolsForLLM(siteId, tenantId);

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  tools: tools,
  tool_choice: "auto"
});
```

### Tool Execution

```typescript
import { executeAITool } from './tools';

const result = await executeAITool('navigation.goto', { 
  path: '/products' 
}, {
  siteId,
  tenantId,
  sessionId,
  userId
});
```

## Schema and Validation

### Core Types

All tools use consistent parameter types:

- **URLs**: Full URLs with protocol validation
- **Paths**: Site-relative paths starting with `/`
- **Selectors**: CSS selectors for DOM targeting
- **Money**: Amount + currency with ISO 4217 codes
- **Time**: RFC 3339 timestamps and ISO 8601 durations
- **Locale**: BCP-47 language tags

### JSON Schema Export

```typescript
import { toJsonSchema } from './validators';

// Convert Zod schema to OpenAI-compatible JSON Schema
const schema = toJsonSchema(ParametersSchema, {
  title: 'Tool Parameters',
  description: 'Parameters for tool execution',
  examples: [{ param: 'value' }]
});
```

## Performance and Latency Budgets

Each tool category has specific latency targets:

- **Navigation**: 50-150ms (optimistic execution)
- **Search**: P95 < 350ms (with caching)
- **Forms**: 100-1500ms (depending on complexity)
- **Commerce**: 300-1000ms (with idempotency)
- **Booking**: 300-1500ms (with external APIs)
- **Siteops**: 1000-5000ms (background operations)

## Security and Side Effects

### Side Effect Classification

- `none` - No side effects, safe for optimistic execution
- `read-only-nav` - Navigation only, no data changes
- `writes.cart` - Modifies shopping cart
- `writes.order` - Creates orders or bookings
- `writes.booking` - Reservation systems
- `writes.content` - Form submissions or content changes

### Confirmation Requirements

Tools requiring confirmation:

- `forms.contactForm` - User message submission
- `commerce.startCheckout` - Payment flow initiation  
- `booking.bookSlot` - Permanent reservations

### Idempotency

Tools with side effects use **idempotency keys** (UUID v4) to prevent duplicate operations:

```typescript
const result = await executeAITool('commerce.addToCart', {
  productId: 'prod-123',
  quantity: 2,
  idempotencyKey: crypto.randomUUID()
}, context);
```

## Tenant Policies

### Tool Access Control

```typescript
// Set tools available for tenant
aiToolsRegistry.setTenantPolicy(tenantId, {
  enabledTools: ['navigation.*', 'search.*', 'forms.contactForm'],
  disabledTools: ['commerce.*', 'booking.*'],
  rateLimits: {
    'search.siteSearch': { requests: 100, window: 3600 }
  },
  authScopes: {
    'commerce.*': ['ecommerce.read', 'ecommerce.write']
  }
});
```

### Rate Limiting

Per-tool rate limits prevent abuse:

- Search tools: 100 requests/hour
- Form tools: 20 submissions/hour  
- Commerce tools: 50 operations/hour
- Navigation: Unlimited (safe operations)

## Monitoring and Metrics

### Execution Metrics

```typescript
import { getToolMetrics } from './tools';

const metrics = getToolMetrics();
// Returns: { totalCalls, successfulCalls, failedCalls, averageLatency, lastUsed }
```

### Health Monitoring

```typescript
import { getAIToolsStats } from './tools';

const stats = getAIToolsStats();
// Returns: { system, categories, performance, usage }
```

## Integration Examples

### With LangGraph Orchestrator

```typescript
import { getToolsForLLM } from './tools';

// In LangGraph node
const tools = getToolsForLLM(siteId, tenantId);
const llm = new ChatOpenAI({ tools });
```

### With Voice Assistant

```typescript
import { executeAITool } from './tools';

// Voice command: "Add red roses to cart"
const result = await executeAITool('commerce.addToCart', {
  productId: 'roses-red-dozen',
  quantity: 1,
  idempotencyKey: sessionId + '-cart-add'
}, voiceContext);
```

### With Widget Bridge

Tools automatically generate bridge instructions for client-side execution:

```typescript
// Tool execution returns bridgeInstructions
{
  type: 'navigation',
  payload: {
    target: '/products',
    method: 'pushState',
    scrollToTop: true
  }
}
```

## Development Guidelines

### Adding New Tools

1. **Define parameters** in `validators.ts` with Zod schemas
2. **Implement executor** function with proper error handling
3. **Add to category file** (navigation.ts, search.ts, etc.)  
4. **Export from index.ts** and register in initialization
5. **Add tests** for happy path, validation, and error cases

### Tool Design Principles

1. **Single Responsibility**: Each tool does one thing well
2. **Validation First**: All parameters validated with Zod
3. **Error Resilience**: Graceful failure with helpful error messages
4. **Performance Aware**: Respect latency budgets
5. **Security Conscious**: Classify side effects and require confirmation
6. **Integration Friendly**: Work with existing ActionExecutorService

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern=tools
```

Tests cover:

- Parameter validation
- Tool execution success/failure paths
- Registry operations
- OpenAI schema compatibility
- Performance within latency budgets

### Integration Tests

```bash
npm test:integration -- --testNamePattern="AI Tools"
```

Integration tests verify:

- End-to-end tool execution via registry
- ActionExecutorService integration
- Bridge instruction generation
- Multi-tenant isolation

## Future Enhancements

### Planned Improvements

- **Dynamic API Tools**: Auto-generate tools from OpenAPI/GraphQL specs
- **Custom Tool Support**: Plugin system for site-specific tools
- **Advanced Caching**: Redis-backed tool result caching
- **Circuit Breakers**: Automatic failure detection and recovery
- **Tool Composition**: Chain multiple tools in workflows

### Performance Optimizations

- **Batch Execution**: Execute multiple tools in parallel
- **Smart Caching**: Cache tool results with TTL
- **Lazy Loading**: Load tools on-demand per tenant
- **Resource Pooling**: Share resources across tool executions

## Troubleshooting

### Common Issues

**Tool Not Found**: Check tool registration and tenant policies
**Validation Errors**: Verify parameter schemas and required fields  
**Timeout Errors**: Check latency budgets and network conditions
**Permission Errors**: Verify tenant tool policies and auth scopes

### Debug Mode

```typescript
// Enable debug logging
const logger = createLogger({ service: 'ai-tools', level: 'debug' });
```

### Metrics Dashboard

Tools expose comprehensive metrics for monitoring:

- Success/failure rates per tool
- Average execution latency
- Usage patterns by tenant
- Error classification and trends

---

The AI Tools module provides a **production-ready foundation** for voice agent interactions while maintaining separation of concerns with existing services. It enables complex multi-step workflows with proper security, performance, and observability.

## Integration Status

- ✅ **Registry System**: Central tool management with OpenAI compatibility
- ✅ **Core Tool Categories**: Navigation, search, forms, commerce, booking, siteops
- ✅ **ActionExecutorService Integration**: Leverages existing action execution
- ✅ **Schema Validation**: Zod schemas with JSON Schema export
- ✅ **Performance Budgets**: Latency targets per tool category
- ✅ **Security Framework**: Side effect classification and confirmation requirements
- ⚠️ **Dynamic Tools**: API tool generation (planned enhancement)
- ⚠️ **Advanced Caching**: Redis-backed caching (planned enhancement)
