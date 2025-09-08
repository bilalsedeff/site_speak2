import { eq, and, desc, asc, lt, sql, count } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { 
  SiteContract,
  SitemapInfo,
  StructuredDataInfo,
  SiteCapabilities,
  RobotsInfo,
  SiteMetadata
} from '../../modules/ai/domain/entities/SiteContract.js';
import { 
  SiteContractRepository, 
  CreateSiteContractData,
  SiteContractNotFoundError, 
  SiteContractCreateError, 
  SiteContractUpdateError 
} from '../../modules/sites/domain/repositories/SiteContractRepository.js';
import { 
  siteContracts, 
  siteContractHistory, 
  DBSiteContract, 
  NewSiteContract,
  NewSiteContractHistory
} from '../database/schema/site-contracts.js';
import { createLogger } from '../../shared/utils.js';
import crypto from 'crypto';

const logger = createLogger({ service: 'site-contract-repository' });

/**
 * Production-ready SiteContractRepository implementation using Drizzle ORM
 */
export class SiteContractRepositoryImpl implements SiteContractRepository {
  constructor(private db: PostgresJsDatabase<any>) {}

  /**
   * Find site contract by site ID
   */
  async findBySiteId(siteId: string): Promise<SiteContract | null> {
    try {
      const [contractRow] = await this.db
        .select()
        .from(siteContracts)
        .where(and(
          eq(siteContracts.siteId, siteId),
          eq(siteContracts.isArchived, false)
        ))
        .orderBy(desc(siteContracts.version))
        .limit(1);

      if (!contractRow) {
        return null;
      }

      return this.mapToSiteContract(contractRow);
    } catch (error) {
      logger.error('Failed to find site contract by site ID', { 
        error, 
        siteId 
      });
      throw error;
    }
  }

