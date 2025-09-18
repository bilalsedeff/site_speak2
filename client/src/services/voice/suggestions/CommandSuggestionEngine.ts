/**
 * Command Suggestion Engine
 *
 * AI-powered contextual command generation service that creates intelligent
 * suggestions based on page context, user behavior, and available actions.
 * Integrates with OpenAI for natural language understanding and generation.
 *
 * Features:
 * - Real-time AI-powered suggestion generation
 * - Context-aware filtering and ranking
 * - User behavior learning and adaptation
 * - Multi-modal suggestion types (voice, visual, help)
 * - Universal compatibility with any website structure
 * - <100ms suggestion generation target
 */

import {
  CommandSuggestion,
  SuggestionContext,
  SuggestionRequest,
  SuggestionResponse,
  SuggestionCategory,
  PageAnalysisResult,
  UserSuggestionProfile,
  AISuggestionConfig
} from '@shared/types/suggestion.types';
import { IntentCategory } from '@shared/types/intent.types';
import { contextDiscoveryService } from './ContextDiscoveryService';

interface OpenAIResponse {
  suggestions: Array<{
    command: string;
    intent: string;
    confidence: number;
    category: string;
    description: string;
    examples: string[];
    reasoning: string;
  }>;
}

export class CommandSuggestionEngine {
  private apiKey: string;
  private config: AISuggestionConfig;
  private suggestionCache = new Map<string, { suggestions: CommandSuggestion[]; timestamp: number }>();
  private userProfiles = new Map<string, UserSuggestionProfile>();
  private requestId = 0;

  constructor(apiKey: string, config: Partial<AISuggestionConfig> = {}) {
    this.apiKey = apiKey;
    this.config = {
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 5000,
      fallbackModel: 'gpt-3.5-turbo',
      enableContextBoost: true,
      enableSemanticSearch: true,
      confidenceThreshold: 0.6,
      ...config
    };
  }

  /**
   * Generate contextual command suggestions
   */
  async generateSuggestions(request: SuggestionRequest): Promise<SuggestionResponse> {
    const startTime = performance.now();
    const requestId = `req_${++this.requestId}_${Date.now()}`;

    try {
      // Check cache first
      if (request.options?.useCache !== false) {
        const cached = this.getCachedSuggestions(request);
        if (cached) {
          return {
            suggestions: cached,
            metadata: {
              requestId,
              processingTime: performance.now() - startTime,
              cacheHit: true,
              confidence: 0.9,
              contextAnalysisTime: 0,
              suggestionGenerationTime: 0
            },
            fallbackUsed: false
          };
        }
      }

      // Analyze current page context
      const contextStartTime = performance.now();
      const pageAnalysis = await contextDiscoveryService.analyzePage();
      const contextAnalysisTime = performance.now() - contextStartTime;

      // Enhance context with user profile
      const enhancedContext = await this.enhanceContext(request.context, request.userProfile);

      // Generate AI suggestions
      const suggestionStartTime = performance.now();
      const aiSuggestions = await this.generateAISuggestions(
        enhancedContext,
        pageAnalysis,
        request
      );
      const suggestionGenerationTime = performance.now() - suggestionStartTime;

      // Apply contextual filtering and ranking
      const filteredSuggestions = this.filterAndRankSuggestions(
        aiSuggestions,
        enhancedContext,
        request
      );

      // Apply user learning and personalization
      const personalizedSuggestions = this.applyPersonalization(
        filteredSuggestions,
        request.userProfile
      );

      // Cache successful results
      if (request.options?.useCache !== false) {
        this.cacheSuggestions(request, personalizedSuggestions);
      }

      const totalTime = performance.now() - startTime;

      return {
        suggestions: personalizedSuggestions.slice(0, request.maxSuggestions || 5),
        metadata: {
          requestId,
          processingTime: totalTime,
          cacheHit: false,
          modelUsed: this.config.model,
          confidence: this.calculateOverallConfidence(personalizedSuggestions),
          contextAnalysisTime,
          suggestionGenerationTime
        },
        fallbackUsed: false
      };

    } catch (error) {
      console.warn('Suggestion generation failed, using fallback:', error);
      return this.generateFallbackSuggestions(request, requestId, startTime);
    }
  }

