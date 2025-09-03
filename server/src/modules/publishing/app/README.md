# Publishing Application Layer

The application layer contains the core business logic for SiteSpeak's publishing system, orchestrating atomic deployments and generating comprehensive site contracts.

## Components

### 1. Publishing Pipeline (`PublishingPipeline.ts`)

The central orchestrator implementing a state machine for atomic, blue/green deployments.

### 2. Site Contract Generator (`siteContract.ts`)

Generates comprehensive site contracts including JSON-LD, ARIA audits, action manifests, sitemaps, and GraphQL schemas.

---

## Publishing Pipeline API

The `PublishingPipeline` class implements the complete deployment workflow with atomic rollback capabilities.

### State Machine

```plaintext
Draft → Building → Contracting → Packaging → Uploading → Activating 
  ↓       ↓          ↓           ↓           ↓           ↓
  →  →  →  →  →  →  →  →  →  →  →  →  →  →  →  ↓
                                              ↓
  ←  ←  ←  ←  ←  ←  ←  ←  (on failure)  ←  ←  ↓
                                              ↓
  Rolling Back ←  ←  ←  ←  ←  ←  ←  ←  ←  ←  ↓
      ↓                                     ↓
  Rolled Back                          Warming → Verifying → Announcing → Succeeded
```

### Core Methods

#### `publish(request: PublishRequest): Promise<DeploymentResult>`

Executes the complete publishing pipeline with atomic guarantees.

```typescript
const pipeline = createPublishingPipeline(artifactStore, cdnProvider, eventBus);

const result = await pipeline.publish({
  siteId: 'ecommerce-site',
  tenantId: 'customer-123',
  deploymentIntent: 'production',
  commitSha: 'a1b2c3d4',
  buildParams: {
    environment: 'production',
    features: ['shopping-cart', 'inventory-sync'],
    customDomain: 'shop.example.com'
  },
  previousDeploymentId: 'deploy_1698765432_xyz789' // For rollback capability
});

console.log('Deployment successful:', {
  deploymentId: result.deploymentId,
  releaseHash: result.releaseHash,
  totalDuration: result.performanceMetrics.totalDuration,
  cdnUrls: result.cdnUrls,
  contractPaths: result.contractPaths
});
```

#### `rollback(context: PipelineContext): Promise<void>`

Performs instant rollback to the previous deployment.

```typescript
// Automatic rollback on failure or manual rollback
await pipeline.rollback({
  deploymentId: 'current-failed-deployment',
  request: originalRequest,
  // ... other context properties
});
```

### Request Types

```typescript
interface PublishRequest {
  siteId: string;                    // Unique site identifier
  tenantId: string;                  // Tenant namespace
  deploymentIntent: DeploymentIntent; // 'preview' | 'production'
  commitSha?: string;                // Git commit reference
  buildParams?: BuildParams;         // Build configuration
  previousDeploymentId?: string;     // For rollback support
}

interface BuildParams {
  environment: 'development' | 'staging' | 'production';
  features?: string[];               // Feature flags
  customDomain?: string;             // Custom domain override
  buildOptions?: Record<string, any>; // Provider-specific options
}
```

### Result Types

```typescript
interface DeploymentResult {
  deploymentId: string;              // Unique deployment ID
  releaseHash: string;               // Content-addressed release hash
  cdnUrls: CDNUrls;                 // Access URLs
  contractPaths: ContractPaths;      // Generated contract files
  sbom?: SBOM;                      // Software Bill of Materials
  buildLogs?: string[];              // Build output logs
  performanceMetrics: PerformanceMetrics; // Timing data
}

interface PerformanceMetrics {
  buildDuration: number;             // Build step timing
  contractDuration: number;          // Contract generation timing
  packageDuration: number;           // Packaging timing
  uploadDuration: number;            // Upload timing
  activationDuration: number;        // Blue/green switch timing
  warmDuration: number;              // Cache warming timing
  verifyDuration: number;            // Health check timing
  totalDuration: number;             // End-to-end timing
  artifactSize: number;              // Total bytes uploaded
  fileCount: number;                 // Number of files processed
}
```

### Pipeline Events

