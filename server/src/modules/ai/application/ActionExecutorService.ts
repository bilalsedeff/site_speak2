import { createLogger } from '../../../shared/utils.js';
import type { SiteAction } from '../../../shared/types';

const logger = createLogger({ service: 'action-executor' });

export interface ActionExecutionRequest {
  siteId: string;
  actionName: string;
  parameters: Record<string, any>;
  sessionId?: string;
  userId?: string;
}

export interface ActionExecutionResult {
  success: boolean;
  result: any;
  executionTime: number;
  sideEffects: Array<{
    type: 'navigation' | 'form_submission' | 'api_call' | 'dom_change';
    description: string;
    data: any;
  }>;
  error?: string;
}

/**
 * Service responsible for executing site actions through various mechanisms
 * 
 * Supports:
 * - DOM manipulation and navigation
 * - Form submissions
 * - API calls
 * - Custom action handlers
 */
export class ActionExecutorService {
  private actionRegistry: Map<string, SiteAction> = new Map();
  private executionHistory: Array<ActionExecutionRequest & { timestamp: number }> = [];

  constructor(
    private dependencies: {
      browserAutomationService?: any; // For Playwright-based actions
      apiGateway?: any; // For API calls
      websocketService?: any; // For real-time UI updates
    } = {}
  ) {}

  /**
   * Execute a site action
   */
  async execute(request: ActionExecutionRequest): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    
    logger.info('Executing action', {
      siteId: request.siteId,
      actionName: request.actionName,
      parameters: request.parameters
    });

    // Record execution in history
    this.executionHistory.push({
      ...request,
      timestamp: startTime,
    });

