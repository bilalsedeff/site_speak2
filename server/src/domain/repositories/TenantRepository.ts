import { Tenant, CreateTenantData, TenantUsage } from '../entities/Tenant';

/**
 * Tenant repository interface
 */
export interface TenantRepository {
  /**
   * Find tenant by ID
   */
  findById(id: string): Promise<Tenant | null>;

  /**
   * Find tenant by owner ID
   */
  findByOwnerId(ownerId: string): Promise<Tenant | null>;

  /**
   * Create new tenant
   */
  create(data: CreateTenantData): Promise<Tenant>;

  /**
   * Update tenant
   */
  update(id: string, updates: {
    name?: string;
    settings?: Partial<Tenant['settings']>;
  }): Promise<Tenant | null>;

  /**
   * Delete tenant
   */
  delete(id: string): Promise<boolean>;

  /**
   * Update tenant usage
   */
  updateUsage(id: string, usage: Partial<TenantUsage>): Promise<boolean>;

  /**
   * Increment usage counters
   */
  incrementUsage(id: string, counters: {
    sites?: number;
    knowledgeBaseMB?: number;
    aiTokensThisMonth?: number;
    voiceMinutesThisMonth?: number;
    users?: number;
    customDomains?: number;
  }): Promise<boolean>;

  /**
   * Reset monthly usage counters
   */
  resetMonthlyUsage(id: string): Promise<boolean>;

  /**
   * Activate/deactivate tenant
   */
  setActiveStatus(id: string, isActive: boolean): Promise<boolean>;

  /**
   * Upgrade/downgrade tenant plan
   */
  updatePlan(id: string, plan: 'free' | 'starter' | 'professional' | 'enterprise'): Promise<Tenant | null>;

  /**
   * Find tenants with pagination
   */
  findMany(options: {
    plan?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    tenants: Tenant[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  /**
   * Search tenants by name
   */
  search(query: string): Promise<Tenant[]>;

  /**
   * Get tenant usage statistics
   */
  getUsageStatistics(id: string): Promise<{
    current: TenantUsage;
    historical: {
      date: string;
      sites: number;
      aiTokens: number;
      voiceMinutes: number;
    }[];
    projections: {
      aiTokensEndOfMonth: number;
      voiceMinutesEndOfMonth: number;
    };
  }>;

  /**
   * Get tenants approaching limits
   */
  findApproachingLimits(threshold: number = 0.8): Promise<{
    tenant: Tenant;
    approaching: string[];
  }[]>;

  /**
   * Get plan distribution
   */
  getPlanDistribution(): Promise<Record<string, number>>;

  /**
   * Get tenant analytics
   */
  getAnalytics(): Promise<{
    total: number;
    active: number;
    byPlan: Record<string, number>;
    growth: {
      thisMonth: number;
      lastMonth: number;
      percentChange: number;
    };
    usage: {
      totalSites: number;
      totalAITokensThisMonth: number;
      totalVoiceMinutesThisMonth: number;
    };
  }>;

  /**
   * Check if tenant name exists
   */
  nameExists(name: string): Promise<boolean>;

  /**
   * Find tenants by plan
   */
  findByPlan(plan: string): Promise<Tenant[]>;

  /**
   * Get tenant's current billing period usage
   */
  getBillingPeriodUsage(id: string, startDate: Date, endDate: Date): Promise<{
    sites: number;
    aiTokens: number;
    voiceMinutes: number;
    knowledgeBaseMB: number;
  }>;
}

/**
 * Tenant repository errors
 */
export class TenantNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Tenant not found: ${identifier}`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantNameExistsError extends Error {
  constructor(name: string) {
    super(`Tenant name already exists: ${name}`);
    this.name = 'TenantNameExistsError';
  }
}

export class TenantCreateError extends Error {
  constructor(reason: string) {
    super(`Failed to create tenant: ${reason}`);
    this.name = 'TenantCreateError';
  }
}

export class TenantUpdateError extends Error {
  constructor(reason: string) {
    super(`Failed to update tenant: ${reason}`);
    this.name = 'TenantUpdateError';
  }
}

export class TenantLimitExceededError extends Error {
  constructor(limit: string, current: number, max: number) {
    super(`Tenant limit exceeded for ${limit}: ${current}/${max}`);
    this.name = 'TenantLimitExceededError';
  }
}