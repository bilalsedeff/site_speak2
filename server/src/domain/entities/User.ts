import { z } from 'zod';
import type { UserRole } from '../../../shared/types';

/**
 * User domain entity
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public name: string,
    public readonly passwordHash: string,
    public readonly role: UserRole,
    public readonly tenantId: string,
    public preferences: Record<string, unknown>,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public readonly emailVerified: boolean = false,
    public lastLoginAt?: Date,
    public readonly isActive: boolean = true,
  ) {}

  /**
   * Update user information
   */
  update(updates: {
    name?: string;
    preferences?: Record<string, unknown>;
  }): User {
    return new User(
      this.id,
      this.email,
      updates.name ?? this.name,
      this.passwordHash,
      this.role,
      this.tenantId,
      updates.preferences ?? this.preferences,
      this.createdAt,
      new Date(), // updatedAt
      this.emailVerified,
      this.lastLoginAt,
      this.isActive,
    );
  }

  /**
   * Mark user as logged in
   */
  markLoggedIn(): User {
    return new User(
      this.id,
      this.email,
      this.name,
      this.passwordHash,
      this.role,
      this.tenantId,
      this.preferences,
      this.createdAt,
      new Date(),
      this.emailVerified,
      new Date(), // lastLoginAt
      this.isActive,
    );
  }

  /**
   * Verify email
   */
  verifyEmail(): User {
    return new User(
      this.id,
      this.email,
      this.name,
      this.passwordHash,
      this.role,
      this.tenantId,
      this.preferences,
      this.createdAt,
      new Date(),
      true, // emailVerified
      this.lastLoginAt,
      this.isActive,
    );
  }

  /**
   * Deactivate user
   */
  deactivate(): User {
    return new User(
      this.id,
      this.email,
      this.name,
      this.passwordHash,
      this.role,
      this.tenantId,
      this.preferences,
      this.createdAt,
      new Date(),
      this.emailVerified,
      this.lastLoginAt,
      false, // isActive
    );
  }

  /**
   * Check if user has permission
   */
  hasPermission(permission: string): boolean {
    // Role-based permissions
    const rolePermissions: Record<UserRole, string[]> = {
      owner: ['*'], // All permissions
      admin: [
        'sites.create',
        'sites.read',
        'sites.update',
        'sites.delete',
        'sites.publish',
        'users.read',
        'users.update',
        'analytics.read',
        'ai.use',
        'voice.use',
      ],
      editor: [
        'sites.create',
        'sites.read',
        'sites.update',
        'sites.publish',
        'analytics.read',
        'ai.use',
        'voice.use',
      ],
      viewer: [
        'sites.read',
        'analytics.read',
      ],
    };

    const userPermissions = rolePermissions[this.role];
    return userPermissions.includes('*') || userPermissions.includes(permission);
  }

  /**
   * Get display name
   */
  getDisplayName(): string {
    return this.name || this.email.split('@')[0];
  }

  /**
   * Convert to public representation
   */
  toPublic(): PublicUser {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      role: this.role,
      tenantId: this.tenantId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      emailVerified: this.emailVerified,
      lastLoginAt: this.lastLoginAt,
      preferences: this.preferences,
    };
  }
}

/**
 * Public user representation (without sensitive data)
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerified: boolean;
  lastLoginAt?: Date;
  preferences: Record<string, unknown>;
}

/**
 * User creation data
 */
export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  tenantId: string;
  preferences?: Record<string, unknown>;
}

/**
 * User update data
 */
export interface UpdateUserData {
  name?: string;
  preferences?: Record<string, unknown>;
}

/**
 * Validation schemas
 */
export const CreateUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(100),
  passwordHash: z.string().min(1),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
  tenantId: z.string().uuid(),
  preferences: z.record(z.unknown()).optional().default({}),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  preferences: z.record(z.unknown()).optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;