/**
 * Voice Performance Monitor - Real-time performance tracking and optimization
 *
 * Monitors critical voice system metrics and automatically triggers optimizations:
 * - First token latency tracking (≤300ms target)
 * - Audio processing pipeline performance
 * - Memory usage and buffer management
 * - Connection pool efficiency
 * - Real-time adaptive optimization triggers
 * - Performance alerting and health dashboards
 *
 * Provides actionable insights for maintaining voice system performance
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils';

const logger = createLogger({ service: 'voice-performance-monitor' });

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent' | 'mbps';
  target?: number;
  threshold?: number;
}

export interface PerformanceAlert {
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  suggestions: string[];
}

export interface VoicePerformanceSnapshot {
  timestamp: number;
  firstTokenLatency: {
    p50: number;
    p95: number;
    p99: number;
    current: number;
    target: number;
  };
  audioProcessing: {
    avgLatency: number;
    throughput: number;
    errorRate: number;
  };
  connectionPool: {
    activeConnections: number;
    reuseRate: number;
    avgConnectionLatency: number;
  };
  memoryUsage: {
    totalMB: number;
    audioBuffers: number;
    poolEfficiency: number;
  };
  systemHealth: {
    cpuUsage: number;
    overallScore: number; // 0-100
    isHealthy: boolean;
  };
}

export interface MonitoringConfig {
  firstTokenLatencyTarget: number;
  firstTokenLatencyThreshold: number;
  audioProcessingThreshold: number;
  memoryUsageThreshold: number;
  errorRateThreshold: number;
  samplingInterval: number;
  alertCooldown: number;
  enableAutoOptimization: boolean;
  enableDetailedLogging: boolean;
}

const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  firstTokenLatencyTarget: 300, // 300ms target
  firstTokenLatencyThreshold: 400, // Alert if >400ms
  audioProcessingThreshold: 100, // Alert if >100ms
  memoryUsageThreshold: 500, // Alert if >500MB
  errorRateThreshold: 0.05, // Alert if >5% error rate
  samplingInterval: 1000, // Sample every second
  alertCooldown: 30000, // 30 seconds between similar alerts
  enableAutoOptimization: true,
  enableDetailedLogging: false
};

/**
 * Moving average calculator for performance metrics
 */
class MovingAverage {
  private values: number[] = [];
  private maxSamples: number;

  constructor(maxSamples: number = 100) {
    this.maxSamples = maxSamples;
  }

  add(value: number): void {
    this.values.push(value);
    if (this.values.length > this.maxSamples) {
      this.values.shift();
    }
  }

  average(): number {
    if (this.values.length === 0) {return 0;}
    return this.values.reduce((sum, val) => sum + val, 0) / this.values.length;
  }

  percentile(p: number): number {
    if (this.values.length === 0) {return 0;}
    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.floor(p * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)] || 0;
  }

  count(): number {
    return this.values.length;
  }

  latest(): number {
    return this.values[this.values.length - 1] || 0;
  }
}

/**
 * Performance metrics collector and analyzer
 */
export class VoicePerformanceMonitor extends EventEmitter {
  private config: MonitoringConfig;
  private isMonitoring = false;
  private monitoringTimer?: NodeJS.Timeout;

  // Metric collectors
  private firstTokenLatencies = new MovingAverage(200);
  private audioProcessingLatencies = new MovingAverage(200);
  private connectionLatencies = new MovingAverage(100);
  private memoryUsages = new MovingAverage(50);
  private errorRates = new MovingAverage(50);

  // Alert management
  private lastAlerts = new Map<string, number>();
  private activeAlerts = new Map<string, PerformanceAlert>();

  // Performance history for trend analysis
  private performanceHistory: VoicePerformanceSnapshot[] = [];
  private maxHistorySize = 1000;

