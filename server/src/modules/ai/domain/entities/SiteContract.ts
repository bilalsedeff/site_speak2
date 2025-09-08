import { z } from 'zod';

/**
 * Site Contract Domain Entity
 * 
 * Represents the comprehensive contract for a site including its structure,
 * capabilities, and metadata. This is the source of truth for crawling
 * and knowledge base population.
 */
export class SiteContract {
  constructor(
    public readonly siteId: string,
    public readonly tenantId: string,
    public readonly baseUrl: string,
    public readonly sitemap: SitemapInfo,
    public readonly structuredData: StructuredDataInfo,
    public readonly capabilities: SiteCapabilities,
    public readonly robots: RobotsInfo,
    public readonly metadata: SiteMetadata,
    public readonly version: string,
    public readonly generatedAt: Date,
    public readonly lastModified: Date
  ) {}

  /**
   * Update contract with new information
   */
  updateContract(updates: Partial<SiteContractUpdates>): SiteContract {
    return new SiteContract(
      this.siteId,
      this.tenantId,
      this.baseUrl,
      updates.sitemap || this.sitemap,
      updates.structuredData || this.structuredData,
      updates.capabilities || this.capabilities,
      updates.robots || this.robots,
      updates.metadata || this.metadata,
      this.incrementVersion(),
      this.generatedAt,
      new Date()
    );
  }

  /**
   * Get canonical URLs for deduplication
   */
  getCanonicalUrls(): Map<string, string> {
    const canonicals = new Map<string, string>();
    
    // Process sitemap entries for canonical URLs
    this.sitemap.entries.forEach(entry => {
      if (entry.canonical && entry.canonical !== entry.loc) {
        canonicals.set(entry.loc, entry.canonical);
      }
    });

    return canonicals;
  }

  /**
   * Get URLs that have changed since last crawl
   */
  getChangedUrls(lastCrawlTime?: Date): SitemapEntry[] {
    if (!lastCrawlTime) {
      return this.sitemap.entries;
    }

    return this.sitemap.entries.filter(entry => {
      return !entry.lastmod || entry.lastmod > lastCrawlTime;
    });
  }

  /**
   * Get priority-ordered URLs for crawling
   */
  getPrioritizedUrls(): SitemapEntry[] {
    return [...this.sitemap.entries].sort((a, b) => {
      const priorityA = a.priority || 0.5;
      const priorityB = b.priority || 0.5;
      return priorityB - priorityA; // Higher priority first
    });
  }

  /**
   * Check if URL is allowed by robots.txt
   */
  isUrlAllowed(url: string, userAgent: string = '*'): boolean {
    const rules = this.robots.rules.get(userAgent) || this.robots.rules.get('*');
    if (!rules) {return true;}

    const path = new URL(url).pathname;

    // Check disallowed paths
    for (const disallow of rules.disallow) {
      if (this.pathMatches(path, disallow)) {
        return false;
      }
    }

    // If there are allow rules, check them
    if (rules.allow.length > 0) {
      for (const allow of rules.allow) {
        if (this.pathMatches(path, allow)) {
          return true;
        }
      }
      return false; // Not explicitly allowed
    }

    return true; // No specific disallow, allowed by default
  }

  /**
   * Get crawl delay for user agent
   */
  getCrawlDelay(userAgent: string = '*'): number {
    const rules = this.robots.rules.get(userAgent) || this.robots.rules.get('*');
    return rules?.crawlDelay || 1000; // Default 1 second
  }

  /**
   * Generate sitemap.xml content
   */
  generateSitemap(): string {
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    this.sitemap.entries.forEach(entry => {
      sitemap += '  <url>\n';
      sitemap += `    <loc>${entry.loc}</loc>\n`;
      if (entry.lastmod) {
        sitemap += `    <lastmod>${entry.lastmod.toISOString().split('T')[0]}</lastmod>\n`;
      }
      if (entry.changefreq) {
        sitemap += `    <changefreq>${entry.changefreq}</changefreq>\n`;
      }
      if (entry.priority) {
        sitemap += `    <priority>${entry.priority}</priority>\n`;
      }
      sitemap += '  </url>\n';
    });
    
    sitemap += '</urlset>';
    return sitemap;
  }

  /**
   * Generate robots.txt content
   */
  generateRobotsTxt(): string {
    let robots = '';
    
    this.robots.rules.forEach((rules, userAgent) => {
      robots += `User-agent: ${userAgent}\n`;
      
      rules.allow.forEach(allow => {
        robots += `Allow: ${allow}\n`;
      });
      
      rules.disallow.forEach(disallow => {
        robots += `Disallow: ${disallow}\n`;
      });
      
      if (rules.crawlDelay) {
        robots += `Crawl-delay: ${rules.crawlDelay}\n`;
      }
      
      robots += '\n';
    });
    
    this.robots.sitemaps.forEach(sitemap => {
      robots += `Sitemap: ${sitemap}\n`;
    });
    
    return robots.trim();
  }

