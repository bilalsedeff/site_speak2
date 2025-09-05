import { JSDOM } from 'jsdom'
import { 
  generateActionManifest,
  getComponentActions,
  validateActionParameters,
  ComponentAction 
} from '@sitespeak/design-system'
import { 
  ActionManifest,
  ComponentContract,
  ComponentActionContract,
  ActionSecurity 
} from '../types/contract-types'

/**
 * Actions emitter for generating action manifests from components
 */
export class ActionsEmitter {
  private baseUrl: string
  private strict: boolean

  constructor(baseUrl: string, options: { strict?: boolean } = {}) {
    this.baseUrl = baseUrl
    this.strict = options.strict ?? false
  }

  /**
   * Generate complete action manifest for all pages and components
   */
  async generateActionManifest(
    pages: Record<string, string>, // pageUrl -> HTML content
    components: Record<string, ComponentContract>
  ): Promise<ActionManifest> {
    const actions: Record<string, ComponentActionContract[]> = {}
    let totalActions = 0
    const actionsByCategory: Record<string, number> = {}
    let secureActions = 0

    // Process each component
    for (const [componentName, contract] of Object.entries(components)) {
      // Get base actions for this component
      const baseActions = getComponentActions(componentName)
      if (baseActions.length === 0) {continue}

      // Convert to contract format and enhance with security
      const componentActions: ComponentActionContract[] = baseActions.map(action => {
        const securityConfig = this.generateSecurityConfig(action)
        const contractAction: ComponentActionContract = {
          name: action.name,
          description: action.description,
          category: action.category,
          selector: action.selector || `[data-action="${action.name}"]`,
          event: action.event || 'click',
          parameters: action.parameters || [],
          security: securityConfig,
        }

        // Update statistics
        totalActions++
        actionsByCategory[action.category] = (actionsByCategory[action.category] || 0) + 1
        if (securityConfig.requiresConfirmation || securityConfig.requiresAuthentication) {
          secureActions++
        }

        return contractAction
      })

      actions[componentName] = componentActions
    }

    // Scan pages for actual action implementations
    const implementedActions = await this.scanPagesForActions(pages, actions)

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      baseUrl: this.baseUrl,
      security: {
        csrfProtection: true,
        allowedOrigins: [this.baseUrl],
        requireAuthentication: this.extractAuthRequiredActions(actions),
      },
      actions: implementedActions,
      categories: {
        navigation: 'Navigation and routing actions',
        commerce: 'E-commerce and shopping actions',
        form: 'Form submission and data entry actions',
        content: 'Content management and search actions',
        media: 'Media playback and interaction actions',
        social: 'Social sharing and interaction actions',
        custom: 'Custom business logic actions',
      },
      statistics: {
        totalActions,
        actionsByCategory,
        secureActions,
      },
    }
  }

  /**
   * Generate security configuration for an action
   */
  private generateSecurityConfig(action: ComponentAction): ActionSecurity {
    const security: ActionSecurity = {
      requiresConfirmation: action.requiresConfirmation || false,
      requiresAuthentication: false,
    }

    // Set authentication requirements based on action type
    const authRequiredActions = [
      'cart.add', 'cart.remove', 'cart.update',
      'booking.create', 'booking.cancel', 'booking.update',
      'profile.update', 'account.delete',
      'payment.process', 'order.create',
    ]

    if (authRequiredActions.some(authAction => action.name.startsWith(authAction))) {
      security.requiresAuthentication = true
    }

    // Add rate limiting for sensitive actions
    const rateLimitedActions = [
      'contact.submit', 'newsletter.subscribe',
      'booking.create', 'order.create',
      'search.submit',
    ]

    if (rateLimitedActions.some(limitedAction => action.name.includes(limitedAction.split('.')[0]))) {
      security.rateLimit = {
        maxCalls: 10,
        windowMs: 60000, // 1 minute
      }
    }

    // Set allowed origins
    security.allowedOrigins = action.allowedOrigins || [this.baseUrl]

    return security
  }

  /**
   * Extract actions that require authentication
   */
  private extractAuthRequiredActions(
    actions: Record<string, ComponentActionContract[]>
  ): string[] {
    const authRequired: string[] = []

    for (const componentActions of Object.values(actions)) {
      for (const action of componentActions) {
        if (action.security.requiresAuthentication) {
          authRequired.push(action.name)
        }
      }
    }

    return authRequired
  }

  /**
   * Scan HTML pages for actual action implementations
   */
  private async scanPagesForActions(
    pages: Record<string, string>,
    expectedActions: Record<string, ComponentActionContract[]>
  ): Promise<Record<string, ComponentActionContract[]>> {
    const implementedActions: Record<string, ComponentActionContract[]> = {}

    for (const [componentName, actions] of Object.entries(expectedActions)) {
      const foundActions: ComponentActionContract[] = []

      for (const action of actions) {
        // Check if this action is implemented in any page
        let implemented = false

        for (const [pageUrl, htmlContent] of Object.entries(pages)) {
          const dom = new JSDOM(htmlContent)
          const document = dom.window.document

          // Look for elements with this action
          const actionElements = this.findActionElements(document, action)
          
          if (actionElements.length > 0) {
            implemented = true
            
            // Enhance action with implementation details
            const enhancedAction = {
              ...action,
              implementation: {
                pages: [pageUrl],
                elementCount: actionElements.length,
                selectors: actionElements.map(el => this.generateSelector(el)),
              }
            }

            // Validate action parameters in the implementation
            const validationResults = this.validateActionImplementations(
              actionElements, 
              action
            )

            if (validationResults.hasIssues && this.strict) {
              enhancedAction.validationIssues = validationResults.issues
            }
            
            foundActions.push(enhancedAction as ComponentActionContract)
            break
          }
        }

        if (!implemented && this.strict) {
          // Include unimplemented actions with a flag
          foundActions.push({
            ...action,
            implemented: false,
            validationIssues: ['Action not found in any page']
          } as ComponentActionContract)
        } else if (implemented) {
          foundActions.push(action)
        }
      }

      if (foundActions.length > 0) {
        implementedActions[componentName] = foundActions
      }
    }

    return implementedActions
  }

  /**
   * Find DOM elements that implement a specific action
   */
  private findActionElements(
    document: Document, 
    action: ComponentActionContract
  ): Element[] {
    const elements: Element[] = []

    // Primary selector: data-action attribute
    const dataActionElements = document.querySelectorAll(`[data-action="${action.name}"]`)
    elements.push(...Array.from(dataActionElements))

    // Secondary selectors based on action type
    if (action.selector && action.selector !== `[data-action="${action.name}"]`) {
      const customElements = document.querySelectorAll(action.selector)
      elements.push(...Array.from(customElements))
    }

    // Heuristic-based finding for common patterns
    const heuristicElements = this.findActionElementsByHeuristics(document, action)
    elements.push(...heuristicElements)

    // Remove duplicates
    return Array.from(new Set(elements))
  }

  /**
   * Find action elements using heuristic patterns
   */
  private findActionElementsByHeuristics(
    document: Document,
    action: ComponentActionContract
  ): Element[] {
    const elements: Element[] = []

    switch (action.category) {
      case 'commerce':
        if (action.name.includes('cart.add')) {
          // Look for "Add to Cart" buttons
          const addToCartButtons = document.querySelectorAll(
            'button:contains("Add to Cart"), [class*="add-to-cart"], [id*="add-cart"]'
          )
          elements.push(...Array.from(addToCartButtons))
        }
        break

      case 'navigation':
        if (action.name.includes('navigation.goto')) {
          // Look for navigation links
          const navLinks = document.querySelectorAll('nav a, [role="navigation"] a')
          elements.push(...Array.from(navLinks))
        }
        break

      case 'form':
        if (action.event === 'submit') {
          // Look for form submit buttons
          const submitButtons = document.querySelectorAll(
            'form button[type="submit"], form input[type="submit"]'
          )
          elements.push(...Array.from(submitButtons))
        }
        break

      case 'content':
        if (action.name.includes('search')) {
          // Look for search forms and buttons
          const searchElements = document.querySelectorAll(
            '[type="search"], [placeholder*="search" i], [class*="search"], [id*="search"]'
          )
          elements.push(...Array.from(searchElements))
        }
        break
    }

    return elements
  }

  /**
   * Generate a unique CSS selector for an element
   */
  private generateSelector(element: Element): string {
    // Try ID first
    if (element.id) {
      return `#${element.id}`
    }

    // Try data-action attribute
    const dataAction = element.getAttribute('data-action')
    if (dataAction) {
      return `[data-action="${dataAction}"]`
    }

    // Try class names
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.length > 0)
      if (classes.length > 0) {
        return `.${classes[0]}`
      }
    }

    // Fall back to tag + position
    const tagName = element.tagName.toLowerCase()
    const parent = element.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName)
      const index = siblings.indexOf(element)
      return `${tagName}:nth-of-type(${index + 1})`
    }

    return tagName
  }

  /**
   * Validate action implementations in DOM elements
   */
  private validateActionImplementations(
    elements: Element[],
    action: ComponentActionContract
  ): { hasIssues: boolean; issues: string[] } {
    const issues: string[] = []

    for (const element of elements) {
      // Check required attributes
      if (!element.hasAttribute('data-action')) {
        issues.push(`Element missing data-action attribute: ${this.generateSelector(element)}`)
      }

      // Check accessibility attributes
      if (action.event === 'click' && element.tagName !== 'BUTTON' && element.tagName !== 'A') {
        if (!element.hasAttribute('role') || element.getAttribute('role') !== 'button') {
          issues.push(`Interactive element should have role="button": ${this.generateSelector(element)}`)
        }
        
        if (!element.hasAttribute('tabindex')) {
          issues.push(`Interactive element should be keyboard accessible: ${this.generateSelector(element)}`)
        }
      }

      // Check for required parameters as data attributes
      for (const param of action.parameters) {
        if (param.required) {
          const dataAttr = `data-action-${param.name.toLowerCase()}`
          if (!element.hasAttribute(dataAttr)) {
            issues.push(
              `Element missing required parameter "${param.name}" as ${dataAttr}: ${this.generateSelector(element)}`
            )
          }
        }
      }

      // Check event binding
      if (action.event !== 'click') {
        // For non-click events, check if appropriate event listeners are likely present
        const hasEventAttr = element.hasAttribute(`on${action.event}`)
        if (!hasEventAttr && this.strict) {
          issues.push(
            `Element may be missing ${action.event} event handler: ${this.generateSelector(element)}`
          )
        }
      }
    }

    return {
      hasIssues: issues.length > 0,
      issues,
    }
  }

  /**
   * Generate JavaScript code for action dispatch
   */
  generateActionDispatcher(): string {
    return `
/**
 * SiteSpeak Action Dispatcher
 * Handles action execution from voice commands and UI interactions
 */
class SiteSpeakActionDispatcher {
  constructor(manifest) {
    this.manifest = manifest;
    this.setupEventListeners();
  }

  /**
   * Set up global event listeners for actions
   */
  setupEventListeners() {
    // Handle click events on action elements
    document.addEventListener('click', (event) => {
      const actionElement = event.target.closest('[data-action]');
      if (actionElement) {
        event.preventDefault();
        this.executeAction(actionElement);
      }
    });

    // Handle form submissions
    document.addEventListener('submit', (event) => {
      const form = event.target;
      const actionElement = form.querySelector('[data-action]');
      if (actionElement) {
        event.preventDefault();
        this.executeAction(actionElement, new FormData(form));
      }
    });

    // Handle keyboard events
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        const actionElement = event.target.closest('[data-action]');
        if (actionElement && actionElement.getAttribute('role') === 'button') {
          event.preventDefault();
          this.executeAction(actionElement);
        }
      }
    });
  }

  /**
   * Execute an action from a DOM element
   */
  async executeAction(element, formData = null) {
    const actionName = element.getAttribute('data-action');
    if (!actionName) return;

    // Find action definition
    const action = this.findAction(actionName);
    if (!action) {
      console.error(\`Action not found: \${actionName}\`);
      return;
    }

    // Extract parameters
    const parameters = this.extractParameters(element, action, formData);

    // Validate parameters
    const validation = this.validateParameters(action, parameters);
    if (!validation.isValid) {
      console.error(\`Action parameters invalid: \${validation.errors.join(', ')}\`);
      return;
    }

    // Check security requirements
    if (action.security.requiresConfirmation) {
      const confirmed = await this.requestConfirmation(action, parameters);
      if (!confirmed) return;
    }

    // Execute the action
    try {
      await this.dispatchAction(action, parameters, element);
    } catch (error) {
      console.error(\`Action execution failed: \${error.message}\`);
      this.showError(action.errorMessage || 'Action failed');
    }
  }

  /**
   * Find action definition by name
   */
  findAction(actionName) {
    for (const [componentName, actions] of Object.entries(this.manifest.actions)) {
      const action = actions.find(a => a.name === actionName);
      if (action) return action;
    }
    return null;
  }

  /**
   * Extract parameters from DOM element and form data
   */
  extractParameters(element, action, formData) {
    const parameters = {};

    // Extract from data attributes
    for (const param of action.parameters) {
      const dataAttr = \`data-action-\${param.name.toLowerCase()}\`;
      const value = element.getAttribute(dataAttr);
      if (value !== null) {
        parameters[param.name] = this.castParameterValue(value, param.type);
      }
    }

    // Extract from form data
    if (formData) {
      for (const [key, value] of formData.entries()) {
        parameters[key] = value;
      }
    }

    // Apply default values
    for (const param of action.parameters) {
      if (parameters[param.name] === undefined && param.defaultValue !== undefined) {
        parameters[param.name] = param.defaultValue;
      }
    }

    return parameters;
  }

  /**
   * Cast parameter value to correct type
   */
  castParameterValue(value, type) {
    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes';
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'array':
        return value.split(',').map(v => v.trim());
      default:
        return value;
    }
  }

  /**
   * Validate action parameters
   */
  validateParameters(action, parameters) {
    // Use the same validation logic from the design system
    // This would be imported in a real implementation
    return { isValid: true, errors: [] };
  }

  /**
   * Request user confirmation for secure actions
   */
  async requestConfirmation(action, parameters) {
    const message = action.confirmationMessage || 
      \`Are you sure you want to \${action.description.toLowerCase()}?\`;
    
    return new Promise((resolve) => {
      if (window.confirm) {
        resolve(window.confirm(message));
      } else {
        // Custom modal implementation
        resolve(true);
      }
    });
  }

  /**
   * Dispatch the actual action
   */
  async dispatchAction(action, parameters, element) {
    switch (action.name) {
      case 'navigation.goto':
        if (parameters.openInNewTab) {
          window.open(parameters.url, '_blank');
        } else {
          window.location.href = parameters.url;
        }
        break;

      case 'navigation.back':
        window.history.back();
        break;

      case 'navigation.home':
        window.location.href = '/';
        break;

      default:
        // Generic action handling - make API call
        await this.executeApiAction(action, parameters);
        break;
    }

    // Show success message
    if (action.successMessage) {
      this.showSuccess(action.successMessage);
    }

    // Handle redirect
    if (action.redirectUrl) {
      setTimeout(() => {
        window.location.href = action.redirectUrl;
      }, 1000);
    }
  }

  /**
   * Execute action via API call
   */
  async executeApiAction(action, parameters) {
    const response = await fetch(\`/api/actions/\${action.name}\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(parameters)
    });

    if (!response.ok) {
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }

    return response.json();
  }

  /**
   * Show success message to user
   */
  showSuccess(message) {
    // Implementation would depend on the notification system
    console.log('Success:', message);
  }

  /**
   * Show error message to user
   */
  showError(message) {
    // Implementation would depend on the notification system
    console.error('Error:', message);
  }
}

// Auto-initialize when DOM is ready
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    fetch('/actions.json')
      .then(response => response.json())
      .then(manifest => {
        window.siteSpeakActions = new SiteSpeakActionDispatcher(manifest);
      })
      .catch(error => {
        console.error('Failed to load action manifest:', error);
      });
  });
}
`.trim()
  }

  /**
   * Generate actions.json file content
   */
  generateActionManifestFile(manifest: ActionManifest, pretty: boolean = true): string {
    return pretty 
      ? JSON.stringify(manifest, null, 2)
      : JSON.stringify(manifest)
  }
}