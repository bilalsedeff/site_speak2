/**
 * Test Helpers Index
 *
 * Central export point for all test utilities and helpers.
 * Import from this file to get access to all testing utilities.
 */

// Test data helpers
export * from './test-data';

// Database helpers
export * from './database';

// Authentication helpers
export * from './auth';

// API helpers
export * from './api';

// Helper classes for easy access
import { DatabaseTestHelper } from './database';
import { AuthTestHelper } from './auth';
import { ApiTestHelper } from './api';
import { MockApiHelper } from './api';

export {
  DatabaseTestHelper,
  AuthTestHelper,
  ApiTestHelper,
  MockApiHelper
};

/**
 * Quick setup function for common test scenarios
 */
export const setupTestEnvironment = async (app?: any) => {
  // Setup database
  const { dbTestHelper } = await import('./database');
  await dbTestHelper.setup();

  // Setup API helper if app is provided
  let apiHelper: ApiTestHelper | undefined;
  if (app) {
    apiHelper = new ApiTestHelper(app);
  }

  // Setup auth helper
  const { authTestHelper } = await import('./auth');

  // Setup mock APIs
  const { mockApiHelper } = await import('./api');
  mockApiHelper.mockOpenAIResponses();
  mockApiHelper.mockVoiceResponses();

  return {
    db: dbTestHelper,
    auth: authTestHelper,
    api: apiHelper,
    mock: mockApiHelper
  };
};

/**
 * Cleanup function for test environment
 */
export const cleanupTestEnvironment = async () => {
  const { dbTestHelper } = await import('./database');
  await dbTestHelper.cleanup();
  await dbTestHelper.close();

  const { mockApiHelper } = await import('./api');
  mockApiHelper.clearMocks();
};

/**
 * Common test assertions
 */
export const assertions = {
  /**
   * Assert that an object matches the expected structure
   */
  assertStructure(obj: any, expectedStructure: any): void {
    const validateStructure = (current: any, expected: any, path: string = ''): void => {
      if (typeof expected === 'string') {
        expect(typeof current).toBe(expected);
      } else if (Array.isArray(expected)) {
        expect(Array.isArray(current)).toBe(true);
        if (expected.length > 0) {
          current.forEach((item: any, index: number) => {
            validateStructure(item, expected[0], `${path}[${index}]`);
          });
        }
      } else if (typeof expected === 'object' && expected !== null) {
        expect(typeof current).toBe('object');
        expect(current).not.toBeNull();

        Object.keys(expected).forEach(key => {
          const currentPath = path ? `${path}.${key}` : key;
          expect(current).toHaveProperty(key);
          validateStructure(current[key], expected[key], currentPath);
        });
      }
    };

    validateStructure(obj, expectedStructure);
  },

  /**
   * Assert that response time is within acceptable limits
   */
  assertPerformance(startTime: number, maxDuration: number): void {
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThanOrEqual(maxDuration);
  },

  /**
   * Assert that a promise rejects with specific error
   */
  async assertRejects(promise: Promise<any>, expectedError?: string | RegExp): Promise<void> {
    await expect(promise).rejects.toThrow(expectedError);
  },

  /**
   * Assert that an array contains specific items
   */
  assertArrayContains<T>(array: T[], expectedItems: T[]): void {
    expectedItems.forEach(item => {
      expect(array).toContain(item);
    });
  },

  /**
   * Assert that an object has specific properties
   */
  assertHasProperties(obj: any, properties: string[]): void {
    properties.forEach(prop => {
      expect(obj).toHaveProperty(prop);
    });
  }
};

/**
 * Common test data patterns
 */
export const testPatterns = {
  /**
   * Valid email addresses for testing
   */
  validEmails: [
    'test@example.com',
    'user.name@domain.co.uk',
    'user+tag@example.org',
    'test123@test-domain.com'
  ],

  /**
   * Invalid email addresses for testing
   */
  invalidEmails: [
    'invalid',
    '@example.com',
    'test@',
    'test..test@example.com',
    'test@.com'
  ],

  /**
   * Valid passwords for testing
   */
  validPasswords: [
    'Password123!',
    'SecurePass1@',
    'MyP@ssw0rd',
    'Complex!Password123'
  ],

  /**
   * Invalid passwords for testing
   */
  invalidPasswords: [
    'short',
    'nouppercaseletter',
    'NOLOWERCASELETTER',
    'NoNumber!',
    'NoSpecialChar123'
  ],

  /**
   * Valid UUIDs for testing
   */
  validUUIDs: [
    '123e4567-e89b-12d3-a456-426614174000',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
  ],

  /**
   * Invalid UUIDs for testing
   */
  invalidUUIDs: [
    'not-a-uuid',
    '123e4567-e89b-12d3-a456',
    '123e4567-e89b-12d3-a456-426614174000-extra'
  ]
};

/**
 * Test timing utilities
 */
export const timing = {
  /**
   * Wait for a specific amount of time
   */
  wait: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Measure execution time of a function
   */
  measure: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },

  /**
   * Retry function with exponential backoff
   */
  retry: async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await timing.wait(delay);
        }
      }
    }

    throw lastError!;
  }
};

/**
 * Export default setup function for convenience
 */
export default setupTestEnvironment;