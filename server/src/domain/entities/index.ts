/**
 * Domain Entities
 * 
 * Core business entities that represent the fundamental
 * concepts in the SiteSpeak domain.
 */

export * from './User';
export * from './Tenant';
export * from './Site';

// Re-export main entity classes
export { User } from './User';
export { Tenant } from './Tenant';
export { Site } from './Site';

// Export type definitions
export type { 
  PublicUser, 
  CreateUserData, 
  UpdateUserData,
  CreateUserInput,
  UpdateUserInput,
} from './User';

export type { 
  TenantLimits, 
  TenantSettings, 
  TenantUsage,
  CreateTenantData,
  CreateTenantInput,
  UpdateTenantInput,
} from './Tenant';

export type { 
  SiteConfiguration,
  SiteContent,
  SitePage,
  SiteComponent,
  SiteAsset,
  CreateSiteData,
  CreateSiteInput,
  UpdateSiteInput,
} from './Site';

// Export validation schemas
export { 
  CreateUserSchema, 
  UpdateUserSchema,
} from './User';

export { 
  CreateTenantSchema, 
  UpdateTenantSchema,
} from './Tenant';

export { 
  CreateSiteSchema, 
  UpdateSiteSchema,
  getDefaultSiteConfiguration,
} from './Site';