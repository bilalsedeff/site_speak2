# Multi-Layered Intent Recognition System

## Overview

SiteSpeak's advanced intent recognition system provides highly accurate voice command understanding through multiple layers of analysis, validation, and learning. The system is designed to work universally across any website structure while maintaining sub-300ms response times.

## Architecture

### Core Components

```plaintext
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ IntentOrchestrator  │────│ IntentClassification│────│  OpenAI GPT-4o      │
│    (Coordinator)    │    │      Engine         │    │   Primary Model     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                         │                          │
           │                         │                          │
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ ContextualIntent    │    │ IntentValidation    │    │  Secondary Models   │
│     Analyzer        │────│     Service         │────│   (Validation)      │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                         │                          │
           │                         │                          │
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  IntentCache        │    │   Ensemble          │    │   Pattern Learning  │
│    Manager          │────│   Decision          │────│   & Adaptation      │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Processing Pipeline

1. **Context Analysis** (<50ms) - Universal website structure analysis
2. **Cache Check** (<10ms) - Pattern recognition and previous results
3. **Primary Classification** (<150ms) - OpenAI GPT-4o intent recognition
4. **Validation & Ensemble** (<100ms) - Cross-validation and conflict resolution
5. **Learning & Adaptation** - Continuous improvement from user feedback

## Quick Start

### Basic Integration

```typescript
import { quickSetupIntent } from '@/modules/ai/application/services/intent';

// Initialize with balanced configuration
const intentSystem = await quickSetupIntent(
  process.env.OPENAI_API_KEY!,
  'balanced'
);

// Process voice command
const response = await intentSystem.processIntent(
  "click the submit button",
  pageData,
  sessionData,
  'editor'
);

console.log(response.classification.intent); // 'click_element'
console.log(response.classification.confidence); // 0.92
```

### Voice Conversation Integration

```typescript
import { quickSetupVoiceConversation } from '@/modules/ai/application/services/intent/factory';
import { voiceActionExecutor } from '@/modules/ai/application/services/VoiceActionExecutor';

// Create enhanced voice conversation system
const voiceOrchestrator = await quickSetupVoiceConversation(
  process.env.OPENAI_API_KEY!,
  voiceActionExecutor,
  {
    intentPreset: 'balanced',
    voicePreset: 'production',
    enableIntentRecognition: true
  }
);

// Process voice input with advanced intent recognition
const result = await voiceOrchestrator.processVoiceInput(
  sessionId,
  "Add this product to my cart",
  actionContext,
  onStreamingCallback
);
```

## Configuration Presets

### High Performance Mode

- **Target**: <200ms processing
- **Features**: Aggressive caching, minimal validation
- **Use Case**: High-traffic production environments

```typescript
const intentSystem = await quickSetupIntent(
  process.env.OPENAI_API_KEY!,
  'highPerformance'
);
```

### Balanced Mode (Default)

- **Target**: <300ms processing
- **Features**: Secondary validation, smart caching, learning
- **Use Case**: General production use

```typescript
const intentSystem = await quickSetupIntent(
  process.env.OPENAI_API_KEY!,
  'balanced'
);
```

### Conservative Mode

- **Target**: <500ms processing
- **Features**: Full validation, ensemble decisions, maximum accuracy
- **Use Case**: Critical applications requiring high accuracy

```typescript
const intentSystem = await quickSetupIntent(
  process.env.OPENAI_API_KEY!,
  'conservative'
);
```

## Advanced Configuration

### Custom Intent System

```typescript
import {
  createIntentRecognitionSystem,
  IntentConfigPresets,
  type IntentSystemConfig
} from '@/modules/ai/application/services/intent/factory';

const customConfig: IntentSystemConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  mode: 'balanced',
  features: {
    enableValidation: true,
    enableCaching: true,
    enableLearning: true,
    enablePredictive: false
  },
  performance: {
    targetProcessingTime: 250,
    maxRetries: 2,
    fallbackTimeout: 1000
  },
  overrides: {
    primaryClassifier: {
      model: 'gpt-4o',
      temperature: 0.1,
      maxTokens: 200,
      timeout: 6000
    },
    caching: {
      enabled: true,
      ttl: 600000, // 10 minutes
      maxEntries: 5000,
      keyStrategy: 'text_context'
    }
  }
};

