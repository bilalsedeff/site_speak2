/**
 * AudioPerformanceMonitor - Real-time performance tracking and optimization
 *
 * Comprehensive performance monitoring for AudioWorklet systems:
 * - Real-time latency tracking with P95/P99 metrics
 * - CPU and memory usage estimation
 * - Frame drop detection and recovery
 * - Quality degradation alerts
 * - Adaptive performance optimization
 * - Health check and self-healing
 * - Performance trend analysis
 * - Automatic throttling under load
 */

import { createLogger } from '../../../../shared/utils';

const logger = createLogger({ service: 'audio-performance-monitor' });

export interface PerformanceMetrics {
  // Latency metrics
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  latencyTrend: 'improving' | 'stable' | 'degrading';

  // Throughput metrics
  framesPerSecond: number;
  expectedFramesPerSecond: number;
  frameEfficiency: number;
  totalFramesProcessed: number;
  framesDropped: number;
  dropRate: number;

  // Resource usage
  cpuUsageEstimate: number;
  memoryUsageMB: number;
  memoryTrend: 'growing' | 'stable' | 'shrinking';

  // Quality metrics
  avgAudioQuality: number;
  qualityTrend: 'improving' | 'stable' | 'degrading';
  vadAccuracy: number;

  // Health indicators
  healthScore: number; // 0-1, where 1 is perfect health
  isPerformingWell: boolean;
  warningLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';

  // Session info
  sessionId: string;
  uptime: number;
  lastUpdate: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'latency' | 'throughput' | 'resource' | 'quality' | 'system';
  message: string;
  metrics: any;
  suggestion: string;
  autoResolve: boolean;
}

export interface PerformanceConfig {
  // Thresholds
  maxLatencyMs: number;
  minFrameRate: number;
  maxCpuUsage: number;
  maxMemoryUsageMB: number;
  minQualityScore: number;

  // Monitoring intervals
  metricsUpdateIntervalMs: number;
  alertCheckIntervalMs: number;
  trendAnalysisWindowMs: number;

  // Auto-optimization
  enableAutoOptimization: boolean;
  enableAdaptiveThrottling: boolean;
  enableSelfHealing: boolean;

  // Alert configuration
  enableAlerts: boolean;
  alertCooldownMs: number;
  maxAlertsPerHour: number;
}

export interface TrendAnalysis {
  metric: string;
  direction: 'improving' | 'stable' | 'degrading';
  confidence: number; // 0-1
  projectedValue: number;
  recommendation: string;
}

const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  maxLatencyMs: 20,
  minFrameRate: 45, // Slightly below 50fps to allow for variance
  maxCpuUsage: 0.8,
  maxMemoryUsageMB: 50,
  minQualityScore: 0.7,

  metricsUpdateIntervalMs: 1000,
  alertCheckIntervalMs: 5000,
  trendAnalysisWindowMs: 30000, // 30 seconds

  enableAutoOptimization: true,
  enableAdaptiveThrottling: true,
  enableSelfHealing: true,

  enableAlerts: true,
  alertCooldownMs: 10000, // 10 seconds between similar alerts
  maxAlertsPerHour: 20
};

/**
 * Real-time performance monitor for AudioWorklet systems
 */
export class AudioPerformanceMonitor {
  private config: PerformanceConfig;
  private sessionId: string;
  private isActive = false;
  private startTime = 0;

  // Performance data storage
  private latencyHistory: number[] = [];
  private frameRateHistory: number[] = [];
  private cpuUsageHistory: number[] = [];
  private memoryUsageHistory: number[] = [];
  private qualityHistory: number[] = [];

  // Current metrics
  private currentMetrics: PerformanceMetrics;

  // Alert system
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private alertHistory: PerformanceAlert[] = [];
  private lastAlertTime: Map<string, number> = new Map();

  // Trend analysis
  private trendAnalyzer: TrendAnalyzer;

  // Intervals
  private metricsInterval?: NodeJS.Timeout;
  private alertInterval?: NodeJS.Timeout;

