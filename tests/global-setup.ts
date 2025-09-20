/**
 * Jest Global Setup
 *
 * Runs once before all test suites to prepare the test environment.
 * Used primarily for integration tests that need database and external services.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function globalSetup() {
  console.log('🚀 Starting global test setup...');

  try {
    // Check if we're running in CI environment
    const isCI = process.env.CI === 'true';

    if (!isCI) {
      console.log('📦 Setting up local test environment...');

      // Check if Docker is available for local testing
      try {
        await execAsync('docker --version');
        console.log('✅ Docker is available');

        // Start test database if not already running
        try {
          await execAsync('docker ps --filter "name=sitespeak-test-db" --format "{{.Names}}"');
          console.log('📊 Test database container already running');
        } catch (error) {
          console.log('🔄 Starting test database container...');
          await execAsync(`
            docker run -d --name sitespeak-test-db \
            -e POSTGRES_DB=sitespeak_test \
            -e POSTGRES_USER=test_user \
            -e POSTGRES_PASSWORD=test_password \
            -p 5433:5432 \
            pgvector/pgvector:pg15
          `);

          // Wait for database to be ready
          console.log('⏳ Waiting for database to be ready...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // Start test Redis if not already running
        try {
          await execAsync('docker ps --filter "name=sitespeak-test-redis" --format "{{.Names}}"');
          console.log('🔄 Test Redis container already running');
        } catch (error) {
          console.log('🔄 Starting test Redis container...');
          await execAsync(`
            docker run -d --name sitespeak-test-redis \
            -p 6380:6379 \
            redis:7-alpine
          `);

          // Wait for Redis to be ready
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error) {
        console.log('⚠️  Docker not available, skipping containerized services');
        console.log('   Make sure you have PostgreSQL and Redis running locally for integration tests');
      }
    } else {
      console.log('🏗️  Running in CI environment, services should be provided by CI');
    }

    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5433/sitespeak_test';
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
    process.env.JWT_SECRET = 'test-jwt-secret-for-jest-testing-only';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
    process.env.OPENAI_API_KEY = 'test-openai-key-not-real';

    // Test mode flags
    process.env.DISABLE_EXTERNAL_APIS = 'true';
    process.env.VOICE_AI_TEST_MODE = 'true';
    process.env.KNOWLEDGE_BASE_TEST_MODE = 'true';
    process.env.CRAWLER_TEST_MODE = 'true';
    process.env.DISABLE_ANALYTICS = 'true';
    process.env.DISABLE_LOGGING = 'true';

    console.log('✅ Global test setup completed');

  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}