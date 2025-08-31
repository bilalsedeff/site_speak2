import postgres from 'postgres';
import { config } from '../../../../infrastructure/config';
import { createLogger } from '../../../../shared/utils.js';

const logger = createLogger({ service: 'hnsw-index' });

export interface HNSWConfig {
  m?: number;                    // Default: 16 (connections per node)
  efConstruction?: number;       // Default: 64 (build-time search width)
  efSearch?: number;            // Default: 100 (query-time search width)
}

export interface HNSWPreset {
  name: 'balanced' | 'highRecall' | 'fastBuild' | 'lowMemory';
  config: HNSWConfig;
  description: string;
}

/**
 * HNSW index management with tuning presets
 * Provides centralized DDL, tuning, and per-query knobs for pgvector HNSW
 */
export class HNSWIndexManager {
  private sql: postgres.Sql;

  // Predefined tuning presets
  static readonly PRESETS: Record<string, HNSWPreset> = {
    balanced: {
      name: 'balanced',
      config: { m: 16, efConstruction: 64, efSearch: 100 },
      description: 'Balanced speed/recall trade-off for most use cases',
    },
    highRecall: {
      name: 'highRecall',
      config: { m: 32, efConstruction: 128, efSearch: 200 },
      description: 'Higher recall at cost of speed and memory',
    },
    fastBuild: {
      name: 'fastBuild',
      config: { m: 8, efConstruction: 32, efSearch: 80 },
      description: 'Faster index building with acceptable quality',
    },
    lowMemory: {
      name: 'lowMemory',
      config: { m: 8, efConstruction: 32, efSearch: 60 },
      description: 'Memory-optimized for resource-constrained environments',
    },
  };

  constructor() {
    this.sql = postgres(config.DATABASE_URL, {
      max: 5,
      idle_timeout: 30,
    });
    logger.info('HNSW Index Manager initialized');
  }

  /**
   * Create HNSW index with specified configuration
   */
  async createIndex(
    tableName: string,
    columnName: string,
    indexName: string,
    config: HNSWConfig = HNSWIndexManager.PRESETS['balanced'].config,
    concurrent: boolean = true
  ): Promise<void> {
    const { m = 16, efConstruction = 64 } = config;
    
    logger.info('Creating HNSW index', {
      tableName,
      columnName,
      indexName,
      config,
      concurrent,
    });

    try {
      // Validate memory requirements
      await this.validateMemoryRequirements(tableName, config);

      const concurrentStr = concurrent ? 'CONCURRENTLY' : '';
      
      await this.sql`
        CREATE INDEX ${this.sql.unsafe(concurrentStr)} IF NOT EXISTS ${this.sql.unsafe(indexName)}
        ON ${this.sql.unsafe(tableName)} 
        USING hnsw (${this.sql.unsafe(columnName)} vector_cosine_ops)
        WITH (m = ${m}, ef_construction = ${efConstruction})
      `;

      logger.info('HNSW index created successfully', { indexName });
    } catch (error) {
      logger.error('Failed to create HNSW index', {
        indexName,
        tableName,
        error,
      });
      throw error;
    }
  }

  /**
   * Drop HNSW index
   */
  async dropIndex(indexName: string, concurrent: boolean = true): Promise<void> {
    logger.info('Dropping HNSW index', { indexName, concurrent });

    try {
      const concurrentStr = concurrent ? 'CONCURRENTLY' : '';
      await this.sql`DROP INDEX ${this.sql.unsafe(concurrentStr)} IF EXISTS ${this.sql.unsafe(indexName)}`;
      
      logger.info('HNSW index dropped successfully', { indexName });
    } catch (error) {
      logger.error('Failed to drop HNSW index', { indexName, error });
      throw error;
    }
  }

  /**
   * Set ef_search parameter for current session
   */
  async setEfSearch(efSearch: number): Promise<void> {
    logger.info('Setting HNSW ef_search parameter', { efSearch });

    try {
      await this.sql`SET hnsw.ef_search = ${efSearch}`;
      logger.info('HNSW ef_search set successfully', { efSearch });
    } catch (error) {
      logger.error('Failed to set HNSW ef_search', { efSearch, error });
      throw error;
    }
  }

