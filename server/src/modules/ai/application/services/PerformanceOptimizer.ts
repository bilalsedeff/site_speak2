/**
 * Performance Optimizer - Real-time performance tuning for voice navigation
 *
 * Provides adaptive performance optimization for instant navigation:
 * - Real-time latency monitoring and adjustment
 * - Adaptive prediction threshold tuning
 * - Load balancing for action execution
 * - Performance-based optimization strategies
 * - Integration with all optimistic execution components
 * - Universal compatibility across device capabilities
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils.js';
import type { ExecutionMetrics } from './OptimisticExecutionEngine.js';
import type { PredictionMetrics } from './SpeculativeNavigationPredictor.js';
import type { PerformanceMetrics as ResourceMetrics } from './ResourceHintManager.js';
import type { RollbackMetrics } from './ActionRollbackManager.js';
import {
  hasMemoryAPI,
  hasConnectionAPI,
  hasBatteryAPI,
  type NetworkInformation
} from '../../../../types/browser-apis.js';

const logger = createLogger({ service: 'performance-optimizer' });

export interface PerformanceProfile {
  deviceClass: 'high-end' | 'mid-range' | 'low-end';
  cpuBenchmark: number;
  memoryAvailable: number;
  connectionSpeed: 'fast' | 'medium' | 'slow';
  batteryLevel?: number;
  thermalState?: 'normal' | 'fair' | 'serious' | 'critical';
  lastUpdated: number;
}

export interface PerformanceTarget {
  firstFeedback: number; // Target ms for first visual feedback
  optimisticExecution: number; // Target ms for optimistic action start
  fullCompletion: number; // Target ms for full action completion
  rollbackExecution: number; // Target ms for rollback completion
  resourcePrefetch: number; // Target ms for resource hint injection
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  description: string;
  conditions: StrategyCondition[];
  optimizations: StrategyOptimization[];
  priority: number;
  effectiveness: number;
}

export interface StrategyCondition {
  metric: string;
  operator: 'lt' | 'gt' | 'eq' | 'between';
  value: number | [number, number];
  weight: number;
}

export interface StrategyOptimization {
  component: 'execution' | 'prediction' | 'resources' | 'rollback';
  parameter: string;
  adjustment: number | string;
  type: 'threshold' | 'limit' | 'strategy' | 'toggle';
}

export interface PerformanceAlert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  metric: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  timestamp: number;
  suggestion: string;
}

export interface AdaptiveConfiguration {
  optimisticExecution: {
    confidenceThresholds: {
      immediate: number;
      optimistic: number;
      speculative: number;
    };
    maxConcurrentActions: number;
    timeoutAdjustment: number;
  };
  speculation: {
    maxActivePredictions: number;
    confidenceThreshold: number;
    predictionHorizon: number;
  };
  resources: {
    maxConcurrentPrefetches: number;
    bandwidthAdaptation: boolean;
    criticalResourceTimeout: number;
  };
  rollback: {
    snapshotFrequency: number;
    compressionThreshold: number;
    maxTransactions: number;
  };
}

export interface SystemMetrics {
  timestamp: number;
  performance: {
    averageLatency: number;
    throughput: number;
    errorRate: number;
    resourceUtilization: number;
  };
  execution: ExecutionMetrics;
  prediction: PredictionMetrics;
  resources: ResourceMetrics;
  rollback: RollbackMetrics;
  system: {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    batteryDrain: number;
  };
}

/**
 * Performance Optimizer
 * Continuously optimizes system performance for <300ms response times
 */
export class PerformanceOptimizer extends EventEmitter {
  // Note: isInitialized reserved for future use

  // Performance monitoring
  private performanceProfile: PerformanceProfile;
  private performanceTargets: PerformanceTarget;
  private currentConfiguration: AdaptiveConfiguration;

  // Optimization strategies
  private strategies = new Map<string, OptimizationStrategy>();
  private activeOptimizations = new Set<string>();
  private optimizationHistory: Array<{ timestamp: number; strategy: string; effectiveness: number }> = [];

  // Monitoring state
  private metrics: SystemMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Configuration
  private config = {
    monitoringFrequency: 1000, // 1 second
    adaptationThreshold: 0.1, // 10% performance deviation
    maxMetricsHistory: 100,
    maxAlertsHistory: 50,
    strategyCooldown: 5000, // 5 seconds between strategy applications
  };

