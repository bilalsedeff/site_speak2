/**
 * Error Recovery and Clarification System Types
 *
 * Comprehensive type definitions for SiteSpeak's error recovery and clarification system.
 * Provides type safety for error detection, classification, recovery strategies,
 * and clarification interfaces across the entire voice system.
 */

export interface VoiceError {
  id: string;
  code: VoiceErrorCode;
  type: VoiceErrorType;
  severity: ErrorSeverity;
  message: string;
  details: ErrorDetails;
  context: ErrorContext;
  timestamp: Date;
  retryable: boolean;
  fallbackAvailable: boolean;
  recoveryStrategies: RecoveryStrategy[];
  clarificationRequired: boolean;
  userImpact: UserImpact;
}

export type VoiceErrorCode =
  // Voice Recognition Errors
  | 'VOICE_LOW_CONFIDENCE'
  | 'VOICE_NOISE_INTERFERENCE'
  | 'VOICE_MULTIPLE_SPEAKERS'
  | 'VOICE_ACCENT_VARIATION'
  | 'VOICE_PARTIAL_COMMAND'
  | 'VOICE_AUDIO_QUALITY'
  | 'VOICE_MICROPHONE_ISSUE'

  // Intent Understanding Errors
  | 'INTENT_AMBIGUOUS'
  | 'INTENT_OUT_OF_CONTEXT'
  | 'INTENT_CONFLICTING'
  | 'INTENT_UNKNOWN_COMMAND'
  | 'INTENT_COMPLEX_MULTI_STEP'
  | 'INTENT_INSUFFICIENT_CONTEXT'

  // Action Execution Errors
  | 'ACTION_ELEMENT_NOT_FOUND'
  | 'ACTION_PERMISSION_DENIED'
  | 'ACTION_STATE_CONFLICT'
  | 'ACTION_TIMING_ISSUE'
  | 'ACTION_NETWORK_ERROR'
  | 'ACTION_SERVICE_UNAVAILABLE'

  // System Errors
  | 'SYSTEM_API_FAILURE'
  | 'SYSTEM_TIMEOUT'
  | 'SYSTEM_BROWSER_COMPATIBILITY'
  | 'SYSTEM_RESOURCE_CONSTRAINT'
  | 'SYSTEM_SECURITY_RESTRICTION'
  | 'SYSTEM_SERVICE_DEGRADATION'

  // Context Errors
  | 'CONTEXT_UNAVAILABLE_ACTION'
  | 'CONTEXT_INVALID_STATE'
  | 'CONTEXT_MISSING_PERMISSION'
  | 'CONTEXT_NAVIGATION_BLOCKED'
  | 'CONTEXT_CONTENT_CHANGED';

export type VoiceErrorType =
  | 'recognition'
  | 'understanding'
  | 'execution'
  | 'system'
  | 'context'
  | 'network'
  | 'permission'
  | 'compatibility';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorDetails {
  originalCommand?: string;
  transcriptConfidence?: number;
  intentConfidence?: number;
  targetElement?: string;
  expectedState?: string;
  actualState?: string;
  systemInfo?: SystemInfo;
  networkInfo?: NetworkInfo;
  permissionInfo?: PermissionInfo;
  stack?: string;
  metadata?: Record<string, any>;
}

export interface ErrorContext {
  sessionId: string;
  userId?: string;
  pageUrl: string;
  pageTitle?: string;
  userRole: 'guest' | 'admin' | 'editor';
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browserInfo: BrowserInfo;
  voiceConfig: VoiceConfig;
  recentCommands: string[];
  currentMode: 'editor' | 'visitor' | 'tutorial';
  contextualData?: Record<string, any>;
}

export interface SystemInfo {
  memoryUsage: number;
  cpuUsage: number;
  networkLatency: number;
  audioLatency: number;
  serviceHealth: Record<string, number>;
}

export interface NetworkInfo {
  connectionType: string;
  bandwidth: number;
  latency: number;
  packetLoss: number;
  offline: boolean;
}

export interface PermissionInfo {
  microphone: PermissionState;
  notifications: PermissionState;
  clipboard: PermissionState;
  camera?: PermissionState;
  location?: PermissionState;
}

export interface BrowserInfo {
  name: string;
  version: string;
  platform: string;
  capabilities: BrowserCapabilities;
}

export interface BrowserCapabilities {
  audioWorklet: boolean;
  webSpeech: boolean;
  mediaRecorder: boolean;
  websockets: boolean;
  localStorage: boolean;
}

export interface VoiceConfig {
  sttProvider: string;
  ttsProvider: string;
  language: string;
  confidenceThreshold: number;
  noiseReduction: boolean;
}

export type UserImpact = 'none' | 'minimal' | 'moderate' | 'severe' | 'blocking';

