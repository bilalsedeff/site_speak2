/**
 * Analytics Reports Service - Query builders, rollups, and SLA metrics
 * 
 * Provides programmatic report builders over analytics data for product, ops, 
 * and SLA dashboards with sub-second aggregates and materialized rollups.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../telemetry/logger.js';
import { metrics } from '../telemetry/metrics.js';

/**
 * Time grain types for aggregation
 */
export type TimeGrain = '1m' | '5m' | '1h' | '1d';

/**
 * Query interfaces
 */
export interface SeriesQuery {
  tenantId: string;
  siteId?: string;
  metric: string;
  from: string; // RFC 3339
  to: string;   // RFC 3339
  grain: TimeGrain;
  filters?: Record<string, string | number | boolean>;
}

export interface TimeseriesPoint {
  t: string; // RFC 3339 timestamp
  value: number;
  labels?: Record<string, string>;
}

export interface FunnelStep {
  step: string;
  count: number;
  rate: number; // Conversion rate from previous step (0-1)
}

export interface TopNResult {
  key: string;
  value: number;
  percentage: number;
}

/**
 * Input validation schemas
 */
const SeriesQuerySchema = z.object({
  tenantId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  metric: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  grain: z.enum(['1m', '5m', '1h', '1d']),
  filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const FunnelQuerySchema = z.object({
  tenantId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  steps: z.array(z.string()).min(2).max(10),
  from: z.string().datetime(),
  to: z.string().datetime(),
  timeoutHours: z.number().positive().max(168).default(24), // Max 1 week
});

const TopNQuerySchema = z.object({
  tenantId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  metric: z.enum(['tools', 'errors', 'queries', 'pages', 'referrers']),
  n: z.number().int().min(1).max(100).default(10),
  from: z.string().datetime(),
  to: z.string().datetime(),
  filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/**
 * Available metrics for reporting
 */
const AVAILABLE_METRICS = {
  // Voice UX SLAs
  'voice.first_response_ms.p50': 'Voice first response time (median)',
  'voice.first_response_ms.p95': 'Voice first response time (95th percentile)', 
  'voice.first_response_ms.p99': 'Voice first response time (99th percentile)',
  'voice.barge_in_count': 'Voice barge-in occurrences',
  'voice.barge_in_to_pause_ms.avg': 'Average barge-in to pause time',
  'voice.asr_partial_latency_ms.p95': 'ASR partial recognition latency (95th percentile)',
  
  // AI Tool Execution
  'ai.tool_calls.count': 'Total AI tool calls',
  'ai.tool_calls.success_rate': 'AI tool call success rate (0-1)',
  'ai.tool_calls.error_rate': 'AI tool call error rate (0-1)',
  'ai.navigation_optimism_rate': 'Navigation optimism success rate (0-1)',
  'ai.tool_chain_length.avg': 'Average tool chain length per task',
  
  // Knowledge Base Effectiveness  
  'kb.hit_rate': 'Knowledge base hit rate (0-1)',
  'kb.search_latency_ms.p95': 'KB search latency (95th percentile)',
  'kb.relevance_score.avg': 'Average relevance score',
  
  // Commerce/Booking Funnels
  'commerce.conversion_rate': 'Commerce conversion rate (0-1)',
  'commerce.cart_abandonment_rate': 'Cart abandonment rate (0-1)',
  'booking.hold_to_confirm_rate': 'Booking hold to confirmation rate (0-1)',
  
  // System Health
  'system.error_rate': 'System error rate (0-1)',
  'system.response_time_ms.p95': 'System response time (95th percentile)',
  'system.queue_lag_ms.avg': 'Average queue processing lag',
} as const;

/**
 * Analytics reports service
 */
export class AnalyticsReportsService {
  private reportsLogger = logger;

  /**
   * Get time series data for a metric
   */
  async getTimeseries(query: SeriesQuery): Promise<TimeseriesPoint[]> {
    const startTime = Date.now();
    
    try {
      this.reportsLogger.debug('Executing timeseries query', {
        tenantId: query.tenantId,
        metric: query.metric,
        grain: query.grain,
        from: query.from,
        to: query.to
      });

      // Validate metric exists
      if (!(query.metric in AVAILABLE_METRICS)) {
        throw new Error(`Unknown metric: ${query.metric}`);
      }

      // Generate time buckets
      const timePoints = this.generateTimeBuckets(
        new Date(query.from), 
        new Date(query.to), 
        query.grain
      );

      // Execute query based on metric type
      const data = await this.executeTimeseriesQuery(query, timePoints);

      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'timeseries',
        metric: query.metric,
        grain: query.grain
      });

      this.reportsLogger.debug('Timeseries query completed', {
        tenantId: query.tenantId,
        metric: query.metric,
        points: data.length,
        duration
      });

      return data;

    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'timeseries',
        status: 'error'
      });

      this.reportsLogger.error('Timeseries query failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query
      });
      throw error;
    }
  }

  /**
   * Get funnel analysis data
   */
  async getFunnel(
    tenantId: string, 
    steps: string[], 
    from: string, 
    to: string,
    siteId?: string,
    timeoutHours: number = 24
  ): Promise<FunnelStep[]> {
    const startTime = Date.now();
    
    try {
      this.reportsLogger.debug('Executing funnel query', {
        tenantId,
        siteId,
        steps: steps.length,
        from,
        to,
        timeoutHours
      });

      // Execute funnel analysis
      const funnelData = await this.executeFunnelQuery(
        tenantId, 
        siteId, 
        steps, 
        from, 
        to, 
        timeoutHours
      );

      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'funnel',
        steps: steps.length.toString()
      });

      this.reportsLogger.debug('Funnel query completed', {
        tenantId,
        steps: funnelData.length,
        duration
      });

      return funnelData;

    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'funnel',
        status: 'error'
      });

      this.reportsLogger.error('Funnel query failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId,
        steps: steps.length
      });
      throw error;
    }
  }

  /**
   * Get top N results for a dimension
   */
  async getTopN(
    tenantId: string, 
    metric: 'tools' | 'errors' | 'queries' | 'pages' | 'referrers',
    n: number, 
    from: string, 
    to: string,
    siteId?: string,
    filters?: Record<string, string | number | boolean>
  ): Promise<TopNResult[]> {
    const startTime = Date.now();
    
    try {
      this.reportsLogger.debug('Executing topN query', {
        tenantId,
        siteId,
        metric,
        n,
        from,
        to
      });

      const topNData = await this.executeTopNQuery(
        tenantId, 
        siteId, 
        metric, 
        n, 
        from, 
        to, 
        filters
      );

      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'topn',
        metric
      });

      this.reportsLogger.debug('TopN query completed', {
        tenantId,
        metric,
        results: topNData.length,
        duration
      });

      return topNData;

    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.dbQueryDuration.observe(duration, { 
        operation: 'topn',
        status: 'error'
      });

      this.reportsLogger.error('TopN query failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tenantId,
        metric
      });
      throw error;
    }
  }

  /**
   * Generate time buckets for a time range and grain
   */
  private generateTimeBuckets(from: Date, to: Date, grain: TimeGrain): Date[] {
    const buckets: Date[] = [];
    const current = new Date(from);
    
    const grainMs = this.getGrainMilliseconds(grain);
    
    // Round down to grain boundary
    current.setTime(Math.floor(current.getTime() / grainMs) * grainMs);
    
    while (current <= to) {
      buckets.push(new Date(current));
      current.setTime(current.getTime() + grainMs);
    }
    
    return buckets;
  }

  /**
   * Get milliseconds for a time grain
   */
  private getGrainMilliseconds(grain: TimeGrain): number {
    switch (grain) {
      case '1m': return 60 * 1000;
      case '5m': return 5 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      default: throw new Error(`Invalid time grain: ${grain}`);
    }
  }

  /**
   * Execute timeseries query (mock implementation)
   */
  private async executeTimeseriesQuery(
    query: SeriesQuery, 
    timePoints: Date[]
  ): Promise<TimeseriesPoint[]> {
    // In a real implementation, this would query the analytics database
    // For different metrics, we'd have different query logic
    
    const mockData: TimeseriesPoint[] = timePoints.map(point => ({
      t: point.toISOString(),
      value: this.generateMockMetricValue(query.metric, point),
    }));

    // Simulate database latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

    return mockData;
  }

  /**
   * Execute funnel query (mock implementation)
   */
  private async executeFunnelQuery(
    _tenantId: string,
    _siteId: string | undefined,
    steps: string[],
    _from: string,
    _to: string,
    _timeoutHours: number
  ): Promise<FunnelStep[]> {
    // Mock funnel data - in reality this would be complex SQL
    // joining user sessions and tracking event sequences
    
    let currentCount = 1000; // Starting cohort size
    const funnelData: FunnelStep[] = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const dropoffRate = 0.1 + (i * 0.15); // Increasing dropoff per step
      const nextCount = Math.floor(currentCount * (1 - dropoffRate));
      const rate = i === 0 ? 1.0 : nextCount / (funnelData[i - 1]?.count || currentCount);
      
      funnelData.push({
        step: step || `Step ${i + 1}`,
        count: currentCount,
        rate
      });
      
      currentCount = nextCount;
    }

    // Simulate database latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    return funnelData;
  }

  /**
   * Execute topN query (mock implementation)
   */
  private async executeTopNQuery(
    _tenantId: string,
    _siteId: string | undefined,
    metric: string,
    n: number,
    _from: string,
    _to: string,
    _filters?: Record<string, string | number | boolean>
  ): Promise<TopNResult[]> {
    // Mock implementation - would query appropriate tables based on metric
    
    const mockData = this.generateMockTopNData(metric, n);
    
    // Simulate database latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 75));

    return mockData;
  }

  /**
   * Generate mock metric values for development
   */
  private generateMockMetricValue(metric: string, timestamp: Date): number {
    const hour = timestamp.getHours();
    const baseValue = Math.sin(hour / 24 * 2 * Math.PI) * 0.3 + 0.7; // Daily pattern
    const noise = (Math.random() - 0.5) * 0.2;
    
    switch (metric) {
      case 'voice.first_response_ms.p95':
        return Math.max(100, (baseValue + noise) * 500);
      case 'ai.tool_calls.success_rate':
        return Math.min(1, Math.max(0, baseValue + noise * 0.1));
      case 'kb.hit_rate':
        return Math.min(1, Math.max(0, baseValue * 0.8 + noise * 0.1));
      case 'system.error_rate':
        return Math.max(0, (1 - baseValue) * 0.05 + Math.abs(noise) * 0.01);
      default:
        return baseValue * 100 + noise * 20;
    }
  }

  /**
   * Generate mock TopN data for development
   */
  private generateMockTopNData(metric: string, n: number): TopNResult[] {
    const mockKeys = {
      tools: ['navigation.goto', 'search.siteSearch', 'forms.fillField', 'commerce.addToCart', 'booking.searchSlots'],
      errors: ['validation_error', 'network_timeout', 'auth_failed', 'rate_limit', 'service_unavailable'],
      queries: ['how to book', 'product pricing', 'contact information', 'opening hours', 'refund policy'],
      pages: ['/home', '/products', '/contact', '/booking', '/about'],
      referrers: ['google.com', 'facebook.com', 'direct', 'twitter.com', 'linkedin.com'],
    };

    const keys = mockKeys[metric as keyof typeof mockKeys] || ['unknown'];
    const results: TopNResult[] = [];
    const total = 1000;
    let remaining = total;

    for (let i = 0; i < Math.min(n, keys.length); i++) {
      const value = Math.floor(remaining * (0.3 + Math.random() * 0.4));
      results.push({
        key: keys[i] || `Item ${i + 1}`,
        value,
        percentage: value / total
      });
      remaining -= value;
    }

    return results.sort((a, b) => b.value - a.value);
  }

  /**
   * Get available metrics
   */
  getAvailableMetrics(): Record<string, string> {
    return { ...AVAILABLE_METRICS };
  }
}

