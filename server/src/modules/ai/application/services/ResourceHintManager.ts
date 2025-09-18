/**
 * Resource Hint Manager - Dynamic resource optimization for instant navigation
 *
 * Manages browser resource hints for optimal performance:
 * - Dynamic injection of <link rel="prefetch|preload|preconnect|dns-prefetch">
 * - Critical resource identification and prioritization
 * - Bandwidth-aware loading strategies
 * - Universal compatibility across all website structures
 * - Integration with SpeculativeNavigationPredictor
 * - Real-time performance monitoring and optimization
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils.js';
import type { ResourceHint, NavigationPrediction } from './SpeculativeNavigationPredictor.js';
import { 
  hasFetchPrioritySupport, 
  hasConnectionAPI,
  type HTMLLinkElementWithFetchPriority,
  type NavigatorExtended 
} from '../../../../types/browser-apis.js';

const logger = createLogger({ service: 'resource-hint-manager' });

export interface ResourceOptimization {
  id: string;
  type: 'critical' | 'important' | 'prefetch' | 'speculative';
  resource: string;
  priority: 'high' | 'medium' | 'low';
  estimatedSize: number;
  loadingStrategy: LoadingStrategy;
  performanceImpact: number;
  injectionTime: number;
  status: 'pending' | 'injected' | 'loaded' | 'failed' | 'cancelled';
}

export interface LoadingStrategy {
  method: 'preload' | 'prefetch' | 'preconnect' | 'dns-prefetch' | 'modulepreload';
  timing: 'immediate' | 'idle' | 'interaction' | 'viewport';
  conditions: string[];
  fallback?: string;
}

export interface BandwidthProfile {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink: number; // Mbps
  rtt: number; // Round-trip time in ms
  saveData: boolean;
  lastUpdated: number;
}

export interface PerformanceMetrics {
  totalHintsInjected: number;
  successfulLoads: number;
  loadTimeImprovement: number;
  bandwidthSaved: number;
  cacheHitRate: number;
  criticalResourceTime: number;
  speculativeAccuracy: number;
}

export interface ResourceCache {
  url: string;
  cached: boolean;
  lastAccessed: number;
  hitCount: number;
  size: number;
  type: 'document' | 'script' | 'style' | 'image' | 'font' | 'other';
}

/**
 * Resource Hint Manager
 * Optimizes resource loading for instant navigation experience
 */
export class ResourceHintManager extends EventEmitter {
  private isInitialized = false;

  // Resource management
  private activeOptimizations = new Map<string, ResourceOptimization>();
  private resourceCache = new Map<string, ResourceCache>();
  private injectedHints = new Set<string>();

  // Performance tracking
  private bandwidthProfile: BandwidthProfile;
  private metrics: PerformanceMetrics = {
    totalHintsInjected: 0,
    successfulLoads: 0,
    loadTimeImprovement: 0,
    bandwidthSaved: 0,
    cacheHitRate: 0,
    criticalResourceTime: 0,
    speculativeAccuracy: 0,
  };

  // Configuration
  private config = {
    maxConcurrentPrefetches: 3,
    maxSpeculativeLoads: 5,
    criticalResourceTimeout: 1000,
    prefetchTimeout: 5000,
    cacheMaxAge: 30 * 60 * 1000, // 30 minutes
    bandwidthThresholds: {
      '4g': { maxPrefetch: 10, maxSpeculative: 5 },
      '3g': { maxPrefetch: 5, maxSpeculative: 2 },
      '2g': { maxPrefetch: 2, maxSpeculative: 1 },
      'slow-2g': { maxPrefetch: 1, maxSpeculative: 0 },
    },
  };

  constructor() {
    super();
    this.bandwidthProfile = this.getDefaultBandwidthProfile();
    this.initialize();
  }

  /**
   * Initialize the resource hint manager
   */
  private async initialize(): Promise<void> {
    try {
      this.setupBandwidthMonitoring();
      this.setupCleanupInterval();
      this.detectExistingResources();

      this.isInitialized = true;
      logger.info('ResourceHintManager initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize ResourceHintManager', { error });
      throw error;
    }
  }

