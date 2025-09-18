/**
 * ProgressTrackingService - User progress and achievements system
 *
 * Features:
 * - Persistent progress tracking
 * - Achievement system with badges
 * - Learning analytics
 * - Adaptive difficulty recommendations
 * - Performance insights
 * - Goal setting and tracking
 */

import { EventEmitter } from 'events'

// Core types
export interface UserProfile {
  userId: string
  displayName?: string
  createdAt: Date
  lastActiveAt: Date
  totalSessionTime: number
  experienceLevel: 'novice' | 'intermediate' | 'expert'
  preferences: {
    audioEnabled: boolean
    hintsEnabled: boolean
    animationsEnabled: boolean
    autoAdvance: boolean
    difficultyPreference: 'adaptive' | 'beginner' | 'intermediate' | 'advanced'
  }
  statistics: {
    totalCommands: number
    successfulCommands: number
    totalTutorials: number
    completedTutorials: number
    averageAccuracy: number
    streakDays: number
    longestStreak: number
    favoriteCommands: string[]
  }
}

export interface Achievement {
  id: string
  type: 'milestone' | 'streak' | 'accuracy' | 'speed' | 'exploration' | 'mastery'
  title: string
  description: string
  icon: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  criteria: {
    metric: string
    operator: '>' | '<' | '=' | '>=' | '<='
    value: number
    timeframe?: 'session' | 'day' | 'week' | 'month' | 'all_time'
  }
  rewards?: {
    points: number
    badges?: string[]
    unlocks?: string[]
  }
  isHidden?: boolean // Secret achievements
}

export interface UserAchievement {
  achievementId: string
  userId: string
  unlockedAt: Date
  progress: number // 0-1
  isCompleted: boolean
  metadata?: Record<string, any>
}

export interface LearningGoal {
  id: string
  userId: string
  type: 'accuracy' | 'speed' | 'commands' | 'tutorials' | 'custom'
  title: string
  description: string
  targetValue: number
  currentValue: number
  deadline?: Date
  isActive: boolean
  createdAt: Date
  completedAt?: Date
  metadata?: Record<string, any>
}

export interface SessionMetrics {
  sessionId: string
  userId: string
  startTime: Date
  endTime?: Date
  duration: number // in milliseconds
  tutorialId?: string
  commandsAttempted: number
  commandsSuccessful: number
  averageConfidence: number
  averageResponseTime: number
  errorsEncountered: number
  hintsUsed: number
  stepsCompleted: number
  stepsSkipped: number
  deviceInfo: {
    type: 'mobile' | 'tablet' | 'desktop'
    browser: string
    microphoneQuality: 'poor' | 'fair' | 'good' | 'excellent'
  }
}

export interface AnalyticsEvent {
  type: 'command_executed' | 'tutorial_started' | 'tutorial_completed' | 'error_occurred' | 'hint_requested' | 'achievement_unlocked'
  userId: string
  sessionId?: string
  timestamp: Date
  data: Record<string, any>
}

export interface ProgressTrackingConfig {
  enablePersistence: boolean
  enableAnalytics: boolean
  enableAchievements: boolean
  enableGoals: boolean
  syncInterval: number // milliseconds
  retentionDays: number
  offlineSupport: boolean
}

// Default configuration
const DEFAULT_CONFIG: ProgressTrackingConfig = {
  enablePersistence: true,
  enableAnalytics: true,
  enableAchievements: true,
  enableGoals: true,
  syncInterval: 30000, // 30 seconds
  retentionDays: 365,
  offlineSupport: true
}

export class ProgressTrackingService extends EventEmitter {
  private config: ProgressTrackingConfig
  private userProfiles: Map<string, UserProfile> = new Map()
  private achievements: Map<string, Achievement> = new Map()
  private userAchievements: Map<string, UserAchievement[]> = new Map()
  private learningGoals: Map<string, LearningGoal[]> = new Map()
  private sessionMetrics: Map<string, SessionMetrics> = new Map()
  private analyticsQueue: AnalyticsEvent[] = []
  private isInitialized = false

