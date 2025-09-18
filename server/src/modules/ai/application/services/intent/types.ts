/**
 * Comprehensive type definitions for multi-layered intent recognition system
 *
 * Provides strongly-typed interfaces for:
 * - Intent classification and confidence scoring
 * - Context-aware intent analysis
 * - Validation and ensemble decision making
 * - Performance monitoring and caching
 */

// Parameter types for different intent categories
export interface IntentParameters {
  // Navigation parameters
  target?: string | HTMLElement | ElementSelector;
  url?: string;
  direction?: 'back' | 'forward';

  // Element interaction parameters
  selector?: string;
  element?: HTMLElement;
  value?: string | number | boolean;
  position?: { x: number; y: number };

  // Content manipulation parameters
  content?: string;
  format?: 'text' | 'html' | 'markdown';
  location?: 'start' | 'end' | 'replace' | 'after' | 'before';

  // Search and filter parameters
  query?: string;
  filters?: SearchFilter[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';

  // E-commerce parameters
  productId?: string;
  quantity?: number;
  variant?: ProductVariant;

  // Form parameters
  fields?: FormField[];
  formId?: string;

  // Generic parameters for extensibility
  [key: string]: unknown;
}

export interface ElementSelector {
  type: 'css' | 'xpath' | 'text' | 'aria-label' | 'semantic';
  value: string;
  confidence?: number;
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan';
  value: string | number | boolean;
}

export interface ProductVariant {
  color?: string;
  size?: string;
  material?: string;
  [attribute: string]: string | undefined;
}

export interface FormField {
  name: string;
  value: string | number | boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'checkbox' | 'radio' | 'select';
}

export interface IntentClassificationResult {
  intent: IntentCategory;
  confidence: number;
  subIntents?: string[];
  parameters?: IntentParameters;
  reasoning?: string;
  source: 'primary' | 'secondary' | 'context' | 'cache' | 'ensemble';
  processingTime: number;
  modelUsed?: string;
}

export interface IntentValidationResult {
  isValid: boolean;
  confidence: number;
  conflicts?: IntentConflict[];
  resolution?: IntentResolution;
  fallbackIntent?: IntentCategory;
  validationTime: number;
}

export interface IntentConflict {
  conflictType: 'ambiguous' | 'contradictory' | 'insufficient_context';
  conflictingIntents: IntentCategory[];
  confidence: number;
  description: string;
  suggestedResolution?: IntentResolution;
}

export interface IntentResolution {
  strategy: 'clarification' | 'context_boost' | 'user_confirmation' | 'fallback' | 'ensemble_vote';
  selectedIntent: IntentCategory;
  confidence: number;
  clarificationQuestion?: string;
  contextFactors?: string[];
}

export interface ContextualIntentAnalysis {
  pageContext: PageContext;
  sessionContext: SessionContext;
  userContext: UserContext;
  availableActions: string[];
  contextualBoosts: Record<IntentCategory, number>;
  constrainedIntents: IntentCategory[];
  suggestionOverrides?: IntentSuggestion[];
}

export interface PageContext {
  url: string;
  domain: string;
  pageType: 'home' | 'product' | 'category' | 'cart' | 'checkout' | 'account' | 'blog' | 'contact' | 'other';
  contentType: 'e-commerce' | 'blog' | 'documentation' | 'form' | 'media' | 'dashboard' | 'other';
  availableElements: ElementContextInfo[];
  schema?: SchemaOrgData;
  capabilities: SiteCapability[];
  currentMode: 'view' | 'edit' | 'preview';
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  tenantId: string;
  siteId: string;
  startTime: Date;
  previousIntents: IntentHistory[];
  conversationState: ConversationState;
  userPreferences?: UserPreferences;
  currentTask?: TaskContext;
}

export interface UserContext {
  userId?: string;
  role: 'admin' | 'editor' | 'viewer' | 'guest';
  permissions: string[];
  previousSessions: string[];
  learningProfile?: UserLearningProfile;
  preferredIntentHandling?: IntentPreferences;
  timezone?: string;
  locale?: string;
}

export interface ElementContextInfo {
  selector: string;
  tagName: string;
  type?: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: Record<string, string>;
  boundingRect?: DOMRect;
  isVisible: boolean;
  isInteractable: boolean;
  semanticRole?: string;
  contextualImportance: number;
}

export interface IntentHistory {
  intent: IntentCategory;
  timestamp: Date;
  confidence: number;
  success: boolean;
  parameters?: IntentParameters;
  executionTime?: number;
  userFeedback?: 'positive' | 'negative' | 'neutral';
}

export interface TaskContext {
  taskType: 'navigation' | 'editing' | 'creation' | 'deletion' | 'query' | 'support';
  currentStep: number;
  totalSteps?: number;
  subTasks: string[];
  progress: number;
  blockers?: string[];
}

export interface UserLearningProfile {
  preferredIntents: Record<IntentCategory, number>;
  commonPatterns: string[];
  frequentlyUsedCommands: string[];
  errorPatterns: string[];
  adaptiveThresholds: Record<IntentCategory, number>;
  lastUpdated: Date;
}

export interface IntentPreferences {
  confirmationThreshold: number;
  autoExecuteThreshold: number;
  preferredFallbackStrategy: IntentResolution['strategy'];
  enableLearning: boolean;
  enablePredictive: boolean;
}

export interface UserPreferences {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  voiceEnabled?: boolean;
  accessibilityMode?: boolean;
  preferredResponseLength?: 'brief' | 'detailed' | 'comprehensive';
  intentPreferences?: IntentPreferences;
  [key: string]: unknown;
}

export interface IntentSuggestion {
  intent: IntentCategory;
  phrase: string;
  context: string;
  confidence: number;
  reasoning: string;
}

export interface IntentCacheEntry {
  key: string;
  intent: IntentCategory;
  confidence: number;
  parameters?: IntentParameters;
  context: Partial<ContextualIntentAnalysis>;
  hitCount: number;
  lastUsed: Date;
  success: boolean;
  averageConfidence: number;
  expiresAt?: Date;
}

export interface IntentClassificationMetrics {
  totalClassifications: number;
  averageProcessingTime: number;
  averageConfidence: number;
  successRate: number;
  cacheHitRate: number;
  modelPerformance: Record<string, ModelMetrics>;
  intentDistribution: Record<IntentCategory, number>;
  errorRates: Record<string, number>;
  performanceTrends: TimeSeries[];
}

export interface ModelMetrics {
  name: string;
  totalRequests: number;
  averageLatency: number;
  errorRate: number;
  confidenceDistribution: number[];
  lastUsed: Date;
}

export interface TimeSeries {
  timestamp: Date;
  value: number;
  metric: string;
}

export interface IntentEnsembleDecision {
  finalIntent: IntentCategory;
  confidence: number;
  contributingModels: string[];
  weights: Record<string, number>;
  agreements: number;
  disagreements: number;
  ensembleStrategy: 'weighted_average' | 'majority_vote' | 'confidence_threshold' | 'contextual_boost';
  decisionTime: number;
}

export interface IntentOrchestrationConfig {
  primaryClassifier: {
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
  secondaryValidation: {
    enabled: boolean;
    threshold: number;
    validationModels: string[];
  };
  contextAnalysis: {
    enabled: boolean;
    contextWeights: Record<string, number>;
    boostThreshold: number;
  };
  caching: {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    keyStrategy: 'text_only' | 'text_context' | 'full_context';
  };
  performance: {
    targetProcessingTime: number;
    maxRetries: number;
    fallbackTimeout: number;
    enablePredictive: boolean;
  };
  ensemble: {
    enabled: boolean;
    strategy: IntentEnsembleDecision['ensembleStrategy'];
    minimumAgreement: number;
    weightAdjustment: boolean;
  };
  learning: {
    enabled: boolean;
    adaptiveThresholds: boolean;
    userFeedbackWeight: number;
    patternDetection: boolean;
  };
}

export interface IntentProcessingRequest {
  text: string;
  context: ContextualIntentAnalysis;
  options?: {
    skipCache?: boolean;
    skipValidation?: boolean;
    requireHighConfidence?: boolean;
    timeoutMs?: number;
    preferredModels?: string[];
  };
  metadata?: {
    sessionId: string;
    userId?: string;
    timestamp: Date;
    correlationId?: string;
  };
}

export interface IntentProcessingResponse {
  classification: IntentClassificationResult;
  validation: IntentValidationResult;
  contextualAnalysis: ContextualIntentAnalysis;
  ensemble?: IntentEnsembleDecision;
  recommendations?: IntentSuggestion[];
  metrics: {
    totalProcessingTime: number;
    cacheHit: boolean;
    modelsUsed: string[];
    confidenceBreakdown: Record<string, number>;
  };
  warnings?: string[];
  errors?: string[];
}

// Core Intent Categories - Universal across all website types
export type IntentCategory =
  // Navigation intents
  | 'navigate_to_page'
  | 'navigate_to_section'
  | 'navigate_back'
  | 'navigate_forward'
  | 'scroll_to_element'
  | 'open_menu'
  | 'close_menu'

