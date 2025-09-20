import express from 'express';
import { siteContractController } from './SiteContractController';
import { SiteController } from './SiteController';
import { SiteOrchestrator } from '../application/services/SiteOrchestrator';
import { HttpHeaders } from '../adapters/http/HttpHeaders';
import { problemDetailsErrorHandler } from '../adapters/http/ProblemDetails';
import { EventBus } from '../../../services/_shared/events/eventBus';
import { devAuth } from '../../../infrastructure/auth/middleware';
import { siteRepository } from '../../../infrastructure/repositories';

const router = express.Router();

// Initialize dependencies with proper repository injection
const eventBus = new EventBus();
const siteOrchestrator = new SiteOrchestrator(siteRepository, eventBus);
const siteController = new SiteController(siteRepository, siteOrchestrator);

// Add CORS and security headers
router.use(HttpHeaders.corsHeaders);
router.use(HttpHeaders.securityHeaders);

// Add development authentication that provides default user context
router.use(devAuth());

// Health check
router.get('/health', (_req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'sites',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Enhanced Sites CRUD endpoints with HTTP standards compliance
router.get('/', siteController.listSites.bind(siteController));
router.get('/:siteId', siteController.getSite.bind(siteController));
router.post('/', siteController.createSite.bind(siteController));
router.put('/:siteId', siteController.updateSite.bind(siteController));
router.delete('/:siteId', siteController.deleteSite.bind(siteController));

// Publishing endpoints with orchestration
router.post('/:siteId/publish', siteController.publishSite.bind(siteController));
router.get('/:siteId/publish/:correlationId', siteController.getPublishStatus.bind(siteController));

// Domain management endpoints
router.post('/:siteId/domains', siteController.connectDomain.bind(siteController));

// Asset upload endpoints
router.post('/:siteId/assets/presign', siteController.presignAssetUpload.bind(siteController));

// Legacy site contract endpoints (existing)
router.post('/:siteId/contract/generate', siteContractController.generateContract.bind(siteContractController));
router.get('/:siteId/contract', siteContractController.getContract.bind(siteContractController));
router.put('/:siteId/contract/business-info', siteContractController.updateBusinessInfo.bind(siteContractController));
router.get('/:siteId/contract/actions', siteContractController.generateActionManifest.bind(siteContractController));
router.get('/:siteId/contract/structured-data', siteContractController.generateStructuredData.bind(siteContractController));
router.get('/:siteId/contract/sitemap.xml', siteContractController.generateSitemap.bind(siteContractController));
router.post('/:siteId/contract/validate', siteContractController.validateContract.bind(siteContractController));
router.get('/:siteId/contract/analytics', siteContractController.getContractAnalytics.bind(siteContractController));

// Error handling middleware (must be last)
router.use(problemDetailsErrorHandler);

export { router as sitesRoutes };
export { router as siteContractRoutes }; // Backward compatibility alias