  constructor(config: Partial<ProgressTrackingConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initialize the progress tracking service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {return}

    try {
      // Load built-in achievements
      await this.loadBuiltInAchievements()

      // Load persisted data
      if (this.config.enablePersistence) {
        await this.loadPersistedData()
      }

      // Start sync timer
      if (this.config.syncInterval > 0) {
        this.startSyncTimer()
      }

      this.isInitialized = true
      console.log('ProgressTrackingService initialized successfully')
    } catch (error) {
      console.error('Failed to initialize ProgressTrackingService:', error)
      throw error
    }
  }

  /**
   * Create or get user profile
   */
  async createUserProfile(userId: string, displayName?: string): Promise<UserProfile> {
    let profile = this.userProfiles.get(userId)

    if (!profile) {
      const profileData: any = {
        userId,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        totalSessionTime: 0,
        experienceLevel: 'novice',
        preferences: {
          audioEnabled: true,
          hintsEnabled: true,
          animationsEnabled: true,
          autoAdvance: false,
          difficultyPreference: 'adaptive'
        },
        statistics: {
          totalCommands: 0,
          successfulCommands: 0,
          totalTutorials: 0,
          completedTutorials: 0,
          averageAccuracy: 0,
          streakDays: 0,
          longestStreak: 0,
          favoriteCommands: []
        }
      }

      // Add displayName only if provided
      if (displayName) {
        profileData.displayName = displayName
      }

      profile = profileData as UserProfile

      this.userProfiles.set(userId, profile)
      await this.persistUserProfile(profile)

      this.emit('user_profile_created', { userId, profile })
    }

    return profile
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const profile = this.userProfiles.get(userId)
    if (!profile) {
      throw new Error(`User profile not found: ${userId}`)
    }

    const updatedProfile = { ...profile, ...updates, lastActiveAt: new Date() }
    this.userProfiles.set(userId, updatedProfile)

    await this.persistUserProfile(updatedProfile)
    this.emit('user_profile_updated', { userId, profile: updatedProfile })

    return updatedProfile
  }

  /**
   * Record session metrics
   */
  async recordSessionStart(userId: string, sessionData: Partial<SessionMetrics>): Promise<string> {
    const sessionId = sessionData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const session: SessionMetrics = {
      sessionId,
      userId,
      startTime: new Date(),
      duration: 0,
      commandsAttempted: 0,
      commandsSuccessful: 0,
      averageConfidence: 0,
      averageResponseTime: 0,
      errorsEncountered: 0,
      hintsUsed: 0,
      stepsCompleted: 0,
      stepsSkipped: 0,
      deviceInfo: {
        type: 'desktop',
        browser: this.detectBrowser(),
        microphoneQuality: 'good'
      },
      ...sessionData
    }

    this.sessionMetrics.set(sessionId, session)

    // Update user profile
    const profile = await this.ensureUserProfile(userId)
    profile.lastActiveAt = new Date()
    await this.updateUserProfile(userId, profile)

    this.trackAnalyticsEvent({
      type: 'tutorial_started',
      userId,
      sessionId,
      timestamp: new Date(),
      data: { tutorialId: session.tutorialId }
    })

    return sessionId
  }

  /**
   * Update session metrics
   */
  async updateSessionMetrics(sessionId: string, updates: Partial<SessionMetrics>): Promise<void> {
    const session = this.sessionMetrics.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const updatedSession = { ...session, ...updates }
    this.sessionMetrics.set(sessionId, updatedSession)

    // Check for achievements
    if (this.config.enableAchievements) {
      await this.checkAchievements(session.userId, updatedSession)
    }
  }

  /**
   * End session and calculate final metrics
   */
  async endSession(sessionId: string): Promise<SessionMetrics> {
    const session = this.sessionMetrics.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const endTime = new Date()
    const duration = endTime.getTime() - session.startTime.getTime()

    const finalSession = {
      ...session,
      endTime,
      duration
    }

    this.sessionMetrics.set(sessionId, finalSession)

    // Update user profile with session data
    const profile = await this.ensureUserProfile(session.userId)
    profile.totalSessionTime += duration
    profile.statistics.totalCommands += session.commandsAttempted
    profile.statistics.successfulCommands += session.commandsSuccessful

    // Update accuracy
    if (profile.statistics.totalCommands > 0) {
      profile.statistics.averageAccuracy =
        profile.statistics.successfulCommands / profile.statistics.totalCommands
    }

    // Update experience level based on performance
    profile.experienceLevel = this.calculateExperienceLevel(profile)

    await this.updateUserProfile(session.userId, profile)

    // Track completion event
    this.trackAnalyticsEvent({
      type: 'tutorial_completed',
      userId: session.userId,
      sessionId,
      timestamp: new Date(),
      data: {
        duration,
        accuracy: session.commandsAttempted > 0 ? session.commandsSuccessful / session.commandsAttempted : 0,
        stepsCompleted: session.stepsCompleted
      }
    })

    return finalSession
  }

