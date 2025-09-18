/**
 * Human-in-the-loop confirmation system types
 * Provides type safety for destructive action confirmation flows
 */

export interface RiskLevel {
  level: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  icon: string;
  description: string;
}

export interface ActionContext {
  type: 'delete' | 'modify' | 'publish' | 'unpublish' | 'transfer' | 'replace';
  targetType: 'page' | 'site' | 'component' | 'content' | 'settings' | 'user_data';
  targetId: string;
  targetName: string;
  dependencies?: string[];
  recoverable: boolean;
  estimatedImpact: 'minimal' | 'moderate' | 'significant' | 'severe';
}

export interface ConfirmationAction {
  id: string;
  title: string;
  description: string;
  context: ActionContext;
  riskLevel: RiskLevel['level'];
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  warnings?: string[];
  recoveryInstructions?: string;
  estimatedDuration?: number; // in milliseconds
  requiresExplicitConfirmation: boolean;
  confirmationPhrase?: string; // For high-risk actions
}

export interface ConfirmationResponse {
  action: 'confirm' | 'cancel' | 'defer';
  method: 'voice' | 'visual' | 'keyboard';
  timestamp: number;
  confidence?: number; // For voice confirmations
  customInput?: string; // For phrase-based confirmations
}

export interface MultiStepAction {
  id: string;
  title: string;
  description: string;
  steps: ConfirmationAction[];
  currentStep: number;
  allowStepSkipping: boolean;
  allowBatchConfirmation: boolean;
  rollbackStrategy: 'step_by_step' | 'all_or_nothing' | 'manual';
}

export interface ConfirmationState {
  isOpen: boolean;
  currentAction: ConfirmationAction | null;
  multiStepAction: MultiStepAction | null;
  pendingActions: ConfirmationAction[];
  voiceConfirmationActive: boolean;
  visualFallbackActive: boolean;
  timeout: number | null;
  history: ConfirmationResponse[];
}

export interface VoiceConfirmationConfig {
  enabled: boolean;
  timeout: number; // ms
  confidence_threshold: number;
  supportedPhrases: string[];
  enableBargeIn: boolean;
  fallbackToVisual: boolean;
}

export interface VisualConfirmationConfig {
  theme: 'light' | 'dark' | 'auto';
  position: 'center' | 'top' | 'bottom';
  animation: 'fade' | 'slide' | 'scale' | 'none';
  showRiskIndicators: boolean;
  showPreview: boolean;
  allowKeyboardShortcuts: boolean;
}

export interface ConfirmationSystemConfig {
  voice: VoiceConfirmationConfig;
  visual: VisualConfirmationConfig;
  riskThresholds: {
    autoConfirmBelow: RiskLevel['level'];
    requireExplicitAbove: RiskLevel['level'];
  };
  timeout: {
    default: number;
    byRiskLevel: Record<RiskLevel['level'], number>;
  };
  accessibility: {
    announceActions: boolean;
    highContrast: boolean;
    reducedMotion: boolean;
    screenReaderOptimized: boolean;
  };
}

export const RISK_LEVELS: Record<RiskLevel['level'], RiskLevel> = {
  low: {
    level: 'low',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: 'info',
    description: 'Minimal impact, easily reversible'
  },
  medium: {
    level: 'medium',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: 'alert-circle',
    description: 'Moderate impact, reversible with effort'
  },
  high: {
    level: 'high',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    icon: 'alert-triangle',
    description: 'Significant impact, complex to reverse'
  },
  critical: {
    level: 'critical',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: 'alert-octagon',
    description: 'Severe impact, may be irreversible'
  }
} as const;

export const DEFAULT_CONFIRMATION_CONFIG: ConfirmationSystemConfig = {
  voice: {
    enabled: true,
    timeout: 5000,
    confidence_threshold: 0.8,
    supportedPhrases: ['yes', 'confirm', 'proceed', 'no', 'cancel', 'stop'],
    enableBargeIn: true,
    fallbackToVisual: true
  },
  visual: {
    theme: 'auto',
    position: 'center',
    animation: 'scale',
    showRiskIndicators: true,
    showPreview: true,
    allowKeyboardShortcuts: true
  },
  riskThresholds: {
    autoConfirmBelow: 'low',
    requireExplicitAbove: 'high'
  },
  timeout: {
    default: 10000,
    byRiskLevel: {
      low: 5000,
      medium: 10000,
      high: 15000,
      critical: 30000
    }
  },
  accessibility: {
    announceActions: true,
    highContrast: false,
    reducedMotion: false,
    screenReaderOptimized: true
  }
} as const;