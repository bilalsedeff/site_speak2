import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import { createLogger } from '@shared/utils';
import { jwtService, sessionManager } from '../../../infrastructure/auth';
import { config } from '../../../infrastructure/config';
import type { 
  LoginRequest, 
  RegisterRequest, 
  RefreshTokenRequest,
  ChangePasswordRequest,
  UpdateUserRequest,
} from '../application/schemas';

const logger = createLogger({ service: 'auth-controller' });

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data: RegisterRequest = req.body;
      
      logger.info('User registration attempt', {
        email: data.email,
        correlationId: req.correlationId,
      });

      // TODO: Check if user already exists
      // TODO: Create user and tenant in database
      // TODO: Send welcome email
      
      // For now, mock the registration process
      const userId = randomUUID();
      const tenantId = randomUUID();
      const hashedPassword = await bcrypt.hash(data.password, 12);

      // Create session
      const session = await sessionManager.createSession({
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || 'Unknown',
        metadata: {
          registrationMethod: 'email',
          acceptedTerms: data.acceptTerms,
        },
      });

      // Generate tokens
      const tokenPair = jwtService.generateTokenPair({
        userId,
        tenantId,
        role: 'owner',
        email: data.email,
        sessionId: session.id,
      });

      logger.info('User registered successfully', {
        userId,
        tenantId,
        email: data.email,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: userId,
            email: data.email,
            name: data.name,
            role: 'owner',
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date(),
            preferences: {},
          },
          tokens: tokenPair,
          session: {
            id: session.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        },
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

      // TODO: Find user by email
      // TODO: Verify password
      // TODO: Update last login timestamp
      
      // For now, mock the login process
      if (data.email === 'test@sitespeak.com' && data.password === 'password123') {
        const userId = randomUUID();
        const tenantId = randomUUID();

        // Create session
        const session = await sessionManager.createSession({
          userId,
          tenantId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || 'Unknown',
          metadata: {
            loginMethod: 'email',
            rememberMe: data.rememberMe,
          },
        });

        // Generate tokens
        const tokenPair = jwtService.generateTokenPair({
          userId,
          tenantId,
          role: 'owner',
          email: data.email,
          sessionId: session.id,
        });

        logger.info('User logged in successfully', {
          userId,
          tenantId,
          email: data.email,
          correlationId: req.correlationId,
        });

        res.json({
          success: true,
          data: {
            user: {
              id: userId,
              email: data.email,
              name: 'Test User',
              role: 'owner',
              tenantId,
              createdAt: new Date(),
              updatedAt: new Date(),
              preferences: {},
            },
            tokens: tokenPair,
            session: {
              id: session.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          },
          message: 'Login successful',
        });
      } else {
        logger.warn('Login failed - invalid credentials', {
          email: data.email,
          correlationId: req.correlationId,
        });

        res.status(401).json({
          success: false,
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Login failed', {
        error,
        email: req.body?.email,
        correlationId: req.correlationId,
      });
      next(error);
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
      
      const deletedCount = await sessionManager.deleteAllUserSessions(user.id);
      
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

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const data: RefreshTokenRequest = req.body;
      
      // Verify refresh token
      const payload = jwtService.verifyRefreshToken(data.refreshToken);
      
      // TODO: Check if session is still valid
      // TODO: Get user from database
      
      // Generate new access token
      const newAccessToken = jwtService.generateAccessToken({
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: 'owner', // TODO: Get from database
        email: 'test@sitespeak.com', // TODO: Get from database
        sessionId: payload.sessionId,
      });

      logger.info('Token refreshed successfully', {
        userId: payload.userId,
        sessionId: payload.sessionId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
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
      
      // TODO: Get full user data from database
      
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: 'Test User', // TODO: Get from database
          role: user.role,
          tenantId: user.tenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
          preferences: {},
        },
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
      
      // TODO: Update user in database
      
      logger.info('User updated successfully', {
        userId: user.id,
        updates: Object.keys(updates),
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: {
          id: user.id,
          email: updates.email || user.email,
          name: updates.name || 'Test User',
          role: user.role,
          tenantId: user.tenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
          preferences: updates.preferences || {},
        },
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
      
      // TODO: Verify current password
      // TODO: Update password in database
      
      // For now, just validate the request
      logger.info('Password changed successfully', {
        userId: user.id,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('Change password failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async getActiveSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      
      const sessions = await sessionManager.getActiveSessions(user.id);
      
      res.json({
        success: true,
        data: sessions.map(session => ({
          id: session.id,
          createdAt: session.createdAt,
          lastActivityAt: session.lastActivityAt,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          isActive: session.isActive,
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
      
      // TODO: Verify session belongs to user
      const deleted = await sessionManager.deleteSession(sessionId);
      
      if (deleted) {
        logger.info('Session deleted successfully', {
          userId: user.id,
          sessionId,
          correlationId: req.correlationId,
        });

        res.json({
          success: true,
          message: 'Session deleted successfully',
        });
      } else {
        res.status(404).json({
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
        sessionId: req.params.sessionId,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      
      // TODO: Generate password reset token
      // TODO: Send password reset email
      
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
      
      // TODO: Verify reset token
      // TODO: Update password in database
      // TODO: Invalidate all user sessions
      
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
      
      res.json({
        success: true,
        data: {
          service: 'auth',
          status: 'healthy',
          timestamp: new Date().toISOString(),
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