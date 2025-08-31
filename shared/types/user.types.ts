import { BaseEntity, SupportedLanguage } from './common.types';

export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  tenantId: string;
  preferences: UserPreferences;
  subscription?: UserSubscription;
  lastLoginAt?: Date;
  emailVerifiedAt?: Date;
  status: UserStatus;
}

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

export interface UserPreferences {
  language: SupportedLanguage;
  timezone: string;
  theme: 'light' | 'dark' | 'system';
  emailNotifications: EmailNotificationSettings;
  editorSettings: EditorSettings;
}

export interface EmailNotificationSettings {
  sitePublished: boolean;
  voiceInteractions: boolean;
  monthlyReports: boolean;
  securityAlerts: boolean;
  productUpdates: boolean;
}

export interface EditorSettings {
  autoSave: boolean;
  gridSnapping: boolean;
  showGuides: boolean;
  defaultTemplate: string;
  favoriteComponents: string[];
}

export interface UserSubscription {
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  usage: SubscriptionUsage;
}

export interface SubscriptionUsage {
  sitesUsed: number;
  aiTokensUsed: number;
  voiceMinutesUsed: number;
  storageUsedMB: number;
  resetDate: Date;
}

// JWT Token payload
export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  exp: number;
  iat: number;
}

// Authentication related types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  tenantName?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}