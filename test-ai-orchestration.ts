/**
 * AI Orchestration Testing Script
 *
 * This script tests the key AI orchestration components:
 * - LangGraph Orchestrator
 * - Universal AI Assistant Service
 * - Playwright Adapter
 * - Knowledge Base Services
 */

import { LangGraphOrchestrator, type LangGraphDependencies } from './server/src/modules/ai/domain/LangGraphOrchestrator';
import { UniversalAIAssistantService } from './server/src/modules/ai/application/UniversalAIAssistantService';
import { PlaywrightAdapter } from './server/src/modules/ai/infrastructure/crawling/PlaywrightAdapter';
import { CrawlOrchestrator } from './server/src/modules/ai/infrastructure/crawling/CrawlOrchestrator';

interface TestResult {
  component: string;
  success: boolean;
  details: any;
  error?: string;
  performance?: {
    responseTime: number;
    memoryUsage: number;
  };
}

interface AITestingSuite {
  results: TestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    overallSuccess: boolean;
  };
}

class AIOrchestrationTester {
  private results: TestResult[] = [];

  /**
   * Test LangGraph Orchestrator
   */
  async testLangGraphOrchestrator(): Promise<TestResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      console.log('🧪 Testing LangGraph Orchestrator...');

      // Create mock dependencies
      const mockDependencies: LangGraphDependencies = {
        kbService: {
          async semanticSearch(params) {
            return [
              {
                id: 'test-1',
                content: 'This is test content for semantic search',
                url: 'https://example.com/test',
                score: 0.95,
                metadata: { title: 'Test Page' }
              }
            ];
          }
        },
        actionExecutor: {
          async execute(params) {
            return {
              success: true,
              result: { message: 'Action executed successfully' },
              executionTime: 100
            };
          },
          getAvailableActions(siteId) {
            return [
              {
                name: 'navigate',
                description: 'Navigate to a page',
                parameters: { url: 'string' },
                confirmation: false
              }
            ];
          }
        },
        languageDetector: {
          async detect(text) {
            return 'en-US';
          }
        }
      };

      // Initialize orchestrator
      const orchestrator = new LangGraphOrchestrator('test-site-id', mockDependencies);

      // Register test actions
      orchestrator.registerActions([
        {
          id: 'test-action-1',
          name: 'navigate',
          description: 'Navigate to a specific page',
          type: 'navigation',
          parameters: [
            {
              name: 'url',
              type: 'string',
              required: true,
              description: 'The URL to navigate to'
            }
          ],
          selector: 'a[href]',
          confirmation: false
        }
      ]);

      // Test conversation processing
      const conversationResult = await orchestrator.processConversation({
        userInput: 'Navigate to the home page',
        sessionId: 'test-session-123',
        siteId: 'test-site-id',
        tenantId: 'test-tenant',
        context: {
          currentUrl: 'https://example.com/current',
          pageTitle: 'Current Page'
        }
      });

