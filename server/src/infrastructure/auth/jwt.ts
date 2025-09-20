import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

import { config } from '../config';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'jwt' });

// Simplified JWT payload interfaces
export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  permissions?: string[];
  sessionId?: string;
  siteId?: string;
  locale?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// Voice-specific JWT payload for WebSocket connections
export interface VoiceJWTPayload {
  tenantId: string;
  siteId: string;
  userId?: string;
  locale?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

/**
 * JWT Service for authentication token management
 */
export class JWTService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly defaultIssuer: string;
  private readonly defaultAudience: string;

  constructor() {
    this.accessTokenSecret = config.JWT_SECRET;
    this.refreshTokenSecret = config.JWT_REFRESH_SECRET || config.JWT_SECRET;
    this.defaultIssuer = config.JWT_ISSUER || 'sitespeak';
    this.defaultAudience = config.JWT_AUDIENCE || 'sitespeak-users';
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options?: TokenOptions): string {
    try {
      const sessionId = payload.sessionId || randomUUID();
      const issuer = options?.issuer || this.defaultIssuer;
      const audience = options?.audience || this.defaultAudience;
      const expiresIn = options?.expiresIn || config.JWT_ACCESS_EXPIRES_IN;

      const tokenPayload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
        ...payload,
        sessionId,
      };

      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        algorithm: 'HS256',
        issuer,
        audience,
        expiresIn: expiresIn as any,
      });
    } catch (error) {
      logger.error('Failed to generate access token', { 
        error: error instanceof Error ? error.message : String(error), 
        userId: payload.userId,
        config: {
          JWT_SECRET: config.JWT_SECRET ? 'SET' : 'NOT SET',
          JWT_ACCESS_EXPIRES_IN: config.JWT_ACCESS_EXPIRES_IN
        }
      });
      throw new Error(`Token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: Pick<JWTPayload, 'userId' | 'tenantId' | 'sessionId'>, options?: TokenOptions): string {
    try {
      const sessionId = payload.sessionId || randomUUID();
      const issuer = options?.issuer || this.defaultIssuer;
      const audience = options?.audience || this.defaultAudience;
      const expiresIn = options?.expiresIn || config.JWT_REFRESH_EXPIRES_IN;

      const tokenPayload = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        sessionId,
      };

      return jwt.sign(tokenPayload, this.refreshTokenSecret, {
        expiresIn: expiresIn as any,
        issuer,
        audience,
      });
    } catch (error) {
      logger.error('Failed to generate refresh token', { error, userId: payload.userId });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options?: TokenOptions): TokenPair {
    const sessionId = payload.sessionId || randomUUID();
    
    const accessToken = this.generateAccessToken({
      ...payload,
      sessionId,
    }, options);

    const refreshToken = this.generateRefreshToken({
      userId: payload.userId,
      tenantId: payload.tenantId,
      sessionId,
    }, options);

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.defaultIssuer,
        audience: this.defaultAudience,
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token', { error: error.message });
        throw new Error('Invalid token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Access token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }

      logger.error('Token verification failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('Token verification failed');
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): {
    userId: string;
    tenantId: string;
    sessionId: string | undefined;
    iat: number;
    exp: number;
  } {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.defaultIssuer,
        audience: this.defaultAudience,
      }) as JWTPayload;

      // JWT always has iat and exp when verified, but TypeScript doesn't know that
      if (!decoded.iat || !decoded.exp) {
        throw new Error('Invalid token: missing timestamps');
      }

      return {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        sessionId: decoded.sessionId,
        iat: decoded.iat,
        exp: decoded.exp,
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token', { error: error.message });
        throw new Error('Invalid token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Refresh token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }

      logger.error('Refresh token verification failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('Token verification failed');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): jwt.JwtPayload | null {
    try {
      return jwt.decode(token) as jwt.JwtPayload;
    } catch (error) {
      logger.warn('Failed to decode token', { error });
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded?.exp) {return true;}
      
      return Date.now() >= decoded.exp * 1000;
    } catch (error) {
      return true;
    }
  }

  /**
   * Generate voice session token for WebSocket authentication
   */
  generateVoiceToken(payload: Omit<VoiceJWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options?: TokenOptions): string {
    try {
      const tokenPayload: VoiceJWTPayload = {
        ...payload,
        iss: options?.issuer || this.defaultIssuer,
        aud: options?.audience || 'sitespeak-voice',
      };

      const expiresIn = options?.expiresIn || '1h'; // Voice tokens expire in 1 hour
      const signOptions: jwt.SignOptions = {
        expiresIn: expiresIn as any,
        issuer: tokenPayload.iss,
        audience: tokenPayload.aud,
      };
      
      return jwt.sign(tokenPayload, this.accessTokenSecret, signOptions);
    } catch (error) {
      logger.error('Failed to generate voice token', { error, tenantId: payload.tenantId, siteId: payload.siteId });
      throw new Error('Voice token generation failed');
    }
  }

  /**
   * Verify voice session token
   */
  verifyVoiceToken(token: string): VoiceJWTPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: this.defaultIssuer,
        audience: 'sitespeak-voice',
      }) as VoiceJWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid voice token', { error: error.message });
        throw new Error('Invalid voice token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Voice token expired', { expiredAt: error.expiredAt });
        throw new Error('Voice token expired');
      }

      logger.error('Voice token verification failed', { error: error instanceof Error ? error.message : String(error) });
      throw new Error('Voice token verification failed');
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded?.exp) {return null;}
      
      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {return null;}
    
    const match = authHeader.match(/^Bearer\s+(.+)$/);
    return match ? (match[1] ?? null) : null;
  }
}

// Export singleton instance
export const jwtService = new JWTService();
