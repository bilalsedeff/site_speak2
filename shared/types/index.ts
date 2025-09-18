/**
 * Shared type definitions for SiteSpeak
 * Re-exports all types from individual type modules and schemas
 */

// Export all types from each module
export * from './common.types';
export * from './user.types';
export * from './site.types';
export * from './ai.types';
export * from './voice.types';
export * from './confirmation';
export * from './error-recovery.types';
export * from './barge-in.types';
export * from './suggestion.types';
export * from './intent.types';
export * from './core-engine.types';

// Export schemas separately to avoid naming conflicts
export * as schemas from '../schemas';