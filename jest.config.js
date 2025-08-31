/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/server/src/shared/$1',
    '^@server/(.*)$': '<rootDir>/server/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/server/**/*.test.ts',
    '<rootDir>/server/**/*.spec.ts',
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'server/src/**/*.ts',
    '!server/src/**/*.d.ts',
    '!server/src/**/*.test.ts',
    '!server/src/**/*.spec.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  verbose: true
};