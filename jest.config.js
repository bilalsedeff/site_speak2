/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],


  // Use JSDOM for client-side tests
  projects: [
    {
      displayName: 'client',
      testMatch: ['<rootDir>/client/src/**/__tests__/**/*.test.{ts,tsx}'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup-client.ts'],
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        '^@server/(.*)$': '<rootDir>/server/src/$1',
        '^@client/(.*)$': '<rootDir>/client/src/$1',
        '^@sitespeak/(.*)$': '<rootDir>/packages/$1',
        '^@/(.*)$': '<rootDir>/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            jsx: 'react-jsx'
          }
        }],
        '^.+\\.jsx?$': ['babel-jest']
      },
      transformIgnorePatterns: ['node_modules/(?!(@faker-js|lucide-react)/)'],
      extensionsToTreatAsEsm: ['.ts', '.tsx']
    },
    {
      displayName: 'server',
      testMatch: [
        '<rootDir>/server/**/*.test.ts',
        '<rootDir>/server/**/*.spec.ts',
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
        '<rootDir>/shared/**/*.test.ts'
      ],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      globalSetup: '<rootDir>/tests/global-setup.ts',
      globalTeardown: '<rootDir>/tests/global-teardown.ts',
      moduleNameMapper: {
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        '^@server/(.*)$': '<rootDir>/server/src/$1',
        '^@client/(.*)$': '<rootDir>/client/src/$1',
        '^@sitespeak/(.*)$': '<rootDir>/packages/$1',
        '^@/(.*)$': '<rootDir>/$1',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          useESM: true,
          tsconfig: {
            jsx: 'react-jsx'
          }
        }],
        '^.+\\.jsx?$': ['babel-jest']
      },
      transformIgnorePatterns: ['node_modules/(?!(@faker-js|lucide-react)/)'],
      extensionsToTreatAsEsm: ['.ts', '.tsx']
    }
  ],

  // Test path ignore patterns (global)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/client/dist/',
    '/client/build/',
    '/tests/e2e/' // E2E tests run separately with Playwright
  ],

  // Enhanced coverage collection
  collectCoverageFrom: [
    'server/src/**/*.ts',
    'client/src/**/*.{ts,tsx}',
    'shared/**/*.ts',
    'packages/**/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/*.config.{js,ts}',
    '!**/coverage/**'
  ],

  // Coverage thresholds aligned with documentation
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Higher thresholds for critical AI and voice components
    'server/src/modules/ai/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'server/src/modules/voice/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'packages/voice-widget/**/*.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'json',
    'html',
    'lcov'
  ],

  // Global setup and teardown for integration tests (only for server project)
  // globalSetup and globalTeardown are defined in server project

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Enhanced test configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  verbose: true,

  // Performance and reliability
  testTimeout: 30000,
  maxWorkers: '50%',
  errorOnDeprecated: true,

};