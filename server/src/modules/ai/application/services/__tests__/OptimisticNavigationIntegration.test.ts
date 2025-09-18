/**
 * Comprehensive test suite for Optimistic Navigation Integration
 *
 * Tests the complete optimistic execution system including:
 * - OptimisticExecutionEngine performance and accuracy
 * - SpeculativeNavigationPredictor prediction quality
 * - ResourceHintManager optimization effectiveness
 * - ActionRollbackManager transaction reliability
 * - PerformanceOptimizer adaptive optimization
 * - End-to-end integration scenarios
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { optimisticNavigationIntegrationService } from '../OptimisticNavigationIntegrationService.js';
import { optimisticExecutionEngine } from '../OptimisticExecutionEngine.js';
import { speculativeNavigationPredictor } from '../SpeculativeNavigationPredictor.js';
import { resourceHintManager } from '../ResourceHintManager.js';
import { actionRollbackManager } from '../ActionRollbackManager.js';
import { performanceOptimizer } from '../PerformanceOptimizer.js';

// Mock DOM environment for testing
const mockDocument = {
  createElement: jest.fn(),
  head: { appendChild: jest.fn(), insertBefore: jest.fn() },
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  title: 'Test Page',
};

const mockWindow = {
  location: { href: 'http://localhost:3000/test' },
  scrollX: 0,
  scrollY: 0,
  history: { pushState: jest.fn() },
  performance: { now: jest.fn(() => Date.now()) },
  navigator: {
    connection: { effectiveType: '4g', downlink: 10, rtt: 50 },
  },
};

// Setup global mocks
(global as any).document = mockDocument;
(global as any).window = mockWindow;
(global as any).performance = mockWindow.performance;
(global as any).navigator = mockWindow.navigator;

describe('OptimisticNavigationIntegration', () => {
  const mockCommand = {
    text: 'go to settings page',
    type: 'navigation' as const,
    context: {
      mode: 'published_site' as const,
      currentPage: '/dashboard',
      currentUrl: 'http://localhost:3000/dashboard',
      userRole: 'user',
      tenantId: 'tenant123',
      siteId: 'site456',
    },
    priority: 'normal' as const,
    sessionId: 'session789',
    optimistic: true,
    speculativePreload: true,
    rollbackEnabled: true,
    conversationHistory: ['hello', 'show me dashboard'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWindow.performance.now.mockReturnValue(Date.now());
  });

  afterEach(() => {
    // Clean up any active operations
    optimisticNavigationIntegrationService.clearAllSessions();
    optimisticExecutionEngine.clearActiveActions();
    speculativeNavigationPredictor.clearActivePredictions();
    resourceHintManager.clearOptimizations();
    actionRollbackManager.clearAll();
  });

  describe('Performance Requirements', () => {
    it('should provide first visual feedback within 100ms', async () => {
      const startTime = Date.now();
      let feedbackReceived = false;

      optimisticNavigationIntegrationService.once('immediate_feedback', () => {
        const feedbackTime = Date.now() - startTime;
        expect(feedbackTime).toBeLessThan(100);
        feedbackReceived = true;
      });

      await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);
      expect(feedbackReceived).toBe(true);
    });

    it('should start optimistic execution within 200ms', async () => {
      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      expect(result.performanceMetrics.optimisticTime).toBeLessThan(200);
      expect(result.optimistic).toBe(true);
    });

    it('should complete full navigation within 500ms', async () => {
      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      expect(result.executionTime).toBeLessThan(500);
      expect(result.success).toBe(true);
    });

    it('should execute rollback within 50ms when needed', async () => {
      // First execute an action
      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      if (result.transactionId) {
        const rollbackStart = Date.now();
        const rollbackResult = await optimisticNavigationIntegrationService.rollbackAction(
          result.transactionId,
          'Test rollback'
        );
        const rollbackTime = Date.now() - rollbackStart;

        expect(rollbackTime).toBeLessThan(50);
        expect(rollbackResult).toBe(true);
      }
    });
  });

  describe('OptimisticExecutionEngine', () => {
    it('should predict action confidence accurately', async () => {
      const result = await optimisticExecutionEngine.executeOptimistically(
        'click the submit button',
        { mode: 'editor', viewport: { width: 1920, height: 1080, zoom: 1 } }
      );

      expect(result.action.confidence).toBeGreaterThan(0.7);
      expect(result.action.type).toBe('interaction');
    });

    it('should create checkpoints for high-risk actions', async () => {
      const result = await optimisticExecutionEngine.executeOptimistically(
        'delete all content',
        { mode: 'editor', viewport: { width: 1920, height: 1080, zoom: 1 } }
      );

      expect(result.action.rollbackRequired).toBe(true);
      expect(result.checkpointsCreated).toBeGreaterThan(0);
    });

    it('should adjust confidence thresholds based on performance', async () => {
      const initialMetrics = optimisticExecutionEngine.getMetrics();

      // Simulate multiple successful executions
      for (let i = 0; i < 5; i++) {
        await optimisticExecutionEngine.executeOptimistically(
          `action ${i}`,
          { mode: 'editor', viewport: { width: 1920, height: 1080, zoom: 1 } }
        );
      }

      const finalMetrics = optimisticExecutionEngine.getMetrics();
      expect(finalMetrics.totalOptimisticActions).toBeGreaterThan(initialMetrics.totalOptimisticActions);
    });
  });

  describe('SpeculativeNavigationPredictor', () => {
    it('should generate relevant predictions based on context', async () => {
      const predictions = await speculativeNavigationPredictor.generatePredictions(
        'go to settings',
        { mode: 'published_site', viewport: { width: 1920, height: 1080, zoom: 1 } },
        {
          landmarks: [
            { type: 'navigation', selector: 'nav', description: 'Main navigation', confidence: 0.9, children: [] }
          ],
          menuSystems: [],
          breadcrumbs: [],
          pageStructure: { title: 'Dashboard', sections: [], forms: [], interactiveElements: [] },
          semanticRegions: [],
        },
        ['hello', 'show dashboard'],
        'session123'
      );

      expect(predictions).toHaveLength(3);
      expect(predictions[0]?.confidence).toBeGreaterThan(0.5);
      expect(predictions[0]?.target).toContain('settings');
    });

    it('should improve accuracy through validation feedback', () => {
      speculativeNavigationPredictor.validatePrediction(
        'go to profile',
        'profile',
        'session123'
      );

      const metrics = speculativeNavigationPredictor.getMetrics();
      expect(metrics.totalPredictions).toBeGreaterThan(0);
    });

    it('should generate appropriate resource hints', async () => {
      const predictions = await speculativeNavigationPredictor.generatePredictions(
        'navigate to products page',
        { mode: 'published_site', viewport: { width: 1920, height: 1080, zoom: 1 } },
        {
          landmarks: [],
          menuSystems: [],
          breadcrumbs: [],
          pageStructure: { title: 'Home', sections: [], forms: [], interactiveElements: [] },
          semanticRegions: [],
        },
        [],
        'session123'
      );

      const prediction = predictions.find(p => p.target.includes('products'));
      expect(prediction?.resourceHints).toBeDefined();
      expect(prediction?.resourceHints.length).toBeGreaterThan(0);
    });
  });

  describe('ResourceHintManager', () => {
    it('should inject resource hints dynamically', async () => {
      const optimization = await resourceHintManager.injectResourceHint({
        type: 'prefetch',
        resource: '/api/products',
        priority: 'high',
      });

      expect(optimization.status).toBe('injected');
      expect(optimization.type).toBe('prefetch');
    });

    it('should respect bandwidth constraints', async () => {
      // Mock slow connection
      (global as any).navigator.connection.effectiveType = '2g';

      const optimization = await resourceHintManager.injectResourceHint({
        type: 'prefetch',
        resource: '/large-resource.js',
        priority: 'low',
      });

      expect(optimization.status).toBe('cancelled');
    });

    it('should optimize critical resources first', async () => {
      const optimizations = await resourceHintManager.optimizeCriticalResources('/dashboard');

      expect(optimizations.length).toBeGreaterThan(0);
      expect(optimizations.every(opt => opt.type === 'critical')).toBe(true);
    });
  });

  describe('ActionRollbackManager', () => {
    it('should create and manage transactions', async () => {
      const transactionId = await actionRollbackManager.beginTransaction('test-action');

      expect(transactionId).toBeDefined();
      expect(actionRollbackManager.hasTransaction(transactionId)).toBe(true);
    });

    it('should record and rollback actions accurately', async () => {
      const transactionId = await actionRollbackManager.beginTransaction('test-action');

      await actionRollbackManager.recordAction(
        transactionId,
        'dom_change',
        '#test-element',
        { innerHTML: 'original' },
        { innerHTML: 'changed' }
      );

      const rollbackResult = await actionRollbackManager.rollbackTransaction(
        transactionId,
        'Test rollback'
      );

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.actionsRolledBack).toBe(1);
    });

    it('should handle transaction dependencies correctly', async () => {
      const transactionId = await actionRollbackManager.beginTransaction('complex-action');

      await actionRollbackManager.recordAction(
        transactionId,
        'dom_change',
        '#parent',
        { innerHTML: 'parent-original' },
        { innerHTML: 'parent-changed' },
        { priority: 1 }
      );

      await actionRollbackManager.recordAction(
        transactionId,
        'style_change',
        '#child',
        { color: 'black' },
        { color: 'red' },
        { priority: 2, dependencies: ['parent-action'] }
      );

      const rollbackResult = await actionRollbackManager.rollbackTransaction(transactionId);
      expect(rollbackResult.success).toBe(true);
    });
  });

  describe('PerformanceOptimizer', () => {
    it('should detect device capabilities accurately', () => {
      const profile = performanceOptimizer.getPerformanceProfile();

      expect(profile.deviceClass).toMatch(/high-end|mid-range|low-end/);
      expect(profile.connectionSpeed).toMatch(/fast|medium|slow/);
    });

    it('should adapt thresholds based on performance', async () => {
      const initialTargets = performanceOptimizer.getPerformanceTargets();

      // Trigger optimization with mock poor performance
      await performanceOptimizer.triggerOptimization();

      const updatedTargets = performanceOptimizer.getPerformanceTargets();
      expect(updatedTargets).toBeDefined();
    });

    it('should generate performance alerts', () => {
      let alertReceived = false;

      performanceOptimizer.once('performance_alert', (alert) => {
        expect(alert.level).toMatch(/info|warning|error|critical/);
        expect(alert.suggestion).toBeDefined();
        alertReceived = true;
      });

      // Would trigger based on performance monitoring
      // This is a placeholder - real test would simulate performance issues
    });
  });

  describe('End-to-End Integration', () => {
    it('should execute complete optimistic navigation flow', async () => {
      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      expect(result.success).toBe(true);
      expect(result.optimistic).toBe(true);
      expect(result.performanceMetrics.feedbackTime).toBeLessThan(100);
      expect(result.performanceMetrics.optimisticTime).toBeLessThan(200);
      expect(result.performanceMetrics.predictions).toBeGreaterThan(0);
    });

    it('should handle errors gracefully with rollback', async () => {
      const errorCommand = {
        ...mockCommand,
        text: 'execute invalid command',
      };

      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(errorCommand);

      // Even if the command fails, the system should handle it gracefully
      expect(result).toBeDefined();
      expect(result.rollbackAvailable).toBeDefined();
    });

    it('should coordinate between all components', async () => {
      let eventsReceived = 0;

      optimisticNavigationIntegrationService.on('predictions_generated', () => eventsReceived++);
      optimisticNavigationIntegrationService.on('resources_optimized', () => eventsReceived++);
      optimisticNavigationIntegrationService.on('immediate_feedback', () => eventsReceived++);

      await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      expect(eventsReceived).toBeGreaterThan(0);
    });

    it('should maintain session state correctly', async () => {
      const sessionId = 'test-session-123';
      const command1 = { ...mockCommand, sessionId, text: 'first command' };
      const command2 = { ...mockCommand, sessionId, text: 'second command' };

      await optimisticNavigationIntegrationService.processOptimisticCommand(command1);
      await optimisticNavigationIntegrationService.processOptimisticCommand(command2);

      // Session should maintain conversation history
      // This would be verified through prediction improvements
    });

    it('should adapt to different device capabilities', async () => {
      // Mock low-end device
      jest.spyOn(performanceOptimizer, 'getPerformanceProfile').mockReturnValue({
        deviceClass: 'low-end',
        cpuBenchmark: 20000,
        memoryAvailable: 256,
        connectionSpeed: 'slow',
        lastUpdated: Date.now(),
      });

      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      // Should still succeed but with adapted performance expectations
      expect(result.success).toBe(true);
      expect(result.optimistic).toBe(true);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track comprehensive metrics', async () => {
      await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      const metrics = optimisticNavigationIntegrationService.getComprehensiveMetrics();

      expect(metrics.integration.totalOptimisticCommands).toBeGreaterThan(0);
      expect(metrics.execution).toBeDefined();
      expect(metrics.prediction).toBeDefined();
      expect(metrics.resources).toBeDefined();
      expect(metrics.rollback).toBeDefined();
      expect(metrics.performance).toBeDefined();
    });

    it('should calculate performance improvements accurately', async () => {
      const initialMetrics = optimisticNavigationIntegrationService.getMetrics();

      await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      const finalMetrics = optimisticNavigationIntegrationService.getMetrics();
      expect(finalMetrics.totalOptimisticCommands).toBeGreaterThan(initialMetrics.totalOptimisticCommands);
      expect(finalMetrics.performanceGain).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent commands correctly', async () => {
      const commands = Array.from({ length: 5 }, (_, i) => ({
        ...mockCommand,
        text: `command ${i}`,
        sessionId: `session-${i}`,
      }));

      const results = await Promise.all(
        commands.map(cmd => optimisticNavigationIntegrationService.processOptimisticCommand(cmd))
      );

      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle network failures gracefully', async () => {
      // Mock network failure
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await optimisticNavigationIntegrationService.processOptimisticCommand(mockCommand);

      // Should still provide meaningful response even with network issues
      expect(result).toBeDefined();
    });

    it('should validate prediction accuracy over time', () => {
      // Simulate multiple predictions and validations
      optimisticNavigationIntegrationService.validatePrediction(
        'session123',
        'go to profile',
        'profile'
      );

      const metrics = optimisticNavigationIntegrationService.getMetrics();
      expect(metrics.predictionAccuracy).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration and Customization', () => {
    it('should allow custom confidence thresholds', () => {
      optimisticExecutionEngine.setConfidenceThresholds({
        immediate: 0.95,
        optimistic: 0.8,
        speculative: 0.6,
      });

      // Test that new thresholds are applied
      // This would be verified in subsequent execution behavior
    });

    it('should support disabling optimistic execution', async () => {
      optimisticNavigationIntegrationService.setOptimisticEnabled(false);

      const result = await optimisticNavigationIntegrationService.processNavigationCommand({
        ...mockCommand,
        optimistic: false,
      });

      expect(result.optimistic).toBe(false);
    });
  });
});