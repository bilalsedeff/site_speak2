import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configuration schema with validation
const ConfigSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  
  // URLs
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:5000'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  WIDGET_URL: z.string().url().optional(),
  
  // Database
  DATABASE_URL: z.string().min(1),
  POSTGRES_DB: z.string().default('sitespeak_dev_db'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('postgres'),
  
  // Redis
  REDIS_URL: z.string().min(1),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  
  // Security & JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('sitespeak.com'),
  JWT_AUDIENCE: z.string().default('sitespeak-api'),
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default('gpt-4o'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  MAX_TOKENS: z.coerce.number().int().positive().default(4000),
  
  // AI Features
  INTENT_ENGINE_ENABLED: z.coerce.boolean().default(true),
  ENABLE_VECTOR_PERSIST: z.coerce.boolean().default(false),
  USE_PLAYWRIGHT_CRAWLER: z.coerce.boolean().default(false),
  AUTO_CRAWLER_ENABLED: z.coerce.boolean().default(false),
  ADVANCED_EXTRACTION: z.coerce.boolean().default(false),
  AUTO_INDEX_CRON: z.string().optional(),
  USE_LANGGRAPH_AGENT: z.coerce.boolean().default(false),
  SITESPEAK_KB_QUIET: z.coerce.boolean().default(false),
  
  // Optional third-party services
  HUGGINGFACE_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().default('sitespeak'),
  LANGSMITH_ENABLED: z.coerce.boolean().default(false),
  TRACE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),
  
  // File Storage (AWS S3/R2)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_BUCKET_NAME: z.string().optional(),
  
  // CDN & Performance (Cloudflare)
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  CDN_ENABLED: z.coerce.boolean().default(false),
  CACHE_TTL: z.coerce.number().int().positive().default(86400),
  
  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  
  // Analytics & Monitoring
  PLAUSIBLE_DOMAIN: z.string().optional(),
  PLAUSIBLE_API_HOST: z.string().url().default('https://plausible.io'),
  PLAUSIBLE_ENABLED: z.coerce.boolean().default(false),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://app.posthog.com'),
  POSTHOG_ENABLED: z.coerce.boolean().default(false),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENV: z.string().default('development'),
  
  // Billing (Stripe)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // Rate Limiting & Security
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  
  // Voice AI
  DEFAULT_VOICE_LANGUAGE: z.string().default('en-US'),
  DEFAULT_TTS_VOICE: z.string().default('alloy'),
  VOICE_RESPONSE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  
  // Knowledge Base
  KB_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.7),
  KNOWLEDGE_BASE_MAX_CHUNKS: z.coerce.number().int().positive().default(1000),
  KNOWLEDGE_BASE_CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  KNOWLEDGE_BASE_OVERLAP_SIZE: z.coerce.number().int().nonnegative().default(100),
  
  // Development
  DEBUG: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NO_STRICT_CHECKS: z.coerce.boolean().default(false),
  CHOKIDAR_USEPOLLING: z.coerce.boolean().default(true),
  
  // SiteSpeak specific
  SITESPEAK_MAIN_SITE_ID: z.string().uuid().optional(),
  SITESPEAK_DEVELOPMENT_MODE: z.coerce.boolean().default(true),
  CRAWLER_AUTH_TOKEN: z.string().optional(),
  
  // Publishing paths
  PUBLISH_PATH: z.string().default('./published-sites'),
  PUBLISHED_SITES_PATH: z.string().default('./published-sites'),
  UPLOADS_PATH: z.string().default('./uploads'),
  
  // Service URLs (for microservices architecture)
  AUTH_SERVICE_URL: z.string().url().optional(),
  SITES_SERVICE_URL: z.string().url().optional(),
  AI_SERVICE_URL: z.string().url().optional(),
  ANALYTICS_SERVICE_URL: z.string().url().optional(),
  WEBSOCKET_URL: z.string().url().optional(),
  BASE_URL: z.string().url().optional(),
  SITES_BASE_URL: z.string().default('sitespeak.com'),
  
  // Crawler
  MAX_CONCURRENT_CRAWLERS: z.coerce.number().int().positive().default(3),
  CRAWLER_USER_AGENT: z.string().default('SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/bot)'),
});

type Config = z.infer<typeof ConfigSchema>;

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// Validate and create configuration
let config: Config;

try {
  config = ConfigSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingFields = error.errors
      .filter(e => e.code === 'invalid_type' && e.received === 'undefined')
      .map(e => e.path.join('.'));
    
    const invalidFields = error.errors
      .filter(e => e.code !== 'invalid_type' || e.received !== 'undefined')
      .map(e => `${e.path.join('.')}: ${e.message}`);

    let errorMessage = 'Configuration validation failed:\n';
    
    if (missingFields.length > 0) {
      errorMessage += `\nMissing required environment variables:\n${missingFields.map(f => `  - ${f}`).join('\n')}`;
    }
    
    if (invalidFields.length > 0) {
      errorMessage += `\nInvalid configuration values:\n${invalidFields.map(f => `  - ${f}`).join('\n')}`;
    }

    throw new ConfigurationError(errorMessage);
  }
  throw error;
}

// Freeze configuration to prevent mutations
Object.freeze(config);

export { config };
export type { Config };
export { ConfigurationError };

// Helper functions
export const isDevelopment = () => config.NODE_ENV === 'development';
export const isProduction = () => config.NODE_ENV === 'production';
export const isTest = () => config.NODE_ENV === 'test';

// Database configuration helpers
export const getDatabaseConfig = () => ({
  url: config.DATABASE_URL,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
});

// Redis configuration helpers  
export const getRedisConfig = () => ({
  url: config.REDIS_URL,
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  db: config.REDIS_DB,
});

// CORS origins helper
export const getCorsOrigins = () => 
  config.CORS_ORIGINS.split(',').map(origin => origin.trim());

// Feature flags
export const getFeatureFlags = () => ({
  intentEngine: config.INTENT_ENGINE_ENABLED,
  vectorPersist: config.ENABLE_VECTOR_PERSIST,
  playwrightCrawler: config.USE_PLAYWRIGHT_CRAWLER,
  autoCrawler: config.AUTO_CRAWLER_ENABLED,
  advancedExtraction: config.ADVANCED_EXTRACTION,
  langGraphAgent: config.USE_LANGGRAPH_AGENT,
  kbQuiet: config.SITESPEAK_KB_QUIET,
  cdnEnabled: config.CDN_ENABLED,
  plausibleEnabled: config.PLAUSIBLE_ENABLED,
  posthogEnabled: config.POSTHOG_ENABLED,
  langsmithEnabled: config.LANGSMITH_ENABLED,
});