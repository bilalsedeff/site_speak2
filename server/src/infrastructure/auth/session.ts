import { randomUUID } from 'crypto';
import { createLogger } from '../../shared/utils.js';
import type { RedisClientType } from 'redis';

const logger = createLogger({ service: 'session' });

export interface UserSession {
  id: string;
  userId: string;
  tenantId: string;
  createdAt: Date;
  lastActivityAt: Date;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionRequest {
  userId: string;
  tenantId: string;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

export interface SessionStore {
  create(data: CreateSessionRequest): Promise<UserSession>;
  get(sessionId: string): Promise<UserSession | null>;
  update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null>;
  delete(sessionId: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
  updateActivity(sessionId: string): Promise<boolean>;
  cleanup(): Promise<number>;
  getActiveSessions(userId: string): Promise<UserSession[]>;
}

/**
 * Redis-backed session store for production
 */
export class RedisSessionStore implements SessionStore {
  private redisClient: RedisClientType;
  private keyPrefix = 'session:';
  private userKeyPrefix = 'user_sessions:';
  private sessionTTL = 7 * 24 * 60 * 60; // 7 days in seconds

  constructor(redisClient: RedisClientType) {
    this.redisClient = redisClient;
  }

  async create(data: CreateSessionRequest): Promise<UserSession> {
    const session: UserSession = {
      id: randomUUID(),
      userId: data.userId,
      tenantId: data.tenantId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      isActive: true,
      metadata: data.metadata || {},
    };

    try {
      // Store session data
      const sessionKey = this.keyPrefix + session.id;
      const userSessionsKey = this.userKeyPrefix + data.userId;

      // Use pipeline for atomic operations
      const pipeline = this.redisClient.multi();
      pipeline.hSet(sessionKey, {
        id: session.id,
        userId: session.userId,
        tenantId: session.tenantId,
        createdAt: session.createdAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        isActive: session.isActive.toString(),
        metadata: JSON.stringify(session.metadata),
      });
      pipeline.expire(sessionKey, this.sessionTTL);
      pipeline.sAdd(userSessionsKey, session.id);
      pipeline.expire(userSessionsKey, this.sessionTTL);

      await pipeline.exec();

      logger.info('Session created', {
        sessionId: session.id,
        userId: data.userId,
        tenantId: data.tenantId,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', { error, userId: data.userId });
      throw error;
    }
  }

  async get(sessionId: string): Promise<UserSession | null> {
    try {
      const sessionKey = this.keyPrefix + sessionId;
      const sessionData = await this.redisClient.hGetAll(sessionKey);

      if (!sessionData || Object.keys(sessionData).length === 0) {
        return null;
      }

      // Update last activity
      await this.updateActivity(sessionId);

      return {
        id: sessionData['id'] || '',
        userId: sessionData['userId'] || '',
        tenantId: sessionData['tenantId'] || '',
        createdAt: new Date(sessionData['createdAt'] || ''),
        lastActivityAt: new Date(sessionData['lastActivityAt'] || ''),
        ipAddress: sessionData['ipAddress'] || '',
        userAgent: sessionData['userAgent'] || '',
        isActive: sessionData['isActive'] === 'true',
        metadata: sessionData['metadata'] ? JSON.parse(sessionData['metadata']) : {},
      };
    } catch (error) {
      logger.error('Failed to get session', { error, sessionId });
      return null;
    }
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    try {
      const sessionKey = this.keyPrefix + sessionId;
      const exists = await this.redisClient.exists(sessionKey);
      
      if (!exists) {
        return null;
      }

      const updateData: Record<string, string> = {};
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'metadata') {
            updateData[key] = JSON.stringify(value);
          } else if (value instanceof Date) {
            updateData[key] = value.toISOString();
          } else if (typeof value === 'boolean') {
            updateData[key] = value.toString();
          } else {
            updateData[key] = String(value);
          }
        }
      });

      updateData['lastActivityAt'] = new Date().toISOString();

      await this.redisClient.hSet(sessionKey, updateData);
      await this.redisClient.expire(sessionKey, this.sessionTTL);

      logger.debug('Session updated', { sessionId, updates: Object.keys(updateData) });

      return await this.get(sessionId);
    } catch (error) {
      logger.error('Failed to update session', { error, sessionId });
      throw error;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.keyPrefix + sessionId;
      const sessionData = await this.redisClient.hGetAll(sessionKey);
      
      if (!sessionData || !sessionData['userId']) {
        return false;
      }

      const userId = sessionData['userId'];
      const userSessionsKey = this.userKeyPrefix + userId;

      // Remove from both session store and user sessions set
      const pipeline = this.redisClient.multi();
      pipeline.del(sessionKey);
      pipeline.sRem(userSessionsKey, sessionId);

      await pipeline.exec();

      logger.info('Session deleted', { sessionId, userId });
      return true;
    } catch (error) {
      logger.error('Failed to delete session', { error, sessionId });
      return false;
    }
  }

  async deleteByUserId(userId: string): Promise<number> {
    try {
      const userSessionsKey = this.userKeyPrefix + userId;
      const sessionIds = await this.redisClient.sMembers(userSessionsKey);
      
      if (sessionIds.length === 0) {
        return 0;
      }

      const pipeline = this.redisClient.multi();
      
      // Delete all session keys
      sessionIds.forEach(sessionId => {
        pipeline.del(this.keyPrefix + sessionId);
      });
      
      // Clear user sessions set
      pipeline.del(userSessionsKey);

      await pipeline.exec();

      logger.info('All user sessions deleted', { userId, count: sessionIds.length });
      return sessionIds.length;
    } catch (error) {
      logger.error('Failed to delete user sessions', { error, userId });
      return 0;
    }
  }

  async updateActivity(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = this.keyPrefix + sessionId;
      const exists = await this.redisClient.exists(sessionKey);
      
      if (!exists) {
        return false;
      }

      await this.redisClient.hSet(sessionKey, 'lastActivityAt', new Date().toISOString());
      await this.redisClient.expire(sessionKey, this.sessionTTL);

      return true;
    } catch (error) {
      logger.error('Failed to update session activity', { error, sessionId });
      return false;
    }
  }

