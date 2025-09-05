import { JSDOM } from 'jsdom'
import { 
  generateJsonLd
} from '@sitespeak/design-system'
import { 
  JsonLdReport,
  JsonLdEntity,
  JsonLdBlock,
  JsonLdIssue,
  ComponentContract 
} from '../types/contract-types'

/**
 * JSON-LD emitter for generating structured data from components
 */
export class JsonLdEmitter {
  private baseUrl: string
  private strict: boolean

  constructor(baseUrl: string, options: { strict?: boolean } = {}) {
    this.baseUrl = baseUrl
    this.strict = options.strict ?? false
  }

  /**
   * Generate JSON-LD blocks for all pages
   */
  async generateJsonLdReport(
    pages: Record<string, string>, // pageUrl -> HTML content
    components: Record<string, ComponentContract>
  ): Promise<JsonLdReport> {
    const entities: JsonLdEntity[] = []
    const blocks: JsonLdBlock[] = []
    const validationIssues: JsonLdIssue[] = []

    let validCount = 0
    let invalidCount = 0
    let warningCount = 0

    for (const [pageUrl, htmlContent] of Object.entries(pages)) {
      const dom = new JSDOM(htmlContent)
      const document = dom.window.document

      // Extract JSON-LD entities from components on this page
      const pageEntities = await this.extractJsonLdFromPage(
        pageUrl,
        document,
        components
      )

      entities.push(...pageEntities)

      // Generate JSON-LD blocks for this page
      const pageBlocks = await this.generateJsonLdBlocks(
        pageUrl,
        pageEntities,
        document
      )

      blocks.push(...pageBlocks)

      // Validate entities
      for (const entity of pageEntities) {
        const validation = this.validateJsonLdEntity(entity)
        entity.validation = validation

        if (validation.valid) {
          validCount++
        } else {
          invalidCount++
          validationIssues.push(...validation.issues)
        }

        // Count warnings
        warningCount += validation.issues.filter(issue => issue.severity === 'warning').length
      }
    }

    // Calculate coverage statistics
    const uniquePages = new Set(entities.map(e => e.page))
    const pagesWithStructuredData = uniquePages.size
    const totalPages = Object.keys(pages).length
    const coveragePercentage = totalPages > 0 ? (pagesWithStructuredData / totalPages) * 100 : 0

    // Group entities by type
    const entitiesByType = entities.reduce((acc, entity) => {
      acc[entity['@type']] = (acc[entity['@type']] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      entities,
      validation: {
        valid: validCount,
        invalid: invalidCount,
        warnings: warningCount,
        issues: validationIssues,
      },
      coverage: {
        pagesWithStructuredData,
        totalPages,
        coveragePercentage,
        entitiesByType,
      },
      blocks,
    }
  }

  /**
   * Extract JSON-LD entities from a single page
   */
  private async extractJsonLdFromPage(
    pageUrl: string,
    document: Document,
    components: Record<string, ComponentContract>
  ): Promise<JsonLdEntity[]> {
    const entities: JsonLdEntity[] = []

    // Find all components that can emit JSON-LD
    for (const [componentName, contract] of Object.entries(components)) {
      if (!contract.metadata.jsonld) {continue}

      // Find instances of this component on the page
      const instances = this.findComponentInstances(document, contract)

      for (const instance of instances) {
        // Generate JSON-LD for this instance
        const jsonld = generateJsonLd(componentName, instance.props)
        if (jsonld) {
          entities.push({
            '@type': jsonld['@type'],
            '@id': jsonld['@id'],
            page: pageUrl,
            selector: instance.selector,
            component: componentName,
            data: jsonld,
            validation: { valid: true, issues: [] }, // Will be validated later
          })
        }
      }
    }

    // Also extract existing JSON-LD script tags
    const existingJsonLd = this.extractExistingJsonLd(document, pageUrl)
    entities.push(...existingJsonLd)

    return entities
  }

  /**
   * Find instances of a component in the DOM
   */
  private findComponentInstances(
    document: Document,
    contract: ComponentContract
  ): Array<{ selector: string; props: Record<string, any> }> {
    const instances: Array<{ selector: string; props: Record<string, any> }> = []

    // Look for elements with component-specific selectors
    const selectors = [
      `[data-component="${contract.name}"]`,
      `[data-testid="${contract.name.toLowerCase()}"]`,
      `.${contract.name.toLowerCase()}`,
      // Add more heuristics based on component patterns
    ]

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector)
      elements.forEach((element, index) => {
        const props = this.extractPropsFromElement(element)
        instances.push({
          selector: `${selector}:nth-child(${index + 1})`,
          props,
        })
      })
    }

    return instances
  }