  /**
   * Generate proactive suggestions based on context
   */
  async generateProactiveSuggestions(
    context: SuggestionContext,
    userProfile?: UserSuggestionProfile
  ): Promise<CommandSuggestion[]> {
    try {
      const request: SuggestionRequest = {
        context,
        maxSuggestions: 3,
        categories: ['discovery', 'help', 'navigation'],
        ...(userProfile && { userProfile }),
        options: { useCache: true }
      };

      const response = await this.generateSuggestions(request);
      return response.suggestions.filter(s => s.priority === 'high');
    } catch (error) {
      console.warn('Proactive suggestions failed:', error);
      return this.getDefaultProactiveSuggestions(context);
    }
  }

  /**
   * Learn from user feedback to improve suggestions
   */
  async learnFromFeedback(
    originalSuggestion: CommandSuggestion,
    wasUsed: boolean,
    feedback: 'positive' | 'negative' | 'neutral',
    userId?: string
  ): Promise<void> {
    if (!userId) {return;}

    const profile = this.userProfiles.get(userId) || this.createEmptyProfile(userId);

    // Update command frequency
    if (wasUsed) {
      const existing = profile.frequentPatterns.find(p => p.pattern === originalSuggestion.command);
      if (existing) {
        existing.frequency++;
        existing.lastUsed = new Date();
        if (feedback === 'positive') {
          existing.successRate = Math.min(1, existing.successRate + 0.1);
        }
      } else {
        profile.frequentPatterns.push({
          pattern: originalSuggestion.command,
          frequency: 1,
          contexts: [originalSuggestion.context.pageType],
          successRate: feedback === 'positive' ? 0.8 : 0.5,
          avgConfidence: originalSuggestion.confidence,
          lastUsed: new Date()
        });
      }
    }

    // Update preferred commands
    if (feedback === 'positive') {
      profile.preferredCommands.push(originalSuggestion.command);
      // Keep only top 20 preferred commands
      profile.preferredCommands = profile.preferredCommands.slice(-20);
    }

    // Store learning data
    profile.learningData.commandHistory.push({
      command: originalSuggestion.command,
      intent: originalSuggestion.intent,
      context: originalSuggestion.context.pageType,
      success: wasUsed && feedback !== 'negative',
      confidence: originalSuggestion.confidence,
      timestamp: new Date(),
      executionTime: 0,
      feedback
    });

    // Update adaptive thresholds
    this.updateAdaptiveThresholds(profile, originalSuggestion, feedback);

    this.userProfiles.set(userId, profile);
  }