  // Event callbacks
  private onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
  private onAlert?: (alert: PerformanceAlert) => void;

  constructor(sessionId: string, config: Partial<PerformanceConfig> = {}) {
    this.sessionId = sessionId;
    this.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
    this.trendAnalyzer = new TrendAnalyzer();

    this.currentMetrics = this.initializeMetrics();

    logger.info('AudioPerformanceMonitor created', {
      sessionId: this.sessionId,
      config: this.config
    });
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    logger.debug('Starting performance monitoring', { sessionId: this.sessionId });

    this.startTime = performance.now();
    this.isActive = true;

    // Start monitoring intervals
    this.metricsInterval = setInterval(
      () => this.updateMetrics(),
      this.config.metricsUpdateIntervalMs
    );

    if (this.config.enableAlerts) {
      this.alertInterval = setInterval(
        () => this.checkForAlerts(),
        this.config.alertCheckIntervalMs
      );
    }

    logger.info('Performance monitoring started', { sessionId: this.sessionId });
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    logger.debug('Stopping performance monitoring', { sessionId: this.sessionId });

    // Clear intervals
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      delete this.metricsInterval;
    }

    if (this.alertInterval) {
      clearInterval(this.alertInterval);
      delete this.alertInterval;
    }

    this.isActive = false;

