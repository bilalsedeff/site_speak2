import { z } from 'zod';

/**
 * Crawl Session Domain Entity
 * 
 * Manages the lifecycle and state of a crawling session including
 * progress tracking, error handling, and performance metrics.
 */
export class CrawlSession {
  constructor(
    public readonly id: string,
    public readonly knowledgeBaseId: string,
    public readonly tenantId: string,
    public readonly siteId: string,
    public readonly sessionType: SessionType,
    public readonly configuration: CrawlConfiguration,
    public readonly progress: CrawlProgress,
    public readonly performance: PerformanceMetrics,
    public readonly status: CrawlStatus,
    public readonly errors: CrawlError[],
    public readonly startedAt: Date,
    public readonly completedAt?: Date
  ) {}

  /**
   * Start the crawl session
   */
  start(seedUrls: string[]): CrawlSession {
    if (this.status !== 'pending') {
      throw new Error(`Cannot start session in status: ${this.status}`);
    }

    return new CrawlSession(
      this.id,
      this.knowledgeBaseId,
      this.tenantId,
      this.siteId,
      this.sessionType,
      { ...this.configuration, seedUrls },
      {
        ...this.progress,
        status: 'discovering',
        startedAt: new Date()
      },
      this.performance,
      'running',
      this.errors,
      new Date()
    );
  }

  /**
   * Update crawl progress
   */
  updateProgress(updates: Partial<CrawlProgress>): CrawlSession {
    const newProgress = { ...this.progress, ...updates };
    
    // Automatically calculate percentage
    if (newProgress.totalUrls > 0) {
      newProgress.progressPercentage = Math.floor(
        (newProgress.processedUrls / newProgress.totalUrls) * 100
      );
    }

    return new CrawlSession(
      this.id,
      this.knowledgeBaseId,
      this.tenantId,
      this.siteId,
      this.sessionType,
      this.configuration,
      newProgress,
      this.performance,
      this.status,
      this.errors,
      this.startedAt,
      this.completedAt
    );
  }

  /**
   * Record an error
   */
  recordError(error: Omit<CrawlError, 'timestamp'>): CrawlSession {
    const newError: CrawlError = {
      ...error,
      timestamp: new Date()
    };

    const newErrors = [...this.errors, newError];
    
    // Determine if this should fail the session
    const criticalErrors = newErrors.filter(e => e.severity === 'critical').length;
    const shouldFail = criticalErrors > 0 || newErrors.length > this.configuration.maxErrors;

    return new CrawlSession(
      this.id,
      this.knowledgeBaseId,
      this.tenantId,
      this.siteId,
      this.sessionType,
      this.configuration,
      this.progress,
      this.performance,
      shouldFail ? 'failed' : this.status,
      newErrors,
      this.startedAt,
      shouldFail ? new Date() : this.completedAt
    );
  }

