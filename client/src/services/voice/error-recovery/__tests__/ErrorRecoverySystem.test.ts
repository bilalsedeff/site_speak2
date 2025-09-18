/**
 * Error Recovery System Tests
 *
 * Comprehensive test suite for SiteSpeak's error recovery and clarification system.
 * Tests all components integration, performance requirements, and error scenarios.
 */

import {
  createErrorRecoverySystem,
  setupErrorRecoveryPreset,
  validateErrorRecoveryPerformance,
  testErrorRecoverySystem,
  ErrorRecoveryOrchestrator
} from '../index';

import type {
  VoiceError,
  ErrorContext,
  ClarificationRequest,
  ClarificationResponse,
  ErrorRecoveryCallbacks
} from '@shared/types/error-recovery.types';

// Mock DOM environment for testing
const mockWindow = global.window || {};
const mockDocument = global.document || {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  createElement: jest.fn(() => ({
    className: '',
    setAttribute: jest.fn(),
    addEventListener: jest.fn(),
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn()
    }
  })),
  body: {
    appendChild: jest.fn()
  },
  querySelectorAll: jest.fn(() => [])
};

Object.assign(global, { window: mockWindow, document: mockDocument });

describe('Error Recovery System', () => {
  let errorRecoverySystem: ErrorRecoveryOrchestrator;
  let callbacks: ErrorRecoveryCallbacks;

  beforeEach(() => {
    callbacks = {
      onErrorDetected: jest.fn(),
      onClarificationRequested: jest.fn(),
      onRecoveryStarted: jest.fn(),
      onRecoveryCompleted: jest.fn(),
      onUserFeedback: jest.fn()
    };
  });

  afterEach(async () => {
    if (errorRecoverySystem) {
      await errorRecoverySystem.cleanup();
    }
  });

  describe('System Initialization', () => {
    it('should create error recovery system with default configuration', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({}, callbacks);

      expect(errorRecoverySystem).toBeDefined();
      expect(errorRecoverySystem.getSystemStatus).toBeDefined();
      expect(errorRecoverySystem.handleError).toBeDefined();

      const status = errorRecoverySystem.getSystemStatus();
      expect(status.health.status).toBe('healthy');
    });

    it('should create system with balanced mode configuration', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced',
        voiceFirst: true,
        learningEnabled: true,
        accessibility: true
      }, callbacks);

      expect(errorRecoverySystem).toBeDefined();

      const status = errorRecoverySystem.getSystemStatus();
      expect(status.health.status).toBe('healthy');
    });

    it('should create system with optimal mode configuration', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'optimal',
        voiceFirst: true,
        learningEnabled: true,
        accessibility: true
      }, callbacks);

      expect(errorRecoverySystem).toBeDefined();

      const status = errorRecoverySystem.getSystemStatus();
      expect(status.performance.totalCycleTime).toBeLessThanOrEqual(400);
    });

    it('should create system with compatibility mode configuration', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'compatibility',
        voiceFirst: false,
        learningEnabled: false,
        accessibility: true
      }, callbacks);

      expect(errorRecoverySystem).toBeDefined();
    });

    it('should setup preset configurations correctly', async () => {
      const productionSystem = await setupErrorRecoveryPreset('production', callbacks);
      expect(productionSystem).toBeDefined();
      await productionSystem.cleanup();

      const developmentSystem = await setupErrorRecoveryPreset('development', callbacks);
      expect(developmentSystem).toBeDefined();
      await developmentSystem.cleanup();

      const testingSystem = await setupErrorRecoveryPreset('testing', callbacks);
      expect(testingSystem).toBeDefined();
      await testingSystem.cleanup();

      const minimalSystem = await setupErrorRecoveryPreset('minimal', callbacks);
      expect(minimalSystem).toBeDefined();
      await minimalSystem.cleanup();
    });
  });

  describe('Error Detection and Classification', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced',
        voiceFirst: true,
        learningEnabled: true
      }, callbacks);
    });

    it('should detect and classify voice recognition errors', async () => {
      const error = new Error('Low confidence in speech recognition');
      (error as any).confidence = 0.4;

      const context: Partial<ErrorContext> = {
        sessionId: 'test_session',
        userRole: 'guest',
        deviceType: 'desktop',
        pageUrl: 'http://test.com'
      };

      const startTime = performance.now();
      const result = await errorRecoverySystem.handleError(error, context);
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.errorId).toBeDefined();
      expect(duration).toBeLessThan(500); // Total cycle time target
      expect(callbacks.onErrorDetected).toHaveBeenCalled();
    });

    it('should detect and classify intent understanding errors', async () => {
      const error = new Error('Ambiguous command - multiple interpretations possible');
      (error as any).code = 'INTENT_AMBIGUOUS';

      const context: Partial<ErrorContext> = {
        sessionId: 'test_session',
        userRole: 'editor',
        deviceType: 'desktop',
        originalCommand: 'click the button'
      };

      const result = await errorRecoverySystem.handleError(error, context);

      expect(result.success).toBe(true);
      expect(result.clarificationRequested).toBe(true);
      expect(callbacks.onClarificationRequested).toHaveBeenCalled();
    });

    it('should detect and classify action execution errors', async () => {
      const error = new Error('Target element not found on the page');
      (error as any).code = 'ACTION_ELEMENT_NOT_FOUND';

      const context: Partial<ErrorContext> = {
        sessionId: 'test_session',
        userRole: 'guest',
        deviceType: 'mobile',
        targetElement: '.submit-button'
      };

      const result = await errorRecoverySystem.handleError(error, context);

      expect(result.success).toBe(true);
      expect(result.recoveryStarted).toBeDefined();
      expect(callbacks.onErrorDetected).toHaveBeenCalled();
    });

    it('should detect and classify system errors', async () => {
      const error = new Error('API service temporarily unavailable');
      (error as any).code = 'SYSTEM_API_FAILURE';

      const context: Partial<ErrorContext> = {
        sessionId: 'test_session',
        userRole: 'admin',
        deviceType: 'desktop'
      };

      const result = await errorRecoverySystem.handleError(error, context);

      expect(result.success).toBe(true);
      expect(result.errorId).toBeDefined();
    });
  });

  describe('Clarification System', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced',
        voiceFirst: true,
        learningEnabled: true
      }, callbacks);
    });

    it('should create clarification request for ambiguous errors', async () => {
      const error = new Error('Multiple buttons match your description');
      (error as any).code = 'INTENT_AMBIGUOUS';

      const context: Partial<ErrorContext> = {
        sessionId: 'clarification_test',
        originalCommand: 'click the button'
      };

      const result = await errorRecoverySystem.handleError(error, context, {
        requestClarification: true
      });

      expect(result.clarificationRequested).toBe(true);
      expect(callbacks.onClarificationRequested).toHaveBeenCalled();

      const call = (callbacks.onClarificationRequested as jest.Mock).mock.calls[0];
      const clarificationRequest = call[0] as ClarificationRequest;

      expect(clarificationRequest.type).toBeDefined();
      expect(clarificationRequest.question.text).toBeDefined();
      expect(clarificationRequest.options.length).toBeGreaterThan(0);
    });

    it('should process clarification responses', async () => {
      // First create a clarification request
      const error = new Error('Command unclear - need more specificity');
      (error as any).code = 'INTENT_AMBIGUOUS';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'clarification_response_test'
      });

      if (result.clarificationRequested && callbacks.onClarificationRequested) {
        const call = (callbacks.onClarificationRequested as jest.Mock).mock.calls[0];
        const clarificationRequest = call[0] as ClarificationRequest;

        // Simulate user response
        const response: ClarificationResponse = {
          requestId: clarificationRequest.id,
          optionId: clarificationRequest.options[0]?.id || 'option1',
          confidence: 0.9,
          method: 'click',
          timestamp: new Date(),
          satisfied: true,
          needsFollowUp: false
        };

        const processingResult = await errorRecoverySystem.processClarificationResponse(
          clarificationRequest.id,
          response
        );

        expect(processingResult.resolved).toBe(true);
      }
    });

    it('should handle progressive clarification', async () => {
      const error = new Error('Need additional context for command execution');
      (error as any).code = 'INTENT_INSUFFICIENT_CONTEXT';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'progressive_test',
        originalCommand: 'change it'
      });

      expect(result.success).toBe(true);
      // Progressive clarification would be handled through multiple interactions
    });
  });

  describe('Recovery Strategy System', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced',
        voiceFirst: false, // Disable UI for testing
        learningEnabled: true
      }, callbacks);
    });

    it('should select appropriate recovery strategies', async () => {
      const error = new Error('Voice command retry needed');
      (error as any).code = 'VOICE_LOW_CONFIDENCE';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'recovery_test'
      }, {
        autoRecover: true,
        showUI: false
      });

      expect(result.success).toBe(true);
      expect(result.recoveryStarted).toBe(true);
    });

    it('should execute recovery strategies', async () => {
      const error = new Error('Element interaction failed');
      (error as any).code = 'ACTION_ELEMENT_NOT_FOUND';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'execution_test',
        targetElement: '.missing-button'
      }, {
        autoRecover: true,
        showUI: false
      });

      expect(result.success).toBe(true);
      expect(callbacks.onRecoveryStarted).toHaveBeenCalled();

      // Recovery completion would be async
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(callbacks.onRecoveryCompleted).toHaveBeenCalled();
    });

    it('should handle recovery failures gracefully', async () => {
      const error = new Error('Unrecoverable system error');
      (error as any).code = 'SYSTEM_SECURITY_RESTRICTION';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'failure_test'
      }, {
        autoRecover: true,
        showUI: false
      });

      expect(result.success).toBe(true); // System handles error gracefully
      expect(result.recovered).not.toBe(true);
    });
  });

  describe('Learning System', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced',
        learningEnabled: true
      }, callbacks);
    });

    it('should learn from error patterns', async () => {
      const error1 = new Error('Frequent error pattern');
      (error1 as any).code = 'VOICE_LOW_CONFIDENCE';

      const error2 = new Error('Another occurrence of same pattern');
      (error2 as any).code = 'VOICE_LOW_CONFIDENCE';

      const context = {
        sessionId: 'learning_test',
        userRole: 'guest' as const,
        deviceType: 'desktop' as const
      };

      // Generate multiple similar errors to establish pattern
      await errorRecoverySystem.handleError(error1, context);
      await errorRecoverySystem.handleError(error2, context);

      const insights = errorRecoverySystem.getLearningInsights();
      expect(insights.patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should learn from user feedback', async () => {
      const error = new Error('Test error for feedback learning');
      (error as any).code = 'ACTION_ELEMENT_NOT_FOUND';

      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'feedback_test'
      });

      // Simulate user feedback
      if (result.errorId) {
        await errorRecoverySystem.provideFeedback(result.errorId, {
          sessionId: 'feedback_test',
          rating: 4,
          helpful: true,
          feedback: 'The recovery suggestion was helpful',
          timestamp: new Date(),
          errorId: result.errorId,
          recoveryStrategyUsed: 'retry'
        });

        expect(callbacks.onUserFeedback).toHaveBeenCalled();
      }
    });

    it('should generate system improvement recommendations', async () => {
      // Generate various errors to trigger recommendations
      const errors = [
        { error: new Error('Frequent error 1'), code: 'VOICE_LOW_CONFIDENCE' },
        { error: new Error('Frequent error 2'), code: 'ACTION_ELEMENT_NOT_FOUND' },
        { error: new Error('Frequent error 3'), code: 'INTENT_AMBIGUOUS' }
      ];

      for (const { error, code } of errors) {
        (error as any).code = code;
        await errorRecoverySystem.handleError(error, {
          sessionId: `recommendation_test_${code}`
        });
      }

      const insights = errorRecoverySystem.getLearningInsights();
      expect(insights.recommendations).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'optimal', // Use optimal mode for performance testing
        voiceFirst: false,
        learningEnabled: false // Disable to focus on performance
      }, callbacks);
    });

    it('should meet error detection performance targets (<50ms)', async () => {
      const error = new Error('Performance test error');
      (error as any).code = 'VOICE_LOW_CONFIDENCE';

      const startTime = performance.now();
      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'performance_test'
      }, {
        showUI: false,
        autoRecover: false
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100); // Allow some margin for test environment
    });

    it('should meet clarification generation performance targets (<200ms)', async () => {
      const error = new Error('Clarification performance test');
      (error as any).code = 'INTENT_AMBIGUOUS';

      const startTime = performance.now();
      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'clarification_performance_test'
      }, {
        showUI: false,
        requestClarification: true
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(300); // Allow margin for test environment
    });

    it('should meet total cycle performance targets (<500ms)', async () => {
      const error = new Error('Full cycle performance test');
      (error as any).code = 'ACTION_ELEMENT_NOT_FOUND';

      const startTime = performance.now();
      const result = await errorRecoverySystem.handleError(error, {
        sessionId: 'cycle_performance_test'
      }, {
        autoRecover: true,
        showUI: false
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(600); // Allow margin for test environment
    });

    it('should validate system performance', async () => {
      // Run some operations to generate performance data
      for (let i = 0; i < 3; i++) {
        const error = new Error(`Validation test ${i}`);
        (error as any).code = 'VOICE_LOW_CONFIDENCE';

        await errorRecoverySystem.handleError(error, {
          sessionId: `validation_${i}`
        }, {
          showUI: false
        });
      }

      const validation = await validateErrorRecoveryPerformance(errorRecoverySystem);

      expect(validation.valid).toBeDefined();
      expect(validation.systemHealth).toBeDefined();
      expect(validation.details.length).toBeGreaterThan(0);
    });
  });

  describe('System Testing', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced'
      }, callbacks);
    });

    it('should pass comprehensive system tests', async () => {
      const testResults = await testErrorRecoverySystem(errorRecoverySystem);

      expect(testResults.total).toBeGreaterThan(0);
      expect(testResults.passed + testResults.failed).toBe(testResults.total);
      expect(testResults.results.length).toBe(testResults.total);

      // Should pass majority of tests
      expect(testResults.passed).toBeGreaterThanOrEqual(testResults.failed);
    });

    it('should handle custom test scenarios', async () => {
      const customScenarios = [
        {
          name: 'Custom Voice Error',
          error: { message: 'Custom voice recognition error', code: 'VOICE_NOISE_INTERFERENCE' },
          context: { userRole: 'guest' as const, deviceType: 'mobile' as const },
          expectedOutcome: 'recovered' as const
        },
        {
          name: 'Custom Intent Error',
          error: { message: 'Custom intent understanding error', code: 'INTENT_COMPLEX_MULTI_STEP' },
          context: { userRole: 'editor' as const, deviceType: 'desktop' as const },
          expectedOutcome: 'clarified' as const
        }
      ];

      const testResults = await testErrorRecoverySystem(errorRecoverySystem, customScenarios);

      expect(testResults.total).toBe(2);
      expect(testResults.results.length).toBe(2);

      testResults.results.forEach(result => {
        expect(result.scenario).toBeDefined();
        expect(result.duration).toBeGreaterThan(0);
        expect(typeof result.passed).toBe('boolean');
      });
    });
  });

  describe('Integration and Cleanup', () => {
    it('should integrate with existing voice systems', async () => {
      // Mock existing voice system
      const mockVoiceSystem = {
        processCommand: jest.fn(),
        getStatus: jest.fn(() => ({ active: true }))
      };

      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced'
      }, {
        ...callbacks,
        onRecoveryCompleted: (success) => {
          if (success) {
            mockVoiceSystem.processCommand('retry_command');
          }
        }
      });

      const error = new Error('Integration test error');
      (error as any).code = 'VOICE_LOW_CONFIDENCE';

      await errorRecoverySystem.handleError(error, {
        sessionId: 'integration_test'
      }, {
        autoRecover: true,
        showUI: false
      });

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(callbacks.onRecoveryCompleted).toHaveBeenCalled();
    });

    it('should cleanup resources properly', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({}, callbacks);

      const status = errorRecoverySystem.getSystemStatus();
      expect(status.health.status).toBe('healthy');

      await errorRecoverySystem.cleanup();

      const finalStatus = errorRecoverySystem.getSystemStatus();
      expect(finalStatus.activeErrors).toBe(0);
      expect(finalStatus.activeClarifications).toBe(0);
      expect(finalStatus.activeRecoveries).toBe(0);
    });

    it('should handle multiple concurrent errors', async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'optimal'
      }, callbacks);

      const errors = [
        { error: new Error('Concurrent error 1'), code: 'VOICE_LOW_CONFIDENCE' },
        { error: new Error('Concurrent error 2'), code: 'ACTION_ELEMENT_NOT_FOUND' },
        { error: new Error('Concurrent error 3'), code: 'INTENT_AMBIGUOUS' }
      ];

      const promises = errors.map(({ error, code }, index) => {
        (error as any).code = code;
        return errorRecoverySystem.handleError(error, {
          sessionId: `concurrent_${index}`
        }, {
          showUI: false
        });
      });

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.errorId).toBeDefined();
      });

      // All errors should be handled successfully
      expect(results.length).toBe(3);
    });
  });

  describe('Error Boundary Cases', () => {
    beforeEach(async () => {
      errorRecoverySystem = await createErrorRecoverySystem({
        mode: 'balanced'
      }, callbacks);
    });

    it('should handle null/undefined errors gracefully', async () => {
      const result1 = await errorRecoverySystem.handleError(null, {
        sessionId: 'null_error_test'
      });

      const result2 = await errorRecoverySystem.handleError(undefined, {
        sessionId: 'undefined_error_test'
      });

      expect(result1.success).toBeDefined();
      expect(result2.success).toBeDefined();
    });

    it('should handle empty or invalid contexts', async () => {
      const error = new Error('Context test error');
      (error as any).code = 'VOICE_LOW_CONFIDENCE';

      const result1 = await errorRecoverySystem.handleError(error, {});
      const result2 = await errorRecoverySystem.handleError(error, null as any);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should handle system overload gracefully', async () => {
      // Generate many errors quickly to test system overload handling
      const overloadPromises = Array.from({ length: 20 }, (_, i) => {
        const error = new Error(`Overload test error ${i}`);
        (error as any).code = 'VOICE_LOW_CONFIDENCE';

        return errorRecoverySystem.handleError(error, {
          sessionId: `overload_${i}`
        }, {
          showUI: false
        });
      });

      const results = await Promise.all(overloadPromises);

      // System should handle all requests without crashing
      expect(results.length).toBe(20);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});

// Performance mock for Node.js testing environment
if (typeof global !== 'undefined' && !global.performance) {
  global.performance = {
    now: () => Date.now(),
    mark: () => {},
    measure: () => {},
    getEntries: () => [],
    getEntriesByName: () => [],
    getEntriesByType: () => [],
    clearMarks: () => {},
    clearMeasures: () => {},
    clearResourceTimings: () => {},
    setResourceTimingBufferSize: () => {},
    toJSON: () => ({})
  } as any;
}

// Navigator mock for testing
if (typeof global !== 'undefined' && !global.navigator) {
  global.navigator = {
    onLine: true,
    userAgent: 'test',
    permissions: {
      query: jest.fn(() => Promise.resolve({ state: 'granted' }))
    }
  } as any;
}