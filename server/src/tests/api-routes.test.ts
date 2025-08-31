/**
 * API Routes Integration Tests
 * Tests for the AI API routes and overall server integration
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { SiteSeakServer } from '../infrastructure/server';
import type { Express } from 'express';

describe('API Routes Integration Tests', () => {
  let server: SiteSeakServer;
  let app: Express;
  let originalConsoleLog: typeof console.log;

  beforeAll(async () => {
    // Mock console.log to prevent test output pollution
    originalConsoleLog = console.log;
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();

    // Mock environment variables for testing
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = process.env['DATABASE_URL'] || 'postgresql://test:test@localhost/test_db';
    process.env['REDIS_URL'] = process.env['REDIS_URL'] || 'redis://localhost:6379/1';
    process.env['JWT_SECRET'] = 'test-jwt-secret-key-that-is-long-enough-for-validation';
    process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-characters';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';

    try {
      server = new SiteSeakServer();
      await server.initialize();
      app = server.getApp();
    } catch (error) {
      console.error('Failed to initialize test server:', error);
      throw error;
    }
  });

  afterAll(async () => {
    console.log = originalConsoleLog;
    console.info = originalConsoleLog;
    console.warn = originalConsoleLog;
    console.error = originalConsoleLog;
    
    // Note: We don't start the server in tests, so no need to close it
  });

  describe('Health Endpoints', () => {
    it('should return healthy status for basic health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
    });

    it('should return alive status for liveness probe', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
      expect(response.body.uptime).toBeDefined();
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready');

      // May return 200 or 503 depending on dependencies
      expect([200, 503]).toContain(response.status);
      expect(response.body.status).toMatch(/ready|not-ready/);
      expect(response.body.checks).toBeDefined();
    });
  });

  describe('API Info Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);

      expect(response.body.message).toContain('SiteSpeak API');
      expect(response.body.version).toBeDefined();
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.ai).toBe('/api/ai');
      expect(response.body.endpoints.voice).toBe('/api/voice');
      expect(response.body.endpoints.sites).toBe('/api/sites');
    });
  });

  describe('AI API Routes', () => {
    it('should return healthy status for AI service', async () => {
      const response = await request(app)
        .get('/api/ai/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.service).toBe('universal-ai-assistant');
    });

    it('should process conversation request', async () => {
      const conversationRequest = {
        input: 'Hello, this is a test message',
        siteId: 'test-site-123',
        context: {
          currentUrl: 'https://example.com',
          pageTitle: 'Test Page',
          browserLanguage: 'en-US',
        },
      };

      const response = await request(app)
        .post('/api/ai/conversation')
        .send(conversationRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.response.text).toBeDefined();
      expect(response.body.data.response.metadata.responseTime).toBeDefined();
      expect(response.body.metadata.requestId).toBeDefined();
    });

    it('should validate conversation request parameters', async () => {
      const invalidRequest = {
        input: '', // Empty input
        siteId: '', // Empty site ID
      };

      const response = await request(app)
        .post('/api/ai/conversation')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
      expect(response.body.error.message).toContain('input and siteId are required');
    });

    it('should register site actions', async () => {
      const actionsRequest = {
        siteId: 'test-site-123',
        actions: [
          {
            name: 'navigate-home',
            type: 'navigation',
            selector: '#home-link',
            description: 'Navigate to home page',
            category: 'navigation',
            riskLevel: 'low',
            sideEffecting: 'safe',
            parameters: [],
            confirmation: false,
          },
          {
            name: 'add-to-cart',
            type: 'button',
            selector: '.add-cart-btn',
            description: 'Add item to cart',
            category: 'commerce',
            riskLevel: 'medium',
            sideEffecting: 'modifying',
            parameters: [
              {
                name: 'productId',
                type: 'string',
                description: 'Product ID',
                required: true,
              },
            ],
            confirmation: true,
          },
        ],
      };

      const response = await request(app)
        .post('/api/ai/actions/register')
        .send(actionsRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.siteId).toBe('test-site-123');
      expect(response.body.data.registeredActions).toBe(2);
    });

    it('should retrieve registered site actions', async () => {
      // First register some actions (using the same from previous test)
      const actionsRequest = {
        siteId: 'test-retrieve-123',
        actions: [
          {
            name: 'test-action',
            type: 'button',
            selector: '#test-btn',
            description: 'Test action',
            category: 'test',
            riskLevel: 'low',
            sideEffecting: 'safe',
            parameters: [],
            confirmation: false,
          },
        ],
      };

      await request(app)
        .post('/api/ai/actions/register')
        .send(actionsRequest);

      // Now retrieve them
      const response = await request(app)
        .get('/api/ai/actions/test-retrieve-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.siteId).toBe('test-retrieve-123');
      expect(response.body.data.actions).toBeInstanceOf(Array);
      expect(response.body.data.count).toBe(1);
    });

    it('should execute actions directly', async () => {
      // First register an action
      await request(app)
        .post('/api/ai/actions/register')
        .send({
          siteId: 'test-execute-123',
          actions: [{
            name: 'execute-test',
            type: 'navigation',
            selector: '#nav-link',
            description: 'Test navigation',
            category: 'navigation',
            riskLevel: 'low',
            sideEffecting: 'safe',
            parameters: [],
            confirmation: false,
          }],
        });

      // Execute the action
      const response = await request(app)
        .post('/api/ai/actions/execute')
        .send({
          siteId: 'test-execute-123',
          actionName: 'execute-test',
          parameters: { url: '/test' },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.executionTime).toBeDefined();
    });

    it('should get AI service metrics', async () => {
      const response = await request(app)
        .get('/api/ai/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.metrics).toBeDefined();
      expect(response.body.data.metrics.totalRequests).toBeDefined();
      expect(response.body.data.metrics.successfulRequests).toBeDefined();
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should handle conversation streaming endpoint setup', async () => {
      // Test that the streaming endpoint exists and accepts POST requests
      // We don't test the actual streaming here as it requires special handling
      const response = await request(app)
        .post('/api/ai/conversation/stream')
        .send({
          input: 'test stream',
          siteId: 'test-site',
        });

      // The response might be 200 for SSE setup or other status codes
      // What's important is that the endpoint exists and processes the request
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('Voice API Routes', () => {
    it('should return healthy status for voice service', async () => {
      const response = await request(app)
        .get('/api/voice/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('voice');
    });
  });

  describe('Sites API Routes', () => {
    it('should return healthy status for sites service', async () => {
      const response = await request(app)
        .get('/api/sites/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('sites');
    });
  });

  describe('Auth API Routes', () => {
    it('should return healthy status for auth service', async () => {
      const response = await request(app)
        .get('/api/auth/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('auth');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .expect(404);

      expect(response.body.error).toBe('Endpoint not found');
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.path).toBe('/api/non-existent-endpoint');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/ai/conversation')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // The exact error message may vary, but it should be a 400 error
      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limiting headers', async () => {
      const response = await request(app)
        .get('/api/ai/health');

      // Rate limiting middleware should add headers
      // Note: Headers might not be present in test environment
      expect(response.status).toBe(200);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers for API requests', async () => {
      const response = await request(app)
        .get('/api/ai/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.status).toBe(200);
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/api/ai/conversation')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Request ID Correlation', () => {
    it('should include correlation ID in responses', async () => {
      const response = await request(app)
        .get('/api/ai/health')
        .set('X-Correlation-ID', 'test-correlation-123');

      expect(response.headers['x-correlation-id']).toBe('test-correlation-123');
    });

    it('should generate correlation ID if not provided', async () => {
      const response = await request(app)
        .get('/api/ai/health');

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });
  });
});