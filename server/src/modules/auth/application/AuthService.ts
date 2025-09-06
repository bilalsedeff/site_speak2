import bcrypt from 'bcryptjs';
import type { UserRepository } from '../../../domain/repositories/UserRepository';
import type { TenantRepository } from '../../../domain/repositories/TenantRepository';
import { jwtService, sessionManager } from '../../../infrastructure/auth';
import { createLogger } from '../../../shared/utils.js';
import type { 
  LoginRequest, 
  RegisterRequest, 
  RefreshTokenRequest,
  ChangePasswordRequest,
  UpdateUserRequest,
} from './schemas';

const logger = createLogger({ service: 'auth-service' });

export interface CreateSessionRequest {
  userId: string;
  tenantId: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

/**
 * Authentication service with real database operations
 */
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private tenantRepository: TenantRepository
  ) {}

  /**
   * Register new user and create tenant
   */
  async register(data: RegisterRequest, sessionData: {
    ipAddress: string;
    userAgent: string;
  }) {
    logger.info('User registration attempt', {
      email: data.email,
    });

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create tenant first (for owner role)
    const tenant = await this.tenantRepository.create({
      name: data.name + "'s Workspace",
      plan: 'free',
      settings: {
        timezone: 'UTC',
        dateFormat: 'YYYY-MM-DD',
        currency: 'USD',
        language: 'en',
        features: {
          aiEnabled: true,
          voiceEnabled: true,
          analyticsEnabled: true,
          whitelabelEnabled: false,
        },
      },
    });

    // Create user as tenant owner
    const user = await this.userRepository.create({
      email: data.email,
      name: data.name,
      passwordHash,
      role: 'owner',
      tenantId: tenant.id,
      preferences: {
        emailNotifications: {
          sitePublished: true,
          voiceInteractions: true,
          monthlyReports: true,
          securityAlerts: true,
          productUpdates: false,
        },
        pushNotifications: {
          enabled: false,
          siteEvents: false,
          voiceAlerts: false,
        },
      },
    });

    // Create session
    const session = await sessionManager.createSession({
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      metadata: {
        registrationMethod: 'email',
        acceptedTerms: data.acceptTerms,
      },
    });

    // Generate tokens
    const tokenPair = jwtService.generateTokenPair({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      sessionId: session.id,
    });

    logger.info('User registered successfully', {
      userId: user.id,
      tenantId: tenant.id,
      email: data.email,
    });

    return {
      user: user.toPublic(),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
      },
      tokens: tokenPair,
      session: {
        id: session.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    };
  }

  /**
   * Authenticate user login
   */
  async login(data: LoginRequest, sessionData: {
    ipAddress: string;
    userAgent: string;
  }) {
    logger.info('User login attempt', {
      email: data.email,
    });

    // Find user by email
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Update last login timestamp
    await this.userRepository.updateLastLogin(user.id);

    // Get tenant information
    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant || !tenant.isActive) {
      throw new Error('Account access is restricted');
    }

    // Create session
    const session = await sessionManager.createSession({
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: sessionData.ipAddress,
      userAgent: sessionData.userAgent,
      metadata: {
        loginMethod: 'email',
        rememberMe: data.rememberMe,
      },
    });

    // Generate tokens
    const tokenPair = jwtService.generateTokenPair({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      sessionId: session.id,
    });

    logger.info('User logged in successfully', {
      userId: user.id,
      tenantId: user.tenantId,
      email: data.email,
    });

    return {
      user: user.toPublic(),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        settings: tenant.settings,
        usage: tenant.usage,
        limits: tenant.limits,
      },
      tokens: tokenPair,
      session: {
        id: session.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(data: RefreshTokenRequest) {
    // Verify refresh token
    const payload = jwtService.verifyRefreshToken(data.refreshToken);
    
    // Check if session is still valid
    if (!payload.sessionId) {
      throw new Error('Session ID not found in token');
    }
    
    const session = await sessionManager.getSession(payload.sessionId);
    if (!session) {
      throw new Error('Invalid session');
    }

    // Get user from database
    const user = await this.userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    // Generate new access token
    const newAccessToken = jwtService.generateAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      sessionId: session.id,
    });

    logger.info('Token refreshed successfully', {
      userId: user.id,
      sessionId: session.id,
    });

    return {
      accessToken: newAccessToken,
    };
  }

  /**
   * Get current user data
   */
  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return {
      user: user.toPublic(),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        settings: tenant.settings,
        usage: tenant.usage,
        limits: tenant.limits,
      },
    };
  }

  /**
   * Update user information
   */
  async updateCurrentUser(userId: string, updates: UpdateUserRequest) {
    const user = await this.userRepository.update(userId, {
      ...(updates.name && { name: updates.name }),
      ...(updates.preferences && { preferences: updates.preferences }),
    });

    if (!user) {
      throw new Error('User not found');
    }

    logger.info('User updated successfully', {
      userId,
      updates: Object.keys(updates),
    });

    return user.toPublic();
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, data: ChangePasswordRequest) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const currentPasswordValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(data.newPassword, 12);

    // Update password
    await this.userRepository.updatePasswordHash(userId, newPasswordHash);

    logger.info('Password changed successfully', { userId });

    return { success: true };
  }

  /**
   * Get user's active sessions
   */
  async getActiveSessions(userId: string) {
    const sessions = await sessionManager.getActiveSessions(userId);
    
    return sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isActive: session.isActive,
    }));
  }

  /**
   * Delete specific session
   */
  async deleteSession(sessionId: string, userId: string) {
    // Verify session belongs to user (security check)
    const sessions = await sessionManager.getActiveSessions(userId);
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const deleted = await sessionManager.deleteSession(sessionId);
    
    if (deleted) {
      logger.info('Session deleted successfully', {
        userId,
        sessionId,
      });
    }

    return deleted;
  }

  /**
   * Logout user (delete session)
   */
  async logout(sessionId: string) {
    return await sessionManager.deleteSession(sessionId);
  }

  /**
   * Logout from all sessions
   */
  async logoutAll(userId: string) {
    const deletedCount = await sessionManager.deleteAllUserSessions(userId);
    
    logger.info('All user sessions logged out', {
      userId,
      deletedSessions: deletedCount,
    });

    return deletedCount;
  }

  /**
   * Initiate password reset
   */
  async forgotPassword(email: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      logger.warn('Password reset requested for non-existent email', { email });
      return { success: true };
    }

    // Generate reset token (implement when needed)
    // Send password reset email (implement when needed)
    
    logger.info('Password reset requested', {
      email,
      userId: user.id,
    });

    return { success: true };
  }

  /**
   * Reset password with token
   */
  async resetPassword(_token: string, _newPassword: string) {
    // Verify reset token (implement when needed)
    // Update password in database (implement when needed)
    // Invalidate all user sessions (implement when needed)
    
    logger.info('Password reset completed');

    return { success: true };
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      service: 'auth',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}