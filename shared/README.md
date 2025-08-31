# SiteSpeak Shared Package

Common utilities, types, and schemas shared between client and server applications.

## Purpose

This package centralizes cross-cutting concerns to ensure consistency and reduce duplication between frontend and backend:

- **Type Definitions**: Shared TypeScript interfaces and types
- **Validation Schemas**: Zod schemas for runtime validation
- **Utilities**: Common helper functions and utilities
- **Constants**: Shared constants and enumerations

## Structure

```plaintext
shared/
├── types/              # TypeScript type definitions
│   ├── common.types.ts # Base types (BaseEntity, ApiResponse, etc.)
│   ├── user.types.ts   # User and authentication types
│   ├── site.types.ts   # Site and template types
│   ├── ai.types.ts     # AI and knowledge base types
│   └── voice.types.ts  # Voice AI and session types
├── schemas/            # Zod validation schemas
│   ├── common.schemas.ts
│   ├── user.schemas.ts
│   ├── site.schemas.ts
│   ├── ai.schemas.ts
│   └── voice.schemas.ts
├── utils/              # Shared utility functions
│   ├── validation.ts   # Validation helpers
│   ├── formatting.ts   # Text and data formatting
│   ├── crypto.ts       # Cryptographic utilities
│   ├── date.ts         # Date and time utilities
│   ├── string.ts       # String manipulation
│   └── logger.ts       # Logging utilities
└── constants/          # Shared constants
    ├── api.ts          # API endpoints and codes
    ├── validation.ts   # Validation rules and limits
    └── features.ts     # Feature flags and capabilities
```

## Type System

### Core Types

**BaseEntity**: Foundation for all database entities

```typescript
interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**ApiResponse**: Standardized API response format

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}
```

### Domain Types

**Site Types**: Website and template definitions

- Site configuration and metadata
- Template structure and components
- Publishing and deployment information
- Voice agent integration settings

**AI Types**: Machine learning and knowledge base

- Knowledge base management
- Vector embeddings and search
- Conversation and intent tracking
- Tool calling and action execution

**Voice Types**: Voice AI and real-time communication

- Voice sessions and interactions
- Audio processing and streaming
- Widget configuration and embedding
- Performance metrics and analytics

**User Types**: Authentication and user management

- User profiles and preferences
- Multi-tenant organization structure
- Role-based access control
- Session and token management

## Validation System

Uses Zod for runtime type validation with automatic TypeScript inference:

```typescript
// Define schema
const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['owner', 'admin', 'editor', 'viewer'])
});

// Infer TypeScript type
type User = z.infer<typeof UserSchema>;

// Runtime validation
const result = UserSchema.safeParse(userData);
if (result.success) {
  // data is fully typed as User
  console.log(result.data.email);
}
```

### Validation Utilities

```typescript
// Generic validation with detailed error reporting
function validateWithSchema<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T>

// Common validation functions
function isValidEmail(email: string): boolean
function isValidUrl(url: string): boolean
function isValidUuid(uuid: string): boolean
function validatePasswordStrength(password: string): PasswordValidation
```

## Utility Functions

### String Manipulation

```typescript
function slugify(text: string): string
function truncate(text: string, length: number): string
function sanitizeHtml(html: string): string
function extractPlainText(html: string): string
```

### Date and Time

```typescript
function formatRelativeTime(date: Date): string
function isDateInRange(date: Date, start: Date, end: Date): boolean
function addBusinessDays(date: Date, days: number): Date
function getTimezoneOffset(timezone: string): number
```

### Data Formatting

```typescript
function formatCurrency(amount: number, currency: string): string
function formatFileSize(bytes: number): string
function formatDuration(milliseconds: number): string
function formatPercentage(value: number, decimals?: number): string
```

### Cryptographic Utilities

```typescript
function generateSecureToken(length?: number): string
function hashPassword(password: string): Promise<string>
function verifyPassword(password: string, hash: string): Promise<boolean>
function encryptData(data: string, key: string): string
function decryptData(encryptedData: string, key: string): string
```

## Logging System

Framework-agnostic logging with consistent interface:

```typescript
interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  child(context: Record<string, any>): Logger;
}

// Usage
const logger = createLogger({ service: 'voice-ai' });
logger.info('Processing voice command', { 
  userId: '123', 
  command: 'create_section' 
});
```

### Security Features

- **Data Sanitization**: Removes sensitive information from logs
- **Error Formatting**: Consistent error object serialization
- **Context Preservation**: Maintains correlation IDs across requests

## Constants

### API Constants

```typescript
// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500
} as const;

// Error codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  // ... more codes
} as const;
```

### Feature Flags

```typescript
export const FEATURES = {
  VOICE_AI: 'voice_ai',
  ADVANCED_EDITOR: 'advanced_editor',
  ANALYTICS_DASHBOARD: 'analytics_dashboard',
  MULTI_LANGUAGE: 'multi_language'
} as const;
```

### Validation Rules

```typescript
export const VALIDATION_LIMITS = {
  USER_NAME_MAX_LENGTH: 100,
  SITE_NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  PASSWORD_MIN_LENGTH: 8,
  // ... more limits
} as const;
```

## Usage Examples

### Client-Side (React)

```typescript
import { Site, validateWithSchema, siteSchema } from '../shared';

function SiteEditor({ siteData }: { siteData: unknown }) {
  const validation = validateWithSchema(siteSchema, siteData);
  
  if (!validation.success) {
    return <ErrorDisplay errors={validation.errors} />;
  }
  
  // validation.data is fully typed as Site
  return <Editor site={validation.data} />;
}
```

### Server-Side (Node.js)

```typescript
import { ApiResponse, createLogger, sanitizeLogData } from '../shared';

const logger = createLogger({ service: 'sites-api' });

export async function createSite(data: unknown): Promise<ApiResponse<Site>> {
  try {
    const validation = validateWithSchema(createSiteSchema, data);
    if (!validation.success) {
      return {
        success: false,
        data: null,
        errors: validation.errors.map(e => e.message)
      };
    }
    
    const site = await siteRepository.create(validation.data);
    logger.info('Site created', sanitizeLogData({ siteId: site.id }));
    
    return { success: true, data: site };
  } catch (error) {
    logger.error('Failed to create site', { error });
    return {
      success: false,
      data: null,
      errors: ['Internal server error']
    };
  }
}
```

## Development Guidelines

1. **Type Safety**: All exports must be fully typed
2. **Framework Agnostic**: No React, Node.js, or browser-specific dependencies
3. **Validation First**: All data structures should have corresponding Zod schemas
4. **Performance**: Utility functions should be optimized for common use cases
5. **Security**: Sanitize sensitive data in logging and validation functions

## Testing

```bash
npm run test:shared       # Run shared package tests
npm run test:types        # Type checking
npm run test:schemas      # Schema validation tests
```

The shared package ensures consistency across the entire SiteSpeak application while maintaining clear separation of concerns.
