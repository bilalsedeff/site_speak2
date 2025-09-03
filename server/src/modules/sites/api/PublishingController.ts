import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../_shared/telemetry/logger';
import { createPublishingPipeline } from '../../publishing/app/PublishingPipeline';
import { createArtifactStoreFromEnv } from '../../publishing/adapters/ArtifactStore';
import { createCDNProviderFromEnv } from '../../publishing/adapters/CDNProvider';
import { EventBus } from '../../../services/_shared/events/eventBus';
import { siteContractService } from '../application/services/SiteContractService';
import type { DeploymentIntent, BuildParams, PublishRequest } from '../../publishing/app/PublishingPipeline';

const logger = createLogger({ service: 'publishing-controller' });

// Request schemas
const PublishSiteSchema = z.object({
  deploymentIntent: z.enum(['preview', 'production']).default('preview'),
  commitSha: z.string().optional(),
  buildParams: z.object({
    environment: z.enum(['development', 'staging', 'production']).default('production'),
    features: z.array(z.string()).optional(),
    customDomain: z.string().optional(),
    buildOptions: z.record(z.any()).optional(),
  }).optional(),
  previousDeploymentId: z.string().optional(),
  forceReplace: z.boolean().default(false),
});

const RollbackDeploymentSchema = z.object({
  targetDeploymentId: z.string(),
  reason: z.string().optional(),
});

export class PublishingController {
  private publishingPipeline;
  private eventBus;

  constructor() {
    // Initialize publishing infrastructure
    this.eventBus = new EventBus();
    
    // Initialize adapters
    const artifactStore = createArtifactStoreFromEnv();
    const cdnProvider = createCDNProviderFromEnv();
    
    // Create publishing pipeline
    this.publishingPipeline = createPublishingPipeline(artifactStore, cdnProvider, this.eventBus);

    // Set up event listeners for system integration
    this.setupEventListeners();
  }

  /**
   * Publish a site using the enhanced publishing pipeline
   */
  async publishSite(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      const data = PublishSiteSchema.parse(req.body);

      logger.info('Publishing site with enhanced pipeline', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        deploymentIntent: data.deploymentIntent,
        correlationId: req.correlationId,
      });

      // TODO: Load actual site from repository
      // TODO: Verify user has access to site
      
      // Mock site data (replace with actual site loading)
      const site = await this.loadSiteData(siteId, user.tenantId);

      // Build publish request
      const publishRequest: PublishRequest = {
        siteId,
        tenantId: user.tenantId,
        deploymentIntent: data.deploymentIntent,
        commitSha: data.commitSha,
        buildParams: data.buildParams,
        previousDeploymentId: data.previousDeploymentId,
      };

      // Execute publishing pipeline
      const result = await this.publishingPipeline.publish(publishRequest);

      logger.info('Site published successfully', {
        deploymentId: result.deploymentId,
        releaseHash: result.releaseHash,
        siteId,
        tenantId: user.tenantId,
        totalDuration: result.performanceMetrics.totalDuration,
      });