// Recovery Strategy Types
export interface RecoveryStrategy {
  id: string;
  name: string;
  type: RecoveryType;
  priority: number;
  description: string;
  automated: boolean;
  userActionRequired: boolean;
  steps: RecoveryStep[];
  successProbability: number;
  estimatedTime: number;
  prerequisites: string[];
  fallbackStrategy?: string;
}

export type RecoveryType =
  | 'retry'
  | 'fallback'
  | 'alternative'
  | 'clarification'
  | 'escalation'
  | 'tutorial'
  | 'reset'
  | 'workaround';

export interface RecoveryStep {
  id: string;
  description: string;
  action: RecoveryAction;
  automated: boolean;
  userMessage?: string;
  confirmation?: ConfirmationConfig;
  timeout?: number;
  skipCondition?: string;
}

export interface RecoveryAction {
  type: 'retry' | 'modify' | 'alternative' | 'clarify' | 'escalate' | 'reset';
  parameters: Record<string, any>;
  fallback?: RecoveryAction;
}

export interface ConfirmationConfig {
  required: boolean;
  message: string;
  options: string[];
  defaultOption: string;
  timeout: number;
}

// Clarification System Types
export interface ClarificationRequest {
  id: string;
  sessionId: string;
  errorId: string;
  type: ClarificationType;
  context: ClarificationContext;
  question: ClarificationQuestion;
  options: ClarificationOption[];
  priority: number;
  timeout: number;
  maxAttempts: number;
  currentAttempt: number;
  createdAt: Date;
  respondedAt?: Date;
  resolvedAt?: Date;
}

export type ClarificationType =
  | 'disambiguation'
  | 'confirmation'
  | 'parameter_request'
  | 'alternative_selection'
  | 'context_clarification'
  | 'permission_request'
  | 'error_explanation';

export interface ClarificationContext {
  originalCommand: string;
  possibleIntents: string[];
  availableActions: string[];
  pageElements: PageElement[];
  userHistory: UserHistoryItem[];
  ambiguitySource: AmbiguitySource;
}

export interface ClarificationQuestion {
  text: string;
  voiceText?: string;
  visual: boolean;
  voice: boolean;
  progressive: boolean;
  followUpQuestions?: ClarificationQuestion[];
}

export interface ClarificationOption {
  id: string;
  text: string;
  description?: string;
  intent?: string;
  action?: string;
  parameters?: Record<string, any>;
  confidence: number;
  preview?: OptionPreview;
  voiceCommands: string[];
  keyboardShortcut?: string;
}

export interface OptionPreview {
  type: 'visual' | 'text' | 'audio';
  content: string;
  highlight?: HighlightConfig;
}

export interface HighlightConfig {
  selector: string;
  style: 'outline' | 'background' | 'border' | 'glow';
  color: string;
  duration: number;
  animation?: string;
}

export interface PageElement {
  id: string;
  selector: string;
  tag: string;
  text?: string;
  attributes: Record<string, string>;
  position: DOMRect;
  visible: boolean;
  interactive: boolean;
}

export interface UserHistoryItem {
  command: string;
  intent: string;
  success: boolean;
  timestamp: Date;
  context: string;
}

export type AmbiguitySource =
  | 'multiple_targets'
  | 'unclear_intent'
  | 'missing_context'
  | 'similar_options'
  | 'incomplete_command'
  | 'contextual_confusion';

export interface ClarificationResponse {
  requestId: string;
  optionId: string;
  userInput?: string;
  confidence: number;
  method: 'voice' | 'click' | 'keyboard' | 'timeout';
  timestamp: Date;
  satisfied: boolean;
  needsFollowUp: boolean;
}