  async cleanup(): Promise<number> {
    try {
      // Redis TTL handles cleanup automatically, but we can do manual cleanup if needed
      let deletedCount = 0;
      let cursor = '0';
      
      do {
        const result = await this.redisClient.scan(cursor, {
          MATCH: this.keyPrefix + '*',
          COUNT: 100,
        });
        
        cursor = result.cursor;
        const keys = result.keys;
        
        for (const key of keys) {
          const ttl = await this.redisClient.ttl(key);
          if (ttl === -1) { // Key exists but has no TTL
            await this.redisClient.expire(key, this.sessionTTL);
          } else if (ttl === -2) { // Key doesn't exist
            deletedCount++;
          }
        }
      } while (cursor !== '0');

      if (deletedCount > 0) {
        logger.info('Session cleanup completed', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup sessions', { error });
      return 0;
    }
  }

  async getActiveSessions(userId: string): Promise<UserSession[]> {
    try {
      const userSessionsKey = this.userKeyPrefix + userId;
      const sessionIds = await this.redisClient.sMembers(userSessionsKey);
      
      if (sessionIds.length === 0) {
        return [];
      }

      const sessions: UserSession[] = [];
      
      for (const sessionId of sessionIds) {
        const session = await this.get(sessionId);
        if (session && session.isActive) {
          sessions.push(session);
        }
      }

      return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    } catch (error) {
      logger.error('Failed to get active sessions', { error, userId });
      return [];
    }
  }
}

/**
 * In-memory session store for development
 */
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, UserSession>();
  private userSessions = new Map<string, Set<string>>();

  async create(data: CreateSessionRequest): Promise<UserSession> {
    const session: UserSession = {
      id: randomUUID(),
      userId: data.userId,
      tenantId: data.tenantId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      isActive: true,
      metadata: data.metadata || {},
    };

    this.sessions.set(session.id, session);

    // Track user sessions
    if (!this.userSessions.has(data.userId)) {
      this.userSessions.set(data.userId, new Set());
    }
    this.userSessions.get(data.userId)!.add(session.id);

    logger.info('In-memory session created', {
      sessionId: session.id,
      userId: data.userId,
      tenantId: data.tenantId,
    });

    return session;
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    return session || null;
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const updatedSession = {
      ...session,
      ...updates,
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    
    logger.debug('In-memory session updated', { sessionId });
    return updatedSession;
  }

  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const { userId } = session;
    
    this.sessions.delete(sessionId);
    
    // Remove from user sessions
    const userSessionSet = this.userSessions.get(userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
      if (userSessionSet.size === 0) {
        this.userSessions.delete(userId);
      }
    }

    logger.info('In-memory session deleted', { sessionId, userId });
    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds || sessionIds.size === 0) {
      return 0;
    }

    let count = 0;
    for (const sessionId of sessionIds) {
      if (this.sessions.delete(sessionId)) {
        count++;
      }
    }

    this.userSessions.delete(userId);

    logger.info('All in-memory user sessions deleted', { userId, count });
    return count;
  }

