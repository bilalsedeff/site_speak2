import { z } from 'zod';

export interface SiteAction {
  id: string;
  name: string;
  description: string;
  type: 'navigation' | 'form_submit' | 'search' | 'filter' | 'cart' | 'booking' | 'contact' | 'custom';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  parameters: ActionParameter[];
  requiresAuth: boolean;
  metadata: {
    label: string;
    icon?: string;
    category: string;
    priority: number; // 1-10, higher is more important
    keywords: string[];
  };
}

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: unknown;
  enum?: unknown[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    format?: 'email' | 'url' | 'phone' | 'date';
  };
}

export interface SitePage {
  id: string;
  name: string;
  path: string;
  title: string;
  description: string;
  keywords: string[];
  sections: PageSection[];
  actions: string[]; // Action IDs available on this page
  metadata: {
    lastModified: Date;
    contentType: 'static' | 'dynamic' | 'form' | 'listing';
    accessibility: {
      hasAltText: boolean;
      hasHeadings: boolean;
      hasLandmarks: boolean;
      colorContrast: 'poor' | 'good' | 'excellent';
    };
  };
}

export interface PageSection {
  id: string;
  type: 'header' | 'hero' | 'content' | 'sidebar' | 'footer' | 'navigation' | 'form' | 'gallery' | 'testimonials' | 'pricing' | 'contact';
  title: string;
  description: string;
  content: SectionContent;
  actions: string[]; // Action IDs available in this section
}

export interface SectionContent {
  text?: string;
  images?: Array<{
    url: string;
    alt: string;
    caption?: string;
  }>;
  links?: Array<{
    url: string;
    text: string;
    type: 'internal' | 'external' | 'anchor';
  }>;
  forms?: Array<{
    id: string;
    name: string;
    fields: FormField[];
    submitAction: string;
  }>;
  data?: Record<string, unknown>; // Structured data for the section
}

export interface FormField {
  name: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select, checkbox, radio
  validation?: ActionParameter['validation'];
}

export interface BusinessInfo {
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  logo?: string;
  contact: {
    email?: string;
    phone?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
    };
    website?: string;
    socialMedia?: Record<string, string>;
  };
  hours?: {
    [day: string]: {
      open: string;
      close: string;
      closed?: boolean;
    };
  };
}

/**
 * Site Contract - Complete site specification for AI understanding
 */
