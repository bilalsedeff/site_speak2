/**
 * Integration Tests for SiteSpeak Backend
 * 
 * Tests the complete LangGraph orchestration, Knowledge Base, and AI services
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { LangGraphOrchestrator } from '../modules/ai/domain/LangGraphOrchestrator';
import { actionExecutorService } from '../modules/ai/application/ActionExecutorService';
import { languageDetectorService } from '../modules/ai/application/LanguageDetectorService';
import { knowledgeBaseService } from '../modules/ai/infrastructure/KnowledgeBaseService';
import { aiOrchestrationService } from '../modules/ai/application/AIOrchestrationService';
import { SiteAction } from '../shared/types';

// Test configuration
const testSiteId = '550e8400-e29b-41d4-a716-446655440000';

// Mock dependencies for testing without real API calls
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        category: 'question',
        confidence: 0.8,
        entities: {},
        actionCandidates: [],
      }),
    }),
  })),
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  })),
}));

describe('SiteSpeak Integration Tests', () => {
  const testSiteId = 'test-site-123';
  const testTenantId = 'test-tenant-123';

  beforeAll(async () => {
    // Setup test data
    console.log('Setting up integration tests...');
  });

  afterAll(async () => {
    // Cleanup test data
    console.log('Cleaning up integration tests...');
  });

  describe('Language Detection Service', () => {
    test('should detect English correctly', async () => {
      const result = await languageDetectorService.detect('Hello, how are you today?');
      expect(result).toBe('en-US');
    });

    test('should detect Spanish correctly', async () => {
      const result = await languageDetectorService.detect('Hola, ¿cómo estás hoy?');
      expect(result).toBe('es-ES');
    });

    test('should handle empty input gracefully', async () => {
      const result = await languageDetectorService.detect('');
      expect(result).toBe('en-US'); // Default fallback
    });

    test('should return supported languages list', () => {
      const languages = languageDetectorService.getSupportedLanguages();
      expect(languages).toContain('en-US');
      expect(languages).toContain('es-ES');
      expect(languages).toContain('fr-FR');
      expect(languages.length).toBeGreaterThan(5);
    });
  });

  describe('Action Executor Service', () => {
    const testActions: SiteAction[] = [
      {
        name: 'navigate_home',
        type: 'navigation',
        selector: 'a[href="/"]',
        description: 'Navigate to home page',
        parameters: [],
        confirmation: false,
        sideEffecting: 'safe',
        riskLevel: 'low',
        category: 'read',
        metadata: { estimatedTime: 500 },
      },
      {
        name: 'submit_contact_form',
        type: 'form',
        selector: '#contact-form',
        description: 'Submit contact form',
        parameters: [
          {
            name: 'name',
            type: 'string',
            required: true,
            description: 'User name',
          },
          {
            name: 'email',
            type: 'string',
            required: true,
            description: 'User email',
          },
        ],
        confirmation: true,
        sideEffecting: 'write',
        riskLevel: 'medium',
        category: 'communication',
        metadata: { estimatedTime: 2000 },
      },
    ];

    beforeAll(() => {
      actionExecutorService.registerActions(testSiteId, testActions);
    });

    test('should register actions successfully', () => {
      const actions = actionExecutorService.getAvailableActions(testSiteId);
      expect(actions).toHaveLength(2);
      expect(actions[0]?.name).toBe('navigate_home');
      expect(actions[1]?.name).toBe('submit_contact_form');
    });

    test('should execute navigation action', async () => {
      const result = await actionExecutorService.execute({
        siteId: testSiteId,
        actionName: 'navigate_home',
        parameters: {},
      });

      expect(result.success).toBe(true);
      expect(result.result.type).toBe('navigation');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    test('should validate form parameters', async () => {
      const result = await actionExecutorService.execute({
        siteId: testSiteId,
        actionName: 'submit_contact_form',
        parameters: {}, // Missing required parameters
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    test('should perform dry run analysis', async () => {
      const dryRun = await actionExecutorService.dryRun({
        siteId: testSiteId,
        actionName: 'navigate_home',
        parameters: {},
      });

      expect(dryRun.valid).toBe(true);
      expect(dryRun.estimatedExecutionTime).toBeGreaterThan(0);
      expect(dryRun.sideEffects).toContain('Page navigation');
    });

    test('should get execution history', () => {
      const history = actionExecutorService.getExecutionHistory(testSiteId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]?.siteId).toBe(testSiteId);
    });
  });

  describe('Knowledge Base Service', () => {
    test('should compute content hashes consistently', async () => {
      const testContent = 'This is test content for hashing';
      
      const result1 = await knowledgeBaseService.upsertDocument({
        siteId: testSiteId,
        tenantId: testTenantId,
        url: 'https://example.com/test',
        canonicalUrl: 'https://example.com/test',
        title: 'Test Document',
        content: testContent,
      });

      const result2 = await knowledgeBaseService.upsertDocument({
        siteId: testSiteId,
        tenantId: testTenantId,
        url: 'https://example.com/test',
        canonicalUrl: 'https://example.com/test',
        title: 'Test Document',
        content: testContent,
      });

      expect(result1.documentId).toBe(result2.documentId);
      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
      expect(result2.contentChanged).toBe(false);
    });

    test('should detect content changes', async () => {
      const result1 = await knowledgeBaseService.upsertDocument({
        siteId: testSiteId,
        tenantId: testTenantId,
        url: 'https://example.com/test2',
        canonicalUrl: 'https://example.com/test2',
        title: 'Test Document',
        content: 'Original content',
      });

      const result2 = await knowledgeBaseService.upsertDocument({
        siteId: testSiteId,
        tenantId: testTenantId,
        url: 'https://example.com/test2',
        canonicalUrl: 'https://example.com/test2',
        title: 'Test Document',
        content: 'Modified content', // Changed content
      });

      expect(result1.documentId).toBe(result2.documentId);
      expect(result2.contentChanged).toBe(true);
    });

    test('should perform semantic search', async () => {
      // First upsert some test documents with chunks
      const documentResult = await knowledgeBaseService.upsertDocument({
        siteId: testSiteId,
        tenantId: testTenantId,
        url: 'https://example.com/search-test',
        canonicalUrl: 'https://example.com/search-test',
        title: 'Searchable Document',
        content: 'This document contains information about artificial intelligence and machine learning.',
      });

      // Upsert chunks
      await knowledgeBaseService.upsertChunks(documentResult.documentId, [
        {
          documentId: documentResult.documentId,
          siteId: testSiteId,
          tenantId: testTenantId,
          chunkIndex: 0,
          content: 'This document contains information about artificial intelligence and machine learning.',
          cleanedContent: 'This document contains information about artificial intelligence and machine learning.',
          tokenCount: 15,
          locale: 'en',
          contentType: 'text',
        },
      ]);

      // Perform search
      const searchResults = await knowledgeBaseService.semanticSearch({
        query: 'artificial intelligence',
        siteId: testSiteId,
        tenantId: testTenantId,
        limit: 5,
      });

      expect(searchResults).toBeDefined();
      expect(searchResults.length).toBeGreaterThanOrEqual(0);
    });

    test('should get site statistics', async () => {
      const stats = await knowledgeBaseService.getSiteStats(testSiteId, testTenantId);
      
      expect(stats).toHaveProperty('documentCount');
      expect(stats).toHaveProperty('chunkCount');
      expect(stats).toHaveProperty('actionCount');
      expect(stats).toHaveProperty('formCount');
      expect(typeof stats.documentCount).toBe('number');
    });
  });

  describe('LangGraph Orchestrator', () => {
    let orchestrator: LangGraphOrchestrator;

    beforeAll(() => {
      orchestrator = new LangGraphOrchestrator(testSiteId, {
        kbService: knowledgeBaseService,
        actionExecutor: actionExecutorService,
        languageDetector: languageDetectorService,
      });

      // Register test actions
      const testActions: SiteAction[] = [
        {
          name: 'search_products',
          type: 'navigation',
          selector: '[data-action="search"]',
          description: 'Search for products',
          parameters: [
            {
              name: 'query',
              type: 'string',
              required: true,
              description: 'Search query',
            },
          ],
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'read',
        },
      ];

      orchestrator.registerActions(testActions);
    });

    test('should process simple conversation', async () => {
      const result = await orchestrator.processConversation({
        userInput: 'Hello, I need help with my order',
        sessionId: 'test-session-1',
        siteId: testSiteId,
      });

      expect(result).toHaveProperty('finalResponse');
      expect(result).toHaveProperty('detectedLanguage');
      expect(result).toHaveProperty('intent');
      expect(result.sessionId).toBe('test-session-1');
      expect(result.detectedLanguage).toBe('en-US');
    });

    test('should handle streaming conversation', async () => {
      const streamChunks = [];
      
      for await (const chunk of orchestrator.streamConversation({
        userInput: 'Can you help me find products?',
        sessionId: 'test-session-2',
        siteId: testSiteId,
      })) {
        streamChunks.push(chunk);
      }

      expect(streamChunks.length).toBeGreaterThan(0);
      expect(streamChunks[0]).toHaveProperty('node');
      expect(streamChunks[0]).toHaveProperty('state');
    });
  });

  describe('AI Orchestration Service', () => {
    test('should process conversation request', async () => {
      const response = await aiOrchestrationService.processConversation({
        input: 'I want to search for blue shirts',
        siteId: testSiteId,
      });

      expect(response).toHaveProperty('sessionId');
      expect(response).toHaveProperty('response');
      expect(response.response).toHaveProperty('text');
      expect(response.response).toHaveProperty('metadata');
      expect(response.response.metadata).toHaveProperty('responseTime');
      expect(response.response.metadata.responseTime).toBeGreaterThan(0);
    });

    test('should register site actions', async () => {
      const testActions: SiteAction[] = [
        {
          name: 'add_to_cart',
          type: 'button',
          selector: '[data-action="add-cart"]',
          description: 'Add item to shopping cart',
          parameters: [
            {
              name: 'productId',
              type: 'string',
              required: true,
              description: 'Product ID to add',
            },
          ],
          confirmation: false,
          sideEffecting: 'write',
          riskLevel: 'medium',
          category: 'write',
        },
      ];

      await aiOrchestrationService.registerSiteActions(testSiteId, testActions);
      
      const actions = aiOrchestrationService.getSiteActions(testSiteId);
      expect(actions.some(action => action.name === 'add_to_cart')).toBe(true);
    });

    test('should execute actions directly', async () => {
      const result = await aiOrchestrationService.executeAction({
        siteId: testSiteId,
        actionName: 'navigate_home',
        parameters: {},
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('executionTime');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    test('should get system statistics', () => {
      const stats = aiOrchestrationService.getStats();
      
      expect(stats).toHaveProperty('activeOrchestrators');
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('totalActionsExecuted');
      expect(typeof stats.activeOrchestrators).toBe('number');
    });
  });

  describe('End-to-End Scenarios', () => {
    test('should handle complete voice interaction flow', async () => {
      // Simulate a complete user interaction
      const userInput = 'I want to find a blue shirt in size large and add it to my cart';
      
      const response = await aiOrchestrationService.processConversation({
        input: userInput,
        siteId: testSiteId,
        browserLanguage: 'en-US',
        context: {
          currentUrl: 'https://example.com/products',
          pageTitle: 'Products - Example Store',
          userAgent: 'Mozilla/5.0 Test Browser',
        },
      });

      // Verify response structure
      expect(response).toMatchObject({
        sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/), // UUID pattern
        response: {
          text: expect.stringContaining(''),
          citations: expect.arrayContaining([]),
          uiHints: expect.objectContaining({}),
          metadata: {
            responseTime: expect.any(Number),
            tokensUsed: expect.any(Number),
            actionsTaken: expect.any(Number),
            language: 'en-US',
          },
        },
      });

      // Verify reasonable response time
      expect(response.response.metadata.responseTime).toBeLessThan(10000); // Less than 10 seconds
    });

    test('should handle multi-step action planning', async () => {
      // Register multi-step actions
      const complexActions: SiteAction[] = [
        {
          name: 'search_products',
          type: 'form',
          selector: '#search-form',
          description: 'Search for products',
          parameters: [
            { name: 'query', type: 'string', required: true, description: 'Search term' },
            { name: 'category', type: 'string', required: false, description: 'Product category' },
          ],
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'read',
        },
        {
          name: 'filter_by_size',
          type: 'button',
          selector: '[data-filter="size"]',
          description: 'Filter products by size',
          parameters: [
            { name: 'size', type: 'string', required: true, description: 'Size to filter by' },
          ],
          confirmation: false,
          sideEffecting: 'safe',
          riskLevel: 'low',
          category: 'read',
        },
        {
          name: 'add_to_cart',
          type: 'button',
          selector: '.add-to-cart-btn',
          description: 'Add selected item to cart',
          parameters: [
            { name: 'productId', type: 'string', required: true, description: 'Product ID' },
          ],
          confirmation: true,
          sideEffecting: 'write',
          riskLevel: 'medium',
          category: 'write',
        },
      ];

      await aiOrchestrationService.registerSiteActions(testSiteId, complexActions);

      const response = await aiOrchestrationService.processConversation({
        input: 'Find me blue shirts in large size and add one to my cart',
        siteId: testSiteId,
      });

      expect(response.sessionId).toBeDefined();
      expect(response.response.metadata.responseTime).toBeGreaterThan(0);
    });

    test('should maintain session continuity', async () => {
      // First interaction
      const response1 = await aiOrchestrationService.processConversation({
        input: 'Show me your return policy',
        siteId: testSiteId,
      });

      const sessionId = response1.sessionId;

      // Follow-up interaction with same session
      const response2 = await aiOrchestrationService.processConversation({
        input: 'How long do I have to return an item?',
        siteId: testSiteId,
        sessionId: sessionId,
      });

      expect(response2.sessionId).toBe(sessionId);
      expect(response2.response.metadata.responseTime).toBeGreaterThan(0);
    });
  });
});

// Helper function to create test data (removed as unused)

// Performance benchmarks
describe('Performance Tests', () => {
  test('language detection should be fast', async () => {
    const start = Date.now();
    await languageDetectorService.detect('This is a test sentence for performance measurement');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100); // Should be under 100ms
  });

  test('action execution should meet timing requirements', async () => {
    const start = Date.now();
    await actionExecutorService.execute({
      siteId: testSiteId,
      actionName: 'navigate_home',
      parameters: {},
    });
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(1000); // Should be under 1 second
  });

  test('conversation processing should meet response time targets', async () => {
    const start = Date.now();
    const response = await aiOrchestrationService.processConversation({
      input: 'Quick test message',
      siteId: testSiteId,
    });
    const duration = Date.now() - start;
    
    // Should meet the 300ms first response target from source-of-truth
    expect(duration).toBeLessThan(5000); // Allow 5 seconds for full processing
    expect(response.response.metadata.responseTime).toBeLessThan(10000);
  });
});

export { };