  /**
   * Create new site contract
   */
  async create(
    siteId: string, 
    contract: CreateSiteContractData
  ): Promise<SiteContract> {
    try {
      // Get next version number
      const [versionResult] = await this.db
        .select({ maxVersion: sql<number>`MAX(${siteContracts.version})` })
        .from(siteContracts)
        .where(eq(siteContracts.siteId, siteId));

      const nextVersion = (versionResult?.maxVersion || 0) + 1;

      // Calculate content hash
      const contentHash = this.calculateContentHash(contract);

      const newContract: NewSiteContract = {
        siteId,
        tenantId: contract.tenantId,
        version: nextVersion,
        businessInfo: {}, // Will be empty for now
        pages: [], // Will be empty for now
        actions: [], // Will be empty for now
        navigation: {}, // Not part of entity, set to empty
        forms: {}, // Not part of entity, set to empty
        jsonld: contract.schema?.jsonLd || null,
        sitemap: contract.seo?.sitemap ? { xml: contract.seo.sitemap } : null,
        accessibility: contract.accessibility || {},
        seo: contract.seo || {},
        analytics: null, // Not part of entity
        performance: null, // Not part of entity
        generationConfig: {}, // Not part of entity
        aiInsights: null, // Not part of entity
        suggestions: null, // Not part of entity
        contentHash,
      };

      const [insertedContract] = await this.db
        .insert(siteContracts)
        .values(newContract)
        .returning();

      if (!insertedContract) {
        throw new SiteContractCreateError('Failed to insert contract');
      }

      // Record creation in history
      await this.recordHistoryChange(siteId, insertedContract.id!, 'created', `Created version ${nextVersion}`);

      logger.info('Site contract created successfully', {
        siteId,
        contractId: insertedContract.id,
        version: nextVersion,
      });

      return this.mapToSiteContract(insertedContract);
    } catch (error) {
      logger.error('Failed to create site contract', { 
        error, 
        siteId 
      });
      throw new SiteContractCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Update existing site contract
   */
  async update(siteId: string, updates: Partial<SiteContract>): Promise<SiteContract | null> {
    try {
      // Find current contract
      const currentContract = await this.findBySiteId(siteId);
      if (!currentContract) {
        throw new SiteContractNotFoundError(siteId);
      }

      // Calculate new content hash
      const updatedContent = { ...currentContract, ...updates };
      const contentHash = this.calculateContentHash(updatedContent);

      // Prepare update data mapping entity fields to database columns
      const updateData: Partial<NewSiteContract> = {
        contentHash,
      };

      // Map domain properties to database columns  
      if (updates.sitemap !== undefined) {
        updateData.sitemap = updates.sitemap.exists ? 
          { xml: updates.sitemap.url || '' } : null;
      }
      if (updates.structuredData !== undefined) {
        updateData.jsonld = Object.values(updates.structuredData.schemas);
      }
      if (updates.metadata !== undefined) {
        updateData.seo = updates.metadata;
      }

      const [updatedContract] = await this.db
        .update(siteContracts)
        .set(updateData)
        .where(and(
          eq(siteContracts.siteId, siteId),
          eq(siteContracts.isArchived, false)
        ))
        .returning();

      if (!updatedContract) {
        return null;
      }

      // Record update in history
      await this.recordHistoryChange(
        siteId, 
        updatedContract.id!, 
        'updated', 
        `Updated contract with ${Object.keys(updates).join(', ')}`
      );

      logger.info('Site contract updated successfully', {
        siteId,
        contractId: updatedContract.id,
        updatedFields: Object.keys(updates),
      });

      return this.mapToSiteContract(updatedContract);
    } catch (error) {
      logger.error('Failed to update site contract', { 
        error, 
        siteId, 
        updates: Object.keys(updates) 
      });
      throw new SiteContractUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Delete site contract
   */
  async delete(siteId: string): Promise<boolean> {
    try {
      // Archive instead of hard delete for audit trail
      const [archivedContract] = await this.db
        .update(siteContracts)
        .set({ 
          isArchived: true,
          updatedAt: sql`NOW()`,
        })
        .where(and(
          eq(siteContracts.siteId, siteId),
          eq(siteContracts.isArchived, false)
        ))
        .returning();

      if (!archivedContract) {
        return false;
      }

      // Record deletion in history
      await this.recordHistoryChange(siteId, archivedContract.id!, 'archived', 'Contract archived');

      logger.info('Site contract archived successfully', {
        siteId,
        contractId: archivedContract.id,
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete site contract', { 
        error, 
        siteId 
      });
      throw error;
    }
  }

  /**
   * Find contracts by tenant ID with pagination
   */
  async findByTenantId(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    contracts: SiteContract[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100);
      const offset = (page - 1) * limit;
      const sortBy = options.sortBy || 'updatedAt';
      const sortOrder = options.sortOrder || 'desc';

      // Build sort column reference
      const sortColumn = sortBy === 'updatedAt' ? siteContracts.updatedAt : siteContracts.createdAt;
      const orderFn = sortOrder === 'asc' ? asc : desc;

      // Get total count
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(siteContracts)
        .where(and(
          eq(siteContracts.tenantId, tenantId),
          eq(siteContracts.isArchived, false)
        ));

      const total = totalResult?.count || 0;

      // Get paginated results
      const contractRows = await this.db
        .select()
        .from(siteContracts)
        .where(and(
          eq(siteContracts.tenantId, tenantId),
          eq(siteContracts.isArchived, false)
        ))
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      const contracts = contractRows.map(row => this.mapToSiteContract(row));

      logger.debug('Retrieved site contracts by tenant', {
        tenantId,
        page,
        limit,
        total,
        returned: contracts.length,
      });

      return {
        contracts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error('Failed to find site contracts by tenant', { 
        error, 
        tenantId, 
        options 
      });
      throw error;
    }
  }

  /**
   * Search contracts by name or description
   */
  async search(query: string, tenantId?: string): Promise<SiteContract[]> {
    try {
      const searchConditions = [
        eq(siteContracts.isArchived, false),
        sql`(
          ${siteContracts.businessInfo}->>'name' ILIKE ${`%${query}%`} OR
          ${siteContracts.businessInfo}->>'description' ILIKE ${`%${query}%`}
        )`,
      ];

      if (tenantId) {
        searchConditions.push(eq(siteContracts.tenantId, tenantId));
      }

      const contractRows = await this.db
        .select()
        .from(siteContracts)
        .where(and(...searchConditions))
        .orderBy(desc(siteContracts.updatedAt))
        .limit(50);

      const contracts = contractRows.map(row => this.mapToSiteContract(row));

      logger.debug('Site contract search completed', {
        query,
        tenantId,
        resultCount: contracts.length,
      });

      return contracts;
    } catch (error) {
      logger.error('Failed to search site contracts', { 
        error, 
        query, 
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Find contracts that need regeneration
   */
  async findOutdated(olderThanDays: number): Promise<SiteContract[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const contractRows = await this.db
        .select()
        .from(siteContracts)
        .where(and(
          eq(siteContracts.isArchived, false),
          lt(siteContracts.updatedAt, cutoffDate)
        ))
        .orderBy(asc(siteContracts.updatedAt));

      const contracts = contractRows.map(row => this.mapToSiteContract(row));

      logger.debug('Found outdated site contracts', {
        olderThanDays,
        cutoffDate,
        count: contracts.length,
      });

      return contracts;
    } catch (error) {
      logger.error('Failed to find outdated site contracts', { 
        error, 
        olderThanDays 
      });
      throw error;
    }
  }

  /**
   * Get contract version history
   */
  async getVersionHistory(siteId: string): Promise<SiteContract[]> {
    try {
      const contractRows = await this.db
        .select()
        .from(siteContracts)
        .where(eq(siteContracts.siteId, siteId))
        .orderBy(desc(siteContracts.version));

      const contracts = contractRows.map(row => this.mapToSiteContract(row));

      logger.debug('Retrieved contract version history', {
        siteId,
        versionCount: contracts.length,
      });

      return contracts;
    } catch (error) {
      logger.error('Failed to get contract version history', { 
        error, 
        siteId 
      });
      throw error;
    }
  }

  /**
   * Archive old contract versions
   */
  async archiveOldVersions(siteId: string, keepLatestN: number): Promise<number> {
    try {
      // Get versions to archive
      const versionsToArchive = await this.db
        .select({ id: siteContracts.id })
        .from(siteContracts)
        .where(and(
          eq(siteContracts.siteId, siteId),
          eq(siteContracts.isArchived, false)
        ))
        .orderBy(desc(siteContracts.version))
        .offset(keepLatestN);

      if (versionsToArchive.length === 0) {
        return 0;
      }

      const idsToArchive = versionsToArchive.map(v => v.id!);

      // Archive old versions
      const archivedContracts = await this.db
        .update(siteContracts)
        .set({ 
          isArchived: true,
          updatedAt: sql`NOW()`,
        })
        .where(sql`${siteContracts.id} = ANY(${idsToArchive})`)
        .returning();

      logger.info('Archived old contract versions', {
        siteId,
        keepLatestN,
        archivedCount: archivedContracts.length,
      });

      return archivedContracts.length;
    } catch (error) {
      logger.error('Failed to archive old contract versions', { 
        error, 
        siteId, 
        keepLatestN 
      });
      throw error;
    }
  }

  /**
   * Map database row to domain entity
   */
  private mapToSiteContract(row: DBSiteContract): SiteContract {
    // Create a simple site contract with the AI module's constructor signature
    const baseUrl = (row.seo as any)?.baseUrl || `https://site-${row.siteId}.sitespeak.com`;
    
    const sitemap: SitemapInfo = row.sitemap ? {
      exists: true,
      url: (row.sitemap as any).xml || `${baseUrl}/sitemap.xml`,
      entries: []
    } : {
      exists: false,
      entries: []
    };

    const structuredData: StructuredDataInfo = {
      schemas: {},
      entities: {}
    };

    const capabilities: SiteCapabilities = {
      actions: [],
      forms: [],
      apis: [],
      features: []
    };

    const robots: RobotsInfo = {
      exists: false,
      rules: new Map(),
      sitemaps: []
    };

    const metadata: SiteMetadata = (row.seo as any) || {};

    return new SiteContract(
      row.siteId,
      row.tenantId,
      baseUrl,
      sitemap,
      structuredData,
      capabilities,
      robots,
      metadata,
      row.version.toString(),
      row.createdAt,
      row.updatedAt
    );
  }

  /**
   * Calculate content hash for change detection
   */
  private calculateContentHash(contract: any): string {
    const contentString = JSON.stringify({
      sitemap: contract.sitemap,
      structuredData: contract.structuredData,
      capabilities: contract.capabilities,
      robots: contract.robots,
      metadata: contract.metadata,
    });
    return crypto.createHash('sha256').update(contentString).digest('hex');
  }

  /**
   * Record a change in the contract history
   */
  private async recordHistoryChange(
    siteId: string,
    contractId: string,
    changeType: string,
    description: string
  ): Promise<void> {
    try {
      const historyRecord: NewSiteContractHistory = {
        siteId,
        contractId,
        changeType,
        changeDescription: description,
      };

      await this.db.insert(siteContractHistory).values(historyRecord);
    } catch (error) {
      // Log error but don't fail the main operation
      logger.warn('Failed to record contract history', { 
        error, 
        siteId, 
        contractId, 
        changeType 
      });
    }
  }
}