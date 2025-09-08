/**
 * Publishing Integration Service
 * 
 * Integrates the new Site Orchestrator with the existing Publishing Pipeline,
 * providing seamless orchestration between site management and publishing workflows.
 * 
 * This service acts as a bridge between:
 * - SiteOrchestrator (high-level workflow management)
 * - PublishingPipeline (technical publishing implementation)
 * - Domain management and asset handling
 */

import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { EventBus } from '../../../../services/_shared/events/eventBus';
import { createPublishingPipeline, PublishRequest, PipelineContext } from '../../../publishing/app/PublishingPipeline';
import { createArtifactStoreFromEnv } from '../../../publishing/adapters/ArtifactStore';
import { createCDNProviderFromEnv } from '../../../publishing/adapters/CDNProvider';
import type { SiteRepository } from '../../../../domain/repositories/SiteRepository';

const logger = createLogger({ service: 'publishing-integration' });

export interface SitePublishingContext {
  siteId: string;
  tenantId: string;
  userId: string;
  deploymentIntent: 'preview' | 'production';
  correlationId: string;
  domain?: string;
  buildParams?: {
    environment: 'development' | 'staging' | 'production';
    features?: string[];
    customDomain?: string;
    buildOptions?: Record<string, unknown>;
  };
}

export interface PublishingResult {
  deploymentId: string;
  releaseHash: string;
  status: 'succeeded' | 'failed';
  urls: {
    origin: string;
    cdn: string;
    preview?: string;
  };
  contractPaths: {
    sitemap: string;
    actions: string;
    structuredData: string;
    graphql?: string;
  };
  performanceMetrics: {
    totalDuration: number;
    buildDuration: number;
    contractDuration: number;
    uploadDuration: number;
    activationDuration: number;
    artifactSize: number;
    fileCount: number;
  };
  error?: string;
}

export class PublishingIntegration {
  private publishingPipeline;
  
  constructor(
    private siteRepository: SiteRepository,
    private eventBus: EventBus
  ) {
    // Initialize publishing infrastructure
    const artifactStore = createArtifactStoreFromEnv();
    const cdnProvider = createCDNProviderFromEnv();
    
    this.publishingPipeline = createPublishingPipeline(
      artifactStore, 
      cdnProvider, 
      this.eventBus, 
      this.siteRepository
    );

    this.setupEventHandlers();
  }

  /**
   * Execute site publishing workflow
   */
  async publishSite(context: SitePublishingContext): Promise<PublishingResult> {
    logger.info('Starting site publishing integration', {
      siteId: context.siteId,
      tenantId: context.tenantId,
      deploymentIntent: context.deploymentIntent,
      correlationId: context.correlationId,
    });

    try {
      // Load site data and validate
      const site = await this.validateSiteForPublishing(context);

      // Build publish request for the existing pipeline
      const publishRequest: PublishRequest = {
        siteId: context.siteId,
        tenantId: context.tenantId,
        deploymentIntent: context.deploymentIntent,
        commitSha: this.generateCommitSha(site),
        buildParams: (() => {
          const buildParams: any = {
            environment: context.buildParams?.environment || 'production',
            features: context.buildParams?.features || [],
            buildOptions: {
              ...context.buildParams?.buildOptions,
              siteConfiguration: site.configuration,
              siteContent: site.content,
            },
          };
          
          const customDomain = context.domain || site.customDomain;
          if (customDomain) {
            buildParams.customDomain = customDomain;
          }
          
          return buildParams;
        })(),
      };

      // Execute publishing pipeline
      const pipelineResult = await this.publishingPipeline.publish(publishRequest);

      // Transform pipeline result to our interface
      const result: PublishingResult = {
        deploymentId: pipelineResult.deploymentId,
        releaseHash: pipelineResult.releaseHash,
        status: 'succeeded',
        urls: {
          origin: pipelineResult.cdnUrls.origin,
          cdn: pipelineResult.cdnUrls.cdn,
          ...(pipelineResult.cdnUrls.preview && { preview: pipelineResult.cdnUrls.preview }),
        },
        contractPaths: {
          sitemap: pipelineResult.contractPaths['sitemap.xml'],
          actions: pipelineResult.contractPaths['actions.json'],
          structuredData: pipelineResult.contractPaths['robots.txt'], // robots.txt contains structured data
          ...(pipelineResult.contractPaths['schema.graphql'] && { graphql: pipelineResult.contractPaths['schema.graphql'] }),
        },
        performanceMetrics: pipelineResult.performanceMetrics,
      };

      // Update site status after successful publishing
      await this.updateSiteAfterPublishing(context.siteId, result);

      // Emit integration-level events
      this.eventBus.emit('site.publishing.completed', {
        ...context,
        result,
        publishedAt: new Date(),
      });

      logger.info('Site publishing completed successfully', {
        siteId: context.siteId,
        deploymentId: result.deploymentId,
        totalDuration: result.performanceMetrics.totalDuration,
        correlationId: context.correlationId,
      });

      return result;

    } catch (error) {
      logger.error('Site publishing failed', {
        siteId: context.siteId,
        correlationId: context.correlationId,
        error,
      });

      // Emit failure event
      this.eventBus.emit('site.publishing.failed', {
        ...context,
        error: (error as Error).message,
        failedAt: new Date(),
      });

      // Return failed result
      return {
        deploymentId: '',
        releaseHash: '',
        status: 'failed',
        urls: { origin: '', cdn: '' },
        contractPaths: { sitemap: '', actions: '', structuredData: '' },
        performanceMetrics: {
          totalDuration: 0,
          buildDuration: 0,
          contractDuration: 0,
          uploadDuration: 0,
          activationDuration: 0,
          artifactSize: 0,
          fileCount: 0,
        },
        error: (error as Error).message,
      };
    }
  }

