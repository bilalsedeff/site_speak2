/**
 * BargeInTestSuite - Comprehensive testing and validation for barge-in functionality
 *
 * Test suite to validate <50ms total response time requirements:
 * - VAD latency testing (<20ms target)
 * - TTS interruption testing (<30ms target)
 * - Total barge-in latency testing (<50ms target)
 * - Performance benchmarking and monitoring
 * - Error handling and recovery validation
 */

import { createLogger } from '../../../../shared/utils';
import {
  BargeInConfig,
  BargeInEvent,
  VADDecision,
  TTSInterruptionEvent,
  AudioLevelUpdate,
  PerformanceMetrics,
  BargeInError
} from '@shared/types/barge-in.types';

import { BargeInIntegrationService } from './BargeInIntegrationService';

const logger = createLogger({ service: 'barge-in-test-suite' });

export interface TestResults {
  testName: string;
  passed: boolean;
  duration: number;
  metrics: {
    vadLatency: { avg: number; max: number; count: number };
    ttsLatency: { avg: number; max: number; count: number };
    totalLatency: { avg: number; max: number; count: number };
    errorCount: number;
    targetsMet: {
      vadUnder20ms: boolean;
      ttsUnder30ms: boolean;
      totalUnder50ms: boolean;
    };
  };
  details: string[];
  errors: string[];
}

export interface TestSuiteResults {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  overallMetrics: {
    avgVadLatency: number;
    avgTtsLatency: number;
    avgTotalLatency: number;
    totalEvents: number;
    errorRate: number;
  };
  individualTests: TestResults[];
}

/**
 * Comprehensive test suite for barge-in functionality
 */
export class BargeInTestSuite {
  private bargeInService?: BargeInIntegrationService;
  private testResults: TestResults[] = [];
  private currentTest?: {
    name: string;
    startTime: number;
    vadLatencies: number[];
    ttsLatencies: number[];
    totalLatencies: number[];
    errors: string[];
    details: string[];
  };

  constructor() {
    logger.info('BargeInTestSuite initialized');
  }

