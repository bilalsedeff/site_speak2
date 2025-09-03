import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../../shared/utils/index.js';
import { metricsService } from './MetricsService';
import { config } from '../config';

const logger = createLogger({ service: 'health' });

/**
 * Controller for health check and monitoring endpoints
 */
export class HealthController {
  /**
   * Aggregate health check - always returns 200 OK per source-of-truth
   * Combines liveness and readiness status for external monitoring
   */
  async basicHealth(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    let success = true;

    try {
      // Get liveness status
      const lagMs = metricsService.getEventLoopLag();
      const uptimeSec = metricsService.getUptimeSeconds();
      const liveOk = metricsService.isEventLoopHealthy(200);

      // Get readiness status
      const draining = metricsService.isDrainingMode();
      let readyOk = !draining;
      const failed: string[] = [];

      if (!draining) {
        // Quick health check for readiness
        const healthChecks = await metricsService.performHealthChecks();
        const criticalServices = ['database', 'openai'];
        
        for (const check of healthChecks) {
          if (check.status === 'unhealthy' && criticalServices.includes(check.service)) {
            readyOk = false;
            failed.push(check.service);
          }
        }
      }

      // Determine overall status - degraded if liveness OR readiness issues
      const degraded = !liveOk || !readyOk || draining;
      const status = degraded ? 'degraded' : 'ok';
      
      // Health endpoint is considered successful even if degraded (per source-of-truth)
      success = true;

      // Always return 200 OK per source-of-truth (never 5xx for soft issues)
      res.status(200).json({
        status,
        degraded,
        live: {
          ok: liveOk,
          lagMs: Math.round(lagMs * 100) / 100,
        },
        ready: {
          ok: readyOk,
          failed,
        },
        version: process.env['GIT_COMMIT'] || process.env['npm_package_version'] || '1.0.0',
        uptimeSec,
      });
    } catch (error) {
      logger.error('Health check failed', { error });
      
      // Even on error, return 200 OK with degraded status per source-of-truth
      res.status(200).json({
        status: 'degraded',
        degraded: true,
        live: {
          ok: false,
          lagMs: 0,
        },
        ready: {
          ok: false,
          failed: ['internal_error'],
        },
        version: process.env['GIT_COMMIT'] || process.env['npm_package_version'] || '1.0.0',
        uptimeSec: metricsService.getUptimeSeconds(),
      });
    } finally {
      // Record probe execution metrics per source-of-truth requirements
      const duration = Date.now() - startTime;
      metricsService.recordProbeExecution('health', success, duration);
    }
  }

  /**
   * Kubernetes liveness probe - indicates if the process is alive
   * Returns 200 OK if alive, 500 if unhealthy (triggering restart)
   */
  async liveness(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    let success = false;

    try {
      const lagMs = metricsService.getEventLoopLag();
      const uptimeSec = metricsService.getUptimeSeconds();
      const lagThresholdMs = 200; // 200ms threshold as per source-of-truth

      // Check event loop health (primary liveness indicator)
      const isEventLoopHealthy = metricsService.isEventLoopHealthy(lagThresholdMs);

      if (!isEventLoopHealthy) {
        logger.warn('Liveness check failed - event loop lag too high', {
          lagMs,
          threshold: lagThresholdMs,
        });

        return res.status(500).json({
          status: 'unhealthy',
          lagMs,
          uptimeSec,
        });
      }

      // Success - record metrics and return response
      success = true;
      res.status(200).json({
        status: 'live',
        lagMs: Math.round(lagMs * 100) / 100, // Round to 2 decimal places
        uptimeSec,
      });
    } catch (error) {
      logger.error('Liveness probe failed', { error });
      res.status(500).json({
        status: 'unhealthy',
        lagMs: 0,
        uptimeSec: metricsService.getUptimeSeconds(),
      });
    } finally {
      // Record probe execution metrics per source-of-truth requirements
      const duration = Date.now() - startTime;
      metricsService.recordProbeExecution('live', success, duration);
    }
  }

  /**
   * Kubernetes readiness probe - indicates if the service is ready to serve requests
   * Returns 200 OK if ready, 503 Service Unavailable if not (for traffic gating)
   */
  async readiness(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    let success = false;

    try {
      logger.debug('Performing readiness checks');

      // Check drain mode first - immediate 503 if draining
      const draining = metricsService.isDrainingMode();
      if (draining) {
        logger.info('Readiness check failed - service is draining');
        return res.status(503).json({
          status: 'not-ready',
          deps: {},
          draining: true,
        });
      }

      // Perform all health checks with parallel execution
      const healthChecks = await metricsService.performHealthChecks();
      
      // Build dependency status map
      const deps: Record<string, string> = {};
      const failed: string[] = [];
      
      for (const check of healthChecks) {
        if (check.status === 'healthy') {
          deps[check.service] = 'ok';
        } else if (check.status === 'degraded') {
          deps[check.service] = 'degraded';
        } else {
          deps[check.service] = 'fail';
          failed.push(check.service);
        }
      }

      // Determine readiness - fail if any critical dependencies are unhealthy
      const criticalServices = ['database', 'openai'];
      const criticalFailures = failed.filter(service => criticalServices.includes(service));
      const isReady = criticalFailures.length === 0;
      
      const httpStatus = isReady ? 200 : 503;
      const status = isReady ? 'ready' : 'not-ready';
      success = isReady;

      logger.info('Readiness check completed', {
        status,
        checksCount: healthChecks.length,
        criticalFailures: criticalFailures.length,
        draining,
      });

      res.status(httpStatus).json({
        status,
        deps,
        draining,
      });
    } catch (error) {
      logger.error('Readiness probe failed', { error });
      res.status(503).json({
        status: 'not-ready',
        deps: {},
        draining: metricsService.isDrainingMode(),
      });
    } finally {
      // Record probe execution metrics per source-of-truth requirements
      const duration = Date.now() - startTime;
      metricsService.recordProbeExecution('ready', success, duration);
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
   * Uses same format as liveness probe per source-of-truth recommendation
   */
  async startup(req: Request, res: Response, next: NextFunction) {
    try {
      const lagMs = metricsService.getEventLoopLag();
      const uptimeSec = metricsService.getUptimeSeconds();
      const minStartupTime = 10; // 10 seconds minimum startup time

      // Check if application is fully initialized
      const isStarted = uptimeSec > minStartupTime;
      const isEventLoopHealthy = metricsService.isEventLoopHealthy(200);

      if (!isStarted || !isEventLoopHealthy) {
        logger.debug('Startup check - not ready yet', {
          uptimeSec,
          minStartupTime,
          isEventLoopHealthy,
          lagMs,
        });

        return res.status(503).json({
          status: 'starting',
          lagMs: Math.round(lagMs * 100) / 100,
          uptimeSec,
        });
      }

      // Application started successfully - use same format as liveness
      res.status(200).json({
        status: 'live',
        lagMs: Math.round(lagMs * 100) / 100,
        uptimeSec,
      });
    } catch (error) {
      logger.error('Startup probe failed', { error });
      res.status(503).json({
        status: 'starting',
        lagMs: 0,
        uptimeSec: metricsService.getUptimeSeconds(),
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