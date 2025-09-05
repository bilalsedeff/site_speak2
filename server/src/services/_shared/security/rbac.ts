/**
 * Role-Based Access Control (RBAC) - Permission management
 * 
 * Implements RBAC with role hierarchies, permission checking,
 * and decorators for route handlers.
 */

import { cfg } from '../config/index.js';
import { logger } from '../telemetry/logger.js';

/**
 * System permissions enum
 */
export enum Permission {
  // Site management
  SITE_CREATE = 'site:create',
  SITE_READ = 'site:read',
  SITE_UPDATE = 'site:update',
  SITE_DELETE = 'site:delete',
  SITE_PUBLISH = 'site:publish',
  
  // Knowledge base
  KB_READ = 'kb:read',
  KB_WRITE = 'kb:write',
  KB_MANAGE = 'kb:manage',
  KB_REINDEX = 'kb:reindex',
  
  // AI features
  AI_QUERY = 'ai:query',
  AI_TRAIN = 'ai:train',
  AI_CONFIG = 'ai:config',
  
  // Voice features
  VOICE_USE = 'voice:use',
  VOICE_CONFIG = 'voice:config',
  
  // Analytics
  ANALYTICS_READ = 'analytics:read',
  ANALYTICS_EXPORT = 'analytics:export',
  
  // User management
  USER_READ = 'user:read',
  USER_INVITE = 'user:invite',
  USER_MANAGE = 'user:manage',
  
  // Tenant management
  TENANT_READ = 'tenant:read',
  TENANT_UPDATE = 'tenant:update',
  TENANT_DELETE = 'tenant:delete',
  
  // System admin
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_MONITOR = 'system:monitor',
  SYSTEM_CONFIG = 'system:config',
}

/**
 * System roles enum
 */
export enum Role {
  SUPER_ADMIN = 'super_admin',
  TENANT_ADMIN = 'tenant_admin',
  SITE_OWNER = 'site_owner',
  SITE_EDITOR = 'site_editor',
  SITE_VIEWER = 'site_viewer',
  API_USER = 'api_user',
  GUEST = 'guest',
}

/**
 * Role definitions with permissions
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: [
    // All permissions
    ...Object.values(Permission),
  ],
  
  [Role.TENANT_ADMIN]: [
    // Full tenant access
    Permission.SITE_CREATE,
    Permission.SITE_READ,
    Permission.SITE_UPDATE,
    Permission.SITE_DELETE,
    Permission.SITE_PUBLISH,
    Permission.KB_READ,
    Permission.KB_WRITE,
    Permission.KB_MANAGE,
    Permission.KB_REINDEX,
    Permission.AI_QUERY,
    Permission.AI_TRAIN,
    Permission.AI_CONFIG,
    Permission.VOICE_USE,
    Permission.VOICE_CONFIG,
    Permission.ANALYTICS_READ,
    Permission.ANALYTICS_EXPORT,
    Permission.USER_READ,
    Permission.USER_INVITE,
    Permission.USER_MANAGE,
    Permission.TENANT_READ,
    Permission.TENANT_UPDATE,
  ],
  
  [Role.SITE_OWNER]: [
    // Site management
    Permission.SITE_READ,
    Permission.SITE_UPDATE,
    Permission.SITE_PUBLISH,
    Permission.KB_READ,
    Permission.KB_WRITE,
    Permission.KB_MANAGE,
    Permission.AI_QUERY,
    Permission.AI_TRAIN,
    Permission.VOICE_USE,
    Permission.VOICE_CONFIG,
    Permission.ANALYTICS_READ,
    Permission.USER_READ,
    Permission.USER_INVITE,
  ],
  
  [Role.SITE_EDITOR]: [
    // Content editing
    Permission.SITE_READ,
    Permission.SITE_UPDATE,
    Permission.KB_READ,
    Permission.KB_WRITE,
    Permission.AI_QUERY,
    Permission.VOICE_USE,
    Permission.ANALYTICS_READ,
  ],
  
  [Role.SITE_VIEWER]: [
    // Read-only access
    Permission.SITE_READ,
    Permission.KB_READ,
    Permission.AI_QUERY,
    Permission.VOICE_USE,
    Permission.ANALYTICS_READ,
  ],
  
  [Role.API_USER]: [
    // API access
    Permission.AI_QUERY,
    Permission.KB_READ,
    Permission.VOICE_USE,
  ],
  
  [Role.GUEST]: [
    // Very limited access
    Permission.AI_QUERY,
    Permission.VOICE_USE,
  ],
};

/**
 * Role hierarchy (higher roles inherit permissions from lower roles)
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [Role.SUPER_ADMIN]: [Role.TENANT_ADMIN],
  [Role.TENANT_ADMIN]: [Role.SITE_OWNER],
  [Role.SITE_OWNER]: [Role.SITE_EDITOR],
  [Role.SITE_EDITOR]: [Role.SITE_VIEWER],
  [Role.SITE_VIEWER]: [Role.API_USER],
  [Role.API_USER]: [Role.GUEST],
  [Role.GUEST]: [],
};

/**
 * User context for permission checking
 */
