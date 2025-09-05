/**
 * Playwright Adapter
 * 
 * Implements headless rendering with Playwright for modern JS sites.
 * Handles dynamic SPAs and reliable navigation/waits as specified in source-of-truth:
 * "/crawler/playwrightAdapter.ts loads pages with Playwright, waits for domcontentloaded + optional networkidle"
 */

import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'playwright-adapter' });

export interface PlaywrightRenderOptions {
  // Wait strategies
  waitStrategy?: 'domcontentloaded' | 'networkidle' | 'load';
  waitForSelector?: string;
  waitTimeout?: number;
  
  // Browser options
  userAgent?: string;
  viewport?: { width: number; height: number };
  
  // Behavior options
  javascriptEnabled?: boolean;
  blockImages?: boolean;
  blockFonts?: boolean;
  blockVideos?: boolean;
  
  // Authentication
  headers?: Record<string, string>;
  
  // Debugging
  screenshots?: boolean;
  tracing?: boolean;
}

export interface PlaywrightRenderResult {
  url: string;
  finalUrl: string;
  html: string;
  title: string;
  
  // Response info
  status: number;
  headers: Record<string, string>;
  
  // Performance metrics
  loadTime: number;
  resourceCount: number;
  jsErrors: string[];
  
  // Optional debugging data
  screenshot?: Buffer;
  har?: any;
  
  renderedAt: Date;
}

export interface PlaywrightRenderError {
  url: string;
  error: string;
  type: 'timeout' | 'navigation' | 'javascript' | 'network' | 'unknown';
  details?: any;
}

/**
 * Playwright Adapter for Dynamic Site Rendering
 */
