import {
  JsonLdEmitter,
  SitemapEmitter,
  ActionsEmitter,
  type ComponentContract,
  type ComponentAriaContract,
  type ComponentJsonLdContract,
  type ComponentActionContract,
  type JsonLdReport,
  type SitemapReport,
  type ActionManifest
} from '@sitespeak/site-contract'
import { componentRegistry } from '@sitespeak/design-system'
import type { ComponentInstance } from '../types/editor'

export interface ContractGenerationOptions {
  baseUrl: string
  strict?: boolean
  minify?: boolean
}

export interface GeneratedContract {
  jsonLd: JsonLdReport
  actions: ActionManifest
  sitemap: SitemapReport
  generatedAt: string
}

/**
 * Service for generating site contracts from editor components
 */
export class ContractGenerationService {
  private jsonLdEmitter: JsonLdEmitter
  private sitemapEmitter: SitemapEmitter
  private actionsEmitter: ActionsEmitter

  constructor(options: ContractGenerationOptions) {
    const emitterOptions = options.strict !== undefined ? { strict: options.strict } : {}
    this.jsonLdEmitter = new JsonLdEmitter(options.baseUrl, emitterOptions)
    this.sitemapEmitter = new SitemapEmitter(options.baseUrl, emitterOptions)
    this.actionsEmitter = new ActionsEmitter(options.baseUrl, emitterOptions)
  }

  /**
   * Generate complete site contract from editor instances
   */
  async generateContract(
    instances: ComponentInstance[],
    pageName: string = 'index',
    pageUrl: string = '/'
  ): Promise<GeneratedContract> {
    // Convert editor instances to component contracts
    const componentContracts = this.buildComponentContracts(instances)

    // Generate HTML preview for the page
    const htmlContent = this.generateHTMLFromInstances(instances, pageName)
    const pages = { [pageUrl]: htmlContent }

    // Generate contract sections
    const [jsonLd, actions, sitemap] = await Promise.all([
      this.jsonLdEmitter.generateJsonLdReport(pages, componentContracts),
      this.actionsEmitter.generateActionManifest(pages, componentContracts),
      this.sitemapEmitter.generateSitemapReport(
        pages,
        componentContracts,
        { [pageUrl]: { lastModified: new Date(), priority: 1.0, changeFreq: 'daily' } }
      )
    ])

    return {
      jsonLd,
      actions,
      sitemap,
      generatedAt: new Date().toISOString()
    }
  }

  /**
   * Convert editor instances to component contracts for emitters
   */
  private buildComponentContracts(instances: ComponentInstance[]): Record<string, ComponentContract> {
    const contracts: Record<string, ComponentContract> = {}

    // Get unique component names
    const componentNames = [...new Set(instances.map(instance => instance.componentName))]

    for (const componentName of componentNames) {
      // Get metadata from design system registry
      const metadata = componentRegistry.get(componentName)
      if (!metadata) {
        console.warn(`Component metadata not found for: ${componentName}`)
        continue
      }

      // Build contract for this component
      contracts[componentName] = {
        name: componentName,
        version: metadata.version,
        category: metadata.category,
        instances: [], // Will be populated by emitters
        metadata: {
          props: metadata.props || {},
          aria: this.getAriaRequirements(componentName),
          ...(this.supportsJsonLd(componentName) && {
            jsonld: this.getJsonLdContract(componentName)
          }),
          ...(this.getComponentActionContracts(componentName).length > 0 && {
            actions: this.getComponentActionContracts(componentName)
          })
        }
      }
    }

    return contracts
  }