      res.json({
        success: true,
        data: {
          deployment: {
            id: result.deploymentId,
            releaseHash: result.releaseHash,
            siteId,
            tenantId: user.tenantId,
            deploymentIntent: data.deploymentIntent,
            status: 'succeeded',
            createdAt: new Date(),
            urls: result.cdnUrls,
            contract: result.contractPaths,
          },
          performance: {
            totalDuration: result.performanceMetrics.totalDuration,
            buildDuration: result.performanceMetrics.buildDuration,
            contractDuration: result.performanceMetrics.contractDuration,
            uploadDuration: result.performanceMetrics.uploadDuration,
            activationDuration: result.performanceMetrics.activationDuration,
            artifactSize: result.performanceMetrics.artifactSize,
            fileCount: result.performanceMetrics.fileCount,
          },
          files: Object.keys(result.contractPaths),
        },
      });

    } catch (error) {
      logger.error('Site publishing failed', {
        error,
        userId: req.user?.id,
        siteId: req.params.siteId,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get deployment status and details
   */
  async getDeploymentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId, deploymentId } = req.params;

      logger.info('Getting deployment status', {
        userId: user.id,
        siteId,
        deploymentId,
        correlationId: req.correlationId,
      });

      // TODO: Load deployment status from repository
      // For now, return mock status
      const deploymentStatus = {
        id: deploymentId,
        siteId,
        tenantId: user.tenantId,
        status: 'succeeded',
        deploymentIntent: 'production',
        releaseHash: 'abc123def456',
        createdAt: new Date(),
        completedAt: new Date(),
        urls: {
          origin: `https://${siteId}.sitespeak.com`,
          cdn: `https://${siteId}.sitespeak.com`,
        },
        performance: {
          totalDuration: 45000,
          buildDuration: 12000,
          contractDuration: 3000,
          uploadDuration: 15000,
          activationDuration: 2000,
        },
      };

      res.json({
        success: true,
        data: deploymentStatus,
      });

    } catch (error) {
      logger.error('Get deployment status failed', {
        error,
        userId: req.user?.id,
        siteId: req.params.siteId,
        deploymentId: req.params.deploymentId,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Rollback to previous deployment
   */
  async rollbackDeployment(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      const data = RollbackDeploymentSchema.parse(req.body);

      logger.info('Rolling back deployment', {
        userId: user.id,
        siteId,
        targetDeploymentId: data.targetDeploymentId,
        reason: data.reason,
        correlationId: req.correlationId,
      });

      // TODO: Implement rollback using pipeline.rollback()
      // For now, return success response
      
      res.json({
        success: true,
        data: {
          message: 'Rollback completed successfully',
          siteId,
          rolledBackTo: data.targetDeploymentId,
          rollbackTime: new Date(),
          reason: data.reason || 'Manual rollback requested',
        },
      });

    } catch (error) {
      logger.error('Deployment rollback failed', {
        error,
        userId: req.user?.id,
        siteId: req.params.siteId,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get deployment history for a site
   */
  async getDeploymentHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      logger.info('Getting deployment history', {
        userId: user.id,
        siteId,
        limit,
        offset,
        correlationId: req.correlationId,
      });

      // TODO: Load actual deployment history from repository
      const mockHistory = [
        {
          id: 'deploy_1234567890_abc123',
          siteId,
          tenantId: user.tenantId,
          status: 'succeeded',
          deploymentIntent: 'production',
          releaseHash: 'abc123def456',
          createdAt: new Date(Date.now() - 3600000), // 1 hour ago
          completedAt: new Date(Date.now() - 3550000),
          performance: {
            totalDuration: 45000,
            artifactSize: 1024 * 500, // 500KB
          },
        },
        {
          id: 'deploy_1234567800_def789',
          siteId,
          tenantId: user.tenantId,
          status: 'succeeded',
          deploymentIntent: 'preview',
          releaseHash: 'def789ghi012',
          createdAt: new Date(Date.now() - 86400000), // 1 day ago
          completedAt: new Date(Date.now() - 86395000),
          performance: {
            totalDuration: 38000,
            artifactSize: 1024 * 480, // 480KB
          },
        },
      ];

      res.json({
        success: true,
        data: {
          deployments: mockHistory.slice(offset, offset + limit),
          pagination: {
            limit,
            offset,
            total: mockHistory.length,
            hasMore: offset + limit < mockHistory.length,
          },
        },
      });

    } catch (error) {
      logger.error('Get deployment history failed', {
        error,
        userId: req.user?.id,
        siteId: req.params.siteId,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }


  /**
   * Private helper methods
   */

  private setupEventListeners(): void {
    // Listen for publishing events and emit to external systems
    this.eventBus.on('site.published', async (event) => {
      logger.info('Site published event received', event);
      
      // Emit to knowledge base for refresh
      this.eventBus.emit('kb.refreshRequested', {
        siteId: event.siteId,
        releaseHash: event.releaseHash,
        reason: 'site_published',
        contractPaths: event.contractPaths,
      });

      // Emit analytics event
      this.eventBus.emit('analytics.site_published', {
        siteId: event.siteId,
        tenantId: event.tenantId,
        deploymentIntent: event.deploymentIntent,
        publishedAt: event.publishedAt,
      });
    });

    this.eventBus.on('pipeline.state_changed', (event) => {
      logger.debug('Pipeline state change', event);
      
      // Could emit real-time updates to frontend here
      // this.websocketService.emit(`pipeline:${event.deploymentId}`, event);
    });
  }

  private async loadSiteData(siteId: string, tenantId: string): Promise<any> {
    // TODO: Replace with actual site repository call
    // This is a mock implementation
    return {
      id: siteId,
      name: `Site ${siteId}`,
      description: 'A SiteSpeak generated website',
      tenantId,
      templateId: 'modern-business',
      configuration: {
        theme: {
          primaryColor: '#3B82F6',
          secondaryColor: '#10B981',
          fontFamily: 'Inter',
        },
        seo: {
          title: `Site ${siteId} - Professional Services`,
          description: 'Professional website built with SiteSpeak',
          keywords: ['business', 'services', 'professional'],
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
            title: 'Welcome to Our Business',
            content: {
              sections: [
                { 
                  type: 'hero', 
                  title: 'Professional Services', 
                  content: 'We help businesses succeed',
                  config: { title: 'Welcome', subtitle: 'Professional services for your business' }
                },
                { 
                  type: 'services', 
                  title: 'Our Services', 
                  content: 'Consulting and support services' 
                },
              ],
            },
            isHomePage: true,
            isPublished: true,
            lastModified: new Date(),
          },
          {
            id: 'about',
            name: 'About',
            slug: '/about',
            title: 'About Us',
            content: {
              sections: [
                { 
                  type: 'content', 
                  title: 'Our Story', 
                  content: 'We are a professional services company...' 
                },
              ],
            },
            isHomePage: false,
            isPublished: true,
            lastModified: new Date(),
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
            lastModified: new Date(),
          },
        ],
        components: [],
        assets: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublished: true,
      getUrl: () => `https://${siteId}.sitespeak.com`,
    };
  }

}

// Export controller instance
export const publishingController = new PublishingController();