export class PlaywrightAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isInitialized = false;

  private readonly defaultOptions: Required<PlaywrightRenderOptions> = {
    waitStrategy: 'domcontentloaded',
    waitForSelector: '',
    waitTimeout: 30000,
    userAgent: 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)',
    viewport: { width: 1920, height: 1080 },
    javascriptEnabled: true,
    blockImages: false,
    blockFonts: false,
    blockVideos: true,
    headers: {},
    screenshots: false,
    tracing: false
  };

  /**
   * Initialize Playwright browser and context
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return;}

    try {
      logger.info('Initializing Playwright browser');
      
      // Launch browser with optimal settings for crawling
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      // Create browser context with default settings
      this.context = await this.browser.newContext({
        userAgent: this.defaultOptions.userAgent,
        viewport: this.defaultOptions.viewport,
        ignoreHTTPSErrors: true, // Handle self-signed certificates
        bypassCSP: false // Respect Content Security Policy
      });

      this.isInitialized = true;
      logger.info('Playwright browser initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Playwright', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Render page with Playwright
   */
  async renderPage(
    url: string, 
    options: PlaywrightRenderOptions = {}
  ): Promise<PlaywrightRenderResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.context) {
      throw new Error('Playwright context not initialized');
    }

    const config = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    let page: Page | null = null;
    let response: Response | null = null;

    try {
      logger.debug('Starting page render', { url, config });

      page = await this.context.newPage();
      
      // Set up request interception for resource blocking
      if (config.blockImages || config.blockFonts || config.blockVideos) {
        await page.route('**/*', (route) => {
          const resourceType = route.request().resourceType();
          
          if (config.blockImages && resourceType === 'image') {
            return route.abort();
          }
          if (config.blockFonts && resourceType === 'font') {
            return route.abort();
          }
          if (config.blockVideos && (resourceType === 'media' || resourceType === 'video')) {
            return route.abort();
          }
          
          return route.continue();
        });
      }

      // Set extra headers
      if (Object.keys(config.headers).length > 0) {
        await page.setExtraHTTPHeaders(config.headers);
      }

      // Set up error tracking
      const jsErrors: string[] = [];
      page.on('pageerror', (error) => {
        jsErrors.push(error.message);
        logger.warn('JavaScript error during render', { url, error: error.message });
      });

      page.on('requestfailed', (request) => {
        logger.warn('Request failed during render', {
          url,
          failedUrl: request.url(),
          failure: request.failure()?.errorText
        });
      });

      // Navigate to page
      response = await page.goto(url, {
        waitUntil: config.waitStrategy,
        timeout: config.waitTimeout
      });

      if (!response) {
        throw new Error('No response received');
      }

      // Additional wait for specific selector if configured
      if (config.waitForSelector) {
        try {
          await page.waitForSelector(config.waitForSelector, {
            timeout: Math.min(config.waitTimeout, 10000) // Max 10s for selector wait
          });
        } catch (error) {
          logger.warn('Wait for selector failed', {
            url,
            selector: config.waitForSelector,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Extract content
      const [html, title] = await Promise.all([
        page.content(),
        page.title()
      ]);

      const finalUrl = page.url();
      const status = response.status();
      const responseHeaders: Record<string, string> = {};
      
      // Convert headers to object
      const headers = response.headers();
      Object.keys(headers).forEach(key => {
        responseHeaders[key] = headers[key];
      });

      const loadTime = Date.now() - startTime;
      
      // Get resource count (approximate)
      const resourceCount = await page.evaluate(() => {
        return performance.getEntriesByType('resource').length;
      });

      // Optional screenshot
      let screenshot: Buffer | undefined;
      if (config.screenshots) {
        try {
          screenshot = await page.screenshot({
            type: 'png',
            fullPage: false // Only visible area
          });
        } catch (error) {
          logger.warn('Screenshot failed', {
            url,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const result: PlaywrightRenderResult = {
        url,
        finalUrl,
        html,
        title,
        status,
        headers: responseHeaders,
        loadTime,
        resourceCount,
        jsErrors,
        screenshot,
        renderedAt: new Date()
      };

      logger.debug('Page render completed', {
        url,
        finalUrl,
        status,
        loadTime,
        resourceCount,
        jsErrorCount: jsErrors.length,
        htmlLength: html.length
      });

      return result;

    } catch (error) {
      const loadTime = Date.now() - startTime;
      
      logger.error('Page render failed', {
        url,
        loadTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw {
        url,
        error: error instanceof Error ? error.message : 'Unknown render error',
        type: this.classifyError(error),
        details: error
      } as PlaywrightRenderError;

    } finally {
      // Clean up page
      if (page) {
        try {
          await page.close();
        } catch (error) {
          logger.warn('Failed to close page', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }
  }

  /**
   * Render multiple pages in parallel
   */
  async renderPages(
    urls: string[], 
    options: PlaywrightRenderOptions = {},
    concurrency: number = 3
  ): Promise<{ results: PlaywrightRenderResult[]; errors: PlaywrightRenderError[] }> {
    const results: PlaywrightRenderResult[] = [];
    const errors: PlaywrightRenderError[] = [];
    
    // Process in batches to manage resource usage
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url) => {
        try {
          const result = await this.renderPage(url, options);
          results.push(result);
        } catch (error) {
          errors.push(error as PlaywrightRenderError);
        }
      });

      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to prevent overwhelming
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { results, errors };
  }

  /**
   * Check if page requires JavaScript rendering
   */
  async requiresJavaScript(url: string): Promise<boolean> {
    try {
      // Quick check: render with and without JS, compare content
      const [withJS, withoutJS] = await Promise.all([
        this.renderPage(url, { javascriptEnabled: true, waitTimeout: 5000 }),
        this.renderPage(url, { javascriptEnabled: false, waitTimeout: 5000 })
      ]);

      const jsContentLength = withJS.html.length;
      const staticContentLength = withoutJS.html.length;
      
      // If JS version is significantly larger, JS is likely required
      const jsRequired = jsContentLength > staticContentLength * 1.2;
      
      logger.debug('JavaScript requirement check', {
        url,
        jsRequired,
        jsContentLength,
        staticContentLength
      });

      return jsRequired;

    } catch (error) {
      logger.warn('JavaScript requirement check failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Assume JS is required if we can't determine
      return true;
    }
  }

  /**
   * Get browser health status
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      if (!this.isInitialized || !this.browser) {
        return {
          healthy: false,
          details: { status: 'not_initialized' }
        };
      }

      const isConnected = this.browser.isConnected();
      
      return {
        healthy: isConnected,
        details: {
          status: isConnected ? 'connected' : 'disconnected',
          contexts: this.context ? 1 : 0,
          initialized: this.isInitialized
        }
      };

    } catch (error) {
      return {
        healthy: false,
        details: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Clean shutdown
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Playwright adapter');

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.isInitialized = false;
      logger.info('Playwright adapter shutdown complete');

    } catch (error) {
      logger.error('Error during Playwright shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Classify error types for better handling
   */
  private classifyError(error: any): 'timeout' | 'navigation' | 'javascript' | 'network' | 'unknown' {
    const message = error?.message?.toLowerCase() || '';
    
    if (message.includes('timeout')) {return 'timeout';}
    if (message.includes('navigation') || message.includes('navigate')) {return 'navigation';}
    if (message.includes('javascript') || message.includes('script')) {return 'javascript';}
    if (message.includes('network') || message.includes('connection')) {return 'network';}
    
    return 'unknown';
  }
}

/**
 * Factory function for creating Playwright adapter instances
 */
export function createPlaywrightAdapter(): PlaywrightAdapter {
  return new PlaywrightAdapter();
}

/**
 * Default Playwright adapter instance
 */
export const playwrightAdapter = createPlaywrightAdapter();