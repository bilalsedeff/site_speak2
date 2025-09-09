import { useState, useEffect, useCallback, useRef } from 'react'
import { aiService, AIRequest, AIResponse, StreamingResponse, AIAction } from '../services/ai-service'

/**
 * Hook for AI interactions with the backend orchestrator
 */
export function useAI() {
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResponse, setLastResponse] = useState<AIResponse | null>(null)
  const [streamingResponse, setStreamingResponse] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)

  const currentStreamingId = useRef<string | null>(null)

  // Initialize AI service connection
  useEffect(() => {
    const initializeAI = async () => {
      try {
        await aiService.connectWebSocket()
        setIsConnected(true)
        setError(null)
      } catch (error) {
        console.error('Failed to connect to AI service:', error)
        setError('Failed to connect to AI service')
        setIsConnected(false)
      }
    }

    initializeAI()

    // Set up event handlers
    aiService.setEventHandlers({
      onStreamingResponse: (response: StreamingResponse) => {
        if (response.id === currentStreamingId.current) {
          if (response.isComplete) {
            setIsStreaming(false)
            currentStreamingId.current = null
          } else {
            setStreamingResponse(prev => prev + response.delta)
          }
        }
      },
    })

    // Cleanup on unmount
    return () => {
      aiService.disconnect()
    }
  }, [])

  /**
   * Send a query to the AI
   */
  const query = useCallback(async (request: AIRequest): Promise<AIResponse> => {
    if (!isConnected) {
      throw new Error('AI service not connected')
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await aiService.query(request)
      setLastResponse(response)
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI query failed'
      setError(errorMessage)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [isConnected])

  /**
   * Start a streaming conversation
   */
  const startStreaming = useCallback(async (request: AIRequest): Promise<void> => {
    if (!isConnected) {
      throw new Error('AI service not connected')
    }

    setIsStreaming(true)
    setStreamingResponse('')
    setError(null)

    try {
      const conversationId = await aiService.startStreamingChat(
        request,
        (response: StreamingResponse) => {
          if (response.isComplete) {
            setIsStreaming(false)
            currentStreamingId.current = null
          } else {
            setStreamingResponse(prev => prev + response.delta)
          }
        }
      )
      currentStreamingId.current = conversationId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming failed'
      setError(errorMessage)
      setIsStreaming(false)
      currentStreamingId.current = null
      throw error
    }
  }, [isConnected])

  /**
   * Execute an AI-suggested action
   */
  const executeAction = useCallback(async (action: AIAction): Promise<boolean> => {
    if (!isConnected) {
      throw new Error('AI service not connected')
    }

    setError(null)

    try {
      const result = await aiService.executeAction(action)
      if (!result.success) {
        setError(result.error || 'Action execution failed')
      }
      return result.success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Action execution failed'
      setError(errorMessage)
      return false
    }
  }, [isConnected])

  /**
   * Clear current response and error state
   */
  const clearState = useCallback(() => {
    setError(null)
    setLastResponse(null)
    setStreamingResponse('')
    setIsStreaming(false)
    currentStreamingId.current = null
  }, [])

  return {
    // State
    isConnected,
    isLoading,
    isStreaming,
    error,
    lastResponse,
    streamingResponse,

    // Actions
    query,
    startStreaming,
    executeAction,
    clearState,
  }
}


/**
 * Hook for managing AI conversation history
 */
export function useConversationHistory(sessionId?: string) {
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load conversation history
   */
  const loadHistory = useCallback(async (limit: number = 50) => {
    setIsLoading(true)
    setError(null)

    try {
      const history = await aiService.getConversationHistory(sessionId, limit)
      setMessages(history)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load history'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  /**
   * Add a new message to the conversation
   */
  const addMessage = useCallback((
    role: 'user' | 'assistant',
    content: string
  ) => {
    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, message])
  }, [])

  /**
   * Clear conversation history
   */
  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  // Load history on mount
  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return {
    messages,
    isLoading,
    error,
    loadHistory,
    addMessage,
    clearHistory,
  }
}