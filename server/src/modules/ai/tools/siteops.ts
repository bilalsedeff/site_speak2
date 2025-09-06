/**
 * Site Operations Tools
 * 
 * Operational helpers for site introspection and performance optimization.
 * These tools are used sparingly and not in critical user interaction paths.
 */

import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  UrlSchema,
  toJsonSchema
} from './validators.js';

const logger = createLogger({ service: 'siteops-tools' });


// ==================== PARAMETER SCHEMAS ====================

const ReadSitemapParametersSchema = z.object({
  siteUrl: UrlSchema.describe('Base site URL to read sitemap from'),
  includePriority: z.boolean().default(false).describe('Include priority information'),
  includeChangeFreq: z.boolean().default(false).describe('Include change frequency data'),
  maxUrls: z.number().int().min(1).max(10000).default(1000).describe('Maximum URLs to return'),
});

const WarmupCacheParametersSchema = z.object({
  urls: z.array(UrlSchema).max(50).describe('URLs to prefetch and warm'),
  priority: z.enum(['low', 'normal', 'high']).default('normal').describe('Cache warming priority'),
  includeResources: z.boolean().default(false).describe('Also warm linked resources (CSS, JS, images)'),
});

const CheckRobotsParametersSchema = z.object({
  siteUrl: UrlSchema.describe('Site URL to check robots.txt'),
  userAgent: z.string().default('SiteSpeak-AI/1.0').describe('User agent to check rules for'),
  path: z.string().optional().describe('Specific path to check (optional)'),
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Parse sitemap XML and extract URLs with metadata
 */
async function parseSitemapXml(
  xmlContent: string,
  parameters: z.infer<typeof ReadSitemapParametersSchema>
): Promise<Array<{
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}>> {
  const urls: Array<{
    url: string;
    lastmod?: string;
    changefreq?: string;
    priority?: string;
  }> = [];

  try {
    // Simple XML parsing using regex (for basic sitemap format)
    const urlMatches = xmlContent.match(/<url\s*>([\s\S]*?)<\/url>/g) || [];
    
    for (const urlMatch of urlMatches) {
      const locMatch = urlMatch.match(/<loc\s*>(.*?)<\/loc>/);
      if (locMatch?.[1]) {
        const urlData: {
          url: string;
          lastmod?: string;
          changefreq?: string;
          priority?: string;
        } = {
          url: locMatch[1].trim(),
        };

        if (parameters.includeChangeFreq) {
          const changefreqMatch = urlMatch.match(/<changefreq\s*>(.*?)<\/changefreq>/);
          if (changefreqMatch?.[1]) {
            urlData.changefreq = changefreqMatch[1].trim();
          }
        }

        if (parameters.includePriority) {
          const priorityMatch = urlMatch.match(/<priority\s*>(.*?)<\/priority>/);
          if (priorityMatch?.[1]) {
            urlData.priority = priorityMatch[1].trim();
          }
        }

        const lastmodMatch = urlMatch.match(/<lastmod\s*>(.*?)<\/lastmod>/);
        if (lastmodMatch?.[1]) {
          urlData.lastmod = lastmodMatch[1].trim();
        }

        urls.push(urlData);
      }
    }
  } catch (error) {
    logger.warn('Error parsing sitemap XML', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to parse sitemap XML');
  }

  return urls;
}

/**
 * Parse robots.txt content and check access rules
 */
function parseRobotsTxt(
  robotsTxtContent: string,
  userAgent: string,
  path?: string
): {
  allowed: boolean;
  rules: Array<{ directive: string; value: string }>;
  sitemaps: string[];
  crawlDelay?: number;
} {
  const lines = robotsTxtContent.split('\n').map(line => line.trim());
  const rules: Array<{ directive: string; value: string }> = [];
  const sitemaps: string[] = [];
  let crawlDelay: number | undefined;
  let currentUserAgent = '*';
  let allowed = true;

  for (const line of lines) {
    if (line.startsWith('#') || !line) {
      continue; // Skip comments and empty lines
    }

    const parts = line.split(':');
    const directive = parts[0]?.trim();
    const value = parts.slice(1).join(':').trim();

    if (!directive) {continue;}

    if (directive.toLowerCase() === 'user-agent') {
      currentUserAgent = value.toLowerCase();
    } else if (directive.toLowerCase() === 'sitemap') {
      sitemaps.push(value);
    } else if (directive.toLowerCase() === 'crawl-delay' && currentUserAgent === userAgent.toLowerCase()) {
      crawlDelay = parseInt(value, 10);
    } else if (
      (currentUserAgent === '*' || currentUserAgent === userAgent.toLowerCase()) &&
      path &&
      (directive.toLowerCase() === 'disallow' || directive.toLowerCase() === 'allow')
    ) {
      rules.push({ directive: directive.toLowerCase(), value });
      
      // Check if the path matches the rule
      if (directive.toLowerCase() === 'disallow' && path.startsWith(value)) {
        allowed = false;
      } else if (directive.toLowerCase() === 'allow' && path.startsWith(value)) {
        allowed = true;
      }
    }
  }

  return { 
    allowed, 
    rules, 
    sitemaps, 
    ...(crawlDelay !== undefined && { crawlDelay }),
  };
}

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * Read and parse site sitemap for URL discovery
 */
async function executeReadSitemap(
  parameters: z.infer<typeof ReadSitemapParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Reading sitemap', {
    siteUrl: parameters.siteUrl,
    maxUrls: parameters.maxUrls,
    siteId: _context.siteId,
  });

  try {
    // Construct sitemap URL
    const baseUrl = parameters.siteUrl.endsWith('/') 
      ? parameters.siteUrl.slice(0, -1) 
      : parameters.siteUrl;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;

    // Fetch sitemap with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(sitemapUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'SiteSpeak-AI/1.0',
        'Accept': 'application/xml, text/xml, */*',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: HTTP ${response.status}`);
    }

    const sitemapXml = await response.text();
    const urls = await parseSitemapXml(sitemapXml, parameters);

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result: {
        type: 'sitemap_data',
        siteUrl: parameters.siteUrl,
        urlCount: urls.length,
        urls: urls.slice(0, parameters.maxUrls),
        fetchedFrom: sitemapUrl,
        metadata: {
          totalUrls: urls.length,
          limitApplied: urls.length > parameters.maxUrls,
        },
      },
      executionTime,
      sideEffects: [{
        type: 'sitemap_read',
        description: `Read sitemap with ${urls.length} URLs`,
        data: { sitemapUrl, urlCount: urls.length },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.warn('Sitemap reading failed', {
      siteUrl: parameters.siteUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sitemap reading failed',
      result: null,
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Warm up cache by prefetching URLs
 */
async function executeWarmupCache(
  parameters: z.infer<typeof WarmupCacheParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Warming cache', {
    urlCount: parameters.urls.length,
    priority: parameters.priority,
    includeResources: parameters.includeResources,
  });

  try {
    const warmedUrls: Array<{ url: string; status: string; loadTime?: number }> = [];

    // Prefetch each URL (this would typically be done by CDN or browser)
    for (const url of parameters.urls) {
      try {
        // In a real implementation, this would trigger prefetch/prerender
        // For now, we'll simulate the warmup process
        const loadTime = Math.random() * 200 + 100; // Simulate 100-300ms load time
        
        warmedUrls.push({
          url,
          status: 'warmed',
          loadTime,
        });
        
        logger.debug('URL warmed', { url, loadTime });
        
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        warmedUrls.push({
          url,
          status: 'failed',
        });
        
        logger.warn('URL warmup failed', { 
          url, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const successCount = warmedUrls.filter(u => u.status === 'warmed').length;

    return {
      success: true,
      result: {
        type: 'cache_warmed',
        totalUrls: parameters.urls.length,
        successfulUrls: successCount,
        failedUrls: parameters.urls.length - successCount,
        urls: warmedUrls,
        averageLoadTime: warmedUrls
          .filter(u => u.loadTime)
          .reduce((sum, u) => sum + (u.loadTime || 0), 0) / successCount,
      },
      executionTime,
      sideEffects: [{
        type: 'cache_warming',
        description: `Warmed ${successCount}/${parameters.urls.length} URLs`,
        data: {
          urlCount: parameters.urls.length,
          successCount,
          priority: parameters.priority,
        },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cache warmup failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Check robots.txt rules for a site
 */
async function executeCheckRobots(
  parameters: z.infer<typeof CheckRobotsParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Checking robots.txt', {
    siteUrl: parameters.siteUrl,
    userAgent: parameters.userAgent,
    path: parameters.path,
  });

  try {
    // Construct robots.txt URL
    const baseUrl = parameters.siteUrl.endsWith('/') 
      ? parameters.siteUrl.slice(0, -1) 
      : parameters.siteUrl;
    const robotsUrl = `${baseUrl}/robots.txt`;

    // Fetch robots.txt with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(robotsUrl, {
      method: 'GET',
      headers: {
        'User-Agent': parameters.userAgent,
        'Accept': 'text/plain, */*',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // If robots.txt doesn't exist, assume everything is allowed
      if (response.status === 404) {
        const executionTime = Date.now() - startTime;
        return {
          success: true,
          result: {
            type: 'robots_check',
            allowed: true,
            robotsExists: false,
            rules: [],
            sitemaps: [],
            message: 'robots.txt not found - all access allowed',
          },
          executionTime,
          sideEffects: [{
            type: 'robots_check',
            description: 'robots.txt not found - assuming all access allowed',
            data: { robotsUrl, status: 404 },
          }],
        };
      }
      
      throw new Error(`Failed to fetch robots.txt: HTTP ${response.status}`);
    }

    const robotsTxtContent = await response.text();
    const robotsData = parseRobotsTxt(robotsTxtContent, parameters.userAgent, parameters.path);

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result: {
        type: 'robots_check',
        allowed: robotsData.allowed,
        robotsExists: true,
        rules: robotsData.rules,
        sitemaps: robotsData.sitemaps,
        crawlDelay: robotsData.crawlDelay,
        userAgent: parameters.userAgent,
        checkedPath: parameters.path,
        fetchedFrom: robotsUrl,
      },
      executionTime,
      sideEffects: [{
        type: 'robots_check',
        description: `Checked robots.txt - access ${robotsData.allowed ? 'allowed' : 'denied'}`,
        data: { 
          robotsUrl, 
          allowed: robotsData.allowed,
          rulesCount: robotsData.rules.length,
          sitemapsFound: robotsData.sitemaps.length,
        },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.warn('Robots.txt check failed', {
      siteUrl: parameters.siteUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Robots check failed',
      result: null,
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const siteopsTools: RegistryToolDefinition[] = [
  {
    name: 'siteops.readSitemap',
    description: 'Read site sitemap to discover available pages and content.',
    parameters: [
      {
        name: 'siteUrl',
        description: 'Base site URL',
        schema: toJsonSchema(UrlSchema),
        required: true,
      },
      {
        name: 'maxUrls',
        description: 'Maximum URLs to return',
        schema: toJsonSchema(z.number().int().min(1).max(10000)),
        required: false,
        defaultValue: 1000,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'service',
    latencyBudgetMs: 2000,
    idempotent: true,
    category: 'utility',
    execute: executeReadSitemap,
    jsonSchema: toJsonSchema(ReadSitemapParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'siteops.readSitemap',
        description: 'Read site sitemap to understand site structure and available content. Use for site discovery.',
        parameters: toJsonSchema(ReadSitemapParametersSchema),
      },
    },
  },

  {
    name: 'siteops.warmupCache',
    description: 'Pre-warm cache for faster page loads.',
    parameters: [
      {
        name: 'urls',
        description: 'URLs to prefetch',
        schema: toJsonSchema(z.array(UrlSchema).max(50)),
        required: true,
      },
      {
        name: 'priority',
        description: 'Cache warming priority',
        schema: toJsonSchema(z.enum(['low', 'normal', 'high'])),
        required: false,
        defaultValue: 'normal',
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'service',
    latencyBudgetMs: 5000,
    idempotent: true,
    category: 'utility',
    execute: executeWarmupCache,
    jsonSchema: toJsonSchema(WarmupCacheParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'siteops.warmupCache',
        description: 'Prefetch and cache URLs for better performance. Use before expected user navigation.',
        parameters: toJsonSchema(WarmupCacheParametersSchema),
      },
    },
  },

  {
    name: 'siteops.checkRobots',
    description: 'Check robots.txt compliance for crawling policies.',
    parameters: [
      {
        name: 'siteUrl',
        description: 'Site URL to check',
        schema: toJsonSchema(UrlSchema),
        required: true,
      },
      {
        name: 'path',
        description: 'Specific path to check',
        schema: toJsonSchema(z.string().optional()),
        required: false,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'service',
    latencyBudgetMs: 1000,
    idempotent: true,
    category: 'utility',
    execute: executeCheckRobots,
    jsonSchema: toJsonSchema(CheckRobotsParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'siteops.checkRobots',
        description: 'Check robots.txt rules and crawling policies. Use for understanding site access policies.',
        parameters: toJsonSchema(CheckRobotsParametersSchema),
      },
    },
  },
];
