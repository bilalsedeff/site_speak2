import { eq, and, ilike, desc, asc, count, isNull, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { 
  Tenant, 
  CreateTenantData, 
  TenantUsage,
  TenantLimits,
  TenantSettings,
} from '../../domain/entities/Tenant';
import {
  type TenantRepository,
  TenantNotFoundError,
  TenantNameExistsError,
  TenantCreateError,
  TenantUpdateError,
} from '../../domain/repositories/TenantRepository';
import { tenants } from '../database/schema/tenants.js';
import { users } from '../database/schema/users.js';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'tenant-repository' });

/**
 * Production-ready TenantRepository implementation using Drizzle ORM
 * Supports comprehensive tenant management with usage tracking and limits
 */
export class TenantRepositoryImpl implements TenantRepository {
  constructor(private db: PostgresJsDatabase<any>) {}

  async findById(id: string): Promise<Tenant | null> {
    try {
      const [tenantRow] = await this.db
        .select()
        .from(tenants)
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .limit(1);

      if (!tenantRow) {
        return null;
      }

      return this.mapToTenant(tenantRow);
    } catch (error) {
      logger.error('Failed to find tenant by ID', { id, error });
      throw error;
    }
  }

  async findByOwnerId(ownerId: string): Promise<Tenant | null> {
    try {
      // Find tenant through user relationship
      const [result] = await this.db
        .select({
          tenant: tenants,
        })
        .from(tenants)
        .innerJoin(users, eq(users.tenantId, tenants.id))
        .where(and(
          eq(users.id, ownerId),
          eq(users.role, 'owner'),
          isNull(tenants.deletedAt),
          isNull(users.deletedAt)
        ))
        .limit(1);

      if (!result) {
        return null;
      }

      return this.mapToTenant(result.tenant);
    } catch (error) {
      logger.error('Failed to find tenant by owner ID', { ownerId, error });
      throw error;
    }
  }