The pipeline emits events throughout execution for monitoring and integration:

```typescript
eventBus.on('pipeline.state_changed', (event) => {
  console.log(`${event.siteId} transition: ${event.previousState} → ${event.currentState}`);
});

eventBus.on('site.published', (event) => {
  // Trigger knowledge base refresh
  await knowledgeBaseService.refreshSite(event.siteId, event.releaseHash);
});

eventBus.on('kb.refreshRequested', (event) => {
  // Handle downstream refresh requests
  await crawlerService.scheduleRefresh(event.siteId);
});
```

### Error Handling

The pipeline implements comprehensive error recovery:

- **Idempotent Steps**: All transitions can be safely retried
- **Automatic Rollback**: Failed activations trigger immediate rollback
- **Timeout Protection**: Each step has configurable timeouts
- **State Persistence**: Pipeline state is maintained for debugging

```typescript
try {
  const result = await pipeline.publish(request);
} catch (error) {
  if (error.code === 'ROLLBACK_COMPLETED') {
    console.log('Deployment failed but rollback successful');
  } else {
    console.error('Pipeline failed:', error.message);
    // Check pipeline state for debugging
    console.error('Failed at state:', error.pipelineState);
  }
}
```

---

## Site Contract Generator API

The `SiteContractGenerator` creates comprehensive, self-describing contracts for published sites.

### Contract Components

Every site contract includes:

1. **Sitemap XML** - W3C compliant with image support and lastmod
2. **JSON-LD Structured Data** - Products, articles, FAQs, organizations
3. **Actions Manifest** - AI-consumable action definitions
4. **ARIA Audit Report** - Accessibility compliance validation
5. **Speculation Rules** - Modern browser prefetching configuration
6. **GraphQL Schema** - Type-safe API with generated TypeScript types
7. **Performance Hints** - Resource optimization recommendations

### Core Method

#### `generateContract(request: SiteContractRequest): Promise<SiteContractResult>`

Generates a complete site contract from page definitions.

```typescript
import { siteContractGenerator } from './siteContract';

const contract = await siteContractGenerator.generateContract({
  siteId: 'ecommerce-store',
  tenantId: 'tenant-456',
  domain: 'shop.example.com',
  pages: [
    {
      id: 'home',
      path: '/',
      title: 'Premium Online Store',
      description: 'Discover our curated collection of premium products',
      lastModified: new Date('2024-01-15'),
      components: [
        {
          id: 'header',
          type: 'header',
          properties: { title: 'Premium Store' },
          ariaRole: 'banner',
          landmark: true
        },
        {
          id: 'hero',
          type: 'hero',
          properties: {
            title: 'Welcome to Our Store',
            subtitle: 'Discover amazing products',
            ctaText: 'Shop Now'
          },
          actions: [{
            id: 'hero-cta',
            name: 'shop.browse',
            type: 'navigate',
            selector: '[data-action="hero-cta"]',
            description: 'Navigate to product catalog'
          }],
          ariaRole: 'main',
          landmark: true
        }
      ],
      meta: {
        keywords: ['ecommerce', 'premium', 'products'],
        canonical: 'https://shop.example.com/',
        ogImage: 'https://shop.example.com/images/hero.jpg'
      },
      navigation: {
        breadcrumbs: [
          { name: 'Home', url: '/', position: 1 }
        ]
      }
    },
    {
      id: 'product-1',
      path: '/products/premium-widget',
      title: 'Premium Widget - Limited Edition',
      description: 'Hand-crafted premium widget with lifetime warranty',
      lastModified: new Date('2024-01-10'),
      components: [
        {
          id: 'product-details',
          type: 'product',
          properties: {
            name: 'Premium Widget',
            description: 'Hand-crafted premium widget with lifetime warranty',
            price: 299.99,
            currency: 'USD',
            images: [
              'https://shop.example.com/images/widget-1.jpg',
              'https://shop.example.com/images/widget-2.jpg'
            ],
            availability: 'https://schema.org/InStock',
            brand: 'Premium Brand',
            sku: 'PWD-001'
          },
          actions: [{
            id: 'add-to-cart',
            name: 'cart.add',
            type: 'click',
            selector: '[data-action="cart.add"]',
            parameters: [
              { name: 'productId', type: 'string', required: true },
              { name: 'quantity', type: 'number', required: false }
            ],
            description: 'Add product to shopping cart'
          }]
        }
      ],
      meta: {
        keywords: ['widget', 'premium', 'limited-edition'],
        canonical: 'https://shop.example.com/products/premium-widget'
      }
    }
  ],
  siteConfig: {
    name: 'Premium Online Store',
    description: 'Your destination for premium, hand-crafted products',
    logo: 'https://shop.example.com/logo.png',
    language: 'en',
    timezone: 'America/New_York',
    contactInfo: {
      email: 'hello@shop.example.com',
      phone: '+1-555-123-4567',
      address: '123 Commerce St, Business City, BC 12345'
    },
    socialMedia: {
      facebook: 'https://facebook.com/premiumstore',
      instagram: 'https://instagram.com/premiumstore',
      twitter: 'https://twitter.com/premiumstore'
    }
  },
  buildMetadata: {
    version: '2.1.0',
    buildTime: new Date(),
    environment: 'production',
    features: ['shopping-cart', 'inventory-sync', 'reviews']
  }
});

console.log('Contract generated:', {
  sitemapUrls: contract.sitemap.urls.length,
  jsonLdTypes: contract.jsonLdData.map(schema => schema['@type']),
  actions: contract.actionsManifest.actions.length,
  ariaScore: contract.audit.ariaLandmarks.score,
  files: Object.keys(contract.files)
});
```

