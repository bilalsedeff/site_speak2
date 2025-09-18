/**
 * Action Execution Type Definitions
 *
 * Comprehensive type definitions for AI action execution system to eliminate 'any' types
 * in core business logic. Defines proper types for tool execution, site actions, and API responses.
 */

// Core action parameter types
export type ActionParameterValue =
  | string
  | number
  | boolean
  | null
  | ActionParameterValue[]
  | { [key: string]: ActionParameterValue };

export interface ActionParameters {
  [key: string]: ActionParameterValue;
}

// Specific action result types
export interface NavigationActionResult {
  type: 'navigation';
  target: string;
  method?: 'pushState' | 'replaceState' | 'redirect';
  scrollToTop?: boolean;
  highlightElement?: string;
}

export interface FormSubmissionActionResult {
  type: 'form_submission';
  selector: string;
  formData: Record<string, ActionParameterValue>;
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH';
  validation?: {
    isValid: boolean;
    errors: string[];
  };
}

export interface DomInteractionActionResult {
  type: 'dom_interaction';
  action: 'click' | 'scroll' | 'hover' | 'focus' | 'input';
  selector: string;
  parameters?: Record<string, ActionParameterValue>;
}

export interface ApiResponseActionResult {
  type: 'api_response';
  status: number;
  data: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface CustomActionResult {
  type: 'custom_action';
  actionName: string;
  parameters: Record<string, ActionParameterValue>;
  message?: string;
}

// Union type for all action results
export type TypedActionResultData =
  | NavigationActionResult
  | FormSubmissionActionResult
  | DomInteractionActionResult
  | ApiResponseActionResult
  | CustomActionResult;

// Action execution result types
export interface ActionResult {
  success: boolean;
  result: TypedActionResultData | unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: {
    executionTime: number;
    timestamp: Date;
    sessionId?: string;
    userId?: string;
  };
}

// Site action definition
export interface SiteAction {
  id: string;
  name: string;
  type: 'navigation' | 'form' | 'search' | 'ui_interaction' | 'data_query' | 'api_call';
  description: string;
  parameters: {
    required: string[];
    optional?: string[];
    schema: Record<string, ActionParameterSchema>;
  };
  category: 'basic' | 'advanced' | 'integration';
  permissions?: string[];
}

export interface ActionParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: ActionParameterValue[];
  default?: ActionParameterValue;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: ActionParameterSchema;
  properties?: Record<string, ActionParameterSchema>;
  required?: string[];
}

// Service integration types
export interface BrowserAutomationService {
  navigate(url: string): Promise<{ success: boolean; currentUrl: string }>;
  clickElement(selector: string): Promise<{ success: boolean; elementFound: boolean }>;
  fillForm(selector: string, data: Record<string, ActionParameterValue>): Promise<{ success: boolean; fieldsFillen: number }>;
  extractData(selector: string): Promise<{ success: boolean; data: Record<string, ActionParameterValue> }>;
  screenshot(): Promise<{ success: boolean; imageBase64?: string }>;
  waitForElement(selector: string, timeout?: number): Promise<{ success: boolean; elementVisible: boolean }>;
}

export interface APIGateway {
  get(endpoint: string, params?: ActionParameters): Promise<APIResponse>;
  post(endpoint: string, data?: ActionParameters): Promise<APIResponse>;
  put(endpoint: string, data?: ActionParameters): Promise<APIResponse>;
  delete(endpoint: string, params?: ActionParameters): Promise<APIResponse>;
  patch(endpoint: string, data?: ActionParameters): Promise<APIResponse>;
}

export interface APIResponse {
  status: number;
  data: Record<string, unknown>;
  headers?: Record<string, string>;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface WebSocketService {
  send(channel: string, data: Record<string, unknown>): Promise<void>;
  broadcast(channel: string, data: Record<string, unknown>): Promise<void>;
  subscribe(channel: string, callback: (data: Record<string, unknown>) => void): void;
  unsubscribe(channel: string): void;
}

// Action execution context
export interface ActionExecutionContext {
  sessionId: string;
  userId?: string;
  tenantId: string;
  siteId: string;
  timestamp: Date;
  permissions: string[];
  metadata?: Record<string, unknown>;
}

// Service dependencies for action execution
export interface ActionExecutorDependencies {
  browserAutomationService?: BrowserAutomationService;
  apiGateway?: APIGateway;
  websocketService?: WebSocketService;
  logger?: {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
  };
}

// Navigation action specific types
export interface NavigationActionResultDetailed extends ActionResult {
  data: {
    targetUrl: string;
    currentUrl: string;
    navigationSuccess: boolean;
    pageTitle?: string;
    loadTime?: number;
  };
}

// Search action specific types
export interface SearchActionResult extends ActionResult {
  data: {
    query: string;
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore?: number;
    }>;
    totalResults: number;
    searchTime: number;
  };
}

// Form action specific types
export interface FormActionResult extends ActionResult {
  data: {
    formSelector: string;
    fieldsProcessed: number;
    validationErrors?: Array<{
      field: string;
      error: string;
    }>;
    submissionSuccess: boolean;
    redirectUrl?: string;
  };
}

// UI interaction action specific types
export interface UIInteractionResult extends ActionResult {
  data: {
    element: string;
    action: 'click' | 'hover' | 'focus' | 'scroll' | 'select';
    success: boolean;
    elementFound: boolean;
    newState?: Record<string, unknown>;
  };
}

// Data query action specific types
export interface DataQueryResult extends ActionResult {
  data: {
    query: string;
    resultSet: Array<Record<string, ActionParameterValue>>;
    totalCount: number;
    queryTime: number;
    fromCache: boolean;
  };
}

// API call action specific types
export interface APICallResult extends ActionResult {
  data: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    response: Record<string, unknown>;
    statusCode: number;
    responseTime: number;
  };
}

// Union type for all action results
export type TypedActionResult =
  | NavigationActionResultDetailed
  | SearchActionResult
  | FormActionResult
  | UIInteractionResult
  | DataQueryResult
  | APICallResult;

// Action validation types
export interface ValidationError {
  field: string;
  message: string;
  value?: ActionParameterValue;
  expectedType?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Performance monitoring types
export interface ActionPerformanceMetrics {
  actionId: string;
  actionType: string;
  executionTime: number;
  success: boolean;
  error?: string;
  timestamp: Date;
  context: {
    userId?: string;
    sessionId: string;
    tenantId: string;
  };
}