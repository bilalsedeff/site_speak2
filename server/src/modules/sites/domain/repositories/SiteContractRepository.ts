import { SiteContract } from '../../../ai/domain/entities/SiteContract.js';

/**
 * Site Contract Repository Interface
 */
export interface SiteContractRepository {
  findBySiteId(siteId: string): Promise<SiteContract | null>;
  create(siteId: string, contract: CreateSiteContractData): Promise<SiteContract>;
  update(siteId: string, updates: Partial<SiteContract>): Promise<SiteContract | null>;
  delete(siteId: string): Promise<boolean>;
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
  search(query: string, tenantId?: string): Promise<SiteContract[]>;
  findOutdated(olderThanDays: number): Promise<SiteContract[]>;
  getVersionHistory(siteId: string): Promise<SiteContract[]>;
  archiveOldVersions(siteId: string, keepLatestN: number): Promise<number>;
}

/**
 * Data required to create a new site contract
 */
export interface CreateSiteContractData {
  tenantId: string;
  sitemap?: import('../../../ai/domain/entities/SiteContract.js').SitemapInfo;
  structuredData?: import('../../../ai/domain/entities/SiteContract.js').StructuredDataInfo;
  capabilities?: import('../../../ai/domain/entities/SiteContract.js').SiteCapabilities;
  robots?: import('../../../ai/domain/entities/SiteContract.js').RobotsInfo;
  metadata?: import('../../../ai/domain/entities/SiteContract.js').SiteMetadata;
  schema?: {
    jsonLd?: Record<string, unknown>[];
  };
  accessibility?: unknown;
  seo?: {
    sitemap?: string;
  };
}

/**
 * Repository Error Classes
 */
export class SiteContractNotFoundError extends Error {
  constructor(siteId: string) {
    super(`Site contract not found for site: ${siteId}`);
    this.name = 'SiteContractNotFoundError';
  }
}

export class SiteContractCreateError extends Error {
  constructor(message: string) {
    super(`Failed to create site contract: ${message}`);
    this.name = 'SiteContractCreateError';
  }
}

export class SiteContractUpdateError extends Error {
  constructor(message: string) {
    super(`Failed to update site contract: ${message}`);
    this.name = 'SiteContractUpdateError';
  }
}