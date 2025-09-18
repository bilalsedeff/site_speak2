/**
 * AI Tools Registry
 * 
 * Central registry for all AI tools with OpenAI function calling compatibility.
 * Integrates with existing ActionExecutorService without duplication.
 */

import { createLogger } from '../../../shared/utils.js';
import { 
  ToolDefinition, 
  ToolContext, 
  ToolExecutionResult, 
  SideEffects,
  RegistryToolDefinition
} from './validators.js';
import { actionExecutorService } from '../application/ActionExecutorService.js';
import type { SiteAction, ActionParameter } from '../../../shared/types.js';
import { ActionParameters } from '../types/action-execution.types.js';

const logger = createLogger({ service: 'tools-registry' });

// RegistryToolDefinition is now imported from validators

export interface TenantToolPolicy {
  enabledTools: string[];
  disabledTools: string[];
  rateLimits: Record<string, { requests: number; window: number }>;
  authScopes: Record<string, string[]>;
  customSettings: Record<string, unknown>;
}

/**
 * Central AI Tools Registry
 */
export class AIToolsRegistry {
  private tools: Map<string, RegistryToolDefinition> = new Map();
  private tenantPolicies: Map<string, TenantToolPolicy> = new Map();
  private siteActions: Map<string, SiteAction[]> = new Map();
  private executionMetrics: Map<string, {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageLatency: number;
    lastUsed: Date;
  }> = new Map();

  /**
   * Register a tool with the registry
   */
  registerTool(tool: RegistryToolDefinition): void {
    logger.info('Registering tool', {
      name: tool.name,
      category: tool.category,
      sideEffects: tool.sideEffects,
    });

    this.tools.set(tool.name, tool);
    
    // Initialize metrics
    this.executionMetrics.set(tool.name, {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageLatency: 0,
      lastUsed: new Date(),
    });
  }

  /**
   * Register multiple tools
   */
  registerTools(tools: RegistryToolDefinition[]): void {
    tools.forEach(tool => this.registerTool(tool));
    
    logger.info('Batch tool registration completed', {
      totalTools: tools.length,
      categories: [...new Set(tools.map(t => t.category))],
    });
  }

