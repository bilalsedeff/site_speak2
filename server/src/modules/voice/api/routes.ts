import express from 'express';

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'voice' });
});

export { router as voiceRoutes };