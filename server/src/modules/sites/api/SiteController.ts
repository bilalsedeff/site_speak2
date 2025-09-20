/**
 * Site Controller
 * 
 * Enhanced HTTP controllers for site management following RFC standards:
 * - OpenAPI 3.1 compliant endpoints
 * - ETag/If-Match optimistic concurrency control
 * - Link header pagination
 * - Problem Details (RFC 9457) error responses
 * - Cache-Control headers
 * - Idempotency key support
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '../../../services/_shared/telemetry/logger';
import { HttpHeaders, PaginationMeta } from '../adapters/http/HttpHeaders';
import { ProblemDetails } from '../adapters/http/ProblemDetails';
import { SiteOrchestrator, CreateSiteRequest, UpdateSiteRequest, PublishSiteRequest } from '../application/services/SiteOrchestrator';
import { assetUploadService, PresignRequest } from '../application/services/AssetUploadService';
import { domainManager, DomainConnectionRequest } from '../application/services/DomainManager';
import type { SiteRepository } from '../../../domain/repositories/SiteRepository';
import { CreateSiteSchema, UpdateSiteSchema } from '../../../domain/entities/Site';

const logger = createLogger({ service: 'site-controller' });

// Request/Response schemas
const ListSitesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  templateId: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'publishedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const PublishSiteSchema = z.object({
  deploymentIntent: z.enum(['preview', 'production']).default('production'),
  domain: z.string().optional(),
});

const ConnectDomainSchema = z.object({
  domain: z.string().min(1),
  verificationMethod: z.enum(['HTTP-01', 'DNS-01']).default('HTTP-01'),
});

const PresignAssetSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().int().min(1),
  multipart: z.boolean().optional(),
});

export class SiteController {
  constructor(
    private siteRepository: SiteRepository,
    private siteOrchestrator: SiteOrchestrator
  ) {}

  /**
   * List sites with pagination and filtering
   * GET /api/sites
   */
  async listSites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      const correlationId = HttpHeaders.getCorrelationId(req);
      const query = ListSitesQuerySchema.parse(req.query);

      // Handle development mode when no user is authenticated
      if (!user) {
        logger.warn('No authenticated user for sites listing', { correlationId });
        res.status(401).json(
          ProblemDetails.unauthorized('Authentication required to list sites', correlationId)
        );
        return;
      }

      logger.info('Listing sites', {
        userId: user.id,
        tenantId: user.tenantId,
        query,
        correlationId,
      });

      // Build query options
      const options = {
        tenantId: user.tenantId,
        ...(query.status && { status: query.status }),
        ...(query.templateId && { templateId: query.templateId }),
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };

      // Search if query provided
      let sitesResult;
      if (query.search) {
        const searchResults = await this.siteRepository.search(query.search, user.tenantId);
        sitesResult = {
          sites: searchResults.slice((query.page - 1) * query.limit, query.page * query.limit),
          total: searchResults.length,
          page: query.page,
          limit: query.limit,
          totalPages: Math.ceil(searchResults.length / query.limit),
        };
      } else {
        sitesResult = await this.siteRepository.findMany(options);
      }

      // Set cache headers (private, short-lived)
      HttpHeaders.setPrivateCache(res, 300); // 5 minutes

      // Set pagination Link headers
      const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
      const paginationMeta: PaginationMeta = {
        page: sitesResult.page,
        limit: sitesResult.limit,
        total: sitesResult.total,
        totalPages: sitesResult.totalPages,
      };

      const queryParams: Record<string, string> = {};
      if (query['status']) {queryParams['status'] = query['status'];}
      if (query['templateId']) {queryParams['templateId'] = query['templateId'];}
      if (query['search']) {queryParams['search'] = query['search'];}
      if (query['sortBy'] !== 'updatedAt') {queryParams['sortBy'] = query['sortBy'];}
      if (query['sortOrder'] !== 'desc') {queryParams['sortOrder'] = query['sortOrder'];}

      HttpHeaders.setPaginationLinks(res, baseUrl, paginationMeta, queryParams);
      HttpHeaders.setCorrelationId(res, correlationId);

      res.json({
        sites: sitesResult.sites.map(site => ({
          id: site.id,
          name: site.name,
          description: site.description,
          status: site.status,
          templateId: site.templateId,
          isPublished: site.isPublished,
          publishedAt: site.publishedAt,
          customDomain: site.customDomain,
          subdomain: site.subdomain,
          createdAt: site.createdAt,
          updatedAt: site.updatedAt,
          url: site.getUrl(),
          previewUrl: site.getPreviewUrl(),
          pagesCount: site.getPagesCount(),
          publishedPagesCount: site.getPublishedPagesCount(),
        })),
        pagination: {
          page: sitesResult.page,
          limit: sitesResult.limit,
          total: sitesResult.total,
          totalPages: sitesResult.totalPages,
          hasNext: sitesResult.page < sitesResult.totalPages,
          hasPrev: sitesResult.page > 1,
        },
      });

    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { message: String(error) };
      
      logger.error('Failed to list sites', {
        userId: req.user?.id,
        error: errorDetails,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Get site by ID with ETag support
   * GET /api/sites/:id
   */
  async getSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);

      logger.info('Getting site', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        correlationId,
      });

      const site = await this.siteRepository.findById(siteId);
      if (!site) {
        const problem = ProblemDetails.siteNotFound(siteId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      if (site.tenantId !== user.tenantId) {
        const problem = ProblemDetails.forbidden('Access to this site is forbidden', req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      // Generate ETag from site updatedAt
      const etag = HttpHeaders.generateEntityETag(site.updatedAt);
      
      // Handle conditional GET
      if (HttpHeaders.handleConditionalGet(req, res, etag)) {
        return; // 304 Not Modified response sent
      }

      // Set cache headers
      HttpHeaders.setPrivateCache(res, 300); // 5 minutes
      HttpHeaders.setCorrelationId(res, correlationId);

      res.json({
        id: site.id,
        name: site.name,
        description: site.description,
        status: site.status,
        templateId: site.templateId,
        configuration: site.configuration,
        content: site.content,
        isPublished: site.isPublished,
        publishedAt: site.publishedAt,
        customDomain: site.customDomain,
        subdomain: site.subdomain,
        createdAt: site.createdAt,
        updatedAt: site.updatedAt,
        url: site.getUrl(),
        previewUrl: site.getPreviewUrl(),
        analytics: site.getAnalyticsSummary(),
      });

    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { message: String(error) };
      
      logger.error('Failed to get site', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error: errorDetails,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Create new site with idempotency support
   * POST /api/sites
   */
  async createSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const correlationId = HttpHeaders.getCorrelationId(req);
      const idempotencyKey = req.header('Idempotency-Key');
      
      const data = CreateSiteSchema.parse(req.body);

      logger.info('Creating site', {
        userId: user.id,
        tenantId: user.tenantId,
        siteName: data.name,
        templateId: data.templateId,
        correlationId,
        idempotencyKey,
      });

      const request: CreateSiteRequest = {
        tenantId: user.tenantId,
        userId: user.id,
        data,
        correlationId,
      };

      const context = await this.siteOrchestrator.start('CREATE', request);
      
      // Wait for orchestration to complete (in production, might return async status)
      if (context.state !== 'succeeded') {
        const problem = ProblemDetails.internalServerError(correlationId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      const createdSite = context.metadata['site'] as any;
      if (!createdSite) {
        const problem = ProblemDetails.internalServerError(correlationId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      // Set headers
      res.header('Location', `/api/sites/${createdSite.id}`);
      HttpHeaders.setEntityETag(res, createdSite.updatedAt);
      HttpHeaders.setCorrelationId(res, correlationId);

      if (idempotencyKey) {
        res.header('Idempotency-Key', idempotencyKey);
      }

      res.status(201).json({
        id: createdSite.id,
        name: createdSite.name,
        description: createdSite.description,
        status: createdSite.status,
        templateId: createdSite.templateId,
        configuration: createdSite.configuration,
        createdAt: createdSite.createdAt,
        updatedAt: createdSite.updatedAt,
        url: createdSite.getUrl(),
        previewUrl: createdSite.getPreviewUrl(),
      });

    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { message: String(error) };
      
      logger.error('Failed to create site', {
        userId: req.user?.id,
        error: errorDetails,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Update site with ETag validation
   * PUT /api/sites/:id
   */
  async updateSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);

      const data = UpdateSiteSchema.parse(req.body);

      logger.info('Updating site', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        correlationId,
      });

      // Load current site for ETag validation
      const currentSite = await this.siteRepository.findById(siteId);
      if (!currentSite) {
        const problem = ProblemDetails.siteNotFound(siteId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      if (currentSite.tenantId !== user.tenantId) {
        const problem = ProblemDetails.forbidden('Access to this site is forbidden', req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      // Enforce If-Match header
      const currentETag = HttpHeaders.generateEntityETag(currentSite.updatedAt);
      try {
        HttpHeaders.enforceIfMatch(req, currentETag);
      } catch (error) {
        const problem = ProblemDetails.preconditionFailed(
          'ETag mismatch - site has been modified by another request',
          req.path
        );
        ProblemDetails.send(res, problem);
        return;
      }

      const request: UpdateSiteRequest = {
        siteId,
        tenantId: user.tenantId,
        userId: user.id,
        data,
        correlationId,
      };

      const context = await this.siteOrchestrator.start('UPDATE', request);
      
      if (context.state !== 'succeeded') {
        const problem = ProblemDetails.internalServerError(correlationId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      const updatedSite = context.metadata['updatedSite'] as any;
      if (!updatedSite) {
        const problem = ProblemDetails.internalServerError(correlationId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      // Set ETag for new version
      HttpHeaders.setEntityETag(res, updatedSite.updatedAt);
      HttpHeaders.setCorrelationId(res, correlationId);

      res.json({
        id: updatedSite.id,
        name: updatedSite.name,
        description: updatedSite.description,
        status: updatedSite.status,
        configuration: updatedSite.configuration,
        content: updatedSite.content,
        updatedAt: updatedSite.updatedAt,
        url: updatedSite.getUrl(),
        previewUrl: updatedSite.getPreviewUrl(),
      });

    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : { message: String(error) };
      
      logger.error('Failed to update site', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error: errorDetails,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Delete site
   * DELETE /api/sites/:id
   */
  async deleteSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);

      logger.info('Deleting site', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        correlationId,
      });

      // Verify site exists and user has access
      const site = await this.siteRepository.findById(siteId);
      if (!site) {
        const problem = ProblemDetails.siteNotFound(siteId, req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      if (site.tenantId !== user.tenantId) {
        const problem = ProblemDetails.forbidden('Access to this site is forbidden', req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      const request = {
        siteId,
        tenantId: user.tenantId,
        userId: user.id,
        correlationId,
      };

      await this.siteOrchestrator.start('DELETE', request);

      HttpHeaders.setCorrelationId(res, correlationId);
      res.status(204).end();

    } catch (error) {
      logger.error('Failed to delete site', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Publish site with idempotency support
   * POST /api/sites/:id/publish
   */
  async publishSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);
      const idempotencyKey = req.header('Idempotency-Key');
      
      const data = PublishSiteSchema.parse(req.body);

      logger.info('Publishing site', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        deploymentIntent: data.deploymentIntent,
        correlationId,
        idempotencyKey,
      });

      const request: PublishSiteRequest = {
        siteId,
        tenantId: user.tenantId,
        userId: user.id,
        deploymentIntent: data.deploymentIntent,
        ...(data.domain && { domain: data.domain }),
        correlationId,
      };

      const context = await this.siteOrchestrator.start('PUBLISH', request);

      // Set headers
      HttpHeaders.setCorrelationId(res, correlationId);
      if (idempotencyKey) {
        res.header('Idempotency-Key', idempotencyKey);
      }

      res.status(202).json({
        message: 'Publishing initiated',
        siteId,
        correlationId,
        deploymentIntent: data.deploymentIntent,
        status: context.state,
        statusUrl: `/api/sites/${siteId}/publish/${correlationId}`,
      });

    } catch (error) {
      logger.error('Failed to publish site', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Get publishing status
   * GET /api/sites/:id/publish/:correlationId
   */
  async getPublishStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const statusId = req.params['correlationId'];
      if (!statusId) {
        const problem = ProblemDetails.badRequest('Correlation ID is required', req.path);
        ProblemDetails.send(res, problem);
        return;
      }
      
      const correlationId = HttpHeaders.getCorrelationId(req);

      logger.info('Getting publish status', {
        userId: user.id,
        siteId,
        statusId,
        correlationId,
      });

      const status = this.siteOrchestrator.getStatus(statusId);
      if (!status) {
        const problem = ProblemDetails.notFound('Publishing status', req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      // Set cache headers - no caching for status
      HttpHeaders.setNoCache(res);
      HttpHeaders.setCorrelationId(res, correlationId);

      res.json({
        correlationId: statusId,
        siteId,
        command: status.command,
        state: status.state,
        startedAt: status.startedAt,
        completedAt: status.completedAt,
        steps: status.steps.map(step => ({
          name: step.name,
          status: step.status,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
          error: step.error?.message,
        })),
        error: status.error?.message,
        metadata: {
          progress: this.calculateProgress(status.steps),
          estimatedCompletion: this.estimateCompletion(status),
        },
      });

    } catch (error) {
      logger.error('Failed to get publish status', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        statusId: req.params['correlationId'],
        error,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Connect custom domain
   * POST /api/sites/:id/domains
   */
  async connectDomain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);
      
      const data = ConnectDomainSchema.parse(req.body);

      logger.info('Connecting domain', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        domain: data.domain,
        correlationId,
      });

      const request: DomainConnectionRequest = {
        siteId,
        tenantId: user.tenantId,
        domain: data.domain,
        verificationMethod: data.verificationMethod,
        correlationId,
      };

      const domainConfig = await domainManager.connectDomain(request);

      HttpHeaders.setCorrelationId(res, correlationId);

      res.status(202).json({
        message: 'Domain connection initiated',
        domain: domainConfig.domain,
        status: domainConfig.status,
        verificationMethod: domainConfig.verificationMethod,
        dnsRecords: domainConfig.dnsRecords,
        acmeChallenge: domainConfig.acmeChallenge ? {
          type: domainConfig.acmeChallenge.type,
          token: domainConfig.acmeChallenge.token,
          expires: domainConfig.acmeChallenge.expires,
        } : undefined,
        instructions: this.getDomainInstructions(domainConfig),
      });

    } catch (error) {
      logger.error('Failed to connect domain', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Generate presigned URL for asset upload
   * POST /api/sites/:id/assets/presign
   */
  async presignAssetUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const siteId = this.extractSiteId(req, res);
      if (!siteId) {return;}
      
      const correlationId = HttpHeaders.getCorrelationId(req);
      
      const data = PresignAssetSchema.parse(req.body);

      logger.info('Generating presigned upload URL', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        filename: data.filename,
        contentType: data.contentType,
        correlationId,
      });

      // Verify site access
      const site = await this.siteRepository.findById(siteId);
      if (!site || site.tenantId !== user.tenantId) {
        const problem = ProblemDetails.forbidden('Access to this site is forbidden', req.path);
        ProblemDetails.send(res, problem);
        return;
      }

      const request: PresignRequest = {
        tenantId: user.tenantId,
        siteId,
        filename: data.filename,
        contentType: data.contentType,
        contentLength: data.contentLength,
        ...(data.multipart !== undefined && { multipart: data.multipart }),
        acl: 'private',
      };

      const presignedResponse = await assetUploadService.presignUpload(request);

      // Set headers - no caching for presigned URLs
      HttpHeaders.setNoCache(res);
      HttpHeaders.setCorrelationId(res, correlationId);

      res.json({
        uploadId: presignedResponse.uploadId,
        uploadUrl: presignedResponse.uploadUrl,
        formData: presignedResponse.formData,
        expires: presignedResponse.expires,
        maxFileSize: presignedResponse.maxFileSize,
        allowedContentTypes: presignedResponse.allowedContentTypes,
        multipart: presignedResponse.multipart,
        instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': data.contentType,
            'Content-Length': data.contentLength.toString(),
          },
          note: 'Upload directly to the provided URL. Do not include authentication headers.',
        },
      });

    } catch (error) {
      logger.error('Failed to generate presigned upload URL', {
        userId: req.user?.id,
        siteId: req.params['siteId'],
        error,
        correlationId: HttpHeaders.getCorrelationId(req),
      });
      next(error);
    }
  }

  /**
   * Private helper methods
   */

  private calculateProgress(steps: any[]): number {
    if (steps.length === 0) {return 0;}
    
    const completed = steps.filter(step => step.status === 'succeeded').length;
    return Math.round((completed / steps.length) * 100);
  }

  private estimateCompletion(status: any): Date | null {
    if (status.state === 'succeeded' || status.state === 'failed') {
      return null;
    }

    // Simple estimation based on average step duration
    const completedSteps = status.steps.filter((s: any) => s.completedAt && s.startedAt);
    if (completedSteps.length === 0) {return null;}

    const avgDuration = completedSteps.reduce((sum: number, step: any) => 
      sum + (new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()), 0
    ) / completedSteps.length;

    const remainingSteps = status.steps.filter((s: any) => s.status === 'pending').length;
    
    return new Date(Date.now() + avgDuration * remainingSteps);
  }

  private getDomainInstructions(domainConfig: any): any {
    if (domainConfig.status === 'dns_verification_required') {
      return {
        step: 'DNS Configuration Required',
        message: 'Please configure the following DNS records for your domain:',
        records: domainConfig.dnsRecords,
        nextStep: 'DNS records will be automatically verified within 5 minutes.',
      };
    }

    if (domainConfig.acmeChallenge?.type === 'HTTP-01') {
      return {
        step: 'HTTP Challenge Setup',
        message: 'ACME HTTP-01 challenge initiated',
        challenge: {
          url: `http://${domainConfig.domain}/.well-known/acme-challenge/${domainConfig.acmeChallenge.token}`,
          response: domainConfig.acmeChallenge.keyAuthorization,
        },
        nextStep: 'Challenge will be automatically verified and certificate issued.',
      };
    }

    if (domainConfig.acmeChallenge?.type === 'DNS-01') {
      return {
        step: 'DNS Challenge Setup',
        message: 'Please create the following DNS TXT record:',
        record: {
          name: `_acme-challenge.${domainConfig.domain}`,
          value: domainConfig.acmeChallenge.keyAuthorization,
          type: 'TXT',
        },
        nextStep: 'TXT record will be verified and certificate issued automatically.',
      };
    }

    return {
      step: 'Processing',
      message: 'Domain connection is being processed.',
      nextStep: 'You will be notified when the domain is ready.',
    };
  }

  /**
   * Extract and validate siteId from request params
   */
  private extractSiteId(req: Request, res: Response): string | null {
    const siteId = req.params['siteId'];
    if (!siteId) {
      const problem = ProblemDetails.badRequest('Site ID is required', req.path);
      ProblemDetails.send(res, problem);
      return null;
    }
    return siteId;
  }
}