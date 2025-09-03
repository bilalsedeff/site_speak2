/**
 * CDN Provider Abstraction
 * 
 * Provides unified interface for CDN operations across different providers.
 * Supports precise purging by URL, tag/surrogate key, and prefix patterns.
 * 
 * Supported Providers:
 * - Cloudflare (URL, zone, tag-based purging)
 * - Fastly (URL and surrogate key purging)
 * - AWS CloudFront (URL and invalidation patterns)
 * - Generic HTTP cache purging
 */

import { createLogger } from '../../../_shared/telemetry/logger';

const logger = createLogger({ service: 'cdn-provider' });

export interface CDNConfig {
  provider: 'cloudflare' | 'fastly' | 'cloudfront' | 'generic';
  
  // Cloudflare
  cloudflareApiToken?: string;
  cloudflareZoneId?: string;
  
  // Fastly
  fastlyApiKey?: string;
  fastlyServiceId?: string;
  
  // AWS CloudFront
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  distributionId?: string;
  
  // Generic
  purgeEndpoint?: string;
  purgeHeaders?: Record<string, string>;
  
  // Common settings
  defaultTtl?: number;
  purgeTimeout?: number;
}

export interface PurgeResult {
  success: boolean;
  purgedCount?: number;
  estimatedWaitTime?: number; // seconds
  errors?: string[];
}

export interface CacheRule {
  pattern: string;
  ttl: number; // seconds
  headers?: Record<string, string>;
  bypassOnCookie?: string[];
  varyBy?: string[];
}

export interface PreviewUrlOptions {
  subdomain?: string;
  path?: string;
  queryParams?: Record<string, string>;
  ttl?: number; // seconds, for temporary previews
}

/**
 * CDN Provider Interface
 */
export interface CDNProvider {
  /**
   * Purge specific URLs from cache
   */
  purgeUrls(urls: string[]): Promise<PurgeResult>;

  /**
   * Purge by tags/surrogate keys (if supported by provider)
   */
  purgeByTag(tags: string[]): Promise<PurgeResult>;

  /**
   * Purge by URL prefix pattern
   */
  purgeByPrefix(prefix: string): Promise<PurgeResult>;

  /**
   * Purge entire cache (use sparingly)
   */
  purgeAll(): Promise<PurgeResult>;

  /**
   * Create preview URL for deployment testing
   */
  createPreviewUrl(originUrl: string, releaseHash: string, options?: PreviewUrlOptions): Promise<string>;

  /**
   * Set or update caching rules
   */
  setCachingRules(rules: CacheRule[]): Promise<void>;

  /**
   * Get CDN edge locations serving requests
   */
  getEdgeLocations(): Promise<string[]>;

  /**
   * Validate CDN configuration
   */
  validateConfiguration(): Promise<boolean>;

  /**
   * Get provider information
   */
  getProviderInfo(): { provider: string; features: string[] };
}

/**
 * Cloudflare CDN Provider
 */
export class CloudflareCDNProvider implements CDNProvider {
  constructor(
    private apiToken: string,
    private zoneId: string,
    private config: Partial<CDNConfig> = {}
  ) {}

