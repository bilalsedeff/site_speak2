import { api } from './index'

type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'

type ServerDate = string | Date

type ServerUser = {
  id: string
  name: string
  email: string
  tenantId: string
  role: UserRole
  createdAt: ServerDate
  updatedAt: ServerDate
  emailVerified?: boolean
  lastLoginAt?: ServerDate
  preferences?: Record<string, unknown>
}

type ServerTenant = {
  id: string
  name: string
  plan: 'free' | 'starter' | 'professional' | 'enterprise'
  settings?: Record<string, unknown>
  usage?: Record<string, unknown>
  limits?: Record<string, unknown>
}

type ServerAuthPayload = {
  user: ServerUser
  tenant: ServerTenant
  tokens: {
    accessToken: string
    refreshToken: string
  }
  session: {
    id: string
    expiresAt: ServerDate
  }
}

type ServerProfilePayload = {
  user: ServerUser
  tenant: ServerTenant
}

export interface User {
  id: string
  name: string
  email: string
  tenantId: string
  role: UserRole
  createdAt: string
  updatedAt: string
  emailVerified: boolean
  lastLoginAt?: string
  preferences: Record<string, unknown>
}

export interface TenantSummary {
  id: string
  name: string
  plan: 'free' | 'starter' | 'professional' | 'enterprise'
  settings?: Record<string, unknown>
  usage?: Record<string, unknown>
  limits?: Record<string, unknown>
}

export interface SessionInfo {
  id: string
  expiresAt: string
}

export interface LoginRequest {
  email: string
  password: string
  rememberMe?: boolean
}

export interface LoginResponse {
  user: User
  tenant: TenantSummary
  token: string
  refreshToken: string
  session: SessionInfo
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
  confirmPassword?: string
  acceptTerms?: boolean
}

export interface RegisterResponse {
  user: User
  tenant: TenantSummary
  token: string
  refreshToken: string
  session: SessionInfo
}

export interface RefreshTokenResponse {
  token: string
}

export interface ProfileResponse {
  user: User
  tenant: TenantSummary
}

const normalizeDate = (value: ServerDate | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString()
}

const mapUser = (user: ServerUser): User => {
  const mapped: User = {
    id: user.id,
    name: user.name,
    email: user.email,
    tenantId: user.tenantId,
    role: user.role,
    createdAt: normalizeDate(user.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeDate(user.updatedAt) ?? new Date().toISOString(),
    emailVerified: Boolean(user.emailVerified),
    preferences: user.preferences ?? {},
  }

  const lastLoginAt = normalizeDate(user.lastLoginAt)
  if (lastLoginAt) {
    mapped.lastLoginAt = lastLoginAt
  }

  return mapped
}

const mapTenant = (tenant: ServerTenant): TenantSummary => {
  const mapped: TenantSummary = {
    id: tenant.id,
    name: tenant.name,
    plan: tenant.plan,
  }

  if (tenant.settings) {
    mapped.settings = tenant.settings
  }

  if (tenant.usage) {
    mapped.usage = tenant.usage
  }

  if (tenant.limits) {
    mapped.limits = tenant.limits
  }

  return mapped
}

const mapAuthPayload = (payload: ServerAuthPayload): LoginResponse => ({
  user: mapUser(payload.user),
  tenant: mapTenant(payload.tenant),
  token: payload.tokens.accessToken,
  refreshToken: payload.tokens.refreshToken,
  session: {
    id: payload.session.id,
    expiresAt: normalizeDate(payload.session.expiresAt) ?? new Date().toISOString(),
  },
})

export const authApi = {
  /**
   * Login user
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<ServerAuthPayload>('/auth/login', credentials)
    return mapAuthPayload(response)
  },

  /**
   * Register new user
   */
  register: async (userData: RegisterRequest): Promise<RegisterResponse> => {
    const response = await api.post<ServerAuthPayload>('/auth/register', userData)
    return mapAuthPayload(response)
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    const response = await api.post<{ accessToken: string }>('/auth/refresh', { refreshToken })
    return { token: response.accessToken }
  },

  /**
   * Get current user profile
   */
  getProfile: async (): Promise<ProfileResponse> => {
    const response = await api.get<ServerProfilePayload>('/auth/me')
    return {
      user: mapUser(response.user),
      tenant: mapTenant(response.tenant),
    }
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: Partial<Pick<User, 'name' | 'email'>>): Promise<User> => {
    const response = await api.put<ServerUser>('/auth/me', data)
    return mapUser(response)
  },

  /**
   * Change password
   */
  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    return api.post<void>('/auth/change-password', data)
  },

  /**
   * Logout (invalidate tokens)
   */
  logout: async (): Promise<void> => {
    return api.post<void>('/auth/logout')
  },

  /**
   * Request password reset
   */
  requestPasswordReset: async (email: string): Promise<void> => {
    return api.post<void>('/auth/forgot-password', { email })
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: { token: string; password: string }): Promise<void> => {
    return api.post<void>('/auth/reset-password', data)
  },

  /**
   * Verify email address
   */
  verifyEmail: async (token: string): Promise<void> => {
    return api.post<void>('/auth/verify-email', { token })
  },

  /**
   * Resend verification email
   */
  resendVerification: async (): Promise<void> => {
    return api.post<void>('/auth/resend-verification')
  },
}
