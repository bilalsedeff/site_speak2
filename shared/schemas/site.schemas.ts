import { z } from 'zod';

// Site status and feature enums
export const SiteStatusSchema = z.enum(['draft', 'published', 'archived', 'indexing', 'error']);
export const SiteFeatureSchema = z.enum([
  'contact-form', 'ecommerce', 'booking', 'blog', 'gallery', 
  'auth', 'search', 'analytics', 'voice-ai'
]);
export const VoiceFeatureSchema = z.enum([
  'navigation', 'search', 'ecommerce', 'booking', 'contact', 'faq', 'product-info'
]);

// Site template schemas
export const SiteTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']),
  previewUrl: z.string().url().optional(),
  features: z.array(SiteFeatureSchema),
});

// Site theme and styling
export const SiteThemeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  fontFamily: z.string().min(1),
  layout: z.enum(['modern', 'classic', 'minimal']),
  headerStyle: z.enum(['fixed', 'static', 'transparent']),
});

// SEO settings
export const SeoSettingsSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(160),
  keywords: z.array(z.string()).max(20),
  ogImage: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
  robots: z.enum(['index,follow', 'noindex,nofollow', 'index,nofollow', 'noindex,follow']),
});

// Voice agent configuration
export const VoiceAgentConfigSchema = z.object({
  enabled: z.boolean(),
  name: z.string().min(1).max(50),
  personality: z.string().max(500),
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
  enabledFeatures: z.array(VoiceFeatureSchema),
  customInstructions: z.string().max(1000).optional(),
});

// Site integrations
export const SiteIntegrationsSchema = z.object({
  analytics: z.object({
    googleAnalyticsId: z.string().optional(),
    plausibleDomain: z.string().optional(),
  }).optional(),
  ecommerce: z.object({
    stripeAccountId: z.string().optional(),
    paypalClientId: z.string().optional(),
  }).optional(),
  email: z.object({
    provider: z.enum(['sendgrid', 'mailgun', 'smtp']),
    apiKey: z.string().optional(),
    fromEmail: z.string().email(),
  }).optional(),
});

// Custom code settings
export const CustomCodeSettingsSchema = z.object({
  headCode: z.string().max(5000).optional(),
  footerCode: z.string().max(5000).optional(),
  customCSS: z.string().max(10000).optional(),
});

// Site configuration
export const SiteConfigurationSchema = z.object({
  theme: SiteThemeSchema,
  seo: SeoSettingsSchema,
  voiceAgent: VoiceAgentConfigSchema,
  integrations: SiteIntegrationsSchema,
  customCode: CustomCodeSettingsSchema.optional(),
});

// Site statistics
export const SiteStatsSchema = z.object({
  totalViews: z.number().int().min(0),
  uniqueVisitors: z.number().int().min(0),
  voiceInteractions: z.number().int().min(0),
  lastMonthGrowth: z.number(),
  knowledgeBaseSize: z.number().min(0),
  lastIndexedPages: z.number().int().min(0),
});

// Site action parameter
export const ActionParameterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  required: z.boolean(),
  description: z.string().min(1),
  validation: z.any().optional(),
});

// Site action
export const SiteActionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['navigation', 'form', 'button', 'api', 'custom']),
  selector: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(ActionParameterSchema),
  confirmation: z.boolean(),
  sideEffecting: z.enum(['safe', 'confirmation_required', 'destructive']),
  riskLevel: z.enum(['low', 'medium', 'high']),
  category: z.enum(['read', 'write', 'delete', 'payment', 'communication']),
});

// Site metadata for manifest
export const SiteMetadataSchema = z.object({
  hasContactForm: z.boolean(),
  hasEcommerce: z.boolean(),
  hasBooking: z.boolean(),
  hasBlog: z.boolean(),
  hasGallery: z.boolean(),
  hasAuth: z.boolean(),
  hasSearch: z.boolean(),
});

