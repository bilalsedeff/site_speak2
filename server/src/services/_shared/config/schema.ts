/**
 * Configuration Schema - Source of Truth
 * 
 * Zod schema for all environment configuration with safe defaults.
 * Implements 12-Factor "Config in the environment" principle.
 */

import { z } from 'zod';

// Database configuration
const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  POSTGRES_DB: z.string().default('sitespeak_dev_db'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('postgres'),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  
  // Connection pool settings
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DB_POOL_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10000),
});

// Redis configuration
const RedisConfigSchema = z.object({
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  REDIS_FAMILY: z.enum(['4', '6']).default('4'),
  
  // Redis connection settings
  REDIS_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10000),
  REDIS_LAZY_CONNECT: z.coerce.boolean().default(true),
  REDIS_MAX_RETRIES_PER_REQUEST: z.coerce.number().int().nonnegative().default(3),
});

// Application configuration
const ApplicationConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default('0.0.0.0'),
  
  // Service URLs
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_URL: z.string().url().default('http://localhost:5000'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  WIDGET_URL: z.string().url().optional(),
  BASE_URL: z.string().url().optional(),
  
  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
});

// Security configuration
const SecurityConfigSchema = z.object({
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_ISSUER: z.string().default('sitespeak.com'),
  JWT_AUDIENCE: z.string().default('sitespeak-api'),
  
  // Encryption
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),
  
  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),
  
  // Security headers
  HSTS_MAX_AGE: z.coerce.number().int().positive().default(31536000), // 1 year
  CSP_REPORT_URI: z.string().url().optional(),
});

// OpenAI configuration
const OpenAIConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  AI_MODEL: z.string().default('gpt-4o'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  MAX_TOKENS: z.coerce.number().int().positive().default(4000),
  TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  
  // Usage limits
  OPENAI_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(500),
  OPENAI_MAX_TOKENS_PER_MINUTE: z.coerce.number().int().positive().default(40000),
});

// Vector database configuration
const VectorConfigSchema = z.object({
  // pgvector settings
  VECTOR_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  VECTOR_INDEX_TYPE: z.enum(['hnsw', 'ivfflat']).default('hnsw'),
  
  // HNSW parameters
  HNSW_M: z.coerce.number().int().positive().default(16),
  HNSW_EF_CONSTRUCTION: z.coerce.number().int().positive().default(64),
  HNSW_EF_SEARCH: z.coerce.number().int().positive().default(100),
  
  // IVFFlat parameters
  IVFFLAT_LISTS: z.coerce.number().int().positive().default(100),
  IVFFLAT_PROBES: z.coerce.number().int().positive().default(10),
  
  // Search settings
  VECTOR_SEARCH_K: z.coerce.number().int().positive().default(8),
  VECTOR_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.7),
});

// Queue configuration
const QueueConfigSchema = z.object({
  // BullMQ settings
  QUEUE_DEFAULT_DELAY: z.coerce.number().int().nonnegative().default(0),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  QUEUE_BACKOFF_TYPE: z.enum(['fixed', 'exponential']).default('exponential'),
  QUEUE_BACKOFF_DELAY: z.coerce.number().int().positive().default(2000),
  
  // Job settings
  QUEUE_JOB_TTL: z.coerce.number().int().positive().default(600000), // 10 minutes
  QUEUE_STALLED_INTERVAL: z.coerce.number().int().positive().default(30000),
  QUEUE_MAX_STALLED_COUNT: z.coerce.number().int().positive().default(1),
  
  // Concurrency
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_LIMITER_MAX: z.coerce.number().int().positive().default(10),
  QUEUE_LIMITER_DURATION: z.coerce.number().int().positive().default(60000),
});