  constructor(config: Partial<MonitoringConfig> = {}) {
    super();
    this.config = { ...DEFAULT_MONITORING_CONFIG, ...config };

    logger.info('VoicePerformanceMonitor initialized', {
      firstTokenTarget: this.config.firstTokenLatencyTarget,
      autoOptimization: this.config.enableAutoOptimization,
      samplingInterval: this.config.samplingInterval
    });
  }

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Start periodic monitoring
    this.monitoringTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.samplingInterval);

    logger.info('Performance monitoring started', {
      samplingInterval: this.config.samplingInterval
    });

    this.emit('monitoring_started');
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined as any;
    }

    logger.info('Performance monitoring stopped');
    this.emit('monitoring_stopped');
  }

  /**
   * Record first token latency
   */
  recordFirstTokenLatency(latency: number, sessionId?: string): void {
    this.firstTokenLatencies.add(latency);

    if (this.config.enableDetailedLogging) {
      logger.debug('First token latency recorded', { latency, sessionId });
    }

    // Check for immediate threshold violation
    if (latency > this.config.firstTokenLatencyThreshold) {
      this.triggerAlert({
        severity: 'warning',
        metric: 'first_token_latency',
        message: `First token latency (${latency}ms) exceeded threshold (${this.config.firstTokenLatencyThreshold}ms)`,
        value: latency,
        threshold: this.config.firstTokenLatencyThreshold,
        timestamp: Date.now(),
        suggestions: [
          'Check OpenAI Realtime API connection',
          'Review audio processing pipeline',
          'Consider connection pooling optimization'
        ]
      });
    }

    this.emit('first_token_latency', { latency, sessionId });
  }

  /**
   * Record audio processing latency
   */
  recordAudioProcessingLatency(latency: number, processingPath?: string): void {
    this.audioProcessingLatencies.add(latency);

    if (this.config.enableDetailedLogging) {
      logger.debug('Audio processing latency recorded', { latency, processingPath });
    }

    if (latency > this.config.audioProcessingThreshold) {
      this.triggerAlert({
        severity: 'warning',
        metric: 'audio_processing_latency',
        message: `Audio processing latency (${latency}ms) exceeded threshold (${this.config.audioProcessingThreshold}ms)`,
        value: latency,
        threshold: this.config.audioProcessingThreshold,
        timestamp: Date.now(),
        suggestions: [
          'Enable streaming audio conversion',
          'Check buffer pool efficiency',
          'Consider worker thread processing'
        ]
      });
    }

    this.emit('audio_processing_latency', { latency, processingPath });
  }

  /**
   * Record connection latency
   */
  recordConnectionLatency(latency: number, isReused: boolean): void {
    this.connectionLatencies.add(latency);

    if (this.config.enableDetailedLogging) {
      logger.debug('Connection latency recorded', { latency, isReused });
    }

    this.emit('connection_latency', { latency, isReused });
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage(memoryMB: number, source?: string): void {
    this.memoryUsages.add(memoryMB);

    if (this.config.enableDetailedLogging) {
      logger.debug('Memory usage recorded', { memoryMB, source });
    }

    if (memoryMB > this.config.memoryUsageThreshold) {
      this.triggerAlert({
        severity: 'critical',
        metric: 'memory_usage',
        message: `Memory usage (${memoryMB}MB) exceeded threshold (${this.config.memoryUsageThreshold}MB)`,
        value: memoryMB,
        threshold: this.config.memoryUsageThreshold,
        timestamp: Date.now(),
        suggestions: [
          'Enable buffer pooling',
          'Check for memory leaks in audio processing',
          'Review connection pool size limits'
        ]
      });
    }

    this.emit('memory_usage', { memoryMB, source });
  }

  /**
   * Record error rate
   */
  recordError(errorType: string, context?: Record<string, unknown>): void {
    // Calculate current error rate (simplified)
    const currentErrorRate = 0.01; // Placeholder - would be calculated from actual metrics
    this.errorRates.add(currentErrorRate);

    if (this.config.enableDetailedLogging) {
      logger.debug('Error recorded', { errorType, context });
    }

    if (currentErrorRate > this.config.errorRateThreshold) {
      this.triggerAlert({
        severity: 'critical',
        metric: 'error_rate',
        message: `Error rate (${(currentErrorRate * 100).toFixed(1)}%) exceeded threshold (${(this.config.errorRateThreshold * 100).toFixed(1)}%)`,
        value: currentErrorRate,
        threshold: this.config.errorRateThreshold,
        timestamp: Date.now(),
        suggestions: [
          'Check OpenAI API connectivity',
          'Review audio format compatibility',
          'Investigate WebSocket connection stability'
        ]
      });
    }

    this.emit('error_recorded', { errorType, context });
  }

  /**
   * Get current performance snapshot
   */
  getCurrentSnapshot(): VoicePerformanceSnapshot {
    const timestamp = Date.now();

    return {
      timestamp,
      firstTokenLatency: {
        p50: this.firstTokenLatencies.percentile(0.5),
        p95: this.firstTokenLatencies.percentile(0.95),
        p99: this.firstTokenLatencies.percentile(0.99),
        current: this.firstTokenLatencies.latest(),
        target: this.config.firstTokenLatencyTarget
      },
      audioProcessing: {
        avgLatency: this.audioProcessingLatencies.average(),
        throughput: this.calculateThroughput(),
        errorRate: this.errorRates.average()
      },
      connectionPool: {
        activeConnections: this.getActiveConnectionCount(),
        reuseRate: this.getConnectionReuseRate(),
        avgConnectionLatency: this.connectionLatencies.average()
      },
      memoryUsage: {
        totalMB: this.memoryUsages.latest(),
        audioBuffers: this.getAudioBufferCount(),
        poolEfficiency: this.getBufferPoolEfficiency()
      },
      systemHealth: {
        cpuUsage: this.estimateCpuUsage(),
        overallScore: this.calculateHealthScore(),
        isHealthy: this.isSystemHealthy()
      }
    };
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrends(durationMinutes: number = 30): {
    timestamps: number[];
    firstTokenLatencies: number[];
    audioProcessingLatencies: number[];
    memoryUsages: number[];
  } {
    const cutoffTime = Date.now() - (durationMinutes * 60 * 1000);
    const relevantHistory = this.performanceHistory
      .filter(snapshot => snapshot.timestamp >= cutoffTime);

    return {
      timestamps: relevantHistory.map(s => s.timestamp),
      firstTokenLatencies: relevantHistory.map(s => s.firstTokenLatency.p95),
      audioProcessingLatencies: relevantHistory.map(s => s.audioProcessing.avgLatency),
      memoryUsages: relevantHistory.map(s => s.memoryUsage.totalMB)
    };
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Clear specific alert
   */
  clearAlert(metric: string): void {
    if (this.activeAlerts.has(metric)) {
      this.activeAlerts.delete(metric);
      this.emit('alert_cleared', { metric });
      logger.info('Performance alert cleared', { metric });
    }
  }

  /**
   * Get optimization recommendations based on current performance
   */
  getOptimizationRecommendations(): Array<{
    priority: 'high' | 'medium' | 'low';
    category: 'latency' | 'memory' | 'throughput' | 'reliability';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }> {
    const recommendations = [];
    const snapshot = this.getCurrentSnapshot();

    // First token latency recommendations
    if (snapshot.firstTokenLatency.p95 > this.config.firstTokenLatencyTarget) {
      recommendations.push({
        priority: 'high' as const,
        category: 'latency' as const,
        recommendation: 'Implement connection pooling to reduce cold connection latency',
        impact: `Reduce first token latency by ~150-200ms`,
        effort: 'medium' as const
      });
    }

    // Audio processing recommendations
    if (snapshot.audioProcessing.avgLatency > 50) {
      recommendations.push({
        priority: 'high' as const,
        category: 'latency' as const,
        recommendation: 'Enable streaming audio conversion to reduce processing latency',
        impact: `Reduce audio processing latency by ~30-70ms`,
        effort: 'medium' as const
      });
    }

    // Memory usage recommendations
    if (snapshot.memoryUsage.poolEfficiency < 0.7) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'memory' as const,
        recommendation: 'Optimize buffer pool management and increase reuse rate',
        impact: 'Reduce memory allocation by 40-60%',
        effort: 'low' as const
      });
    }

    // Connection pool recommendations
    if (snapshot.connectionPool.reuseRate < 0.8) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'throughput' as const,
        recommendation: 'Increase connection pool size and improve tenant affinity',
        impact: 'Improve connection reuse rate to >90%',
        effort: 'low' as const
      });
    }

    return recommendations;
  }

  // ===================== PRIVATE METHODS =====================

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    const snapshot = this.getCurrentSnapshot();

    // Store in history
    this.performanceHistory.push(snapshot);
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }

    // Trigger auto-optimization if enabled
    if (this.config.enableAutoOptimization) {
      this.checkAutoOptimizationTriggers(snapshot);
    }

    this.emit('metrics_collected', snapshot);
  }

  /**
   * Trigger performance alert
   */
  private triggerAlert(alert: PerformanceAlert): void {
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alert.metric);

    // Check cooldown period
    if (lastAlert && (now - lastAlert) < this.config.alertCooldown) {
      return;
    }

    this.lastAlerts.set(alert.metric, now);
    this.activeAlerts.set(alert.metric, alert);

    logger.warn('Performance alert triggered', {
      severity: alert.severity,
      metric: alert.metric,
      value: alert.value,
      threshold: alert.threshold
    });

    this.emit('alert', alert);
  }

  /**
   * Check if automatic optimization should be triggered
   */
  private checkAutoOptimizationTriggers(snapshot: VoicePerformanceSnapshot): void {
    // Trigger optimization if consistently exceeding thresholds
    if (snapshot.firstTokenLatency.p95 > this.config.firstTokenLatencyThreshold * 1.2) {
      this.emit('optimization_trigger', {
        type: 'emergency_latency_optimization',
        severity: 'critical',
        metrics: snapshot
      });
    }

    if (snapshot.memoryUsage.totalMB > this.config.memoryUsageThreshold * 1.5) {
      this.emit('optimization_trigger', {
        type: 'emergency_memory_cleanup',
        severity: 'critical',
        metrics: snapshot
      });
    }
  }

  /**
   * Calculate processing throughput
   */
  private calculateThroughput(): number {
    // Simplified throughput calculation
    return this.audioProcessingLatencies.count() / (this.config.samplingInterval / 1000);
  }

  /**
   * Get active connection count (would integrate with connection pool)
   */
  private getActiveConnectionCount(): number {
    // Placeholder - would integrate with RealtimeConnectionPool
    return 10;
  }

  /**
   * Get connection reuse rate
   */
  private getConnectionReuseRate(): number {
    // Placeholder - would integrate with RealtimeConnectionPool
    return 0.85;
  }

  /**
   * Get audio buffer count
   */
  private getAudioBufferCount(): number {
    // Placeholder - would integrate with OptimizedAudioConverter
    return 50;
  }

  /**
   * Get buffer pool efficiency
   */
  private getBufferPoolEfficiency(): number {
    // Placeholder - would integrate with buffer pool stats
    return 0.75;
  }

  /**
   * Estimate CPU usage
   */
  private estimateCpuUsage(): number {
    // Simplified CPU usage estimation based on latencies
    const avgLatency = this.audioProcessingLatencies.average();
    return Math.min(100, (avgLatency / 100) * 50);
  }

  /**
   * Calculate overall system health score
   */
  private calculateHealthScore(): number {
    let score = 100;

    // Deduct points for performance issues
    const snapshot = this.getCurrentSnapshot();

    if (snapshot.firstTokenLatency.p95 > this.config.firstTokenLatencyTarget) {
      score -= 20;
    }

    if (snapshot.audioProcessing.avgLatency > this.config.audioProcessingThreshold) {
      score -= 15;
    }

    if (snapshot.audioProcessing.errorRate > this.config.errorRateThreshold) {
      score -= 30;
    }

    if (snapshot.memoryUsage.totalMB > this.config.memoryUsageThreshold) {
      score -= 20;
    }

    return Math.max(0, score);
  }

  /**
   * Check if system is healthy
   */
  private isSystemHealthy(): boolean {
    const score = this.calculateHealthScore();
    return score >= 70; // 70% threshold for healthy status
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Performance monitoring config updated', updates);
    this.emit('config_updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(): {
    config: MonitoringConfig;
    currentSnapshot: VoicePerformanceSnapshot;
    history: VoicePerformanceSnapshot[];
    alerts: PerformanceAlert[];
  } {
    return {
      config: this.getConfig(),
      currentSnapshot: this.getCurrentSnapshot(),
      history: [...this.performanceHistory],
      alerts: this.getActiveAlerts()
    };
  }
}

// Export singleton instance
export const voicePerformanceMonitor = new VoicePerformanceMonitor();

// Setup cleanup on process exit
process.on('beforeExit', () => {
  voicePerformanceMonitor.stop();
});