  /**
   * Track command execution
   */
  async trackCommand(
    userId: string,
    sessionId: string,
    command: string,
    success: boolean,
    confidence: number,
    responseTime: number
  ): Promise<void> {
    // Update session metrics
    const session = this.sessionMetrics.get(sessionId)
    if (session) {
      session.commandsAttempted++
      if (success) {
        session.commandsSuccessful++
      }

      // Update averages
      session.averageConfidence =
        (session.averageConfidence * (session.commandsAttempted - 1) + confidence) / session.commandsAttempted
      session.averageResponseTime =
        (session.averageResponseTime * (session.commandsAttempted - 1) + responseTime) / session.commandsAttempted

      this.sessionMetrics.set(sessionId, session)
    }

    // Update user's favorite commands
    const profile = await this.ensureUserProfile(userId)
    if (success) {
      profile.statistics.favoriteCommands = this.updateFavoriteCommands(
        profile.statistics.favoriteCommands,
        command
      )
      await this.updateUserProfile(userId, profile)
    }

    // Track analytics event
    this.trackAnalyticsEvent({
      type: 'command_executed',
      userId,
      sessionId,
      timestamp: new Date(),
      data: {
        command,
        success,
        confidence,
        responseTime
      }
    })
  }

  /**
   * Create learning goal
   */
  async createLearningGoal(userId: string, goalData: Partial<LearningGoal>): Promise<LearningGoal> {
    const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const goal: LearningGoal = {
      id: goalId,
      userId,
      type: 'accuracy',
      title: 'Improve Accuracy',
      description: 'Achieve better voice command accuracy',
      targetValue: 0.9,
      currentValue: 0,
      isActive: true,
      createdAt: new Date(),
      ...goalData
    }

    const userGoals = this.learningGoals.get(userId) || []
    userGoals.push(goal)
    this.learningGoals.set(userId, userGoals)

    await this.persistLearningGoals(userId, userGoals)
    this.emit('learning_goal_created', { userId, goal })

    return goal
  }

  /**
   * Update learning goal progress
   */
  async updateLearningGoalProgress(userId: string, goalId: string, currentValue: number): Promise<void> {
    const userGoals = this.learningGoals.get(userId) || []
    const goal = userGoals.find(g => g.id === goalId)

    if (!goal) {
      throw new Error(`Learning goal not found: ${goalId}`)
    }

    goal.currentValue = currentValue

    // Check if goal is completed
    if (currentValue >= goal.targetValue && !goal.completedAt) {
      goal.completedAt = new Date()
      goal.isActive = false

      this.emit('learning_goal_completed', { userId, goal })

      // Check for goal-related achievements
      if (this.config.enableAchievements) {
        await this.checkGoalAchievements(userId, goal)
      }
    }

    this.learningGoals.set(userId, userGoals)
    await this.persistLearningGoals(userId, userGoals)
  }

  /**
   * Get user achievements
   */
  getUserAchievements(userId: string): UserAchievement[] {
    return this.userAchievements.get(userId) || []
  }

  /**
   * Get user learning goals
   */
  getUserLearningGoals(userId: string): LearningGoal[] {
    return this.learningGoals.get(userId) || []
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(userId: string, timeframe: 'day' | 'week' | 'month' | 'year' = 'week'): Promise<any> {
    const profile = this.userProfiles.get(userId)
    if (!profile) {
      throw new Error(`User profile not found: ${userId}`)
    }

    const now = new Date()
    const startDate = new Date()

    switch (timeframe) {
      case 'day':
        startDate.setDate(now.getDate() - 1)
        break
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1)
        break
    }

    // Get sessions in timeframe
    const sessions = Array.from(this.sessionMetrics.values()).filter(
      session => session.userId === userId && session.startTime >= startDate
    )

    const analytics = {
      timeframe,
      profile,
      sessions: {
        total: sessions.length,
        totalTime: sessions.reduce((sum, s) => sum + s.duration, 0),
        averageAccuracy: sessions.length > 0
          ? sessions.reduce((sum, s) => sum + (s.commandsSuccessful / Math.max(s.commandsAttempted, 1)), 0) / sessions.length
          : 0,
        commandsExecuted: sessions.reduce((sum, s) => sum + s.commandsAttempted, 0),
        successfulCommands: sessions.reduce((sum, s) => sum + s.commandsSuccessful, 0)
      },
      achievements: this.getUserAchievements(userId).filter(
        achievement => achievement.unlockedAt >= startDate
      ),
      goals: this.getUserLearningGoals(userId).filter(goal => goal.isActive),
      insights: this.generateInsights(profile, sessions)
    }

    return analytics
  }

