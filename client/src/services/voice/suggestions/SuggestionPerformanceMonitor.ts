/**
 * Suggestion Performance Monitor
 *
 * Real-time performance monitoring and optimization service for the voice
 * suggestion system. Tracks response times, cache performance, user satisfaction,
 * and automatically applies optimizations to maintain <200ms target response time.
 *
 * Features:
 * - Real-time performance metrics tracking
 * - Automated performance optimization
 * - Alert system for performance degradation
 * - Historical trend analysis
 * - Resource usage monitoring
 * - Automatic fallback activation
 */

import {
  SuggestionSystemMetrics,
  PerformanceTrend,
  SuggestionSystemHealth,
  ServiceHealth,
  SystemAlert
} from '@shared/types/suggestion.types';

interface PerformanceThresholds {
  responseTime: {
    target: number;
    warning: number;
    critical: number;
  };
  cacheHitRate: {
    target: number;
    warning: number;
    critical: number;
  };
  errorRate: {
    target: number;
    warning: number;
    critical: number;
  };
  memoryUsage: {
    target: number;
    warning: number;
    critical: number;
  };
}

interface PerformanceAlert {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  message: string;
  resolved: boolean;
  actions: string[];
}

interface OptimizationAction {
  type: 'cache_cleanup' | 'reduce_quality' | 'enable_fallback' | 'batch_requests' | 'throttle_requests';
  description: string;
  expectedImpact: number;
  duration?: number;
}

export class SuggestionPerformanceMonitor {
  private metrics: SuggestionSystemMetrics;
  private thresholds: PerformanceThresholds;
  private alerts: PerformanceAlert[] = [];
  private trends: Map<string, PerformanceTrend[]> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isOptimizing = false;
  private performanceSamples: Map<string, number[]> = new Map();

  constructor(
    thresholds: Partial<PerformanceThresholds> = {},
    monitoringIntervalMs = 5000
  ) {
    this.thresholds = {
      responseTime: {
        target: 200,
        warning: 400,
        critical: 800,
        ...thresholds.responseTime
      },
      cacheHitRate: {
        target: 0.8,
        warning: 0.6,
        critical: 0.4,
        ...thresholds.cacheHitRate
      },
      errorRate: {
        target: 0.02,
        warning: 0.05,
        critical: 0.1,
        ...thresholds.errorRate
      },
      memoryUsage: {
        target: 50 * 1024 * 1024, // 50MB
        warning: 100 * 1024 * 1024, // 100MB
        critical: 200 * 1024 * 1024, // 200MB
        ...thresholds.memoryUsage
      }
    };

    this.metrics = {
      totalRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      cacheHitRate: 0,
      suggestionAccuracy: 0,
      userSatisfaction: 0,
      errorRate: 0,
      performanceTrends: []
    };

    // Start monitoring
    this.startMonitoring(monitoringIntervalMs);
  }

  /**
   * Record a performance sample
   */
  recordSample(metric: string, value: number, _context?: string): void {
    const samples = this.performanceSamples.get(metric) || [];
    samples.push(value);

    // Keep only recent samples (last 1000)
    if (samples.length > 1000) {
      samples.splice(0, samples.length - 1000);
    }

    this.performanceSamples.set(metric, samples);

    // Update metrics
    this.updateMetrics(metric, value);

    // Check for alerts
    this.checkForAlerts(metric, value);

    // Record trend
    this.recordTrend(metric, value);
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): SuggestionSystemMetrics {
    return { ...this.metrics };
  }

