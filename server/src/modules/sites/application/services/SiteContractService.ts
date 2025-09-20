import { createLogger } from '../../../../shared/utils.js';
import type { Site, SitePage } from '../../../../domain/entities/Site.js';
import { 
  SiteContract, 
  createSiteContract,
  SitemapInfo,
  StructuredDataInfo,
  SiteCapabilities,
  RobotsInfo,
  SiteMetadata
} from '../../../ai/domain/entities/SiteContract.js';

// Define site-specific interfaces for contract generation
export interface BusinessInfo {
  name: string;
  description: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  hours?: {
    [day: string]: {
      open: string;
      close: string;
      closed?: boolean;
    };
  };
  social?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
}

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
    priority: number;
    keywords: string[];
  };
}

export interface ActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface PageSection {
  id: string;
  type: string;
  content: unknown;
  metadata?: Record<string, unknown>;
}

const logger = createLogger({ service: 'site-contract' });

export interface ContractGenerationRequest {
  site: Site;
  includeAnalytics: boolean;
  wcagLevel: 'A' | 'AA' | 'AAA';
}

export interface ContractGenerationResult {
  contract: SiteContract;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  analytics: {
    generationTime: number;
    complexity: 'simple' | 'moderate' | 'complex';
    actionCount: number;
    pageCount: number;
  };
}

/**
 * Service for generating and managing site contracts
 */
