/**
 * Monitoring Infrastructure
 * 
 * Provides health checks, metrics collection, and system monitoring
 * for the SiteSpeak platform.
 */

export * from './MetricsService';
export * from './HealthController';
export * from './routes';

// Re-export commonly used items
export { metricsService } from './MetricsService';
export { healthController } from './HealthController';
export { monitoringRoutes } from './routes';

export type { SystemMetrics, HealthCheck } from './MetricsService';