/**
 * Monitoring Infrastructure
 * 
 * Provides health checks, metrics collection, and system monitoring
 * for the SiteSpeak platform.
 */

export * from './MetricsService';
export * from './HealthController';
export * from './routes';

// Import singletons for internal use
import { metricsService } from './MetricsService';
import { healthController } from './HealthController';
import { monitoringRoutes } from './routes';

// Re-export commonly used items
export { metricsService, healthController, monitoringRoutes };

export type { SystemMetrics, HealthCheck } from './MetricsService';

// Utility functions for graceful shutdown integration
export const setDraining = (draining: boolean): void => {
  metricsService.setDraining(draining);
};

export const isDraining = (): boolean => {
  return metricsService.isDrainingMode();
};