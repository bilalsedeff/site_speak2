# SiteSpeak Test Suite

Comprehensive testing strategy for the SiteSpeak platform including unit, integration, end-to-end, and performance tests.

## Test Structure

```plaintext
tests/
├── unit/               # Unit tests for individual functions and components
├── integration/        # Integration tests for API endpoints and services
├── e2e/               # End-to-end tests for complete user workflows
└── performance/       # Performance and load testing
```

## Testing Strategy

### Unit Tests (`/unit`)

Test individual functions, components, and classes in isolation:

- **Frontend Components**: React component behavior and rendering
- **Business Logic**: Pure functions and utility methods
- **Domain Entities**: Entity validation and business rules
- **Services**: Service layer methods with mocked dependencies

**Framework**: Jest with React Testing Library

```bash
npm run test              # Run all unit tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
```

### Integration Tests (`/integration`)

Test component interactions and external service integrations:

- **API Endpoints**: HTTP request/response handling
- **Database Operations**: Repository methods and queries
- **External Services**: OpenAI, Redis, file storage integrations
- **Message Queues**: Job processing and queue operations

**Framework**: Jest with Supertest for API testing

```bash
npm run test:integration  # Run integration tests
npm run test:db          # Database-specific tests
```

### End-to-End Tests (`/e2e`)

Test complete user workflows across the entire application:

- **Site Creation**: Complete site building workflow
- **Voice AI Interaction**: Voice command processing and responses
- **Publishing Flow**: Site publishing and deployment
- **Analytics Dashboard**: Real-time data visualization

**Framework**: Playwright for browser automation

```bash
npm run test:e2e         # Run E2E tests
npm run test:e2e:ui      # Run with UI for debugging
```

### Performance Tests (`/performance`)

Load and performance testing for critical paths:

- **API Performance**: Response time and throughput testing
- **Voice AI Latency**: Speech processing performance
- **Database Performance**: Query optimization validation
- **WebSocket Performance**: Real-time communication testing

**Framework**: Artillery for load testing

```bash
npm run test:performance  # Run performance tests
npm run test:load        # Run load tests with higher concurrency
```

## Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/integration/**/*.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'server/src/**/*.ts',
    'client/src/**/*.{ts,tsx}',
    'shared/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Playwright Configuration (`playwright.config.ts`)

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});
```

## Test Examples

### Unit Test Example

```typescript
// tests/unit/shared/validation.test.ts
import { validateWithSchema, isValidEmail } from '../../../shared/utils/validation';
import { z } from 'zod';

describe('Validation Utilities', () => {
  describe('validateWithSchema', () => {
    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email()
    });

    it('should validate correct data', () => {
      const data = { name: 'John', email: 'john@example.com' };
      const result = validateWithSchema(schema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('John');
        expect(result.data.email).toBe('john@example.com');
      }
    });

    it('should return errors for invalid data', () => {
      const data = { name: '', email: 'invalid' };
      const result = validateWithSchema(schema, data);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toHaveLength(2);
      }
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });
});
```

### Integration Test Example

```typescript
// tests/integration/api/sites.test.ts
import request from 'supertest';
import { app } from '../../../server/src/infrastructure/server';
import { db } from '../../../server/src/infrastructure/database';
import { createTestUser, createTestTenant } from '../../helpers/test-data';

