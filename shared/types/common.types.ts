// Common types used across the application
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  correlationId?: string;
  tenantId?: string;
}

// Language and locale types
export type SupportedLanguage = 'en' | 'tr' | 'es' | 'fr' | 'de';
export type SupportedLocale = 'en-US' | 'tr-TR' | 'es-ES' | 'fr-FR' | 'de-DE';

// Tenant and organization types
export interface Tenant {
  id: string;
  name: string;
  domain?: string;
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  settings: TenantSettings;
  limits: TenantLimits;
}

export interface TenantSettings {
  defaultLanguage: SupportedLanguage;
  defaultLocale: SupportedLocale;
  allowedDomains: string[];
  brandingEnabled: boolean;
}

export interface TenantLimits {
  maxSites: number;
  maxKnowledgeBaseMB: number;
  maxAITokensPerMonth: number;
  maxVoiceMinutesPerMonth: number;
}