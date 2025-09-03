# Publishing Adapters

This directory contains infrastructure adapters for the SiteSpeak publishing system, providing clean abstractions over cloud storage and CDN services.

## Overview

The adapters follow the hexagonal architecture pattern, providing uniform interfaces over different cloud providers while maintaining the ability to swap implementations without affecting business logic.

```
┌─────────────────────────────────────────────────┐
│            Publishing Pipeline                  │
└─────────────────┬───────────────┬───────────────┘
                  │               │
                  ▼               ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │   ArtifactStore     │ │    CDNProvider      │
    │    Interface        │ │     Interface       │
    └─────────────────────┘ └─────────────────────┘
              │                       │
              ▼                       ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │  S3ArtifactStore    │ │ CloudflareCDNProvider│
    │  (AWS S3/R2/MinIO)  │ │ FastlyCDNProvider   │
    └─────────────────────┘ │ GenericCDNProvider  │
                            └─────────────────────┘
```

## Artifact Store Adapter

The `ArtifactStore` interface provides S3-compatible object storage with immutability guarantees and content-addressing.

### Supported Providers

| Provider | Features | Use Case |
|----------|----------|----------|
| **AWS S3** | Full S3 API, versioning, lifecycle | Enterprise production |
| **Cloudflare R2** | S3-compatible, no egress fees | Cost-optimized production |
| **MinIO** | Self-hosted, S3-compatible | Development, on-premises |

### Key Features

- **Immutable Storage**: Prevents overwriting published releases
- **Content Addressing**: SHA-256 based release keys
- **Presigned URLs**: Secure, time-limited upload/download
- **Blue/Green Aliases**: Atomic pointer switching
- **Multi-provider**: Consistent API across providers

### API Reference

#### Core Methods

```typescript
interface ArtifactStore {
  // Store object with immutability enforcement
  putObject(
    key: string, 
    body: Buffer | Readable, 
    options?: PutObjectOptions
  ): Promise<PutObjectResult>;

  // Retrieve object as stream
  getObject(key: string): Promise<Readable>;

  // Get object metadata without downloading
  headObject(key: string): Promise<HeadObjectResult>;

  // Generate secure upload URL
  presignPut(key: string, options: PresignedUrlOptions): Promise<PresignedPutResult>;

  // Generate secure download URL
  presignGet(key: string, expiresIn: number): Promise<PresignedGetResult>;

  // List objects with pagination
  listObjects(options?: ListObjectsOptions): Promise<ListObjectsResult>;

  // Blue/green deployment support
  setAlias(aliasKey: string, targetKey: string): Promise<void>;
  getAlias(aliasKey: string): Promise<string>;

  // Utilities
  exists(key: string): Promise<boolean>;
  getPublicUrl(key: string): Promise<string>;
  deletePrefix(prefix: string): Promise<void>;
}
```

#### Configuration Options

```typescript
interface ArtifactStoreConfig {
  provider: 'aws-s3' | 'cloudflare-r2' | 'minio';
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;           // For MinIO/R2
  forcePathStyle?: boolean;    // For MinIO
  publicBaseUrl?: string;      // For public access
}
```

### Usage Examples

#### Basic File Upload

```typescript
import { createArtifactStoreFromEnv } from './ArtifactStore';

const store = createArtifactStoreFromEnv();

// Upload with immutability protection
const result = await store.putObject(
  'tenant-1/site-abc/release-123/index.html',
  Buffer.from('<html>...</html>'),
  {
    contentType: 'text/html',
    cacheControl: 'public, max-age=31536000, immutable'
  }
);

console.log('Uploaded:', result.etag, result.url);
```

#### Presigned URL Generation

```typescript
// Generate upload URL for large files
const uploadUrl = await store.presignPut(
  'tenant-1/site-abc/release-123/large-file.zip',
  {
    expiresIn: 300, // 5 minutes
    contentType: 'application/zip',
    contentLength: 1024 * 1024 * 100 // 100MB
  }
);

// Client can now upload directly
console.log('Upload to:', uploadUrl.url);
```

#### Blue/Green Deployment

```typescript
// Point live alias to new release
await store.setAlias(
  'sites/tenant-1/site-abc/live',
  'releases/release-123'
);

// Instant rollback by pointing back
await store.setAlias(
  'sites/tenant-1/site-abc/live', 
  'releases/release-122'
);
```

### Provider-Specific Configuration

#### AWS S3

