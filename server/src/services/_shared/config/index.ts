/**
 * Configuration Module - Main Entry Point
 * 
 * Loads environment variables, validates against Zod schema, and exports
 * immutable configuration object. Implements 12-Factor "Config in the environment".
 */

import { config } from 'dotenv';
import { ConfigSchema, getEnvironmentDefaults, type Config } from './schema.js';
import { FeatureFlagService, createFlagGetters, type FlagGetters } from './flags.js';

// Load .env file in development
if (process.env['NODE_ENV'] !== 'production') {
  config();
}

/**
 * Parse and validate environment configuration
 */
function parseConfig(): Config {
  // Get environment-specific defaults
  const nodeEnv = process.env['NODE_ENV'] || 'development';
  const envDefaults = getEnvironmentDefaults(nodeEnv);
  
  // Merge process.env with defaults
  const rawConfig = {
    ...envDefaults,
    ...process.env,
  };
  
  try {
    // Parse and validate with Zod schema
    const parsed = ConfigSchema.parse(rawConfig);
    
    // Freeze the configuration to prevent mutations
    return Object.freeze(parsed);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    
    if (error instanceof Error && 'issues' in error) {
      const zodError = error as any;
      console.error('Validation issues:');
      zodError.issues.forEach((issue: any) => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
    }
    
    process.exit(1);
  }
}

/**
 * Immutable configuration object
 */
export const cfg = parseConfig();

/**
 * Feature flag service instance
 */
export const featureFlags = new FeatureFlagService(cfg);

/**
 * Type-safe feature flag getters
 */
export const flags: FlagGetters = createFlagGetters(featureFlags);

/**
 * Configuration validation helper for tests
 */
export function validateConfig(testConfig: Record<string, any>): Config {
  return ConfigSchema.parse(testConfig);
}

/**
 * Get configuration for specific environment (for testing)
 */
export function getConfigForEnv(env: string, overrides: Record<string, any> = {}): Config {
  const envDefaults = getEnvironmentDefaults(env);
  const mergedConfig = {
    ...envDefaults,
    NODE_ENV: env,
    ...overrides,
  };
  
  return ConfigSchema.parse(mergedConfig);
}

// Log startup configuration (sanitized)
if (cfg.NODE_ENV === 'development') {
  console.log('Configuration loaded:', {
    NODE_ENV: cfg.NODE_ENV,
    PORT: cfg.PORT,
    DATABASE_URL: cfg.DATABASE_URL.replace(/\/\/.*@/, '//***:***@'),
    REDIS_URL: cfg.REDIS_URL.replace(/\/\/.*@/, '//***:***@'),
    AI_MODEL: cfg.AI_MODEL,
    EMBEDDING_MODEL: cfg.EMBEDDING_MODEL,
    LOG_LEVEL: cfg.LOG_LEVEL,
    OTEL_ENABLED: cfg.OTEL_ENABLED,
  });
}

// Validate critical environment variables
const requiredInProduction = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'REDIS_URL'
];

if (cfg.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter(key => !cfg[key as keyof Config]);
  if (missing.length > 0) {
    console.error('Missing required production environment variables:', missing);
    process.exit(1);
  }
}

export type { Config } from './schema.js';
export type { FeatureFlag, FlagGetters } from './flags.js';