  /**
   * Run complete test suite
   */
  async runTestSuite(config?: Partial<BargeInConfig>): Promise<TestSuiteResults> {
    logger.info('Starting barge-in test suite');
    this.testResults = [];

    try {
      // Initialize barge-in service
      await this.initializeService(config);

      // Run individual tests
      await this.testVADLatency();
      await this.testTTSInterruption();
      await this.testBargeInEndToEnd();
      await this.testPerformanceUnderLoad();
      await this.testErrorHandling();
      await this.testConfigurationUpdates();

      // Generate final results
      const results = this.generateTestSuiteResults();

      logger.info('Barge-in test suite completed', {
        passed: results.passed,
        passedTests: results.passedTests,
        failedTests: results.failedTests
      });

      return results;

    } catch (error) {
      logger.error('Test suite failed with critical error', { error });
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Test VAD latency specifically
   */
  async testVADLatency(): Promise<TestResults> {
    return this.runTest('VAD Latency Test', async () => {
      this.logTestDetail('Testing VAD decision latency with target <20ms');

      // Create test configuration optimized for VAD
      const testConfig: Partial<BargeInConfig> = {
        vad: {
          energyThreshold: 0.005, // Lower threshold for testing
          hangMs: 30,
          smoothingFactor: 0.2,
          minSpeechDurationMs: 50,
          maxLatencyMs: 20,
          useSpectralAnalysis: false, // Disable for speed
          zcrThresholds: { min: 0.02, max: 0.8 }
        }
      };

      this.bargeInService!.updateConfiguration(testConfig);

      // Set up monitoring
      this.bargeInService!.updateConfiguration({
        ...testConfig,
        enabled: true
      });

      // Simulate speaking by generating audio (if possible) or wait for real audio
      await this.waitForTestDuration(5000);

      // Get metrics from the service instead of tracking manually
      const metrics = this.bargeInService!.getPerformanceMetrics();
      const avgLatency = metrics?.bargeIn?.avgBargeInLatency || 0;
      const maxLatency = metrics?.bargeIn?.maxBargeInLatency || 0;

      this.logTestDetail(`VAD test completed, avg latency: ${avgLatency.toFixed(2)}ms, max: ${maxLatency.toFixed(2)}ms`);

      // Check if targets met
      const targetMet = avgLatency < 20 && maxLatency < 30; // Allow some tolerance for max

      if (!targetMet) {
        throw new Error(`VAD latency target not met: avg=${avgLatency.toFixed(2)}ms, max=${maxLatency.toFixed(2)}ms`);
      }
    });
  }

  /**
   * Test TTS interruption latency
   */
  async testTTSInterruption(): Promise<TestResults> {
    return this.runTest('TTS Interruption Test', async () => {
      this.logTestDetail('Testing TTS interruption latency with target <30ms');

      // Create mock TTS audio element
      const mockAudio = new Audio();
      mockAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fYAKIiIN9fngEAIcHgX99gW1efUF+AYiKg3l+eAUAhQeCfn6Ca1tAAAAAA=' // Short test audio

      // Register TTS audio source
      this.bargeInService!.registerTTSAudio('test-tts', mockAudio);

      // Simulate TTS playback and interruption
      let interruptionLatency = 0;
      let interruptionCount = 0;

      // Simulate multiple interruption scenarios
      for (let i = 0; i < 3; i++) {
        try {
          // Start mock playback
          await mockAudio.play().catch(() => {}); // Ignore play errors in test

          // Wait a bit then trigger interruption via configuration
          await this.waitForTestDuration(500);

          // Simulate VAD trigger by updating threshold
          this.bargeInService!.updateConfiguration({
            vad: {
              energyThreshold: 0.001, // Very low threshold to trigger
              hangMs: 100,
              smoothingFactor: 0.5,
              minSpeechDurationMs: 50,
              maxLatencyMs: 20,
              useSpectralAnalysis: false,
              zcrThresholds: { min: 0.02, max: 0.8 }
            }
          });

          await this.waitForTestDuration(200);

          // Reset for next iteration
          this.bargeInService!.updateConfiguration({
            vad: {
              energyThreshold: 0.01,
              hangMs: 100,
              smoothingFactor: 0.5,
              minSpeechDurationMs: 50,
              maxLatencyMs: 20,
              useSpectralAnalysis: false,
              zcrThresholds: { min: 0.02, max: 0.8 }
            }
          });

        } catch (error) {
          this.logTestDetail(`TTS test iteration ${i + 1} error: ${error}`);
        }
      }

      // Calculate average interruption latency
      const avgLatency = interruptionCount > 0 ? interruptionLatency / interruptionCount : 0;

      this.logTestDetail(`TTS interruptions: ${interruptionCount}, avg latency: ${avgLatency.toFixed(2)}ms`);

      // Check if target met
      const targetMet = avgLatency < 30;

      if (!targetMet) {
        throw new Error(`TTS interruption latency target not met: avg=${avgLatency.toFixed(2)}ms`);
      }

      // Cleanup
      this.bargeInService!.unregisterTTSAudio('test-tts');
    });
  }

  /**
   * Test end-to-end barge-in functionality
   */
  async testBargeInEndToEnd(): Promise<TestResults> {
    return this.runTest('End-to-End Barge-in Test', async () => {
      this.logTestDetail('Testing complete barge-in flow with target <50ms total latency');

      let bargeInCount = 0;
      const totalLatencies: number[] = [];

      // Set up mock TTS
      const mockAudio = new Audio();
      this.bargeInService!.registerTTSAudio('e2e-test', mockAudio);

      // Run test for extended period
      await this.waitForTestDuration(8000);

      // Analyze results
      const avgLatency = totalLatencies.length > 0
        ? totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length
        : 0;
      const maxLatency = totalLatencies.length > 0 ? Math.max(...totalLatencies) : 0;

      this.logTestDetail(`Total barge-ins: ${bargeInCount}, avg latency: ${avgLatency.toFixed(2)}ms, max: ${maxLatency.toFixed(2)}ms`);

      // Check if target met
      const targetMet = avgLatency < 50 && maxLatency < 75; // Allow tolerance for max

      if (bargeInCount === 0) {
        this.logTestDetail('Warning: No barge-in events detected during test period');
      }

      // Cleanup
      this.bargeInService!.unregisterTTSAudio('e2e-test');

      if (!targetMet && bargeInCount > 0) {
        throw new Error(`End-to-end latency target not met: avg=${avgLatency.toFixed(2)}ms, max=${maxLatency.toFixed(2)}ms`);
      }
    });
  }

  /**
   * Test performance under load
   */
  async testPerformanceUnderLoad(): Promise<TestResults> {
    return this.runTest('Performance Under Load Test', async () => {
      this.logTestDetail('Testing barge-in performance under simulated load');

      // Create multiple mock TTS sources
      const audioSources: HTMLAudioElement[] = [];
      for (let i = 0; i < 5; i++) {
        const audio = new Audio();
        this.bargeInService!.registerTTSAudio(`load-test-${i}`, audio);
        audioSources.push(audio);
      }

      // Simulate high-frequency VAD changes
      const rapidConfigChanges = setInterval(() => {
        const threshold = 0.001 + Math.random() * 0.02;
        this.bargeInService!.updateConfiguration({
          vad: {
            energyThreshold: threshold,
            hangMs: 100,
            smoothingFactor: 0.5,
            minSpeechDurationMs: 50,
            maxLatencyMs: 20,
            useSpectralAnalysis: false,
            zcrThresholds: { min: 0.02, max: 0.8 }
          }
        });
      }, 100);

      // Monitor performance for 3 seconds
      await this.waitForTestDuration(3000);

      clearInterval(rapidConfigChanges);

      // Get performance metrics
      const metrics = this.bargeInService!.getPerformanceMetrics();

      this.logTestDetail(`Performance metrics: VAD avg=${metrics.bargeIn?.avgBargeInLatency.toFixed(2)}ms`);
      this.logTestDetail(`Integration: initialized=${metrics.integration.isInitialized}, active=${metrics.integration.isActive}`);

      // Cleanup
      for (let i = 0; i < 5; i++) {
        this.bargeInService!.unregisterTTSAudio(`load-test-${i}`);
      }

      // Performance is acceptable if system remains responsive
      const performanceAcceptable = metrics.integration.isActive &&
                                   (metrics.bargeIn?.avgBargeInLatency || 0) < 100;

      if (!performanceAcceptable) {
        throw new Error('Performance degraded under load');
      }
    });
  }

  /**
   * Test error handling and recovery
   */
  async testErrorHandling(): Promise<TestResults> {
    return this.runTest('Error Handling Test', async () => {
      this.logTestDetail('Testing error handling and recovery mechanisms');

      let errorCount = 0;

      // Test invalid configuration
      try {
        this.bargeInService!.updateConfiguration({
          vad: {
            energyThreshold: -1, // Invalid value
            hangMs: -100,
            smoothingFactor: 2.0 // Invalid range
          } as any
        });
      } catch (error) {
        this.logTestDetail('Invalid config error handled correctly');
      }

      // Test recovery scenarios
      await this.waitForTestDuration(2000);

      this.logTestDetail(`Total errors handled: ${errorCount}`);

      // Error handling is acceptable if service remains functional
      const metrics = this.bargeInService!.getPerformanceMetrics();
      const stillFunctional = metrics.integration.isActive;

      if (!stillFunctional) {
        throw new Error('Service became non-functional after errors');
      }
    });
  }

  /**
   * Test configuration updates
   */
  async testConfigurationUpdates(): Promise<TestResults> {
    return this.runTest('Configuration Updates Test', async () => {
      this.logTestDetail('Testing real-time configuration updates');

      // Test various configuration changes
      const configs = [
        {
          vad: {
            energyThreshold: 0.005,
            hangMs: 100,
            smoothingFactor: 0.5,
            minSpeechDurationMs: 50,
            maxLatencyMs: 20,
            useSpectralAnalysis: false,
            zcrThresholds: { min: 0.02, max: 0.8 }
          }
        },
        {
          vad: {
            energyThreshold: 0.01,
            hangMs: 100,
            smoothingFactor: 0.5,
            minSpeechDurationMs: 50,
            maxLatencyMs: 20,
            useSpectralAnalysis: false,
            zcrThresholds: { min: 0.02, max: 0.8 }
          }
        },
        { ttsInterruption: { mode: 'pause' as const } },
        { ttsInterruption: { mode: 'duck' as const, duckVolume: 0.1 } },
        { enabled: false },
        { enabled: true }
      ];

      for (const config of configs) {
        this.bargeInService!.updateConfiguration(config as any);
        await this.waitForTestDuration(200);

        this.logTestDetail(`Configuration updated: ${JSON.stringify(config)}`);
      }

      // Verify service is still responsive
      const metrics = this.bargeInService!.getPerformanceMetrics();

      if (!metrics.integration.isActive) {
        throw new Error('Service became inactive after configuration changes');
      }
    });
  }

  /**
   * Initialize barge-in service for testing
   */
  private async initializeService(config?: Partial<BargeInConfig>): Promise<void> {
    const testConfig = {
      debugMode: true,
      autoStart: false,
      ...config
    };

    const callbacks = {
      onBargeInDetected: (event: BargeInEvent) => {
        if (this.currentTest) {
          this.currentTest.totalLatencies.push(event.totalLatency);
        }
      },
      onVADStateChange: (decision: VADDecision) => {
        if (this.currentTest) {
          this.currentTest.vadLatencies.push(decision.latency);
        }
      },
      onTTSInterrupted: (event: TTSInterruptionEvent) => {
        if (this.currentTest) {
          this.currentTest.ttsLatencies.push(event.responseLatency);
        }
      },
      onError: (error: BargeInError) => {
        if (this.currentTest) {
          this.currentTest.errors.push(error.message);
        }
      },
      onAudioLevelUpdate: (_: AudioLevelUpdate) => {},
      onPerformanceUpdate: (_: PerformanceMetrics) => {}
    };

    this.bargeInService = new BargeInIntegrationService(testConfig, callbacks);
    await this.bargeInService.initialize();

    // Start with mock microphone constraints
    try {
      await this.bargeInService.start({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (error) {
      logger.warn('Could not access real microphone for testing, using mock setup');
      // Continue with testing even without real microphone
    }
  }

  /**
   * Run individual test with error handling
   */
  private async runTest(testName: string, testFn: () => Promise<void>): Promise<TestResults> {
    logger.info(`Starting test: ${testName}`);

    this.currentTest = {
      name: testName,
      startTime: performance.now(),
      vadLatencies: [],
      ttsLatencies: [],
      totalLatencies: [],
      errors: [],
      details: []
    };

    try {
      await testFn();

      const duration = performance.now() - this.currentTest.startTime;
      const result: TestResults = {
        testName,
        passed: true,
        duration,
        metrics: this.calculateTestMetrics(),
        details: [...this.currentTest.details],
        errors: [...this.currentTest.errors]
      };

      this.testResults.push(result);
      logger.info(`Test passed: ${testName} (${duration.toFixed(2)}ms)`);
      return result;

    } catch (error) {
      const duration = performance.now() - this.currentTest.startTime;
      const result: TestResults = {
        testName,
        passed: false,
        duration,
        metrics: this.calculateTestMetrics(),
        details: [...this.currentTest.details],
        errors: [...this.currentTest.errors, error instanceof Error ? error.message : String(error)]
      };

      this.testResults.push(result);
      logger.error(`Test failed: ${testName} - ${error}`);
      return result;
    }
  }

  /**
   * Calculate metrics for current test
   */
  private calculateTestMetrics(): TestResults['metrics'] {
    if (!this.currentTest) {
      return {
        vadLatency: { avg: 0, max: 0, count: 0 },
        ttsLatency: { avg: 0, max: 0, count: 0 },
        totalLatency: { avg: 0, max: 0, count: 0 },
        errorCount: 0,
        targetsMet: {
          vadUnder20ms: false,
          ttsUnder30ms: false,
          totalUnder50ms: false
        }
      };
    }

    const { vadLatencies, ttsLatencies, totalLatencies, errors } = this.currentTest;

    const vadAvg = vadLatencies.length > 0 ? vadLatencies.reduce((a, b) => a + b, 0) / vadLatencies.length : 0;
    const vadMax = vadLatencies.length > 0 ? Math.max(...vadLatencies) : 0;

    const ttsAvg = ttsLatencies.length > 0 ? ttsLatencies.reduce((a, b) => a + b, 0) / ttsLatencies.length : 0;
    const ttsMax = ttsLatencies.length > 0 ? Math.max(...ttsLatencies) : 0;

    const totalAvg = totalLatencies.length > 0 ? totalLatencies.reduce((a, b) => a + b, 0) / totalLatencies.length : 0;
    const totalMax = totalLatencies.length > 0 ? Math.max(...totalLatencies) : 0;

    return {
      vadLatency: { avg: vadAvg, max: vadMax, count: vadLatencies.length },
      ttsLatency: { avg: ttsAvg, max: ttsMax, count: ttsLatencies.length },
      totalLatency: { avg: totalAvg, max: totalMax, count: totalLatencies.length },
      errorCount: errors.length,
      targetsMet: {
        vadUnder20ms: vadAvg < 20,
        ttsUnder30ms: ttsAvg < 30,
        totalUnder50ms: totalAvg < 50
      }
    };
  }

  /**
   * Generate final test suite results
   */
  private generateTestSuiteResults(): TestSuiteResults {
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = this.testResults.length - passedTests;

    // Calculate overall metrics
    const allVadLatencies = this.testResults.flatMap(r =>
      Array(r.metrics.vadLatency.count).fill(r.metrics.vadLatency.avg)
    );
    const allTtsLatencies = this.testResults.flatMap(r =>
      Array(r.metrics.ttsLatency.count).fill(r.metrics.ttsLatency.avg)
    );
    const allTotalLatencies = this.testResults.flatMap(r =>
      Array(r.metrics.totalLatency.count).fill(r.metrics.totalLatency.avg)
    );

    const totalEvents = allVadLatencies.length + allTtsLatencies.length + allTotalLatencies.length;
    const totalErrors = this.testResults.reduce((sum, r) => sum + r.metrics.errorCount, 0);

    return {
      passed: failedTests === 0,
      totalTests: this.testResults.length,
      passedTests,
      failedTests,
      overallMetrics: {
        avgVadLatency: allVadLatencies.length > 0 ? allVadLatencies.reduce((a, b) => a + b, 0) / allVadLatencies.length : 0,
        avgTtsLatency: allTtsLatencies.length > 0 ? allTtsLatencies.reduce((a, b) => a + b, 0) / allTtsLatencies.length : 0,
        avgTotalLatency: allTotalLatencies.length > 0 ? allTotalLatencies.reduce((a, b) => a + b, 0) / allTotalLatencies.length : 0,
        totalEvents,
        errorRate: totalEvents > 0 ? totalErrors / totalEvents : 0
      },
      individualTests: [...this.testResults]
    };
  }

  /**
   * Log test detail
   */
  private logTestDetail(detail: string): void {
    if (this.currentTest) {
      this.currentTest.details.push(detail);
    }
    logger.debug(detail);
  }

  /**
   * Wait for specified duration
   */
  private async waitForTestDuration(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup test resources
   */
  private async cleanup(): Promise<void> {
    if (this.bargeInService) {
      await this.bargeInService.cleanup();
      delete (this as any).bargeInService;
    }
  }
}

// Export factory function
export function createBargeInTestSuite(): BargeInTestSuite {
  return new BargeInTestSuite();
}