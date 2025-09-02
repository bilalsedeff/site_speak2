import { createLogger } from '../../../../shared/utils.js';

const logger = createLogger({ service: 'resource-budgets' });

export interface ResourceBudget {
  tenantId: string;
  siteId: string;
  budgets: {
    tokensPerMonth: number;
    actionsPerDay: number;
    apiCallsPerHour: number;
    voiceMinutesPerMonth: number;
    storageBytes: number;
  };
  usage: {
    tokensUsed: number;
    actionsExecuted: number;
    apiCallsMade: number;
    voiceMinutesUsed: number;
    storageUsed: number;
  };
  resetDates: {
    monthlyReset: Date;
    dailyReset: Date;
    hourlyReset: Date;
  };
  overagePolicy: {
    allowOverage: boolean;
    overageCostPerToken: number;
    overageCostPerAction: number;
    overageCostPerApiCall: number;
    overageCostPerVoiceMinute: number;
  };
}

export interface ResourceUsageRequest {
  tenantId: string;
  siteId: string;
  type: 'tokens' | 'actions' | 'api_calls' | 'voice_minutes' | 'storage';
  amount: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceOptimization {
  type: string;
  description: string;
  estimatedSavings: {
    tokens?: number;
    actions?: number;
    apiCalls?: number;
    voiceMinutes?: number;
    storage?: number;
  };
  implementationComplexity: 'low' | 'medium' | 'high';
  potentialImpact: number; // 0-1 scale
}

/**
 * Comprehensive resource management system for AI operations
 * 
 * Features:
 * - Cost tracking and quota management
 * - Smart caching to reduce resource usage
 * - Optimization strategies and recommendations
 * - Multi-tenant budget isolation
 * - Real-time usage monitoring
 */
export class ResourceBudgetsService {
  private budgets: Map<string, ResourceBudget> = new Map();
  private usageCache: Map<string, { value: unknown; timestamp: Date }> = new Map();
  private optimizationStrategies: Map<string, ResourceOptimization[]> = new Map();
  
  // Cache settings
  private cacheSettings = {
    knowledgeBaseResults: { ttl: 5 * 60 * 1000, enabled: true }, // 5 minutes
    actionManifests: { ttl: 30 * 60 * 1000, enabled: true }, // 30 minutes
    languageDetection: { ttl: 10 * 60 * 1000, enabled: true }, // 10 minutes
    voiceTranscription: { ttl: 60 * 60 * 1000, enabled: true }, // 1 hour
  };

