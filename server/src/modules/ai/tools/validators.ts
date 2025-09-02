/**
 * AI Tools Validation Schemas
 * 
 * Provides Zod schemas for all tool parameters and converts them to 
 * JSON Schema 2020-12 for OpenAI function calling compatibility.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// ==================== CORE SCALARS ====================

export const UrlSchema = z.string().url().describe('Valid URL with protocol');
export const PathSchema = z.string().regex(/^\//, 'Path must start with /').describe('URL path starting with /');
export const CssSelectorSchema = z.string().min(1).describe('Valid CSS selector');
export const AriaRoleSchema = z.enum(['navigation', 'main', 'search', 'contentinfo', 'banner', 'complementary']).describe('ARIA landmark role');
export const CurrencyCodeSchema = z.string().length(3).describe('ISO 4217 currency code');
export const LocaleSchema = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).describe('BCP-47 locale code (e.g., en-US, tr)');
export const EmailSchema = z.string().email().describe('Valid email address');
export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/).describe('E.164 phone number format');

// ==================== QUANTITY & MONEY ====================

export const QuantitySchema = z.number().int().min(1).max(999).describe('Product quantity between 1-999');
export const MoneySchema = z.object({
  amount: z.number().min(0).describe('Amount in smallest currency unit (cents)'),
  currency: CurrencyCodeSchema,
}).describe('Money amount with currency');

// ==================== TIME & DATE (RFC 3339) ====================

export const Rfc3339DateTimeSchema = z.string().datetime().describe('RFC 3339 timestamp (e.g., 2025-08-24T10:00:00+03:00)');
export const Iso8601DurationSchema = z.string().regex(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/).describe('ISO 8601 duration (e.g., PT2H30M)');
export const IsoIntervalSchema = z.object({
  start: Rfc3339DateTimeSchema,
  end: Rfc3339DateTimeSchema,
}).describe('Time interval with start and end');

// ==================== COMMERCE ====================

export const ProductIdSchema = z.string().min(1).describe('Unique product identifier');
export const VariantIdSchema = z.string().min(1).describe('Product variant identifier');
export const CartIdSchema = z.string().min(1).describe('Shopping cart identifier');
export const CouponCodeSchema = z.string().min(1).max(50).describe('Coupon or discount code');
export const CheckoutTokenSchema = z.string().uuid().describe('Secure checkout session token');

// ==================== BOOKING ====================

export const ResourceIdSchema = z.string().min(1).describe('Bookable resource identifier');
export const SlotIdSchema = z.string().min(1).describe('Time slot identifier');
export const PartySizeSchema = z.number().int().min(1).max(50).describe('Number of people for booking');

// ==================== SEARCH ====================

export const QuerySchema = z.string().min(1).max(1000).describe('Search query string');
export const FilterSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).describe('Search filters');
export const SortSchema = z.object({
  field: z.string().describe('Field to sort by'),
  direction: z.enum(['asc', 'desc']).default('asc'),
}).describe('Sort configuration');
export const PageCursorSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
}).describe('Pagination cursor');

// ==================== TOOL METADATA ====================

export const SideEffectsSchema = z.enum([
  'none',
  'read-only-nav', 
  'writes.cart',
  'writes.order',
  'writes.booking',
  'writes.content'
]).describe('Side effects classification');

export const LatencyBudgetSchema = z.number().int().min(50).max(30000).default(400).describe('Maximum execution time in milliseconds');
export const IdempotencyKeySchema = z.string().uuid().describe('Idempotency key for safe retries');

// ==================== TOOL DEFINITION SCHEMA ====================

export const ToolParameterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  schema: z.record(z.unknown()).describe('JSON Schema for parameter'),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
});

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.array(ToolParameterSchema),
  sideEffects: SideEffectsSchema,
  confirmRequired: z.boolean().default(false),
  auth: z.enum(['none', 'session', 'service']).default('session'),
  latencyBudgetMs: LatencyBudgetSchema,
  idempotent: z.boolean().default(false),
  category: z.enum(['navigation', 'search', 'ecommerce', 'booking', 'communication', 'utility']),
});

// ==================== CONTEXT SCHEMAS ====================

export const ToolContextSchema = z.object({
  siteId: z.string().uuid(),
  tenantId: z.string().uuid(), 
  sessionId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  locale: LocaleSchema.default('en-US'),
  origin: UrlSchema.optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const ToolExecutionResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  executionTime: z.number().int().min(0),
  sideEffects: z.array(z.object({
    type: z.string(),
    description: z.string(),
    data: z.unknown(),
  })),
  bridgeInstructions: z.object({
    type: z.enum(['navigation', 'form_submission', 'dom_interaction', 'api_response', 'custom_action']),
    payload: z.unknown(),
  }).optional(),
});

// ==================== JSON SCHEMA EXPORT HELPER ====================

/**
 * Convert Zod schema to JSON Schema 2020-12 for OpenAI function calling
 */
export function toJsonSchema(
  zodSchema: z.ZodType, 
  options: {
    title?: string;
    description?: string;
    examples?: unknown[];
  } = {}
): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    strictUnions: true,
    definitions: {},
  }) as Record<string, unknown>;

  // Add OpenAI-specific enhancements
  if (options.title) {
    jsonSchema['title'] = options.title;
  }
  if (options.description) {
    jsonSchema['description'] = options.description;
  }
  if (options.examples) {
    jsonSchema['examples'] = options.examples;
  }

  return jsonSchema;
}

// ==================== TYPE EXPORTS ====================

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;
export type ToolParameter = z.infer<typeof ToolParameterSchema>;
export type ToolContext = z.infer<typeof ToolContextSchema>;
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;
export type SideEffects = z.infer<typeof SideEffectsSchema>;

// Extended tool definition for registry
export interface RegistryToolDefinition extends ToolDefinition {
  execute: (parameters: any, context: ToolContext) => Promise<ToolExecutionResult>;
  jsonSchema: Record<string, unknown>;
  openAIFunction: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
}

// Convenience type exports
export type Url = z.infer<typeof UrlSchema>;
export type Path = z.infer<typeof PathSchema>;
export type CssSelector = z.infer<typeof CssSelectorSchema>;
export type AriaRole = z.infer<typeof AriaRoleSchema>;
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type Locale = z.infer<typeof LocaleSchema>;
export type Quantity = z.infer<typeof QuantitySchema>;
export type Money = z.infer<typeof MoneySchema>;
export type ProductId = z.infer<typeof ProductIdSchema>;
export type VariantId = z.infer<typeof VariantIdSchema>;
export type CartId = z.infer<typeof CartIdSchema>;
export type CouponCode = z.infer<typeof CouponCodeSchema>;
export type CheckoutToken = z.infer<typeof CheckoutTokenSchema>;
export type ResourceId = z.infer<typeof ResourceIdSchema>;
export type SlotId = z.infer<typeof SlotIdSchema>;
export type PartySize = z.infer<typeof PartySizeSchema>;
export type Query = z.infer<typeof QuerySchema>;
export type Filter = z.infer<typeof FilterSchema>;
export type Sort = z.infer<typeof SortSchema>;
export type PageCursor = z.infer<typeof PageCursorSchema>;
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