  /**
   * Process predictions and inject appropriate resource hints
   */
  async processPredictions(predictions: NavigationPrediction[]): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('ResourceHintManager not initialized');
      return;
    }

    try {
      logger.debug('Processing predictions for resource hints', {
        count: predictions.length,
        bandwidth: this.bandwidthProfile.effectiveType,
      });

      // Sort predictions by confidence and impact
      const sortedPredictions = predictions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.getBandwidthLimits().maxSpeculative);

      for (const prediction of sortedPredictions) {
        await this.processPredictionHints(prediction);
      }

      this.emit('predictions_processed', {
        processed: sortedPredictions.length,
        skipped: predictions.length - sortedPredictions.length,
        bandwidth: this.bandwidthProfile.effectiveType,
      });

    } catch (error) {
      logger.error('Failed to process predictions', { error });
    }
  }

  /**
   * Process individual prediction resource hints
   */
  private async processPredictionHints(prediction: NavigationPrediction): Promise<void> {
    for (const hint of prediction.resourceHints) {
      await this.injectResourceHint(hint, prediction);
    }
  }

  /**
   * Inject resource hint into the DOM
   */
  async injectResourceHint(
    hint: ResourceHint,
    prediction?: NavigationPrediction
  ): Promise<ResourceOptimization> {
    const optimizationId = this.generateOptimizationId();

    try {
      // Check if resource is already cached
      const cached = this.resourceCache.get(hint.resource);
      if (cached && cached.cached) {
        logger.debug('Resource already cached, skipping hint', { resource: hint.resource });

        return this.createOptimization(optimizationId, hint, prediction, 'loaded');
      }

      // Check bandwidth constraints
      if (!this.shouldLoadResource(hint)) {
        logger.debug('Bandwidth constraints prevent resource loading', {
          resource: hint.resource,
          bandwidth: this.bandwidthProfile.effectiveType,
        });

        return this.createOptimization(optimizationId, hint, prediction, 'cancelled');
      }

      // Create optimization entry
      const optimization = this.createOptimization(optimizationId, hint, prediction, 'pending');
      this.activeOptimizations.set(optimizationId, optimization);

      // Inject the actual hint
      await this.performHintInjection(hint, optimization);

      // Update metrics
      this.metrics.totalHintsInjected++;

      logger.info('Resource hint injected', {
        type: hint.type,
        resource: hint.resource,
        priority: hint.priority,
        optimizationId,
      });

      return optimization;

    } catch (error) {
      logger.error('Failed to inject resource hint', { error, hint });

      const optimization = this.createOptimization(optimizationId, hint, prediction, 'failed');
      this.activeOptimizations.set(optimizationId, optimization);

      return optimization;
    }
  }

  /**
   * Perform the actual hint injection
   */
  private async performHintInjection(
    hint: ResourceHint,
    optimization: ResourceOptimization
  ): Promise<void> {
    // Create resource hint element
    const linkElement = this.createLinkElement(hint);

    // Set up load monitoring
    this.setupLoadMonitoring(linkElement, optimization);

    // Inject into DOM
    this.injectIntoDOM(linkElement, hint);

    // Mark as injected
    optimization.status = 'injected';
    optimization.injectionTime = Date.now();

    // Add to injected hints set
    this.injectedHints.add(hint.resource);

    this.emit('hint_injected', {
      optimization,
      element: linkElement,
      timestamp: Date.now(),
    });
  }

  /**
   * Create link element for resource hint
   */
  private createLinkElement(hint: ResourceHint): HTMLLinkElement {
    const link = document.createElement('link');

    // Set basic attributes
    link.rel = hint.type;
    link.href = hint.resource;

    // Set priority if supported
    if (hasFetchPrioritySupport(link)) {
      const fetchPriority = hint.priority === 'medium' ? 'auto' : hint.priority;
      link.fetchPriority = fetchPriority;
    }

    // Set crossorigin if specified
    if (hint.crossorigin) {
      link.crossOrigin = 'anonymous';
    }

    // Set media query if specified
    if (hint.media) {
      link.media = hint.media;
    }

    // Add data attributes for tracking
    link.setAttribute('data-optimization-id', this.generateOptimizationId());
    link.setAttribute('data-injection-time', Date.now().toString());

    return link;
  }

  /**
   * Setup load monitoring for resource hint
   */
  private setupLoadMonitoring(
    element: HTMLLinkElement,
    optimization: ResourceOptimization
  ): void {
    const startTime = Date.now();

    element.addEventListener('load', () => {
      const loadTime = Date.now() - startTime;

      optimization.status = 'loaded';
      optimization.performanceImpact = loadTime;

      // Update cache
      this.updateResourceCache(optimization.resource, true, loadTime);

      // Update metrics
      this.metrics.successfulLoads++;
      this.updateLoadTimeMetrics(loadTime);

      this.emit('resource_loaded', {
        optimization,
        loadTime,
        timestamp: Date.now(),
      });

      logger.debug('Resource loaded successfully', {
        resource: optimization.resource,
        loadTime,
        optimizationId: optimization.id,
      });
    });

    element.addEventListener('error', () => {
      optimization.status = 'failed';

      this.emit('resource_failed', {
        optimization,
        timestamp: Date.now(),
      });

      logger.warn('Resource failed to load', {
        resource: optimization.resource,
        optimizationId: optimization.id,
      });
    });

    // Setup timeout
    const timeout = optimization.type === 'critical'
      ? this.config.criticalResourceTimeout
      : this.config.prefetchTimeout;

    setTimeout(() => {
      if (optimization.status === 'injected') {
        optimization.status = 'failed';

        this.emit('resource_timeout', {
          optimization,
          timeout,
          timestamp: Date.now(),
        });
      }
    }, timeout);
  }

  /**
   * Inject link element into DOM
   */
  private injectIntoDOM(element: HTMLLinkElement, hint: ResourceHint): void {
    // Find the best location to inject the hint
    const head = document.head;
    const existingHints = head.querySelectorAll(`link[rel="${hint.type}"]`);

    if (hint.priority === 'high') {
      // Insert high-priority hints at the beginning
      head.insertBefore(element, head.firstChild);
    } else if (existingHints.length > 0) {
      // Insert after existing hints of the same type
      const lastHint = existingHints[existingHints.length - 1];
      head.insertBefore(element, lastHint.nextSibling);
    } else {
      // Append to head
      head.appendChild(element);
    }
  }

  /**
   * Identify and optimize critical resources
   */
  async optimizeCriticalResources(pageUrl: string): Promise<ResourceOptimization[]> {
    const optimizations: ResourceOptimization[] = [];

    try {
      // Analyze current page resources
      const criticalResources = await this.identifyCriticalResources(pageUrl);

      for (const resource of criticalResources) {
        const hint: ResourceHint = {
          type: 'preload',
          resource: resource.url,
          priority: 'high',
        };

        const optimization = await this.injectResourceHint(hint);
        optimizations.push(optimization);
      }

      logger.info('Critical resources optimized', {
        count: optimizations.length,
        pageUrl,
      });

    } catch (error) {
      logger.error('Failed to optimize critical resources', { error, pageUrl });
    }

    return optimizations;
  }

  /**
   * Identify critical resources for a page
   */
  private async identifyCriticalResources(pageUrl: string): Promise<Array<{ url: string; type: string }>> {
    // This would analyze the page to identify critical resources
    // For now, return common critical resource patterns

    const criticalResources = [
      { url: `${pageUrl}/critical.css`, type: 'style' },
      { url: `${pageUrl}/app.js`, type: 'script' },
      { url: `${pageUrl}/fonts/main.woff2`, type: 'font' },
    ];

    return criticalResources.filter(resource =>
      !this.injectedHints.has(resource.url)
    );
  }

  /**
   * Setup bandwidth monitoring
   */
  private setupBandwidthMonitoring(): void {
    // Monitor network information if available
    if (hasConnectionAPI(navigator) && navigator.connection) {
      const connection = navigator.connection;

      this.updateBandwidthProfile(connection);

      connection.addEventListener('change', () => {
        this.updateBandwidthProfile(connection);
      });
    }

    // Fallback bandwidth detection via timing
    this.detectBandwidthViaRTT();
  }

  /**
   * Update bandwidth profile from connection API
   */
  private updateBandwidthProfile(connection: import('../../../../types/browser-apis.js').NetworkInformation): void {
    this.bandwidthProfile = {
      effectiveType: connection.effectiveType || '4g',
      downlink: connection.downlink || 10,
      rtt: connection.rtt || 100,
      saveData: connection.saveData || false,
      lastUpdated: Date.now(),
    };

    this.emit('bandwidth_updated', this.bandwidthProfile);

    logger.debug('Bandwidth profile updated', this.bandwidthProfile);
  }

  /**
   * Detect bandwidth via RTT measurement
   */
  private detectBandwidthViaRTT(): void {
    const startTime = Date.now();

    fetch('/api/ping', { method: 'HEAD' })
      .then(() => {
        const rtt = Date.now() - startTime;

        // Update RTT in bandwidth profile
        this.bandwidthProfile.rtt = (this.bandwidthProfile.rtt + rtt) / 2;
        this.bandwidthProfile.lastUpdated = Date.now();

        // Estimate effective type based on RTT
        if (rtt < 50) {this.bandwidthProfile.effectiveType = '4g';}
        else if (rtt < 200) {this.bandwidthProfile.effectiveType = '3g';}
        else if (rtt < 500) {this.bandwidthProfile.effectiveType = '2g';}
        else {this.bandwidthProfile.effectiveType = 'slow-2g';}
      })
      .catch(() => {
        // Fallback to conservative estimate
        this.bandwidthProfile.effectiveType = '3g';
      });
  }

  /**
   * Setup cleanup interval for optimization management
   */
  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupCompletedOptimizations();
      this.cleanupExpiredCache();
    }, 60000); // 1 minute intervals
  }

  /**
   * Clean up completed optimizations
   */
  private cleanupCompletedOptimizations(): void {
    const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes

    for (const [id, optimization] of this.activeOptimizations.entries()) {
      if (optimization.injectionTime < cutoff &&
          ['loaded', 'failed', 'cancelled'].includes(optimization.status)) {
        this.activeOptimizations.delete(id);
      }
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const cutoff = Date.now() - this.config.cacheMaxAge;

    for (const [url, cache] of this.resourceCache.entries()) {
      if (cache.lastAccessed < cutoff) {
        this.resourceCache.delete(url);
      }
    }
  }

  /**
   * Detect existing resources in the page
   */
  private detectExistingResources(): void {
    // Scan existing link elements
    const existingLinks = document.querySelectorAll('link[rel*="preload"], link[rel*="prefetch"]');

    existingLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        this.injectedHints.add(href);
        this.updateResourceCache(href, true, 0);
      }
    });

    logger.debug('Detected existing resource hints', { count: existingLinks.length });
  }

  /**
   * Helper methods
   */
  private createOptimization(
    id: string,
    hint: ResourceHint,
    prediction?: NavigationPrediction,
    status: ResourceOptimization['status'] = 'pending'
  ): ResourceOptimization {
    return {
      id,
      type: this.mapHintToOptimizationType(hint.type),
      resource: hint.resource,
      priority: hint.priority,
      estimatedSize: this.estimateResourceSize(hint.resource),
      loadingStrategy: this.createLoadingStrategy(hint),
      performanceImpact: 0,
      injectionTime: Date.now(),
      status,
    };
  }

  private mapHintToOptimizationType(hintType: ResourceHint['type']): ResourceOptimization['type'] {
    switch (hintType) {
      case 'preload': return 'critical';
      case 'prefetch': return 'prefetch';
      case 'preconnect':
      case 'dns-prefetch': return 'speculative';
      default: return 'important';
    }
  }

  private createLoadingStrategy(hint: ResourceHint): LoadingStrategy {
    return {
      method: hint.type as LoadingStrategy['method'],
      timing: hint.priority === 'high' ? 'immediate' : 'idle',
      conditions: [],
      fallback: undefined,
    };
  }

  private estimateResourceSize(url: string): number {
    // Estimate resource size based on URL patterns
    if (url.includes('.js')) {return 50000;} // 50KB average
    if (url.includes('.css')) {return 20000;} // 20KB average
    if (url.includes('.woff2')) {return 30000;} // 30KB average
    if (url.includes('.jpg') || url.includes('.png')) {return 100000;} // 100KB average
    return 10000; // 10KB default
  }

  private shouldLoadResource(hint: ResourceHint): boolean {
    const limits = this.getBandwidthLimits();
    const currentPrefetches = Array.from(this.activeOptimizations.values())
      .filter(opt => opt.type === 'prefetch' && opt.status === 'injected').length;

    // Check save data preference
    if (this.bandwidthProfile.saveData && hint.priority !== 'high') {
      return false;
    }

    // Check concurrent limits
    if (hint.type === 'prefetch' && currentPrefetches >= limits.maxPrefetch) {
      return false;
    }

    return true;
  }

  private getBandwidthLimits() {
    return this.config.bandwidthThresholds[this.bandwidthProfile.effectiveType];
  }

  private updateResourceCache(url: string, cached: boolean, loadTime: number): void {
    const existing = this.resourceCache.get(url);

    if (existing) {
      existing.cached = cached;
      existing.lastAccessed = Date.now();
      existing.hitCount++;
    } else {
      this.resourceCache.set(url, {
        url,
        cached,
        lastAccessed: Date.now(),
        hitCount: 1,
        size: this.estimateResourceSize(url),
        type: this.getResourceType(url),
      });
    }
  }

  private getResourceType(url: string): ResourceCache['type'] {
    if (url.includes('.js')) {return 'script';}
    if (url.includes('.css')) {return 'style';}
    if (url.includes('.woff') || url.includes('.ttf')) {return 'font';}
    if (url.includes('.jpg') || url.includes('.png') || url.includes('.svg')) {return 'image';}
    if (url.includes('.html')) {return 'document';}
    return 'other';
  }

  private updateLoadTimeMetrics(loadTime: number): void {
    this.metrics.loadTimeImprovement =
      (this.metrics.loadTimeImprovement + Math.max(0, 1000 - loadTime)) / 2;
  }

  private getDefaultBandwidthProfile(): BandwidthProfile {
    return {
      effectiveType: '4g',
      downlink: 10,
      rtt: 100,
      saveData: false,
      lastUpdated: Date.now(),
    };
  }

  private generateOptimizationId(): string {
    return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Public API methods
   */

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get bandwidth profile
   */
  getBandwidthProfile(): BandwidthProfile {
    return { ...this.bandwidthProfile };
  }

  /**
   * Get active optimizations
   */
  getActiveOptimizations(): ResourceOptimization[] {
    return Array.from(this.activeOptimizations.values());
  }

  /**
   * Cancel optimization
   */
  cancelOptimization(optimizationId: string): boolean {
    const optimization = this.activeOptimizations.get(optimizationId);

    if (optimization && optimization.status === 'pending') {
      optimization.status = 'cancelled';
      return true;
    }

    return false;
  }

  /**
   * Clear all active optimizations
   */
  clearOptimizations(): void {
    this.activeOptimizations.clear();
    this.injectedHints.clear();
    logger.debug('All optimizations cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('ResourceHintManager configuration updated', { config: this.config });
  }
}

// Export singleton instance
export const resourceHintManager = new ResourceHintManager();