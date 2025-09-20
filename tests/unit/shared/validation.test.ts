/**
 * Validation Utilities Unit Tests
 *
 * Tests for shared validation functions used across the application.
 * Demonstrates unit testing best practices and testing infrastructure usage.
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  assertions,
  testPatterns,
  timing,
  createTestUser,
  createTestTenant
} from '../../helpers';

// Mock validation functions (these would be imported from your actual utilities)
const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // More strict email validation that rejects consecutive dots
  const emailRegex = /^[^\s@.]+([.]?[^\s@.]+)*@[^\s@.]+([.]?[^\s@.]+)*\.[^\s@.]+$/;
  return emailRegex.test(email) && !email.includes('..');
};

const validatePassword = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (password === null || password === undefined || typeof password !== 'string') {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateUUID = (uuid: string): boolean => {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const validateUserData = (userData: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!userData.email || !validateEmail(userData.email)) {
    errors.push('Valid email is required');
  }

  if (!userData.name || userData.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters long');
  }

  if (!userData.role || !['owner', 'admin', 'editor', 'viewer'].includes(userData.role)) {
    errors.push('Valid role is required');
  }

  if (!userData.tenantId || !validateUUID(userData.tenantId)) {
    errors.push('Valid tenant ID is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

describe('Validation Utilities', () => {
  describe('Email Validation', () => {
    test('should validate correct email addresses', () => {
      testPatterns.validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    test('should reject invalid email addresses', () => {
      testPatterns.invalidEmails.forEach(email => {
        expect(validateEmail(email)).toBe(false);
      });
    });

    test('should handle edge cases', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(' ')).toBe(false);
      expect(validateEmail('a'.repeat(100) + '@example.com')).toBe(true);
    });

    test('should be case insensitive for domain', () => {
      expect(validateEmail('test@EXAMPLE.COM')).toBe(true);
      expect(validateEmail('TEST@example.com')).toBe(true);
    });
  });

  describe('Password Validation', () => {
    test('should validate strong passwords', () => {
      testPatterns.validPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    test('should reject weak passwords with specific errors', () => {
      const testCases = [
        {
          password: 'short',
          expectedErrors: [
            'Password must be at least 8 characters long',
            'Password must contain at least one uppercase letter',
            'Password must contain at least one number',
            'Password must contain at least one special character'
          ]
        },
        {
          password: 'onlylowercase',
          expectedErrors: [
            'Password must contain at least one uppercase letter',
            'Password must contain at least one number',
            'Password must contain at least one special character'
          ]
        },
        {
          password: 'ONLYUPPERCASE',
          expectedErrors: [
            'Password must contain at least one lowercase letter',
            'Password must contain at least one number',
            'Password must contain at least one special character'
          ]
        }
      ];

      testCases.forEach(({ password, expectedErrors }) => {
        const result = validatePassword(password);
        expect(result.isValid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining(expectedErrors));
      });
    });

    test('should handle empty password', () => {
      const result = validatePassword('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    test('should have good performance', async () => {
      const { duration } = await timing.measure(async () => {
        for (let i = 0; i < 1000; i++) {
          validatePassword('TestPassword123!');
        }
      });

      // Should process 1000 validations in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('UUID Validation', () => {
    test('should validate correct UUIDs', () => {
      testPatterns.validUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(true);
      });
    });

    test('should reject invalid UUIDs', () => {
      testPatterns.invalidUUIDs.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(false);
      });
    });

    test('should handle different UUID versions', () => {
      const uuidVersions = [
        '123e4567-e89b-12d3-a456-426614174000', // v1
        '123e4567-e89b-22d3-a456-426614174000', // v2
        '123e4567-e89b-32d3-a456-426614174000', // v3
        '123e4567-e89b-42d3-a456-426614174000', // v4
        '123e4567-e89b-52d3-a456-426614174000'  // v5
      ];

      uuidVersions.forEach(uuid => {
        expect(validateUUID(uuid)).toBe(true);
      });
    });

    test('should be case insensitive', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(validateUUID(uuid.toLowerCase())).toBe(true);
      expect(validateUUID(uuid.toUpperCase())).toBe(true);
    });
  });

  describe('User Data Validation', () => {
    let validUserData: any;

    beforeEach(() => {
      const testUser = createTestUser();
      validUserData = {
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
        tenantId: testUser.tenantId
      };
    });

    test('should validate complete valid user data', () => {
      const result = validateUserData(validUserData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid email in user data', () => {
      const invalidData = { ...validUserData, email: 'invalid-email' };
      const result = validateUserData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valid email is required');
    });

    test('should reject short names', () => {
      const invalidData = { ...validUserData, name: 'A' };
      const result = validateUserData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name must be at least 2 characters long');
    });

    test('should reject invalid roles', () => {
      const invalidData = { ...validUserData, role: 'invalid-role' };
      const result = validateUserData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valid role is required');
    });

    test('should reject invalid tenant ID', () => {
      const invalidData = { ...validUserData, tenantId: 'not-a-uuid' };
      const result = validateUserData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Valid tenant ID is required');
    });

    test('should handle missing fields', () => {
      const incompleteData = { email: validUserData.email };
      const result = validateUserData(incompleteData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('should handle empty object', () => {
      const result = validateUserData({});

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        'Valid email is required',
        'Name must be at least 2 characters long',
        'Valid role is required',
        'Valid tenant ID is required'
      ]);
    });

    test('should use custom assertions from test helpers', () => {
      const result = validateUserData(validUserData);

      // Using custom assertion from test helpers
      assertions.assertStructure(result, {
        isValid: 'boolean',
        errors: ['string']
      });

      assertions.assertHasProperties(result, ['isValid', 'errors']);
    });
  });

  describe('Performance Tests', () => {
    test('should handle bulk email validation efficiently', async () => {
      const emails = Array.from({ length: 10000 }, (_, i) => `test${i}@example.com`);

      const { duration } = await timing.measure(async () => {
        emails.forEach(email => validateEmail(email));
      });

      // Should process 10k emails in under 500ms
      assertions.assertPerformance(Date.now() - duration, 500);
    });

    test('should handle concurrent validations', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        timing.measure(() => Promise.resolve(validateEmail(`test${i}@example.com`)))
      );

      const results = await Promise.all(promises);

      // All should be valid
      results.forEach(({ result }) => {
        expect(result).toBe(true);
      });

      // Average duration should be reasonable
      const avgDuration = results.reduce((sum, { duration }) => sum + duration, 0) / results.length;
      expect(avgDuration).toBeLessThan(10);
    });
  });

  describe('Error Handling', () => {
    test('should handle null and undefined inputs gracefully', () => {
      expect(validateEmail(null as any)).toBe(false);
      expect(validateEmail(undefined as any)).toBe(false);

      const nullResult = validatePassword(null as any);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errors.length).toBeGreaterThan(0);
    });

    test('should handle non-string inputs', () => {
      expect(validateEmail(123 as any)).toBe(false);
      expect(validateEmail({} as any)).toBe(false);
      expect(validateEmail([] as any)).toBe(false);
    });

    test('should handle extremely long inputs', () => {
      const longString = 'a'.repeat(10000);
      expect(validateEmail(longString + '@example.com')).toBe(true);

      const longPassword = 'A1!' + 'a'.repeat(10000);
      const result = validatePassword(longPassword);
      expect(result.isValid).toBe(true);
    });
  });
});

// Example of testing async validation function
describe('Async Validation', () => {
  const validateEmailUniqueness = async (email: string): Promise<boolean> => {
    // Simulate database check
    await timing.wait(10);
    return !email.includes('existing');
  };

  test('should validate email uniqueness', async () => {
    const uniqueEmail = 'new@example.com';
    const existingEmail = 'existing@example.com';

    expect(await validateEmailUniqueness(uniqueEmail)).toBe(true);
    expect(await validateEmailUniqueness(existingEmail)).toBe(false);
  });

  test('should handle validation timeout', async () => {
    const slowValidation = async (email: string): Promise<boolean> => {
      await timing.wait(5000); // 5 second delay
      return true;
    };

    // Should timeout and reject
    await assertions.assertRejects(
      Promise.race([
        slowValidation('test@example.com'),
        timing.wait(1000).then(() => Promise.reject(new Error('Timeout')))
      ]),
      'Timeout'
    );
  });

  test('should retry validation on failure', async () => {
    let attempts = 0;
    const flakyValidation = async (email: string): Promise<boolean> => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return true;
    };

    const result = await timing.retry(() => flakyValidation('test@example.com'));
    expect(result).toBe(true);
    expect(attempts).toBe(3);
  });
});

// Performance tracking for regression testing
describe('Performance Regression Tests', () => {
  test('should maintain performance benchmarks', async () => {
    const benchmarks = {
      emailValidation: 1, // ms
      passwordValidation: 2, // ms
      uuidValidation: 1, // ms
      userDataValidation: 5 // ms
    };

    // Test each validation function performance
    const emailTime = await timing.measure(() => Promise.resolve(validateEmail('test@example.com')));
    const passwordTime = await timing.measure(() => Promise.resolve(validatePassword('Password123!')));
    const uuidTime = await timing.measure(() => Promise.resolve(validateUUID('123e4567-e89b-12d3-a456-426614174000')));

    const testUser = createTestUser();
    const userDataTime = await timing.measure(() => Promise.resolve(validateUserData({
      email: testUser.email,
      name: testUser.name,
      role: testUser.role,
      tenantId: testUser.tenantId
    })));

    // Assert performance hasn't regressed
    expect(emailTime.duration).toBeLessThanOrEqual(benchmarks.emailValidation);
    expect(passwordTime.duration).toBeLessThanOrEqual(benchmarks.passwordValidation);
    expect(uuidTime.duration).toBeLessThanOrEqual(benchmarks.uuidValidation);
    expect(userDataTime.duration).toBeLessThanOrEqual(benchmarks.userDataValidation);
  });
});