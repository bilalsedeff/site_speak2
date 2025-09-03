# Function Calling Service - Enhanced OpenAI Tool Execution

The Function Calling Service provides enterprise-grade function calling capabilities with safety gates, retry logic, and comprehensive validation for AI tool execution.

## Overview

This service enhances OpenAI's function calling with:

1. **Risk Assessment**: Automated risk analysis with confirmation gates
2. **Schema Validation**: Zod-based parameter validation
3. **Retry Logic**: Exponential backoff with idempotency
4. **Safety Gates**: Human-in-the-loop confirmations for side-effects
5. **Execution Tracking**: Comprehensive analytics and monitoring

## Architecture

### Core Components

```typescript
interface FunctionCallResult {
  success: boolean;
  toolCalls: Array<{
    id: string;
    function: string;
    parameters: Record<string, any>;
    riskLevel: 'low' | 'medium' | 'high';
  }>;
  requiresConfirmation: boolean;
  riskAssessment: RiskAssessment;
}

interface RiskAssessment {
  overallRisk: 'low' | 'medium' | 'high';
  riskFactors: string[];
  sideEffects: SideEffect[];
  confirmationRequired: boolean;
  reasoning: string;
}
```

## Key Features

### 1. Risk Assessment Engine

Automatically categorizes function calls by potential impact:

#### Risk Levels

**Low Risk (Auto-execute)**
- Navigation actions: `navigate_to_page`, `scroll_to_element`
- Read operations: `get_page_content`, `search_events`
- UI interactions: `highlight_element`, `show_tooltip`

**Medium Risk (Conditional confirmation)**
- Form submissions: `submit_contact_form`, `update_profile`
- Data modifications: `save_preferences`, `add_to_wishlist`
- Non-financial transactions: `reserve_temporary_hold`

**High Risk (Always require confirmation)**
- Financial transactions: `purchase_tickets`, `process_payment`
- Irreversible actions: `delete_account`, `cancel_booking`
- External API calls: `send_email`, `book_appointment`

#### Risk Assessment Logic

```typescript
private assessRisk(
  functionName: string, 
  parameters: Record<string, any>,
  availableActions: SiteAction[]
): RiskAssessment {
  const riskFactors = [];
  let overallRisk: RiskLevel = 'low';
  
  // Check function name patterns
  if (FINANCIAL_KEYWORDS.some(kw => functionName.includes(kw))) {
    riskFactors.push('Financial transaction detected');
    overallRisk = 'high';
  }
  
  // Check parameter values
  if (parameters.amount && parseFloat(parameters.amount) > 0) {
    riskFactors.push(`Monetary value: ${parameters.amount}`);
    overallRisk = 'high';
  }
  
  // Check side effects from action metadata
  const action = availableActions.find(a => a.name === functionName);
  if (action?.sideEffects?.includes('irreversible')) {
    riskFactors.push('Irreversible action');
    overallRisk = 'high';
  }
  
  return {
    overallRisk,
    riskFactors,
    confirmationRequired: overallRisk !== 'low',
    reasoning: `Risk assessment based on: ${riskFactors.join(', ')}`
  };
}
```

### 2. Schema Validation

Uses Zod schemas for comprehensive parameter validation:

```typescript
// Define function schemas
const ADD_TO_CART_SCHEMA = z.object({
  itemId: z.string().uuid('Invalid item ID format'),
  quantity: z.number().int().min(1).max(10, 'Quantity must be 1-10'),
  ticketType: z.enum(['standard', 'vip', 'premium']).optional(),
  eventDate: z.string().datetime('Invalid date format'),
});

// Validation in function calling
private validateParameters(
  functionName: string,
  parameters: Record<string, any>
): ValidationResult {
  const schema = this.getSchemaForFunction(functionName);
  if (!schema) {
    return { valid: true, parameters }; // No validation defined
  }
  
  try {
    const validated = schema.parse(parameters);
    return { valid: true, parameters: validated };
  } catch (error) {
    return { 
      valid: false, 
      errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    };
  }
}
```

### 3. Retry Logic with Idempotency

Implements exponential backoff with idempotency keys:

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;        // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  idempotencyWindow: number; // milliseconds
}

