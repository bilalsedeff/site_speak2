/**
 * Shared type definitions for SiteSpeak
 */

// Action System Types
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
  metadata?: {
    estimatedTime?: number;
    requiresAuth?: boolean;
    rateLimit?: { requests: number; window: number };
  };
}

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
  defaultValue?: any;
}