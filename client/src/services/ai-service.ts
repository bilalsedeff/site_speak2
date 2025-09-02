import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { io, Socket } from 'socket.io-client'

/**
 * AI Service for connecting frontend to backend AI orchestrator
 */

export interface AIRequest {
  query: string
  context?: {
    page?: string
    component?: string
    user?: {
      id?: string
      preferences?: Record<string, any>
    }
  }
  sessionId?: string
  language?: string
}

export interface AIResponse {
  id: string
  response: string
  actions?: AIAction[]
  suggestions?: string[]
  metadata?: {
    confidence: number
    processingTime: number
    model: string
    tokensUsed?: number
  }
  streaming?: boolean
}

export interface AIAction {
  type: string
  name: string
  parameters: Record<string, any>
  confirmation?: {
    required: boolean
    message?: string
  }
  target?: {
    selector?: string
    component?: string
    page?: string
  }
}

export interface VoiceSession {
  id: string
  isActive: boolean
  language: string
  voice: string
  transcript: string
  partialTranscript: string
  response: string
  audioLevel: number
  status: 'idle' | 'listening' | 'processing' | 'responding' | 'error'
  error?: string
}

export interface StreamingResponse {
  id: string
  delta: string
  isComplete: boolean
  actions?: AIAction[]
  metadata?: Record<string, any>
}

/**
 * Main AI Service class
 */
export class AIService {
  private apiClient: AxiosInstance
  private socketClient: Socket | null = null
  private baseUrl: string
  private wsUrl: string

  // Event callbacks
  private onStreamingResponse?: (response: StreamingResponse) => void
  private onVoiceTranscript?: (transcript: string, isFinal: boolean) => void
  private onVoiceResponse?: (response: string, audioUrl?: string) => void
  private onVoiceError?: (error: Error) => void

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    this.wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:5000'

    // Initialize HTTP client
    this.apiClient = axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Add request interceptor for auth
    this.apiClient.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Add response interceptor for error handling
    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Handle auth error
          localStorage.removeItem('auth_token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * Initialize WebSocket connection
   */
  async connectWebSocket(): Promise<void> {
    if (this.socketClient?.connected) {
      return
    }

    return new Promise((resolve, reject) => {
      this.socketClient = io(this.wsUrl, {
        transports: ['websocket'],
        upgrade: true,
        timeout: 10000,
      })

      this.socketClient.on('connect', () => {
        console.log('AI WebSocket connected')
        this.setupWebSocketHandlers()
        resolve()
      })

      this.socketClient.on('connect_error', (error) => {
        console.error('AI WebSocket connection error:', error)
        reject(error)
      })

      this.socketClient.on('disconnect', (reason) => {
        console.log('AI WebSocket disconnected:', reason)
      })
    })
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.socketClient) {return}

    // Streaming text responses
    this.socketClient.on('ai:streaming_response', (data: StreamingResponse) => {
      this.onStreamingResponse?.(data)
    })

    // Voice processing events
    this.socketClient.on('voice:transcript', (data: { text: string; isFinal: boolean }) => {
      this.onVoiceTranscript?.(data.text, data.isFinal)
    })

    this.socketClient.on('voice:response', (data: { text: string; audioUrl?: string }) => {
      this.onVoiceResponse?.(data.text, data.audioUrl)
    })

    this.socketClient.on('voice:error', (error: any) => {
      this.onVoiceError?.(new Error(error.message || 'Voice processing error'))
    })

    // AI processing events
    this.socketClient.on('ai:action_result', (data: { success: boolean; result: any; error?: string }) => {
      if (data.success) {
        console.log('Action executed successfully:', data.result)
      } else {
        console.error('Action execution failed:', data.error)
      }
    })
  }

  /**
   * Send a text query to the AI
   */
  async query(request: AIRequest): Promise<AIResponse> {
    try {
      const response: AxiosResponse<AIResponse> = await this.apiClient.post('/ai/query', request)
      return response.data
    } catch (error) {
      console.error('AI query failed:', error)
      throw new Error(
        error instanceof Error ? error.message : 'Failed to process AI query'
      )
    }
  }

  /**
   * Start a streaming conversation
   */
  async startStreamingChat(
    request: AIRequest,
    onResponse: (response: StreamingResponse) => void
  ): Promise<string> {
    if (!this.socketClient?.connected) {
      await this.connectWebSocket()
    }

    return new Promise((resolve, reject) => {
      this.onStreamingResponse = onResponse

      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      this.socketClient?.emit('ai:start_streaming', {
        ...request,
        conversationId,
      })

      // Set timeout for response
      const timeout = setTimeout(() => {
        reject(new Error('Streaming conversation timeout'))
      }, 30000)

      // Listen for completion
      this.socketClient?.once('ai:streaming_complete', (data: { conversationId: string }) => {
        if (data.conversationId === conversationId) {
          clearTimeout(timeout)
          resolve(conversationId)
        }
      })

      this.socketClient?.once('ai:streaming_error', (data: { conversationId: string; error: string }) => {
        if (data.conversationId === conversationId) {
          clearTimeout(timeout)
          reject(new Error(data.error))
        }
      })
    })
  }