  constructor() {
    // Initialize default budgets for different tiers
    this.initializeDefaultBudgets();
    
    // Reset usage counters at appropriate intervals
    this.scheduleResets();
    
    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Check if resource usage is within budget
   */
  async checkResourceAvailability(request: ResourceUsageRequest): Promise<{
    allowed: boolean;
    remaining: number;
    budget: number;
    overageAllowed: boolean;
    estimatedCost?: number;
    resetTime?: Date;
  }> {
    const budgetKey = `${request.tenantId}:${request.siteId}`;
    const budget = this.getBudget(budgetKey);

    if (!budget) {
      throw new Error(`No budget found for tenant ${request.tenantId}, site ${request.siteId}`);
    }

    let remaining: number;
    let budgetLimit: number;
    let resetTime: Date;

    switch (request.type) {
      case 'tokens':
        remaining = budget.budgets.tokensPerMonth - budget.usage.tokensUsed;
        budgetLimit = budget.budgets.tokensPerMonth;
        resetTime = budget.resetDates.monthlyReset;
        break;
      case 'actions':
        remaining = budget.budgets.actionsPerDay - budget.usage.actionsExecuted;
        budgetLimit = budget.budgets.actionsPerDay;
        resetTime = budget.resetDates.dailyReset;
        break;
      case 'api_calls':
        remaining = budget.budgets.apiCallsPerHour - budget.usage.apiCallsMade;
        budgetLimit = budget.budgets.apiCallsPerHour;
        resetTime = budget.resetDates.hourlyReset;
        break;
      case 'voice_minutes':
        remaining = budget.budgets.voiceMinutesPerMonth - budget.usage.voiceMinutesUsed;
        budgetLimit = budget.budgets.voiceMinutesPerMonth;
        resetTime = budget.resetDates.monthlyReset;
        break;
      case 'storage':
        remaining = budget.budgets.storageBytes - budget.usage.storageUsed;
        budgetLimit = budget.budgets.storageBytes;
        resetTime = budget.resetDates.monthlyReset;
        break;
      default:
        throw new Error(`Unknown resource type: ${request.type}`);
    }

    const allowed = remaining >= request.amount;
    const overageAllowed = budget.overagePolicy.allowOverage && !allowed;
    
    let estimatedCost: number | undefined;
    if (overageAllowed) {
      const overage = request.amount - remaining;
      switch (request.type) {
        case 'tokens':
          estimatedCost = overage * budget.overagePolicy.overageCostPerToken;
          break;
        case 'actions':
          estimatedCost = overage * budget.overagePolicy.overageCostPerAction;
          break;
        case 'api_calls':
          estimatedCost = overage * budget.overagePolicy.overageCostPerApiCall;
          break;
        case 'voice_minutes':
          estimatedCost = overage * budget.overagePolicy.overageCostPerVoiceMinute;
          break;
      }
    }

    return {
      allowed: allowed || overageAllowed,
      remaining: Math.max(0, remaining),
      budget: budgetLimit,
      overageAllowed,
      estimatedCost,
      resetTime,
    };
  }

  /**
   * Record resource usage
   */
  async recordUsage(request: ResourceUsageRequest): Promise<{
    recorded: boolean;
    newTotal: number;
    remaining: number;
    warning?: string;
  }> {
    logger.info('Recording resource usage', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      type: request.type,
      amount: request.amount,
    });

    const budgetKey = `${request.tenantId}:${request.siteId}`;
    const budget = this.getBudget(budgetKey);

    if (!budget) {
      throw new Error(`No budget found for tenant ${request.tenantId}, site ${request.siteId}`);
    }

    // Update usage
    let newTotal: number;
    let remaining: number;
    let budgetLimit: number;

    switch (request.type) {
      case 'tokens':
        budget.usage.tokensUsed += request.amount;
        newTotal = budget.usage.tokensUsed;
        budgetLimit = budget.budgets.tokensPerMonth;
        remaining = budgetLimit - newTotal;
        break;
      case 'actions':
        budget.usage.actionsExecuted += request.amount;
        newTotal = budget.usage.actionsExecuted;
        budgetLimit = budget.budgets.actionsPerDay;
        remaining = budgetLimit - newTotal;
        break;
      case 'api_calls':
        budget.usage.apiCallsMade += request.amount;
        newTotal = budget.usage.apiCallsMade;
        budgetLimit = budget.budgets.apiCallsPerHour;
        remaining = budgetLimit - newTotal;
        break;
      case 'voice_minutes':
        budget.usage.voiceMinutesUsed += request.amount;
        newTotal = budget.usage.voiceMinutesUsed;
        budgetLimit = budget.budgets.voiceMinutesPerMonth;
        remaining = budgetLimit - newTotal;
        break;
      case 'storage':
        budget.usage.storageUsed = Math.max(budget.usage.storageUsed, request.amount); // Storage is absolute, not cumulative
        newTotal = budget.usage.storageUsed;
        budgetLimit = budget.budgets.storageBytes;
        remaining = budgetLimit - newTotal;
        break;
      default:
        throw new Error(`Unknown resource type: ${request.type}`);
    }

    // Save updated budget
    this.budgets.set(budgetKey, budget);

    // Generate warnings
    let warning: string | undefined;
    const usagePercentage = (newTotal / budgetLimit) * 100;
    
    if (usagePercentage >= 90) {
      warning = `High usage warning: ${usagePercentage.toFixed(1)}% of ${request.type} budget used`;
    } else if (usagePercentage >= 75) {
      warning = `Usage alert: ${usagePercentage.toFixed(1)}% of ${request.type} budget used`;
    }

    if (warning) {
      logger.warn(warning, {
        tenantId: request.tenantId,
        siteId: request.siteId,
        type: request.type,
        usagePercentage,
      });
    }

    return {
      recorded: true,
      newTotal,
      remaining: Math.max(0, remaining),
      warning,
    };
  }

  /**
   * Get cached result if available
   */
  getCachedResult<T>(key: string, type: keyof typeof this.cacheSettings): T | null {
    if (!this.cacheSettings[type].enabled) {
      return null;
    }

    const cached = this.usageCache.get(key);
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheSettings[type].ttl) {
      this.usageCache.delete(key);
      return null;
    }

    logger.debug('Cache hit', { key, type, age });
    return cached.value as T;
  }

