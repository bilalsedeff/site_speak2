import express from 'express';
import { healthController } from './HealthController';
import { optionalAuth } from '../auth';

const router = express.Router();

// Kubernetes-compliant top-level health endpoints (no auth required for k8s probes)
router.get('/live', healthController.liveness.bind(healthController));
router.get('/ready', healthController.readiness.bind(healthController));

// Basic health endpoints (no auth required for k8s probes)
router.get('/health', healthController.basicHealth.bind(healthController));
router.get('/health/live', healthController.liveness.bind(healthController));
router.get('/health/ready', healthController.readiness.bind(healthController));
router.get('/health/startup', healthController.startup.bind(healthController));

// Detailed monitoring endpoints (optional auth for internal monitoring)
router.get('/health/detailed', 
  optionalAuth(),
  healthController.detailedHealth.bind(healthController)
);

router.get('/health/dependencies', 
  optionalAuth(),
  healthController.dependencies.bind(healthController)
);

router.get('/metrics', 
  optionalAuth(),
  healthController.metrics.bind(healthController)
);

router.get('/metrics/prometheus', 
  healthController.prometheusMetrics.bind(healthController)
);

// Version information
router.get('/version', healthController.version.bind(healthController));

export { router as monitoringRoutes };