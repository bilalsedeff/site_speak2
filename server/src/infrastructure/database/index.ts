import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { config } from '../config';
import * as schema from './schema';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'database' });

// Create postgres connection
const client = postgres(config.DATABASE_URL, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 30, // Timeout for establishing connection
  prepare: false, // Disable prepared statements for better compatibility
});

// Create Drizzle instance
export const db = drizzle(client, { 
  schema,
  logger: config.NODE_ENV === 'development' ? {
    logQuery: (query, params) => {
      if (!config.SITESPEAK_KB_QUIET) {
        logger.debug('Database Query', { query, params });
      }
    }
  } : false,
});

// Export the client for direct queries if needed
export { client };

// Export all schema
export * from './schema';

/**
 * Initialize database connection and run migrations
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logger.info('Initializing database connection...');
    
    // Test connection
    await client`SELECT 1`;
    logger.info('Database connection established');

    // Run migrations if not in test environment
    if (config.NODE_ENV !== 'test') {
      logger.info('Running database migrations...');
      await migrate(db, { migrationsFolder: './migrations' });
      logger.info('Database migrations completed');
    }

    // Setup pgvector extension if not exists
    await setupPgVector();
    
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }
}

/**
 * Setup pgvector extension for vector operations
 */
async function setupPgVector(): Promise<void> {
  try {
    logger.info('Setting up pgvector extension...');
    
    // Create extension if it doesn't exist
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    
    logger.info('pgvector extension setup completed');
  } catch (error) {
    logger.error('Failed to setup pgvector extension', { error });
    throw error;
  }
}

/**
 * Close database connections gracefully
 */
export async function closeDatabase(): Promise<void> {
  try {
    logger.info('Closing database connections...');
    await client.end();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Failed to close database connections', { error });
    throw error;
  }
}

/**
 * Health check for database
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    await client`SELECT 1`;
    const latency = Date.now() - startTime;
    
    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    return {
      healthy: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Transaction helper with automatic rollback
 */
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(callback);
}

/**
 * Bulk operations helper
 */
export const dbUtils = {
  /**
   * Batch insert with conflict resolution
   */
  async batchInsert<T extends Record<string, any>>(
    table: any,
    data: T[],
    options: {
      batchSize?: number;
      onConflict?: 'ignore' | 'update' | 'error';
    } = {}
  ): Promise<void> {
    const { batchSize = 1000, onConflict = 'error' } = options;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      if (onConflict === 'ignore') {
        await db.insert(table).values(batch).onConflictDoNothing();
      } else if (onConflict === 'update') {
        // This would need to be customized based on the specific table
        await db.insert(table).values(batch).onConflictDoUpdate({
          target: [], // Specify conflict columns
          set: {}, // Specify update values
        });
      } else {
        await db.insert(table).values(batch);
      }
    }
  },

  /**
   * Execute raw SQL with parameters
   */
  async raw<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const result = await client.unsafe(query, params);
    return result as T[];
  },

  /**
   * Get table statistics
   */
  async getTableStats(tableName: string): Promise<{
    rowCount: number;
    sizeBytes: number;
    indexCount: number;
  }> {
    const [stats] = await client`
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE tablename = ${tableName}
    `;

    const [size] = await client`
      SELECT pg_total_relation_size(${tableName}::regclass) as size_bytes
    `;

    const [count] = await client`
      SELECT COUNT(*) as row_count FROM ${client(tableName)}
    `;

    const indexes = await client`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = ${tableName}
    `;

    return {
      rowCount: parseInt(count.row_count),
      sizeBytes: parseInt(size.size_bytes),
      indexCount: indexes.length,
    };
  }
};

// Connection pool events
client.listen('connect', () => {
  logger.debug('New database connection established');
});

client.listen('disconnect', () => {
  logger.debug('Database connection closed');
});

client.listen('error', (error) => {
  logger.error('Database connection error', { error });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeDatabase();
  process.exit(0);
});