  /**
   * Store result in cache
   */
  setCachedResult(key: string, value: unknown, type: keyof typeof this.cacheSettings): void {
    if (!this.cacheSettings[type].enabled) {
      return;
    }

    this.usageCache.set(key, {
      value,
      timestamp: new Date(),
    });

    logger.debug('Cached result', { key, type });
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizations(tenantId: string, siteId: string): Promise<ResourceOptimization[]> {
    const budgetKey = `${tenantId}:${siteId}`;
    const budget = this.getBudget(budgetKey);

    if (!budget) {
      return [];
    }

    const optimizations: ResourceOptimization[] = [];

    // Analyze usage patterns
    const tokenUsageRate = budget.usage.tokensUsed / budget.budgets.tokensPerMonth;
    const actionUsageRate = budget.usage.actionsExecuted / budget.budgets.actionsPerDay;
    const apiCallsRate = budget.usage.apiCallsMade / budget.budgets.apiCallsPerHour;

    // High token usage optimization
    if (tokenUsageRate > 0.8) {
      optimizations.push({
        type: 'token_optimization',
        description: 'Enable aggressive caching for knowledge base queries to reduce token usage',
        estimatedSavings: {
          tokens: Math.floor(budget.usage.tokensUsed * 0.3),
        },
        implementationComplexity: 'low',
        potentialImpact: 0.8,
      });

      optimizations.push({
        type: 'prompt_optimization',
        description: 'Optimize prompts to be more concise and reduce token consumption',
        estimatedSavings: {
          tokens: Math.floor(budget.usage.tokensUsed * 0.2),
        },
        implementationComplexity: 'medium',
        potentialImpact: 0.6,
      });
    }

    // High action usage optimization
    if (actionUsageRate > 0.8) {
      optimizations.push({
        type: 'action_batching',
        description: 'Batch multiple related actions together to reduce individual action calls',
        estimatedSavings: {
          actions: Math.floor(budget.usage.actionsExecuted * 0.25),
        },
        implementationComplexity: 'medium',
        potentialImpact: 0.7,
      });
    }

    // High API calls optimization
    if (apiCallsRate > 0.8) {
      optimizations.push({
        type: 'api_caching',
        description: 'Implement longer caching for API responses to reduce redundant calls',
        estimatedSavings: {
          apiCalls: Math.floor(budget.usage.apiCallsMade * 0.4),
        },
        implementationComplexity: 'low',
        potentialImpact: 0.9,
      });
    }

    // Storage optimization
    const storageUsageRate = budget.usage.storageUsed / budget.budgets.storageBytes;
    if (storageUsageRate > 0.8) {
      optimizations.push({
        type: 'storage_cleanup',
        description: 'Remove old conversation history and optimize knowledge base storage',
        estimatedSavings: {
          storage: Math.floor(budget.usage.storageUsed * 0.3),
        },
        implementationComplexity: 'low',
        potentialImpact: 0.5,
      });
    }

    // Sort by potential impact
    optimizations.sort((a, b) => b.potentialImpact - a.potentialImpact);

    // Cache optimizations
    this.optimizationStrategies.set(budgetKey, optimizations);

    logger.info('Generated optimization recommendations', {
      tenantId,
      siteId,
      optimizationCount: optimizations.length,
    });

    return optimizations;
  }

  /**
   * Get budget information
   */
  getBudgetInfo(tenantId: string, siteId: string): ResourceBudget | null {
    const budgetKey = `${tenantId}:${siteId}`;
    return this.getBudget(budgetKey);
  }

  /**
   * Update budget limits
   */
  updateBudget(tenantId: string, siteId: string, updates: Partial<ResourceBudget['budgets']>): void {
    const budgetKey = `${tenantId}:${siteId}`;
    const budget = this.getBudget(budgetKey);

    if (budget) {
      budget.budgets = { ...budget.budgets, ...updates };
      this.budgets.set(budgetKey, budget);
      
      logger.info('Budget updated', {
        tenantId,
        siteId,
        updates,
      });
    }
  }

  /**
   * Get system-wide statistics
   */
  getSystemStats(): {
    totalBudgets: number;
    totalTokensUsed: number;
    totalActionsExecuted: number;
    totalApiCallsMade: number;
    cacheHitRate: number;
    cacheSize: number;
  } {
    let totalTokensUsed = 0;
    let totalActionsExecuted = 0;
    let totalApiCallsMade = 0;

    for (const budget of Array.from(this.budgets.values())) {
      totalTokensUsed += budget.usage.tokensUsed;
      totalActionsExecuted += budget.usage.actionsExecuted;
      totalApiCallsMade += budget.usage.apiCallsMade;
    }

    // Calculate cache hit rate (simplified)
    const cacheHitRate = 0.75; // Would be calculated from actual metrics

    return {
      totalBudgets: this.budgets.size,
      totalTokensUsed,
      totalActionsExecuted,
      totalApiCallsMade,
      cacheHitRate,
      cacheSize: this.usageCache.size,
    };
  }

  /**
   * Get or create budget for tenant/site
   */
  private getBudget(budgetKey: string): ResourceBudget | null {
    let budget = this.budgets.get(budgetKey);
    
    if (!budget) {
      // Extract tenantId and siteId from key
      const [tenantId, siteId] = budgetKey.split(':');
      if (!tenantId || !siteId) {
        return null;
      }

      // Create default budget
      budget = this.createDefaultBudget(tenantId, siteId);
      this.budgets.set(budgetKey, budget);
    }

    return budget;
  }

  /**
   * Create default budget for new tenant/site
   */
  private createDefaultBudget(tenantId: string, siteId: string): ResourceBudget {
    const now = new Date();
    
    return {
      tenantId,
      siteId,
      budgets: {
        tokensPerMonth: 100000,
        actionsPerDay: 1000,
        apiCallsPerHour: 500,
        voiceMinutesPerMonth: 60,
        storageBytes: 1024 * 1024 * 1024, // 1GB
      },
      usage: {
        tokensUsed: 0,
        actionsExecuted: 0,
        apiCallsMade: 0,
        voiceMinutesUsed: 0,
        storageUsed: 0,
      },
      resetDates: {
        monthlyReset: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        dailyReset: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
        hourlyReset: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1),
      },
      overagePolicy: {
        allowOverage: false,
        overageCostPerToken: 0.0001,
        overageCostPerAction: 0.01,
        overageCostPerApiCall: 0.001,
        overageCostPerVoiceMinute: 0.05,
      },
    };
  }

