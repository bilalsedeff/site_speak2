/**
 * Infrastructure Middleware
 * 
 * Common middleware functions used across the application
 */

export * from './validation';

// Re-export commonly used items
export { validateRequest, sanitizeRequest, CommonSchemas } from './validation';