  /**
   * Complete the session successfully
   */
  complete(finalStats: Partial<CrawlProgress>): CrawlSession {
    if (this.status !== 'running') {
      throw new Error(`Cannot complete session in status: ${this.status}`);
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - this.startedAt.getTime();

    return new CrawlSession(
      this.id,
      this.knowledgeBaseId,
      this.tenantId,
      this.siteId,
      this.sessionType,
      this.configuration,
      {
        ...this.progress,
        ...finalStats,
        status: 'completed',
        progressPercentage: 100
      },
      {
        ...this.performance,
        totalDuration: duration,
        avgPageProcessingTime: duration / (finalStats.processedUrls || this.progress.processedUrls)
      },
      'completed',
      this.errors,
      this.startedAt,
      completedAt
    );
  }

  /**
   * Cancel the session
   */
  cancel(reason: string): CrawlSession {
    return new CrawlSession(
      this.id,
      this.knowledgeBaseId,
      this.tenantId,
      this.siteId,
      this.sessionType,
      this.configuration,
      {
        ...this.progress,
        status: 'cancelled'
      },
      this.performance,
      'cancelled',
      [...this.errors, {
        type: 'cancellation',
        message: reason,
        severity: 'info',
        timestamp: new Date()
      }],
      this.startedAt,
      new Date()
    );
  }

  /**
   * Get session statistics
   */
  getStatistics(): SessionStatistics {
    const duration = (this.completedAt || new Date()).getTime() - this.startedAt.getTime();
    
    return {
      sessionId: this.id,
      status: this.status,
      sessionType: this.sessionType,
      duration,
      progressPercentage: this.progress.progressPercentage,
      urlsDiscovered: this.progress.totalUrls,
      urlsProcessed: this.progress.processedUrls,
      urlsFailed: this.progress.failedUrls,
      chunksCreated: this.progress.chunksCreated,
      chunksUpdated: this.progress.chunksUpdated,
      errorCount: this.errors.length,
      criticalErrors: this.errors.filter(e => e.severity === 'critical').length,
      avgPageTime: this.performance.avgPageProcessingTime,
      pagesPerMinute: this.calculatePagesPerMinute(),
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }

  /**
   * Check if session is completed (success or failure)
   */
  isCompleted(): boolean {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  /**
   * Check if session needs intervention
   */
  needsIntervention(): boolean {
    const criticalErrors = this.errors.filter(e => e.severity === 'critical').length;
    const errorRate = this.progress.processedUrls > 0 
      ? this.progress.failedUrls / this.progress.processedUrls 
      : 0;
    
    return criticalErrors > 0 || errorRate > 0.5;
  }

  /**
   * Calculate pages per minute processing rate
   */
  private calculatePagesPerMinute(): number {
    const duration = (this.completedAt || new Date()).getTime() - this.startedAt.getTime();
    const minutes = duration / (1000 * 60);
    return minutes > 0 ? this.progress.processedUrls / minutes : 0;
  }
}

/**
 * Session type enumeration
 */
export type SessionType = 'full' | 'delta' | 'manual' | 'scheduled';

/**
 * Session status enumeration  
 */
export type CrawlStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Crawl configuration
 */
export interface CrawlConfiguration {
  seedUrls: string[];
  maxDepth: number;
  maxPages: number;
  maxErrors: number;
  respectRobots: boolean;
  followSitemaps: boolean;
  concurrency: number;
  delays: {
    betweenRequests: number;
    betweenPages: number;
  };
  userAgent: string;
  allowedDomains: string[];
  blockedPatterns: string[];
  extractionConfig: {
    enableJsonLd: boolean;
    enableActions: boolean;
    enableForms: boolean;
    embeddingModel: string;
  };
}

/**
 * Crawl progress tracking
 */
export interface CrawlProgress {
  status: 'discovering' | 'crawling' | 'processing' | 'indexing' | 'completed' | 'cancelled';
  totalUrls: number;
  processedUrls: number;
  failedUrls: number;
  skippedUrls: number;
  progressPercentage: number;
  currentUrl?: string;
  chunksCreated: number;
  chunksUpdated: number;
  entitiesExtracted: number;
  actionsFound: number;
  formsFound: number;
  startedAt?: Date;
  lastUpdateAt?: Date;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalDuration?: number;
  avgPageProcessingTime?: number;
  peakMemoryUsage?: number;
  networkRequests: number;
  cacheHits: number;
  cacheMisses: number;
  bytesDownloaded: number;
  bytesUploaded: number;
  embeddingsGenerated: number;
}

/**
 * Crawl error tracking
 */
export interface CrawlError {
  type: 'network' | 'parsing' | 'validation' | 'extraction' | 'storage' | 'timeout' | 'cancellation';
  message: string;
  url?: string;
  statusCode?: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
  timestamp: Date;
}

/**
 * Session statistics summary
 */
export interface SessionStatistics {
  sessionId: string;
  status: CrawlStatus;
  sessionType: SessionType;
  duration: number;
  progressPercentage: number;
  urlsDiscovered: number;
  urlsProcessed: number;
  urlsFailed: number;
  chunksCreated: number;
  chunksUpdated: number;
  errorCount: number;
  criticalErrors: number;
  avgPageTime?: number;
  pagesPerMinute: number;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Validation schemas
 */
export const CrawlConfigurationSchema = z.object({
  seedUrls: z.array(z.string().url()),
  maxDepth: z.number().int().min(1).max(10),
  maxPages: z.number().int().min(1).max(10000),
  maxErrors: z.number().int().min(1).max(1000),
  respectRobots: z.boolean(),
  followSitemaps: z.boolean(),
  concurrency: z.number().int().min(1).max(10),
  delays: z.object({
    betweenRequests: z.number().min(100),
    betweenPages: z.number().min(500)
  }),
  userAgent: z.string().min(1),
  allowedDomains: z.array(z.string()),
  blockedPatterns: z.array(z.string()),
  extractionConfig: z.object({
    enableJsonLd: z.boolean(),
    enableActions: z.boolean(),
    enableForms: z.boolean(),
    embeddingModel: z.string()
  })
});

export const CrawlProgressSchema = z.object({
  status: z.enum(['discovering', 'crawling', 'processing', 'indexing', 'completed', 'cancelled']),
  totalUrls: z.number().int().min(0),
  processedUrls: z.number().int().min(0),
  failedUrls: z.number().int().min(0),
  skippedUrls: z.number().int().min(0),
  progressPercentage: z.number().min(0).max(100),
  currentUrl: z.string().url().optional(),
  chunksCreated: z.number().int().min(0),
  chunksUpdated: z.number().int().min(0),
  entitiesExtracted: z.number().int().min(0),
  actionsFound: z.number().int().min(0),
  formsFound: z.number().int().min(0),
  startedAt: z.date().optional(),
  lastUpdateAt: z.date().optional()
});

/**
 * Factory function for creating crawl sessions
 */
export function createCrawlSession(
  knowledgeBaseId: string,
  tenantId: string,
  siteId: string,
  sessionType: SessionType,
  config: Partial<CrawlConfiguration>
): CrawlSession {
  const defaultConfig: CrawlConfiguration = {
    seedUrls: [],
    maxDepth: 3,
    maxPages: 1000,
    maxErrors: 100,
    respectRobots: true,
    followSitemaps: true,
    concurrency: 2,
    delays: {
      betweenRequests: 1000,
      betweenPages: 2000
    },
    userAgent: 'SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/crawler)',
    allowedDomains: [],
    blockedPatterns: [],
    extractionConfig: {
      enableJsonLd: true,
      enableActions: true,
      enableForms: true,
      embeddingModel: 'text-embedding-3-small'
    }
  };

  return new CrawlSession(
    crypto.randomUUID(),
    knowledgeBaseId,
    tenantId,
    siteId,
    sessionType,
    { ...defaultConfig, ...config },
    {
      status: 'discovering',
      totalUrls: 0,
      processedUrls: 0,
      failedUrls: 0,
      skippedUrls: 0,
      progressPercentage: 0,
      chunksCreated: 0,
      chunksUpdated: 0,
      entitiesExtracted: 0,
      actionsFound: 0,
      formsFound: 0
    },
    {
      networkRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      bytesDownloaded: 0,
      bytesUploaded: 0,
      embeddingsGenerated: 0
    },
    'pending',
    [],
    new Date()
  );
}