/**
 * Singleton service instance
 */
export const analyticsReportsService = new AnalyticsReportsService();

/**
 * Express route handlers
 */
export const reportsHandlers = {
  timeseries: async (req: Request, res: Response) => {
    try {
      const query = SeriesQuerySchema.parse(req.body) as SeriesQuery;
      const data = await analyticsReportsService.getTimeseries(query);
      
      res.status(200).json({
        success: true,
        data: data,
        meta: {
          metric: query.metric,
          grain: query.grain,
          from: query.from,
          to: query.to,
          points: data.length
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Timeseries query failed',
        message
      });
    }
  },

  funnel: async (req: Request, res: Response) => {
    try {
      const query = FunnelQuerySchema.parse(req.body);
      const data = await analyticsReportsService.getFunnel(
        query.tenantId,
        query.steps,
        query.from,
        query.to,
        query.siteId,
        query.timeoutHours
      );
      
      res.status(200).json({
        success: true,
        data: data,
        meta: {
          steps: query.steps.length,
          from: query.from,
          to: query.to,
          overall_conversion: data.length > 0 ? (data[data.length - 1]?.count || 0) / (data[0]?.count || 1) : 0
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'Funnel query failed',
        message
      });
    }
  },

  topn: async (req: Request, res: Response) => {
    try {
      const query = TopNQuerySchema.parse(req.body);
      const data = await analyticsReportsService.getTopN(
        query.tenantId,
        query.metric,
        query.n,
        query.from,
        query.to,
        query.siteId,
        query.filters
      );
      
      res.status(200).json({
        success: true,
        data: data,
        meta: {
          metric: query.metric,
          from: query.from,
          to: query.to,
          results: data.length
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        error: 'TopN query failed',
        message
      });
    }
  },

  metrics: (_req: Request, res: Response) => {
    const metrics = analyticsReportsService.getAvailableMetrics();
    res.status(200).json({
      success: true,
      data: metrics,
      count: Object.keys(metrics).length
    });
  }
};