/**
 * Widget Action Bridge - PostMessage RPC for cross-origin action execution
 * 
 * Implements secure postMessage protocol for AI agent to execute actions
 * on published sites with proper origin validation and security.
 */

import { createLogger } from '../../../../shared/utils.js';
import type { SiteManifest, EnhancedSiteAction } from './ActionManifestGenerator.js';

const logger = createLogger({ service: 'widget-action-bridge' });

/**
 * Bridge configuration for widget embedding
 */
export interface BridgeConfig {
  siteId: string;
  version: string;
  allowedOrigins: string[];
  actions: ActionDef[];
  security: {
    csrfToken?: string;
    sessionId?: string;
    requiresAuth: boolean;
  };
}

/**
 * Action definition for widget bridge
 */
export interface ActionDef {
  id: string;
  name: string;
  description: string;
  selector: string;
  parameters: Record<string, {
    type: string;
    required: boolean;
    description: string;
    validation?: Record<string, any>;
  }>;
  method?: string;
  endpoint?: string;
  confirmation: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  category: string;
}

/**
 * PostMessage protocol messages
 */
export interface WidgetMessage {
  kind: 'hello' | 'execute' | 'result' | 'error' | 'status';
  id?: string;
  version?: string;
  actionId?: string;
  args?: Record<string, any>;
  result?: any;
  error?: string;
  status?: 'processing' | 'completed' | 'failed';
}

/**
 * Action execution context
 */
export interface ActionContext {
  siteId: string;
  sessionId: string;
  tenantId: string;
  userId?: string;
  origin: string;
  timestamp: Date;
}

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Widget Action Bridge Service
 */
export class WidgetActionBridge {
  private actionRegistry = new Map<string, EnhancedSiteAction>();
  private pendingActions = new Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>();
  private allowedOrigins = new Set<string>();

  /**
   * Initialize bridge with action manifest
   */
  initialize(manifest: SiteManifest, allowedOrigins: string[]): BridgeConfig {
    logger.info('Initializing widget action bridge', {
      siteId: manifest.siteId,
      actionCount: manifest.actions.length,
      allowedOrigins,
    });

    // Clear existing registry
    this.actionRegistry.clear();
    this.allowedOrigins.clear();

    // Register actions
    manifest.actions.forEach(action => {
      this.actionRegistry.set(action.id, action);
    });

    // Set allowed origins
    allowedOrigins.forEach(origin => {
      this.allowedOrigins.add(origin);
    });

    // Convert to bridge format
    const actions: ActionDef[] = manifest.actions.map(action => ({
      id: action.id,
      name: action.name,
      description: action.description,
      selector: action.selector || '',
      parameters: this.convertParameters(action.parameters),
      ...(action.method ? { method: action.method } : {}),
      ...(action.endpoint ? { endpoint: action.endpoint } : {}),
      confirmation: action.confirmation || false,
      riskLevel: action.riskLevel || 'medium',
      category: action.category || 'general',
    }));

    const config: BridgeConfig = {
      siteId: manifest.siteId,
      version: manifest.version,
      allowedOrigins,
      actions,
      security: {
        requiresAuth: manifest.actions.some(a => a.requiresAuth),
      },
    };

    logger.info('Widget action bridge initialized', {
      siteId: manifest.siteId,
      actionCount: actions.length,
      capabilities: manifest.capabilities,
    });

    return config;
  }

