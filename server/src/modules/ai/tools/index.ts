/**
 * AI Tools - Main Export
 * 
 * Central export point for all AI tools with registry initialization.
 * Provides a clean interface for tool registration and execution.
 */

import { createLogger } from '../../../shared/utils.js';
import { aiToolsRegistry, getOpenAIToolsForSite, executeTool, getToolMetrics } from './registry';
import { navigationTools } from './navigation';
import { searchTools } from './search';
import { formsTools } from './forms';
import { commerceTools } from './commerce';
import { bookingTools } from './booking';
import { siteopsTools } from './siteops';

const logger = createLogger({ service: 'ai-tools' });

// ==================== INITIALIZATION ====================

let isInitialized = false;

/**
 * Initialize all AI tools in the registry (singleton pattern)
 */
export function initializeAITools(): void {
  if (isInitialized) {
    logger.debug('AI tools already initialized, skipping');
    return;
  }
  
  logger.info('Initializing AI tools system');
  
  const startTime = Date.now();

  // Register all tool categories
  aiToolsRegistry.registerTools([
    ...navigationTools,
    ...searchTools,
    ...formsTools,
    ...commerceTools,
    ...bookingTools,
    ...siteopsTools,
  ]);

  const initTime = Date.now() - startTime;
  const toolCount = navigationTools.length + searchTools.length + formsTools.length + 
                   commerceTools.length + bookingTools.length + siteopsTools.length;

  logger.info('AI tools initialized successfully', {
    totalTools: toolCount,
    categories: {
      navigation: navigationTools.length,
      search: searchTools.length,
      forms: formsTools.length,
      commerce: commerceTools.length,
      booking: bookingTools.length,
      siteops: siteopsTools.length,
    },
    initializationTime: initTime,
  });
  
  isInitialized = true;
}

// ==================== EXPORTS ====================

// Registry and core functionality
export { aiToolsRegistry, executeTool, getToolMetrics };

// Tool categories
export { navigationTools } from './navigation';
export { searchTools } from './search';
export { formsTools } from './forms';
export { commerceTools } from './commerce';
export { bookingTools } from './booking';
export { siteopsTools } from './siteops';

// Registry functionality
export { 
  getOpenAIToolsForSite,
  AIToolsRegistry
} from './registry';

export type {
  RegistryToolDefinition,
  TenantToolPolicy
} from './registry';

// Validators and schemas
export * from './validators';

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Get all tools for a site formatted for OpenAI function calling
 */
export function getToolsForLLM(siteId: string, tenantId: string): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}> {
  return getOpenAIToolsForSite(siteId, tenantId);
}

/**
 * Execute a tool with comprehensive error handling and metrics
 */
export async function executeAITool(
  toolName: string,
  parameters: Record<string, unknown>,
  context: {
    siteId: string;
    tenantId: string;
    sessionId?: string;
    userId?: string;
    locale?: string;
    origin?: string;
    userAgent?: string;
  }
): Promise<{
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
  toolName: string;
  sideEffects: Array<{
    type: string;
    description: string;
    data?: unknown;
  }>;
}> {
  try {
    const toolContext = {
      siteId: context.siteId,
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      userId: context.userId,
      locale: context.locale || 'en-US',
      origin: context.origin,
      userAgent: context.userAgent,
      metadata: {},
    };

    const result = await executeTool(toolName, parameters, toolContext);
    
    return {
      success: result.success,
      ...(result.result !== undefined && { result: result.result }),
      ...(result.error && { error: result.error }),
      executionTime: result.executionTime,
      toolName,
      sideEffects: result.sideEffects.map(effect => ({
        type: effect.type,
        description: effect.description,
        ...(effect.data !== undefined && { data: effect.data }),
      })),
    };
  } catch (error) {
    logger.error('Tool execution error', {
      toolName,
      error: error instanceof Error ? error.message : 'Unknown error',
      context,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
      executionTime: 0,
      toolName,
      sideEffects: [],
    };
  }
}

/**
 * Get comprehensive tool statistics for monitoring
 */
export function getAIToolsStats(): {
  system: {
    initialized: boolean;
    totalTools: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  };
  categories: Record<string, number>;
  performance: Record<string, unknown>;
  usage: Record<string, unknown>;
} {
  const metrics = getToolMetrics();
  const allTools = aiToolsRegistry.getToolsForTenant('*'); // Get all tools
  
  const categories: Record<string, number> = {};
  allTools.forEach(tool => {
    categories[tool.category] = (categories[tool.category] || 0) + 1;
  });

  // Determine health status based on recent failures
  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  const failureRates = Object.values(metrics).map((metric: any) => {
    if (metric.totalCalls > 0) {
      return metric.failedCalls / metric.totalCalls;
    }
    return 0;
  });
  
  const avgFailureRate = failureRates.reduce((sum, rate) => sum + rate, 0) / failureRates.length;
  if (avgFailureRate > 0.1) {
    healthStatus = 'degraded';
  }
  if (avgFailureRate > 0.25) {
    healthStatus = 'unhealthy';
  }

  return {
    system: {
      initialized: allTools.length > 0,
      totalTools: allTools.length,
      healthStatus,
    },
    categories,
    performance: metrics,
    usage: {
      totalExecutions: Object.values(metrics).reduce((sum: number, metric: any) => sum + metric.totalCalls, 0),
      successfulExecutions: Object.values(metrics).reduce((sum: number, metric: any) => sum + metric.successfulCalls, 0),
      averageLatency: Object.values(metrics).reduce((sum: number, metric: any) => sum + metric.averageLatency, 0) / Object.keys(metrics).length,
    },
  };
}

// ==================== AUTO-INITIALIZATION ====================

// Note: Tools are now initialized on-demand via UniversalAIAssistantService
// to prevent multiple initializations. Auto-initialization removed.
