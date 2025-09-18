/**
 * Shared intent types for client-side use
 *
 * Note: This file contains only the types needed by client-side code.
 * Full intent orchestration types are available in server/src/modules/ai/application/services/intent/types.ts
 */

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

// Additional types needed by client-side components
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

export interface PageContext {
  url: string;
  domain: string;
  pageType: 'home' | 'product' | 'category' | 'cart' | 'checkout' | 'account' | 'blog' | 'contact' | 'other';
  contentType: 'e-commerce' | 'blog' | 'documentation' | 'form' | 'media' | 'dashboard' | 'other';
  availableElements: ElementContextInfo[];
  schema?: any; // Simplified for client-side use
  capabilities: string[]; // Simplified for client-side use
  currentMode: 'view' | 'edit' | 'preview';
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  tenantId: string;
  siteId: string;
  startTime: Date;
  previousIntents: any[]; // Simplified for client-side use
  conversationState: any; // Simplified for client-side use
  userPreferences?: any; // Simplified for client-side use
  currentTask?: any; // Simplified for client-side use
}

export interface UserContext {
  userId?: string;
  role: 'admin' | 'editor' | 'viewer' | 'guest';
  permissions: string[];
  previousSessions: string[];
  learningProfile?: any; // Simplified for client-side use
  preferredIntentHandling?: any; // Simplified for client-side use
  timezone?: string;
  locale?: string;
}

export interface ContextualIntentAnalysis {
  pageContext: PageContext;
  sessionContext: SessionContext;
  userContext: UserContext;
  availableActions: string[];
  contextualBoosts: Record<IntentCategory, number>;
  constrainedIntents: IntentCategory[];
  suggestionOverrides?: any[]; // Simplified for client-side use
}