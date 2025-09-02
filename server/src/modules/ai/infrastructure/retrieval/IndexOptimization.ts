/**
 * HNSW and IVFFlat Index Optimization
 * 
 * Centralized management of pgvector indexes with proper tuning and performance optimization
 * Implements source-of-truth requirements for vector index management
 */

import { createLogger } from '../../../../shared/utils.js';
import * as postgres from 'postgres';
type Sql = postgres.Sql;
import { config } from '../../../../infrastructure/config';

const logger = createLogger({ service: 'index-optimization' });

export interface IndexStats {
  indexName: string;
  indexType: 'hnsw' | 'ivfflat' | 'none';
  tableName: string;
  columnName: string;
  indexSize: string;
  rowCount: number;
  indexDef: string;
  isValid: boolean;
  createdAt?: Date;
}

export interface IndexPerformance {
  avgQueryTime: number;
  p95QueryTime: number;
  p99QueryTime: number;
  recall: number;
  indexEfficiency: number;
}

export interface HNSWConfig {
  m: number;           // Max connections per layer (default: 16)
  efConstruction: number; // Search width during construction (default: 64)
  efSearch: number;    // Search width during query (default: 100)
}

export interface IVFFlatConfig {
  lists: number;       // Number of clusters (default: rows/1000)
  probes: number;      // Clusters to search (default: sqrt(lists))
}

export interface IndexOptimizationOptions {
  targetRecall?: number; // Target recall rate (default: 0.95)
  maxQueryTime?: number; // Max acceptable query time in ms (default: 100)
  maintenanceWorkMem?: string; // Memory for index operations (default: '1GB')
  maxParallelWorkers?: number; // Parallel workers for index creation (default: 4)
}

/**
 * HNSW Index Manager
 * 
 * Manages HNSW (Hierarchical Navigable Small World) indexes with optimal parameters
 */
