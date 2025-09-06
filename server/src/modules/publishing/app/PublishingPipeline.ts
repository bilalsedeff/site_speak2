/**
 * Publishing Pipeline State Machine
 * 
 * Implements atomic, immutable, and cache-efficient publishes with blue/green deployment.
 * Orchestrates: Build → Contract → Package → Upload → Activate → Warm → Verify → Announce
 * 
 * Features:
 * - Content-addressed releases (SHA-256 manifest hash)
 * - Atomic deployment (blue/green switching)
 * - Instant rollback capability (pointer flip)
 * - Comprehensive observability and metrics
 * - Idempotent state transitions
 */

import { createLogger } from '../../../services/_shared/telemetry/logger';
import { EventBus } from '../../../services/_shared/events/eventBus';
// Metrics service not used yet - will be implemented for telemetry
import { siteContractService, ContractGenerationResult } from '../../sites/application/services/SiteContractService';
import type { ArtifactStore } from '../adapters/ArtifactStore';
import type { CDNProvider } from '../adapters/CDNProvider';
import type { SiteRepository } from '../../../domain/repositories/SiteRepository';
import type { Site } from '../../../domain/entities/Site';
import { createHash } from 'crypto';

const logger = createLogger({ service: 'publishing-pipeline' });

export type DeploymentIntent = 'preview' | 'production';

export type PipelineState = 
  | 'draft' 
  | 'building'
  | 'contracting' 
  | 'packaging'
  | 'uploading'
  | 'activating'
  | 'warming'
  | 'verifying'
  | 'announcing'
  | 'succeeded'
  | 'rolling_back'
  | 'rolled_back'
  | 'failed';

export interface PublishRequest {
  siteId: string;
  tenantId: string;
  deploymentIntent: DeploymentIntent;
  commitSha?: string;
  buildParams?: BuildParams;
  previousDeploymentId?: string;
}

export interface BuildParams {
  environment: 'development' | 'staging' | 'production';
  features?: string[];
  customDomain?: string;
  buildOptions?: Record<string, any>;
}

export interface DeploymentResult {
  deploymentId: string;
  releaseHash: string;
  cdnUrls: CDNUrls;
  contractPaths: ContractPaths;
  sbom?: SBOM;
  buildLogs?: string[];
  performanceMetrics: PerformanceMetrics;
}

export interface CDNUrls {
  origin: string;
  cdn: string;
  preview?: string;
}

export interface ContractPaths {
  'sitemap.xml': string;
  'robots.txt': string;
  'actions.json': string;
  'speculation-rules.json': string;
  'schema.graphql'?: string;
  'types.d.ts'?: string;
}

export interface SBOM {
  version: string;
  components: SBOMComponent[];
  metadata: {
    timestamp: string;
    tools: string[];
    supplier: {
      name: string;
      url: string;
    };
  };
}

export interface SBOMComponent {
  type: 'library' | 'framework' | 'application';
  name: string;
  version: string;
  purl?: string;
  licenses?: string[];
  hashes?: { alg: string; content: string }[];
}

export interface PerformanceMetrics {
  buildDuration: number;
  contractDuration: number;
  packageDuration: number;
  uploadDuration: number;
  activationDuration: number;
  warmDuration: number;
  verifyDuration: number;
  totalDuration: number;
  artifactSize: number;
  fileCount: number;
}

export interface PipelineContext {
  deploymentId: string;
  request: PublishRequest;
  state: PipelineState;
  startTime: number;
  stateHistory: { state: PipelineState; timestamp: number; duration?: number }[];
  
  // Intermediate results
  siteContract?: ContractGenerationResult;
  releaseHash?: string;
  artifactManifest?: ArtifactManifest;
  uploadResults?: UploadResult[];
  activationResult?: ActivationResult;
  
  // Error handling
  error?: Error;
  retryCount: number;
  
  // Performance tracking
  stepMetrics: Record<string, { startTime: number; duration?: number; success?: boolean }>;
}

