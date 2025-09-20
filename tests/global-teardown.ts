/**
 * Jest Global Teardown
 *
 * Runs once after all test suites to clean up the test environment.
 * Handles cleanup of test databases, containers, and temporary files.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { rmSync, existsSync } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export default async function globalTeardown() {
  console.log('🧹 Starting global test cleanup...');

  try {
    // Check if we're running in CI environment
    const isCI = process.env.CI === 'true';

    if (!isCI) {
      console.log('🧽 Cleaning up local test environment...');

      // Stop and remove test containers (but keep for reuse in development)
      try {
        // Check if Docker is available
        await execAsync('docker --version');

        // Stop test database container (but don't remove for reuse)
        try {
          await execAsync('docker stop sitespeak-test-db');
          console.log('⏹️  Stopped test database container');
        } catch (error) {
          // Container might not be running, that's OK
        }

        // Stop test Redis container (but don't remove for reuse)
        try {
          await execAsync('docker stop sitespeak-test-redis');
          console.log('⏹️  Stopped test Redis container');
        } catch (error) {
          // Container might not be running, that's OK
        }

      } catch (error) {
        console.log('⚠️  Docker not available, skipping container cleanup');
      }
    }

    // Clean up temporary files created during tests
    const tempDirs = [
      path.join(process.cwd(), 'temp', 'test'),
      path.join(process.cwd(), 'server', 'temp', 'test'),
      path.join(process.cwd(), 'coverage'),
      path.join(process.cwd(), '.nyc_output')
    ];

    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
          console.log(`🗑️  Cleaned up ${dir}`);
        } catch (error) {
          console.warn(`⚠️  Could not clean up ${dir}:`, error);
        }
      }
    }

    // Clean up test audio files
    const testAudioDirs = [
      path.join(process.cwd(), 'server', 'temp', 'audio', 'test'),
      path.join(process.cwd(), 'temp', 'audio', 'test')
    ];

    for (const dir of testAudioDirs) {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
          console.log(`🔊 Cleaned up test audio files from ${dir}`);
        } catch (error) {
          console.warn(`⚠️  Could not clean up audio files from ${dir}:`, error);
        }
      }
    }

    // Clean up test knowledge base files
    const testKbDirs = [
      path.join(process.cwd(), 'server', 'knowledge-base', 'test'),
      path.join(process.cwd(), 'knowledge-base', 'test')
    ];

    for (const dir of testKbDirs) {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
          console.log(`📚 Cleaned up test knowledge base from ${dir}`);
        } catch (error) {
          console.warn(`⚠️  Could not clean up knowledge base from ${dir}:`, error);
        }
      }
    }

    // Clean up test log files
    const testLogFiles = [
      path.join(process.cwd(), 'logs', 'test.log'),
      path.join(process.cwd(), 'server', 'logs', 'test.log')
    ];

    for (const file of testLogFiles) {
      if (existsSync(file)) {
        try {
          rmSync(file, { force: true });
          console.log(`📝 Cleaned up test log file ${file}`);
        } catch (error) {
          console.warn(`⚠️  Could not clean up log file ${file}:`, error);
        }
      }
    }

    // Reset environment variables
    delete process.env.DISABLE_EXTERNAL_APIS;
    delete process.env.VOICE_AI_TEST_MODE;
    delete process.env.KNOWLEDGE_BASE_TEST_MODE;
    delete process.env.CRAWLER_TEST_MODE;
    delete process.env.DISABLE_ANALYTICS;
    delete process.env.DISABLE_LOGGING;

    console.log('✅ Global test cleanup completed');

  } catch (error) {
    console.error('❌ Global test cleanup failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  }
}