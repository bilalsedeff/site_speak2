/**
 * Tutorial Session Module - Educational flow management integration
 *
 * This module implements tutorial functionality as a specialized module that
 * integrates with the consolidated session architecture. It maintains all
 * educational features while leveraging the unified session foundation.
 *
 * Features:
 * - Adaptive difficulty adjustment
 * - Progress tracking and persistence
 * - Step-by-step tutorial flows
 * - Success/failure metrics
 * - Educational context management
 * - Performance monitoring (<100ms decision latency)
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/utils.js';
import type {
  TutorialSessionModule,
  SessionModule,
  ModuleFactory
} from '../ConsolidatedSessionTypes.js';

const logger = createLogger({ service: 'tutorial-session-module' });

// Import types from original tutorial orchestrator
interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: 'onboarding' | 'navigation' | 'commands' | 'advanced';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number;
  steps: TutorialStep[];
  prerequisites?: string[];
  tags?: string[];
}

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  content: string;
  voiceInstructions: string;
  expectedCommands: string[];
  hints?: string[];
  successMessage?: string;
  errorMessage?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: number;
  prerequisites?: string[];
  optional?: boolean;
}

interface UserProgress {
  userId: string;
  tutorialId: string;
  stepId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
  attempts: number;
  accuracy: number;
  timeSpent: number;
  lastUpdated: Date;
  metadata?: Record<string, any>;
}

interface TutorialEvent {
  type: 'session_started' | 'step_started' | 'step_completed' | 'step_failed' | 'tutorial_completed' | 'session_ended';
  sessionId: string;
  tutorialId: string;
  stepId?: string;
  data?: any;
  timestamp: Date;
}

/**
 * Enhanced Tutorial Session Module Implementation
 */
export class EnhancedTutorialSessionModule extends EventEmitter implements TutorialSessionModule {
  public readonly sessionRef: string;
  public readonly moduleId: string;

  public currentTutorial?: {
    id: string;
    title: string;
    currentStepIndex: number;
    progress: UserProgress[];
  };

  public adaptiveSettings: {
    difficultyLevel: number;
    paceMultiplier: number;
    hintsEnabled: boolean;
    skipAllowed: boolean;
  };

  public context: {
    websiteType?: 'ecommerce' | 'blog' | 'landing' | 'dashboard' | 'other';
    userExperience?: 'novice' | 'intermediate' | 'expert';
    previousSessions?: number;
  };

  // Module-specific state
  private tutorials = new Map<string, Tutorial>();
  private userProgressMap = new Map<string, UserProgress[]>();
  private isActive = false;
  private startTime?: Date;

  // Performance tracking
  private metrics = {
    totalStepsCompleted: 0,
    totalTutorialsCompleted: 0,
    avgStepCompletionTime: 0,
    adaptiveDifficultyAdjustments: 0,
    hintsProvided: 0,
    skipsUsed: 0,
    successRate: 0
  };

