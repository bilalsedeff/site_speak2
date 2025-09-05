import type { ComponentInstance, TemplateValidation } from '../types/editor'
import type { ComponentMetadata } from '@sitespeak/design-system'

/**
 * Template Linter for validating editor templates
 * Ensures compliance with accessibility, SEO, and Site Contract standards
 */
export class TemplateLinter {
  private rules: LintRule[]

  constructor() {
    this.rules = [
      new AccessibilityRule(),
      new SEORule(),
      new SiteContractRule(),
      new ComponentStructureRule()
    ]
  }

  /**
   * Lint a template and return validation errors/warnings
   */
  async lintTemplate(instances: ComponentInstance[]): Promise<TemplateValidation[]> {
    const validations: TemplateValidation[] = []

    for (const rule of this.rules) {
      const ruleResults = await rule.validate(instances)
      validations.push(...ruleResults)
    }

    return validations
  }

  /**
   * Lint a specific component instance
   */
  async lintComponent(instance: ComponentInstance): Promise<TemplateValidation[]> {
    return this.lintTemplate([instance])
  }

  /**
   * Get available linting rules
   */
  getRules(): string[] {
    return this.rules.map(rule => rule.name)
  }

  /**
   * Add custom linting rule
   */
  addRule(rule: LintRule): void {
    this.rules.push(rule)
  }
}

// Base interface for linting rules
interface LintRule {
  name: string
  validate(instances: ComponentInstance[]): Promise<TemplateValidation[]>
}

// Accessibility linting rule
class AccessibilityRule implements LintRule {
  name = 'accessibility'

  async validate(instances: ComponentInstance[]): Promise<TemplateValidation[]> {
    const validations: TemplateValidation[] = []

    for (const instance of instances) {
      // Check for missing alt text on images
      if (instance.componentName === 'Image' && !instance.props['alt']) {
        validations.push({
          severity: 'error',
          component: instance.componentName,
          instanceId: instance.id,
          property: 'alt',
          message: 'Image components must have alt text for accessibility',
          recommendation: 'Add descriptive alt text to the image props',
          rule: this.name
        })
      }

      // Check for missing aria-labels on interactive elements
      if (['Button', 'Link'].includes(instance.componentName) && 
          !instance.props['ariaLabel'] && !instance.props['children']) {
        validations.push({
          severity: 'warning',
          component: instance.componentName,
          instanceId: instance.id,
          property: 'ariaLabel',
          message: 'Interactive elements should have accessible labels',
          recommendation: 'Add aria-label or text content for screen readers',
          rule: this.name
        })
      }
    }

    return validations
  }
}

// SEO linting rule
class SEORule implements LintRule {
  name = 'seo'

  async validate(instances: ComponentInstance[]): Promise<TemplateValidation[]> {
    const validations: TemplateValidation[] = []
    const headings = instances.filter(i => i.componentName.startsWith('H'))
    
    // Check for H1 presence
    const hasH1 = headings.some(h => h.componentName === 'H1')
    if (!hasH1) {
      validations.push({
        severity: 'warning',
        component: 'Template',
        instanceId: 'template-root',
        message: 'Template should have an H1 heading for SEO',
        recommendation: 'Add an H1 component to define the main topic',
        rule: this.name
      })
    }

    // Check heading hierarchy
    const h1Count = headings.filter(h => h.componentName === 'H1').length
    if (h1Count > 1) {
      validations.push({
        severity: 'error',
        component: 'H1',
        instanceId: 'multiple-h1',
        message: 'Template should have only one H1 heading',
        recommendation: 'Use H2-H6 for secondary headings',
        rule: this.name
      })
    }

    return validations
  }
}

// Site Contract linting rule
class SiteContractRule implements LintRule {
  name = 'site-contract'

  async validate(instances: ComponentInstance[]): Promise<TemplateValidation[]> {
    const validations: TemplateValidation[] = []

    for (const instance of instances) {
      // Check for missing structured data on commerce components
      if (['Product', 'Service', 'Event'].includes(instance.componentName)) {
        if (!(instance.metadata as any).jsonld) {
          validations.push({
            severity: 'warning',
            component: instance.componentName,
            instanceId: instance.id,
            message: `${instance.componentName} component should include structured data`,
            recommendation: 'Configure JSON-LD metadata for better search visibility',
            rule: this.name
          })
        }
      }

      // Check for missing action definitions on interactive components
      if (['Button', 'Form'].includes(instance.componentName)) {
        if (!(instance.metadata as any).actions || (instance.metadata as any).actions.length === 0) {
          validations.push({
            severity: 'info',
            component: instance.componentName,
            instanceId: instance.id,
            message: 'Interactive component could define voice actions',
            recommendation: 'Add action metadata to enable voice interaction',
            rule: this.name
          })
        }
      }
    }

    return validations
  }
}

// Component structure linting rule
class ComponentStructureRule implements LintRule {
  name = 'component-structure'

  async validate(instances: ComponentInstance[]): Promise<TemplateValidation[]> {
    const validations: TemplateValidation[] = []

    for (const instance of instances) {
      // Check for required props
      const requiredProps = this.getRequiredProps(instance.metadata)
      for (const propName of requiredProps) {
        if (!(propName in instance.props) || instance.props[propName] === null || instance.props[propName] === undefined) {
          validations.push({
            severity: 'error',
            component: instance.componentName,
            instanceId: instance.id,
            property: propName,
            message: `Required prop "${propName}" is missing`,
            recommendation: `Set the "${propName}" property on this component`,
            rule: this.name
          })
        }
      }

      // Check for overlapping components
      if (this.hasOverlappingPosition(instance, instances)) {
        validations.push({
          severity: 'warning',
          component: instance.componentName,
          instanceId: instance.id,
          message: 'Component overlaps with another component',
          recommendation: 'Adjust position or size to avoid overlap',
          rule: this.name
        })
      }
    }

    return validations
  }

  private getRequiredProps(metadata: ComponentMetadata): string[] {
    // Extract required props from component metadata
    if (metadata.props) {
      return Object.entries(metadata.props)
        .filter(([_key, config]) => config.required)
        .map(([key]) => key)
    }
    return []
  }

  private hasOverlappingPosition(instance: ComponentInstance, allInstances: ComponentInstance[]): boolean {
    const others = allInstances.filter(i => i.id !== instance.id)
    
    for (const other of others) {
      const overlaps = (
        instance.position.x < other.position.x + other.size.width &&
        instance.position.x + instance.size.width > other.position.x &&
        instance.position.y < other.position.y + other.size.height &&
        instance.position.y + instance.size.height > other.position.y
      )
      
      if (overlaps) {
        return true
      }
    }
    
    return false
  }
}

// Default export
export default TemplateLinter