import * as React from 'react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, Volume2, Settings, Minimize2 } from 'lucide-react'

import { cn } from '../../utils/cn'
import { Button } from '../Button'
import { Card, CardContent, CardHeader } from '../Card'
import { VoiceWidgetPropsSchema, type VoiceWidgetProps } from '../../schemas/component-schemas'
import { validateAriaCompliance } from '../../schemas/aria-schemas'
import { ComponentMetadata, generateAriaAttributes, generateActionAttributes } from '../../utils/component-metadata'

// Web Audio API type definitions
declare global {
  interface AudioWorkletProcessor {
    readonly port: MessagePort
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>
    ): boolean
  }
  
  interface AudioWorkletProcessorConstructor {
    new (): AudioWorkletProcessor
  }
  
  var AudioWorkletProcessor: AudioWorkletProcessorConstructor
}

// Voice widget metadata
export const VoiceWidgetMetadata: ComponentMetadata = {
  name: 'VoiceWidget',
  version: '1.0.0', 
  description: 'Embeddable voice assistant widget with Shadow DOM isolation',
  category: 'voice',
  tags: ['voice', 'assistant', 'ai', 'interactive', 'shadow-dom'],
  props: VoiceWidgetPropsSchema.shape,
  requiredProps: [],
  defaultProps: {
    position: 'bottom-right',
    offset: { x: 24, y: 24 },
    autoOpen: false,
    minimizeOnClickOutside: true,
    persistent: false,
    language: 'en-US',
    voice: 'alloy',
    enableTranscription: true,
    enableSpeechSynthesis: true,
    theme: 'auto',
    size: 'md',
    showWaveform: true,
    showTranscript: true,
  },
  variants: {
    position: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    theme: ['light', 'dark', 'auto'],
    size: ['sm', 'md', 'lg'],
  },
}

// Voice state interface
interface VoiceState {
  isListening: boolean
  isProcessing: boolean
  isConnected: boolean
  hasPermission: boolean
  transcript: string
  response: string
  audioLevel: number
  error: string | null
}

// Audio processor for real-time audio handling
// TODO: Integrate with VoiceWidget for real-time audio processing
export class AudioProcessor extends AudioWorkletProcessor {
  override process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
    const input = inputs[0]
    if (input && input.length > 0) {
      // Calculate RMS for audio level
      const samples = input[0]
      if (samples && samples.length > 0) {
        let sum = 0
        for (let i = 0; i < samples.length; i++) {
          sum += samples[i]! * samples[i]!
        }
        const rms = Math.sqrt(sum / samples.length)
        
        // Send audio level to main thread
        this.port.postMessage({ type: 'audioLevel', level: rms })
        
        // Send audio data for processing (simplified for demo)
        this.port.postMessage({ type: 'audioData', data: samples })
      }
    }
    
    return true
  }
}

// WebSocket client for voice streaming
class VoiceWebSocketClient {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(
    private url: string,
    private onMessage: (data: any) => void,
    private onStateChange: (connected: boolean) => void
  ) {}

