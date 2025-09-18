/**
 * Speculative Navigation Predictor - AI-powered navigation prediction engine
 *
 * Predicts likely next user actions for speculative resource loading:
 * - AI-powered intent prediction based on conversation context
 * - Pattern analysis of user navigation behavior
 * - Confidence-based speculative resource prefetching
 * - Dynamic prediction model adaptation
 * - Universal compatibility across website structures
 * - Integration with browser resource hints API
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils.js';
import OpenAI from 'openai';
import { config } from '../../../../infrastructure/config/index.js';
// Removed unused imports for cleaner dependencies
import type { SelectionContext } from './VoiceElementSelector.js';

const logger = createLogger({ service: 'speculative-navigation-predictor' });

// Local type definitions (previously from VoiceNavigationOrchestrator, now consolidated in UnifiedVoiceOrchestrator)
export interface NavigationStructure {
  landmarks: any[];
  menuSystems: any[];
  breadcrumbs: any[];
  pageStructure: any;
  semanticRegions: any[];
}

export interface NavigationPrediction {
  id: string;
  type: 'navigation' | 'interaction' | 'content_request';
  target: string;
  confidence: number;
  reasoning: string;
  estimatedProbability: number;
  resourceHints: ResourceHint[];
  contextFactors: ContextFactor[];
  timeToExecution: number; // Estimated ms until user will trigger this
}

export interface ResourceHint {
  type: 'preload' | 'prefetch' | 'preconnect' | 'dns-prefetch';
  resource: string;
  priority: 'high' | 'medium' | 'low';
  crossorigin?: boolean;
  media?: string;
}

export interface ContextFactor {
  factor: string;
  weight: number;
  value: any;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface ConversationPattern {
  intent: string;
  frequency: number;
  lastUsed: number;
  successRate: number;
  followUpPatterns: string[];
  contextTriggers: string[];
}

export interface UserBehaviorProfile {
  sessionId: string;
  navigationPatterns: ConversationPattern[];
  preferredTargets: Map<string, number>;
  averageThinkTime: number;
  confidenceThreshold: number;
  recentActions: NavigationAction[];
}

export interface NavigationAction {
  timestamp: number;
  command: string;
  target: string;
  success: boolean;
  executionTime: number;
  followedPrediction: boolean;
}

export interface PredictionMetrics {
  totalPredictions: number;
  accuracyRate: number;
  averageConfidence: number;
  resourceHintEffectiveness: number;
  speculativeHitRate: number;
  falsePositiveRate: number;
  timeToActionAccuracy: number;
}

/**
 * Speculative Navigation Predictor
 * Uses AI and behavioral analysis to predict user's next actions
 */
export class SpeculativeNavigationPredictor extends EventEmitter {
  private openai: OpenAI;

  // Prediction state
  private activePredictions = new Map<string, NavigationPrediction>();
  private userProfiles = new Map<string, UserBehaviorProfile>();
  private globalPatterns = new Map<string, ConversationPattern>();

  // Configuration
  private predictionConfig = {
    maxActivePredictions: 5,
    predictionHorizon: 10000, // 10 seconds ahead
    confidenceThreshold: 0.6,
    patternMemoryDuration: 24 * 60 * 60 * 1000, // 24 hours
    adaptiveLearning: true,
  };

