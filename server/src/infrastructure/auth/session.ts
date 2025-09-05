
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
  // TODO: Implement Redis client integration for production session storage
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(private _redisClient: RedisClientType) {
    // TODO: Implement Redis session store
    // TODO: Use _redisClient for Redis operations
  }

  async create(_data: CreateSessionRequest): Promise<UserSession> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async get(_sessionId: string): Promise<UserSession | null> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async update(_sessionId: string, _updates: Partial<UserSession>): Promise<UserSession | null> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async delete(_sessionId: string): Promise<boolean> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async deleteByUserId(_userId: string): Promise<number> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async updateActivity(_sessionId: string): Promise<boolean> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async cleanup(): Promise<number> {
    throw new Error('RedisSessionStore not implemented yet');
  }

  async getActiveSessions(_userId: string): Promise<UserSession[]> {
    throw new Error('RedisSessionStore not implemented yet');
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