```bash
ARTIFACT_STORE_PROVIDER=aws-s3
AWS_REGION=us-east-1
AWS_BUCKET_NAME=sitespeak-artifacts
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
ARTIFACT_PUBLIC_URL=https://sitespeak-artifacts.s3.amazonaws.com
```

#### Cloudflare R2

```bash
ARTIFACT_STORE_PROVIDER=cloudflare-r2
R2_BUCKET=sitespeak-artifacts
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
```

#### MinIO

```bash
ARTIFACT_STORE_PROVIDER=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=sitespeak-artifacts
MINIO_REGION=us-east-1
```

---

## CDN Provider Adapter

The `CDNProvider` interface enables precise cache control and purging across different CDN providers.

### Supported Providers

| Provider | Purge Methods | Special Features |
|----------|---------------|------------------|
| **Cloudflare** | URL, Tag, Prefix, All | Global network, DDoS protection |
| **Fastly** | URL, Surrogate Key, All | VCL, real-time analytics |
| **Generic** | URL, Prefix | Custom HTTP endpoints |

### Key Features

- **Precise Purging**: URL, tag, and prefix-based cache invalidation
- **Preview URLs**: Deployment-specific testing URLs
- **Performance**: Sub-minute cache purging globally
- **Flexibility**: Support for custom CDN providers

### API Reference

#### Core Methods

```typescript
interface CDNProvider {
  // Purge specific URLs
  purgeUrls(urls: string[]): Promise<PurgeResult>;

  // Purge by tags/surrogate keys
  purgeByTag(tags: string[]): Promise<PurgeResult>;

  // Purge by URL prefix
  purgeByPrefix(prefix: string): Promise<PurgeResult>;

  // Nuclear option - purge everything
  purgeAll(): Promise<PurgeResult>;

  // Generate deployment preview URLs
  createPreviewUrl(
    originUrl: string, 
    releaseHash: string, 
    options?: PreviewUrlOptions
  ): Promise<string>;

  // Configure caching behavior
  setCachingRules(rules: CacheRule[]): Promise<void>;

  // Provider capabilities
  getEdgeLocations(): Promise<string[]>;
  validateConfiguration(): Promise<boolean>;
}
```

#### Result Types

```typescript
interface PurgeResult {
  success: boolean;
  purgedCount?: number;
  estimatedWaitTime?: number; // seconds
  errors?: string[];
}
```

### Usage Examples

#### Cache Invalidation

```typescript
import { createCDNProviderFromEnv } from './CDNProvider';

const cdn = createCDNProviderFromEnv();

// Purge specific URLs after deployment
await cdn.purgeUrls([
  'https://mysite.com/',
  'https://mysite.com/products',
  'https://mysite.com/sitemap.xml'
]);

// Purge by tags (Cloudflare/Fastly)
await cdn.purgeByTag([
  'site:mysite',
  'release:abc123',
  'category:products'
]);
```

#### Preview URL Generation

```typescript
// Create preview URL for testing
const previewUrl = await cdn.createPreviewUrl(
  'https://mysite.com',
  'release-abc123',
  {
    subdomain: 'preview',
    queryParams: { 'cache-bust': Date.now().toString() }
  }
);

// Result: https://preview.mysite.com?preview=release-abc123&cache-bust=1234567890
```

#### Cache Rule Management

```typescript
// Configure caching behavior
await cdn.setCachingRules([
  {
    pattern: '*.html',
    ttl: 0, // No cache for HTML
    headers: { 'Cache-Control': 'no-cache, must-revalidate' }
  },
  {
    pattern: '*.{js,css,png,jpg}',
    ttl: 31536000, // 1 year for assets
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }
  }
]);
```

### Provider-Specific Configuration

#### Cloudflare

```bash
CDN_PROVIDER=cloudflare
CLOUDFLARE_API_TOKEN=your-token-with-zone-cache-purge-permissions
CLOUDFLARE_ZONE_ID=your-zone-id
CDN_PURGE_TIMEOUT=30000
```

**Required Permissions:**
- `Zone:Cache Purge`
- `Zone:Zone Settings:Read`

#### Fastly

```bash
CDN_PROVIDER=fastly
FASTLY_API_KEY=your-api-key
FASTLY_SERVICE_ID=your-service-id
CDN_PURGE_TIMEOUT=30000
```

#### Generic CDN

```bash
CDN_PROVIDER=generic
CDN_PURGE_ENDPOINT=https://your-cdn.com/api/purge
CDN_PURGE_HEADERS={"Authorization":"Bearer your-token","Content-Type":"application/json"}
```

### Performance Characteristics

