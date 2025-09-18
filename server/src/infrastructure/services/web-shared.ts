/**
 * Web Process Shared Services
 *
 * Initializes only the services needed for the web process:
 * - Configuration
 * - Database connections
 * - Security and authentication
 * - Telemetry and monitoring
 * - Queue clients (NOT workers)
 *
 * Excludes:
 * - Queue workers (run in worker process only)
 * - Background job processors
 * - Heavy AI processing services
 */

import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'web-shared-services' });

/**
 * Web-specific shared services container
 */
export interface WebSharedServices {
  config: any;
  database: any;
  queues: {
    clients: any; // Queue clients for job submission, not processing
  };
  telemetry: any;
  security: any;
  // Note: No worker services included
}

let webSharedServices: WebSharedServices | null = null;

/**
 * Initialize shared services for web process only
 */
export async function initializeWebSharedServices(): Promise<WebSharedServices> {
  if (webSharedServices) {
    return webSharedServices;
  }

  try {
    logger.info('Initializing web process shared services...', {
      processType: 'web',
    });

    // 1. Configuration (always first)
    logger.info('Step 1/5: Loading configuration...');
    const { config } = await import('../config/index.js');

    // 2. Telemetry (provides observability)
    logger.info('Step 2/5: Initializing telemetry...');
    const { initializeTelemetry, createTelemetryService } = await import('../../services/_shared/telemetry/index.js');
    await initializeTelemetry();
    const telemetry = createTelemetryService();

    // 3. Database (needed for authentication and data access)
    logger.info('Step 3/5: Initializing database...');
    const { initializeDatabase } = await import('../database/index.js');
    await initializeDatabase();
    const { createDatabaseService } = await import('../../services/_shared/db/index.js');
    const database = createDatabaseService();

    // 4. Security (authentication, authorization, RBAC)
    logger.info('Step 4/5: Initializing security...');
    const { initializeSecurity, createSecurityService } = await import('../../services/_shared/security/index.js');
    await initializeSecurity();
    const security = createSecurityService();

    // 5. Queue clients only (NOT workers - those run in worker process)
    logger.info('Step 5/5: Initializing queue clients...');
    const { createQueueService } = await import('../../services/_shared/queues/index.js');
    const queueClients = createQueueService();

    webSharedServices = {
      config,
      database,
      queues: {
        clients: queueClients, // Only clients for job submission
      },
      telemetry,
      security,
    };

    logger.info('Web process shared services initialized successfully', {
      processType: 'web',
      services: Object.keys(webSharedServices),
      environment: config.NODE_ENV,
      excludedServices: [
        'queue-workers',
        'background-processors',
        'heavy-ai-services',
      ],
    });

    return webSharedServices;
  } catch (error) {
    logger.error('Failed to initialize web process shared services', {
      processType: 'web',
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
      } : error,
    });
    throw error;
  }
}

/**
 * Get initialized web shared services
 */
export function getWebSharedServices(): WebSharedServices {
  if (!webSharedServices) {
    throw new Error('Web shared services not initialized. Call initializeWebSharedServices() first.');
  }
  return webSharedServices;
}

/**
 * Shutdown web process shared services
 */
export async function shutdownWebSharedServices(): Promise<void> {
  if (!webSharedServices) {
    logger.info('Web shared services not initialized, nothing to shutdown');
    return;
  }

  try {
    logger.info('Shutting down web process shared services...', {
      processType: 'web',
    });

    // Shutdown in reverse order
    // Note: Only shutdown what we own in the web process
    // Workers are owned by worker process

    // 4. Security cleanup
    if (webSharedServices.security?.shutdown) {
      await webSharedServices.security.shutdown();
    }

    // 3. Queue clients cleanup (NOT workers)
    if (webSharedServices.queues?.clients?.shutdown) {
      await webSharedServices.queues.clients.shutdown();
    }

    // 2. Database connections (shared, so graceful close)
    if (webSharedServices.database?.shutdown) {
      await webSharedServices.database.shutdown();
    }

    // 1. Telemetry (last to capture shutdown metrics)
    if (webSharedServices.telemetry?.shutdown) {
      await webSharedServices.telemetry.shutdown();
    }

    webSharedServices = null;

    logger.info('Web process shared services shutdown completed', {
      processType: 'web',
    });
  } catch (error) {
    logger.error('Error during web process shared services shutdown', {
      processType: 'web',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Health check for web process shared services
 */
export function checkWebSharedServicesHealth(): {
  healthy: boolean;
  services: Record<string, any>;
  timestamp: Date;
  processType: string;
} {
  const timestamp = new Date();

  if (!webSharedServices) {
    return {
      healthy: false,
      services: {},
      timestamp,
      processType: 'web',
    };
  }

  try {
    const services = {
      config: { healthy: !!webSharedServices.config },
      database: webSharedServices.database?.health?.() || { healthy: true },
      queueClients: webSharedServices.queues?.clients?.health?.() || { healthy: true },
      telemetry: webSharedServices.telemetry?.health?.() || { healthy: true },
      security: webSharedServices.security?.health?.() || { healthy: true },
    };

    const healthy = Object.values(services).every(service => {
      if (service && typeof service === 'object') {
        return 'healthy' in service ? service.healthy : true;
      }
      return true;
    });

    return {
      healthy,
      services,
      timestamp,
      processType: 'web',
    };
  } catch (error) {
    logger.error('Web process health check failed', {
      processType: 'web',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      healthy: false,
      services: {},
      timestamp,
      processType: 'web',
    };
  }
}