// Telemetry configuration
const TelemetryConfigSchema = z.object({
  // OpenTelemetry
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_NAME: z.string().default('sitespeak-api'),
  OTEL_SERVICE_VERSION: z.string().default('1.0.0'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  
  // Sampling
  OTEL_TRACES_SAMPLER: z.enum(['always_on', 'always_off', 'traceidratio', 'parentbased_always_on']).default('traceidratio'),
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(0.1),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  LOG_CORRELATION: z.coerce.boolean().default(true),
});

// Feature flags configuration
const FeatureFlagsSchema = z.object({
  // AI features
  INTENT_ENGINE_ENABLED: z.coerce.boolean().default(true),
  USE_LANGGRAPH_AGENT: z.coerce.boolean().default(true),
  VECTOR_SEARCH_ENABLED: z.coerce.boolean().default(true),
  HYBRID_SEARCH_ENABLED: z.coerce.boolean().default(true),
  
  // Crawler features
  USE_PLAYWRIGHT_CRAWLER: z.coerce.boolean().default(true),
  AUTO_CRAWLER_ENABLED: z.coerce.boolean().default(false),
  ADVANCED_EXTRACTION: z.coerce.boolean().default(false),
  ENABLE_VECTOR_PERSIST: z.coerce.boolean().default(true),
  
  // Voice features
  VOICE_ENABLED: z.coerce.boolean().default(true),
  TTS_ENABLED: z.coerce.boolean().default(true),
  STT_ENABLED: z.coerce.boolean().default(true),
  VOICE_STREAMING: z.coerce.boolean().default(true),
  
  // Security features
  RBAC_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMITING_ENABLED: z.coerce.boolean().default(true),
  TENANT_ISOLATION: z.coerce.boolean().default(true),
  
  // Monitoring features
  METRICS_ENABLED: z.coerce.boolean().default(true),
  HEALTH_CHECKS_ENABLED: z.coerce.boolean().default(true),
  DETAILED_LOGGING: z.coerce.boolean().default(false),
});

// Third-party services configuration
const ThirdPartyConfigSchema = z.object({
  // Optional AI services
  HUGGINGFACE_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  DEEPGRAM_API_KEY: z.string().optional(),
  
  // Langsmith
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().default('sitespeak'),
  LANGSMITH_ENABLED: z.coerce.boolean().default(false),
  TRACE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),
  
  // File storage (AWS S3/R2)
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
  
  // Analytics
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
});

// Development configuration
const DevelopmentConfigSchema = z.object({
  DEBUG: z.string().optional(),
  NO_STRICT_CHECKS: z.coerce.boolean().default(false),
  CHOKIDAR_USEPOLLING: z.coerce.boolean().default(true),
  SITESPEAK_KB_QUIET: z.coerce.boolean().default(false),
  SITESPEAK_DEVELOPMENT_MODE: z.coerce.boolean().default(true),
  CRAWLER_AUTH_TOKEN: z.string().optional(),
  
  // Paths
  PUBLISH_PATH: z.string().default('./published-sites'),
  PUBLISHED_SITES_PATH: z.string().default('./published-sites'),
  UPLOADS_PATH: z.string().default('./uploads'),
  
  // Site configuration
  SITESPEAK_MAIN_SITE_ID: z.string().uuid().optional(),
  MAX_CONCURRENT_CRAWLERS: z.coerce.number().int().positive().default(3),
  CRAWLER_USER_AGENT: z.string().default('SiteSpeak-Crawler/1.0 (+https://sitespeak.ai/bot)'),
});

// Main configuration schema combining all sections
export const ConfigSchema = DatabaseConfigSchema
  .merge(RedisConfigSchema)
  .merge(ApplicationConfigSchema)
  .merge(SecurityConfigSchema)
  .merge(OpenAIConfigSchema)
  .merge(VectorConfigSchema)
  .merge(QueueConfigSchema)
  .merge(TelemetryConfigSchema)
  .merge(FeatureFlagsSchema)
  .merge(ThirdPartyConfigSchema)
  .merge(DevelopmentConfigSchema);

export type Config = z.infer<typeof ConfigSchema>;

// Environment-specific defaults
export const getEnvironmentDefaults = (nodeEnv: string) => {
  switch (nodeEnv) {
    case 'production':
      return {
        LOG_LEVEL: 'info',
        OTEL_ENABLED: true,
        OTEL_TRACES_SAMPLER_ARG: 0.01, // 1% sampling in production
        DETAILED_LOGGING: false,
        SITESPEAK_DEVELOPMENT_MODE: false,
      };
    
    case 'staging':
      return {
        LOG_LEVEL: 'info',
        OTEL_ENABLED: true,
        OTEL_TRACES_SAMPLER_ARG: 0.1, // 10% sampling in staging
        DETAILED_LOGGING: true,
        SITESPEAK_DEVELOPMENT_MODE: false,
      };
    
    case 'test':
      return {
        LOG_LEVEL: 'warn',
        OTEL_ENABLED: false,
        DETAILED_LOGGING: false,
        SITESPEAK_DEVELOPMENT_MODE: true,
        DB_POOL_MAX: 5,
        QUEUE_CONCURRENCY: 1,
      };
    
    case 'development':
    default:
      return {
        LOG_LEVEL: 'debug',
        LOG_FORMAT: 'pretty',
        OTEL_ENABLED: false,
        DETAILED_LOGGING: true,
        SITESPEAK_DEVELOPMENT_MODE: true,
      };
  }
};