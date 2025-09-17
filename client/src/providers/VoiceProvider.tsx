import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

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

    // Voice processing events - updated to match server event names
    socketInstance.on('voice_event', (event: any) => {
      console.log('Received voice event:', event)
      
      switch (event.type) {
        case 'ready':
          console.log('Voice session ready:', event.data)
          break
        
        case 'partial_asr':
          setTranscript(event.text || '')
          break
        
        case 'final_asr':
          setTranscript(event.text || '')
          // Don't stop listening here - let the server VAD handle it
          setIsProcessing(true)
          break
        
        case 'agent_final':
          setResponse(event.data?.text || '')
          setIsProcessing(false)
          // Keep listening for continuous conversation
          if (isRecording) {
            setIsListening(true)
          }
          break
        
        case 'speech_started':
          // OpenAI Realtime VAD detected speech start
          setIsListening(true)
          setIsRecording(true)
          setTranscript('') // Clear previous transcript
          setResponse('') // Clear previous response
          break
          
        case 'speech_stopped':
          // OpenAI Realtime VAD detected speech end - but keep recording for continuous flow
          setIsListening(false)
          setIsProcessing(true)
          break
        
        case 'agent_delta':
          // Handle streaming response
          if (event.data?.text) {
            setResponse(prev => prev + event.data.text)
          }
          break
        
        case 'mic_opened':
          setIsListening(true)
          setIsRecording(true)
          break
        
        case 'mic_closed':
          setIsListening(false)
          setIsRecording(false)
          // Stop recording immediately when server tells us to
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          break
        
        case 'error':
          console.error('Voice event error:', event)
          setIsListening(false)
          setIsProcessing(false)
          setIsRecording(false)
          // Stop recording immediately on error
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          break
        
        default:
          console.log('Unknown voice event type:', event.type)
      }
    })

    // Audio chunks from server
    socketInstance.on('audio_chunk', async (data: { data: ArrayBuffer; format: string; timestamp: number }) => {
      // Play audio response if available
      if (data.data) {
        try {
          // Use Web Audio API for better real-time playback
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext()
          }

          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume()
          }

          if (data.format === 'pcm16') {
            // Handle PCM16 audio data
            const int16Array = new Int16Array(data.data)
            const float32Array = new Float32Array(int16Array.length)
            
            // Convert PCM16 to Float32 range [-1, 1]
            for (let i = 0; i < int16Array.length; i++) {
              float32Array[i] = int16Array[i]! / 32768.0
            }

            // Create audio buffer with correct sample rate for OpenAI Realtime API
            const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000)
            audioBuffer.copyToChannel(float32Array, 0)

            // Create and play buffer source
            const source = audioContextRef.current.createBufferSource()
            source.buffer = audioBuffer
            source.connect(audioContextRef.current.destination)
            source.start()

            console.log('PCM16 audio chunk played', { 
              samples: float32Array.length,
              duration: audioBuffer.duration 
            })
          } else {
            // For other formats, try to decode directly
            try {
              const audioBuffer = await audioContextRef.current.decodeAudioData(data.data.slice(0))
              const source = audioContextRef.current.createBufferSource()
              source.buffer = audioBuffer
              source.connect(audioContextRef.current.destination)
              source.start()

              console.log('Audio chunk played', { 
                format: data.format,
                duration: audioBuffer.duration 
              })
            } catch (decodeError) {
              console.warn('Failed to decode audio data, falling back to blob:', decodeError)
              // Fallback: try to play as blob URL
              const audioBlob = new Blob([data.data], { type: `audio/${data.format}` })
              const audioUrl = URL.createObjectURL(audioBlob)
              const audio = new Audio(audioUrl)
              await audio.play()
              URL.revokeObjectURL(audioUrl)
            }
          }
        } catch (error) {
          console.error('Failed to play audio chunk:', error)
        }
      }
    })

    // Handle ping from server
    socketInstance.on('ping', (data: any) => {
      console.log('Received ping:', data)
      // Respond with pong
      socketInstance.emit('pong', data)
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
        // For development, we'll connect directly to Socket.IO without creating a session first
        // In production, this would create a session through the API
        
        // Connect to Socket.IO server directly (development mode)
        const socketInstance = io('http://localhost:5000', {
          transports: ['polling', 'websocket'], // Start with polling, then upgrade to websocket
          upgrade: true,
          timeout: 20000,
          forceNew: true,
          auth: {
            // Development authentication - server allows connections without tokens in dev mode
            tenantId: '00000000-0000-0000-0000-000000000000',
            siteId: import.meta.env['VITE_SITE_ID'] || '00000000-0000-0000-0000-000000000000',
          },
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
          autoGainControl: true,
          sampleRate: 24000, // Match OpenAI Realtime API requirement
          channelCount: 1,
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
          autoGainControl: true,
          sampleRate: 24000, // Match OpenAI Realtime API requirement
          channelCount: 1,
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

      // Setup media recorder for real-time streaming with better browser compatibility
      let mediaRecorderOptions: MediaRecorderOptions
      
      // Try different MIME types for better compatibility
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mediaRecorderOptions = {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 16000,
        }
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mediaRecorderOptions = {
          mimeType: 'audio/webm',
          audioBitsPerSecond: 16000,
        }
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mediaRecorderOptions = {
          mimeType: 'audio/mp4',
          audioBitsPerSecond: 16000,
        }
      } else {
        // Fallback - no specific MIME type
        mediaRecorderOptions = {
          audioBitsPerSecond: 16000,
        }
      }

      console.log('🎙️ MediaRecorder options:', mediaRecorderOptions)
      mediaRecorderRef.current = new MediaRecorder(stream, mediaRecorderOptions)

      // Buffer to accumulate audio data and send in proper chunks
      let audioBuffer = new ArrayBuffer(0)
      const MAX_CHUNK_SIZE = 4096
      const TARGET_CHUNK_SIZE = 2048 // Target smaller chunks for better real-time performance

      const sendBufferedChunks = () => {
        // Only send if we're still recording and connected
        if (!isRecording || !socket?.connected) {
          return
        }
        
        const uint8Array = new Uint8Array(audioBuffer)
        let offset = 0
        
        while (offset + TARGET_CHUNK_SIZE <= uint8Array.length) {
          const chunk = uint8Array.slice(offset, offset + TARGET_CHUNK_SIZE)
          socket.emit('audio_frame', chunk.buffer)
          offset += TARGET_CHUNK_SIZE
        }
        
        // Keep remaining data for next batch
        if (offset < uint8Array.length) {
          const remaining = uint8Array.slice(offset)
          audioBuffer = remaining.buffer.slice()
        } else {
          audioBuffer = new ArrayBuffer(0)
        }
      }

      // Send audio chunks in real-time as they become available
      mediaRecorderRef.current.ondataavailable = async (event) => {
        console.log('📀 MediaRecorder ondataavailable triggered', { 
          dataSize: event.data.size, 
          isRecording,
          socketConnected: socket?.connected,
          mediaRecorderState: mediaRecorderRef.current?.state,
          timestamp: Date.now()
        })
        
        if (event.data.size > 0 && isRecording) { // Only process if we're still recording
          try {
            const newData = await event.data.arrayBuffer()
            
            // Send raw audio data directly to server for processing
            socket.emit('audio_frame', newData)
            
            console.log('🎵 Raw audio sent to server', { 
              size: newData.byteLength,
              timestamp: Date.now(),
              mediaRecorderState: mediaRecorderRef.current?.state
            })
          } catch (error) {
            console.error('Failed to process audio chunk:', error)
          }
        } else {
          console.warn('⚠️ Audio data not sent', { 
            dataSize: event.data.size, 
            isRecording, 
            socketConnected: socket?.connected 
          })
        }
      }


      mediaRecorderRef.current.onstart = () => {
        console.log('✅ MediaRecorder started successfully')
      }

      mediaRecorderRef.current.onerror = (error) => {
        console.error('❌ MediaRecorder error:', error)
      }

      mediaRecorderRef.current.onstop = () => {
        console.log('🛑 MediaRecorder stopped')
        
        // Send any remaining buffered audio
        if (audioBuffer.byteLength > 0) {
          const finalChunk = new Uint8Array(audioBuffer)
          if (finalChunk.byteLength <= MAX_CHUNK_SIZE) {
            socket.emit('audio_frame', finalChunk.buffer)
          } else {
            // Split large final chunk
            sendBufferedChunks()
          }
          audioBuffer = new ArrayBuffer(0)
        }
        
        // Cleanup when recording stops
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
      
      console.log('🎤 About to start MediaRecorder', { 
        state: mediaRecorderRef.current.state,
        mimeType: mediaRecorderRef.current.mimeType || 'default',
        stream: stream.active,
        tracks: stream.getAudioTracks().length,
        constraints: stream.getAudioTracks()[0]?.getSettings()
      })
      
      // Use smaller intervals for real-time streaming (50ms chunks)
      mediaRecorderRef.current.start(50)
      
      console.log('🎤 MediaRecorder started', { 
        state: mediaRecorderRef.current.state,
        interval: 50 
      })
      
      updateAudioLevel()

      // Notify server that we're starting to record
      console.log('🎤 Starting voice recording session', { language, voice, sessionId: socket.id })
      socket.emit('control', { action: 'start_recording', params: { language, voice } })

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
      socket.emit('control', { action: 'stop_recording' })
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
      socket.emit('text_input', { text, language })
      
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