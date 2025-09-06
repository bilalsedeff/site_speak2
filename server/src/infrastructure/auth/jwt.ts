import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { config } from '../config';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'jwt' });

// JWT Payload Schema
export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  email: z.string().email(),
  permissions: z.array(z.string()).optional(),
  sessionId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  locale: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.string().optional(),
  aud: z.string().optional(),
});

// Voice-specific JWT payload for WebSocket connections
export const VoiceJWTPayloadSchema = z.object({
  tenantId: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  locale: z.string().default('en-US'),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.string().optional(),
  aud: z.string().optional(),
});

export type VoiceJWTPayload = z.infer<typeof VoiceJWTPayloadSchema>;

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

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
      const tokenPayload = {
        ...payload,
        iss: options?.issuer || this.defaultIssuer,
        aud: options?.audience || this.defaultAudience,
      };

      const expiresIn = options?.expiresIn || config.JWT_ACCESS_EXPIRES_IN;
      const signOptions: jwt.SignOptions = {
        expiresIn: typeof expiresIn === 'string' ? parseExpirationTime(expiresIn) : expiresIn,
        issuer: tokenPayload.iss,
        audience: tokenPayload.aud,
      };
      return jwt.sign(tokenPayload, this.accessTokenSecret, signOptions);
    } catch (error) {
      logger.error('Failed to generate access token', { error, userId: payload.userId });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload: Pick<JWTPayload, 'userId' | 'tenantId' | 'sessionId'>, options?: TokenOptions): string {
    try {
      const tokenPayload = {
        ...payload,
        iss: options?.issuer || this.defaultIssuer,
        aud: options?.audience || this.defaultAudience,
      };

      const expiresIn = options?.expiresIn || config.JWT_REFRESH_EXPIRES_IN;
      const signOptions: jwt.SignOptions = {
        expiresIn: typeof expiresIn === 'string' ? parseExpirationTime(expiresIn) : expiresIn,
        issuer: tokenPayload.iss,
        audience: tokenPayload.aud,
      };
      return jwt.sign(tokenPayload, this.refreshTokenSecret, signOptions);
    } catch (error) {
      logger.error('Failed to generate refresh token', { error, userId: payload.userId });
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>, options?: TokenOptions): TokenPair {
    const sessionId = payload.sessionId || crypto.randomUUID();
    
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
      }) as jwt.JwtPayload;

      const payload = JWTPayloadSchema.parse(decoded);
      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token', { error: error.message });
        throw new Error('Invalid token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Access token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }

      if (error instanceof z.ZodError) {
        logger.warn('Token payload validation failed', { error: error.errors });
        throw new Error('Invalid token format');
      }

      logger.error('Token verification failed', { error });
      throw new Error('Token verification failed');
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): Pick<JWTPayload, 'userId' | 'tenantId' | 'sessionId' | 'iat' | 'exp'> {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: this.defaultIssuer,
        audience: this.defaultAudience,
      }) as jwt.JwtPayload;

      const RefreshTokenSchema = JWTPayloadSchema.pick({
        userId: true,
        tenantId: true,
        sessionId: true,
        iat: true,
        exp: true,
      });

      return RefreshTokenSchema.parse(decoded);
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token', { error: error.message });
        throw new Error('Invalid token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Refresh token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      }

      logger.error('Refresh token verification failed', { error });
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
        expiresIn: typeof expiresIn === 'string' ? parseExpirationTime(expiresIn) : expiresIn,
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
      }) as jwt.JwtPayload;

      const payload = VoiceJWTPayloadSchema.parse(decoded);
      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid voice token', { error: error.message });
        throw new Error('Invalid voice token');
      }
      
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('Voice token expired', { expiredAt: error.expiredAt });
        throw new Error('Voice token expired');
      }

      if (error instanceof z.ZodError) {
        logger.warn('Voice token payload validation failed', { error: error.errors });
        throw new Error('Invalid voice token format');
      }

      logger.error('Voice token verification failed', { error });
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