  async updateActivity(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.lastActivityAt = new Date();
    return true;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    let count = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now.getTime() - session.lastActivityAt.getTime();
      if (age > maxAge) {
        await this.delete(sessionId);
        count++;
      }
    }

    if (count > 0) {
      logger.info('Session cleanup completed', { count });
    }

    return count;
  }

  async getActiveSessions(userId: string): Promise<UserSession[]> {
    const sessionIds = this.userSessions.get(userId) || new Set();
    const sessions: UserSession[] = [];

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }
}

/**
 * Session manager service
 */
export class SessionManager {
  private store: SessionStore;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(store?: SessionStore) {
    this.store = store || new InMemorySessionStore();
    this.startCleanup();
  }

  private startCleanup(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.store.cleanup();
      } catch (error) {
        logger.error('Session cleanup failed', { error });
      }
    }, 60 * 60 * 1000);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async createSession(data: CreateSessionRequest): Promise<UserSession> {
    return this.store.create(data);
  }

  async getSession(sessionId: string): Promise<UserSession | null> {
    const session = await this.store.get(sessionId);
    
    if (session) {
      // Update last activity
      await this.store.updateActivity(sessionId);
    }

    return session;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }

  async deleteAllUserSessions(userId: string): Promise<number> {
    return this.store.deleteByUserId(userId);
  }

  async getActiveSessions(userId: string): Promise<UserSession[]> {
    return this.store.getActiveSessions(userId);
  }

  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    return this.store.update(sessionId, updates);
  }
}

/**
 * Create session manager with appropriate store based on environment
 */
function createSessionManager(): SessionManager {
  const redisUrl = process.env['REDIS_URL'];
  const nodeEnv = process.env['NODE_ENV'];
  
  if (nodeEnv === 'production' && redisUrl) {
    // In production with Redis URL, use Redis store
    const { createClient } = require('redis');
    const redisClient = createClient({ url: redisUrl });
    
    // Handle Redis connection
    redisClient.on('error', (err: Error) => {
      logger.error('Redis client error', { error: err });
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis session store connected');
    });
    
    // Connect to Redis
    redisClient.connect().catch((err: Error) => {
      logger.error('Failed to connect to Redis, falling back to in-memory store', { error: err });
      return new SessionManager(new InMemorySessionStore());
    });
    
    const redisStore = new RedisSessionStore(redisClient);
    logger.info('Using Redis session store for production');
    return new SessionManager(redisStore);
  } else {
    // Development or when Redis is not available
    logger.warn('Using in-memory session store', {
      nodeEnv,
      hasRedisUrl: !!redisUrl,
      reason: nodeEnv !== 'production' ? 'development environment' : 'Redis URL not configured'
    });
    return new SessionManager(new InMemorySessionStore());
  }
}

// Export singleton instance
export const sessionManager = createSessionManager();