export class HNSWManager {
  private sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  /**
   * Create HNSW index with optimal parameters
   */
  async createIndex(
    tableName: string, 
    columnName: string = 'embedding',
    config?: Partial<HNSWConfig>,
    options?: IndexOptimizationOptions
  ): Promise<string> {
    const indexName = `${tableName}_${columnName}_hnsw_idx`;
    const m = config?.m || 16;
    const efConstruction = config?.efConstruction || 64;

    logger.info('Creating HNSW index', {
      tableName,
      columnName,
      indexName,
      m,
      efConstruction,
    });

    try {
      // Set memory for index creation
      const maintenanceWorkMem = options?.maintenanceWorkMem || '1GB';
      await this.sql`SET maintenance_work_mem = ${maintenanceWorkMem}`;

      // Set parallel workers if specified
      if (options?.maxParallelWorkers) {
        await this.sql`SET max_parallel_maintenance_workers = ${options.maxParallelWorkers}`;
      }

      // Create HNSW index
      await this.sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${this.sql(indexName)}
        ON ${this.sql(tableName)} 
        USING hnsw (${this.sql(columnName)} vector_cosine_ops) 
        WITH (m = ${m}, ef_construction = ${efConstruction})
      `;

      // Reset memory settings
      await this.sql`RESET maintenance_work_mem`;
      if (options?.maxParallelWorkers) {
        await this.sql`RESET max_parallel_maintenance_workers`;
      }

      logger.info('HNSW index created successfully', { indexName });
      return indexName;

    } catch (error) {
      logger.error('Failed to create HNSW index', { 
        error, 
        tableName, 
        indexName 
      });
      throw error;
    }
  }

  /**
   * Drop HNSW index
   */
  async dropIndex(indexName: string): Promise<void> {
    try {
      await this.sql`DROP INDEX IF EXISTS ${this.sql(indexName)}`;
      logger.info('HNSW index dropped', { indexName });
    } catch (error) {
      logger.error('Failed to drop HNSW index', { error, indexName });
      throw error;
    }
  }

  /**
   * Set HNSW search parameters for current session
   */
  async setSearchParams(efSearch: number): Promise<void> {
    await this.sql`SET hnsw.ef_search = ${efSearch}`;
    logger.debug('HNSW search parameters set', { efSearch });
  }

  /**
   * Get HNSW presets for different use cases
   */
  getPresets(): Record<string, HNSWConfig> {
    return {
      balanced: {
        m: 16,
        efConstruction: 64,
        efSearch: 100,
      },
      highRecall: {
        m: 24,
        efConstruction: 128,
        efSearch: 200,
      },
      fastSearch: {
        m: 8,
        efConstruction: 32,
        efSearch: 50,
      },
      highPrecision: {
        m: 32,
        efConstruction: 200,
        efSearch: 400,
      },
    };
  }

  /**
   * Estimate optimal parameters based on data characteristics
   */
  estimateOptimalParams(
    rowCount: number,
    dimensions: number,
    targetRecall: number = 0.95
  ): HNSWConfig {
    // Base parameters
    let m = 16;
    let efConstruction = 64;
    let efSearch = 100;

    // Adjust based on dataset size
    if (rowCount > 1_000_000) {
      // Large dataset - increase connectivity
      m = Math.min(32, Math.ceil(Math.log2(rowCount / 100_000) * 8));
      efConstruction = Math.min(200, m * 4);
    } else if (rowCount < 10_000) {
      // Small dataset - reduce parameters
      m = Math.max(8, 12);
      efConstruction = Math.max(32, m * 3);
    }

    // Adjust for high-dimensional data
    if (dimensions > 1536) {
      efConstruction = Math.min(200, efConstruction * 1.5);
      efSearch = Math.min(300, efSearch * 1.5);
    }

    // Adjust for target recall
    if (targetRecall > 0.98) {
      efSearch = Math.min(400, efSearch * 2);
    } else if (targetRecall < 0.90) {
      efSearch = Math.max(50, efSearch * 0.7);
    }

    return { 
      m: Math.round(m), 
      efConstruction: Math.round(efConstruction), 
      efSearch: Math.round(efSearch) 
    };
  }
}

/**
 * IVFFlat Index Manager
 * 
 * Manages IVFFlat (Inverted File with Flat Compression) indexes
 */
export class IVFFlatManager {
  private sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  /**
   * Create IVFFlat index with optimal parameters
   */
  async createIndex(
    tableName: string,
    columnName: string = 'embedding',
    config?: Partial<IVFFlatConfig>,
    options?: IndexOptimizationOptions
  ): Promise<string> {
    const indexName = `${tableName}_${columnName}_ivfflat_idx`;

    // Estimate optimal lists count if not provided
    let lists = config?.lists;
    if (!lists) {
      const rowCount = await this.getRowCount(tableName);
      lists = this.estimateOptimalLists(rowCount);
    }

    logger.info('Creating IVFFlat index', {
      tableName,
      columnName,
      indexName,
      lists,
    });

    try {
      // Set memory for index creation
      const maintenanceWorkMem = options?.maintenanceWorkMem || '1GB';
      await this.sql`SET maintenance_work_mem = ${maintenanceWorkMem}`;

      // Set parallel workers if specified
      if (options?.maxParallelWorkers) {
        await this.sql`SET max_parallel_maintenance_workers = ${options.maxParallelWorkers}`;
      }

      // Create IVFFlat index
      await this.sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${this.sql(indexName)}
        ON ${this.sql(tableName)} 
        USING ivfflat (${this.sql(columnName)} vector_cosine_ops) 
        WITH (lists = ${lists})
      `;

      // Reset memory settings
      await this.sql`RESET maintenance_work_mem`;
      if (options?.maxParallelWorkers) {
        await this.sql`RESET max_parallel_maintenance_workers`;
      }

      logger.info('IVFFlat index created successfully', { indexName, lists });
      return indexName;

    } catch (error) {
      logger.error('Failed to create IVFFlat index', { 
        error, 
        tableName, 
        indexName 
      });
      throw error;
    }
  }

  /**
   * Drop IVFFlat index
   */
  async dropIndex(indexName: string): Promise<void> {
    try {
      await this.sql`DROP INDEX IF EXISTS ${this.sql(indexName)}`;
      logger.info('IVFFlat index dropped', { indexName });
    } catch (error) {
      logger.error('Failed to drop IVFFlat index', { error, indexName });
      throw error;
    }
  }

