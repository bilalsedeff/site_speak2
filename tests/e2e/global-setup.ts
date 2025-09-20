/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests to:
 * - Authenticate test user
 * - Prepare test data
 * - Configure test environment
 */

import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import { mkdir } from 'fs/promises';

async function globalSetup(config: FullConfig) {
  console.log('🎭 Starting Playwright global setup...');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Ensure auth directory exists
    const authDir = path.dirname('playwright/.auth/user.json');
    await mkdir(authDir, { recursive: true });

    // Get base URL from config
    const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';

    console.log('🔐 Authenticating test user...');

    // Navigate to login page
    await page.goto(`${baseURL}/login`);

    // Wait for login form to be visible
    await page.waitForSelector('[data-testid=email]', { timeout: 10000 });

    // Fill in test credentials
    await page.fill('[data-testid=email]', process.env.TEST_USER_EMAIL || 'test@sitespeak.com');
    await page.fill('[data-testid=password]', process.env.TEST_USER_PASSWORD || 'TestPassword123!');

    // Submit login form
    await page.click('[data-testid=login-button]');

    // Wait for successful login (dashboard page)
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Verify login was successful
    await page.waitForSelector('[data-testid=user-menu]', { timeout: 5000 });

    console.log('✅ User authentication successful');

    // Save authentication state
    await page.context().storageState({ path: 'playwright/.auth/user.json' });

    console.log('💾 Authentication state saved');

    // Create test data if needed
    await setupTestData(page, baseURL);

  } catch (error) {
    console.error('❌ Global setup failed:', error);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'playwright-setup-error.png' });

    throw error;
  } finally {
    await browser.close();
  }

  console.log('✅ Playwright global setup completed');
}

/**
 * Setup test data needed for E2E tests
 */
async function setupTestData(page: any, baseURL: string) {
  console.log('📊 Setting up test data...');

  try {
    // Check if test site already exists
    await page.goto(`${baseURL}/dashboard`);
    await page.waitForSelector('[data-testid=sites-list]', { timeout: 5000 });

    const existingTestSite = await page.locator('[data-testid=site-card][data-site-name*="E2E Test Site"]').first();

    if (await existingTestSite.count() === 0) {
      console.log('🏗️  Creating test site for E2E tests...');

      // Create a new test site
      await page.click('[data-testid=create-site-button]');
      await page.waitForURL('**/editor**', { timeout: 10000 });

      // Set site name
      await page.fill('[data-testid=site-name-input]', 'E2E Test Site');

      // Select a template
      await page.click('[data-testid=template-selector]');
      await page.click('[data-testid=template-option]:first-child');

      // Save the site
      await page.click('[data-testid=save-site-button]');
      await page.waitForSelector('[data-testid=save-success]', { timeout: 10000 });

      console.log('✅ Test site created successfully');
    } else {
      console.log('✅ Test site already exists');
    }

    // Set up test knowledge base data
    await setupTestKnowledgeBase(page, baseURL);

    // Set up test voice prompts
    await setupTestVoicePrompts(page, baseURL);

  } catch (error) {
    console.warn('⚠️  Test data setup failed (tests may still pass):', error);
  }
}

/**
 * Setup test knowledge base entries
 */
async function setupTestKnowledgeBase(page: any, baseURL: string) {
  try {
    // Navigate to knowledge base
    await page.goto(`${baseURL}/dashboard/knowledge-base`);

    // Check if test entries exist
    const testEntry = await page.locator('[data-testid=kb-entry][data-title*="Test Entry"]').first();

    if (await testEntry.count() === 0) {
      console.log('📚 Creating test knowledge base entries...');

      // Create test knowledge base entry
      await page.click('[data-testid=add-kb-entry-button]');
      await page.fill('[data-testid=kb-title-input]', 'Test Entry for E2E');
      await page.fill('[data-testid=kb-content-input]', 'This is test content for E2E testing purposes.');
      await page.click('[data-testid=save-kb-entry-button]');

      console.log('✅ Test knowledge base entries created');
    }
  } catch (error) {
    console.warn('⚠️  Knowledge base setup failed:', error);
  }
}

/**
 * Setup test voice prompts and responses
 */
async function setupTestVoicePrompts(page: any, baseURL: string) {
  try {
    // Set up mock voice responses for testing
    await page.evaluate(() => {
      // Mock voice recognition for consistent testing
      if (window.speechRecognition) {
        window.speechRecognition.mockResponses = {
          'create new section': 'Create a new business section',
          'add contact form': 'Add a contact form to the page',
          'change background color': 'Change the background color to blue',
          'save site': 'Save the current site',
          'publish site': 'Publish the site now'
        };
      }
    });

    console.log('🎤 Test voice prompts configured');
  } catch (error) {
    console.warn('⚠️  Voice setup failed:', error);
  }
}

export default globalSetup;