  connect() {
    try {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        this.onStateChange(true)
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.onMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
      this.ws.onclose = () => {
        this.onStateChange(false)
        this.attemptReconnect()
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.onStateChange(false)
      }
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
      this.onStateChange(false)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  sendBinaryData(data: ArrayBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        if (process.env['NODE_ENV'] === 'development') {
          console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        }
        this.connect()
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }
}

// Main Voice Widget component
export const VoiceWidget = React.forwardRef<HTMLDivElement, VoiceWidgetProps>(
  (props, ref) => {
    // Validate props
    const validationResult = VoiceWidgetPropsSchema.safeParse(props)
    if (!validationResult.success && process.env['NODE_ENV'] === 'development') {
      console.error('VoiceWidget props validation failed:', validationResult.error)
    }

    const {
      position = 'bottom-right',
      offset = { x: 24, y: 24 },
      autoOpen = false,
      minimizeOnClickOutside = true,
      persistent = false,
      language = 'en-US',
      voice = 'alloy',
      enableTranscription = true,
      enableSpeechSynthesis = true,
      theme = 'auto',
      size = 'md',
      showWaveform = true,
      showTranscript = true,
      onStart,
      onStop,
      onTranscript,
      onResponse,
      onError,
      apiEndpoint,
      customActions = [],
      ...restProps
    } = validationResult.success ? validationResult.data : props

    // Component state
    const [isOpen, setIsOpen] = useState(autoOpen)
    const [isMinimized, setIsMinimized] = useState(!autoOpen)
    const [showSettings, setShowSettings] = useState(false)
    const [voiceState, setVoiceState] = useState<VoiceState>({
      isListening: false,
      isProcessing: false,
      isConnected: false,
      hasPermission: false,
      transcript: '',
      response: '',
      audioLevel: 0,
      error: null,
    })

    // Refs
    const shadowHostRef = useRef<HTMLDivElement>(null)
    const shadowRootRef = useRef<ShadowRoot | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const audioWorkletRef = useRef<AudioWorkletNode | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const wsClientRef = useRef<VoiceWebSocketClient | null>(null)

    // ARIA validation
    const ariaValidation = validateAriaCompliance('VoiceWidget', restProps)
    if (!ariaValidation.isCompliant && process.env['NODE_ENV'] === 'development') {
      console.warn(`VoiceWidget ARIA violations:`, ariaValidation.violations)
    }

    // Generate ARIA and action attributes
    const ariaAttributes = generateAriaAttributes('VoiceWidget', {
      'aria-label': 'Voice Assistant',
      'aria-expanded': isOpen,
      ...restProps,
    })
    const actionAttributes = generateActionAttributes('VoiceWidget', 'voice.toggle')

    // Position styles
    const getPositionStyles = useCallback(() => {
      const styles: React.CSSProperties = {
        position: 'fixed',
        zIndex: 9999,
      }

      switch (position) {
        case 'bottom-right':
          styles.bottom = offset.y
          styles.right = offset.x
          break
        case 'bottom-left':
          styles.bottom = offset.y
          styles.left = offset.x
          break
        case 'top-right':
          styles.top = offset.y
          styles.right = offset.x
          break
        case 'top-left':
          styles.top = offset.y
          styles.left = offset.x
          break
      }

      return styles
    }, [position, offset])

    // Size configuration
    const sizeConfig = {
      sm: { width: 320, minWidth: 280, buttonSize: 48 },
      md: { width: 380, minWidth: 320, buttonSize: 56 },
      lg: { width: 440, minWidth: 360, buttonSize: 64 },
    }[size]

    // Initialize Shadow DOM
    useEffect(() => {
      if (shadowHostRef.current && !shadowRootRef.current) {
        shadowRootRef.current = shadowHostRef.current.attachShadow({ mode: 'closed' })
        
        // Inject Tailwind styles into shadow DOM
        const styleSheet = new CSSStyleSheet()
        // In a real implementation, you'd inject the complete Tailwind CSS
        styleSheet.insertRule(`
          .voice-widget-root {
            font-family: system-ui, sans-serif;
            color-scheme: ${theme};
          }
        `)
        shadowRootRef.current.adoptedStyleSheets = [styleSheet]
      }
    }, [theme])

    // Initialize WebSocket connection
    useEffect(() => {
      const wsUrl = apiEndpoint || 'ws://localhost:5000'
      
      wsClientRef.current = new VoiceWebSocketClient(
        wsUrl,
        handleWebSocketMessage,
        (connected) => setVoiceState(prev => ({ ...prev, isConnected: connected }))
      )
      
      wsClientRef.current.connect()

      return () => {
        if (wsClientRef.current) {
          wsClientRef.current.disconnect()
        }
      }
    }, [apiEndpoint])

    // Handle WebSocket messages
    const handleWebSocketMessage = useCallback((data: any) => {
      switch (data.type) {
        case 'transcript':
          setVoiceState(prev => ({ ...prev, transcript: data.text }))
          onTranscript?.(data.text, data.isFinal)
          if (data.isFinal) {
            setVoiceState(prev => ({ ...prev, isListening: false, isProcessing: true }))
          }
          break
          
        case 'response':
          setVoiceState(prev => ({ 
            ...prev, 
            response: data.text, 
            isProcessing: false 
          }))
          onResponse?.(data.text, data.audioUrl)
          
          // Play TTS audio if available and enabled
          if (data.audioUrl && enableSpeechSynthesis) {
            const audio = new Audio(data.audioUrl)
            audio.play().catch(console.error)
          }
          break
          
        case 'error':
          setVoiceState(prev => ({
            ...prev,
            error: data.message,
            isListening: false,
            isProcessing: false,
          }))
          onError?.(new Error(data.message))
          break
      }
    }, [onTranscript, onResponse, onError, enableSpeechSynthesis])

    // Request microphone permission
    const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
            channelCount: 1,
          }
        })
        
