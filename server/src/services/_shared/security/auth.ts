/**
 * Authentication Service - JWT utilities and token management
 * 
 * Provides secure JWT operations with short-lived access tokens,
 * refresh token rotation, and per-tenant claims.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';

/**
 * JWT Claims interface
 */
export interface JWTClaims {
  sub: string;        // User ID
  tenantId: string;   // Tenant isolation
  role: string;       // User role
  permissions: string[]; // Specific permissions
  iat: number;        // Issued at
  exp: number;        // Expires at
  aud: string;        // Audience
  iss: string;        // Issuer
  jti: string;        // JWT ID for revocation
}

/**
 * Token pair for access/refresh pattern
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

/**
 * Token validation result
 */
export interface TokenValidation {
  valid: boolean;
  claims?: JWTClaims;
  error?: string;
  expired?: boolean;
}

/**
 * Refresh token store (in production, use Redis or database)
 */
const refreshTokenStore = new Map<string, {
  userId: string;
  tenantId: string;
  family: string; // For token rotation
  createdAt: Date;
  lastUsed: Date;
}>();

/**
 * Generate JWT access token with claims
 */
export function generateAccessToken(payload: {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
}): string {
  const claims: JWTClaims = {
    sub: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
    permissions: payload.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + parseExpirationTime(cfg.JWT_ACCESS_EXPIRES_IN),
    aud: cfg.JWT_AUDIENCE,
    iss: cfg.JWT_ISSUER,
    jti: crypto.randomUUID(),
  };

  return jwt.sign(claims, cfg.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: string, tenantId: string): string {
  const tokenFamily = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  
  // Store refresh token metadata
  refreshTokenStore.set(token, {
    userId,
    tenantId,
    family: tokenFamily,
    createdAt: new Date(),
    lastUsed: new Date(),
  });

  logger.debug('Generated refresh token', {
    userId,
    tenantId,
    tokenFamily,
  });

  return token;
}

/**
 * Generate complete token pair
 */
export function generateTokenPair(payload: {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
}): TokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload.userId, payload.tenantId);
  const expiresIn = parseExpirationTime(cfg.JWT_ACCESS_EXPIRES_IN);

  return {
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: 'Bearer',
  };
}

/**
 * Validate JWT access token
 */
export function validateAccessToken(token: string): TokenValidation {
  try {
    const decoded = jwt.verify(token, cfg.JWT_SECRET, {
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
      algorithms: ['HS256'],
    }) as JWTClaims;

    return {
      valid: true,
      claims: decoded,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        expired: true,
        error: 'Token expired',
      };
    } else if (error instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        error: 'Invalid token',
      };
    } else {
      logger.error('Token validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        valid: false,
        error: 'Token validation failed',
      };
    }
  }
}

/**
 * Validate and refresh token using refresh token
 */
export async function refreshTokenPair(refreshToken: string): Promise<{
  success: boolean;
  tokenPair?: TokenPair;
  error?: string;
}> {
  try {
    const tokenData = refreshTokenStore.get(refreshToken);
    
    if (!tokenData) {
      return {
        success: false,
        error: 'Invalid refresh token',
      };
    }

    // Check if token is too old (refresh token lifetime)
    const maxAge = parseExpirationTime(cfg.JWT_REFRESH_EXPIRES_IN);
    const tokenAge = (Date.now() - tokenData.createdAt.getTime()) / 1000;
    
    if (tokenAge > maxAge) {
      refreshTokenStore.delete(refreshToken);
      return {
        success: false,
        error: 'Refresh token expired',
      };
    }

    // Update last used time
    tokenData.lastUsed = new Date();

    // In production, fetch user details from database
    // For now, generate with basic permissions
    const newTokenPair = generateTokenPair({
      userId: tokenData.userId,
      tenantId: tokenData.tenantId,
      role: 'user', // Should come from user record
      permissions: [], // Should come from role/user permissions
    });

    // Rotate refresh token (invalidate old one)
    refreshTokenStore.delete(refreshToken);

    logger.info('Tokens refreshed successfully', {
      userId: tokenData.userId,
      tenantId: tokenData.tenantId,
    });

    return {
      success: true,
      tokenPair: newTokenPair,
    };
  } catch (error) {
    logger.error('Token refresh error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: 'Token refresh failed',
    };
  }
}

/**
 * Revoke refresh token and family
 */
export function revokeRefreshToken(refreshToken: string): boolean {
  const tokenData = refreshTokenStore.get(refreshToken);
  
  if (!tokenData) {
    return false;
  }

  // Revoke all tokens in the same family
  const tokensToRevoke = Array.from(refreshTokenStore.entries())
    .filter(([, data]) => data.family === tokenData.family)
    .map(([token]) => token);

  tokensToRevoke.forEach(token => {
    refreshTokenStore.delete(token);
  });

  logger.info('Refresh token family revoked', {
    userId: tokenData.userId,
    tenantId: tokenData.tenantId,
    family: tokenData.family,
    revokedCount: tokensToRevoke.length,
  });

  return true;
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Parse expiration time string (e.g., "15m", "7d") to seconds
 */
function parseExpirationTime(timeStr: string): number {
  const unit = timeStr.slice(-1);
  const value = parseInt(timeStr.slice(0, -1));

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: throw new Error(`Invalid time unit: ${unit}`);
  }
}

/**
 * Generate secure random password/key
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash password using bcrypt-compatible method
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Cleanup expired refresh tokens periodically
 */
function cleanupExpiredTokens(): void {
  const maxAge = parseExpirationTime(cfg.JWT_REFRESH_EXPIRES_IN) * 1000;
  const now = Date.now();
  
  let cleaned = 0;
  for (const [token, data] of refreshTokenStore.entries()) {
    if (now - data.createdAt.getTime() > maxAge) {
      refreshTokenStore.delete(token);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug('Cleaned up expired refresh tokens', { count: cleaned });
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);