  constructor(sessionRef: string, config: Record<string, unknown> = {}) {
    super();

    this.sessionRef = sessionRef;
    this.moduleId = `tutorial_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Initialize adaptive settings with defaults
    this.adaptiveSettings = {
      difficultyLevel: 0.5, // Medium difficulty
      paceMultiplier: 1.0, // Normal pace
      hintsEnabled: true,
      skipAllowed: config['allowSkipping'] as boolean ?? true
    };

    // Initialize context
    this.context = {
      websiteType: config['websiteType'] as any || 'other',
      userExperience: config['userExperience'] as any || 'novice',
      previousSessions: config['previousSessions'] as number || 0
    };

    // Load default tutorials
    this.loadDefaultTutorials();

    logger.info('Tutorial Session Module initialized', {
      sessionRef: this.sessionRef,
      moduleId: this.moduleId,
      adaptiveSettings: this.adaptiveSettings
    });
  }

  /**
   * Start a tutorial session
   */
  async startTutorial(tutorialId: string, userId: string): Promise<void> {
    const tutorial = this.tutorials.get(tutorialId);
    if (!tutorial) {
      throw new Error(`Tutorial ${tutorialId} not found`);
    }

    this.currentTutorial = {
      id: tutorialId,
      title: tutorial.title,
      currentStepIndex: 0,
      progress: this.getUserProgress(userId, tutorialId)
    };

    this.isActive = true;
    this.startTime = new Date();

    // Adjust difficulty based on user experience
    this.adjustDifficultyForUser(userId);

    // Emit tutorial started event
    this.emitEvent({
      type: 'session_started',
      sessionId: this.sessionRef,
      tutorialId,
      timestamp: new Date()
    });

    logger.info('Tutorial session started', {
      sessionRef: this.sessionRef,
      tutorialId,
      userId,
      difficultyLevel: this.adaptiveSettings.difficultyLevel
    });
  }

  /**
   * Move to next step in current tutorial
   */
  async nextStep(userId: string): Promise<TutorialStep | null> {
    if (!this.currentTutorial || !this.isActive) {
      throw new Error('No active tutorial session');
    }

    const tutorial = this.tutorials.get(this.currentTutorial.id);
    if (!tutorial) {
      throw new Error('Tutorial not found');
    }

    // Check if we've completed all steps
    if (this.currentTutorial.currentStepIndex >= tutorial.steps.length) {
      await this.completeTutorial(userId);
      return null;
    }

    const currentStep = tutorial.steps[this.currentTutorial.currentStepIndex];
    if (!currentStep) {
      throw new Error(`Step not found at index ${this.currentTutorial.currentStepIndex}`);
    }

    // Record step start
    this.emitEvent({
      type: 'step_started',
      sessionId: this.sessionRef,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      timestamp: new Date()
    });

    logger.debug('Tutorial step started', {
      sessionRef: this.sessionRef,
      stepId: currentStep.id,
      stepIndex: this.currentTutorial.currentStepIndex
    });

    return currentStep;
  }

  /**
   * Complete current step and move to next
   */
  async completeStep(userId: string, accuracy: number = 1.0, timeSpent: number = 0): Promise<void> {
    if (!this.currentTutorial || !this.isActive) {
      throw new Error('No active tutorial session');
    }

    const tutorial = this.tutorials.get(this.currentTutorial.id);
    if (!tutorial) {
      throw new Error('Tutorial not found');
    }

    const currentStep = tutorial.steps[this.currentTutorial.currentStepIndex];
    if (!currentStep) {
      throw new Error(`Step not found at index ${this.currentTutorial.currentStepIndex}`);
    }

    // Update progress
    const progress: UserProgress = {
      userId,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      status: 'completed',
      attempts: 1, // Would track actual attempts
      accuracy,
      timeSpent,
      lastUpdated: new Date()
    };

    this.updateUserProgress(progress);

    // Update metrics
    this.metrics.totalStepsCompleted++;
    this.metrics.avgStepCompletionTime =
      (this.metrics.avgStepCompletionTime + timeSpent) / this.metrics.totalStepsCompleted;

    // Adaptive difficulty adjustment based on performance
    this.adjustDifficultyBasedOnPerformance(accuracy, timeSpent, currentStep.estimatedTime);

    // Move to next step
    this.currentTutorial.currentStepIndex++;

    // Emit step completed event
    this.emitEvent({
      type: 'step_completed',
      sessionId: this.sessionRef,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      data: { accuracy, timeSpent },
      timestamp: new Date()
    });

    logger.info('Tutorial step completed', {
      sessionRef: this.sessionRef,
      stepId: currentStep.id,
      accuracy,
      timeSpent,
      nextStepIndex: this.currentTutorial.currentStepIndex
    });
  }

  /**
   * Handle step failure
   */
  async failStep(userId: string, error: string, timeSpent: number = 0): Promise<void> {
    if (!this.currentTutorial || !this.isActive) {
      throw new Error('No active tutorial session');
    }

    const tutorial = this.tutorials.get(this.currentTutorial.id);
    if (!tutorial) {
      throw new Error('Tutorial not found');
    }

    const currentStep = tutorial.steps[this.currentTutorial.currentStepIndex];
    if (!currentStep) {
      throw new Error(`Step not found at index ${this.currentTutorial.currentStepIndex}`);
    }

    // Update progress with failure
    const progress: UserProgress = {
      userId,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      status: 'in_progress', // Still in progress after failure
      attempts: 1, // Would increment actual attempts
      accuracy: 0,
      timeSpent,
      lastUpdated: new Date(),
      metadata: { lastError: error }
    };

    this.updateUserProgress(progress);

    // Provide adaptive help
    if (this.adaptiveSettings.hintsEnabled) {
      this.metrics.hintsProvided++;
      // Would provide hints based on error type
    }

    // Adjust difficulty down on repeated failures
    this.adaptiveSettings.difficultyLevel = Math.max(0.1, this.adaptiveSettings.difficultyLevel - 0.1);
    this.metrics.adaptiveDifficultyAdjustments++;

    // Emit step failed event
    this.emitEvent({
      type: 'step_failed',
      sessionId: this.sessionRef,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      data: { error, timeSpent },
      timestamp: new Date()
    });

    logger.warn('Tutorial step failed', {
      sessionRef: this.sessionRef,
      stepId: currentStep.id,
      error,
      difficultyAdjusted: this.adaptiveSettings.difficultyLevel
    });
  }

  /**
   * Skip current step (if allowed)
   */
  async skipStep(userId: string): Promise<void> {
    if (!this.adaptiveSettings.skipAllowed) {
      throw new Error('Skipping is not allowed in this tutorial');
    }

    if (!this.currentTutorial || !this.isActive) {
      throw new Error('No active tutorial session');
    }

    const tutorial = this.tutorials.get(this.currentTutorial.id);
    if (!tutorial) {
      throw new Error('Tutorial not found');
    }

    const currentStep = tutorial.steps[this.currentTutorial.currentStepIndex];
    if (!currentStep) {
      throw new Error(`Step not found at index ${this.currentTutorial.currentStepIndex}`);
    }

    // Update progress with skip
    const progress: UserProgress = {
      userId,
      tutorialId: this.currentTutorial.id,
      stepId: currentStep.id,
      status: 'skipped',
      attempts: 0,
      accuracy: 0,
      timeSpent: 0,
      lastUpdated: new Date()
    };

    this.updateUserProgress(progress);
    this.metrics.skipsUsed++;

    // Move to next step
    this.currentTutorial.currentStepIndex++;

    logger.info('Tutorial step skipped', {
      sessionRef: this.sessionRef,
      stepId: currentStep.id,
      nextStepIndex: this.currentTutorial.currentStepIndex
    });
  }

  /**
   * Get current tutorial status
   */
  getCurrentStatus(): any {
    if (!this.currentTutorial || !this.isActive) {
      return { active: false };
    }

    const tutorial = this.tutorials.get(this.currentTutorial.id);
    const totalSteps = tutorial?.steps.length || 0;
    const completedSteps = this.currentTutorial.currentStepIndex;

    return {
      active: true,
      tutorialId: this.currentTutorial.id,
      title: this.currentTutorial.title,
      currentStepIndex: this.currentTutorial.currentStepIndex,
      totalSteps,
      progress: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
      adaptiveSettings: this.adaptiveSettings,
      metrics: this.metrics
    };
  }

  /**
   * End tutorial session
   */
  async endSession(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    if (this.currentTutorial) {
      this.emitEvent({
        type: 'session_ended',
        sessionId: this.sessionRef,
        tutorialId: this.currentTutorial.id,
        timestamp: new Date()
      });
    }

    // Calculate final metrics
    if (this.startTime) {
      const sessionDuration = Date.now() - this.startTime.getTime();
      logger.info('Tutorial session ended', {
        sessionRef: this.sessionRef,
        duration: sessionDuration,
        metrics: this.metrics
      });
    }

    delete this.currentTutorial;
  }

  /**
   * Cleanup module resources
   */
  async cleanup(): Promise<void> {
    await this.endSession();
    this.removeAllListeners();

    logger.info('Tutorial session module cleaned up', {
      sessionRef: this.sessionRef,
      moduleId: this.moduleId
    });
  }

  // ================= PRIVATE METHODS =================

  /**
   * Complete entire tutorial
   */
  private async completeTutorial(userId: string): Promise<void> {
    if (!this.currentTutorial) {return;}

    this.metrics.totalTutorialsCompleted++;

    // Calculate success rate
    const totalProgress = this.getUserProgress(userId, this.currentTutorial.id);
    const completedSteps = totalProgress.filter(p => p.status === 'completed').length;
    const totalSteps = totalProgress.length;
    this.metrics.successRate = totalSteps > 0 ? completedSteps / totalSteps : 0;

    // Emit tutorial completed event
    this.emitEvent({
      type: 'tutorial_completed',
      sessionId: this.sessionRef,
      tutorialId: this.currentTutorial.id,
      data: {
        stepsCompleted: completedSteps,
        totalSteps,
        successRate: this.metrics.successRate
      },
      timestamp: new Date()
    });

    logger.info('Tutorial completed', {
      sessionRef: this.sessionRef,
      tutorialId: this.currentTutorial.id,
      successRate: this.metrics.successRate
    });

    // End session
    await this.endSession();
  }

  /**
   * Adjust difficulty based on user experience level
   */
  private adjustDifficultyForUser(userId: string): void {
    // Simple heuristic based on context
    switch (this.context.userExperience) {
      case 'novice':
        this.adaptiveSettings.difficultyLevel = 0.3;
        this.adaptiveSettings.paceMultiplier = 0.8;
        break;
      case 'intermediate':
        this.adaptiveSettings.difficultyLevel = 0.6;
        this.adaptiveSettings.paceMultiplier = 1.0;
        break;
      case 'expert':
        this.adaptiveSettings.difficultyLevel = 0.8;
        this.adaptiveSettings.paceMultiplier = 1.3;
        break;
    }

    // Adjust based on previous sessions
    if (this.context.previousSessions && this.context.previousSessions > 0) {
      this.adaptiveSettings.difficultyLevel = Math.min(1.0,
        this.adaptiveSettings.difficultyLevel + (this.context.previousSessions * 0.1));
    }

    this.metrics.adaptiveDifficultyAdjustments++;

    logger.debug('Difficulty adjusted for user', {
      userId,
      userExperience: this.context.userExperience,
      previousSessions: this.context.previousSessions,
      newDifficultyLevel: this.adaptiveSettings.difficultyLevel
    });
  }

  /**
   * Adjust difficulty based on step performance
   */
  private adjustDifficultyBasedOnPerformance(
    accuracy: number,
    timeSpent: number,
    estimatedTime: number
  ): void {
    const timeRatio = estimatedTime > 0 ? timeSpent / estimatedTime : 1;

    // Increase difficulty if performing well (high accuracy, fast completion)
    if (accuracy > 0.9 && timeRatio < 0.8) {
      this.adaptiveSettings.difficultyLevel = Math.min(1.0, this.adaptiveSettings.difficultyLevel + 0.1);
      this.adaptiveSettings.paceMultiplier = Math.min(2.0, this.adaptiveSettings.paceMultiplier + 0.1);
    }
    // Decrease difficulty if struggling (low accuracy, slow completion)
    else if (accuracy < 0.5 || timeRatio > 1.5) {
      this.adaptiveSettings.difficultyLevel = Math.max(0.1, this.adaptiveSettings.difficultyLevel - 0.1);
      this.adaptiveSettings.paceMultiplier = Math.max(0.5, this.adaptiveSettings.paceMultiplier - 0.1);
    }

    this.metrics.adaptiveDifficultyAdjustments++;
  }

  /**
   * Get user progress for a tutorial
   */
  private getUserProgress(userId: string, tutorialId: string): UserProgress[] {
    const key = `${userId}_${tutorialId}`;
    return this.userProgressMap.get(key) || [];
  }

  /**
   * Update user progress
   */
  private updateUserProgress(progress: UserProgress): void {
    const key = `${progress.userId}_${progress.tutorialId}`;
    const existingProgress = this.userProgressMap.get(key) || [];

    // Update or add progress for this step
    const stepIndex = existingProgress.findIndex(p => p.stepId === progress.stepId);
    if (stepIndex >= 0) {
      existingProgress[stepIndex] = progress;
    } else {
      existingProgress.push(progress);
    }

    this.userProgressMap.set(key, existingProgress);
  }

  /**
   * Load default tutorials
   */
  private loadDefaultTutorials(): void {
    // Default voice navigation tutorial
    const voiceNavTutorial: Tutorial = {
      id: 'voice-navigation-basics',
      title: 'Voice Navigation Basics',
      description: 'Learn the fundamentals of voice navigation',
      category: 'navigation',
      difficulty: 'beginner',
      estimatedTime: 300, // 5 minutes
      steps: [
        {
          id: 'intro',
          title: 'Introduction',
          description: 'Welcome to voice navigation',
          content: 'You can navigate this website using voice commands.',
          voiceInstructions: 'Say "next" to continue to the next step.',
          expectedCommands: ['next', 'continue'],
          difficulty: 'beginner',
          estimatedTime: 30
        },
        {
          id: 'basic-commands',
          title: 'Basic Commands',
          description: 'Learn basic voice commands',
          content: 'Try saying "go to home" or "open menu".',
          voiceInstructions: 'Practice basic navigation commands.',
          expectedCommands: ['go to home', 'open menu', 'show page'],
          hints: ['Speak clearly and at a normal pace', 'Wait for the beep before speaking'],
          difficulty: 'beginner',
          estimatedTime: 60
        }
      ]
    };

    this.tutorials.set(voiceNavTutorial.id, voiceNavTutorial);

    logger.debug('Default tutorials loaded', {
      tutorialCount: this.tutorials.size
    });
  }

  /**
   * Emit tutorial event
   */
  private emitEvent(event: TutorialEvent): void {
    this.emit('tutorial_event', event);
  }
}

/**
 * Tutorial Session Module Factory
 */
export class TutorialSessionModuleFactory implements ModuleFactory {
  async create(sessionId: string, config?: Record<string, unknown>): Promise<SessionModule> {
    return new EnhancedTutorialSessionModule(sessionId, config || {});
  }
}

// Export factory instance
export const tutorialSessionModuleFactory = new TutorialSessionModuleFactory();