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
 * Hook for voice interactions
 */
export function useVoice() {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currentSessionId = useRef<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Initialize voice service
  useEffect(() => {
    const initializeVoice = async () => {
      try {
        await aiService.connectWebSocket()
        setIsConnected(true)
        setError(null)
      } catch (error) {
        console.error('Failed to connect to voice service:', error)
        setError('Failed to connect to voice service')
        setIsConnected(false)
      }
    }

    initializeVoice()

    // Set up voice event handlers
    aiService.setEventHandlers({
      onVoiceTranscript: (text: string, isFinal: boolean) => {
        setTranscript(text)
        if (isFinal) {
          setIsListening(false)
          setIsProcessing(true)
        }
      },
      onVoiceResponse: (text: string, audioUrl?: string) => {
        setResponse(text)
        setIsProcessing(false)

        // Play audio response if available
        if (audioUrl) {
          const audio = new Audio(audioUrl)
          audio.play().catch(console.error)
        }
      },
      onVoiceError: (error: Error) => {
        setError(error.message)
        setIsListening(false)
        setIsProcessing(false)
      },
    })

    // Check for existing microphone permission
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(result => {
          setHasPermission(result.state === 'granted')
          result.onchange = () => {
            setHasPermission(result.state === 'granted')
          }
        })
        .catch(() => {
          // Permission API not supported
          setHasPermission(false)
        })
    }

    return () => {
      if (currentSessionId.current) {
        aiService.endVoiceSession(currentSessionId.current)
      }
    }
  }, [])

  /**
   * Request microphone permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      
      // Stop the stream - we just needed permission
      stream.getTracks().forEach(track => track.stop())
      setHasPermission(true)
      setError(null)
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setHasPermission(false)
      setError('Microphone permission required')
      return false
    }
  }, [])

  /**
   * Start voice recording
   */
  const startListening = useCallback(async (options: {
    language?: string
    voice?: string
  } = {}): Promise<void> => {
    if (!isConnected) {
      throw new Error('Voice service not connected')
    }

    if (!hasPermission) {
      const granted = await requestPermission()
      if (!granted) {
        throw new Error('Microphone permission required')
      }
    }

    try {
      // Start voice session
      const sessionId = await aiService.startVoiceSession({
        language: options.language || 'en-US',
        voice: options.voice || 'alloy',
        enableTranscription: true,
      })
      currentSessionId.current = sessionId

      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 1,
        }
      })

      // Setup media recorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
          
          // Convert to ArrayBuffer and send to AI service
          event.data.arrayBuffer().then(buffer => {
            if (currentSessionId.current) {
              aiService.sendVoiceData(currentSessionId.current, buffer)
            }
          }).catch(console.error)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
      }

      // Start recording
      setIsListening(true)
      setTranscript('')
      setResponse('')
      setError(null)
      
      mediaRecorderRef.current.start(100) // 100ms chunks for real-time processing

    } catch (error) {
      console.error('Failed to start voice recording:', error)
      setError('Failed to start voice recording')
      setIsListening(false)
      throw error
    }
  }, [isConnected, hasPermission, requestPermission])

  /**
   * Stop voice recording
   */
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    if (currentSessionId.current) {
      aiService.endVoiceSession(currentSessionId.current)
      currentSessionId.current = null
    }

    setIsListening(false)
  }, [])

  /**
   * Clear transcript and response
   */
  const clearTranscript = useCallback(() => {
    setTranscript('')
    setResponse('')
    setError(null)
  }, [])

  return {
    // State
    isListening,
    isProcessing,
    isConnected,
    hasPermission,
    transcript,
    response,
    error,

    // Actions
    startListening,
    stopListening,
    clearTranscript,
    requestPermission,
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