/**
 * Playwright Global Teardown
 *
 * Runs once after all E2E tests to:
 * - Clean up test data
 * - Remove temporary files
 * - Reset test environment
 */

import { chromium, FullConfig } from '@playwright/test';
import { rmSync, existsSync } from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Playwright global teardown...');

  try {
    // Clean up test data if needed
    await cleanupTestData(config);

    // Clean up test artifacts
    await cleanupTestArtifacts();

    // Clean up authentication files
    await cleanupAuthFiles();

    console.log('✅ Playwright global teardown completed');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw to avoid masking test failures
  }
}

/**
 * Clean up test data created during E2E tests
 */
async function cleanupTestData(config: FullConfig) {
  console.log('🗑️  Cleaning up test data...');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Load authentication state if it exists
    const authFile = 'playwright/.auth/user.json';
    if (existsSync(authFile)) {
      await page.context().addCookies(require(path.resolve(authFile)).cookies || []);
    }

    // Get base URL from config
    const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';

    // Navigate to dashboard
    await page.goto(`${baseURL}/dashboard`, { timeout: 10000 });

    // Check if we're still authenticated
    const userMenu = await page.locator('[data-testid=user-menu]').first();
    if (await userMenu.count() > 0) {
      console.log('🔐 Still authenticated, cleaning up test data...');

      // Clean up test sites
      await cleanupTestSites(page);

      // Clean up test knowledge base entries
      await cleanupTestKnowledgeBase(page, baseURL);

      // Clean up test voice sessions
      await cleanupTestVoiceSessions(page, baseURL);

    } else {
      console.log('🔓 Not authenticated, skipping data cleanup');
    }

  } catch (error) {
    console.warn('⚠️  Test data cleanup failed:', error);
  } finally {
    await browser.close();
  }
}

/**
 * Clean up test sites
 */
async function cleanupTestSites(page: any) {
  try {
    // Find and delete test sites
    const testSites = await page.locator('[data-testid=site-card][data-site-name*="E2E Test"], [data-testid=site-card][data-site-name*="Test Site"]');
    const count = await testSites.count();

    if (count > 0) {
      console.log(`🏗️  Deleting ${count} test sites...`);

      for (let i = 0; i < count; i++) {
        const site = testSites.nth(i);
        await site.hover();
        await site.locator('[data-testid=site-menu-button]').click();
        await page.click('[data-testid=delete-site-option]');
        await page.click('[data-testid=confirm-delete-button]');
        await page.waitForTimeout(1000); // Wait for deletion to complete
      }

      console.log('✅ Test sites cleaned up');
    }
  } catch (error) {
    console.warn('⚠️  Site cleanup failed:', error);
  }
}

/**
 * Clean up test knowledge base entries
 */
async function cleanupTestKnowledgeBase(page: any, baseURL: string) {
  try {
    await page.goto(`${baseURL}/dashboard/knowledge-base`);

    const testEntries = await page.locator('[data-testid=kb-entry][data-title*="Test Entry"], [data-testid=kb-entry][data-title*="E2E Test"]');
    const count = await testEntries.count();

    if (count > 0) {
      console.log(`📚 Deleting ${count} test knowledge base entries...`);

      for (let i = 0; i < count; i++) {
        const entry = testEntries.nth(i);
        await entry.hover();
        await entry.locator('[data-testid=kb-entry-menu]').click();
        await page.click('[data-testid=delete-kb-entry-option]');
        await page.click('[data-testid=confirm-delete-button]');
        await page.waitForTimeout(500);
      }

      console.log('✅ Test knowledge base entries cleaned up');
    }
  } catch (error) {
    console.warn('⚠️  Knowledge base cleanup failed:', error);
  }
}

/**
 * Clean up test voice sessions
 */
async function cleanupTestVoiceSessions(page: any, baseURL: string) {
  try {
    await page.goto(`${baseURL}/dashboard/voice-sessions`);

    // Clear any test voice session data
    const testSessions = await page.locator('[data-testid=voice-session][data-session*="test"]');
    const count = await testSessions.count();

    if (count > 0) {
      console.log(`🎤 Cleaning up ${count} test voice sessions...`);

      // Bulk delete if available, otherwise delete individually
      if (await page.locator('[data-testid=select-all-sessions]').count() > 0) {
        await page.click('[data-testid=select-all-sessions]');
        await page.click('[data-testid=bulk-delete-sessions]');
        await page.click('[data-testid=confirm-bulk-delete]');
      }

      console.log('✅ Test voice sessions cleaned up');
    }
  } catch (error) {
    console.warn('⚠️  Voice sessions cleanup failed:', error);
  }
}

/**
 * Clean up test artifacts and temporary files
 */
async function cleanupTestArtifacts() {
  console.log('🧽 Cleaning up test artifacts...');

  const artifactPaths = [
    'test-results/',
    'playwright-report/',
    'playwright-results.json',
    'playwright-results.xml',
    'playwright-setup-error.png',
    'screenshots/',
    'videos/',
    'traces/'
  ];

  for (const artifactPath of artifactPaths) {
    if (existsSync(artifactPath)) {
      try {
        rmSync(artifactPath, { recursive: true, force: true });
        console.log(`🗑️  Removed ${artifactPath}`);
      } catch (error) {
        console.warn(`⚠️  Could not remove ${artifactPath}:`, error);
      }
    }
  }
}

/**
 * Clean up authentication files (optional, keep for reuse in development)
 */
async function cleanupAuthFiles() {
  // Only clean up auth files in CI environment
  if (process.env.CI) {
    console.log('🔐 Cleaning up authentication files...');

    const authPaths = [
      'playwright/.auth/',
      '.auth/'
    ];

    for (const authPath of authPaths) {
      if (existsSync(authPath)) {
        try {
          rmSync(authPath, { recursive: true, force: true });
          console.log(`🔑 Removed ${authPath}`);
        } catch (error) {
          console.warn(`⚠️  Could not remove ${authPath}:`, error);
        }
      }
    }
  } else {
    console.log('🔐 Keeping authentication files for development reuse');
  }
}

export default globalTeardown;