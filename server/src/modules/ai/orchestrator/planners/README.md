# Conversation Flow Manager - Dialog Planning & Slot Extraction

The Conversation Flow Manager implements sophisticated slot-frame dialog management for extracting structured information from natural language conversations.

## Overview

This component handles the "understanding" phase of complex tasks by:

1. **Intent Classification**: Determining user goals from natural language
2. **Slot Extraction**: Extracting structured parameters (temporal, spatial, categorical)
3. **Clarification Management**: Generating targeted follow-up questions
4. **Speculative Planning**: Suggesting optimistic actions while gathering information

## Architecture

### Core Components

```typescript
interface SlotFrame {
  intent: string;                    // Classified user intent
  extractedSlots: Record<string, SlotValue>;  // Structured slot values
  missingSlots: string[];           // Required slots not yet filled
  confidence: number;               // Overall extraction confidence
  temporalContext: TemporalSlot;    // Time-based information
  spatialContext: SpatialSlot;      // Location-based information
  metadata: SlotFrameMetadata;      // Extraction provenance
}
```

### Slot Extractors

#### 1. Temporal Slot Extractor

Handles time expressions with context awareness:

**Supported Patterns:**
- Relative: "this summer", "next week", "tonight"  
- Absolute: "July 12th", "2024-08-15"
- Ranges: "this weekend", "next month"
- Seasonal: "winter holidays", "spring break"

**Hemisphere Detection:**
```typescript
// "this summer" interpretation
Northern Hemisphere: June-August
Southern Hemisphere: December-February
Auto-detected from user location or site settings
```

**Examples:**
```typescript
extractTemporalSlots("this summer") 
// → { startDate: "2025-06-21", endDate: "2025-09-22", season: "summer" }

extractTemporalSlots("tonight at 8pm")
// → { startDate: "2025-01-03T20:00", endDate: "2025-01-03T23:59", timeOfDay: "evening" }
```

#### 2. Spatial Slot Extractor

Processes location and proximity information:

**Supported Patterns:**
- Proximity: "near me", "within 10 miles", "close to downtown"
- Features: "by the sea", "waterfront", "beach venue"
- Addresses: "123 Main St", "New York City"
- Landmarks: "near Central Park", "close to the airport"

**Feature Matching:**
```typescript
extractSpatialSlots("by the sea near me")
// → { 
//   proximity: { userLocation: true, radius: "default" },
//   venueFeatures: ["waterfront", "beach", "marina", "seaside"],
//   context: "coastal"
// }
```

#### 3. Quantitative Slot Extractor

Extracts numbers, quantities, and measurements:

**Patterns:**
- Cardinal: "2 tickets", "four people", "a dozen roses"
- Ordinal: "first choice", "second option" 
- Ranges: "5-10 people", "between 2 and 4 tickets"
- Measurements: "under $50", "more than 3 hours"

**Examples:**
```typescript
extractQuantitativeSlots("2 VIP tickets for 4 people")
// → {
//   tickets: { quantity: 2, type: "VIP" },
//   partySize: { quantity: 4, unit: "people" }
// }
```

#### 4. Categorical Slot Extractor

Handles taxonomic classifications:

**Domain-Specific Taxonomies:**
- **Music**: genres, artists, venues, instruments
- **Food**: cuisines, dietary restrictions, meal types
- **Events**: categories, formats, audiences
- **Travel**: accommodation types, transportation, activities

**Fuzzy Matching:**
```typescript
extractCategoricalSlots("EDM and house music")
// → {
//   musicGenres: ["electronic", "house", "techno", "dance"],
//   confidence: 0.95,
//   taxonomy: "music_genres"
// }
```

## Key Methods

### `parseUserIntent(input, context)`

Main entry point for intent parsing and slot extraction:

```typescript
async parseUserIntent(
  input: string, 
  context: ConversationContext
): Promise<SlotFrame> {
  // 1. Intent classification using LLM
  const intent = await this.classifyIntent(input, context);
  
  // 2. Multi-extractor slot extraction
  const slots = await this.extractAllSlots(input, intent);
  
  // 3. Cross-validation and normalization
  const normalized = this.normalizeSlots(slots, intent);
  
  // 4. Missing slot detection
  const missing = this.detectMissingSlots(normalized, intent);
  
  return { intent, extractedSlots: normalized, missingSlots: missing, ... };
}
```

### `generateClarificationQuestion(slotFrame)`

Creates targeted questions to fill missing slots:

```typescript
generateClarificationQuestion(slotFrame: SlotFrame): string {
  const missing = slotFrame.missingSlots[0]; // Prioritize first missing
  
  switch (missing) {
    case 'ticket_type':
      const event = slotFrame.extractedSlots.event;
      return `I found ${event.name} on ${event.date}. Do you want VIP or Standard tickets?`;
    
    case 'party_size':
      return `How many people will be dining with you?`;
    
    case 'time_preference':
      return `What time would you prefer? Morning, afternoon, or evening?`;
  }
}
```

### `updateSlotFrame(existing, newInput)`

Incrementally updates slot frame with new information:

```typescript
updateSlotFrame(
  existing: SlotFrame, 
  newInput: string
): SlotFrame {
  // Extract new slots from input
  const newSlots = await this.extractAllSlots(newInput, existing.intent);
  
  // Merge with existing, preferring more specific values
  const merged = this.mergeSlots(existing.extractedSlots, newSlots);
  
  // Update missing slots list
  const stillMissing = this.detectMissingSlots(merged, existing.intent);
  
  return { ...existing, extractedSlots: merged, missingSlots: stillMissing };
}
```

