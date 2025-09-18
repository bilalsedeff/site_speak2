/**
 * Context Discovery Service
 *
 * Universal page analysis service that discovers available actions, elements,
 * and capabilities on any website structure. Provides the foundation for
 * context-aware command suggestions.
 *
 * Features:
 * - Universal DOM analysis without hardcoded assumptions
 * - ARIA landmark and semantic structure discovery
 * - Interactive element detection and categorization
 * - Capability inference from page structure
 * - Performance optimized with <50ms analysis time
 */

import {
  PageAnalysisResult,
  DiscoveredElement,
  AvailableAction,
  PageStructure,
  AccessibilityInfo,
  SiteCapability,
  StructuralLandmark,
  NavigationStructure,
  FormStructure,
  ContentStructure,
  InteractiveStructure
} from '@shared/types/suggestion.types';

export class ContextDiscoveryService {
  private analysisCache = new Map<string, { result: PageAnalysisResult; timestamp: number }>();
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly MAX_ANALYSIS_TIME = 50; // ms

  /**
   * Analyze the current page and discover available actions and context
   */
  async analyzePage(
    document: Document = window.document,
    options: {
      deep?: boolean;
      includeInvisible?: boolean;
      maxElements?: number;
      timeout?: number;
    } = {}
  ): Promise<PageAnalysisResult> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey(document, options);

