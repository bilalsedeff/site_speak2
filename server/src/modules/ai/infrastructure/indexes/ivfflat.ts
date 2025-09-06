import postgres from 'postgres';
import { config } from '../../../../infrastructure/config';
import { createLogger } from '../../../../shared/utils.js';

const logger = createLogger({ service: 'ivfflat-index' });

export interface IVFFlatConfig {
  lists?: number;              // Default: calculated based on data size
  probes?: number;            // Default: max(lists/10, 1)
}

export interface IVFFlatPreset {
  name: 'balanced' | 'highRecall' | 'fastQuery' | 'largeDatasset';
  config: IVFFlatConfig;
  description: string;
}

/**
 * IVFFlat index management with tuning presets
 * Provides centralized DDL, tuning, and per-query knobs for pgvector IVFFlat
 * 
 * IVFFlat is better than HNSW for:
 * - Smaller datasets (< 100K vectors)
 * - Batch querying scenarios
 * - When memory usage is constrained
 * - Datasets with more uniform distributions
 */
export class IVFFlatIndexManager {
  private sql: postgres.Sql;

  // Predefined tuning presets
  static readonly PRESETS: Record<string, IVFFlatPreset> = {
    balanced: {
      name: 'balanced',
      config: { lists: 100, probes: 10 },
      description: 'Balanced speed/recall trade-off for most use cases',
    },
    highRecall: {
      name: 'highRecall',
      config: { lists: 200, probes: 50 },
      description: 'Higher recall at cost of query speed',
    },
    fastQuery: {
      name: 'fastQuery',
      config: { lists: 50, probes: 5 },
      description: 'Optimized for fast queries with acceptable recall',
    },
    largeDatasset: {
      name: 'largeDatasset',
      config: { lists: 1000, probes: 100 },
      description: 'Optimized for large datasets (>1M vectors)',
    },
  };

  constructor() {
    this.sql = postgres(config.DATABASE_URL, {
      max: 5,
      idle_timeout: 30,
    });
    logger.info('IVFFlat Index Manager initialized');
  }

  /**
   * Create IVFFlat index with specified configuration
   */
  async createIndex(
    tableName: string,
    columnName: string,
    indexName: string,
    config: IVFFlatConfig = IVFFlatIndexManager.PRESETS['balanced']?.config || { lists: 100, probes: 10 },
    concurrent: boolean = true
  ): Promise<void> {
    logger.info('Creating IVFFlat index', {
      tableName,
      columnName,
      indexName,
      config,
      concurrent,
    });

    try {
      // Auto-calculate lists based on data size if not provided
      let { lists, probes } = config;
      
      if (!lists) {
        const rowCountResult = await this.sql`SELECT COUNT(*) FROM ${this.sql.unsafe(tableName)}`;
        const rowCount = Number(rowCountResult[0]?.['count'] || 0);
        lists = this.calculateOptimalLists(rowCount);
      }

      if (!probes) {
        probes = Math.max(Math.floor(lists / 10), 1);
      }

      logger.info('Using calculated IVFFlat parameters', { lists, probes });

      const concurrentStr = concurrent ? 'CONCURRENTLY' : '';
      
      await this.sql`
        CREATE INDEX ${this.sql.unsafe(concurrentStr)} IF NOT EXISTS ${this.sql.unsafe(indexName)}
        ON ${this.sql.unsafe(tableName)} 
        USING ivfflat (${this.sql.unsafe(columnName)} vector_cosine_ops)
        WITH (lists = ${lists})
      `;

      logger.info('IVFFlat index created successfully', { indexName, lists });
    } catch (error) {
      logger.error('Failed to create IVFFlat index', {
        indexName,
        tableName,
        error,
      });
      throw error;
    }
  }

  /**
   * Drop IVFFlat index
   */
  async dropIndex(indexName: string, concurrent: boolean = true): Promise<void> {
    logger.info('Dropping IVFFlat index', { indexName, concurrent });

    try {
      const concurrentStr = concurrent ? 'CONCURRENTLY' : '';
      await this.sql`DROP INDEX ${this.sql.unsafe(concurrentStr)} IF EXISTS ${this.sql.unsafe(indexName)}`;
      
      logger.info('IVFFlat index dropped successfully', { indexName });
    } catch (error) {
      logger.error('Failed to drop IVFFlat index', { indexName, error });
      throw error;
    }
  }