  /**
   * Generate widget bridge script for embedding
   */
  generateBridgeScript(config: BridgeConfig): string {
    const scriptTemplate = `
(function() {
  'use strict';
  
  const BRIDGE_CONFIG = ${JSON.stringify(config, null, 2)};
  const ALLOWED_ORIGINS = new Set(${JSON.stringify(config.allowedOrigins)});
  
  let bridgeReady = false;
  let parentOrigin = null;
  
  // Action registry
  const actions = new Map();
  BRIDGE_CONFIG.actions.forEach(action => {
    actions.set(action.id, action);
  });
  
  // Message handler
  function handleMessage(event) {
    // Security: Always check origin
    if (!ALLOWED_ORIGINS.has(event.origin)) {
      console.warn('[SiteSpeak Bridge] Rejected message from unauthorized origin:', event.origin);
      return;
    }
    
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    
    switch (message.kind) {
      case 'hello':
        handleHandshake(event);
        break;
      case 'execute':
        handleActionExecution(event);
        break;
      default:
        console.warn('[SiteSpeak Bridge] Unknown message kind:', message.kind);
    }
  }
  
  // Handshake protocol
  function handleHandshake(event) {
    parentOrigin = event.origin;
    bridgeReady = true;
    
    // Respond with bridge info
    event.source.postMessage({
      kind: 'hello',
      version: BRIDGE_CONFIG.version,
      siteId: BRIDGE_CONFIG.siteId,
      actionCount: BRIDGE_CONFIG.actions.length,
      ready: true
    }, event.origin);
    
    console.log('[SiteSpeak Bridge] Handshake completed with:', event.origin);
  }
  
  // Action execution handler
  async function handleActionExecution(event) {
    const { id, actionId, args } = event.data;
    
    if (!bridgeReady) {
      sendError(event, id, 'Bridge not ready');
      return;
    }
    
    const action = actions.get(actionId);
    if (!action) {
      sendError(event, id, 'Action not found: ' + actionId);
      return;
    }
    
    try {
      // Validate parameters
      const validationResult = validateActionArgs(action, args || {});
      if (!validationResult.valid) {
        sendError(event, id, 'Invalid parameters: ' + validationResult.error);
        return;
      }
      
      // Execute action
      const result = await executeAction(action, validationResult.args);
      
      // Send success response
      event.source.postMessage({
        kind: 'result',
        id,
        actionId,
        result,
        timestamp: new Date().toISOString()
      }, event.origin);
      
    } catch (error) {
      console.error('[SiteSpeak Bridge] Action execution failed:', error);
      sendError(event, id, error.message || 'Action execution failed');
    }
  }
  
  // Send error response
  function sendError(event, id, error) {
    event.source.postMessage({
      kind: 'error',
      id,
      error,
      timestamp: new Date().toISOString()
    }, event.origin);
  }
  
  // Validate action arguments
  function validateActionArgs(action, args) {
    const errors = [];
    const validatedArgs = {};
    
    // Check required parameters
    Object.entries(action.parameters).forEach(([name, param]) => {
      const value = args[name];
      
      if (param.required && (value === undefined || value === null)) {
        errors.push(\`Missing required parameter: \${name}\`);
        return;
      }
      
      if (value !== undefined) {
        // Basic type validation
        if (param.type === 'string' && typeof value !== 'string') {
          errors.push(\`Parameter \${name} must be a string\`);
        } else if (param.type === 'number' && typeof value !== 'number') {
          errors.push(\`Parameter \${name} must be a number\`);
        } else if (param.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(\`Parameter \${name} must be a boolean\`);
        } else {
          validatedArgs[name] = value;
        }
      }
    });
    
    return {
      valid: errors.length === 0,
      args: validatedArgs,
      error: errors.join(', ')
    };
  }
  
  // Execute action based on type
  async function executeAction(action, args) {
    console.log('[SiteSpeak Bridge] Executing action:', action.name, args);
    
    switch (action.type) {
      case 'navigation':
        return executeNavigation(action, args);
      case 'form':
        return executeFormSubmission(action, args);
      case 'button':
        return executeButtonClick(action, args);
      case 'custom':
        return executeCustomAction(action, args);
      default:
        throw new Error('Unsupported action type: ' + action.type);
    }
  }
  
  // Navigation execution
  function executeNavigation(action, args) {
    const element = document.querySelector(action.selector);
    if (!element) {
      throw new Error('Navigation element not found: ' + action.selector);
    }
    
    // Get URL from href or data attribute
    const url = element.getAttribute('href') || element.getAttribute('data-url');
    if (!url) {
      throw new Error('No URL found for navigation action');
    }
    
    // Perform navigation
    if (url.startsWith('#')) {
      // Scroll to anchor
      const target = document.querySelector(url);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Page navigation
      window.location.href = url;
    }
    
    return { navigated: true, url };
  }
  
  // Form submission execution
  async function executeFormSubmission(action, args) {
    const form = document.querySelector(action.selector);
    if (!form || form.tagName !== 'FORM') {
      throw new Error('Form not found: ' + action.selector);
    }
    
    // Fill form fields
    Object.entries(args).forEach(([name, value]) => {
      const field = form.querySelector(\`[name="\${name}"]\`);
      if (field) {
        if (field.type === 'checkbox') {
          field.checked = !!value;
        } else {
          field.value = value;
        }
      }
    });
    
    // Submit form
    form.submit();
    
    return { submitted: true, fields: Object.keys(args) };
  }
  
  // Button click execution
  function executeButtonClick(action, args) {
    const button = document.querySelector(action.selector);
    if (!button) {
      throw new Error('Button not found: ' + action.selector);
    }
    
    // Focus and click
    if (button.focus) button.focus();
    button.click();
    
    return { clicked: true, element: action.selector };
  }
  
  // Custom action execution
  async function executeCustomAction(action, args) {
    // Handle search actions
    if (action.name.includes('search')) {
      const searchInput = document.querySelector('input[type="search"], .search input, #search');
      if (searchInput && args.query) {
        searchInput.value = args.query;
        
        // Submit search form or trigger search
        const form = searchInput.closest('form');
        if (form) {
          form.submit();
        } else {
          // Trigger search event
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        return { searched: true, query: args.query };
      }
    }
    
    throw new Error('Custom action not implemented: ' + action.name);
  }
  
  // Initialize bridge
  function init() {
    console.log('[SiteSpeak Bridge] Initializing widget bridge...');
    
    // Listen for messages
    window.addEventListener('message', handleMessage);
    
    // Announce readiness to parent
    if (window.parent !== window) {
      window.parent.postMessage({
        kind: 'hello',
        version: BRIDGE_CONFIG.version,
        siteId: BRIDGE_CONFIG.siteId,
        ready: true
      }, '*'); // Initial announcement, parent will respond with specific origin
    }
    
    console.log('[SiteSpeak Bridge] Bridge ready, actions available:', actions.size);
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('message', handleMessage);
  });
  
})();`;

    return scriptTemplate;
  }

