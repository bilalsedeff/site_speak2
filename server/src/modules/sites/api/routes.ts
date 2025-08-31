import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'sites' });
});

export { router as siteContractRoutes };