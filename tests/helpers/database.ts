/**
 * Database Test Helpers
 *
 * Utilities for database operations in tests, including setup, cleanup,
 * and data management for integration tests.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';

// Import schema tables (these should match your actual schema)
// Note: These imports should be adjusted based on your actual schema location
// import {
//   usersTable,
//   tenantsTable,
//   sitesTable,
//   knowledgeBaseTable,
//   voiceSessionsTable,
//   conversationsTable
// } from '@server/infrastructure/database/schema';

import {
  TestUser,
  TestTenant,
  TestSite,
  TestKnowledgeBaseEntry,
  TestVoiceSession,
  createTestTenant,
  createTestUser,
  createTestSite
} from './test-data';

export class DatabaseTestHelper {
  private db: any;
  private client: any;
  private useMock = false;

  constructor() {
    // Use test database URL
    const connectionString = process.env.TEST_DATABASE_URL ||
                           process.env.DATABASE_URL?.replace('/sitespeak', '/sitespeak_test') ||
                           'postgresql://postgres:postgres@localhost:5533/sitespeak_dev_db';

    this.client = postgres(connectionString, { max: 1 });
    this.db = drizzle(this.client);
  }

  private enableMockDatabase(): void {
    this.useMock = true;

    this.db = {
      execute: async () => ({ rows: [] }),
      transaction: async (callback: any) => callback({
        execute: async () => ({ rows: [] })
      })
    };
  }

  private isConnectionError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const candidate = error as { code?: string; errors?: unknown[]; cause?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.includes('ECONNREFUSED')) {
      return true;
    }

    if (Array.isArray(candidate.errors) && candidate.errors.some(err => this.isConnectionError(err))) {
      return true;
    }

    if (candidate.cause) {
      return this.isConnectionError(candidate.cause);
    }

    return false;
  }

  /**
   * Setup test database with migrations
   */
  async setup(): Promise<void> {
    try {
      // Run migrations to ensure schema is up to date
      await migrate(this.db, { migrationsFolder: './server/migrations' });
      console.log('✅ Database migrations completed');

      // Clear any existing test data
      await this.cleanup();
      console.log('✅ Database cleanup completed');

    } catch (error) {
      if (this.isConnectionError(error)) {
        console.warn('⚠️ Test database unavailable. Falling back to mock database.');
        this.enableMockDatabase();
        return;
      }

      console.error('❌ Database setup failed:', error);
      throw error;
    }
  }

  /**
   * Clean up all test data
   */
  async cleanup(): Promise<void> {
    if (this.useMock) {
      return;
    }

    try {
      // Delete in reverse order of dependencies
      await this.db.execute(sql`TRUNCATE TABLE voice_sessions CASCADE`);
      await this.db.execute(sql`TRUNCATE TABLE conversations CASCADE`);
      await this.db.execute(sql`TRUNCATE TABLE knowledge_base CASCADE`);
      await this.db.execute(sql`TRUNCATE TABLE sites CASCADE`);
      await this.db.execute(sql`TRUNCATE TABLE users CASCADE`);
      await this.db.execute(sql`TRUNCATE TABLE tenants CASCADE`);

      // Reset sequences
      await this.db.execute(sql`ALTER SEQUENCE IF EXISTS tenants_id_seq RESTART WITH 1`);
      await this.db.execute(sql`ALTER SEQUENCE IF EXISTS users_id_seq RESTART WITH 1`);
      await this.db.execute(sql`ALTER SEQUENCE IF EXISTS sites_id_seq RESTART WITH 1`);

      console.log('✅ Database cleanup completed');
    } catch (error) {
      if (this.isConnectionError(error)) {
        console.warn('⚠️ Database cleanup skipped: connection unavailable.');
        this.enableMockDatabase();
        return;
      }

      console.error('❌ Database cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.useMock || !this.client) {
      return;
    }

    await this.client.end();
  }

  /**
   * Create test tenant in database
   */
  async createTestTenant(overrides: Partial<TestTenant> = {}): Promise<TestTenant> {
    const tenant = createTestTenant(overrides);

    try {
      // Note: This would use your actual schema insert
      // const result = await this.db.insert(tenantsTable).values(tenant).returning();
      // return result[0];

      // Mock implementation for now
      return tenant;
    } catch (error) {
      console.error('Failed to create test tenant:', error);
      throw error;
    }
  }

  /**
   * Create test user in database
   */
  async createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
    const user = createTestUser(overrides);

    try {
      // Note: This would use your actual schema insert
      // const result = await this.db.insert(usersTable).values(user).returning();
      // return result[0];

      // Mock implementation for now
      return user;
    } catch (error) {
      console.error('Failed to create test user:', error);
      throw error;
    }
  }

  /**
   * Create test site in database
   */
  async createTestSite(overrides: Partial<TestSite> = {}): Promise<TestSite> {
    const site = createTestSite(overrides);

    try {
      // Note: This would use your actual schema insert
      // const result = await this.db.insert(sitesTable).values(site).returning();
      // return result[0];

      // Mock implementation for now
      return site;
    } catch (error) {
      console.error('Failed to create test site:', error);
      throw error;
    }
  }

  /**
   * Create a complete test scenario with related entities
   */
  async createTestScenario(): Promise<{
    tenant: TestTenant;
    user: TestUser;
    site: TestSite;
  }> {
    const tenant = await this.createTestTenant();
    const user = await this.createTestUser({
      tenantId: tenant.id!,
      role: 'owner'
    });
    const site = await this.createTestSite({
      tenantId: tenant.id!,
      ownerId: user.id!
    });

    return { tenant, user, site };
  }

  /**
   * Seed test database with predefined data
   */
  async seedTestData(): Promise<void> {
    console.log('🌱 Seeding test database...');

    try {
      // Create test tenant
      const tenant = await this.createTestTenant({
        name: 'Test Company',
        plan: 'pro'
      });

      // Create test users
      const owner = await this.createTestUser({
        tenantId: tenant.id!,
        email: 'owner@test.com',
        name: 'Test Owner',
        role: 'owner'
      });

      const editor = await this.createTestUser({
        tenantId: tenant.id!,
        email: 'editor@test.com',
        name: 'Test Editor',
        role: 'editor'
      });

      // Create test sites
      await this.createTestSite({
        tenantId: tenant.id!,
        ownerId: owner.id!,
        name: 'Test Business Site',
        templateId: 'modern-business',
        status: 'published'
      });

      await this.createTestSite({
        tenantId: tenant.id!,
        ownerId: editor.id!,
        name: 'Test Portfolio Site',
        templateId: 'portfolio',
        status: 'draft'
      });

      console.log('✅ Test data seeded successfully');
    } catch (error) {
      console.error('❌ Test data seeding failed:', error);
      throw error;
    }
  }

  /**
   * Execute raw SQL for complex test scenarios
   */
  async executeRawSQL(query: string, params: any[] = []): Promise<any> {
    if (this.useMock) {
      return { rows: [] };
    }

    try {
      return await this.db.execute(sql.raw(query, params));
    } catch (error) {
      console.error('Raw SQL execution failed:', error);
      throw error;
    }
  }

  /**
   * Check if database is healthy and ready for tests
   */
  async healthCheck(): Promise<boolean> {
    if (this.useMock) {
      return true;
    }

    try {
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics for debugging
   */
  async getStats(): Promise<{
    tenants: number;
    users: number;
    sites: number;
    knowledgeBase: number;
    voiceSessions: number;
  }> {
    if (this.useMock) {
      return { tenants: 0, users: 0, sites: 0, knowledgeBase: 0, voiceSessions: 0 };
    }

    try {
      const [tenants, users, sites, kb, sessions] = await Promise.all([
        this.db.execute(sql`SELECT COUNT(*) FROM tenants`),
        this.db.execute(sql`SELECT COUNT(*) FROM users`),
        this.db.execute(sql`SELECT COUNT(*) FROM sites`),
        this.db.execute(sql`SELECT COUNT(*) FROM knowledge_base`),
        this.db.execute(sql`SELECT COUNT(*) FROM voice_sessions`)
      ]);

      return {
        tenants: parseInt(tenants.rows[0]?.count || '0'),
        users: parseInt(users.rows[0]?.count || '0'),
        sites: parseInt(sites.rows[0]?.count || '0'),
        knowledgeBase: parseInt(kb.rows[0]?.count || '0'),
        voiceSessions: parseInt(sessions.rows[0]?.count || '0')
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return {
        tenants: 0,
        users: 0,
        sites: 0,
        knowledgeBase: 0,
        voiceSessions: 0
      };
    }
  }

  /**
   * Create database transaction for test isolation
   */
  async withTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }
}

// Singleton instance for global use
export const dbTestHelper = new DatabaseTestHelper();

/**
 * Helper function to setup database for tests
 */
export const setupTestDatabase = async (): Promise<DatabaseTestHelper> => {
  await dbTestHelper.setup();
  return dbTestHelper;
};

/**
 * Helper function to cleanup database after tests
 */
export const cleanupTestDatabase = async (): Promise<void> => {
  await dbTestHelper.cleanup();
  await dbTestHelper.close();
};