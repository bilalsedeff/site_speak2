# Content Extractors

This directory contains specialized content extractors that process crawled HTML content and extract structured information for AI agent consumption.

## Components

### HtmlExtractor.ts

Extracts visible content and structural elements:

- Main content identification using ARIA landmarks
- Heading hierarchy extraction (h1-h6) with semantic structure
- Table data extraction with headers and relationships  
- Text content cleaning and normalization
- Link discovery with internal/external classification
- Image metadata extraction (alt text, captions)
- Semantic region identification (main, navigation, aside)

### JsonLdExtractor.ts  

Parses JSON-LD structured data (Google's preferred method):

- Schema.org entity extraction (Product, Organization, FAQ, etc.)
- Multi-type entity support within single documents
- Validation against common schema patterns
- Relationship mapping between entities
- Fallback to microdata/RDFa when JSON-LD unavailable
- Error handling for malformed structured data

### ActionExtractor.ts

Discovers interactive elements and action hooks:

- `data-action` attribute parsing for deterministic actions
- Form analysis with field types and validation rules
- Button and link action classification
- Interactive widget discovery
- Event handler pattern recognition
- Navigation action mapping
- Commerce action identification (cart, checkout, etc.)

### FormExtractor.ts

Comprehensive form analysis and schema extraction:

- Field type detection and validation rules
- Required field identification
- Label association and accessibility checking
- Input constraint extraction (min, max, pattern)
- Multi-step form flow detection
- File upload capability detection
- Form security analysis (CSRF, validation)

## Usage

```typescript
import { createHtmlExtractor } from './HtmlExtractor';
import { createJsonLdExtractor } from './JsonLdExtractor';
import { createActionExtractor } from './ActionExtractor';
import { createFormExtractor } from './FormExtractor';

// Initialize extractors
const htmlExtractor = createHtmlExtractor();
const jsonLdExtractor = createJsonLdExtractor();
const actionExtractor = createActionExtractor();
const formExtractor = createFormExtractor();

// Extract content from HTML
const htmlContent = '<html>...</html>';
const canonicalUrl = 'https://example.com/page';

const results = await Promise.all([
  htmlExtractor.extractFromHtml(htmlContent, canonicalUrl),
  jsonLdExtractor.extractFromHtml(htmlContent, canonicalUrl),
  actionExtractor.extractFromHtml(htmlContent, canonicalUrl),
  formExtractor.extractFromHtml(htmlContent, canonicalUrl)
]);

const [htmlData, jsonLdData, actions, forms] = results;
```

## Extraction Results

### HTML Content Structure

```typescript
interface HtmlExtractionResult {
  title: string;
  headings: Array<{
    level: number;
    text: string;
    id?: string;
  }>;
  paragraphs: string[];
  links: Array<{
    text: string;
    href: string;
    internal: boolean;
    title?: string;
  }>;
  images: Array<{
    src: string;
    alt: string;
    caption?: string;
  }>;
  tables: Array<{
    headers: string[];
    rows: string[][];
    caption?: string;
  }>;
  landmarks: Array<{
    role: string;
    label?: string;
    content: string;
  }>;
}
```

### JSON-LD Entities

```typescript
interface JsonLdEntity {
  '@type': string;
  '@id'?: string;
  name?: string;
  description?: string;
  url?: string;
  image?: string | string[];
  [key: string]: any;
}
```

### Action Definitions  

```typescript
interface ExtractedAction {
  id: string;
  name: string;
  type: 'click' | 'form' | 'navigation' | 'custom';
  description: string;
  selector: string;
  parameters?: ActionParameter[];
  confirmation?: boolean;
  sideEffecting: 'safe' | 'idempotent' | 'unsafe';
}
```

### Form Schemas

```typescript
interface ExtractedForm {
  name: string;
  action: string;
  method: string;
  fields: Array<{
    name: string;
    type: string;
    label: string;
    required: boolean;
    validation?: ValidationRules;
  }>;
  submitActions: string[];
}
```

## Extraction Patterns

### Content Prioritization

The extractors prioritize content based on semantic importance:

1. **Primary Content**: Main article/product content in `<main>` or `role="main"`
2. **Navigation Elements**: Links in `<nav>` or `role="navigation"`  
3. **Supplementary Content**: Sidebars, related links, metadata
4. **Footer Content**: Contact info, legal links in `<footer>`

### Action Discovery

Actions are discovered through multiple signals:

```html
<!-- Direct data-action attributes -->
<button data-action="cart.add" data-product="123">Add to Cart</button>

<!-- Form submissions -->
<form action="/contact" method="post">
  <button type="submit">Send Message</button>
</form>

<!-- Navigation links -->
<a href="/products/laptop" class="product-link">View Laptop</a>

<!-- Interactive widgets -->
<div class="search-widget" data-widget="search">
  <input type="search" placeholder="Search products...">
</div>
```

### Structured Data Priority

1. **JSON-LD**: Preferred, most reliable
2. **Microdata**: Fallback with `itemscope`/`itemprop`
3. **RDFa**: Legacy support with `vocab`/`typeof`
4. **Meta Tags**: Open Graph, Twitter Cards

## Error Handling

All extractors include robust error handling:

- **Malformed HTML**: Graceful parsing with recovery
- **Missing Elements**: Default values and optional fields
- **Invalid Structured Data**: Validation with error logging
- **Large Content**: Memory-efficient streaming processing
- **Character Encoding**: Automatic encoding detection

## Configuration

### Extraction Options

```typescript
interface ExtractionOptions {
  maxContentLength?: number;
  includeImages?: boolean;
  followLinks?: boolean;
  validateStructuredData?: boolean;
  extractMetadata?: boolean;
  language?: string;
}
```

### Content Filtering

```typescript
interface ContentFilters {
  excludeSelectors?: string[];
  includeSelectors?: string[];
  minTextLength?: number;
  maxNestingDepth?: number;
}
```

## Performance Optimization

- **Streaming Processing**: Large documents processed in chunks
- **Selective Extraction**: Only extract requested content types
- **Caching**: Parsed DOM trees cached for multiple extractors
- **Memory Management**: Automatic cleanup of large objects
- **Parallel Processing**: Independent extractors run concurrently

## Quality Assurance

### Content Validation

- Text content cleaned and normalized
- HTML entity decoding
- Whitespace normalization
- Duplicate content removal

### Structured Data Validation  

- Schema.org type validation
- Required property checking
- Data type validation
- Relationship consistency

### Accessibility Compliance

- ARIA landmark detection
- Alternative text validation
- Form label association
- Keyboard navigation support

## Integration

The extractors integrate with:

- **Crawl Orchestrator**: Automated extraction pipeline
- **Knowledge Base**: Structured content storage
- **Action System**: Interactive element registration
- **Site Contracts**: Self-describing site generation
- **Search Index**: Semantic content indexing
