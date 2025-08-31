import { api } from './index'

export interface User {
  id: string
  name: string
  email: string
  tenantId: string
  role: 'admin' | 'user'
  createdAt: string
  updatedAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
  refreshToken: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface RegisterResponse {
  user: User
  token: string
  refreshToken: string
}

export interface RefreshTokenResponse {
  token: string
}

export const authApi = {
  /**
   * Login user
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    return api.post<LoginResponse>('/auth/login', credentials)
  },

  /**
   * Register new user
   */
  register: async (userData: RegisterRequest): Promise<RegisterResponse> => {
    return api.post<RegisterResponse>('/auth/register', userData)
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    return api.post<RefreshTokenResponse>('/auth/refresh', { refreshToken })
  },

  /**
   * Get current user profile
   */
  getProfile: async (): Promise<User> => {
    return api.get<User>('/auth/profile')
  },

  /**
   * Update user profile
   */
  updateProfile: async (data: Partial<Pick<User, 'name' | 'email'>>): Promise<User> => {
    return api.patch<User>('/auth/profile', data)
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
    return api.post<void>('/auth/reset-password', { email })
  },

  /**
   * Reset password with token
   */
  resetPassword: async (data: { token: string; password: string }): Promise<void> => {
    return api.post<void>('/auth/reset-password/confirm', data)
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