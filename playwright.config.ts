import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for SiteSpeak E2E Tests
 *
 * Comprehensive end-to-end testing configuration covering:
 * - Site creation and editing workflows
 * - Voice AI interactions
 * - Publishing and deployment flows
 * - Analytics and dashboard functionality
 */

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-results.json' }],
    ['junit', { outputFile: 'playwright-results.xml' }]
  ],

  // Global test timeout
  timeout: 30000,

  // Expect timeout for assertions
  expect: {
    timeout: 5000
  },

  // Shared settings for all the projects below
  use: {
    // Base URL for all tests
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Record video on failure
    video: 'retain-on-failure',

    // Take screenshot on failure
    screenshot: 'only-on-failure',

    // Action timeout
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 10000,

    // Ignore HTTPS errors for local development
    ignoreHTTPSErrors: true,

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    },

    // Permissions for voice tests
    permissions: ['microphone'],

    // Context options for voice AI testing
    contextOptions: {
      // Enable permissions for microphone access
      permissions: ['microphone'],
      // Disable web security for local testing
      ignoreDefaultArgs: ['--disable-web-security']
    }
  },

  // Test projects for different browsers and scenarios
  projects: [
    // Setup project for authentication
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup'
    },

    // Cleanup project
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/
    },

    // Desktop Chrome - Main test suite
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Enable microphone for voice tests
        permissions: ['microphone'],
        // Use persistent context for login state
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Desktop Firefox
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        permissions: ['microphone'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Desktop Safari
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // Note: Safari has limited microphone support in automated tests
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        permissions: ['microphone'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Mobile Safari
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Voice-specific tests (Chrome only for better WebRTC support)
    {
      name: 'voice-tests',
      testMatch: /.*voice.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone', 'camera'],
        // Additional context options for voice testing
        contextOptions: {
          permissions: ['microphone'],
          recordVideo: {
            mode: 'retain-on-failure',
            size: { width: 1280, height: 720 }
          }
        },
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Performance tests
    {
      name: 'performance',
      testMatch: /.*performance.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    },

    // Accessibility tests
    {
      name: 'accessibility',
      testMatch: /.*a11y.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json'
      },
      dependencies: ['setup']
    }
  ],

  // Run your local dev server before starting the tests
  webServer: process.env.CI ? undefined : [
    {
      command: 'npm run dev:client',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'npm run dev:server',
      port: 5000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ],

  // Global setup and teardown
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),

  // Output directory for test artifacts
  outputDir: 'test-results/',

  // Metadata
  metadata: {
    'test-suite': 'SiteSpeak E2E Tests',
    'environment': process.env.NODE_ENV || 'test',
    'base-url': process.env.BASE_URL || 'http://localhost:3000'
  }
});