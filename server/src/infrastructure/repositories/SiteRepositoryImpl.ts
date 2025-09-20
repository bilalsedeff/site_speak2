import { eq, and, desc, asc, count, isNull, sql, inArray } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  Site,
  CreateSiteData,
  SitePage,
  SiteComponent,
  SiteAsset,
  SiteConfiguration,
  SiteContent,
  getDefaultSiteConfiguration
} from '../../domain/entities/Site';
import {
  SiteRepository,
  SubdomainExistsError,
  CustomDomainExistsError,
  SiteCreateError,
  SiteUpdateError,
  SitePublishError,
  SiteContentError
} from '../../domain/repositories/SiteRepository';
import { sites } from '../database/schema/sites';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'site-repository' });

/**
 * Production-ready SiteRepository implementation using Drizzle ORM
 * Supports full CRUD operations with proper error handling and logging
 */
export class SiteRepositoryImpl implements SiteRepository {
  constructor(private db: PostgresJsDatabase<any>) {}

  async findById(id: string): Promise<Site | null> {
    try {
      const [siteRow] = await this.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .limit(1);

      if (!siteRow) {
        return null;
      }

      return this.mapToSite(siteRow);
    } catch (error) {
      logger.error('Failed to find site by ID', { id, error });
      throw error;
    }
  }

  async findByTenantId(tenantId: string): Promise<Site[]> {
    try {
      const siteRows = await this.db
        .select()
        .from(sites)
        .where(and(eq(sites.tenantId, tenantId), isNull(sites.deletedAt)))
        .orderBy(desc(sites.updatedAt));

      return siteRows.map(row => this.mapToSite(row));
    } catch (error) {
      logger.error('Failed to find sites by tenant ID', { tenantId, error });
      throw error;
    }
  }

  async findBySubdomain(subdomain: string): Promise<Site | null> {
    try {
      const [siteRow] = await this.db
        .select()
        .from(sites)
        .where(and(eq(sites.subdomain, subdomain), isNull(sites.deletedAt)))
        .limit(1);

      if (!siteRow) {
        return null;
      }

      return this.mapToSite(siteRow);
    } catch (error) {
      logger.error('Failed to find site by subdomain', { subdomain, error });
      throw error;
    }
  }

  async findByCustomDomain(domain: string): Promise<Site | null> {
    try {
      const [siteRow] = await this.db
        .select()
        .from(sites)
        .where(and(eq(sites.customDomain, domain), isNull(sites.deletedAt)))
        .limit(1);

      if (!siteRow) {
        return null;
      }

      return this.mapToSite(siteRow);
    } catch (error) {
      logger.error('Failed to find site by custom domain', { domain, error });
      throw error;
    }
  }

  async create(data: CreateSiteData): Promise<Site> {
    try {
      const siteData = {
        name: data.name,
        description: data.description,
        slug: this.generateSlugFromName(data.name),
        tenantId: data.tenantId,
        userId: data.tenantId, // Using tenantId as userId for now
        templateId: data.templateId,
        category: 'business' as const,
        configuration: data.configuration ?
          { ...getDefaultSiteConfiguration(), ...data.configuration } :
          getDefaultSiteConfiguration(),
        theme: {},
        seoSettings: {},
        pages: [],
        components: [],
        assets: [],
        voiceAgentConfig: {},
        metadata: {},
      };

      const result = await this.db
        .insert(sites)
        .values(siteData)
        .returning();

      const createdSite = result[0];
      if (!createdSite) {
        throw new SiteCreateError('Failed to create site: no data returned');
      }

      logger.info('Site created successfully', { siteId: createdSite.id, tenantId: data.tenantId });
      return this.mapToSite(createdSite);
    } catch (error) {
      logger.error('Failed to create site', { data, error });
      throw new SiteCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async update(id: string, updates: {
    name?: string;
    description?: string;
    configuration?: Partial<SiteConfiguration>;
    content?: Partial<SiteContent>;
  }): Promise<Site | null> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (updates.name) {
        updateData.name = updates.name;
      }
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }
      if (updates.configuration) {
        // Merge with existing configuration
        const existing = await this.findById(id);
        if (existing) {
          updateData.configuration = { ...existing.configuration, ...updates.configuration };
        } else {
          updateData.configuration = updates.configuration;
        }
      }
      if (updates.content) {
        // Handle content updates
        const existing = await this.findById(id);
        if (existing) {
          if (updates.content.pages) {
            updateData.pages = updates.content.pages;
          }
          if (updates.content.components) {
            updateData.components = updates.content.components;
          }
          if (updates.content.assets) {
            updateData.assets = updates.content.assets;
          }
        }
      }

      const [updatedSite] = await this.db
        .update(sites)
        .set(updateData)
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!updatedSite) {
        return null;
      }

