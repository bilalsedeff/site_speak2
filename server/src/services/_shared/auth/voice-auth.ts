/**
 * Shared Voice Authentication Utility
 *
 * Consolidates authentication logic across voice services to eliminate duplication:
 * - VoiceWebSocketHandler (Socket.IO)
 * - RawWebSocketServer (Raw WebSocket)
 * - VoiceOrchestrator (WebSocket upgrade)
 */

import { Socket } from 'socket.io';
import { IncomingMessage } from 'http';
import { jwtService, type VoiceJWTPayload } from '../../../infrastructure/auth/jwt.js';
import { createLogger } from '../../../shared/utils.js';

const logger = createLogger({ service: 'voice-auth' });

/**
 * Standardized voice authentication data
 */
export interface VoiceAuthData {
  tenantId: string;
  siteId: string;
  userId?: string;
  locale?: string;
}

/**
 * Token extraction sources for different connection types
 */
export interface TokenExtractionContext {
  // Socket.IO connection
  socketHandshake?: Socket['handshake'];

  // Raw WebSocket HTTP upgrade
  httpRequest?: IncomingMessage;

  // Direct token for testing
  directToken?: string;
}

/**
 * Authentication options
 */
export interface VoiceAuthOptions {
  allowDevelopmentMode?: boolean;
  requireUserId?: boolean;
  logAuthAttempts?: boolean;
}

/**
 * Shared voice authentication service
 */
export class VoiceAuthService {
  /**
   * Extract authentication token from various sources
   */
  extractToken(context: TokenExtractionContext): string | null {
    // Direct token (for testing)
    if (context.directToken) {
      return context.directToken;
    }

    // Socket.IO handshake sources
    if (context.socketHandshake) {
      const handshake = context.socketHandshake;
      return (
        (handshake.auth?.['token'] as string) ||
        (handshake.auth?.['accessToken'] as string) ||
        (handshake.query?.['token'] as string) ||
        null
      );
    }

    // Raw WebSocket HTTP request sources
    if (context.httpRequest) {
      const request = context.httpRequest;

      // Query parameter
      if (request.url) {
        const url = new URL(request.url, 'wss://base.url');
        const queryToken = url.searchParams.get('token');
        if (queryToken) {return queryToken;}
      }

      // Authorization header
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        return token || null;
      }
    }

    return null;
  }

  /**
   * Generate development mode authentication data
   */
  generateDevelopmentAuth(context?: { sessionId?: string; socketId?: string }): VoiceAuthData {
    const timestamp = Date.now();
    const identifier = context?.sessionId || context?.socketId || timestamp;

    return {
      tenantId: '00000000-0000-0000-0000-000000000000',
      siteId: '00000000-0000-0000-0000-000000000000',
      userId: `dev-voice-user-${identifier}`,
      locale: 'en-US',
    };
  }

  /**
   * Authenticate voice connection with unified logic
   */
  async authenticateVoiceConnection(
    context: TokenExtractionContext,
    options: VoiceAuthOptions = {}
  ): Promise<VoiceAuthData> {
    const {
      allowDevelopmentMode = true,
      requireUserId = false,
      logAuthAttempts = true,
    } = options;

    // Extract token from various sources
    const token = this.extractToken(context);

    // Development mode: Allow connections without token
    if (process.env['NODE_ENV'] === 'development' && allowDevelopmentMode && !token) {
      const devAuth = this.generateDevelopmentAuth({
        ...(context.socketHandshake?.auth?.['sessionId'] && {
          sessionId: context.socketHandshake.auth['sessionId']
        }),
      });

      if (logAuthAttempts) {
        logger.info('Voice connection authenticated (development mode)', {
          tenantId: devAuth.tenantId,
          userId: devAuth.userId,
          source: this.getContextSource(context),
        });
      }

      return devAuth;
    }

    // Require token in production or when not in development mode
    if (!token) {
      const error = new Error('No authentication token provided');
      if (logAuthAttempts) {
        logger.warn('Voice authentication failed: No token', {
          source: this.getContextSource(context),
          developmentMode: process.env['NODE_ENV'] === 'development',
          allowDevelopmentMode,
        });
      }
      throw error;
    }

    try {
      // Verify JWT token
      const decoded: VoiceJWTPayload = jwtService.verifyVoiceToken(token);

      // Validate required claims
      if (!decoded.tenantId || !decoded.siteId) {
        throw new Error('Invalid token: missing required claims (tenantId, siteId)');
      }

      if (requireUserId && !decoded.userId) {
        throw new Error('Invalid token: missing required userId claim');
      }

      // Create standardized auth data
      const authData: VoiceAuthData = {
        tenantId: decoded.tenantId,
        siteId: decoded.siteId,
        locale: decoded.locale || 'en-US',
      };

      if (decoded.userId) {
        authData.userId = decoded.userId;
      }

      if (logAuthAttempts) {
        logger.info('Voice connection authenticated successfully', {
          tenantId: authData.tenantId,
          siteId: authData.siteId,
          userId: authData.userId,
          locale: authData.locale,
          source: this.getContextSource(context),
        });
      }

      return authData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';

      if (logAuthAttempts) {
        logger.error('Voice authentication failed', {
          error: errorMessage,
          tokenProvided: !!token,
          tokenPrefix: token ? token.substring(0, 10) + '...' : 'none',
          source: this.getContextSource(context),
        });
      }

      throw new Error(`Voice authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Get context source for logging
   */
  private getContextSource(context: TokenExtractionContext): string {
    if (context.directToken) {return 'direct-token';}
    if (context.socketHandshake) {return 'socket-io';}
    if (context.httpRequest) {return 'raw-websocket';}
    return 'unknown';
  }

  /**
   * Validate voice authentication data
   */
  validateAuthData(authData: VoiceAuthData): boolean {
    return !!(
      authData.tenantId &&
      authData.siteId &&
      authData.tenantId.length > 0 &&
      authData.siteId.length > 0
    );
  }

  /**
   * Create callback-style authentication for legacy compatibility
   */
  authenticateWithCallback(
    context: TokenExtractionContext,
    callback: (err: Error | null, authData?: VoiceAuthData) => void,
    options?: VoiceAuthOptions
  ): void {
    this.authenticateVoiceConnection(context, options)
      .then(authData => callback(null, authData))
      .catch(error => callback(error));
  }
}

// Export singleton instance
export const voiceAuthService = new VoiceAuthService();

// Export backward-compatible functions
export const authenticateVoiceConnection = voiceAuthService.authenticateVoiceConnection.bind(voiceAuthService);
export const extractVoiceToken = voiceAuthService.extractToken.bind(voiceAuthService);
export const generateDevelopmentVoiceAuth = voiceAuthService.generateDevelopmentAuth.bind(voiceAuthService);