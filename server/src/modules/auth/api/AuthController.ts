import { Request, Response, NextFunction } from 'express';

import { createLogger } from '../../../shared/utils.js';
import { AuthService } from '../application/AuthService';
import { UserRepositoryImpl } from '../../../infrastructure/repositories/UserRepositoryImpl';
import { TenantRepositoryImpl } from '../../../infrastructure/repositories/TenantRepositoryImpl';
import { db } from '../../../infrastructure/database';
import { sessionManager } from '../../../infrastructure/auth';
import type { 
  LoginRequest, 
  RegisterRequest, 
  RefreshTokenRequest,
  ChangePasswordRequest,
  UpdateUserRequest,
} from '../application/schemas';

const logger = createLogger({ service: 'auth-controller' });

// Initialize repositories and service
const userRepository = new UserRepositoryImpl(db);
const tenantRepository = new TenantRepositoryImpl(db);
const authService = new AuthService(userRepository, tenantRepository);

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data: RegisterRequest = req.body;
      
      logger.info('User registration attempt', {
        email: data.email,
        correlationId: req.correlationId,
      });

      // Use real authentication service
      const result = await authService.register(data, {
        ipAddress: req.ip || '0.0.0.0',
        userAgent: req.get('User-Agent') || 'Unknown',
      });

      logger.info('User registered successfully', {
        userId: result.user.id,
        tenantId: result.tenant.id,
        email: data.email,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful',
      });
    } catch (error) {
      logger.error('Registration failed', {
        error,
        email: req.body?.email,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data: LoginRequest = req.body;
      
      logger.info('User login attempt', {
        email: data.email,
        correlationId: req.correlationId,
      });

      // Use real authentication service
      const result = await authService.login(data, {
        ipAddress: req.ip || '0.0.0.0',
        userAgent: req.get('User-Agent') || 'Unknown',
      });

      logger.info('User logged in successfully', {
        userId: result.user.id,
        tenantId: result.tenant.id,
        email: data.email,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: result,
        message: 'Login successful',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      
      if (errorMessage.includes('Invalid email or password') || 
          errorMessage.includes('Account is deactivated') ||
          errorMessage.includes('Account access is restricted')) {
        
        logger.warn('Login failed - authentication error', {
          email: req.body?.email,
          error: errorMessage,
          correlationId: req.correlationId,
        });

        res.status(401).json({
          success: false,
          error: errorMessage,
          code: 'AUTHENTICATION_FAILED',
          correlationId: req.correlationId,
        });
      } else {
        logger.error('Login failed - server error', {
          error,
          email: req.body?.email,
          correlationId: req.correlationId,
        });
        next(error);
      }
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      
      if (user.sessionId) {
        await sessionManager.deleteSession(user.sessionId);
        
        logger.info('User logged out successfully', {
          userId: user.id,
          sessionId: user.sessionId,
          correlationId: req.correlationId,
        });
      }

      res.json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error('Logout failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      
      // Use real authentication service
      const deletedCount = await authService.logoutAll(user.id);
      
      logger.info('All user sessions logged out', {
        userId: user.id,
        deletedSessions: deletedCount,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: {
          sessionsDeleted: deletedCount,
        },
        message: 'All sessions logged out successfully',
      });
    } catch (error) {
      logger.error('Logout all failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, _next: NextFunction) {
    try {
      const data: RefreshTokenRequest = req.body;
      
      // Use real authentication service
      const result = await authService.refreshToken(data);

      logger.info('Token refreshed successfully', {
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: result,
        message: 'Token refreshed successfully',
      });
    } catch (error) {
      logger.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
        correlationId: req.correlationId,
      });
    }
  }

  async getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      
      // Use real authentication service
      const result = await authService.getCurrentUser(user.id);
      
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get current user failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async updateCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const updates: UpdateUserRequest = req.body;
      
      // Use real authentication service
      const result = await authService.updateCurrentUser(user.id, updates);
      
      logger.info('User updated successfully', {
        userId: user.id,
        updates: Object.keys(updates),
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: result,
        message: 'User updated successfully',
      });
    } catch (error) {
      logger.error('Update user failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const data: ChangePasswordRequest = req.body;
      
      // Use real authentication service
      await authService.changePassword(user.id, data);
      
      logger.info('Password changed successfully', {
        userId: user.id,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password change failed';
      
      if (errorMessage.includes('Current password is incorrect')) {
        res.status(400).json({
          success: false,
          error: errorMessage,
          code: 'INVALID_CURRENT_PASSWORD',
          correlationId: req.correlationId,
        });
      } else {
        logger.error('Change password failed', {
          error,
          userId: req.user?.id,
          correlationId: req.correlationId,
        });
        next(error);
      }
    }
  }

  async getActiveSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      
      // Use real authentication service
      const sessions = await authService.getActiveSessions(user.id);
      
      res.json({
        success: true,
        data: sessions.map(session => ({
          ...session,
          isCurrent: session.id === user.sessionId,
        })),
      });
    } catch (error) {
      logger.error('Get active sessions failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async deleteSession(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
      }
      
      // Use real authentication service with proper authorization
      const deleted = await authService.deleteSession(sessionId, user.id);
      
      if (deleted) {
        logger.info('Session deleted successfully', {
          userId: user.id,
          sessionId,
          correlationId: req.correlationId,
        });

        return res.json({
          success: true,
          message: 'Session deleted successfully',
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Delete session failed', {
        error,
        userId: req.user?.id,
        sessionId: req.params['sessionId'],
        correlationId: req.correlationId,
      });
      return next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      
      // Use real authentication service
      await authService.forgotPassword(email);
      
      logger.info('Password reset requested', {
        email,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Password reset email sent',
      });
    } catch (error) {
      logger.error('Forgot password failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body;
      
      // Use real authentication service
      await authService.resetPassword(token, newPassword);
      
      logger.info('Password reset completed', {
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.error('Reset password failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async healthCheck(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      
      // Use real authentication service
      const result = await authService.healthCheck();
      
      res.json({
        success: true,
        data: {
          ...result,
          authenticated: !!user,
          userId: user?.id,
        },
      });
    } catch (error) {
      logger.error('Auth health check failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }
}