import { BaseEntity, SupportedLanguage } from './common.types';

export interface Site extends BaseEntity {
  name: string;
  description?: string;
  domain?: string;
  subdomain?: string;
  tenantId: string;
  userId: string;
  template: SiteTemplate;
  configuration: SiteConfiguration;
  publishedAt?: Date;
  lastCrawledAt?: Date;
  status: SiteStatus;
  stats: SiteStats;
}

export type SiteStatus = 'draft' | 'published' | 'archived' | 'indexing' | 'error';

export interface SiteTemplate {
  id: string;
  name: string;
  category: 'business' | 'ecommerce' | 'blog' | 'portfolio' | 'restaurant' | 'landing';
  previewUrl?: string;
  features: SiteFeature[];
}

export type SiteFeature = 
  | 'contact-form' 
  | 'ecommerce' 
  | 'booking' 
  | 'blog' 
  | 'gallery' 
  | 'auth' 
  | 'search'
  | 'analytics'
  | 'voice-ai';

export interface SiteConfiguration {
  theme: SiteTheme;
  seo: SeoSettings;
  voiceAgent: VoiceAgentConfig;
  integrations: SiteIntegrations;
  customCode?: CustomCodeSettings;
}

export interface SiteTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  layout: 'modern' | 'classic' | 'minimal';
  headerStyle: 'fixed' | 'static' | 'transparent';
}

export interface SeoSettings {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonicalUrl?: string;
  robots: 'index,follow' | 'noindex,nofollow' | 'index,nofollow' | 'noindex,follow';
}

export interface VoiceAgentConfig {
  enabled: boolean;
  name: string;
  personality: string;
  language: SupportedLanguage;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  enabledFeatures: VoiceFeature[];
  customInstructions?: string;
}

export type VoiceFeature = 
  | 'navigation'
  | 'search' 
  | 'ecommerce'
  | 'booking'
  | 'contact'
  | 'faq'
  | 'product-info';

export interface SiteIntegrations {
  analytics?: {
    googleAnalyticsId?: string;
    plausibleDomain?: string;
  };
  ecommerce?: {
    stripeAccountId?: string;
    paypalClientId?: string;
  };
  email?: {
    provider: 'sendgrid' | 'mailgun' | 'smtp';
    apiKey?: string;
    fromEmail: string;
  };
}

export interface CustomCodeSettings {
  headCode?: string;
  footerCode?: string;
  customCSS?: string;
}

export interface SiteStats {
  totalViews: number;
  uniqueVisitors: number;
  voiceInteractions: number;
  lastMonthGrowth: number;
  knowledgeBaseSize: number; // in KB
  lastIndexedPages: number;
}

// Site Contract Types (for voice agent)
export interface SiteManifest {
  siteId: string;
  version: string;
  generatedAt: string;
  actions: SiteAction[];
  capabilities: SiteFeature[];
  metadata: SiteMetadata;
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

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  validation?: any; // Zod schema will be here
}

export interface SiteMetadata {
  hasContactForm: boolean;
  hasEcommerce: boolean;
  hasBooking: boolean;
  hasBlog: boolean;
  hasGallery: boolean;
  hasAuth: boolean;
  hasSearch: boolean;
}