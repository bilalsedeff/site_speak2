# Sites Module

The Sites Module implements the core site lifecycle management functionality for SiteSpeak, following the source of truth specifications with enterprise-grade orchestration, HTTP standards compliance, and seamless integration with the publishing pipeline.

## Architecture Overview

The Sites Module follows hexagonal architecture with clear separation of concerns:

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                       Sites Module                             │
├─────────────────┬─────────────────┬─────────────────────────────┤
│    API Layer   │  Application    │      Infrastructure        │
│                │     Layer       │        Adapters             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ • SiteController│ • SiteOrchest- │ • HTTP Standards (ETag,     │
│ • HTTP Standards│   rator         │   Link headers, Problem     │
│ • Problem       │ • Domain        │   Details)                  │
│   Details       │   Manager       │ • Publishing Integration    │
│ • ETag/Link     │ • Asset Upload  │ • Event Bus Integration     │
│   headers       │   Service       │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Integration Layer                             │
│  ┌─────────────────┐    ┌─────────────────┐                   │
│  │ Publishing      │    │ Knowledge Base  │                   │
│  │ Pipeline        │    │ Integration     │                   │
│  │ Integration     │    │                 │                   │
│  └─────────────────┘    └─────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### 🎯 **Saga-Style Orchestration**

- **SiteOrchestrator**: Implements temporal-like workflows with compensation
- State machine with observable transitions
- Idempotent operations with correlation tracking
- Support for CREATE | UPDATE | PUBLISH | CONNECT_DOMAIN | ROLLBACK commands

### 🌐 **HTTP Standards Compliance**

- **ETag/If-Match**: Optimistic concurrency control (RFC 9110)
- **Link Headers**: Pagination following GitHub's pattern (RFC 8288)
- **Problem Details**: Standardized error responses (RFC 9457)
- **Cache-Control**: Proper caching directives (RFC 9111)
- **Idempotency Keys**: Safe request retry support

### 🔒 **Domain Management**

- **DNS Verification**: CNAME/A record validation
- **ACME Integration**: HTTP-01 and DNS-01 challenge support
- **Certificate Provisioning**: Let's Encrypt integration
- **Multi-tenant Isolation**: Secure domain ownership

### 📁 **Asset Management**

- **Presigned URLs**: Direct-to-storage uploads (R2/S3 compatible)
- **Multipart Support**: Large file uploads (>100MB)
- **Security Validation**: Content type and size limits
- **Tenant Isolation**: Namespaced storage keys

### 🔄 **Publishing Integration**

- **Pipeline Bridge**: Seamless integration with existing publishing pipeline
- **Blue/Green Deployment**: Atomic deployment switches
- **Rollback Support**: Instant version rollback
- **Performance Metrics**: Comprehensive publishing analytics

## Directory Structure

```plaintext
sites/
├── README.md                          # This file
├── api/                               # HTTP controllers and routing
│   ├── SiteController.ts             # Enhanced CRUD with HTTP standards
│   ├── routes.ts                     # Express routes with middleware
│   └── SiteContractController.ts     # Legacy contract endpoints
├── application/                      # Business logic and services
│   ├── services/
│   │   ├── SiteOrchestrator.ts      # Saga-style workflow orchestration
│   │   ├── DomainManager.ts         # ACME/DNS domain management
│   │   └── AssetUploadService.ts    # Presigned URL asset uploads
│   └── integration/
│       └── PublishingIntegration.ts # Bridge to publishing pipeline
├── domain/                          # Domain entities and repositories
│   ├── entities/
│   │   └── SiteContract.ts         # Site contract domain entity
│   └── repositories/
│       └── SiteContractRepository.ts # Repository interface
└── adapters/                       # Infrastructure adapters
    └── http/
        ├── HttpHeaders.ts          # ETag, Link, Cache-Control utilities
        └── ProblemDetails.ts       # RFC 9457 error responses
```

## Quick Start

### 1. Environment Setup

The Sites Module integrates with existing SiteSpeak infrastructure. Required environment variables are automatically loaded from the parent application.

### 2. Basic Usage

```typescript
import { SiteOrchestrator } from './application/services/SiteOrchestrator';
import { EventBus } from '../../services/_shared/events/eventBus';

// Initialize orchestrator
const eventBus = new EventBus();
const orchestrator = new SiteOrchestrator(siteRepository, eventBus);

// Create a site
const context = await orchestrator.start('CREATE', {
  tenantId: 'tenant-123',
  userId: 'user-456',
  data: {
    name: 'My Website',
    templateId: 'modern-business',
    configuration: { /* ... */ }
  }
});

// Publish a site
await orchestrator.start('PUBLISH', {
  siteId: 'site-789',
  tenantId: 'tenant-123',
  userId: 'user-456',
  deploymentIntent: 'production'
});
```

### 3. HTTP API Usage

