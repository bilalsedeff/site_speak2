/**
 * Authentication Test Helpers
 *
 * Utilities for testing authentication flows, token generation,
 * and user session management in tests.
 */

import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { TestUser, TestTenant, createTestUser, createTestTenant } from './test-data';

export interface AuthTestContext {
  user: TestUser;
  tenant: TestTenant;
  accessToken: string;
  refreshToken?: string;
}

/**
 * Authentication helper class for tests
 */
export class AuthTestHelper {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';
  }

  /**
   * Generate JWT token for test user
   */
  generateTestToken(user: TestUser, options: {
    expiresIn?: string | number;
    audience?: string;
    issuer?: string;
  } = {}): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID()
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: options.expiresIn || '24h',
      audience: options.audience || 'sitespeak-api',
      issuer: options.issuer || 'sitespeak-auth',
      ...options
    });
  }

  /**
   * Generate refresh token for test user
   */
  generateRefreshToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      type: 'refresh',
      tenantId: user.tenantId,
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID()
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '7d',
      audience: 'sitespeak-refresh',
      issuer: 'sitespeak-auth'
    });
  }

  /**
   * Verify and decode test token
   */
  verifyTestToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret, {
        audience: 'sitespeak-api',
        issuer: 'sitespeak-auth'
      });
    } catch (error) {
      throw new Error(`Token verification failed: ${error}`);
    }
  }

  /**
   * Create complete auth context for testing
   */
  createAuthContext(userOverrides: Partial<TestUser> = {}, tenantOverrides: Partial<TestTenant> = {}): AuthTestContext {
    const tenant = createTestTenant(tenantOverrides);
    const user = createTestUser({
      tenantId: tenant.id!,
      ...userOverrides
    });
    const accessToken = this.generateTestToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      user,
      tenant,
      accessToken,
      refreshToken
    };
  }

  /**
   * Create auth context for specific role
   */
  createOwnerAuthContext(overrides: Partial<TestUser> = {}): AuthTestContext {
    return this.createAuthContext({
      role: 'owner',
      email: 'owner@test.com',
      name: 'Test Owner',
      ...overrides
    });
  }

  createAdminAuthContext(overrides: Partial<TestUser> = {}): AuthTestContext {
    return this.createAuthContext({
      role: 'admin',
      email: 'admin@test.com',
      name: 'Test Admin',
      ...overrides
    });
  }

  createEditorAuthContext(overrides: Partial<TestUser> = {}): AuthTestContext {
    return this.createAuthContext({
      role: 'editor',
      email: 'editor@test.com',
      name: 'Test Editor',
      ...overrides
    });
  }

  createViewerAuthContext(overrides: Partial<TestUser> = {}): AuthTestContext {
    return this.createAuthContext({
      role: 'viewer',
      email: 'viewer@test.com',
      name: 'Test Viewer',
      ...overrides
    });
  }

  /**
   * Create expired token for testing token refresh
   */
  createExpiredToken(user: TestUser): string {
    return this.generateTestToken(user, { expiresIn: '-1h' });
  }

  /**
   * Create malformed token for testing error handling
   */
  createMalformedToken(): string {
    return 'malformed.jwt.token';
  }

  /**
   * Create token with invalid signature
   */
  createInvalidSignatureToken(user: TestUser): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      iat: Math.floor(Date.now() / 1000)
    };

    // Use wrong secret to create invalid signature
    return jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });
  }

  /**
   * Create auth headers for API testing
   */
  createAuthHeaders(token: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create auth headers with context
   */
  createAuthHeadersFromContext(context: AuthTestContext): Record<string, string> {
    return this.createAuthHeaders(context.accessToken);
  }

  /**
   * Mock authentication middleware for tests
   */
  createMockAuthMiddleware(context: AuthTestContext) {
    return (req: any, res: any, next: any) => {
      req.user = context.user;
      req.tenant = context.tenant;
      req.token = context.accessToken;
      next();
    };
  }

  /**
   * Extract user info from token
   */
  extractUserFromToken(token: string): Partial<TestUser> {
    try {
      const decoded = this.verifyTestToken(token);
      return {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        tenantId: decoded.tenantId
      };
    } catch (error) {
      throw new Error(`Failed to extract user from token: ${error}`);
    }
  }

  /**
   * Create login request payload
   */
  createLoginPayload(email: string = 'test@sitespeak.com', password: string = 'TestPassword123!'): {
    email: string;
    password: string;
  } {
    return { email, password };
  }

  /**
   * Create registration request payload
   */
  createRegistrationPayload(overrides: Partial<{
    email: string;
    password: string;
    name: string;
    tenantName: string;
  }> = {}): {
    email: string;
    password: string;
    name: string;
    tenantName: string;
  } {
    return {
      email: 'newuser@test.com',
      password: 'NewUserPassword123!',
      name: 'New Test User',
      tenantName: 'New Test Company',
      ...overrides
    };
  }

  /**
   * Create password reset request payload
   */
  createPasswordResetPayload(email: string = 'test@sitespeak.com'): {
    email: string;
  } {
    return { email };
  }

  /**
   * Simulate authentication session for E2E tests
   */
  createE2EAuthSession(context: AuthTestContext) {
    return {
      cookies: [
        {
          name: 'access_token',
          value: context.accessToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false
        },
        {
          name: 'refresh_token',
          value: context.refreshToken || '',
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false
        }
      ],
      localStorage: {
        user: JSON.stringify({
          id: context.user.id,
          email: context.user.email,
          name: context.user.name,
          role: context.user.role,
          tenantId: context.user.tenantId
        }),
        tenant: JSON.stringify({
          id: context.tenant.id,
          name: context.tenant.name,
          plan: context.tenant.plan
        })
      }
    };
  }
}

// Export singleton instance
export const authTestHelper = new AuthTestHelper();

/**
 * Predefined auth contexts for common test scenarios
 */
export const PREDEFINED_AUTH_CONTEXTS = {
  owner: authTestHelper.createOwnerAuthContext(),
  admin: authTestHelper.createAdminAuthContext(),
  editor: authTestHelper.createEditorAuthContext(),
  viewer: authTestHelper.createViewerAuthContext()
};

/**
 * Utility functions for quick auth context creation
 */
export const createTestAuthContext = (role: TestUser['role'] = 'owner') => {
  switch (role) {
    case 'owner':
      return authTestHelper.createOwnerAuthContext();
    case 'admin':
      return authTestHelper.createAdminAuthContext();
    case 'editor':
      return authTestHelper.createEditorAuthContext();
    case 'viewer':
      return authTestHelper.createViewerAuthContext();
    default:
      return authTestHelper.createOwnerAuthContext();
  }
};

export const generateTestJWT = (user: TestUser) => {
  return authTestHelper.generateTestToken(user);
};

export const createAuthHeaders = (token: string) => {
  return authTestHelper.createAuthHeaders(token);
};