  async purgeUrls(urls: string[]): Promise<PurgeResult> {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: urls
        }),
        signal: AbortSignal.timeout(this.config.purgeTimeout || 30000)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Cloudflare purge failed: ${result.errors?.[0]?.message || 'Unknown error'}`);
      }

      logger.info('Cloudflare URLs purged', { count: urls.length, urls });

      return {
        success: true,
        purgedCount: urls.length,
        estimatedWaitTime: 30 // Cloudflare typically takes ~30 seconds
      };

    } catch (error) {
      logger.error('Cloudflare purge URLs failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        urls
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeByTag(tags: string[]): Promise<PurgeResult> {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tags: tags
        }),
        signal: AbortSignal.timeout(this.config.purgeTimeout || 30000)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Cloudflare tag purge failed: ${result.errors?.[0]?.message || 'Unknown error'}`);
      }

      logger.info('Cloudflare tags purged', { count: tags.length, tags });

      return {
        success: true,
        estimatedWaitTime: 30
      };

    } catch (error) {
      logger.error('Cloudflare purge by tag failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tags
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeByPrefix(prefix: string): Promise<PurgeResult> {
    try {
      // Cloudflare doesn't support prefix purging directly
      // We need to purge by pattern or convert to tag-based purging
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prefixes: [prefix]
        }),
        signal: AbortSignal.timeout(this.config.purgeTimeout || 30000)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Cloudflare prefix purge failed: ${result.errors?.[0]?.message || 'Unknown error'}`);
      }

      logger.info('Cloudflare prefix purged', { prefix });

      return {
        success: true,
        estimatedWaitTime: 30
      };

    } catch (error) {
      logger.error('Cloudflare purge by prefix failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        prefix
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeAll(): Promise<PurgeResult> {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          purge_everything: true
        }),
        signal: AbortSignal.timeout(this.config.purgeTimeout || 30000)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Cloudflare purge all failed: ${result.errors?.[0]?.message || 'Unknown error'}`);
      }

      logger.warn('Cloudflare entire cache purged');

      return {
        success: true,
        estimatedWaitTime: 60
      };

    } catch (error) {
      logger.error('Cloudflare purge all failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async createPreviewUrl(originUrl: string, releaseHash: string, options?: PreviewUrlOptions): Promise<string> {
    // Cloudflare preview URLs can use query parameters or custom headers
    const url = new URL(originUrl);
    
    if (options?.subdomain) {
      url.hostname = `${options.subdomain}.${url.hostname}`;
    }

    if (options?.path) {
      url.pathname = options.path;
    }

    // Add release hash as query parameter for preview
    url.searchParams.set('preview', releaseHash);
    
    if (options?.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }

  async setCachingRules(rules: CacheRule[]): Promise<void> {
    try {
      // This would typically require Cloudflare's Page Rules API or Workers
      // For now, we'll log the rules that should be configured
      logger.info('Cloudflare caching rules should be configured', { rules });
      
      // In a real implementation, this would use:
      // - Page Rules API for basic patterns
      // - Workers for advanced logic
      // - Cache Rules API for more precise control
      
    } catch (error) {
      logger.error('Failed to set Cloudflare caching rules', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getEdgeLocations(): Promise<string[]> {
    // Cloudflare has a global network, return major regions
    return [
      'North America',
      'Europe',
      'Asia Pacific',
      'Latin America',
      'Africa',
      'Middle East'
    ];
  }

  async validateConfiguration(): Promise<boolean> {
    try {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      return response.ok;

    } catch (error) {
      logger.error('Cloudflare configuration validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  getProviderInfo(): { provider: string; features: string[] } {
    return {
      provider: 'cloudflare',
      features: [
        'url-purging',
        'tag-purging',
        'prefix-purging',
        'full-purge',
        'preview-urls',
        'global-cdn',
        'ddos-protection'
      ]
    };
  }
}

/**
 * Fastly CDN Provider
 */
export class FastlyCDNProvider implements CDNProvider {
  constructor(
    private apiKey: string,
    private serviceId: string,
    private config: Partial<CDNConfig> = {}
  ) {}

  async purgeUrls(urls: string[]): Promise<PurgeResult> {
    try {
      const purgePromises = urls.map(url =>
        fetch(`https://api.fastly.com/purge/${url}`, {
          method: 'POST',
          headers: {
            'Fastly-Token': this.apiKey,
            'Accept': 'application/json'
          }
        })
      );

      const results = await Promise.allSettled(purgePromises);
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected');

      logger.info('Fastly URLs purged', { 
        total: urls.length,
        successes,
        failures: failures.length
      });

      return {
        success: failures.length === 0,
        purgedCount: successes,
        estimatedWaitTime: 5, // Fastly is typically faster
        errors: failures.map(f => f.status === 'rejected' ? f.reason : 'Unknown error')
      };

    } catch (error) {
      logger.error('Fastly purge URLs failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeByTag(tags: string[]): Promise<PurgeResult> {
    try {
      const purgePromises = tags.map(tag =>
        fetch(`https://api.fastly.com/service/${this.serviceId}/purge/${tag}`, {
          method: 'POST',
          headers: {
            'Fastly-Token': this.apiKey,
            'Accept': 'application/json'
          }
        })
      );

      const results = await Promise.allSettled(purgePromises);
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected');

      logger.info('Fastly tags purged', { 
        total: tags.length,
        successes,
        failures: failures.length
      });

      return {
        success: failures.length === 0,
        estimatedWaitTime: 5,
        errors: failures.map(f => f.status === 'rejected' ? f.reason : 'Unknown error')
      };

    } catch (error) {
      logger.error('Fastly purge by tag failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeByPrefix(prefix: string): Promise<PurgeResult> {
    // Fastly doesn't support prefix purging directly
    // This would require using surrogate keys or VCL logic
    logger.warn('Fastly prefix purging not directly supported, consider using surrogate keys');
    
    return {
      success: false,
      errors: ['Prefix purging not supported by Fastly provider. Use surrogate keys instead.']
    };
  }

  async purgeAll(): Promise<PurgeResult> {
    try {
      const response = await fetch(`https://api.fastly.com/service/${this.serviceId}/purge_all`, {
        method: 'POST',
        headers: {
          'Fastly-Token': this.apiKey,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Fastly purge all failed: ${response.status}`);
      }

      logger.warn('Fastly entire cache purged');

      return {
        success: true,
        estimatedWaitTime: 10
      };

    } catch (error) {
      logger.error('Fastly purge all failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async createPreviewUrl(originUrl: string, releaseHash: string, options?: PreviewUrlOptions): Promise<string> {
    const url = new URL(originUrl);
    
    // Fastly preview can use custom headers or query parameters
    url.searchParams.set('preview', releaseHash);
    url.searchParams.set('fastly-preview', '1');
    
    if (options?.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }

  async setCachingRules(rules: CacheRule[]): Promise<void> {
    logger.info('Fastly caching rules should be configured via VCL', { rules });
    // Implementation would require VCL configuration or Compute@Edge
  }

  async getEdgeLocations(): Promise<string[]> {
    return [
      'North America',
      'Europe',
      'Asia Pacific',
      'Australia',
      'South America'
    ];
  }

  async validateConfiguration(): Promise<boolean> {
    try {
      const response = await fetch(`https://api.fastly.com/service/${this.serviceId}`, {
        headers: {
          'Fastly-Token': this.apiKey,
          'Accept': 'application/json'
        }
      });

      return response.ok;

    } catch (error) {
      logger.error('Fastly configuration validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  getProviderInfo(): { provider: string; features: string[] } {
    return {
      provider: 'fastly',
      features: [
        'url-purging',
        'surrogate-key-purging',
        'full-purge',
        'real-time-analytics',
        'vcl-configuration',
        'compute-edge'
      ]
    };
  }
}

/**
 * Generic HTTP Cache Provider
 */
export class GenericCDNProvider implements CDNProvider {
  constructor(
    private purgeEndpoint: string,
    private headers: Record<string, string> = {},
    private config: Partial<CDNConfig> = {}
  ) {}

  async purgeUrls(urls: string[]): Promise<PurgeResult> {
    try {
      const response = await fetch(this.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify({ urls }),
        signal: AbortSignal.timeout(this.config.purgeTimeout || 30000)
      });

      if (!response.ok) {
        throw new Error(`Generic CDN purge failed: ${response.status}`);
      }

      logger.info('Generic CDN URLs purged', { count: urls.length });

      return {
        success: true,
        purgedCount: urls.length,
        estimatedWaitTime: 60
      };

    } catch (error) {
      logger.error('Generic CDN purge failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeByTag(tags: string[]): Promise<PurgeResult> {
    return {
      success: false,
      errors: ['Tag purging not supported by generic provider']
    };
  }

  async purgeByPrefix(prefix: string): Promise<PurgeResult> {
    try {
      const response = await fetch(this.purgeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify({ prefix })
      });

      return {
        success: response.ok,
        estimatedWaitTime: 60
      };

    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  async purgeAll(): Promise<PurgeResult> {
    return {
      success: false,
      errors: ['Full cache purge not supported by generic provider']
    };
  }

  async createPreviewUrl(originUrl: string, releaseHash: string): Promise<string> {
    const url = new URL(originUrl);
    url.searchParams.set('preview', releaseHash);
    return url.toString();
  }

  async setCachingRules(rules: CacheRule[]): Promise<void> {
    logger.info('Caching rules configuration not supported by generic provider', { rules });
  }

  async getEdgeLocations(): Promise<string[]> {
    return ['Unknown'];
  }

  async validateConfiguration(): Promise<boolean> {
    try {
      const response = await fetch(this.purgeEndpoint, { method: 'HEAD' });
      return response.ok || response.status === 404; // 404 is acceptable for HEAD
    } catch {
      return false;
    }
  }

  getProviderInfo(): { provider: string; features: string[] } {
    return {
      provider: 'generic',
      features: ['url-purging']
    };
  }
}

/**
 * Factory function for creating CDN providers
 */
export function createCDNProvider(config: CDNConfig): CDNProvider {
  switch (config.provider) {
    case 'cloudflare':
      if (!config.cloudflareApiToken || !config.cloudflareZoneId) {
        throw new Error('Cloudflare API token and zone ID are required');
      }
      return new CloudflareCDNProvider(config.cloudflareApiToken, config.cloudflareZoneId, config);

    case 'fastly':
      if (!config.fastlyApiKey || !config.fastlyServiceId) {
        throw new Error('Fastly API key and service ID are required');
      }
      return new FastlyCDNProvider(config.fastlyApiKey, config.fastlyServiceId, config);

    case 'generic':
      if (!config.purgeEndpoint) {
        throw new Error('Purge endpoint is required for generic CDN provider');
      }
      return new GenericCDNProvider(config.purgeEndpoint, config.purgeHeaders, config);

    default:
      throw new Error(`Unsupported CDN provider: ${config.provider}`);
  }
}

/**
 * Create CDN provider from environment variables
 */
export function createCDNProviderFromEnv(): CDNProvider {
  const provider = process.env['CDN_PROVIDER'] || 'cloudflare';

  if (provider === 'cloudflare') {
    return createCDNProvider({
      provider: 'cloudflare',
      cloudflareApiToken: process.env['CLOUDFLARE_API_TOKEN'] || '',
      cloudflareZoneId: process.env['CLOUDFLARE_ZONE_ID'] || '',
      purgeTimeout: parseInt(process.env['CDN_PURGE_TIMEOUT'] || '30000')
    });
  }

  if (provider === 'fastly') {
    return createCDNProvider({
      provider: 'fastly',
      fastlyApiKey: process.env['FASTLY_API_KEY'] || '',
      fastlyServiceId: process.env['FASTLY_SERVICE_ID'] || '',
      purgeTimeout: parseInt(process.env['CDN_PURGE_TIMEOUT'] || '30000')
    });
  }

  if (provider === 'generic') {
    return createCDNProvider({
      provider: 'generic',
      purgeEndpoint: process.env['CDN_PURGE_ENDPOINT'] || '',
      purgeHeaders: process.env['CDN_PURGE_HEADERS'] ? JSON.parse(process.env['CDN_PURGE_HEADERS']) : {},
      purgeTimeout: parseInt(process.env['CDN_PURGE_TIMEOUT'] || '30000')
    });
  }

  throw new Error(`Unsupported CDN provider: ${provider}`);
}