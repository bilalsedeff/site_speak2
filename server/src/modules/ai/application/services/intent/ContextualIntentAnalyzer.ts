/**
 * Contextual Intent Analyzer - Universal website context extraction
 *
 * Features:
 * - Universal website structure analysis
 * - Automatic page type and capability detection
 * - Session context and user behavior analysis
 * - Real-time element discovery and classification
 * - Performance optimized for <50ms analysis
 * - Cultural and language context awareness
 */

import { createLogger } from '../../../../../shared/utils';
import type {
  ContextualIntentAnalysis,
  PageContext,
  SessionContext,
  UserContext,
  ElementContextInfo,
  SiteCapability,
  SchemaOrgData,
  IntentHistory,
  TaskContext,
  UserLearningProfile,
  IntentCategory,
  UserPreferences,
  ConversationEntity,
} from './types.js';

const logger = createLogger({ service: 'contextual-intent-analyzer' });

export interface ContextAnalysisConfig {
  maxElementsToAnalyze: number;
  enableSchemaDetection: boolean;
  enableCapabilityDetection: boolean;
  enableLearningProfile: boolean;
  contextCacheTimeout: number;
  performanceTargetMs: number;
}

export interface RawPageData {
  url: string;
  title?: string;
  htmlContent?: string;
  domElements?: ElementContextInfo[];
  metadata?: Record<string, unknown>;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timestamp: Date;
}

export interface SessionData {
  sessionId: string;
  userId?: string;
  tenantId: string;
  siteId: string;
  startTime: Date;
  previousCommands?: string[];
  currentTaskInfo?: TaskContext;
  userPreferences?: UserPreferences;
  conversationHistory?: ConversationEntity[];
}

/**
 * Universal Context Analyzer for Intent Recognition
 */
export class ContextualIntentAnalyzer {
  private config: ContextAnalysisConfig;
  private pageContextCache = new Map<string, { context: PageContext; timestamp: Date }>();
  private userLearningProfiles = new Map<string, UserLearningProfile>();
  private capabilityDetectors = new Map<string, (data: RawPageData) => SiteCapability[]>();
  private performanceMetrics = {
    totalAnalyses: 0,
    averageAnalysisTime: 0,
    cacheHitRate: 0,
    errorCount: 0,
  };

  constructor(config: ContextAnalysisConfig) {
    this.config = config;
    this.initializeCapabilityDetectors();

    logger.info('ContextualIntentAnalyzer initialized', {
      maxElements: config.maxElementsToAnalyze,
      schemaDetection: config.enableSchemaDetection,
      capabilityDetection: config.enableCapabilityDetection,
    });
  }

