# AI Orchestrator - Complex Task Processing

The AI Orchestrator module implements sophisticated multi-step task processing using LangGraph state machines for complex voice-first interactions.

## Architecture

```plaintext
orchestrator/
├── graphs/           # LangGraph state machines
│   └── UniversalAgent.graph.ts     # Main complex task orchestrator
├── planners/         # Dialog management & slot extraction
│   └── ConversationFlowManager.ts  # Slot frame dialog system
├── executors/        # Function calling & action execution
│   └── FunctionCallingService.ts   # Enhanced OpenAI function calling
└── README.md        # This file
```

## Key Components

### 1. Universal Agent Graph (`graphs/UniversalAgent.graph.ts`)

The main state machine for complex multi-step tasks following the source-of-truth workflow:

**State Flow:**

```plaintext
understandIntent → retrieveKnowledge → checkClarification → planFunctions 
     ↓                                                              ↓
finalize ← observeResults ← executeFunctions ← confirmActions ← [decision]
```

**Features:**

- Stateful conversation with slot frames for complex intents
- Speculative action execution to hide latency
- Human-in-the-loop confirmation gates for side-effects
- Hybrid search integration with RRF fusion
- Performance analytics and telemetry tracking
- Voice-first interaction patterns with barge-in support

**Example Usage:**

```typescript
const universalAgent = createUniversalAgentGraph(siteId, {
  conversationFlowManager,
  functionCallingService,
  hybridSearchService,
  availableActions: []
});

const result = await universalAgent.processConversation({
  userInput: "Find me EDM concerts by the sea this summer and add 2 tickets to cart",
  sessionId: "session_123",
  siteId: "site_456",
  tenantId: "tenant_789",
  userId: null,
  conversationContext: { ... }
});
```

### 2. Conversation Flow Manager (`planners/ConversationFlowManager.ts`)

Implements slot-frame dialog management for extracting structured information from natural language:

**Slot Extractors:**

- **Temporal**: "this summer" → June-August date range with hemisphere detection
- **Spatial**: "by the sea" + "near me" → venue feature matching with geolocation
- **Quantitative**: "2 tickets" → {quantity: 2, itemType: "tickets"}
- **Categorical**: "EDM/House" → electronic music genre classification

**Key Methods:**

- `parseUserIntent()`: LLM-based intent extraction with slot normalization
- `generateClarificationQuestion()`: Creates targeted follow-up questions
- `updateSlotFrame()`: Incrementally builds conversation state
- `planSpeculativeActions()`: Suggests safe actions to execute optimistically

### 3. Function Calling Service (`executors/FunctionCallingService.ts`)

Enhanced OpenAI function calling with enterprise safety and reliability:

**Features:**

- Zod schema validation for all function calls
- Risk assessment with confirmation gates (low/medium/high risk levels)
- Retry logic with exponential backoff and idempotency
- Integration with ActionDispatchService for actual execution

**Risk Levels:**

- **Low**: Navigation, search, view operations
- **Medium**: Form submissions, data modifications
- **High**: Purchase, booking, irreversible actions

**Example:**

```typescript
const functionPlan = await functionCallingService.planFunctionCalls(
  "Add 2 tickets to cart",
  availableActions,
  { confirmationRequired: true }
);

const executions = await functionCallingService.executeFunctionCalls(
  sessionId,
  functionPlan.toolCalls.map(tc => tc.id),
  userConfirmed
);
```

## Integration with Existing Services

### AIOrchestrationService Integration

The orchestration service automatically detects complex tasks and routes them appropriately:

```typescript
// Complex task detection based on keywords and patterns
private isComplexTask(input: string): boolean {
  const complexKeywords = [
    'find and add', 'by the sea', 'this summer',
    'concerts', 'tickets', 'booking', 'cart'
  ];
  // ... pattern matching logic
}

// Route to appropriate orchestrator
if (isComplex) {
  const universalAgent = await this.getUniversalAgentGraph(siteId);
  result = await universalAgent.processConversation(request);
} else {
  const orchestrator = await this.getOrchestrator(siteId);
  result = await orchestrator.processConversation(request);
}
```