  /**
   * Get suggestions for "What can I do here?" queries
   */
  async getDiscoverySuggestions(context: SuggestionContext): Promise<CommandSuggestion[]> {
    const pageAnalysis = await contextDiscoveryService.analyzePage();

    const suggestions: CommandSuggestion[] = [];

    // Add navigation suggestions
    if (pageAnalysis.structure.navigation.length > 0) {
      suggestions.push({
        id: 'discovery-navigation',
        command: 'Navigate around the site',
        intent: 'navigate_to_section',
        confidence: 0.9,
        priority: 'high',
        context,
        category: 'discovery',
        description: 'Explore different sections of the website',
        examples: [
          'Go to products',
          'Navigate to contact page',
          'Open the menu'
        ],
        keywords: ['navigate', 'go to', 'open', 'explore'],
        variations: ['Explore the site', 'Browse sections', 'Look around'],
        reasoning: 'Navigation options detected on page',
        metadata: {
          frequency: 0,
          successRate: 0.8,
          avgExecutionTime: 1000,
          isLearned: false,
          source: 'ai'
        }
      });
    }

    // Add interaction suggestions
    if (pageAnalysis.elements.length > 0) {
      const interactiveElements = pageAnalysis.elements.filter(e => e.isInteractable);
      if (interactiveElements.length > 0) {
        suggestions.push({
          id: 'discovery-interaction',
          command: 'Interact with elements',
          intent: 'click_element',
          confidence: 0.8,
          priority: 'medium',
          context,
          category: 'discovery',
          description: 'Click buttons, fill forms, and interact with page elements',
          examples: [
            'Click the submit button',
            'Fill the contact form',
            'Select an option'
          ],
          keywords: ['click', 'fill', 'select', 'press'],
          variations: ['Use page controls', 'Interact with buttons'],
          reasoning: `${interactiveElements.length} interactive elements found`,
          metadata: {
            frequency: 0,
            successRate: 0.7,
            avgExecutionTime: 800,
            isLearned: false,
            source: 'ai'
          }
        });
      }
    }

    // Add search suggestions if available
    if (pageAnalysis.capabilities.includes('search')) {
      suggestions.push({
        id: 'discovery-search',
        command: 'Search for information',
        intent: 'search_content',
        confidence: 0.8,
        priority: 'medium',
        context,
        category: 'discovery',
        description: 'Search for products, content, or information',
        examples: [
          'Search for products',
          'Find information about',
          'Look for specific content'
        ],
        keywords: ['search', 'find', 'look for'],
        variations: ['Find content', 'Search the site'],
        reasoning: 'Search functionality detected',
        metadata: {
          frequency: 0,
          successRate: 0.8,
          avgExecutionTime: 1200,
          isLearned: false,
          source: 'ai'
        }
      });
    }

    // Add help suggestion
    suggestions.push({
      id: 'discovery-help',
      command: 'Get help using the site',
      intent: 'help_request',
      confidence: 0.9,
      priority: 'low',
      context,
      category: 'help',
      description: 'Learn how to use voice commands and get assistance',
      examples: [
        'How do I use voice commands?',
        'What can I say?',
        'Help me navigate'
      ],
      keywords: ['help', 'how to', 'assistance'],
      variations: ['Get assistance', 'Learn commands'],
      reasoning: 'Help is always available',
      metadata: {
        frequency: 0,
        successRate: 0.9,
        avgExecutionTime: 500,
        isLearned: false,
        source: 'template'
      }
    });

    return suggestions;
  }

  // ======================= PRIVATE METHODS =======================

  private async generateAISuggestions(
    context: SuggestionContext,
    pageAnalysis: PageAnalysisResult,
    request: SuggestionRequest
  ): Promise<CommandSuggestion[]> {
    const prompt = this.buildPrompt(context, pageAnalysis, request);

    try {
      const response = await this.callOpenAI(prompt);
      return this.parseAIResponse(response, context);
    } catch (error) {
      // Try fallback model if main model fails
      if (this.config.fallbackModel && this.config.fallbackModel !== this.config.model) {
        try {
          const response = await this.callOpenAI(prompt, this.config.fallbackModel);
          return this.parseAIResponse(response, context);
        } catch (fallbackError) {
          throw new Error(`Both primary and fallback AI models failed: ${error}, ${fallbackError}`);
        }
      }
      throw error;
    }
  }