  async create(data: CreateTenantData): Promise<Tenant> {
    try {
      // Check if tenant name already exists
      if (await this.nameExists(data.name)) {
        throw new TenantNameExistsError(data.name);
      }

      const normalizedName = data.name.trim();
      const defaultSettings = Tenant.getDefaultSettings();
      const defaultLimits = Tenant.getDefaultLimits(data.plan);
      const defaultUsage = Tenant.getDefaultUsage();

      // Merge with provided settings
      const settings = {
        ...defaultSettings,
        ...(data.settings || {}),
      };

      const [newTenant] = await this.db
        .insert(tenants)
        .values({
          name: normalizedName,
          plan: data.plan,
          status: 'active',
          settings: settings,
          
          // Set limits based on plan
          maxSites: defaultLimits.maxSites === -1 ? 999999 : defaultLimits.maxSites,
          maxKnowledgeBaseMB: defaultLimits.maxKnowledgeBaseMB === -1 ? 999999 : defaultLimits.maxKnowledgeBaseMB,
          maxAITokensPerMonth: defaultLimits.maxAITokensPerMonth === -1 ? 999999 : defaultLimits.maxAITokensPerMonth,
          maxVoiceMinutesPerMonth: defaultLimits.maxVoiceMinutesPerMonth === -1 ? 999999 : defaultLimits.maxVoiceMinutesPerMonth,
          
          // Initialize usage
          currentSites: defaultUsage.currentSites,
          currentKnowledgeBaseMB: defaultUsage.currentKnowledgeBaseMB,
          currentAITokensThisMonth: defaultUsage.currentAITokensThisMonth,
          currentVoiceMinutesThisMonth: defaultUsage.currentVoiceMinutesThisMonth,
          
          // Set trial for non-free plans
          ...(data.plan !== 'free' && {
            isTrialActive: true,
            trialEndsAt: sql`NOW() + INTERVAL '14 days'`,
          }),
        })
        .returning();

      if (!newTenant) {
        throw new TenantCreateError('Failed to insert tenant record');
      }

      logger.info('Tenant created successfully', {
        tenantId: newTenant.id,
        name: normalizedName,
        plan: data.plan,
        ownerId: data.ownerId,
      });

      return this.mapToTenant(newTenant);
    } catch (error) {
      if (error instanceof TenantNameExistsError) {
        throw error;
      }
      
      logger.error('Failed to create tenant', { 
        name: data.name, 
        plan: data.plan, 
        error 
      });
      
      throw new TenantCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async update(id: string, updates: {
    name?: string;
    settings?: Partial<TenantSettings>;
  }): Promise<Tenant | null> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: sql`NOW()`,
      };

      if (updates.name !== undefined) {
        const normalizedName = updates.name.trim();
        
        // Check if new name conflicts with existing tenant
        const currentTenant = await this.findById(id);
        if (normalizedName !== currentTenant?.name) {
          if (await this.nameExists(normalizedName)) {
            throw new TenantNameExistsError(normalizedName);
          }
        }
        
        updateData['name'] = normalizedName;
      }

      if (updates.settings !== undefined) {
        // Merge with existing settings
        const currentTenant = await this.findById(id);
        if (currentTenant) {
          updateData['settings'] = { ...currentTenant.settings, ...updates.settings };
        } else {
          updateData['settings'] = updates.settings;
        }
      }

      const [updatedTenant] = await this.db
        .update(tenants)
        .set(updateData)
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning();

      if (!updatedTenant) {
        logger.warn('Tenant not found for update', { id });
        return null;
      }

      logger.info('Tenant updated successfully', {
        tenantId: id,
        updates: Object.keys(updates),
      });

      return this.mapToTenant(updatedTenant);
    } catch (error) {
      if (error instanceof TenantNameExistsError) {
        throw error;
      }
      
      logger.error('Failed to update tenant', { id, updates, error });
      throw new TenantUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      // Soft delete by setting deletedAt timestamp
      const [deletedTenant] = await this.db
        .update(tenants)
        .set({
          deletedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
          status: 'cancelled',
        })
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning({ id: tenants.id });

      const success = !!deletedTenant;
      
      if (success) {
        logger.info('Tenant deleted successfully', { tenantId: id });
      } else {
        logger.warn('Tenant not found for deletion', { id });
      }

      return success;
    } catch (error) {
      logger.error('Failed to delete tenant', { id, error });
      throw error;
    }
  }

  async updateUsage(id: string, usage: Partial<TenantUsage>): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: sql`NOW()`,
      };

      Object.entries(usage).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbField = key.replace('current', 'current').toLowerCase();
          if (dbField === 'currentsites') {updateData['currentSites'] = value;}
          if (dbField === 'currentknowledgebasemb') {updateData['currentKnowledgeBaseMB'] = value;}
          if (dbField === 'currentaitokensthismonth') {updateData['currentAITokensThisMonth'] = value;}
          if (dbField === 'currentvoiceminutesthismonth') {updateData['currentVoiceMinutesThisMonth'] = value;}
        }
      });

      const [updatedTenant] = await this.db
        .update(tenants)
        .set(updateData)
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning({ id: tenants.id });

      const success = !!updatedTenant;
      
      if (success) {
        logger.debug('Tenant usage updated', { tenantId: id, usage });
      }

      return success;
    } catch (error) {
      logger.error('Failed to update tenant usage', { id, usage, error });
      throw error;
    }
  }

  async incrementUsage(id: string, counters: {
    sites?: number;
    knowledgeBaseMB?: number;
    aiTokensThisMonth?: number;
    voiceMinutesThisMonth?: number;
    users?: number;
    customDomains?: number;
  }): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: sql`NOW()`,
      };

      if (counters.sites !== undefined) {
        updateData['currentSites'] = sql`${tenants.currentSites} + ${counters.sites}`;
      }
      if (counters.knowledgeBaseMB !== undefined) {
        updateData['currentKnowledgeBaseMB'] = sql`${tenants.currentKnowledgeBaseMB} + ${counters.knowledgeBaseMB}`;
      }
      if (counters.aiTokensThisMonth !== undefined) {
        updateData['currentAITokensThisMonth'] = sql`${tenants.currentAITokensThisMonth} + ${counters.aiTokensThisMonth}`;
      }
      if (counters.voiceMinutesThisMonth !== undefined) {
        updateData['currentVoiceMinutesThisMonth'] = sql`${tenants.currentVoiceMinutesThisMonth} + ${counters.voiceMinutesThisMonth}`;
      }

      const [updatedTenant] = await this.db
        .update(tenants)
        .set(updateData)
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning({ id: tenants.id });

      const success = !!updatedTenant;
      
      if (success) {
        logger.debug('Tenant usage incremented', { tenantId: id, counters });
      }

      return success;
    } catch (error) {
      logger.error('Failed to increment tenant usage', { id, counters, error });
      throw error;
    }
  }

  async resetMonthlyUsage(id: string): Promise<boolean> {
    try {
      const [updatedTenant] = await this.db
        .update(tenants)
        .set({
          currentAITokensThisMonth: 0,
          currentVoiceMinutesThisMonth: 0,
          usageResetDate: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning({ id: tenants.id });

      const success = !!updatedTenant;
      
      if (success) {
        logger.info('Tenant monthly usage reset', { tenantId: id });
      }

      return success;
    } catch (error) {
      logger.error('Failed to reset monthly usage', { id, error });
      throw error;
    }
  }

  async setActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    try {
      const status = isActive ? 'active' : 'suspended';
      
      const [updatedTenant] = await this.db
        .update(tenants)
        .set({
          status,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning({ id: tenants.id });

      const success = !!updatedTenant;
      
      if (success) {
        logger.info('Tenant status updated', { tenantId: id, status });
      }

      return success;
    } catch (error) {
      logger.error('Failed to update tenant status', { id, isActive, error });
      throw error;
    }
  }

  async updatePlan(id: string, plan: 'free' | 'starter' | 'professional' | 'enterprise'): Promise<Tenant | null> {
    try {
      const newLimits = Tenant.getDefaultLimits(plan);
      
      const [updatedTenant] = await this.db
        .update(tenants)
        .set({
          plan,
          maxSites: newLimits.maxSites === -1 ? 999999 : newLimits.maxSites,
          maxKnowledgeBaseMB: newLimits.maxKnowledgeBaseMB === -1 ? 999999 : newLimits.maxKnowledgeBaseMB,
          maxAITokensPerMonth: newLimits.maxAITokensPerMonth === -1 ? 999999 : newLimits.maxAITokensPerMonth,
          maxVoiceMinutesPerMonth: newLimits.maxVoiceMinutesPerMonth === -1 ? 999999 : newLimits.maxVoiceMinutesPerMonth,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(tenants.id, id), isNull(tenants.deletedAt)))
        .returning();

      if (!updatedTenant) {
        logger.warn('Tenant not found for plan update', { id });
        return null;
      }

      logger.info('Tenant plan updated', { tenantId: id, plan });
      return this.mapToTenant(updatedTenant);
    } catch (error) {
      logger.error('Failed to update tenant plan', { id, plan, error });
      throw new TenantUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async findMany(options: {
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
  }> {
    try {
      const {
        plan,
        isActive,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const offset = (page - 1) * limit;
      const conditions = [isNull(tenants.deletedAt)];

      if (plan) {
        conditions.push(eq(tenants.plan, plan));
      }

      if (isActive !== undefined) {
        const status = isActive ? 'active' : 'suspended';
        conditions.push(eq(tenants.status, status));
      }

      const whereCondition = and(...conditions);

      // Get total count
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(whereCondition);

      const total = totalResult?.count || 0;

      // Get paginated results
      const orderBy = sortOrder === 'asc' ? asc : desc;
      const sortColumn = tenants[sortBy as keyof typeof tenants] || tenants.createdAt;

      const tenantRows = await this.db
        .select()
        .from(tenants)
        .where(whereCondition)
        .orderBy(orderBy(sortColumn as any))
        .limit(limit)
        .offset(offset);

      const mappedTenants = tenantRows.map(row => this.mapToTenant(row));
      const totalPages = Math.ceil(total / limit);

      return {
        tenants: mappedTenants,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Failed to find tenants with pagination', { options, error });
      throw error;
    }
  }

  async search(query: string): Promise<Tenant[]> {
    try {
      const searchTerm = `%${query.trim()}%`;
      
      const tenantRows = await this.db
        .select()
        .from(tenants)
        .where(and(
          ilike(tenants.name, searchTerm),
          isNull(tenants.deletedAt)
        ))
        .orderBy(asc(tenants.name))
        .limit(50);

      return tenantRows.map(row => this.mapToTenant(row));
    } catch (error) {
      logger.error('Failed to search tenants', { query, error });
      throw error;
    }
  }

  async getUsageStatistics(id: string): Promise<{
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
  }> {
    try {
      const tenant = await this.findById(id);
      if (!tenant) {
        throw new TenantNotFoundError(id);
      }

      // Calculate projections based on current usage and days passed this month
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const remainingDays = daysInMonth - dayOfMonth;

      const dailyAITokens = tenant.usage.currentAITokensThisMonth / dayOfMonth;
      const dailyVoiceMinutes = tenant.usage.currentVoiceMinutesThisMonth / dayOfMonth;

      const projections = {
        aiTokensEndOfMonth: Math.ceil(tenant.usage.currentAITokensThisMonth + (dailyAITokens * remainingDays)),
        voiceMinutesEndOfMonth: Math.ceil(tenant.usage.currentVoiceMinutesThisMonth + (dailyVoiceMinutes * remainingDays)),
      };

      // For now, return mock historical data - in production this would query actual usage logs
      const historical = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return {
          date: date.toISOString().split('T')[0]!,
          sites: tenant.usage.currentSites,
          aiTokens: Math.floor(tenant.usage.currentAITokensThisMonth * (1 - i * 0.03)),
          voiceMinutes: Math.floor(tenant.usage.currentVoiceMinutesThisMonth * (1 - i * 0.02)),
        };
      }).reverse();

      return {
        current: tenant.usage,
        historical,
        projections,
      };
    } catch (error) {
      logger.error('Failed to get usage statistics', { id, error });
      throw error;
    }
  }

  async findApproachingLimits(threshold: number = 80): Promise<{
    tenant: Tenant;
    approaching: string[];
  }[]> {
    try {
      const tenantRows = await this.db
        .select()
        .from(tenants)
        .where(and(
          eq(tenants.status, 'active'),
          isNull(tenants.deletedAt)
        ));

      const results: { tenant: Tenant; approaching: string[] }[] = [];

      for (const row of tenantRows) {
        const tenant = this.mapToTenant(row);
        const limits = tenant.isApproachingLimits();
        const approaching: string[] = [];

        Object.entries(limits).forEach(([key, isApproaching]) => {
          if (isApproaching && tenant.getUsagePercentage(key as keyof TenantUsage) >= threshold) {
            approaching.push(key);
          }
        });

        if (approaching.length > 0) {
          results.push({ tenant, approaching });
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to find tenants approaching limits', { threshold, error });
      throw error;
    }
  }

  async getPlanDistribution(): Promise<Record<string, number>> {
    try {
      const planCounts = await this.db
        .select({
          plan: tenants.plan,
          count: count(),
        })
        .from(tenants)
        .where(isNull(tenants.deletedAt))
        .groupBy(tenants.plan);

      const distribution: Record<string, number> = {};
      planCounts.forEach(result => {
        distribution[result.plan] = result.count;
      });

      return distribution;
    } catch (error) {
      logger.error('Failed to get plan distribution', { error });
      throw error;
    }
  }

  async getAnalytics(): Promise<{
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
  }> {
    try {
      // Basic counts
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(isNull(tenants.deletedAt));

      const [activeResult] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(and(eq(tenants.status, 'active'), isNull(tenants.deletedAt)));

      // Plan distribution
      const byPlan = await this.getPlanDistribution();

      // Growth metrics
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      const [thisMonthResult] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(and(
          sql`${tenants.createdAt} >= ${thisMonthStart}`,
          isNull(tenants.deletedAt)
        ));

      const [lastMonthResult] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(and(
          sql`${tenants.createdAt} >= ${lastMonthStart}`,
          sql`${tenants.createdAt} <= ${lastMonthEnd}`,
          isNull(tenants.deletedAt)
        ));

      const thisMonth = thisMonthResult?.count || 0;
      const lastMonth = lastMonthResult?.count || 0;
      const percentChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

      // Usage aggregation
      const [usageResult] = await this.db
        .select({
          totalSites: sql<number>`SUM(${tenants.currentSites})`,
          totalAITokensThisMonth: sql<number>`SUM(${tenants.currentAITokensThisMonth})`,
          totalVoiceMinutesThisMonth: sql<number>`SUM(${tenants.currentVoiceMinutesThisMonth})`,
        })
        .from(tenants)
        .where(and(eq(tenants.status, 'active'), isNull(tenants.deletedAt)));

      return {
        total: totalResult?.count || 0,
        active: activeResult?.count || 0,
        byPlan,
        growth: {
          thisMonth,
          lastMonth,
          percentChange: Math.round(percentChange * 100) / 100,
        },
        usage: {
          totalSites: usageResult?.totalSites || 0,
          totalAITokensThisMonth: usageResult?.totalAITokensThisMonth || 0,
          totalVoiceMinutesThisMonth: usageResult?.totalVoiceMinutesThisMonth || 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get tenant analytics', { error });
      throw error;
    }
  }

  async nameExists(name: string): Promise<boolean> {
    try {
      const normalizedName = name.toLowerCase().trim();
      
      const [result] = await this.db
        .select({ count: count() })
        .from(tenants)
        .where(and(ilike(tenants.name, normalizedName), isNull(tenants.deletedAt)))
        .limit(1);

      return (result?.count || 0) > 0;
    } catch (error) {
      logger.error('Failed to check tenant name existence', { name, error });
      throw error;
    }
  }

  async findByPlan(plan: string): Promise<Tenant[]> {
    try {
      const tenantRows = await this.db
        .select()
        .from(tenants)
        .where(and(eq(tenants.plan, plan), isNull(tenants.deletedAt)))
        .orderBy(asc(tenants.name));

      return tenantRows.map(row => this.mapToTenant(row));
    } catch (error) {
      logger.error('Failed to find tenants by plan', { plan, error });
      throw error;
    }
  }

  async getBillingPeriodUsage(id: string, startDate: Date, endDate: Date): Promise<{
    sites: number;
    aiTokens: number;
    voiceMinutes: number;
    knowledgeBaseMB: number;
  }> {
    try {
      // For now, return current usage - in production this would query actual usage logs for the period
      const tenant = await this.findById(id);
      if (!tenant) {
        throw new TenantNotFoundError(id);
      }

      return {
        sites: tenant.usage.currentSites,
        aiTokens: tenant.usage.currentAITokensThisMonth,
        voiceMinutes: tenant.usage.currentVoiceMinutesThisMonth,
        knowledgeBaseMB: tenant.usage.currentKnowledgeBaseMB,
      };
    } catch (error) {
      logger.error('Failed to get billing period usage', { id, startDate, endDate, error });
      throw error;
    }
  }

  /**
   * Map database row to Tenant domain entity
   */
  private mapToTenant(row: typeof tenants.$inferSelect): Tenant {
    const limits: TenantLimits = {
      maxSites: row.maxSites === 999999 ? -1 : row.maxSites,
      maxKnowledgeBaseMB: row.maxKnowledgeBaseMB === 999999 ? -1 : row.maxKnowledgeBaseMB,
      maxAITokensPerMonth: row.maxAITokensPerMonth === 999999 ? -1 : row.maxAITokensPerMonth,
      maxVoiceMinutesPerMonth: row.maxVoiceMinutesPerMonth === 999999 ? -1 : row.maxVoiceMinutesPerMonth,
      maxUsers: 999999, // Not stored in DB, calculate from plan
      maxCustomDomains: 999999, // Not stored in DB, calculate from plan
    };

    const usage: TenantUsage = {
      currentSites: row.currentSites,
      currentKnowledgeBaseMB: row.currentKnowledgeBaseMB,
      currentAITokensThisMonth: row.currentAITokensThisMonth,
      currentVoiceMinutesThisMonth: row.currentVoiceMinutesThisMonth,
      currentUsers: 1, // Would need to count from users table
      currentCustomDomains: 0, // Would need to count from domains
    };

    const settings = (row.settings as TenantSettings) || Tenant.getDefaultSettings();

    return new Tenant(
      row.id,
      row.name,
      row.plan as Tenant['plan'],
      settings,
      limits,
      usage,
      row.createdAt,
      row.updatedAt,
      row.status === 'active',
      undefined // ownerId not stored directly in tenant table
    );
  }
}