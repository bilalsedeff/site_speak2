/**
 * Realtime Connection Pool - Optimized OpenAI Realtime API connection management
 *
 * Performance Optimizations:
 * - Connection pre-warming and pooling
 * - Intelligent connection reuse based on tenant/session affinity
 * - Automatic connection health monitoring and healing
 * - Graceful failover and load balancing
 * - Connection lifecycle management with configurable TTL
 *
 * Target Performance:
 * - Connection establishment: <50ms (vs 150-300ms cold)
 * - Connection reuse rate: >90%
 * - Failover time: <100ms
 * - Memory overhead: <10MB per 100 connections
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../shared/utils';
import { OpenAIRealtimeClient, createRealtimeConfig, type RealtimeConfig } from './openaiRealtimeClient';

const logger = createLogger({ service: 'realtime-connection-pool' });

export interface PooledConnection {
  client: OpenAIRealtimeClient;
  tenantId: string;
  sessionId?: string;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
  isHealthy: boolean;
  isInUse: boolean;
  connectionLatency: number;
  healthCheckCount: number;
}

export interface ConnectionPoolConfig {
  maxConnectionsPerTenant: number;
  maxTotalConnections: number;
  connectionTTL: number; // milliseconds
  idleTimeout: number; // milliseconds
  healthCheckInterval: number; // milliseconds
  preWarmConnections: number; // number of connections to pre-warm
  maxRetries: number;
  enableConnectionAffinity: boolean;
  enablePreWarming: boolean;
  enableHealthChecks: boolean;
}

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  connectionsByTenant: Map<string, number>;
  avgConnectionLatency: number;
  connectionReuseRate: number;
  healthCheckSuccess: number;
  healthCheckFailure: number;
  connectionsCreated: number;
  connectionsDestroyed: number;
}

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnectionsPerTenant: 10,
  maxTotalConnections: 100,
  connectionTTL: 30 * 60 * 1000, // 30 minutes
  idleTimeout: 5 * 60 * 1000, // 5 minutes
  healthCheckInterval: 30 * 1000, // 30 seconds
  preWarmConnections: 5,
  maxRetries: 3,
  enableConnectionAffinity: true,
  enablePreWarming: true,
  enableHealthChecks: true
};

/**
 * High-performance connection pool for OpenAI Realtime API
 */
