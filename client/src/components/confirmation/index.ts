/**
 * Confirmation System - Index
 *
 * Modern, minimalistic confirmation system for SiteSpeak
 * Provides human-in-the-loop confirmation for destructive actions
 */

// Core Components
export { ConfirmationDialog } from './ConfirmationDialog';
export { VoiceConfirmationPrompt } from './VoiceConfirmationPrompt';
export { MultiStepConfirmation } from './MultiStepConfirmation';
export { ConfirmationProvider, withConfirmation } from './ConfirmationProvider';

// UI Components
export { RiskIndicator, RiskMeter, RiskBadge } from './RiskIndicator';
export { ActionPreview } from './ActionPreview';

// Hooks
export { useConfirmation, useQuickConfirm } from '@/hooks/useConfirmation';

// Services
export { confirmationOrchestrator, ConfirmationOrchestrator } from '@/services/confirmation/ConfirmationOrchestrator';

// Types
export type {
  ConfirmationAction,
  ConfirmationResponse,
  ConfirmationState,
  MultiStepAction,
  ActionContext,
  RiskLevel,
  ConfirmationSystemConfig,
  VoiceConfirmationConfig,
  VisualConfirmationConfig
} from '@shared/types/confirmation';

export { RISK_LEVELS, DEFAULT_CONFIRMATION_CONFIG } from '@shared/types/confirmation';