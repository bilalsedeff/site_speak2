import { eq, and, ilike, desc, asc, count, isNull, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import bcrypt from 'bcryptjs';
import { 
  User, 
  CreateUserData, 
  UpdateUserData,
} from '../../domain/entities/User';
import { 
  UserRepository,
  EmailAlreadyExistsError,
  UserCreateError,
  UserUpdateError,
} from '../../domain/repositories/UserRepository';
import { users, userPreferences } from '../database/schema/users';
import { createLogger } from '../../shared/utils.js';

const logger = createLogger({ service: 'user-repository' });

/**
 * Production-ready UserRepository implementation using Drizzle ORM
 * Supports full CRUD operations with proper error handling and logging
 */
export class UserRepositoryImpl implements UserRepository {
  constructor(private db: PostgresJsDatabase<any>) {}

  async findById(id: string): Promise<User | null> {
    try {
      const [userRow] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);

      if (!userRow) {
        return null;
      }

      return this.mapToUser(userRow);
    } catch (error) {
      logger.error('Failed to find user by ID', { id, error });
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      const [userRow] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
        .limit(1);

      if (!userRow) {
        return null;
      }

      return this.mapToUser(userRow);
    } catch (error) {
      logger.error('Failed to find user by email', { email, error });
      throw error;
    }
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    try {
      const userRows = await this.db
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)))
        .orderBy(asc(users.createdAt));

      return userRows.map(row => this.mapToUser(row));
    } catch (error) {
      logger.error('Failed to find users by tenant ID', { tenantId, error });
      throw error;
    }
  }

  async create(data: CreateUserData): Promise<User> {
    try {
      // Check if email already exists
      if (await this.emailExists(data.email)) {
        throw new EmailAlreadyExistsError(data.email);
      }

      const normalizedEmail = data.email.toLowerCase().trim();
      const normalizedName = data.name.trim();

      const [newUser] = await this.db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: normalizedName,
          passwordHash: data.passwordHash,
          role: data.role,
          tenantId: data.tenantId,
          preferences: data.preferences || {},
          status: 'active',
        })
        .returning();

      if (!newUser) {
        throw new UserCreateError('Failed to insert user record');
      }

      // Create default preferences
      await this.db
        .insert(userPreferences)
        .values({
          userId: newUser.id,
          language: 'en',
          timezone: 'UTC',
          theme: 'system',
        })
        .onConflictDoNothing();

      logger.info('User created successfully', {
        userId: newUser.id,
        email: normalizedEmail,
        tenantId: data.tenantId,
      });

      return this.mapToUser(newUser);
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        throw error;
      }
      
      logger.error('Failed to create user', { 
        email: data.email, 
        tenantId: data.tenantId, 
        error 
      });
      
      throw new UserCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async update(id: string, updates: UpdateUserData): Promise<User | null> {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: sql`NOW()`,
      };

      if (updates.name !== undefined) {
        updateData['name'] = updates.name.trim();
      }

      if (updates.preferences !== undefined) {
        updateData['preferences'] = updates.preferences;
      }

      const [updatedUser] = await this.db
        .update(users)
        .set(updateData)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();

      if (!updatedUser) {
        logger.warn('User not found for update', { id });
        return null;
      }

      logger.info('User updated successfully', {
        userId: id,
        updates: Object.keys(updates),
      });

      return this.mapToUser(updatedUser);
    } catch (error) {
      logger.error('Failed to update user', { id, updates, error });
      throw new UserUpdateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      // Soft delete by setting deletedAt timestamp
      const [deletedUser] = await this.db
        .update(users)
        .set({
          deletedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      const success = !!deletedUser;
      
      if (success) {
        logger.info('User deleted successfully', { userId: id });
      } else {
        logger.warn('User not found for deletion', { id });
      }

      return success;
    } catch (error) {
      logger.error('Failed to delete user', { id, error });
      throw error;
    }
  }

  async emailExists(email: string): Promise<boolean> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      const [result] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
        .limit(1);

      return (result?.count || 0) > 0;
    } catch (error) {
      logger.error('Failed to check email existence', { email, error });
      throw error;
    }
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<boolean> {
    try {
      const [updatedUser] = await this.db
        .update(users)
        .set({
          passwordHash,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      const success = !!updatedUser;
      
      if (success) {
        logger.info('Password updated successfully', { userId: id });
      } else {
        logger.warn('User not found for password update', { id });
      }

      return success;
    } catch (error) {
      logger.error('Failed to update password', { id, error });
      throw error;
    }
  }

  async updateLastLogin(id: string): Promise<boolean> {
    try {
      const [updatedUser] = await this.db
        .update(users)
        .set({
          lastLoginAt: sql`NOW()`,
          loginCount: sql`COALESCE(${users.loginCount}, 0) + 1`,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      return !!updatedUser;
    } catch (error) {
      logger.error('Failed to update last login', { id, error });
      throw error;
    }
  }

  async verifyEmail(id: string): Promise<boolean> {
    try {
      const [updatedUser] = await this.db
        .update(users)
        .set({
          emailVerifiedAt: sql`NOW()`,
          emailVerificationToken: null,
          status: 'active',
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      const success = !!updatedUser;
      
      if (success) {
        logger.info('Email verified successfully', { userId: id });
      }

      return success;
    } catch (error) {
      logger.error('Failed to verify email', { id, error });
      throw error;
    }
  }

  async setActiveStatus(id: string, isActive: boolean): Promise<boolean> {
    try {
      const status = isActive ? 'active' : 'inactive';
      
      const [updatedUser] = await this.db
        .update(users)
        .set({
          status,
          updatedAt: sql`NOW()`,
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      const success = !!updatedUser;
      
      if (success) {
        logger.info('User status updated', { userId: id, status });
      }

      return success;
    } catch (error) {
      logger.error('Failed to update user status', { id, isActive, error });
      throw error;
    }
  }

  async findMany(options: {
    tenantId?: string;
    role?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        tenantId,
        role,
        isActive,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const offset = (page - 1) * limit;
      const conditions = [isNull(users.deletedAt)];

      if (tenantId) {
        conditions.push(eq(users.tenantId, tenantId));
      }

      if (role) {
        conditions.push(eq(users.role, role));
      }

      if (isActive !== undefined) {
        const status = isActive ? 'active' : 'inactive';
        conditions.push(eq(users.status, status));
      }

      const whereCondition = and(...conditions);

      // Get total count
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(whereCondition);

      const total = totalResult?.count || 0;

      // Get paginated results
      const orderBy = sortOrder === 'asc' ? asc : desc;
      const sortColumn = users[sortBy as keyof typeof users] || users.createdAt;

      const userRows = await this.db
        .select()
        .from(users)
        .where(whereCondition)
        .orderBy(orderBy(sortColumn as any))
        .limit(limit)
        .offset(offset);

      const mappedUsers = userRows.map(row => this.mapToUser(row));
      const totalPages = Math.ceil(total / limit);

      return {
        users: mappedUsers,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Failed to find users with pagination', { options, error });
      throw error;
    }
  }

  async countByTenant(tenantId: string): Promise<number> {
    try {
      const [result] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)));

      return result?.count || 0;
    } catch (error) {
      logger.error('Failed to count users by tenant', { tenantId, error });
      throw error;
    }
  }

  async findByRole(role: string, tenantId?: string): Promise<User[]> {
    try {
      const conditions = [
        eq(users.role, role),
        isNull(users.deletedAt),
      ];

      if (tenantId) {
        conditions.push(eq(users.tenantId, tenantId));
      }

      const userRows = await this.db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(asc(users.name));

      return userRows.map(row => this.mapToUser(row));
    } catch (error) {
      logger.error('Failed to find users by role', { role, tenantId, error });
      throw error;
    }
  }

  async search(query: string, tenantId?: string): Promise<User[]> {
    try {
      const searchTerm = `%${query.trim()}%`;
      const conditions = [
        isNull(users.deletedAt),
        sql`(${ilike(users.name, searchTerm)} OR ${ilike(users.email, searchTerm)})`,
      ];

      if (tenantId) {
        conditions.push(eq(users.tenantId, tenantId));
      }

      const userRows = await this.db
        .select()
        .from(users)
        .where(and(...conditions))
        .orderBy(asc(users.name))
        .limit(50); // Limit search results

      return userRows.map(row => this.mapToUser(row));
    } catch (error) {
      logger.error('Failed to search users', { query, tenantId, error });
      throw error;
    }
  }

  async createMany(usersData: CreateUserData[]): Promise<User[]> {
    try {
      if (usersData.length === 0) {
        return [];
      }

      // Check for duplicate emails
      const emails = usersData.map(u => u.email.toLowerCase().trim());
      const duplicateEmails = await this.db
        .select({ email: users.email })
        .from(users)
        .where(and(sql`${users.email} IN ${emails}`, isNull(users.deletedAt)));

      if (duplicateEmails.length > 0) {
        throw new EmailAlreadyExistsError(`Duplicate emails found: ${duplicateEmails.map(d => d.email).join(', ')}`);
      }

      const insertData = usersData.map(data => ({
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        passwordHash: data.passwordHash,
        role: data.role,
        tenantId: data.tenantId,
        preferences: data.preferences || {},
        status: 'active' as const,
      }));

      const newUsers = await this.db
        .insert(users)
        .values(insertData)
        .returning();

      logger.info('Bulk user creation completed', {
        count: newUsers.length,
        tenantIds: [...new Set(usersData.map(u => u.tenantId))],
      });

      return newUsers.map(row => this.mapToUser(row));
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        throw error;
      }
      
      logger.error('Failed to create users in bulk', { 
        count: usersData.length, 
        error 
      });
      
      throw new UserCreateError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async getStatistics(tenantId?: string): Promise<{
    total: number;
    active: number;
    byRole: Record<string, number>;
    recentLogins: number;
    verified: number;
  }> {
    try {
      const conditions = [isNull(users.deletedAt)];
      if (tenantId) {
        conditions.push(eq(users.tenantId, tenantId));
      }

      const whereCondition = and(...conditions);

      // Get basic counts
      const [totalResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(whereCondition);

      const [activeResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(whereCondition, eq(users.status, 'active')));

      const [verifiedResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(whereCondition, sql`${users.emailVerifiedAt} IS NOT NULL`));

      const [recentLoginsResult] = await this.db
        .select({ count: count() })
        .from(users)
        .where(and(
          whereCondition,
          sql`${users.lastLoginAt} >= NOW() - INTERVAL '7 days'`
        ));

      // Get role counts
      const roleCountsResult = await this.db
        .select({
          role: users.role,
          count: count(),
        })
        .from(users)
        .where(whereCondition)
        .groupBy(users.role);

      const byRole: Record<string, number> = {};
      roleCountsResult.forEach(result => {
        byRole[result.role] = result.count;
      });

      return {
        total: totalResult?.count || 0,
        active: activeResult?.count || 0,
        byRole,
        recentLogins: recentLoginsResult?.count || 0,
        verified: verifiedResult?.count || 0,
      };
    } catch (error) {
      logger.error('Failed to get user statistics', { tenantId, error });
      throw error;
    }
  }

  /**
   * Map database row to User domain entity
   */
  private mapToUser(row: typeof users.$inferSelect): User {
    return new User(
      row.id,
      row.email,
      row.name,
      row.passwordHash || '', // Handle null passwordHash for OAuth users
      row.role as User['role'],
      row.tenantId,
      (row.preferences as Record<string, unknown>) || {},
      row.createdAt,
      row.updatedAt,
      !!row.emailVerifiedAt,
      row.lastLoginAt || undefined,
      row.status === 'active'
    );
  }

  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}