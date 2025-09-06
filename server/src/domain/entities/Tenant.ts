import { z } from 'zod';

export interface TenantLimits {
  maxSites: number;
  maxKnowledgeBaseMB: number;
  maxAITokensPerMonth: number;
  maxVoiceMinutesPerMonth: number;
  maxUsers: number;
  maxCustomDomains: number;
}

export interface TenantSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  language: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    customDomain?: string;
  };
  features: {
    aiEnabled: boolean;
    voiceEnabled: boolean;
    analyticsEnabled: boolean;
    whitelabelEnabled: boolean;
  };
}

export interface TenantUsage {
  currentSites: number;
  currentKnowledgeBaseMB: number;
  currentAITokensThisMonth: number;
  currentVoiceMinutesThisMonth: number;
  currentUsers: number;
  currentCustomDomains: number;
}

/**
 * Tenant domain entity
 */
export class Tenant {
  constructor(
    public readonly id: string,
    public name: string,
    public plan: 'free' | 'starter' | 'professional' | 'enterprise',
    public settings: TenantSettings,
    public readonly limits: TenantLimits,
    public usage: TenantUsage,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public readonly isActive: boolean = true,
    public readonly ownerId?: string,
    public stripeCustomerId?: string,
    public stripeSubscriptionId?: string,
    public billingEmail?: string,
  ) {}

  /**
   * Update tenant information
   */
  update(updates: {
    name?: string;
    plan?: 'free' | 'starter' | 'professional' | 'enterprise';
    settings?: Partial<TenantSettings>;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    billingEmail?: string;
  }): Tenant {
    return new Tenant(
      this.id,
      updates.name ?? this.name,
      updates.plan ?? this.plan,
      updates.settings ? { ...this.settings, ...updates.settings } : this.settings,
      this.limits,
      this.usage,
      this.createdAt,
      new Date(), // updatedAt
      this.isActive,
      this.ownerId,
      updates.stripeCustomerId !== undefined ? updates.stripeCustomerId || undefined : this.stripeCustomerId,
      updates.stripeSubscriptionId !== undefined ? updates.stripeSubscriptionId || undefined : this.stripeSubscriptionId,
      updates.billingEmail ?? this.billingEmail,
    );
  }

  /**
   * Update usage statistics
   */
  updateUsage(newUsage: Partial<TenantUsage>): Tenant {
    return new Tenant(
      this.id,
      this.name,
      this.plan,
      this.settings,
      this.limits,
      { ...this.usage, ...newUsage },
      this.createdAt,
      new Date(),
      this.isActive,
      this.ownerId,
      this.stripeCustomerId,
      this.stripeSubscriptionId,
      this.billingEmail,
    );
  }

  /**
   * Check if tenant can perform an action based on limits
   */
  canCreateSite(): boolean {
    return this.usage.currentSites < this.limits.maxSites;
  }

  canAddUser(): boolean {
    return this.usage.currentUsers < this.limits.maxUsers;
  }

  canUseAI(): boolean {
    return this.settings.features.aiEnabled && 
           this.usage.currentAITokensThisMonth < this.limits.maxAITokensPerMonth;
  }

  canUseVoice(): boolean {
    return this.settings.features.voiceEnabled && 
           this.usage.currentVoiceMinutesThisMonth < this.limits.maxVoiceMinutesPerMonth;
  }

  canAddCustomDomain(): boolean {
    return this.usage.currentCustomDomains < this.limits.maxCustomDomains;
  }

  /**
   * Get usage percentage for a specific limit
   */
  getUsagePercentage(type: keyof TenantUsage): number {
    const usage = this.usage[type] as number;
    const limit = this.limits[type.replace('current', 'max') as keyof TenantLimits] as number;
    
    return Math.min((usage / limit) * 100, 100);
  }