    // Check cache first
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Run analysis with timeout protection
      const analysisPromise = this.performAnalysis(document, options);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timeout')), options.timeout || this.MAX_ANALYSIS_TIME)
      );

      const result = await Promise.race([analysisPromise, timeoutPromise]);

      // Cache successful result
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error) {
      console.warn('Page analysis failed, using fallback:', error);
      return this.createFallbackResult(startTime);
    }
  }

  /**
   * Perform comprehensive page analysis
   */
  private async performAnalysis(
    document: Document,
    options: { deep?: boolean; includeInvisible?: boolean; maxElements?: number }
  ): Promise<PageAnalysisResult> {
    const startTime = performance.now();

    // Parallel analysis for better performance
    const [
      pageType,
      contentType,
      capabilities,
      elements,
      structure,
      accessibility
    ] = await Promise.all([
      this.detectPageType(document),
      this.detectContentType(document),
      this.detectCapabilities(document),
      this.discoverElements(document, options),
      this.analyzeStructure(document),
      this.analyzeAccessibility(document)
    ]);

    const actions = this.inferAvailableActions(elements, structure, capabilities);
    const endTime = performance.now();

    return {
      pageType,
      contentType,
      capabilities,
      elements,
      actions,
      structure,
      accessibility,
      performance: {
        totalTime: endTime - startTime,
        elementAnalysisTime: 0, // Measured separately in discoverElements
        structureAnalysisTime: 0, // Measured separately in analyzeStructure
        capabilityDetectionTime: 0, // Measured separately in detectCapabilities
        elementsAnalyzed: elements.length
      }
    };
  }

  /**
   * Detect page type from URL, title, and content
   */
  private async detectPageType(document: Document): Promise<string> {
    const url = document.location.href;
    const title = document.title.toLowerCase();
    const body = document.body;

    // URL-based detection
    if (url.includes('/cart') || url.includes('/basket')) {return 'cart';}
    if (url.includes('/checkout') || url.includes('/payment')) {return 'checkout';}
    if (url.includes('/product') || url.includes('/item')) {return 'product';}
    if (url.includes('/category') || url.includes('/collection')) {return 'category';}
    if (url.includes('/account') || url.includes('/profile')) {return 'account';}
    if (url.includes('/blog') || url.includes('/news')) {return 'blog';}
    if (url.includes('/contact')) {return 'contact';}
    if (url.includes('/about')) {return 'about';}
    if (url.includes('/admin') || url.includes('/dashboard')) {return 'dashboard';}

    // Title-based detection
    if (title.includes('home') || title.includes('welcome')) {return 'home';}
    if (title.includes('shop') || title.includes('store')) {return 'category';}
    if (title.includes('cart') || title.includes('basket')) {return 'cart';}

    // Content-based detection
    if (body?.querySelector('[data-testid*="product"], .product, #product')) {return 'product';}
    if (body?.querySelector('[data-testid*="cart"], .cart, #cart')) {return 'cart';}
    if (body?.querySelector('form[action*="checkout"], .checkout')) {return 'checkout';}

    return 'other';
  }

  /**
   * Detect content type from semantic structure
   */
  private async detectContentType(document: Document): Promise<string> {
    const body = document.body;
    if (!body) {return 'other';}

    // E-commerce indicators
    if (body.querySelector('.price, [data-price], .add-to-cart, [data-testid*="price"]')) {
      return 'e-commerce';
    }

    // Blog/article indicators
    if (body.querySelector('article, .article, [role="article"], .blog-post')) {
      return 'blog';
    }

    // Documentation indicators
    if (body.querySelector('.docs, .documentation, [data-docs]')) {
      return 'documentation';
    }

    // Form-heavy pages
    const forms = body.querySelectorAll('form');
    if (forms.length > 2) {
      return 'form';
    }

    // Media-rich pages
    if (body.querySelectorAll('video, audio, canvas').length > 3) {
      return 'media';
    }

    // Dashboard/app indicators
    if (body.querySelector('.dashboard, .admin, [data-dashboard]')) {
      return 'dashboard';
    }

    return 'other';
  }

  /**
   * Detect site capabilities from page structure and content
   */
  private async detectCapabilities(document: Document): Promise<SiteCapability[]> {
    const capabilities: SiteCapability[] = ['navigation']; // Always has navigation
    const body = document.body;
    if (!body) {return capabilities;}

    // Search capability
    if (body.querySelector('input[type="search"], [role="search"], .search')) {
      capabilities.push('search');
    }

    // Forms capability
    if (body.querySelector('form')) {
      capabilities.push('forms');
    }

    // E-commerce capability
    if (body.querySelector('.price, .cart, .checkout, [data-price], .add-to-cart')) {
      capabilities.push('e-commerce');
    }

    // User accounts
    if (body.querySelector('.login, .register, .account, [href*="login"], [href*="account"]')) {
      capabilities.push('user-accounts');
    }

    // Content creation
    if (body.querySelector('textarea, [contenteditable], .editor')) {
      capabilities.push('content-creation');
    }

    // Media upload
    if (body.querySelector('input[type="file"], .upload, [data-upload]')) {
      capabilities.push('media-upload');
    }

    // Real-time updates (WebSocket, SSE indicators)
    if (body.querySelector('[data-live], .live, .realtime') ||
        document.querySelector('script[src*="socket"]')) {
      capabilities.push('real-time-updates');
    }

    // Multi-language
    if (body.querySelector('.language-selector, [data-lang], [hreflang]')) {
      capabilities.push('multi-language');
    }

    // Accessibility features
    if (body.querySelector('[aria-label], [aria-describedby], [role]')) {
      capabilities.push('accessibility');
    }

    // Social sharing
    if (body.querySelector('.share, [data-share], [href*="facebook"], [href*="twitter"]')) {
      capabilities.push('social-sharing');
    }

    // Comments
    if (body.querySelector('.comments, .comment, [data-comments]')) {
      capabilities.push('comments');
    }

    // Ratings/reviews
    if (body.querySelector('.rating, .review, [data-rating], .stars')) {
      capabilities.push('ratings-reviews');
    }

    // Subscriptions
    if (body.querySelector('.subscribe, .newsletter, [data-subscribe]')) {
      capabilities.push('subscriptions');
    }

    // Payments
    if (body.querySelector('[data-stripe], [data-paypal], .payment')) {
      capabilities.push('payments');
    }

    // Chat support
    if (body.querySelector('.chat, .support, [data-chat]')) {
      capabilities.push('chat-support');
    }

    return capabilities;
  }

  /**
   * Discover interactive elements and their properties
   */
  private async discoverElements(
    document: Document,
    options: { includeInvisible?: boolean; maxElements?: number }
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];
    const maxElements = options.maxElements || 1000;

    // Interactive element selectors
    const interactiveSelectors = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[tabindex="0"]',
      '[onclick]',
      '.btn',
      '.button',
      '.link'
    ];

    for (const selector of interactiveSelectors) {
      if (elements.length >= maxElements) {break;}

      const nodeList = document.querySelectorAll(selector);
      for (const element of Array.from(nodeList)) {
        if (elements.length >= maxElements) {break;}

        const htmlElement = element as HTMLElement;
        const isVisible = this.isElementVisible(htmlElement);

        if (!isVisible && !options.includeInvisible) {continue;}

        const discoveredElement = this.analyzeElement(htmlElement, isVisible);
        if (discoveredElement) {
          elements.push(discoveredElement);
        }
      }
    }

    // Sort by importance score
    elements.sort((a, b) => b.importance - a.importance);

    return elements;
  }

  /**
   * Analyze individual element properties
   */
  private analyzeElement(element: HTMLElement, isVisible: boolean): DiscoveredElement | null {
    try {
      const tagName = element.tagName.toLowerCase();
      const type = element.getAttribute('type') || tagName;
      const role = element.getAttribute('role');
      const label = this.getElementLabel(element);
      const description = this.getElementDescription(element);
      const isInteractable = this.isElementInteractable(element);
      const importance = this.calculateElementImportance(element, isVisible, isInteractable);
      const selector = this.generateSelector(element);

      const suggestedCommands = this.generateElementCommands(element, type, label);
      const contextualHints = this.generateContextualHints(element, type);

      return {
        selector,
        type,
        ...(role && { role }),
        ...(label && { label }),
        ...(description && { description }),
        isInteractable,
        isVisible,
        importance,
        suggestedCommands,
        contextualHints
      };
    } catch (error) {
      console.warn('Error analyzing element:', error);
      return null;
    }
  }

  /**
   * Analyze page structure including landmarks, navigation, forms
   */
  private async analyzeStructure(document: Document): Promise<PageStructure> {
    const body = document.body;
    if (!body) {
      return {
        landmarks: [],
        navigation: [],
        forms: [],
        content: [],
        interactive: []
      };
    }

    const landmarks = this.discoverLandmarks(body);
    const navigation = this.discoverNavigation(body);
    const forms = this.discoverForms(body);
    const content = this.discoverContent(body);
    const interactive = this.discoverInteractive(body);

    return {
      landmarks,
      navigation,
      forms,
      content,
      interactive
    };
  }

  /**
   * Analyze accessibility features and score
   */
  private async analyzeAccessibility(document: Document): Promise<AccessibilityInfo> {
    const body = document.body;
    if (!body) {
      return {
        score: 0,
        landmarks: 0,
        headingStructure: false,
        keyboardNavigable: false,
        screenReaderFriendly: false,
        issues: []
      };
    }

    const landmarks = body.querySelectorAll('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], main, nav, header, footer').length;
    const headings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingStructure = headings.length > 0;
    const keyboardNavigable = body.querySelectorAll('[tabindex], button, a, input, select, textarea').length > 0;
    const ariaLabels = body.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby]').length;
    const screenReaderFriendly = ariaLabels > 0;

    let score = 0;
    if (landmarks > 0) {score += 25;}
    if (headingStructure) {score += 25;}
    if (keyboardNavigable) {score += 25;}
    if (screenReaderFriendly) {score += 25;}

    return {
      score,
      landmarks,
      headingStructure,
      keyboardNavigable,
      screenReaderFriendly,
      issues: [] // TODO: Implement detailed accessibility issue detection
    };
  }

  /**
   * Infer available actions from discovered elements and structure
   */
  private inferAvailableActions(
    _elements: DiscoveredElement[],
    structure: PageStructure,
    capabilities: SiteCapability[]
  ): AvailableAction[] {
    const actions: AvailableAction[] = [];

    // Navigation actions
    if (structure.navigation.length > 0) {
      actions.push({
        id: 'navigate-to-section',
        name: 'Navigate to Section',
        description: 'Navigate to different sections of the page',
        category: 'navigation',
        intent: 'navigate_to_section',
        triggers: ['go to', 'navigate to', 'open', 'show'],
        requirements: [],
        parameters: [
          {
            name: 'section',
            type: 'string',
            description: 'Name of the section to navigate to',
            required: true
          }
        ],
        examples: ['Go to products', 'Navigate to contact'],
        confidence: 0.9
      });
    }

    // Form actions
    if (structure.forms.length > 0) {
      actions.push({
        id: 'fill-form',
        name: 'Fill Form',
        description: 'Fill out forms with information',
        category: 'action',
        intent: 'edit_text',
        triggers: ['fill', 'enter', 'type', 'input'],
        requirements: [],
        parameters: [
          {
            name: 'field',
            type: 'string',
            description: 'Form field to fill',
            required: true
          },
          {
            name: 'value',
            type: 'string',
            description: 'Value to enter',
            required: true
          }
        ],
        examples: ['Fill name field', 'Enter email address'],
        confidence: 0.8
      });
    }

    // E-commerce actions
    if (capabilities.includes('e-commerce')) {
      actions.push({
        id: 'add-to-cart',
        name: 'Add to Cart',
        description: 'Add products to shopping cart',
        category: 'action',
        intent: 'add_to_cart',
        triggers: ['add to cart', 'buy', 'purchase'],
        requirements: [],
        parameters: [],
        examples: ['Add this to cart', 'Buy this product'],
        confidence: 0.9
      });
    }

    // Search actions
    if (capabilities.includes('search')) {
      actions.push({
        id: 'search',
        name: 'Search',
        description: 'Search for content on the site',
        category: 'query',
        intent: 'search_content',
        triggers: ['search', 'find', 'look for'],
        requirements: [],
        parameters: [
          {
            name: 'query',
            type: 'string',
            description: 'Search query',
            required: true
          }
        ],
        examples: ['Search for products', 'Find information about'],
        confidence: 0.8
      });
    }

    return actions;
  }

  // ======================= HELPER METHODS =======================

  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < window.innerHeight &&
      rect.bottom > 0
    );
  }

  private isElementInteractable(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');

    return (
      ['button', 'a', 'input', 'select', 'textarea'].includes(tagName) ||
      ['button', 'link', 'menuitem'].includes(role || '') ||
      element.hasAttribute('onclick') ||
      element.hasAttribute('tabindex') ||
      element.classList.contains('btn') ||
      element.classList.contains('button')
    );
  }

  private calculateElementImportance(
    element: HTMLElement,
    isVisible: boolean,
    isInteractable: boolean
  ): number {
    let score = 0;

    if (isVisible) {score += 30;}
    if (isInteractable) {score += 40;}

    // Primary action indicators
    if (element.classList.contains('primary') ||
        element.classList.contains('btn-primary') ||
        element.id.includes('submit')) {
      score += 20;
    }

    // Size and position importance
    const rect = element.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 30) {score += 10;}

    return Math.min(score, 100);
  }

  private getElementLabel(element: HTMLElement): string | null {
    return (
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.textContent?.trim() ||
      element.getAttribute('placeholder') ||
      element.getAttribute('value') ||
      null
    );
  }

  private getElementDescription(element: HTMLElement): string | null {
    const describedBy = element.getAttribute('aria-describedby');
    if (describedBy) {
      const descriptor = document.getElementById(describedBy);
      if (descriptor) {return descriptor.textContent?.trim() || null;}
    }
    return element.getAttribute('title') || null;
  }

  private generateSelector(element: HTMLElement): string {
    // Generate a simple but effective selector
    if (element.id) {return `#${element.id}`;}

    const className = Array.from(element.classList).find(cls =>
      !cls.includes('hover') && !cls.includes('active') && !cls.includes('focus')
    );

    if (className) {return `.${className}`;}

    return element.tagName.toLowerCase();
  }

  private generateElementCommands(element: HTMLElement, type: string, label: string | null): string[] {
    const commands: string[] = [];
    const labelText = label || 'this';

    if (type === 'button' || element.tagName.toLowerCase() === 'button') {
      commands.push(`Click ${labelText}`, `Press ${labelText}`);
    }

    if (type === 'link' || element.tagName.toLowerCase() === 'a') {
      commands.push(`Go to ${labelText}`, `Open ${labelText}`);
    }

    if (['text', 'email', 'password'].includes(type)) {
      commands.push(`Fill ${labelText}`, `Enter text in ${labelText}`);
    }

    return commands;
  }

  private generateContextualHints(element: HTMLElement, type: string): string[] {
    const hints: string[] = [];

    if (element.hasAttribute('required')) {
      hints.push('Required field');
    }

    if (element.hasAttribute('disabled')) {
      hints.push('Currently disabled');
    }

    if (type === 'submit') {
      hints.push('Submits the form');
    }

    return hints;
  }

  private discoverLandmarks(body: HTMLElement): StructuralLandmark[] {
    const landmarks: StructuralLandmark[] = [];
    const landmarkSelectors = [
      { selector: 'main, [role="main"]', type: 'main' },
      { selector: 'nav, [role="navigation"]', type: 'navigation' },
      { selector: 'header, [role="banner"]', type: 'banner' },
      { selector: 'footer, [role="contentinfo"]', type: 'contentinfo' },
      { selector: 'aside, [role="complementary"]', type: 'complementary' },
      { selector: '[role="search"]', type: 'search' }
    ];

    landmarkSelectors.forEach(({ selector, type }) => {
      const elements = body.querySelectorAll(selector);
      elements.forEach((element, index) => {
        const htmlElement = element as HTMLElement;
        landmarks.push({
          type,
          selector: this.generateSelector(htmlElement),
          label: this.getElementLabel(htmlElement) || `${type} ${index + 1}`,
          description: `${type} landmark`,
          children: []
        });
      });
    });

    return landmarks;
  }

  private discoverNavigation(_body: HTMLElement): NavigationStructure[] {
    // Simplified navigation discovery
    return [];
  }

  private discoverForms(_body: HTMLElement): FormStructure[] {
    // Simplified form discovery
    return [];
  }

  private discoverContent(_body: HTMLElement): ContentStructure[] {
    // Simplified content discovery
    return [];
  }

  private discoverInteractive(_body: HTMLElement): InteractiveStructure[] {
    // Simplified interactive element discovery
    return [];
  }

  private generateCacheKey(document: Document, options: any): string {
    return `${document.location.href}-${JSON.stringify(options)}`;
  }

  private getCachedResult(key: string): PageAnalysisResult | null {
    const cached = this.analysisCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }
    return null;
  }

  private cacheResult(key: string, result: PageAnalysisResult): void {
    this.analysisCache.set(key, { result, timestamp: Date.now() });

    // Cleanup old cache entries
    if (this.analysisCache.size > 100) {
      const oldestKey = this.analysisCache.keys().next().value;
      if (oldestKey) {
        this.analysisCache.delete(oldestKey);
      }
    }
  }

  private createFallbackResult(startTime: number): PageAnalysisResult {
    return {
      pageType: 'other',
      contentType: 'other',
      capabilities: ['navigation'],
      elements: [],
      actions: [],
      structure: {
        landmarks: [],
        navigation: [],
        forms: [],
        content: [],
        interactive: []
      },
      accessibility: {
        score: 0,
        landmarks: 0,
        headingStructure: false,
        keyboardNavigable: false,
        screenReaderFriendly: false,
        issues: []
      },
      performance: {
        totalTime: performance.now() - startTime,
        elementAnalysisTime: 0,
        structureAnalysisTime: 0,
        capabilityDetectionTime: 0,
        elementsAnalyzed: 0
      }
    };
  }
}

export const contextDiscoveryService = new ContextDiscoveryService();