  /**
   * Extract props from a DOM element
   */
  private extractPropsFromElement(element: Element): Record<string, any> {
    const props: Record<string, any> = {}

    // Extract from data attributes
    Array.from(element.attributes).forEach(attr => {
      if (attr.name.startsWith('data-')) {
        const propName = attr.name.substring(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        props[propName] = attr.value
      }
    })

    // Extract common properties
    if (element.textContent) {
      props['text'] = element.textContent.trim()
    }

    // Extract from specific elements
    const titleEl = element.querySelector('h1, h2, h3, h4, h5, h6, [data-title]')
    if (titleEl) {
      props['title'] = titleEl.textContent?.trim()
    }

    const descEl = element.querySelector('p, [data-description]')
    if (descEl) {
      props['description'] = descEl.textContent?.trim()
    }

    const imgEl = element.querySelector('img')
    if (imgEl) {
      props['image'] = imgEl.src
      props['imageAlt'] = imgEl.alt
    }

    const linkEl = element.querySelector('a')
    if (linkEl) {
      const href = linkEl.href
      // Convert relative URLs to absolute using baseUrl
      props['url'] = href.startsWith('http') ? href : new URL(href, this.baseUrl).href
    }

    // Extract microdata
    if (element.hasAttribute('itemtype')) {
      props['itemType'] = element.getAttribute('itemtype')
    }
    if (element.hasAttribute('itemprop')) {
      props['itemProp'] = element.getAttribute('itemprop')
    }

    return props
  }

  /**
   * Extract existing JSON-LD script tags from the document
   */
  private extractExistingJsonLd(document: Document, pageUrl: string): JsonLdEntity[] {
    const entities: JsonLdEntity[] = []
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')

    scripts.forEach((script, index) => {
      try {
        const data = JSON.parse(script.textContent || '{}')
        if (data['@type']) {
          entities.push({
            '@type': data['@type'],
            '@id': data['@id'],
            page: pageUrl,
            selector: `script[type="application/ld+json"]:nth-child(${index + 1})`,
            component: 'ExistingJsonLd',
            data,
            validation: { valid: true, issues: [] },
          })
        }
      } catch (error) {
        // Invalid JSON-LD will be caught during validation
      }
    })

    return entities
  }

  /**
   * Generate JSON-LD script blocks for a page
   */
  private async generateJsonLdBlocks(
    pageUrl: string,
    entities: JsonLdEntity[],
    _document: Document
  ): Promise<JsonLdBlock[]> {
    const blocks: JsonLdBlock[] = []

    // Group entities by type for optimal output
    const entitiesByType = entities.reduce((acc, entity) => {
      const entityType = entity['@type']
      if (!acc[entityType]) {
        acc[entityType] = []
      }
      acc[entityType]!.push(entity)
      return acc
    }, {} as Record<string, JsonLdEntity[]>)

    // Generate blocks for each type
    for (const [type, typeEntities] of Object.entries(entitiesByType)) {
      if (typeEntities.length === 0) {
        continue // Skip empty arrays
      }
      
      if (typeEntities.length === 1) {
        // Single entity
        const firstEntity = typeEntities[0]
        if (firstEntity) {
          blocks.push({
            page: pageUrl,
            type,
            content: firstEntity.data,
            position: 'head',
            minified: false,
          })
        }
      } else {
        // Multiple entities - create an array or individual blocks
        if (this.shouldGroupEntities(type)) {
          blocks.push({
            page: pageUrl,
            type: `${type}List`,
            content: {
              '@context': 'https://schema.org',
              '@graph': typeEntities.map(e => e.data),
            },
            position: 'head',
            minified: false,
          })
        } else {
          typeEntities.forEach((entity, index) => {
            blocks.push({
              page: pageUrl,
              type: `${type}_${index + 1}`,
              content: entity.data,
              position: 'head',
              minified: false,
            })
          })
        }
      }
    }

    return blocks
  }

  /**
   * Determine if entities of a given type should be grouped together
   */
  private shouldGroupEntities(type: string): boolean {
    // Types that work well when grouped
    const groupableTypes = ['Product', 'Event', 'Article', 'BlogPosting', 'FAQPage']
    return groupableTypes.includes(type)
  }

  /**
   * Validate a JSON-LD entity
   */
  private validateJsonLdEntity(entity: JsonLdEntity): { valid: boolean; issues: JsonLdIssue[] } {
    const issues: JsonLdIssue[] = []

    // Basic structure validation
    if (!entity.data['@context']) {
      issues.push({
        severity: 'error',
        property: '@context',
        description: 'Missing @context property',
        recommendation: 'Add "@context": "https://schema.org" to the JSON-LD object',
        schemaReference: 'https://schema.org/',
      })
    }

    if (!entity.data['@type']) {
      issues.push({
        severity: 'error',
        property: '@type',
        description: 'Missing @type property',
        recommendation: 'Specify the Schema.org type for this entity',
        schemaReference: 'https://schema.org/',
      })
    }

    // Type-specific validation
    this.validateSpecificType(entity.data, issues)

    // Check for required properties based on Google's guidelines
    this.validateGoogleRequirements(entity.data, issues)

    return {
      valid: issues.filter(issue => issue.severity === 'error').length === 0,
      issues,
    }
  }

  /**
   * Validate specific Schema.org types
   */
  private validateSpecificType(data: Record<string, any>, issues: JsonLdIssue[]): void {
    const type = data['@type']

    switch (type) {
      case 'Product':
        this.validateProduct(data, issues)
        break
      case 'Event':
        this.validateEvent(data, issues)
        break
      case 'Organization':
        this.validateOrganization(data, issues)
        break
      case 'LocalBusiness':
        this.validateLocalBusiness(data, issues)
        break
      case 'Article':
      case 'BlogPosting':
        this.validateArticle(data, issues)
        break
      case 'FAQPage':
        this.validateFAQ(data, issues)
        break
    }
  }

  private validateProduct(data: Record<string, any>, issues: JsonLdIssue[]): void {
    if (!data['name']) {
      issues.push({
        severity: 'error',
        property: 'name',
        description: 'Product name is required',
        recommendation: 'Add a name property with the product name',
        schemaReference: 'https://schema.org/Product',
      })
    }

    if (!data['offers'] && !data['price']) {
      issues.push({
        severity: 'warning',
        property: 'offers',
        description: 'Product should have price information',
        recommendation: 'Add offers object with price and availability',
        schemaReference: 'https://schema.org/Product#offers',
      })
    }
  }

  private validateEvent(data: Record<string, any>, issues: JsonLdIssue[]): void {
    if (!data['name']) {
      issues.push({
        severity: 'error',
        property: 'name',
        description: 'Event name is required',
        recommendation: 'Add a name property with the event title',
        schemaReference: 'https://schema.org/Event',
      })
    }

    if (!data['startDate']) {
      issues.push({
        severity: 'error',
        property: 'startDate',
        description: 'Event start date is required',
        recommendation: 'Add startDate in ISO 8601 format',
        schemaReference: 'https://schema.org/Event#startDate',
      })
    }

    if (!data['location']) {
      issues.push({
        severity: 'warning',
        property: 'location',
        description: 'Event location is recommended',
        recommendation: 'Add location as Place or VirtualLocation',
        schemaReference: 'https://schema.org/Event#location',
      })
    }
  }

  private validateOrganization(data: Record<string, any>, issues: JsonLdIssue[]): void {
    if (!data['name']) {
      issues.push({
        severity: 'error',
        property: 'name',
        description: 'Organization name is required',
        recommendation: 'Add a name property with the organization name',
        schemaReference: 'https://schema.org/Organization',
      })
    }

    if (!data['url']) {
      issues.push({
        severity: 'warning',
        property: 'url',
        description: 'Organization URL is recommended',
        recommendation: 'Add the organization\'s website URL',
        schemaReference: 'https://schema.org/Organization#url',
      })
    }
  }

  private validateLocalBusiness(data: Record<string, any>, issues: JsonLdIssue[]): void {
    this.validateOrganization(data, issues)

    if (!data['address']) {
      issues.push({
        severity: 'warning',
        property: 'address',
        description: 'Local business should have an address',
        recommendation: 'Add PostalAddress with street, city, region, postal code',
        schemaReference: 'https://schema.org/LocalBusiness#address',
      })
    }
  }

  private validateArticle(data: Record<string, any>, issues: JsonLdIssue[]): void {
    if (!data['headline']) {
      issues.push({
        severity: 'error',
        property: 'headline',
        description: 'Article headline is required',
        recommendation: 'Add headline property with the article title',
        schemaReference: 'https://schema.org/Article#headline',
      })
    }

    if (!data['datePublished']) {
      issues.push({
        severity: 'warning',
        property: 'datePublished',
        description: 'Article publish date is recommended',
        recommendation: 'Add datePublished in ISO 8601 format',
        schemaReference: 'https://schema.org/Article#datePublished',
      })
    }

    if (!data['author']) {
      issues.push({
        severity: 'warning',
        property: 'author',
        description: 'Article author is recommended',
        recommendation: 'Add author as Person or Organization',
        schemaReference: 'https://schema.org/Article#author',
      })
    }
  }

  private validateFAQ(data: Record<string, any>, issues: JsonLdIssue[]): void {
    if (!data['mainEntity'] || !Array.isArray(data['mainEntity'])) {
      issues.push({
        severity: 'error',
        property: 'mainEntity',
        description: 'FAQ page must have mainEntity array of Questions',
        recommendation: 'Add mainEntity with array of Question objects',
        schemaReference: 'https://schema.org/FAQPage#mainEntity',
      })
    }
  }

  /**
   * Validate against Google's requirements for rich results
   */
  private validateGoogleRequirements(data: Record<string, any>, issues: JsonLdIssue[]): void {
    // Google-specific validation rules
    const type = data['@type']

    // Check for image requirements
    if (['Product', 'Event', 'Article', 'BlogPosting'].includes(type) && !data['image']) {
      issues.push({
        severity: 'warning',
        property: 'image',
        description: `${type} should have an image for rich results`,
        recommendation: 'Add high-quality images with proper aspect ratios',
        schemaReference: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
      })
    }

    // Check for unique identifiers
    if (!data['@id'] && ['Product', 'Event', 'Organization'].includes(type)) {
      const severity = this.strict ? 'warning' : 'info'
      issues.push({
        severity,
        property: '@id',
        description: `${type} should have a unique identifier`,
        recommendation: `Add @id with a unique URL for this entity (e.g., "${this.baseUrl}/entity-id")`,
        schemaReference: 'https://schema.org/',
      })
    }
  }

  /**
   * Generate JSON-LD script tags for insertion into HTML
   */
  generateScriptTags(blocks: JsonLdBlock[], minify: boolean = false): string[] {
    return blocks.map(block => {
      const content = minify 
        ? JSON.stringify(block.content)
        : JSON.stringify(block.content, null, 2)
      
      return `<script type="application/ld+json">\n${content}\n</script>`
    })
  }

  /**
   * Insert JSON-LD script tags into HTML document
   */
  insertJsonLdIntoHtml(html: string, blocks: JsonLdBlock[]): string {
    const dom = new JSDOM(html)
    const document = dom.window.document

    // Remove existing JSON-LD scripts
    const existingScripts = document.querySelectorAll('script[type="application/ld+json"]')
    existingScripts.forEach(script => script.remove())

    // Insert new JSON-LD blocks
    const head = document.head
    blocks.forEach(block => {
      if (block.position === 'head' || !block.position) {
        const script = document.createElement('script')
        script.type = 'application/ld+json'
        script.textContent = block.minified 
          ? JSON.stringify(block.content)
          : JSON.stringify(block.content, null, 2)
        head.appendChild(script)
      }
    })

    return dom.serialize()
  }
}