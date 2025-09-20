/**
 * Error Learning Service
 *
 * Pattern recognition and system improvement for SiteSpeak's error recovery system.
 * Provides intelligent learning from error patterns, user feedback, successful recoveries,
 * and proactive error prevention through continuous optimization.
 *
 * Features:
 * - Pattern recognition from error occurrences
 * - User-specific error learning profiles
 * - System improvement recommendations
 * - Proactive error prevention strategies
 * - Performance optimization through learning
 * - Universal pattern detection across websites
 * - Privacy-preserving learning algorithms
 */

import {
  VoiceError,
  ErrorPattern,
  UserFeedback,
  PatternContext,
  LearnedSolution,
  RecoveryStrategy,
  ClarificationRequest,
  ClarificationResponse,
  ErrorContext
} from '@shared/types/error-recovery.types';

interface LearningConfig {
  patternRecognition: boolean;
  userSpecific: boolean;
  proactivePreventions: boolean;
  performanceOptimization: boolean;
  privacyPreserving: boolean;
  learningRate: number;
  minPatternOccurrences: number;
  confidenceThreshold: number;
  retentionPeriod: number; // days
  maxPatternsPerUser: number;
}

interface UserLearningProfile {
  userId: string;
  errorPatterns: Map<string, UserErrorPattern>;
  preferences: UserPreferences;
  improvementMetrics: ImprovementMetrics;
  lastUpdated: Date;
  confidenceScore: number;
}

interface UserErrorPattern {
  pattern: ErrorPattern;
  userSpecificData: UserSpecificData;
  adaptations: PatternAdaptation[];
  lastSeen: Date;
  personalizedSolutions: LearnedSolution[];
}

interface UserSpecificData {
  frequency: number;
  timeOfDay: string[];
  deviceTypes: string[];
  contexts: string[];
  successfulRecoveries: RecoveryOutcome[];
  unsuccessfulRecoveries: RecoveryOutcome[];
}

interface RecoveryOutcome {
  strategyId: string;
  success: boolean;
  duration: number;
  userSatisfaction: number;
  timestamp: Date;
  context: PatternContext;
}

interface PatternAdaptation {
  id: string;
  description: string;
  adaptationType: 'threshold' | 'strategy' | 'timing' | 'presentation';
  parameters: Record<string, any>;
  effectiveness: number;
  confidence: number;
  createdAt: Date;
}

interface UserPreferences {
  clarificationStyle: 'minimal' | 'standard' | 'detailed';
  recoveryApproach: 'automated' | 'guided' | 'manual';
  feedbackFrequency: 'always' | 'important' | 'errors_only' | 'never';
  learningOptIn: boolean;
  privacyLevel: 'basic' | 'enhanced' | 'maximum';
}

interface ImprovementMetrics {
  errorReduction: number; // percentage
  resolutionTimeReduction: number; // percentage
  userSatisfactionIncrease: number; // percentage
  proactivePreventions: number;
  adaptationsApplied: number;
  learningAccuracy: number;
}

interface SystemLearning {
  globalPatterns: Map<string, GlobalErrorPattern>;
  improvementRecommendations: SystemRecommendation[];
  performanceOptimizations: PerformanceOptimization[];
  preventionStrategies: PreventionStrategy[];
  lastAnalysis: Date;
}

interface GlobalErrorPattern {
  pattern: ErrorPattern;
  crossUserData: CrossUserData;
  systemOptimizations: SystemOptimization[];
  preventionOpportunities: PreventionOpportunity[];
}

interface CrossUserData {
  affectedUsers: number;
  totalOccurrences: number;
  commonContexts: PatternContext[];
  successfulSolutions: SolutionEffectiveness[];
  emergingTrends: TrendIndicator[];
}

interface SolutionEffectiveness {
  solutionId: string;
  successRate: number;
  avgResolutionTime: number;
  userSatisfaction: number;
  applicableContexts: PatternContext[];
}

interface TrendIndicator {
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  confidence: number;
  timeframe: string;
  factors: string[];
}

interface SystemRecommendation {
  id: string;
  type: 'error_prevention' | 'recovery_improvement' | 'user_experience' | 'performance';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high';
  confidence: number;
  data: any;
  createdAt: Date;
}

interface PerformanceOptimization {
  id: string;
  area: 'classification' | 'clarification' | 'recovery' | 'ui' | 'overall';
  optimization: string;
  expectedImprovement: number;
  implementationCost: 'low' | 'medium' | 'high';
  confidence: number;
}

interface PreventionStrategy {
  id: string;
  targetErrors: string[];
  strategy: 'early_detection' | 'context_improvement' | 'user_guidance' | 'system_optimization';
  description: string;
  effectiveness: number;
  implementationNotes: string;
}

interface SystemOptimization {
  optimization: string;
  parameters: Record<string, any>;
  expectedBenefit: number;
  confidence: number;
}

interface PreventionOpportunity {
  opportunity: string;
  preventableErrors: string[];
  estimatedReduction: number;
  implementationApproach: string;
}

export class ErrorLearningService {
  private config: LearningConfig;
  private userProfiles = new Map<string, UserLearningProfile>();
  private systemLearning: SystemLearning;
  private _patternMatcher: PatternMatcher; // TODO: Implement pattern matching engine
  private _adaptationEngine: AdaptationEngine; // TODO: Implement adaptation engine
  private _recommendationGenerator: RecommendationGenerator; // TODO: Implement recommendation generator
  private privacyManager: PrivacyManager;
  private performanceTracker: LearningPerformanceTracker;

  constructor(config: Partial<LearningConfig> = {}) {
    this.config = {
      patternRecognition: true,
      userSpecific: true,
      proactivePreventions: true,
      performanceOptimization: true,
      privacyPreserving: true,
      learningRate: 0.1,
      minPatternOccurrences: 3,
      confidenceThreshold: 0.7,
      retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      maxPatternsPerUser: 1000,
      ...config
    };

    // Initialize components
    this.systemLearning = {
      globalPatterns: new Map(),
      improvementRecommendations: [],
      performanceOptimizations: [],
      preventionStrategies: [],
      lastAnalysis: new Date()
    };

    // Initialize placeholder instances - will be properly implemented
    this._patternMatcher = new PatternMatcher(this.config);
    this._adaptationEngine = new AdaptationEngine(this.config);
    this._recommendationGenerator = new RecommendationGenerator();
    this.privacyManager = new PrivacyManager(this.config);
    this.performanceTracker = new LearningPerformanceTracker();
  }

  /**
   * Get pattern matcher (placeholder implementation)
   */
  getPatternMatcher(): PatternMatcher {
    return this._patternMatcher;
  }

  /**
   * Get adaptation engine (placeholder implementation)
   */
  getAdaptationEngine(): AdaptationEngine {
    return this._adaptationEngine;
  }

  /**
   * Get recommendation generator (placeholder implementation)
   */
  getRecommendationGenerator(): RecommendationGenerator {
    return this._recommendationGenerator;
  }

  /**
   * Learn from error occurrence
   */
  async learnFromError(
    error: VoiceError,
    userId?: string,
    context?: Partial<PatternContext>
  ): Promise<void> {
    try {
      const startTime = performance.now();

      // Extract pattern from error
      const pattern = await this.extractErrorPattern(error, context);

      // Update global patterns
      await this.updateGlobalPattern(pattern);

      // Update user-specific patterns if user identified
      if (userId && this.config.userSpecific) {
        await this.updateUserPattern(userId, pattern, error);
      }

      // Check for prevention opportunities
      if (this.config.proactivePreventions) {
        await this.analyzePreventionOpportunities(pattern);
      }

      const processingTime = performance.now() - startTime;
      this.performanceTracker.recordLearning('error', processingTime);

    } catch (error) {
      console.error('Failed to learn from error:', error);
    }
  }

