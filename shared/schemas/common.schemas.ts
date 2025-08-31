import { z } from 'zod';

// Base schemas
export const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().optional(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasNext: z.boolean().optional(),
    hasPrevious: z.boolean().optional(),
  });

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    message: z.string().optional(),
    errors: z.array(z.string()).optional(),
  });

export const ApiErrorSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string().optional(),
  correlationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});

// Language and locale schemas
export const SupportedLanguageSchema = z.enum(['en', 'tr', 'es', 'fr', 'de']);
export const SupportedLocaleSchema = z.enum(['en-US', 'tr-TR', 'es-ES', 'fr-FR', 'de-DE']);

// Tenant schemas
export const TenantLimitsSchema = z.object({
  maxSites: z.number().int().positive(),
  maxKnowledgeBaseMB: z.number().positive(),
  maxAITokensPerMonth: z.number().int().positive(),
  maxVoiceMinutesPerMonth: z.number().positive(),
});

export const TenantSettingsSchema = z.object({
  defaultLanguage: SupportedLanguageSchema,
  defaultLocale: SupportedLocaleSchema,
  allowedDomains: z.array(z.string().url()).default([]),
  brandingEnabled: z.boolean().default(false),
});

export const TenantSchema = BaseEntitySchema.extend({
  name: z.string().min(1).max(100),
  domain: z.string().url().optional(),
  plan: z.enum(['free', 'basic', 'pro', 'enterprise']),
  settings: TenantSettingsSchema,
  limits: TenantLimitsSchema,
});

// Validation helpers
export const UUIDSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const URLSchema = z.string().url();
export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const ColorSchema = z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);

// Common validation schemas
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(1000),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
  filters: z.record(z.any()).optional(),
});

export const DateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
}).refine(data => data.start <= data.end, {
  message: "Start date must be before or equal to end date",
  path: ["end"],
});

export const FileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().min(1),
  size: z.number().int().positive().max(50 * 1024 * 1024), // 50MB max
  buffer: z.instanceof(Buffer),
});

// Environment validation
export const EnvironmentSchema = z.enum(['development', 'staging', 'production', 'test']);

// Request context schema
export const RequestContextSchema = z.object({
  correlationId: UUIDSchema,
  tenantId: UUIDSchema.optional(),
  userId: UUIDSchema.optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
  locale: SupportedLocaleSchema.optional(),
  timestamp: z.date().default(() => new Date()),
});