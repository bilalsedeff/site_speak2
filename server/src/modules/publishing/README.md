# Publishing Module

The Publishing Module implements SiteSpeak's atomic, immutable, and cache-efficient publishing infrastructure with blue/green deployment capabilities.

## Architecture Overview

The publishing system follows a hexagonal architecture with clear separation of concerns:

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                       Publishing Pipeline                       │
│  Draft → Build → Contract → Package → Upload → Activate →      │
│  Warm → Verify → Announce → Success                            │
│                           ↓                                     │
│                    (on failure)                                │
│                   Rolling Back → Rolled Back                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Site Contract  │    │ Artifact Store  │    │  CDN Provider   │
│   Generator     │    │   (S3/R2/MinIO)│    │ (CF/Fastly/...)│
│                 │    │                 │    │                 │
│ • JSON-LD       │    │ • Immutable     │    │ • Precise Purge │
│ • ARIA Audit    │    │ • Content-Addr  │    │ • Preview URLs  │
│ • Actions       │    │ • Blue/Green    │    │ • Cache Control │
│ • Sitemap       │    │ • Presigned     │    │ • Performance   │
│ • GraphQL       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Key Features

### 🚀 **Atomic Blue/Green Deployment**

- Content-addressed releases with SHA-256 hashing
- Instant rollback capability (≤5 seconds)
- Zero mixed-version states during deployment
- Immutable artifact storage

### 📋 **Self-Describing Site Contracts**

- **JSON-LD**: Products, Articles, FAQs, Organizations, Offers
- **ARIA Audit**: Comprehensive accessibility validation
- **Actions Manifest**: Deterministic action selectors for AI agents
- **Sitemap**: XML with accurate lastmod and image support
- **GraphQL Schema**: Type-safe API with generated TypeScript types
- **Resource Hints**: Preconnect, DNS-prefetch, preload optimization

### 🏗️ **Multi-Provider Support**

- **Artifact Storage**: AWS S3, Cloudflare R2, MinIO
- **CDN**: Cloudflare, Fastly, Generic HTTP
- **Environment-based configuration**

### 📊 **Comprehensive Observability**

- Performance metrics for each pipeline step
- Detailed event emission for monitoring
- Error tracking with automatic rollback
- Health checks and synthetic validation

## Quick Start

### 1. Environment Setup

Add to your `.env` file:

```bash
# Artifact Storage
ARTIFACT_STORE_PROVIDER=cloudflare-r2
ARTIFACT_BUCKET=your-artifacts-bucket
ARTIFACT_ACCESS_KEY_ID=your-access-key
ARTIFACT_SECRET_KEY=your-secret-key

# CDN
CDN_PROVIDER=cloudflare
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ZONE_ID=your-zone-id
```

### 2. Basic Usage

```typescript
import { createPublishingPipeline } from './app/PublishingPipeline';
import { createArtifactStoreFromEnv } from './adapters/ArtifactStore';
import { createCDNProviderFromEnv } from './adapters/CDNProvider';
import { EventBus } from '../../services/_shared/events/eventBus';

// Initialize dependencies
const artifactStore = createArtifactStoreFromEnv();
const cdnProvider = createCDNProviderFromEnv();
const eventBus = new EventBus();

// Create pipeline
const pipeline = createPublishingPipeline(artifactStore, cdnProvider, eventBus);

// Publish a site
const result = await pipeline.publish({
  siteId: 'my-site',
  tenantId: 'tenant-123',
  deploymentIntent: 'production',
  commitSha: 'abc123',
  buildParams: {
    environment: 'production',
    customDomain: 'mysite.com'
  }
});

console.log('Published successfully:', {
  deploymentId: result.deploymentId,
  releaseHash: result.releaseHash,
  totalDuration: result.performanceMetrics.totalDuration
});
```

### 3. Rollback Example

```typescript
// Rollback to previous version
await pipeline.rollback({
  deploymentId: 'current-deployment-id',
  request: {
    // ... previous publish request
    previousDeploymentId: 'previous-deployment-id'
  },
  // ... other context fields
});
```

## Module Structure

```plaintext
publishing/
├── README.md                 # This file
├── app/                      # Application layer
│   ├── PublishingPipeline.ts # State machine orchestrator
│   └── siteContract.ts       # Contract generation
├── adapters/                 # Infrastructure adapters
│   ├── ArtifactStore.ts      # S3-compatible storage
│   └── CDNProvider.ts        # CDN abstraction
└── types/                    # TypeScript definitions
    └── index.ts
```

## Configuration

### Artifact Store Providers

**AWS S3:**

```bash
ARTIFACT_STORE_PROVIDER=aws-s3
AWS_REGION=us-east-1
AWS_BUCKET_NAME=sitespeak-artifacts
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

**Cloudflare R2:**

```bash
ARTIFACT_STORE_PROVIDER=cloudflare-r2
R2_BUCKET=sitespeak-artifacts
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

**MinIO:**

```bash
ARTIFACT_STORE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=your-key
MINIO_SECRET_KEY=your-secret
MINIO_BUCKET=sitespeak-artifacts
```

### CDN Providers

**Cloudflare:**

```bash
CDN_PROVIDER=cloudflare
CLOUDFLARE_API_TOKEN=your-token
CLOUDFLARE_ZONE_ID=your-zone-id
```

**Fastly:**

```bash
CDN_PROVIDER=fastly
FASTLY_API_KEY=your-key
FASTLY_SERVICE_ID=your-service-id
```

## Pipeline States

The publishing pipeline follows a strict state machine:

