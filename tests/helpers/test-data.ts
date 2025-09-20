/**
 * Test Data Helpers
 *
 * Utilities for creating and managing test data across all test types.
 * Provides consistent test data generation for database entities.
 */

import { faker } from '@faker-js/faker';
import { randomUUID } from 'crypto';

// Database table types (simplified for testing)
export interface TestUser {
  id?: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  tenantId: string;
  preferences?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestTenant {
  id?: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings?: Record<string, any>;
  limits: {
    maxSites: number;
    maxKnowledgeBaseMB: number;
    maxAITokensPerMonth: number;
    maxVoiceMinutesPerMonth: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestSite {
  id?: string;
  name: string;
  templateId: string;
  category: string;
  tenantId: string;
  ownerId: string;
  status: 'draft' | 'published' | 'archived';
  publishedUrl?: string;
  settings?: Record<string, any>;
  content?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestKnowledgeBaseEntry {
  id?: string;
  siteId: string;
  tenantId: string;
  title: string;
  content: string;
  url: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  lastCrawledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestVoiceSession {
  id?: string;
  siteId: string;
  tenantId: string;
  sessionId: string;
  userId?: string;
  status: 'active' | 'completed' | 'failed';
  transcript?: string;
  response?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Generate test tenant data
 */
export const createTestTenant = (overrides: Partial<TestTenant> = {}): TestTenant => {
  return {
    id: randomUUID(),
    name: faker.company.name(),
    plan: faker.helpers.arrayElement(['free', 'pro', 'enterprise']),
    settings: {
      timezone: 'UTC',
      language: 'en-US',
      theme: 'light'
    },
    limits: {
      maxSites: 5,
      maxKnowledgeBaseMB: 100,
      maxAITokensPerMonth: 50000,
      maxVoiceMinutesPerMonth: 120
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

/**
 * Generate test user data
 */
export const createTestUser = (overrides: Partial<TestUser> = {}): TestUser => {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();

  return {
    id: randomUUID(),
    email: faker.internet.email({ firstName, lastName }),
    name: `${firstName} ${lastName}`,
    role: faker.helpers.arrayElement(['owner', 'admin', 'editor', 'viewer']),
    tenantId: randomUUID(),
    preferences: {
      emailNotifications: true,
      voiceEnabled: true,
      theme: 'light'
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

/**
 * Generate test site data
 */
export const createTestSite = (overrides: Partial<TestSite> = {}): TestSite => {
  return {
    id: randomUUID(),
    name: faker.company.name(),
    templateId: faker.helpers.arrayElement(['modern-business', 'portfolio', 'blog', 'ecommerce']),
    category: faker.helpers.arrayElement(['business', 'personal', 'ecommerce', 'blog']),
    tenantId: randomUUID(),
    ownerId: randomUUID(),
    status: faker.helpers.arrayElement(['draft', 'published', 'archived']),
    publishedUrl: faker.internet.url(),
    settings: {
      theme: 'modern',
      primaryColor: '#3B82F6',
      voiceEnabled: true
    },
    content: {
      pages: [
        {
          id: 'home',
          title: 'Home',
          components: []
        }
      ]
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

/**
 * Generate test knowledge base entry
 */
export const createTestKnowledgeBaseEntry = (overrides: Partial<TestKnowledgeBaseEntry> = {}): TestKnowledgeBaseEntry => {
  return {
    id: randomUUID(),
    siteId: randomUUID(),
    tenantId: randomUUID(),
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(3),
    url: faker.internet.url(),
    metadata: {
      type: 'page',
      importance: faker.number.float({ min: 0, max: 1 }),
      lastModified: new Date().toISOString()
    },
    embedding: Array.from({ length: 1536 }, () => faker.number.float({ min: -1, max: 1 })),
    lastCrawledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

/**
 * Generate test voice session
 */
export const createTestVoiceSession = (overrides: Partial<TestVoiceSession> = {}): TestVoiceSession => {
  return {
    id: randomUUID(),
    siteId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: `session_${randomUUID()}`,
    userId: randomUUID(),
    status: faker.helpers.arrayElement(['active', 'completed', 'failed']),
    transcript: faker.lorem.sentence(),
    response: faker.lorem.paragraph(),
    metadata: {
      duration: faker.number.int({ min: 5000, max: 30000 }),
      language: 'en-US',
      confidence: faker.number.float({ min: 0.7, max: 1.0 })
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

/**
 * Generate multiple test records
 */
export const generateTestTenants = (count: number, overrides: Partial<TestTenant> = {}): TestTenant[] => {
  return Array.from({ length: count }, () => createTestTenant(overrides));
};

export const generateTestUsers = (count: number, overrides: Partial<TestUser> = {}): TestUser[] => {
  return Array.from({ length: count }, () => createTestUser(overrides));
};

export const generateTestSites = (count: number, overrides: Partial<TestSite> = {}): TestSite[] => {
  return Array.from({ length: count }, () => createTestSite(overrides));
};

export const generateTestKnowledgeBaseEntries = (count: number, overrides: Partial<TestKnowledgeBaseEntry> = {}): TestKnowledgeBaseEntry[] => {
  return Array.from({ length: count }, () => createTestKnowledgeBaseEntry(overrides));
};

export const generateTestVoiceSessions = (count: number, overrides: Partial<TestVoiceSession> = {}): TestVoiceSession[] => {
  return Array.from({ length: count }, () => createTestVoiceSession(overrides));
};

/**
 * Create a complete test scenario with related entities
 */
export const createTestScenario = () => {
  const tenant = createTestTenant();
  const owner = createTestUser({
    tenantId: tenant.id!,
    role: 'owner'
  });
  const site = createTestSite({
    tenantId: tenant.id!,
    ownerId: owner.id!
  });
  const kbEntries = generateTestKnowledgeBaseEntries(3, {
    siteId: site.id!,
    tenantId: tenant.id!
  });
  const voiceSessions = generateTestVoiceSessions(2, {
    siteId: site.id!,
    tenantId: tenant.id!,
    userId: owner.id!
  });

  return {
    tenant,
    owner,
    site,
    kbEntries,
    voiceSessions
  };
};

/**
 * Predefined test data for consistent testing
 */
export const PREDEFINED_TEST_DATA = {
  tenant: createTestTenant({
    name: 'Test Company Ltd',
    plan: 'pro'
  }),

  user: createTestUser({
    email: 'test@sitespeak.com',
    name: 'Test User',
    role: 'owner'
  }),

  site: createTestSite({
    name: 'E2E Test Site',
    templateId: 'modern-business',
    category: 'business',
    status: 'published'
  }),

  voiceCommands: [
    'Create a new section',
    'Add a contact form',
    'Change the background color',
    'Navigate to the home page',
    'Show me the analytics',
    'Add a button',
    'Delete this component',
    'Save the site',
    'Publish the site',
    'Go back'
  ]
};