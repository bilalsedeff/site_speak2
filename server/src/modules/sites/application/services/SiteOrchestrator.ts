/**
 * Site Orchestrator Service
 * 
 * Implements saga-style orchestration for site lifecycle operations:
 * CREATE | UPDATE | PUBLISH | CONNECT_DOMAIN | ROLLBACK
 * 
 * Features:
 * - Saga-style orchestration with compensations
 * - Observable state machine with event emission
 * - Idempotent operations with correlation tracking
 * - Temporal-like workflow patterns
 */

import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { EventBus } from '../../../../services/_shared/events/eventBus';
import type { SiteRepository } from '../../../../domain/repositories/SiteRepository';
import type { Site, CreateSiteInput, UpdateSiteInput } from '../../../../domain/entities/Site';

const logger = createLogger({ service: 'site-orchestrator' });

export type SiteCommand = 
  | 'CREATE'
  | 'UPDATE'
  | 'PUBLISH'
  | 'CONNECT_DOMAIN'
  | 'ROLLBACK'
  | 'ARCHIVE'
  | 'DELETE';

export type OrchestrationState = 
  | 'pending'
  | 'validation'
  | 'processing'
  | 'integrating'
  | 'finalizing'
  | 'succeeded'
  | 'compensating'
  | 'compensated'
  | 'failed';

export interface OrchestrationContext {
  correlationId: string;
  command: SiteCommand;
  siteId?: string;
  tenantId: string;
  userId: string;
  payload: unknown;
  state: OrchestrationState;
  steps: OrchestrationStep[];
  metadata: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
  error?: Error;
}

export interface OrchestrationStep {
  name: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'compensated';
  startedAt?: Date;
  completedAt?: Date;
  error?: Error;
  compensation?: () => Promise<void>;
}

export interface CreateSiteRequest {
  tenantId: string;
  userId: string;
  data: CreateSiteInput;
  correlationId?: string;
}

export interface UpdateSiteRequest {
  siteId: string;
  tenantId: string;
  userId: string;
  data: UpdateSiteInput;
  version?: string; // ETag for optimistic locking
  correlationId?: string;
}

export interface PublishSiteRequest {
  siteId: string;
  tenantId: string;
  userId: string;
  deploymentIntent: 'preview' | 'production';
  domain?: string;
  correlationId?: string;
}

export interface ConnectDomainRequest {
  siteId: string;
  tenantId: string;
  userId: string;
  domain: string;
  acmeChallenge?: 'HTTP-01' | 'DNS-01';
  correlationId?: string;
}

export interface RollbackRequest {
  siteId: string;
  tenantId: string;
  userId: string;
  targetVersion?: string;
  reason?: string;
  correlationId?: string;
}

export class SiteOrchestrator {
  private activeContexts = new Map<string, OrchestrationContext>();

  constructor(
    private siteRepository: SiteRepository,
    private eventBus: EventBus
  ) {
    this.setupEventHandlers();
  }

  /**
   * Start orchestration for a command
   */
  async start(command: SiteCommand, request: unknown): Promise<OrchestrationContext> {
    const correlationId = this.getCorrelationId(request);
    
    const context: OrchestrationContext = {
      correlationId,
      command,
      tenantId: this.extractTenantId(request),
      userId: this.extractUserId(request),
      payload: request,
      state: 'pending',
      steps: [],
      metadata: {},
      startedAt: new Date(),
    };

    this.activeContexts.set(correlationId, context);

    logger.info('Starting site orchestration', {
      correlationId,
      command,
      tenantId: context.tenantId,
      userId: context.userId,
    });

    try {
      await this.executeCommand(context);
      return context;
    } catch (error) {
      context.error = error as Error;
      context.state = 'failed';
      await this.handleError(context);
      throw error;
    }
  }

  /**
   * Advance orchestration state
   */
  async advance(correlationId: string, event: string, data?: unknown): Promise<void> {
    const context = this.activeContexts.get(correlationId);
    if (!context) {
      logger.warn('Orchestration context not found', { correlationId, event });
      return;
    }

    logger.debug('Advancing orchestration', {
      correlationId,
      event,
      currentState: context.state,
    });

    // Update context based on event
    await this.processEvent(context, event, data);
    
    // Continue execution if needed
    if (context.state === 'processing') {
      await this.executeNextStep(context);
    }
  }

