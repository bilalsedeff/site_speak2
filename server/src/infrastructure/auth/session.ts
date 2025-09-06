
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
 * In-memory session store for development
 * TODO: Replace with Redis-backed store for production
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
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    };

    this.sessions.set(session.id, session);
    
    // Track user sessions
    if (!this.userSessions.has(data.userId)) {
      this.userSessions.set(data.userId, new Set());
    }
    this.userSessions.get(data.userId)!.add(session.id);

    logger.info('Session created', {
      sessionId: session.id,
      userId: data.userId,
      tenantId: data.tenantId,
    });

    return session;
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    return session && session.isActive ? session : null;
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {return null;}

    const updatedSession = { ...session, ...updates };
    this.sessions.set(sessionId, updatedSession);
    
    logger.debug('Session updated', {
      sessionId,
      updates: Object.keys(updates),
    });

    return updatedSession;
  }

  async delete(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {return false;}

    this.sessions.delete(sessionId);
    
    // Remove from user sessions
    const userSessionIds = this.userSessions.get(session.userId);
    if (userSessionIds) {
      userSessionIds.delete(sessionId);
      if (userSessionIds.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    logger.info('Session deleted', {
      sessionId,
      userId: session.userId,
    });

    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {return 0;}

    let count = 0;
    for (const sessionId of sessionIds) {
      if (this.sessions.delete(sessionId)) {
        count++;
      }
    }

    this.userSessions.delete(userId);

    logger.info('All user sessions deleted', {
      userId,
      count,
    });

    return count;
  }

  async updateActivity(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {return false;}

    session.lastActivityAt = new Date();
    this.sessions.set(sessionId, session);
    
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
 * Redis-backed session store for production
 * TODO: Implement when Redis integration is added
 */
export class RedisSessionStore implements SessionStore {
  private readonly SESSION_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private readonly SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

  constructor(private redisClient: RedisClientType) {}

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
      ...(data.metadata !== undefined && { metadata: data.metadata }),
    };

    const sessionKey = `${this.SESSION_PREFIX}${session.id}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${data.userId}`;

    // Store session data
    await this.redisClient.hSet(sessionKey, {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      isActive: session.isActive.toString(),
      metadata: session.metadata ? JSON.stringify(session.metadata) : '',
    });

    // Set TTL for session
    await this.redisClient.expire(sessionKey, this.SESSION_TTL);

    // Add session to user's active sessions set
    await this.redisClient.sAdd(userSessionsKey, session.id);
    await this.redisClient.expire(userSessionsKey, this.SESSION_TTL);

    logger.info('Redis session created', {
      sessionId: session.id,
      userId: data.userId,
      tenantId: data.tenantId,
    });

    return session;
  }

  async get(sessionId: string): Promise<UserSession | null> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const sessionData = await this.redisClient.hGetAll(sessionKey);

    if (!sessionData['id'] || sessionData['isActive'] !== 'true') {
      return null;
    }

    const session: UserSession = {
      id: sessionData['id']!,
      userId: sessionData['userId']!,
      tenantId: sessionData['tenantId']!,
      createdAt: new Date(sessionData['createdAt']!),
      lastActivityAt: new Date(sessionData['lastActivityAt']!),
      ipAddress: sessionData['ipAddress']!,
      userAgent: sessionData['userAgent']!,
      isActive: sessionData['isActive'] === 'true',
      metadata: sessionData['metadata'] ? JSON.parse(sessionData['metadata']) : undefined,
    };

    return session;
  }

  async update(sessionId: string, updates: Partial<UserSession>): Promise<UserSession | null> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const existingSession = await this.get(sessionId);
    
    if (!existingSession) {
      return null;
    }

    const updatedSession = { ...existingSession, ...updates };
    
    // Update Redis hash with new values
    const updateData: Record<string, string> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        if (value instanceof Date) {
          updateData[key] = value.toISOString();
        } else if (typeof value === 'object') {
          updateData[key] = JSON.stringify(value);
        } else {
          updateData[key] = value.toString();
        }
      }
    });

    if (Object.keys(updateData).length > 0) {
      await this.redisClient.hSet(sessionKey, updateData);
    }

    logger.debug('Redis session updated', {
      sessionId,
      updates: Object.keys(updates),
    });

    return updatedSession;
  }

  async delete(sessionId: string): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session) {
      return false;
    }

    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${session.userId}`;

    // Remove session data
    await this.redisClient.del(sessionKey);
    
    // Remove from user's active sessions
    await this.redisClient.sRem(userSessionsKey, sessionId);

    logger.info('Redis session deleted', {
      sessionId,
      userId: session.userId,
    });

    return true;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const sessionIds = await this.redisClient.sMembers(userSessionsKey);

    if (sessionIds.length === 0) {
      return 0;
    }

    let count = 0;
    for (const sessionId of sessionIds) {
      const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
      const deleted = await this.redisClient.del(sessionKey);
      if (deleted > 0) {
        count++;
      }
    }

    // Clear user's sessions set
    await this.redisClient.del(userSessionsKey);

    logger.info('All Redis user sessions deleted', {
      userId,
      count,
    });

    return count;
  }

  async updateActivity(sessionId: string): Promise<boolean> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const exists = await this.redisClient.exists(sessionKey);
    
    if (!exists) {
      return false;
    }

    await this.redisClient.hSet(sessionKey, {
      lastActivityAt: new Date().toISOString(),
    });

    // Refresh TTL
    await this.redisClient.expire(sessionKey, this.SESSION_TTL);

    return true;
  }

  async cleanup(): Promise<number> {
    // Redis handles TTL automatically, but we can clean up orphaned user session sets
    const userSessionsPattern = `${this.USER_SESSIONS_PREFIX}*`;
    const userSessionKeys = [];
    
    // Scan for all user session keys
    let cursor = '0';
    do {
      const result = await this.redisClient.scan(cursor, {
        MATCH: userSessionsPattern,
        COUNT: 100,
      });
      cursor = result.cursor.toString();
      userSessionKeys.push(...result.keys);
    } while (cursor !== '0');

    let cleanedCount = 0;

    for (const userSessionKey of userSessionKeys) {
      const sessionIds = await this.redisClient.sMembers(userSessionKey);
      const validSessionIds = [];

      for (const sessionId of sessionIds) {
        const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
        const exists = await this.redisClient.exists(sessionKey);
        if (exists) {
          validSessionIds.push(sessionId);
        } else {
          cleanedCount++;
        }
      }

      // Update user sessions set with only valid sessions
      if (validSessionIds.length !== sessionIds.length) {
        await this.redisClient.del(userSessionKey);
        if (validSessionIds.length > 0) {
          await this.redisClient.sAdd(userSessionKey, validSessionIds);
          await this.redisClient.expire(userSessionKey, this.SESSION_TTL);
        }
      }
    }

    if (cleanedCount > 0) {
      logger.info('Redis session cleanup completed', { cleanedCount });
    }

    return cleanedCount;
  }

  async getActiveSessions(userId: string): Promise<UserSession[]> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const sessionIds = await this.redisClient.sMembers(userSessionsKey);
    const sessions: UserSession[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.get(sessionId);
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

// Export singleton instance
export const sessionManager = new SessionManager();