### Generated Files

The contract generator produces ready-to-serve files:

```typescript
// Access generated files
const { files } = contract;

// Sitemap XML with image support
console.log(files['sitemap.xml']);
/*
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://shop.example.com/products/premium-widget</loc>
    <lastmod>2024-01-10T00:00:00.000Z</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <image:image>
      <image:loc>https://shop.example.com/images/widget-1.jpg</image:loc>
      <image:title><![CDATA[Premium Widget product image]]></image:title>
    </image:image>
    <image:image>
      <image:loc>https://shop.example.com/images/widget-2.jpg</image:loc>
      <image:title><![CDATA[Premium Widget product image]]></image:title>
    </image:image>
  </url>
</urlset>
*/

// Actions manifest for AI consumption
const actionsManifest = JSON.parse(files['actions.json']);
console.log(actionsManifest.actions[0]);
/*
{
  "id": "product-1_product-details_add-to-cart",
  "name": "cart.add",
  "description": "Add product to shopping cart",
  "type": "click",
  "selector": "[data-action=\"cart.add\"]",
  "parameters": [
    { "name": "productId", "type": "string", "required": true },
    { "name": "quantity", "type": "number", "required": false }
  ],
  "examples": [{
    "description": "Add product to cart",
    "parameters": { "productId": "PWD-001", "quantity": 1 },
    "expectedResult": "Product added to shopping cart"
  }]
}
*/

// Consolidated JSON-LD structured data
const structuredData = JSON.parse(files['structured-data.json']);
console.log(structuredData.find(s => s['@type'] === 'Product'));
/*
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Premium Widget",
  "description": "Hand-crafted premium widget with lifetime warranty",
  "url": "https://shop.example.com/products/premium-widget",
  "image": [
    "https://shop.example.com/images/widget-1.jpg",
    "https://shop.example.com/images/widget-2.jpg"
  ],
  "brand": "Premium Brand",
  "sku": "PWD-001"
}
*/

// GraphQL schema and TypeScript types
console.log(files['schema.graphql']);
/*
type Query {
  site: Site
  pages: [Page!]!
  page(path: String!): Page
  products: [Product!]!
  product(id: ID!): Product
}

type Product {
  id: ID!
  name: String!
  description: String
  price: Float
  images: [String!]!
  availability: String
}
*/
```

### JSON-LD Schema Types

The contract generator supports comprehensive structured data:

