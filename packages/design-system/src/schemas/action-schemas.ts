import { z } from 'zod'

/**
 * Action parameter schema for defining action inputs
 */
export const ActionParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  required: z.boolean().default(false),
  description: z.string().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
  }).optional(),
  defaultValue: z.any().optional(),
})

export type ActionParameter = z.infer<typeof ActionParameterSchema>

/**
 * Component action schema defining what actions a component can perform
 */
export const ComponentActionSchema = z.object({
  name: z.string(), // e.g., "cart.add", "booking.create", "navigation.goto"
  description: z.string(),
  category: z.enum(['navigation', 'commerce', 'form', 'content', 'media', 'social', 'custom']),
  
  // Parameters this action accepts
  parameters: z.array(ActionParameterSchema).optional(),
  
  // Selector information for DOM manipulation
  selector: z.string().optional(), // CSS selector for target element
  selectorType: z.enum(['id', 'class', 'attribute', 'xpath']).optional(),
  
  // Event information
  event: z.enum(['click', 'submit', 'change', 'focus', 'hover', 'scroll']).default('click'),
  
  // Confirmation requirements
  requiresConfirmation: z.boolean().default(false),
  confirmationMessage: z.string().optional(),
  
  // Security constraints
  allowedOrigins: z.array(z.string()).optional(), // Which origins can trigger this action
  rateLimit: z.object({
    maxCalls: z.number(),
    windowMs: z.number(),
  }).optional(),
  
  // Success/error handling
  successMessage: z.string().optional(),
  errorMessage: z.string().optional(),
  redirectUrl: z.string().optional(),
})

export type ComponentAction = z.infer<typeof ComponentActionSchema>

/**
 * Action manifest schema - complete list of available actions for a site
 */
export const ActionManifestSchema = z.object({
  version: z.string().default('1.0.0'),
  lastUpdated: z.string(), // ISO 8601 timestamp
  baseUrl: z.string().url(),
  
  // Global action settings
  security: z.object({
    csrfProtection: z.boolean().default(true),
    allowedOrigins: z.array(z.string()),
    requireAuthentication: z.array(z.string()).optional(), // Action names requiring auth
  }),
  
  // Available actions grouped by component
  actions: z.record(z.array(ComponentActionSchema)), // componentName -> actions[]
  
  // Action categories and their descriptions
  categories: z.record(z.string()).optional(),
})

export type ActionManifest = z.infer<typeof ActionManifestSchema>

/**
 * Predefined action templates for common components
 */
export const COMMON_ACTIONS: Record<string, ComponentAction[]> = {
  'ProductCard': [
    {
      name: 'product.view',
      description: 'View product details',
      category: 'navigation',
      selector: '[data-action="product.view"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
      parameters: [
        { name: 'productId', type: 'string', required: true, description: 'Product identifier' }
      ],
    },
    {
      name: 'cart.add',
      description: 'Add product to shopping cart',
      category: 'commerce',
      selector: '[data-action="cart.add"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
      parameters: [
        { name: 'productId', type: 'string', required: true, description: 'Product identifier' },
        { name: 'quantity', type: 'number', required: false, defaultValue: 1, description: 'Quantity to add' },
        { name: 'variant', type: 'string', required: false, description: 'Product variant (size, color, etc.)' }
      ],
      successMessage: 'Product added to cart',
      errorMessage: 'Failed to add product to cart',
    },
    {
      name: 'wishlist.add',
      description: 'Add product to wishlist',
      category: 'commerce',
      selector: '[data-action="wishlist.add"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
      parameters: [
        { name: 'productId', type: 'string', required: true, description: 'Product identifier' }
      ],
      successMessage: 'Product added to wishlist',
    }
  ],
  
  'EventCard': [
    {
      name: 'event.view',
      description: 'View event details',
      category: 'navigation',
      selector: '[data-action="event.view"]',
      event: 'click',
      requiresConfirmation: false,
      selectorType: 'attribute',
      parameters: [
        { name: 'eventId', type: 'string', required: true, description: 'Event identifier' }
      ],
    },
    {
      name: 'event.register',
      description: 'Register for event',
      category: 'form',
      selector: '[data-action="event.register"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: true,
      confirmationMessage: 'Are you sure you want to register for this event?',
      parameters: [
        { name: 'eventId', type: 'string', required: true, description: 'Event identifier' },
        { name: 'attendeeCount', type: 'number', required: false, defaultValue: 1, description: 'Number of attendees' }
      ],
      successMessage: 'Successfully registered for event',
      errorMessage: 'Registration failed',
    },
    {
      name: 'calendar.add',
      description: 'Add event to calendar',
      category: 'content',
      selector: '[data-action="calendar.add"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
      parameters: [
        { name: 'eventId', type: 'string', required: true, description: 'Event identifier' }
      ],
    }
  ],
  
  'ContactForm': [
    {
      name: 'contact.submit',
      description: 'Submit contact form',
      category: 'form',
      selector: '[data-action="contact.submit"]',
      selectorType: 'attribute',
      event: 'submit',
      requiresConfirmation: false,
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Contact name' },
        { name: 'email', type: 'string', required: true, description: 'Contact email' },
        { name: 'message', type: 'string', required: true, description: 'Contact message' },
        { name: 'phone', type: 'string', required: false, description: 'Contact phone number' },
        { name: 'subject', type: 'string', required: false, description: 'Message subject' }
      ],
      successMessage: 'Message sent successfully',
      errorMessage: 'Failed to send message',
    }
  ],
  
  'SearchForm': [
    {
      name: 'search.submit',
      description: 'Perform search',
      category: 'content',
      selector: '[data-action="search.submit"]',
      selectorType: 'attribute',
      event: 'submit',
      requiresConfirmation: false,
      parameters: [
        { name: 'query', type: 'string', required: true, description: 'Search query' },
        { name: 'category', type: 'string', required: false, description: 'Search category filter' },
        { name: 'sortBy', type: 'string', required: false, description: 'Sort results by field' }
      ],
    }
  ],
  
  'Navigation': [
    {
      name: 'navigation.goto',
      description: 'Navigate to a page',
      category: 'navigation',
      selector: '[data-action="navigation.goto"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
      parameters: [
        { name: 'url', type: 'string', required: true, description: 'Target URL' },
        { name: 'openInNewTab', type: 'boolean', required: false, defaultValue: false, description: 'Open in new tab' }
      ],
    },
    {
      name: 'navigation.back',
      description: 'Go back to previous page',
      category: 'navigation',
      selector: '[data-action="navigation.back"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
    },
    {
      name: 'navigation.home',
      description: 'Go to home page',
      category: 'navigation',
      selector: '[data-action="navigation.home"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: false,
    }
  ],
  
  'BookingForm': [
    {
      name: 'booking.create',
      description: 'Create a new booking',
      category: 'form',
      selector: '[data-action="booking.create"]',
      selectorType: 'attribute',
      event: 'submit',
      requiresConfirmation: true,
      confirmationMessage: 'Confirm your booking details',
      parameters: [
        { name: 'serviceId', type: 'string', required: true, description: 'Service identifier' },
        { name: 'date', type: 'string', required: true, description: 'Booking date (ISO 8601)' },
        { name: 'time', type: 'string', required: true, description: 'Booking time (HH:mm)' },
        { name: 'duration', type: 'number', required: false, description: 'Booking duration in minutes' },
        { name: 'attendeeCount', type: 'number', required: false, defaultValue: 1, description: 'Number of attendees' },
        { name: 'notes', type: 'string', required: false, description: 'Additional booking notes' }
      ],
      successMessage: 'Booking confirmed',
      errorMessage: 'Booking failed',
    },
    {
      name: 'booking.cancel',
      description: 'Cancel an existing booking',
      category: 'form',
      selector: '[data-action="booking.cancel"]',
      selectorType: 'attribute',
      event: 'click',
      requiresConfirmation: true,
      confirmationMessage: 'Are you sure you want to cancel this booking?',
      parameters: [
        { name: 'bookingId', type: 'string', required: true, description: 'Booking identifier' }
      ],
      successMessage: 'Booking cancelled',
      errorMessage: 'Failed to cancel booking',
    }
  ]
}

