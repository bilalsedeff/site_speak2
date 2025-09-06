import express from 'express';
import { siteContractController } from './SiteContractController';
// import { PublishingController } from './PublishingController'; // TODO: Set up proper dependency injection

const router = express.Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'sites' });
});

// Legacy site contract endpoints (existing)
router.post('/:siteId/contract/generate', siteContractController.generateContract.bind(siteContractController));
router.get('/:siteId/contract', siteContractController.getContract.bind(siteContractController));
router.put('/:siteId/contract/business-info', siteContractController.updateBusinessInfo.bind(siteContractController));
router.get('/:siteId/contract/actions', siteContractController.generateActionManifest.bind(siteContractController));
router.get('/:siteId/contract/structured-data', siteContractController.generateStructuredData.bind(siteContractController));
router.get('/:siteId/contract/sitemap.xml', siteContractController.generateSitemap.bind(siteContractController));
router.post('/:siteId/contract/validate', siteContractController.validateContract.bind(siteContractController));
router.get('/:siteId/contract/analytics', siteContractController.getContractAnalytics.bind(siteContractController));

// Publishing endpoints (deployment pipeline)
// TODO: Implement proper dependency injection for PublishingController
// router.post('/:siteId/publish', publishingController.publishSite.bind(publishingController));
// router.get('/:siteId/deployments/:deploymentId', publishingController.getDeploymentStatus.bind(publishingController));
// router.post('/:siteId/deployments/rollback', publishingController.rollbackDeployment.bind(publishingController));
// router.get('/:siteId/deployments', publishingController.getDeploymentHistory.bind(publishingController));

export { router as siteContractRoutes };