  /**
   * Learn from successful recovery
   */
  async learnFromRecovery(
    originalError: VoiceError,
    strategy: RecoveryStrategy,
    outcome: RecoveryOutcome,
    userId?: string
  ): Promise<void> {
    try {
      // Create learned solution
      const solution = await this.createLearnedSolution(strategy, outcome);

      // Update pattern effectiveness
      await this.updateSolutionEffectiveness(originalError, solution);

      // Update user profile if applicable
      if (userId && this.config.userSpecific) {
        await this.updateUserRecoveryLearning(userId, originalError, solution, outcome);
      }

      // Generate system improvements
      if (this.config.performanceOptimization) {
        await this.analyzePerformanceOptimizations(originalError, strategy, outcome);
      }

    } catch (error) {
      console.error('Failed to learn from recovery:', error);
    }
  }

  /**
   * Learn from clarification interaction
   */
  async learnFromClarification(
    request: ClarificationRequest,
    response: ClarificationResponse,
    successful: boolean,
    userId?: string
  ): Promise<void> {
    try {
      // Analyze clarification effectiveness
      const effectiveness = this.analyzeClarificationEffectiveness(request, response, successful);

      // Update clarification patterns
      await this.updateClarificationPatterns(request, response, effectiveness);

      // Update user clarification preferences
      if (userId && this.config.userSpecific) {
        await this.updateUserClarificationLearning(userId, request, response, effectiveness);
      }

      // Generate clarification improvements
      await this.generateClarificationImprovements(request, response, effectiveness);

    } catch (error) {
      console.error('Failed to learn from clarification:', error);
    }
  }

  /**
   * Learn from user feedback
   */
  async learnFromUserFeedback(
    feedback: UserFeedback,
    errorId: string,
    recoveryStrategy?: string,
    userId?: string
  ): Promise<void> {
    try {
      // Process feedback for pattern improvement
      await this.processFeedbackForPatterns(feedback, errorId);

      // Update user satisfaction models
      if (userId) {
        await this.updateUserSatisfactionModel(userId, feedback, recoveryStrategy);
      }

      // Generate feedback-based improvements
      await this.generateFeedbackImprovements(feedback, errorId, recoveryStrategy);

    } catch (error) {
      console.error('Failed to learn from user feedback:', error);
    }
  }

