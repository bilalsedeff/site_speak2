/**
 * VoiceTutorialEngine - Interactive voice lesson system
 *
 * Integrates with:
 * - Existing AudioWorklet system for ultra-low latency
 * - Intent recognition for command validation
 * - TTS for voice instructions
 * - STT for speech recognition
 * - TutorialOrchestrator for state management
 */

import { EventEmitter } from 'events'
import type { AudioWorkletIntegrationService } from '../AudioWorkletIntegrationService'
import type { TutorialOrchestrator, TutorialStep } from './TutorialOrchestrator'

// Voice Tutorial specific types
export interface VoiceTutorialConfig {
  enableRealTimeValidation: boolean
  enablePartialResults: boolean
  confidenceThreshold: number
  timeoutMs: number
  maxRetries: number
  enableTTS: boolean
  ttsSettings: {
    rate: number
    pitch: number
    volume: number
    voice?: string
  }
  enableHapticFeedback: boolean
  enableVisualFeedback: boolean
}

export interface VoiceRecognitionResult {
  transcript: string
  confidence: number
  isFinal: boolean
  partialResults?: string[]
  audioLevel?: number
  timestamp: Date
}

export interface VoiceFeedback {
  type: 'success' | 'error' | 'hint' | 'instruction' | 'encouragement'
  message: string
  audioMessage?: string
  duration?: number
  shouldSpeak?: boolean
}

export interface TutorialVoiceSession {
  sessionId: string
  tutorialSessionId: string
  isListening: boolean
  isProcessing: boolean
  isSpeaking: boolean
  currentCommand?: string
  recognitionResults: VoiceRecognitionResult[]
  feedback: VoiceFeedback[]
  performanceMetrics: {
    totalCommands: number
    successfulCommands: number
    averageConfidence: number
    averageResponseTime: number
    errors: Array<{ command: string, error: string, timestamp: Date }>
  }
}

// Default configuration
const DEFAULT_VOICE_CONFIG: VoiceTutorialConfig = {
  enableRealTimeValidation: true,
  enablePartialResults: true,
  confidenceThreshold: 0.7,
  timeoutMs: 5000,
  maxRetries: 3,
  enableTTS: true,
  ttsSettings: {
    rate: 0.9,
    pitch: 1.0,
    volume: 0.8
  },
  enableHapticFeedback: true,
  enableVisualFeedback: true
}

export class VoiceTutorialEngine extends EventEmitter {
  private config: VoiceTutorialConfig
  private audioService: AudioWorkletIntegrationService | null = null
  private tutorialOrchestrator: TutorialOrchestrator | null = null
  private voiceSessions: Map<string, TutorialVoiceSession> = new Map()
  private speechSynthesis: SpeechSynthesis | null = null
  private isInitialized = false

  constructor(config: Partial<VoiceTutorialConfig> = {}) {
    super()
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config }