private async executeWithRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  idempotencyKey: string
): Promise<T> {
  let lastError: Error;
  let delay = config.baseDelay;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Check if this operation was recently executed
      if (this.isRecentExecution(idempotencyKey, config.idempotencyWindow)) {
        throw new Error('Operation already in progress - idempotency protection');
      }
      
      // Mark execution start
      this.recordExecutionStart(idempotencyKey);
      
      const result = await operation();
      
      // Clear execution record on success
      this.clearExecutionRecord(idempotencyKey);
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      if (attempt < config.maxRetries) {
        await this.delay(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      }
    }
  }
  
  throw new Error(`Operation failed after ${config.maxRetries} retries: ${lastError.message}`);
}
```

## Core Methods

### `planFunctionCalls(request, availableActions, options)`

Plans function calls with risk assessment:

```typescript
async planFunctionCalls(
  request: string,
  availableActions: SiteAction[],
  options: {
    confirmationRequired?: boolean;
    riskTolerance?: 'low' | 'medium' | 'high';
    maxFunctions?: number;
  } = {}
): Promise<FunctionCallResult> {
  
  // 1. Generate function call plan using OpenAI
  const completion = await this.openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: this.buildSystemPrompt(availableActions)
      },
      {
        role: 'user', 
        content: request
      }
    ],
    functions: availableActions.map(action => ({
      name: action.name,
      description: action.description,
      parameters: action.parameters
    })),
    function_call: 'auto'
  });
  
  // 2. Extract function calls from response
  const toolCalls = this.extractToolCalls(completion);
  
  // 3. Validate each function call
  const validatedCalls = [];
  for (const call of toolCalls) {
    const validation = this.validateParameters(call.function, call.parameters);
    if (!validation.valid) {
      throw new Error(`Validation failed for ${call.function}: ${validation.errors.join(', ')}`);
    }
    
    // Assess risk for this function call
    const riskAssessment = this.assessRisk(call.function, call.parameters, availableActions);
    
    validatedCalls.push({
      ...call,
      riskLevel: riskAssessment.overallRisk,
      validated: validation.parameters
    });
  }
  
  // 4. Determine overall confirmation requirement
  const highestRisk = Math.max(...validatedCalls.map(c => RISK_LEVELS[c.riskLevel]));
  const requiresConfirmation = options.confirmationRequired || 
                              highestRisk > RISK_LEVELS[options.riskTolerance || 'medium'];
  
  return {
    success: true,
    toolCalls: validatedCalls,
    requiresConfirmation,
    riskAssessment: this.aggregateRiskAssessment(validatedCalls)
  };
}
```

### `executeFunctionCalls(sessionId, toolCallIds, confirmed)`

Executes planned function calls with safety gates:

```typescript
async executeFunctionCalls(
  sessionId: string,
  toolCallIds: string[],
  confirmed: boolean = false
): Promise<FunctionExecutionResult[]> {
  
  const results = [];
  
  for (const toolCallId of toolCallIds) {
    const plannedCall = this.pendingCalls.get(toolCallId);
    if (!plannedCall) {
      throw new Error(`Tool call ${toolCallId} not found in pending calls`);
    }
    
    // Check confirmation requirement
    if (plannedCall.riskLevel !== 'low' && !confirmed) {
      results.push({
        toolCallId,
        success: false,
        error: 'Confirmation required for this action',
        requiresConfirmation: true
      });
      continue;
    }
    
    // Execute with retry logic
    try {
      const executionResult = await this.executeWithRetry(
        () => this.actionDispatchService.executeAction({
          actionName: plannedCall.function,
          parameters: plannedCall.validated,
          siteId: plannedCall.siteId,
          sessionId
        }),
        this.retryConfig,
        `${toolCallId}_${sessionId}_${Date.now()}`
      );
      
      results.push({
        toolCallId,
        success: true,
        result: executionResult,
        executionTime: executionResult.executionTime
      });
      
      // Track successful execution
      await this.trackExecution(plannedCall, executionResult, sessionId);
      
    } catch (error) {
      results.push({
        toolCallId,
        success: false,
        error: error.message,
        executionTime: 0
      });
      
      // Track failed execution
      await this.trackFailedExecution(plannedCall, error, sessionId);
    }
    
    // Clean up pending call
    this.pendingCalls.delete(toolCallId);
  }
  
  return results;
}
```

## Safety & Confirmation Gates

### Confirmation UI Generation

```typescript
generateConfirmationPrompt(toolCalls: ToolCall[]): ConfirmationPrompt {
  const highRiskCalls = toolCalls.filter(call => call.riskLevel === 'high');
  
  if (highRiskCalls.length > 0) {
    const actions = highRiskCalls.map(call => 
      `• ${call.function}: ${this.formatParameters(call.parameters)}`
    ).join('\n');
    
    return {
      title: 'Confirmation Required',
      message: `I'm about to perform these actions:\n\n${actions}\n\nShould I proceed?`,
      buttons: [
        { text: 'Proceed', action: 'confirm', style: 'primary' },
        { text: 'Cancel', action: 'cancel', style: 'secondary' }
      ]
    };
  }
  
  return null; // No confirmation needed
}
```

### Side Effect Tracking

```typescript
interface SideEffect {
  type: 'financial' | 'data_modification' | 'external_api' | 'irreversible';
  description: string;
  impact: 'low' | 'medium' | 'high';
  reversible: boolean;
}