### `planSpeculativeActions(slotFrame)`

Suggests safe actions that can be executed optimistically:

```typescript
planSpeculativeActions(slotFrame: SlotFrame): SpeculativeAction[] {
  const actions = [];
  
  // Safe to navigate to category pages
  if (slotFrame.extractedSlots.category) {
    actions.push({
      type: 'navigate',
      target: `/events/${slotFrame.extractedSlots.category}`,
      riskLevel: 'low',
      reasoning: 'Category navigation is safe and likely helpful'
    });
  }
  
  // Safe to pre-load search results
  if (slotFrame.extractedSlots.location) {
    actions.push({
      type: 'preload_search',
      parameters: { location: slotFrame.extractedSlots.location },
      riskLevel: 'low',
      reasoning: 'Search preloading improves perceived performance'
    });
  }
  
  return actions;
}
```

## Conversation Context Management

### Session Tracking

```typescript
interface ConversationContext {
  sessionId: string;
  siteId: string;
  tenantId: string;
  conversationHistory: ConversationTurn[];
  speculativeActions: SpeculativeAction[];
  userPreferences?: {
    language?: string;
    timezone?: string;
    location?: GeoLocation;
  };
  conversationId: string;
}
```

### Turn Management

```typescript
interface ConversationTurn {
  turnId: string;
  timestamp: Date;
  userInput: string;
  extractedSlots: Record<string, SlotValue>;
  systemResponse: string;
  confidence: number;
}
```

## Configuration & Customization

### Slot Extraction Configuration

```typescript
interface SlotExtractorConfig {
  temporal: {
    defaultTimezone: string;
    hemisphereDetection: 'auto' | 'northern' | 'southern';
    relativeDateWindow: number; // days
  };
  spatial: {
    defaultRadius: number; // km
    enableGeolocation: boolean;
    venueFeatureDatabase: string;
  };
  categorical: {
    taxonomySource: 'embedded' | 'external';
    confidenceThreshold: number;
    enableFuzzyMatching: boolean;
  };
}
```

### Intent Classification

The system uses GPT-4 for intent classification with domain-specific prompts:

```typescript
const INTENT_CLASSIFICATION_PROMPT = `
Classify the user intent from this input: "${input}"

Available intents:
- buy_tickets: User wants to purchase event tickets
- make_reservation: User wants to book a table/service
- find_information: User wants to search/browse
- modify_booking: User wants to change existing booking
- get_support: User needs help or has questions

Consider the context: ${JSON.stringify(context)}

Respond with: { "intent": "intent_name", "confidence": 0.95 }
`;
```

## Error Handling & Edge Cases

### Ambiguous Input Handling

```typescript
// Handle ambiguous temporal references
"this weekend" near month boundary
→ Ask: "Do you mean this Saturday/Sunday (Jan 4-5) or next weekend?"

// Handle conflicting spatial information  
"near me but also downtown"
→ Prioritize "near me", use downtown as secondary filter

// Handle impossible combinations
"summer concert tonight"
→ Flag inconsistency, ask for clarification
```

### Missing Context Recovery

```typescript
// No user location available
"near me" without geolocation
→ Ask: "What city or area should I search in?"

// Ambiguous quantities
"tickets for the group"
→ Ask: "How many people are in your group?"
```

## Performance Optimization

### Caching Strategies

- **Taxonomy Cache**: Preload common categorical mappings
- **Location Cache**: Cache geocoding results for common locations
- **Pattern Cache**: Cache regex patterns for temporal expressions
- **LLM Cache**: Cache intent classification for similar inputs

### Parallel Processing

```typescript
// Run all extractors in parallel for speed
const [temporal, spatial, quantitative, categorical] = await Promise.all([
  this.extractTemporalSlots(input),
  this.extractSpatialSlots(input), 
  this.extractQuantitativeSlots(input),
  this.extractCategoricalSlots(input)
]);
```

## Testing & Validation

### Test Cases

```typescript
describe('ConversationFlowManager', () => {
  test('complex event booking', async () => {
    const input = "Find me EDM concerts by the sea this summer for 2 people";
    const result = await flowManager.parseUserIntent(input, context);
    
    expect(result.intent).toBe('buy_tickets');
    expect(result.extractedSlots.genre).toContain('electronic');
    expect(result.extractedSlots.venue_features).toContain('waterfront');
    expect(result.extractedSlots.temporal.season).toBe('summer');
    expect(result.extractedSlots.quantity.value).toBe(2);
  });
});
```

### Quality Metrics

Monitor these metrics to ensure slot extraction quality:

- **Slot Extraction Accuracy**: % of correctly extracted slots
- **Intent Classification F1**: Precision/recall for intent detection
- **Clarification Efficiency**: Average questions needed per completion
- **User Satisfaction**: Completion rate after clarifications

## Integration Examples

### With Universal Agent Graph

```typescript
// In understandIntent node
const slotFrame = await conversationFlowManager.parseUserIntent(
  state.userInput,
  state.conversationContext
);

// Update state with extracted information
return { slotFrame, needsClarification: slotFrame.missingSlots.length > 0 };
```

### With Analytics

```typescript
// Track slot extraction performance
await analyticsHelpers.trackSlotExtraction(
  tenantId,
  siteId,
  {
    intent: slotFrame.intent,
    slotsExtracted: Object.keys(slotFrame.extractedSlots).length,
    confidence: slotFrame.confidence,
    extractionTimeMs: performance.now() - startTime
  },
  sessionId
);
```

This component is the foundation of complex task understanding, enabling the system to handle sophisticated multi-step requests with natural language flexibility.