const intentSystem = await createIntentRecognitionSystem(customConfig);
```

### Voice Conversation System

```typescript
import {
  createVoiceConversationSystem,
  type VoiceSystemConfig
} from '@/modules/ai/application/services/intent/factory';

const voiceConfig: VoiceSystemConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  mode: 'balanced',
  features: {
    enableValidation: true,
    enableCaching: true,
    enableLearning: true,
    enablePredictive: true
  },
  performance: {
    targetProcessingTime: 300,
    maxRetries: 2,
    fallbackTimeout: 1000
  },
  conversation: {
    model: 'gpt-4o',
    temperature: 0.2,
    maxTokens: 300,
    streamingEnabled: true,
    functionCallingEnabled: true,
    confirmationThreshold: 0.8
  }
};

const voiceOrchestrator = await createVoiceConversationSystem(
  voiceConfig,
  voiceActionExecutor
);
```

## Intent Categories

The system recognizes these universal intent categories:

### Navigation Intents

- `navigate_to_page` - "Go to the home page"
- `navigate_to_section` - "Scroll to the footer"
- `navigate_back` - "Go back"
- `scroll_to_element` - "Scroll to the contact form"
- `open_menu` - "Open the navigation menu"

### Action Intents

- `click_element` - "Click the submit button"
- `submit_form` - "Submit this form"
- `select_option` - "Select the first option"
- `toggle_element` - "Toggle the dark mode switch"

### Content Manipulation

- `edit_text` - "Change the title to Welcome"
- `add_content` - "Add a new paragraph"
- `delete_content` - "Remove this section"
- `format_content` - "Make this text bold"

### Query Intents

- `search_content` - "Search for products"
- `filter_results` - "Filter by price"
- `get_information` - "What does this button do?"

### E-commerce Specific

- `add_to_cart` - "Add this to my cart"
- `remove_from_cart` - "Remove this item"
- `checkout_process` - "Proceed to checkout"
- `view_product` - "Show product details"

### Control & Confirmation

- `confirm_action` - "Yes, do it"
- `deny_action` - "No, cancel that"
- `undo_action` - "Undo the last change"
- `help_request` - "How do I use this?"

## Context Analysis

The system automatically analyzes page context for better intent recognition:

### Page Type Detection

- E-commerce (product, cart, checkout)
- Content (blog, article, documentation)
- Forms (contact, registration, survey)
- Dashboard (admin, analytics, settings)

### Capability Detection

- Navigation, search, forms
- E-commerce, payments, user accounts
- Content creation, media upload
- Real-time updates, notifications

### Element Analysis

- Interactive elements (buttons, links, inputs)
- Semantic roles and importance scoring
- Visibility and accessibility information

## Performance Monitoring

### Health Monitoring

```typescript
import { IntentSystemMonitor } from '@/modules/ai/application/services/intent/factory';

const monitor = new IntentSystemMonitor(intentSystem);

// Start continuous monitoring
monitor.startMonitoring(30000); // Check every 30 seconds

// Get health statistics
const stats = monitor.getHealthStats();
console.log({
  currentStatus: stats.currentHealth.status,
  healthyPercent: stats.healthyPercent,
  averageResponseTime: stats.averageResponseTime,
  totalRequests: stats.totalRequests
});

// Get recent health history
const history = monitor.getHealthHistory(10);
```

### Metrics Collection

```typescript
// Get system metrics
const health = await intentSystem.getSystemHealth();
const metrics = intentSystem.getClassificationMetrics();

console.log({
  status: health.status,
  uptime: health.uptime,
  totalRequests: health.totalRequests,
  cacheHitRate: health.cacheStatus.hitRate,
  averageProcessingTime: metrics.averageProcessingTime,
  successRate: metrics.successRate
});
```

## Learning and Adaptation

### User Feedback Integration

```typescript
// Provide feedback to improve accuracy
await intentSystem.learnFromFeedback(
  originalText,
  actualIntent,
  wasCorrect,
  userFeedback, // 'positive' | 'negative' | 'neutral'
  contextData
);
```

### Pattern Recognition

The system automatically learns common patterns:

```typescript
// Get user learning profile
const profile = cacheManager.getUserLearningProfile(userId);

console.log({
  preferredIntents: profile.preferredIntents,
  commonPatterns: profile.commonPatterns,
  adaptiveThresholds: profile.adaptiveThresholds
});

