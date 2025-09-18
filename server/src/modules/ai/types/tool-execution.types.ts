/**
 * Type definitions for AI tool execution and orchestration
 *
 * Eliminates 'any' types in core AI workflow management for:
 * - Tool call parameters and results
 * - Function execution outcomes
 * - LangGraph state management
 * - Speculative execution tracking
 */

/**
 * Base tool parameter types - supports various AI tool inputs
 */
export type ToolParameterValue =
  | string
  | number
  | boolean
  | null
  | ToolParameterValue[]
  | { [key: string]: ToolParameterValue };

export type ToolParameters = Record<string, ToolParameterValue>;

/**
 * Tool execution result types based on SiteSpeak's AI capabilities
 */
export interface NavigationResult {
  type: 'navigation';
  success: boolean;
  targetUrl: string;
  redirected?: boolean;
  timing: number;
}

export interface SearchResult {
  type: 'search';
  success: boolean;
  query: string;
  results: Array<{
    title: string;
    content: string;
    url?: string;
    relevance: number;
  }>;
  totalResults: number;
}

export interface SiteInfoResult {
  type: 'site_info';
  success: boolean;
  info: {
    title?: string;
    description?: string;
    features?: string[];
    pages?: string[];
    contact?: Record<string, string>;
  };
}

export interface FormInteractionResult {
  type: 'form_interaction';
  success: boolean;
  formId: string;
  action: 'fill' | 'submit' | 'validate';
  fields?: Record<string, string>;
  validationErrors?: string[];
}

export interface CommerceResult {
  type: 'commerce';
  success: boolean;
  action: 'add_to_cart' | 'remove_from_cart' | 'checkout' | 'view_product';
  productId?: string;
  quantity?: number;
  price?: number;
  cartTotal?: number;
}

export interface ErrorResult {
  type: 'error';
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Union type for all possible tool execution results
 */
export type ToolExecutionResult =
  | NavigationResult
  | SearchResult
  | SiteInfoResult
  | FormInteractionResult
  | CommerceResult
  | ErrorResult;

/**
 * Enhanced tool execution record with proper typing
 */
export interface ExecutedTool {
  toolName: string;
  parameters: ToolParameters;
  result: ToolExecutionResult | undefined;
  success: boolean;
  executionTime: number;
  timestamp: Date;
  sessionId?: string;
  retryCount?: number;
  reversible?: boolean;
}

/**
 * Speculative execution state for optimistic actions
 */
export interface SpeculativeExecution {
  actionName: string;
  parameters: ToolParameters;
  confidence: number;
  status: 'pending' | 'executing' | 'completed' | 'cancelled';
  result?: ToolExecutionResult | { speculative: boolean; success: boolean };
  startTime?: Date;
  predictionScore?: number;
  rollbackPlan?: {
    action: string;
    parameters: ToolParameters;
  };
}

/**
 * Intent recognition result typing
 */
export interface IntentResult {
  intent: 'buy_tickets' | 'book_service' | 'find_products' | 'get_information' | 'navigation';
  confidence: number;
  entities: Record<string, {
    value: ToolParameterValue;
    confidence: number;
    span?: [number, number];
  }>;
  toolCalls: Array<{
    tool: string;
    parameters: ToolParameters;
    confidence: number;
  }>;
  slots?: Record<string, {
    raw: string;
    type: string;
  }>;
  constraints?: Array<{
    type: string;
    field: string;
    operator: string;
    value: ToolParameterValue;
    priority: number;
  }>;
  metadata?: {
    processingTime: number;
    modelUsed: string;
    fallback?: boolean;
  };
}

/**
 * Conversation flow state typing
 */
export interface FlowState {
  currentStep: string;
  completedSteps: string[];
  pendingActions: Array<{
    action: string;
    parameters: ToolParameters;
    priority: number;
  }>;
  userContext: {
    preferences?: Record<string, ToolParameterValue>;
    history?: string[];
    sessionData?: Record<string, ToolParameterValue>;
  };
  flowMetadata: {
    startTime: Date;
    totalTurns: number;
    confidence: number;
  };
}

/**
 * Type guards for runtime type validation
 */
export function isNavigationResult(result: ToolExecutionResult): result is NavigationResult {
  return result.type === 'navigation';
}

export function isSearchResult(result: ToolExecutionResult): result is SearchResult {
  return result.type === 'search';
}

export function isSiteInfoResult(result: ToolExecutionResult): result is SiteInfoResult {
  return result.type === 'site_info';
}

export function isFormInteractionResult(result: ToolExecutionResult): result is FormInteractionResult {
  return result.type === 'form_interaction';
}

export function isCommerceResult(result: ToolExecutionResult): result is CommerceResult {
  return result.type === 'commerce';
}

export function isErrorResult(result: ToolExecutionResult): result is ErrorResult {
  return result.type === 'error';
}

/**
 * Utility type for tool parameter validation
 */
export function validateToolParameters(params: unknown): params is ToolParameters {
  if (typeof params !== 'object' || params === null) {
    return false;
  }

  const record = params as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (typeof key !== 'string') {
      return false;
    }

    if (!isValidToolParameterValue(value)) {
      return false;
    }
  }

  return true;
}

function isValidToolParameterValue(value: unknown): value is ToolParameterValue {
  if (value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(item => isValidToolParameterValue(item));
  }

  if (typeof value === 'object') {
    return validateToolParameters(value);
  }

  return false;
}