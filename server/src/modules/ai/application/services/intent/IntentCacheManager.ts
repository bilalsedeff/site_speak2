/**
 * Intent Cache Manager - Pattern learning and performance optimization
 *
 * Features:
 * - Intelligent caching with context-aware keys
 * - User-specific pattern learning and adaptation
 * - Performance optimization for <50ms cache hits
 * - Pattern recognition for common intent sequences
 * - Adaptive confidence threshold adjustments
 * - Cache invalidation strategies
 * - Memory-efficient storage with LRU eviction
 */

import { createLogger, getErrorMessage } from '../../../../../shared/utils';
import type {
  IntentCategory,
  IntentClassificationResult,
  IntentCacheEntry,
  ContextualIntentAnalysis,
  UserLearningProfile,
  IntentProcessingRequest,
} from './types.js';

const logger = createLogger({ service: 'intent-cache-manager' });

export interface CacheConfig {
  enabled: boolean;
  maxEntries: number;
  defaultTtl: number;
  keyStrategy: 'text_only' | 'text_context' | 'full_context';
  enableLearning: boolean;
  enablePatternRecognition: boolean;
  enableAdaptiveThresholds: boolean;
  learningDecayFactor: number;
  patternMinOccurrences: number;
  memoryLimitMb: number;
}

export interface CachePattern {
  pattern: string;
  intent: IntentCategory;
  confidence: number;
  occurrences: number;
  lastSeen: Date;
  contexts: string[];
  userIds: string[];
  successRate: number;
}

export interface UserPattern {
  userId: string;
  commonPhrases: Map<string, IntentCategory>;
  intentSequences: Array<{
    sequence: IntentCategory[];
    frequency: number;
    lastUsed: Date;
  }>;
  adaptiveThresholds: Map<IntentCategory, number>;
  preferredResolutions: Map<string, string>;
  lastUpdated: Date;
}

/**
 * Advanced Intent Cache Manager with Learning
 */