// Predict next likely intent
const prediction = await intentSystem.predictNextIntent(
  userId,
  recentIntents,
  context
);

if (prediction) {
  console.log(`Predicted next intent: ${prediction.intent} (${prediction.confidence})`);
}
```

## Error Handling and Fallbacks

### Automatic Fallback Strategies

```typescript
// The system automatically handles errors with fallback strategies:
try {
  const response = await intentSystem.processIntent(text, pageData, sessionData);

  if (response.warnings?.length > 0) {
    console.warn('Intent processing warnings:', response.warnings);
  }

  if (response.classification.confidence < 0.7) {
    // Request clarification from user
    console.log('Low confidence, asking for clarification');
  }

} catch (error) {
  if (error.retryable) {
    // Retry with simpler processing
    const fallbackResponse = await intentSystem.processIntent(
      text,
      pageData,
      sessionData,
      'guest',
      { skipValidation: true, timeoutMs: 1000 }
    );
  }
}
```

### Graceful Degradation

```typescript
// The system gracefully degrades when components fail:
const voiceOrchestrator = await quickSetupVoiceConversation(
  process.env.OPENAI_API_KEY!,
  voiceActionExecutor,
  {
    enableIntentRecognition: false // Fallback to basic intent recognition
  }
);
```

## Migration from Basic Voice System

### Automatic Migration

```typescript
import { migrateFromBasicVoiceSystem } from '@/modules/ai/application/services/intent/factory';

// Migrate existing voice orchestrator
const enhancedOrchestrator = await migrateFromBasicVoiceSystem(
  oldVoiceOrchestrator,
  voiceActionExecutor,
  {
    preserveSessions: true,
    intentPreset: 'balanced',
    voicePreset: 'production'
  }
);

// Old orchestrator is automatically cleaned up
```

### Manual Migration

```typescript
// 1. Create new enhanced orchestrator
const newOrchestrator = await quickSetupVoiceConversation(
  process.env.OPENAI_API_KEY!,
  voiceActionExecutor
);

// 2. Migrate active sessions (if needed)
const oldMetrics = oldOrchestrator.getMetrics();
console.log(`Migrating ${oldMetrics.activeSessions} active sessions`);

// 3. Clean up old orchestrator
await oldOrchestrator.cleanup();

// 4. Replace with new orchestrator
voiceOrchestrator = newOrchestrator;
```

## Testing and Development

### Testing Setup

```typescript
import { createTestingIntentSystem } from '@/modules/ai/application/services/intent/factory';

// Create test instance with mocked dependencies
const testIntentSystem = await createTestingIntentSystem({
  mockOpenAI: true,
  enableLogging: false,
  preset: 'development'
});

// Test intent processing
const response = await testIntentSystem.processIntent(
  "test command",
  mockPageData,
  mockSessionData,
  'guest'
);

expect(response.classification.intent).toBe('expected_intent');
```

### Development Mode

```typescript
// Use development preset for debugging
const devIntentSystem = await quickSetupIntent(
  process.env.OPENAI_API_KEY!,
  'development'
);

// Extended timeouts and comprehensive logging enabled
```

## Best Practices

### Performance Optimization

1. **Use Appropriate Presets**
   - `highPerformance` for high-traffic scenarios
   - `balanced` for general production use
   - `conservative` for critical accuracy requirements

2. **Enable Caching**

   ```typescript
   features: {
     enableCaching: true,
     enableLearning: true,
     enablePredictive: true
   }
   ```

3. **Monitor Performance**

   ```typescript
   const monitor = new IntentSystemMonitor(intentSystem);
   monitor.startMonitoring();
   ```

### Accuracy Improvement

1. **Provide User Feedback**

   ```typescript
   await intentSystem.learnFromFeedback(
     originalText,
     correctIntent,
     wasCorrect,
     'positive'
   );
   ```

2. **Use Context-Rich Page Data**

   ```typescript
   const pageData = {
     url: currentUrl,
     title: pageTitle,
     htmlContent: documentHTML,
     domElements: analyzedElements,
     timestamp: new Date()
   };
   ```

3. **Enable Validation**

   ```typescript
   features: {
     enableValidation: true
   }
   ```

### Error Handling

1. **Always Handle Errors**

   ```typescript
   try {
     const response = await intentSystem.processIntent(...);
   } catch (error) {
     if (error.retryable) {
       // Implement retry logic
     } else {
       // Fallback to basic processing
     }
   }
   ```

2. **Monitor System Health**

   ```typescript
   const health = await intentSystem.getSystemHealth();
   if (health.status !== 'healthy') {
     // Take corrective action
   }
   ```

3. **Implement Timeouts**

   ```typescript
   const response = await intentSystem.processIntent(
     text, pageData, sessionData, 'guest',
     { timeoutMs: 5000 }
   );
   ```

## API Reference

### IntentOrchestrator

```typescript
interface IntentOrchestrator {
  // Initialize the system
  initialize(): Promise<void>;