  /**
   * Analyze complete context for intent recognition
   */
  async analyzeContext(
    pageData: RawPageData,
    sessionData: SessionData,
    userRole: UserContext['role'] = 'guest'
  ): Promise<ContextualIntentAnalysis> {
    const startTime = performance.now();
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    try {
      logger.debug('Starting context analysis', {
        analysisId,
        url: pageData.url,
        sessionId: sessionData.sessionId,
        userRole,
      });

      // Parallel analysis for performance
      const [pageContext, sessionContext, userContext] = await Promise.all([
        this.analyzePageContext(pageData, analysisId),
        this.analyzeSessionContext(sessionData, analysisId),
        this.analyzeUserContext(sessionData.userId, userRole, analysisId),
      ]);

      // Build contextual boosts based on analysis
      const contextualBoosts = this.calculateContextualBoosts(
        pageContext,
        sessionContext,
        userContext
      );

      // Determine constrained intents based on context
      const constrainedIntents = this.determineConstrainedIntents(
        pageContext,
        userContext
      );

      // Generate intelligent suggestions
      const suggestionOverrides = await this.generateSuggestionOverrides(
        pageContext,
        sessionContext,
        userContext
      );

      const analysis: ContextualIntentAnalysis = {
        pageContext,
        sessionContext,
        userContext,
        availableActions: this.extractAvailableActions(pageContext),
        contextualBoosts,
        constrainedIntents,
        ...(suggestionOverrides && suggestionOverrides.length > 0 && { suggestionOverrides }),
      };

      const analysisTime = performance.now() - startTime;
      this.updateMetrics(analysisTime, true);

      logger.info('Context analysis completed', {
        analysisId,
        analysisTime,
        pageType: pageContext.pageType,
        capabilities: pageContext.capabilities.length,
        availableActions: analysis.availableActions.length,
      });

      return analysis;

    } catch (error) {
      const analysisTime = performance.now() - startTime;
      this.updateMetrics(analysisTime, false);

      logger.error('Context analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
        url: pageData.url,
        analysisTime,
      });

      // Return minimal context to prevent total failure
      return this.createFallbackContext(pageData, sessionData, userRole);
    }
  }

  /**
   * Analyze page context with universal compatibility
   */
  private async analyzePageContext(
    pageData: RawPageData,
    analysisId: string
  ): Promise<PageContext> {
    // Check cache first
    const cacheKey = this.generatePageContextCacheKey(pageData);
    const cached = this.pageContextCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp.getTime() < this.config.contextCacheTimeout) {
      logger.debug('Using cached page context', { analysisId, cacheKey });
      return cached.context;
    }

    try {
      // Analyze page structure
      const pageType = this.detectPageType(pageData);
      const contentType = this.detectContentType(pageData);
      const capabilities = this.detectSiteCapabilities(pageData);
      const availableElements = await this.analyzePageElements(pageData);
      const schema = this.config.enableSchemaDetection ?
        this.extractSchemaOrgData(pageData) : undefined;

      const pageContext: PageContext = {
        url: pageData.url,
        domain: new URL(pageData.url).hostname,
        pageType,
        contentType,
        availableElements,
        ...(schema && { schema }),
        capabilities,
        currentMode: this.detectCurrentMode(pageData),
      };

      // Cache the result
      this.pageContextCache.set(cacheKey, {
        context: pageContext,
        timestamp: new Date(),
      });

      logger.debug('Page context analyzed', {
        analysisId,
        pageType,
        contentType,
        elementsFound: availableElements.length,
        capabilities: capabilities.length,
      });

      return pageContext;

    } catch (error) {
      logger.error('Page context analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
        url: pageData.url,
      });

      // Return minimal page context
      return {
        url: pageData.url,
        domain: new URL(pageData.url).hostname,
        pageType: 'other',
        contentType: 'other',
        availableElements: [],
        capabilities: [],
        currentMode: 'view',
      };
    }
  }

  /**
   * Analyze session context and history
   */
  private async analyzeSessionContext(
    sessionData: SessionData,
    analysisId: string
  ): Promise<SessionContext> {
    try {
      // Extract previous intents from command history
      const previousIntents = this.extractPreviousIntents(
        sessionData.previousCommands || []
      );

      // Analyze current task if available
      const currentTask = sessionData.currentTaskInfo ?
        this.analyzeCurrentTask(sessionData.currentTaskInfo) : undefined;

      // Build conversation state
      const conversationState = this.buildConversationState(
        sessionData.conversationHistory || []
      );

      const sessionContext: SessionContext = {
        sessionId: sessionData.sessionId,
        ...(sessionData.userId && { userId: sessionData.userId }),
        tenantId: sessionData.tenantId,
        siteId: sessionData.siteId,
        startTime: sessionData.startTime,
        previousIntents,
        conversationState,
        ...(sessionData.userPreferences && { userPreferences: sessionData.userPreferences }),
        ...(currentTask && { currentTask }),
      };

      logger.debug('Session context analyzed', {
        analysisId,
        sessionId: sessionData.sessionId,
        previousIntentsCount: previousIntents.length,
        hasCurrentTask: !!currentTask,
      });

      return sessionContext;

    } catch (error) {
      logger.error('Session context analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
        sessionId: sessionData.sessionId,
      });

      // Return minimal session context
      return {
        sessionId: sessionData.sessionId,
        tenantId: sessionData.tenantId,
        siteId: sessionData.siteId,
        startTime: sessionData.startTime,
        previousIntents: [],
        conversationState: {
          entities: {},
          context: {},
          pendingActions: [],
        },
      };
    }
  }

  /**
   * Analyze user context and learning profile
   */
  private async analyzeUserContext(
    userId: string | undefined,
    role: UserContext['role'],
    analysisId: string
  ): Promise<UserContext> {
    try {
      const userContext: UserContext = {
        ...(userId && { userId }),
        role,
        permissions: this.getPermissionsForRole(role),
        previousSessions: [],
        timezone: 'UTC', // Default, should be detected from browser
        locale: 'en-US', // Default, should be detected from browser/user settings
      };

      // Add learning profile if enabled and user is identified
      if (this.config.enableLearningProfile && userId) {
        const learningProfile = this.getUserLearningProfile(userId);
        const preferredIntentHandling = this.getUserIntentPreferences(userId);
        if (learningProfile) {
          userContext.learningProfile = learningProfile;
        }
        if (preferredIntentHandling) {
          userContext.preferredIntentHandling = preferredIntentHandling;
        }
      }

      logger.debug('User context analyzed', {
        analysisId,
        userId: userId || 'anonymous',
        role,
        hasLearningProfile: !!userContext.learningProfile,
      });

      return userContext;

    } catch (error) {
      logger.error('User context analysis failed', {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
        userId,
        role,
      });

      // Return minimal user context
      return {
        role,
        permissions: this.getPermissionsForRole(role),
        previousSessions: [],
      };
    }
  }

  /**
   * Detect page type using universal heuristics
   */
  private detectPageType(pageData: RawPageData): PageContext['pageType'] {
    const url = pageData.url.toLowerCase();
    const title = pageData.title?.toLowerCase() || '';
    const htmlContent = pageData.htmlContent?.toLowerCase() || '';

    // E-commerce patterns
    if (url.includes('/product/') || url.includes('/item/') ||
        htmlContent.includes('add to cart') || htmlContent.includes('buy now')) {
      return 'product';
    }

    if (url.includes('/cart') || url.includes('/basket') ||
        htmlContent.includes('shopping cart') || htmlContent.includes('checkout')) {
      return 'cart';
    }

    if (url.includes('/checkout') || url.includes('/payment') ||
        htmlContent.includes('payment method') || htmlContent.includes('billing address')) {
      return 'checkout';
    }

    if (url.includes('/category/') || url.includes('/shop/') ||
        htmlContent.includes('product grid') || htmlContent.includes('filter by')) {
      return 'category';
    }

    // Account and profile patterns
    if (url.includes('/account') || url.includes('/profile') || url.includes('/dashboard') ||
        htmlContent.includes('my account') || htmlContent.includes('profile settings')) {
      return 'account';
    }

    // Content patterns
    if (url.includes('/blog/') || url.includes('/article/') || url.includes('/post/') ||
        htmlContent.includes('<article') || htmlContent.includes('blog post')) {
      return 'blog';
    }

    if (url.includes('/contact') || htmlContent.includes('contact form') ||
        htmlContent.includes('get in touch') || htmlContent.includes('contact us')) {
      return 'contact';
    }

    // Home page patterns
    if (url === '/' || url.endsWith('/') || url.includes('/home') ||
        title.includes('home') || title.includes('welcome')) {
      return 'home';
    }

    return 'other';
  }

  /**
   * Detect content type using universal heuristics
   */
  private detectContentType(pageData: RawPageData): PageContext['contentType'] {
    const htmlContent = pageData.htmlContent?.toLowerCase() || '';
    const url = pageData.url.toLowerCase();

    // E-commerce indicators
    if (htmlContent.includes('add to cart') || htmlContent.includes('price') ||
        htmlContent.includes('product') || htmlContent.includes('shop') ||
        url.includes('/store') || url.includes('/shop')) {
      return 'e-commerce';
    }

    // Form indicators
    if (htmlContent.includes('<form') || htmlContent.includes('input type') ||
        htmlContent.includes('submit') || htmlContent.includes('form-control')) {
      return 'form';
    }

    // Blog/content indicators
    if (htmlContent.includes('<article') || htmlContent.includes('blog') ||
        htmlContent.includes('post') || url.includes('/blog/')) {
      return 'blog';
    }

    // Documentation indicators
    if (htmlContent.includes('documentation') || htmlContent.includes('api reference') ||
        htmlContent.includes('getting started') || url.includes('/docs/')) {
      return 'documentation';
    }

    // Dashboard indicators
    if (htmlContent.includes('dashboard') || htmlContent.includes('analytics') ||
        htmlContent.includes('admin panel') || url.includes('/admin')) {
      return 'dashboard';
    }

    // Media indicators
    if (htmlContent.includes('<video') || htmlContent.includes('<audio') ||
        htmlContent.includes('media player') || htmlContent.includes('gallery')) {
      return 'media';
    }

    return 'other';
  }

  /**
   * Detect site capabilities using universal heuristics
   */
  private detectSiteCapabilities(pageData: RawPageData): SiteCapability[] {
    const capabilities: SiteCapability[] = [];
    const htmlContent = pageData.htmlContent?.toLowerCase() || '';

    // Basic capabilities
    if (htmlContent.includes('<nav') || htmlContent.includes('menu') ||
        htmlContent.includes('navigation')) {
      capabilities.push('navigation');
    }

    if (htmlContent.includes('search') || htmlContent.includes('input type="search"')) {
      capabilities.push('search');
    }

    if (htmlContent.includes('<form') || htmlContent.includes('input type')) {
      capabilities.push('forms');
    }

    // E-commerce capabilities
    if (htmlContent.includes('cart') || htmlContent.includes('checkout') ||
        htmlContent.includes('add to cart')) {
      capabilities.push('e-commerce');
    }

    if (htmlContent.includes('payment') || htmlContent.includes('stripe') ||
        htmlContent.includes('paypal')) {
      capabilities.push('payments');
    }

    // User account capabilities
    if (htmlContent.includes('login') || htmlContent.includes('register') ||
        htmlContent.includes('account') || htmlContent.includes('profile')) {
      capabilities.push('user-accounts');
    }

    // Content capabilities
    if (htmlContent.includes('upload') || htmlContent.includes('file input')) {
      capabilities.push('media-upload');
    }

    if (htmlContent.includes('comment') || htmlContent.includes('reply')) {
      capabilities.push('comments');
    }

    if (htmlContent.includes('rating') || htmlContent.includes('review') ||
        htmlContent.includes('stars')) {
      capabilities.push('ratings-reviews');
    }

    // Social capabilities
    if (htmlContent.includes('share') || htmlContent.includes('social') ||
        htmlContent.includes('facebook') || htmlContent.includes('twitter')) {
      capabilities.push('social-sharing');
    }

    // Technical capabilities
    if (htmlContent.includes('websocket') || htmlContent.includes('real-time') ||
        htmlContent.includes('live')) {
      capabilities.push('real-time-updates');
    }

    if (htmlContent.includes('geolocation') || htmlContent.includes('location')) {
      capabilities.push('geolocation');
    }

    if (htmlContent.includes('notification') || htmlContent.includes('push')) {
      capabilities.push('notifications');
    }

    // Accessibility
    if (htmlContent.includes('aria-') || htmlContent.includes('role=') ||
        htmlContent.includes('alt=')) {
      capabilities.push('accessibility');
    }

    // Support capabilities
    if (htmlContent.includes('chat') || htmlContent.includes('support') ||
        htmlContent.includes('help')) {
      capabilities.push('chat-support');
    }

    return capabilities;
  }

  /**
   * Analyze page elements for interaction context
   */
  private async analyzePageElements(pageData: RawPageData): Promise<ElementContextInfo[]> {
    if (!pageData.domElements) {
      return [];
    }

    const elements: ElementContextInfo[] = [];
    const maxElements = Math.min(pageData.domElements.length, this.config.maxElementsToAnalyze);

    for (let i = 0; i < maxElements; i++) {
      const element = pageData.domElements[i];
      if (!element) {
        continue;
      }

      try {
        const semanticRole = this.getSemanticRole(element);
        const textContent = element.textContent?.slice(0, 100);

        const elementInfo: ElementContextInfo = {
          selector: element.selector || this.generateSelector(element),
          tagName: element.tagName?.toLowerCase() || 'unknown',
          ...(element.type && { type: element.type }),
          ...(element.id && { id: element.id }),
          ...(element.className && { className: element.className }),
          ...(textContent && { textContent }),
          attributes: element.attributes || {},
          ...(element.boundingRect && { boundingRect: element.boundingRect }),
          isVisible: element.isVisible !== false,
          isInteractable: this.isElementInteractable(element),
          ...(semanticRole && { semanticRole }),
          contextualImportance: this.calculateElementImportance(element),
        };

        elements.push(elementInfo);
      } catch (error) {
        logger.warn('Failed to analyze element', {
          elementIndex: i,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return elements.sort((a, b) => b.contextualImportance - a.contextualImportance);
  }

  /**
   * Determine if element is interactable
   */
  private isElementInteractable(element: ElementContextInfo): boolean {
    const interactableTags = ['button', 'a', 'input', 'select', 'textarea', 'label'];
    const interactableTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'];

    if (interactableTags.includes(element.tagName?.toLowerCase())) {
      return true;
    }

    if (element.type && interactableTypes.includes(element.type)) {
      return true;
    }

    if (element.attributes?.['role'] === 'button' || element.attributes?.['onclick']) {
      return true;
    }

    if (element.className?.includes('btn') || element.className?.includes('button') ||
        element.className?.includes('clickable') || element.className?.includes('link')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate element importance for context
   */
  private calculateElementImportance(element: ElementContextInfo): number {
    let importance = 0;

    // Tag-based importance
    const tagImportance: Record<string, number> = {
      'button': 8,
      'input': 7,
      'a': 6,
      'select': 6,
      'textarea': 5,
      'form': 4,
      'nav': 3,
      'header': 2,
      'main': 2,
      'footer': 1,
    };

    importance += tagImportance[element.tagName?.toLowerCase()] || 0;

    // Visibility and position importance
    if (element.isVisible && element.boundingRect) {
      const rect = element.boundingRect;
      // Elements higher on page and larger are more important
      importance += Math.max(0, 5 - (rect.y / 200));
      importance += Math.min(3, (rect.width * rect.height) / 10000);
    }

    // Text content importance
    if (element.textContent) {
      const importantWords = ['submit', 'buy', 'add', 'cart', 'save', 'delete', 'edit', 'login', 'register'];
      const text = element.textContent.toLowerCase();

      for (const word of importantWords) {
        if (text.includes(word)) {
          importance += 2;
        }
      }
    }

    // Attribute-based importance
    if (element.id) {importance += 1;}
    if (element.attributes?.['role']) {importance += 1;}
    if (element.attributes?.['aria-label']) {importance += 1;}

    return Math.min(10, importance); // Cap at 10
  }

  /**
   * Get semantic role of element
   */
  private getSemanticRole(element: ElementContextInfo): string | undefined {
    if (element.attributes?.['role']) {
      return element.attributes['role'];
    }

    const tagRoles: Record<string, string> = {
      'button': 'button',
      'a': 'link',
      'input': 'textbox',
      'select': 'combobox',
      'textarea': 'textbox',
      'nav': 'navigation',
      'header': 'banner',
      'main': 'main',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'article': 'article',
      'section': 'region',
    };

    return tagRoles[element.tagName?.toLowerCase()];
  }

  /**
   * Extract Schema.org data
   */
  private extractSchemaOrgData(pageData: RawPageData): SchemaOrgData | undefined {
    if (!pageData.htmlContent) {return undefined;}

    try {
      // Look for JSON-LD schema
      const jsonLdMatches = pageData.htmlContent.match(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      );

      if (jsonLdMatches && jsonLdMatches.length > 0) {
        for (const match of jsonLdMatches) {
          try {
            const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '').trim();
            const schema = JSON.parse(jsonContent);

            if (schema['@type']) {
              return schema;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      // Look for microdata (simplified)
      const titleMatch = pageData.htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      const descriptionMatch = pageData.htmlContent.match(
        /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
      );

      if (titleMatch || descriptionMatch) {
        const name = titleMatch?.[1]?.trim();
        const description = descriptionMatch?.[1]?.trim();

        return {
          '@type': 'WebPage',
          ...(name && { name }),
          ...(description && { description }),
          url: pageData.url,
        };
      }

    } catch (error) {
      logger.debug('Failed to extract schema data', { error: error instanceof Error ? error.message : String(error) });
    }

    return undefined;
  }

  /**
   * Detect current mode (view/edit/preview)
   */
  private detectCurrentMode(pageData: RawPageData): PageContext['currentMode'] {
    const url = pageData.url.toLowerCase();
    const htmlContent = pageData.htmlContent?.toLowerCase() || '';

    if (url.includes('/edit') || url.includes('/admin') ||
        htmlContent.includes('editor') || htmlContent.includes('edit mode')) {
      return 'edit';
    }

    if (url.includes('/preview') || htmlContent.includes('preview mode')) {
      return 'preview';
    }

    return 'view';
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(element: ElementContextInfo): string {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className && element.tagName) {
      const mainClass = element.className.split(' ')[0];
      return `${element.tagName.toLowerCase()}.${mainClass}`;
    }

    if (element.tagName) {
      return element.tagName.toLowerCase();
    }

    return 'unknown';
  }

  /**
   * Extract previous intents from command history
   */
  private extractPreviousIntents(commands: string[]): IntentHistory[] {
    // This is a simplified implementation
    // In a real implementation, this would use the intent classification history
    return commands.slice(-5).map((_, index) => ({
      intent: 'unknown_intent' as IntentCategory, // Would be actual classified intent
      timestamp: new Date(Date.now() - (commands.length - index) * 60000),
      confidence: 0.8,
      success: true,
    }));
  }

  /**
   * Build conversation state from history
   */
  private buildConversationState(history: ConversationEntity[]): SessionContext['conversationState'] {
    return {
      entities: {},
      context: {},
      pendingActions: [],
      ...(history.length > 0 && { currentTopic: 'voice_interaction' }),
    };
  }

  /**
   * Analyze current task context
   */
  private analyzeCurrentTask(taskInfo: TaskContext): TaskContext | undefined {
    if (!taskInfo) {
      return undefined;
    }

    return {
      taskType: taskInfo.taskType || 'navigation',
      currentStep: taskInfo.currentStep || 0,
      ...(taskInfo.totalSteps !== undefined && { totalSteps: taskInfo.totalSteps }),
      subTasks: taskInfo.subTasks || [],
      progress: taskInfo.progress || 0,
      ...(taskInfo.blockers && taskInfo.blockers.length > 0 && { blockers: taskInfo.blockers }),
    };
  }

  /**
   * Calculate contextual intent boosts
   */
  private calculateContextualBoosts(
    pageContext: PageContext,
    _sessionContext: SessionContext,
    userContext: UserContext
  ): Record<IntentCategory, number> {
    const boosts: Partial<Record<IntentCategory, number>> = {};

    // Page-based boosts
    switch (pageContext.pageType) {
      case 'product':
        boosts['add_to_cart'] = 0.3;
        boosts['view_product'] = 0.2;
        break;
      case 'cart':
        boosts['remove_from_cart'] = 0.3;
        boosts['checkout_process'] = 0.3;
        break;
      case 'checkout':
        boosts['submit_form'] = 0.4;
        break;
    }

    // Capability-based boosts
    if (pageContext.capabilities.includes('search')) {
      boosts['search_content'] = 0.2;
    }
    if (pageContext.capabilities.includes('forms')) {
      boosts['submit_form'] = 0.2;
      boosts['clear_form'] = 0.1;
    }

    // Mode-based boosts
    if (pageContext.currentMode === 'edit') {
      boosts['edit_text'] = 0.3;
      boosts['add_content'] = 0.2;
      boosts['delete_content'] = 0.2;
    }

    // User role-based boosts
    if (userContext.role === 'admin' || userContext.role === 'editor') {
      boosts['edit_text'] = (boosts['edit_text'] || 0) + 0.1;
      boosts['delete_content'] = (boosts['delete_content'] || 0) + 0.1;
    }

    return boosts as Record<IntentCategory, number>;
  }

  /**
   * Determine constrained intents based on context
   */
  private determineConstrainedIntents(
    pageContext: PageContext,
    userContext: UserContext
  ): IntentCategory[] {
    const constrained: IntentCategory[] = [];

    // Page-based constraints
    if (!pageContext.capabilities.includes('e-commerce')) {
      constrained.push('add_to_cart', 'remove_from_cart', 'checkout_process');
    }

    if (!pageContext.capabilities.includes('forms')) {
      constrained.push('submit_form', 'clear_form');
    }

    if (pageContext.currentMode === 'view') {
      constrained.push('edit_text', 'add_content', 'delete_content');
    }

    // Permission-based constraints
    if (userContext.role === 'viewer' || userContext.role === 'guest') {
      constrained.push('edit_text', 'add_content', 'delete_content', 'submit_form');
    }

    return constrained;
  }

  /**
   * Generate intelligent suggestion overrides
   */
  private async generateSuggestionOverrides(
    pageContext: PageContext,
    _sessionContext: SessionContext,
    _userContext: UserContext
  ): Promise<ContextualIntentAnalysis['suggestionOverrides']> {
    const suggestions = [];

    // Page-specific suggestions
    switch (pageContext.pageType) {
      case 'product':
        suggestions.push({
          intent: 'add_to_cart' as IntentCategory,
          phrase: 'Add this to my cart',
          context: 'Product page suggestion',
          confidence: 0.9,
          reasoning: 'Common action on product pages',
        });
        break;
      case 'cart':
        suggestions.push({
          intent: 'checkout_process' as IntentCategory,
          phrase: 'Proceed to checkout',
          context: 'Cart page suggestion',
          confidence: 0.9,
          reasoning: 'Natural next step in cart',
        });
        break;
    }

    // Capability-based suggestions
    if (pageContext.capabilities.includes('search')) {
      suggestions.push({
        intent: 'search_content' as IntentCategory,
        phrase: 'Search for something',
        context: 'Search capability available',
        confidence: 0.7,
        reasoning: 'Search functionality detected',
      });
    }

    return suggestions.slice(0, 5); // Limit suggestions
  }

  /**
   * Extract available actions from page context
   */
  private extractAvailableActions(pageContext: PageContext): string[] {
    const actions: string[] = [];

    // Basic navigation actions
    actions.push('navigate_back', 'navigate_forward', 'scroll_to_element');

    // Capability-based actions
    for (const capability of pageContext.capabilities) {
      switch (capability) {
        case 'search':
          actions.push('search_content');
          break;
        case 'forms':
          actions.push('submit_form', 'clear_form');
          break;
        case 'e-commerce':
          actions.push('add_to_cart', 'view_product');
          break;
        case 'navigation':
          actions.push('navigate_to_page', 'open_menu');
          break;
      }
    }

    // Element-based actions
    for (const element of pageContext.availableElements) {
      if (element.isInteractable) {
        actions.push('click_element');

        if (element.tagName === 'input' || element.tagName === 'textarea') {
          actions.push('edit_text');
        }
      }
    }

    // Mode-based actions
    if (pageContext.currentMode === 'edit') {
      actions.push('edit_text', 'add_content', 'delete_content', 'undo_action', 'redo_action');
    }

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Get permissions for user role
   */
  private getPermissionsForRole(role: UserContext['role']): string[] {
    switch (role) {
      case 'admin':
        return ['read', 'write', 'delete', 'admin', 'edit', 'publish'];
      case 'editor':
        return ['read', 'write', 'edit', 'publish'];
      case 'viewer':
        return ['read'];
      case 'guest':
        return ['read'];
      default:
        return [];
    }
  }

  /**
   * Get user learning profile
   */
  private getUserLearningProfile(userId: string): UserLearningProfile | undefined {
    return this.userLearningProfiles.get(userId);
  }

  /**
   * Get user intent preferences
   */
  private getUserIntentPreferences(_userId: string): UserContext['preferredIntentHandling'] {
    return {
      confirmationThreshold: 0.8,
      autoExecuteThreshold: 0.9,
      preferredFallbackStrategy: 'clarification',
      enableLearning: true,
      enablePredictive: true,
    };
  }

  /**
   * Generate cache key for page context
   */
  private generatePageContextCacheKey(pageData: RawPageData): string {
    const url = new URL(pageData.url);
    return `${url.pathname}${url.search}`;
  }

  /**
   * Create fallback context for error scenarios
   */
  private createFallbackContext(
    pageData: RawPageData,
    sessionData: SessionData,
    userRole: UserContext['role']
  ): ContextualIntentAnalysis {
    return {
      pageContext: {
        url: pageData.url,
        domain: new URL(pageData.url).hostname,
        pageType: 'other',
        contentType: 'other',
        availableElements: [],
        capabilities: ['navigation'],
        currentMode: 'view',
      },
      sessionContext: {
        sessionId: sessionData.sessionId,
        tenantId: sessionData.tenantId,
        siteId: sessionData.siteId,
        startTime: sessionData.startTime,
        previousIntents: [],
        conversationState: {
          entities: {},
          context: {},
          pendingActions: [],
        },
      },
      userContext: {
        role: userRole,
        permissions: this.getPermissionsForRole(userRole),
        previousSessions: [],
      },
      availableActions: ['navigate_back', 'help_request'],
      contextualBoosts: {} as Record<IntentCategory, number>,
      constrainedIntents: [],
    };
  }

  /**
   * Initialize capability detectors
   */
  private initializeCapabilityDetectors(): void {
    // This could be extended with more sophisticated detectors
    this.capabilityDetectors.set('e-commerce', (data) => {
      const html = data.htmlContent?.toLowerCase() || '';
      return html.includes('cart') || html.includes('checkout') ? ['e-commerce'] : [];
    });

    this.capabilityDetectors.set('search', (data) => {
      const html = data.htmlContent?.toLowerCase() || '';
      return html.includes('search') ? ['search'] : [];
    });
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(analysisTime: number, success: boolean): void {
    this.performanceMetrics.totalAnalyses++;

    this.performanceMetrics.averageAnalysisTime =
      (this.performanceMetrics.averageAnalysisTime * (this.performanceMetrics.totalAnalyses - 1) + analysisTime) /
      this.performanceMetrics.totalAnalyses;

    if (!success) {
      this.performanceMetrics.errorCount++;
    }

    // Update cache hit rate
    // Implementation would track cache hits vs misses
  }

  /**
   * Get performance metrics
   */
  getMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Clear context cache
   */
  clearCache(): void {
    this.pageContextCache.clear();
    logger.info('Context cache cleared');
  }

  /**
   * Update user learning profile
   */
  updateUserLearningProfile(userId: string, updates: Partial<UserLearningProfile>): void {
    const existing = this.userLearningProfiles.get(userId);
    const updated = existing ? { ...existing, ...updates } : updates as UserLearningProfile;

    this.userLearningProfiles.set(userId, updated);
    logger.debug('User learning profile updated', { userId, updates: Object.keys(updates) });
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.pageContextCache.clear();
    this.userLearningProfiles.clear();
    this.capabilityDetectors.clear();

    logger.info('ContextualIntentAnalyzer cleanup completed', {
      totalAnalyses: this.performanceMetrics.totalAnalyses,
      averageAnalysisTime: this.performanceMetrics.averageAnalysisTime,
      errorCount: this.performanceMetrics.errorCount,
    });
  }
}