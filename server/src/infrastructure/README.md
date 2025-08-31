# Infrastructure Layer

Core infrastructure services that provide cross-cutting concerns for the entire application.

## Purpose

This layer handles:

- **Configuration Management**: Environment-based configuration with validation
- **Database Connectivity**: PostgreSQL with pgvector extension
- **Caching**: Redis integration for sessions and data caching
- **Security**: Authentication, authorization, and encryption services
- **Monitoring**: Health checks, metrics, and observability
- **External Services**: Third-party API integrations

## Structure

```plaintext
infrastructure/
├── config/             # Environment configuration and validation
├── database/           # Database connection and schema management
├── messaging/          # Queue management and background jobs
├── storage/            # File storage and asset management
├── monitoring/         # Health checks and observability
├── security/           # Authentication and security services
└── server/            # HTTP server and middleware setup
```

## Configuration (`/config`)

Environment-based configuration with comprehensive validation:

```typescript
// Zod-based configuration validation
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // ... more configuration
});

// Usage
import { config } from '../infrastructure/config';
console.log(config.NODE_ENV); // Fully typed and validated
```

**Features:**

- Environment validation at startup
- Type-safe configuration access
- Feature flag management
- Secrets management with security best practices
- 12-Factor app compliance

## Database (`/database`)

PostgreSQL with Drizzle ORM and pgvector extension:

```typescript
// Database connection with connection pooling
import { db } from '../infrastructure/database';

// Type-safe database queries
const sites = await db.select().from(sitesTable).where(eq(sitesTable.tenantId, tenantId));

// Transaction support
await db.transaction(async (tx) => {
  await tx.insert(sitesTable).values(siteData);
  await tx.insert(knowledgeBasesTable).values(kbData);
});
```

**Features:**

- Connection pooling and management
- Migration system with version control
- pgvector setup for AI embeddings
- Health check and monitoring
- Transaction support with automatic rollback
- Query optimization and indexing

**Schema Organization:**

- `users.ts` - User management and authentication
- `tenants.ts` - Multi-tenant organization structure
- `sites.ts` - Website and template management
- `knowledge-base.ts` - AI knowledge base with vector embeddings
- `voice-sessions.ts` - Voice AI sessions and interactions
- `conversations.ts` - AI conversation tracking
- `analytics.ts` - Performance and usage analytics

## Messaging (`/messaging`)

Background job processing with BullMQ:

```typescript
// Queue configuration
const crawlQueue = new Queue('site-crawling', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Job processing
const worker = new Worker('site-crawling', async (job) => {
  const { siteId } = job.data;
  await crawlSite(siteId);
}, { connection: redisConnection });
```

**Queues:**

- `site-crawling` - Website content crawling and indexing
- `ai-processing` - AI model inference and embeddings
- `voice-processing` - Audio transcription and synthesis
- `email-sending` - Transactional email delivery
- `analytics-aggregation` - Real-time analytics processing

## Storage (`/storage`)

File and asset management:

```typescript
interface StorageProvider {
  upload(file: Buffer, key: string, options?: UploadOptions): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

// Multi-provider support
const storage = createStorageProvider(config.STORAGE_PROVIDER);
await storage.upload(audioBuffer, 'voice-sessions/audio-123.wav');
```

**Providers:**

- **Local**: Development and testing
- **AWS S3**: Production file storage
- **Cloudflare R2**: S3-compatible with better pricing
- **Azure Blob**: Enterprise integration

**Use Cases:**

- Voice audio file storage
- Site asset management (images, documents)
- Template and component storage
- Backup and archival

## Security (`/security`)

Comprehensive security services:

```typescript
// JWT token management
const tokenService = {
  generateTokens(user: User): { accessToken: string; refreshToken: string },
  verifyToken(token: string): JWTPayload,
  refreshTokens(refreshToken: string): TokenPair,
};

// Encryption services
const encryptionService = {
  encrypt(data: string): string,
  decrypt(encryptedData: string): string,
  hash(password: string): Promise<string>,
  verifyHash(password: string, hash: string): Promise<boolean>,
};

// Rate limiting
const rateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
```

**Security Features:**

- JWT authentication with refresh tokens
- Password hashing with bcrypt
- Data encryption at rest
- Rate limiting and DDoS protection
- CSRF protection
- Input sanitization and validation
- RBAC (Role-Based Access Control)
- Multi-tenant data isolation

## Monitoring (`/monitoring`)

Health checks and observability:

```typescript
// Health check system
const healthChecks = {
  database: async () => {
    const startTime = Date.now();
    await db.raw('SELECT 1');
    return {
      healthy: true,
      latency: Date.now() - startTime,
    };
  },
  redis: async () => {
    const pong = await redis.ping();
    return { healthy: pong === 'PONG' };
  },
  openai: async () => {
    // Test OpenAI API connectivity
  },
};

// Kubernetes-compatible health endpoints
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

app.get('/health/ready', async (req, res) => {
  const checks = await runHealthChecks();
  const healthy = Object.values(checks).every(check => check.healthy);
  res.status(healthy ? 200 : 503).json(checks);
});
```

**Monitoring Features:**

- Health check endpoints (`/health`, `/health/live`, `/health/ready`)
- Performance metrics collection
- Error tracking and alerting
- Database query performance monitoring
- API response time tracking
- Memory and CPU usage monitoring

## Server (`/server`)

HTTP server setup with Express.js:

```typescript
// Server configuration
const app = express();

// Middleware stack
app.use(helmet()); // Security headers
app.use(compression()); // Response compression
app.use(cors(corsOptions)); // CORS configuration
app.use(rateLimiter); // Rate limiting
app.use(express.json({ limit: '10mb' })); // Body parsing
app.use(authMiddleware); // Authentication
app.use(tenantMiddleware); // Multi-tenant isolation
app.use(loggingMiddleware); // Request logging

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

**Server Features:**

- Express.js with TypeScript
- Comprehensive middleware stack
- WebSocket support with Socket.io
- Graceful shutdown handling
- SSL/TLS support
- Static file serving
- API documentation with OpenAPI/Swagger

## Environment Configuration

All infrastructure components are configured through environment variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sitespeak
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secure-jwt-secret-here
ENCRYPTION_KEY=your-32-character-encryption-key

# External Services
OPENAI_API_KEY=sk-your-openai-api-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key

# Monitoring
SENTRY_DSN=your-sentry-dsn-for-error-tracking
```

## Development Guidelines

1. **Configuration First**: All settings must be configurable via environment variables
2. **Health Checks**: Every external dependency must have a health check
3. **Graceful Degradation**: Services should handle external service failures gracefully
4. **Security**: All external inputs must be validated and sanitized
5. **Observability**: Add metrics and logging for all critical operations
6. **Error Handling**: Comprehensive error handling with proper HTTP status codes

## Testing

```bash
npm run test:infrastructure  # Infrastructure layer tests
npm run test:db             # Database integration tests
npm run test:health         # Health check tests
```

Infrastructure tests include:

- Configuration validation
- Database connection and migration tests
- Health check functionality
- Security service testing
- Message queue processing