  /**
   * Set IVFFlat search parameters for current session
   */
  async setSearchParams(probes: number): Promise<void> {
    await this.sql`SET ivfflat.probes = ${probes}`;
    logger.debug('IVFFlat search parameters set', { probes });
  }

  /**
   * Estimate optimal lists count based on row count
   */
  estimateOptimalLists(rowCount: number): number {
    if (rowCount <= 1_000_000) {
      // For smaller datasets: lists ≈ rows/1000
      return Math.max(100, Math.min(1000, Math.floor(rowCount / 1000)));
    } else {
      // For larger datasets: lists ≈ sqrt(rows)
      return Math.max(1000, Math.floor(Math.sqrt(rowCount)));
    }
  }

  /**
   * Estimate optimal probes based on lists count
   */
  estimateOptimalProbes(lists: number, targetRecall: number = 0.95): number {
    // Base: probes ≈ sqrt(lists)
    let probes = Math.floor(Math.sqrt(lists));

    // Adjust for target recall
    if (targetRecall > 0.98) {
      probes = Math.min(lists, probes * 2);
    } else if (targetRecall < 0.90) {
      probes = Math.max(1, Math.floor(probes * 0.7));
    }

    return probes;
  }

  /**
   * Get row count for a table
   */
  private async getRowCount(tableName: string): Promise<number> {
    const result = await this.sql`
      SELECT COUNT(*) as count FROM ${this.sql(tableName)}
    `;
    return parseInt(result[0]?.count || '0');
  }

  /**
   * Get IVFFlat presets for different use cases
   */
  getPresets(): Record<string, (rowCount: number) => IVFFlatConfig> {
    return {
      balanced: (rowCount: number) => ({
        lists: this.estimateOptimalLists(rowCount),
        probes: this.estimateOptimalProbes(this.estimateOptimalLists(rowCount)),
      }),
      highRecall: (rowCount: number) => {
        const lists = this.estimateOptimalLists(rowCount);
        return {
          lists,
          probes: Math.min(lists, this.estimateOptimalProbes(lists, 0.98)),
        };
      },
      fastSearch: (rowCount: number) => {
        const lists = Math.max(50, Math.floor(this.estimateOptimalLists(rowCount) * 0.7));
        return {
          lists,
          probes: Math.max(1, Math.floor(this.estimateOptimalProbes(lists) * 0.5)),
        };
      },
    };
  }
}

/**
 * Main Index Optimization Service
 * 
 * Unified interface for managing both HNSW and IVFFlat indexes
 */
export class IndexOptimization {
  private sql: postgres.Sql;
  private hnsw: HNSWManager;
  private ivfflat: IVFFlatManager;

