/**
 * Command Suggestion System Types
 *
 * Comprehensive type definitions for context-aware command suggestions and auto-completion.
 * Designed for universal compatibility with any website structure while maintaining
 * high performance and user-friendly discovery features.
 */

import { IntentCategory, ContextualIntentAnalysis } from './intent.types';

// ======================= CORE SUGGESTION TYPES =======================

export interface CommandSuggestion {
  id: string;
  command: string;
  intent: IntentCategory;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  context: SuggestionContext;
  category: SuggestionCategory;
  description: string;
  examples: string[];
  keywords: string[];
  variations: string[];
  reasoning: string;
  metadata: SuggestionMetadata;
}

export interface SuggestionContext {
  pageType: string;
  availableElements: string[];
  userRole: string;
  currentMode: 'view' | 'edit' | 'preview';
  capabilities: string[];
  restrictions: string[];
  sessionHistory: string[];
  userPatterns: string[];
}

export type SuggestionCategory =
  | 'navigation'
  | 'action'
  | 'content'
  | 'query'
  | 'control'
  | 'help'
  | 'discovery';

export interface SuggestionMetadata {
  frequency: number;
  successRate: number;
  avgExecutionTime: number;
  lastUsed?: Date;
  userRating?: number;
  isLearned: boolean;
  source: 'ai' | 'template' | 'user' | 'pattern';
}

// ======================= AUTO-COMPLETION TYPES =======================

export interface AutoCompletionResult {
  completions: CompletionMatch[];
  partialInput: string;
  confidence: number;
  processingTime: number;
  fallbackUsed: boolean;
  suggestions: CommandSuggestion[];
}

export interface CompletionMatch {
  text: string;
  intent: IntentCategory;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'pattern';
  highlightRanges: HighlightRange[];
  reasoning: string;
  parameters?: Record<string, any>;
}

export interface HighlightRange {
  start: number;
  end: number;
  type: 'match' | 'parameter' | 'keyword';
}

// ======================= CONTEXT DISCOVERY TYPES =======================

export interface PageAnalysisResult {
  pageType: string;
  contentType: string;
  capabilities: SiteCapability[];
  elements: DiscoveredElement[];
  actions: AvailableAction[];
  structure: PageStructure;
  accessibility: AccessibilityInfo;
  performance: AnalysisPerformance;
}

export interface DiscoveredElement {
  selector: string;
  type: string;
  role?: string;
  label?: string;
  description?: string;
  isInteractable: boolean;
  isVisible: boolean;
  importance: number;
  suggestedCommands: string[];
  contextualHints: string[];
}

export interface AvailableAction {
  id: string;
  name: string;
  description: string;
  category: SuggestionCategory;
  intent: IntentCategory;
  triggers: string[];
  requirements: ActionRequirement[];
  parameters: SuggestionActionParameter[];
  examples: string[];
  confidence: number;
}

export interface ActionRequirement {
  type: 'element' | 'permission' | 'context' | 'data';
  condition: string;
  description: string;
  optional: boolean;
}

export interface SuggestionActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'selector' | 'option';
  description: string;
  required: boolean;
  default?: any;
  options?: string[];
  validation?: string;
}

export interface PageStructure {
  landmarks: StructuralLandmark[];
  navigation: NavigationStructure[];
  forms: FormStructure[];
  content: ContentStructure[];
  interactive: InteractiveStructure[];
}

export interface StructuralLandmark {
  type: string;
  selector: string;
  label: string;
  description: string;
  children: StructuralLandmark[];
}

export interface NavigationStructure {
  type: 'primary' | 'secondary' | 'breadcrumb' | 'footer';
  items: NavigationItem[];
  isAccessible: boolean;
}

export interface NavigationItem {
  text: string;
  href?: string;
  selector: string;
  isActive: boolean;
  children: NavigationItem[];
}

export interface FormStructure {
  selector: string;
  action?: string;
  method?: string;
  fields: FormField[];
  isValid: boolean;
}

export interface FormField {
  name?: string;
  type: string;
  label?: string;
  required: boolean;
  selector: string;
}

export interface ContentStructure {
  type: 'article' | 'section' | 'aside' | 'header' | 'footer';
  heading?: string;
  selector: string;
  importance: number;
}

export interface InteractiveStructure {
  type: 'button' | 'link' | 'input' | 'select' | 'custom';
  selector: string;
  action: string;
  importance: number;
}

export interface AccessibilityInfo {
  score: number;
  landmarks: number;
  headingStructure: boolean;
  keyboardNavigable: boolean;
  screenReaderFriendly: boolean;
  issues: AccessibilityIssue[];
}

