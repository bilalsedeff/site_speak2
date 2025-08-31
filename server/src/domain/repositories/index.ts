/**
 * Domain Repositories
 * 
 * Repository interfaces defining data access contracts
 * for domain entities. These are implemented by the
 * infrastructure layer.
 */

export * from './UserRepository';
export * from './TenantRepository';
export * from './SiteRepository';

// Re-export main interfaces for convenience
export type { UserRepository } from './UserRepository';
export type { TenantRepository } from './TenantRepository';
export type { SiteRepository } from './SiteRepository';

// Export error classes
export {
  UserNotFoundError,
  EmailAlreadyExistsError,
  UserCreateError,
  UserUpdateError,
} from './UserRepository';

export {
  TenantNotFoundError,
  TenantNameExistsError,
  TenantCreateError,
  TenantUpdateError,
  TenantLimitExceededError,
} from './TenantRepository';

export {
  SiteNotFoundError,
  SubdomainExistsError,
  CustomDomainExistsError,
  SiteCreateError,
  SiteUpdateError,
  SitePublishError,
  SiteContentError,
} from './SiteRepository';