// Site manifest
export const SiteManifestSchema = z.object({
  siteId: z.string().uuid(),
  version: z.string(),
  generatedAt: z.string().datetime(),
  actions: z.array(SiteActionSchema),
  capabilities: z.array(SiteFeatureSchema),
  metadata: SiteMetadataSchema,
});

// Main site schema
export const SiteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  domain: z.string().optional(),
  subdomain: z.string().optional(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  template: SiteTemplateSchema,
  configuration: SiteConfigurationSchema,
  publishedAt: z.date().optional(),
  lastCrawledAt: z.date().optional(),
  status: SiteStatusSchema,
  stats: SiteStatsSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Create/Update site schemas
export const CreateSiteRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  templateId: z.string().uuid(),
  domain: z.string().optional(),
  subdomain: z.string().optional(),
  configuration: SiteConfigurationSchema.partial().optional(),
});

export const UpdateSiteRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  domain: z.string().optional(),
  subdomain: z.string().optional(),
  configuration: SiteConfigurationSchema.partial().optional(),
  status: SiteStatusSchema.optional(),
});

// Publish site schema
export const PublishSiteRequestSchema = z.object({
  domain: z.string().optional(),
  customCode: CustomCodeSettingsSchema.optional(),
});

export const PublishSiteResponseSchema = z.object({
  siteId: z.string().uuid(),
  url: z.string().url(),
  deploymentId: z.string(),
  publishedAt: z.date(),
  manifest: SiteManifestSchema,
});

// Site search and filtering
export const SiteFilterSchema = z.object({
  status: SiteStatusSchema.optional(),
  templateCategory: z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']).optional(),
  features: z.array(SiteFeatureSchema).optional(),
  search: z.string().optional(),
});

export const SiteListRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  filters: SiteFilterSchema.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'publishedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Template schemas
export const CreateTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']),
  features: z.array(SiteFeatureSchema),
  previewUrl: z.string().url().optional(),
  configuration: SiteConfigurationSchema,
});

export const TemplateListRequestSchema = z.object({
  category: z.enum(['business', 'ecommerce', 'blog', 'portfolio', 'restaurant', 'landing']).optional(),
  features: z.array(SiteFeatureSchema).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

// Type exports
export type SiteStatus = z.infer<typeof SiteStatusSchema>;
export type SiteFeature = z.infer<typeof SiteFeatureSchema>;
export type VoiceFeature = z.infer<typeof VoiceFeatureSchema>;
export type Site = z.infer<typeof SiteSchema>;
export type SiteTemplate = z.infer<typeof SiteTemplateSchema>;
export type SiteConfiguration = z.infer<typeof SiteConfigurationSchema>;
export type SiteTheme = z.infer<typeof SiteThemeSchema>;
export type SeoSettings = z.infer<typeof SeoSettingsSchema>;
export type VoiceAgentConfig = z.infer<typeof VoiceAgentConfigSchema>;
export type SiteIntegrations = z.infer<typeof SiteIntegrationsSchema>;
export type CustomCodeSettings = z.infer<typeof CustomCodeSettingsSchema>;
export type SiteStats = z.infer<typeof SiteStatsSchema>;
export type SiteAction = z.infer<typeof SiteActionSchema>;
export type ActionParameter = z.infer<typeof ActionParameterSchema>;
export type SiteMetadata = z.infer<typeof SiteMetadataSchema>;
export type SiteManifest = z.infer<typeof SiteManifestSchema>;
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;
export type PublishSiteRequest = z.infer<typeof PublishSiteRequestSchema>;
export type PublishSiteResponse = z.infer<typeof PublishSiteResponseSchema>;
export type SiteFilter = z.infer<typeof SiteFilterSchema>;
export type SiteListRequest = z.infer<typeof SiteListRequestSchema>;
export type CreateTemplateRequest = z.infer<typeof CreateTemplateRequestSchema>;
export type TemplateListRequest = z.infer<typeof TemplateListRequestSchema>;