        // Stop the stream - we just needed permission
        stream.getTracks().forEach(track => track.stop())
        setVoiceState(prev => ({ ...prev, hasPermission: true }))
        return true
      } catch (error) {
        console.error('Microphone permission denied:', error)
        setVoiceState(prev => ({ ...prev, hasPermission: false, error: 'Microphone permission required' }))
        return false
      }
    }, [])

    // Start voice recording
    const startListening = useCallback(async () => {
      if (!voiceState.isConnected || voiceState.isListening) {return}

      try {
        // Request permission if needed
        if (!voiceState.hasPermission) {
          const granted = await requestMicrophonePermission()
          if (!granted) {return}
        }

        // Get microphone stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
            channelCount: 1,
          }
        })

        // Initialize audio context and worklet
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({ sampleRate: 44100 })
          
          // Register audio worklet processor
          await audioContextRef.current.audioWorklet.addModule(
            URL.createObjectURL(new Blob([`
              class VoiceProcessor extends AudioWorkletProcessor {
                process(inputs, outputs, parameters) {
                  const input = inputs[0]
                  if (input && input.length > 0) {
                    const samples = input[0]
                    if (samples && samples.length > 0) {
                      let sum = 0
                      for (let i = 0; i < samples.length; i++) {
                        sum += samples[i]! * samples[i]!
                      }
                      const rms = Math.sqrt(sum / samples.length)
                      this.port.postMessage({ type: 'audioLevel', level: rms })
                    }
                  }
                  return true
                }
              }
              registerProcessor('voice-processor', VoiceProcessor)
            `], { type: 'application/javascript' }))
          )
        }

        // Create audio worklet node
        audioWorkletRef.current = new AudioWorkletNode(audioContextRef.current, 'voice-processor')
        audioWorkletRef.current.port.onmessage = (event) => {
          if (event.data.type === 'audioLevel') {
            setVoiceState(prev => ({ ...prev, audioLevel: event.data.level }))
          }
        }

        // Connect audio graph
        const source = audioContextRef.current.createMediaStreamSource(stream)
        source.connect(audioWorkletRef.current)

        // Setup media recorder for streaming
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        })

        const audioChunks: BlobPart[] = []
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data)
            
            // Stream audio chunk to server
            if (wsClientRef.current) {
              event.data.arrayBuffer().then(buffer => {
                wsClientRef.current?.sendBinaryData(buffer)
              })
            }
          }
        }

        mediaRecorderRef.current.onstop = () => {
          stream.getTracks().forEach(track => track.stop())
          if (audioContextRef.current && audioWorkletRef.current) {
            audioWorkletRef.current.disconnect()
          }
        }

        // Start recording
        setVoiceState(prev => ({ 
          ...prev, 
          isListening: true, 
          transcript: '', 
          response: '', 
          error: null 
        }))
        
        mediaRecorderRef.current.start(100) // Collect 100ms chunks
        
        // Notify server
        if (wsClientRef.current) {
          wsClientRef.current.send({
            type: 'start_session',
            language,
            voice,
            enableTranscription,
          })
        }

        onStart?.()

      } catch (error) {
        console.error('Failed to start voice recording:', error)
        setVoiceState(prev => ({
          ...prev,
          error: 'Failed to start voice recording',
          isListening: false,
        }))
      }
    }, [voiceState.isConnected, voiceState.hasPermission, voiceState.isListening, language, voice, enableTranscription, requestMicrophonePermission, onStart])

    // Stop voice recording
    const stopListening = useCallback(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }

      setVoiceState(prev => ({ 
        ...prev, 
        isListening: false,
        audioLevel: 0,
      }))

      // Notify server
      if (wsClientRef.current) {
        wsClientRef.current.send({ type: 'end_session' })
      }

      onStop?.()
    }, [onStop])

    // Toggle voice recording
    const toggleVoice = useCallback(async () => {
      if (voiceState.isListening) {
        stopListening()
      } else {
        await startListening()
        if (isMinimized) {
          setIsMinimized(false)
          setIsOpen(true)
        }
      }
    }, [voiceState.isListening, isMinimized, startListening, stopListening])

    // Handle outside click
    useEffect(() => {
      if (!minimizeOnClickOutside) {return}

      const handleClickOutside = (event: MouseEvent) => {
        if (shadowHostRef.current && !shadowHostRef.current.contains(event.target as Node)) {
          if (!persistent && isOpen && !voiceState.isListening) {
            setIsMinimized(true)
            setIsOpen(false)
          }
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [minimizeOnClickOutside, persistent, isOpen, voiceState.isListening])

    // Keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && isOpen) {
          setIsOpen(false)
          setIsMinimized(true)
          if (voiceState.isListening) {
            stopListening()
          }
        } else if (event.code === 'Space' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          toggleVoice()
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, voiceState.isListening, stopListening, toggleVoice])

    // Render waveform visualization
    const renderWaveform = () => {
      if (!showWaveform) {return null}

      return (
        <div className="flex items-center justify-center space-x-1 h-8 my-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'bg-primary rounded-full transition-all duration-150',
                'w-1',
                voiceState.isListening ? 'animate-voice-wave' : 'h-1'
              )}
              style={{
                height: voiceState.isListening 
                  ? `${Math.max(4, voiceState.audioLevel * 20 + Math.random() * 10)}px`
                  : '4px',
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )
    }

    // Widget content
    const widgetContent = (
      <div 
        ref={ref}
        className="voice-widget-root"
        style={getPositionStyles()}
        {...ariaAttributes}
        {...actionAttributes}
        {...restProps}
      >
        {/* Main Voice Panel */}
        <AnimatePresence>
          {isOpen && !isMinimized && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <Card 
                className="backdrop-blur-sm bg-card/95 border shadow-xl"
                style={{ width: sizeConfig.width, minWidth: sizeConfig.minWidth }}
              >
                <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
                  <div className="flex items-center space-x-2">
                    <div 
                      className={cn(
                        'w-2 h-2 rounded-full',
                        voiceState.isConnected ? 'bg-green-500' : 'bg-red-500'
                      )} 
                    />
                    <span className="text-sm font-medium">Voice Assistant</span>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSettings(!showSettings)}
                      className="h-8 w-8"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setIsMinimized(true); setIsOpen(false) }}
                      className="h-8 w-8"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Waveform Visualizer */}
                  {renderWaveform()}

                  {/* Transcript and Response */}
                  {showTranscript && (
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {voiceState.transcript && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm">
                            <span className="font-medium text-muted-foreground">You: </span>
                            {voiceState.transcript}
                          </p>
                        </div>
                      )}
                      
                      {voiceState.response && (
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <p className="text-sm">
                            <span className="font-medium text-primary">Assistant: </span>
                            {voiceState.response}
                          </p>
                        </div>
                      )}
                      
                      {voiceState.error && (
                        <div className="p-3 bg-destructive/10 rounded-lg">
                          <p className="text-sm text-destructive">{voiceState.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voice Controls */}
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={toggleVoice}
                      disabled={!voiceState.isConnected}
                      size="lg"
                      className={cn(
                        'voice-button',
                        voiceState.isListening && 'listening',
                        voiceState.isProcessing && 'processing'
                      )}
                    >
                      {voiceState.isListening ? (
                        <MicOff className="h-5 w-5" />
                      ) : voiceState.isProcessing ? (
                        <Volume2 className="h-5 w-5" />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </Button>

                    <div className="text-xs text-muted-foreground">
                      {voiceState.isListening ? 'Listening...' :
                       voiceState.isProcessing ? 'Processing...' :
                       voiceState.isConnected ? 'Ready' : 'Connecting...'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Voice Button */}
        <AnimatePresence>
          {(!isOpen || isMinimized) && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <Button
                onClick={() => { setIsOpen(true); setIsMinimized(false) }}
                disabled={!voiceState.isConnected}
                className={cn(
                  'voice-button shadow-lg hover:shadow-xl transition-shadow',
                  voiceState.isListening && 'listening',
                  voiceState.isProcessing && 'processing'
                )}
                style={{ 
                  width: sizeConfig.buttonSize, 
                  height: sizeConfig.buttonSize,
                  borderRadius: '50%' 
                }}
              >
                {voiceState.isListening ? (
                  <MicOff className="h-6 w-6" />
                ) : voiceState.isProcessing ? (
                  <Volume2 className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>

              {/* Connection status indicator */}
              {!voiceState.isConnected && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )

    // Render in Shadow DOM if available, otherwise use portal
    if (shadowRootRef.current) {
      return createPortal(widgetContent, shadowRootRef.current as any)
    }

    // Fallback to regular portal
    return (
      <>
        <div ref={shadowHostRef} />
        {createPortal(widgetContent, document.body)}
      </>
    )
  }
)

VoiceWidget.displayName = 'VoiceWidget'

export type { VoiceWidgetProps }
export { VoiceWidget as default }