private trackSideEffects(execution: FunctionExecution): void {
  const sideEffects = this.identifySideEffects(execution);
  
  // Store for potential rollback
  if (sideEffects.some(effect => effect.reversible)) {
    this.rollbackStorage.store(execution.sessionId, {
      execution,
      sideEffects,
      timestamp: new Date(),
      rollbackInstructions: this.generateRollbackInstructions(execution)
    });
  }
}
```

## Error Handling & Recovery

### Error Categories

```typescript
enum FunctionCallError {
  VALIDATION_FAILED = 'Parameters failed validation',
  FUNCTION_NOT_FOUND = 'Function not available', 
  EXECUTION_TIMEOUT = 'Function execution timeout',
  CONFIRMATION_TIMEOUT = 'User confirmation timeout',
  SIDE_EFFECT_BLOCKED = 'Side effect protection triggered',
  RATE_LIMIT_EXCEEDED = 'Rate limit exceeded',
  DEPENDENCY_FAILED = 'Required service unavailable'
}
```

### Recovery Strategies

```typescript
private async handleExecutionFailure(
  toolCall: ToolCall,
  error: Error,
  sessionId: string
): Promise<RecoveryResult> {
  
  switch (this.categorizeError(error)) {
    case FunctionCallError.VALIDATION_FAILED:
      // Try parameter correction
      return this.attemptParameterCorrection(toolCall);
      
    case FunctionCallError.EXECUTION_TIMEOUT:
      // Retry with longer timeout
      return this.retryWithExtendedTimeout(toolCall);
      
    case FunctionCallError.RATE_LIMIT_EXCEEDED:
      // Queue for delayed execution
      return this.queueForDelayedExecution(toolCall, sessionId);
      
    case FunctionCallError.DEPENDENCY_FAILED:
      // Suggest alternative actions
      return this.suggestAlternatives(toolCall);
      
    default:
      return { success: false, error: error.message, recovery: null };
  }
}
```

## Performance Monitoring

### Execution Metrics

```typescript
interface ExecutionMetrics {
  functionName: string;
  executionTime: number;
  success: boolean;
  riskLevel: string;
  confirmationRequired: boolean;
  retryCount: number;
  errorCategory?: string;
}

private async trackExecution(
  toolCall: ToolCall,
  result: ExecutionResult,
  sessionId: string
): Promise<void> {
  
  const metrics: ExecutionMetrics = {
    functionName: toolCall.function,
    executionTime: result.executionTime,
    success: result.success,
    riskLevel: toolCall.riskLevel,
    confirmationRequired: toolCall.requiresConfirmation,
    retryCount: result.retryCount || 0,
    ...(result.error && { errorCategory: this.categorizeError(result.error) })
  };
  
  // Send to analytics
  await analyticsHelpers.trackToolExecution(
    toolCall.tenantId,
    toolCall.siteId,
    metrics.functionName,
    this.getToolCategory(metrics.functionName),
    metrics.executionTime,
    metrics.success,
    sessionId
  );
}
```

## Configuration

### Service Configuration

```typescript
interface FunctionCallingConfig {
  retryConfig: RetryConfig;
  riskTolerance: 'low' | 'medium' | 'high';
  confirmationTimeout: number;
  enableIdempotency: boolean;
  validationStrictness: 'loose' | 'normal' | 'strict';
}

const DEFAULT_CONFIG: FunctionCallingConfig = {
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    idempotencyWindow: 60000
  },
  riskTolerance: 'medium',
  confirmationTimeout: 30000,
  enableIdempotency: true,
  validationStrictness: 'normal'
};
```

### Action Registration

```typescript
// Register custom validation schemas
functionCallingService.registerSchema('book_tickets', z.object({
  eventId: z.string().uuid(),
  ticketType: z.enum(['standard', 'vip']),
  quantity: z.number().int().min(1).max(10),
  totalAmount: z.number().min(0),
  paymentMethod: z.string().optional()
}));

// Register risk assessment rules
functionCallingService.registerRiskRule('book_tickets', (params) => ({
  riskLevel: params.totalAmount > 100 ? 'high' : 'medium',
  factors: params.totalAmount > 100 ? ['High value transaction'] : [],
  sideEffects: [{ type: 'financial', reversible: true }]
}));
```

## Integration Examples

### With Universal Agent Graph

```typescript
// In planFunctions node
const functionPlan = await functionCallingService.planFunctionCalls(
  "Add 2 VIP tickets to cart",
  state.availableActions,
  { confirmationRequired: state.needsConfirmation }
);

return {
  functionCallResult: functionPlan,
  needsConfirmation: functionPlan.requiresConfirmation
};

// In executeFunctions node  
const executions = await functionCallingService.executeFunctionCalls(
  state.sessionId,
  state.functionCallResult.toolCalls.map(tc => tc.id),
  state.confirmationReceived
);
```

### With Action Dispatch Service

```typescript
// Function calling service integrates with existing action dispatch
const functionCallingService = new FunctionCallingService({
  actionDispatchService: actionExecutorService,
  retryConfig: { maxRetries: 3, baseDelay: 1000 }
});
```

This service provides enterprise-grade safety and reliability for AI function calling, ensuring that complex tasks execute safely with appropriate human oversight.