export interface AccessibilityIssue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  element?: string;
}

export interface AnalysisPerformance {
  totalTime: number;
  elementAnalysisTime: number;
  structureAnalysisTime: number;
  capabilityDetectionTime: number;
  elementsAnalyzed: number;
}

// ======================= CACHE MANAGEMENT TYPES =======================

export interface SuggestionCacheEntry {
  key: string;
  suggestions: CommandSuggestion[];
  context: SuggestionContext;
  timestamp: Date;
  hitCount: number;
  ttl: number;
  userProfile?: UserSuggestionProfile;
}

export interface UserSuggestionProfile {
  userId?: string;
  preferredCommands: string[];
  frequentPatterns: CommandPattern[];
  customSuggestions: CommandSuggestion[];
  learningData: LearningData;
  preferences: UserSuggestionPreferences;
}

export interface CommandPattern {
  pattern: string;
  frequency: number;
  contexts: string[];
  successRate: number;
  avgConfidence: number;
  lastUsed: Date;
}

export interface LearningData {
  commandHistory: CommandHistoryEntry[];
  contextualPreferences: Record<string, number>;
  correctionHistory: CorrectionEntry[];
  adaptiveThresholds: Record<string, number>;
}

export interface CommandHistoryEntry {
  command: string;
  intent: IntentCategory;
  context: string;
  success: boolean;
  confidence: number;
  timestamp: Date;
  executionTime: number;
  feedback?: 'positive' | 'negative' | 'neutral';
}

export interface CorrectionEntry {
  originalCommand: string;
  correctedCommand: string;
  context: string;
  timestamp: Date;
  reason: string;
}

export interface UserSuggestionPreferences {
  maxSuggestions: number;
  preferredCategories: SuggestionCategory[];
  enableLearning: boolean;
  enableProactive: boolean;
  confidenceThreshold: number;
  responseTimePreference: 'fast' | 'balanced' | 'accurate';
}

// ======================= UI ORCHESTRATION TYPES =======================

export interface SuggestionUIState {
  isVisible: boolean;
  activeView: 'suggestions' | 'palette' | 'help' | 'search';
  selectedIndex: number;
  searchQuery: string;
  filteredSuggestions: CommandSuggestion[];
  loading: boolean;
  error?: string;
  animations: SuggestionAnimationState;
}

export interface SuggestionAnimationState {
  showTransition: boolean;
  highlightTransition: boolean;
  loadingTransition: boolean;
  pulseAnimation: boolean;
}

export interface SuggestionUIConfig {
  theme: 'auto' | 'light' | 'dark';
  position: 'bottom' | 'top' | 'center' | 'follow-voice';
  maxVisible: number;
  showDescriptions: boolean;
  showKeyboardShortcuts: boolean;
  enableAnimations: boolean;
  autoHide: boolean;
  autoHideDelay: number;
  voiceFirst: boolean;
}

export interface SuggestionUICallbacks {
  onSuggestionSelect: (suggestion: CommandSuggestion) => void;
  onSuggestionHover: (suggestion: CommandSuggestion) => void;
  onSearchChange: (query: string) => void;
  onViewChange: (view: SuggestionUIState['activeView']) => void;
  onDismiss: () => void;
  onFeedback: (suggestion: CommandSuggestion, feedback: 'positive' | 'negative') => void;
}

// ======================= COMMAND PALETTE TYPES =======================

export interface CommandPaletteConfig {
  enableSearch: boolean;
  enableCategories: boolean;
  enableKeyboardShortcuts: boolean;
  enableHelp: boolean;
  showRecentCommands: boolean;
  showPopularCommands: boolean;
  maxRecentCommands: number;
  maxPopularCommands: number;
}

export interface CommandPaletteState {
  isOpen: boolean;
  searchQuery: string;
  selectedCategory?: SuggestionCategory;
  selectedCommandId?: string;
  filteredCommands: CommandSuggestion[];
  recentCommands: CommandSuggestion[];
  popularCommands: CommandSuggestion[];
  helpVisible: boolean;
}

export interface CommandGroup {
  category: SuggestionCategory;
  label: string;
  description: string;
  icon?: string;
  commands: CommandSuggestion[];
  expanded: boolean;
}

// ======================= PERFORMANCE MONITORING TYPES =======================

export interface SuggestionSystemMetrics {
  totalRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  cacheHitRate: number;
  suggestionAccuracy: number;
  userSatisfaction: number;
  errorRate: number;
  performanceTrends: PerformanceTrend[];
}

