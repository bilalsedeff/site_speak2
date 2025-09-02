import { ComponentMetadata, StructuredDataComponent } from '../schemas/component-schemas'
import { getAriaRequirements, ComponentAria } from '../schemas/aria-schemas'
import { generateJsonLd } from '../schemas/jsonld-schemas'
import { getComponentActions, ComponentAction } from '../schemas/action-schemas'

/**
 * Registry to store component metadata for the site contract system
 */
class ComponentMetadataRegistry {
  private components = new Map<string, ComponentMetadata>()
  private structuredDataComponents = new Map<string, StructuredDataComponent>()

  /**
   * Register a component's metadata
   */
  register(metadata: ComponentMetadata) {
    this.components.set(metadata.name, metadata)
    
    // If component has structured data capabilities, register it separately
    if ('jsonldTemplates' in metadata) {
      this.structuredDataComponents.set(metadata.name, metadata as StructuredDataComponent)
    }
  }

  /**
   * Get metadata for a component
   */
  get(componentName: string): ComponentMetadata | null {
    return this.components.get(componentName) || null
  }

  /**
   * Get all registered components
   */
  getAll(): ComponentMetadata[] {
    return Array.from(this.components.values())
  }

  /**
   * Get components by category
   */
  getByCategory(category: ComponentMetadata['category']): ComponentMetadata[] {
    return this.getAll().filter(component => component.category === category)
  }

  /**
   * Get components that can emit structured data
   */
  getStructuredDataComponents(): StructuredDataComponent[] {
    return Array.from(this.structuredDataComponents.values())
  }

  /**
   * Generate complete site contract for all registered components
   */
  generateSiteContract(baseUrl: string) {
    const allComponents = this.getAll()
    
    // Generate action manifest
    const componentNames = allComponents.map(c => c.name)
    const actions: Record<string, ComponentAction[]> = {}
    
    componentNames.forEach(name => {
      const componentActions = getComponentActions(name)
      if (componentActions.length > 0) {
        actions[name] = componentActions
      }
    })

    // Generate ARIA audit report
    const ariaAudit: Record<string, ComponentAria | null> = {}
    componentNames.forEach(name => {
      ariaAudit[name] = getAriaRequirements(name)
    })

    // Generate JSON-LD templates
    const jsonldTemplates: Record<string, any> = {}
    this.getStructuredDataComponents().forEach(component => {
      if (component.jsonldTemplates) {
        jsonldTemplates[component.name] = component.jsonldTemplates
      }
    })

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      baseUrl,
      components: Object.fromEntries(this.components),
      actions: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        baseUrl,
        security: {
          csrfProtection: true,
          allowedOrigins: [baseUrl],
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
      },
      aria: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        requirements: ariaAudit,
        landmarks: this.extractLandmarks(),
      },
      jsonld: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        templates: jsonldTemplates,
      },
    }
  }

  /**
   * Extract landmark requirements from registered components
   */
  private extractLandmarks(): Record<string, string[]> {
    const landmarks: Record<string, string[]> = {}
    
    this.getAll().forEach(component => {
      const ariaReqs = getAriaRequirements(component.name)
      if (ariaReqs?.landmarkRole) {
        if (!landmarks[ariaReqs.landmarkRole]) {
          landmarks[ariaReqs.landmarkRole] = []
        }
        landmarks[ariaReqs.landmarkRole].push(component.name)
      }
    })
    
    return landmarks
  }

  /**
   * Generate JSON-LD for a specific component instance
   */
  generateComponentJsonLd(componentName: string, props: Record<string, any>): Record<string, any> | null {
    return generateJsonLd(componentName, props)
  }

  /**
   * Validate component props against schema
   */
  validateProps(componentName: string, props: Record<string, any>): { isValid: boolean; errors: string[] } {
    const metadata = this.get(componentName)
    if (!metadata) {
      return { isValid: false, errors: [`Component '${componentName}' not found in registry`] }
    }

    const errors: string[] = []

    // Check required props
    if (metadata.requiredProps) {
      metadata.requiredProps.forEach(propName => {
        if (!(propName in props)) {
          errors.push(`Missing required prop: ${propName}`)
        }
      })
    }

    // Additional validation could be added here using the props schema
    // For now, we'll rely on Zod validation at the component level

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Clear all registered components (useful for testing)
   */
  clear() {
    this.components.clear()
    this.structuredDataComponents.clear()
  }
}

// Global registry instance
export const componentRegistry = new ComponentMetadataRegistry()

/**
 * Decorator function to auto-register components
 */
export function withMetadata(metadata: ComponentMetadata) {
  return function<T extends React.ComponentType<any>>(Component: T): T {
    // Register the component
    componentRegistry.register(metadata)
    
    // Add metadata to component for runtime access
    ;(Component as any).metadata = metadata
    
    return Component
  }
}

/**
 * Hook to get component metadata at runtime
 */
export function useComponentMetadata(componentName: string): ComponentMetadata | null {
  return componentRegistry.get(componentName)
}

/**
 * Helper function to generate data attributes for actions
 */
export function generateActionAttributes(
  componentName: string,
  actionName?: string,
  parameters?: Record<string, any>
): Record<string, string> {
  const actions = getComponentActions(componentName)
  const action = actionName ? actions.find(a => a.name === actionName) : actions[0]
  
  if (!action) {
    return {}
  }

  const attrs: Record<string, string> = {
    'data-action': action.name,
  }

  // Add parameters as data attributes
  if (parameters) {
    Object.entries(parameters).forEach(([key, value]) => {
      attrs[`data-action-${key}`] = String(value)
    })
  }

  return attrs
}

/**
 * Helper to generate ARIA attributes based on component requirements
 */
export function generateAriaAttributes(
  componentName: string,
  customAttributes?: Record<string, any>
): Record<string, any> {
  const requirements = getAriaRequirements(componentName)
  if (!requirements) return customAttributes || {}

  const attrs: Record<string, any> = { ...customAttributes }

  // Add required role
  if (requirements.role) {
    attrs.role = requirements.role
  }

  // Add landmark role
  if (requirements.landmarkRole) {
    attrs.role = requirements.landmarkRole
  }

  // Add live region if specified
  if (requirements.liveRegion && requirements.liveRegion !== 'off') {
    attrs['aria-live'] = requirements.liveRegion
  }

  // Ensure focusable elements have proper tabIndex
  if (requirements.focusable && !attrs.tabIndex && attrs.tabIndex !== 0) {
    attrs.tabIndex = 0
  }

  return attrs
}