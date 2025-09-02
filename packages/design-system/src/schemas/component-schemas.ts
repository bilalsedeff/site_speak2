import { z } from 'zod'

/**
 * Base component metadata schema that all components must implement
 */
export const ComponentMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  category: z.enum(['ui', 'layout', 'form', 'navigation', 'feedback', 'content', 'voice']),
  tags: z.array(z.string()).optional(),
  
  // Props schema (using Zod for runtime validation)
  props: z.record(z.any()),
  
  // Required props for the component to function
  requiredProps: z.array(z.string()).optional(),
  
  // Default prop values
  defaultProps: z.record(z.any()).optional(),
  
  // Component variants/states
  variants: z.record(z.array(z.string())).optional(),
})

export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>

/**
 * Enhanced metadata for components that emit structured data
 */
export const StructuredDataComponentSchema = ComponentMetadataSchema.extend({
  // JSON-LD templates this component can emit
  jsonldTemplates: z.array(z.object({
    '@type': z.string(),
    template: z.record(z.any()),
    conditions: z.record(z.any()).optional(),
  })).optional(),
  
  // Schema.org entity types this component represents
  schemaTypes: z.array(z.string()).optional(),
})

export type StructuredDataComponent = z.infer<typeof StructuredDataComponentSchema>

/**
 * Button component props schema
 */
export const ButtonPropsSchema = z.object({
  variant: z.enum(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']).default('default'),
  size: z.enum(['default', 'sm', 'lg', 'icon']).default('default'),
  disabled: z.boolean().optional(),
  loading: z.boolean().optional(),
  children: z.any(),
  onClick: z.function().optional(),
  type: z.enum(['button', 'submit', 'reset']).default('button'),
  asChild: z.boolean().optional(),
})

export type ButtonProps = z.infer<typeof ButtonPropsSchema>

/**
 * Card component props schema  
 */
export const CardPropsSchema = z.object({
  variant: z.enum(['default', 'outlined', 'elevated']).default('default'),
  padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  children: z.any(),
  className: z.string().optional(),
  
  // Structured data props
  itemType: z.string().optional(), // Schema.org type
  itemProp: z.string().optional(),
  itemScope: z.boolean().optional(),
})

export type CardProps = z.infer<typeof CardPropsSchema>

/**
 * Input component props schema
 */
export const InputPropsSchema = z.object({
  type: z.enum(['text', 'email', 'password', 'number', 'tel', 'url', 'search']).default('text'),
  placeholder: z.string().optional(),
  disabled: z.boolean().optional(),
  required: z.boolean().optional(),
  error: z.string().optional(),
  helperText: z.string().optional(),
  label: z.string().optional(),
  value: z.string().optional(),
  defaultValue: z.string().optional(),
  onChange: z.function().optional(),
  className: z.string().optional(),
  
  // Accessibility props
  'aria-label': z.string().optional(),
  'aria-describedby': z.string().optional(),
  'aria-invalid': z.boolean().optional(),
})

export type InputProps = z.infer<typeof InputPropsSchema>

/**
 * Voice Widget props schema
 */
export const VoiceWidgetPropsSchema = z.object({
  // Positioning
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).default('bottom-right'),
  offset: z.object({ x: z.number(), y: z.number() }).default({ x: 24, y: 24 }),
  
  // Behavior
  autoOpen: z.boolean().default(false),
  minimizeOnClickOutside: z.boolean().default(true),
  persistent: z.boolean().default(false),
  
  // Voice settings
  language: z.string().default('en-US'),
  voice: z.string().default('alloy'),
  enableTranscription: z.boolean().default(true),
  enableSpeechSynthesis: z.boolean().default(true),
  
  // UI customization
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  size: z.enum(['sm', 'md', 'lg']).default('md'),
  showWaveform: z.boolean().default(true),
  showTranscript: z.boolean().default(true),
  
  // Event handlers
  onStart: z.function().optional(),
  onStop: z.function().optional(),
  onTranscript: z.function().optional(),
  onResponse: z.function().optional(),
  onError: z.function().optional(),
  
  // Advanced
  apiEndpoint: z.string().optional(),
  apiKey: z.string().optional(), // Should be handled server-side
  customActions: z.array(z.object({
    name: z.string(),
    handler: z.function(),
  })).optional(),
})

export type VoiceWidgetProps = z.infer<typeof VoiceWidgetPropsSchema>