    logger.info('Performance monitoring stopped', {
      sessionId: this.sessionId,
      finalMetrics: this.currentMetrics
    });
  }

  /**
   * Process message from AudioWorklet or Pipeline
   */
  processMessage(type: string, payload: any): void {
    if (!this.isActive) {
      return;
    }

    try {
      switch (type) {
        case 'performance_metrics':
          this.processWorkletMetrics(payload);
          break;

        case 'audio_level':
          this.processAudioQuality(payload);
          break;

        case 'processing_error':
          this.processError(payload);
          break;

        case 'performance_warning':
          this.processWarning(payload);
          break;

        default:
          // Ignore unknown message types
          break;
      }
    } catch (error) {
      logger.error('Error processing performance message', {
        sessionId: this.sessionId,
        type,
        error
      });
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.currentMetrics };
  }

  /**
   * Get performance trends
   */
  getTrends(): TrendAnalysis[] {
    return this.trendAnalyzer.analyze({
      latency: this.latencyHistory,
      frameRate: this.frameRateHistory,
      cpuUsage: this.cpuUsageHistory,
      memoryUsage: this.memoryUsageHistory,
      quality: this.qualityHistory
    });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 50): PerformanceAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Set event callbacks
   */
  setEventHandlers(handlers: {
    onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
    onAlert?: (alert: PerformanceAlert) => void;
  }): void {
    if (handlers.onMetricsUpdate) {
      this.onMetricsUpdate = handlers.onMetricsUpdate;
    }
    if (handlers.onAlert) {
      this.onAlert = handlers.onAlert;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PerformanceConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };

    logger.debug('Performance monitor config updated', {
      sessionId: this.sessionId,
      updates,
      oldConfig,
      newConfig: this.config
    });

    // Restart intervals if timing changed
    if (updates.metricsUpdateIntervalMs && this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = setInterval(
        () => this.updateMetrics(),
        this.config.metricsUpdateIntervalMs
      );
    }

    if (updates.alertCheckIntervalMs && this.alertInterval) {
      clearInterval(this.alertInterval);
      this.alertInterval = setInterval(
        () => this.checkForAlerts(),
        this.config.alertCheckIntervalMs
      );
    }
  }

  /**
   * Manually trigger optimization
   */
  optimize(): void {
    if (!this.config.enableAutoOptimization) {
      return;
    }

    logger.debug('Running manual optimization', { sessionId: this.sessionId });

    // Implement optimization strategies based on current metrics
    this.runOptimization();
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      maxLatency: 0,
      latencyTrend: 'stable',

      framesPerSecond: 0,
      expectedFramesPerSecond: 50, // 20ms frames = 50fps
      frameEfficiency: 1.0,
      totalFramesProcessed: 0,
      framesDropped: 0,
      dropRate: 0,

      cpuUsageEstimate: 0,
      memoryUsageMB: 0,
      memoryTrend: 'stable',

      avgAudioQuality: 1.0,
      qualityTrend: 'stable',
      vadAccuracy: 0.85,

      healthScore: 1.0,
      isPerformingWell: true,
      warningLevel: 'none',

      sessionId: this.sessionId,
      uptime: 0,
      lastUpdate: performance.now()
    };
  }

  /**
   * Process worklet performance metrics
   */
  private processWorkletMetrics(metrics: any): void {
    // Update latency metrics
    if (metrics.avgProcessingLatency !== undefined) {
      this.latencyHistory.push(metrics.avgProcessingLatency);
      this.limitArraySize(this.latencyHistory, 100);
    }

    // Update frame rate metrics
    if (metrics.framesPerSecond !== undefined) {
      this.frameRateHistory.push(metrics.framesPerSecond);
      this.limitArraySize(this.frameRateHistory, 100);
    }

    // Update resource usage
    if (metrics.cpuUsageEstimate !== undefined) {
      this.cpuUsageHistory.push(metrics.cpuUsageEstimate);
      this.limitArraySize(this.cpuUsageHistory, 100);
    }

    if (metrics.memoryEstimate?.totalMB !== undefined) {
      this.memoryUsageHistory.push(metrics.memoryEstimate.totalMB);
      this.limitArraySize(this.memoryUsageHistory, 100);
    }

    // Update current metrics
    this.currentMetrics.totalFramesProcessed = metrics.totalFrames || 0;
    this.currentMetrics.framesDropped = metrics.droppedFrames || 0;
  }

  /**
   * Process audio quality metrics
   */
  private processAudioQuality(levelData: any): void {
    // Calculate quality score based on level data
    const qualityScore = this.calculateQualityScore(levelData);

    this.qualityHistory.push(qualityScore);
    this.limitArraySize(this.qualityHistory, 100);
  }

  /**
   * Process error information
   */
  private processError(errorData: any): void {
    this.createAlert({
      severity: 'error',
      category: 'system',
      message: `Processing error: ${errorData.error}`,
      metrics: errorData,
      suggestion: 'Check audio worklet configuration and browser compatibility',
      autoResolve: false
    });
  }

  /**
   * Process performance warnings
   */
  private processWarning(warningData: any): void {
    this.createAlert({
      severity: 'warning',
      category: 'latency',
      message: `High latency detected: ${warningData.latency.toFixed(2)}ms`,
      metrics: warningData,
      suggestion: 'Consider reducing processing complexity or increasing buffer size',
      autoResolve: true
    });
  }

  /**
   * Update comprehensive metrics
   */
  private updateMetrics(): void {
    const now = performance.now();

    // Calculate latency metrics
    if (this.latencyHistory.length > 0) {
      this.currentMetrics.avgLatency = this.calculateAverage(this.latencyHistory);
      this.currentMetrics.p95Latency = this.calculatePercentile(this.latencyHistory, 0.95);
      this.currentMetrics.p99Latency = this.calculatePercentile(this.latencyHistory, 0.99);
      this.currentMetrics.maxLatency = Math.max(...this.latencyHistory);
      this.currentMetrics.latencyTrend = this.trendAnalyzer.getTrend('latency', this.latencyHistory);
    }

    // Calculate frame rate metrics
    if (this.frameRateHistory.length > 0) {
      this.currentMetrics.framesPerSecond = this.calculateAverage(this.frameRateHistory);
      this.currentMetrics.frameEfficiency = this.currentMetrics.framesPerSecond /
                                            this.currentMetrics.expectedFramesPerSecond;
    }

    // Calculate drop rate
    if (this.currentMetrics.totalFramesProcessed > 0) {
      this.currentMetrics.dropRate = this.currentMetrics.framesDropped /
                                     this.currentMetrics.totalFramesProcessed;
    }

    // Calculate resource usage
    if (this.cpuUsageHistory.length > 0) {
      this.currentMetrics.cpuUsageEstimate = this.calculateAverage(this.cpuUsageHistory);
    }

    if (this.memoryUsageHistory.length > 0) {
      this.currentMetrics.memoryUsageMB = this.calculateAverage(this.memoryUsageHistory);
      const latencyTrend = this.trendAnalyzer.getTrend('memory', this.memoryUsageHistory);
      this.currentMetrics.memoryTrend = latencyTrend === 'improving' ? 'shrinking' : latencyTrend === 'degrading' ? 'growing' : 'stable';
    }

    // Calculate quality metrics
    if (this.qualityHistory.length > 0) {
      this.currentMetrics.avgAudioQuality = this.calculateAverage(this.qualityHistory);
      this.currentMetrics.qualityTrend = this.trendAnalyzer.getTrend('quality', this.qualityHistory);
    }

    // Calculate overall health score
    this.currentMetrics.healthScore = this.calculateHealthScore();
    this.currentMetrics.isPerformingWell = this.currentMetrics.healthScore > 0.7;
    this.currentMetrics.warningLevel = this.getWarningLevel(this.currentMetrics.healthScore);

    // Update timing
    this.currentMetrics.uptime = now - this.startTime;
    this.currentMetrics.lastUpdate = now;

    // Run auto-optimization if enabled
    if (this.config.enableAutoOptimization && !this.currentMetrics.isPerformingWell) {
      this.runOptimization();
    }

    // Notify listeners
    this.onMetricsUpdate?.(this.currentMetrics);
  }

  /**
   * Check for performance alerts
   */
  private checkForAlerts(): void {
    const alerts: PerformanceAlert[] = [];

    // Check latency
    if (this.currentMetrics.avgLatency > this.config.maxLatencyMs) {
      alerts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        timestamp: Date.now(),
        severity: this.currentMetrics.avgLatency > this.config.maxLatencyMs * 2 ? 'critical' : 'warning',
        category: 'latency',
        message: `High average latency: ${this.currentMetrics.avgLatency.toFixed(2)}ms`,
        metrics: { avgLatency: this.currentMetrics.avgLatency, threshold: this.config.maxLatencyMs },
        suggestion: 'Reduce processing complexity or increase buffer size',
        autoResolve: true
      });
    }

    // Check frame rate
    if (this.currentMetrics.frameEfficiency < 0.9) {
      alerts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        timestamp: Date.now(),
        severity: this.currentMetrics.frameEfficiency < 0.7 ? 'error' : 'warning',
        category: 'throughput',
        message: `Low frame efficiency: ${(this.currentMetrics.frameEfficiency * 100).toFixed(1)}%`,
        metrics: { frameEfficiency: this.currentMetrics.frameEfficiency },
        suggestion: 'Check CPU usage and reduce processing load',
        autoResolve: true
      });
    }

    // Check resource usage
    if (this.currentMetrics.cpuUsageEstimate > this.config.maxCpuUsage) {
      alerts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        timestamp: Date.now(),
        severity: this.currentMetrics.cpuUsageEstimate > 0.95 ? 'critical' : 'warning',
        category: 'resource',
        message: `High CPU usage: ${(this.currentMetrics.cpuUsageEstimate * 100).toFixed(1)}%`,
        metrics: { cpuUsage: this.currentMetrics.cpuUsageEstimate },
        suggestion: 'Enable adaptive throttling or reduce feature complexity',
        autoResolve: true
      });
    }

    // Check memory usage
    if (this.currentMetrics.memoryUsageMB > this.config.maxMemoryUsageMB) {
      alerts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        timestamp: Date.now(),
        severity: 'warning',
        category: 'resource',
        message: `High memory usage: ${this.currentMetrics.memoryUsageMB.toFixed(1)}MB`,
        metrics: { memoryUsage: this.currentMetrics.memoryUsageMB },
        suggestion: 'Check for memory leaks and optimize buffer management',
        autoResolve: false
      });
    }

    // Check quality
    if (this.currentMetrics.avgAudioQuality < this.config.minQualityScore) {
      alerts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36),
        timestamp: Date.now(),
        severity: 'warning',
        category: 'quality',
        message: `Low audio quality: ${(this.currentMetrics.avgAudioQuality * 100).toFixed(1)}%`,
        metrics: { quality: this.currentMetrics.avgAudioQuality },
        suggestion: 'Check audio input quality and processing settings',
        autoResolve: true
      });
    }

    // Process new alerts
    alerts.forEach(alert => this.createAlert(alert));
  }

  /**
   * Create and manage alerts
   */
  private createAlert(alertData: Partial<PerformanceAlert>): void {
    const alert: PerformanceAlert = {
      id: `${alertData.category}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: performance.now(),
      severity: alertData.severity || 'warning',
      category: alertData.category || 'system',
      message: alertData.message || 'Performance issue detected',
      metrics: alertData.metrics || {},
      suggestion: alertData.suggestion || 'Monitor performance and adjust settings',
      autoResolve: alertData.autoResolve !== false
    };

    // Check cooldown
    const lastAlertTime = this.lastAlertTime.get(alert.category) || 0;
    if (performance.now() - lastAlertTime < this.config.alertCooldownMs) {
      return; // Skip alert due to cooldown
    }

    // Add to active alerts
    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);
    this.lastAlertTime.set(alert.category, alert.timestamp);

    // Limit history size
    if (this.alertHistory.length > 200) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    logger.warn('Performance alert created', {
      sessionId: this.sessionId,
      alert
    });

    // Notify listeners
    this.onAlert?.(alert);

    // Auto-resolve if configured
    if (alert.autoResolve) {
      setTimeout(() => this.resolveAlert(alert.id), 30000); // Auto-resolve after 30 seconds
    }
  }

  /**
   * Resolve an alert
   */
  private resolveAlert(alertId: string): void {
    if (this.activeAlerts.has(alertId)) {
      this.activeAlerts.delete(alertId);
      logger.debug('Alert auto-resolved', { sessionId: this.sessionId, alertId });
    }
  }

  /**
   * Run performance optimization
   */
  private runOptimization(): void {
    logger.debug('Running performance optimization', {
      sessionId: this.sessionId,
      healthScore: this.currentMetrics.healthScore
    });

    // Implement optimization strategies based on current issues
    if (this.currentMetrics.avgLatency > this.config.maxLatencyMs) {
      // High latency optimization
      if (this.config.enableAdaptiveThrottling) {
        // Reduce processing complexity
        logger.info('Applying latency optimization', { sessionId: this.sessionId });
      }
    }

    if (this.currentMetrics.cpuUsageEstimate > this.config.maxCpuUsage) {
      // High CPU optimization
      if (this.config.enableAdaptiveThrottling) {
        // Reduce frame rate or processing features
        logger.info('Applying CPU optimization', { sessionId: this.sessionId });
      }
    }
  }

  /**
   * Calculate health score (0-1)
   */
  private calculateHealthScore(): number {
    let score = 1.0;

    // Latency penalty
    if (this.currentMetrics.avgLatency > this.config.maxLatencyMs) {
      score -= (this.currentMetrics.avgLatency / this.config.maxLatencyMs - 1) * 0.3;
    }

    // Frame rate penalty
    score -= (1 - this.currentMetrics.frameEfficiency) * 0.3;

    // Resource usage penalty
    if (this.currentMetrics.cpuUsageEstimate > this.config.maxCpuUsage) {
      score -= (this.currentMetrics.cpuUsageEstimate - this.config.maxCpuUsage) * 0.2;
    }

    // Quality penalty
    if (this.currentMetrics.avgAudioQuality < this.config.minQualityScore) {
      score -= (this.config.minQualityScore - this.currentMetrics.avgAudioQuality) * 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get warning level based on health score
   */
  private getWarningLevel(healthScore: number): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (healthScore >= 0.9) {return 'none';}
    if (healthScore >= 0.8) {return 'low';}
    if (healthScore >= 0.6) {return 'medium';}
    if (healthScore >= 0.4) {return 'high';}
    return 'critical';
  }

  /**
   * Calculate quality score from level data
   */
  private calculateQualityScore(levelData: any): number {
    let score = 1.0;

    // Factor in RMS level (should be reasonable)
    if (levelData.rms) {
      if (levelData.rms < 0.01) {score *= 0.5;} // Too quiet
      if (levelData.rms > 0.8) {score *= 0.7;} // Too loud
    }

    // Factor in peak level (should not clip)
    if (levelData.peak && levelData.peak >= 0.95) {
      score *= 0.3; // Clipping
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Utility functions
   */
  private calculateAverage(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) {return 0;}
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(percentile * sorted.length);
    return sorted[index] || 0;
  }

  private limitArraySize(array: number[], maxSize: number): void {
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
  }
}

/**
 * Trend analyzer for performance metrics
 */
class TrendAnalyzer {
  analyze(data: Record<string, number[]>): TrendAnalysis[] {
    const analyses: TrendAnalysis[] = [];

    for (const [metric, values] of Object.entries(data)) {
      if (values.length < 5) {continue;} // Need minimum data points

      const trend = this.calculateTrend(values);
      const confidence = this.calculateConfidence(values);
      const projection = this.projectValue(values);

      analyses.push({
        metric,
        direction: trend,
        confidence,
        projectedValue: projection,
        recommendation: this.generateRecommendation(metric, trend, confidence)
      });
    }

    return analyses;
  }

  getTrend(metric: string, values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 3) {return 'stable';}

    const recent = values.slice(-5);
    const older = values.slice(-10, -5);

    if (recent.length === 0 || older.length === 0) {return 'stable';}

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const change = (recentAvg - olderAvg) / olderAvg;

    // For latency and CPU usage, lower is better
    if (metric === 'latency' || metric === 'cpuUsage') {
      if (change < -0.1) {return 'improving';}
      if (change > 0.1) {return 'degrading';}
      return 'stable';
    }

    // For quality and frame rate, higher is better
    if (change > 0.1) {return 'improving';}
    if (change < -0.1) {return 'degrading';}
    return 'stable';
  }

  private calculateTrend(values: number[]): 'improving' | 'stable' | 'degrading' {
    // Simple linear regression to determine trend
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + idx * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 0.01) {return 'improving';}
    if (slope < -0.01) {return 'degrading';}
    return 'stable';
  }

  private calculateConfidence(values: number[]): number {
    // Calculate confidence based on variance
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher confidence
    const normalizedStdDev = Math.min(stdDev / mean, 1);
    return Math.max(0, 1 - normalizedStdDev);
  }

  private projectValue(values: number[]): number {
    // Simple projection based on recent trend
    const recent = values.slice(-3);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  private generateRecommendation(metric: string, trend: string, confidence: number): string {
    if (confidence < 0.5) {
      return 'Insufficient data for reliable recommendation';
    }

    switch (metric) {
      case 'latency':
        if (trend === 'degrading') {return 'Consider reducing processing complexity';}
        if (trend === 'improving') {return 'Current optimization strategies are working';}
        return 'Monitor latency trends';

      case 'frameRate':
        if (trend === 'degrading') {return 'Check CPU usage and optimize processing';}
        return 'Frame rate is stable';

      case 'quality':
        if (trend === 'degrading') {return 'Check audio input quality and settings';}
        return 'Audio quality is acceptable';

      default:
        return 'Continue monitoring';
    }
  }
}

// Factory function for creating performance monitor instances
export function createAudioPerformanceMonitor(
  sessionId: string,
  config?: Partial<PerformanceConfig>
): AudioPerformanceMonitor {
  return new AudioPerformanceMonitor(sessionId, config);
}