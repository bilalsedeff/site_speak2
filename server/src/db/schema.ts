/**
 * Main database schema file for Drizzle ORM
 * 
 * Re-exports all schema definitions from the infrastructure layer
 * to maintain clean hexagonal architecture while satisfying Drizzle's
 * expectations for a single schema entry point.
 */

// Re-export all schema definitions
export * from '../infrastructure/database/schema';