  /**
   * Check if tenant is approaching limits (>80% usage)
   */
  isApproachingLimits(): { [key: string]: boolean } {
    return {
      sites: this.getUsagePercentage('currentSites') > 80,
      users: this.getUsagePercentage('currentUsers') > 80,
      knowledgeBase: this.getUsagePercentage('currentKnowledgeBaseMB') > 80,
      aiTokens: this.getUsagePercentage('currentAITokensThisMonth') > 80,
      voiceMinutes: this.getUsagePercentage('currentVoiceMinutesThisMonth') > 80,
      customDomains: this.getUsagePercentage('currentCustomDomains') > 80,
    };
  }

  /**
   * Deactivate tenant
   */
  deactivate(): Tenant {
    return new Tenant(
      this.id,
      this.name,
      this.plan,
      this.settings,
      this.limits,
      this.usage,
      this.createdAt,
      new Date(),
      false, // isActive
      this.ownerId,
      this.stripeCustomerId,
      this.stripeSubscriptionId,
      this.billingEmail,
    );
  }

  /**
   * Get default limits for each plan
   */
  static getDefaultLimits(plan: 'free' | 'starter' | 'professional' | 'enterprise'): TenantLimits {
    const limits: Record<string, TenantLimits> = {
      free: {
        maxSites: 1,
        maxKnowledgeBaseMB: 10,
        maxAITokensPerMonth: 10000,
        maxVoiceMinutesPerMonth: 30,
        maxUsers: 1,
        maxCustomDomains: 0,
      },
      starter: {
        maxSites: 5,
        maxKnowledgeBaseMB: 100,
        maxAITokensPerMonth: 100000,
        maxVoiceMinutesPerMonth: 300,
        maxUsers: 3,
        maxCustomDomains: 1,
      },
      professional: {
        maxSites: 25,
        maxKnowledgeBaseMB: 1000,
        maxAITokensPerMonth: 1000000,
        maxVoiceMinutesPerMonth: 3000,
        maxUsers: 10,
        maxCustomDomains: 5,
      },
      enterprise: {
        maxSites: -1, // Unlimited
        maxKnowledgeBaseMB: -1,
        maxAITokensPerMonth: -1,
        maxVoiceMinutesPerMonth: -1,
        maxUsers: -1,
        maxCustomDomains: -1,
      },
    };

    return limits[plan] || limits['free'] || {
      maxSites: 1,
      maxKnowledgeBaseMB: 10,
      maxAITokensPerMonth: 10000,
      maxVoiceMinutesPerMonth: 60,
      maxUsers: 1,
      maxCustomDomains: 0,
    };
  }

  /**
   * Get default settings
   */
  static getDefaultSettings(): TenantSettings {
    return {
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      currency: 'USD',
      language: 'en',
      features: {
        aiEnabled: true,
        voiceEnabled: true,
        analyticsEnabled: true,
        whitelabelEnabled: false,
      },
    };
  }

  /**
   * Get default usage
   */
  static getDefaultUsage(): TenantUsage {
    return {
      currentSites: 0,
      currentKnowledgeBaseMB: 0,
      currentAITokensThisMonth: 0,
      currentVoiceMinutesThisMonth: 0,
      currentUsers: 1, // Owner
      currentCustomDomains: 0,
    };
  }
}

/**
 * Tenant creation data
 */
export interface CreateTenantData {
  name: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  ownerId?: string;
  settings?: Partial<TenantSettings>;
}

/**
 * Validation schemas
 */
export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(['free', 'starter', 'professional', 'enterprise']),
  ownerId: z.string().uuid().optional(),
  settings: z.object({
    timezone: z.string().optional(),
    dateFormat: z.string().optional(),
    currency: z.string().optional(),
    language: z.string().optional(),
    features: z.object({
      aiEnabled: z.boolean().optional(),
      voiceEnabled: z.boolean().optional(),
      analyticsEnabled: z.boolean().optional(),
      whitelabelEnabled: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z.object({
    timezone: z.string().optional(),
    dateFormat: z.string().optional(),
    currency: z.string().optional(),
    language: z.string().optional(),
    branding: z.object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      customDomain: z.string().optional(),
    }).optional(),
    features: z.object({
      aiEnabled: z.boolean().optional(),
      voiceEnabled: z.boolean().optional(),
      analyticsEnabled: z.boolean().optional(),
      whitelabelEnabled: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;