1. **Draft**: Initial state, ready to begin
2. **Building**: Site compilation and asset generation
3. **Contracting**: JSON-LD, sitemap, actions manifest generation
4. **Packaging**: Artifact manifest creation and integrity checks
5. **Uploading**: Immutable asset storage with content addressing
6. **Activating**: Atomic blue/green alias switch
7. **Warming**: CDN cache warming for critical routes
8. **Verifying**: Health checks and synthetic validation
9. **Announcing**: Event emission for downstream systems
10. **Succeeded**: Pipeline completed successfully

**Error States:**

- **Rolling Back**: Automatic rollback in progress
- **Rolled Back**: Successfully reverted to previous version
- **Failed**: Pipeline failed without recovery

## Site Contract Specification

Every published site includes a comprehensive contract:

### Files Generated

- `sitemap.xml` - W3C compliant with image support
- `sitemap_index.xml` - For sites >50,000 URLs
- `robots.txt` - Search engine directives
- `actions.json` - AI-consumable action manifest
- `speculation-rules.json` - Modern browser prefetching
- `schema.graphql` - GraphQL API schema
- `types.d.ts` - Generated TypeScript types
- `structured-data.json` - Consolidated JSON-LD

### JSON-LD Schema Types

- **Website/Organization**: Basic site information
- **Product/Offer**: E-commerce products with pricing
- **BlogPosting/Article**: Content marketing pages
- **FAQPage**: Frequently asked questions
- **BreadcrumbList**: Navigation context
- **SearchAction**: Site search functionality

## Performance SLOs

- **P95 Publish Time**: ≤90 seconds (cold cache, medium site)
- **Rollback Time**: ≤5 seconds (alias pointer flip)
- **Cache Purge**: ≤30 seconds (provider dependent)
- **Activation**: ≤60 seconds (blue/green switch)

## Events Emitted

The publishing pipeline emits events for integration:

```typescript
// Site successfully published
'site.published' {
  deploymentId: string;
  siteId: string;
  tenantId: string;
  releaseHash: string;
  deploymentIntent: 'preview' | 'production';
  publishedAt: string;
  contractPaths: ContractPaths;
}

// Knowledge base refresh needed
'kb.refreshRequested' {
  siteId: string;
  releaseHash: string;
  reason: 'site_published';
}

// Pipeline state changes
'pipeline.state_changed' {
  deploymentId: string;
  siteId: string;
  previousState: PipelineState;
  currentState: PipelineState;
  duration: number;
}
```

## Error Handling

The pipeline implements comprehensive error handling:

- **Idempotent Transitions**: All state changes can be safely retried
- **Automatic Rollback**: Failed activations trigger immediate rollback
- **Timeout Protection**: Per-step timeouts prevent hanging
- **Circuit Breaker**: Failed providers are temporarily bypassed
- **Detailed Logging**: Full audit trail for debugging

## Monitoring & Alerts

Recommended monitoring setup:

```typescript
// Performance metrics
metrics.histogram('publishing.duration', result.performanceMetrics.totalDuration);
metrics.histogram('publishing.artifact_size', result.performanceMetrics.artifactSize);
metrics.counter('publishing.success', { site: siteId });

// Error tracking
metrics.counter('publishing.failed', { 
  site: siteId, 
  state: failedState,
  reason: error.message 
});

// SLO violations
if (result.performanceMetrics.totalDuration > 90000) {
  alert.slo_violation('publishing_duration', result.performanceMetrics.totalDuration);
}
```

## Integration with Existing Systems

### Knowledge Base Refresh

The pipeline automatically triggers knowledge base updates:

```typescript
// Listen for publishing events
eventBus.on('site.published', async (event) => {
  await knowledgeBaseService.refreshSite({
    siteId: event.siteId,
    contractPaths: event.contractPaths,
    incremental: true
  });
});
```

### AI Agent Integration

The actions manifest is consumed by AI agents:

```typescript
// Load site actions for AI agent
const actionsManifest = await artifactStore.getObject(
  `${tenantId}/${siteId}/${releaseHash}/contract/actions.json`
);

const siteActions = JSON.parse(actionsManifest);
aiAgent.loadSiteActions(siteActions.actions);
```

## Development

### Running Tests

```bash
npm run test:publishing
```

### Local Development

Use MinIO for local artifact storage:

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

### Debugging

Enable debug logging:

```bash
DEBUG=sitespeak:publishing npm run dev
```

## API Reference

See individual adapter documentation:

- [ArtifactStore API](./adapters/README.md#artifact-store-api)
- [CDNProvider API](./adapters/README.md#cdn-provider-api)
- [SiteContract API](./app/README.md#site-contract-api)

## Security Considerations

- **Immutable Storage**: Prevents tampering with published releases
- **Presigned URLs**: Expire in ≤10 minutes, single-use for writes
- **Tenant Isolation**: All keys namespaced by tenant/site
- **Rate Limiting**: CDN operations are throttled
- **HTTPS Enforcement**: All operations require secure transport
- **Secret Management**: API keys never exposed to client-side

## Troubleshooting

### Common Issues

#### **"Immutable object already exists"**

- Release hash collision or duplicate deployment
- Use `--force-replace` flag for admin overrides

#### **"Health check failed"**

- Verify site is accessible at expected URL
- Check CDN purge completion
- Validate DNS propagation

#### **"CDN purge timeout"**

- Increase `CDN_PURGE_TIMEOUT` environment variable
- Check provider API status
- Fallback to cache expiration

#### **"Rollback failed"**

- Previous deployment may not exist
- Check artifact store connectivity
- Verify alias permissions

### Logs Analysis

All operations are logged with structured metadata:

```bash
# Filter by deployment
grep "deploymentId.*deploy_123" logs/publishing.log

# Performance analysis
grep "Pipeline state transition" logs/publishing.log | jq '.duration'

# Error investigation  
grep "ERROR.*publishing" logs/error.log | jq '.error'
```