/**
 * Helper function to get actions for a component
 */
export function getComponentActions(componentName: string): ComponentAction[] {
  return COMMON_ACTIONS[componentName] || []
}

/**
 * Helper function to generate action manifest
 */
export function generateActionManifest(
  components: string[],
  baseUrl: string,
  security?: Partial<ActionManifest['security']>
): ActionManifest {
  const actions: Record<string, ComponentAction[]> = {}
  
  for (const component of components) {
    const componentActions = getComponentActions(component)
    if (componentActions.length > 0) {
      actions[component] = componentActions
    }
  }
  
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    baseUrl,
    security: {
      csrfProtection: true,
      allowedOrigins: [baseUrl],
      ...security,
    },
    actions,
    categories: {
      navigation: 'Navigation and routing actions',
      commerce: 'E-commerce and shopping actions',
      form: 'Form submission and data entry actions',
      content: 'Content management and search actions',
      media: 'Media playback and interaction actions',
      social: 'Social sharing and interaction actions',
      custom: 'Custom business logic actions',
    },
  }
}

/**
 * Helper function to validate action parameters
 */
export function validateActionParameters(
  action: ComponentAction,
  parameters: Record<string, any>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!action.parameters) {
    return { isValid: true, errors: [] }
  }
  
  for (const param of action.parameters) {
    const value = parameters[param.name]
    
    // Check required parameters
    if (param.required && (value === undefined || value === null)) {
      errors.push(`Required parameter '${param.name}' is missing`)
      continue
    }
    
    // Skip validation if parameter is not provided and not required
    if (value === undefined || value === null) {
      continue
    }
    
    // Type validation
    const expectedType = param.type
    const actualType = Array.isArray(value) ? 'array' : typeof value
    
    if (expectedType !== actualType) {
      errors.push(`Parameter '${param.name}' should be of type '${expectedType}', got '${actualType}'`)
    }
    
    // Additional validation rules
    if (param.validation) {
      const validation = param.validation
      
      if (validation.min !== undefined && value < validation.min) {
        errors.push(`Parameter '${param.name}' should be at least ${validation.min}`)
      }
      
      if (validation.max !== undefined && value > validation.max) {
        errors.push(`Parameter '${param.name}' should be at most ${validation.max}`)
      }
      
      if (validation.pattern && typeof value === 'string') {
        const regex = new RegExp(validation.pattern)
        if (!regex.test(value)) {
          errors.push(`Parameter '${param.name}' does not match required pattern`)
        }
      }
      
      if (validation.enum && !validation.enum.includes(value)) {
        errors.push(`Parameter '${param.name}' should be one of: ${validation.enum.join(', ')}`)
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  }
}