  /**
   * Execute an AI-suggested action
   */
  async executeAction(action: AIAction): Promise<{ success: boolean; result: any; error?: string }> {
    try {
      const response = await this.apiClient.post('/ai/execute-action', {
        action,
        timestamp: Date.now(),
      })
      return response.data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Action execution failed'
      return {
        success: false,
        result: null,
        error: errorMessage,
      }
    }
  }

  /**
   * Start voice session
   */
  async startVoiceSession(options: {
    language?: string
    voice?: string
    enableTranscription?: boolean
  } = {}): Promise<string> {
    if (!this.socketClient?.connected) {
      await this.connectWebSocket()
    }

    return new Promise((resolve, reject) => {
      const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      this.socketClient?.emit('voice:start_session', {
        sessionId,
        language: options.language || 'en-US',
        voice: options.voice || 'alloy',
        enableTranscription: options.enableTranscription ?? true,
      })

      this.socketClient?.once('voice:session_started', (data: { sessionId: string }) => {
        if (data.sessionId === sessionId) {
          resolve(sessionId)
        }
      })

      this.socketClient?.once('voice:session_error', (data: { sessionId: string; error: string }) => {
        if (data.sessionId === sessionId) {
          reject(new Error(data.error))
        }
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Voice session start timeout'))
      }, 10000)
    })
  }

  /**
   * Send audio data for voice processing
   */
  sendVoiceData(sessionId: string, audioData: ArrayBuffer): void {
    if (!this.socketClient?.connected) {
      throw new Error('WebSocket not connected')
    }

    this.socketClient.emit('voice:audio_data', {
      sessionId,
      audioData,
      timestamp: Date.now(),
    })
  }

  /**
   * End voice session
   */
  endVoiceSession(sessionId: string): void {
    if (this.socketClient?.connected) {
      this.socketClient.emit('voice:end_session', { sessionId })
    }
  }

  /**
   * Get AI conversation history
   */
  async getConversationHistory(
    sessionId?: string,
    limit: number = 50
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>> {
    try {
      const response = await this.apiClient.get('/ai/conversation-history', {
        params: { sessionId, limit },
      })
      return response.data.messages || []
    } catch (error) {
      console.error('Failed to fetch conversation history:', error)
      return []
    }
  }

  /**
   * Get available AI models and capabilities
   */
  async getCapabilities(): Promise<{
    models: string[]
    languages: string[]
    voices: string[]
    features: string[]
  }> {
    try {
      const response = await this.apiClient.get('/ai/capabilities')
      return response.data
    } catch (error) {
      console.error('Failed to fetch AI capabilities:', error)
      return {
        models: [],
        languages: ['en-US'],
        voices: ['alloy'],
        features: [],
      }
    }
  }

  /**
   * Update user preferences for AI interactions
   */
  async updateUserPreferences(preferences: {
    language?: string
    voice?: string
    responseLength?: 'brief' | 'detailed'
    personality?: 'professional' | 'friendly' | 'casual'
    domains?: string[]
  }): Promise<void> {
    try {
      await this.apiClient.put('/ai/user-preferences', preferences)
    } catch (error) {
      console.error('Failed to update user preferences:', error)
      throw error
    }
  }

  /**
   * Get site knowledge base information
   */
  async getSiteKnowledge(): Promise<{
    lastUpdated: string
    documentsCount: number
    categories: string[]
    coverage: Record<string, number>
  }> {
    try {
      const response = await this.apiClient.get('/ai/site-knowledge')
      return response.data
    } catch (error) {
      console.error('Failed to fetch site knowledge:', error)
      return {
        lastUpdated: '',
        documentsCount: 0,
        categories: [],
        coverage: {},
      }
    }
  }

  /**
   * Trigger knowledge base refresh
   */
  async refreshKnowledgeBase(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.apiClient.post('/ai/refresh-knowledge')
      return response.data
    } catch (error) {
      console.error('Failed to refresh knowledge base:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Refresh failed',
      }
    }
  }

  /**
   * Set event callbacks
   */
  setEventHandlers(handlers: {
    onStreamingResponse?: (response: StreamingResponse) => void
    onVoiceTranscript?: (transcript: string, isFinal: boolean) => void
    onVoiceResponse?: (response: string, audioUrl?: string) => void
    onVoiceError?: (error: Error) => void
  }): void {
    this.onStreamingResponse = handlers.onStreamingResponse
    this.onVoiceTranscript = handlers.onVoiceTranscript
    this.onVoiceResponse = handlers.onVoiceResponse
    this.onVoiceError = handlers.onVoiceError
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.socketClient) {
      this.socketClient.disconnect()
      this.socketClient = null
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.socketClient?.connected || false
  }
}

// Export singleton instance
export const aiService = new AIService()