export class IntentCacheManager {
  private config: CacheConfig;
  private cache = new Map<string, IntentCacheEntry>();
  private patterns = new Map<string, CachePattern>();
  private userPatterns = new Map<string, UserPattern>();
  private accessHistory = new Map<string, Date[]>();
  private memoryUsage = 0;
  private performanceMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    patternMatches: 0,
    adaptations: 0,
    evictions: 0,
    averageHitTime: 0,
  };

  constructor(config: CacheConfig) {
    this.config = config;

    if (config.enabled) {
      this.startMaintenanceTimer();
    }

    logger.info('IntentCacheManager initialized', {
      enabled: config.enabled,
      maxEntries: config.maxEntries,
      keyStrategy: config.keyStrategy,
      learningEnabled: config.enableLearning,
      patternRecognition: config.enablePatternRecognition,
    });
  }

  /**
   * Get cached intent classification if available
   */
  async getCachedIntent(request: IntentProcessingRequest): Promise<IntentClassificationResult | null> {
    if (!this.config.enabled) {
      return null;
    }

    const startTime = performance.now();
    this.performanceMetrics.totalRequests++;

    try {
      // Generate cache key based on strategy
      const cacheKey = this.generateCacheKey(request);

      // Check direct cache hit
      const cached = this.cache.get(cacheKey);
      if (cached && this.isValidCacheEntry(cached)) {
        this.recordCacheHit(cacheKey, startTime);

        const result: IntentClassificationResult = {
          intent: cached.intent,
          confidence: cached.confidence,
          parameters: cached.parameters || {},
          reasoning: 'Retrieved from cache with high confidence',
          source: 'cache',
          processingTime: performance.now() - startTime,
          modelUsed: 'cache',
        };

        logger.debug('Cache hit', {
          cacheKey: cacheKey.slice(0, 50),
          intent: cached.intent,
          confidence: cached.confidence,
          hitCount: cached.hitCount,
        });

        return result;
      }

      // Check pattern matching if enabled
      if (this.config.enablePatternRecognition) {
        const patternMatch = await this.findPatternMatch(request);
        if (patternMatch) {
          this.performanceMetrics.patternMatches++;

          const result: IntentClassificationResult = {
            intent: patternMatch.intent,
            confidence: Math.min(0.85, patternMatch.confidence), // Cap pattern confidence
            parameters: {},
            reasoning: `Matched learned pattern: ${patternMatch.pattern}`,
            source: 'cache',
            processingTime: performance.now() - startTime,
            modelUsed: 'pattern',
          };

          // Cache this pattern match for faster future access
          this.cacheIntent(request, result, 'pattern_match');

          logger.debug('Pattern match', {
            pattern: patternMatch.pattern,
            intent: patternMatch.intent,
            confidence: patternMatch.confidence,
            occurrences: patternMatch.occurrences,
          });

          return result;
        }
      }

      // Check user-specific patterns
      if (this.config.enableLearning && request.metadata?.userId) {
        const userMatch = this.findUserPattern(request);
        if (userMatch) {
          const result: IntentClassificationResult = {
            intent: userMatch.intent,
            confidence: Math.min(0.80, userMatch.confidence), // Cap user pattern confidence
            parameters: {},
            reasoning: 'Matched user learning pattern',
            source: 'cache',
            processingTime: performance.now() - startTime,
            modelUsed: 'user_pattern',
          };

          logger.debug('User pattern match', {
            userId: request.metadata.userId,
            intent: userMatch.intent,
            confidence: userMatch.confidence,
          });

          return result;
        }
      }

      this.performanceMetrics.cacheMisses++;
      return null;

    } catch (error) {
      logger.error('Cache lookup failed', {
        error: getErrorMessage(error),
        text: request.text.slice(0, 100),
      });
      this.performanceMetrics.cacheMisses++;
      return null;
    }
  }

  /**
   * Cache intent classification result with learning
   */
  async cacheIntent(
    request: IntentProcessingRequest,
    result: IntentClassificationResult,
    source: 'classification' | 'validation' | 'pattern_match' = 'classification'
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(request);
      const now = new Date();

      // Create or update cache entry
      const existing = this.cache.get(cacheKey);
      const entry: IntentCacheEntry = {
        key: cacheKey,
        intent: result.intent,
        confidence: result.confidence,
        parameters: result.parameters,
        context: this.extractCacheableContext(request.context),
        hitCount: existing ? existing.hitCount + 1 : 1,
        lastUsed: now,
        success: result.confidence >= 0.7, // Consider successful if confidence is decent
        averageConfidence: existing ?
          (existing.averageConfidence * existing.hitCount + result.confidence) / (existing.hitCount + 1) :
          result.confidence,
        expiresAt: new Date(now.getTime() + this.config.defaultTtl),
      };

      this.cache.set(cacheKey, entry);
      this.updateMemoryUsage();

      // Learn patterns if enabled
      if (this.config.enablePatternRecognition) {
        await this.learnPattern(request, result);
      }

      // Update user patterns if enabled
      if (this.config.enableLearning && request.metadata?.userId) {
        this.updateUserPattern(request.metadata.userId, request, result);
      }

      // Trigger eviction if needed
      if (this.cache.size > this.config.maxEntries || this.memoryUsage > this.config.memoryLimitMb) {
        this.evictOldEntries();
      }

      logger.debug('Intent cached', {
        cacheKey: cacheKey.slice(0, 50),
        intent: result.intent,
        confidence: result.confidence,
        source,
        cacheSize: this.cache.size,
      });

    } catch (error) {
      logger.error('Failed to cache intent', {
        error: getErrorMessage(error),
        intent: result.intent,
      });
    }
  }

  /**
   * Learn from user feedback to improve cache accuracy
   */
  async learnFromFeedback(
    request: IntentProcessingRequest,
    actualIntent: IntentCategory,
    wasCorrect: boolean,
    userFeedback?: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    if (!this.config.enableLearning) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(request);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        // Update cache entry based on feedback
        if (wasCorrect) {
          cached.success = true;
          cached.confidence = Math.min(1.0, cached.confidence + 0.1);
        } else {
          cached.success = false;
          cached.confidence = Math.max(0.1, cached.confidence - 0.2);

          // If feedback indicates different intent, update the cache
          if (actualIntent !== cached.intent) {
            cached.intent = actualIntent;
            cached.confidence = 0.6; // Start with moderate confidence
          }
        }

        this.cache.set(cacheKey, cached);
      }

      // Update patterns based on feedback
      if (this.config.enablePatternRecognition) {
        await this.updatePatternFromFeedback(request, actualIntent, wasCorrect);
      }

      // Update user patterns
      if (request.metadata?.userId) {
        this.updateUserPatternFromFeedback(
          request.metadata.userId,
          request,
          actualIntent,
          wasCorrect,
          userFeedback
        );
      }

      this.performanceMetrics.adaptations++;

      logger.debug('Learned from feedback', {
        cacheKey: cacheKey.slice(0, 50),
        actualIntent,
        wasCorrect,
        userFeedback,
      });

    } catch (error) {
      logger.error('Failed to learn from feedback', {
        error: getErrorMessage(error),
        actualIntent,
        wasCorrect,
      });
    }
  }

  /**
   * Get user learning profile
   */
  getUserLearningProfile(userId: string): UserLearningProfile | undefined {
    const userPattern = this.userPatterns.get(userId);
    if (!userPattern) {
      return undefined;
    }

    return {
      preferredIntents: this.mapToRecord(userPattern.commonPhrases),
      commonPatterns: Array.from(userPattern.commonPhrases.keys()),
      frequentlyUsedCommands: this.getFrequentCommands(userPattern),
      errorPatterns: [], // Would track common error patterns
      adaptiveThresholds: this.mapToRecord(userPattern.adaptiveThresholds),
      lastUpdated: userPattern.lastUpdated,
    };
  }

  /**
   * Predict next likely intent based on sequence patterns
   */
  predictNextIntent(
    userId: string,
    recentIntents: IntentCategory[],
    context: ContextualIntentAnalysis
  ): { intent: IntentCategory; confidence: number } | null {
    if (!this.config.enableLearning || !userId) {
      return null;
    }

    const userPattern = this.userPatterns.get(userId);
    if (!userPattern) {
      return null;
    }

    // Find matching sequences
    const sequenceMatches = userPattern.intentSequences.filter(seq => {
      const seqStart = seq.sequence.slice(0, recentIntents.length);
      return seqStart.length === recentIntents.length &&
        seqStart.every((intent, i) => intent === recentIntents[i]);
    });

    if (sequenceMatches.length === 0) {
      return null;
    }

    // Find most frequent next intent
    const nextIntents = new Map<IntentCategory, number>();
    for (const match of sequenceMatches) {
      if (match.sequence.length > recentIntents.length) {
        const nextIntent = match.sequence[recentIntents.length]!;
        const frequency = nextIntents.get(nextIntent) || 0;
        nextIntents.set(nextIntent, frequency + match.frequency);
      }
    }

    if (nextIntents.size === 0) {
      return null;
    }

    const [predictedIntent, frequency] = Array.from(nextIntents.entries())
      .sort((a, b) => b[1] - a[1])[0]!;

    const confidence = Math.min(0.7, frequency / 10); // Cap prediction confidence

    logger.debug('Intent prediction', {
      userId,
      recentIntents,
      predictedIntent,
      confidence,
      frequency,
    });

    return { intent: predictedIntent, confidence };
  }

  /**
   * Generate cache key based on strategy
   */
  private generateCacheKey(request: IntentProcessingRequest): string {
    const normalizedText = this.normalizeText(request.text);

    switch (this.config.keyStrategy) {
      case 'text_only':
        return `text:${normalizedText}`;

      case 'text_context':
        { const contextKey = `${request.context.pageContext.pageType}_${request.context.pageContext.currentMode}`;
        return `text_ctx:${normalizedText}:${contextKey}`; }

      case 'full_context':
        { const fullContext = [
          request.context.pageContext.pageType,
          request.context.pageContext.contentType,
          request.context.pageContext.currentMode,
          request.context.userContext.role,
          request.context.pageContext.capabilities.slice(0, 3).join(','),
        ].join('_');
        return `full:${normalizedText}:${fullContext}`; }

      default:
        return `text:${normalizedText}`;
    }
  }

  /**
   * Normalize text for consistent caching
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .slice(0, 200); // Limit length
  }

  /**
   * Check if cache entry is still valid
   */
  private isValidCacheEntry(entry: IntentCacheEntry): boolean {
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      return false;
    }

    // Entries with low success rate should expire faster
    if (entry.averageConfidence < 0.5 && entry.hitCount > 3) {
      return false;
    }

    return true;
  }

  /**
   * Extract cacheable context to avoid storing too much data
   */
  private extractCacheableContext(context: ContextualIntentAnalysis): Partial<ContextualIntentAnalysis> {
    return {
      pageContext: {
        pageType: context.pageContext.pageType,
        contentType: context.pageContext.contentType,
        currentMode: context.pageContext.currentMode,
        capabilities: context.pageContext.capabilities.slice(0, 5), // Limit capabilities
        url: '', // Don't cache full URL for privacy
        domain: '',
        availableElements: [], // Don't cache elements
      },
      sessionContext: {
        sessionId: '',
        tenantId: context.sessionContext.tenantId,
        siteId: context.sessionContext.siteId,
        startTime: new Date(),
        previousIntents: [], // Don't cache full history
        conversationState: {
          entities: {},
          context: {},
          pendingActions: [],
        },
      },
      userContext: {
        role: context.userContext.role,
        permissions: [], // Don't cache permissions
        previousSessions: [],
      },
    };
  }

  /**
   * Learn patterns from successful classifications
   */
  private async learnPattern(
    request: IntentProcessingRequest,
    result: IntentClassificationResult
  ): Promise<void> {
    if (result.confidence < 0.7) {
      return; // Only learn from high-confidence results
    }

    const normalizedText = this.normalizeText(request.text);
    const patternKey = this.generatePatternKey(normalizedText, result.intent);

    const existing = this.patterns.get(patternKey);
    const now = new Date();

    const pattern: CachePattern = {
      pattern: normalizedText,
      intent: result.intent,
      confidence: existing ?
        (existing.confidence * existing.occurrences + result.confidence) / (existing.occurrences + 1) :
        result.confidence,
      occurrences: existing ? existing.occurrences + 1 : 1,
      lastSeen: now,
      contexts: this.updateContextList(
        existing?.contexts || [],
        request.context.pageContext.pageType
      ),
      userIds: this.updateUserIdList(
        existing?.userIds || [],
        request.metadata?.userId
      ),
      successRate: existing ? existing.successRate : 1.0,
    };

    this.patterns.set(patternKey, pattern);

    // Only keep patterns that occur multiple times
    if (pattern.occurrences >= this.config.patternMinOccurrences) {
      logger.debug('Pattern learned', {
        pattern: normalizedText.slice(0, 50),
        intent: result.intent,
        occurrences: pattern.occurrences,
        confidence: pattern.confidence,
      });
    }
  }

  /**
   * Find pattern match for request
   */
  private async findPatternMatch(request: IntentProcessingRequest): Promise<CachePattern | null> {
    const normalizedText = this.normalizeText(request.text);

    // Exact pattern match
    for (const [key, pattern] of this.patterns.entries()) {
      if (pattern.pattern === normalizedText &&
          pattern.occurrences >= this.config.patternMinOccurrences &&
          pattern.confidence >= 0.6) {

        // Update pattern usage
        pattern.lastSeen = new Date();
        this.patterns.set(key, pattern);

        return pattern;
      }
    }

    // Fuzzy pattern matching for similar phrases
    const threshold = 0.8;
    for (const [key, pattern] of this.patterns.entries()) {
      if (pattern.occurrences >= this.config.patternMinOccurrences) {
        const similarity = this.calculateTextSimilarity(normalizedText, pattern.pattern);
        if (similarity >= threshold) {
          // Reduce confidence for fuzzy matches
          return {
            ...pattern,
            confidence: pattern.confidence * similarity,
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate text similarity (simple implementation)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');

    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);

    return commonWords.length / totalWords;
  }

  /**
   * Update user patterns
   */
  private updateUserPattern(
    userId: string,
    request: IntentProcessingRequest,
    result: IntentClassificationResult
  ): void {
    if (result.confidence < 0.6) {
      return; // Only learn from decent confidence results
    }

    const normalizedText = this.normalizeText(request.text);
    let userPattern = this.userPatterns.get(userId);

    if (!userPattern) {
      userPattern = {
        userId,
        commonPhrases: new Map(),
        intentSequences: [],
        adaptiveThresholds: new Map(),
        preferredResolutions: new Map(),
        lastUpdated: new Date(),
      };
    }

    // Update common phrases
    userPattern.commonPhrases.set(normalizedText, result.intent);

    // Update adaptive thresholds
    const currentThreshold = userPattern.adaptiveThresholds.get(result.intent) || 0.7;
    const adjustment = result.confidence > 0.8 ? 0.02 : -0.01;
    userPattern.adaptiveThresholds.set(
      result.intent,
      Math.max(0.3, Math.min(0.9, currentThreshold + adjustment))
    );

    userPattern.lastUpdated = new Date();
    this.userPatterns.set(userId, userPattern);
  }

  /**
   * Find user-specific pattern
   */
  private findUserPattern(request: IntentProcessingRequest): { intent: IntentCategory; confidence: number } | null {
    const userId = request.metadata?.userId;
    if (!userId) {
      return null;
    }

    const userPattern = this.userPatterns.get(userId);
    if (!userPattern) {
      return null;
    }

    const normalizedText = this.normalizeText(request.text);

    // Check exact phrase match
    const exactMatch = userPattern.commonPhrases.get(normalizedText);
    if (exactMatch) {
      return { intent: exactMatch, confidence: 0.8 };
    }

    // Check similar phrases
    for (const [phrase, intent] of userPattern.commonPhrases.entries()) {
      const similarity = this.calculateTextSimilarity(normalizedText, phrase);
      if (similarity >= 0.85) {
        return { intent, confidence: 0.7 * similarity };
      }
    }

    return null;
  }

  /**
   * Record cache hit metrics
   */
  private recordCacheHit(cacheKey: string, startTime: number): void {
    this.performanceMetrics.cacheHits++;

    const hitTime = performance.now() - startTime;
    this.performanceMetrics.averageHitTime =
      (this.performanceMetrics.averageHitTime * (this.performanceMetrics.cacheHits - 1) + hitTime) /
      this.performanceMetrics.cacheHits;

    // Update cache entry hit count
    const entry = this.cache.get(cacheKey);
    if (entry) {
      entry.hitCount++;
      entry.lastUsed = new Date();
      this.cache.set(cacheKey, entry);
    }

    // Record access for LRU tracking
    const accesses = this.accessHistory.get(cacheKey) || [];
    accesses.push(new Date());
    this.accessHistory.set(cacheKey, accesses.slice(-10)); // Keep last 10 accesses
  }

  /**
   * Evict old entries when cache is full
   */
  private evictOldEntries(): void {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        entry,
        score: this.calculateEvictionScore(entry),
      }))
      .sort((a, b) => a.score - b.score); // Lower score = more likely to evict

    const targetSize = Math.floor(this.config.maxEntries * 0.8); // Reduce to 80% capacity
    const toEvict = entries.slice(0, Math.max(0, this.cache.size - targetSize));

    for (const { key } of toEvict) {
      this.cache.delete(key);
      this.accessHistory.delete(key);
      this.performanceMetrics.evictions++;
    }

    this.updateMemoryUsage();

    if (toEvict.length > 0) {
      logger.debug('Evicted cache entries', {
        evicted: toEvict.length,
        cacheSize: this.cache.size,
        memoryUsage: this.memoryUsage,
      });
    }
  }

  /**
   * Calculate eviction score (lower = more likely to evict)
   */
  private calculateEvictionScore(entry: IntentCacheEntry): number {
    const now = Date.now();
    const ageMs = now - entry.lastUsed.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Factors that increase eviction likelihood (lower score)
    let score = 100;

    // Age factor (older = lower score)
    score -= Math.min(50, ageDays * 10);

    // Hit count factor (more hits = higher score)
    score += Math.min(30, entry.hitCount * 2);

    // Success rate factor (more successful = higher score)
    score += entry.success ? 20 : -20;

    // Confidence factor (higher confidence = higher score)
    score += entry.averageConfidence * 20;

    return Math.max(0, score);
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    // Rough estimate: 1KB per cache entry
    this.memoryUsage = this.cache.size / 1024;
  }

  /**
   * Helper methods
   */
  private generatePatternKey(text: string, intent: IntentCategory): string {
    return `pattern:${text}:${intent}`;
  }

  private updateContextList(contexts: string[], newContext: string): string[] {
    if (!contexts.includes(newContext)) {
      contexts.push(newContext);
    }
    return contexts.slice(-5); // Keep last 5 contexts
  }

  private updateUserIdList(userIds: string[], userId?: string): string[] {
    if (userId && !userIds.includes(userId)) {
      userIds.push(userId);
    }
    return userIds.slice(-10); // Keep last 10 users
  }

  private mapToRecord<K extends string, V>(map: Map<K, V>): Record<K, V> {
    const record = {} as Record<K, V>;
    for (const [key, value] of map.entries()) {
      record[key] = value;
    }
    return record;
  }

  private getFrequentCommands(userPattern: UserPattern): string[] {
    return Array.from(userPattern.commonPhrases.keys()).slice(0, 10);
  }

  private updatePatternFromFeedback(
    request: IntentProcessingRequest,
    actualIntent: IntentCategory,
    wasCorrect: boolean
  ): void {
    // Implementation for updating patterns based on feedback
    const normalizedText = this.normalizeText(request.text);
    const patternKey = this.generatePatternKey(normalizedText, actualIntent);

    if (wasCorrect) {
      const pattern = this.patterns.get(patternKey);
      if (pattern) {
        pattern.successRate = Math.min(1.0, pattern.successRate + 0.05);
        pattern.confidence = Math.min(1.0, pattern.confidence + 0.02);
        this.patterns.set(patternKey, pattern);
      }
    } else {
      // Reduce confidence for incorrect patterns
      for (const [key, pattern] of this.patterns.entries()) {
        if (pattern.pattern === normalizedText && pattern.intent !== actualIntent) {
          pattern.successRate = Math.max(0.0, pattern.successRate - 0.1);
          pattern.confidence = Math.max(0.1, pattern.confidence - 0.05);
          this.patterns.set(key, pattern);
        }
      }
    }
  }

  private updateUserPatternFromFeedback(
    userId: string,
    request: IntentProcessingRequest,
    actualIntent: IntentCategory,
    wasCorrect: boolean,
    userFeedback?: 'positive' | 'negative' | 'neutral'
  ): void {
    const userPattern = this.userPatterns.get(userId);
    if (!userPattern) {
      return;
    }

    const normalizedText = this.normalizeText(request.text);

    if (wasCorrect) {
      // Reinforce correct patterns
      userPattern.commonPhrases.set(normalizedText, actualIntent);
    } else {
      // Update or remove incorrect patterns
      const existingIntent = userPattern.commonPhrases.get(normalizedText);
      if (existingIntent && existingIntent !== actualIntent) {
        userPattern.commonPhrases.set(normalizedText, actualIntent);
      }
    }

    userPattern.lastUpdated = new Date();
    this.userPatterns.set(userId, userPattern);
  }

  /**
   * Start maintenance timer for periodic cleanup
   */
  private startMaintenanceTimer(): void {
    setInterval(() => {
      this.performMaintenance();
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Perform periodic maintenance
   */
  private performMaintenance(): void {
    const now = new Date();
    let expiredCount = 0;
    let patternCleanupCount = 0;

    // Clean expired cache entries
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidCacheEntry(entry)) {
        this.cache.delete(key);
        this.accessHistory.delete(key);
        expiredCount++;
      }
    }

    // Clean old patterns with low success rates
    for (const [key, pattern] of this.patterns.entries()) {
      const ageMs = now.getTime() - pattern.lastSeen.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      if ((pattern.successRate < 0.3 && ageDays > 7) ||
          (pattern.occurrences < this.config.patternMinOccurrences && ageDays > 3)) {
        this.patterns.delete(key);
        patternCleanupCount++;
      }
    }

    this.updateMemoryUsage();

    if (expiredCount > 0 || patternCleanupCount > 0) {
      logger.debug('Cache maintenance completed', {
        expiredEntries: expiredCount,
        cleanedPatterns: patternCleanupCount,
        cacheSize: this.cache.size,
        patternCount: this.patterns.size,
        memoryUsage: this.memoryUsage,
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStatistics(): {
    cacheSize: number;
    hitRate: number;
    patterns: number;
    userPatterns: number;
    memoryUsage: number;
    metrics: {
      totalRequests: number;
      cacheHits: number;
      cacheMisses: number;
      patternMatches: number;
      adaptations: number;
      evictions: number;
      averageHitTime: number;
    };
  } {
    const hitRate = this.performanceMetrics.totalRequests > 0 ?
      this.performanceMetrics.cacheHits / this.performanceMetrics.totalRequests : 0;

    return {
      cacheSize: this.cache.size,
      hitRate,
      patterns: this.patterns.size,
      userPatterns: this.userPatterns.size,
      memoryUsage: this.memoryUsage,
      metrics: { ...this.performanceMetrics },
    };
  }

  /**
   * Clear all cache data
   */
  clearCache(): void {
    this.cache.clear();
    this.patterns.clear();
    this.userPatterns.clear();
    this.accessHistory.clear();
    this.memoryUsage = 0;

    logger.info('Cache cleared');
  }

  /**
   * Clear cache for specific user
   */
  clearUserCache(userId: string): void {
    this.userPatterns.delete(userId);

    // Remove user-specific cache entries
    for (const [key, entry] of this.cache.entries()) {
      if (entry.context.sessionContext?.userId === userId) {
        this.cache.delete(key);
        this.accessHistory.delete(key);
      }
    }

    this.updateMemoryUsage();
    logger.debug('User cache cleared', { userId });
  }

  /**
   * Export cache data for analysis
   */
  exportCacheData(): {
    cache: IntentCacheEntry[];
    patterns: CachePattern[];
    userPatterns: UserPattern[];
  } {
    return {
      cache: Array.from(this.cache.values()),
      patterns: Array.from(this.patterns.values()),
      userPatterns: Array.from(this.userPatterns.values()),
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.clearCache();

    logger.info('IntentCacheManager cleanup completed', {
      totalRequests: this.performanceMetrics.totalRequests,
      hitRate: this.performanceMetrics.totalRequests > 0 ?
        this.performanceMetrics.cacheHits / this.performanceMetrics.totalRequests : 0,
      adaptations: this.performanceMetrics.adaptations,
      evictions: this.performanceMetrics.evictions,
    });
  }
}