  /**
   * Initialize default budgets for different service tiers
   */
  private initializeDefaultBudgets(): void {
    // Could initialize different tier budgets here
    logger.info('Resource budgets service initialized');
  }

  /**
   * Schedule usage counter resets
   */
  private scheduleResets(): void {
    // Reset monthly counters
    setInterval(() => {
      this.resetMonthlyUsage();
    }, 24 * 60 * 60 * 1000); // Check daily

    // Reset daily counters
    setInterval(() => {
      this.resetDailyUsage();
    }, 60 * 60 * 1000); // Check hourly

    // Reset hourly counters
    setInterval(() => {
      this.resetHourlyUsage();
    }, 15 * 60 * 1000); // Check every 15 minutes
  }

  /**
   * Reset monthly usage counters
   */
  private resetMonthlyUsage(): void {
    const now = new Date();
    let resetCount = 0;

    for (const budget of Array.from(this.budgets.values())) {
      if (now >= budget.resetDates.monthlyReset) {
        budget.usage.tokensUsed = 0;
        budget.usage.voiceMinutesUsed = 0;
        budget.resetDates.monthlyReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      logger.info('Reset monthly usage counters', { resetCount });
    }
  }

  /**
   * Reset daily usage counters
   */
  private resetDailyUsage(): void {
    const now = new Date();
    let resetCount = 0;

    for (const budget of Array.from(this.budgets.values())) {
      if (now >= budget.resetDates.dailyReset) {
        budget.usage.actionsExecuted = 0;
        budget.resetDates.dailyReset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      logger.info('Reset daily usage counters', { resetCount });
    }
  }

  /**
   * Reset hourly usage counters
   */
  private resetHourlyUsage(): void {
    const now = new Date();
    let resetCount = 0;

    for (const budget of Array.from(this.budgets.values())) {
      if (now >= budget.resetDates.hourlyReset) {
        budget.usage.apiCallsMade = 0;
        budget.resetDates.hourlyReset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
        resetCount++;
      }
    }

    if (resetCount > 0) {
      logger.info('Reset hourly usage counters', { resetCount });
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [key, cached] of Array.from(this.usageCache.entries())) {
      const age = now - cached.timestamp.getTime();
      
      // Find the maximum TTL to determine if this entry should be cleaned up
      const maxTtl = Math.max(...Object.values(this.cacheSettings).map(s => s.ttl));
      
      if (age > maxTtl) {
        this.usageCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up expired cache entries', { 
        cleanedCount, 
        remainingCacheSize: this.usageCache.size 
      });
    }
  }
}

// Export singleton instance
export const resourceBudgetsService = new ResourceBudgetsService();