      logger.info('Site updated successfully', { siteId: id });
      return this.mapToSite(updatedSite);
    } catch (error) {
      logger.error('Failed to update site', { id, updates, error });
      throw new SiteUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const [deletedSite] = await this.db
        .update(sites)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      const success = !!deletedSite;
      if (success) {
        logger.info('Site deleted successfully', { siteId: id });
      }
      return success;
    } catch (error) {
      logger.error('Failed to delete site', { id, error });
      throw error;
    }
  }

  async publish(id: string, subdomain?: string): Promise<Site | null> {
    try {
      // Check if subdomain is already taken
      if (subdomain && await this.subdomainExists(subdomain)) {
        throw new SubdomainExistsError(subdomain);
      }

      const updateData: any = {
        status: 'published',
        isPublic: true,
        publishedAt: new Date(),
        lastPublishedAt: new Date(),
        updatedAt: new Date(),
      };

      if (subdomain) {
        updateData.subdomain = subdomain;
      }

      const [publishedSite] = await this.db
        .update(sites)
        .set(updateData)
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!publishedSite) {
        return null;
      }

      logger.info('Site published successfully', { siteId: id, subdomain });
      return this.mapToSite(publishedSite);
    } catch (error) {
      logger.error('Failed to publish site', { id, subdomain, error });
      throw new SitePublishError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async unpublish(id: string): Promise<Site | null> {
    try {
      const [unpublishedSite] = await this.db
        .update(sites)
        .set({
          status: 'draft',
          isPublic: false,
          updatedAt: new Date()
        })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!unpublishedSite) {
        return null;
      }

      logger.info('Site unpublished successfully', { siteId: id });
      return this.mapToSite(unpublishedSite);
    } catch (error) {
      logger.error('Failed to unpublish site', { id, error });
      throw error;
    }
  }

  async archive(id: string): Promise<Site | null> {
    try {
      const [archivedSite] = await this.db
        .update(sites)
        .set({
          status: 'archived',
          isPublic: false,
          updatedAt: new Date()
        })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!archivedSite) {
        return null;
      }

      logger.info('Site archived successfully', { siteId: id });
      return this.mapToSite(archivedSite);
    } catch (error) {
      logger.error('Failed to archive site', { id, error });
      throw error;
    }
  }

  async setCustomDomain(id: string, domain: string): Promise<Site | null> {
    try {
      // Check if custom domain is already taken
      if (await this.customDomainExists(domain)) {
        throw new CustomDomainExistsError(domain);
      }

      const [updatedSite] = await this.db
        .update(sites)
        .set({
          customDomain: domain,
          customDomainVerified: false,
          updatedAt: new Date()
        })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!updatedSite) {
        return null;
      }

      logger.info('Custom domain set successfully', { siteId: id, domain });
      return this.mapToSite(updatedSite);
    } catch (error) {
      logger.error('Failed to set custom domain', { id, domain, error });
      throw error;
    }
  }

  async removeCustomDomain(id: string): Promise<Site | null> {
    try {
      const [updatedSite] = await this.db
        .update(sites)
        .set({
          customDomain: null,
          customDomainVerified: false,
          updatedAt: new Date()
        })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!updatedSite) {
        return null;
      }

      logger.info('Custom domain removed successfully', { siteId: id });
      return this.mapToSite(updatedSite);
    } catch (error) {
      logger.error('Failed to remove custom domain', { id, error });
      throw error;
    }
  }

  async updateContent(id: string, content: Partial<SiteContent>): Promise<Site | null> {
    try {
      const updateData: any = {
        updatedAt: new Date()
      };

      if (content.pages) {
        updateData.pages = content.pages;
      }
      if (content.components) {
        updateData.components = content.components;
      }
      if (content.assets) {
        updateData.assets = content.assets;
      }

      const [updatedSite] = await this.db
        .update(sites)
        .set(updateData)
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!updatedSite) {
        return null;
      }

      logger.info('Site content updated successfully', { siteId: id });
      return this.mapToSite(updatedSite);
    } catch (error) {
      logger.error('Failed to update site content', { id, content, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async addPage(siteId: string, page: Omit<SitePage, 'id'>): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const newPage: SitePage = {
        ...page,
        id: crypto.randomUUID(),
      };

      const updatedPages = [...site.content.pages, newPage];
      return this.updateContent(siteId, { pages: updatedPages });
    } catch (error) {
      logger.error('Failed to add page to site', { siteId, page, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async updatePage(siteId: string, pageId: string, updates: Partial<SitePage>): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const updatedPages = site.content.pages.map(page =>
        page.id === pageId ? { ...page, ...updates } : page
      );

      return this.updateContent(siteId, { pages: updatedPages });
    } catch (error) {
      logger.error('Failed to update page', { siteId, pageId, updates, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async removePage(siteId: string, pageId: string): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const updatedPages = site.content.pages.filter(page => page.id !== pageId);
      return this.updateContent(siteId, { pages: updatedPages });
    } catch (error) {
      logger.error('Failed to remove page from site', { siteId, pageId, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async addComponent(siteId: string, component: Omit<SiteComponent, 'id'>): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const newComponent: SiteComponent = {
        ...component,
        id: crypto.randomUUID(),
      };

      const updatedComponents = [...site.content.components, newComponent];
      return this.updateContent(siteId, { components: updatedComponents });
    } catch (error) {
      logger.error('Failed to add component to site', { siteId, component, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async updateComponent(siteId: string, componentId: string, updates: Partial<SiteComponent>): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const updatedComponents = site.content.components.map(component =>
        component.id === componentId ? { ...component, ...updates } : component
      );

      return this.updateContent(siteId, { components: updatedComponents });
    } catch (error) {
      logger.error('Failed to update component', { siteId, componentId, updates, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async removeComponent(siteId: string, componentId: string): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const updatedComponents = site.content.components.filter(component => component.id !== componentId);
      return this.updateContent(siteId, { components: updatedComponents });
    } catch (error) {
      logger.error('Failed to remove component from site', { siteId, componentId, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async addAsset(siteId: string, asset: Omit<SiteAsset, 'id'>): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const newAsset: SiteAsset = {
        ...asset,
        id: crypto.randomUUID(),
      };

      const updatedAssets = [...site.content.assets, newAsset];
      return this.updateContent(siteId, { assets: updatedAssets });
    } catch (error) {
      logger.error('Failed to add asset to site', { siteId, asset, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async removeAsset(siteId: string, assetId: string): Promise<Site | null> {
    try {
      const site = await this.findById(siteId);
      if (!site) {
        return null;
      }

      const updatedAssets = site.content.assets.filter(asset => asset.id !== assetId);
      return this.updateContent(siteId, { assets: updatedAssets });
    } catch (error) {
      logger.error('Failed to remove asset from site', { siteId, assetId, error });
      throw new SiteContentError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async findMany(options: {
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
  }> {
    try {
      const {
        tenantId,
        status,
        isPublished,
        templateId,
        page = 1,
        limit = 10,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;

      const conditions = [isNull(sites.deletedAt)];

      if (tenantId) {
        conditions.push(eq(sites.tenantId, tenantId));
      }
      if (status) {
        conditions.push(eq(sites.status, status));
      }
      if (isPublished !== undefined) {
        conditions.push(eq(sites.isPublic, isPublished));
      }
      if (templateId) {
        conditions.push(eq(sites.templateId, templateId));
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions.length === 1 ? conditions[0] : undefined;

      // Get total count
      const countResult = await (where
        ? this.db.select({ total: count() }).from(sites).where(where)
        : this.db.select({ total: count() }).from(sites));

      const totalResult = countResult[0];
      if (!totalResult) {
        throw new Error('Failed to get total count: no data returned');
      }
      const total = totalResult.total;

      // Get paginated results
      const offset = (page - 1) * limit;

      // Define valid sort fields mapping to ensure type safety
      const validSortFields = {
        'createdAt': sites.createdAt,
        'updatedAt': sites.updatedAt,
        'name': sites.name,
        'status': sites.status,
        'publishedAt': sites.publishedAt,
        'lastPublishedAt': sites.lastPublishedAt,
        'totalViews': sites.totalViews,
        'uniqueVisitors': sites.uniqueVisitors,
        'voiceInteractions': sites.voiceInteractions,
      } as const;

      const sortColumn = validSortFields[sortBy as keyof typeof validSortFields] || sites.updatedAt;
      const orderBy = sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn);

      const siteRows = await (where
        ? this.db.select().from(sites).where(where).orderBy(orderBy).limit(limit).offset(offset)
        : this.db.select().from(sites).orderBy(orderBy).limit(limit).offset(offset));

      const totalPages = Math.ceil(total / limit);

      return {
        sites: siteRows.map(row => this.mapToSite(row)),
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Failed to find sites with pagination', { options, error });
      throw error;
    }
  }

  async search(query: string, tenantId?: string): Promise<Site[]> {
    try {
      const conditions = [
        isNull(sites.deletedAt),
        sql`${sites.name} ILIKE ${'%' + query + '%'} OR ${sites.description} ILIKE ${'%' + query + '%'}`
      ];

      if (tenantId) {
        conditions.push(eq(sites.tenantId, tenantId));
      }

      const siteRows = await this.db
        .select()
        .from(sites)
        .where(and(...conditions))
        .orderBy(desc(sites.updatedAt))
        .limit(50);

      return siteRows.map(row => this.mapToSite(row));
    } catch (error) {
      logger.error('Failed to search sites', { query, tenantId, error });
      throw error;
    }
  }

  async countByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ total: count() })
        .from(sites)
        .where(and(eq(sites.tenantId, tenantId), isNull(sites.deletedAt)));

      const countResult = result[0];
      if (!countResult) {
        throw new Error('Failed to count sites: no data returned');
      }

      return countResult.total;
    } catch (error) {
      logger.error('Failed to count sites by tenant', { tenantId, error });
      throw error;
    }
  }

  async countPublishedByTenant(tenantId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ total: count() })
        .from(sites)
        .where(and(
          eq(sites.tenantId, tenantId),
          eq(sites.status, 'published'),
          isNull(sites.deletedAt)
        ));

      const countResult = result[0];
      if (!countResult) {
        throw new Error('Failed to count published sites: no data returned');
      }

      return countResult.total;
    } catch (error) {
      logger.error('Failed to count published sites by tenant', { tenantId, error });
      throw error;
    }
  }

  async findPublished(options?: {
    tenantId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    sites: Site[];
    total: number;
  }> {
    try {
      const { tenantId, page = 1, limit = 10 } = options || {};

      const conditions = [
        eq(sites.status, 'published'),
        isNull(sites.deletedAt)
      ];

      if (tenantId) {
        conditions.push(eq(sites.tenantId, tenantId));
      }

      const where = and(...conditions);

      // Get total count
      const countResult = await this.db
        .select({ total: count() })
        .from(sites)
        .where(where);

      const totalResult = countResult[0];
      if (!totalResult) {
        throw new Error('Failed to get total count: no data returned');
      }
      const total = totalResult.total;

      // Get paginated results
      const offset = (page - 1) * limit;

      const siteRows = await this.db
        .select()
        .from(sites)
        .where(where)
        .orderBy(desc(sites.publishedAt))
        .limit(limit)
        .offset(offset);

      return {
        sites: siteRows.map(row => this.mapToSite(row)),
        total,
      };
    } catch (error) {
      logger.error('Failed to find published sites', { options, error });
      throw error;
    }
  }

  async findByTemplate(templateId: string): Promise<Site[]> {
    try {
      const siteRows = await this.db
        .select()
        .from(sites)
        .where(and(eq(sites.templateId, templateId), isNull(sites.deletedAt)))
        .orderBy(desc(sites.createdAt));

      return siteRows.map(row => this.mapToSite(row));
    } catch (error) {
      logger.error('Failed to find sites by template', { templateId, error });
      throw error;
    }
  }

  async subdomainExists(subdomain: string): Promise<boolean> {
    try {
      const queryResult = await this.db
        .select({ count: count() })
        .from(sites)
        .where(and(eq(sites.subdomain, subdomain), isNull(sites.deletedAt)))
        .limit(1);

      const result = queryResult[0];
      if (!result) {
        return false;
      }

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check subdomain existence', { subdomain, error });
      throw error;
    }
  }

  async customDomainExists(domain: string): Promise<boolean> {
    try {
      const queryResult = await this.db
        .select({ count: count() })
        .from(sites)
        .where(and(eq(sites.customDomain, domain), isNull(sites.deletedAt)))
        .limit(1);

      const result = queryResult[0];
      if (!result) {
        return false;
      }

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check custom domain existence', { domain, error });
      throw error;
    }
  }

  // Simplified implementations for remaining methods
  async getAnalyticsSummary(id: string): Promise<any> {
    const site = await this.findById(id);
    if (!site) {
      return null;
    }
    return site.getAnalyticsSummary();
  }

  async getTenantStatistics(tenantId: string): Promise<any> {
    const sites = await this.findByTenantId(tenantId);
    return {
      total: sites.length,
      published: sites.filter(s => s.status === 'published').length,
      drafts: sites.filter(s => s.status === 'draft').length,
      archived: sites.filter(s => s.status === 'archived').length,
      byTemplate: {},
      totalPages: sites.reduce((sum, s) => sum + s.getPagesCount(), 0),
      totalAssets: sites.reduce((sum, s) => sum + s.content.assets.length, 0),
      withVoiceEnabled: sites.filter(s => s.hasVoiceEnabled()).length,
    };
  }

  async bulkUpdate(siteIds: string[], updates: Partial<Site>): Promise<number> {
    try {
      await this.db
        .update(sites)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(inArray(sites.id, siteIds), isNull(sites.deletedAt)));

      // Drizzle doesn't provide rowCount directly, so we assume the operation succeeded
      // if no error was thrown. In a production environment, you might want to verify
      // the update by checking the affected rows separately if needed.
      return siteIds.length;
    } catch (error) {
      logger.error('Failed to bulk update sites', { siteIds, updates, error });
      throw error;
    }
  }

  async clone(id: string, newName: string, tenantId: string): Promise<Site | null> {
    const originalSite = await this.findById(id);
    if (!originalSite) {
      return null;
    }

    const cloneData: CreateSiteData = {
      name: newName,
      description: `Clone of ${originalSite.name}`,
      tenantId,
      templateId: originalSite.templateId,
      configuration: originalSite.configuration,
    };

    return this.create(cloneData);
  }

  async export(id: string): Promise<any> {
    const site = await this.findById(id);
    if (!site) {
      return null;
    }

    return {
      site,
      pages: site.content.pages,
      components: site.content.components,
      assets: site.content.assets,
    };
  }

  async import(tenantId: string, data: any): Promise<Site> {
    const createData: CreateSiteData = {
      name: data.site.name,
      description: data.site.description,
      tenantId,
      templateId: data.site.templateId,
      configuration: data.site.configuration,
    };

    return this.create(createData);
  }

  async findRequiringKnowledgeUpdate(): Promise<Site[]> {
    try {
      const siteRows = await this.db
        .select()
        .from(sites)
        .where(and(
          eq(sites.status, 'published'),
          isNull(sites.deletedAt),
          sql`${sites.lastCrawledAt} IS NULL OR ${sites.lastCrawledAt} < ${sites.updatedAt}`
        ))
        .orderBy(asc(sites.lastCrawledAt))
        .limit(10);

      return siteRows.map(row => this.mapToSite(row));
    } catch (error) {
      logger.error('Failed to find sites requiring knowledge update', { error });
      throw error;
    }
  }

  /**
   * Map database row to Site domain entity
   */
  private mapToSite(row: any): Site {
    const configuration: SiteConfiguration = {
      ...getDefaultSiteConfiguration(),
      ...(row.configuration || {}),
    };

    const content: SiteContent = {
      pages: Array.isArray(row.pages) ? row.pages : [],
      components: Array.isArray(row.components) ? row.components : [],
      assets: Array.isArray(row.assets) ? row.assets : [],
    };

    return new Site(
      row.id,
      row.name,
      row.description || '',
      row.tenantId,
      row.templateId,
      configuration,
      content,
      row.createdAt,
      row.updatedAt,
      row.publishedAt,
      row.isPublic || false,
      row.subdomain || undefined,
      row.customDomain || undefined,
      row.status || 'draft'
    );
  }

  /**
   * Generate a URL-safe slug from site name
   */
  private generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 50);
  }
}