### Analytics Integration

All components emit comprehensive telemetry:

**Voice Metrics:**

- `voice.first_response_ms`: Time to first audible response
- `voice.asr_partial`: ASR streaming latency
- `voice.tts_started`: TTS streaming start time

**Retrieval Metrics:**

- `retrieval.hybrid_search`: Vector + FTS + rerank timing
- `rag.quality_check`: Hit rate and freshness metrics

**Tool Execution Metrics:**

- `ai.tool_call_completed`: Individual tool performance
- `ai.tool_chain_completed`: Multi-step task coordination

## Performance Targets

Based on the source-of-truth SLA requirements:

- **First partial response**: ≤150ms
- **First spoken token**: ≤300ms  
- **KB hybrid search**: P95 ≤250ms
- **Speculative navigation**: <100ms after intent classification

## Complex Task Examples

### 1. Event Booking with Multiple Constraints

```plaintext
Input: "Find me EDM/House concerts by the sea near me this summer and add 2 tickets to cart"

Slot Frame Extraction:
- Intent: buy_tickets
- Time: "this summer" → Jun-Aug 2025 (hemisphere: northern)
- Geo: "near me" → user location context
- Context: "by the sea" → venue feature filter
- Genre: "EDM/House" → electronic music taxonomy
- Quantity: 2 tickets, type: unknown (will clarify)

Flow: search → filter by location/genre/time → clarify ticket type → add to cart → confirm
```

### 2. Multi-step Commerce

```plaintext
Input: "Show me Italian restaurants with outdoor seating and book a table for 4 tonight"

Slot Frame Extraction:
- Intent: make_reservation
- Cuisine: "Italian"
- Features: "outdoor seating"
- Party size: 4
- Time: "tonight" → today's evening availability

Flow: search → filter by features → show options → select → book → confirm
```

## Testing Complex Tasks

Use the test patterns from the source-of-truth document:

1. **Happy Path**: User provides all required slots
2. **Clarification**: Missing ticket type, seating preference
3. **Error Handling**: No availability, payment failure
4. **Edge Cases**: Ambiguous timing, geo permission denied

## Development Guidelines

### Adding New Slot Extractors

1. Extend the slot extractor in `ConversationFlowManager.ts`:

```typescript
private extractCustomSlot(text: string): SlotValue | null {
  // Pattern matching and normalization logic
}
```

-2. Update the slot frame schema with new slot types
-3. Add clarification question templates
-4. Update analytics tracking for new slot types

### Adding New Tool Categories

1. Add category to the schema in `analytics/schemas.ts`
2. Update `getToolCategory()` in `UniversalAgent.graph.ts`
3. Implement risk assessment rules in `FunctionCallingService.ts`

### Performance Optimization

- Use speculative execution for safe navigation actions
- Implement parallel search strategies in hybrid search
- Cache frequent slot extraction patterns
- Pre-warm common conversation flows

## Monitoring & Observability

The system provides comprehensive observability through:

- **Structured logging** with correlation IDs
- **Performance metrics** via OpenTelemetry
- **Analytics events** for business intelligence
- **State machine visualization** for debugging
- **Slot frame tracking** for conversation quality

Monitor key metrics:

- Task completion rates by complexity
- Slot extraction accuracy
- Clarification frequency
- Tool execution success rates
- End-to-end latency distribution

## Future Enhancements

Planned improvements based on usage patterns:

1. **Machine Learning**: Slot extraction confidence scoring
2. **Personalization**: User preference learning
3. **Multi-modal**: Image/video content understanding
4. **Proactive**: Suggest relevant actions before user asks
5. **Continuous Learning**: Improve intent classification from interactions
