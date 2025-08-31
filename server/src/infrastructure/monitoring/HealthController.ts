import { Request, Response, NextFunction } from 'express';
import { createLogger } from '@shared/utils';
import { metricsService } from './MetricsService';
import { config } from '../config';

const logger = createLogger({ service: 'health' });

/**
 * Controller for health check and monitoring endpoints
 */
export class HealthController {
  /**
   * Basic health check - always returns 200 if server is running
   */
  async basicHealth(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: config.NODE_ENV,
        uptime: process.uptime(),
        pid: process.pid,
      });
    } catch (error) {
      logger.error('Basic health check failed', { error });
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  }

  /**
   * Kubernetes liveness probe - indicates if the process is alive
   */
  async liveness(req: Request, res: Response, next: NextFunction) {
    try {
      // Check if the process is in a good state
      const memUsage = process.memoryUsage();
      const isMemoryOk = memUsage.heapUsed < 1000 * 1024 * 1024; // Less than 1GB

      if (!isMemoryOk) {
        logger.warn('Liveness check failed - high memory usage', {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
        });

        return res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          reason: 'high_memory_usage',
          details: {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
          },
        });
      }

      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: memUsage,
        pid: process.pid,
      });
    } catch (error) {
      logger.error('Liveness probe failed', { error });
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Liveness check failed',
      });
    }
  }

  /**
   * Kubernetes readiness probe - indicates if the service is ready to serve requests
   */
  async readiness(req: Request, res: Response, next: NextFunction) {
    try {
      logger.debug('Performing readiness checks');

      // Perform all health checks
      const healthChecks = await metricsService.performHealthChecks();
      
      // Determine overall readiness
      const criticalServices = ['database', 'openai'];
      const criticalChecks = healthChecks.filter(check => criticalServices.includes(check.service));
      const allCriticalHealthy = criticalChecks.every(check => check.status === 'healthy');
      
      // Allow degraded state for readiness, but not unhealthy
      const anyUnhealthy = healthChecks.some(check => check.status === 'unhealthy');

      const isReady = allCriticalHealthy && !anyUnhealthy;
      const status = isReady ? 'ready' : 'not-ready';
      const httpStatus = isReady ? 200 : 503;

      logger.info('Readiness check completed', {
        status,
        checksCount: healthChecks.length,
        criticalHealthy: allCriticalHealthy,
        anyUnhealthy,
      });

      res.status(httpStatus).json({
        status,
        timestamp: new Date().toISOString(),
        checks: healthChecks.reduce((acc, check) => {
          acc[check.service] = {
            status: check.status,
            latency: check.latency,
            message: check.message,
            details: check.details,
          };
          return acc;
        }, {} as Record<string, any>),
        summary: {
          total: healthChecks.length,
          healthy: healthChecks.filter(c => c.status === 'healthy').length,
          degraded: healthChecks.filter(c => c.status === 'degraded').length,
          unhealthy: healthChecks.filter(c => c.status === 'unhealthy').length,
        },
      });
    } catch (error) {
      logger.error('Readiness probe failed', { error });
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Detailed health check with comprehensive system information
   */
  async detailedHealth(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Performing detailed health check');

      // Get system metrics and health checks
      const [metrics, healthChecks] = await Promise.all([
        metricsService.getSystemMetrics(),
        metricsService.performHealthChecks(),
      ]);

      // Determine overall health status
      const overallStatus = this.determineOverallHealth(healthChecks);

      res.json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '1.0.0',
        environment: config.NODE_ENV,
        metrics,
        healthChecks,
        configuration: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          environment: config.NODE_ENV,
          features: {
            aiEnabled: !!config.OPENAI_API_KEY,
            voiceEnabled: config.NODE_ENV !== 'test',
            analyticsEnabled: true,
          },
        },
      });
    } catch (error) {
      logger.error('Detailed health check failed', { error });
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Detailed health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * System metrics endpoint
   */
  async metrics(req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await metricsService.getSystemMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Metrics endpoint failed', { error });
      next(error);
    }
  }

  /**
   * Prometheus metrics endpoint
   */
  async prometheusMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const prometheusMetrics = metricsService.exportPrometheusMetrics();
      
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusMetrics);
    } catch (error) {
      logger.error('Prometheus metrics endpoint failed', { error });
      res.status(500).send('# Error generating metrics\n');
    }
  }

  /**
   * Service dependencies status
   */
  async dependencies(req: Request, res: Response, next: NextFunction) {
    try {
      const healthChecks = await metricsService.performHealthChecks();
      
      const dependencies = healthChecks.map(check => ({
        name: check.service,
        status: check.status,
        latency: check.latency,
        message: check.message,
        lastChecked: check.timestamp,
        critical: ['database', 'openai'].includes(check.service),
      }));

      const overallStatus = this.determineOverallHealth(healthChecks);

      res.json({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        dependencies,
        summary: {
          total: dependencies.length,
          healthy: dependencies.filter(d => d.status === 'healthy').length,
          degraded: dependencies.filter(d => d.status === 'degraded').length,
          unhealthy: dependencies.filter(d => d.status === 'unhealthy').length,
          critical: dependencies.filter(d => d.critical).length,
        },
      });
    } catch (error) {
      logger.error('Dependencies check failed', { error });
      next(error);
    }
  }

  /**
   * Application version and build information
   */
  async version(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        version: process.env['npm_package_version'] || '1.0.0',
        buildTime: process.env['BUILD_TIME'] || new Date().toISOString(),
        gitCommit: process.env['GIT_COMMIT'] || 'unknown',
        gitBranch: process.env['GIT_BRANCH'] || 'unknown',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        environment: config.NODE_ENV,
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptime: process.uptime(),
      });
    } catch (error) {
      logger.error('Version endpoint failed', { error });
      next(error);
    }
  }

  /**
   * Startup probe for Kubernetes - indicates if the application has started
   */
  async startup(req: Request, res: Response, next: NextFunction) {
    try {
      // Check if application is fully initialized
      const isStarted = process.uptime() > 10; // App should be started after 10 seconds
      const memUsage = process.memoryUsage();

      if (!isStarted) {
        return res.status(503).json({
          status: 'starting',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          message: 'Application is still starting up',
        });
      }

      res.json({
        status: 'started',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
        },
        message: 'Application started successfully',
      });
    } catch (error) {
      logger.error('Startup probe failed', { error });
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Startup check failed',
      });
    }
  }

  /**
   * Determine overall health status from individual checks
   */
  private determineOverallHealth(healthChecks: any[]): 'healthy' | 'degraded' | 'unhealthy' {
    if (healthChecks.some(check => check.status === 'unhealthy')) {
      return 'unhealthy';
    }
    
    if (healthChecks.some(check => check.status === 'degraded')) {
      return 'degraded';
    }
    
    return 'healthy';
  }
}

// Export controller instance
export const healthController = new HealthController();