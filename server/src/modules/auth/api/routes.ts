import express from 'express';
import { AuthController } from './AuthController';
import { authenticate, optionalAuth } from '../../../infrastructure/auth';

const router = express.Router();
const authController = new AuthController();

// Public authentication endpoints (no auth required)
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));

// Protected endpoints (authentication required)
router.post('/logout', authenticate(), authController.logout.bind(authController));
router.post('/logout-all', authenticate(), authController.logoutAll.bind(authController));
router.get('/me', authenticate(), authController.getCurrentUser.bind(authController));
router.put('/me', authenticate(), authController.updateCurrentUser.bind(authController));
router.post('/change-password', authenticate(), authController.changePassword.bind(authController));

// Session management endpoints
router.get('/sessions', authenticate(), authController.getActiveSessions.bind(authController));
router.delete('/sessions/:sessionId', authenticate(), authController.deleteSession.bind(authController));

// Health check endpoint (with optional auth for internal monitoring)
router.get('/health', optionalAuth(), authController.healthCheck.bind(authController));

export { router as authRoutes };