export interface ArtifactManifest {
  version: '1.0';
  releaseHash: string;
  files: ArtifactFile[];
  metadata: {
    siteId: string;
    tenantId: string;
    buildTime: string;
    environment: string;
    commitSha?: string;
  };
  integrity: {
    algorithm: 'sha256';
    hash: string;
  };
}

export interface ArtifactFile {
  path: string;
  size: number;
  hash: string;
  contentType: string;
  cacheControl?: string;
}

export interface UploadResult {
  path: string;
  url: string;
  etag: string;
  size: number;
}

export interface ActivationResult {
  aliasPointed: string;
  previousAlias?: string;
  activatedAt: Date;
  rollbackCapable: boolean;
}

/**
 * Publishing Pipeline State Machine
 */
export class PublishingPipeline {
  
  constructor(
    private artifactStore: ArtifactStore,
    private cdnProvider: CDNProvider,
    private eventBus: EventBus,
    private siteRepository: SiteRepository
  ) {}

  /**
   * Execute complete publishing pipeline
   */
  async publish(request: PublishRequest): Promise<DeploymentResult> {
    const deploymentId = this.generateDeploymentId();
    const context: PipelineContext = {
      deploymentId,
      request,
      state: 'draft',
      startTime: Date.now(),
      stateHistory: [],
      retryCount: 0,
      stepMetrics: {}
    };

    logger.info('Publishing pipeline started', {
      deploymentId,
      siteId: request.siteId,
      tenantId: request.tenantId,
      intent: request.deploymentIntent
    });

    try {
      // Execute state machine transitions
      await this.transitionTo(context, 'building');
      await this.buildStep(context);
      
      await this.transitionTo(context, 'contracting');
      await this.contractStep(context);
      
      await this.transitionTo(context, 'packaging');
      await this.packageStep(context);
      
      await this.transitionTo(context, 'uploading');
      await this.uploadStep(context);
      
      await this.transitionTo(context, 'activating');
      await this.activateStep(context);
      
      await this.transitionTo(context, 'warming');
      await this.warmStep(context);
      
      await this.transitionTo(context, 'verifying');
      await this.verifyStep(context);
      
      await this.transitionTo(context, 'announcing');
      await this.announceStep(context);
      
      await this.transitionTo(context, 'succeeded');
      
      const result = this.buildDeploymentResult(context);
      
      logger.info('Publishing pipeline succeeded', {
        deploymentId,
        releaseHash: result.releaseHash,
        totalDuration: result.performanceMetrics.totalDuration
      });

      return result;

    } catch (error) {
      logger.error('Publishing pipeline failed', {
        deploymentId,
        state: context.state,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      context.error = error instanceof Error ? error : new Error('Unknown error');
      
      // Attempt rollback if we're past activation
      if (['activating', 'warming', 'verifying', 'announcing'].includes(context.state)) {
        try {
          await this.rollback(context);
        } catch (rollbackError) {
          logger.error('Rollback failed', {
            deploymentId,
            rollbackError: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
          });
        }
      } else {
        await this.transitionTo(context, 'failed');
      }

      throw context.error;
    }
  }

  /**
   * Rollback deployment to previous version
   */
  async rollback(context: PipelineContext): Promise<void> {
    await this.transitionTo(context, 'rolling_back');

    try {
      // Retrieve previous deployment alias
      const previousDeploymentId = context.request.previousDeploymentId;
      if (!previousDeploymentId) {
        throw new Error('No previous deployment available for rollback');
      }

      // Point alias back to previous deployment
      const aliasKey = `sites/${context.request.tenantId}/${context.request.siteId}/live`;
      const previousAlias = `releases/${previousDeploymentId}`;

      // This should be a pointer operation, not a re-upload
      await this.artifactStore.setAlias(aliasKey, previousAlias);

      // Purge CDN cache to ensure old version is served
      await this.cdnProvider.purgeByTag([
        `site:${context.request.siteId}`,
        `tenant:${context.request.tenantId}`
      ]);

      await this.transitionTo(context, 'rolled_back');

      logger.info('Rollback completed', {
        deploymentId: context.deploymentId,
        rolledBackTo: previousDeploymentId
      });

    } catch (error) {
      await this.transitionTo(context, 'failed');
      throw error;
    }
  }

  // State Machine Transition Management
  
  private async transitionTo(context: PipelineContext, newState: PipelineState): Promise<void> {
    const previousState = context.state;
    const transitionTime = Date.now();
    const duration = previousState ? transitionTime - context.startTime : 0;

    // Record state history
    if (context.stateHistory.length > 0) {
      const lastState = context.stateHistory[context.stateHistory.length - 1];
      if (lastState) {
        lastState.duration = duration;
      }
    }
    
    context.stateHistory.push({
      state: newState,
      timestamp: transitionTime
    });

    context.state = newState;

    logger.debug('Pipeline state transition', {
      deploymentId: context.deploymentId,
      from: previousState,
      to: newState,
      duration
    });

    // Emit state change event
    await this.eventBus.emit('pipeline.state_changed', {
      deploymentId: context.deploymentId,
      siteId: context.request.siteId,
      previousState,
      currentState: newState,
      duration
    });
  }

  // Pipeline Steps Implementation

  private async buildStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['build'] = { startTime: stepStart };

    try {
      // For now, this is a placeholder for the build process
      // In a real implementation, this would invoke the site builder
      logger.info('Build step started', {
        deploymentId: context.deploymentId,
        siteId: context.request.siteId
      });

      // Simulate deterministic build process
      await this.delay(1000); // Placeholder for actual build

      const duration = Date.now() - stepStart;
      context.stepMetrics['build'] = { ...context.stepMetrics['build'], duration, success: true };

      logger.info('Build step completed', {
        deploymentId: context.deploymentId,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['build'] = { ...context.stepMetrics['build'], duration, success: false };
      throw error;
    }
  }

  private async contractStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['contract'] = { startTime: stepStart };

    try {
      // Use existing site contract generator
      // Load site data for existing contract service
      const site = await this.loadSiteData(context);

      // Generate contract using existing service
      context.siteContract = await siteContractService.generateContract({
        site,
        includeAnalytics: true,
        wcagLevel: 'AA'
      });

      const duration = Date.now() - stepStart;
      context.stepMetrics['contract'] = { ...context.stepMetrics['contract'], duration, success: true };

      logger.info('Contract step completed', {
        deploymentId: context.deploymentId,
        pageCount: context.siteContract.contract.pages.length,
        actionCount: context.siteContract.contract.actions.length,
        valid: context.siteContract.validation.valid,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['contract'] = { ...context.stepMetrics['contract'], duration, success: false };
      throw error;
    }
  }

  private async packageStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['package'] = { startTime: stepStart };

    try {
      if (!context.siteContract) {
        throw new Error('Site contract not available for packaging');
      }

      // Create artifact manifest
      const files: ArtifactFile[] = [];
      
      // Generate contract files from existing service
      const contract = context.siteContract.contract;
      const contractFiles = {
        'sitemap.xml': contract.generateSitemap(),
        'robots.txt': contract.generateRobotsTxt(),
        'manifest.json': JSON.stringify(contract.generateWebManifest()),
        'contract.json': JSON.stringify({
          id: contract.id,
          siteId: contract.siteId,
          version: contract.version,
          businessInfo: contract.businessInfo,
          pages: contract.pages,
          actions: contract.actions,
          schema: contract.schema,
          accessibility: contract.accessibility,
          seo: contract.seo,
          createdAt: contract.createdAt,
          updatedAt: contract.updatedAt,
        })
      };

      Object.entries(contractFiles).forEach(([filename, content]) => {
        const hash = createHash('sha256').update(content).digest('hex');
        files.push({
          path: `contract/${filename}`,
          size: Buffer.byteLength(content),
          hash,
          contentType: this.getContentType(filename),
          cacheControl: filename.endsWith('.xml') || filename.endsWith('.txt') 
            ? 'no-cache, must-revalidate' 
            : 'public, max-age=31536000, immutable'
        });
      });

      // Calculate release hash from manifest
      const manifestContent = JSON.stringify({ files }, null, 2);
      const releaseHash = createHash('sha256').update(manifestContent).digest('hex');
      
      context.releaseHash = releaseHash;
      context.artifactManifest = {
        version: '1.0',
        releaseHash,
        files,
        metadata: {
          siteId: context.request.siteId,
          tenantId: context.request.tenantId,
          buildTime: new Date().toISOString(),
          environment: context.request.buildParams?.environment || 'production',
          ...(context.request.commitSha && { commitSha: context.request.commitSha })
        },
        integrity: {
          algorithm: 'sha256',
          hash: createHash('sha256').update(manifestContent).digest('hex')
        }
      };

      const duration = Date.now() - stepStart;
      context.stepMetrics['package'] = { ...context.stepMetrics['package'], duration, success: true };

      logger.info('Package step completed', {
        deploymentId: context.deploymentId,
        releaseHash,
        fileCount: files.length,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['package'] = { ...context.stepMetrics['package'], duration, success: false };
      throw error;
    }
  }

  private async uploadStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['upload'] = { startTime: stepStart };

    try {
      if (!context.artifactManifest || !context.siteContract || !context.releaseHash) {
        throw new Error('Missing required data for upload step');
      }

      const uploadResults: UploadResult[] = [];

      // Upload manifest.json first
      const manifestPath = `${context.request.tenantId}/${context.request.siteId}/${context.releaseHash}/manifest.json`;
      const manifestContent = JSON.stringify(context.artifactManifest, null, 2);
      
      const manifestResult = await this.artifactStore.putObject(
        manifestPath,
        Buffer.from(manifestContent),
        { 
          contentType: 'application/json',
          cacheControl: 'public, max-age=31536000, immutable'
        }
      );

      uploadResults.push({
        path: manifestPath,
        url: await this.artifactStore.getPublicUrl(manifestPath),
        etag: manifestResult.etag,
        size: Buffer.byteLength(manifestContent)
      });

      // Upload contract files
      const contract = context.siteContract.contract;
      const contractFiles = {
        'sitemap.xml': contract.generateSitemap(),
        'robots.txt': contract.generateRobotsTxt(),
        'manifest.json': JSON.stringify(contract.generateWebManifest()),
        'contract.json': JSON.stringify(contract)
      };
      
      for (const [filename, content] of Object.entries(contractFiles)) {
        const filePath = `${context.request.tenantId}/${context.request.siteId}/${context.releaseHash}/contract/${filename}`;
        
        const result = await this.artifactStore.putObject(
          filePath,
          Buffer.from(content),
          {
            contentType: this.getContentType(filename),
            cacheControl: filename.endsWith('.xml') || filename.endsWith('.txt')
              ? 'no-cache, must-revalidate'
              : 'public, max-age=31536000, immutable'
          }
        );

        uploadResults.push({
          path: filePath,
          url: await this.artifactStore.getPublicUrl(filePath),
          etag: result.etag,
          size: Buffer.byteLength(content)
        });
      }

      context.uploadResults = uploadResults;

      const duration = Date.now() - stepStart;
      const totalSize = uploadResults.reduce((sum, result) => sum + result.size, 0);
      
      context.stepMetrics['upload'] = { ...context.stepMetrics['upload'], duration, success: true };

      logger.info('Upload step completed', {
        deploymentId: context.deploymentId,
        fileCount: uploadResults.length,
        totalSize,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['upload'] = { ...context.stepMetrics['upload'], duration, success: false };
      throw error;
    }
  }

  private async activateStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['activate'] = { startTime: stepStart };

    try {
      if (!context.releaseHash) {
        throw new Error('Release hash not available for activation');
      }

      // Perform atomic blue/green switch
      const aliasKey = `sites/${context.request.tenantId}/${context.request.siteId}/live`;
      const newAlias = `releases/${context.releaseHash}`;
      
      // Get previous alias for rollback capability
      let previousAlias: string | undefined;
      try {
        previousAlias = await this.artifactStore.getAlias(aliasKey);
      } catch {
        // No previous alias exists
      }

      // Atomic pointer flip
      await this.artifactStore.setAlias(aliasKey, newAlias);

      context.activationResult = {
        aliasPointed: newAlias,
        ...(previousAlias && { previousAlias }),
        activatedAt: new Date(),
        rollbackCapable: !!previousAlias
      };

      const duration = Date.now() - stepStart;
      context.stepMetrics['activate'] = { ...context.stepMetrics['activate'], duration, success: true };

      logger.info('Activation step completed', {
        deploymentId: context.deploymentId,
        aliasKey,
        newAlias,
        previousAlias,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['activate'] = { ...context.stepMetrics['activate'], duration, success: false };
      throw error;
    }
  }

  private async warmStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['warm'] = { startTime: stepStart };

    try {
      // Purge CDN cache first
      await this.cdnProvider.purgeByTag([
        `site:${context.request.siteId}`,
        `tenant:${context.request.tenantId}`,
        `release:${context.releaseHash}`
      ]);

      // Warm critical routes
      const baseUrl = this.buildDomain(context);
      const criticalRoutes = ['/', '/sitemap.xml', '/robots.txt', '/actions.json'];
      
      const warmPromises = criticalRoutes.map(route => 
        this.warmRoute(`${baseUrl}${route}`).catch(error => {
          logger.warn('Route warm failed', { route, error: error.message });
        })
      );

      await Promise.all(warmPromises);

      const duration = Date.now() - stepStart;
      context.stepMetrics['warm'] = { ...context.stepMetrics['warm'], duration, success: true };

      logger.info('Warm step completed', {
        deploymentId: context.deploymentId,
        routeCount: criticalRoutes.length,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['warm'] = { ...context.stepMetrics['warm'], duration, success: false };
      throw error;
    }
  }

  private async verifyStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['verify'] = { startTime: stepStart };

    try {
      // Basic synthetic checks
      const baseUrl = this.buildDomain(context);
      
      // Health check
      const healthResponse = await fetch(`${baseUrl}/health`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }

      // Contract validation
      if (context.siteContract) {
        // Verify sitemap is accessible
        const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        
        if (!sitemapResponse.ok) {
          throw new Error(`Sitemap not accessible: ${sitemapResponse.status}`);
        }
      }

      const duration = Date.now() - stepStart;
      context.stepMetrics['verify'] = { ...context.stepMetrics['verify'], duration, success: true };

      logger.info('Verify step completed', {
        deploymentId: context.deploymentId,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['verify'] = { ...context.stepMetrics['verify'], duration, success: false };
      throw error;
    }
  }

  private async announceStep(context: PipelineContext): Promise<void> {
    const stepStart = Date.now();
    context.stepMetrics['announce'] = { startTime: stepStart };

    try {
      // Emit site.published event
      await this.eventBus.emit('site.published', {
        deploymentId: context.deploymentId,
        siteId: context.request.siteId,
        tenantId: context.request.tenantId,
        releaseHash: context.releaseHash,
        deploymentIntent: context.request.deploymentIntent,
        publishedAt: new Date().toISOString(),
        contractPaths: this.buildContractPaths(context)
      });

      // Emit kb.refreshRequested for delta indexing
      await this.eventBus.emit('kb.refreshRequested', {
        siteId: context.request.siteId,
        releaseHash: context.releaseHash,
        reason: 'site_published'
      });

      const duration = Date.now() - stepStart;
      context.stepMetrics['announce'] = { ...context.stepMetrics['announce'], duration, success: true };

      logger.info('Announce step completed', {
        deploymentId: context.deploymentId,
        duration
      });

    } catch (error) {
      const duration = Date.now() - stepStart;
      context.stepMetrics['announce'] = { ...context.stepMetrics['announce'], duration, success: false };
      throw error;
    }
  }

  // Helper Methods

  private generateDeploymentId(): string {
    return `deploy_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private async loadSiteData(context: PipelineContext): Promise<Site> {
    logger.debug('Loading site data from repository', {
      siteId: context.request.siteId,
      tenantId: context.request.tenantId
    });

    const site = await this.siteRepository.findById(context.request.siteId);
    if (!site) {
      throw new Error(`Site not found: ${context.request.siteId}`);
    }

    // Verify tenant access
    if (site.tenantId !== context.request.tenantId) {
      throw new Error(`Site ${context.request.siteId} does not belong to tenant ${context.request.tenantId}`);
    }

    // Verify site is publishable
    if (!site.isPublished && context.request.deploymentIntent === 'production') {
      throw new Error(`Site ${context.request.siteId} is not marked as published`);
    }

    logger.debug('Site data loaded successfully', {
      siteId: site.id,
      siteName: site.name,
      pageCount: site.content.pages.length,
      componentCount: site.content.components.length,
      assetCount: site.content.assets.length
    });

    return site;
  }

  private buildDomain(context: PipelineContext): string {
    const customDomain = context.request.buildParams?.customDomain;
    if (customDomain) {
      return `https://${customDomain}`;
    }
    
    return `https://${context.request.siteId}.sites.sitespeak.com`;
  }


  private buildContractPaths(context: PipelineContext): ContractPaths {
    const baseUrl = `${context.request.tenantId}/${context.request.siteId}/${context.releaseHash}/contract`;
    
    return {
      'sitemap.xml': `${baseUrl}/sitemap.xml`,
      'robots.txt': `${baseUrl}/robots.txt`,
      'actions.json': `${baseUrl}/actions.json`,
      'speculation-rules.json': `${baseUrl}/speculation-rules.json`
    };
  }

  private buildDeploymentResult(context: PipelineContext): DeploymentResult {
    if (!context.releaseHash || !context.uploadResults) {
      throw new Error('Incomplete context for deployment result');
    }

    const totalDuration = Date.now() - context.startTime;
    const totalSize = context.uploadResults.reduce((sum, result) => sum + result.size, 0);

    return {
      deploymentId: context.deploymentId,
      releaseHash: context.releaseHash,
      cdnUrls: {
        origin: this.buildDomain(context),
        cdn: this.buildDomain(context), // CDN would be different in production
      },
      contractPaths: this.buildContractPaths(context),
      performanceMetrics: {
        buildDuration: context.stepMetrics['build']?.duration || 0,
        contractDuration: context.stepMetrics['contract']?.duration || 0,
        packageDuration: context.stepMetrics['package']?.duration || 0,
        uploadDuration: context.stepMetrics['upload']?.duration || 0,
        activationDuration: context.stepMetrics['activate']?.duration || 0,
        warmDuration: context.stepMetrics['warm']?.duration || 0,
        verifyDuration: context.stepMetrics['verify']?.duration || 0,
        totalDuration,
        artifactSize: totalSize,
        fileCount: context.uploadResults.length
      }
    };
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'xml': return 'application/xml';
      case 'json': return 'application/json';
      case 'txt': return 'text/plain';
      case 'js': return 'application/javascript';
      case 'css': return 'text/css';
      case 'html': return 'text/html';
      default: return 'application/octet-stream';
    }
  }

  private async warmRoute(url: string): Promise<void> {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Warm failed: ${response.status}`);
      }
    } catch (error) {
      logger.debug('Route warm failed', { url, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating publishing pipeline instances
 */
export function createPublishingPipeline(
  artifactStore: ArtifactStore,
  cdnProvider: CDNProvider,
  eventBus: EventBus,
  siteRepository: SiteRepository
): PublishingPipeline {
  return new PublishingPipeline(artifactStore, cdnProvider, eventBus, siteRepository);
}