      // Validate results
      const isValid = conversationResult &&
                     conversationResult.sessionId === 'test-session-123' &&
                     conversationResult.finalResponse !== null;

      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      return {
        component: 'LangGraph Orchestrator',
        success: isValid,
        details: {
          sessionId: conversationResult.sessionId,
          finalResponse: conversationResult.finalResponse,
          toolResults: conversationResult.toolResults,
          stats: orchestrator.getStats()
        },
        performance: {
          responseTime,
          memoryUsage: endMemory.heapUsed - startMemory.heapUsed
        }
      };

    } catch (error) {
      return {
        component: 'LangGraph Orchestrator',
        success: false,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: Date.now() - startTime,
          memoryUsage: 0
        }
      };
    }
  }

  /**
   * Test Universal AI Assistant Service
   */
  async testUniversalAIAssistantService(): Promise<TestResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      console.log('🧪 Testing Universal AI Assistant Service...');

      // Initialize service with test configuration
      const assistantService = new UniversalAIAssistantService({
        enableVoice: false,
        enableStreaming: true,
        defaultLocale: 'en-US',
        maxSessionDuration: 30000,
        responseTimeoutMs: 10000
      });

      // Register test actions
      await assistantService.registerSiteActions('test-site', 'test-tenant', [
        {
          id: 'test-action-1',
          name: 'search',
          description: 'Search the site',
          type: 'search',
          parameters: [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: 'Search query'
            }
          ],
          selector: 'input[type="search"]',
          confirmation: false
        }
      ]);

      // Test conversation processing
      const response = await assistantService.processConversation({
        input: 'Search for information about products',
        siteId: 'test-site',
        tenantId: 'test-tenant',
        context: {
          currentUrl: 'https://example.com',
          pageTitle: 'Test Page',
          browserLanguage: 'en-US'
        }
      });

      // Validate response structure
      const isValid = response &&
                     response.sessionId &&
                     response.response &&
                     response.response.text &&
                     response.response.metadata;

      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      return {
        component: 'Universal AI Assistant Service',
        success: isValid,
        details: {
          sessionId: response.sessionId,
          responseText: response.response.text,
          metadata: response.response.metadata,
          metrics: assistantService.getMetrics()
        },
        performance: {
          responseTime,
          memoryUsage: endMemory.heapUsed - startMemory.heapUsed
        }
      };

    } catch (error) {
      return {
        component: 'Universal AI Assistant Service',
        success: false,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: Date.now() - startTime,
          memoryUsage: 0
        }
      };
    }
  }

  /**
   * Test Playwright Adapter
   */
  async testPlaywrightAdapter(): Promise<TestResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      console.log('🧪 Testing Playwright Adapter...');

      const playwrightAdapter = new PlaywrightAdapter();

      // Test initialization
      await playwrightAdapter.initialize();

      // Test health check
      const healthCheck = await playwrightAdapter.healthCheck();

      // Test page rendering with a simple HTML page
      const testUrl = 'data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello World</h1><p>This is a test page.</p></body></html>';

      const renderResult = await playwrightAdapter.renderPage(testUrl, {
        waitStrategy: 'domcontentloaded',
        waitTimeout: 5000,
        javascriptEnabled: true
      });

      // Validate results
      const isValid = healthCheck.healthy &&
                     renderResult &&
                     renderResult.html.includes('Hello World') &&
                     renderResult.title === 'Test Page';

      // Cleanup
      await playwrightAdapter.shutdown();

      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      return {
        component: 'Playwright Adapter',
        success: isValid,
        details: {
          healthCheck,
          renderResult: {
            url: renderResult.url,
            title: renderResult.title,
            status: renderResult.status,
            loadTime: renderResult.loadTime,
            resourceCount: renderResult.resourceCount,
            htmlLength: renderResult.html.length
          }
        },
        performance: {
          responseTime,
          memoryUsage: endMemory.heapUsed - startMemory.heapUsed
        }
      };

    } catch (error) {
      return {
        component: 'Playwright Adapter',
        success: false,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: Date.now() - startTime,
          memoryUsage: 0
        }
      };
    }
  }

  /**
   * Test Crawl Orchestrator
   */
  async testCrawlOrchestrator(): Promise<TestResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    try {
      console.log('🧪 Testing Crawl Orchestrator...');

      const crawlOrchestrator = new CrawlOrchestrator();

      // Test crawler statistics
      const stats = crawlOrchestrator.getCrawlerStats();

      // Test cache clearing
      crawlOrchestrator.clearCaches();

      // Test session cleanup
      const cleanedSessions = crawlOrchestrator.cleanupSessions();

      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();

      return {
        component: 'Crawl Orchestrator',
        success: true,
        details: {
          stats,
          cleanedSessions,
          capabilities: {
            canClearCaches: true,
            canCleanupSessions: true,
            hasStatistics: true
          }
        },
        performance: {
          responseTime,
          memoryUsage: endMemory.heapUsed - startMemory.heapUsed
        }
      };

    } catch (error) {
      return {
        component: 'Crawl Orchestrator',
        success: false,
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: Date.now() - startTime,
          memoryUsage: 0
        }
      };
    }
  }

  /**
   * Run comprehensive test suite
   */
  async runTestSuite(): Promise<AITestingSuite> {
    console.log('🚀 Starting AI Orchestration Test Suite...\n');

    const tests = [
      () => this.testLangGraphOrchestrator(),
      () => this.testUniversalAIAssistantService(),
      () => this.testPlaywrightAdapter(),
      () => this.testCrawlOrchestrator()
    ];

    this.results = [];

    for (const test of tests) {
      const result = await test();
      this.results.push(result);

      const status = result.success ? '✅' : '❌';
      const responseTime = result.performance?.responseTime || 0;
      console.log(`${status} ${result.component}: ${responseTime}ms`);

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log('');
    }

    const summary = {
      totalTests: this.results.length,
      passed: this.results.filter(r => r.success).length,
      failed: this.results.filter(r => !r.success).length,
      overallSuccess: this.results.every(r => r.success)
    };

    console.log('📊 Test Suite Summary:');
    console.log(`   Total Tests: ${summary.totalTests}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Overall Success: ${summary.overallSuccess ? '✅' : '❌'}`);

    return {
      results: this.results,
      summary
    };
  }
}

// Run the test suite
async function main() {
  const tester = new AIOrchestrationTester();
  const results = await tester.runTestSuite();

  // Output detailed results
  console.log('\n📋 Detailed Results:');
  results.results.forEach(result => {
    console.log(`\n${result.component}:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Response Time: ${result.performance?.responseTime}ms`);
    console.log(`  Memory Usage: ${Math.round((result.performance?.memoryUsage || 0) / 1024)}KB`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (result.details && Object.keys(result.details).length > 0) {
      console.log(`  Details: ${JSON.stringify(result.details, null, 2)}`);
    }
  });

  process.exit(results.summary.overallSuccess ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { AIOrchestrationTester, type TestResult, type AITestingSuite };