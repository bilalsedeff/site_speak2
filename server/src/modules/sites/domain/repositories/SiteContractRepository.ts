import { SiteContract, BusinessInfo, SitePage, SiteAction } from '../entities/SiteContract.js';

/**
 * Data interface for creating site contracts
 */
export interface CreateSiteContractData {
  id: string;
  tenantId: string;
  businessInfo: BusinessInfo;
  pages: SitePage[];
  actions: SiteAction[];
  schema: {
    jsonLd: Record<string, unknown>[];
    openGraph: Record<string, string>;
    twitterCard: Record<string, string>;
  };
  accessibility: {
    wcagLevel: 'A' | 'AA' | 'AAA';
    features: string[];
    testing: {
      lastTested?: Date;
      score?: number;
      issues?: Array<{
        type: string;
        description: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
      }>;
    };
  };
  seo: {
    sitemap: string;
    robotsTxt: string;
    metaTags: Record<string, string>;
    structuredData: Record<string, unknown>[];
  };
}

/**
 * Site Contract Repository interface
 */
export interface SiteContractRepository {
  /**
   * Find site contract by site ID
   */
  findBySiteId(siteId: string): Promise<SiteContract | null>;

  /**
   * Create new site contract
   */
  create(siteId: string, contract: CreateSiteContractData): Promise<SiteContract>;

  /**
   * Update existing site contract
   */
  update(siteId: string, contract: Partial<SiteContract>): Promise<SiteContract | null>;

  /**
   * Delete site contract
   */
  delete(siteId: string): Promise<boolean>;

  /**
   * Find contracts by tenant ID with pagination
   */
  findByTenantId(
    tenantId: string,
    options?: {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    contracts: SiteContract[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  /**
   * Search contracts by name or description
   */
  search(query: string, tenantId?: string): Promise<SiteContract[]>;

  /**
   * Find contracts that need regeneration
   */
  findOutdated(olderThanDays: number): Promise<SiteContract[]>;

  /**
   * Get contract version history
   */
  getVersionHistory(siteId: string): Promise<SiteContract[]>;

  /**
   * Archive old contract versions
   */
  archiveOldVersions(siteId: string, keepLatestN: number): Promise<number>;
}

/**
 * Site Contract repository errors
 */
export class SiteContractNotFoundError extends Error {
  constructor(siteId: string) {
    super(`Site contract not found: ${siteId}`);
    this.name = 'SiteContractNotFoundError';
  }
}

export class SiteContractCreateError extends Error {
  constructor(reason: string) {
    super(`Failed to create site contract: ${reason}`);
    this.name = 'SiteContractCreateError';
  }
}

export class SiteContractUpdateError extends Error {
  constructor(reason: string) {
    super(`Failed to update site contract: ${reason}`);
    this.name = 'SiteContractUpdateError';
  }
}