export interface UserContext {
  userId: string;
  tenantId: string;
  role: Role;
  permissions?: Permission[]; // Override permissions
  siteAccess?: Record<string, Role>; // Site-specific roles
}

/**
 * Permission check result
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  requiredPermission?: Permission;
  userRole?: Role;
}

/**
 * RBAC Service implementation
 */
export class RBACService {
  private permissionCache = new Map<string, boolean>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all permissions for a role (including inherited)
   */
  getRolePermissions(role: Role): Permission[] {
    const directPermissions = ROLE_PERMISSIONS[role] || [];
    const inheritedPermissions = this.getInheritedPermissions(role);
    
    return Array.from(new Set([...directPermissions, ...inheritedPermissions]));
  }

  /**
   * Get inherited permissions from role hierarchy
   */
  private getInheritedPermissions(role: Role): Permission[] {
    const inherited: Permission[] = [];
    const childRoles = ROLE_HIERARCHY[role] || [];
    
    for (const childRole of childRoles) {
      inherited.push(...ROLE_PERMISSIONS[childRole]);
      inherited.push(...this.getInheritedPermissions(childRole));
    }
    
    return inherited;
  }

  /**
   * Check if user has permission
   */
  hasPermission(
    user: UserContext,
    permission: Permission,
    resourceId?: string
  ): PermissionResult {
    // Cache key for performance
    const cacheKey = `${user.userId}:${permission}:${resourceId || 'global'}`;
    
    if (this.permissionCache.has(cacheKey)) {
      return { allowed: this.permissionCache.get(cacheKey)! };
    }

    let allowed = false;
    let reason: string | undefined;

    try {
      // Check if RBAC is enabled
      if (!cfg.RBAC_ENABLED) {
        allowed = true;
      } else {
        // Use override permissions if available
        const userPermissions = user.permissions || this.getRolePermissions(user.role);
        
        // Check direct permission
        if (userPermissions.includes(permission)) {
          allowed = true;
        }
        
        // Check site-specific permissions
        if (!allowed && resourceId && user.siteAccess) {
          const siteRole = user.siteAccess[resourceId];
          if (siteRole) {
            const sitePermissions = this.getRolePermissions(siteRole);
            allowed = sitePermissions.includes(permission);
          }
        }

        if (!allowed) {
          reason = `User role '${user.role}' does not have permission '${permission}'`;
        }
      }

      // Cache result
      this.permissionCache.set(cacheKey, allowed);
      setTimeout(() => {
        this.permissionCache.delete(cacheKey);
      }, this.cacheTimeout);

      return {
        allowed,
        reason: reason || (allowed ? 'Access granted' : 'Access denied'),
        requiredPermission: permission,
        userRole: user.role,
      };
    } catch (error) {
      logger.error('Permission check failed', {
        userId: user.userId,
        tenantId: user.tenantId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        allowed: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check multiple permissions (all must be satisfied)
   */
  hasAllPermissions(
    user: UserContext,
    permissions: Permission[],
    resourceId?: string
  ): PermissionResult {
    for (const permission of permissions) {
      const result = this.hasPermission(user, permission, resourceId);
      if (!result.allowed) {
        return result;
      }
    }

    return { allowed: true };
  }

  /**
   * Check multiple permissions (any can be satisfied)
   */
  hasAnyPermission(
    user: UserContext,
    permissions: Permission[],
    resourceId?: string
  ): PermissionResult {
    const results: PermissionResult[] = [];

    for (const permission of permissions) {
      const result = this.hasPermission(user, permission, resourceId);
      if (result.allowed) {
        return result;
      }
      results.push(result);
    }

    return {
      allowed: false,
      reason: `None of the required permissions satisfied: ${permissions.join(', ')}`,
    };
  }

  /**
   * Filter resources based on permissions
   */
  filterResources<T extends { id: string }>(
    user: UserContext,
    resources: T[],
    permission: Permission
  ): T[] {
    return resources.filter(resource => 
      this.hasPermission(user, permission, resource.id).allowed
    );
  }

  /**
   * Clear permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
  }

  /**
   * Get user's effective permissions
   */
  getUserPermissions(user: UserContext): Permission[] {
    if (user.permissions) {
      return user.permissions;
    }
    
    return this.getRolePermissions(user.role);
  }

  /**
   * Check if role is higher in hierarchy
   */
  isRoleHigher(role1: Role, role2: Role): boolean {
    const role1Permissions = this.getRolePermissions(role1);
    const role2Permissions = this.getRolePermissions(role2);
    
    // Simple check: role with more permissions is considered higher
    return role1Permissions.length > role2Permissions.length;
  }

  /**
   * Get minimum role required for permission
   */
  getMinimumRoleForPermission(permission: Permission): Role | null {
    const rolesWithPermission = Object.entries(ROLE_PERMISSIONS)
      .filter(([, permissions]) => permissions.includes(permission))
      .map(([role]) => role as Role);

    if (rolesWithPermission.length === 0) {
      return null;
    }

    // Return the "lowest" role that has the permission
    return rolesWithPermission.reduce((min, current) => {
      const minPerms = this.getRolePermissions(min);
      const currentPerms = this.getRolePermissions(current);
      return currentPerms.length < minPerms.length ? current : min;
    });
  }
}

/**
 * Global RBAC service instance
 */
export const rbacService = new RBACService();

/**
 * Express middleware for permission checking
 */
export function requirePermission(
  permission: Permission | Permission[],
  options: {
    resourceIdParam?: string; // Extract resource ID from req.params
    resourceIdHeader?: string; // Extract resource ID from headers
    mode?: 'all' | 'any'; // For multiple permissions
  } = {}
) {
  return (req: any, res: any, next: any) => {
    // Extract user context from request (set by auth middleware)
    const user: UserContext = req.user;
    
    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Extract resource ID if specified
    let resourceId: string | undefined;
    if (options.resourceIdParam) {
      resourceId = req.params[options.resourceIdParam];
    } else if (options.resourceIdHeader) {
      resourceId = req.headers[options.resourceIdHeader];
    }

    // Check permissions
    let result: PermissionResult;
    
    if (Array.isArray(permission)) {
      const mode = options.mode || 'all';
      result = mode === 'all' 
        ? rbacService.hasAllPermissions(user, permission, resourceId)
        : rbacService.hasAnyPermission(user, permission, resourceId);
    } else {
      result = rbacService.hasPermission(user, permission, resourceId);
    }

    if (!result.allowed) {
      logger.warn('Permission denied', {
        userId: user.userId,
        tenantId: user.tenantId,
        requiredPermission: permission,
        reason: result.reason,
        resourceId,
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        details: result.reason,
        requiredPermission: result.requiredPermission,
      });
    }

    next();
  };
}

/**
 * Decorator for class methods (TypeScript decorator)
 */
export function RequirePermission(permission: Permission | Permission[]) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: any, ...args: any[]) {
      // Assume first argument contains user context
      const context = args[0];
      const user: UserContext = context?.user;

      if (!user) {
        throw new Error('User context required for permission check');
      }

      // Check permission
      let result: PermissionResult;
      if (Array.isArray(permission)) {
        result = rbacService.hasAllPermissions(user, permission);
      } else {
        result = rbacService.hasPermission(user, permission);
      }

      if (!result.allowed) {
        throw new Error(`Permission denied: ${result.reason}`);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Type guard for user role
 */
export function isRole(user: UserContext, role: Role): boolean {
  return user.role === role;
}

/**
 * Type guard for minimum role
 */
export function hasMinimumRole(user: UserContext, minimumRole: Role): boolean {
  const userPermissions = rbacService.getRolePermissions(user.role);
  const requiredPermissions = rbacService.getRolePermissions(minimumRole);
  
  return requiredPermissions.every(perm => userPermissions.includes(perm));
}

// Types already exported as interfaces above
export { Role as UserRole, Permission as UserPermission };