All endpoints follow OpenAPI 3.1 specifications with comprehensive error handling:

```bash
# List sites with pagination
GET /api/sites?page=1&limit=20&status=published

# Get site with ETag support
GET /api/sites/site-123
# Returns: ETag: "abc123"

# Update site with concurrency control
PUT /api/sites/site-123
If-Match: "abc123"
Content-Type: application/json
{ "name": "Updated Site Name" }

# Publish site with idempotency
POST /api/sites/site-123/publish
Idempotency-Key: publish-456
{ "deploymentIntent": "production" }

# Connect custom domain
POST /api/sites/site-123/domains
{ "domain": "mysite.com", "verificationMethod": "HTTP-01" }

# Generate presigned upload URL
POST /api/sites/site-123/assets/presign
{
  "filename": "logo.png",
  "contentType": "image/png",
  "contentLength": 51200
}
```

## API Endpoints

### Site Management

| Method | Endpoint | Description | Standards |
|--------|----------|-------------|-----------|
| `GET` | `/api/sites` | List sites with pagination | Link headers, Cache-Control |
| `GET` | `/api/sites/:id` | Get site by ID | ETag, Conditional GET |
| `POST` | `/api/sites` | Create new site | Idempotency-Key, Location header |
| `PUT` | `/api/sites/:id` | Update site | If-Match required, ETag |
| `DELETE` | `/api/sites/:id` | Delete site | 204 No Content |

### Publishing

| Method | Endpoint | Description | Standards |
|--------|----------|-------------|-----------|
| `POST` | `/api/sites/:id/publish` | Publish site | Idempotency-Key, 202 Accepted |
| `GET` | `/api/sites/:id/publish/:correlationId` | Get publish status | Real-time status |

### Domain Management

| Method | Endpoint | Description | Standards |
|--------|----------|-------------|-----------|
| `POST` | `/api/sites/:id/domains` | Connect custom domain | ACME challenge setup |

### Asset Management

| Method | Endpoint | Description | Standards |
|--------|----------|-------------|-----------|
| `POST` | `/api/sites/:id/assets/presign` | Generate presigned upload URL | Multipart support |

## Error Handling

All endpoints return RFC 9457 Problem Details for errors:

```json
{
  "type": "https://sitespeak.com/problems/site-not-found",
  "title": "Site Not Found",
  "status": 404,
  "detail": "Site with ID 'site-123' could not be found",
  "instance": "/api/sites/site-123",
  "siteId": "site-123",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Common error types:

- `400` Bad Request - Invalid input data
- `401` Unauthorized - Authentication required
- `403` Forbidden - Access denied
- `404` Not Found - Resource not found
- `409` Conflict - Domain already exists, publishing in progress
- `412` Precondition Failed - ETag mismatch
- `422` Unprocessable Entity - Validation errors
- `429` Too Many Requests - Rate limit exceeded

## Orchestration Patterns

The SiteOrchestrator implements saga-style patterns for complex workflows:

### Create Site Workflow

1. **Validation** - Validate input data
2. **Processing** - Create site entity
3. **Integration** - Initialize knowledge base
4. **Finalization** - Emit creation events

### Publish Site Workflow

1. **Validation** - Validate site for publishing
2. **Processing** - Execute publishing pipeline
3. **Integration** - Update downstream systems
4. **Success** - Emit published events

### Domain Connection Workflow

1. **Validation** - Validate domain format and availability
2. **DNS Verification** - Check required DNS records
3. **ACME Challenge** - Setup HTTP-01 or DNS-01 challenge
4. **Certificate Provision** - Issue SSL certificate
5. **Activation** - Make domain active

## Event Integration

The Sites Module emits events for system integration:

```typescript
// Site lifecycle events
'site.created'          // Site created successfully
'site.updated'          // Site updated
'site.published'        // Site published successfully
'site.archived'         // Site archived
'site.deleted'          // Site deleted

// Publishing events
'site.publishing.started'     // Publishing initiated
'site.publishing.completed'   // Publishing completed
'site.publishing.failed'      // Publishing failed

// Domain events
'domain.connection_initiated' // Domain connection started
'domain.verified'            // DNS verification completed
'domain.certificate_issued'  // SSL certificate issued