  // Action intents
  | 'click_element'
  | 'submit_form'
  | 'clear_form'
  | 'select_option'
  | 'toggle_element'
  | 'drag_drop'
  | 'copy_content'
  | 'paste_content'

  // Content manipulation
  | 'edit_text'
  | 'add_content'
  | 'delete_content'
  | 'replace_content'
  | 'format_content'
  | 'undo_action'
  | 'redo_action'

  // Query intents
  | 'search_content'
  | 'filter_results'
  | 'sort_results'
  | 'get_information'
  | 'explain_feature'
  | 'show_details'

  // E-commerce specific
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_product'
  | 'compare_products'
  | 'checkout_process'
  | 'track_order'

  // Control intents
  | 'stop_action'
  | 'cancel_operation'
  | 'pause_process'
  | 'resume_process'
  | 'reset_state'
  | 'save_progress'

  // Confirmation intents
  | 'confirm_action'
  | 'deny_action'
  | 'maybe_later'
  | 'need_clarification'

  // Meta intents
  | 'help_request'
  | 'tutorial_request'
  | 'feedback_provide'
  | 'error_report'
  | 'unknown_intent';

// Universal site capabilities that can be detected automatically
export type SiteCapability =
  | 'navigation'
  | 'search'
  | 'forms'
  | 'e-commerce'
  | 'user-accounts'
  | 'content-creation'
  | 'media-upload'
  | 'real-time-updates'
  | 'multi-language'
  | 'accessibility'
  | 'offline-support'
  | 'geolocation'
  | 'notifications'
  | 'social-sharing'
  | 'comments'
  | 'ratings-reviews'
  | 'subscriptions'
  | 'payments'
  | 'chat-support'
  | 'api-integration';

// Schema.org structured data types for context
export interface SchemaOrgData {
  '@type': string;
  name?: string;
  description?: string;
  url?: string;
  breadcrumb?: BreadcrumbList;
  offers?: Offer | Offer[];
  review?: Review | Review[];
  aggregateRating?: AggregateRating;
  brand?: Brand;
  category?: string | Thing;
  [key: string]: unknown;
}

export interface BreadcrumbList {
  '@type': 'BreadcrumbList';
  itemListElement: ListItem[];
}

export interface ListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
}

export interface Offer {
  '@type': 'Offer';
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
  seller?: Organization;
  validFrom?: string;
  validThrough?: string;
}

export interface Review {
  '@type': 'Review';
  author?: Person | Organization;
  reviewRating?: Rating;
  reviewBody?: string;
  datePublished?: string;
}

export interface AggregateRating {
  '@type': 'AggregateRating';
  ratingValue: number;
  reviewCount?: number;
  bestRating?: number;
  worstRating?: number;
}

export interface Brand {
  '@type': 'Brand';
  name: string;
  url?: string;
  logo?: ImageObject;
}

export interface Thing {
  '@type': string;
  name?: string;
  url?: string;
  [key: string]: unknown;
}

export interface Person {
  '@type': 'Person';
  name: string;
  url?: string;
}

export interface Organization {
  '@type': 'Organization';
  name: string;
  url?: string;
  logo?: ImageObject;
}

export interface Rating {
  '@type': 'Rating';
  ratingValue: number;
  bestRating?: number;
  worstRating?: number;
}

export interface ImageObject {
  '@type': 'ImageObject';
  url: string;
  width?: number;
  height?: number;
}

export interface ConversationState {
  currentTopic?: string;
  entities: Record<string, ConversationEntity>;
  context: Record<string, ConversationContext>;
  lastAction?: string;
  pendingActions: string[];
  mood?: 'helpful' | 'confused' | 'frustrated' | 'satisfied';
}

export interface ConversationEntity {
  type: 'person' | 'place' | 'product' | 'event' | 'date' | 'time' | 'number' | 'other';
  value: string | number | Date;
  confidence: number;
  source: 'user_input' | 'context' | 'inference';
  mentions: number;
  lastMentioned: Date;
}

export interface ConversationContext {
  type: 'user_preference' | 'session_data' | 'page_context' | 'history' | 'external';
  value: string | number | boolean | object;
  priority: 'low' | 'medium' | 'high';
  expiresAt?: Date;
  source: string;
}

export interface IntentProcessingError extends Error {
  code: 'TIMEOUT' | 'VALIDATION_FAILED' | 'CONTEXT_INSUFFICIENT' | 'MODEL_ERROR' | 'CACHE_ERROR' | 'UNKNOWN';
  details?: ErrorDetails;
  retryable: boolean;
  suggestedAction?: string;
}

export interface ErrorDetails {
  originalError?: Error;
  errorCode?: string | number;
  context?: {
    input?: string;
    model?: string;
    timeout?: number;
    retryAttempt?: number;
    [key: string]: unknown;
  };
  timestamp?: Date;
  correlationId?: string;
}

// Performance and monitoring types
export interface IntentPerformanceTarget {
  maxProcessingTime: number;
  minConfidence: number;
  maxCacheAge: number;
  targetSuccessRate: number;
}

export interface IntentSystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  totalRequests: number;
  recentPerformance: IntentClassificationMetrics;
  activeModels: string[];
  cacheStatus: {
    size: number;
    hitRate: number;
    memoryUsage: number;
  };
  errors: Array<{
    timestamp: Date;
    error: string;
    frequency: number;
  }>;
}