  constructor() {
    this.sql = postgres(config.DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
    
    this.hnsw = new HNSWManager(this.sql);
    this.ivfflat = new IVFFlatManager(this.sql);

    logger.info('Index Optimization Service initialized');
  }

  /**
   * Get HNSW manager
   */
  getHNSWManager(): HNSWManager {
    return this.hnsw;
  }

  /**
   * Get IVFFlat manager
   */
  getIVFFlatManager(): IVFFlatManager {
    return this.ivfflat;
  }

  /**
   * Get comprehensive index statistics
   */
  async getIndexStats(tableName: string): Promise<IndexStats[]> {
    try {
      const result = await this.sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef,
          pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size,
          (SELECT COUNT(*) FROM ${this.sql(tableName)}) as row_count
        FROM pg_indexes 
        WHERE tablename = ${tableName}
        AND indexdef LIKE '%vector%'
        ORDER BY indexname
      `;

      return result.map((row: any) => ({
        indexName: row.indexname,
        indexType: this.detectIndexType(row.indexdef),
        tableName: row.tablename,
        columnName: this.extractColumnName(row.indexdef),
        indexSize: row.index_size,
        rowCount: parseInt(row.row_count || '0'),
        indexDef: row.indexdef,
        isValid: true, // Could be enhanced with actual validation
      }));

    } catch (error) {
      logger.error('Failed to get index stats', { error, tableName });
      throw error;
    }
  }

  /**
   * Recommend optimal index type and parameters
   */
  async recommendIndex(
    tableName: string,
    dimensions: number = 1536,
    options?: IndexOptimizationOptions
  ): Promise<{
    recommended: 'hnsw' | 'ivfflat';
    reasoning: string;
    hnswConfig: HNSWConfig;
    ivfflatConfig: IVFFlatConfig;
  }> {
    try {
      const rowCount = await this.getRowCount(tableName);
      const targetRecall = options?.targetRecall || 0.95;
      const maxQueryTime = options?.maxQueryTime || 100;

      // Get optimal configurations
      const hnswConfig = this.hnsw.estimateOptimalParams(rowCount, dimensions, targetRecall);
      const ivfflatConfig = this.ivfflat.getPresets().balanced(rowCount);

      // Decision logic
      let recommended: 'hnsw' | 'ivfflat';
      let reasoning: string;

      if (rowCount < 100_000) {
        recommended = 'hnsw';
        reasoning = 'HNSW recommended for smaller datasets (<100K rows) due to better recall/latency balance';
      } else if (rowCount > 5_000_000) {
        recommended = 'ivfflat';
        reasoning = 'IVFFlat recommended for very large datasets (>5M rows) due to faster build times and memory efficiency';
      } else if (targetRecall > 0.98) {
        recommended = 'hnsw';
        reasoning = 'HNSW recommended for high recall requirements (>0.98) due to superior accuracy';
      } else if (maxQueryTime < 50) {
        recommended = 'ivfflat';
        reasoning = 'IVFFlat recommended for very fast query requirements (<50ms) with proper tuning';
      } else {
        recommended = 'hnsw';
        reasoning = 'HNSW recommended as default choice for balanced performance';
      }

      return {
        recommended,
        reasoning,
        hnswConfig,
        ivfflatConfig,
      };

    } catch (error) {
      logger.error('Failed to recommend index', { error, tableName });
      throw error;
    }
  }

  /**
   * Reindex with optimal parameters
   */
  async reindex(
    tableName: string,
    indexType: 'hnsw' | 'ivfflat',
    options?: IndexOptimizationOptions
  ): Promise<string> {
    logger.info('Starting reindex operation', { tableName, indexType });

    try {
      // Drop existing vector indexes
      const existingStats = await this.getIndexStats(tableName);
      for (const stat of existingStats) {
        if (stat.indexType !== 'none') {
          if (stat.indexType === 'hnsw') {
            await this.hnsw.dropIndex(stat.indexName);
          } else if (stat.indexType === 'ivfflat') {
            await this.ivfflat.dropIndex(stat.indexName);
          }
        }
      }

      // Create new index with optimal parameters
      let newIndexName: string;
      if (indexType === 'hnsw') {
        const rowCount = await this.getRowCount(tableName);
        const config = this.hnsw.estimateOptimalParams(rowCount, 1536, options?.targetRecall);
        newIndexName = await this.hnsw.createIndex(tableName, 'embedding', config, options);
      } else {
        const rowCount = await this.getRowCount(tableName);
        const config = this.ivfflat.getPresets().balanced(rowCount);
        newIndexName = await this.ivfflat.createIndex(tableName, 'embedding', config, options);
      }

      logger.info('Reindex completed successfully', { 
        tableName, 
        indexType, 
        newIndexName 
      });

      return newIndexName;

    } catch (error) {
      logger.error('Reindex failed', { error, tableName, indexType });
      throw error;
    }
  }

  /**
   * Get row count for a table
   */
  private async getRowCount(tableName: string): Promise<number> {
    const result = await this.sql`
      SELECT COUNT(*) as count FROM ${this.sql(tableName)}
    `;
    return parseInt(result[0]?.count || '0');
  }

  /**
   * Detect index type from index definition
   */
  private detectIndexType(indexDef: string): 'hnsw' | 'ivfflat' | 'none' {
    if (indexDef.includes('hnsw')) {return 'hnsw';}
    if (indexDef.includes('ivfflat')) {return 'ivfflat';}
    return 'none';
  }

  /**
   * Extract column name from index definition
   */
  private extractColumnName(indexDef: string): string {
    const match = indexDef.match(/\(([^)]+)\)/);
    if (match) {
      const column = match[1].split(' ')[0];
      return column.replace(/"/g, '');
    }
    return 'embedding';
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.sql.end();
    logger.info('Index Optimization Service closed');
  }
}

// Export singleton instance
export const indexOptimization = new IndexOptimization();