  /**
   * Compensate (rollback) failed orchestration
   */
  async compensate(correlationId: string, reason?: string): Promise<void> {
    const context = this.activeContexts.get(correlationId);
    if (!context) {
      logger.warn('Cannot compensate - context not found', { correlationId });
      return;
    }

    logger.info('Starting orchestration compensation', {
      correlationId,
      reason,
      currentState: context.state,
    });

    context.state = 'compensating';
    context.metadata['compensationReason'] = reason;

    try {
      // Execute compensations in reverse order
      const reversedSteps = [...context.steps].reverse();
      
      for (const step of reversedSteps) {
        if (step.status === 'succeeded' && step.compensation) {
          logger.debug('Executing compensation', {
            correlationId,
            stepName: step.name,
          });

          try {
            await step.compensation();
            step.status = 'compensated';
          } catch (error) {
            logger.error('Compensation failed', {
              correlationId,
              stepName: step.name,
              error,
            });
            // Continue with other compensations
          }
        }
      }

      context.state = 'compensated';
      context.completedAt = new Date();

      this.emitEvent('site.orchestration.compensated', context);
      
    } catch (error) {
      context.error = error as Error;
      context.state = 'failed';
      logger.error('Orchestration compensation failed', {
        correlationId,
        error,
      });
      throw error;
    } finally {
      this.activeContexts.delete(correlationId);
    }
  }

  /**
   * Get orchestration status
   */
  getStatus(correlationId: string): OrchestrationContext | null {
    return this.activeContexts.get(correlationId) || null;
  }

  /**
   * Execute command based on type
   */
  private async executeCommand(context: OrchestrationContext): Promise<void> {
    switch (context.command) {
      case 'CREATE':
        await this.executeCreateSite(context);
        break;
      case 'UPDATE':
        await this.executeUpdateSite(context);
        break;
      case 'PUBLISH':
        await this.executePublishSite(context);
        break;
      case 'CONNECT_DOMAIN':
        await this.executeConnectDomain(context);
        break;
      case 'ROLLBACK':
        await this.executeRollback(context);
        break;
      case 'ARCHIVE':
        await this.executeArchiveSite(context);
        break;
      case 'DELETE':
        await this.executeDeleteSite(context);
        break;
      default:
        throw new Error(`Unknown command: ${context.command}`);
    }
  }