  /**
   * Generate iframe embed code for cross-origin widgets
   */
  generateIframeEmbed(config: BridgeConfig, options: {
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    theme?: 'light' | 'dark' | 'auto';
    size?: 'small' | 'medium' | 'large';
  } = {}): string {
    const {
      position = 'bottom-right',
      theme = 'auto',
      size = 'medium',
    } = options;

    // Generate iframe with proper security attributes
    return `
<iframe 
  id="sitespeak-widget-${config.siteId}"
  src="https://widget.sitespeak.com/embed/${config.siteId}"
  sandbox="allow-scripts allow-same-origin"
  allow="microphone"
  style="
    position: fixed;
    ${position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
    ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
    width: ${size === 'small' ? '300px' : size === 'medium' ? '400px' : '500px'};
    height: ${size === 'small' ? '400px' : size === 'medium' ? '500px' : '600px'};
    border: none;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
    z-index: 999999;
    background: transparent;
  "
  data-sitespeak-config='${JSON.stringify({ siteId: config.siteId, theme, position })}'
></iframe>

<script>
(function() {
  const iframe = document.getElementById('sitespeak-widget-${config.siteId}');
  const config = ${JSON.stringify(config, null, 2)};
  
  // PostMessage handler for widget communication
  function handleWidgetMessage(event) {
    // Verify origin
    if (!config.allowedOrigins.includes(event.origin)) {
      console.warn('[SiteSpeak] Rejected message from:', event.origin);
      return;
    }
    
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    
    switch (message.kind) {
      case 'hello':
        // Respond to widget handshake
        iframe.contentWindow.postMessage({
          kind: 'hello',
          config: {
            siteId: config.siteId,
            actions: config.actions,
            security: config.security
          }
        }, event.origin);
        break;
        
      case 'execute':
        // Forward action execution to site
        executeActionOnSite(message);
        break;
    }
  }
  
  // Execute action on the main site
  async function executeActionOnSite(message) {
    const { id, actionId, args } = message;
    
    try {
      const action = config.actions.find(a => a.id === actionId);
      if (!action) {
        throw new Error('Action not found: ' + actionId);
      }
      
      // Execute the action using our bridge methods
      const result = await window.siteSpeak?.executeAction?.(action, args) || 
                          await fallbackActionExecution(action, args);
      
      // Send result back to widget
      iframe.contentWindow.postMessage({
        kind: 'result',
        id,
        actionId,
        result
      }, config.allowedOrigins[0]);
      
    } catch (error) {
      iframe.contentWindow.postMessage({
        kind: 'error',
        id,
        error: error.message
      }, config.allowedOrigins[0]);
    }
  }
  
  // Fallback action execution using DOM manipulation
  async function fallbackActionExecution(action, args) {
    const element = document.querySelector(action.selector);
    if (!element) {
      throw new Error('Element not found: ' + action.selector);
    }
    
    switch (action.type) {
      case 'navigation':
        const url = element.getAttribute('href');
        if (url) {
          window.location.href = url;
          return { navigated: true, url };
        }
        break;
        
      case 'button':
        element.click();
        return { clicked: true };
        
      case 'form':
        const form = element.closest('form') || element;
        if (form.tagName === 'FORM') {
          // Fill form fields
          Object.entries(args).forEach(([name, value]) => {
            const field = form.querySelector(\`[name="\${name}"]\`);
            if (field) {
              field.value = value;
            }
          });
          form.submit();
          return { submitted: true };
        }
        break;
    }
    
    throw new Error('Could not execute action: ' + action.name);
  }
  
  // Initialize
  window.addEventListener('message', handleWidgetMessage);
  
  // Announce bridge ready to widget when it loads
  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage({
      kind: 'hello',
      version: config.version
    }, config.allowedOrigins[0]);
  });
  
})();
</script>`;
  }

