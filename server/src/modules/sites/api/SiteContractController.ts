import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { siteContractService } from '../application/services/SiteContractService';
import { SiteContractRepositoryImpl } from '../../../infrastructure/repositories/SiteContractRepositoryImpl.js';
import { db } from '../../../infrastructure/database/index.js';

const logger = createLogger({ service: 'site-contract-controller' });

// Request schemas
const GenerateContractSchema = z.object({
  includeAnalytics: z.boolean().default(true),
  wcagLevel: z.enum(['A', 'AA', 'AAA']).default('AA'),
  forceRegenerate: z.boolean().default(false),
});

const UpdateBusinessInfoSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  category: z.string().min(1).optional(),
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

export class SiteContractController {
  private contractRepository: SiteContractRepositoryImpl;

  constructor() {
    this.contractRepository = new SiteContractRepositoryImpl(db);
  }
  /**
   * Generate site contract for a site
   */
  async generateContract(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }
      const data = GenerateContractSchema.parse(req.body);

      logger.info('Generating site contract', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        options: data,
        correlationId: req.correlationId,
      });

      // TODO: Get site from repository
      // TODO: Verify user has access to site

      // Mock site for demonstration
      const mockSite = {
        id: siteId,
        name: 'Demo Business Site',
        description: 'A modern business website with contact forms and services',
        tenantId: user.tenantId,
        templateId: 'business-modern',
        configuration: {
          theme: {
            primaryColor: '#3B82F6',
            secondaryColor: '#10B981',
            fontFamily: 'Inter',
            layout: 'modern',
          },
          seo: {
            title: 'Demo Business - Professional Services',
            description: 'We provide high-quality professional services to help your business grow',
            keywords: ['business', 'services', 'professional', 'consulting'],
          },
          analytics: { enabled: true },
          voice: { enabled: true, personality: 'professional', language: 'en' },
        },
        content: {
          pages: [
            {
              id: 'home',
              name: 'Home',
              slug: '/',
              title: 'Welcome to Demo Business',
              content: {
                sections: [
                  { type: 'hero', title: 'Professional Services', content: 'We help businesses succeed' },
                  { type: 'services', title: 'Our Services', content: 'Consulting and support services' },
                ],
              },
              isHomePage: true,
              isPublished: true,
            },
            {
              id: 'contact',
              name: 'Contact',
              slug: '/contact',
              title: 'Contact Us',
              content: {
                forms: [
                  {
                    id: 'contact-form',
                    name: 'Contact Form',
                    fields: [
                      { name: 'name', type: 'text', label: 'Full Name', required: true },
                      { name: 'email', type: 'email', label: 'Email', required: true },
                      { name: 'message', type: 'textarea', label: 'Message', required: true },
                    ],
                  },
                ],
              },
              isHomePage: false,
              isPublished: true,
            },
          ],
          components: [],
          assets: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: true,
        getUrl: () => `https://${siteId}.sitespeak.com`,
      } as any;

      // Generate contract
      const result = await siteContractService.generateContract({
        site: mockSite,
        includeAnalytics: data.includeAnalytics,
        wcagLevel: data.wcagLevel,
      });

      // Store the contract for later retrieval
      // Extract only the fields required for the repository create method (omitting siteId, version, createdAt, updatedAt)
      const contractData = {
        id: result.contract.id,
        tenantId: req.user!.tenantId,
        businessInfo: result.contract.businessInfo,
        pages: result.contract.pages,
        actions: result.contract.actions,
        schema: result.contract.schema,
        accessibility: result.contract.accessibility,
        seo: result.contract.seo,
      };

      // Store contract in database
      await this.contractRepository.create(siteId, contractData);

      return res.json({
        success: true,
        data: {
          contract: {
            id: result.contract.id,
            siteId: result.contract.siteId,
            version: result.contract.version,
            businessInfo: result.contract.businessInfo,
            pages: result.contract.pages.map(page => ({
              ...page,
              actions: result.contract.getPageActions(page.id).map(action => ({
                id: action.id,
                name: action.name,
                type: action.type,
                description: action.description,
                requiresAuth: action.requiresAuth,
                metadata: action.metadata,
              })),
            })),
            actions: result.contract.actions,
            schema: result.contract.schema,
            accessibility: result.contract.accessibility,
            seo: result.contract.seo,
            summary: result.contract.getSummary(),
            createdAt: result.contract.createdAt,
            updatedAt: result.contract.updatedAt,
          },
          validation: result.validation,
          analytics: result.analytics,
        },
      });
    } catch (error) {
      logger.error('Site contract generation failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Get existing site contract
   */
  async getContract(req: Request, res: Response, next: NextFunction) {
    try {
      const _user = req.user!; // TODO: Use for access control
      void _user; // Will be used for access control
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }

      // Get contract from database repository
      const contract = await this.contractRepository.findBySiteId(siteId);
      
      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      return res.json({
        success: true,
        data: contract,
      });
    } catch (error) {
      logger.error('Get site contract failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Update business information in contract
   */
  async updateBusinessInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }
      const data = UpdateBusinessInfoSchema.parse(req.body);

      logger.info('Updating site business info', {
        userId: user.id,
        siteId,
        updates: Object.keys(data),
        correlationId: req.correlationId,
      });

      // Get existing contract from database
      const existingContract = await this.contractRepository.findBySiteId(siteId);
      if (!existingContract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      // Update business info - filter out undefined values for exactOptionalPropertyTypes
      const cleanedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, unknown>);

      const updatedContract = {
        ...existingContract,
        businessInfo: {
          ...existingContract.businessInfo,
          ...cleanedData,
        },
        updatedAt: new Date(),
      };

      // Save updated contract to database
      await this.contractRepository.update(siteId, { businessInfo: updatedContract.businessInfo });

      return res.json({
        success: true,
        data: {
          message: 'Business information updated successfully',
          updatedFields: Object.keys(data),
          contract: updatedContract,
        },
      });
    } catch (error) {
      logger.error('Update business info failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Generate action manifest for site
   */
  async generateActionManifest(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }

      logger.info('Generating action manifest', {
        userId: user.id,
        siteId,
        correlationId: req.correlationId,
      });

      // Get site contract from database  
      const contract = await this.contractRepository.findBySiteId(siteId);
      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      // Generate action manifest from contract
      const manifest = {
        siteId,
        version: contract.version || '1.0.0',
        generatedAt: new Date().toISOString(),
        actions: contract.actions || [],
        capabilities: this.extractCapabilities(contract.actions || []),
        metadata: this.generateSiteMetadata(contract),
      };

      return res.json({
        success: true,
        data: manifest,
      });
    } catch (error) {
      logger.error('Action manifest generation failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Extract capabilities from actions
   */
  private extractCapabilities(actions: any[]): string[] {
    const capabilitySet = new Set<string>();
    
    actions.forEach(action => {
      if (action.type === 'navigation') {capabilitySet.add('navigation');}
      if (action.type === 'form_submit') {capabilitySet.add('forms');}
      if (action.type === 'contact') {capabilitySet.add('contact');}
      if (action.type === 'search') {capabilitySet.add('search');}
      if (action.type === 'cart') {capabilitySet.add('ecommerce');}
      if (action.type === 'booking') {capabilitySet.add('booking');}
    });

    return Array.from(capabilitySet);
  }

  /**
   * Generate site metadata from contract
   */
  private generateSiteMetadata(contract: any): Record<string, boolean> {
    const actions = contract.actions || [];
    const pages = contract.pages || [];
    
    return {
      hasContactForm: actions.some((a: any) => a.type === 'contact' || a.type === 'form_submit'),
      hasEcommerce: actions.some((a: any) => a.type === 'cart'),
      hasBooking: actions.some((a: any) => a.type === 'booking'),
      hasBlog: pages.some((p: any) => p.name.toLowerCase().includes('blog')),
      hasGallery: pages.some((p: any) => p.name.toLowerCase().includes('gallery')),
      hasAuth: actions.some((a: any) => a.requiresAuth),
      hasSearch: actions.some((a: any) => a.type === 'search'),
    };
  }

  /**
   * Generate structured data (JSON-LD)
   */
  async generateStructuredData(req: Request, res: Response, next: NextFunction) {
    try {
      const _user = req.user!; // TODO: Use for access control
      void _user; // Will be used for access control
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }

      // Get site contract from database
      const contract = await this.contractRepository.findBySiteId(siteId);
      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      const mockStructuredData = [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Demo Business',
          description: 'Professional services company',
          url: `https://${siteId}.sitespeak.com`,
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: '+1-555-123-4567',
            contactType: 'Customer Service',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Demo Business Website',
          url: `https://${siteId}.sitespeak.com`,
          potentialAction: {
            '@type': 'SearchAction',
            target: `https://${siteId}.sitespeak.com/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ];

      res.json({
        success: true,
        data: {
          structuredData: mockStructuredData,
          format: 'JSON-LD',
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Structured data generation failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Generate sitemap.xml
   */
  async generateSitemap(req: Request, res: Response, next: NextFunction) {
    try {
      const _user = req.user!; // TODO: Use for access control
      void _user; // Will be used for access control
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }

      // Get site contract from database
      const contract = await this.contractRepository.findBySiteId(siteId);
      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      const mockSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${siteId}.sitespeak.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://${siteId}.sitespeak.com/contact</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

      res.setHeader('Content-Type', 'application/xml');
      res.send(mockSitemap);
    } catch (error) {
      logger.error('Sitemap generation failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Validate contract completeness
   */
  async validateContract(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      if (!siteId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SITE_ID', message: 'Site ID is required' },
        });
      }

      logger.info('Validating site contract', {
        userId: user.id,
        siteId,
        correlationId: req.correlationId,
      });

      // Get site contract from database
      const contract = await this.contractRepository.findBySiteId(siteId);
      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'CONTRACT_NOT_FOUND', message: `Site contract not found for site ${siteId}` },
        });
      }

      const mockValidation = {
        valid: true,
        errors: [],
        warnings: [
          'Consider adding more detailed business hours information',
          'Social media links not configured',
        ],
        score: 85,
        recommendations: [
          'Add structured data for better SEO',
          'Configure OpenGraph metadata',
          'Add ARIA landmarks for better accessibility',
        ],
      };

      res.json({
        success: true,
        data: mockValidation,
      });
    } catch (error) {
      logger.error('Contract validation failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  /**
   * Get contract analytics
   */
  async getContractAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const _user = req.user!; // TODO: Use for access control
      void _user; // Will be used for access control
      const { siteId } = req.params;

      // TODO: Get contract analytics from repository

      const mockAnalytics = {
        siteId,
        complexity: 'moderate',
        actionCount: 8,
        pageCount: 5,
        lastGenerated: new Date(),
        generationTime: 1250, // ms
        crawlability: {
          score: 92,
          hasJsonLd: true,
          hasAriaLandmarks: true,
          hasSitemap: true,
          hasRobotsTxt: true,
        },
        accessibility: {
          wcagLevel: 'AA',
          score: 88,
          issues: 2,
          features: ['alt-text', 'semantic-html', 'keyboard-navigation'],
        },
        seo: {
          score: 85,
          metaTags: 12,
          structuredData: 3,
          issues: ['Missing OpenGraph images'],
        },
      };

      res.json({
        success: true,
        data: mockAnalytics,
      });
    } catch (error) {
      logger.error('Get contract analytics failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }
}

// Export controller instance
export const siteContractController = new SiteContractController();