  /**
   * Generate web manifest content
   */
  generateWebManifest(): Record<string, unknown> {
    return {
      name: this.metadata.title || 'SiteSpeak Website',
      short_name: this.metadata.title || 'SiteSpeak',
      description: this.metadata.description || 'A website built with SiteSpeak',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: this.metadata.themeColor || '#3B82F6',
      icons: [
        {
          src: this.metadata.favicon || '/favicon.ico',
          sizes: '192x192',
          type: 'image/png'
        }
      ]
    };
  }

  /**
   * Compatibility getters for legacy code
   */
  get id(): string {
    return this.siteId;
  }

  get pages(): Array<{ id: string; name: string; path: string; title: string }> {
    return this.sitemap.entries.map(entry => ({
      id: entry.loc.replace(/[^a-zA-Z0-9]/g, ''),
      name: entry.loc.split('/').pop() || 'page',
      path: new URL(entry.loc).pathname,
      title: new URL(entry.loc).pathname.replace('/', '').replace(/-/g, ' ') || 'Home'
    }));
  }

  get actions(): Array<{ id: string; name: string; type: string }> {
    return this.capabilities.actions.map(action => ({
      id: action.id,
      name: action.label,
      type: action.type
    }));
  }

  get businessInfo(): Record<string, unknown> {
    return {
      name: this.metadata.title || 'Business',
      description: this.metadata.description || '',
      website: this.baseUrl
    };
  }

  get schema(): Record<string, unknown> {
    return {
      jsonLd: Object.values(this.structuredData.schemas),
      openGraph: {},
      twitterCard: {}
    };
  }

  get accessibility(): Record<string, unknown> {
    return {
      wcagLevel: 'AA',
      features: ['alt-text', 'semantic-html', 'keyboard-navigation'],
      testing: { score: 85, issues: [] }
    };
  }

  get seo(): Record<string, unknown> {
    return {
      sitemap: this.sitemap.url,
      robotsTxt: `${this.baseUrl}/robots.txt`,
      metaTags: this.metadata
    };
  }

  get createdAt(): Date {
    return this.generatedAt;
  }

  get updatedAt(): Date {
    return this.lastModified;
  }

  /**
   * Get actions for a specific page
   */
  getPageActions(pageId: string): Array<{ 
    id: string; 
    name: string; 
    type: string; 
    description: string; 
    requiresAuth: boolean; 
    metadata: Record<string, unknown> 
  }> {
    // Filter actions that are relevant to this page
    return this.capabilities.actions
      .filter(action => action.selector && action.selector.includes(pageId))
      .map(action => ({
        id: action.id,
        name: action.label,
        type: action.type,
        description: `${action.type} action: ${action.label}`,
        requiresAuth: false,
        metadata: { selector: action.selector, parameters: action.parameters }
      }));
  }

  /**
   * Get contract summary
   */
  getSummary(): Record<string, unknown> {
    return {
      siteId: this.siteId,
      tenantId: this.tenantId,
      version: this.version,
      urlCount: this.sitemap.entries.length,
      actionCount: this.capabilities.actions.length,
      hasRobotsTxt: this.robots.exists,
      hasSitemap: this.sitemap.exists,
      lastModified: this.lastModified,
      generatedAt: this.generatedAt
    };
  }

  /**
   * Get contract statistics
   */
  getStatistics(): SiteContractStats {
    return {
      siteId: this.siteId,
      version: this.version,
      urlCount: this.sitemap.entries.length,
      structuredDataTypes: Object.keys(this.structuredData.schemas).length,
      actionCount: this.capabilities.actions.length,
      formCount: this.capabilities.forms.length,
      hasRobotsTxt: this.robots.exists,
      hasSitemap: this.sitemap.exists,
      lastModified: this.lastModified,
      generatedAt: this.generatedAt
    };
  }

  /**
   * Validate contract completeness
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!this.baseUrl) {errors.push('Base URL is required');}
    if (!this.siteId) {errors.push('Site ID is required');}
    if (!this.tenantId) {errors.push('Tenant ID is required');}

    // Sitemap validation
    if (this.sitemap.exists && this.sitemap.entries.length === 0) {
      warnings.push('Sitemap exists but contains no entries');
    }

    // Structured data validation
    if (Object.keys(this.structuredData.schemas).length === 0) {
      warnings.push('No structured data schemas found');
    }

    // Robots validation
    if (!this.robots.exists) {
      warnings.push('robots.txt not found');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Increment version number
   */
  private incrementVersion(): string {
    const parts = this.version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    return parts.join('.');
  }

  /**
   * Check if path matches robots pattern
   */
  private pathMatches(path: string, pattern: string): boolean {
    // Simple wildcard matching for robots.txt patterns
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '\\?');
    return new RegExp('^' + regexPattern).test(path);
  }
}

/**
 * Sitemap information
 */
export interface SitemapInfo {
  exists: boolean;
  url?: string;
  lastModified?: Date;
  entries: SitemapEntry[];
}

