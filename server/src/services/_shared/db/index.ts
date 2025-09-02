/**
 * Database Service - Bridge to existing Drizzle implementation
 * 
 * Provides a clean interface to our existing database infrastructure
 * without duplicating the excellent work already implemented.
 */

// Re-export existing database infrastructure
export {
  db,
  client,
  initializeDatabase,
  closeDatabase,
  checkDatabaseHealth,
  withTransaction,
  dbUtils,
} from '../../../infrastructure/database';

// Re-export all schema definitions
export * from '../../../infrastructure/database/schema';

// Re-export pgvector client
export { PgVectorClient } from '../../../modules/ai/infrastructure/vector-store/PgVectorClient';
export type { 
  NNQuery, 
  Hit, 
  ChunkInsert, 
  SemanticSearchRequest 
} from '../../../modules/ai/infrastructure/vector-store/PgVectorClient';

/**
 * Database service factory for dependency injection
 */
import { 
  db, 
  client, 
  dbUtils, 
  checkDatabaseHealth, 
  withTransaction 
} from '../../../infrastructure/database';

export const createDatabaseService = () => ({
  db,
  client,
  utils: dbUtils,
  health: checkDatabaseHealth,
  transaction: withTransaction,
});

export type DatabaseService = ReturnType<typeof createDatabaseService>;