export interface PerformanceTrend {
  timestamp: Date;
  metric: string;
  value: number;
  target: number;
}

export interface SuggestionSystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  services: ServiceHealth[];
  alerts: SystemAlert[];
  recommendations: string[];
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  errorRate: number;
  lastError?: string;
}

export interface SystemAlert {
  id: string;
  type: 'performance' | 'error' | 'capacity' | 'degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  resolved: boolean;
}

// ======================= CONFIGURATION TYPES =======================

export interface SuggestionSystemConfig {
  ai: AISuggestionConfig;
  cache: CacheConfig;
  performance: PerformanceConfig;
  ui: SuggestionUIConfig;
  palette: CommandPaletteConfig;
  learning: LearningConfig;
  features: FeatureConfig;
}

export interface AISuggestionConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  fallbackModel?: string;
  enableContextBoost: boolean;
  enableSemanticSearch: boolean;
  confidenceThreshold: number;
}

export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  ttl: number;
  strategy: 'lru' | 'lfu' | 'ttl' | 'adaptive';
  persistToDisk: boolean;
  compressionEnabled: boolean;
}

export interface PerformanceConfig {
  targetResponseTime: number;
  maxConcurrentRequests: number;
  enablePreloading: boolean;
  enablePredictive: boolean;
  batchingEnabled: boolean;
  batchSize: number;
  debounceDelay: number;
}

export interface LearningConfig {
  enabled: boolean;
  adaptiveThresholds: boolean;
  patternDetection: boolean;
  userFeedbackWeight: number;
  retentionPeriod: number;
  anonymizeData: boolean;
}

export interface FeatureConfig {
  autoCompletion: boolean;
  proactiveSuggestions: boolean;
  contextualHelp: boolean;
  voiceCommandPalette: boolean;
  smartFiltering: boolean;
  multiLanguage: boolean;
  accessibilityEnhancements: boolean;
}

// ======================= API TYPES =======================

export interface SuggestionRequest {
  context: SuggestionContext;
  partialInput?: string;
  maxSuggestions?: number;
  categories?: SuggestionCategory[];
  includeExamples?: boolean;
  userProfile?: UserSuggestionProfile;
  options?: RequestOptions;
}

export interface RequestOptions {
  timeout?: number;
  useCache?: boolean;
  includeMetadata?: boolean;
  enableLearning?: boolean;
  debugMode?: boolean;
}

export interface SuggestionResponse {
  suggestions: CommandSuggestion[];
  autoCompletions?: CompletionMatch[];
  metadata: ResponseMetadata;
  error?: string;
  fallbackUsed: boolean;
}

export interface ResponseMetadata {
  requestId: string;
  processingTime: number;
  cacheHit: boolean;
  modelUsed?: string;
  confidence: number;
  contextAnalysisTime: number;
  suggestionGenerationTime: number;
}

// ======================= ERROR TYPES =======================

export interface SuggestionError extends Error {
  code: SuggestionErrorCode;
  context?: string;
  retryable: boolean;
  suggestions?: string[];
  fallbackAvailable: boolean;
}

export type SuggestionErrorCode =
  | 'CONTEXT_ANALYSIS_FAILED'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'CACHE_ERROR'
  | 'TIMEOUT'
  | 'INVALID_INPUT'
  | 'PERMISSIONS_ERROR'
  | 'RATE_LIMIT_EXCEEDED'
  | 'UNKNOWN_ERROR';

// ======================= CAPABILITY TYPES =======================

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
  | 'api-integration'
  | 'analytics'
  | 'admin-tools'
  | 'workflow-automation';

// ======================= INTEGRATION TYPES =======================

export interface VoiceIntegrationCallbacks {
  onVoiceStart: () => void;
  onVoiceEnd: () => void;
  onPartialTranscription: (text: string) => void;
  onFinalTranscription: (text: string) => void;
  onSuggestionTriggered: (suggestion: CommandSuggestion) => void;
  onCommandExecuted: (command: string, success: boolean) => void;
}

export interface IntentIntegrationData {
  intentAnalysis: ContextualIntentAnalysis;
  availableIntents: IntentCategory[];
  contextualBoosts: Record<IntentCategory, number>;
  confidenceThresholds: Record<IntentCategory, number>;
}

// ======================= UTILITY TYPES =======================

export interface Debounced<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

export interface Cached<T> {
  value: T;
  timestamp: Date;
  hitCount: number;
  ttl: number;
}

export interface BatchedRequest<T> {
  id: string;
  data: T;
  timestamp: Date;
  resolve: (result: any) => void;
  reject: (error: any) => void;
}