  constructor() {
    super();
    this.performanceProfile = this.getDefaultPerformanceProfile();
    this.performanceTargets = this.getDefaultPerformanceTargets();
    this.currentConfiguration = this.getDefaultConfiguration();
    this.initialize();
  }

  /**
   * Initialize the performance optimizer
   */
  private async initialize(): Promise<void> {
    try {
      await this.detectDeviceCapabilities();
      this.setupOptimizationStrategies();
      this.startPerformanceMonitoring();

      // Note: initialization completed successfully
      logger.info('PerformanceOptimizer initialized', {
        deviceClass: this.performanceProfile.deviceClass,
        connectionSpeed: this.performanceProfile.connectionSpeed,
      });
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize PerformanceOptimizer', { error });
      throw error;
    }
  }

  /**
   * Start real-time performance monitoring
   */
  startPerformanceMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.analyzePerformance();
        await this.applyOptimizations();
      } catch (error) {
        logger.error('Performance monitoring error', { error });
      }
    }, this.config.monitoringFrequency);

    logger.debug('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  stopPerformanceMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.debug('Performance monitoring stopped');
  }

  /**
   * Collect system metrics from all components
   */
  private async collectMetrics(): Promise<void> {
    try {
      const timestamp = Date.now();

      // Collect metrics from integrated components
      const systemMetrics: SystemMetrics = {
        timestamp,
        performance: await this.collectPerformanceMetrics(),
        execution: await this.getExecutionMetrics(),
        prediction: await this.getPredictionMetrics(),
        resources: await this.getResourceMetrics(),
        rollback: await this.getRollbackMetrics(),
        system: await this.collectSystemMetrics(),
      };

      this.metrics.push(systemMetrics);

      // Limit metrics history
      if (this.metrics.length > this.config.maxMetricsHistory) {
        this.metrics.shift();
      }

      this.emit('metrics_collected', systemMetrics);

    } catch (error) {
      logger.error('Failed to collect metrics', { error });
    }
  }

  /**
   * Analyze performance against targets and generate alerts
   */
  private async analyzePerformance(): Promise<void> {
    if (this.metrics.length < 2) {return;}

    const current = this.metrics[this.metrics.length - 1]!;
    const previous = this.metrics[this.metrics.length - 2]!;

    try {
      // Check performance targets
      await this.checkPerformanceTargets(current);

      // Analyze trends
      await this.analyzeTrends(current, previous);

      // Generate alerts for significant deviations
      await this.generatePerformanceAlerts(current);

    } catch (error) {
      logger.error('Failed to analyze performance', { error });
    }
  }

  /**
   * Apply performance optimizations based on current metrics
   */
  private async applyOptimizations(): Promise<void> {
    if (this.metrics.length === 0) {return;}

    const current = this.metrics[this.metrics.length - 1]!;

    try {
      // Find applicable optimization strategies
      const applicableStrategies = this.findApplicableStrategies(current);

      for (const strategy of applicableStrategies) {
        if (await this.shouldApplyStrategy(strategy)) {
          await this.applyOptimizationStrategy(strategy, current);
        }
      }

    } catch (error) {
      logger.error('Failed to apply optimizations', { error });
    }
  }

  /**
   * Find optimization strategies applicable to current metrics
   */
  private findApplicableStrategies(metrics: SystemMetrics): OptimizationStrategy[] {
    const applicable: OptimizationStrategy[] = [];

    for (const strategy of this.strategies.values()) {
      if (this.evaluateStrategyConditions(strategy, metrics)) {
        applicable.push(strategy);
      }
    }

    // Sort by priority and effectiveness
    return applicable.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      return priorityDiff !== 0 ? priorityDiff : b.effectiveness - a.effectiveness;
    });
  }

  /**
   * Evaluate if strategy conditions are met
   */
  private evaluateStrategyConditions(
    strategy: OptimizationStrategy,
    metrics: SystemMetrics
  ): boolean {
    let totalWeight = 0;
    let satisfiedWeight = 0;

    for (const condition of strategy.conditions) {
      totalWeight += condition.weight;

      const value = this.getMetricValue(metrics, condition.metric);
      if (value !== null && this.evaluateCondition(condition, value)) {
        satisfiedWeight += condition.weight;
      }
    }

    // Strategy applies if weighted conditions are >50% satisfied
    return totalWeight > 0 && (satisfiedWeight / totalWeight) > 0.5;
  }

  /**
   * Check if strategy should be applied (cooldown, effectiveness, etc.)
   */
  private async shouldApplyStrategy(strategy: OptimizationStrategy): Promise<boolean> {
    // Check if strategy is already active
    if (this.activeOptimizations.has(strategy.id)) {
      return false;
    }

    // Check cooldown period
    const lastApplication = this.optimizationHistory
      .filter(h => h.strategy === strategy.id)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastApplication && (Date.now() - lastApplication.timestamp) < this.config.strategyCooldown) {
      return false;
    }

    // Check effectiveness threshold
    return strategy.effectiveness >= 0.3; // 30% minimum effectiveness
  }

  /**
   * Apply optimization strategy
   */
  private async applyOptimizationStrategy(
    strategy: OptimizationStrategy,
    metrics: SystemMetrics
  ): Promise<void> {
    try {
      logger.info('Applying optimization strategy', {
        strategy: strategy.name,
        id: strategy.id,
        optimizationCount: strategy.optimizations.length,
      });

      this.activeOptimizations.add(strategy.id);

      let successfulOptimizations = 0;

      for (const optimization of strategy.optimizations) {
        try {
          await this.applyOptimization(optimization, metrics);
          successfulOptimizations++;
        } catch (error) {
          logger.warn('Failed to apply optimization', {
            error,
            component: optimization.component,
            parameter: optimization.parameter,
          });
        }
      }

      // Record strategy application
      this.optimizationHistory.push({
        timestamp: Date.now(),
        strategy: strategy.id,
        effectiveness: successfulOptimizations / strategy.optimizations.length,
      });

      // Update strategy effectiveness
      strategy.effectiveness = (strategy.effectiveness + (successfulOptimizations / strategy.optimizations.length)) / 2;

      this.emit('strategy_applied', {
        strategy: strategy.name,
        successfulOptimizations,
        totalOptimizations: strategy.optimizations.length,
        timestamp: Date.now(),
      });

      // Remove from active after delay
      setTimeout(() => {
        this.activeOptimizations.delete(strategy.id);
      }, this.config.strategyCooldown);

    } catch (error) {
      this.activeOptimizations.delete(strategy.id);
      logger.error('Failed to apply optimization strategy', { error, strategy: strategy.name });
    }
  }

  /**
   * Apply individual optimization
   */
  private async applyOptimization(
    optimization: StrategyOptimization,
    metrics: SystemMetrics
  ): Promise<void> {
    switch (optimization.component) {
      case 'execution':
        await this.optimizeExecution(optimization, metrics);
        break;

      case 'prediction':
        await this.optimizePrediction(optimization, metrics);
        break;

      case 'resources':
        await this.optimizeResources(optimization, metrics);
        break;

      case 'rollback':
        await this.optimizeRollback(optimization, metrics);
        break;

      default:
        throw new Error(`Unknown optimization component: ${optimization.component}`);
    }

    logger.debug('Optimization applied', {
      component: optimization.component,
      parameter: optimization.parameter,
      adjustment: optimization.adjustment,
    });
  }

  /**
   * Component-specific optimization methods
   */
  private async optimizeExecution(
    optimization: StrategyOptimization,
    _metrics: SystemMetrics
  ): Promise<void> {
    const { parameter, adjustment, type } = optimization;

    switch (parameter) {
      case 'confidenceThresholds':
        if (type === 'threshold' && typeof adjustment === 'number') {
          // Adjust confidence thresholds based on performance
          const currentThresholds = this.currentConfiguration.optimisticExecution.confidenceThresholds;
          const adjustmentFactor = adjustment;

          this.currentConfiguration.optimisticExecution.confidenceThresholds = {
            immediate: Math.min(1.0, Math.max(0.5, currentThresholds.immediate + adjustmentFactor)),
            optimistic: Math.min(0.9, Math.max(0.3, currentThresholds.optimistic + adjustmentFactor)),
            speculative: Math.min(0.8, Math.max(0.1, currentThresholds.speculative + adjustmentFactor)),
          };

          this.emit('configuration_updated', {
            component: 'execution',
            parameter: 'confidenceThresholds',
            value: this.currentConfiguration.optimisticExecution.confidenceThresholds,
          });
        }
        break;

      case 'maxConcurrentActions':
        if (type === 'limit' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.optimisticExecution.maxConcurrentActions;
          this.currentConfiguration.optimisticExecution.maxConcurrentActions = Math.max(1, current + adjustment);

          this.emit('configuration_updated', {
            component: 'execution',
            parameter: 'maxConcurrentActions',
            value: this.currentConfiguration.optimisticExecution.maxConcurrentActions,
          });
        }
        break;
    }
  }

  private async optimizePrediction(
    optimization: StrategyOptimization,
    _metrics: SystemMetrics
  ): Promise<void> {
    const { parameter, adjustment, type } = optimization;

    switch (parameter) {
      case 'maxActivePredictions':
        if (type === 'limit' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.speculation.maxActivePredictions;
          this.currentConfiguration.speculation.maxActivePredictions = Math.max(1, current + adjustment);

          this.emit('configuration_updated', {
            component: 'prediction',
            parameter: 'maxActivePredictions',
            value: this.currentConfiguration.speculation.maxActivePredictions,
          });
        }
        break;

      case 'predictionHorizon':
        if (type === 'threshold' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.speculation.predictionHorizon;
          this.currentConfiguration.speculation.predictionHorizon = Math.max(1000, current + adjustment);

          this.emit('configuration_updated', {
            component: 'prediction',
            parameter: 'predictionHorizon',
            value: this.currentConfiguration.speculation.predictionHorizon,
          });
        }
        break;
    }
  }

  private async optimizeResources(
    optimization: StrategyOptimization,
    _metrics: SystemMetrics
  ): Promise<void> {
    const { parameter, adjustment, type } = optimization;

    switch (parameter) {
      case 'maxConcurrentPrefetches':
        if (type === 'limit' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.resources.maxConcurrentPrefetches;
          this.currentConfiguration.resources.maxConcurrentPrefetches = Math.max(1, current + adjustment);

          this.emit('configuration_updated', {
            component: 'resources',
            parameter: 'maxConcurrentPrefetches',
            value: this.currentConfiguration.resources.maxConcurrentPrefetches,
          });
        }
        break;

      case 'bandwidthAdaptation':
        if (type === 'toggle' && typeof adjustment === 'string') {
          this.currentConfiguration.resources.bandwidthAdaptation = adjustment === 'enable';

          this.emit('configuration_updated', {
            component: 'resources',
            parameter: 'bandwidthAdaptation',
            value: this.currentConfiguration.resources.bandwidthAdaptation,
          });
        }
        break;
    }
  }

  private async optimizeRollback(
    optimization: StrategyOptimization,
    _metrics: SystemMetrics
  ): Promise<void> {
    const { parameter, adjustment, type } = optimization;

    switch (parameter) {
      case 'maxTransactions':
        if (type === 'limit' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.rollback.maxTransactions;
          this.currentConfiguration.rollback.maxTransactions = Math.max(1, current + adjustment);

          this.emit('configuration_updated', {
            component: 'rollback',
            parameter: 'maxTransactions',
            value: this.currentConfiguration.rollback.maxTransactions,
          });
        }
        break;

      case 'compressionThreshold':
        if (type === 'threshold' && typeof adjustment === 'number') {
          const current = this.currentConfiguration.rollback.compressionThreshold;
          this.currentConfiguration.rollback.compressionThreshold = Math.max(512, current + adjustment);

          this.emit('configuration_updated', {
            component: 'rollback',
            parameter: 'compressionThreshold',
            value: this.currentConfiguration.rollback.compressionThreshold,
          });
        }
        break;
    }
  }

  /**
   * Setup predefined optimization strategies
   */
  private setupOptimizationStrategies(): void {
    // High Latency Strategy
    this.strategies.set('high-latency-reduction', {
      id: 'high-latency-reduction',
      name: 'High Latency Reduction',
      description: 'Reduce latency when response times exceed targets',
      conditions: [
        {
          metric: 'performance.averageLatency',
          operator: 'gt',
          value: this.performanceTargets.optimisticExecution,
          weight: 1.0,
        },
      ],
      optimizations: [
        {
          component: 'execution',
          parameter: 'confidenceThresholds',
          adjustment: -0.05,
          type: 'threshold',
        },
        {
          component: 'prediction',
          parameter: 'maxActivePredictions',
          adjustment: 1,
          type: 'limit',
        },
      ],
      priority: 10,
      effectiveness: 0.8,
    });

    // Low Performance Strategy
    this.strategies.set('low-performance-adaptation', {
      id: 'low-performance-adaptation',
      name: 'Low Performance Adaptation',
      description: 'Adapt to low-performance devices',
      conditions: [
        {
          metric: 'system.cpuUsage',
          operator: 'gt',
          value: 80,
          weight: 0.6,
        },
        {
          metric: 'system.memoryUsage',
          operator: 'gt',
          value: 75,
          weight: 0.4,
        },
      ],
      optimizations: [
        {
          component: 'execution',
          parameter: 'maxConcurrentActions',
          adjustment: -1,
          type: 'limit',
        },
        {
          component: 'resources',
          parameter: 'maxConcurrentPrefetches',
          adjustment: -1,
          type: 'limit',
        },
        {
          component: 'rollback',
          parameter: 'compressionThreshold',
          adjustment: -256,
          type: 'threshold',
        },
      ],
      priority: 8,
      effectiveness: 0.7,
    });

    // High Error Rate Strategy
    this.strategies.set('error-rate-reduction', {
      id: 'error-rate-reduction',
      name: 'Error Rate Reduction',
      description: 'Reduce errors by being more conservative',
      conditions: [
        {
          metric: 'performance.errorRate',
          operator: 'gt',
          value: 0.1, // 10% error rate
          weight: 1.0,
        },
      ],
      optimizations: [
        {
          component: 'execution',
          parameter: 'confidenceThresholds',
          adjustment: 0.1,
          type: 'threshold',
        },
      ],
      priority: 9,
      effectiveness: 0.85,
    });

    // Battery Conservation Strategy
    this.strategies.set('battery-conservation', {
      id: 'battery-conservation',
      name: 'Battery Conservation',
      description: 'Reduce power consumption when battery is low',
      conditions: [
        {
          metric: 'system.batteryLevel',
          operator: 'lt',
          value: 20, // Below 20%
          weight: 1.0,
        },
      ],
      optimizations: [
        {
          component: 'prediction',
          parameter: 'maxActivePredictions',
          adjustment: -2,
          type: 'limit',
        },
        {
          component: 'resources',
          parameter: 'bandwidthAdaptation',
          adjustment: 'enable',
          type: 'toggle',
        },
      ],
      priority: 6,
      effectiveness: 0.6,
    });

    logger.debug('Optimization strategies initialized', {
      strategyCount: this.strategies.size,
    });
  }

  /**
   * Detect device capabilities and performance profile
   */
  private async detectDeviceCapabilities(): Promise<void> {
    try {
      // CPU benchmark (simplified)
      const cpuBenchmark = await this.runCPUBenchmark();

      // Memory detection
      let memoryAvailable = 512; // Default fallback
      if (hasMemoryAPI(performance) && performance.memory) {
        memoryAvailable = performance.memory.usedJSHeapSize / 1024 / 1024; // MB
      }

      // Connection speed detection
      let connectionSpeed: 'fast' | 'medium' | 'slow' = 'medium';
      if (hasConnectionAPI(navigator) && navigator.connection) {
        connectionSpeed = this.classifyConnectionSpeed(navigator.connection);
      }

      // Battery level (if available)
      let batteryLevel: number | undefined;
      if (hasBatteryAPI(navigator) && navigator.getBattery) {
        try {
          const battery = await navigator.getBattery();
          batteryLevel = battery.level * 100;
        } catch {
          // Battery API not available
        }
      }

      // Device classification
      const deviceClass = this.classifyDevice(cpuBenchmark, memoryAvailable);

      this.performanceProfile = {
        deviceClass,
        cpuBenchmark,
        memoryAvailable,
        connectionSpeed,
        ...(batteryLevel !== undefined && { batteryLevel }),
        thermalState: 'normal', // Would be detected via thermal API if available
        lastUpdated: Date.now(),
      };

      // Adjust targets based on device capabilities
      this.adjustPerformanceTargets();

      logger.info('Device capabilities detected', this.performanceProfile);

    } catch (error) {
      logger.error('Failed to detect device capabilities', { error });
      // Use conservative defaults
      this.performanceProfile = this.getDefaultPerformanceProfile();
    }
  }

  /**
   * Run simple CPU benchmark
   */
  private async runCPUBenchmark(): Promise<number> {
    const startTime = performance.now();
    let iterations = 0;
    const duration = 100; // 100ms benchmark

    while (performance.now() - startTime < duration) {
      Math.random();
      iterations++;
    }

    // Normalize to operations per second
    return iterations * (1000 / duration);
  }

  /**
   * Classify device based on benchmarks
   */
  private classifyDevice(cpuBenchmark: number, memoryAvailable: number): PerformanceProfile['deviceClass'] {
    if (cpuBenchmark > 100000 && memoryAvailable > 1024) {
      return 'high-end';
    } else if (cpuBenchmark > 50000 && memoryAvailable > 512) {
      return 'mid-range';
    } else {
      return 'low-end';
    }
  }

  /**
   * Classify connection speed
   */
  private classifyConnectionSpeed(connection: NetworkInformation): PerformanceProfile['connectionSpeed'] {
    const effectiveType = connection.effectiveType;
    if (effectiveType === '4g' || (connection.downlink && connection.downlink > 5)) {
      return 'fast';
    } else if (effectiveType === '3g' || (connection.downlink && connection.downlink > 1)) {
      return 'medium';
    } else {
      return 'slow';
    }
  }

  /**
   * Adjust performance targets based on device capabilities
   */
  private adjustPerformanceTargets(): void {
    const baseTargets = this.getDefaultPerformanceTargets();

    switch (this.performanceProfile.deviceClass) {
      case 'low-end':
        this.performanceTargets = {
          firstFeedback: baseTargets.firstFeedback * 1.5,
          optimisticExecution: baseTargets.optimisticExecution * 1.5,
          fullCompletion: baseTargets.fullCompletion * 1.3,
          rollbackExecution: baseTargets.rollbackExecution * 1.2,
          resourcePrefetch: baseTargets.resourcePrefetch * 1.1,
        };
        break;

      case 'mid-range':
        this.performanceTargets = {
          firstFeedback: baseTargets.firstFeedback * 1.2,
          optimisticExecution: baseTargets.optimisticExecution * 1.2,
          fullCompletion: baseTargets.fullCompletion * 1.1,
          rollbackExecution: baseTargets.rollbackExecution * 1.1,
          resourcePrefetch: baseTargets.resourcePrefetch,
        };
        break;

      case 'high-end':
        this.performanceTargets = {
          firstFeedback: baseTargets.firstFeedback * 0.8,
          optimisticExecution: baseTargets.optimisticExecution * 0.8,
          fullCompletion: baseTargets.fullCompletion * 0.9,
          rollbackExecution: baseTargets.rollbackExecution * 0.9,
          resourcePrefetch: baseTargets.resourcePrefetch * 0.9,
        };
        break;
    }

    logger.debug('Performance targets adjusted', {
      deviceClass: this.performanceProfile.deviceClass,
      targets: this.performanceTargets,
    });
  }

  /**
   * Metric collection helpers
   */
  private async collectPerformanceMetrics(): Promise<SystemMetrics['performance']> {
    // Calculate rolling averages from recent metrics
    const recentMetrics = this.metrics.slice(-10);

    if (recentMetrics.length === 0) {
      return {
        averageLatency: 0,
        throughput: 0,
        errorRate: 0,
        resourceUtilization: 0,
      };
    }

    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.performance.averageLatency, 0) / recentMetrics.length;
    const avgThroughput = recentMetrics.reduce((sum, m) => sum + m.performance.throughput, 0) / recentMetrics.length;
    const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.performance.errorRate, 0) / recentMetrics.length;
    const avgResourceUtil = recentMetrics.reduce((sum, m) => sum + m.performance.resourceUtilization, 0) / recentMetrics.length;

    return {
      averageLatency: avgLatency,
      throughput: avgThroughput,
      errorRate: avgErrorRate,
      resourceUtilization: avgResourceUtil,
    };
  }

  private async collectSystemMetrics(): Promise<SystemMetrics['system']> {
    // Collect system-level metrics
    let memoryUsage = 50; // Default fallback percentage
    
    if (hasMemoryAPI(performance) && performance.memory) {
      const memory = performance.memory;
      memoryUsage = (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100;
    }

    return {
      cpuUsage: 0, // Would be implemented with actual CPU monitoring
      memoryUsage,
      networkLatency: 0, // Would be measured via ping
      batteryDrain: 0, // Would be calculated from battery level changes
    };
  }

  // Placeholder methods for component metrics (would be injected in real implementation)
  private async getExecutionMetrics(): Promise<ExecutionMetrics> {
    return {
      totalOptimisticActions: 0,
      averageConfidence: 0,
      confidenceAccuracy: 0,
      averageFeedbackTime: 0,
      averageExecutionTime: 0,
      rollbackRate: 0,
      checkpointEfficiency: 0,
    };
  }

  private async getPredictionMetrics(): Promise<PredictionMetrics> {
    return {
      totalPredictions: 0,
      accuracyRate: 0,
      averageConfidence: 0,
      resourceHintEffectiveness: 0,
      speculativeHitRate: 0,
      falsePositiveRate: 0,
      timeToActionAccuracy: 0,
    };
  }

  private async getResourceMetrics(): Promise<ResourceMetrics> {
    return {
      totalHintsInjected: 0,
      successfulLoads: 0,
      loadTimeImprovement: 0,
      bandwidthSaved: 0,
      cacheHitRate: 0,
      criticalResourceTime: 0,
      speculativeAccuracy: 0,
    };
  }

  private async getRollbackMetrics(): Promise<RollbackMetrics> {
    return {
      totalRollbacks: 0,
      averageRollbackTime: 0,
      successRate: 0,
      partialRollbackRate: 0,
      stateCompressionRatio: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Helper methods for metric analysis
   */
  private async checkPerformanceTargets(metrics: SystemMetrics): Promise<void> {
    const targets = this.performanceTargets;
    const performance = metrics.performance;

    if (performance.averageLatency > targets.optimisticExecution) {
      this.createAlert('warning', 'averageLatency', performance.averageLatency, targets.optimisticExecution,
        'Consider reducing confidence thresholds or concurrent actions');
    }

    if (metrics.execution.averageFeedbackTime > targets.firstFeedback) {
      this.createAlert('warning', 'feedbackTime', metrics.execution.averageFeedbackTime, targets.firstFeedback,
        'Optimize immediate feedback mechanisms');
    }

    if (metrics.rollback.averageRollbackTime > targets.rollbackExecution) {
      this.createAlert('info', 'rollbackTime', metrics.rollback.averageRollbackTime, targets.rollbackExecution,
        'Consider optimizing rollback efficiency');
    }
  }

  private async analyzeTrends(current: SystemMetrics, previous: SystemMetrics): Promise<void> {
    const latencyTrend = current.performance.averageLatency - previous.performance.averageLatency;
    const errorTrend = current.performance.errorRate - previous.performance.errorRate;

    if (latencyTrend > this.performanceTargets.optimisticExecution * 0.1) {
      this.createAlert('warning', 'latencyTrend', latencyTrend, 0,
        'Performance degradation detected - consider optimization');
    }

    if (errorTrend > 0.05) {
      this.createAlert('error', 'errorTrend', errorTrend, 0,
        'Error rate increasing - review confidence thresholds');
    }
  }

  private async generatePerformanceAlerts(_metrics: SystemMetrics): Promise<void> {
    // Generate alerts based on current metrics and thresholds
    // This is a simplified implementation
  }

  private createAlert(
    level: PerformanceAlert['level'],
    metric: string,
    currentValue: number,
    targetValue: number,
    suggestion: string
  ): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      level,
      metric,
      currentValue,
      targetValue,
      deviation: Math.abs(currentValue - targetValue) / targetValue,
      timestamp: Date.now(),
      suggestion,
    };

    this.alerts.push(alert);

    // Limit alerts history
    if (this.alerts.length > this.config.maxAlertsHistory) {
      this.alerts.shift();
    }

    this.emit('performance_alert', alert);

    logger.warn('Performance alert generated', {
      level: alert.level,
      metric: alert.metric,
      deviation: `${Math.round(alert.deviation * 100)}%`,
      suggestion: alert.suggestion,
    });
  }

  private evaluateCondition(condition: StrategyCondition, value: number): boolean {
    switch (condition.operator) {
      case 'lt':
        return value < (condition.value as number);
      case 'gt':
        return value > (condition.value as number);
      case 'eq':
        return Math.abs(value - (condition.value as number)) < 0.001;
      case 'between':
        { const [min, max] = condition.value as [number, number];
        return value >= min && value <= max; }
      default:
        return false;
    }
  }

  private getMetricValue(metrics: SystemMetrics, metricPath: string): number | null {
    // Navigate nested metric paths like 'performance.averageLatency'
    const parts = metricPath.split('.');
    let value: any = metrics;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return typeof value === 'number' ? value : null;
  }

  /**
   * Default configurations
   */
  private getDefaultPerformanceProfile(): PerformanceProfile {
    return {
      deviceClass: 'mid-range',
      cpuBenchmark: 50000,
      memoryAvailable: 512,
      connectionSpeed: 'medium',
      lastUpdated: Date.now(),
    };
  }

  private getDefaultPerformanceTargets(): PerformanceTarget {
    return {
      firstFeedback: 100, // 100ms
      optimisticExecution: 200, // 200ms
      fullCompletion: 500, // 500ms
      rollbackExecution: 50, // 50ms
      resourcePrefetch: 10, // 10ms
    };
  }

  private getDefaultConfiguration(): AdaptiveConfiguration {
    return {
      optimisticExecution: {
        confidenceThresholds: {
          immediate: 0.9,
          optimistic: 0.7,
          speculative: 0.5,
        },
        maxConcurrentActions: 3,
        timeoutAdjustment: 1.0,
      },
      speculation: {
        maxActivePredictions: 5,
        confidenceThreshold: 0.6,
        predictionHorizon: 10000,
      },
      resources: {
        maxConcurrentPrefetches: 3,
        bandwidthAdaptation: true,
        criticalResourceTimeout: 1000,
      },
      rollback: {
        snapshotFrequency: 5,
        compressionThreshold: 1024,
        maxTransactions: 10,
      },
    };
  }

  /**
   * Public API
   */

  /**
   * Get current performance profile
   */
  getPerformanceProfile(): PerformanceProfile {
    return { ...this.performanceProfile };
  }

  /**
   * Get current performance targets
   */
  getPerformanceTargets(): PerformanceTarget {
    return { ...this.performanceTargets };
  }

  /**
   * Get current configuration
   */
  getCurrentConfiguration(): AdaptiveConfiguration {
    return JSON.parse(JSON.stringify(this.currentConfiguration));
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 10): SystemMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get current alerts
   */
  getCurrentAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Manual optimization trigger
   */
  async triggerOptimization(strategyId?: string): Promise<void> {
    if (strategyId && this.strategies.has(strategyId)) {
      const strategy = this.strategies.get(strategyId)!;
      const latestMetrics = this.metrics[this.metrics.length - 1];

      if (latestMetrics && await this.shouldApplyStrategy(strategy)) {
        await this.applyOptimizationStrategy(strategy, latestMetrics);
      }
    } else {
      await this.applyOptimizations();
    }
  }

  /**
   * Update performance targets
   */
  updatePerformanceTargets(targets: Partial<PerformanceTarget>): void {
    this.performanceTargets = { ...this.performanceTargets, ...targets };
    logger.info('Performance targets updated', { targets: this.performanceTargets });
  }

  /**
   * Add custom optimization strategy
   */
  addOptimizationStrategy(strategy: OptimizationStrategy): void {
    this.strategies.set(strategy.id, strategy);
    logger.info('Optimization strategy added', { strategy: strategy.name });
  }

  /**
   * Remove optimization strategy
   */
  removeOptimizationStrategy(strategyId: string): boolean {
    const removed = this.strategies.delete(strategyId);
    if (removed) {
      logger.info('Optimization strategy removed', { strategyId });
    }
    return removed;
  }

  /**
   * Clear all metrics and alerts
   */
  clearHistory(): void {
    this.metrics.length = 0;
    this.alerts.length = 0;
    this.optimizationHistory.length = 0;
    logger.debug('Performance history cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('PerformanceOptimizer configuration updated', { config: this.config });
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();