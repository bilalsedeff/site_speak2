/**
 * Publishing Service Loader
 * 
 * Initializes and connects all publishing services with existing systems.
 * Provides a single entry point for publishing infrastructure setup.
 */

import { createLogger } from '../../services/_shared/telemetry/logger';
import { EventBus } from '../../services/_shared/events/eventBus';
import { createPublishingPipeline, type PublishingPipeline } from './app/PublishingPipeline';
import { createArtifactStoreFromEnv, type ArtifactStore } from './adapters/ArtifactStore';
import { createCDNProviderFromEnv, type CDNProvider } from './adapters/CDNProvider';
import { createKnowledgeBaseIntegration, type KnowledgeBaseIntegration } from './integration/KnowledgeBaseIntegration';

const logger = createLogger({ service: 'publishing-service-loader' });

export interface PublishingServices {
  pipeline: PublishingPipeline;
  artifactStore: ArtifactStore;
  cdnProvider: CDNProvider;
  knowledgeBaseIntegration: KnowledgeBaseIntegration;
  eventBus: EventBus;
}

export interface PublishingConfig {
  enableKnowledgeBaseIntegration?: boolean;
  enableMetricsCollection?: boolean;
  enableHealthChecks?: boolean;
  eventBus?: EventBus;
}

/**
 * Service loader for publishing infrastructure
 */
export class PublishingServiceLoader {
  private services: PublishingServices | null = null;
  private initialized = false;

