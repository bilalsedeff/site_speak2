/**
 * Shared types across the SiteSpeak application
 */

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: any;
  validation?: any; // Zod schema will be here
}

export interface SiteAction {
  name: string;
  type: 'navigation' | 'form' | 'button' | 'api' | 'custom';
  selector: string;
  description: string;
  parameters: ActionParameter[];
  confirmation: boolean;
  sideEffecting: 'safe' | 'confirmation_required' | 'destructive';
  riskLevel: 'low' | 'medium' | 'high';
  category: 'read' | 'write' | 'delete' | 'payment' | 'communication';
}

export interface AIResponse {
  text: string;
  audioUrl?: string;
  citations: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
  uiHints: {
    highlightElements?: string[];
    scrollToElement?: string;
    showModal?: boolean;
    confirmationRequired?: boolean;
  };
  metadata: {
    responseTime: number;
    tokensUsed: number;
    actionsTaken: number;
    language: string;
    intent?: string;
  };
}

export interface ConversationContext {
  sessionId: string;
  siteId: string;
  tenantId: string;
  userId?: string;
  browserLanguage?: string;
  currentUrl?: string;
  pageTitle?: string;
  userAgent?: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  siteId: string;
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  lastCrawled: Date;
  contentHash: string;
}

export interface SearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}