/**
 * Sitemap entry
 */
export interface SitemapEntry {
  loc: string;
  lastmod?: Date;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number; // 0.0 to 1.0
  canonical?: string; // Canonical URL if different
}

/**
 * Structured data information
 */
export interface StructuredDataInfo {
  schemas: Record<string, JsonLdSchema>; // Schema type -> schema definition
  entities: Record<string, ExtractedEntity[]>; // URL -> entities
}

/**
 * JSON-LD schema definition
 */
export interface JsonLdSchema {
  '@type': string;
  '@context': string;
  requiredFields: string[];
  optionalFields: string[];
  examples: any[];
}

/**
 * Extracted entity
 */
export interface ExtractedEntity {
  '@type': string;
  '@id'?: string;
  url: string;
  properties: Record<string, any>;
  confidence: number;
}

/**
 * Site capabilities
 */
export interface SiteCapabilities {
  actions: ActionCapability[];
  forms: FormCapability[];
  apis: ApiCapability[];
  features: string[];
}

/**
 * Action capability
 */
export interface ActionCapability {
  id: string;
  type: string;
  label: string;
  selector: string;
  parameters: Record<string, any>;
  confirmation?: boolean;
  sideEffects: string[];
}

/**
 * Form capability
 */
export interface FormCapability {
  id: string;
  action: string;
  method: string;
  fields: FormField[];
  validation: Record<string, any>;
  submitButton?: string;
}

/**
 * Form field
 */
export interface FormField {
  name: string;
  type: string;
  label?: string;
  required: boolean;
  validation?: Record<string, any>;
  options?: string[];
}

/**
 * API capability
 */
export interface ApiCapability {
  type: 'rest' | 'graphql' | 'webhook';
  baseUrl: string;
  endpoints?: RestEndpoint[];
  schema?: string; // GraphQL schema or OpenAPI spec
  authentication?: string;
}

/**
 * REST endpoint
 */
export interface RestEndpoint {
  path: string;
  method: string;
  description?: string;
  parameters?: Record<string, any>;
  response?: Record<string, any>;
}

/**
 * Robots.txt information
 */
export interface RobotsInfo {
  exists: boolean;
  url?: string;
  lastModified?: Date;
  rules: Map<string, RobotsRules>; // user-agent -> rules
  sitemaps: string[];
}

/**
 * Robots rules for user agent
 */
export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelay?: number;
}

/**
 * Site metadata
 */
export interface SiteMetadata {
  title?: string;
  description?: string;
  language?: string;
  favicon?: string;
  author?: string;
  keywords?: string[];
  socialMedia?: Record<string, string>;
  themeColor?: string;
  generator?: string;
}

/**
 * Update interfaces
 */
export interface SiteContractUpdates {
  sitemap?: SitemapInfo;
  structuredData?: StructuredDataInfo;
  capabilities?: SiteCapabilities;
  robots?: RobotsInfo;
  metadata?: SiteMetadata;
}

/**
 * Statistics interface
 */
export interface SiteContractStats {
  siteId: string;
  version: string;
  urlCount: number;
  structuredDataTypes: number;
  actionCount: number;
  formCount: number;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  lastModified: Date;
  generatedAt: Date;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validation schemas
 */
export const SitemapEntrySchema = z.object({
  loc: z.string().url(),
  lastmod: z.date().optional(),
  changefreq: z.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).optional(),
  priority: z.number().min(0).max(1).optional(),
  canonical: z.string().url().optional()
});

export const SitemapInfoSchema = z.object({
  exists: z.boolean(),
  url: z.string().url().optional(),
  lastModified: z.date().optional(),
  entries: z.array(SitemapEntrySchema)
});

export const SiteMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  favicon: z.string().url().optional(),
  author: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  socialMedia: z.record(z.string()).optional(),
  themeColor: z.string().optional(),
  generator: z.string().optional()
});

/**
 * Factory function for creating site contracts
 */
export function createSiteContract(
  siteId: string,
  tenantId: string,
  baseUrl: string,
  data: Partial<SiteContractUpdates> = {}
): SiteContract {
  const now = new Date();
  
  const defaultSitemap: SitemapInfo = {
    exists: false,
    entries: []
  };

  const defaultStructuredData: StructuredDataInfo = {
    schemas: {},
    entities: {}
  };

  const defaultCapabilities: SiteCapabilities = {
    actions: [],
    forms: [],
    apis: [],
    features: []
  };

  const defaultRobots: RobotsInfo = {
    exists: false,
    rules: new Map(),
    sitemaps: []
  };

  const defaultMetadata: SiteMetadata = {};

  return new SiteContract(
    siteId,
    tenantId,
    baseUrl,
    data.sitemap || defaultSitemap,
    data.structuredData || defaultStructuredData,
    data.capabilities || defaultCapabilities,
    data.robots || defaultRobots,
    data.metadata || defaultMetadata,
    '1.0.0',
    now,
    now
  );
}