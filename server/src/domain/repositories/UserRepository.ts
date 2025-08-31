import { User, CreateUserData, UpdateUserData } from '../entities/User';

/**
 * User repository interface
 */
export interface UserRepository {
  /**
   * Find user by ID
   */
  findById(id: string): Promise<User | null>;

  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find users by tenant ID
   */
  findByTenantId(tenantId: string): Promise<User[]>;

  /**
   * Create new user
   */
  create(data: CreateUserData): Promise<User>;

  /**
   * Update user
   */
  update(id: string, updates: UpdateUserData): Promise<User | null>;

  /**
   * Delete user
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if email exists
   */
  emailExists(email: string): Promise<boolean>;

  /**
   * Update password hash
   */
  updatePasswordHash(id: string, passwordHash: string): Promise<boolean>;

  /**
   * Update last login timestamp
   */
  updateLastLogin(id: string): Promise<boolean>;

  /**
   * Verify email
   */
  verifyEmail(id: string): Promise<boolean>;

  /**
   * Activate/deactivate user
   */
  setActiveStatus(id: string, isActive: boolean): Promise<boolean>;

  /**
   * Find users with pagination
   */
  findMany(options: {
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
  }>;

  /**
   * Count users by tenant
   */
  countByTenant(tenantId: string): Promise<number>;

  /**
   * Find users by role
   */
  findByRole(role: string, tenantId?: string): Promise<User[]>;

  /**
   * Search users by name or email
   */
  search(query: string, tenantId?: string): Promise<User[]>;

  /**
   * Bulk create users
   */
  createMany(users: CreateUserData[]): Promise<User[]>;

  /**
   * Get user statistics
   */
  getStatistics(tenantId?: string): Promise<{
    total: number;
    active: number;
    byRole: Record<string, number>;
    recentLogins: number;
    verified: number;
  }>;
}

/**
 * User repository errors
 */
export class UserNotFoundError extends Error {
  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
    this.name = 'UserNotFoundError';
  }
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email already exists: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}

export class UserCreateError extends Error {
  constructor(reason: string) {
    super(`Failed to create user: ${reason}`);
    this.name = 'UserCreateError';
  }
}

export class UserUpdateError extends Error {
  constructor(reason: string) {
    super(`Failed to update user: ${reason}`);
    this.name = 'UserUpdateError';
  }
}