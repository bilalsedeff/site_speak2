/**
 * Infrastructure Repositories
 * 
 * Repository implementations for data access layer
 */

import { KnowledgeBaseRepositoryImpl } from './KnowledgeBaseRepositoryImpl';

// Export singleton instance
export const knowledgeBaseRepository = new KnowledgeBaseRepositoryImpl();
export { TenantRepositoryImpl as tenantRepository } from './TenantRepositoryImpl';
export { UserRepositoryImpl as userRepository } from './UserRepositoryImpl';
export { SiteContractRepositoryImpl as siteContractRepository } from './SiteContractRepositoryImpl';

// Export types
export type { KnowledgeBaseRepositoryImpl } from './KnowledgeBaseRepositoryImpl';
export type { TenantRepositoryImpl } from './TenantRepositoryImpl';
export type { UserRepositoryImpl } from './UserRepositoryImpl';
export type { SiteContractRepositoryImpl } from './SiteContractRepositoryImpl';