  /**
   * Get leaderboard data
   */
  async getLeaderboard(metric: 'accuracy' | 'commands' | 'time' | 'achievements', limit = 10): Promise<any[]> {
    const profiles = Array.from(this.userProfiles.values())

    const leaderboard = profiles
      .map(profile => {
        let score = 0
        let displayValue = ''

        switch (metric) {
          case 'accuracy':
            score = profile.statistics.averageAccuracy
            displayValue = `${(score * 100).toFixed(1)}%`
            break
          case 'commands':
            score = profile.statistics.successfulCommands
            displayValue = score.toString()
            break
          case 'time':
            score = profile.totalSessionTime
            displayValue = this.formatTime(score)
            break
          case 'achievements':
            score = this.getUserAchievements(profile.userId).filter(a => a.isCompleted).length
            displayValue = score.toString()
            break
        }

        return {
          userId: profile.userId,
          displayName: profile.displayName || `User ${profile.userId.substr(0, 8)}`,
          score,
          displayValue,
          experienceLevel: profile.experienceLevel
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return leaderboard
  }

  // Private methods

  private async ensureUserProfile(userId: string): Promise<UserProfile> {
    let profile = this.userProfiles.get(userId)
    if (!profile) {
      profile = await this.createUserProfile(userId)
    }
    return profile
  }

  private async loadBuiltInAchievements(): Promise<void> {
    const builtInAchievements: Achievement[] = [
      {
        id: 'first_command',
        type: 'milestone',
        title: 'First Steps',
        description: 'Execute your first voice command',
        icon: '🎯',
        rarity: 'common',
        criteria: { metric: 'totalCommands', operator: '>=', value: 1 }
      },
      {
        id: 'accuracy_master',
        type: 'accuracy',
        title: 'Accuracy Master',
        description: 'Achieve 95% accuracy over 50 commands',
        icon: '🎯',
        rarity: 'rare',
        criteria: { metric: 'averageAccuracy', operator: '>=', value: 0.95 }
      },
      {
        id: 'speed_demon',
        type: 'speed',
        title: 'Speed Demon',
        description: 'Complete commands with average response time under 200ms',
        icon: '⚡',
        rarity: 'epic',
        criteria: { metric: 'averageResponseTime', operator: '<=', value: 200 }
      },
      {
        id: 'daily_streak_7',
        type: 'streak',
        title: 'Week Warrior',
        description: 'Use voice commands for 7 consecutive days',
        icon: '🔥',
        rarity: 'uncommon',
        criteria: { metric: 'streakDays', operator: '>=', value: 7 }
      },
      {
        id: 'tutorial_completionist',
        type: 'exploration',
        title: 'Tutorial Completionist',
        description: 'Complete all available tutorials',
        icon: '📚',
        rarity: 'legendary',
        criteria: { metric: 'completedTutorials', operator: '>=', value: 10 }
      }
    ]

    builtInAchievements.forEach(achievement => {
      this.achievements.set(achievement.id, achievement)
    })
  }

  private async checkAchievements(userId: string, session: SessionMetrics): Promise<void> {
    const profile = await this.ensureUserProfile(userId)
    const userAchievements = this.userAchievements.get(userId) || []

    for (const achievement of this.achievements.values()) {
      // Skip if already unlocked
      if (userAchievements.some(ua => ua.achievementId === achievement.id && ua.isCompleted)) {
        continue
      }

      // Check criteria
      const metricValue = this.getMetricValue(profile, session, achievement.criteria.metric)
      const criteriaMetBased = this.evaluateCriteria(metricValue, achievement.criteria)

      if (criteriaMetBased) {
        await this.unlockAchievement(userId, achievement.id)
      }
    }
  }

  private async unlockAchievement(userId: string, achievementId: string): Promise<void> {
    const achievement = this.achievements.get(achievementId)
    if (!achievement) {return}

    const userAchievements = this.userAchievements.get(userId) || []

    const userAchievement: UserAchievement = {
      achievementId,
      userId,
      unlockedAt: new Date(),
      progress: 1,
      isCompleted: true
    }

    userAchievements.push(userAchievement)
    this.userAchievements.set(userId, userAchievements)

    await this.persistUserAchievements(userId, userAchievements)

    this.emit('achievement_unlocked', { userId, achievement, userAchievement })

    this.trackAnalyticsEvent({
      type: 'achievement_unlocked',
      userId,
      timestamp: new Date(),
      data: { achievementId, title: achievement.title, rarity: achievement.rarity }
    })
  }

  private getMetricValue(profile: UserProfile, session: SessionMetrics, metric: string): number {
    switch (metric) {
      case 'totalCommands':
        return profile.statistics.totalCommands
      case 'successfulCommands':
        return profile.statistics.successfulCommands
      case 'averageAccuracy':
        return profile.statistics.averageAccuracy
      case 'averageResponseTime':
        return session.averageResponseTime
      case 'streakDays':
        return profile.statistics.streakDays
      case 'completedTutorials':
        return profile.statistics.completedTutorials
      default:
        return 0
    }
  }

  private evaluateCriteria(value: number, criteria: Achievement['criteria']): boolean {
    switch (criteria.operator) {
      case '>':
        return value > criteria.value
      case '<':
        return value < criteria.value
      case '=':
        return value === criteria.value
      case '>=':
        return value >= criteria.value
      case '<=':
        return value <= criteria.value
      default:
        return false
    }
  }

  private calculateExperienceLevel(profile: UserProfile): 'novice' | 'intermediate' | 'expert' {
    const { totalCommands, averageAccuracy, completedTutorials } = profile.statistics

    if (totalCommands >= 500 && averageAccuracy >= 0.9 && completedTutorials >= 5) {
      return 'expert'
    } else if (totalCommands >= 100 && averageAccuracy >= 0.7 && completedTutorials >= 2) {
      return 'intermediate'
    } else {
      return 'novice'
    }
  }

  private updateFavoriteCommands(currentFavorites: string[], newCommand: string): string[] {
    const favorites = [...currentFavorites]
    const index = favorites.indexOf(newCommand)

    if (index > -1) {
      // Move to front
      favorites.splice(index, 1)
      favorites.unshift(newCommand)
    } else {
      // Add to front, limit to 10
      favorites.unshift(newCommand)
      favorites.splice(10)
    }

    return favorites
  }

  private generateInsights(profile: UserProfile, sessions: SessionMetrics[]): any {
    return {
      strengths: this.identifyStrengths(profile, sessions),
      improvementAreas: this.identifyImprovementAreas(profile, sessions),
      recommendations: this.generateRecommendations(profile, sessions)
    }
  }

  private identifyStrengths(profile: UserProfile, sessions: SessionMetrics[]): string[] {
    const strengths: string[] = []

    if (profile.statistics.averageAccuracy > 0.8) {
      strengths.push('High command accuracy')
    }

    const avgResponseTime = sessions.reduce((sum, s) => sum + s.averageResponseTime, 0) / Math.max(sessions.length, 1)
    if (avgResponseTime < 300) {
      strengths.push('Fast response times')
    }

    if (profile.statistics.streakDays > 7) {
      strengths.push('Consistent usage')
    }

    return strengths
  }

  private identifyImprovementAreas(profile: UserProfile, sessions: SessionMetrics[]): string[] {
    const areas: string[] = []

    if (profile.statistics.averageAccuracy < 0.7) {
      areas.push('Command accuracy could be improved')
    }

    const totalHints = sessions.reduce((sum, s) => sum + s.hintsUsed, 0)
    if (totalHints > sessions.length * 2) {
      areas.push('Try to rely less on hints')
    }

    if (profile.statistics.completedTutorials < 3) {
      areas.push('Complete more tutorials to learn new features')
    }

    return areas
  }

  private generateRecommendations(profile: UserProfile, sessions: SessionMetrics[]): string[] {
    const recommendations: string[] = []

    if (profile.experienceLevel === 'novice') {
      recommendations.push('Try the basic navigation tutorial')
      recommendations.push('Practice with simple commands first')
    }

    if (profile.statistics.averageAccuracy < 0.8) {
      recommendations.push('Speak more clearly and at a moderate pace')
      recommendations.push('Ensure good microphone quality')
    }

    if (sessions.length === 0) {
      recommendations.push('Start with a beginner tutorial')
    }

    return recommendations
  }

  private trackAnalyticsEvent(event: AnalyticsEvent): void {
    if (!this.config.enableAnalytics) {return}

    this.analyticsQueue.push(event)
    this.emit('analytics_event', event)
  }

  private detectBrowser(): string {
    if (typeof navigator === 'undefined') {return 'unknown'}

    const userAgent = navigator.userAgent
    if (userAgent.includes('Chrome')) {return 'chrome'}
    if (userAgent.includes('Firefox')) {return 'firefox'}
    if (userAgent.includes('Safari')) {return 'safari'}
    if (userAgent.includes('Edge')) {return 'edge'}
    return 'other'
  }

  private formatTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  private async checkGoalAchievements(_userId: string, _goal: LearningGoal): Promise<void> {
    // Implementation for goal-specific achievements
    // This would check for achievements related to completing goals
  }

  // Persistence methods

  private async loadPersistedData(): Promise<void> {
    // Load from localStorage or IndexedDB
    if (typeof localStorage !== 'undefined') {
      try {
        const profilesData = localStorage.getItem('sitespeak_user_profiles')
        if (profilesData) {
          const profiles = JSON.parse(profilesData)
          Object.entries(profiles).forEach(([userId, profile]) => {
            this.userProfiles.set(userId, profile as UserProfile)
          })
        }

        const achievementsData = localStorage.getItem('sitespeak_user_achievements')
        if (achievementsData) {
          const achievements = JSON.parse(achievementsData)
          Object.entries(achievements).forEach(([userId, userAchievements]) => {
            this.userAchievements.set(userId, userAchievements as UserAchievement[])
          })
        }

        const goalsData = localStorage.getItem('sitespeak_learning_goals')
        if (goalsData) {
          const goals = JSON.parse(goalsData)
          Object.entries(goals).forEach(([userId, userGoals]) => {
            this.learningGoals.set(userId, userGoals as LearningGoal[])
          })
        }
      } catch (error) {
        console.warn('Failed to load persisted data:', error)
      }
    }
  }

  private async persistUserProfile(_profile: UserProfile): Promise<void> {
    if (typeof localStorage === 'undefined') {return}

    try {
      const allProfiles = Object.fromEntries(this.userProfiles)
      localStorage.setItem('sitespeak_user_profiles', JSON.stringify(allProfiles))
    } catch (error) {
      console.warn('Failed to persist user profile:', error)
    }
  }

  private async persistUserAchievements(_userId: string, _achievements: UserAchievement[]): Promise<void> {
    if (typeof localStorage === 'undefined') {return}

    try {
      const allAchievements = Object.fromEntries(this.userAchievements)
      localStorage.setItem('sitespeak_user_achievements', JSON.stringify(allAchievements))
    } catch (error) {
      console.warn('Failed to persist user achievements:', error)
    }
  }

  private async persistLearningGoals(_userId: string, _goals: LearningGoal[]): Promise<void> {
    if (typeof localStorage === 'undefined') {return}

    try {
      const allGoals = Object.fromEntries(this.learningGoals)
      localStorage.setItem('sitespeak_learning_goals', JSON.stringify(allGoals))
    } catch (error) {
      console.warn('Failed to persist learning goals:', error)
    }
  }

  private startSyncTimer(): void {
    setInterval(() => {
      this.syncData().catch(error => {
        console.warn('Sync failed:', error)
      })
    }, this.config.syncInterval)
  }

  private async syncData(): Promise<void> {
    // In a real implementation, this would sync with a backend service
    console.log('Syncing progress data...')
  }
}

// Factory function
export function createProgressTrackingService(config?: Partial<ProgressTrackingConfig>): ProgressTrackingService {
  return new ProgressTrackingService(config)
}