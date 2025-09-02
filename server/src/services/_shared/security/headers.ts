/**
 * Security Headers - Standard security headers configuration
 * 
 * Provides HSTS, CSP, and other security headers with
 * configuration for widget/agent domains.
 */

import { Request, Response, NextFunction } from 'express';
import { cfg } from '../config/index.js';

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  csp?: {
    directives?: Record<string, string[]>;
    reportUri?: string;
    reportOnly?: boolean;
  };
  referrerPolicy?: string;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  contentTypeOptions?: boolean;
  xssProtection?: boolean;
}

/**
 * Default security headers configuration
 */
const DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
  hsts: {
    maxAge: cfg.HSTS_MAX_AGE,
    includeSubDomains: true,
    preload: true,
  },
  csp: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'font-src': ["'self'", 'https:'],
      'connect-src': ["'self'", 'https:', 'wss:', 'ws:'],
      'media-src': ["'self'", 'blob:', 'data:'],
      'object-src': ["'none'"],
      'frame-src': ["'self'"],
      'worker-src': ["'self'", 'blob:'],
      'manifest-src': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
    },
    reportUri: cfg.CSP_REPORT_URI,
    reportOnly: cfg.NODE_ENV === 'development',
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  frameOptions: 'DENY',
  contentTypeOptions: true,
  xssProtection: true,
};

/**
 * Widget-specific CSP for embedded voice agents
 */
const WIDGET_CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'", 'https:'],
  'connect-src': ["'self'", cfg.BACKEND_URL, 'wss:', 'https:'],
  'media-src': ["'self'", 'blob:', 'data:'],
  'object-src': ["'none'"],
  'frame-ancestors': ["*"], // Allow embedding in any site
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/**
 * Build CSP header value from directives
 */
function buildCSPHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Express middleware for security headers
 */
export function securityHeaders(config: SecurityHeadersConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // HSTS (HTTP Strict Transport Security)
    if (mergedConfig.hsts && req.secure) {
      let hstsValue = `max-age=${mergedConfig.hsts.maxAge}`;
      if (mergedConfig.hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (mergedConfig.hsts.preload) {
        hstsValue += '; preload';
      }
      res.set('Strict-Transport-Security', hstsValue);
    }

    // Content Security Policy
    if (mergedConfig.csp) {
      const cspHeader = mergedConfig.csp.reportOnly ? 
        'Content-Security-Policy-Report-Only' : 
        'Content-Security-Policy';
      
      let cspValue = buildCSPHeader(mergedConfig.csp.directives);
      
      if (mergedConfig.csp.reportUri) {
        cspValue += `; report-uri ${mergedConfig.csp.reportUri}`;
      }
      
      res.set(cspHeader, cspValue);
    }

    // Other security headers
    res.set({
      'Referrer-Policy': mergedConfig.referrerPolicy,
      'X-Frame-Options': mergedConfig.frameOptions,
      'X-Content-Type-Options': mergedConfig.contentTypeOptions ? 'nosniff' : undefined,
      'X-XSS-Protection': mergedConfig.xssProtection ? '1; mode=block' : '0',
      'X-Powered-By': undefined, // Remove Express header
    });

    next();
  };
}

/**
 * Widget-specific security headers for embeddable components
 */
export function widgetSecurityHeaders() {
  return securityHeaders({
    csp: {
      directives: WIDGET_CSP_DIRECTIVES,
      reportOnly: cfg.NODE_ENV === 'development',
    },
    frameOptions: 'ALLOWALL', // Allow embedding
  });
}

/**
 * API-specific security headers
 */
export function apiSecurityHeaders() {
  return securityHeaders({
    csp: {
      directives: {
        'default-src': ["'none'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    frameOptions: 'DENY',
  });
}

/**
 * CORS configuration helper
 */
export function createCORSConfig(options: {
  origins?: string | string[] | boolean;
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
} = {}) {
  const {
    origins = cfg.CORS_ORIGINS.split(','),
    credentials = cfg.CORS_CREDENTIALS,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders = [
      'Content-Type',
      'Authorization',
      'X-Tenant-ID',
      'X-Site-ID',
      'X-Correlation-ID',
      'X-Requested-With',
    ],
  } = options;

  return {
    origin: origins,
    credentials,
    methods,
    allowedHeaders,
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
  };
}

/**
 * Validate and sanitize CORS origins
 */
export function validateCORSOrigins(origins: string): string[] {
  return origins
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => {
      try {
        new URL(origin);
        return true;
      } catch {
        logger.warn('Invalid CORS origin', { origin });
        return false;
      }
    });
}

/**
 * Security middleware factory with presets
 */
export const securityMiddleware = {
  // Standard web application security
  web: () => securityHeaders(),
  
  // API endpoint security
  api: () => apiSecurityHeaders(),
  
  // Widget/embeddable component security
  widget: () => widgetSecurityHeaders(),
  
  // Development mode (relaxed)
  development: () => securityHeaders({
    csp: {
      directives: {
        ...DEFAULT_CONFIG.csp.directives,
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'connect-src': ["'self'", '*'], // Allow all connections in dev
      },
      reportOnly: true,
    },
  }),
};