describe('Sites API', () => {
  let authToken: string;
  let tenantId: string;

  beforeEach(async () => {
    await db.delete(usersTable); // Clean test data
    await db.delete(tenantsTable);
    
    const tenant = await createTestTenant();
    const user = await createTestUser({ tenantId: tenant.id });
    
    tenantId = tenant.id;
    authToken = generateTestToken(user);
  });

  describe('POST /api/sites', () => {
    it('should create a new site', async () => {
      const siteData = {
        name: 'Test Site',
        templateId: 'modern-business',
        category: 'business'
      };

      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send(siteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Site');
      expect(response.body.data.tenantId).toBe(tenantId);
    });

    it('should validate site data', async () => {
      const invalidData = {
        name: '', // Invalid: empty name
        templateId: 'nonexistent'
      };

      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });
});
```

### E2E Test Example

```typescript
// tests/e2e/site-creation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Site Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test user
    await page.goto('/login');
    await page.fill('[data-testid=email]', 'test@sitespeak.com');
    await page.fill('[data-testid=password]', 'testpass123');
    await page.click('[data-testid=login-button]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should create a site using voice commands', async ({ page }) => {
    // Navigate to site creation
    await page.click('[data-testid=create-site-button]');
    await expect(page).toHaveURL('/editor');

    // Enable voice assistant
    await page.click('[data-testid=voice-assistant-button]');
    
    // Grant microphone permission (in test environment)
    await page.evaluate(() => {
      navigator.permissions.query({name: 'microphone'}).then(() => {
        // Mock microphone permission
      });
    });

    // Test voice command simulation
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('voice-command', {
        detail: { command: 'Create a new business section' }
      }));
    });

    // Verify section was added
    await expect(page.locator('[data-testid=site-section]')).toBeVisible();
    
    // Save site
    await page.click('[data-testid=save-site-button]');
    await expect(page.locator('[data-testid=save-success]')).toBeVisible();
  });

  test('should publish site and generate voice widget', async ({ page }) => {
    // Create a basic site first
    await page.click('[data-testid=create-site-button]');
    await page.fill('[data-testid=site-name]', 'Test Business Site');
    await page.selectOption('[data-testid=template-select]', 'business');
    
    // Publish site
    await page.click('[data-testid=publish-button]');
    await expect(page.locator('[data-testid=publishing-progress]')).toBeVisible();
    
    // Wait for publishing to complete
    await expect(page.locator('[data-testid=publish-success]')).toBeVisible({
      timeout: 30000
    });
    
    // Verify voice widget is embedded
    const publishedUrl = await page.locator('[data-testid=published-url]').textContent();
    await page.goto(publishedUrl!);
    
    await expect(page.locator('[data-testid=voice-widget]')).toBeVisible();
  });
});
```

### Performance Test Example

```yaml
# tests/performance/api-load-test.yml
config:
  target: 'http://localhost:5000'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 20
  payload:
    path: './test-users.csv'
    fields:
      - email
      - password

scenarios:
  - name: Site CRUD Operations
    weight: 70
    flow:
      - post:
          url: '/api/auth/login'
          json:
            email: '{{ email }}'
            password: '{{ password }}'
          capture:
            - json: '$.data.accessToken'
              as: 'token'
      - get:
          url: '/api/sites'
          headers:
            Authorization: 'Bearer {{ token }}'
      - post:
          url: '/api/sites'
          headers:
            Authorization: 'Bearer {{ token }}'
          json:
            name: 'Load Test Site {{ $randomString() }}'
            templateId: 'modern-business'
            category: 'business'

  - name: Voice AI Interaction
    weight: 30
    flow:
      - post:
          url: '/api/voice/session'
          headers:
            Authorization: 'Bearer {{ token }}'
          json:
            siteId: '{{ siteId }}'
      - post:
          url: '/api/kb/search'
          headers:
            Authorization: 'Bearer {{ token }}'
          json:
            query: 'What are your business hours?'
            topK: 5
```

## Test Data Management

### Test Fixtures

```typescript
// tests/helpers/test-data.ts
export const createTestTenant = async (overrides: Partial<Tenant> = {}) => {
  const tenant = {
    name: 'Test Tenant',
    plan: 'free' as const,
    settings: {},
    limits: {
      maxSites: 3,
      maxKnowledgeBaseMB: 50,
      maxAITokensPerMonth: 200000,
      maxVoiceMinutesPerMonth: 30
    },
    ...overrides
  };
  
  return db.insert(tenantsTable).values(tenant).returning();
};

export const createTestUser = async (overrides: Partial<User> = {}) => {
  const user = {
    email: 'test@example.com',
    name: 'Test User',
    role: 'owner' as const,
    tenantId: await createTestTenant().then(t => t.id),
    preferences: {},
    ...overrides
  };
  
  return db.insert(usersTable).values(user).returning();
};
```

### Database Seeding

```typescript
// tests/helpers/database.ts
export const setupTestDatabase = async () => {
  // Run migrations
  await migrate(db, { migrationsFolder: './migrations' });
  
  // Seed test data
  await seedTestTenants();
  await seedTestUsers();
  await seedTestTemplates();
};

export const cleanupTestDatabase = async () => {
  await db.delete(conversationsTable);
  await db.delete(voiceSessionsTable);
  await db.delete(sitesTable);
  await db.delete(usersTable);
  await db.delete(tenantsTable);
};
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:coverage
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
```

## Testing Best Practices

1. **Test Pyramid**: More unit tests, fewer integration tests, minimal E2E tests
2. **Test Isolation**: Each test should be independent and not affect others
3. **Descriptive Names**: Test names should clearly describe what they're testing
4. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification
5. **Mock External Dependencies**: Use mocks for external services in unit tests
6. **Test Edge Cases**: Include tests for error conditions and boundary values
7. **Performance Considerations**: Monitor test execution time and optimize slow tests

## Coverage Goals

- **Unit Tests**: 90% code coverage
- **Integration Tests**: Cover all API endpoints and critical paths
- **E2E Tests**: Cover main user journeys and critical business flows
- **Performance Tests**: Validate response times under expected load

This comprehensive testing strategy ensures reliability, maintainability, and confidence in the SiteSpeak platform.