| Schema Type | Use Case | Required Fields |
|-------------|----------|-----------------|
| **Website** | Site identity | name, url |
| **Organization** | Business info | name, url, contactPoint |
| **Product** | E-commerce items | name, image, offers |
| **Offer** | Product pricing | price, priceCurrency, availability |
| **BlogPosting** | Content articles | headline, datePublished, author |
| **FAQPage** | Question pages | mainEntity |
| **BreadcrumbList** | Navigation | itemListElement |
| **SearchAction** | Site search | target, query-input |

### ARIA Audit

The generator performs comprehensive accessibility validation:

```typescript
const { audit } = contract;

console.log('ARIA Audit Results:');
console.log(`Score: ${audit.ariaLandmarks.score}/100`);
console.log(`Landmarks found: ${audit.ariaLandmarks.landmarks.length}`);
console.log(`Issues: ${audit.ariaLandmarks.issues.length}`);

// Review issues
audit.ariaLandmarks.issues.forEach(issue => {
  console.log(`${issue.severity}: ${issue.message} (${issue.pageId})`);
});
/*
error: Missing required ARIA landmark: main (product-detail)
warning: Missing required ARIA landmark: banner (contact)
*/
```

### Performance Hints

Generated performance recommendations:

```typescript
const { performance } = contract.audit;

// Resource hints for HTML head
performance.resourceHints.forEach(hint => {
  console.log(`<link rel="${hint.rel}" href="${hint.href}"${hint.as ? ` as="${hint.as}"` : ''}${hint.crossorigin ? ' crossorigin' : ''}>`);
});
/*
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="dns-prefetch" href="//cdn.sitespeak.com">
<link rel="preload" href="https://shop.example.com/logo.png" as="image">
*/

// Speculation rules for prefetching
const speculationRules = JSON.parse(files['speculation-rules.json']);
console.log(speculationRules);
/*
{
  "prefetch": [
    {
      "where": { "href_matches": "/products" },
      "eagerness": "moderate"
    }
  ],
  "prerender": [
    {
      "where": { "href_matches": "/" },
      "eagerness": "conservative"
    }
  ]
}
*/
```

### Integration with AI Systems

The generated actions manifest integrates seamlessly with AI agents:

```typescript
// Load site capabilities into AI agent
const { actionsManifest } = contract;

// Convert to OpenAI function definitions
const openAIFunctions = actionsManifest.actions.map(action => ({
  name: action.name,
  description: action.description,
  parameters: {
    type: 'object',
    properties: action.parameters?.reduce((props, param) => ({
      ...props,
      [param.name]: {
        type: param.type,
        description: param.description
      }
    }), {}) || {},
    required: action.parameters?.filter(p => p.required).map(p => p.name) || []
  }
}));

// Register with AI agent
aiAgent.registerSiteActions(contract.request.siteId, openAIFunctions);
```

---

## Configuration & Customization

### Component Type Mapping

Extend the contract generator with custom component types:

```typescript
// In siteContract.ts, extend componentToSchema method
private componentToSchema(component: ComponentDefinition, page: PageDefinition, request: SiteContractRequest): JsonLdStructuredData | null {
  switch (component.type) {
    case 'product':
      return this.generateProductSchema(component, page, request);
    
    case 'recipe':
      return {
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: component.properties.name,
        description: component.properties.description,
        recipeIngredient: component.properties.ingredients,
        recipeInstructions: component.properties.instructions.map((step: string, index: number) => ({
          '@type': 'HowToStep',
          text: step,
          position: index + 1
        })),
        nutrition: component.properties.nutrition && {
          '@type': 'NutritionInformation',
          calories: component.properties.nutrition.calories
        }
      };
    
    case 'event':
      return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: component.properties.name,
        description: component.properties.description,
        startDate: component.properties.startDate,
        endDate: component.properties.endDate,
        location: {
          '@type': 'Place',
          name: component.properties.venue,
          address: component.properties.address
        }
      };
    
    default:
      return null;
  }
}
```

### Custom Action Types

Define domain-specific actions:

