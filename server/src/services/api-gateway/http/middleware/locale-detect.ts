/**
 * Locale Detection Middleware
 * 
 * Parses Accept-Language header per RFC 9110 §12.5.4
 * Sets req.locale with fallback to 'en-US'
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../_shared/telemetry/logger';

const logger = createLogger({ service: 'locale-detect' });

// BCP-47 language tag regex (simplified)
const LANGUAGE_TAG_REGEX = /^[a-z]{2,3}(?:-[A-Z]{2})?(?:-[a-zA-Z0-9]+)*$/;

export interface LocaleContext {
  locale: string;
  languages: string[];
  quality: Record<string, number>;
}

declare global {
  namespace Express {
    interface Request {
      locale: string;
      localeContext: LocaleContext;
    }
    
    interface Locals {
      locale: string;
    }
  }
}

/**
 * Parse Accept-Language header according to RFC 9110
 */
function parseAcceptLanguage(acceptLanguage: string): Array<{ lang: string; q: number }> {
  if (!acceptLanguage) return [];

  return acceptLanguage
    .split(',')
    .map(lang => {
      const [language, qValue] = lang.trim().split(';q=');
      const q = qValue ? parseFloat(qValue) : 1.0;
      
      // Validate language tag format
      if (!LANGUAGE_TAG_REGEX.test(language.trim())) {
        return null;
      }
      
      return {
        lang: language.trim().toLowerCase(),
        q: isNaN(q) ? 0 : q
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.q - a!.q) as Array<{ lang: string; q: number }>;
}

/**
 * Normalize language tags to standard format
 */
function normalizeLanguageTag(lang: string): string {
  const parts = lang.split('-');
  
  if (parts.length === 1) {
    return parts[0].toLowerCase();
  }
  
  if (parts.length === 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }
  
  // Handle longer tags (e.g., zh-Hans-CN)
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (index === 1 && part.length === 2) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join('-');
}

/**
 * Get the best matching locale from supported locales
 */
function getBestMatch(requested: Array<{ lang: string; q: number }>, supported: string[]): string {
  const supportedSet = new Set(supported.map(s => s.toLowerCase()));
  
  for (const { lang } of requested) {
    const normalized = normalizeLanguageTag(lang);
    
    // Exact match
    if (supportedSet.has(normalized)) {
      return normalized;
    }
    
    // Language-only match (e.g., 'en' for 'en-US')
    const languageOnly = normalized.split('-')[0];
    const fallback = supported.find(s => s.toLowerCase().startsWith(languageOnly));
    if (fallback) {
      return fallback.toLowerCase();
    }
  }
  
  return 'en-US'; // Default fallback
}

/**
 * Locale detection middleware factory
 */
export function localeDetect(options: {
  supportedLocales?: string[];
  fallback?: string;
  headerOverride?: string;
} = {}) {
  const {
    supportedLocales = [
      'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 
      'it-IT', 'pt-PT', 'ru-RU', 'zh-CN', 'ja-JP',
      'ko-KR', 'ar-SA', 'tr-TR'
    ],
    fallback = 'en-US',
    headerOverride = 'x-user-locale'
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check for explicit locale override first
      const overrideLocale = req.headers[headerOverride] as string || req.query['locale'] as string;
      
      let selectedLocale: string;
      let languages: string[] = [];
      let quality: Record<string, number> = {};

      if (overrideLocale && supportedLocales.includes(overrideLocale)) {
        selectedLocale = overrideLocale;
        languages = [overrideLocale];
        quality[overrideLocale] = 1.0;
        
        logger.debug('Using locale override', {
          locale: selectedLocale,
          source: 'override',
          correlationId: req.correlationId
        });
      } else {
        // Parse Accept-Language header
        const acceptLanguage = req.headers['accept-language'] as string;
        const parsed = parseAcceptLanguage(acceptLanguage || '');
        
        if (parsed.length > 0) {
          selectedLocale = getBestMatch(parsed, supportedLocales);
          languages = parsed.map(p => p.lang);
          quality = parsed.reduce((acc, p) => {
            acc[p.lang] = p.q;
            return acc;
          }, {} as Record<string, number>);
        } else {
          selectedLocale = fallback;
          languages = [fallback];
          quality[fallback] = 1.0;
        }

        logger.debug('Locale detected from Accept-Language', {
          acceptLanguage,
          selectedLocale,
          languages,
          correlationId: req.correlationId
        });
      }

      // Set locale context on request
      req.locale = selectedLocale;
      req.localeContext = {
        locale: selectedLocale,
        languages,
        quality
      };

      // Expose to templates
      res.locals.locale = selectedLocale;

      next();
    } catch (error) {
      logger.error('Locale detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId,
        acceptLanguage: req.headers['accept-language']
      });

      // Fallback on error
      req.locale = fallback;
      req.localeContext = {
        locale: fallback,
        languages: [fallback],
        quality: { [fallback]: 1.0 }
      };
      res.locals.locale = fallback;

      next();
    }
  };
}

/**
 * Get supported locales list
 */
export function getSupportedLocales(): string[] {
  return [
    'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE',
    'it-IT', 'pt-PT', 'ru-RU', 'zh-CN', 'ja-JP',
    'ko-KR', 'ar-SA', 'tr-TR'
  ];
}

/**
 * Validate locale format
 */
export function isValidLocale(locale: string): boolean {
  return LANGUAGE_TAG_REGEX.test(locale);
}