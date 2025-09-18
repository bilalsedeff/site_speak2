/**
 * TutorialOrchestrator - Core tutorial flow and state management
 *
 * Manages:
 * - Tutorial progression and state
 * - User progress tracking
 * - Adaptive difficulty adjustment
 * - Integration with voice services
 * - Universal website compatibility
 */

import { EventEmitter } from 'events'

// Types
export interface TutorialStep {
  id: string
  title: string
  description: string
  content: string
  voiceInstructions: string
  expectedCommands: string[]
  hints?: string[]
  successMessage?: string
  errorMessage?: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: number // in seconds
  prerequisites?: string[]
  optional?: boolean
}

export interface Tutorial {
  id: string
  title: string
  description: string
  category: 'onboarding' | 'navigation' | 'commands' | 'advanced'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: number // total time in minutes
  steps: TutorialStep[]
  prerequisites?: string[]
  tags?: string[]
}

export interface UserProgress {
  userId: string
  tutorialId: string
  stepId: string
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped'
  attempts: number
  accuracy: number
  timeSpent: number
  lastUpdated: Date
  metadata?: Record<string, any>
}

export interface TutorialSession {
  id: string
  tutorialId: string
  userId: string
  startTime: Date
  currentStepIndex: number
  progress: UserProgress[]
  isActive: boolean
  adaptiveSettings: {
    difficultyLevel: number // 0-1
    paceMultiplier: number // 0.5-2.0
    hintsEnabled: boolean
    skipAllowed: boolean
  }
  context: {
    websiteType?: 'ecommerce' | 'blog' | 'landing' | 'dashboard' | 'other'
    userExperience?: 'novice' | 'intermediate' | 'expert'
    previousSessions?: number
  }
}

export interface TutorialOrchestratorConfig {
  enableAdaptiveDifficulty: boolean
  enableProgressPersistence: boolean
  enableAnalytics: boolean
  defaultTimeout: number
  maxRetries: number
  adaptiveThresholds: {
    accuracyForAdvancement: number
    attemptsBeforeHints: number
    timeoutBeforeSkip: number
  }
}

export interface TutorialEvent {
  type: 'session_started' | 'step_started' | 'step_completed' | 'step_failed' | 'tutorial_completed' | 'session_ended'
  sessionId: string
  tutorialId: string
  stepId?: string
  data?: any
  timestamp: Date
}

// Default configuration
const DEFAULT_CONFIG: TutorialOrchestratorConfig = {
  enableAdaptiveDifficulty: true,
  enableProgressPersistence: true,
  enableAnalytics: true,
  defaultTimeout: 30000, // 30 seconds
  maxRetries: 3,
  adaptiveThresholds: {
    accuracyForAdvancement: 0.8,
    attemptsBeforeHints: 2,
    timeoutBeforeSkip: 60000 // 1 minute
  }
}

export class TutorialOrchestrator extends EventEmitter {
  private config: TutorialOrchestratorConfig
  private tutorials: Map<string, Tutorial> = new Map()
  private sessions: Map<string, TutorialSession> = new Map()
  private userProfiles: Map<string, any> = new Map()
  private isInitialized = false

  constructor(config: Partial<TutorialOrchestratorConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the tutorial orchestrator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return}