    // Initialize Speech Synthesis if available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis
    }
  }

  /**
   * Initialize the voice tutorial engine
   */
  async initialize(
    audioService: AudioWorkletIntegrationService,
    tutorialOrchestrator: TutorialOrchestrator
  ): Promise<void> {
    if (this.isInitialized) {return}

    try {
      this.audioService = audioService
      this.tutorialOrchestrator = tutorialOrchestrator

      // Ensure audio service is initialized
      if (audioService.getStatus().mode === 'disabled') {
        await audioService.initialize()
      }

      // Set up event listeners
      this.setupAudioServiceListeners()
      this.setupTutorialOrchestratorListeners()

      this.isInitialized = true
      console.log('VoiceTutorialEngine initialized successfully')
    } catch (error) {
      console.error('Failed to initialize VoiceTutorialEngine:', error)
      throw error
    }
  }

  /**
   * Start voice session for tutorial
   */
  async startVoiceSession(tutorialSessionId: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('VoiceTutorialEngine not initialized')
    }

    const sessionId = `voice_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const voiceSession: TutorialVoiceSession = {
      sessionId,
      tutorialSessionId,
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      recognitionResults: [],
      feedback: [],
      performanceMetrics: {
        totalCommands: 0,
        successfulCommands: 0,
        averageConfidence: 0,
        averageResponseTime: 0,
        errors: []
      }
    }

    this.voiceSessions.set(sessionId, voiceSession)

    // Start audio worklet session
    if (this.audioService) {
      try {
        await this.audioService.startListening({
          enableVAD: true,
          enablePartialResults: this.config.enablePartialResults,
          confidenceThreshold: this.config.confidenceThreshold,
          timeout: this.config.timeoutMs
        })
      } catch (error) {
        console.warn('Failed to start audio service, continuing without voice input:', error)
      }
    }

    this.emit('voice_session_started', { sessionId, tutorialSessionId })
    return sessionId
  }

  /**
   * Process voice command during tutorial
   */
  async processVoiceCommand(
    sessionId: string,
    command: string,
    confidence: number,
    audioLevel?: number
  ): Promise<{
    success: boolean
    feedback: VoiceFeedback
    shouldAdvance: boolean
    metrics: any
  }> {
    const voiceSession = this.voiceSessions.get(sessionId)
    if (!voiceSession) {
      throw new Error('Voice session not found')
    }

    const startTime = Date.now()
    voiceSession.isProcessing = true

    try {
      // Add recognition result
      const recognitionResult: VoiceRecognitionResult = {
        transcript: command,
        confidence,
        isFinal: true,
        ...(audioLevel !== undefined && { audioLevel }),
        timestamp: new Date()
      }
      voiceSession.recognitionResults.push(recognitionResult)

      // Get current tutorial step
      const tutorialSession = this.tutorialOrchestrator?.getSession(voiceSession.tutorialSessionId)
      if (!tutorialSession) {
        throw new Error('Tutorial session not found')
      }

      const currentStep = this.tutorialOrchestrator?.getCurrentStep(voiceSession.tutorialSessionId)
      if (!currentStep) {
        throw new Error('No current step found')
      }

      // Process command through tutorial orchestrator
      const result = await this.tutorialOrchestrator!.processVoiceCommand(
        voiceSession.tutorialSessionId,
        command,
        confidence,
        audioLevel
      )

      // Update performance metrics
      voiceSession.performanceMetrics.totalCommands++
      if (result.success) {
        voiceSession.performanceMetrics.successfulCommands++
      }

      const responseTime = Date.now() - startTime
      voiceSession.performanceMetrics.averageResponseTime =
        (voiceSession.performanceMetrics.averageResponseTime * (voiceSession.performanceMetrics.totalCommands - 1) + responseTime) /
        voiceSession.performanceMetrics.totalCommands

      voiceSession.performanceMetrics.averageConfidence =
        (voiceSession.performanceMetrics.averageConfidence * (voiceSession.performanceMetrics.totalCommands - 1) + confidence) /
        voiceSession.performanceMetrics.totalCommands

      // Create feedback
      const feedback: VoiceFeedback = {
        type: result.success ? 'success' : 'error',
        message: result.feedback,
        audioMessage: result.feedback,
        shouldSpeak: this.config.enableTTS,
        duration: result.success ? 2000 : 3000
      }

      // Add hints if available
      if (result.hints && result.hints.length > 0) {
        const hintFeedback: VoiceFeedback = {
          type: 'hint',
          message: `Hint: ${result.hints.join('. ')}`,
          audioMessage: `Here's a hint: ${result.hints.join('. ')}`,
          shouldSpeak: this.config.enableTTS,
          duration: 4000
        }
        voiceSession.feedback.push(hintFeedback)

        // Speak hints after a short delay
        if (this.config.enableTTS) {
          setTimeout(() => {
            this.speakMessage(hintFeedback.audioMessage!)
          }, 1500)
        }
      }

      voiceSession.feedback.push(feedback)

      // Speak feedback if TTS enabled
      if (this.config.enableTTS && feedback.shouldSpeak) {
        await this.speakMessage(feedback.audioMessage!)
      }

      // Emit event
      this.emit('command_processed', {
        sessionId,
        command,
        confidence,
        success: result.success,
        shouldAdvance: result.shouldAdvance,
        responseTime
      })

      return {
        success: result.success,
        feedback,
        shouldAdvance: result.shouldAdvance,
        metrics: voiceSession.performanceMetrics
      }

    } catch (error) {
      // Handle error
      voiceSession.performanceMetrics.errors.push({
        command,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      })

      const errorFeedback: VoiceFeedback = {
        type: 'error',
        message: 'Sorry, there was an error processing your command. Please try again.',
        audioMessage: 'Sorry, there was an error. Please try again.',
        shouldSpeak: this.config.enableTTS
      }

      voiceSession.feedback.push(errorFeedback)

      if (this.config.enableTTS) {
        await this.speakMessage(errorFeedback.audioMessage!)
      }

      throw error
    } finally {
      voiceSession.isProcessing = false
      this.voiceSessions.set(sessionId, voiceSession)
    }
  }

  /**
   * Start listening for voice commands
   */
  async startListening(sessionId: string): Promise<void> {
    const voiceSession = this.voiceSessions.get(sessionId)
    if (!voiceSession) {
      throw new Error('Voice session not found')
    }

    voiceSession.isListening = true
    this.voiceSessions.set(sessionId, voiceSession)

    if (this.audioService) {
      try {
        await this.audioService.startListening({
          enableVAD: true,
          enablePartialResults: this.config.enablePartialResults,
          confidenceThreshold: this.config.confidenceThreshold,
          timeout: this.config.timeoutMs
        })
      } catch (error) {
        voiceSession.isListening = false
        console.error('Failed to start listening:', error)
        throw error
      }
    }

    this.emit('listening_started', { sessionId })
  }

  /**
   * Stop listening for voice commands
   */
  async stopListening(sessionId: string): Promise<void> {
    const voiceSession = this.voiceSessions.get(sessionId)
    if (!voiceSession) {
      throw new Error('Voice session not found')
    }

    voiceSession.isListening = false
    this.voiceSessions.set(sessionId, voiceSession)

    if (this.audioService) {
      try {
        await this.audioService.stopListening()
      } catch (error) {
        console.warn('Error stopping audio service:', error)
      }
    }

    this.emit('listening_stopped', { sessionId })
  }

  /**
   * Speak tutorial instructions
   */
  async speakInstructions(sessionId: string, step: TutorialStep): Promise<void> {
    const voiceSession = this.voiceSessions.get(sessionId)
    if (!voiceSession) {
      throw new Error('Voice session not found')
    }

    if (!this.config.enableTTS) {return}

    const instruction = `${step.title}. ${step.content}. ${step.voiceInstructions}`

    voiceSession.isSpeaking = true
    this.voiceSessions.set(sessionId, voiceSession)

    try {
      await this.speakMessage(instruction)

      const feedback: VoiceFeedback = {
        type: 'instruction',
        message: instruction,
        audioMessage: instruction,
        shouldSpeak: false // Already spoken
      }

      voiceSession.feedback.push(feedback)
    } finally {
      voiceSession.isSpeaking = false
      this.voiceSessions.set(sessionId, voiceSession)
    }

    this.emit('instructions_spoken', { sessionId, stepId: step.id })
  }

  /**
   * Provide encouragement
   */
  async provideEncouragement(sessionId: string, type: 'progress' | 'retry' | 'success'): Promise<void> {
    if (!this.config.enableTTS) {return}

    const encouragements = {
      progress: [
        "You're doing great! Keep going.",
        "Nice progress! Let's continue.",
        "Excellent work so far!"
      ],
      retry: [
        "No worries, let's try that again.",
        "That's okay, practice makes perfect.",
        "Let's give it another try."
      ],
      success: [
        "Perfect! Well done!",
        "Excellent! You've got it!",
        "Great job! That was perfect!"
      ]
    }

    const messages = encouragements[type]
    const message = messages[Math.floor(Math.random() * messages.length)] || "Great job!"

    const voiceSession = this.voiceSessions.get(sessionId)
    if (voiceSession && message) {
      const feedback: VoiceFeedback = {
        type: 'encouragement',
        message,
        audioMessage: message,
        shouldSpeak: true
      }

      voiceSession.feedback.push(feedback)
      this.voiceSessions.set(sessionId, voiceSession)

      await this.speakMessage(message)
    }
  }

  /**
   * Get voice session info
   */
  getVoiceSession(sessionId: string): TutorialVoiceSession | null {
    return this.voiceSessions.get(sessionId) || null
  }

  /**
   * End voice session
   */
  async endVoiceSession(sessionId: string): Promise<void> {
    const voiceSession = this.voiceSessions.get(sessionId)
    if (!voiceSession) {return}

    try {
      // Stop listening if active
      if (voiceSession.isListening) {
        await this.stopListening(sessionId)
      }

      // Stop any ongoing speech
      if (this.speechSynthesis && this.speechSynthesis.speaking) {
        this.speechSynthesis.cancel()
      }

      // Clean up session
      this.voiceSessions.delete(sessionId)

      this.emit('voice_session_ended', {
        sessionId,
        metrics: voiceSession.performanceMetrics
      })
    } catch (error) {
      console.error('Error ending voice session:', error)
    }
  }

  /**
   * Get performance metrics for session
   */
  getSessionMetrics(sessionId: string): TutorialVoiceSession['performanceMetrics'] | null {
    const session = this.voiceSessions.get(sessionId)
    return session ? session.performanceMetrics : null
  }

  // Private methods

  private setupAudioServiceListeners(): void {
    if (!this.audioService) {return}

    // Listen for audio events
    this.audioService.on('audio_level', (data: { level: number }) => {
      // Emit audio level to UI components
      this.emit('audio_level', data)
    })

    this.audioService.on('speech_result', (data: {
      transcript: string
      confidence: number
      isFinal: boolean
    }) => {
      // Handle speech recognition results
      this.handleSpeechResult(data)
    })

    this.audioService.on('vad', (data: { active: boolean }) => {
      // Handle voice activity detection
      this.emit('voice_activity', data)
    })

    this.audioService.on('error', (error: any) => {
      console.error('Audio service error:', error)
      this.emit('audio_error', error)
    })
  }

  private setupTutorialOrchestratorListeners(): void {
    if (!this.tutorialOrchestrator) {return}

    this.tutorialOrchestrator.on('tutorial_event', (event: any) => {
      // Handle tutorial events
      this.handleTutorialEvent(event)
    })
  }

  private handleSpeechResult(data: {
    transcript: string
    confidence: number
    isFinal: boolean
  }): void {
    // Find active voice session
    const activeSession = Array.from(this.voiceSessions.values()).find(
      session => session.isListening && !session.isProcessing
    )

    if (activeSession && data.isFinal) {
      // Process the command
      this.processVoiceCommand(
        activeSession.sessionId,
        data.transcript,
        data.confidence
      ).catch(error => {
        console.error('Error processing voice command:', error)
      })
    }

    // Emit partial results if enabled
    if (this.config.enablePartialResults && !data.isFinal) {
      this.emit('partial_result', {
        transcript: data.transcript,
        confidence: data.confidence
      })
    }

    // Emit final results
    if (data.isFinal) {
      this.emit('speech_result', {
        transcript: data.transcript,
        confidence: data.confidence,
        sessionId: activeSession?.sessionId
      })
    }
  }

  // TODO: Unused method - commented out due to AudioWorkletIntegrationService interface mismatch
  // private _handleSpeechResult(data: {
  //   transcript: string
  //   confidence: number
  //   isFinal: boolean
  // }): void {
  //   // Find active voice session
  //   const activeSession = Array.from(this.voiceSessions.values()).find(
  //     session => session.isListening && !session.isProcessing
  //   )

  //   if (activeSession && data.isFinal) {
  //     // Process the command
  //     this.processVoiceCommand(
  //       activeSession.sessionId,
  //       data.transcript,
  //       data.confidence
  //     ).catch(error => {
  //       console.error('Error processing voice command:', error)
  //     })
  //   }

  //   // Emit partial results if enabled
  //   if (this.config.enablePartialResults && !data.isFinal) {
  //     this.emit('partial_result', {
  //       transcript: data.transcript,
  //       confidence: data.confidence
  //     })
  //   }
  // }

  private handleTutorialEvent(event: any): void {
    // Relay relevant tutorial events
    switch (event.type) {
      case 'step_started':
        this.emit('tutorial_step_started', event)
        break
      case 'step_completed':
        this.emit('tutorial_step_completed', event)
        break
      case 'tutorial_completed':
        this.emit('tutorial_completed', event)
        break
    }
  }

  private async speakMessage(message: string): Promise<void> {
    if (!this.speechSynthesis || !this.config.enableTTS) {return}

    return new Promise((resolve, reject) => {
      // Cancel any existing speech
      this.speechSynthesis!.cancel()

      const utterance = new SpeechSynthesisUtterance(message)
      utterance.rate = this.config.ttsSettings.rate
      utterance.pitch = this.config.ttsSettings.pitch
      utterance.volume = this.config.ttsSettings.volume

      if (this.config.ttsSettings.voice) {
        const voices = this.speechSynthesis!.getVoices()
        const selectedVoice = voices.find(voice => voice.name === this.config.ttsSettings.voice)
        if (selectedVoice) {
          utterance.voice = selectedVoice
        }
      }

      utterance.onend = () => resolve()
      utterance.onerror = (error) => reject(error)

      try {
        this.speechSynthesis!.speak(utterance)
      } catch (error) {
        reject(error)
      }
    })
  }
}

// Factory function for easy setup
export async function createVoiceTutorialEngine(
  audioService: AudioWorkletIntegrationService,
  tutorialOrchestrator: TutorialOrchestrator,
  config?: Partial<VoiceTutorialConfig>
): Promise<VoiceTutorialEngine> {
  const engine = new VoiceTutorialEngine(config)
  await engine.initialize(audioService, tutorialOrchestrator)
  return engine
}