// Error Learning Types
export interface ErrorPattern {
  id: string;
  errorCode: VoiceErrorCode;
  context: PatternContext;
  frequency: number;
  successfulRecoveries: number;
  bestRecoveryStrategy: string;
  userFeedback: UserFeedback[];
  learnedSolutions: LearnedSolution[];
  confidence: number;
  lastSeen: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface PatternContext {
  pageType: string;
  userRole: string;
  deviceType: string;
  browserType: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  sessionDuration: number;
  commandComplexity: 'simple' | 'medium' | 'complex';
}

export interface UserFeedback {
  sessionId: string;
  rating: number; // 1-5
  helpful: boolean;
  feedback?: string;
  timestamp: Date;
  errorId: string;
  recoveryStrategyUsed: string;
}

export interface LearnedSolution {
  id: string;
  description: string;
  strategy: RecoveryStrategy;
  successRate: number;
  avgResolutionTime: number;
  userSatisfaction: number;
  applicableContexts: PatternContext[];
  confidence: number;
}

// Error UI Types
export interface ErrorUIState {
  visible: boolean;
  mode: ErrorUIMode;
  error: VoiceError | null;
  clarificationRequest: ClarificationRequest | null;
  recoveryInProgress: boolean;
  currentStep: number;
  totalSteps: number;
  userCanSkip: boolean;
  userCanRetry: boolean;
  showDetails: boolean;
  animationState: AnimationState;
}

export type ErrorUIMode =
  | 'error_display'
  | 'clarification'
  | 'recovery_progress'
  | 'success_feedback'
  | 'help_guidance';

export interface AnimationState {
  entering: boolean;
  exiting: boolean;
  transitioning: boolean;
  currentAnimation: string;
}

export interface ErrorUIConfig {
  theme: 'light' | 'dark' | 'auto';
  position: 'center' | 'top' | 'bottom' | 'overlay';
  showAnimations: boolean;
  autoHide: boolean;
  autoHideDelay: number;
  voiceNavigation: boolean;
  keyboardNavigation: boolean;
  accessibilityMode: boolean;
  compactMode: boolean;
}

// Performance Monitoring Types
export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<VoiceErrorType, number>;
  errorsByCode: Record<VoiceErrorCode, number>;
  avgResolutionTime: number;
  successfulRecoveryRate: number;
  clarificationRequestRate: number;
  userSatisfactionScore: number;
  periodicStats: PeriodicStats;
  recentTrends: TrendData[];
}

export interface PeriodicStats {
  hourly: Record<string, number>;
  daily: Record<string, number>;
  weekly: Record<string, number>;
  monthly: Record<string, number>;
}

export interface TrendData {
  period: string;
  errorCount: number;
  recoveryRate: number;
  avgResolutionTime: number;
  userSatisfaction: number;
}

// Factory Configuration Types
export interface ErrorRecoveryConfig {
  classification: {
    enabled: boolean;
    confidenceThreshold: number;
    multiTypeDetection: boolean;
    contextAnalysis: boolean;
    patternRecognition: boolean;
  };
  clarification: {
    enabled: boolean;
    intelligentQuestions: boolean;
    multiModal: boolean;
    progressive: boolean;
    learningEnabled: boolean;
    maxAttempts: number;
    timeout: number;
  };
  recovery: {
    enabled: boolean;
    adaptiveStrategies: boolean;
    fallbackChaining: boolean;
    userEducation: boolean;
    successOptimization: boolean;
    maxRetries: number;
  };
  ui: {
    enabled: boolean;
    voiceFirst: boolean;
    accessibility: boolean;
    animations: boolean;
    compactMode: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
  learning: {
    enabled: boolean;
    patternRecognition: boolean;
    userSpecific: boolean;
    proactivePreventions: boolean;
    performanceOptimization: boolean;
  };
  performance: {
    errorDetection: number; // <50ms
    clarificationGeneration: number; // <200ms
    recoverySelection: number; // <100ms
    uiTransition: number; // <100ms
    totalCycle: number; // <500ms
  };
}

// Default configurations
export const DEFAULT_ERROR_RECOVERY_CONFIG: ErrorRecoveryConfig = {
  classification: {
    enabled: true,
    confidenceThreshold: 0.8,
    multiTypeDetection: true,
    contextAnalysis: true,
    patternRecognition: true,
  },
  clarification: {
    enabled: true,
    intelligentQuestions: true,
    multiModal: true,
    progressive: true,
    learningEnabled: true,
    maxAttempts: 3,
    timeout: 30000,
  },
  recovery: {
    enabled: true,
    adaptiveStrategies: true,
    fallbackChaining: true,
    userEducation: true,
    successOptimization: true,
    maxRetries: 2,
  },
  ui: {
    enabled: true,
    voiceFirst: true,
    accessibility: true,
    animations: true,
    compactMode: false,
    theme: 'auto',
  },
  learning: {
    enabled: true,
    patternRecognition: true,
    userSpecific: true,
    proactivePreventions: true,
    performanceOptimization: true,
  },
  performance: {
    errorDetection: 50,
    clarificationGeneration: 200,
    recoverySelection: 100,
    uiTransition: 100,
    totalCycle: 500,
  },
};

// Export convenience types for event handling
export interface ErrorRecoveryEvent {
  type: 'error_detected' | 'clarification_requested' | 'recovery_started' | 'recovery_completed' | 'user_feedback';
  error?: VoiceError;
  clarification?: ClarificationRequest;
  recovery?: RecoveryStrategy;
  feedback?: UserFeedback;
  timestamp: Date;
}

export interface ErrorRecoveryCallbacks {
  onErrorDetected?: (error: VoiceError) => void;
  onClarificationRequested?: (request: ClarificationRequest) => void;
  onRecoveryStarted?: (strategy: RecoveryStrategy) => void;
  onRecoveryCompleted?: (success: boolean, result?: any) => void;
  onUserFeedback?: (feedback: UserFeedback) => void;
  onPatternLearned?: (pattern: ErrorPattern) => void;
}