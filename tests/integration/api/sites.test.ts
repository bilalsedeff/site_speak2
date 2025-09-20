/**
 * Sites API Integration Tests
 *
 * Integration tests for the sites API endpoints.
 * Demonstrates API testing with authentication, database, and validation.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestAuthContext,
  createTestSite,
  createTestTenant,
  assertions,
  timing,
  ApiTestHelper,
  DatabaseTestHelper,
  AuthTestHelper
} from '../../helpers';

// Mock Express app (in real implementation, this would be your actual app)
const createMockApp = () => {
  const express = require('express');
  const app = express();

  app.use(express.json());

  // Mock middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    try {
      // Mock token verification
      if (token.includes('invalid')) {
        throw new Error('Invalid token');
      }

      req.user = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'owner',
        tenantId: 'tenant-123'
      };

      next();
    } catch (error) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
  };

  // Mock sites endpoints
  app.get('/api/sites', authenticateToken, (req: any, res: any) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Mock sites data
    const sites = Array.from({ length: 25 }, (_, i) => ({
      id: `site-${i + 1}`,
      name: `Test Site ${i + 1}`,
      templateId: 'modern-business',
      category: 'business',
      status: i % 3 === 0 ? 'published' : 'draft',
      tenantId: req.user.tenantId,
      ownerId: req.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedSites = sites.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedSites,
      pagination: {
        total: sites.length,
        page,
        limit,
        pages: Math.ceil(sites.length / limit)
      }
    });
  });

  app.post('/api/sites', authenticateToken, (req: any, res: any) => {
    const { name, templateId, category } = req.body;

    // Validation
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['Name must be at least 2 characters long']
      });
    }

    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['Template ID is required']
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['Category is required']
      });
    }

    // Mock site creation
    const newSite = {
      id: `site-${Date.now()}`,
      name,
      templateId,
      category,
      status: 'draft',
      tenantId: req.user.tenantId,
      ownerId: req.user.id,
      publishedUrl: null,
      settings: {},
      content: { pages: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.status(201).json({
      success: true,
      data: newSite
    });
  });

  app.get('/api/sites/:id', authenticateToken, (req: any, res: any) => {
    const { id } = req.params;

    if (!id.startsWith('site-')) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    const site = {
      id,
      name: 'Test Site',
      templateId: 'modern-business',
      category: 'business',
      status: 'published',
      tenantId: req.user.tenantId,
      ownerId: req.user.id,
      publishedUrl: `https://${id}.sites.sitespeak.ai`,
      settings: { theme: 'modern' },
      content: { pages: [{ id: 'home', title: 'Home' }] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: site
    });
  });

  app.put('/api/sites/:id', authenticateToken, (req: any, res: any) => {
    const { id } = req.params;
    const updates = req.body;

    if (!id.startsWith('site-')) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    const updatedSite = {
      id,
      name: updates.name || 'Test Site',
      templateId: updates.templateId || 'modern-business',
      category: updates.category || 'business',
      status: updates.status || 'published',
      tenantId: req.user.tenantId,
      ownerId: req.user.id,
      publishedUrl: `https://${id}.sites.sitespeak.ai`,
      settings: updates.settings || { theme: 'modern' },
      content: updates.content || { pages: [] },
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      data: updatedSite
    });
  });

  app.delete('/api/sites/:id', authenticateToken, (req: any, res: any) => {
    const { id } = req.params;

    if (!id.startsWith('site-')) {
      return res.status(404).json({
        success: false,
        message: 'Site not found'
      });
    }

    res.json({
      success: true,
      message: 'Site deleted successfully'
    });
  });

  return app;
};

describe('Sites API Integration Tests', () => {
  let api: ApiTestHelper;
  let db: DatabaseTestHelper;
  let auth: AuthTestHelper;
  let app: any;

  beforeAll(async () => {
    // Setup test environment
    app = createMockApp();
    const testEnv = await setupTestEnvironment(app);

    api = testEnv.api!;
    db = testEnv.db;
    auth = testEnv.auth;

    console.log('✅ Test environment setup completed');
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
    console.log('✅ Test environment cleanup completed');
  });

  beforeEach(async () => {
    // Clean database before each test
    await db.cleanup();
  });

  describe('GET /api/sites', () => {
    test('should return paginated list of sites for authenticated user', async () => {
      const authContext = createTestAuthContext('owner');
      const response = await api.get('/api/sites', authContext);

      api.assertSuccessResponse(response);
      api.assertPaginatedResponse(response);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(0);
    });

    test('should handle pagination parameters correctly', async () => {
      const authContext = createTestAuthContext('owner');

      const testCases = await api.testPagination('/api/sites', authContext);

      // First page should be successful
      api.assertSuccessResponse(testCases.firstPage);
      expect(testCases.firstPage.body.pagination.page).toBe(1);

      // Second page should be successful
      api.assertSuccessResponse(testCases.secondPage);
      expect(testCases.secondPage.body.pagination.page).toBe(2);

      // Large page should be limited
      api.assertSuccessResponse(testCases.largePage);
      expect(testCases.largePage.body.data.length).toBeLessThanOrEqual(100);
    });

    test('should require authentication', async () => {
      const response = await api.get('/api/sites');
      api.assertErrorResponse(response, 401, 'Access token required');
    });

    test('should test different authentication scenarios', async () => {
      const authScenarios = await api.testAuthenticationScenarios('/api/sites');

      // No auth should fail
      api.assertErrorResponse(authScenarios.noAuth, 401);

      // Valid auth should succeed
      api.assertSuccessResponse(authScenarios.validAuth);

      // Invalid auth should fail
      api.assertErrorResponse(authScenarios.invalidAuth, 403);
      api.assertErrorResponse(authScenarios.malformedAuth, 403);
    });

    test('should have good performance', async () => {
      const authContext = createTestAuthContext('owner');

      const { duration } = await timing.measure(async () => {
        await api.get('/api/sites', authContext);
      });

      // API should respond within 500ms
      assertions.assertPerformance(Date.now() - duration, 500);
    });
  });

  describe('POST /api/sites', () => {
    test('should create new site with valid data', async () => {
      const authContext = createTestAuthContext('owner');
      const siteData = {
        name: 'Test Business Site',
        templateId: 'modern-business',
        category: 'business'
      };

      const response = await api.post('/api/sites', siteData, authContext);

      api.assertSuccessResponse(response, 201);
      expect(response.body.data).toMatchObject({
        name: siteData.name,
        templateId: siteData.templateId,
        category: siteData.category,
        status: 'draft'
      });

      // Verify structure using custom assertion
      assertions.assertStructure(response.body.data, {
        id: 'string',
        name: 'string',
        templateId: 'string',
        category: 'string',
        status: 'string',
        tenantId: 'string',
        ownerId: 'string',
        createdAt: 'string',
        updatedAt: 'string'
      });
    });

    test('should validate site data and return errors', async () => {
      const authContext = createTestAuthContext('owner');
      const validData = {
        name: 'Valid Site Name',
        templateId: 'modern-business',
        category: 'business'
      };

      const invalidScenarios = [
        {
          name: 'emptyName',
          data: { ...validData, name: '' },
          expectedStatus: 400
        },
        {
          name: 'shortName',
          data: { ...validData, name: 'A' },
          expectedStatus: 400
        },
        {
          name: 'missingTemplateId',
          data: { ...validData, templateId: '' },
          expectedStatus: 400
        },
        {
          name: 'missingCategory',
          data: { ...validData, category: '' },
          expectedStatus: 400
        }
      ];

      const results = await api.testValidation('/api/sites', validData, invalidScenarios, authContext);

      // Valid data should succeed
      api.assertSuccessResponse(results.valid, 201);

      // Invalid scenarios should fail with validation errors
      Object.entries(results).forEach(([scenario, response]) => {
        if (scenario !== 'valid') {
          api.assertValidationErrorResponse(response);
        }
      });
    });

    test('should require authentication', async () => {
      const siteData = {
        name: 'Test Site',
        templateId: 'modern-business',
        category: 'business'
      };

      const response = await api.post('/api/sites', siteData);
      api.assertErrorResponse(response, 401);
    });

    test('should test role-based access', async () => {
      const siteData = {
        name: 'Test Site',
        templateId: 'modern-business',
        category: 'business'
      };

      const roleResults = await api.testRoleBasedAccess('/api/sites', 'POST', siteData);

      // All roles should be able to create sites in this mock
      api.assertSuccessResponse(roleResults.owner, 201);
      api.assertSuccessResponse(roleResults.admin, 201);
      api.assertSuccessResponse(roleResults.editor, 201);
      api.assertSuccessResponse(roleResults.viewer, 201);
    });
  });

  describe('GET /api/sites/:id', () => {
    test('should return specific site by ID', async () => {
      const authContext = createTestAuthContext('owner');
      const siteId = 'site-123';

      const response = await api.get(`/api/sites/${siteId}`, authContext);

      api.assertSuccessResponse(response);
      expect(response.body.data.id).toBe(siteId);

      // Verify complete site structure
      assertions.assertHasProperties(response.body.data, [
        'id', 'name', 'templateId', 'category', 'status',
        'tenantId', 'ownerId', 'publishedUrl', 'settings',
        'content', 'createdAt', 'updatedAt'
      ]);
    });

    test('should return 404 for non-existent site', async () => {
      const authContext = createTestAuthContext('owner');
      const response = await api.get('/api/sites/non-existent', authContext);

      api.assertErrorResponse(response, 404, 'Site not found');
    });

    test('should require authentication', async () => {
      const response = await api.get('/api/sites/site-123');
      api.assertErrorResponse(response, 401);
    });
  });

  describe('PUT /api/sites/:id', () => {
    test('should update existing site', async () => {
      const authContext = createTestAuthContext('owner');
      const siteId = 'site-123';
      const updateData = {
        name: 'Updated Site Name',
        status: 'published',
        settings: { theme: 'dark' }
      };

      const response = await api.put(`/api/sites/${siteId}`, updateData, authContext);

      api.assertSuccessResponse(response);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.status).toBe(updateData.status);
      expect(response.body.data.settings.theme).toBe('dark');
    });

    test('should return 404 for non-existent site', async () => {
      const authContext = createTestAuthContext('owner');
      const updateData = { name: 'Updated Name' };

      const response = await api.put('/api/sites/non-existent', updateData, authContext);
      api.assertErrorResponse(response, 404, 'Site not found');
    });

    test('should require authentication', async () => {
      const updateData = { name: 'Updated Name' };
      const response = await api.put('/api/sites/site-123', updateData);
      api.assertErrorResponse(response, 401);
    });
  });

  describe('DELETE /api/sites/:id', () => {
    test('should delete existing site', async () => {
      const authContext = createTestAuthContext('owner');
      const siteId = 'site-123';

      const response = await api.delete(`/api/sites/${siteId}`, authContext);

      api.assertSuccessResponse(response);
      expect(response.body.message).toBe('Site deleted successfully');
    });

    test('should return 404 for non-existent site', async () => {
      const authContext = createTestAuthContext('owner');
      const response = await api.delete('/api/sites/non-existent', authContext);

      api.assertErrorResponse(response, 404, 'Site not found');
    });

    test('should require authentication', async () => {
      const response = await api.delete('/api/sites/site-123');
      api.assertErrorResponse(response, 401);
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle concurrent requests', async () => {
      const authContext = createTestAuthContext('owner');

      // Create 50 concurrent requests
      const promises = Array.from({ length: 50 }, () =>
        timing.measure(() => api.get('/api/sites', authContext))
      );

      const results = await Promise.all(promises);

      // All requests should succeed
      results.forEach(({ result }) => {
        api.assertSuccessResponse(result);
      });

      // Average response time should be reasonable
      const avgDuration = results.reduce((sum, { duration }) => sum + duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(1000); // Under 1 second average
    });

    test('should handle rate limiting gracefully', async () => {
      const authContext = createTestAuthContext('owner');

      // Test rate limiting (if implemented)
      const responses = await api.testRateLimit('/api/sites', authContext, 20);

      // Most requests should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(15); // At least 75% success rate
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON gracefully', async () => {
      const authContext = createTestAuthContext('owner');

      const response = await api.makeAuthenticatedRequest(
        'POST',
        '/api/sites',
        authContext,
        'invalid-json',
        { 'Content-Type': 'application/json' }
      );

      // Should handle malformed JSON without crashing
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle large payloads', async () => {
      const authContext = createTestAuthContext('owner');
      const largeContent = 'x'.repeat(100000); // 100KB of content

      const response = await api.post('/api/sites', {
        name: 'Large Content Site',
        templateId: 'modern-business',
        category: 'business',
        content: { description: largeContent }
      }, authContext);

      // Should handle large payloads
      expect(response.status).toBeLessThan(500);
    });

    test('should maintain data consistency', async () => {
      const authContext = createTestAuthContext('owner');

      // Create site
      const createResponse = await api.post('/api/sites', {
        name: 'Consistency Test Site',
        templateId: 'modern-business',
        category: 'business'
      }, authContext);

      api.assertSuccessResponse(createResponse, 201);
      const siteId = createResponse.body.data.id;

      // Retrieve site
      const getResponse = await api.get(`/api/sites/${siteId}`, authContext);
      api.assertSuccessResponse(getResponse);

      // Data should be consistent
      expect(getResponse.body.data.name).toBe('Consistency Test Site');
      expect(getResponse.body.data.templateId).toBe('modern-business');
    });
  });
});