  /**
   * Get system health status
   */
  getSystemHealth(): SuggestionSystemHealth {
    const activeAlerts = this.alerts.filter(alert => !alert.resolved);
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical');
    const warningAlerts = activeAlerts.filter(alert => alert.severity === 'high' || alert.severity === 'medium');

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (criticalAlerts.length > 0) {
      status = 'unhealthy';
    } else if (warningAlerts.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const services: ServiceHealth[] = [
      {
        name: 'Context Discovery',
        status: this.getServiceStatus('context_discovery'),
        responseTime: this.getAverageResponseTime('context_discovery'),
        errorRate: this.getErrorRate('context_discovery')
      },
      {
        name: 'Suggestion Engine',
        status: this.getServiceStatus('suggestion_engine'),
        responseTime: this.getAverageResponseTime('suggestion_engine'),
        errorRate: this.getErrorRate('suggestion_engine')
      },
      {
        name: 'Auto Completion',
        status: this.getServiceStatus('auto_completion'),
        responseTime: this.getAverageResponseTime('auto_completion'),
        errorRate: this.getErrorRate('auto_completion')
      },
      {
        name: 'Cache Manager',
        status: this.getServiceStatus('cache_manager'),
        responseTime: this.getAverageResponseTime('cache_manager'),
        errorRate: this.getErrorRate('cache_manager')
      }
    ];

    const recommendations = this.generateRecommendations();

    return {
      status,
      lastCheck: new Date(),
      services,
      alerts: activeAlerts.map(alert => ({
        id: alert.id,
        type: this.getAlertType(alert.metric),
        severity: alert.severity,
        message: alert.message,
        timestamp: alert.timestamp,
        resolved: alert.resolved
      })),
      recommendations
    };
  }

  /**
   * Get performance trends for analysis
   */
  getTrends(metric: string, timeRange: number = 3600000): PerformanceTrend[] {
    const trends = this.trends.get(metric) || [];
    const cutoffTime = Date.now() - timeRange;

    return trends.filter(trend => trend.timestamp.getTime() > cutoffTime);
  }

  /**
   * Force optimization run
   */
  async optimize(): Promise<void> {
    if (this.isOptimizing) {return;}

    this.isOptimizing = true;

    try {
      const actions = this.identifyOptimizationActions();

      for (const action of actions) {
        await this.executeOptimizationAction(action);
      }

      console.log(`Executed ${actions.length} optimization actions`);
    } catch (error) {
      console.error('Optimization failed:', error);
    } finally {
      this.isOptimizing = false;
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
    }
  }

  /**
   * Clear all metrics and reset monitoring
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      cacheHitRate: 0,
      suggestionAccuracy: 0,
      userSatisfaction: 0,
      errorRate: 0,
      performanceTrends: []
    };

    this.alerts = [];
    this.trends.clear();
    this.performanceSamples.clear();
  }

  /**
   * Stop monitoring and cleanup
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // ======================= PRIVATE METHODS =======================

  private startMonitoring(intervalMs: number): void {
    this.monitoringInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, intervalMs);
  }

  private runMonitoringCycle(): void {
    // Calculate current metrics
    this.calculateCurrentMetrics();

    // Check system health
    const health = this.getSystemHealth();

    // Auto-optimize if needed
    if (health.status === 'degraded' || health.status === 'unhealthy') {
      if (!this.isOptimizing) {
        this.optimize();
      }
    }

    // Cleanup old data
    this.cleanupOldData();
  }

  private updateMetrics(metric: string, value: number): void {
    this.metrics.totalRequests++;

    switch (metric) {
      case 'response_time':
      case 'suggestion_generation_time':
      case 'auto_completion_time':
      case 'context_analysis_time':
        this.updateResponseTimeMetrics(value);
        break;

      case 'cache_hit':
        // Update cache hit rate
        break;

      case 'error':
        this.updateErrorRate();
        break;
    }
  }

  private updateResponseTimeMetrics(responseTime: number): void {
    // Update average response time
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;

    // Update P95 response time
    const allResponseTimes = this.performanceSamples.get('response_time') || [];
    if (allResponseTimes.length > 0) {
      const sorted = [...allResponseTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.metrics.p95ResponseTime = sorted[p95Index] || responseTime;
    }
  }

  private updateErrorRate(): void {
    const errorSamples = this.performanceSamples.get('error') || [];
    this.metrics.errorRate = errorSamples.length / Math.max(this.metrics.totalRequests, 1);
  }

  private calculateCurrentMetrics(): void {
    // Calculate cache hit rate
    const cacheHits = this.performanceSamples.get('cache_hit') || [];
    const cacheMisses = this.performanceSamples.get('cache_miss') || [];
    const totalCacheRequests = cacheHits.length + cacheMisses.length;

    if (totalCacheRequests > 0) {
      this.metrics.cacheHitRate = cacheHits.length / totalCacheRequests;
    }

    // Calculate suggestion accuracy
    const accuracySamples = this.performanceSamples.get('suggestion_accuracy') || [];
    if (accuracySamples.length > 0) {
      this.metrics.suggestionAccuracy =
        accuracySamples.reduce((sum, acc) => sum + acc, 0) / accuracySamples.length;
    }

    // Calculate user satisfaction
    const satisfactionSamples = this.performanceSamples.get('user_satisfaction') || [];
    if (satisfactionSamples.length > 0) {
      this.metrics.userSatisfaction =
        satisfactionSamples.reduce((sum, sat) => sum + sat, 0) / satisfactionSamples.length;
    }
  }

  private checkForAlerts(metric: string, value: number): void {
    let threshold: { target: number; warning: number; critical: number } | null = null;
    let alertMessage = '';

    switch (metric) {
      case 'response_time':
      case 'suggestion_generation_time':
      case 'auto_completion_time':
        threshold = this.thresholds.responseTime;
        alertMessage = `${metric} is ${value.toFixed(2)}ms`;
        break;

      case 'cache_hit_rate':
        threshold = this.thresholds.cacheHitRate;
        alertMessage = `Cache hit rate is ${(value * 100).toFixed(1)}%`;
        break;

      case 'error_rate':
        threshold = this.thresholds.errorRate;
        alertMessage = `Error rate is ${(value * 100).toFixed(1)}%`;
        break;

      case 'memory_usage':
        threshold = this.thresholds.memoryUsage;
        alertMessage = `Memory usage is ${(value / 1024 / 1024).toFixed(1)}MB`;
        break;
    }

    if (!threshold) {return;}

    let severity: PerformanceAlert['severity'] | null = null;
    let thresholdValue = 0;

    if (value >= threshold.critical) {
      severity = 'critical';
      thresholdValue = threshold.critical;
    } else if (value >= threshold.warning) {
      severity = 'high';
      thresholdValue = threshold.warning;
    } else if (value < threshold.target * 0.5 && metric === 'cache_hit_rate') {
      severity = 'medium';
      thresholdValue = threshold.target;
    }

    if (severity) {
      const existingAlert = this.alerts.find(
        alert => alert.metric === metric && !alert.resolved
      );

      if (!existingAlert) {
        this.createAlert(metric, value, thresholdValue, severity, alertMessage);
      }
    } else {
      // Resolve existing alerts for this metric
      this.alerts
        .filter(alert => alert.metric === metric && !alert.resolved)
        .forEach(alert => {
          alert.resolved = true;
        });
    }
  }

  private createAlert(
    metric: string,
    value: number,
    threshold: number,
    severity: PerformanceAlert['severity'],
    message: string
  ): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metric,
      value,
      threshold,
      severity,
      timestamp: new Date(),
      message,
      resolved: false,
      actions: this.generateAlertActions(metric, severity)
    };

    this.alerts.push(alert);

    // Limit alerts history
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-500);
    }

    console.warn(`Performance Alert [${severity.toUpperCase()}]: ${message}`);
  }

  private generateAlertActions(metric: string, severity: PerformanceAlert['severity']): string[] {
    const actions: string[] = [];

    switch (metric) {
      case 'response_time':
      case 'suggestion_generation_time':
        actions.push('Enable aggressive caching');
        actions.push('Reduce suggestion quality');
        if (severity === 'critical') {
          actions.push('Enable fallback mode');
        }
        break;

      case 'cache_hit_rate':
        actions.push('Analyze cache patterns');
        actions.push('Increase cache size');
        actions.push('Optimize cache key strategy');
        break;

      case 'error_rate':
        actions.push('Enable fallback strategies');
        actions.push('Reduce request complexity');
        actions.push('Investigate error patterns');
        break;

      case 'memory_usage':
        actions.push('Clear old cache entries');
        actions.push('Reduce cache size');
        actions.push('Enable compression');
        break;
    }

    return actions;
  }

  private recordTrend(metric: string, value: number): void {
    const trends = this.trends.get(metric) || [];

    trends.push({
      timestamp: new Date(),
      metric,
      value,
      target: this.getTargetForMetric(metric)
    });

    // Keep only recent trends (last 1000 for each metric)
    if (trends.length > 1000) {
      trends.splice(0, trends.length - 1000);
    }

    this.trends.set(metric, trends);
  }

  private getTargetForMetric(metric: string): number {
    // Return target values based on metric type
    switch (metric) {
      case 'responseTime':
        return this.thresholds.responseTime.warning;
      case 'errorRate':
        return this.thresholds.errorRate.warning;
      case 'cacheHitRate':
        return 0.8; // Target 80% cache hit rate
      case 'suggestionAccuracy':
        return 0.9; // Target 90% accuracy
      case 'userSatisfaction':
        return 0.85; // Target 85% satisfaction
      default:
        return 1.0; // Default target
    }
  }

  private getServiceStatus(serviceName: string): 'healthy' | 'degraded' | 'unhealthy' {
    const responseTime = this.getAverageResponseTime(serviceName);
    const errorRate = this.getErrorRate(serviceName);

    if (
      responseTime > this.thresholds.responseTime.critical ||
      errorRate > this.thresholds.errorRate.critical
    ) {
      return 'unhealthy';
    } else if (
      responseTime > this.thresholds.responseTime.warning ||
      errorRate > this.thresholds.errorRate.warning
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  private getAverageResponseTime(serviceName: string): number {
    const samples = this.performanceSamples.get(`${serviceName}_response_time`) || [];
    if (samples.length === 0) {return 0;}

    return samples.reduce((sum, time) => sum + time, 0) / samples.length;
  }

  private getErrorRate(serviceName: string): number {
    const errors = this.performanceSamples.get(`${serviceName}_error`) || [];
    const total = this.performanceSamples.get(`${serviceName}_total`) || [];

    if (total.length === 0) {return 0;}

    return errors.length / total.length;
  }

  private getAlertType(metric: string): SystemAlert['type'] {
    if (metric.includes('response_time') || metric.includes('latency')) {
      return 'performance';
    } else if (metric.includes('error')) {
      return 'error';
    } else if (metric.includes('memory') || metric.includes('cache')) {
      return 'capacity';
    }

    return 'degradation';
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const health = this.getSystemHealth();

    if (this.metrics.avgResponseTime > this.thresholds.responseTime.target) {
      recommendations.push('Consider enabling more aggressive caching');
      recommendations.push('Optimize suggestion generation algorithms');
    }

    if (this.metrics.cacheHitRate < this.thresholds.cacheHitRate.target) {
      recommendations.push('Review cache key strategy');
      recommendations.push('Increase cache TTL for stable content');
    }

    if (this.metrics.errorRate > this.thresholds.errorRate.target) {
      recommendations.push('Implement more robust error handling');
      recommendations.push('Add circuit breaker patterns');
    }

    const unhealthyServices = health.services.filter(s => s.status === 'unhealthy');
    if (unhealthyServices.length > 0) {
      recommendations.push(`Focus optimization on: ${unhealthyServices.map(s => s.name).join(', ')}`);
    }

    return recommendations;
  }

  private identifyOptimizationActions(): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    // Response time optimization
    if (this.metrics.avgResponseTime > this.thresholds.responseTime.warning) {
      actions.push({
        type: 'cache_cleanup',
        description: 'Clean up expired cache entries',
        expectedImpact: 0.15
      });

      if (this.metrics.avgResponseTime > this.thresholds.responseTime.critical) {
        actions.push({
          type: 'enable_fallback',
          description: 'Enable fallback mode for faster responses',
          expectedImpact: 0.4,
          duration: 300000 // 5 minutes
        });
      }
    }

    // Cache optimization
    if (this.metrics.cacheHitRate < this.thresholds.cacheHitRate.warning) {
      actions.push({
        type: 'batch_requests',
        description: 'Enable request batching to improve cache efficiency',
        expectedImpact: 0.2
      });
    }

    // Error rate optimization
    if (this.metrics.errorRate > this.thresholds.errorRate.warning) {
      actions.push({
        type: 'throttle_requests',
        description: 'Throttle requests to reduce error rate',
        expectedImpact: 0.3,
        duration: 600000 // 10 minutes
      });
    }

    return actions;
  }

  private async executeOptimizationAction(action: OptimizationAction): Promise<void> {
    console.log(`Executing optimization: ${action.description}`);

    switch (action.type) {
      case 'cache_cleanup':
        // Trigger cache cleanup
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('suggestion_cache_cleanup'));
        }
        break;

      case 'enable_fallback':
        // Enable fallback mode
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('suggestion_enable_fallback', {
            detail: { duration: action.duration }
          }));
        }
        break;

      case 'batch_requests':
        // Enable request batching
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('suggestion_enable_batching'));
        }
        break;

      case 'throttle_requests':
        // Enable request throttling
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('suggestion_throttle_requests', {
            detail: { duration: action.duration }
          }));
        }
        break;

      case 'reduce_quality':
        // Reduce suggestion quality for performance
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('suggestion_reduce_quality'));
        }
        break;
    }

    // Add artificial delay to simulate action execution
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - 3600000; // 1 hour

    // Clean up old alerts
    this.alerts = this.alerts.filter(
      alert => alert.timestamp.getTime() > cutoffTime || !alert.resolved
    );

    // Clean up old trends
    for (const [metric, trends] of this.trends) {
      const filteredTrends = trends.filter(
        trend => trend.timestamp.getTime() > cutoffTime
      );
      this.trends.set(metric, filteredTrends);
    }

    // Clean up old performance samples
    for (const [metric, samples] of this.performanceSamples) {
      if (samples.length > 500) {
        this.performanceSamples.set(metric, samples.slice(-500));
      }
    }
  }
}

export const suggestionPerformanceMonitor = new SuggestionPerformanceMonitor();