// Asset events
'asset.upload_initiated'     // Presigned URL generated
'asset.upload_completed'     // Asset uploaded successfully
```

## Performance Characteristics

### SLOs (Service Level Objectives)

- **List Sites**: P95 < 200ms (cached), P95 < 500ms (uncached)
- **Get Site**: P95 < 100ms (with ETag caching)
- **Create Site**: P95 < 1s (including orchestration)
- **Update Site**: P95 < 300ms (with validation)
- **Publish Site**: Async operation, status available immediately
- **Domain Connection**: Async operation, verification within 5 minutes

### Caching Strategy

- **Site Lists**: Private cache, 5 minutes
- **Site Details**: Private cache, 5 minutes, ETag validation
- **Publish Status**: No cache (real-time data)
- **Presigned URLs**: No cache (security sensitive)

## Security Considerations

### Multi-tenant Isolation

- All operations scoped to tenant ID
- Database queries include tenant filters
- Asset storage uses tenant-namespaced keys

### Authentication & Authorization

- JWT-based authentication required
- Tenant membership validation
- Resource ownership checks

### Content Security

- File type validation for uploads
- Content length limits enforced
- Dangerous file extensions blocked
- Presigned URLs expire within 10 minutes

### HTTP Security

- CORS headers for cross-origin requests
- Security headers (CSP, HSTS, etc.)
- Request correlation IDs for tracing

## Monitoring & Observability

### Metrics to Monitor

```typescript
// Performance metrics
'sites.operation.duration'     // Operation completion time
'sites.orchestration.duration' // Workflow execution time
'sites.api.requests'          // HTTP request counts
'sites.api.errors'            // HTTP error rates

// Business metrics
'sites.created.count'         // Site creation rate
'sites.published.count'       // Publishing success rate
'sites.domains.connected'     // Domain connection rate
'sites.assets.uploaded'       // Asset upload volume
```

### Health Checks

The module exposes health endpoints:

```bash
GET /api/sites/health
# Returns service health status
```

## Testing

### Running Tests

```bash
# Unit tests for business logic
npm run test:sites:unit

# Integration tests for API endpoints
npm run test:sites:integration

# End-to-end workflow tests
npm run test:sites:e2e
```

### Test Coverage Requirements

- **Unit Tests**: >90% coverage for business logic
- **Integration Tests**: All API endpoints
- **Contract Tests**: OpenAPI specification compliance
- **Saga Tests**: All orchestration workflows

## Development Guidelines

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: All rules enforced
- **File Naming**: PascalCase for classes, camelCase for functions
- **Maximum File Size**: 300 lines (excluding comments)

### Error Handling of Module

- All errors must be properly typed
- Use Problem Details format for HTTP errors
- Log all errors with correlation IDs
- Implement proper error compensation in sagas

### Performance Guidelines

- Use pagination for all list endpoints
- Implement proper caching strategies
- Minimize database queries per request
- Use async operations for long-running tasks

## Deployment

### Dependencies

The Sites Module requires:

- PostgreSQL database with site tables
- Redis for caching and sessions  
- Event bus for integration
- Publishing pipeline for deployment
- Asset storage (S3/R2 compatible)

### Environment Configuration

Key environment variables (inherited from parent app):

```bash
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-32-char-key

# Storage
ARTIFACT_STORE_PROVIDER=cloudflare-r2
R2_BUCKET=sitespeak-artifacts
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

## Migration Guide

### From Legacy Implementation

1. **Backup Current Data**: Export existing site configurations
2. **Run Migrations**: Execute database schema updates
3. **Update API Calls**: Migrate to new endpoint signatures
4. **Test Integrations**: Verify publishing pipeline integration
5. **Monitor Performance**: Watch metrics during rollout

### Breaking Changes

- Site status workflow has changed
- Publishing endpoints now return async status
- Domain connection requires explicit verification
- Asset uploads now use presigned URLs

## Troubleshooting

### Common Issues

#### "Site Not Found" Errors

- Verify site exists and user has access
- Check tenant ID matches authenticated user
- Confirm site hasn't been archived or deleted

#### ETag Mismatch Errors

- Client needs to refresh site data
- Concurrent modification detected
- Use GET request to fetch latest ETag

#### Publishing Failures

- Check site has required pages (home page mandatory)
- Verify domain DNS configuration
- Review publishing pipeline logs

#### Domain Connection Issues

- Validate DNS records are correctly configured
- Check ACME challenge completion
- Verify domain isn't already in use

### Debug Logging

Enable debug logging for detailed troubleshooting:

```bash
DEBUG=sitespeak:sites npm run dev
```

### Support Contacts

For implementation questions or issues:

- Review existing tests and examples
- Check integration documentation
- Consult source of truth specifications

## Future Enhancements

### Planned Features

- **Advanced Analytics**: Site performance metrics
- **Template Marketplace**: Custom template sharing
- **A/B Testing**: Split testing for site variations
- **Backup/Restore**: Site configuration backup
- **Staging Environments**: Multiple deployment targets

### Architecture Evolution

- **Microservice Split**: Extract domain management
- **Event Sourcing**: Implement full event sourcing
- **CQRS Pattern**: Separate read/write models
- **GraphQL API**: Alternative to REST endpoints

---

This Sites Module implementation provides a robust, standards-compliant foundation for SiteSpeak's core site management functionality, with enterprise-grade features and seamless integration with the broader platform architecture.
