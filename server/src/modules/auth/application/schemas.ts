import { z } from 'zod';
import { CommonSchemas } from '../../../infrastructure/middleware';

// Authentication request schemas
export const LoginRequestSchema = z.object({
  email: CommonSchemas.email,
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

export const RegisterRequestSchema = z.object({
  name: CommonSchemas.name,
  email: CommonSchemas.email,
  password: CommonSchemas.password,
  confirmPassword: z.string().min(1),
  tenantName: z.string().min(1).max(100).trim().optional(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms of service',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: CommonSchemas.password,
  confirmNewPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"],
});

export const ForgotPasswordRequestSchema = z.object({
  email: CommonSchemas.email,
});

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  newPassword: CommonSchemas.password,
  confirmNewPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "Passwords don't match",
  path: ["confirmNewPassword"],
});

export const UpdateUserRequestSchema = z.object({
  name: CommonSchemas.name.optional(),
  email: CommonSchemas.email.optional(),
  preferences: z.record(z.unknown()).optional(),
});

// Response schemas
export const AuthResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      name: z.string(),
      role: z.enum(['owner', 'admin', 'editor', 'viewer']),
      tenantId: z.string().uuid(),
      createdAt: z.date(),
      updatedAt: z.date(),
      preferences: z.record(z.unknown()).optional(),
    }),
    tokens: z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
    }),
    session: z.object({
      id: z.string().uuid(),
      expiresAt: z.date(),
    }),
  }),
  message: z.string().optional(),
});

export const UserResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['owner', 'admin', 'editor', 'viewer']),
    tenantId: z.string().uuid(),
    createdAt: z.date(),
    updatedAt: z.date(),
    preferences: z.record(z.unknown()).optional(),
  }),
});

export const SessionsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(z.object({
    id: z.string().uuid(),
    createdAt: z.date(),
    lastActivityAt: z.date(),
    ipAddress: z.string(),
    userAgent: z.string(),
    isActive: z.boolean(),
    isCurrent: z.boolean(),
  })),
});

// Type exports
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type SessionsResponse = z.infer<typeof SessionsResponseSchema>;