export class SiteContract {
  constructor(
    public readonly id: string,
    public readonly siteId: string,
    public readonly tenantId: string,
    public businessInfo: BusinessInfo,
    public pages: SitePage[],
    public actions: SiteAction[],
    public schema: {
      jsonLd: Record<string, unknown>[];
      openGraph: Record<string, string>;
      twitterCard: Record<string, string>;
    },
    public accessibility: {
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
    },
    public seo: {
      sitemap: string;
      robotsTxt: string;
      metaTags: Record<string, string>;
      structuredData: Record<string, unknown>[];
    },
    public readonly version: string,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /**
   * Update business information
   */
  updateBusinessInfo(businessInfo: Partial<BusinessInfo>): SiteContract {
    return new SiteContract(
      this.id,
      this.siteId,
      this.tenantId,
      { ...this.businessInfo, ...businessInfo },
      this.pages,
      this.actions,
      this.schema,
      this.accessibility,
      this.seo,
      this.version,
      this.createdAt,
      new Date(), // updatedAt
    );
  }

  /**
   * Add or update page
   */
  updatePage(page: SitePage): SiteContract {
    const existingIndex = this.pages.findIndex(p => p.id === page.id);
    const updatedPages = [...this.pages];
    
    if (existingIndex >= 0) {
      updatedPages[existingIndex] = page;
    } else {
      updatedPages.push(page);
    }

    return new SiteContract(
      this.id,
      this.siteId,
      this.tenantId,
      this.businessInfo,
      updatedPages,
      this.actions,
      this.schema,
      this.accessibility,
      this.seo,
      this.version,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Add or update action
   */
  updateAction(action: SiteAction): SiteContract {
    const existingIndex = this.actions.findIndex(a => a.id === action.id);
    const updatedActions = [...this.actions];
    
    if (existingIndex >= 0) {
      updatedActions[existingIndex] = action;
    } else {
      updatedActions.push(action);
    }

    return new SiteContract(
      this.id,
      this.siteId,
      this.tenantId,
      this.businessInfo,
      this.pages,
      updatedActions,
      this.schema,
      this.accessibility,
      this.seo,
      this.version,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Get action by ID
   */
  getAction(actionId: string): SiteAction | null {
    return this.actions.find(action => action.id === actionId) || null;
  }

  /**
   * Get page by path
   */
  getPageByPath(path: string): SitePage | null {
    return this.pages.find(page => page.path === path) || null;
  }

  /**
   * Get all available actions for a page
   */
  getPageActions(pageId: string): SiteAction[] {
    const page = this.pages.find(p => p.id === pageId);
    if (!page) return [];

    return page.actions
      .map(actionId => this.actions.find(a => a.id === actionId))
      .filter((action): action is SiteAction => !!action);
  }

  /**
   * Search actions by keywords
   */
  searchActions(query: string): SiteAction[] {
    const queryLower = query.toLowerCase();
    
    return this.actions.filter(action => 
      action.name.toLowerCase().includes(queryLower) ||
      action.description.toLowerCase().includes(queryLower) ||
      action.metadata.keywords.some(keyword => 
        keyword.toLowerCase().includes(queryLower)
      )
    ).sort((a, b) => b.metadata.priority - a.metadata.priority);
  }

  /**
   * Get actions by type
   */
  getActionsByType(type: SiteAction['type']): SiteAction[] {
    return this.actions.filter(action => action.type === type);
  }

  /**
   * Generate JSON-LD structured data
   */
  generateJsonLD(): Record<string, unknown>[] {
    const structuredData: Record<string, unknown>[] = [];

    // Business/Organization data
    if (this.businessInfo) {
      const org: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': this.businessInfo.category === 'restaurant' ? 'Restaurant' : 'Organization',
        name: this.businessInfo.name,
        description: this.businessInfo.description,
      };

      if (this.businessInfo.logo) {
        org['logo'] = this.businessInfo.logo;
      }

      if (this.businessInfo.contact) {
        if (this.businessInfo.contact.email) {
          org['email'] = this.businessInfo.contact.email;
        }
        if (this.businessInfo.contact.phone) {
          org['telephone'] = this.businessInfo.contact.phone;
        }
        if (this.businessInfo.contact.address) {
          org['address'] = {
            '@type': 'PostalAddress',
            streetAddress: this.businessInfo.contact.address.street,
            addressLocality: this.businessInfo.contact.address.city,
            addressRegion: this.businessInfo.contact.address.state,
            addressCountry: this.businessInfo.contact.address.country,
            postalCode: this.businessInfo.contact.address.postalCode,
          };
        }
      }

      if (this.businessInfo.hours) {
        org['openingHoursSpecification'] = Object.entries(this.businessInfo.hours)
          .filter(([, hours]) => !hours.closed)
          .map(([day, hours]) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`,
            opens: hours.open,
            closes: hours.close,
          }));
      }

      structuredData.push(org);
    }

    // Website data
    structuredData.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: this.businessInfo.name,
      url: `https://${this.siteId}.sitespeak.com`, // TODO: Use actual domain
      potentialAction: {
        '@type': 'SearchAction',
        target: `https://${this.siteId}.sitespeak.com/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    });

    return structuredData;
  }

  /**
   * Generate site manifest for Progressive Web App
   */
  generateWebManifest(): Record<string, unknown> {
    return {
      name: this.businessInfo.name,
      short_name: this.businessInfo.name,
      description: this.businessInfo.description,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#000000',
      icons: this.businessInfo.logo ? [
        {
          src: this.businessInfo.logo,
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: this.businessInfo.logo,
          sizes: '512x512',
          type: 'image/png',
        },
      ] : [],
    };
  }

  /**
   * Generate robots.txt content
   */
  generateRobotsTxt(): string {
    const baseRules = [
      'User-agent: *',
      'Allow: /',
      '',
      `Sitemap: https://${this.siteId}.sitespeak.com/sitemap.xml`,
    ];

    return baseRules.join('\n');
  }

  /**
   * Generate XML sitemap
   */
  generateSitemap(): string {
    const baseUrl = `https://${this.siteId}.sitespeak.com`;
    const urls = this.pages.map(page => {
      const lastmod = page.metadata.lastModified.toISOString().split('T')[0];
      return `  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.path === '/' ? '1.0' : '0.8'}</priority>
  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  }

  /**
   * Validate contract completeness
   */
  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required business info
    if (!this.businessInfo.name) errors.push('Business name is required');
    if (!this.businessInfo.description) errors.push('Business description is required');
    if (!this.businessInfo.category) errors.push('Business category is required');

    // Check pages
    if (this.pages.length === 0) errors.push('At least one page is required');
    
    const homePage = this.pages.find(page => page.path === '/');
    if (!homePage) errors.push('Home page (/) is required');

    // Check actions
    if (this.actions.length === 0) warnings.push('No actions defined - users may not be able to interact with the site');

    // Check accessibility
    if (this.accessibility.wcagLevel !== 'AA') warnings.push('WCAG AA compliance recommended for better accessibility');

    // Check SEO
    if (!this.seo.sitemap) warnings.push('Sitemap not generated - may affect SEO');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get contract summary for AI consumption
   */
  getSummary() {
    return {
      business: {
        name: this.businessInfo.name,
        category: this.businessInfo.category,
        description: this.businessInfo.description,
      },
      pages: this.pages.length,
      actions: this.actions.length,
      actionTypes: [...new Set(this.actions.map(a => a.type))],
      lastUpdated: this.updatedAt,
      version: this.version,
    };
  }
}

/**
 * Validation schemas
 */
export const BusinessInfoSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  logo: z.string().url().optional(),
  contact: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      postalCode: z.string(),
    }).optional(),
    website: z.string().url().optional(),
    socialMedia: z.record(z.string().url()).optional(),
  }).optional(),
  hours: z.record(z.object({
    open: z.string(),
    close: z.string(),
    closed: z.boolean().optional(),
  })).optional(),
});

export const SiteActionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  type: z.enum(['navigation', 'form_submit', 'search', 'filter', 'cart', 'booking', 'contact', 'custom']),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  endpoint: z.string().min(1),
  parameters: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().min(1),
    required: z.boolean(),
    defaultValue: z.unknown().optional(),
    enum: z.array(z.unknown()).optional(),
    validation: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      format: z.enum(['email', 'url', 'phone', 'date']).optional(),
    }).optional(),
  })),
  requiresAuth: z.boolean(),
  metadata: z.object({
    label: z.string().min(1),
    icon: z.string().optional(),
    category: z.string().min(1),
    priority: z.number().int().min(1).max(10),
    keywords: z.array(z.string()),
  }),
});

export type BusinessInfoInput = z.infer<typeof BusinessInfoSchema>;
export type SiteActionInput = z.infer<typeof SiteActionSchema>;