    try {
      // Load tutorials
      await this.loadTutorials()

      // Load user progress if persistence enabled
      if (this.config.enableProgressPersistence) {
        await this.loadUserProgress()
      }

      this.isInitialized = true
      console.log('TutorialOrchestrator initialized successfully')
    } catch (error) {
      console.error('Failed to initialize TutorialOrchestrator:', error)
      throw error
    }
  }

  /**
   * Start a tutorial session
   */
  async startTutorial(
    tutorialId: string,
    userId: string,
    context?: Partial<TutorialSession['context']>
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const tutorial = this.tutorials.get(tutorialId)
    if (!tutorial) {
      throw new Error(`Tutorial not found: ${tutorialId}`)
    }

    // Check prerequisites
    if (tutorial.prerequisites && tutorial.prerequisites.length > 0) {
      const hasPrerequisites = await this.checkPrerequisites(userId, tutorial.prerequisites)
      if (!hasPrerequisites) {
        throw new Error('Prerequisites not met for this tutorial')
      }
    }

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const userProfile = this.userProfiles.get(userId) || this.createDefaultUserProfile(userId)

    const session: TutorialSession = {
      id: sessionId,
      tutorialId,
      userId,
      startTime: new Date(),
      currentStepIndex: 0,
      progress: [],
      isActive: true,
      adaptiveSettings: this.calculateAdaptiveSettings(userProfile, tutorial),
      context: {
        userExperience: userProfile.experience || 'novice',
        previousSessions: userProfile.completedTutorials?.length || 0,
        ...context
      }
    }

    this.sessions.set(sessionId, session)

    // Emit event
    this.emitEvent({
      type: 'session_started',
      sessionId,
      tutorialId,
      data: { context: session.context },
      timestamp: new Date()
    })

    return sessionId
  }

  /**
   * Get current tutorial step
   */
  getCurrentStep(sessionId: string): TutorialStep | null {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {return null}

    const tutorial = this.tutorials.get(session.tutorialId)
    if (!tutorial) {return null}

    return tutorial.steps[session.currentStepIndex] || null
  }

  /**
   * Process voice command for current step
   */
  async processVoiceCommand(
    sessionId: string,
    command: string,
    confidence: number,
    _audioLevel?: number
  ): Promise<{
    success: boolean
    feedback: string
    shouldAdvance: boolean
    hints?: string[]
    retryAllowed: boolean
  }> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error('Invalid or inactive session')
    }

    const currentStep = this.getCurrentStep(sessionId)
    if (!currentStep) {
      throw new Error('No current step found')
    }

    // Get or create progress for this step
    let stepProgress = session.progress.find(p => p.stepId === currentStep.id)
    if (!stepProgress) {
      stepProgress = {
        userId: session.userId,
        tutorialId: session.tutorialId,
        stepId: currentStep.id,
        status: 'in_progress',
        attempts: 0,
        accuracy: 0,
        timeSpent: 0,
        lastUpdated: new Date()
      }
      session.progress.push(stepProgress)
    }

    // Update attempts
    stepProgress.attempts++
    stepProgress.lastUpdated = new Date()

    // Check if command matches expected commands
    const commandMatch = this.matchCommand(command, currentStep.expectedCommands)
    const meetsAccuracyThreshold = confidence >= this.config.adaptiveThresholds.accuracyForAdvancement
    const success = commandMatch.success && meetsAccuracyThreshold

    // Update accuracy
    stepProgress.accuracy = (stepProgress.accuracy * (stepProgress.attempts - 1) + confidence) / stepProgress.attempts

    let feedback: string
    let shouldAdvance = false
    let hints: string[] | undefined
    let retryAllowed = true

    if (success) {
      // Success case
      feedback = currentStep.successMessage || 'Great! Command recognized successfully!'
      shouldAdvance = true
      stepProgress.status = 'completed'

      // Emit step completed event
      this.emitEvent({
        type: 'step_completed',
        sessionId,
        tutorialId: session.tutorialId,
        stepId: currentStep.id,
        data: {
          attempts: stepProgress.attempts,
          accuracy: stepProgress.accuracy,
          command: command
        },
        timestamp: new Date()
      })

    } else {
      // Failure case
      feedback = currentStep.errorMessage || 'Command not recognized. Please try again.'

      // Provide hints if attempts exceed threshold
      if (stepProgress.attempts >= this.config.adaptiveThresholds.attemptsBeforeHints) {
        if (currentStep.hints) {
          hints = currentStep.hints
        }
      }

      // Check if max retries exceeded
      if (stepProgress.attempts >= this.config.maxRetries) {
        retryAllowed = false
        feedback += ' Would you like to skip this step or try the tutorial again?'
      }

      // Emit step failed event
      this.emitEvent({
        type: 'step_failed',
        sessionId,
        tutorialId: session.tutorialId,
        stepId: currentStep.id,
        data: {
          attempts: stepProgress.attempts,
          accuracy: stepProgress.accuracy,
          command: command,
          reason: commandMatch.reason
        },
        timestamp: new Date()
      })
    }

    // Update session
    this.sessions.set(sessionId, session)

    // Persist progress if enabled
    if (this.config.enableProgressPersistence) {
      await this.persistProgress(stepProgress)
    }

    return {
      success,
      feedback,
      shouldAdvance,
      ...(hints && { hints }),
      retryAllowed
    }
  }

  /**
   * Advance to next step
   */
  async advanceToNextStep(sessionId: string): Promise<{
    hasNextStep: boolean
    nextStep: TutorialStep | null
    tutorialCompleted: boolean
  }> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error('Invalid or inactive session')
    }

    const tutorial = this.tutorials.get(session.tutorialId)
    if (!tutorial) {
      throw new Error('Tutorial not found')
    }

    const currentStep = tutorial.steps[session.currentStepIndex]

    // Emit step started event for current step if not already emitted
    if (currentStep?.id) {
      this.emitEvent({
        type: 'step_started',
        sessionId,
        tutorialId: session.tutorialId,
        stepId: currentStep.id,
        timestamp: new Date()
      })
    }

    session.currentStepIndex++
    const hasNextStep = session.currentStepIndex < tutorial.steps.length
    const nextStep = hasNextStep ? (tutorial.steps[session.currentStepIndex] || null) : null
    const tutorialCompleted = !hasNextStep

    if (tutorialCompleted) {
      session.isActive = false

      // Update user profile
      const userProfile = this.userProfiles.get(session.userId) || this.createDefaultUserProfile(session.userId)
      userProfile.completedTutorials = userProfile.completedTutorials || []
      userProfile.completedTutorials.push({
        tutorialId: session.tutorialId,
        completedAt: new Date(),
        totalTime: Date.now() - session.startTime.getTime(),
        accuracy: this.calculateSessionAccuracy(session),
        adaptive: session.adaptiveSettings
      })
      this.userProfiles.set(session.userId, userProfile)

      // Emit tutorial completed event
      this.emitEvent({
        type: 'tutorial_completed',
        sessionId,
        tutorialId: session.tutorialId,
        data: {
          totalSteps: tutorial.steps.length,
          completedSteps: session.progress.filter(p => p.status === 'completed').length,
          accuracy: this.calculateSessionAccuracy(session),
          totalTime: Date.now() - session.startTime.getTime()
        },
        timestamp: new Date()
      })
    }

    this.sessions.set(sessionId, session)
    return { hasNextStep, nextStep, tutorialCompleted }
  }

  /**
   * Skip current step
   */
  async skipStep(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) {
      throw new Error('Invalid or inactive session')
    }

    if (!session.adaptiveSettings.skipAllowed) {
      throw new Error('Skip not allowed for this session')
    }

    const currentStep = this.getCurrentStep(sessionId)
    if (currentStep) {
      // Mark step as skipped
      let stepProgress = session.progress.find(p => p.stepId === currentStep.id)
      if (!stepProgress) {
        stepProgress = {
          userId: session.userId,
          tutorialId: session.tutorialId,
          stepId: currentStep.id,
          status: 'skipped',
          attempts: 0,
          accuracy: 0,
          timeSpent: 0,
          lastUpdated: new Date()
        }
        session.progress.push(stepProgress)
      } else {
        stepProgress.status = 'skipped'
        stepProgress.lastUpdated = new Date()
      }
    }

    await this.advanceToNextStep(sessionId)
  }

  /**
   * End tutorial session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {return}

    session.isActive = false
    this.sessions.set(sessionId, session)

    // Emit session ended event
    this.emitEvent({
      type: 'session_ended',
      sessionId,
      tutorialId: session.tutorialId,
      data: {
        completed: session.currentStepIndex >= this.tutorials.get(session.tutorialId)?.steps.length!,
        progress: session.progress
      },
      timestamp: new Date()
    })
  }

  /**
   * Get user progress for a tutorial
   */
  getUserProgress(userId: string, tutorialId?: string): UserProgress[] {
    if (tutorialId) {
      // Get progress for specific tutorial
      const sessions = Array.from(this.sessions.values()).filter(
        s => s.userId === userId && s.tutorialId === tutorialId
      )
      return sessions.flatMap(s => s.progress)
    } else {
      // Get all progress for user
      const sessions = Array.from(this.sessions.values()).filter(s => s.userId === userId)
      return sessions.flatMap(s => s.progress)
    }
  }

  /**
   * Get recommended tutorials for user
   */
  getRecommendedTutorials(userId: string): Tutorial[] {
    const userProfile = this.userProfiles.get(userId) || this.createDefaultUserProfile(userId)
    const completedTutorials = new Set(
      (userProfile.completedTutorials || []).map((ct: any) => ct.tutorialId)
    )

    return Array.from(this.tutorials.values())
      .filter(tutorial => !completedTutorials.has(tutorial.id))
      .sort((a, b) => {
        // Prioritize by difficulty and category based on user experience
        const experienceWeight = userProfile.experience === 'novice' ? 1 :
                                userProfile.experience === 'intermediate' ? 0.5 : 0

        const difficultyScore = (t: Tutorial) => {
          switch (t.difficulty) {
            case 'beginner': return 3 * experienceWeight
            case 'intermediate': return 2
            case 'advanced': return 1 * (1 - experienceWeight)
            default: return 1
          }
        }

        return difficultyScore(b) - difficultyScore(a)
      })
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): TutorialSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Get all tutorials
   */
  getAllTutorials(): Tutorial[] {
    return Array.from(this.tutorials.values())
  }

  /**
   * Get tutorial by ID
   */
  getTutorial(tutorialId: string): Tutorial | null {
    return this.tutorials.get(tutorialId) || null
  }

  // Private methods

  private async loadTutorials(): Promise<void> {
    // Load built-in tutorials
    const builtInTutorials = await this.getBuiltInTutorials()
    builtInTutorials.forEach(tutorial => {
      this.tutorials.set(tutorial.id, tutorial)
    })
  }

  private async loadUserProgress(): Promise<void> {
    // In a real implementation, this would load from a persistence layer
    // For now, we'll use localStorage if available
    if (typeof localStorage !== 'undefined') {
      try {
        const savedProgress = localStorage.getItem('sitespeak_tutorial_progress')
        if (savedProgress) {
          const data = JSON.parse(savedProgress)
          Object.entries(data).forEach(([userId, profile]) => {
            this.userProfiles.set(userId, profile)
          })
        }
      } catch (error) {
        console.warn('Failed to load user progress from localStorage:', error)
      }
    }
  }

  private async persistProgress(_progress: UserProgress): Promise<void> {
    // In a real implementation, this would save to a persistence layer
    if (typeof localStorage !== 'undefined') {
      try {
        const allProfiles = Object.fromEntries(this.userProfiles)
        localStorage.setItem('sitespeak_tutorial_progress', JSON.stringify(allProfiles))
      } catch (error) {
        console.warn('Failed to persist progress to localStorage:', error)
      }
    }
  }

  private matchCommand(command: string, expectedCommands: string[]): {
    success: boolean
    confidence: number
    reason?: string
  } {
    const normalizedCommand = command.toLowerCase().trim()

    for (const expected of expectedCommands) {
      const normalizedExpected = expected.toLowerCase().trim()

      // Exact match
      if (normalizedCommand === normalizedExpected) {
        return { success: true, confidence: 1.0 }
      }

      // Contains match
      if (normalizedCommand.includes(normalizedExpected) || normalizedExpected.includes(normalizedCommand)) {
        return { success: true, confidence: 0.8 }
      }

      // Word-based matching
      const commandWords = normalizedCommand.split(/\s+/)
      const expectedWords = normalizedExpected.split(/\s+/)
      const matchingWords = expectedWords.filter(word =>
        commandWords.some(cmdWord => cmdWord.includes(word) || word.includes(cmdWord))
      )

      if (matchingWords.length >= expectedWords.length * 0.7) {
        return { success: true, confidence: 0.7 }
      }
    }

    return {
      success: false,
      confidence: 0,
      reason: 'Command did not match any expected patterns'
    }
  }

  private calculateAdaptiveSettings(userProfile: any, tutorial: Tutorial): TutorialSession['adaptiveSettings'] {
    const experience = userProfile.experience || 'novice'
    const completedCount = userProfile.completedTutorials?.length || 0

    return {
      difficultyLevel: experience === 'expert' ? 0.8 : experience === 'intermediate' ? 0.6 : 0.4,
      paceMultiplier: Math.min(2.0, 1.0 + (completedCount * 0.1)),
      hintsEnabled: experience !== 'expert',
      skipAllowed: completedCount > 0 || tutorial.difficulty === 'beginner'
    }
  }

  private createDefaultUserProfile(userId: string): any {
    const profile = {
      userId,
      experience: 'novice',
      completedTutorials: [],
      preferences: {
        audioEnabled: true,
        animationsEnabled: true,
        hintsEnabled: true
      },
      createdAt: new Date()
    }
    this.userProfiles.set(userId, profile)
    return profile
  }

  private calculateSessionAccuracy(session: TutorialSession): number {
    if (session.progress.length === 0) {return 0}

    const totalAccuracy = session.progress.reduce((sum, p) => sum + p.accuracy, 0)
    return totalAccuracy / session.progress.length
  }

  private async checkPrerequisites(userId: string, prerequisites: string[]): Promise<boolean> {
    const userProfile = this.userProfiles.get(userId)
    if (!userProfile) {return false}

    const completedTutorials = new Set(
      (userProfile.completedTutorials || []).map((ct: any) => ct.tutorialId)
    )

    return prerequisites.every(prereq => completedTutorials.has(prereq))
  }

  private emitEvent(event: TutorialEvent): void {
    this.emit('tutorial_event', event)

    if (this.config.enableAnalytics) {
      // In a real implementation, this would send to analytics service
      console.log('Tutorial Event:', event)
    }
  }

  private async getBuiltInTutorials(): Promise<Tutorial[]> {
    // Return built-in tutorials - these would typically be loaded from a config file
    return [
      {
        id: 'voice_basics',
        title: 'Voice Basics',
        description: 'Learn the fundamentals of voice commands',
        category: 'onboarding',
        difficulty: 'beginner',
        estimatedTime: 5,
        steps: [
          {
            id: 'welcome',
            title: 'Welcome to Voice Assistant',
            description: 'Get started with voice commands',
            content: 'Welcome! Let\'s learn how to use voice commands effectively.',
            voiceInstructions: 'Say "hello" to begin',
            expectedCommands: ['hello', 'hi', 'hey'],
            hints: ['Try speaking clearly', 'Make sure your microphone is working'],
            successMessage: 'Perfect! You\'ve said your first command.',
            difficulty: 'beginner',
            estimatedTime: 30
          }
          // More steps would be added here
        ],
        tags: ['beginner', 'voice', 'introduction']
      }
      // More tutorials would be added here
    ]
  }
}