  /**
   * Execute action via postMessage (server-side coordination)
   */
  async executeAction(
    actionId: string,
    args: Record<string, any>,
    context: ActionContext
  ): Promise<any> {
    const action = this.actionRegistry.get(actionId);
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    logger.info('Executing action via bridge', {
      actionId,
      actionName: action.name,
      siteId: context.siteId,
      tenantId: context.tenantId,
    });

    // Validate origin
    if (!this.allowedOrigins.has(context.origin)) {
      throw new Error(`Unauthorized origin: ${context.origin}`);
    }

    // Validate arguments
    if (action.validationSchema) {
      try {
        action.validationSchema.parse(args);
      } catch (error) {
        throw new Error(`Parameter validation failed: ${error}`);
      }
    }

    // Check confirmation requirement
    if (action.confirmation && !args['_confirmed']) {
      return {
        requiresConfirmation: true,
        action: {
          id: actionId,
          name: action.name,
          description: action.description,
          riskLevel: action.riskLevel,
          category: action.category,
        },
        parameters: args,
      };
    }

    // Execute based on action type
    switch (action.type) {
      case 'navigation':
        return this.executeNavigation(action, args);
      
      case 'form':
        return this.executeFormAction(action, args, context);
      
      case 'button':
        return this.executeButtonAction(action, args);
      
      case 'api':
        return this.executeApiAction(action, args, context);
      
      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  /**
   * Convert action parameters to bridge format
   */
  private convertParameters(parameters: ActionParameter[]): Record<string, any> {
    const converted: Record<string, any> = {};
    
    parameters.forEach(param => {
      converted[param.name] = {
        type: param.type,
        required: param.required,
        description: param.description || `${param.name} parameter`,
        validation: param.validation,
      };
    });

    return converted;
  }

  private async executeNavigation(action: EnhancedSiteAction, _args: Record<string, any>): Promise<any> {
    // This would typically send navigation commands to the browser
    // TODO: Use _args for navigation parameters like query strings, form data, etc.
    return {
      type: 'navigation',
      action: action.name,
      target: action.metadata?.['url'] || action.selector,
      success: true,
    };
  }

  private async executeFormAction(
    action: EnhancedSiteAction,
    args: Record<string, any>,
    _context: ActionContext
  ): Promise<any> {
    // This would handle form submissions
    // TODO: Use _context for user authentication and session validation
    return {
      type: 'form_submission',
      action: action.name,
      fields: Object.keys(args),
      success: true,
    };
  }

  private async executeButtonAction(action: EnhancedSiteAction, _args: Record<string, any>): Promise<any> {
    // This would handle button clicks
    return {
      type: 'button_click',
      action: action.name,
      selector: action.selector,
      success: true,
    };
  }

  private async executeApiAction(
    action: EnhancedSiteAction,
    _args: Record<string, any>,
    _context: ActionContext
  ): Promise<any> {
    // This would handle API calls
    return {
      type: 'api_call',
      action: action.name,
      method: action.method,
      endpoint: action.endpoint,
      success: true,
    };
  }

  /**
   * Get bridge statistics
   */
  getStats(): {
    actionCount: number;
    allowedOrigins: string[];
    pendingActions: number;
  } {
    return {
      actionCount: this.actionRegistry.size,
      allowedOrigins: Array.from(this.allowedOrigins),
      pendingActions: this.pendingActions.size,
    };
  }

  /**
   * Clear pending actions and cleanup
   */
  cleanup(): void {
    // Clear timeouts for pending actions
    this.pendingActions.forEach(({ timeout }) => {
      clearTimeout(timeout);
    });
    
    this.pendingActions.clear();
    logger.debug('Widget action bridge cleaned up');
  }
}

/**
 * Export singleton instance
 */
export const widgetActionBridge = new WidgetActionBridge();

// Types are exported at their declaration sites above