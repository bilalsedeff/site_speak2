/**
 * Shared Services - Main entry point for cross-cutting concerns
 * 
 * Centralizes configuration, database access, queues, telemetry,
 * security, and events for all services in the platform.
 */

// Re-export all modules
export * from './config/index.js';
export * from './db/index.js';
export * from './queues/index.js';
export * from './telemetry/index.js';
export * from './security/index.js';
export * from './events/index.js';

import { cfg } from './config/index.js';
import { createDatabaseService } from './db/index.js';
import { createQueueService, initializeQueueSystem } from './queues/index.js';
import { createTelemetryService, initializeTelemetry } from './telemetry/index.js';
import { createSecurityService, initializeSecurity } from './security/index.js';
import { createEventService, initializeEventSystem } from './events/index.js';
import { logger } from './telemetry/logger.js';

/**
 * Shared services container
 */
export interface SharedServices {
  config: typeof cfg;
  database: ReturnType<typeof createDatabaseService>;
  queues: ReturnType<typeof createQueueService>;
  telemetry: ReturnType<typeof createTelemetryService>;
  security: ReturnType<typeof createSecurityService>;
  events: ReturnType<typeof createEventService>;
}

/**
 * Initialize all shared services in correct order
 */
export async function initializeSharedServices(): Promise<SharedServices> {
  try {
    logger.info('Initializing shared services...', {
      environment: cfg.NODE_ENV,
      service: cfg.OTEL_SERVICE_NAME,
      version: cfg.OTEL_SERVICE_VERSION,
    });

    // 1. Telemetry first (provides observability for other services)
    logger.info('Step 1/5: Initializing telemetry...');
    await initializeTelemetry();
    const telemetry = createTelemetryService();

    // 2. Database (needed by other services)
    logger.info('Step 2/5: Initializing database...');
    // Database is already initialized by existing infrastructure
    const database = createDatabaseService();

    // 3. Security (needed for authentication/authorization)
    logger.info('Step 3/5: Initializing security...');
    await initializeSecurity();
    const security = createSecurityService();

    // 4. Queue system (for background processing)
    logger.info('Step 4/5: Initializing queue system...');
    await initializeQueueSystem();
    const queues = createQueueService();

    // 5. Event system (depends on database and queues)
    logger.info('Step 5/5: Initializing event system...');
    await initializeEventSystem();
    const events = createEventService();

    const services: SharedServices = {
      config: cfg,
      database,
      queues,
      telemetry,
      security,
      events,
    };

    logger.info('All shared services initialized successfully', {
      services: Object.keys(services),
      environment: cfg.NODE_ENV,
    });

    // Publish system startup event
    await events.publish.immediate('system.startup', {
      timestamp: new Date(),
      environment: cfg.NODE_ENV,
      services: Object.keys(services),
    }, {
      tenantId: 'system',
      source: 'shared-services',
    });

    return services;
  } catch (error) {
    logger.error('Failed to initialize shared services', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Graceful shutdown of all shared services
 */
export async function shutdownSharedServices(): Promise<void> {
  try {
    logger.info('Shutting down shared services...');

    const events = createEventService();
    // Note: database service would be initialized here if needed

    // Publish shutdown event
    await events.publish.immediate('system.shutdown', {
      timestamp: new Date(),
      reason: 'graceful_shutdown',
    }, {
      tenantId: 'system',
      source: 'shared-services',
    });

    // Shutdown in reverse order
    await events.shutdown();
    // Note: queues service handles its own graceful shutdown
    // Database shutdown handled by existing infrastructure

    logger.info('Shared services shutdown completed');
  } catch (error) {
    logger.error('Error during shared services shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Health check for all shared services
 */
export function checkSharedServicesHealth(): {
  healthy: boolean;
  services: Record<string, any>;
  timestamp: Date;
} {
  const timestamp = new Date();
  
  try {
    const services = {
      config: { healthy: !!cfg },
      database: createDatabaseService().health?.() || { healthy: true },
      telemetry: createTelemetryService().health(),
      security: createSecurityService().health(),
      events: createEventService().health(),
    };

    const healthy = Object.values(services).every(service => {
      if (service && typeof service === 'object') {
        // Handle Promise-based health checks
        if ('then' in service) {
          return true; // Assume healthy for async checks
        }
        // Handle object with healthy property
        return 'healthy' in service ? service.healthy : true;
      }
      return true;
    });

    return {
      healthy,
      services,
      timestamp,
    };
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      healthy: false,
      services: {},
      timestamp,
    };
  }
}

// Setup graceful shutdown
process.on('SIGINT', shutdownSharedServices);
process.on('SIGTERM', shutdownSharedServices);
process.on('beforeExit', shutdownSharedServices);