  private buildPrompt(
    context: SuggestionContext,
    pageAnalysis: PageAnalysisResult,
    request: SuggestionRequest
  ): string {
    const availableActions = pageAnalysis.actions.map(a => a.name).join(', ');
    const capabilities = pageAnalysis.capabilities.join(', ');
    const elements = pageAnalysis.elements
      .filter(e => e.isInteractable && e.isVisible)
      .slice(0, 10)
      .map(e => `${e.type}${e.label ? ` (${e.label})` : ''}`)
      .join(', ');

    return `You are a voice command suggestion assistant for a website. Generate helpful, natural voice commands that users can say.

Context:
- Page type: ${pageAnalysis.pageType}
- Content type: ${pageAnalysis.contentType}
- User role: ${context.userRole}
- Current mode: ${context.currentMode}
- Site capabilities: ${capabilities}
- Available actions: ${availableActions}
- Interactive elements: ${elements}

${request.partialInput ? `Partial user input: "${request.partialInput}"` : ''}

Generate 5-8 relevant voice command suggestions. Each suggestion should be:
1. Natural and conversational
2. Contextually appropriate
3. Actionable on this page
4. Clear and unambiguous

Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "command": "Natural voice command text",
      "intent": "intent_category",
      "confidence": 0.0-1.0,
      "category": "navigation|action|content|query|control|help|discovery",
      "description": "Brief description of what this does",
      "examples": ["Alternative phrasing 1", "Alternative phrasing 2"],
      "reasoning": "Why this suggestion is relevant"
    }
  ]
}

Valid intent categories: navigate_to_page, navigate_to_section, click_element, submit_form, edit_text, search_content, add_to_cart, help_request, get_information, scroll_to_element, open_menu

Focus on commands that are most useful for the current page context.`;
  }