  /**
   * Get user-specific adaptations
   */
  async getUserAdaptations(
    userId: string,
    errorType?: string
  ): Promise<PatternAdaptation[]> {
    const profile = this.userProfiles.get(userId);
    if (!profile) {
      return [];
    }

    const adaptations: PatternAdaptation[] = [];

    for (const userPattern of profile.errorPatterns.values()) {
      if (!errorType || userPattern.pattern.errorCode.includes(errorType)) {
        adaptations.push(...userPattern.adaptations);
      }
    }

    return adaptations.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Get proactive prevention strategies
   */
  async getPreventionStrategies(
    context: PatternContext,
    userId?: string
  ): Promise<PreventionStrategy[]> {
    const strategies: PreventionStrategy[] = [];

    // Get global prevention strategies
    const globalStrategies = this.systemLearning.preventionStrategies.filter(
      strategy => this.isStrategyApplicable(strategy, context)
    );
    strategies.push(...globalStrategies);

    // Get user-specific prevention strategies
    if (userId && this.config.userSpecific) {
      const userStrategies = await this.getUserPreventionStrategies(userId, context);
      strategies.push(...userStrategies);
    }

    return strategies.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Get system improvement recommendations
   */
  getSystemRecommendations(
    area?: 'error_prevention' | 'recovery_improvement' | 'user_experience' | 'performance'
  ): SystemRecommendation[] {
    let recommendations = this.systemLearning.improvementRecommendations;

    if (area) {
      recommendations = recommendations.filter(rec => rec.type === area);
    }

    return recommendations
      .sort((a, b) => {
        // Sort by impact and confidence
        const aScore = this.getImpactScore(a.impact) * a.confidence;
        const bScore = this.getImpactScore(b.impact) * b.confidence;
        return bScore - aScore;
      })
      .slice(0, 10); // Return top 10 recommendations
  }

  /**
   * Get learning performance metrics
   */
  getLearningMetrics(): {
    patternsLearned: number;
    adaptationsGenerated: number;
    preventionsIdentified: number;
    userSatisfactionImprovement: number;
    systemPerformanceGain: number;
    learningAccuracy: number;
  } {
    const totalPatterns = Array.from(this.userProfiles.values())
      .reduce((sum, profile) => sum + profile.errorPatterns.size, 0);

    const totalAdaptations = Array.from(this.userProfiles.values())
      .reduce((sum, profile) => {
        return sum + Array.from(profile.errorPatterns.values())
          .reduce((adaptSum, pattern) => adaptSum + pattern.adaptations.length, 0);
      }, 0);

    return {
      patternsLearned: totalPatterns,
      adaptationsGenerated: totalAdaptations,
      preventionsIdentified: this.systemLearning.preventionStrategies.length,
      userSatisfactionImprovement: this.calculateAverageImprovement('userSatisfactionIncrease'),
      systemPerformanceGain: this.calculateAverageImprovement('resolutionTimeReduction'),
      learningAccuracy: this.calculateLearningAccuracy()
    };
  }

  /**
   * Get error patterns from learning service
   */
  getErrorPatterns(): ErrorPattern[] {
    const patterns: ErrorPattern[] = [];

    // Get patterns from global learning
    for (const globalPattern of this.systemLearning.globalPatterns.values()) {
      patterns.push(globalPattern.pattern);
    }

    // Get patterns from user profiles
    for (const profile of this.userProfiles.values()) {
      for (const userPattern of profile.errorPatterns.values()) {
        patterns.push(userPattern.pattern);
      }
    }

    // Remove duplicates and sort by frequency
    const uniquePatterns = patterns.filter((pattern, index, array) =>
      array.findIndex(p => p.id === pattern.id) === index
    );

    return uniquePatterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Export learning data (privacy-preserving)
   */
  async exportLearningData(userId?: string): Promise<any> {
    if (userId) {
      const profile = this.userProfiles.get(userId);
      return profile ? this.privacyManager.sanitizeUserData(profile) : null;
    }

    return this.privacyManager.sanitizeSystemData(this.systemLearning);
  }

  /**
   * Clear user learning data
   */
  async clearUserData(userId: string): Promise<void> {
    this.userProfiles.delete(userId);
  }

  // ================= PRIVATE METHODS =================

  private async extractErrorPattern(
    error: VoiceError,
    context?: Partial<PatternContext>
  ): Promise<ErrorPattern> {
    const patternContext = await this.buildPatternContext(error, context);

    return {
      id: this.generatePatternId(error, patternContext),
      errorCode: error.code,
      context: patternContext,
      frequency: 1,
      successfulRecoveries: 0,
      bestRecoveryStrategy: '',
      userFeedback: [],
      learnedSolutions: [],
      confidence: 0.5,
      lastSeen: new Date(),
      trend: 'stable'
    };
  }

  private async buildPatternContext(
    error: VoiceError,
    context?: Partial<PatternContext>
  ): Promise<PatternContext> {
    const hour = new Date().getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';

    if (hour >= 6 && hour < 12) {timeOfDay = 'morning';}
    else if (hour >= 12 && hour < 18) {timeOfDay = 'afternoon';}
    else if (hour >= 18 && hour < 22) {timeOfDay = 'evening';}
    else {timeOfDay = 'night';}

    const errorContext = error?.context as Partial<ErrorContext> | undefined;

    const browserInfo = errorContext?.browserInfo ?? {
      name: 'unknown',
      version: 'unknown',
      platform: 'unknown',
      capabilities: {
        audioWorklet: false,
        webSpeech: false,
        mediaRecorder: false,
        websockets: true,
        localStorage: true
      }
    };

    const originalCommand = error?.details?.originalCommand;

    const baseContext: PatternContext = {
      pageType: context?.pageType ?? (typeof errorContext?.contextualData?.['pageType'] === 'string' ? errorContext.contextualData['pageType'] : 'other'),
      userRole: context?.userRole ?? errorContext?.userRole ?? 'guest',
      deviceType: context?.deviceType ?? errorContext?.deviceType ?? 'desktop',
      browserType: context?.browserType ?? browserInfo.name ?? 'unknown',
      timeOfDay,
      sessionDuration: context?.sessionDuration ?? 0,
      commandComplexity: context?.commandComplexity ?? this.assessCommandComplexity(originalCommand)
    };

    return baseContext;
  }

  private assessCommandComplexity(command?: string): 'simple' | 'medium' | 'complex' {
    if (!command) {return 'simple';}

    const words = command.split(' ').length;
    if (words <= 3) {return 'simple';}
    if (words <= 6) {return 'medium';}
    return 'complex';
  }

  private generatePatternId(error: VoiceError, context: PatternContext): string {
    const components = [
      error.code,
      context.pageType,
      context.deviceType,
      context.commandComplexity
    ];

    return components.join('_').toLowerCase();
  }

  private async updateGlobalPattern(pattern: ErrorPattern): Promise<void> {
    const existing = this.systemLearning.globalPatterns.get(pattern.id);

    if (existing) {
      existing.pattern.frequency++;
      existing.pattern.lastSeen = new Date();
      existing.crossUserData.totalOccurrences++;
    } else {
      const globalPattern: GlobalErrorPattern = {
        pattern,
        crossUserData: {
          affectedUsers: 1,
          totalOccurrences: 1,
          commonContexts: [pattern.context],
          successfulSolutions: [],
          emergingTrends: []
        },
        systemOptimizations: [],
        preventionOpportunities: []
      };

      this.systemLearning.globalPatterns.set(pattern.id, globalPattern);
    }
  }

  private async updateUserPattern(
    userId: string,
    pattern: ErrorPattern,
    _error: VoiceError // TODO: Implement error-specific pattern updates
  ): Promise<void> {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = this.createUserProfile(userId);
      this.userProfiles.set(userId, profile);
    }

    const existing = profile.errorPatterns.get(pattern.id);

    if (existing) {
      existing.pattern.frequency++;
      existing.pattern.lastSeen = new Date();
      existing.userSpecificData.frequency++;
    } else {
      const userPattern: UserErrorPattern = {
        pattern,
        userSpecificData: {
          frequency: 1,
          timeOfDay: [pattern.context.timeOfDay],
          deviceTypes: [pattern.context.deviceType],
          contexts: [pattern.context.pageType],
          successfulRecoveries: [],
          unsuccessfulRecoveries: []
        },
        adaptations: [],
        lastSeen: new Date(),
        personalizedSolutions: []
      };

      profile.errorPatterns.set(pattern.id, userPattern);
    }

    profile.lastUpdated = new Date();
  }

  private createUserProfile(userId: string): UserLearningProfile {
    return {
      userId,
      errorPatterns: new Map(),
      preferences: {
        clarificationStyle: 'standard',
        recoveryApproach: 'guided',
        feedbackFrequency: 'important',
        learningOptIn: true,
        privacyLevel: 'basic'
      },
      improvementMetrics: {
        errorReduction: 0,
        resolutionTimeReduction: 0,
        userSatisfactionIncrease: 0,
        proactivePreventions: 0,
        adaptationsApplied: 0,
        learningAccuracy: 0
      },
      lastUpdated: new Date(),
      confidenceScore: 0.5
    };
  }

  private async analyzePreventionOpportunities(pattern: ErrorPattern): Promise<void> {
    // Analyze if this error pattern could be prevented
    const preventionScore = this.calculatePreventionScore(pattern);

    if (preventionScore > 0.7) {
      const strategy = await this.generatePreventionStrategy(pattern);
      this.systemLearning.preventionStrategies.push(strategy);
    }
  }

  private calculatePreventionScore(pattern: ErrorPattern): number {
    // Calculate how preventable this error pattern is
    let score = 0;

    // High frequency patterns are more worth preventing
    if (pattern.frequency > 10) {score += 0.3;}
    else if (pattern.frequency > 5) {score += 0.2;}
    else if (pattern.frequency > 2) {score += 0.1;}

    // Certain error types are more preventable
    const preventableErrors = [
      'VOICE_LOW_CONFIDENCE',
      'INTENT_AMBIGUOUS',
      'ACTION_ELEMENT_NOT_FOUND'
    ];

    if (preventableErrors.includes(pattern.errorCode)) {
      score += 0.4;
    }

    // User education can prevent some errors
    if (pattern.context.commandComplexity === 'complex') {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private async generatePreventionStrategy(pattern: ErrorPattern): Promise<PreventionStrategy> {
    const strategies = {
      'VOICE_LOW_CONFIDENCE': 'user_guidance',
      'INTENT_AMBIGUOUS': 'context_improvement',
      'ACTION_ELEMENT_NOT_FOUND': 'early_detection'
    } as any;

    const strategyType = strategies[pattern.errorCode] || 'system_optimization';

    return {
      id: `prevention_${pattern.id}`,
      targetErrors: [pattern.errorCode],
      strategy: strategyType,
      description: this.generatePreventionDescription(pattern, strategyType),
      effectiveness: 0.7, // Would be learned over time
      implementationNotes: this.generateImplementationNotes(pattern, strategyType)
    };
  }

  private generatePreventionDescription(pattern: ErrorPattern, strategy: 'user_guidance' | 'context_improvement' | 'early_detection' | 'system_optimization'): string {
    const descriptions = {
      'user_guidance': `Provide proactive guidance for ${pattern.errorCode} scenarios`,
      'context_improvement': `Improve context detection to prevent ${pattern.errorCode}`,
      'early_detection': `Implement early detection for ${pattern.errorCode} conditions`,
      'system_optimization': `Optimize system to reduce ${pattern.errorCode} occurrences`
    };

    return descriptions[strategy];
  }

  private generateImplementationNotes(pattern: ErrorPattern, strategy: string): string {
    return `Implement ${strategy} for ${pattern.errorCode} in ${pattern.context.pageType} contexts`;
  }

  private async createLearnedSolution(
    strategy: RecoveryStrategy,
    outcome: RecoveryOutcome
  ): Promise<LearnedSolution> {
    return {
      id: `solution_${strategy.id}_${Date.now()}`,
      description: `${strategy.name} solution`,
      strategy,
      successRate: outcome.success ? 1.0 : 0.0,
      avgResolutionTime: outcome.duration,
      userSatisfaction: outcome.userSatisfaction,
      applicableContexts: [outcome.context],
      confidence: 0.8
    };
  }

  private async updateSolutionEffectiveness(
    error: VoiceError,
    solution: LearnedSolution
  ): Promise<void> {
    // Update solution effectiveness in global patterns
    const globalPattern = this.systemLearning.globalPatterns.get(error.code);
    if (globalPattern) {
      const existing = globalPattern.crossUserData.successfulSolutions
        .find(s => s.solutionId === solution.id);

      if (existing) {
        // Update existing solution effectiveness
        existing.successRate = (existing.successRate + solution.successRate) / 2;
        existing.avgResolutionTime = (existing.avgResolutionTime + solution.avgResolutionTime) / 2;
        existing.userSatisfaction = (existing.userSatisfaction + solution.userSatisfaction) / 2;
      } else {
        // Add new solution effectiveness
        globalPattern.crossUserData.successfulSolutions.push({
          solutionId: solution.id,
          successRate: solution.successRate,
          avgResolutionTime: solution.avgResolutionTime,
          userSatisfaction: solution.userSatisfaction,
          applicableContexts: solution.applicableContexts
        });
      }
    }
  }

  private analyzeClarificationEffectiveness(
    _request: ClarificationRequest, // TODO: Implement request-specific effectiveness analysis
    response: ClarificationResponse,
    successful: boolean
  ): number {
    let effectiveness = successful ? 0.8 : 0.2;

    // Adjust based on response method
    if (response.method === 'voice') {effectiveness += 0.1;}
    if (response.confidence > 0.8) {effectiveness += 0.1;}

    return Math.min(effectiveness, 1.0);
  }

  private isStrategyApplicable(_strategy: PreventionStrategy, _context: PatternContext): boolean { // TODO: Implement strategy applicability logic
    // Check if prevention strategy applies to current context
    return true; // Simplified implementation
  }

  private async getUserPreventionStrategies(
    _userId: string, // TODO: Implement user-specific prevention strategies
    _context: PatternContext // TODO: Implement context-aware strategy selection
  ): Promise<PreventionStrategy[]> {
    // Get user-specific prevention strategies
    return [];
  }

  private getImpactScore(impact: 'low' | 'medium' | 'high' | 'critical'): number {
    const scores = { low: 1, medium: 2, high: 3, critical: 4 };
    return scores[impact];
  }

  private calculateAverageImprovement(metric: keyof ImprovementMetrics): number {
    const profiles = Array.from(this.userProfiles.values());
    if (profiles.length === 0) {return 0;}

    const sum = profiles.reduce((acc, profile) => acc + profile.improvementMetrics[metric], 0);
    return sum / profiles.length;
  }

  private calculateLearningAccuracy(): number {
    // Calculate accuracy of learning predictions
    return 0.85; // Would be calculated from actual prediction vs. outcome data
  }

  // Stub implementations for other methods
  private async updateUserRecoveryLearning(
    _userId: string, // Part of interface contract, implementation pending
    _error: VoiceError, // Part of interface contract, implementation pending
    _solution: LearnedSolution, // Part of interface contract, implementation pending
    _outcome: RecoveryOutcome // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would update user's recovery learning
  }

  private async analyzePerformanceOptimizations(
    _error: VoiceError, // Part of interface contract, implementation pending
    _strategy: RecoveryStrategy, // Part of interface contract, implementation pending
    _outcome: RecoveryOutcome // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would analyze performance optimization opportunities
  }

  private async updateClarificationPatterns(
    _request: ClarificationRequest, // Part of interface contract, implementation pending
    _response: ClarificationResponse, // Part of interface contract, implementation pending
    _effectiveness: number // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would update clarification patterns
  }

  private async updateUserClarificationLearning(
    _userId: string, // Part of interface contract, implementation pending
    _request: ClarificationRequest, // Part of interface contract, implementation pending
    _response: ClarificationResponse, // Part of interface contract, implementation pending
    _effectiveness: number // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would update user clarification learning
  }

  private async generateClarificationImprovements(
    _request: ClarificationRequest, // Part of interface contract, implementation pending
    _response: ClarificationResponse, // Part of interface contract, implementation pending
    _effectiveness: number // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would generate clarification improvements
  }

  private async processFeedbackForPatterns(
    _feedback: UserFeedback, // Part of interface contract, implementation pending
    _errorId: string // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would process feedback for pattern improvement
  }

  private async updateUserSatisfactionModel(
    _userId: string, // Part of interface contract, implementation pending
    _feedback: UserFeedback, // Part of interface contract, implementation pending
    _recoveryStrategy?: string // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would update user satisfaction model
  }

  private async generateFeedbackImprovements(
    _feedback: UserFeedback, // Part of interface contract, implementation pending
    _errorId: string, // Part of interface contract, implementation pending
    _recoveryStrategy?: string // Part of interface contract, implementation pending
  ): Promise<void> {
    // Implementation would generate feedback-based improvements
  }
}

// Helper classes
class PatternMatcher {
  constructor(private config: LearningConfig) {}

  getConfig(): LearningConfig {
    return this.config;
  }

  /**
   * Match error to existing patterns using similarity algorithms
   */
  matchPattern(error: VoiceError, patterns: ErrorPattern[]): ErrorPattern | null {
    if (patterns.length === 0) {
      return null;
    }

    const errorContext = this.extractErrorContext(error);
    let bestMatch: { pattern: ErrorPattern; score: number } | null = null;

    for (const pattern of patterns) {
      const score = this.calculateSimilarityScore(error, errorContext, pattern);

      if (score >= this.config.confidenceThreshold &&
          (!bestMatch || score > bestMatch.score)) {
        bestMatch = { pattern, score };
      }
    }

    return bestMatch?.pattern || null;
  }

  /**
   * Calculate similarity score between error and pattern
   */
  private calculateSimilarityScore(
    error: VoiceError,
    errorContext: PatternContext,
    pattern: ErrorPattern
  ): number {
    let score = 0;
    let weightSum = 0;

    // Error code exact match (highest weight)
    const errorCodeWeight = 0.4;
    if (error.code === pattern.errorCode) {
      score += errorCodeWeight;
    }
    weightSum += errorCodeWeight;

    // Context similarity scoring
    const contextWeight = 0.3;
    const contextScore = this.calculateContextSimilarity(errorContext, pattern.context);
    score += contextScore * contextWeight;
    weightSum += contextWeight;

    // Command complexity match
    const complexityWeight = 0.15;
    if (errorContext.commandComplexity === pattern.context.commandComplexity) {
      score += complexityWeight;
    }
    weightSum += complexityWeight;

    // Device type match
    const deviceWeight = 0.1;
    if (errorContext.deviceType === pattern.context.deviceType) {
      score += deviceWeight;
    }
    weightSum += deviceWeight;

    // Time pattern similarity
    const timeWeight = 0.05;
    if (errorContext.timeOfDay === pattern.context.timeOfDay) {
      score += timeWeight;
    }
    weightSum += timeWeight;

    return weightSum > 0 ? score / weightSum : 0;
  }

  /**
   * Calculate context similarity between two pattern contexts
   */
  private calculateContextSimilarity(ctx1: PatternContext, ctx2: PatternContext): number {
    let matches = 0;
    let total = 0;

    // Page type match
    total++;
    if (ctx1.pageType === ctx2.pageType) {
      matches++;
    }

    // User role match
    total++;
    if (ctx1.userRole === ctx2.userRole) {
      matches++;
    }

    // Browser type match
    total++;
    if (ctx1.browserType === ctx2.browserType) {
      matches++;
    }

    // Session duration similarity (within 20% threshold)
    total++;
    const durationDiff = Math.abs(ctx1.sessionDuration - ctx2.sessionDuration);
    const avgDuration = (ctx1.sessionDuration + ctx2.sessionDuration) / 2;
    if (avgDuration === 0 || durationDiff / avgDuration <= 0.2) {
      matches++;
    }

    return total > 0 ? matches / total : 0;
  }

  /**
   * Extract pattern context from voice error
   */
  private extractErrorContext(error: VoiceError): PatternContext {
    const hour = new Date().getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';

    if (hour >= 6 && hour < 12) {timeOfDay = 'morning';}
    else if (hour >= 12 && hour < 18) {timeOfDay = 'afternoon';}
    else if (hour >= 18 && hour < 22) {timeOfDay = 'evening';}
    else {timeOfDay = 'night';}

    const errorContext = error?.context as Partial<ErrorContext> | undefined;
    const browserInfo = errorContext?.browserInfo;
    const contextualPageType = typeof errorContext?.contextualData?.['pageType'] === 'string'
      ? errorContext.contextualData['pageType']
      : undefined;

    return {
      pageType: contextualPageType ?? errorContext?.pageTitle ?? errorContext?.pageUrl ?? 'other',
      userRole: errorContext?.userRole ?? 'guest',
      deviceType: errorContext?.deviceType ?? 'desktop',
      browserType: browserInfo?.name ?? 'unknown',
      timeOfDay,
      sessionDuration: 0, // Would be calculated from session start time
      commandComplexity: this.assessCommandComplexity(error?.details?.originalCommand)
    };
  }

  /**
   * Assess command complexity based on word count and structure
   */
  private assessCommandComplexity(command?: string): 'simple' | 'medium' | 'complex' {
    if (!command) {return 'simple';}

    const words = command.split(' ').length;
    const hasConjunctions = /\b(and|or|but|then|after|before)\b/i.test(command);
    const hasConditionals = /\b(if|when|unless|while)\b/i.test(command);

    if (words <= 3 && !hasConjunctions && !hasConditionals) {
      return 'simple';
    } else if (words <= 6 && (!hasConjunctions || !hasConditionals)) {
      return 'medium';
    } else {
      return 'complex';
    }
  }

  /**
   * Find patterns that might be mergeable
   */
  findMergeablePatterns(patterns: ErrorPattern[]): Array<{ pattern1: ErrorPattern; pattern2: ErrorPattern; similarity: number }> {
    const mergeablePatterns: Array<{ pattern1: ErrorPattern; pattern2: ErrorPattern; similarity: number }> = [];

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const pattern1 = patterns[i];
        const pattern2 = patterns[j];

        // Only consider patterns with same error code
        if (pattern1 && pattern2 && pattern1.errorCode === pattern2.errorCode) {
          const similarity = this.calculateContextSimilarity(pattern1.context, pattern2.context);

          // Patterns are mergeable if they're very similar (>80% context match)
          if (similarity > 0.8) {
            mergeablePatterns.push({ pattern1, pattern2, similarity });
          }
        }
      }
    }

    return mergeablePatterns.sort((a, b) => b.similarity - a.similarity);
  }
}

class AdaptationEngine {
  private adaptationRules: Map<string, AdaptationRule[]> = new Map();

  constructor(private config: LearningConfig) {
    this.initializeAdaptationRules();
  }

  getConfig(): LearningConfig {
    return this.config;
  }

  /**
   * Generate adaptation based on error pattern and context
   */
  generateAdaptation(pattern: ErrorPattern, context: PatternContext): PatternAdaptation | null {
    const rules = this.getApplicableRules(pattern.errorCode, context);

    if (rules.length === 0) {
      return null;
    }

    // Select best rule based on effectiveness and confidence
    const bestRule = rules.reduce((best, current) =>
      (current.effectiveness * current.confidence) > (best.effectiveness * best.confidence)
        ? current : best
    );

    return this.createAdaptation(bestRule, pattern, context);
  }

  /**
   * Generate multiple adaptation strategies for a pattern
   */
  generateAdaptationStrategies(pattern: ErrorPattern, context: PatternContext): PatternAdaptation[] {
    const rules = this.getApplicableRules(pattern.errorCode, context);
    const adaptations: PatternAdaptation[] = [];

    for (const rule of rules) {
      const adaptation = this.createAdaptation(rule, pattern, context);
      if (adaptation) {
        adaptations.push(adaptation);
      }
    }

    return adaptations.sort((a, b) =>
      (b.effectiveness * b.confidence) - (a.effectiveness * a.confidence)
    );
  }

  /**
   * Update adaptation effectiveness based on outcomes
   */
  updateAdaptationEffectiveness(
    adaptationId: string,
    success: boolean,
    userFeedback?: number
  ): void {
    // Find the adaptation and update its effectiveness
    for (const rules of this.adaptationRules.values()) {
      for (const rule of rules) {
        if (rule.id === adaptationId) {
          // Update effectiveness using exponential moving average
          const learningRate = this.config.learningRate;
          const feedbackScore = success ? 1.0 : 0.0;
          const finalScore = userFeedback !== undefined
            ? (feedbackScore + userFeedback) / 2
            : feedbackScore;

          rule.effectiveness = (1 - learningRate) * rule.effectiveness +
                              learningRate * finalScore;

          // Update confidence based on frequency of use
          rule.usageCount++;
          rule.confidence = Math.min(
            1.0,
            rule.confidence + (learningRate * 0.1)
          );

          break;
        }
      }
    }
  }

  /**
   * Learn new adaptation patterns from successful recoveries
   */
  learnFromRecovery(
    pattern: ErrorPattern,
    strategy: RecoveryStrategy,
    outcome: RecoveryOutcome
  ): PatternAdaptation | null {
    if (!outcome.success || outcome.userSatisfaction < 0.6) {
      return null;
    }

    // Create new adaptation rule from successful recovery
    const newRule: AdaptationRule = {
      id: `learned_${pattern.errorCode}_${Date.now()}`,
      errorCode: pattern.errorCode,
      conditions: this.extractConditions(pattern.context),
      adaptationType: this.determineAdaptationType(strategy),
      parameters: this.extractParameters(strategy, outcome),
      effectiveness: outcome.userSatisfaction,
      confidence: 0.7, // Start with moderate confidence
      usageCount: 1,
      learned: true
    };

    // Add to appropriate rule set
    const existingRules = this.adaptationRules.get(pattern.errorCode) || [];
    existingRules.push(newRule);
    this.adaptationRules.set(pattern.errorCode, existingRules);

    return this.createAdaptation(newRule, pattern, pattern.context);
  }

  /**
   * Get adaptation rules applicable to error code and context
   */
  private getApplicableRules(errorCode: string, context: PatternContext): AdaptationRule[] {
    const rules = this.adaptationRules.get(errorCode) || [];

    return rules.filter(rule => this.isRuleApplicable(rule, context));
  }

  /**
   * Check if adaptation rule applies to given context
   */
  private isRuleApplicable(rule: AdaptationRule, context: PatternContext): boolean {
    // Check each condition in the rule
    for (const [key, value] of Object.entries(rule.conditions)) {
      const contextValue = (context as any)[key];

      if (Array.isArray(value)) {
        if (!value.includes(contextValue)) {
          return false;
        }
      } else if (value !== contextValue && value !== '*') {
        return false;
      }
    }

    return true;
  }

  /**
   * Create adaptation from rule and context
   */
  private createAdaptation(
    rule: AdaptationRule,
    pattern: ErrorPattern,
    context: PatternContext
  ): PatternAdaptation {
    return {
      id: `adaptation_${rule.id}_${Date.now()}`,
      description: this.generateAdaptationDescription(rule, pattern, context),
      adaptationType: rule.adaptationType,
      parameters: this.customizeParameters(rule.parameters, pattern, context),
      effectiveness: rule.effectiveness,
      confidence: rule.confidence,
      createdAt: new Date()
    };
  }

  /**
   * Initialize default adaptation rules
   */
  private initializeAdaptationRules(): void {
    // Voice quality adaptations
    this.adaptationRules.set('VOICE_LOW_CONFIDENCE', [
      {
        id: 'voice_confidence_threshold',
        errorCode: 'VOICE_LOW_CONFIDENCE',
        conditions: { deviceType: '*', commandComplexity: 'simple' },
        adaptationType: 'threshold',
        parameters: { confidenceThreshold: 0.6 },
        effectiveness: 0.8,
        confidence: 0.9,
        usageCount: 0,
        learned: false
      },
      {
        id: 'voice_confidence_clarification',
        errorCode: 'VOICE_LOW_CONFIDENCE',
        conditions: { deviceType: 'mobile', commandComplexity: '*' },
        adaptationType: 'presentation',
        parameters: { clarificationStyle: 'voice', confirmRequired: true },
        effectiveness: 0.75,
        confidence: 0.85,
        usageCount: 0,
        learned: false
      }
    ]);

    // Intent ambiguity adaptations
    this.adaptationRules.set('INTENT_AMBIGUOUS', [
      {
        id: 'intent_context_expansion',
        errorCode: 'INTENT_AMBIGUOUS',
        conditions: { pageType: '*', sessionDuration: '*' },
        adaptationType: 'strategy',
        parameters: { expandContext: true, requestClarification: true },
        effectiveness: 0.85,
        confidence: 0.9,
        usageCount: 0,
        learned: false
      },
      {
        id: 'intent_disambiguation_menu',
        errorCode: 'INTENT_AMBIGUOUS',
        conditions: { deviceType: 'desktop', commandComplexity: 'complex' },
        adaptationType: 'presentation',
        parameters: { showDisambiguationMenu: true, maxOptions: 3 },
        effectiveness: 0.8,
        confidence: 0.8,
        usageCount: 0,
        learned: false
      }
    ]);

    // Element not found adaptations
    this.adaptationRules.set('ACTION_ELEMENT_NOT_FOUND', [
      {
        id: 'element_search_expansion',
        errorCode: 'ACTION_ELEMENT_NOT_FOUND',
        conditions: { pageType: '*' },
        adaptationType: 'strategy',
        parameters: { expandSearch: true, useFuzzyMatching: true },
        effectiveness: 0.7,
        confidence: 0.8,
        usageCount: 0,
        learned: false
      },
      {
        id: 'element_alternative_suggest',
        errorCode: 'ACTION_ELEMENT_NOT_FOUND',
        conditions: { userRole: '*' },
        adaptationType: 'presentation',
        parameters: { suggestAlternatives: true, showElementPath: true },
        effectiveness: 0.65,
        confidence: 0.75,
        usageCount: 0,
        learned: false
      }
    ]);

    // Timing adaptations
    this.adaptationRules.set('TIMING_MISMATCH', [
      {
        id: 'timing_patience_increase',
        errorCode: 'TIMING_MISMATCH',
        conditions: { timeOfDay: ['evening', 'night'] },
        adaptationType: 'timing',
        parameters: { increaseTimeout: 1.5, addWarnings: true },
        effectiveness: 0.8,
        confidence: 0.85,
        usageCount: 0,
        learned: false
      }
    ]);
  }

  /**
   * Generate human-readable description for adaptation
   */
  private generateAdaptationDescription(
    rule: AdaptationRule,
    pattern: ErrorPattern,
    context: PatternContext
  ): string {
    const descriptions = {
      threshold: `Adjust detection thresholds for ${pattern.errorCode} in ${context.pageType} pages`,
      strategy: `Modify recovery strategy for ${pattern.errorCode} errors`,
      timing: `Adjust timing parameters for ${pattern.errorCode} scenarios`,
      presentation: `Improve user interface for ${pattern.errorCode} handling`
    };

    return descriptions[rule.adaptationType] || `Custom adaptation for ${pattern.errorCode}`;
  }

  /**
   * Customize rule parameters for specific context
   */
  private customizeParameters(
    ruleParams: Record<string, any>,
    pattern: ErrorPattern,
    context: PatternContext
  ): Record<string, any> {
    const customized = { ...ruleParams };

    // Adjust parameters based on pattern frequency
    if (pattern.frequency > 10) {
      // High frequency patterns need more conservative adaptations
      if (customized['confidenceThreshold']) {
        customized['confidenceThreshold'] *= 0.9;
      }
      if (customized['increaseTimeout']) {
        customized['increaseTimeout'] *= 1.2;
      }
    }

    // Adjust for device type
    if (context.deviceType === 'mobile') {
      if (customized['maxOptions']) {
        customized['maxOptions'] = Math.min(customized['maxOptions'], 2);
      }
      if (customized['showElementPath']) {
        customized['showElementPath'] = false; // Hide complex paths on mobile
      }
    }

    return customized;
  }

  /**
   * Extract conditions from pattern context
   */
  private extractConditions(context: PatternContext): Record<string, any> {
    return {
      pageType: context.pageType,
      deviceType: context.deviceType,
      commandComplexity: context.commandComplexity,
      timeOfDay: context.timeOfDay
    };
  }

  /**
   * Determine adaptation type from recovery strategy
   */
  private determineAdaptationType(strategy: RecoveryStrategy): 'threshold' | 'strategy' | 'timing' | 'presentation' {
    const strategyName = strategy.name.toLowerCase();

    if (strategyName.includes('threshold') || strategyName.includes('confidence')) {
      return 'threshold';
    } else if (strategyName.includes('timeout') || strategyName.includes('timing')) {
      return 'timing';
    } else if (strategyName.includes('ui') || strategyName.includes('display') || strategyName.includes('show')) {
      return 'presentation';
    } else {
      return 'strategy';
    }
  }

  /**
   * Extract parameters from successful strategy and outcome
   */
  private extractParameters(strategy: RecoveryStrategy, outcome: RecoveryOutcome): Record<string, any> {
    const params: Record<string, any> = {};

    // Extract timing parameters
    if (outcome.duration && outcome.duration > 0) {
      params['optimalDuration'] = outcome.duration;
    }

    // Extract strategy-specific parameters
    const strategyParams = (strategy as any).parameters;
    if (strategyParams) {
      Object.assign(params, strategyParams);
    }

    // Add success indicators
    params['successIndicators'] = {
      userSatisfaction: outcome.userSatisfaction,
      resolutionTime: outcome.duration
    };

    return params;
  }
}

interface AdaptationRule {
  id: string;
  errorCode: string;
  conditions: Record<string, any>;
  adaptationType: 'threshold' | 'strategy' | 'timing' | 'presentation';
  parameters: Record<string, any>;
  effectiveness: number;
  confidence: number;
  usageCount: number;
  learned: boolean;
}

class RecommendationGenerator {
  private recommendationTemplates: Map<string, RecommendationTemplate> = new Map();
  private generatedRecommendations: Map<string, SystemRecommendation> = new Map();

  constructor() {
    this.initializeRecommendationTemplates();
  }

  /**
   * Generate system recommendation based on data analysis
   */
  generateRecommendation(data: RecommendationData): SystemRecommendation {
    const template = this.selectBestTemplate(data);

    if (!template) {
      return this.createFallbackRecommendation(data);
    }

    const recommendation = this.createRecommendationFromTemplate(template, data);
    this.generatedRecommendations.set(recommendation.id, recommendation);

    return recommendation;
  }

  /**
   * Generate multiple recommendations based on comprehensive analysis
   */
  generateRecommendations(
    patterns: ErrorPattern[],
    userFeedback: UserFeedback[],
    systemMetrics: SystemMetrics
  ): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Analyze error patterns for prevention opportunities
    const preventionRecs = this.generatePreventionRecommendations(patterns);
    recommendations.push(...preventionRecs);

    // Analyze user feedback for UX improvements
    const uxRecs = this.generateUXRecommendations(userFeedback);
    recommendations.push(...uxRecs);

    // Analyze system metrics for performance improvements
    const performanceRecs = this.generatePerformanceRecommendations(systemMetrics);
    recommendations.push(...performanceRecs);

    // Generate strategic recommendations based on overall analysis
    const strategicRecs = this.generateStrategicRecommendations(patterns, userFeedback, systemMetrics);
    recommendations.push(...strategicRecs);

    return this.prioritizeRecommendations(recommendations);
  }

  /**
   * Update recommendation effectiveness based on implementation results
   */
  updateRecommendationEffectiveness(
    recommendationId: string,
    implemented: boolean,
    effectivenessScore?: number,
    userFeedback?: string
  ): void {
    const recommendation = this.generatedRecommendations.get(recommendationId);
    if (!recommendation) {
      return;
    }

    // Update the template effectiveness
    const template = this.recommendationTemplates.get(recommendation.type);
    if (template && effectivenessScore !== undefined) {
      // Use exponential moving average to update template effectiveness
      const alpha = 0.2;
      template.historicalEffectiveness =
        alpha * effectivenessScore + (1 - alpha) * template.historicalEffectiveness;
      template.implementationCount++;
    }

    // Store implementation results
    if (!recommendation.data.implementationHistory) {
      recommendation.data.implementationHistory = [];
    }

    recommendation.data.implementationHistory.push({
      implemented,
      effectivenessScore,
      userFeedback,
      timestamp: new Date()
    });
  }

  /**
   * Get recommendation implementation insights
   */
  getImplementationInsights(): RecommendationInsights {
    const recommendations = Array.from(this.generatedRecommendations.values());

    const totalGenerated = recommendations.length;
    const implemented = recommendations.filter(r =>
      r.data.implementationHistory?.some((h: any) => h.implemented)
    ).length;

    const avgEffectiveness = recommendations
      .filter(r => r.data.implementationHistory?.length > 0)
      .reduce((sum, r) => {
        const history = r.data.implementationHistory || [];
        const scores = history.filter((h: any) => h.effectivenessScore !== undefined);
        const avgScore = scores.length > 0
          ? scores.reduce((s: number, h: any) => s + h.effectivenessScore, 0) / scores.length
          : 0;
        return sum + avgScore;
      }, 0) / Math.max(1, recommendations.length);

    return {
      totalGenerated,
      implementationRate: totalGenerated > 0 ? implemented / totalGenerated : 0,
      averageEffectiveness: avgEffectiveness,
      topRecommendationTypes: this.getTopRecommendationTypes(),
      recommendationTrends: this.getRecommendationTrends()
    };
  }

  /**
   * Select best template for given data
   */
  private selectBestTemplate(data: RecommendationData): RecommendationTemplate | null {
    let bestTemplate: RecommendationTemplate | null = null;
    let bestScore = 0;

    for (const template of this.recommendationTemplates.values()) {
      const score = this.calculateTemplateScore(template, data);

      if (score > bestScore && score >= template.minimumScore) {
        bestScore = score;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }

  /**
   * Calculate how well a template matches the data
   */
  private calculateTemplateScore(template: RecommendationTemplate, data: RecommendationData): number {
    let score = 0;

    // Check data type compatibility
    if (template.applicableDataTypes.includes(data.type)) {
      score += 0.4;
    }

    // Check frequency thresholds
    if (data.frequency >= template.minimumFrequency) {
      score += 0.2;
    }

    // Check confidence requirements
    if (data.confidence >= template.minimumConfidence) {
      score += 0.2;
    }

    // Factor in historical effectiveness
    score += template.historicalEffectiveness * 0.2;

    return score;
  }

  /**
   * Create recommendation from template and data
   */
  private createRecommendationFromTemplate(
    template: RecommendationTemplate,
    data: RecommendationData
  ): SystemRecommendation {
    const variables = this.extractVariables(data);

    return {
      id: `rec_${template.id}_${Date.now()}`,
      type: template.type,
      title: this.interpolateString(template.titleTemplate, variables),
      description: this.interpolateString(template.descriptionTemplate, variables),
      impact: this.calculateImpact(data, template),
      effort: template.estimatedEffort,
      confidence: Math.min(data.confidence, template.historicalEffectiveness),
      data: {
        template: template.id,
        originalData: data,
        variables,
        generationTimestamp: new Date()
      },
      createdAt: new Date()
    };
  }

  /**
   * Generate prevention recommendations from error patterns
   */
  private generatePreventionRecommendations(patterns: ErrorPattern[]): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Group patterns by error code
    const patternGroups = patterns.reduce((groups, pattern) => {
      const key = pattern.errorCode;
      if (!groups[key]) {groups[key] = [];}
      groups[key].push(pattern);
      return groups;
    }, {} as Record<string, ErrorPattern[]>);

    for (const [errorCode, errorPatterns] of Object.entries(patternGroups)) {
      const totalFrequency = errorPatterns.reduce((sum, p) => sum + p.frequency, 0);

      if (totalFrequency >= 5) { // High frequency errors
        const data: RecommendationData = {
          type: 'error_pattern',
          errorCode,
          frequency: totalFrequency,
          confidence: errorPatterns.reduce((sum, p) => sum + p.confidence, 0) / errorPatterns.length,
          context: { patterns: errorPatterns }
        };

        const recommendation = this.generateRecommendation(data);
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  /**
   * Generate UX recommendations from user feedback
   */
  private generateUXRecommendations(userFeedback: UserFeedback[]): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Analyze feedback sentiment and common issues
    const negativeFeeback = userFeedback.filter(f => f.rating < 3);
    const commonIssues = this.extractCommonIssues(negativeFeeback);

    for (const issue of commonIssues) {
      if (issue.frequency >= 3) {
        const data: RecommendationData = {
          type: 'user_experience',
          errorCode: issue.type,
          frequency: issue.frequency,
          confidence: 0.8,
          context: { issue, feedback: negativeFeeback }
        };

        const recommendation = this.generateRecommendation(data);
        recommendations.push(recommendation);
      }
    }

    return recommendations;
  }

  /**
   * Generate performance recommendations from system metrics
   */
  private generatePerformanceRecommendations(metrics: SystemMetrics): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Check response time metrics
    if (metrics.averageResponseTime > 300) { // Above 300ms threshold
      const data: RecommendationData = {
        type: 'performance',
        errorCode: 'RESPONSE_TIME_HIGH',
        frequency: 1,
        confidence: 0.9,
        context: { metrics, issue: 'response_time' }
      };

      recommendations.push(this.generateRecommendation(data));
    }

    // Check error rates
    if (metrics.errorRate > 0.05) { // Above 5% error rate
      const data: RecommendationData = {
        type: 'performance',
        errorCode: 'ERROR_RATE_HIGH',
        frequency: 1,
        confidence: 0.9,
        context: { metrics, issue: 'error_rate' }
      };

      recommendations.push(this.generateRecommendation(data));
    }

    return recommendations;
  }

  /**
   * Generate strategic recommendations based on comprehensive analysis
   */
  private generateStrategicRecommendations(
    patterns: ErrorPattern[],
    userFeedback: UserFeedback[],
    metrics: SystemMetrics
  ): SystemRecommendation[] {
    const recommendations: SystemRecommendation[] = [];

    // Analyze overall system health
    const overallHealth = this.calculateSystemHealth(patterns, userFeedback, metrics);

    if (overallHealth < 0.7) {
      const data: RecommendationData = {
        type: 'error_prevention',
        errorCode: 'SYSTEM_HEALTH_LOW',
        frequency: 1,
        confidence: 0.85,
        context: { overallHealth, patterns, userFeedback, metrics }
      };

      recommendations.push(this.generateRecommendation(data));
    }

    return recommendations;
  }

  /**
   * Initialize recommendation templates
   */
  private initializeRecommendationTemplates(): void {
    // Error Prevention Templates
    this.recommendationTemplates.set('voice_confidence_improvement', {
      id: 'voice_confidence_improvement',
      type: 'error_prevention',
      titleTemplate: 'Improve Voice Recognition Confidence for {{errorCode}}',
      descriptionTemplate: 'Implement confidence threshold adjustments and user guidance to reduce {{errorCode}} errors (frequency: {{frequency}})',
      applicableDataTypes: ['error_pattern'],
      minimumFrequency: 5,
      minimumConfidence: 0.6,
      minimumScore: 0.6,
      estimatedEffort: 'medium',
      expectedImpact: 'high',
      historicalEffectiveness: 0.8,
      implementationCount: 0
    });

    this.recommendationTemplates.set('intent_disambiguation', {
      id: 'intent_disambiguation',
      type: 'error_prevention',
      titleTemplate: 'Implement Intent Disambiguation for {{errorCode}}',
      descriptionTemplate: 'Add clarification dialogs and context expansion to reduce ambiguous intent errors (frequency: {{frequency}})',
      applicableDataTypes: ['error_pattern'],
      minimumFrequency: 3,
      minimumConfidence: 0.7,
      minimumScore: 0.65,
      estimatedEffort: 'high',
      expectedImpact: 'high',
      historicalEffectiveness: 0.85,
      implementationCount: 0
    });

    // UX Improvement Templates
    this.recommendationTemplates.set('clarification_ux', {
      id: 'clarification_ux',
      type: 'user_experience',
      titleTemplate: 'Enhance Clarification User Experience',
      descriptionTemplate: 'Improve clarification dialogs and user feedback mechanisms based on user complaints ({{frequency}} reports)',
      applicableDataTypes: ['user_experience'],
      minimumFrequency: 2,
      minimumConfidence: 0.6,
      minimumScore: 0.5,
      estimatedEffort: 'medium',
      expectedImpact: 'medium',
      historicalEffectiveness: 0.75,
      implementationCount: 0
    });

    // Performance Templates
    this.recommendationTemplates.set('response_time_optimization', {
      id: 'response_time_optimization',
      type: 'performance',
      titleTemplate: 'Optimize Response Time Performance',
      descriptionTemplate: 'Implement caching and performance optimizations to reduce response times below 300ms threshold',
      applicableDataTypes: ['performance'],
      minimumFrequency: 1,
      minimumConfidence: 0.8,
      minimumScore: 0.7,
      estimatedEffort: 'high',
      expectedImpact: 'high',
      historicalEffectiveness: 0.9,
      implementationCount: 0
    });
  }

  private createFallbackRecommendation(data: RecommendationData): SystemRecommendation {
    return {
      id: `rec_fallback_${Date.now()}`,
      type: 'error_prevention',
      title: `Address ${data.errorCode} Issues`,
      description: `Investigate and resolve ${data.errorCode} errors with frequency ${data.frequency}`,
      impact: 'medium',
      effort: 'medium',
      confidence: Math.max(0.3, data.confidence * 0.7),
      data: { originalData: data, fallback: true },
      createdAt: new Date()
    };
  }

  private extractVariables(data: RecommendationData): Record<string, string> {
    return {
      errorCode: data.errorCode,
      frequency: data.frequency.toString(),
      confidence: data.confidence.toFixed(2)
    };
  }

  private interpolateString(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private calculateImpact(data: RecommendationData, template: RecommendationTemplate): 'low' | 'medium' | 'high' | 'critical' {
    const frequencyScore = Math.min(data.frequency / 10, 1);
    const confidenceScore = data.confidence;
    const templateScore = template.historicalEffectiveness;

    const combinedScore = (frequencyScore * 0.4 + confidenceScore * 0.3 + templateScore * 0.3);

    if (combinedScore >= 0.8) {return 'critical';}
    if (combinedScore >= 0.6) {return 'high';}
    if (combinedScore >= 0.4) {return 'medium';}
    return 'low';
  }

  private prioritizeRecommendations(recommendations: SystemRecommendation[]): SystemRecommendation[] {
    const impactScores = { low: 1, medium: 2, high: 3, critical: 4 };
    const effortScores = { low: 1, medium: 2, high: 3 };

    return recommendations.sort((a, b) => {
      const aScore = (impactScores[a.impact] / effortScores[a.effort]) * a.confidence;
      const bScore = (impactScores[b.impact] / effortScores[b.effort]) * b.confidence;
      return bScore - aScore;
    });
  }

  private extractCommonIssues(feedback: UserFeedback[]): Array<{ type: string; frequency: number }> {
    const issues: Record<string, number> = {};

    feedback.forEach(f => {
      const issueType = (f as any).category || 'general';
      issues[issueType] = (issues[issueType] || 0) + 1;
    });

    return Object.entries(issues).map(([type, frequency]) => ({ type, frequency }));
  }

  private calculateSystemHealth(
    _patterns: ErrorPattern[],
    feedback: UserFeedback[],
    metrics: SystemMetrics
  ): number {
    const errorScore = Math.max(0, 1 - (metrics.errorRate || 0) * 2);
    const performanceScore = Math.max(0, 1 - Math.max(0, (metrics.averageResponseTime - 200) / 300));
    const feedbackScore = feedback.length > 0
      ? feedback.reduce((sum, f) => sum + (f as any).rating, 0) / (feedback.length * 5)
      : 0.5;

    return (errorScore + performanceScore + feedbackScore) / 3;
  }

  private getTopRecommendationTypes(): Array<{ type: string; count: number }> {
    const types: Record<string, number> = {};

    for (const rec of this.generatedRecommendations.values()) {
      types[rec.type] = (types[rec.type] || 0) + 1;
    }

    return Object.entries(types)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getRecommendationTrends(): Array<{ date: string; count: number }> {
    const dailyCounts: Record<string, number> = {};

    for (const rec of this.generatedRecommendations.values()) {
      const dateParts = rec.createdAt.toISOString().split('T');
      const date = dateParts[0] || rec.createdAt.toISOString().substring(0, 10);
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    }

    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

interface RecommendationTemplate {
  id: string;
  type: 'error_prevention' | 'recovery_improvement' | 'user_experience' | 'performance';
  titleTemplate: string;
  descriptionTemplate: string;
  applicableDataTypes: string[];
  minimumFrequency: number;
  minimumConfidence: number;
  minimumScore: number;
  estimatedEffort: 'low' | 'medium' | 'high';
  expectedImpact: 'low' | 'medium' | 'high' | 'critical';
  historicalEffectiveness: number;
  implementationCount: number;
}

interface RecommendationData {
  type: string;
  errorCode: string;
  frequency: number;
  confidence: number;
  context: any;
}

interface SystemMetrics {
  averageResponseTime: number;
  errorRate: number;
  [key: string]: any;
}

interface RecommendationInsights {
  totalGenerated: number;
  implementationRate: number;
  averageEffectiveness: number;
  topRecommendationTypes: Array<{ type: string; count: number }>;
  recommendationTrends: Array<{ date: string; count: number }>;
}

class PrivacyManager {
  constructor(private config: LearningConfig) {}

  getConfig(): LearningConfig {
    return this.config;
  }

  sanitizeUserData(_profile: UserLearningProfile): any { // Part of interface contract, implementation pending
    // Implementation would sanitize user data for privacy
    return {};
  }

  sanitizeSystemData(_systemLearning: SystemLearning): any { // Part of interface contract, implementation pending
    // Implementation would sanitize system data for privacy
    return {};
  }
}

class LearningPerformanceTracker {
  private metrics = new Map<string, number[]>();

  recordLearning(type: string, time: number): void {
    const times = this.metrics.get(type) || [];
    times.push(time);
    this.metrics.set(type, times);
  }

  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [type, times] of this.metrics) {
      result[type] = times.reduce((a, b) => a + b, 0) / times.length;
    }
    return result;
  }
}

// Factory function
export function createErrorLearningService(
  config?: Partial<LearningConfig>
): ErrorLearningService {
  return new ErrorLearningService(config);
}

export default ErrorLearningService;