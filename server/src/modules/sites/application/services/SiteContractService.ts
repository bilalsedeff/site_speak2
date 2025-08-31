import { createLogger } from '@shared/utils';
import type { 
  Site,
  SiteConfiguration,
  SiteContent,
  SitePage,
} from '../../domain/entities/Site';
import { 
  SiteContract,
  BusinessInfo,
  SiteAction,
  SitePage as ContractPage,
  PageSection,
  SectionContent,
} from '../../domain/entities/SiteContract';

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

      // Extract business information
      const businessInfo = this.extractBusinessInfo(request.site);

      // Convert site pages to contract pages
      const pages = this.convertSitePages(request.site.content.pages);

      // Generate actions from site content and configuration
      const actions = this.generateSiteActions(request.site, pages);

      // Generate schema and structured data
      const schema = this.generateSchema(businessInfo, request.site);

      // Generate accessibility information
      const accessibility = this.generateAccessibilityInfo(request.site, request.wcagLevel);

      // Generate SEO information
      const seo = this.generateSEOInfo(request.site, pages);

      // Create contract
      const contract = new SiteContract(
        `contract-${request.site.id}`,
        request.site.id,
        request.site.tenantId,
        businessInfo,
        pages,
        actions,
        schema,
        accessibility,
        seo,
        '1.0.0',
        new Date(),
        new Date()
      );

      // Validate contract
      const validation = contract.validate();

      const generationTime = Date.now() - startTime;

      logger.info('Site contract generated successfully', {
        siteId: request.site.id,
        pageCount: pages.length,
        actionCount: actions.length,
        generationTime,
        valid: validation.valid,
        errorsCount: validation.errors.length,
        warningsCount: validation.warnings.length,
      });

      return {
        contract,
        validation,
        analytics: {
          generationTime,
          complexity: this.assessComplexity(pages.length, actions.length),
          actionCount: actions.length,
          pageCount: pages.length,
        },
      };
    } catch (error) {
      logger.error('Site contract generation failed', {
        error,
        siteId: request.site.id,
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
        contractId: existingContract.id,
        siteId: updatedSite.id,
      });

      // Update business info
      const updatedBusinessInfo = this.extractBusinessInfo(updatedSite);
      let contract = existingContract.updateBusinessInfo(updatedBusinessInfo);

      // Update pages
      const updatedPages = this.convertSitePages(updatedSite.content.pages);
      for (const page of updatedPages) {
        contract = contract.updatePage(page);
      }

      // Update actions
      const updatedActions = this.generateSiteActions(updatedSite, updatedPages);
      for (const action of updatedActions) {
        contract = contract.updateAction(action);
      }

      logger.info('Site contract updated successfully', {
        contractId: contract.id,
        siteId: updatedSite.id,
      });

      return contract;
    } catch (error) {
      logger.error('Site contract update failed', {
        error,
        contractId: existingContract.id,
        siteId: updatedSite.id,
      });
      throw error;
    }
  }

  /**
   * Extract business information from site
   */
  private extractBusinessInfo(site: Site): BusinessInfo {
    const seoConfig = site.configuration.seo;
    const contact = site.content.pages
      .find(page => page.name.toLowerCase().includes('contact'))?.content;

    return {
      name: seoConfig?.title || site.name,
      description: seoConfig?.description || site.description,
      category: this.inferBusinessCategory(site),
      logo: this.findLogo(site.content),
      contact: {
        email: this.extractContactInfo(contact, 'email'),
        phone: this.extractContactInfo(contact, 'phone'),
        website: site.getUrl(),
      },
    };
  }

  /**
   * Convert site pages to contract pages
   */
  private convertSitePages(sitePages: SitePage[]): ContractPage[] {
    return sitePages.map(page => ({
      id: page.id,
      name: page.name,
      path: page.slug.startsWith('/') ? page.slug : `/${page.slug}`,
      title: page.title,
      description: page.seoSettings?.description || '',
      keywords: page.seoSettings?.keywords || [],
      sections: this.extractPageSections(page.content),
      actions: [], // Will be populated when generating actions
      metadata: {
        lastModified: new Date(), // TODO: Get actual last modified date
        contentType: this.inferContentType(page.content),
        accessibility: {
          hasAltText: this.checkForAltText(page.content),
          hasHeadings: this.checkForHeadings(page.content),
          hasLandmarks: this.checkForLandmarks(page.content),
          colorContrast: 'good', // TODO: Implement actual color contrast checking
        },
      },
    }));
  }

  /**
   * Generate site actions from content and configuration
   */
  private generateSiteActions(site: Site, pages: ContractPage[]): SiteAction[] {
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
          parameters: form.fields.map(field => ({
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
   */
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

    const openGraph = {
      'og:type': 'website',
      'og:title': businessInfo.name,
      'og:description': businessInfo.description,
      'og:url': site.getUrl(),
    };

    const twitterCard = {
      'twitter:card': 'summary',
      'twitter:title': businessInfo.name,
      'twitter:description': businessInfo.description,
    };

    if (businessInfo.logo) {
      openGraph['og:image'] = businessInfo.logo;
      twitterCard['twitter:image'] = businessInfo.logo;
    }

    return {
      jsonLd,
      openGraph,
      twitterCard,
    };
  }

  /**
   * Generate accessibility information
   */
  private generateAccessibilityInfo(site: Site, wcagLevel: 'A' | 'AA' | 'AAA') {
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
   */
  private generateSEOInfo(site: Site, pages: ContractPage[]) {
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
  private inferBusinessCategory(site: Site): string {
    const name = site.name.toLowerCase();
    const description = site.description.toLowerCase();
    const text = `${name} ${description}`;

    const categories = {
      'restaurant': ['restaurant', 'food', 'dining', 'cafe', 'bar', 'kitchen'],
      'retail': ['shop', 'store', 'buy', 'sell', 'product', 'retail'],
      'service': ['service', 'repair', 'maintenance', 'consulting'],
      'healthcare': ['health', 'medical', 'doctor', 'clinic', 'hospital'],
      'education': ['school', 'education', 'learning', 'course', 'training'],
      'professional': ['business', 'professional', 'company', 'corporate'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }

    return 'business';
  }

  private findLogo(content: Site['content']): string | undefined {
    // Search for logo in site assets
    const logoAsset = content.assets?.find(asset => 
      asset.originalName.toLowerCase().includes('logo') ||
      asset.filename.toLowerCase().includes('logo')
    );

    return logoAsset?.url;
  }

  private extractContactInfo(content: any, type: 'email' | 'phone'): string | undefined {
    if (!content) return undefined;

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

  private extractPageSections(content: any): PageSection[] {
    // This is a simplified implementation
    // In practice, this would analyze the page structure
    return [
      {
        id: 'main-content',
        type: 'content',
        title: 'Main Content',
        description: 'Primary page content',
        content: {
          text: JSON.stringify(content).substring(0, 500),
        },
        actions: [],
      },
    ];
  }

  private inferContentType(content: any): 'static' | 'dynamic' | 'form' | 'listing' {
    const contentStr = JSON.stringify(content).toLowerCase();
    
    if (contentStr.includes('form') || contentStr.includes('input')) {
      return 'form';
    }
    
    if (contentStr.includes('list') || contentStr.includes('items')) {
      return 'listing';
    }
    
    return 'static';
  }

  private checkForAltText(content: any): boolean {
    const contentStr = JSON.stringify(content);
    return contentStr.includes('alt') && contentStr.includes('image');
  }

  private checkForHeadings(content: any): boolean {
    const contentStr = JSON.stringify(content).toLowerCase();
    return contentStr.includes('heading') || contentStr.includes('h1') || contentStr.includes('title');
  }

  private checkForLandmarks(content: any): boolean {
    // Check for ARIA landmarks or semantic HTML elements
    return true; // Simplified implementation
  }

  private extractForms(sections: PageSection[]): any[] {
    const forms: any[] = [];
    
    for (const section of sections) {
      if (section.content.forms) {
        forms.push(...section.content.forms);
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

  private assessComplexity(pageCount: number, actionCount: number): 'simple' | 'moderate' | 'complex' {
    const totalComplexity = pageCount + actionCount;
    
    if (totalComplexity <= 10) return 'simple';
    if (totalComplexity <= 25) return 'moderate';
    return 'complex';
  }
}

// Export singleton instance
export const siteContractService = new SiteContractService();