export class RealtimeConnectionPool extends EventEmitter {
  private config: ConnectionPoolConfig;
  private connections: Map<string, PooledConnection> = new Map();
  private tenantConnections: Map<string, Set<string>> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private stats: PoolStats;
  private isShuttingDown = false;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      connectionsByTenant: new Map(),
      avgConnectionLatency: 0,
      connectionReuseRate: 0,
      healthCheckSuccess: 0,
      healthCheckFailure: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0
    };

    this.initializePool();
  }

  /**
   * Initialize the connection pool
   */
  private async initializePool(): Promise<void> {
    try {
      // Start background tasks
      if (this.config.enableHealthChecks) {
        this.startHealthChecks();
      }

      this.startCleanupTask();

      // Pre-warm connections if enabled
      if (this.config.enablePreWarming && this.config.preWarmConnections > 0) {
        await this.preWarmConnections();
      }

      logger.info('Realtime connection pool initialized', {
        maxConnections: this.config.maxTotalConnections,
        preWarmConnections: this.config.preWarmConnections,
        healthChecks: this.config.enableHealthChecks
      });

      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize connection pool', { error });
      throw error;
    }
  }

  /**
   * Get a connection for a tenant (reuse existing or create new)
   */
  async getConnection(tenantId: string, sessionId?: string): Promise<PooledConnection> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    const startTime = performance.now();

    try {
      // Try to reuse existing connection with affinity
      if (this.config.enableConnectionAffinity) {
        const existingConnection = this.findBestConnection(tenantId, sessionId);
        if (existingConnection) {
          this.updateConnectionUsage(existingConnection, sessionId);

          logger.debug('Reusing existing connection', {
            tenantId,
            sessionId,
            connectionId: existingConnection.client.getStatus().sessionId,
            useCount: existingConnection.useCount
          });

          return existingConnection;
        }
      }

      // Create new connection if needed
      const connection = await this.createConnection(tenantId, sessionId);
      const latency = performance.now() - startTime;

      logger.info('Created new connection', {
        tenantId,
        sessionId,
        connectionId: connection.client.getStatus().sessionId,
        latency
      });

      this.emit('connection_created', { tenantId, sessionId, latency });
      return connection;

    } catch (error) {
      const latency = performance.now() - startTime;
      logger.error('Failed to get connection', {
        tenantId,
        sessionId,
        error,
        latency
      });

      this.emit('connection_failed', { tenantId, sessionId, error, latency });
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(connection: PooledConnection): void {
    if (!connection || this.isShuttingDown) {
      return;
    }

    connection.isInUse = false;
    connection.lastUsed = new Date();

    logger.debug('Connection released', {
      tenantId: connection.tenantId,
      sessionId: connection.sessionId,
      useCount: connection.useCount,
      connectionId: connection.client.getStatus().sessionId
    });

    this.updateStats();
    this.emit('connection_released', { connection });
  }

  /**
   * Find the best existing connection for reuse
   */
  private findBestConnection(tenantId: string, sessionId?: string): PooledConnection | null {
    const tenantConnectionIds = this.tenantConnections.get(tenantId);
    if (!tenantConnectionIds || tenantConnectionIds.size === 0) {
      return null;
    }

    let bestConnection: PooledConnection | null = null;
    let bestScore = -1;

    for (const connectionId of tenantConnectionIds) {
      const connection = this.connections.get(connectionId);
      if (!connection || connection.isInUse || !connection.isHealthy) {
        continue;
      }

      // Check if connection is still valid
      if (this.isConnectionExpired(connection)) {
        this.removeConnection(connectionId);
        continue;
      }

      // Calculate connection score (prefer session affinity, then recent usage)
      let score = 0;

      // Session affinity bonus
      if (sessionId && connection.sessionId === sessionId) {
        score += 100;
      }

      // Recent usage bonus (inverse of idle time)
      const idleTime = Date.now() - connection.lastUsed.getTime();
      score += Math.max(0, 50 - (idleTime / 1000)); // Up to 50 points for recent usage

      // Connection health bonus
      if (connection.connectionLatency < 100) {
        score += 20;
      }

      // Use count penalty (prefer less used connections)
      score -= connection.useCount * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestConnection = connection;
      }
    }

    return bestConnection;
  }

  /**
   * Create a new connection
   */
  private async createConnection(tenantId: string, sessionId?: string): Promise<PooledConnection> {
    // Check connection limits
    if (this.connections.size >= this.config.maxTotalConnections) {
      // Try to cleanup expired connections
      await this.cleanupExpiredConnections();

      if (this.connections.size >= this.config.maxTotalConnections) {
        throw new Error('Maximum connection pool size reached');
      }
    }

    const tenantConnectionCount = this.tenantConnections.get(tenantId)?.size || 0;
    if (tenantConnectionCount >= this.config.maxConnectionsPerTenant) {
      throw new Error(`Maximum connections per tenant (${this.config.maxConnectionsPerTenant}) reached`);
    }

    const startTime = performance.now();

    try {
      // Create OpenAI Realtime client
      const realtimeConfig = createRealtimeConfig({
        voice: 'alloy',
        inputAudioFormat: 'pcm16',
        outputAudioFormat: 'pcm16'
      });

      const client = new OpenAIRealtimeClient(realtimeConfig);
      await client.connect();

      const connectionLatency = performance.now() - startTime;
      const connectionId = `${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const connection: PooledConnection = {
        client,
        tenantId,
        sessionId,
        createdAt: new Date(),
        lastUsed: new Date(),
        useCount: 1,
        isHealthy: true,
        isInUse: true,
        connectionLatency,
        healthCheckCount: 0
      };

      // Store connection
      this.connections.set(connectionId, connection);

      // Update tenant tracking
      let tenantConnections = this.tenantConnections.get(tenantId);
      if (!tenantConnections) {
        tenantConnections = new Set();
        this.tenantConnections.set(tenantId, tenantConnections);
      }
      tenantConnections.add(connectionId);

      // Setup connection event handlers
      this.setupConnectionEventHandlers(connection, connectionId);

      // Update statistics
      this.stats.connectionsCreated++;
      this.updateStats();

      logger.info('Connection created successfully', {
        connectionId,
        tenantId,
        sessionId,
        connectionLatency
      });

      return connection;

    } catch (error) {
      const connectionLatency = performance.now() - startTime;
      logger.error('Failed to create connection', {
        tenantId,
        sessionId,
        error,
        connectionLatency
      });
      throw error;
    }
  }

  /**
   * Setup event handlers for a connection
   */
  private setupConnectionEventHandlers(connection: PooledConnection, connectionId: string): void {
    const client = connection.client;

    client.on('error', (error) => {
      logger.warn('Connection error detected', {
        connectionId,
        tenantId: connection.tenantId,
        error
      });

      connection.isHealthy = false;
      this.emit('connection_error', { connection, error });
    });

    client.on('disconnected', ({ code, reason }) => {
      logger.info('Connection disconnected', {
        connectionId,
        tenantId: connection.tenantId,
        code,
        reason
      });

      connection.isHealthy = false;
      this.removeConnection(connectionId);
    });

    client.on('reconnected', () => {
      logger.info('Connection reconnected', {
        connectionId,
        tenantId: connection.tenantId
      });

      connection.isHealthy = true;
      connection.lastUsed = new Date();
    });
  }

  /**
   * Update connection usage statistics
   */
  private updateConnectionUsage(connection: PooledConnection, sessionId?: string): void {
    connection.isInUse = true;
    connection.lastUsed = new Date();
    connection.useCount++;

    if (sessionId) {
      connection.sessionId = sessionId;
    }

    this.updateStats();
  }

  /**
   * Pre-warm connections for better performance
   */
  private async preWarmConnections(): Promise<void> {
    logger.info('Pre-warming connections', { count: this.config.preWarmConnections });

    const warmupPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.preWarmConnections; i++) {
      warmupPromises.push(
        this.createConnection(`warmup-tenant-${i}`)
          .then(connection => {
            // Release immediately for pool use
            this.releaseConnection(connection);
          })
          .catch(error => {
            logger.warn('Failed to pre-warm connection', { index: i, error });
          })
      );
    }

    await Promise.allSettled(warmupPromises);
    logger.info('Connection pre-warming completed');
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    logger.debug('Health check monitoring started', {
      interval: this.config.healthCheckInterval
    });
  }

  /**
   * Perform health checks on all connections
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];

    for (const [connectionId, connection] of this.connections) {
      if (!connection.isInUse && connection.isHealthy) {
        healthCheckPromises.push(this.checkConnectionHealth(connectionId, connection));
      }
    }

    await Promise.allSettled(healthCheckPromises);
    this.updateStats();
  }

  /**
   * Check health of a specific connection
   */
  private async checkConnectionHealth(connectionId: string, connection: PooledConnection): Promise<void> {
    try {
      const status = connection.client.getStatus();

      if (!status.isConnected) {
        logger.warn('Connection health check failed - not connected', {
          connectionId,
          tenantId: connection.tenantId
        });

        connection.isHealthy = false;
        this.stats.healthCheckFailure++;
        return;
      }

      connection.healthCheckCount++;
      this.stats.healthCheckSuccess++;

      logger.debug('Connection health check passed', {
        connectionId,
        tenantId: connection.tenantId,
        healthChecks: connection.healthCheckCount
      });

    } catch (error) {
      logger.error('Connection health check error', {
        connectionId,
        tenantId: connection.tenantId,
        error
      });

      connection.isHealthy = false;
      this.stats.healthCheckFailure++;
    }
  }

  /**
   * Start cleanup task for expired connections
   */
  private startCleanupTask(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredConnections();
    }, Math.min(this.config.connectionTTL, this.config.idleTimeout) / 2);

    logger.debug('Cleanup task started');
  }

  /**
   * Cleanup expired and idle connections
   */
  private async cleanupExpiredConnections(): Promise<void> {
    let cleanupCount = 0;

    for (const [connectionId, connection] of this.connections) {
      if (this.shouldCleanupConnection(connection)) {
        await this.removeConnection(connectionId);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      logger.info('Cleaned up expired connections', {
        cleanupCount,
        remainingConnections: this.connections.size
      });
    }

    this.updateStats();
  }

  /**
   * Check if connection should be cleaned up
   */
  private shouldCleanupConnection(connection: PooledConnection): boolean {
    if (connection.isInUse) {
      return false;
    }

    const now = Date.now();
    const age = now - connection.createdAt.getTime();
    const idleTime = now - connection.lastUsed.getTime();

    return (
      age > this.config.connectionTTL ||
      idleTime > this.config.idleTimeout ||
      !connection.isHealthy
    );
  }

  /**
   * Check if connection is expired
   */
  private isConnectionExpired(connection: PooledConnection): boolean {
    const now = Date.now();
    const age = now - connection.createdAt.getTime();
    return age > this.config.connectionTTL || !connection.isHealthy;
  }

  /**
   * Remove a connection from the pool
   */
  private async removeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Disconnect client
      await connection.client.disconnect();
    } catch (error) {
      logger.warn('Error disconnecting client during removal', {
        connectionId,
        error
      });
    }

    // Remove from tracking
    this.connections.delete(connectionId);

    const tenantConnections = this.tenantConnections.get(connection.tenantId);
    if (tenantConnections) {
      tenantConnections.delete(connectionId);
      if (tenantConnections.size === 0) {
        this.tenantConnections.delete(connection.tenantId);
      }
    }

    this.stats.connectionsDestroyed++;

    logger.debug('Connection removed', {
      connectionId,
      tenantId: connection.tenantId,
      useCount: connection.useCount
    });
  }

  /**
   * Update pool statistics
   */
  private updateStats(): void {
    this.stats.totalConnections = this.connections.size;
    this.stats.activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.isInUse).length;
    this.stats.idleConnections = this.stats.totalConnections - this.stats.activeConnections;

    // Update connections by tenant
    this.stats.connectionsByTenant.clear();
    for (const [tenantId, connectionIds] of this.tenantConnections) {
      this.stats.connectionsByTenant.set(tenantId, connectionIds.size);
    }

    // Calculate average connection latency
    const connections = Array.from(this.connections.values());
    if (connections.length > 0) {
      this.stats.avgConnectionLatency = connections
        .reduce((sum, conn) => sum + conn.connectionLatency, 0) / connections.length;
    }

    // Calculate reuse rate
    const totalUseCount = connections.reduce((sum, conn) => sum + conn.useCount, 0);
    this.stats.connectionReuseRate = this.stats.connectionsCreated > 0
      ? (totalUseCount - this.stats.connectionsCreated) / totalUseCount
      : 0;
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      ...this.stats,
      connectionsByTenant: new Map(this.stats.connectionsByTenant)
    };
  }

  /**
   * Get current pool configuration
   */
  getConfig(): ConnectionPoolConfig {
    return { ...this.config };
  }

  /**
   * Shutdown the connection pool gracefully
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Shutting down connection pool', {
      totalConnections: this.connections.size
    });

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Disconnect all connections
    const disconnectPromises: Promise<void>[] = [];

    for (const connectionId of this.connections.keys()) {
      disconnectPromises.push(this.removeConnection(connectionId));
    }

    await Promise.allSettled(disconnectPromises);

    this.connections.clear();
    this.tenantConnections.clear();

    logger.info('Connection pool shutdown completed');
    this.emit('shutdown');
  }
}

// Export singleton instance
export const realtimeConnectionPool = new RealtimeConnectionPool();

// Graceful shutdown on process exit
process.on('SIGTERM', () => {
  realtimeConnectionPool.shutdown().catch(error => {
    logger.error('Error during graceful shutdown', { error });
  });
});

process.on('SIGINT', () => {
  realtimeConnectionPool.shutdown().catch(error => {
    logger.error('Error during graceful shutdown', { error });
  });
});