  /**
   * Set ivfflat.probes parameter for current session
   */
  async setProbes(probes: number): Promise<void> {
    logger.info('Setting IVFFlat probes parameter', { probes });

    try {
      await this.sql`SET ivfflat.probes = ${probes}`;
      logger.info('IVFFlat probes set successfully', { probes });
    } catch (error) {
      logger.error('Failed to set IVFFlat probes', { probes, error });
      throw error;
    }
  }

  /**
   * Set ivfflat.probes parameter locally for current transaction
   */
  async setLocalProbes(probes: number): Promise<void> {
    logger.info('Setting IVFFlat probes parameter locally', { probes });

    try {
      await this.sql`SET LOCAL ivfflat.probes = ${probes}`;
      logger.info('IVFFlat probes set locally', { probes });
    } catch (error) {
      logger.error('Failed to set local IVFFlat probes', { probes, error });
      throw error;
    }
  }

  /**
   * Apply preset configuration
   */
  async applyPreset(presetName: keyof typeof IVFFlatIndexManager.PRESETS): Promise<void> {
    const preset = IVFFlatIndexManager.PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown IVFFlat preset: ${presetName}`);
    }

    logger.info('Applying IVFFlat preset', {
      presetName,
      config: preset.config,
      description: preset.description,
    });

    if (preset.config.probes) {
      await this.setProbes(preset.config.probes);
    }
  }

  /**
   * Get current IVFFlat parameters
   */
  async getCurrentParameters(): Promise<{
    probes: number;
    maintenanceWorkMem: string;
    maxParallelMaintenanceWorkers: number;
  }> {
    try {
      const [probesResult] = await this.sql`SHOW ivfflat.probes`;
      const [workMemResult] = await this.sql`SHOW maintenance_work_mem`;
      const [workersResult] = await this.sql`SHOW max_parallel_maintenance_workers`;

      return {
        probes: parseInt(probesResult?.['ivfflat_probes'] || '1'),
        maintenanceWorkMem: workMemResult?.['maintenance_work_mem'] || '4MB',
        maxParallelMaintenanceWorkers: parseInt(workersResult?.['max_parallel_maintenance_workers'] || '2'),
      };
    } catch (error) {
      logger.error('Failed to get current IVFFlat parameters', { error });
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
   * Calculate optimal number of lists based on data size
   * Following pgvector recommendations: sqrt(rows) for most cases
   */
  private calculateOptimalLists(rowCount: number): number {
    if (rowCount < 1000) {
      return Math.max(10, Math.floor(rowCount / 10));
    }
    
    if (rowCount < 100000) {
      // For medium datasets, use sqrt(rows)
      return Math.floor(Math.sqrt(rowCount));
    }
    
    // For large datasets, use sqrt(rows) but cap at reasonable maximum
    return Math.min(1000, Math.floor(Math.sqrt(rowCount)));
  }

  /**
   * Recommend optimal IVFFlat parameters based on data characteristics
   */
  async recommendParameters(
    tableName: string,
    targetRecall: number = 0.95,
    prioritizeSpeed: boolean = false
  ): Promise<{
    recommended: IVFFlatConfig;
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

      const rowCount = Number(stats?.['row_count'] || 0);
      const avgDimensions = Number(stats?.['avg_dimensions'] || 1536);

      const reasoning: string[] = [];
      let recommended: IVFFlatConfig;

      // Calculate optimal lists
      const optimalLists = this.calculateOptimalLists(rowCount);
      
      if (rowCount < 10000) {
        const lists = Math.max(10, optimalLists);
        const probes = prioritizeSpeed ? Math.max(1, Math.floor(lists / 20)) : Math.floor(lists / 10);
        recommended = { lists, probes };
        reasoning.push(`Small dataset (${rowCount} rows): Using lists=${lists}, probes=${probes}`);
      } else if (rowCount < 100000) {
        const lists = optimalLists;
        const probes = prioritizeSpeed ? Math.floor(lists / 15) : Math.floor(lists / 8);
        recommended = { lists, probes };
        reasoning.push(prioritizeSpeed 
          ? `Medium dataset: Speed-optimized with lists=${lists}, probes=${probes}`
          : `Medium dataset: Balanced with lists=${lists}, probes=${probes}`);
      } else {
        const lists = Math.min(1000, optimalLists);
        const probes = prioritizeSpeed ? Math.floor(lists / 20) : Math.floor(lists / 10);
        recommended = { lists, probes };
        reasoning.push(prioritizeSpeed
          ? `Large dataset: Speed-optimized with lists=${lists}, probes=${probes}`
          : `Large dataset: Recall-optimized with lists=${lists}, probes=${probes}`);
      }

      // Adjust for high-dimensional data
      if (avgDimensions > 2000) {
        recommended.probes = Math.min(recommended.lists || 100, (recommended.probes || 10) * 1.5);
        reasoning.push('High-dimensional data: Increased probes for better recall');
      }

      // Adjust for target recall
      if (targetRecall > 0.98) {
        recommended.probes = Math.min(recommended.lists || 100, Math.max(recommended.probes || 10, (recommended.lists || 100) * 0.3));
        reasoning.push('Very high target recall: Significantly increased probes');
      }

      logger.info('IVFFlat parameter recommendation generated', {
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
        recommended: IVFFlatIndexManager.PRESETS['balanced']?.config || { lists: 100, probes: 10 },
        reasoning: ['Error analyzing data: using balanced preset as fallback'],
      };
    }
  }

  /**
   * Compare IVFFlat vs HNSW suitability for given dataset
   */
  async compareWithHNSW(tableName: string): Promise<{
    recommendation: 'ivfflat' | 'hnsw' | 'both';
    reasons: string[];
    ivfflatConfig: IVFFlatConfig;
    hnswAlternative?: { m: number; efConstruction: number; efSearch: number };
  }> {
    try {
      const [stats] = await this.sql`
        SELECT 
          COUNT(*) as row_count,
          AVG(array_length(embedding, 1)) as avg_dimensions,
          pg_size_pretty(pg_total_relation_size(${tableName}::regclass)) as table_size
        FROM ${this.sql.unsafe(tableName)}
        WHERE embedding IS NOT NULL
      `;

      const rowCount = Number(stats?.['row_count'] || 0);
      const avgDimensions = Number(stats?.['avg_dimensions'] || 1536);
      const tableSize = stats?.['table_size'] || '0 bytes';

      const reasons: string[] = [];
      let recommendation: 'ivfflat' | 'hnsw' | 'both';
      const ivfflatConfig = this.calculateOptimalLists(rowCount);

      if (rowCount < 50000) {
        recommendation = 'ivfflat';
        reasons.push('Small dataset: IVFFlat is more efficient for datasets < 50K vectors');
        reasons.push('Lower memory usage and faster index building than HNSW');
      } else if (rowCount < 500000) {
        recommendation = 'both';
        reasons.push('Medium dataset: Both indexes viable, depends on query patterns');
        reasons.push('IVFFlat for batch queries, HNSW for real-time applications');
      } else {
        recommendation = 'hnsw';
        reasons.push('Large dataset: HNSW scales better for datasets > 500K vectors');
        reasons.push('Better query performance at scale despite higher memory usage');
      }

      // Additional considerations
      if (avgDimensions > 2000) {
        reasons.push('High-dimensional data favors HNSW for better recall');
      }

      logger.info('Index type comparison completed', {
        tableName,
        rowCount,
        avgDimensions,
        tableSize,
        recommendation,
        reasons,
      });

      return {
        recommendation,
        reasons,
        ivfflatConfig: { lists: ivfflatConfig, probes: Math.floor(ivfflatConfig / 10) },
        hnswAlternative: { m: 16, efConstruction: 64, efSearch: 100 },
      };
    } catch (error) {
      logger.error('Failed to compare index types', { tableName, error });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.sql.end();
    logger.info('IVFFlat Index Manager closed');
  }
}

// Helper functions
export function ivfflatPreset(presetName: keyof typeof IVFFlatIndexManager.PRESETS): IVFFlatConfig {
  const preset = IVFFlatIndexManager.PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown IVFFlat preset: ${presetName}`);
  }
  return preset.config;
}

export const ivfflatIndexManager = new IVFFlatIndexManager();