  // Performance tracking
  private metrics: PredictionMetrics = {
    totalPredictions: 0,
    accuracyRate: 0,
    averageConfidence: 0,
    resourceHintEffectiveness: 0,
    speculativeHitRate: 0,
    falsePositiveRate: 0,
    timeToActionAccuracy: 0,
  };

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    this.initialize();
  }

  /**
   * Initialize the prediction engine
   */
  private async initialize(): Promise<void> {
    try {
      this.setupPredictionLoop();
      this.loadGlobalPatterns();
      // Initialization completed
      logger.info('SpeculativeNavigationPredictor initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize SpeculativeNavigationPredictor', { error });
      throw error;
    }
  }

  /**
   * Generate navigation predictions based on current context
   */
  async generatePredictions(
    currentCommand: string,
    context: SelectionContext,
    navigationStructure: NavigationStructure,
    conversationHistory: string[],
    sessionId: string
  ): Promise<NavigationPrediction[]> {
    try {
      logger.debug('Generating navigation predictions', {
        currentCommand,
        mode: context.mode,
        historyLength: conversationHistory.length,
        sessionId,
      });

      // Get or create user profile
      const userProfile = this.getUserProfile(sessionId);

      // AI-powered intent prediction
      const aiPredictions = await this.generateAIPredictions(
        currentCommand,
        context,
        navigationStructure,
        conversationHistory
      );

      // Pattern-based predictions
      const patternPredictions = await this.generatePatternPredictions(
        currentCommand,
        userProfile,
        navigationStructure
      );

      // Combine and rank predictions
      const combinedPredictions = this.combinePredictions(
        await aiPredictions,
        patternPredictions,
        userProfile
      );

      // Generate resource hints for top predictions
      const enhancedPredictions = await this.enhanceWithResourceHints(
        combinedPredictions,
        navigationStructure
      );

      // Store active predictions
      enhancedPredictions.forEach(prediction => {
        this.activePredictions.set(prediction.id, prediction);
      });

      // Update user profile with current action
      this.updateUserProfile(sessionId, currentCommand, context);

      // Emit predictions for real-time processing
      this.emit('predictions_generated', {
        sessionId,
        predictions: enhancedPredictions,
        confidence: this.calculateAverageConfidence(enhancedPredictions),
      });

      logger.info('Navigation predictions generated', {
        count: enhancedPredictions.length,
        averageConfidence: this.calculateAverageConfidence(enhancedPredictions),
        sessionId,
      });

      return enhancedPredictions;

    } catch (error) {
      logger.error('Failed to generate predictions', { error, currentCommand, sessionId });
      return [];
    }
  }

  /**
   * Generate AI-powered predictions using conversation context
   */
  private async generateAIPredictions(
    currentCommand: string,
    context: SelectionContext,
    navigationStructure: NavigationStructure,
    conversationHistory: string[]
  ): Promise<NavigationPrediction[]> {
    try {
      const availableTargets = this.extractAvailableTargets(navigationStructure);
      const recentHistory = conversationHistory.slice(-5).join('\n');

      const prompt = `Predict the user's next 3 most likely navigation actions based on their current command and conversation context.

Current command: "${currentCommand}"
Context mode: ${context.mode}
Recent conversation:
${recentHistory}

Available navigation targets: ${availableTargets.slice(0, 20).join(', ')}

For each prediction, provide:
1. Type: navigation, interaction, or content_request
2. Target: specific element or page they'll likely interact with
3. Confidence: 0.0-1.0 probability this will be their next action
4. Reasoning: why this prediction makes sense
5. Time estimate: milliseconds until they'll likely trigger this action

Consider:
- Natural conversation flow and user intent
- Common UI patterns and user behaviors
- Current context and available options
- Logical next steps in their workflow

Return JSON array with: [{"type": "navigation", "target": "settings", "confidence": 0.8, "reasoning": "user mentioned wanting to change settings", "timeToExecution": 5000}]`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at predicting user navigation behavior. Return only valid JSON array.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      const result = completion.choices[0]?.message?.content;
      if (!result) {
        return [];
      }

      const aiPredictions = JSON.parse(result);

      return aiPredictions.map((prediction: any, index: number) => ({
        id: this.generatePredictionId('ai'),
        type: prediction.type || 'navigation',
        target: prediction.target || 'unknown',
        confidence: Math.max(0, Math.min(1, prediction.confidence || 0.5)),
        reasoning: prediction.reasoning || 'AI prediction',
        estimatedProbability: prediction.confidence || 0.5,
        resourceHints: [],
        contextFactors: [
          {
            factor: 'ai_prediction',
            weight: 0.8,
            value: prediction.reasoning,
            impact: 'positive',
          },
        ],
        timeToExecution: prediction.timeToExecution || 3000 + (index * 2000),
      }));

    } catch (error) {
      logger.error('Failed to generate AI predictions', { error });
      return [];
    }
  }

  /**
   * Generate pattern-based predictions using user behavior
   */
  private generatePatternPredictions(
    currentCommand: string,
    userProfile: UserBehaviorProfile,
    navigationStructure: NavigationStructure
  ): Promise<NavigationPrediction[]> {
    const predictions: NavigationPrediction[] = [];

    try {
      // Analyze user's historical patterns
      const relevantPatterns = this.findRelevantPatterns(currentCommand, userProfile);

      relevantPatterns.forEach((pattern, index) => {
        // Calculate confidence based on pattern frequency and success rate
        const confidence = this.calculatePatternConfidence(pattern, userProfile);

        if (confidence >= this.predictionConfig.confidenceThreshold) {
          predictions.push({
            id: this.generatePredictionId('pattern'),
            type: this.mapIntentToType(pattern.intent),
            target: this.findBestTarget(pattern, navigationStructure),
            confidence,
            reasoning: `Based on user pattern: ${pattern.intent} (used ${pattern.frequency} times, ${Math.round(pattern.successRate * 100)}% success rate)`,
            estimatedProbability: confidence,
            resourceHints: [],
            contextFactors: [
              {
                factor: 'historical_pattern',
                weight: 0.6,
                value: pattern.frequency,
                impact: 'positive',
              },
              {
                factor: 'success_rate',
                weight: 0.4,
                value: pattern.successRate,
                impact: pattern.successRate > 0.7 ? 'positive' : 'neutral',
              },
            ],
            timeToExecution: userProfile.averageThinkTime + (index * 1000),
          });
        }
      });

      // Add predictions based on preferred targets
      userProfile.preferredTargets.forEach((frequency, target) => {
        if (predictions.length < 3) { // Limit pattern predictions
          const confidence = Math.min(0.7, frequency / 10); // Cap at 0.7 confidence

          predictions.push({
            id: this.generatePredictionId('preference'),
            type: 'navigation',
            target,
            confidence,
            reasoning: `User frequently navigates to ${target} (${frequency} times)`,
            estimatedProbability: confidence,
            resourceHints: [],
            contextFactors: [
              {
                factor: 'target_preference',
                weight: 0.5,
                value: frequency,
                impact: 'positive',
              },
            ],
            timeToExecution: userProfile.averageThinkTime,
          });
        }
      });

    } catch (error) {
      logger.error('Failed to generate pattern predictions', { error });
    }

    return Promise.resolve(predictions);
  }

  /**
   * Combine AI and pattern predictions with intelligent ranking
   */
  private combinePredictions(
    aiPredictions: NavigationPrediction[],
    patternPredictions: NavigationPrediction[],
    userProfile: UserBehaviorProfile
  ): NavigationPrediction[] {
    const allPredictions = [...aiPredictions, ...patternPredictions];

    // Remove duplicates and merge similar predictions
    const uniquePredictions = this.deduplicatePredictions(allPredictions);

    // Rank by combined confidence score
    const rankedPredictions = uniquePredictions
      .map(prediction => ({
        ...prediction,
        confidence: this.calculateCombinedConfidence(prediction, userProfile),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.predictionConfig.maxActivePredictions);

    return rankedPredictions;
  }

  /**
   * Enhance predictions with resource hints
   */
  private async enhanceWithResourceHints(
    predictions: NavigationPrediction[],
    navigationStructure: NavigationStructure
  ): Promise<NavigationPrediction[]> {
    return predictions.map(prediction => {
      const resourceHints = this.generateResourceHints(prediction, navigationStructure);

      return {
        ...prediction,
        resourceHints,
      };
    });
  }

  /**
   * Generate appropriate resource hints for a prediction
   */
  private generateResourceHints(
    prediction: NavigationPrediction,
    _navigationStructure: NavigationStructure
  ): ResourceHint[] {
    const hints: ResourceHint[] = [];

    try {
      // Navigation predictions
      if (prediction.type === 'navigation') {
        // Prefetch likely page resources
        hints.push({
          type: 'prefetch',
          resource: this.getResourcePath(prediction.target),
          priority: prediction.confidence > 0.8 ? 'high' : 'medium',
        });

        // DNS prefetch for external domains
        const externalDomains = this.extractExternalDomains(prediction.target);
        externalDomains.forEach(domain => {
          hints.push({
            type: 'dns-prefetch',
            resource: domain,
            priority: 'low',
          });
        });
      }

      // Interaction predictions
      else if (prediction.type === 'interaction') {
        // Preload critical resources for interactions
        hints.push({
          type: 'preload',
          resource: this.getInteractionResource(prediction.target),
          priority: prediction.confidence > 0.9 ? 'high' : 'medium',
        });
      }

      // Content request predictions
      else if (prediction.type === 'content_request') {
        // Preconnect to API endpoints
        hints.push({
          type: 'preconnect',
          resource: this.getAPIEndpoint(prediction.target),
          priority: 'medium',
          crossorigin: true,
        });
      }

    } catch (error) {
      logger.error('Failed to generate resource hints', { error, prediction });
    }

    return hints;
  }

  /**
   * Validate prediction accuracy when user action occurs
   */
  validatePrediction(
    actualCommand: string,
    actualTarget: string,
    sessionId: string
  ): void {
    try {
      const userProfile = this.getUserProfile(sessionId);
      let bestMatch: NavigationPrediction | null = null;
      let bestScore = 0;

      // Find best matching prediction
      for (const prediction of this.activePredictions.values()) {
        const score = this.calculateMatchScore(prediction, actualCommand, actualTarget);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = prediction;
        }
      }

      // Record validation result
      const navigationAction: NavigationAction = {
        timestamp: Date.now(),
        command: actualCommand,
        target: actualTarget,
        success: true,
        executionTime: 0, // Would be provided from actual execution
        followedPrediction: bestMatch !== null && bestScore > 0.7,
      };

      userProfile.recentActions.push(navigationAction);

      // Update metrics
      this.updatePredictionMetrics(bestMatch, bestScore > 0.7);

      // Learn from the result
      if (this.predictionConfig.adaptiveLearning) {
        this.updatePatternsFromResult(actualCommand, actualTarget, sessionId, bestMatch);
      }

      logger.debug('Prediction validated', {
        actualCommand,
        actualTarget,
        predictedCorrectly: bestScore > 0.7,
        confidence: bestMatch?.confidence || 0,
        sessionId,
      });

    } catch (error) {
      logger.error('Failed to validate prediction', { error, actualCommand, sessionId });
    }
  }

  /**
   * Get user behavior profile or create new one
   */
  private getUserProfile(sessionId: string): UserBehaviorProfile {
    if (!this.userProfiles.has(sessionId)) {
      this.userProfiles.set(sessionId, {
        sessionId,
        navigationPatterns: [],
        preferredTargets: new Map(),
        averageThinkTime: 3000, // Default 3 seconds
        confidenceThreshold: 0.6,
        recentActions: [],
      });
    }

    return this.userProfiles.get(sessionId)!;
  }

  /**
   * Update user profile with new action
   */
  private updateUserProfile(
    sessionId: string,
    command: string,
    context: SelectionContext
  ): void {
    const profile = this.getUserProfile(sessionId);

    // Extract intent and update patterns
    const intent = this.extractIntent(command);
    let pattern = profile.navigationPatterns.find(p => p.intent === intent);

    if (!pattern) {
      pattern = {
        intent,
        frequency: 0,
        lastUsed: Date.now(),
        successRate: 1.0,
        followUpPatterns: [],
        contextTriggers: [context.mode || 'unknown'],
      };
      profile.navigationPatterns.push(pattern);
    }

    pattern.frequency++;
    pattern.lastUsed = Date.now();

    // Update think time based on recent actions
    if (profile.recentActions.length > 1) {
      const timeDiff = Date.now() - profile.recentActions[profile.recentActions.length - 1]!.timestamp;
      profile.averageThinkTime = (profile.averageThinkTime + timeDiff) / 2;
    }
  }

  /**
   * Setup prediction processing loop
   */
  private setupPredictionLoop(): void {
    setInterval(() => {
      this.cleanupExpiredPredictions();
      this.adaptThresholds();
    }, 5000); // 5 second intervals
  }

  /**
   * Clean up expired predictions
   */
  private cleanupExpiredPredictions(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, prediction] of this.activePredictions.entries()) {
      if (now - Date.now() > prediction.timeToExecution * 2) {
        expired.push(id);
      }
    }

    expired.forEach(id => this.activePredictions.delete(id));
  }

  /**
   * Adapt prediction thresholds based on performance
   */
  private adaptThresholds(): void {
    if (this.metrics.falsePositiveRate > 0.3) {
      this.predictionConfig.confidenceThreshold = Math.min(0.9, this.predictionConfig.confidenceThreshold + 0.05);
    } else if (this.metrics.speculativeHitRate < 0.2) {
      this.predictionConfig.confidenceThreshold = Math.max(0.3, this.predictionConfig.confidenceThreshold - 0.05);
    }
  }

  /**
   * Helper methods for predictions
   */
  private extractAvailableTargets(structure: NavigationStructure): string[] {
    const targets: string[] = [];

    structure.landmarks.forEach(landmark => targets.push(landmark.type));
    structure.menuSystems.forEach((menu: any) => {
      menu.items.forEach((item: any) => targets.push(item.text));
    });
    structure.semanticRegions.forEach(region => targets.push(region.role));

    return [...new Set(targets)];
  }

  private findRelevantPatterns(command: string, profile: UserBehaviorProfile): ConversationPattern[] {
    const commandIntent = this.extractIntent(command);

    return profile.navigationPatterns
      .filter(pattern =>
        pattern.intent.includes(commandIntent) ||
        commandIntent.includes(pattern.intent) ||
        pattern.followUpPatterns.includes(commandIntent)
      )
      .sort((a, b) => (b.frequency * b.successRate) - (a.frequency * a.successRate))
      .slice(0, 3);
  }

  private calculatePatternConfidence(pattern: ConversationPattern, _profile: UserBehaviorProfile): number {
    const recencyWeight = Math.max(0.1, 1 - (Date.now() - pattern.lastUsed) / this.predictionConfig.patternMemoryDuration);
    const frequencyWeight = Math.min(1, pattern.frequency / 10);
    const successWeight = pattern.successRate;

    return (recencyWeight * 0.3 + frequencyWeight * 0.4 + successWeight * 0.3);
  }

  private calculateCombinedConfidence(prediction: NavigationPrediction, profile: UserBehaviorProfile): number {
    let confidence = prediction.confidence;

    // Boost confidence based on context factors
    prediction.contextFactors.forEach(factor => {
      if (factor.impact === 'positive') {
        confidence += factor.weight * 0.1;
      } else if (factor.impact === 'negative') {
        confidence -= factor.weight * 0.1;
      }
    });

    // Adjust based on user profile confidence threshold
    if (profile.confidenceThreshold !== 0.6) {
      confidence *= (0.6 / profile.confidenceThreshold);
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private deduplicatePredictions(predictions: NavigationPrediction[]): NavigationPrediction[] {
    const unique = new Map<string, NavigationPrediction>();

    predictions.forEach(prediction => {
      const key = `${prediction.type}:${prediction.target}`;
      const existing = unique.get(key);

      if (!existing || prediction.confidence > existing.confidence) {
        unique.set(key, prediction);
      }
    });

    return Array.from(unique.values());
  }

  private calculateAverageConfidence(predictions: NavigationPrediction[]): number {
    if (predictions.length === 0) {return 0;}
    return predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  }

  private updatePredictionMetrics(matchedPrediction: NavigationPrediction | null, wasAccurate: boolean): void {
    this.metrics.totalPredictions++;

    if (wasAccurate && matchedPrediction) {
      this.metrics.accuracyRate = (this.metrics.accuracyRate * (this.metrics.totalPredictions - 1) + 1) / this.metrics.totalPredictions;
      this.metrics.speculativeHitRate = (this.metrics.speculativeHitRate * (this.metrics.totalPredictions - 1) + 1) / this.metrics.totalPredictions;
    } else if (!wasAccurate && matchedPrediction) {
      this.metrics.falsePositiveRate = (this.metrics.falsePositiveRate * (this.metrics.totalPredictions - 1) + 1) / this.metrics.totalPredictions;
    }
  }

  private calculateMatchScore(prediction: NavigationPrediction, actualCommand: string, actualTarget: string): number {
    const targetMatch = prediction.target.toLowerCase() === actualTarget.toLowerCase() ? 1 : 0;
    const typeMatch = this.mapCommandToType(actualCommand) === prediction.type ? 0.5 : 0;
    const semanticMatch = this.calculateSemanticSimilarity(prediction.target, actualTarget);

    return Math.max(targetMatch, typeMatch + semanticMatch * 0.3);
  }

  private calculateSemanticSimilarity(text1: string, text2: string): number {
    // Simple word overlap similarity
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const word1 of words1) {
      if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
        matches++;
      }
    }

    return matches / Math.max(words1.length, words2.length);
  }

  // Utility helper methods
  private mapIntentToType(intent: string): NavigationPrediction['type'] {
    if (intent.includes('navigate') || intent.includes('go')) {return 'navigation';}
    if (intent.includes('request') || intent.includes('fetch')) {return 'content_request';}
    return 'interaction';
  }

  private mapCommandToType(command: string): NavigationPrediction['type'] {
    const lower = command.toLowerCase();
    if (lower.includes('go to') || lower.includes('navigate')) {return 'navigation';}
    if (lower.includes('get') || lower.includes('fetch')) {return 'content_request';}
    return 'interaction';
  }

  private findBestTarget(pattern: ConversationPattern, structure: NavigationStructure): string {
    // Find the best matching target in the navigation structure
    const availableTargets = this.extractAvailableTargets(structure);
    const intent = pattern.intent.toLowerCase();

    for (const target of availableTargets) {
      if (target.toLowerCase().includes(intent) || intent.includes(target.toLowerCase())) {
        return target;
      }
    }

    return pattern.intent;
  }

  private extractIntent(command: string): string {
    // Simple intent extraction - could be enhanced with NLP
    const lower = command.toLowerCase();
    if (lower.includes('settings')) {return 'settings';}
    if (lower.includes('profile')) {return 'profile';}
    if (lower.includes('menu')) {return 'menu';}
    if (lower.includes('search')) {return 'search';}
    if (lower.includes('help')) {return 'help';}
    return 'general';
  }

  private getResourcePath(target: string): string {
    // Generate resource path for target
    return `/${target.toLowerCase().replace(/\s+/g, '-')}`;
  }

  private extractExternalDomains(_target: string): string[] {
    // Extract external domains that might be needed
    return []; // Would analyze navigation structure for external links
  }

  private getInteractionResource(target: string): string {
    // Generate interaction resource path
    return `/api/interactions/${target.toLowerCase()}`;
  }

  private getAPIEndpoint(target: string): string {
    // Generate API endpoint for content requests
    return `/api/content/${target.toLowerCase()}`;
  }

  private loadGlobalPatterns(): void {
    // Load global navigation patterns from storage/cache
    // This would be implemented with persistent storage
  }

  private updatePatternsFromResult(
    command: string,
    target: string,
    sessionId: string,
    _matchedPrediction: NavigationPrediction | null
  ): void {
    const profile = this.getUserProfile(sessionId);
    const intent = this.extractIntent(command);

    // Update global patterns
    let globalPattern = this.globalPatterns.get(intent);
    if (!globalPattern) {
      globalPattern = {
        intent,
        frequency: 0,
        lastUsed: Date.now(),
        successRate: 1.0,
        followUpPatterns: [],
        contextTriggers: [],
      };
      this.globalPatterns.set(intent, globalPattern);
    }

    globalPattern.frequency++;
    globalPattern.lastUsed = Date.now();

    // Update preferred targets
    const currentCount = profile.preferredTargets.get(target) || 0;
    profile.preferredTargets.set(target, currentCount + 1);
  }

  private generatePredictionId(type: string): string {
    return `pred_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get prediction metrics
   */
  getMetrics(): PredictionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active predictions count
   */
  getActivePredictionsCount(): number {
    return this.activePredictions.size;
  }

  /**
   * Clear all active predictions
   */
  clearActivePredictions(): void {
    this.activePredictions.clear();
    logger.debug('All active predictions cleared');
  }

  /**
   * Update prediction configuration
   */
  updateConfig(config: Partial<typeof this.predictionConfig>): void {
    this.predictionConfig = { ...this.predictionConfig, ...config };
    logger.info('Prediction configuration updated', { config: this.predictionConfig });
  }
}

// Export singleton instance
export const speculativeNavigationPredictor = new SpeculativeNavigationPredictor();