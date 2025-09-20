/**
 * API Test Helpers
 *
 * Utilities for testing API endpoints, making HTTP requests,
 * and validating responses in integration tests.
 */

import request, { SuperTest, Test } from 'supertest';
import { Express } from 'express';
import { AuthTestContext, authTestHelper } from './auth';

export interface ApiTestResponse {
  status: number;
  body: any;
  headers: Record<string, string>;
}

export interface ApiTestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  headers?: Record<string, string>;
  auth?: AuthTestContext;
}

/**
 * API test helper class
 */
export class ApiTestHelper {
  private app: Express;
  private supertest: SuperTest<Test>;

  constructor(app: Express) {
    this.app = app;
    this.supertest = request(app);
  }

  /**
   * Make authenticated request
   */
  async makeAuthenticatedRequest(
    method: string,
    url: string,
    auth: AuthTestContext,
    data?: any,
    additionalHeaders?: Record<string, string>
  ): Promise<ApiTestResponse> {
    const headers = {
      ...authTestHelper.createAuthHeadersFromContext(auth),
      ...additionalHeaders
    };

    let req = this.supertest[method.toLowerCase() as keyof SuperTest<Test>](url) as Test;

    // Set headers
    Object.entries(headers).forEach(([key, value]) => {
      req = req.set(key, value);
    });

    // Add data if provided
    if (data) {
      req = req.send(data);
    }

    const response = await req;

    return {
      status: response.status,
      body: response.body,
      headers: response.headers
    };
  }