  /**
   * Execute CREATE site workflow
   */
  private async executeCreateSite(context: OrchestrationContext): Promise<void> {
    const request = context.payload as CreateSiteRequest;
    
    context.state = 'validation';
    await this.executeStep(context, 'validate-input', async () => {
      // Validate input data
      if (!request.data.name?.trim()) {
        throw new Error('Site name is required');
      }
      if (!request.data.templateId) {
        throw new Error('Template ID is required');
      }
    });

    context.state = 'processing';
    let createdSite: Site | null = null;

    await this.executeStep(context, 'create-site', async () => {
      const createData: any = {
        name: request.data.name,
        description: request.data.description || '',
        tenantId: request.tenantId,
        templateId: request.data.templateId,
      };
      
      if (request.data.configuration) {
        createData.configuration = request.data.configuration;
      }
      
      createdSite = await this.siteRepository.create(createData);

      context.siteId = createdSite.id;
      context.metadata['site'] = createdSite;
    }, async () => {
      // Compensation: delete created site
      if (createdSite) {
        await this.siteRepository.delete(createdSite.id);
      }
    });

    context.state = 'integrating';
    await this.executeStep(context, 'initialize-knowledge-base', async () => {
      // Initialize knowledge base for the site
      this.emitEvent('kb.site_created', {
        siteId: context.siteId,
        tenantId: context.tenantId,
      });
    });

    context.state = 'finalizing';
    await this.executeStep(context, 'emit-events', async () => {
      this.emitEvent('site.created', {
        siteId: context.siteId,
        tenantId: context.tenantId,
        userId: context.userId,
        site: context.metadata['site'],
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute UPDATE site workflow
   */
  private async executeUpdateSite(context: OrchestrationContext): Promise<void> {
    const request = context.payload as UpdateSiteRequest;
    
    context.state = 'validation';
    let originalSite: Site | null = null;

    await this.executeStep(context, 'load-site', async () => {
      originalSite = await this.siteRepository.findById(request.siteId);
      if (!originalSite) {
        throw new Error(`Site not found: ${request.siteId}`);
      }
      if (originalSite.tenantId !== request.tenantId) {
        throw new Error('Site not found in tenant');
      }
      
      context.siteId = request.siteId;
      context.metadata['originalSite'] = originalSite;
    });

    context.state = 'processing';
    let updatedSite: Site | null = null;

    await this.executeStep(context, 'update-site', async () => {
      // Build update data with conditional assignment to handle exactOptionalPropertyTypes
      const updateData: any = {};
      if (request.data.name !== undefined) {
        updateData.name = request.data.name;
      }
      if (request.data.description !== undefined) {
        updateData.description = request.data.description;
      }
      if (request.data.configuration !== undefined) {
        updateData.configuration = request.data.configuration;
      }
      
      updatedSite = await this.siteRepository.update(request.siteId, updateData);
      if (!updatedSite) {
        throw new Error('Failed to update site');
      }
      
      context.metadata['updatedSite'] = updatedSite;
    }, async () => {
      // Compensation: restore original site data
      if (originalSite) {
        await this.siteRepository.update(request.siteId, {
          name: originalSite.name,
          description: originalSite.description,
          configuration: originalSite.configuration,
          content: originalSite.content,
        });
      }
    });

    context.state = 'integrating';
    await this.executeStep(context, 'update-integrations', async () => {
      // Update related systems
      this.emitEvent('site.updated', {
        siteId: context.siteId,
        tenantId: context.tenantId,
        userId: context.userId,
        changes: request.data,
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute PUBLISH site workflow
   */
  private async executePublishSite(context: OrchestrationContext): Promise<void> {
    const request = context.payload as PublishSiteRequest;
    
    context.state = 'validation';
    let site: Site | null = null;

    await this.executeStep(context, 'validate-site', async () => {
      site = await this.siteRepository.findById(request.siteId);
      if (!site) {
        throw new Error(`Site not found: ${request.siteId}`);
      }
      if (site.tenantId !== request.tenantId) {
        throw new Error('Site not found in tenant');
      }
      
      context.metadata['site'] = site;
    });

    context.state = 'processing';
    let publishingResult: any = null;

    await this.executeStep(context, 'execute-publishing', async () => {
      // Import publishing integration dynamically to avoid circular deps
      const { publishingIntegration } = await import('../integration/PublishingIntegration');
      
      // Build publishing context with conditional assignment to handle exactOptionalPropertyTypes
      const publishingContext: any = {
        siteId: request.siteId,
        tenantId: request.tenantId,
        userId: request.userId,
        deploymentIntent: request.deploymentIntent,
        correlationId: context.correlationId,
      };
      
      if (request.domain !== undefined) {
        publishingContext.domain = request.domain;
      }

      publishingResult = await publishingIntegration.publishSite(publishingContext);
      
      if (publishingResult.status === 'failed') {
        throw new Error(`Publishing failed: ${publishingResult.error}`);
      }

      context.metadata['publishingResult'] = publishingResult;
    });

    context.state = 'integrating';
    await this.executeStep(context, 'update-integrations', async () => {
      // Emit events for downstream systems
      this.emitEvent('site.published', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        userId: request.userId,
        deploymentId: publishingResult.deploymentId,
        releaseHash: publishingResult.releaseHash,
        publishedAt: new Date(),
        urls: publishingResult.urls,
        contractPaths: publishingResult.contractPaths,
      });
    });
    
    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute CONNECT_DOMAIN workflow
   */
  private async executeConnectDomain(context: OrchestrationContext): Promise<void> {
    const request = context.payload as ConnectDomainRequest;
    
    context.state = 'validation';
    await this.executeStep(context, 'validate-domain', async () => {
      // Basic domain validation
      const domainRegex = /^[a-z0-9]+([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]+([-a-z0-9]*[a-z0-9])?)*$/i;
      if (!domainRegex.test(request.domain)) {
        throw new Error('Invalid domain format');
      }

      // Check if domain is already in use
      const existing = await this.siteRepository.findByCustomDomain(request.domain);
      if (existing && existing.id !== request.siteId) {
        throw new Error('Domain already in use');
      }
    });

    context.state = 'processing';
    await this.executeStep(context, 'initiate-domain-connection', async () => {
      // Delegate to domain manager (will be implemented)
      this.emitEvent('domain.connection_requested', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        domain: request.domain,
        acmeChallenge: request.acmeChallenge || 'HTTP-01',
        correlationId: context.correlationId,
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute ROLLBACK workflow
   */
  private async executeRollback(context: OrchestrationContext): Promise<void> {
    const request = context.payload as RollbackRequest;
    
    context.state = 'processing';
    await this.executeStep(context, 'execute-rollback', async () => {
      // Import publishing integration dynamically to avoid circular deps
      const { publishingIntegration } = await import('../integration/PublishingIntegration');
      
      await publishingIntegration.rollbackSite(
        request.siteId,
        request.tenantId,
        request.targetVersion,
        request.reason,
        context.correlationId
      );
    });

    context.state = 'integrating';
    await this.executeStep(context, 'emit-rollback-events', async () => {
      this.emitEvent('site.rolledback', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        targetVersion: request.targetVersion,
        reason: request.reason,
        rolledBackAt: new Date(),
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute ARCHIVE site workflow
   */
  private async executeArchiveSite(context: OrchestrationContext): Promise<void> {
    const siteId = this.extractSiteId(context.payload);
    
    context.state = 'processing';
    await this.executeStep(context, 'archive-site', async () => {
      const archivedSite = await this.siteRepository.archive(siteId);
      if (!archivedSite) {
        throw new Error('Failed to archive site');
      }
      
      context.metadata['archivedSite'] = archivedSite;
    });

    context.state = 'integrating';
    await this.executeStep(context, 'cleanup-integrations', async () => {
      this.emitEvent('site.archived', {
        siteId,
        tenantId: context.tenantId,
        userId: context.userId,
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute DELETE site workflow
   */
  private async executeDeleteSite(context: OrchestrationContext): Promise<void> {
    const siteId = this.extractSiteId(context.payload);
    
    context.state = 'processing';
    await this.executeStep(context, 'delete-site', async () => {
      const deleted = await this.siteRepository.delete(siteId);
      if (!deleted) {
        throw new Error('Failed to delete site');
      }
    });

    context.state = 'integrating';
    await this.executeStep(context, 'cleanup-integrations', async () => {
      this.emitEvent('site.deleted', {
        siteId,
        tenantId: context.tenantId,
        userId: context.userId,
      });
    });

    context.state = 'succeeded';
    context.completedAt = new Date();
    this.activeContexts.delete(context.correlationId);
  }

  /**
   * Execute a single orchestration step
   */
  private async executeStep(
    context: OrchestrationContext,
    stepName: string,
    operation: () => Promise<void>,
    compensation?: () => Promise<void>
  ): Promise<void> {
    // Build orchestration step with conditional assignment to handle exactOptionalPropertyTypes
    const step: OrchestrationStep = {
      name: stepName,
      status: 'pending',
      ...(compensation && { compensation }),
    };

    context.steps.push(step);

    logger.debug('Executing orchestration step', {
      correlationId: context.correlationId,
      stepName,
      state: context.state,
    });

    try {
      step.status = 'running';
      step.startedAt = new Date();
      
      await operation();
      
      step.status = 'succeeded';
      step.completedAt = new Date();

      this.emitEvent('site.orchestration.step_completed', {
        correlationId: context.correlationId,
        stepName,
        duration: step.completedAt.getTime() - step.startedAt!.getTime(),
      });

    } catch (error) {
      step.status = 'failed';
      step.error = error as Error;
      step.completedAt = new Date();

      logger.error('Orchestration step failed', {
        correlationId: context.correlationId,
        stepName,
        error,
      });

      throw error;
    }
  }

  /**
   * Execute next step in orchestration
   */
  private async executeNextStep(_context: OrchestrationContext): Promise<void> {
    // This would contain logic for state-driven step execution
    // For now, the individual execute methods handle their own flow
  }

  /**
   * Process event for orchestration context
   */
  private async processEvent(context: OrchestrationContext, event: string, _data?: unknown): Promise<void> {
    // Handle events that can advance orchestration state
    switch (event) {
      case 'publishing.completed':
        if (context.command === 'PUBLISH') {
          context.state = 'succeeded';
          context.completedAt = new Date();
          this.activeContexts.delete(context.correlationId);
        }
        break;
      case 'domain.verified':
        if (context.command === 'CONNECT_DOMAIN') {
          context.state = 'succeeded';
          context.completedAt = new Date();
          this.activeContexts.delete(context.correlationId);
        }
        break;
    }
  }

  /**
   * Handle orchestration error
   */
  private async handleError(context: OrchestrationContext): Promise<void> {
    logger.error('Orchestration failed', {
      correlationId: context.correlationId,
      command: context.command,
      error: context.error,
      steps: context.steps,
    });

    this.emitEvent('site.orchestration.failed', context);

    // Trigger compensation if needed
    if (context.steps.some(step => step.status === 'succeeded' && step.compensation)) {
      await this.compensate(context.correlationId, context.error?.message);
    } else {
      this.activeContexts.delete(context.correlationId);
    }
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.eventBus.on('publishing.completed', async (event) => {
      if (event.correlationId) {
        await this.advance(event.correlationId, 'publishing.completed', event);
      }
    });

    this.eventBus.on('domain.verified', async (event) => {
      if (event.correlationId) {
        await this.advance(event.correlationId, 'domain.verified', event);
      }
    });
  }

  /**
   * Emit event
   */
  private emitEvent(eventType: string, data: unknown): void {
    this.eventBus.emit(eventType, data);
  }

  /**
   * Helper methods
   */
  private getCorrelationId(request: any): string {
    return request?.correlationId || crypto.randomUUID();
  }

  private extractTenantId(request: any): string {
    return request?.tenantId;
  }

  private extractUserId(request: any): string {
    return request?.userId;
  }

  private extractSiteId(request: any): string {
    return request?.siteId;
  }
}