  private async callOpenAI(prompt: string, model?: string): Promise<OpenAIResponse> {
    const requestModel = model || this.config.model;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: requestModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful voice command suggestion assistant. Always return valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse OpenAI JSON response: ${error}`);
    }
  }

  private parseAIResponse(response: OpenAIResponse, context: SuggestionContext): CommandSuggestion[] {
    if (!response.suggestions || !Array.isArray(response.suggestions)) {
      throw new Error('Invalid AI response structure');
    }

    return response.suggestions.map((suggestion, index) => ({
      id: `ai_${Date.now()}_${index}`,
      command: suggestion.command,
      intent: this.validateIntent(suggestion.intent),
      confidence: Math.max(0, Math.min(1, suggestion.confidence)),
      priority: suggestion.confidence > 0.8 ? 'high' as const :
                suggestion.confidence > 0.6 ? 'medium' as const : 'low' as const,
      context,
      category: this.validateCategory(suggestion.category),
      description: suggestion.description,
      examples: Array.isArray(suggestion.examples) ? suggestion.examples : [],
      keywords: this.extractKeywords(suggestion.command),
      variations: Array.isArray(suggestion.examples) ? suggestion.examples : [],
      reasoning: suggestion.reasoning || 'AI generated suggestion',
      metadata: {
        frequency: 0,
        successRate: 0.7,
        avgExecutionTime: 1000,
        isLearned: false,
        source: 'ai' as const
      }
    }));
  }

  private validateIntent(intent: string): IntentCategory {
    const validIntents: IntentCategory[] = [
      'navigate_to_page', 'navigate_to_section', 'click_element', 'submit_form',
      'edit_text', 'search_content', 'add_to_cart', 'help_request',
      'get_information', 'scroll_to_element', 'open_menu', 'unknown_intent'
    ];

    return validIntents.includes(intent as IntentCategory)
      ? intent as IntentCategory
      : 'unknown_intent';
  }

  private validateCategory(category: string): SuggestionCategory {
    const validCategories: SuggestionCategory[] = [
      'navigation', 'action', 'content', 'query', 'control', 'help', 'discovery'
    ];

    return validCategories.includes(category as SuggestionCategory)
      ? category as SuggestionCategory
      : 'discovery';
  }

  private extractKeywords(command: string): string[] {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'at', 'for'];
    return command
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5);
  }

  private async enhanceContext(
    context: SuggestionContext,
    userProfile?: UserSuggestionProfile
  ): Promise<SuggestionContext> {
    if (!userProfile) {return context;}

    return {
      ...context,
      userPatterns: userProfile.frequentPatterns.map(p => p.pattern),
      sessionHistory: [...context.sessionHistory, ...userProfile.preferredCommands.slice(-5)]
    };
  }

  private filterAndRankSuggestions(
    suggestions: CommandSuggestion[],
    context: SuggestionContext,
    request: SuggestionRequest
  ): CommandSuggestion[] {
    let filtered = suggestions;

    // Filter by confidence threshold
    filtered = filtered.filter(s => s.confidence >= this.config.confidenceThreshold);

    // Filter by requested categories
    if (request.categories && request.categories.length > 0) {
      filtered = filtered.filter(s => request.categories!.includes(s.category));
    }

    // Apply contextual boosting
    if (this.config.enableContextBoost) {
      filtered = this.applyContextualBoosts(filtered, context);
    }

    // Sort by relevance score
    return filtered.sort((a, b) => this.calculateRelevanceScore(b, context) - this.calculateRelevanceScore(a, context));
  }

  private applyContextualBoosts(
    suggestions: CommandSuggestion[],
    context: SuggestionContext
  ): CommandSuggestion[] {
    return suggestions.map(suggestion => {
      let boost = 0;

      // Boost based on current mode
      if (context.currentMode === 'edit' && suggestion.category === 'content') {
        boost += 0.1;
      }

      // Boost based on available capabilities
      if (context.capabilities.includes('e-commerce') && suggestion.intent === 'add_to_cart') {
        boost += 0.2;
      }

      // Boost based on user patterns
      if (context.userPatterns.some(pattern =>
        suggestion.command.toLowerCase().includes(pattern.toLowerCase()))) {
        boost += 0.15;
      }

      return {
        ...suggestion,
        confidence: Math.min(1, suggestion.confidence + boost)
      };
    });
  }

  private calculateRelevanceScore(suggestion: CommandSuggestion, _context: SuggestionContext): number {
    let score = suggestion.confidence * 100;

    // Priority weighting
    if (suggestion.priority === 'high') {score += 20;}
    else if (suggestion.priority === 'medium') {score += 10;}

    // Frequency bonus from metadata
    score += Math.min(suggestion.metadata.frequency * 2, 20);

    // Success rate bonus
    score += suggestion.metadata.successRate * 10;

    return score;
  }

  private applyPersonalization(
    suggestions: CommandSuggestion[],
    userProfile?: UserSuggestionProfile
  ): CommandSuggestion[] {
    if (!userProfile) {return suggestions;}

    return suggestions.map(suggestion => {
      let personalizedConfidence = suggestion.confidence;

      // Boost based on user preferences
      if (userProfile.preferredCommands.includes(suggestion.command)) {
        personalizedConfidence = Math.min(1, personalizedConfidence + 0.2);
      }

      // Boost based on historical success
      const historicalData = userProfile.learningData.commandHistory.find(
        h => h.command === suggestion.command
      );

      if (historicalData) {
        if (historicalData.success) {
          personalizedConfidence = Math.min(1, personalizedConfidence + 0.1);
        }
      }

      return {
        ...suggestion,
        confidence: personalizedConfidence
      };
    });
  }

  private calculateOverallConfidence(suggestions: CommandSuggestion[]): number {
    if (suggestions.length === 0) {return 0;}
    return suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length;
  }

  private getCachedSuggestions(request: SuggestionRequest): CommandSuggestion[] | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.suggestionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute TTL
      return cached.suggestions;
    }

    return null;
  }

  private cacheSuggestions(request: SuggestionRequest, suggestions: CommandSuggestion[]): void {
    const cacheKey = this.generateCacheKey(request);
    this.suggestionCache.set(cacheKey, {
      suggestions,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.suggestionCache.size > 100) {
      const oldestKey = this.suggestionCache.keys().next().value;
      if (oldestKey) {
        this.suggestionCache.delete(oldestKey);
      }
    }
  }

  private generateCacheKey(request: SuggestionRequest): string {
    return `${request.context.pageType}-${request.context.currentMode}-${request.partialInput || ''}-${request.categories?.join(',') || ''}`;
  }

  private generateFallbackSuggestions(
    request: SuggestionRequest,
    requestId: string,
    startTime: number
  ): SuggestionResponse {
    const fallbackSuggestions: CommandSuggestion[] = [
      {
        id: 'fallback-help',
        command: 'Help me use this page',
        intent: 'help_request',
        confidence: 0.8,
        priority: 'high',
        context: request.context,
        category: 'help',
        description: 'Get assistance with using this page',
        examples: ['How do I use this?', 'What can I do here?'],
        keywords: ['help', 'assistance', 'guide'],
        variations: ['Show me how to use this', 'Give me help'],
        reasoning: 'Fallback help suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 500,
          isLearned: false,
          source: 'template'
        }
      },
      {
        id: 'fallback-navigate',
        command: 'Navigate around the site',
        intent: 'navigate_to_section',
        confidence: 0.7,
        priority: 'medium',
        context: request.context,
        category: 'navigation',
        description: 'Explore different parts of the website',
        examples: ['Go to the main page', 'Show me other sections'],
        keywords: ['navigate', 'go', 'explore'],
        variations: ['Browse the site', 'Look around'],
        reasoning: 'Fallback navigation suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.8,
          avgExecutionTime: 1000,
          isLearned: false,
          source: 'template'
        }
      }
    ];

    return {
      suggestions: fallbackSuggestions,
      metadata: {
        requestId,
        processingTime: performance.now() - startTime,
        cacheHit: false,
        confidence: 0.7,
        contextAnalysisTime: 0,
        suggestionGenerationTime: 0
      },
      fallbackUsed: true
    };
  }

  private getDefaultProactiveSuggestions(context: SuggestionContext): CommandSuggestion[] {
    return [
      {
        id: 'proactive-discover',
        command: 'What can I do here?',
        intent: 'help_request',
        confidence: 0.9,
        priority: 'high',
        context,
        category: 'discovery',
        description: 'Discover available actions on this page',
        examples: ['Show me what I can do', 'What are my options?'],
        keywords: ['what', 'can', 'do', 'options'],
        variations: ['What are my options?', 'Show me available actions'],
        reasoning: 'Default discovery suggestion',
        metadata: {
          frequency: 0,
          successRate: 0.9,
          avgExecutionTime: 500,
          isLearned: false,
          source: 'template'
        }
      }
    ];
  }

  private createEmptyProfile(userId: string): UserSuggestionProfile {
    return {
      userId,
      preferredCommands: [],
      frequentPatterns: [],
      customSuggestions: [],
      learningData: {
        commandHistory: [],
        contextualPreferences: {},
        correctionHistory: [],
        adaptiveThresholds: {}
      },
      preferences: {
        maxSuggestions: 5,
        preferredCategories: [],
        enableLearning: true,
        enableProactive: true,
        confidenceThreshold: 0.6,
        responseTimePreference: 'balanced'
      }
    };
  }

  private updateAdaptiveThresholds(
    profile: UserSuggestionProfile,
    suggestion: CommandSuggestion,
    feedback: 'positive' | 'negative' | 'neutral'
  ): void {
    const intentKey = suggestion.intent;
    const currentThreshold = profile.learningData.adaptiveThresholds[intentKey] || 0.6;

    if (feedback === 'positive') {
      // Lower threshold for successful intents (accept more suggestions)
      profile.learningData.adaptiveThresholds[intentKey] = Math.max(0.3, currentThreshold - 0.05);
    } else if (feedback === 'negative') {
      // Raise threshold for failed intents (be more selective)
      profile.learningData.adaptiveThresholds[intentKey] = Math.min(0.9, currentThreshold + 0.1);
    }
  }
}

export const commandSuggestionEngine = new CommandSuggestionEngine(
  process.env['REACT_APP_OPENAI_API_KEY'] || ''
);