export class SiteContractService {
  /**
   * Generate complete site contract from site data
   */
  async generateContract(request: ContractGenerationRequest): Promise<ContractGenerationResult> {
    const startTime = Date.now();

    try {
      logger.info('Generating site contract', {
        siteId: request.site.id,
        tenantId: request.site.tenantId,
        includeAnalytics: request.includeAnalytics,
        wcagLevel: request.wcagLevel,
      });

      // Generate sitemap info
      const sitemap: SitemapInfo = this.generateSitemapInfo(request.site);

      // Generate structured data
      const structuredData: StructuredDataInfo = this.generateStructuredDataInfo(request.site);

      // Generate site capabilities
      const capabilities: SiteCapabilities = this.generateSiteCapabilities(request.site);

      // Generate robots info
      const robots: RobotsInfo = this.generateRobotsInfo(request.site);

      // Generate metadata
      const metadata: SiteMetadata = this.generateSiteMetadata(request.site);

      // Create contract using the factory function
      const contract = createSiteContract(
        request.site.id,
        request.site.tenantId,
        request.site.getUrl(),
        {
          sitemap,
          structuredData,
          capabilities,
          robots,
          metadata
        }
      );

      // Validate contract
      const validation = contract.validate();

      const generationTime = Date.now() - startTime;

      logger.info('Site contract generated successfully', {
        siteId: request.site.id,
        pageCount: sitemap.entries.length,
        actionCount: capabilities.actions.length,
        generationTime,
        valid: validation.isValid,
        errorsCount: validation.errors.length,
        warningsCount: validation.warnings.length,
      });

      return {
        contract,
        validation: {
          valid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings
        },
        analytics: {
          generationTime,
          complexity: this.assessComplexity(sitemap.entries.length, capabilities.actions.length),
          actionCount: capabilities.actions.length,
          pageCount: sitemap.entries.length,
        },
      };
    } catch (error) {
      logger.error('Site contract generation failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : 'Unknown'
        },
        siteId: request.site.id,
        requestData: {
          includeAnalytics: request.includeAnalytics,
          wcagLevel: request.wcagLevel
        }
      });
      throw error;
    }
  }

  /**
   * Update existing contract with new site data
   */
  async updateContract(
    existingContract: SiteContract, 
    updatedSite: Site
  ): Promise<SiteContract> {
    try {
      logger.info('Updating site contract', {
        siteId: updatedSite.id,
      });

      // Generate updated data
      const sitemap: SitemapInfo = this.generateSitemapInfo(updatedSite);
      const structuredData: StructuredDataInfo = this.generateStructuredDataInfo(updatedSite);
      const capabilities: SiteCapabilities = this.generateSiteCapabilities(updatedSite);
      const robots: RobotsInfo = this.generateRobotsInfo(updatedSite);
      const metadata: SiteMetadata = this.generateSiteMetadata(updatedSite);

      // Update contract using the updateContract method
      const contract = existingContract.updateContract({
        sitemap,
        structuredData,
        capabilities,
        robots,
        metadata
      });

      logger.info('Site contract updated successfully', {
        siteId: updatedSite.id,
      });

      return contract;
    } catch (error) {
      logger.error('Site contract update failed', {
        error,
        siteId: updatedSite.id,
      });
      throw error;
    }
  }

  /**
   * Extract business information from site
   * @internal - Reserved for future contract generation features
   */
  // @ts-expect-error - Reserved for future use
  private extractBusinessInfo(site: Site): BusinessInfo {
    const seoConfig = site.configuration.seo;
    const contact = site.content.pages
      .find((page: SitePage) => page.name.toLowerCase().includes('contact'))?.content;

    const contactEmail = this.extractContactInfo(contact, 'email');
    const contactPhone = this.extractContactInfo(contact, 'phone');
    
    return {
      name: site.name,
      description: seoConfig?.description || site.description || '',
      // TODO: Add category and logo fields to BusinessInfo interface if needed
      contact: {
        ...(contactEmail && { email: contactEmail }),
        ...(contactPhone && { phone: contactPhone }),
        website: site.getUrl(),
      },
    };
  }


  /**
   * Generate site actions from content and configuration
   * @internal - Reserved for future AI agent action discovery
   */
  // @ts-expect-error - Reserved for future use
  private generateSiteActions(site: Site, pages: any[]): SiteAction[] {
    const actions: SiteAction[] = [];

    // Navigation actions
    for (const page of pages) {
      if (page.path !== '/') {
        actions.push({
          id: `nav-${page.id}`,
          name: `Navigate to ${page.name}`,
          description: `Navigate to the ${page.name} page`,
          type: 'navigation',
          method: 'GET',
          endpoint: page.path,
          parameters: [],
          requiresAuth: false,
          metadata: {
            label: page.name,
            category: 'navigation',
            priority: page.path === '/' ? 10 : 5,
            keywords: [page.name.toLowerCase(), 'navigate', 'go to', 'visit'],
          },
        });
      }
    }

    // Form submission actions
    for (const page of pages) {
      const forms = this.extractForms(page.sections);
      for (const form of forms) {
        actions.push({
          id: `form-${form.id}`,
          name: `Submit ${form.name}`,
          description: `Submit the ${form.name} form`,
          type: 'form_submit',
          method: 'POST',
          endpoint: `/api/forms/${form.id}/submit`,
          parameters: form.fields.map((field: any) => ({
            name: field.name,
            type: this.mapFieldTypeToActionType(field.type),
            description: field.label,
            required: field.required,
            validation: field.validation,
          })),
          requiresAuth: false,
          metadata: {
            label: `Submit ${form.name}`,
            category: 'forms',
            priority: form.name.toLowerCase().includes('contact') ? 8 : 6,
            keywords: ['submit', 'send', form.name.toLowerCase(), 'form'],
          },
        });
      }
    }

    // Search action (if site has search capability)
    if (this.hasSearchCapability(site)) {
      actions.push({
        id: 'search-site',
        name: 'Search Site',
        description: 'Search for content on the website',
        type: 'search',
        method: 'GET',
        endpoint: '/search',
        parameters: [
          {
            name: 'q',
            type: 'string',
            description: 'Search query',
            required: true,
          },
          {
            name: 'category',
            type: 'string',
            description: 'Search category filter',
            required: false,
          },
        ],
        requiresAuth: false,
        metadata: {
          label: 'Search',
          icon: 'search',
          category: 'search',
          priority: 7,
          keywords: ['search', 'find', 'look for', 'query'],
        },
      });
    }

    // Contact action
    if (pages.some(page => page.name.toLowerCase().includes('contact'))) {
      actions.push({
        id: 'contact-business',
        name: 'Contact Business',
        description: 'Get in touch with the business',
        type: 'contact',
        method: 'GET',
        endpoint: '/contact',
        parameters: [],
        requiresAuth: false,
        metadata: {
          label: 'Contact Us',
          icon: 'mail',
          category: 'contact',
          priority: 9,
          keywords: ['contact', 'get in touch', 'reach out', 'call', 'email'],
        },
      });
    }

    logger.debug('Generated site actions', {
      siteId: site.id,
      actionCount: actions.length,
      actionTypes: [...new Set(actions.map(a => a.type))],
    });

    return actions;
  }

  /**
   * Generate schema and structured data
   * @internal - Reserved for future SEO and structured data features
   */
  // @ts-expect-error - Reserved for future use
  private generateSchema(businessInfo: BusinessInfo, site: Site) {
    const jsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: businessInfo.name,
        description: businessInfo.description,
        url: site.getUrl(),
      },
    ];

    const openGraph: Record<string, string> = {
      'og:type': 'website',
      'og:title': businessInfo.name,
      'og:description': businessInfo.description,
      'og:url': site.getUrl(),
    };

    const twitterCard: Record<string, string> = {
      'twitter:card': 'summary',
      'twitter:title': businessInfo.name,
      'twitter:description': businessInfo.description,
    };

    // TODO: Add logo field to BusinessInfo interface for og:image and twitter:image
    // if (businessInfo.logo) {
    //   openGraph['og:image'] = businessInfo.logo;
    //   twitterCard['twitter:image'] = businessInfo.logo;
    // }

    return {
      jsonLd,
      openGraph,
      twitterCard,
    };
  }

  /**
   * Generate accessibility information
   * @internal - Reserved for future accessibility compliance features
   */
  // @ts-expect-error - Reserved for future use
  private generateAccessibilityInfo(_site: Site, wcagLevel: 'A' | 'AA' | 'AAA') {
    return {
      wcagLevel,
      features: [
        'alt-text',
        'semantic-html',
        'keyboard-navigation',
        'focus-indicators',
      ],
      testing: {
        score: 85, // TODO: Implement actual accessibility testing
        issues: [],
      },
    };
  }

  /**
   * Generate SEO information
   * @internal - Reserved for future SEO optimization features
   */
  // @ts-expect-error - Reserved for future use
  private generateSEOInfo(site: Site, _pages: any[]) {
    return {
      sitemap: `https://${site.getUrl()}/sitemap.xml`,
      robotsTxt: `https://${site.getUrl()}/robots.txt`,
      metaTags: {
        'viewport': 'width=device-width, initial-scale=1',
        'charset': 'utf-8',
        'robots': 'index, follow',
      },
      structuredData: [],
    };
  }

  /**
   * Helper methods
   */

  // @ts-expect-error - Reserved for future use
  private findLogo(content: Site['content']): string | undefined {
    // Search for logo in site assets
    const logoAsset = content.assets?.find(asset => 
      asset.originalName.toLowerCase().includes('logo') ||
      asset.filename.toLowerCase().includes('logo')
    );

    return logoAsset?.url;
  }

  private extractContactInfo(content: any, type: 'email' | 'phone'): string | undefined {
    if (!content) {return undefined;}

    const text = JSON.stringify(content).toLowerCase();
    
    if (type === 'email') {
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return emailMatch?.[0];
    }

    if (type === 'phone') {
      const phoneMatch = text.match(/[\+]?[1-9][\d\s\-\(\)]{8,}/);
      return phoneMatch?.[0];
    }

    return undefined;
  }

  // @ts-expect-error - Reserved for future use
  private extractPageSections(content: any): PageSection[] {
    // This is a simplified implementation
    // In practice, this would analyze the page structure
    return [
      {
        id: 'main-content',
        type: 'content',
        content: {
          text: JSON.stringify(content).substring(0, 500),
        },
        metadata: {
          title: 'Main Content',
          description: 'Primary page content',
          actions: [],
        },
      },
    ];
  }





  private extractForms(sections: PageSection[]): any[] {
    const forms: any[] = [];
    
    for (const section of sections) {
      const content = section.content as any;
      if (content?.forms) {
        forms.push(...content.forms);
      }
    }
    
    return forms;
  }

  private mapFieldTypeToActionType(fieldType: string): 'string' | 'number' | 'boolean' | 'array' | 'object' {
    const mapping: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'> = {
      'text': 'string',
      'email': 'string',
      'phone': 'string',
      'textarea': 'string',
      'select': 'string',
      'checkbox': 'boolean',
      'radio': 'string',
      'file': 'string',
    };
    
    return mapping[fieldType] || 'string';
  }

  private hasSearchCapability(site: Site): boolean {
    return site.content.pages.some(page => 
      page.name.toLowerCase().includes('search') ||
      JSON.stringify(page.content).toLowerCase().includes('search')
    );
  }

  /**
   * Generate sitemap info from site
   */
  private generateSitemapInfo(site: Site): SitemapInfo {
    const entries = site.content.pages
      .filter(page => page.isPublished)
      .map(page => ({
        loc: `${site.getUrl()}${page.slug.startsWith('/') ? page.slug : `/${page.slug}`}`,
        lastmod: new Date(), // TODO: Get actual last modified date
        priority: page.isHomePage ? 1.0 : 0.8,
        changefreq: 'weekly' as const
      }));

    return {
      exists: true,
      url: `${site.getUrl()}/sitemap.xml`,
      lastModified: new Date(),
      entries
    };
  }

  /**
   * Generate structured data info from site
   */
  private generateStructuredDataInfo(site: Site): StructuredDataInfo {
    const schemas: Record<string, import('../../../ai/domain/entities/SiteContract.js').JsonLdSchema> = {};
    
    // Add Organization schema
    schemas['Organization'] = {
      '@type': 'Organization',
      '@context': 'https://schema.org',
      requiredFields: ['name'],
      optionalFields: ['description', 'url', 'logo'],
      examples: [{
        '@type': 'Organization',
        name: site.name,
        description: site.description,
        url: site.getUrl()
      }]
    };

    return {
      schemas,
      entities: {}
    };
  }

  /**
   * Generate site capabilities from site
   */
  private generateSiteCapabilities(site: Site): SiteCapabilities {
    const actions: import('../../../ai/domain/entities/SiteContract.js').ActionCapability[] = [];
    const forms: import('../../../ai/domain/entities/SiteContract.js').FormCapability[] = [];

    // Add navigation actions
    site.content.pages.forEach(page => {
      if (page.isPublished) {
        actions.push({
          id: `nav-${page.id}`,
          type: 'navigation',
          label: `Navigate to ${page.name}`,
          selector: `[href="${page.slug}"]`,
          parameters: {},
          sideEffects: ['navigation']
        });
      }
    });

    return {
      actions,
      forms,
      apis: [],
      features: site.hasVoiceEnabled() ? ['voice-ai'] : []
    };
  }

  /**
   * Generate robots info from site
   */
  private generateRobotsInfo(site: Site): RobotsInfo {
    const rules = new Map();
    
    // Default rules for all user agents
    rules.set('*', {
      allow: ['/'],
      disallow: ['/admin/', '/api/'],
      crawlDelay: 1
    });

    return {
      exists: true,
      url: `${site.getUrl()}/robots.txt`,
      lastModified: new Date(),
      rules,
      sitemaps: [`${site.getUrl()}/sitemap.xml`]
    };
  }

  /**
   * Generate site metadata from site
   */
  private generateSiteMetadata(site: Site): SiteMetadata {
    const seoConfig = site.configuration.seo;
    
    return {
      title: seoConfig.title || site.name,
      description: seoConfig.description || site.description,
      language: site.configuration.voice.language || 'en',
      favicon: `${site.getUrl()}/favicon.ico`,
      keywords: seoConfig.keywords || [],
      themeColor: site.configuration.theme.primaryColor,
      generator: 'SiteSpeak'
    };
  }

  private assessComplexity(pageCount: number, actionCount: number): 'simple' | 'moderate' | 'complex' {
    const totalComplexity = pageCount + actionCount;
    
    if (totalComplexity <= 10) {return 'simple';}
    if (totalComplexity <= 25) {return 'moderate';}
    return 'complex';
  }
}

// Export singleton instance
export const siteContractService = new SiteContractService();