  /**
   * Get tools for a specific tenant with policy filtering
   */
  getToolsForTenant(tenantId: string): RegistryToolDefinition[] {
    const policy = this.tenantPolicies.get(tenantId);
    const allTools = Array.from(this.tools.values());

    if (!policy) {
      // Return all tools if no policy is set
      return allTools;
    }

    // Apply tenant policy filtering
    return allTools.filter(tool => {
      // Check if tool is explicitly enabled
      if (policy.enabledTools.length > 0 && !policy.enabledTools.includes(tool.name)) {
        return false;
      }
      
      // Check if tool is explicitly disabled
      if (policy.disabledTools.includes(tool.name)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get OpenAI-compatible function definitions for tenant
   */
  getOpenAIFunctions(tenantId: string): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }> {
    const tools = this.getToolsForTenant(tenantId);
    return tools.map(tool => tool.openAIFunction);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    toolName: string, 
    parameters: Record<string, unknown>, 
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found in registry`);
    }

    // Check tenant policy
    const policy = this.tenantPolicies.get(context.tenantId);
    if (policy) {
      if (policy.disabledTools.includes(toolName)) {
        throw new Error(`Tool '${toolName}' is disabled for tenant ${context.tenantId}`);
      }
      
      // Rate limiting would be implemented here
      // For now, we'll delegate to existing ActionExecutorService rate limiting
    }

    const startTime = Date.now();
    
    try {
      logger.info('Executing tool', {
        toolName,
        tenantId: context.tenantId,
        siteId: context.siteId,
        category: tool.category,
      });

      const result = await tool.execute(parameters, context);
      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateToolMetrics(toolName, true, executionTime);

      logger.info('Tool executed successfully', {
        toolName,
        executionTime,
        success: result.success,
      });

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateToolMetrics(toolName, false, executionTime);

      logger.error('Tool execution failed', {
        toolName,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        sideEffects: [],
      };
    }
  }

  /**
   * Register site actions as dynamic tools
   */
  registerSiteActions(siteId: string, actions: SiteAction[]): void {
    logger.info('Registering site actions as tools', {
      siteId,
      actionCount: actions.length,
    });

    this.siteActions.set(siteId, actions);

    // Convert site actions to tools
    actions.forEach(action => {
      const toolName = `site.${action.name}`;
      
      // Generate parameters schema from action parameters  
      const parametersSchema = this.createParametersSchema(action.parameters.map((p: ActionParameter) => ({
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description || `${p.name} parameter`
      })));
      
      const tool: RegistryToolDefinition = {
        name: toolName,
        description: action.description,
        parameters: action.parameters.map((p: any) => ({
          name: p.name,
          description: p.description,
          schema: this.actionParameterToJsonSchema(p),
          required: p.required,
          defaultValue: p.defaultValue,
        })),
        sideEffects: this.mapActionSideEffects(action.sideEffecting),
        confirmRequired: action.confirmation ?? false,
        auth: 'session',
        latencyBudgetMs: this.estimateActionLatency(action),
        idempotent: action.sideEffecting === 'safe',
        category: this.mapActionCategory(action.category),
        execute: async (parameters: any, context: ToolContext) => {
          // Delegate to existing ActionExecutorService
          return await this.executeActionAsTool(action, parameters, context);
        },
        jsonSchema: parametersSchema,
        openAIFunction: {
          type: 'function',
          function: {
            name: toolName,
            description: action.description,
            parameters: parametersSchema,
          },
        },
      };

      this.registerTool(tool);
    });
  }

  /**
   * Get all available tools for a site (including site-specific actions)
   */
  getToolsForSite(siteId: string, tenantId: string): RegistryToolDefinition[] {
    const allTools = this.getToolsForTenant(tenantId);
    const siteActions = this.siteActions.get(siteId) || [];
    
    // Filter tools that are relevant for this site
    return allTools.filter(tool => {
      // Always include global tools
      if (!tool.name.startsWith('site.')) {
        return true;
      }
      
      // Include site-specific tools only for the correct site
      return siteActions.some(action => `site.${action.name}` === tool.name);
    });
  }

  /**
   * Set tenant tool policy
   */
  setTenantPolicy(tenantId: string, policy: TenantToolPolicy): void {
    this.tenantPolicies.set(tenantId, policy);
    
    logger.info('Tenant policy updated', {
      tenantId,
      enabledTools: policy.enabledTools.length,
      disabledTools: policy.disabledTools.length,
    });
  }

  /**
   * Get tool execution metrics
   */
  getToolMetrics(toolName?: string): Record<string, unknown> {
    if (toolName) {
      return this.executionMetrics.get(toolName) || {};
    }
    
    return Object.fromEntries(this.executionMetrics.entries());
  }

  /**
   * Clear all caches and metrics (for testing)
   */
  clear(): void {
    this.tools.clear();
    this.tenantPolicies.clear();
    this.siteActions.clear();
    this.executionMetrics.clear();
    
    logger.info('Registry cleared');
  }

  // ==================== PRIVATE HELPERS ====================

  private updateToolMetrics(toolName: string, success: boolean, latency: number): void {
    const metrics = this.executionMetrics.get(toolName);
    if (!metrics) {return;}

    metrics.totalCalls++;
    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }

    // Update rolling average latency
    metrics.averageLatency = (metrics.averageLatency * (metrics.totalCalls - 1) + latency) / metrics.totalCalls;
    metrics.lastUsed = new Date();
  }

  private async executeActionAsTool(
    action: SiteAction,
    parameters: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult> {
    try {
      // Use existing ActionExecutorService to execute the action
      const result = await actionExecutorService.execute({
        siteId: context.siteId,
        actionName: action.name,
        parameters: parameters as ActionParameters,
        sessionId: context.sessionId || 'unknown',
        userId: context.userId || 'anonymous',
      });

      return {
        success: result.success,
        result: result.result,
        error: typeof result.error === 'string' ? result.error :
               result.error ? JSON.stringify(result.error) : undefined,
        executionTime: result.executionTime,
        sideEffects: result.sideEffects || [],
        // bridgeInstructions handling delegated to ActionDispatchService
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: 0,
        sideEffects: [],
      };
    }
  }

  private createParametersSchema(parameters: Array<{ name: string; type: string; required: boolean; description: string }>): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    parameters.forEach(param => {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      
      if (param.required) {
        required.push(param.name);
      }
    });

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }

  private actionParameterToJsonSchema(param: { name: string; type: string; description: string; validation?: any }): Record<string, unknown> {
    const schema: Record<string, unknown> = {
      type: param.type,
      description: param.description,
    };

    // Add validation constraints if present
    if (param.validation) {
      Object.assign(schema, param.validation);
    }

    return schema;
  }

  private mapActionSideEffects(sideEffecting?: string): SideEffects {
    switch (sideEffecting) {
      case 'safe':
        return 'none';
      case 'read':
        return 'read-only-nav';
      case 'write':
        return 'writes.content';
      default:
        return 'none';
    }
  }

  private mapActionCategory(category?: string): ToolDefinition['category'] {
    switch (category) {
      case 'read':
      case 'navigation':
        return 'navigation';
      case 'write':
        return 'utility';
      case 'delete':
        return 'utility';
      case 'payment':
        return 'ecommerce';
      case 'communication':
        return 'communication';
      default:
        return 'utility';
    }
  }

  private estimateActionLatency(action: SiteAction): number {
    switch (action.type) {
      case 'navigation':
        return 150; // Fast navigation
      case 'button':
        return 100; // Simple DOM interaction
      case 'form':
        return 500; // Form processing takes longer
      case 'api':
        return 2000; // API calls can be slow
      case 'custom':
        return 400; // Default latency
      default:
        return 400;
    }
  }
}

// ==================== SINGLETON REGISTRY ====================

export const aiToolsRegistry = new AIToolsRegistry();

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Get OpenAI-compatible tools for a tenant and site
 */
export function getOpenAIToolsForSite(siteId: string, tenantId: string): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  const tools = aiToolsRegistry.getToolsForSite(siteId, tenantId);
  return tools.map(tool => tool.openAIFunction);
}

/**
 * Execute a tool by name with proper error handling
 */
export async function executeTool(
  toolName: string,
  parameters: Record<string, unknown>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  return await aiToolsRegistry.executeTool(toolName, parameters, context);
}

/**
 * Register site actions as dynamic tools
 */
export function registerSiteActions(siteId: string, actions: SiteAction[]): void {
  // Register with action executor (existing system)
  actionExecutorService.registerActions(siteId, actions);
  
  // Register with tools registry (new system)
  aiToolsRegistry.registerSiteActions(siteId, actions);
}

/**
 * Get comprehensive tool metrics for monitoring
 */
export function getToolMetrics(): {
  totalTools: number;
  toolsByCategory: Record<string, number>;
  executionMetrics: Record<string, unknown>;
  tenantPolicies: number;
} {
  const allTools = Array.from(aiToolsRegistry['tools'].values());
  const toolsByCategory: Record<string, number> = {};
  
  allTools.forEach(tool => {
    toolsByCategory[tool.category] = (toolsByCategory[tool.category] || 0) + 1;
  });

  return {
    totalTools: allTools.length,
    toolsByCategory,
    executionMetrics: aiToolsRegistry.getToolMetrics(),
    tenantPolicies: aiToolsRegistry['tenantPolicies'].size,
  };
}

// Export types
export type { RegistryToolDefinition };