  // Process intent with full pipeline
  processIntent(
    text: string,
    pageData: RawPageData,
    sessionData: SessionData,
    userRole?: UserRole,
    options?: ProcessingOptions
  ): Promise<IntentProcessingResponse>;

  // Learn from user feedback
  learnFromFeedback(
    originalText: string,
    actualIntent: IntentCategory,
    wasCorrect: boolean,
    userFeedback?: FeedbackType,
    contextData?: ContextData
  ): Promise<void>;

  // Predict next intent
  predictNextIntent(
    userId: string,
    recentIntents: IntentCategory[],
    context: ContextualIntentAnalysis
  ): Promise<IntentPrediction | null>;

  // Get system health
  getSystemHealth(): Promise<IntentSystemHealth>;

  // Get performance metrics
  getClassificationMetrics(): IntentClassificationMetrics;

  // Cleanup resources
  cleanup(): Promise<void>;
}
```

### VoiceConversationOrchestratorEnhanced

```typescript
interface VoiceConversationOrchestratorEnhanced {
  // Initialize intent recognition
  initializeIntentRecognition(): Promise<void>;

  // Process voice input with advanced intent recognition
  processVoiceInput(
    sessionId: string,
    audioTranscript: string,
    context: ActionContext,
    onStreaming?: StreamingCallback
  ): Promise<ActionExecutionResult | null>;

  // Learn from user feedback
  learnFromFeedback(
    sessionId: string,
    wasCorrect: boolean,
    userFeedback?: FeedbackType
  ): Promise<void>;

  // Get enhanced metrics
  getMetrics(): EnhancedMetrics;

  // Get intent system health
  getIntentSystemHealth(): Promise<IntentSystemHealth>;

  // Cleanup resources
  cleanup(): Promise<void>;
}
```

## Troubleshooting

### Common Issues

#### High Latency (>300ms)

- Check OpenAI API connectivity
- Reduce validation complexity
- Enable aggressive caching
- Use `highPerformance` preset

#### Low Accuracy (<80%)

- Enable validation and ensemble decisions
- Use `conservative` preset
- Provide more context data
- Enable learning from user feedback

#### Memory Usage Issues

- Reduce cache size
- Clear user patterns periodically
- Monitor with `IntentSystemMonitor`

#### API Rate Limits

- Implement exponential backoff
- Enable caching to reduce API calls
- Use secondary models sparingly

### Debug Mode

```typescript
// Enable debug logging
process.env.VOICE_DEBUG = 'true';
process.env.INTENT_DEBUG = 'true';

// Create system with debug options
const debugSystem = await createTestingIntentSystem({
  enableLogging: true,
  preset: 'development'
});
```

### Health Checks

```typescript
// Validate system requirements
const validation = validateSystemRequirements();
if (!validation.isValid) {
  console.error('System requirements not met:', validation.errors);
}

// Check individual components
const health = await intentSystem.getSystemHealth();
console.log('System health:', health.status);
console.log('Active models:', health.activeModels);
console.log('Cache status:', health.cacheStatus);
```

## Performance Targets

| Metric | High-Performance | Balanced | Conservative |
|--------|------------------|----------|--------------|
| Processing Time | <200ms | <300ms | <500ms |
| Cache Hit Rate | >90% | >80% | >70% |
| Intent Accuracy | >85% | >90% | >95% |
| API Calls/Request | 1-2 | 2-3 | 3-4 |
| Memory Usage | <50MB | <100MB | <150MB |

## Support

For issues and questions:

- Check system health with `getSystemHealth()`
- Review logs with debug mode enabled
- Monitor performance with `IntentSystemMonitor`
- Test with `createTestingIntentSystem()`

The multi-layered intent recognition system provides production-ready voice command understanding with universal website compatibility, advanced learning capabilities, and comprehensive monitoring tools.