  /**
   * Generate HTML representation of editor instances for contract analysis
   */
  private generateHTMLFromInstances(instances: ComponentInstance[], pageTitle: string): string {
    const bodyContent = instances.map(instance => this.renderInstanceToHTML(instance)).join('\n  ')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <meta name="description" content="Generated page from SiteSpeak editor">
</head>
<body>
  ${bodyContent}
</body>
</html>`
  }

  /**
   * Render a single component instance to HTML
   */
  private renderInstanceToHTML(instance: ComponentInstance): string {
    const { componentName, props, id } = instance

    // Generate data attributes for contract analysis
    const dataAttributes = [
      `data-component="${componentName}"`,
      `data-instance-id="${id}"`,
      `data-testid="${componentName.toLowerCase()}"`
    ]

    // Add action data attributes if component has actions
    const actions = this.getComponentActionContracts(componentName)
    if (actions.length > 0) {
      dataAttributes.push(`data-action="${actions[0]?.name || `${componentName.toLowerCase()}.interact`}"`)
    }

    // Generate component-specific HTML based on type
    switch (componentName) {
      case 'Button':
        return `<button ${dataAttributes.join(' ')}
          type="${props['type'] || 'button'}"
          class="${this.getComponentClasses(componentName, props)}"
          ${props['disabled'] ? 'disabled' : ''}
          ${props['onClick'] ? `onclick="${props['onClick']}"` : ''}
        >
          ${props['children'] || 'Button'}
        </button>`

      case 'Card':
        return `<div ${dataAttributes.join(' ')}
          class="${this.getComponentClasses(componentName, props)}"
          ${props['itemType'] ? `itemtype="${props['itemType']}"` : ''}
          ${props['itemScope'] ? 'itemscope' : ''}
        >
          ${props['title'] ? `<h3 ${props['itemProp'] === 'name' ? 'itemprop="name"' : ''}>${props['title']}</h3>` : ''}
          ${props['description'] ? `<p ${props['itemProp'] === 'description' ? 'itemprop="description"' : ''}>${props['description']}</p>` : ''}
          ${props['children'] || ''}
        </div>`

      case 'VoiceWidget':
        return `<div ${dataAttributes.join(' ')}
          class="voice-widget ${this.getComponentClasses(componentName, props)}"
          data-position="${props['position'] || 'bottom-right'}"
          data-theme="${props['theme'] || 'auto'}"
          data-size="${props['size'] || 'md'}"
          role="button"
          aria-label="Voice Assistant"
          tabindex="0"
        >
          <span class="voice-widget-icon">🎤</span>
        </div>`

      case 'Text':
        return `<p ${dataAttributes.join(' ')}
          class="${this.getComponentClasses(componentName, props)}"
        >
          ${props['text'] || props['children'] || 'Sample text'}
        </p>`

      case 'Image':
        return `<img ${dataAttributes.join(' ')}
          src="${props['src'] || 'https://via.placeholder.com/300x200'}"
          alt="${props['alt'] || ''}"
          class="${this.getComponentClasses(componentName, props)}"
          ${props['width'] ? `width="${props['width']}"` : ''}
          ${props['height'] ? `height="${props['height']}"` : ''}
        />`

      case 'Container':
        return `<div ${dataAttributes.join(' ')}
          class="${this.getComponentClasses(componentName, props)}"
        >
          ${props['children'] || ''}
        </div>`

      default:
        // Generic component rendering
        return `<div ${dataAttributes.join(' ')}
          class="${this.getComponentClasses(componentName, props)}"
        >
          ${props['children'] || props['text'] || componentName}
        </div>`
    }
  }

  /**
   * Generate CSS classes for a component based on its props
   */
  private getComponentClasses(componentName: string, props: Record<string, any>): string {
    const classes = [componentName.toLowerCase()]

    // Add variant classes
    if (props['variant']) {
      classes.push(`${componentName.toLowerCase()}--${props['variant']}`)
    }

    // Add size classes
    if (props['size']) {
      classes.push(`${componentName.toLowerCase()}--${props['size']}`)
    }

    // Add custom className
    if (props['className']) {
      classes.push(props['className'])
    }

    return classes.join(' ')
  }

  /**
   * Check if component supports JSON-LD structured data
   */
  private supportsJsonLd(componentName: string): boolean {
    // Components that can emit structured data
    const jsonLdComponents = ['Card', 'Button', 'Product', 'Event', 'Organization', 'LocalBusiness']
    return jsonLdComponents.includes(componentName)
  }

  /**
   * Get ARIA requirements for a component
   */
  private getAriaRequirements(componentName: string): ComponentAriaContract {
    // Basic ARIA requirements by component type
    const ariaMap: Record<string, ComponentAriaContract> = {
      'Button': {
        role: 'button',
        requiredAttributes: ['aria-label'],
        recommendedAttributes: ['aria-describedby'],
        keyboardNavigation: true,
        focusable: true
      },
      'VoiceWidget': {
        role: 'button',
        requiredAttributes: ['aria-label', 'aria-expanded'],
        recommendedAttributes: ['aria-controls'],
        keyboardNavigation: true,
        focusable: true
      },
      'Card': {
        role: 'article',
        requiredAttributes: [],
        recommendedAttributes: ['aria-labelledby'],
        keyboardNavigation: false,
        focusable: false
      },
      'Image': {
        requiredAttributes: ['alt'],
        recommendedAttributes: ['aria-describedby'],
        keyboardNavigation: false,
        focusable: false
      },
      'Container': {
        role: 'region',
        requiredAttributes: [],
        recommendedAttributes: ['aria-label'],
        keyboardNavigation: false,
        focusable: false
      }
    }

    return ariaMap[componentName] || {
      requiredAttributes: [],
      recommendedAttributes: [],
      keyboardNavigation: false,
      focusable: false
    }
  }

  /**
   * Get JSON-LD contract for a component
   */
  private getJsonLdContract(componentName: string): ComponentJsonLdContract {
    const jsonLdMap: Record<string, ComponentJsonLdContract> = {
      'Card': {
        schemaType: 'Article',
        template: {
          '@type': 'Article',
          '@context': 'https://schema.org',
          requiredFields: ['headline'],
          optionalFields: ['description', 'image', 'datePublished'],
          examples: []
        },
        propMapping: {
          title: 'headline',
          description: 'description',
          image: 'image'
        }
      },
      'Button': {
        schemaType: 'Action',
        template: {
          '@type': 'Action',
          '@context': 'https://schema.org',
          requiredFields: ['name'],
          optionalFields: ['description', 'url'],
          examples: []
        },
        propMapping: {
          children: 'name',
          href: 'url'
        }
      }
    }

    return jsonLdMap[componentName] || {
      schemaType: 'Thing',
      template: {
        '@type': 'Thing',
        '@context': 'https://schema.org',
        requiredFields: ['name'],
        optionalFields: ['description'],
        examples: []
      },
      propMapping: {}
    }
  }

  /**
   * Get available action contracts for a component
   */
  private getComponentActionContracts(componentName: string): ComponentActionContract[] {
    // Component action mappings
    const actionMap: Record<string, ComponentActionContract[]> = {
      'Button': [
        {
          name: 'button.click',
          description: 'Click the button',
          category: 'interaction',
          selector: 'button',
          event: 'click',
          parameters: [],
          security: {
            requiresConfirmation: false,
            requiresAuthentication: false,
            allowedOrigins: []
          }
        }
      ],
      'VoiceWidget': [
        {
          name: 'voice.toggle',
          description: 'Toggle voice assistant',
          category: 'voice',
          selector: '.voice-widget',
          event: 'click',
          parameters: [],
          security: {
            requiresConfirmation: false,
            requiresAuthentication: false,
            allowedOrigins: []
          }
        }
      ],
      'Card': [
        {
          name: 'card.select',
          description: 'Select this card',
          category: 'interaction',
          selector: '[data-component="Card"]',
          event: 'click',
          parameters: [],
          security: {
            requiresConfirmation: false,
            requiresAuthentication: false,
            allowedOrigins: []
          }
        }
      ]
    }

    return actionMap[componentName] || []
  }

  /**
   * Update base URL for all emitters
   */
  updateBaseUrl(baseUrl: string): void {
    this.jsonLdEmitter = new JsonLdEmitter(baseUrl)
    this.sitemapEmitter = new SitemapEmitter(baseUrl)
    this.actionsEmitter = new ActionsEmitter(baseUrl)
  }

  /**
   * Generate just JSON-LD for quick preview updates
   */
  async generateJsonLdOnly(
    instances: ComponentInstance[],
    pageUrl: string = '/'
  ): Promise<JsonLdReport> {
    const componentContracts = this.buildComponentContracts(instances)
    const htmlContent = this.generateHTMLFromInstances(instances, 'Preview')
    const pages = { [pageUrl]: htmlContent }

    return this.jsonLdEmitter.generateJsonLdReport(pages, componentContracts)
  }

  /**
   * Generate just actions manifest for quick preview updates
   */
  async generateActionsOnly(
    instances: ComponentInstance[],
    pageUrl: string = '/'
  ): Promise<ActionManifest> {
    const componentContracts = this.buildComponentContracts(instances)
    const htmlContent = this.generateHTMLFromInstances(instances, 'Preview')
    const pages = { [pageUrl]: htmlContent }

    return this.actionsEmitter.generateActionManifest(pages, componentContracts)
  }
}