  /**
   * Initialize all publishing services
   */
  async initialize(config: PublishingConfig = {}): Promise<PublishingServices> {
    if (this.initialized && this.services) {
      return this.services;
    }

    logger.info('Initializing publishing services', {
      enableKnowledgeBaseIntegration: config.enableKnowledgeBaseIntegration ?? true,
      enableMetricsCollection: config.enableMetricsCollection ?? true,
      enableHealthChecks: config.enableHealthChecks ?? true,
    });

    try {
      // Initialize event bus (use provided or create new)
      const eventBus = config.eventBus || new EventBus();

      // Initialize adapters with environment-based configuration
      logger.info('Initializing artifact store adapter');
      const artifactStore = createArtifactStoreFromEnv();

      logger.info('Initializing CDN provider adapter');
      const cdnProvider = createCDNProviderFromEnv();

      // Validate adapter configurations
      await this.validateAdapters(artifactStore, cdnProvider);

      // Initialize publishing pipeline
      logger.info('Initializing publishing pipeline');
      const pipeline = createPublishingPipeline(artifactStore, cdnProvider, eventBus);

      // Initialize knowledge base integration
      let knowledgeBaseIntegration: KnowledgeBaseIntegration;
      if (config.enableKnowledgeBaseIntegration !== false) {
        logger.info('Initializing knowledge base integration');
        knowledgeBaseIntegration = createKnowledgeBaseIntegration(eventBus, artifactStore);
      } else {
        logger.info('Knowledge base integration disabled');
        knowledgeBaseIntegration = null as any; // Will be handled by conditional logic
      }

      this.services = {
        pipeline,
        artifactStore,
        cdnProvider,
        knowledgeBaseIntegration,
        eventBus,
      };

      // Set up additional integrations
      if (config.enableMetricsCollection !== false) {
        this.setupMetricsCollection(this.services);
      }

      if (config.enableHealthChecks !== false) {
        this.setupHealthChecks(this.services);
      }

      this.setupGlobalEventHandlers(this.services);

      this.initialized = true;

      logger.info('Publishing services initialized successfully', {
        artifactProvider: artifactStore.getProviderInfo().provider,
        cdnProvider: cdnProvider.getProviderInfo().provider,
        knowledgeBaseEnabled: config.enableKnowledgeBaseIntegration !== false,
      });

      return this.services;

    } catch (error) {
      logger.error('Failed to initialize publishing services', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get initialized services (throws if not initialized)
   */
  getServices(): PublishingServices {
    if (!this.services || !this.initialized) {
      throw new Error('Publishing services not initialized. Call initialize() first.');
    }
    return this.services;
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.services || !this.initialized) {
      return;
    }

    logger.info('Shutting down publishing services');

    try {
      // Remove event listeners
      this.services.eventBus.removeAllListeners();

      // Cleanup services if they have cleanup methods
      // (Most services are stateless, but this provides extension point)

      this.services = null;
      this.initialized = false;

      logger.info('Publishing services shutdown completed');

    } catch (error) {
      logger.error('Error during publishing services shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Validate adapter configurations
   */
  private async validateAdapters(artifactStore: ArtifactStore, cdnProvider: CDNProvider): Promise<void> {
    logger.info('Validating adapter configurations');

    // Validate artifact store
    const artifactStoreValid = await artifactStore.validateConfiguration?.() ?? true;
    if (!artifactStoreValid) {
      throw new Error('Artifact store configuration is invalid');
    }

    // Validate CDN provider
    const cdnProviderValid = await cdnProvider.validateConfiguration?.() ?? true;
    if (!cdnProviderValid) {
      throw new Error('CDN provider configuration is invalid');
    }

    logger.info('Adapter configurations validated successfully');
  }

  /**
   * Set up metrics collection
   */
  private setupMetricsCollection(services: PublishingServices): void {
    logger.info('Setting up metrics collection');

    // Listen for publishing events to collect metrics
    services.eventBus.on('pipeline.state_changed', (event) => {
      // TODO: Integrate with actual metrics service
      logger.debug('Pipeline state metric', {
        siteId: event.siteId,
        state: event.currentState,
        duration: event.duration,
      });
    });

    services.eventBus.on('site.published', (event) => {
      // TODO: Collect publishing success metrics
      logger.debug('Site published metric', {
        siteId: event.siteId,
        tenantId: event.tenantId,
        publishedAt: event.publishedAt,
      });
    });

    logger.info('Metrics collection setup completed');
  }

  /**
   * Set up health checks
   */
  private setupHealthChecks(services: PublishingServices): void {
    logger.info('Setting up health checks');

    // Register health check endpoints or periodic checks
    // TODO: Integrate with actual health check service
    
    logger.info('Health checks setup completed');
  }

  /**
   * Set up global event handlers
   */
  private setupGlobalEventHandlers(services: PublishingServices): void {
    logger.info('Setting up global event handlers');

    // Handle errors globally
    services.eventBus.on('error', (error) => {
      logger.error('Global publishing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    // Log important events
    services.eventBus.on('site.published', (event) => {
      logger.info('Site published successfully', {
        siteId: event.siteId,
        tenantId: event.tenantId,
        releaseHash: event.releaseHash,
        deploymentIntent: event.deploymentIntent,
      });
    });

    services.eventBus.on('kb.refreshCompleted', (event) => {
      logger.info('Knowledge base refresh completed', {
        siteId: event.siteId,
        refreshId: event.refreshId,
        success: event.result.success,
        processedUrls: event.result.processedUrls,
        processedActions: event.result.processedActions,
        indexingTime: event.result.indexingTime,
      });
    });

    logger.info('Global event handlers setup completed');
  }

  /**
   * Get publishing service status
   */
  async getStatus(): Promise<ServiceStatus> {
    if (!this.services || !this.initialized) {
      return {
        initialized: false,
        healthy: false,
        services: {},
      };
    }

    try {
      // Check service health
      const [artifactStoreHealthy, cdnProviderHealthy] = await Promise.all([
        this.services.artifactStore.validateConfiguration?.() ?? true,
        this.services.cdnProvider.validateConfiguration?.() ?? true,
      ]);

      const serviceStatus: ServiceStatus = {
        initialized: true,
        healthy: artifactStoreHealthy && cdnProviderHealthy,
        services: {
          artifactStore: {
            provider: this.services.artifactStore.getProviderInfo().provider,
            healthy: artifactStoreHealthy,
          },
          cdnProvider: {
            provider: this.services.cdnProvider.getProviderInfo().provider,
            healthy: cdnProviderHealthy,
          },
          knowledgeBaseIntegration: {
            enabled: this.services.knowledgeBaseIntegration !== null,
            healthy: true, // KB integration is stateless
          },
        },
      };

      return serviceStatus;

    } catch (error) {
      logger.error('Error checking service status', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        initialized: true,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        services: {},
      };
    }
  }
}

export interface ServiceStatus {
  initialized: boolean;
  healthy: boolean;
  services: Record<string, {
    provider?: string;
    enabled?: boolean;
    healthy: boolean;
  }>;
  error?: string;
}

/**
 * Global service loader instance
 */
export const publishingServiceLoader = new PublishingServiceLoader();

/**
 * Convenience function to initialize publishing services
 */
export async function initializePublishingServices(config: PublishingConfig = {}): Promise<PublishingServices> {
  return publishingServiceLoader.initialize(config);
}

/**
 * Convenience function to get initialized services
 */
export function getPublishingServices(): PublishingServices {
  return publishingServiceLoader.getServices();
}

/**
 * Convenience function to get service status
 */
export async function getPublishingServiceStatus(): Promise<ServiceStatus> {
  return publishingServiceLoader.getStatus();
}