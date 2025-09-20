/**
 * Jest Test Setup
 *
 * Global test configuration and setup for all Jest tests.
 * This file runs before each test file is executed.
 */

import { jest } from '@jest/globals';

// Extend Jest matchers for better assertions
import '@testing-library/jest-dom';

// Mock performance API for Node.js environment
if (typeof global !== 'undefined' && !global.performance) {
  global.performance = {
    now: () => Date.now(),
    mark: jest.fn(),
    measure: jest.fn(),
    getEntries: jest.fn(() => []),
    getEntriesByName: jest.fn(() => []),
    getEntriesByType: jest.fn(() => []),
    clearMarks: jest.fn(),
    clearMeasures: jest.fn(),
    clearResourceTimings: jest.fn(),
    setResourceTimingBufferSize: jest.fn(),
    toJSON: jest.fn(() => ({}))
  } as any;
}

// Mock navigator for tests that need it
if (typeof global !== 'undefined' && !global.navigator) {
  global.navigator = {
    onLine: true,
    userAgent: 'jest-test-environment',
    permissions: {
      query: jest.fn(() => Promise.resolve({ state: 'granted' }))
    },
    mediaDevices: {
      getUserMedia: jest.fn(() => Promise.resolve({
        getTracks: jest.fn(() => []),
        getAudioTracks: jest.fn(() => []),
        getVideoTracks: jest.fn(() => [])
      }))
    }
  } as any;
}

// Mock window object for browser-specific code
if (typeof global !== 'undefined' && !global.window) {
  global.window = {
    location: {
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
      pathname: '/',
      search: '',
      hash: ''
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    localStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    },
    sessionStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    }
  } as any;
}

// Mock document for DOM-related tests
if (typeof global !== 'undefined' && !global.document) {
  global.document = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    createElement: jest.fn(() => ({
      className: '',
      setAttribute: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      style: {},
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(),
        toggle: jest.fn()
      },
      appendChild: jest.fn(),
      removeChild: jest.fn()
    })),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn()
    },
    querySelectorAll: jest.fn(() => []),
    querySelector: jest.fn(),
    getElementById: jest.fn()
  } as any;
}

// Mock ResizeObserver for tests that use it
if (typeof global !== 'undefined' && !global.ResizeObserver) {
  global.ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
  }));
}

// Mock IntersectionObserver for tests that use it
if (typeof global !== 'undefined' && !global.IntersectionObserver) {
  global.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
  }));
}

// Mock WebSocket for real-time communication tests
if (typeof global !== 'undefined' && !global.WebSocket) {
  global.WebSocket = jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3
  }));
}

// Mock Audio API for voice tests
if (typeof global !== 'undefined' && !global.Audio) {
  global.Audio = jest.fn().mockImplementation(() => ({
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(),
    load: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    currentTime: 0,
    duration: 0,
    paused: true
  }));
}

// Mock MediaRecorder for voice recording tests
if (typeof global !== 'undefined' && !global.MediaRecorder) {
  global.MediaRecorder = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    state: 'inactive',
    ondataavailable: null,
    onerror: null,
    onstart: null,
    onstop: null
  }));

  global.MediaRecorder.isTypeSupported = jest.fn(() => true);
}

// Suppress console warnings in tests (but allow errors)
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Only suppress known warnings that are expected in test environment
console.warn = (...args: any[]) => {
  const message = args[0];
  if (typeof message === 'string') {
    // Suppress React warnings that are expected in test environment
    if (message.includes('Warning: ReactDOM.render is deprecated') ||
        message.includes('Warning: componentWillReceiveProps') ||
        message.includes('Warning: componentWillMount') ||
        message.includes('act(...)')) {
      return;
    }
  }
  originalConsoleWarn.apply(console, args);
};

// Keep console.error for debugging failed tests
console.error = originalConsoleError;

// Increase default timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(a: number, b: number): R;
      toBeValidUUID(): R;
      toBeValidEmail(): R;
      toHaveProperty(property: string): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },

  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid email`,
        pass: false,
      };
    }
  }
});

// Environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/sitespeak_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.OPENAI_API_KEY = 'test-openai-key';

// Prevent actual network requests in tests
process.env.DISABLE_NETWORK_REQUESTS = 'true';

// Enable test mode for various services
process.env.VOICE_AI_TEST_MODE = 'true';
process.env.KNOWLEDGE_BASE_TEST_MODE = 'true';
process.env.CRAWLER_TEST_MODE = 'true';

export {};