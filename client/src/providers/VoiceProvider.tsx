import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

interface VoiceContextType {
  // Connection state
  isConnected: boolean
  socket: Socket | null
  
  // Voice state
  isListening: boolean
  isProcessing: boolean
  isRecording: boolean
  
  // Audio data
  audioLevel: number
  transcript: string
  response: string
  
  // Voice controls
  startListening: () => Promise<void>
  stopListening: () => void
  clearTranscript: () => void
  processText: (text: string) => Promise<void>
  
  // Settings
  language: string
  voice: string
  setLanguage: (lang: string) => void
  setVoice: (voice: string) => void
  
  // Permissions
  hasPermission: boolean
  requestPermission: () => Promise<boolean>
}

const VoiceContext = createContext<VoiceContextType | null>(null)

export function useVoice() {
  const context = useContext(VoiceContext)
  if (!context) {
    throw new Error('useVoice must be used within VoiceProvider')
  }
  return context
}

interface VoiceProviderProps {
  children: React.ReactNode
}

export function VoiceProvider({ children }: VoiceProviderProps) {
  // Connection state
  const [isConnected, setIsConnected] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  
  // Voice state
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  
  // Audio data
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  
  // Settings
  const [language, setLanguage] = useState('en-US')
  const [voice, setVoice] = useState('shimmer') // Soft, gentle female voice
  const [hasPermission, setHasPermission] = useState(false)
  
  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  
  // Separate function to setup socket events
  const setupSocketEvents = (socketInstance: Socket) => {
    socketInstance.on('connect', () => {
      console.log('Voice WebSocket connected')
      setIsConnected(true)
    })

    socketInstance.on('disconnect', () => {
      console.log('Voice WebSocket disconnected')
      setIsConnected(false)
    })

    // Voice processing events
    socketInstance.on('voice:transcript', (data: { text: string; isFinal: boolean }) => {
      setTranscript(data.text)
      if (data.isFinal) {
        setIsListening(false)
        setIsProcessing(true)
      }
    })

    socketInstance.on('voice:response', (data: { text: string; audioUrl?: string }) => {
      setResponse(data.text)
      setIsProcessing(false)
      
      // Play audio response if available
      if (data.audioUrl) {
        const audio = new Audio(data.audioUrl)
        audio.play().catch(console.error)
      }
    })

    socketInstance.on('voice:error', (error: any) => {
      console.error('Voice error:', error)
      setIsListening(false)
      setIsProcessing(false)
      setIsRecording(false)
    })

    socketInstance.on('error', (error: any) => {
      console.error('Socket error:', error)
      setIsConnected(false)
      setIsListening(false)
      setIsProcessing(false)
      setIsRecording(false)
    })
  }

  // Initialize WebSocket connection with authentication
  useEffect(() => {
    const initializeVoiceConnection = async () => {
      try {
        // Create voice session using API Gateway
        const accessToken = localStorage.getItem('accessToken');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
        
        const response = await fetch(`${API_BASE_URL}/api/v1/voice/session`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            siteId: import.meta.env['VITE_SITE_ID'] || '00000000-0000-0000-0000-000000000000',
            preferredTTSLocale: language,
            preferredSTTLocale: language,
            voice: voice, // Use the selected voice (shimmer by default)
            maxDuration: 300, // 5 minutes
            enableVAD: true
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to create voice session: ${response.statusText}`)
        }

        const sessionData = await response.json()
        
        if (!sessionData.success || !sessionData.data) {
          throw new Error('Invalid session response format')
        }
        
        const { sessionId } = sessionData.data

        // Connect to WebSocket with session ID
        const wsAuth: Record<string, string> = {
          sessionId: sessionId,
        };
        
        if (accessToken) {
          wsAuth['accessToken'] = accessToken;
        }
        
        const socketInstance = io(import.meta.env.VITE_WS_URL || 'ws://localhost:5000', {
          transports: ['websocket'],
          upgrade: true,
          auth: wsAuth,
        })

        // Setup socket events
        setupSocketEvents(socketInstance)
        setSocket(socketInstance)

      } catch (error) {
        console.error('Failed to initialize voice connection:', error)
        setIsConnected(false)
      }
    }

    initializeVoiceConnection()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (socket) {
        socket.disconnect()
      }
    }
  }, [language])

  // Request microphone permission
  const requestPermission = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })
      
      // Stop the stream immediately - we just needed to request permission
      stream.getTracks().forEach(track => track.stop())
      setHasPermission(true)
      return true
    } catch (error) {
      console.error('Permission denied:', error)
      setHasPermission(false)
      return false
    }
  }

  // Start listening for voice input
  const startListening = async (): Promise<void> => {
    if (!socket || !isConnected) {
      throw new Error('Socket not connected')
    }

    if (!hasPermission) {
      const granted = await requestPermission()
      if (!granted) {
        throw new Error('Microphone permission required')
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      })

      // Setup audio context for level monitoring
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      
      analyserRef.current.fftSize = 256
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      // Start audio level monitoring
      const updateAudioLevel = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const level = dataArray.reduce((a, b) => a + b) / bufferLength
          setAudioLevel(level / 255) // Normalize to 0-1
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
        }
      }

      // Setup media recorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      const audioChunks: BlobPart[] = []

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        socket.emit('voice:audio', audioBlob, { language, voice })
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop())
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
      }

      // Start recording
      setIsListening(true)
      setIsRecording(true)
      setTranscript('')
      setResponse('')
      
      mediaRecorderRef.current.start(100) // Collect data every 100ms
      updateAudioLevel()

      // Notify server that we're starting to listen
      socket.emit('voice:start_session', { language, voice })

    } catch (error) {
      console.error('Failed to start listening:', error)
      setIsListening(false)
      setIsRecording(false)
      throw error
    }
  }

  // Stop listening
  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    
    setIsListening(false)
    setIsRecording(false)
    setAudioLevel(0)
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (socket) {
      socket.emit('voice:end_session')
    }
  }

  // Clear transcript and response
  const clearTranscript = () => {
    setTranscript('')
    setResponse('')
  }

  // Process text input (for suggestion chips or direct text input)
  const processText = async (text: string): Promise<void> => {
    if (!socket || !isConnected) {
      throw new Error('Socket not connected')
    }

    try {
      setTranscript(text)
      setIsProcessing(true)
      
      // Send text directly to voice processing
      socket.emit('voice:text', { text, language, voice })
      
    } catch (error) {
      console.error('Failed to process text:', error)
      setIsProcessing(false)
      throw error
    }
  }

  // Check for permission on mount
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(result => {
          setHasPermission(result.state === 'granted')
          result.onchange = () => {
            setHasPermission(result.state === 'granted')
          }
        })
        .catch(() => {
          // Permission API not supported, try to detect permission
          setHasPermission(false)
        })
    }
  }, [])

  // Global keyboard shortcut for voice activation
  useEffect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Space to toggle voice
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault()
        if (isListening) {
          stopListening()
        } else if (hasPermission && isConnected) {
          startListening().catch(console.error)
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeydown)
    return () => document.removeEventListener('keydown', handleGlobalKeydown)
  }, [isListening, hasPermission, isConnected, startListening, stopListening])

  const value: VoiceContextType = {
    // Connection state
    isConnected,
    socket,
    
    // Voice state
    isListening,
    isProcessing,
    isRecording,
    
    // Audio data
    audioLevel,
    transcript,
    response,
    
    // Voice controls
    startListening,
    stopListening,
    clearTranscript,
    processText,
    
    // Settings
    language,
    voice,
    setLanguage,
    setVoice,
    
    // Permissions
    hasPermission,
    requestPermission,
  }

  return (
    <VoiceContext.Provider value={value}>
      {children}
    </VoiceContext.Provider>
  )
}