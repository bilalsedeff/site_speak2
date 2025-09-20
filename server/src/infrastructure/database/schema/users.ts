import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean, index, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { tenants } from './tenants';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  avatar: text('avatar'), // URL to avatar image
  
  // Authentication
  passwordHash: varchar('password_hash', { length: 255 }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  emailVerificationToken: varchar('email_verification_token', { length: 255 }),
  
  // Password reset
  passwordResetToken: varchar('password_reset_token', { length: 255 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
  
  // User status
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'inactive', 'suspended', 'pending_verification'
  role: varchar('role', { length: 20 }).notNull().default('owner'), // 'owner', 'admin', 'editor', 'viewer'
  
  // Tenant association
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  
  // Login tracking
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastLoginIp: varchar('last_login_ip', { length: 45 }),
  loginCount: integer('login_count').notNull().default(0),
  
  // User preferences
  preferences: jsonb('preferences').notNull().default({}),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('idx_users_email').on(table.email),
  index('idx_users_tenant').on(table.tenantId),
  index('idx_users_status').on(table.status),
]);

export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Session data
  sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 255 }),
  
  // Session metadata
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  country: varchar('country', { length: 2 }),
  city: varchar('city', { length: 100 }),
  
  // Session lifecycle
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_user_sessions_token').on(table.sessionToken),
  index('idx_user_sessions_user').on(table.userId),
  index('idx_user_sessions_expires').on(table.expiresAt),
]);

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  
  // Language and localization
  language: varchar('language', { length: 5 }).notNull().default('en'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
  dateFormat: varchar('date_format', { length: 20 }).default('MM/DD/YYYY'),
  timeFormat: varchar('time_format', { length: 10 }).default('12h'), // '12h' or '24h'
  
  // UI preferences
  theme: varchar('theme', { length: 10 }).notNull().default('system'), // 'light', 'dark', 'system'
  sidebarCollapsed: boolean('sidebar_collapsed').default(false),
  
  // Notification preferences
  emailNotifications: jsonb('email_notifications').notNull().default({
    sitePublished: true,
    voiceInteractions: true,
    monthlyReports: true,
    securityAlerts: true,
    productUpdates: false,
  }),
  
  pushNotifications: jsonb('push_notifications').notNull().default({
    enabled: false,
    siteEvents: false,
    voiceAlerts: false,
  }),
  
  // Editor preferences
  editorSettings: jsonb('editor_settings').notNull().default({
    autoSave: true,
    gridSnapping: true,
    showGuides: true,
    defaultTemplate: 'modern',
    favoriteComponents: [],
  }),
  
  // Dashboard preferences
  dashboardLayout: jsonb('dashboard_layout').default({}),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userActivityLogs = pgTable('user_activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Activity details
  action: varchar('action', { length: 50 }).notNull(), // 'login', 'logout', 'create_site', 'publish_site', etc.
  resource: varchar('resource', { length: 50 }), // 'site', 'user', 'settings', etc.
  resourceId: uuid('resource_id'),
  
  // Context
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').default({}),
  
  // Success/failure
  success: boolean('success').notNull().default(true),
  errorMessage: text('error_message'),
  
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_activity_user').on(table.userId),
  index('idx_activity_action').on(table.action),
  index('idx_activity_timestamp').on(table.timestamp),
  index('idx_activity_resource').on(table.resource, table.resourceId),
]);

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email(),
  name: z.string().min(1).max(100),
  status: z.enum(['active', 'inactive', 'suspended', 'pending_verification']),
  role: z.enum(['owner', 'admin', 'editor', 'viewer']),
});

export const selectUserSchema = createSelectSchema(users);

export const insertUserSessionSchema = createInsertSchema(userSessions);
export const selectUserSessionSchema = createSelectSchema(userSessions);

export const insertUserPreferencesSchema = createInsertSchema(userPreferences);
export const selectUserPreferencesSchema = createSelectSchema(userPreferences);

export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs);
export const selectUserActivityLogSchema = createSelectSchema(userActivityLogs);

// Custom validation schemas
export const userRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
export const userStatusSchema = z.enum(['active', 'inactive', 'suspended', 'pending_verification']);
export const themeSchema = z.enum(['light', 'dark', 'system']);

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type NewUserActivityLog = typeof userActivityLogs.$inferInsert;
