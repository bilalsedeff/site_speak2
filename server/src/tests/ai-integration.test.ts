/**
 * AI Integration Tests
 * Tests for the complete AI system integration including LangGraph orchestration,
 * vector search, language detection, and voice processing.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UniversalAIAssistantService } from '../modules/ai/application/UniversalAIAssistantService';
import { PgVectorClient } from '../modules/ai/infrastructure/vector-store/PgVectorClient';
import { LanguageDetectionService } from '../modules/ai/infrastructure/rewriter/LanguageDetection';
import type { VoiceWebSocketHandler } from '../modules/voice/infrastructure/websocket/VoiceWebSocketHandler';
import { ActionExecutorService } from '../modules/ai/application/ActionExecutorService';
import { HNSWIndexManager } from '../modules/ai/infrastructure/indexes/hnsw';

describe('AI Integration Tests', () => {
  let aiAssistant: UniversalAIAssistantService;
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    // Mock console.log to prevent test output pollution
    originalConsoleLog = console.log;
    console.log = jest.fn();

    // Initialize AI Assistant without voice handler for testing
    aiAssistant = new UniversalAIAssistantService({
      enableVoice: false, // Disable for testing
      enableStreaming: true,
      defaultLocale: 'en-US',
      maxSessionDuration: 30 * 60 * 1000,
      responseTimeoutMs: 5000, // Shorter timeout for tests
    });
  });

  afterEach(async () => {
    console.log = originalConsoleLog;
    await aiAssistant.cleanup();
  });

  describe('Universal AI Assistant Service', () => {
    it('should initialize with default configuration', () => {
      expect(aiAssistant).toBeDefined();
      expect(aiAssistant.getMetrics).toBeDefined();
    });

    it('should process a basic conversation request', async () => {
      const request = {
        input: 'Hello, how can I help?',
        siteId: 'test-site-123',
        tenantId: 'test-tenant-456',
        context: {
          currentUrl: 'https://example.com',
          pageTitle: 'Test Page',
          userAgent: 'Test Agent',
          browserLanguage: 'en-US',
        },
      };

      const response = await aiAssistant.processConversation(request);

      expect(response).toBeDefined();
      expect(response.sessionId).toBeDefined();
      expect(response.response.text).toBeDefined();
      expect(response.response.metadata.responseTime).toBeGreaterThan(0);
      expect(response.response.metadata.language).toBe('en-US');
    });

    it('should handle streaming conversation', async () => {
      const request = {
        input: 'Tell me about this website',
        siteId: 'test-site-123',
        tenantId: 'test-tenant-456',
      };

      const chunks: any[] = [];
      const streamGenerator = aiAssistant.streamConversation(request);

      for await (const chunk of streamGenerator) {
        chunks.push(chunk);
        
        // Break after receiving some chunks to avoid infinite loops
        if (chunks.length > 5) break;
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].type).toBeDefined();
      expect(chunks[0].sessionId).toBeDefined();
    });

    it('should validate request parameters', async () => {
      // Test with missing required fields
      const invalidRequest = {
        input: '',
        siteId: '',
        tenantId: 'test-tenant',
      };

      const response = await aiAssistant.processConversation(invalidRequest);
      
      // Should return error response
      expect(response.response.text).toContain('trouble processing');
    });

    it('should register and retrieve site actions', async () => {
      const siteId = 'test-site-123';
      const tenantId = 'test-tenant-456';
      const actions = [
        {
          name: 'navigate-to-products',
          type: 'navigation' as const,
          selector: '#products-link',
          description: 'Navigate to products page',
          category: 'navigation',
          riskLevel: 'low' as const,
          sideEffecting: 'safe' as const,
          parameters: [],
          confirmation: false,
        },
        {
          name: 'add-to-cart',
          type: 'button' as const,
          selector: '.add-to-cart-btn',
          description: 'Add item to cart',
          category: 'commerce',
          riskLevel: 'medium' as const,
          sideEffecting: 'modifying' as const,
          parameters: [
            {
              name: 'productId',
              type: 'string',
              description: 'Product ID to add',
              required: true,
            },
          ],
          confirmation: false,
        },
      ];

      // Register actions
      await aiAssistant.registerSiteActions(siteId, tenantId, actions);

      // Retrieve actions
      const retrievedActions = aiAssistant.getSiteActions(siteId);
      
      expect(retrievedActions).toHaveLength(2);
      expect(retrievedActions[0].name).toBe('navigate-to-products');
      expect(retrievedActions[1].name).toBe('add-to-cart');
    });

    it('should execute actions directly', async () => {
      const siteId = 'test-site-123';
      const tenantId = 'test-tenant-456';
      
      // First register an action
      await aiAssistant.registerSiteActions(siteId, tenantId, [{
        name: 'test-action',
        type: 'button' as const,
        selector: '#test-button',
        description: 'Test button click',
        category: 'test',
        riskLevel: 'low' as const,
        sideEffecting: 'safe' as const,
        parameters: [],
        confirmation: false,
      }]);

      // Execute the action
      const result = await aiAssistant.executeAction({
        siteId,
        tenantId,
        actionName: 'test-action',
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should return comprehensive metrics', () => {
      const metrics = aiAssistant.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalRequests).toBeDefined();
      expect(metrics.successfulRequests).toBeDefined();
      expect(metrics.failedRequests).toBeDefined();
      expect(metrics.averageResponseTime).toBeDefined();
      expect(metrics.orchestrationStats).toBeDefined();
    });
  });

  describe('Language Detection Service', () => {
    let languageDetection: LanguageDetectionService;

    beforeEach(() => {
      languageDetection = new LanguageDetectionService();
    });

    it('should detect English text', async () => {
      const text = 'Hello, how are you today? This is a sample English text.';
      const detectedLanguage = await languageDetection.detect(text);
      
      expect(detectedLanguage).toBe('en-US');
    });

    it('should detect Turkish text', async () => {
      const text = 'Merhaba, nasılsın? Bu bir Türkçe metin örneğidir.';
      const detectedLanguage = await languageDetection.detect(text);
      
      expect(detectedLanguage).toBe('tr-TR');
    });

    it('should use browser language for short text', async () => {
      const shortText = 'Hi';
      const browserLanguage = 'fr-FR';
      
      const detectedLanguage = await languageDetection.detect(shortText, browserLanguage);
      
      expect(detectedLanguage).toBe('fr-FR');
    });

    it('should fallback to default for undetected language', async () => {
      const ambiguousText = '123 456';
      const detectedLanguage = await languageDetection.detect(ambiguousText);
      
      expect(detectedLanguage).toBe('en-US'); // Default fallback
    });

    it('should normalize language tags', () => {
      expect(languageDetection.normalizeTag('en')).toBe('en-US');
      expect(languageDetection.normalizeTag('tr')).toBe('tr-TR');
      expect(languageDetection.normalizeTag('en_US')).toBe('en-US');
    });

    it('should return supported languages list', () => {
      const supportedLanguages = languageDetection.getSupportedLanguages();
      
      expect(supportedLanguages).toBeInstanceOf(Array);
      expect(supportedLanguages).toContain('en-US');
      expect(supportedLanguages).toContain('tr-TR');
      expect(supportedLanguages.length).toBeGreaterThan(10);
    });
  });

  describe('Action Executor Service', () => {
    let actionExecutor: ActionExecutorService;

    beforeEach(() => {
      actionExecutor = new ActionExecutorService();
    });

    it('should register and execute navigation actions', async () => {
      const siteId = 'test-site';
      const actions = [{
        name: 'go-home',
        type: 'navigation' as const,
        selector: '#home-link',
        description: 'Navigate to home page',
        category: 'navigation',
        riskLevel: 'low' as const,
        sideEffecting: 'safe' as const,
        parameters: [],
        confirmation: false,
      }];

      actionExecutor.registerActions(siteId, actions);

      const result = await actionExecutor.execute({
        siteId,
        actionName: 'go-home',
        parameters: { url: '/' },
      });

      expect(result.success).toBe(true);
      expect(result.result.type).toBe('navigation');
      expect(result.sideEffects).toHaveLength(1);
      expect(result.sideEffects[0].type).toBe('navigation');
    });

    it('should validate required parameters', async () => {
      const siteId = 'test-site';
      const actions = [{
        name: 'submit-form',
        type: 'form' as const,
        selector: '#contact-form',
        description: 'Submit contact form',
        category: 'form',
        riskLevel: 'medium' as const,
        sideEffecting: 'modifying' as const,
        parameters: [
          {
            name: 'email',
            type: 'string',
            description: 'Email address',
            required: true,
          },
        ],
        confirmation: false,
      }];

      actionExecutor.registerActions(siteId, actions);

      const result = await actionExecutor.execute({
        siteId,
        actionName: 'submit-form',
        parameters: {}, // Missing required email parameter
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should perform dry runs', async () => {
      const siteId = 'test-site';
      const actions = [{
        name: 'test-button',
        type: 'button' as const,
        selector: '#test-btn',
        description: 'Test button',
        category: 'test',
        riskLevel: 'low' as const,
        sideEffecting: 'safe' as const,
        parameters: [],
        confirmation: false,
      }];

      actionExecutor.registerActions(siteId, actions);

      const dryRunResult = await actionExecutor.dryRun({
        siteId,
        actionName: 'test-button',
        parameters: {},
      });

      expect(dryRunResult.valid).toBe(true);
      expect(dryRunResult.issues).toHaveLength(0);
      expect(dryRunResult.estimatedExecutionTime).toBeGreaterThan(0);
      expect(dryRunResult.sideEffects).toContain('DOM manipulation');
    });

    it('should track execution history', async () => {
      const siteId = 'test-site';
      const actions = [{
        name: 'track-action',
        type: 'button' as const,
        selector: '#track-btn',
        description: 'Trackable action',
        category: 'test',
        riskLevel: 'low' as const,
        sideEffecting: 'safe' as const,
        parameters: [],
        confirmation: false,
      }];

      actionExecutor.registerActions(siteId, actions);

      await actionExecutor.execute({
        siteId,
        actionName: 'track-action',
        parameters: {},
      });

      const history = actionExecutor.getExecutionHistory(siteId, 10);
      
      expect(history).toHaveLength(1);
      expect(history[0].actionName).toBe('track-action');
      expect(history[0].timestamp).toBeDefined();
    });
  });

  describe('PgVector Client', () => {
    let pgVectorClient: PgVectorClient;

    beforeEach(() => {
      pgVectorClient = new PgVectorClient();
    });

    afterEach(async () => {
      await pgVectorClient.close();
    });

    it('should handle semantic search with mock data', async () => {
      const request = {
        siteId: 'test-site',
        tenantId: 'test-tenant',
        query: 'test query',
        topK: 5,
        locale: 'en-US',
      };

      // This will use mock embeddings since we don't have real data
      const results = await pgVectorClient.semanticSearch(request);

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(5);
      
      // Each result should have required fields
      if (results.length > 0) {
        const result = results[0];
        expect(result.id).toBeDefined();
        expect(result.content).toBeDefined();
        expect(result.score).toBeDefined();
        expect(result.metadata).toBeDefined();
      }
    });

    it('should get stats for tenant', async () => {
      const stats = await pgVectorClient.getStats('test-tenant', 'test-site');

      expect(stats).toBeDefined();
      expect(stats.totalChunks).toBeDefined();
      expect(stats.totalEmbeddings).toBeDefined();
      expect(stats.indexType).toBeDefined();
      expect(stats.avgChunkSize).toBeDefined();
    });
  });

  describe('HNSW Index Manager', () => {
    let hnswManager: HNSWIndexManager;

    beforeEach(() => {
      hnswManager = new HNSWIndexManager();
    });

    afterEach(async () => {
      await hnswManager.close();
    });

    it('should provide configuration presets', () => {
      const balancedPreset = HNSWIndexManager.PRESETS.balanced;
      expect(balancedPreset.name).toBe('balanced');
      expect(balancedPreset.config.m).toBe(16);
      expect(balancedPreset.config.efConstruction).toBe(64);

      const highRecallPreset = HNSWIndexManager.PRESETS.highRecall;
      expect(highRecallPreset.config.m).toBe(32);
      expect(highRecallPreset.config.efConstruction).toBe(128);
    });

    it('should recommend parameters based on data characteristics', async () => {
      // Mock a table with test data
      const tableName = 'test_embeddings';
      const recommendations = await hnswManager.recommendParameters(
        tableName,
        0.95, // target recall
        false // don't prioritize speed
      );

      expect(recommendations.recommended).toBeDefined();
      expect(recommendations.reasoning).toBeInstanceOf(Array);
      expect(recommendations.reasoning.length).toBeGreaterThan(0);
    });

    it('should get current HNSW parameters', async () => {
      const params = await hnswManager.getCurrentParameters();

      expect(params.efSearch).toBeDefined();
      expect(params.maintenanceWorkMem).toBeDefined();
      expect(params.maxParallelMaintenanceWorkers).toBeDefined();
    });
  });
});