  /**
   * Rollback site to previous version
   */
  async rollbackSite(
    siteId: string,
    tenantId: string,
    targetVersion?: string,
    reason?: string,
    correlationId?: string
  ): Promise<void> {
    logger.info('Rolling back site', {
      siteId,
      tenantId,
      targetVersion,
      reason,
      correlationId,
    });

    try {
      // Use existing pipeline rollback functionality
      // Create a minimal context for rollback (in practice this would be loaded from deployment history)
      const rollbackContext: PipelineContext = {
        deploymentId: 'current',
        request: {} as PublishRequest,
        state: 'deployed' as any,
        startTime: Date.now(),
        stateHistory: [],
        retryCount: 0,
        stepMetrics: {},
      };
      
      await this.publishingPipeline.rollback(rollbackContext);

      this.eventBus.emit('site.rollback.completed', {
        siteId,
        tenantId,
        targetVersion,
        reason,
        rolledBackAt: new Date(),
        correlationId,
      });

    } catch (error) {
      logger.error('Site rollback failed', {
        siteId,
        tenantId,
        error,
        correlationId,
      });

      this.eventBus.emit('site.rollback.failed', {
        siteId,
        tenantId,
        targetVersion,
        error: (error as Error).message,
        failedAt: new Date(),
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Get publishing status
   */
  async getPublishingStatus(deploymentId: string): Promise<any> {
    // This would integrate with the pipeline's status tracking
    // For now, return a mock status
    return {
      deploymentId,
      status: 'succeeded',
      progress: 100,
      currentStep: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
    };
  }

  /**
   * List deployment history
   */
  async getDeploymentHistory(siteId: string, tenantId: string): Promise<any[]> {
    // This would load from the deployment tracking system
    // For now, return mock history
    return [
      {
        id: 'deploy_' + Date.now(),
        siteId,
        tenantId,
        status: 'succeeded',
        deploymentIntent: 'production',
        createdAt: new Date(),
        completedAt: new Date(),
      },
    ];
  }

  /**
   * Private helper methods
   */

  private async validateSiteForPublishing(context: SitePublishingContext) {
    const site = await this.siteRepository.findById(context.siteId);
    
    if (!site) {
      throw new Error(`Site not found: ${context.siteId}`);
    }

    if (site.tenantId !== context.tenantId) {
      throw new Error('Site not found in tenant');
    }

    // Validate site has required content
    if (!site.content.pages.length) {
      throw new Error('Site must have at least one page to publish');
    }

    const homePage = site.getHomePage();
    if (!homePage) {
      throw new Error('Site must have a home page to publish');
    }

    return site;
  }

  private async updateSiteAfterPublishing(siteId: string, result: PublishingResult): Promise<void> {
    try {
      // Update site status and publication metadata
      await this.siteRepository.publish(siteId);

      logger.debug('Site updated after successful publishing', {
        siteId,
        deploymentId: result.deploymentId,
      });

    } catch (error) {
      logger.error('Failed to update site after publishing', {
        siteId,
        error,
      });
      // Don't throw - publishing was successful, this is just metadata update
    }
  }

  private generateCommitSha(site: any): string {
    // Generate a commit SHA based on site content for versioning
    const contentHash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify({
        content: site.content,
        configuration: site.configuration,
        updatedAt: site.updatedAt,
      }))
      .digest('hex');
    
    return contentHash.substring(0, 40); // Git SHA format
  }

  private setupEventHandlers(): void {
    // Handle publishing pipeline events and bridge them to site-level events
    this.eventBus.on('pipeline.state_changed', (event) => {
      logger.debug('Publishing pipeline state changed', event);

      // Emit site-specific event
      this.eventBus.emit('site.publishing.state_changed', {
        siteId: event.siteId,
        deploymentId: event.deploymentId,
        previousState: event.previousState,
        currentState: event.currentState,
        duration: event.duration,
      });
    });

    // Handle knowledge base refresh requests
    this.eventBus.on('site.published', async (event) => {
      logger.info('Site published - triggering knowledge base refresh', {
        siteId: event.siteId,
        tenantId: event.tenantId,
      });

      // Emit KB refresh event
      this.eventBus.emit('kb.site_published', {
        siteId: event.siteId,
        tenantId: event.tenantId,
        releaseHash: event.releaseHash,
        contractPaths: event.contractPaths,
        publishedAt: event.publishedAt,
      });
    });

    // Handle analytics events
    this.eventBus.on('site.publishing.completed', (event) => {
      this.eventBus.emit('analytics.site_published', {
        siteId: event.siteId,
        tenantId: event.tenantId,
        userId: event.userId,
        deploymentIntent: event.deploymentIntent,
        duration: event.result.performanceMetrics.totalDuration,
        artifactSize: event.result.performanceMetrics.artifactSize,
        publishedAt: event.publishedAt,
      });
    });
  }
}

// Create singleton instance for export
export const publishingIntegration = new PublishingIntegration(
  {} as SiteRepository, // Would be injected in production
  new EventBus()
);