    // Keep only last 1000 executions
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }

    try {
      const action = this.actionRegistry.get(request.actionName);
      if (!action) {
        throw new Error(`Action '${request.actionName}' not found in registry`);
      }

      // Validate parameters against action schema
      this.validateParameters(action, request.parameters);

      // Route to appropriate executor based on action type
      let result: any;
      const sideEffects: ActionExecutionResult['sideEffects'] = [];

      switch (action.type) {
        case 'navigation':
          result = await this.executeNavigation(action, request.parameters, sideEffects);
          break;
          
        case 'form':
          result = await this.executeFormAction(action, request.parameters, sideEffects);
          break;
          
        case 'button':
          result = await this.executeButtonAction(action, request.parameters, sideEffects);
          break;
          
        case 'api':
          result = await this.executeApiAction(action, request.parameters, sideEffects);
          break;
          
        case 'custom':
          result = await this.executeCustomAction(action, request.parameters, sideEffects);
          break;
          
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }

      const executionTime = Date.now() - startTime;

      logger.info('Action executed successfully', {
        siteId: request.siteId,
        actionName: request.actionName,
        executionTime,
        sideEffectsCount: sideEffects.length
      });

      // Send real-time updates to connected clients
      if (this.dependencies.websocketService) {
        await this.dependencies.websocketService.notifyActionExecuted({
          siteId: request.siteId,
          sessionId: request.sessionId,
          action: request.actionName,
          result,
          sideEffects,
        });
      }

      return {
        success: true,
        result,
        executionTime,
        sideEffects,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Action execution failed', {
        siteId: request.siteId,
        actionName: request.actionName,
        error: errorMessage,
        executionTime
      });

      return {
        success: false,
        result: null,
        executionTime,
        sideEffects: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Execute navigation actions
   */
  private async executeNavigation(
    action: SiteAction,
    parameters: Record<string, any>,
    sideEffects: ActionExecutionResult['sideEffects']
  ): Promise<any> {
    logger.info('Executing navigation action', {
      actionName: action.name,
      selector: action.selector,
      parameters
    });

    // Extract navigation target from parameters or action configuration
    const navigationTarget = parameters['url'] || parameters['path'] || parameters['target'];

    if (!navigationTarget) {
      throw new Error('Navigation target not specified');
    }

    // Record side effect
    sideEffects.push({
      type: 'navigation',
      description: `Navigate to ${navigationTarget}`,
      data: {
        target: navigationTarget,
        method: 'client-side',
        selector: action.selector,
      },
    });

    // For navigation, we return instructions for the client to execute
    return {
      type: 'navigation',
      target: navigationTarget,
      method: 'pushState', // or 'replace' or 'href'
      scrollToTop: parameters['scrollToTop'] !== false,
      highlightElement: action.selector,
    };
  }

  /**
   * Execute form actions
   */
  private async executeFormAction(
    action: SiteAction,
    parameters: Record<string, any>,
    sideEffects: ActionExecutionResult['sideEffects']
  ): Promise<any> {
    logger.info('Executing form action', {
      actionName: action.name,
      selector: action.selector,
      parameters
    });

    // Validate required form fields
    const requiredFields = action.parameters
      .filter(param => param.required)
      .map(param => param.name);

    const missingFields = requiredFields.filter(field => !parameters[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // For high-risk forms, require confirmation
    if (action.riskLevel === 'high' && !parameters['_confirmed']) {
      return {
        type: 'confirmation_required',
        message: `Are you sure you want to ${action.description}?`,
        confirmationData: {
          action: action.name,
          parameters: { ...parameters, _confirmed: true },
        },
      };
    }

    sideEffects.push({
      type: 'form_submission',
      description: action.description,
      data: {
        selector: action.selector,
        formData: parameters,
        method: 'POST', // Assume POST for forms
      },
    });

    // Return form submission instructions
    return {
      type: 'form_submission',
      selector: action.selector,
      formData: parameters,
      method: 'POST',
      validation: 'client-side',
    };
  }

  /**
   * Execute button/click actions
   */
  private async executeButtonAction(
    action: SiteAction,
    parameters: Record<string, any>,
    sideEffects: ActionExecutionResult['sideEffects']
  ): Promise<any> {
    logger.info('Executing button action', {
      actionName: action.name,
      selector: action.selector
    });

    sideEffects.push({
      type: 'dom_change',
      description: `Click ${action.description}`,
      data: {
        selector: action.selector,
        action: 'click',
        parameters,
      },
    });

    return {
      type: 'dom_interaction',
      action: 'click',
      selector: action.selector,
      parameters,
    };
  }

  /**
   * Execute API actions
   */
  private async executeApiAction(
    action: SiteAction,
    parameters: Record<string, any>,
    sideEffects: ActionExecutionResult['sideEffects']
  ): Promise<any> {
    logger.info('Executing API action', {
      actionName: action.name,
      parameters
    });

    if (!this.dependencies.apiGateway) {
      throw new Error('API Gateway not available for API actions');
    }

    // Extract API configuration from action
    // This would typically be stored in action metadata
    const apiConfig = {
      endpoint: parameters['endpoint'] || action.selector, // Misuse selector for endpoint
      method: parameters['method'] || 'GET',
      headers: parameters['headers'] || {},
      body: parameters['body'],
    };

    try {
      const response = await this.dependencies.apiGateway.call(apiConfig);

      sideEffects.push({
        type: 'api_call',
        description: `API call to ${apiConfig.endpoint}`,
        data: {
          endpoint: apiConfig.endpoint,
          method: apiConfig.method,
          status: response.status,
        },
      });

      return {
        type: 'api_response',
        status: response.status,
        data: response.data,
        headers: response.headers,
      };
    } catch (error) {
      throw new Error(`API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute custom actions
   */
  private async executeCustomAction(
    action: SiteAction,
    parameters: Record<string, any>,
    sideEffects: ActionExecutionResult['sideEffects']
  ): Promise<any> {
    logger.info('Executing custom action', {
      actionName: action.name,
      parameters
    });

    // Custom actions would be handled by registered handlers
    // For now, return a generic response
    sideEffects.push({
      type: 'dom_change',
      description: `Execute custom action: ${action.description}`,
      data: {
        actionName: action.name,
        parameters,
      },
    });

    return {
      type: 'custom_action',
      actionName: action.name,
      parameters,
      message: `Custom action '${action.name}' executed`,
    };
  }

  /**
   * Validate action parameters against schema
   */
  private validateParameters(action: SiteAction, parameters: Record<string, any>): void {
    for (const paramDef of action.parameters) {
      const value = parameters[paramDef.name];

      // Check required parameters
      if (paramDef.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${paramDef.name}' is missing`);
      }

      // Type validation would go here
      // For now, we'll assume parameters are valid
    }
  }

  /**
   * Register actions for a site
   */
  registerActions(siteId: string, actions: SiteAction[]): void {
    logger.info('Registering actions', {
      siteId,
      actionCount: actions.length
    });

    // Clear existing actions for this site
    for (const [key] of this.actionRegistry) {
      if (key.startsWith(`${siteId}:`)) {
        this.actionRegistry.delete(key);
      }
    }

    // Register new actions
    for (const action of actions) {
      const key = `${siteId}:${action.name}`;
      this.actionRegistry.set(key, action);
      this.actionRegistry.set(action.name, action); // Also register by name for easy lookup
    }

    logger.info('Actions registered successfully', {
      siteId,
      totalActions: this.actionRegistry.size
    });
  }

  /**
   * Get available actions for a site
   */
  getAvailableActions(siteId: string): SiteAction[] {
    const actions: SiteAction[] = [];
    
    for (const [key, action] of this.actionRegistry) {
      if (key.startsWith(`${siteId}:`)) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Get execution history for analysis
   */
  getExecutionHistory(siteId?: string, limit = 100): Array<ActionExecutionRequest & { timestamp: number }> {
    let history = this.executionHistory;

    if (siteId) {
      history = history.filter(entry => entry.siteId === siteId);
    }

    return history.slice(-limit);
  }

  /**
   * Dry run an action to validate it without executing
   */
  async dryRun(request: ActionExecutionRequest): Promise<{
    valid: boolean;
    issues: string[];
    estimatedExecutionTime: number;
    sideEffects: string[];
  }> {
    const action = this.actionRegistry.get(request.actionName);
    const issues: string[] = [];
    const sideEffects: string[] = [];

    if (!action) {
      issues.push(`Action '${request.actionName}' not found`);
      return {
        valid: false,
        issues,
        estimatedExecutionTime: 0,
        sideEffects,
      };
    }

    try {
      // Validate parameters
      this.validateParameters(action, request.parameters);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Parameter validation failed');
    }

    // Estimate side effects
    switch (action.type) {
      case 'navigation':
        sideEffects.push('Page navigation');
        break;
      case 'form':
        sideEffects.push('Form submission');
        if (action.category === 'payment') {
          sideEffects.push('Payment processing');
        }
        break;
      case 'api':
        sideEffects.push('External API call');
        break;
      default:
        sideEffects.push('DOM manipulation');
    }

    // Estimate execution time based on action type
    let estimatedTime = 100; // Base time in ms
    switch (action.type) {
      case 'navigation':
        estimatedTime = 500;
        break;
      case 'form':
        estimatedTime = 1000;
        break;
      case 'api':
        estimatedTime = 2000;
        break;
    }

    return {
      valid: issues.length === 0,
      issues,
      estimatedExecutionTime: estimatedTime,
      sideEffects,
    };
  }
}

// Export singleton instance
export const actionExecutorService = new ActionExecutorService();