| Provider | URL Purge | Tag Purge | Global Propagation | Max URLs/Request |
|----------|-----------|-----------|-------------------|------------------|
| Cloudflare | ~30s | ~30s | ~30s | 30 |
| Fastly | ~5s | ~5s | ~10s | 256 |
| Generic | Varies | N/A | Varies | Varies |

### Error Handling

All CDN operations include comprehensive error handling:

```typescript
const result = await cdn.purgeUrls(urls);

if (!result.success) {
  console.error('Purge failed:', result.errors);
  
  if (result.errors?.some(e => e.includes('rate limit'))) {
    // Implement exponential backoff
    await new Promise(resolve => setTimeout(resolve, result.estimatedWaitTime * 1000));
  }
}
```

---

## Factory Functions

Both adapters provide factory functions for easy initialization:

### Environment-Based Creation

```typescript
// Automatically detects provider from environment
const artifactStore = createArtifactStoreFromEnv();
const cdnProvider = createCDNProviderFromEnv();
```

### Manual Configuration

```typescript
const artifactStore = createArtifactStore({
  provider: 'cloudflare-r2',
  region: 'auto',
  bucket: 'my-artifacts',
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  publicBaseUrl: 'https://pub-xxxx.r2.dev'
});

const cdnProvider = createCDNProvider({
  provider: 'cloudflare',
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN!,
  cloudflareZoneId: process.env.CLOUDFLARE_ZONE_ID!
});
```

## Testing

### Unit Tests

```bash
npm run test:adapters
```

### Integration Tests

```bash
# Requires real cloud credentials
INTEGRATION_TESTS=true npm run test:adapters
```

### Local Development

Use MinIO and mock CDN for development:

```typescript
// test/fixtures/minio-config.ts
export const testConfig = {
  provider: 'minio' as const,
  region: 'us-east-1',
  bucket: 'test-artifacts',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true
};
```

## Monitoring & Observability

### Metrics

Both adapters emit detailed metrics:

```typescript
// Artifact Store metrics
metrics.histogram('artifact_store.put_duration', duration);
metrics.histogram('artifact_store.object_size', size);
metrics.counter('artifact_store.puts', { provider, success: true });

// CDN metrics  
metrics.histogram('cdn.purge_duration', duration);
metrics.counter('cdn.purges', { provider, method: 'url', success: true });
```

### Health Checks

```typescript
// Validate configurations on startup
const storeHealthy = await artifactStore.validateConfiguration();
const cdnHealthy = await cdnProvider.validateConfiguration();

if (!storeHealthy || !cdnHealthy) {
  throw new Error('Publishing infrastructure not ready');
}
```

### Alerts

Recommended monitoring setup:

```yaml
# artifact_store_errors
- alert: ArtifactStoreErrors
  expr: rate(artifact_store_errors_total[5m]) > 0.01
  for: 2m
  annotations:
    summary: High error rate in artifact store operations

# cdn_purge_failures  
- alert: CDNPurgeFailures
  expr: rate(cdn_purge_failures_total[5m]) > 0.05
  for: 1m
  annotations:
    summary: CDN purge operations failing
```

## Security Best Practices

### Access Control

- Use least-privilege IAM policies
- Rotate credentials regularly
- Enable audit logging for all operations

### Network Security

- Use HTTPS/TLS for all communications
- Implement IP allowlisting where supported
- Enable VPC/private endpoints for cloud providers

### Data Protection

- Enable encryption in transit and at rest
- Implement integrity checking with checksums
- Use presigned URLs for temporary access

## Troubleshooting

### Common Issues

**"Access denied" errors:**
- Verify IAM permissions include required bucket/zone access
- Check credential format and expiration
- Validate region/endpoint configuration

**"Rate limit exceeded":**
- Implement exponential backoff with jitter
- Consider request batching
- Contact provider for limit increases

**"Presigned URL failures":**
- Verify clock synchronization (AWS requirement)
- Check URL expiration times
- Validate request signatures

### Debug Logging

Enable verbose logging:

```bash
DEBUG=sitespeak:artifact-store,sitespeak:cdn-provider npm run dev
```

### Provider Status Pages

Monitor provider health:
- [AWS Service Health](https://status.aws.amazon.com/)
- [Cloudflare Status](https://www.cloudflarestatus.com/)
- [Fastly Status](https://status.fastly.com/)

---

## Contributing

When adding new providers:

1. Implement the respective interface
2. Add comprehensive tests
3. Update configuration documentation
4. Add environment variable examples
5. Include provider-specific error handling