import { z } from 'zod';

// User role and status enums
export const UserRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
export const UserStatusSchema = z.enum(['active', 'inactive', 'suspended', 'pending_verification']);

// User preferences schemas
export const EmailNotificationSettingsSchema = z.object({
  sitePublished: z.boolean(),
  voiceInteractions: z.boolean(),
  monthlyReports: z.boolean(),
  securityAlerts: z.boolean(),
  productUpdates: z.boolean(),
});

export const EditorSettingsSchema = z.object({
  autoSave: z.boolean(),
  gridSnapping: z.boolean(),
  showGuides: z.boolean(),
  defaultTemplate: z.string(),
  favoriteComponents: z.array(z.string()),
});

export const UserPreferencesSchema = z.object({
  language: z.enum(['en', 'tr', 'es', 'fr', 'de']),
  timezone: z.string(),
  theme: z.enum(['light', 'dark', 'system']),
  emailNotifications: EmailNotificationSettingsSchema,
  editorSettings: EditorSettingsSchema,
});

// Subscription schemas
export const SubscriptionUsageSchema = z.object({
  sitesUsed: z.number().int().min(0),
  aiTokensUsed: z.number().int().min(0),
  voiceMinutesUsed: z.number().int().min(0),
  storageUsedMB: z.number().min(0),
  resetDate: z.date(),
});

export const UserSubscriptionSchema = z.object({
  plan: z.enum(['free', 'basic', 'pro', 'enterprise']),
  status: z.enum(['active', 'canceled', 'past_due', 'trialing']),
  currentPeriodStart: z.date(),
  currentPeriodEnd: z.date(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  usage: SubscriptionUsageSchema,
});

// Main user schema
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatar: z.string().url().optional(),
  role: UserRoleSchema,
  tenantId: z.string().uuid(),
  preferences: UserPreferencesSchema,
  subscription: UserSubscriptionSchema.optional(),
  lastLoginAt: z.date().optional(),
  emailVerifiedAt: z.date().optional(),
  status: UserStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

// JWT payload schema
export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: UserRoleSchema,
  email: z.string().email(),
  exp: z.number().int(),
  iat: z.number().int(),
});

// Authentication schemas
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
  tenantName: z.string().min(1).max(100).optional(),
});

export const AuthResponseSchema = z.object({
  user: UserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});

// Create/Update user schemas
export const CreateUserRequestSchema = RegisterRequestSchema;

export const UpdateUserRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
  preferences: UserPreferencesSchema.partial().optional(),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Password reset schemas
export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(100),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Email verification schema
export const EmailVerificationRequestSchema = z.object({
  token: z.string(),
});

// Type exports for TypeScript
export type UserRole = z.infer<typeof UserRoleSchema>;
export type UserStatus = z.infer<typeof UserStatusSchema>;
export type User = z.infer<typeof UserSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type EmailVerificationRequest = z.infer<typeof EmailVerificationRequestSchema>;