  /**
   * Make unauthenticated request
   */
  async makeRequest(
    method: string,
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<ApiTestResponse> {
    let req = this.supertest[method.toLowerCase() as keyof SuperTest<Test>](url) as Test;

    // Set headers
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        req = req.set(key, value);
      });
    }

    // Add data if provided
    if (data) {
      req = req.send(data);
    }

    const response = await req;

    return {
      status: response.status,
      body: response.body,
      headers: response.headers
    };
  }

  // Convenience methods for different HTTP verbs

  async get(url: string, auth?: AuthTestContext, headers?: Record<string, string>): Promise<ApiTestResponse> {
    if (auth) {
      return this.makeAuthenticatedRequest('GET', url, auth, undefined, headers);
    }
    return this.makeRequest('GET', url, undefined, headers);
  }

  async post(url: string, data?: any, auth?: AuthTestContext, headers?: Record<string, string>): Promise<ApiTestResponse> {
    if (auth) {
      return this.makeAuthenticatedRequest('POST', url, auth, data, headers);
    }
    return this.makeRequest('POST', url, data, headers);
  }

  async put(url: string, data?: any, auth?: AuthTestContext, headers?: Record<string, string>): Promise<ApiTestResponse> {
    if (auth) {
      return this.makeAuthenticatedRequest('PUT', url, auth, data, headers);
    }
    return this.makeRequest('PUT', url, data, headers);
  }

  async patch(url: string, data?: any, auth?: AuthTestContext, headers?: Record<string, string>): Promise<ApiTestResponse> {
    if (auth) {
      return this.makeAuthenticatedRequest('PATCH', url, auth, data, headers);
    }
    return this.makeRequest('PATCH', url, data, headers);
  }

  async delete(url: string, auth?: AuthTestContext, headers?: Record<string, string>): Promise<ApiTestResponse> {
    if (auth) {
      return this.makeAuthenticatedRequest('DELETE', url, auth, undefined, headers);
    }
    return this.makeRequest('DELETE', url, undefined, headers);
  }

  /**
   * Upload file endpoint testing
   */
  async uploadFile(
    url: string,
    filePath: string,
    fieldName: string = 'file',
    auth?: AuthTestContext,
    additionalFields?: Record<string, string>
  ): Promise<ApiTestResponse> {
    let req = this.supertest.post(url);

    if (auth) {
      const headers = authTestHelper.createAuthHeadersFromContext(auth);
      Object.entries(headers).forEach(([key, value]) => {
        req = req.set(key, value);
      });
    }

    req = req.attach(fieldName, filePath);

    if (additionalFields) {
      Object.entries(additionalFields).forEach(([key, value]) => {
        req = req.field(key, value);
      });
    }

    const response = await req;

    return {
      status: response.status,
      body: response.body,
      headers: response.headers
    };
  }

  /**
   * Test endpoints with different authentication scenarios
   */
  async testAuthenticationScenarios(url: string, method: string = 'GET', data?: any): Promise<{
    noAuth: ApiTestResponse;
    validAuth: ApiTestResponse;
    expiredAuth: ApiTestResponse;
    invalidAuth: ApiTestResponse;
    malformedAuth: ApiTestResponse;
  }> {
    const validAuth = authTestHelper.createOwnerAuthContext();
    const expiredToken = authTestHelper.createExpiredToken(validAuth.user);
    const invalidToken = authTestHelper.createInvalidSignatureToken(validAuth.user);
    const malformedToken = authTestHelper.createMalformedToken();

    return {
      noAuth: await this.makeRequest(method, url, data),
      validAuth: await this.makeAuthenticatedRequest(method, url, validAuth, data),
      expiredAuth: await this.makeRequest(method, url, data, { 'Authorization': `Bearer ${expiredToken}` }),
      invalidAuth: await this.makeRequest(method, url, data, { 'Authorization': `Bearer ${invalidToken}` }),
      malformedAuth: await this.makeRequest(method, url, data, { 'Authorization': `Bearer ${malformedToken}` })
    };
  }

  /**
   * Test role-based access control
   */
  async testRoleBasedAccess(url: string, method: string = 'GET', data?: any): Promise<{
    owner: ApiTestResponse;
    admin: ApiTestResponse;
    editor: ApiTestResponse;
    viewer: ApiTestResponse;
  }> {
    const ownerAuth = authTestHelper.createOwnerAuthContext();
    const adminAuth = authTestHelper.createAdminAuthContext({ tenantId: ownerAuth.tenant.id });
    const editorAuth = authTestHelper.createEditorAuthContext({ tenantId: ownerAuth.tenant.id });
    const viewerAuth = authTestHelper.createViewerAuthContext({ tenantId: ownerAuth.tenant.id });

    return {
      owner: await this.makeAuthenticatedRequest(method, url, ownerAuth, data),
      admin: await this.makeAuthenticatedRequest(method, url, adminAuth, data),
      editor: await this.makeAuthenticatedRequest(method, url, editorAuth, data),
      viewer: await this.makeAuthenticatedRequest(method, url, viewerAuth, data)
    };
  }

  /**
   * Test pagination endpoints
   */
  async testPagination(baseUrl: string, auth?: AuthTestContext): Promise<{
    firstPage: ApiTestResponse;
    secondPage: ApiTestResponse;
    largePage: ApiTestResponse;
    invalidPage: ApiTestResponse;
  }> {
    return {
      firstPage: await this.get(`${baseUrl}?page=1&limit=10`, auth),
      secondPage: await this.get(`${baseUrl}?page=2&limit=10`, auth),
      largePage: await this.get(`${baseUrl}?page=1&limit=100`, auth),
      invalidPage: await this.get(`${baseUrl}?page=0&limit=10`, auth)
    };
  }

  /**
   * Test API validation with various invalid inputs
   */
  async testValidation(url: string, validData: any, invalidScenarios: Array<{
    name: string;
    data: any;
    expectedStatus?: number;
  }>, auth?: AuthTestContext): Promise<Record<string, ApiTestResponse>> {
    const results: Record<string, ApiTestResponse> = {};

    // Test valid data first
    results.valid = await this.post(url, validData, auth);

    // Test invalid scenarios
    for (const scenario of invalidScenarios) {
      results[scenario.name] = await this.post(url, scenario.data, auth);
    }

    return results;
  }

  /**
   * Test rate limiting
   */
  async testRateLimit(url: string, auth?: AuthTestContext, requestCount: number = 10): Promise<ApiTestResponse[]> {
    const promises = Array.from({ length: requestCount }, () => this.get(url, auth));
    return Promise.all(promises);
  }

  /**
   * Validate API response structure
   */
  validateResponse(response: ApiTestResponse, expectedStructure: any): boolean {
    try {
      this.validateObjectStructure(response.body, expectedStructure);
      return true;
    } catch (error) {
      console.error('Response validation failed:', error);
      return false;
    }
  }

  private validateObjectStructure(obj: any, structure: any): void {
    if (typeof structure === 'string') {
      if (typeof obj !== structure) {
        throw new Error(`Expected ${structure}, got ${typeof obj}`);
      }
    } else if (Array.isArray(structure)) {
      if (!Array.isArray(obj)) {
        throw new Error('Expected array');
      }
      if (structure.length > 0) {
        obj.forEach((item: any) => this.validateObjectStructure(item, structure[0]));
      }
    } else if (typeof structure === 'object' && structure !== null) {
      if (typeof obj !== 'object' || obj === null) {
        throw new Error('Expected object');
      }
      Object.keys(structure).forEach(key => {
        if (!(key in obj)) {
          throw new Error(`Missing property: ${key}`);
        }
        this.validateObjectStructure(obj[key], structure[key]);
      });
    }
  }

  /**
   * Common API response assertions
   */
  assertSuccessResponse(response: ApiTestResponse, expectedStatus: number = 200): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success', true);
  }

  assertErrorResponse(response: ApiTestResponse, expectedStatus: number, expectedMessage?: string): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body).toHaveProperty('success', false);
    if (expectedMessage) {
      expect(response.body).toHaveProperty('message', expectedMessage);
    }
  }

  assertPaginatedResponse(response: ApiTestResponse): void {
    this.assertSuccessResponse(response);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('pagination');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('pages');
  }

  assertValidationErrorResponse(response: ApiTestResponse): void {
    this.assertErrorResponse(response, 400);
    expect(response.body).toHaveProperty('errors');
    expect(Array.isArray(response.body.errors)).toBe(true);
  }
}

/**
 * Mock external API responses for testing
 */
export class MockApiHelper {
  private mocks: Map<string, any> = new Map();

  /**
   * Mock OpenAI API responses
   */
  mockOpenAIResponses(): void {
    // Mock completion responses
    this.mocks.set('openai.chat.completions', {
      choices: [{
        message: {
          content: 'This is a test AI response',
          role: 'assistant'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });

    // Mock embedding responses
    this.mocks.set('openai.embeddings', {
      data: [{
        embedding: Array.from({ length: 1536 }, () => Math.random() - 0.5),
        index: 0
      }],
      usage: {
        prompt_tokens: 5,
        total_tokens: 5
      }
    });
  }

  /**
   * Mock voice service responses
   */
  mockVoiceResponses(): void {
    this.mocks.set('voice.transcription', {
      text: 'This is a test transcription',
      confidence: 0.95,
      language: 'en-US'
    });

    this.mocks.set('voice.synthesis', {
      audioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      duration: 2.5
    });
  }

  getMock(key: string): any {
    return this.mocks.get(key);
  }

  clearMocks(): void {
    this.mocks.clear();
  }
}

// Export instance for global use
export const mockApiHelper = new MockApiHelper();