  /**
   * Set ef_search parameter locally for current transaction
   */
  async setLocalEfSearch(efSearch: number): Promise<void> {
    logger.info('Setting HNSW ef_search parameter locally', { efSearch });

    try {
      await this.sql`SET LOCAL hnsw.ef_search = ${efSearch}`;
      logger.info('HNSW ef_search set locally', { efSearch });
    } catch (error) {
      logger.error('Failed to set local HNSW ef_search', { efSearch, error });
      throw error;
    }
  }

  /**
   * Apply preset configuration
   */
  async applyPreset(presetName: keyof typeof HNSWIndexManager.PRESETS): Promise<void> {
    const preset = HNSWIndexManager.PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown HNSW preset: ${presetName}`);
    }

    logger.info('Applying HNSW preset', {
      presetName,
      config: preset.config,
      description: preset.description,
    });

    if (preset.config.efSearch) {
      await this.setEfSearch(preset.config.efSearch);
    }
  }

  /**
   * Get current HNSW parameters
   */
  async getCurrentParameters(): Promise<{
    efSearch: number;
    maintenanceWorkMem: string;
    maxParallelMaintenanceWorkers: number;
  }> {
    try {
      const [efSearchResult] = await this.sql`SHOW hnsw.ef_search`;
      const [workMemResult] = await this.sql`SHOW maintenance_work_mem`;
      const [workersResult] = await this.sql`SHOW max_parallel_maintenance_workers`;

      return {
        efSearch: parseInt(efSearchResult['hnsw_ef_search'] || '100'),
        maintenanceWorkMem: workMemResult['maintenance_work_mem'],
        maxParallelMaintenanceWorkers: parseInt(workersResult['max_parallel_maintenance_workers']),
      };
    } catch (error) {
      logger.error('Failed to get current HNSW parameters', { error });
      throw error;
    }
  }

  /**
   * Get index statistics and health
   */
  async getIndexStats(indexName: string): Promise<{
    indexSize: string;
    indexScans: number;
    tuplesRead: number;
    tuplesReturned: number;
    isValid: boolean;
  }> {
    try {
      const [stats] = await this.sql`
        SELECT 
          pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size,
          s.idx_scan as index_scans,
          s.idx_tup_read as tuples_read,
          s.idx_tup_fetch as tuples_returned,
          i.indisvalid as is_valid
        FROM pg_index i
        JOIN pg_class c ON i.indexrelid = c.oid
        LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.indexrelid
        WHERE c.relname = ${indexName}
      `;

      return {
        indexSize: stats?.['index_size'] || '0 bytes',
        indexScans: stats?.['index_scans'] || 0,
        tuplesRead: stats?.['tuples_read'] || 0,
        tuplesReturned: stats?.['tuples_returned'] || 0,
        isValid: stats?.['is_valid'] || false,
      };
    } catch (error) {
      logger.error('Failed to get index statistics', { indexName, error });
      throw error;
    }
  }

  /**
   * Validate memory requirements for index creation
   */
  private async validateMemoryRequirements(
    tableName: string,
    config: HNSWConfig
  ): Promise<void> {
    try {
      // Get table size and row count
      const [tableStats] = await this.sql`
        SELECT 
          pg_size_pretty(pg_total_relation_size(${tableName}::regclass)) as table_size,
          n_tup_ins as row_count
        FROM pg_stat_user_tables 
        WHERE relname = ${tableName}
      `;

      // Get current maintenance_work_mem
      const [memResult] = await this.sql`SHOW maintenance_work_mem`;
      const workMem = memResult['maintenance_work_mem'];

      logger.info('Index creation memory validation', {
        tableName,
        tableSize: tableStats?.['table_size'],
        rowCount: tableStats?.['row_count'],
        maintenanceWorkMem: workMem,
        indexConfig: config,
      });

      // Warn if maintenance_work_mem might be too low
      const workMemBytes = this.parseMemoryString(workMem);
      const estimatedIndexMem = (tableStats?.['row_count'] || 0) * (config.m || 16) * 4; // Rough estimate

      if (workMemBytes < estimatedIndexMem) {
        logger.warn('maintenance_work_mem might be too low for efficient index build', {
          currentWorkMem: workMem,
          estimatedRequirement: `${Math.round(estimatedIndexMem / 1024 / 1024)}MB`,
          recommendation: 'Consider increasing maintenance_work_mem for faster index build',
        });
      }
    } catch (error) {
      logger.warn('Could not validate memory requirements', { error });
      // Don't fail the operation, just log the warning
    }
  }

  /**
   * Parse PostgreSQL memory string to bytes
   */
  private parseMemoryString(memStr: string): number {
    const match = memStr.match(/^(\d+)(kB|MB|GB)?$/);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2] || '';

    switch (unit) {
      case 'GB': return value * 1024 * 1024 * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'kB': return value * 1024;
      default: return value;
    }
  }

  /**
   * Recommend optimal HNSW parameters based on data characteristics
   */
  async recommendParameters(
    tableName: string,
    targetRecall: number = 0.95,
    prioritizeSpeed: boolean = false
  ): Promise<{
    recommended: HNSWConfig;
    reasoning: string[];
  }> {
    try {
      // Get table statistics
      const [stats] = await this.sql`
        SELECT 
          COUNT(*) as row_count,
          AVG(array_length(embedding, 1)) as avg_dimensions
        FROM ${this.sql.unsafe(tableName)}
        WHERE embedding IS NOT NULL
      `;

      const rowCount = stats?.['row_count'] || 0;
      const avgDimensions = stats?.['avg_dimensions'] || 1536;

      const reasoning: string[] = [];
      let recommended: HNSWConfig;

      if (rowCount < 10000) {
        recommended = { m: 8, efConstruction: 32, efSearch: 60 };
        reasoning.push('Small dataset (<10K): Using low memory configuration');
      } else if (rowCount < 100000) {
        recommended = prioritizeSpeed 
          ? { m: 12, efConstruction: 48, efSearch: 80 }
          : { m: 16, efConstruction: 64, efSearch: 100 };
        reasoning.push(prioritizeSpeed 
          ? 'Medium dataset: Optimized for speed'
          : 'Medium dataset: Balanced configuration');
      } else {
        recommended = prioritizeSpeed
          ? { m: 16, efConstruction: 64, efSearch: 100 }
          : { m: 24, efConstruction: 96, efSearch: 150 };
        reasoning.push(prioritizeSpeed
          ? 'Large dataset: Speed-optimized'
          : 'Large dataset: Recall-optimized');
      }

      // Adjust for high-dimensional data
      if (avgDimensions > 2000) {
        recommended.efConstruction = (recommended.efConstruction || 64) * 1.5;
        recommended.efSearch = (recommended.efSearch || 100) * 1.5;
        reasoning.push('High-dimensional data: Increased ef_construction and ef_search');
      }

      // Adjust for target recall
      if (targetRecall > 0.98) {
        recommended.efSearch = Math.max(recommended.efSearch || 100, 200);
        reasoning.push('Very high target recall: Increased ef_search');
      }

      logger.info('HNSW parameter recommendation generated', {
        tableName,
        rowCount,
        avgDimensions,
        targetRecall,
        prioritizeSpeed,
        recommended,
        reasoning,
      });

      return { recommended, reasoning };
    } catch (error) {
      logger.error('Failed to generate parameter recommendations', {
        tableName,
        error,
      });
      
      // Return safe defaults
      return {
        recommended: HNSWIndexManager.PRESETS['balanced'].config,
        reasoning: ['Error analyzing data: using balanced preset as fallback'],
      };
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.sql.end();
    logger.info('HNSW Index Manager closed');
  }
}

// Helper functions
export function hnswPreset(presetName: keyof typeof HNSWIndexManager.PRESETS): HNSWConfig {
  const preset = HNSWIndexManager.PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown HNSW preset: ${presetName}`);
  }
  return preset.config;
}

export const hnswIndexManager = new HNSWIndexManager();