import { Site, CreateSiteData, SitePage, SiteComponent, SiteAsset } from '../entities/Site';

/**
 * Site repository interface
 */
export interface SiteRepository {
  /**
   * Find site by ID
   */
  findById(id: string): Promise<Site | null>;

  /**
   * Find sites by tenant ID
   */
  findByTenantId(tenantId: string): Promise<Site[]>;

  /**
   * Find site by subdomain
   */
  findBySubdomain(subdomain: string): Promise<Site | null>;

  /**
   * Find site by custom domain
   */
  findByCustomDomain(domain: string): Promise<Site | null>;

  /**
   * Create new site
   */
  create(data: CreateSiteData): Promise<Site>;

  /**
   * Update site
   */
  update(id: string, updates: {
    name?: string;
    description?: string;
    configuration?: Partial<Site['configuration']>;
    content?: Partial<Site['content']>;
  }): Promise<Site | null>;

  /**
   * Delete site
   */
  delete(id: string): Promise<boolean>;

  /**
   * Publish site
   */
  publish(id: string, subdomain?: string): Promise<Site | null>;

  /**
   * Unpublish site
   */
  unpublish(id: string): Promise<Site | null>;

  /**
   * Archive site
   */
  archive(id: string): Promise<Site | null>;

  /**
   * Set custom domain
   */
  setCustomDomain(id: string, domain: string): Promise<Site | null>;

  /**
   * Remove custom domain
   */
  removeCustomDomain(id: string): Promise<Site | null>;

  /**
   * Update site content
   */
  updateContent(id: string, content: Partial<Site['content']>): Promise<Site | null>;

  /**
   * Add page to site
   */
  addPage(siteId: string, page: Omit<SitePage, 'id'>): Promise<Site | null>;

  /**
   * Update page
   */
  updatePage(siteId: string, pageId: string, updates: Partial<SitePage>): Promise<Site | null>;

  /**
   * Remove page from site
   */
  removePage(siteId: string, pageId: string): Promise<Site | null>;

  /**
   * Add component to site
   */
  addComponent(siteId: string, component: Omit<SiteComponent, 'id'>): Promise<Site | null>;

  /**
   * Update component
   */
  updateComponent(siteId: string, componentId: string, updates: Partial<SiteComponent>): Promise<Site | null>;

  /**
   * Remove component from site
   */
  removeComponent(siteId: string, componentId: string): Promise<Site | null>;

  /**
   * Add asset to site
   */
  addAsset(siteId: string, asset: Omit<SiteAsset, 'id'>): Promise<Site | null>;

  /**
   * Remove asset from site
   */
  removeAsset(siteId: string, assetId: string): Promise<Site | null>;

  /**
   * Find sites with pagination
   */
  findMany(options: {
    tenantId?: string;
    status?: 'draft' | 'published' | 'archived';
    isPublished?: boolean;
    templateId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    sites: Site[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  /**
   * Search sites by name or description
   */
  search(query: string, tenantId?: string): Promise<Site[]>;

  /**
   * Count sites by tenant
   */
  countByTenant(tenantId: string): Promise<number>;

  /**
   * Count published sites by tenant
   */
  countPublishedByTenant(tenantId: string): Promise<number>;

  /**
   * Find published sites
   */
  findPublished(options?: {
    tenantId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    sites: Site[];
    total: number;
  }>;

  /**
   * Find sites by template
   */
  findByTemplate(templateId: string): Promise<Site[]>;

  /**
   * Check if subdomain exists
   */
  subdomainExists(subdomain: string): Promise<boolean>;

  /**
   * Check if custom domain exists
   */
  customDomainExists(domain: string): Promise<boolean>;

  /**
   * Get site analytics summary
   */
  getAnalyticsSummary(id: string): Promise<{
    pages: number;
    publishedPages: number;
    components: number;
    assets: number;
    voiceEnabled: boolean;
    lastUpdated: Date;
    publishedAt?: Date;
  }>;

  /**
   * Get tenant site statistics
   */
  getTenantStatistics(tenantId: string): Promise<{
    total: number;
    published: number;
    drafts: number;
    archived: number;
    byTemplate: Record<string, number>;
    totalPages: number;
    totalAssets: number;
    withVoiceEnabled: number;
  }>;

  /**
   * Bulk update sites
   */
  bulkUpdate(siteIds: string[], updates: Partial<Site>): Promise<number>;

  /**
   * Clone site
   */
  clone(id: string, newName: string, tenantId: string): Promise<Site | null>;

  /**
   * Export site data
   */
  export(id: string): Promise<{
    site: Site;
    pages: SitePage[];
    components: SiteComponent[];
    assets: SiteAsset[];
  } | null>;

  /**
   * Import site data
   */
  import(tenantId: string, data: {
    site: Omit<Site, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
    pages: Omit<SitePage, 'id'>[];
    components: Omit<SiteComponent, 'id'>[];
    assets: Omit<SiteAsset, 'id'>[];
  }): Promise<Site>;

  /**
   * Get sites requiring knowledge base update
   */
  findRequiringKnowledgeUpdate(): Promise<Site[]>;
}

/**
 * Site repository errors
 */
export class SiteNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Site not found: ${identifier}`);
    this.name = 'SiteNotFoundError';
  }
}

export class SubdomainExistsError extends Error {
  constructor(subdomain: string) {
    super(`Subdomain already exists: ${subdomain}`);
    this.name = 'SubdomainExistsError';
  }
}

export class CustomDomainExistsError extends Error {
  constructor(domain: string) {
    super(`Custom domain already exists: ${domain}`);
    this.name = 'CustomDomainExistsError';
  }
}

export class SiteCreateError extends Error {
  constructor(reason: string) {
    super(`Failed to create site: ${reason}`);
    this.name = 'SiteCreateError';
  }
}

export class SiteUpdateError extends Error {
  constructor(reason: string) {
    super(`Failed to update site: ${reason}`);
    this.name = 'SiteUpdateError';
  }
}

export class SitePublishError extends Error {
  constructor(reason: string) {
    super(`Failed to publish site: ${reason}`);
    this.name = 'SitePublishError';
  }
}

export class SiteContentError extends Error {
  constructor(reason: string) {
    super(`Site content error: ${reason}`);
    this.name = 'SiteContentError';
  }
}