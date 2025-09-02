import axios, { AxiosInstance, AxiosError } from 'axios'
import { store } from '@/store'
import { logout, refreshAuth } from '@/store/slices/authSlice'

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const state = store.getState()
    const token = state.auth.token

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        await store.dispatch(refreshAuth()).unwrap()
        
        // Retry the original request with new token
        const state = store.getState()
        const newToken = state.auth.token
        
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        
        return apiClient(originalRequest)
      } catch (refreshError) {
        // Refresh failed, logout user
        store.dispatch(logout())
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// API Error Types
export interface ApiError {
  message: string
  code?: string
  details?: Record<string, any>
}

export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  error?: ApiError
}

// Generic API methods
export const api = {
  get: <T = any>(url: string, params?: Record<string, any>) =>
    apiClient.get<ApiResponse<T>>(url, { params }).then(res => res.data.data),

  post: <T = any>(url: string, data?: any) =>
    apiClient.post<ApiResponse<T>>(url, data).then(res => res.data.data),

  put: <T = any>(url: string, data?: any) =>
    apiClient.put<ApiResponse<T>>(url, data).then(res => res.data.data),

  patch: <T = any>(url: string, data?: any) =>
    apiClient.patch<ApiResponse<T>>(url, data).then(res => res.data.data),

  delete: <T = any>(url: string) =>
    apiClient.delete<ApiResponse<T>>(url).then(res => res.data.data),
}

export { apiClient }

export { authApi } from './auth'
export { sitesApi } from './sites'