```typescript
interface CustomActionDefinition extends ActionDefinition {
  domain: 'ecommerce' | 'booking' | 'content';
  sideEffects?: 'read' | 'write' | 'navigate';
  rateLimit?: { requests: number; window: number }; // per window (seconds)
}

// Example: Booking system actions
const bookingActions: CustomActionDefinition[] = [
  {
    id: 'booking-check-availability',
    name: 'booking.checkAvailability',
    type: 'api',
    domain: 'booking',
    sideEffects: 'read',
    selector: '[data-action="check-availability"]',
    parameters: [
      { name: 'date', type: 'string', required: true, description: 'ISO date string' },
      { name: 'guests', type: 'number', required: true, description: 'Number of guests' },
      { name: 'duration', type: 'number', required: false, description: 'Hours duration' }
    ],
    description: 'Check availability for booking date and guest count',
    rateLimit: { requests: 60, window: 60 }
  }
];
```

---

## Monitoring & Debugging

### Performance Metrics

Both components emit detailed timing metrics:

```typescript
// Pipeline metrics
metrics.histogram('publishing.pipeline.duration', totalDuration, {
  site: siteId,
  intent: deploymentIntent,
  success: true
});

metrics.histogram('publishing.step.duration', stepDuration, {
  site: siteId,
  step: 'contracting',
  success: true
});

// Contract generation metrics
metrics.histogram('contract.generation.duration', duration, {
  site: siteId,
  pages: pageCount,
  components: componentCount
});

metrics.counter('contract.structured_data.types', jsonLdData.length, {
  site: siteId,
  types: JSON.stringify(types)
});
```

### Debug Information

Enable detailed logging:

```bash
DEBUG=sitespeak:publishing-pipeline,sitespeak:site-contract npm run dev
```

Access pipeline context for debugging:

```typescript
// In development, access pipeline context
if (process.env.NODE_ENV === 'development') {
  console.log('Pipeline Context:', JSON.stringify(context, null, 2));
  console.log('Step Metrics:', context.stepMetrics);
  console.log('State History:', context.stateHistory);
}
```

---

## Testing

### Unit Tests

```bash
# Test pipeline state transitions
npm run test:pipeline

# Test contract generation
npm run test:contract

# Test specific scenarios
npm run test -- --grep "blue/green deployment"
```

### Integration Tests

```bash
# End-to-end publishing flow
npm run test:integration:publishing

# Contract validation
npm run test:integration:contract
```

### Example Test Cases

```typescript
describe('PublishingPipeline', () => {
  it('should perform atomic blue/green deployment', async () => {
    const result = await pipeline.publish(publishRequest);
    
    // Verify atomic activation
    expect(result.deploymentId).toBeDefined();
    expect(result.releaseHash).toMatch(/^[a-f0-9]{64}$/);
    
    // Verify alias pointing
    const aliasTarget = await artifactStore.getAlias(
      `sites/${publishRequest.tenantId}/${publishRequest.siteId}/live`
    );
    expect(aliasTarget).toBe(`releases/${result.releaseHash}`);
  });

  it('should rollback on activation failure', async () => {
    // Mock activation failure
    mockArtifactStore.setAlias.mockRejectedValueOnce(new Error('Activation failed'));
    
    await expect(pipeline.publish(publishRequest)).rejects.toThrow();
    
    // Verify rollback occurred
    const aliasTarget = await artifactStore.getAlias(aliasKey);
    expect(aliasTarget).toBe(previousDeploymentAlias);
  });
});

describe('SiteContractGenerator', () => {
  it('should generate valid JSON-LD for products', async () => {
    const contract = await generator.generateContract(requestWithProducts);
    
    const productSchema = contract.jsonLdData.find(s => s['@type'] === 'Product');
    expect(productSchema).toBeDefined();
    expect(productSchema.name).toBeDefined();
    expect(productSchema.offers).toBeDefined();
  });

  it('should create image sitemap entries', async () => {
    const contract = await generator.generateContract(requestWithImages);
    
    const urlWithImages = contract.sitemap.urls.find(u => u.images?.length > 0);
    expect(urlWithImages).toBeDefined();
    expect(urlWithImages.images[0]).toHaveProperty('loc');
    expect(urlWithImages.images[0]).toHaveProperty('title');
  });
});
```

This comprehensive documentation covers all aspects of the publishing application layer, providing developers with the knowledge needed to effectively use, extend, and maintain the system.
