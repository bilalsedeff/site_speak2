/**
 * DOM Analyzer - Document structure and component analysis
 *
 * Analyzes DOM structure to understand page composition, components,
 * and interactive elements for site contract generation.
 */

export interface DomAnalysisResult {
  structure: PageStructure;
  components: ComponentAnalysis[];
  interactiveElements: InteractiveElement[];
  accessibility: AccessibilityFeatures;
  semantics: SemanticAnalysis;
  performance: PerformanceMetrics;
  recommendations: string[];
}

export interface PageStructure {
  title: string;
  description?: string;
  language: string;
  charset: string;
  viewport: string;
  landmarks: LandmarkRegion[];
  headingHierarchy: HeadingElement[];
  navigation: NavigationStructure[];
  contentSections: ContentSection[];
}

export interface LandmarkRegion {
  type: 'banner' | 'navigation' | 'main' | 'complementary' | 'contentinfo' | 'search' | 'form' | 'region';
  selector: string;
  label?: string;
  description?: string;
  nested: boolean;
}

export interface HeadingElement {
  level: number;
  text: string;
  selector: string;
  id?: string;
  parent?: string;
}

export interface NavigationStructure {
  type: 'primary' | 'secondary' | 'breadcrumb' | 'pagination' | 'footer';
  selector: string;
  links: Array<{
    text: string;
    href: string;
    current?: boolean;
    external?: boolean;
  }>;
  label?: string;
}

export interface ContentSection {
  type: 'header' | 'article' | 'section' | 'aside' | 'footer' | 'unknown';
  selector: string;
  heading?: string;
  wordCount: number;
  hasMedia: boolean;
  components: string[];
}

export interface ComponentAnalysis {
  type: string;
  selector: string;
  category: 'layout' | 'content' | 'ui' | 'voice' | 'form' | 'media' | 'custom';
  properties: Record<string, any>;
  state: ComponentState;
  accessibility: ComponentAccessibility;
  interactions: ComponentInteraction[];
}

export interface ComponentState {
  visible: boolean;
  interactive: boolean;
  disabled: boolean;
  dynamic: boolean;
  hasErrors: boolean;
}

export interface ComponentAccessibility {
  hasLabel: boolean;
  labelText?: string;
  role?: string;
  focusable: boolean;
  keyboardAccessible: boolean;
  screenReaderFriendly: boolean;
  issues: string[];
}

export interface ComponentInteraction {
  type: 'click' | 'focus' | 'hover' | 'input' | 'submit' | 'custom';
  event: string;
  target?: string;
  description: string;
}

export interface InteractiveElement {
  type: 'button' | 'link' | 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'slider' | 'custom';
  selector: string;
  purpose: string;
  hasLabel: boolean;
  accessible: boolean;
  validationRules?: ValidationRule[];
  associatedForm?: string;
}

export interface ValidationRule {
  type: 'required' | 'pattern' | 'min' | 'max' | 'minlength' | 'maxlength' | 'email' | 'url' | 'custom';
  value: string | number;
  message?: string;
}

export interface AccessibilityFeatures {
  hasSkipLinks: boolean;
  hasLandmarks: boolean;
  hasHeadingStructure: boolean;
  focusManagement: FocusManagement;
  colorContrast: ContrastAnalysis;
  textAlternatives: MediaAccessibility;
}

export interface FocusManagement {
  hasVisibleFocus: boolean;
  tabOrder: TabOrderElement[];
  trapFocus: boolean;
  restoreFocus: boolean;
}

export interface TabOrderElement {
  selector: string;
  tabIndex: number;
  naturally_focusable: boolean;
}

export interface ContrastAnalysis {
  tested: boolean;
  passes: number;
  fails: number;
  ratio: number;
  level: 'AA' | 'AAA' | 'fail';
}

export interface MediaAccessibility {
  images: {
    total: number;
    withAlt: number;
    decorative: number;
    missing: number;
  };
  videos: {
    total: number;
    withCaptions: number;
    withTranscripts: number;
  };
  audio: {
    total: number;
    withTranscripts: number;
  };
}

export interface SemanticAnalysis {
  hasStructuredData: boolean;
  hasMetadata: boolean;
  contentType: 'article' | 'product' | 'service' | 'homepage' | 'landing' | 'unknown';
  entities: DetectedEntity[];
  topics: string[];
  readabilityScore: number;
}

export interface DetectedEntity {
  type: 'person' | 'organization' | 'place' | 'product' | 'event' | 'other';
  text: string;
  context: string;
  confidence: number;
}

export interface PerformanceMetrics {
  domSize: {
    elements: number;
    depth: number;
    complexity: 'low' | 'medium' | 'high';
  };
  criticalPath: {
    length: number;
    render_blocking: string[];
  };
  accessibility_performance: {
    landmarks_efficiency: number;
    navigation_efficiency: number;
  };
}

/**
 * DOM Analyzer class
 */
export class DomAnalyzer {
  private options: {
    includeInvisible: boolean;
    analyzePerformance: boolean;
    deepSemanticAnalysis: boolean;
  };

  constructor(_options: {
    includeInvisible?: boolean;
    analyzePerformance?: boolean;
    deepSemanticAnalysis?: boolean;
  } = {}) {
    this.options = {
      includeInvisible: _options.includeInvisible ?? false,
      analyzePerformance: _options.analyzePerformance ?? true,
      deepSemanticAnalysis: _options.deepSemanticAnalysis ?? true,
    };
  }

  /**
   * Analyze DOM structure
   */
  async analyzeDom(document: Document): Promise<DomAnalysisResult> {
    const structure = this.analyzePageStructure(document);
    const components = this.analyzeComponents(document);
    const interactiveElements = this.analyzeInteractiveElements(document);
    const accessibility = this.analyzeAccessibilityFeatures(document);
    const semantics = this.options.deepSemanticAnalysis ? this.analyzeSemantics(document) : this.getBasicSemantics(document);
    const performance = this.options.analyzePerformance ? this.analyzePerformance(document) : this.getBasicPerformance();
    const recommendations = this.generateRecommendations(structure, components, accessibility, semantics);

    return {
      structure,
      components,
      interactiveElements,
      accessibility,
      semantics,
      performance,
      recommendations
    };
  }

  /**
   * Analyze page structure
   */
  private analyzePageStructure(document: Document): PageStructure {
    const html = document.documentElement;
    const head = document.head;
    const body = document.body;

    // Basic page info
    const title = document.title || '';
    const description = head.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const language = html.getAttribute('lang') || 'en';
    const charset = head.querySelector('meta[charset]')?.getAttribute('charset') || 'UTF-8';
    const viewport = head.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';

    // Analyze landmarks
    const landmarks = this.analyzeLandmarks(body);

    // Analyze heading hierarchy
    const headingHierarchy = this.analyzeHeadingHierarchy(body);

    // Analyze navigation
    const navigation = this.analyzeNavigation(body);

    // Analyze content sections
    const contentSections = this.analyzeContentSections(body);

    return {
      title,
      description,
      language,
      charset,
      viewport,
      landmarks,
      headingHierarchy,
      navigation,
      contentSections
    };
  }

  /**
   * Analyze landmarks
   */
  private analyzeLandmarks(body: Element): LandmarkRegion[] {
    const landmarks: LandmarkRegion[] = [];
    const landmarkSelectors = {
      'banner': ['header[role="banner"]', 'header:not([role]):first-of-type', '[role="banner"]'],
      'navigation': ['nav', '[role="navigation"]'],
      'main': ['main', '[role="main"]'],
      'complementary': ['aside', '[role="complementary"]'],
      'contentinfo': ['footer[role="contentinfo"]', 'footer:not([role]):last-of-type', '[role="contentinfo"]'],
      'search': ['[role="search"]', 'form[role="search"]'],
      'form': ['[role="form"]'],
      'region': ['[role="region"]']
    };

    for (const [type, selectors] of Object.entries(landmarkSelectors)) {
      for (const selector of selectors) {
        const elements = body.querySelectorAll(selector);
        elements.forEach(element => {
          const label = element.getAttribute('aria-label') ||
                       element.getAttribute('aria-labelledby') ||
                       element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim();

          const landmark: LandmarkRegion = {
            type: type as LandmarkRegion['type'],
            selector: this.generateSelector(element),
            nested: this.isNestedLandmark(element, landmarks)
          };

          if (label) {
            landmark.label = label;
          }

          landmarks.push(landmark);
        });
      }
    }

    return landmarks;
  }

  /**
   * Analyze heading hierarchy
   */
  private analyzeHeadingHierarchy(body: Element): HeadingElement[] {
    const headings: HeadingElement[] = [];
    const headingElements = body.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');

    headingElements.forEach(element => {
      let level: number;

      if (element.hasAttribute('role') && element.getAttribute('role') === 'heading') {
        level = parseInt(element.getAttribute('aria-level') || '1');
      } else {
        level = parseInt(element.tagName.charAt(1));
      }

      const heading: HeadingElement = {
        level,
        text: element.textContent?.trim() || '',
        selector: this.generateSelector(element)
      };

      if (element.id) {
        heading.id = element.id;
      }

      const parent = this.findParentSection(element);
      if (parent) {
        heading.parent = parent;
      }

      headings.push(heading);
    });

    return headings;
  }

  /**
   * Analyze navigation structures
   */
  private analyzeNavigation(body: Element): NavigationStructure[] {
    const navigation: NavigationStructure[] = [];
    const navElements = body.querySelectorAll('nav, [role="navigation"]');

    navElements.forEach(nav => {
      const links = Array.from(nav.querySelectorAll('a[href]')).map(link => ({
        text: link.textContent?.trim() || '',
        href: link.getAttribute('href') || '',
        current: link.getAttribute('aria-current') === 'page' || link.classList.contains('current'),
        external: this.isExternalLink(link.getAttribute('href') || '')
      }));

      // Determine navigation type
      let type: NavigationStructure['type'] = 'secondary';
      if (nav.closest('header')) {
        type = 'primary';
      } else if (nav.closest('footer')) {
        type = 'footer';
      } else if (nav.classList.contains('breadcrumb') || nav.getAttribute('aria-label')?.includes('breadcrumb')) {
        type = 'breadcrumb';
      } else if (nav.classList.contains('pagination') || nav.querySelector('.pagination')) {
        type = 'pagination';
      }

      const navStructure: NavigationStructure = {
        type,
        selector: this.generateSelector(nav),
        links
      };

      const ariaLabel = nav.getAttribute('aria-label');
      if (ariaLabel) {
        navStructure.label = ariaLabel;
      }

      navigation.push(navStructure);
    });

    return navigation;
  }

  /**
   * Analyze content sections
   */
  private analyzeContentSections(body: Element): ContentSection[] {
    const sections: ContentSection[] = [];
    const sectionElements = body.querySelectorAll('header, main, article, section, aside, footer');

    sectionElements.forEach(section => {
      const type = this.determineSectionType(section);
      const heading = section.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim();
      const textContent = section.textContent || '';
      const wordCount = textContent.split(/\s+/).filter(word => word.length > 0).length;
      const hasMedia = section.querySelectorAll('img, video, audio, canvas, svg').length > 0;
      const components = this.identifySectionComponents(section);

      const contentSection: ContentSection = {
        type,
        selector: this.generateSelector(section),
        wordCount,
        hasMedia,
        components
      };

      if (heading) {
        contentSection.heading = heading;
      }

      sections.push(contentSection);
    });

    return sections;
  }

  /**
   * Analyze components
   */
  private analyzeComponents(document: Document): ComponentAnalysis[] {
    const components: ComponentAnalysis[] = [];

    // Define component patterns
    const componentPatterns = [
      { type: 'Button', selector: 'button, [role="button"], input[type="button"], input[type="submit"]', category: 'ui' },
      { type: 'Form', selector: 'form', category: 'form' },
      { type: 'Modal', selector: '[role="dialog"], .modal, .popup', category: 'ui' },
      { type: 'Carousel', selector: '.carousel, .slider, [role="region"][aria-roledescription*="carousel"]', category: 'ui' },
      { type: 'Tab', selector: '[role="tablist"], .tabs', category: 'ui' },
      { type: 'Accordion', selector: '.accordion, [data-accordion]', category: 'ui' },
      { type: 'Table', selector: 'table, [role="table"]', category: 'content' },
      { type: 'List', selector: 'ul, ol, [role="list"]', category: 'content' },
      { type: 'Card', selector: '.card, .product-card, article', category: 'content' },
      { type: 'Image', selector: 'img, picture, [role="img"]', category: 'media' },
      { type: 'Video', selector: 'video, [data-video]', category: 'media' },
      { type: 'Navigation', selector: 'nav, [role="navigation"]', category: 'layout' },
      { type: 'Header', selector: 'header, [role="banner"]', category: 'layout' },
      { type: 'Footer', selector: 'footer, [role="contentinfo"]', category: 'layout' },
      { type: 'Search', selector: '[role="search"], .search-form', category: 'ui' }
    ];

    for (const pattern of componentPatterns) {
      const elements = document.querySelectorAll(pattern.selector);

      elements.forEach(element => {
        const analysis = this.analyzeComponent(element, pattern.type, pattern.category as ComponentAnalysis['category']);
        // Filter invisible components if not included
        if (this.options.includeInvisible || analysis.state.visible) {
          components.push(analysis);
        }
      });
    }

    return components;
  }

  /**
   * Analyze individual component
   */
  private analyzeComponent(element: Element, type: string, category: ComponentAnalysis['category']): ComponentAnalysis {
    const selector = this.generateSelector(element);
    const properties = this.extractComponentProperties(element);
    const state = this.analyzeComponentState(element);
    const accessibility = this.analyzeComponentAccessibility(element);
    const interactions = this.analyzeComponentInteractions(element);

    return {
      type,
      selector,
      category,
      properties,
      state,
      accessibility,
      interactions
    };
  }

  /**
   * Analyze interactive elements
   */
  private analyzeInteractiveElements(document: Document): InteractiveElement[] {
    const elements: InteractiveElement[] = [];
    const interactiveSelectors = [
      'button', '[role="button"]', 'input', 'select', 'textarea', 'a[href]',
      '[tabindex]', '[onclick]', '[role="tab"]', '[role="menuitem"]'
    ];

    for (const selector of interactiveSelectors) {
      const domElements = document.querySelectorAll(selector);

      domElements.forEach(element => {
        const analysis = this.analyzeInteractiveElement(element);
        if (analysis) {
          elements.push(analysis);
        }
      });
    }

    return elements;
  }

  /**
   * Analyze individual interactive element
   */
  private analyzeInteractiveElement(element: Element): InteractiveElement | null {
    const type = this.determineInteractiveType(element);

    if (!type) {return null;}

    const selector = this.generateSelector(element);
    const purpose = this.determineElementPurpose(element);
    const hasLabel = this.hasAccessibleLabel(element);
    const accessible = this.isElementAccessible(element);
    const validationRules = this.extractValidationRules(element);
    const associatedForm = element.closest('form') ? this.generateSelector(element.closest('form')!) : undefined;

    const interactiveElement: InteractiveElement = {
      type,
      selector,
      purpose,
      hasLabel,
      accessible
    };

    if (validationRules && validationRules.length > 0) {
      interactiveElement.validationRules = validationRules;
    }

    if (associatedForm) {
      interactiveElement.associatedForm = associatedForm;
    }

    return interactiveElement;
  }

  /**
   * Analyze accessibility features
   */
  private analyzeAccessibilityFeatures(document: Document): AccessibilityFeatures {
    const hasSkipLinks = document.querySelector('a[href^="#"], .skip-link') !== null;
    const hasLandmarks = document.querySelectorAll('main, nav, header, footer, aside, [role]').length > 0;
    const hasHeadingStructure = document.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0;

    const focusManagement = this.analyzeFocusManagement(document);
    const colorContrast = this.analyzeColorContrast(document);
    const textAlternatives = this.analyzeTextAlternatives(document);

    return {
      hasSkipLinks,
      hasLandmarks,
      hasHeadingStructure,
      focusManagement,
      colorContrast,
      textAlternatives
    };
  }

  /**
   * Analyze semantics
   */
  private analyzeSemantics(document: Document): SemanticAnalysis {
    const hasStructuredData = document.querySelector('script[type="application/ld+json"]') !== null;
    const hasMetadata = document.querySelectorAll('meta[property], meta[name]').length > 0;
    const contentType = this.determineContentType(document);
    const entities = this.detectEntities(document);
    const topics = this.extractTopics(document);
    const readabilityScore = this.calculateReadabilityScore(document);

    return {
      hasStructuredData,
      hasMetadata,
      contentType,
      entities,
      topics,
      readabilityScore
    };
  }

  /**
   * Analyze performance
   */
  private analyzePerformance(document: Document): PerformanceMetrics {
    const elements = document.querySelectorAll('*').length;
    const depth = this.calculateDomDepth(document.body);
    const complexity = elements > 1500 ? 'high' : elements > 800 ? 'medium' : 'low';

    const renderBlocking = Array.from(document.querySelectorAll('link[rel="stylesheet"], script[src]:not([async]):not([defer])'))
      .map(el => el.getAttribute('href') || el.getAttribute('src') || '');

    const landmarksEfficiency = this.calculateLandmarkEfficiency(document);
    const navigationEfficiency = this.calculateNavigationEfficiency(document);

    return {
      domSize: {
        elements,
        depth,
        complexity
      },
      criticalPath: {
        length: renderBlocking.length,
        render_blocking: renderBlocking
      },
      accessibility_performance: {
        landmarks_efficiency: landmarksEfficiency,
        navigation_efficiency: navigationEfficiency
      }
    };
  }

  /**
   * Helper methods
   */
  private generateSelector(element: Element): string {
    // Generate a unique CSS selector for the element
    if (element.id) {
      return `#${element.id}`;
    }

    const tagName = element.tagName.toLowerCase();
    const classes = Array.from(element.classList).slice(0, 2).join('.');

    if (classes) {
      return `${tagName}.${classes}`;
    }

    // Fallback to nth-child selector
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element) + 1;
      return `${tagName}:nth-child(${index})`;
    }

    return tagName;
  }

  private isNestedLandmark(element: Element, existingLandmarks: LandmarkRegion[]): boolean {
    const parent = element.parentElement;
    if (!parent) {return false;}

    return existingLandmarks.some(landmark => {
      const landmarkElement = document.querySelector(landmark.selector);
      return landmarkElement && landmarkElement.contains(element) && landmarkElement !== element;
    });
  }

  private findParentSection(element: Element): string | undefined {
    const parent = element.closest('section, article, main, header, footer, aside');
    return parent ? this.generateSelector(parent) : undefined;
  }

  private isExternalLink(href: string): boolean {
    try {
      const url = new URL(href, window.location.href);
      return url.hostname !== window.location.hostname;
    } catch {
      return false;
    }
  }

  private determineSectionType(element: Element): ContentSection['type'] {
    const tagName = element.tagName.toLowerCase();
    if (['header', 'article', 'section', 'aside', 'footer'].includes(tagName)) {
      return tagName as ContentSection['type'];
    }
    return 'unknown';
  }

  private identifySectionComponents(section: Element): string[] {
    const components: string[] = [];

    if (section.querySelector('form')) {components.push('form');}
    if (section.querySelector('img, picture')) {components.push('image');}
    if (section.querySelector('video')) {components.push('video');}
    if (section.querySelector('button, [role="button"]')) {components.push('button');}
    if (section.querySelector('table')) {components.push('table');}
    if (section.querySelector('ul, ol')) {components.push('list');}
    if (section.querySelector('[role="dialog"]')) {components.push('modal');}
    if (section.querySelector('.carousel, .slider')) {components.push('carousel');}

    return components;
  }

  private extractComponentProperties(element: Element): Record<string, any> {
    const properties: Record<string, any> = {};

    // Extract common properties
    properties['id'] = (element as any)['id'] || null;
    properties['classes'] = Array.from((element as any)['classList'] || []);
    properties['role'] = element.getAttribute('role') || null;
    properties['ariaLabel'] = element.getAttribute('aria-label') || null;
    properties['hidden'] = element.hasAttribute('hidden') || ((element as HTMLElement).style?.display === 'none');
    properties['disabled'] = element.hasAttribute('disabled');

    // Extract specific properties based on element type
    if (element.tagName.toLowerCase() === 'form') {
      properties['method'] = element.getAttribute('method') || 'GET';
      properties['action'] = element.getAttribute('action') || '';
      properties['novalidate'] = element.hasAttribute('novalidate');
    }

    if (element.tagName.toLowerCase() === 'input') {
      properties['type'] = element.getAttribute('type') || 'text';
      properties['required'] = element.hasAttribute('required');
      properties['pattern'] = element.getAttribute('pattern') || null;
    }

    return properties;
  }

  private analyzeComponentState(element: Element): ComponentState {
    const computedStyle = window.getComputedStyle(element);
    const visible = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
    const interactive = element.matches('a, button, input, select, textarea, [tabindex], [onclick], [role="button"]');
    const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
    const dynamic = element.hasAttribute('data-dynamic') || element.classList.contains('dynamic');
    const hasErrors = element.classList.contains('error') || element.getAttribute('aria-invalid') === 'true';

    return {
      visible,
      interactive,
      disabled,
      dynamic,
      hasErrors
    };
  }

  private analyzeComponentAccessibility(element: Element): ComponentAccessibility {
    const hasLabel = this.hasAccessibleLabel(element);
    const labelText = this.getAccessibleLabel(element);
    const role = element.getAttribute('role') || null;
    const focusable = element.matches('[tabindex], a, button, input, select, textarea') ||
                     parseInt(element.getAttribute('tabindex') || '-1') >= 0;
    const keyboardAccessible = focusable && !element.hasAttribute('disabled');
    const screenReaderFriendly = hasLabel && !element.hasAttribute('aria-hidden');
    const issues: string[] = [];

    if (!hasLabel && element.matches('button, input, select, textarea')) {
      issues.push('Missing accessible label');
    }

    if (focusable && !keyboardAccessible) {
      issues.push('Not keyboard accessible');
    }

    const result: ComponentAccessibility = {
      hasLabel,
      focusable,
      keyboardAccessible,
      screenReaderFriendly,
      issues
    };

    if (labelText) {
      result.labelText = labelText;
    }

    if (role) {
      result.role = role;
    }

    return result;
  }

  private analyzeComponentInteractions(element: Element): ComponentInteraction[] {
    const interactions: ComponentInteraction[] = [];

    // Check for common event handlers
    if (element.hasAttribute('onclick')) {
      interactions.push({
        type: 'click',
        event: 'click',
        description: 'Click handler attached'
      });
    }

    if (element.matches('a[href]')) {
      interactions.push({
        type: 'click',
        event: 'click',
        target: element.getAttribute('href') || '',
        description: 'Navigation link'
      });
    }

    if (element.matches('form')) {
      interactions.push({
        type: 'submit',
        event: 'submit',
        target: element.getAttribute('action') || '',
        description: 'Form submission'
      });
    }

    if (element.matches('input, select, textarea')) {
      interactions.push({
        type: 'input',
        event: 'input',
        description: 'User input handling'
      });
    }

    return interactions;
  }

  private determineInteractiveType(element: Element): InteractiveElement['type'] | null {
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute('type');
    const role = element.getAttribute('role');

    if (tagName === 'button' || role === 'button') {return 'button';}
    if (tagName === 'a' && element.hasAttribute('href')) {return 'link';}
    if (tagName === 'input') {
      if (type === 'checkbox') {return 'checkbox';}
      if (type === 'radio') {return 'radio';}
      if (type === 'range') {return 'slider';}
      return 'input';
    }
    if (tagName === 'select') {return 'select';}
    if (tagName === 'textarea') {return 'textarea';}
    if (role === 'slider') {return 'slider';}

    return null;
  }

  private determineElementPurpose(element: Element): string {
    const aria_label = element.getAttribute('aria-label');
    if (aria_label) {return aria_label;}

    const text_content = element.textContent?.trim();
    if (text_content && text_content.length < 50) {return text_content;}

    const type = element.getAttribute('type');
    if (type) {return `${type} input`;}

    const tagName = element.tagName.toLowerCase();
    return `${tagName} element`;
  }

  private hasAccessibleLabel(element: Element): boolean {
    return !!(
      element.getAttribute('aria-label') ||
      element.getAttribute('aria-labelledby') ||
      element.getAttribute('title') ||
      (element.tagName.toLowerCase() === 'input' && element.closest('label')) ||
      element.textContent?.trim()
    );
  }

  private getAccessibleLabel(element: Element): string | undefined {
    return element.getAttribute('aria-label') ||
           element.getAttribute('title') ||
           element.textContent?.trim() ||
           undefined;
  }

  private isElementAccessible(element: Element): boolean {
    return this.hasAccessibleLabel(element) &&
           !element.hasAttribute('aria-hidden') &&
           !element.hasAttribute('disabled');
  }

  private extractValidationRules(element: Element): ValidationRule[] | undefined {
    if (element.tagName.toLowerCase() !== 'input') {return undefined;}

    const rules: ValidationRule[] = [];

    if (element.hasAttribute('required')) {
      rules.push({ type: 'required', value: 'true' });
    }

    const pattern = element.getAttribute('pattern');
    if (pattern) {
      rules.push({ type: 'pattern', value: pattern });
    }

    const min = element.getAttribute('min');
    if (min) {
      rules.push({ type: 'min', value: parseFloat(min) });
    }

    const max = element.getAttribute('max');
    if (max) {
      rules.push({ type: 'max', value: parseFloat(max) });
    }

    const minlength = element.getAttribute('minlength');
    if (minlength) {
      rules.push({ type: 'minlength', value: parseInt(minlength) });
    }

    const maxlength = element.getAttribute('maxlength');
    if (maxlength) {
      rules.push({ type: 'maxlength', value: parseInt(maxlength) });
    }

    const type = element.getAttribute('type');
    if (type === 'email') {
      rules.push({ type: 'email', value: 'email' });
    } else if (type === 'url') {
      rules.push({ type: 'url', value: 'url' });
    }

    return rules.length > 0 ? rules : undefined;
  }

  private analyzeFocusManagement(document: Document): FocusManagement {
    const focusableElements = document.querySelectorAll('[tabindex], a, button, input, select, textarea');
    const hasVisibleFocus = Array.from(focusableElements).some(el => {
      const style = window.getComputedStyle(el);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    });

    const tabOrder: TabOrderElement[] = Array.from(focusableElements).map(element => ({
      selector: this.generateSelector(element),
      tabIndex: parseInt(element.getAttribute('tabindex') || '0'),
      naturally_focusable: element.matches('a[href], button, input, select, textarea')
    }));

    return {
      hasVisibleFocus,
      tabOrder,
      trapFocus: false, // Would require runtime analysis
      restoreFocus: false // Would require runtime analysis
    };
  }

  private analyzeColorContrast(_document: Document): ContrastAnalysis {
    // Basic implementation - would need color analysis library for full implementation
    return {
      tested: false,
      passes: 0,
      fails: 0,
      ratio: 0,
      level: 'fail'
    };
  }

  private analyzeTextAlternatives(document: Document): MediaAccessibility {
    const images = document.querySelectorAll('img');
    const videos = document.querySelectorAll('video');
    const audios = document.querySelectorAll('audio');

    return {
      images: {
        total: images.length,
        withAlt: Array.from(images).filter(img => img.hasAttribute('alt')).length,
        decorative: Array.from(images).filter(img => img.getAttribute('alt') === '').length,
        missing: Array.from(images).filter(img => !img.hasAttribute('alt')).length
      },
      videos: {
        total: videos.length,
        withCaptions: Array.from(videos).filter(video => video.querySelector('track[kind="captions"]')).length,
        withTranscripts: 0 // Would need content analysis
      },
      audio: {
        total: audios.length,
        withTranscripts: 0 // Would need content analysis
      }
    };
  }

  private determineContentType(document: Document): SemanticAnalysis['contentType'] {
    // Analyze page structure and content to determine type
    if (document.querySelector('article, [role="article"]')) {return 'article';}
    if (document.querySelector('[itemscope][itemtype*="Product"]')) {return 'product';}
    if (document.querySelector('main h1')?.textContent?.toLowerCase().includes('service')) {return 'service';}
    if (document.title.toLowerCase().includes('home')) {return 'homepage';}

    return 'unknown';
  }

  private detectEntities(_document: Document): DetectedEntity[] {
    // Basic entity detection - would need NLP library for full implementation
    return [];
  }

  private extractTopics(document: Document): string[] {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const topics = headings
      .map(h => h.textContent?.trim())
      .filter(text => text && text.length > 3)
      .slice(0, 10);

    return topics as string[];
  }

  private calculateReadabilityScore(_document: Document): number {
    // Basic implementation - would need text analysis for full implementation
    return 50; // Placeholder
  }

  private calculateDomDepth(element: Element): number {
    let maxDepth = 0;

    function traverse(el: Element, depth: number) {
      maxDepth = Math.max(maxDepth, depth);
      for (const child of Array.from(el.children)) {
        traverse(child, depth + 1);
      }
    }

    traverse(element, 0);
    return maxDepth;
  }

  private calculateLandmarkEfficiency(document: Document): number {
    const landmarks = document.querySelectorAll('main, nav, header, footer, aside, [role]');
    const totalElements = document.querySelectorAll('*').length;
    return totalElements > 0 ? (landmarks.length / totalElements) * 100 : 0;
  }

  private calculateNavigationEfficiency(document: Document): number {
    const navElements = document.querySelectorAll('nav, [role="navigation"]');
    const links = document.querySelectorAll('a[href]');
    return links.length > 0 ? (navElements.length / links.length) * 100 : 0;
  }

  private generateRecommendations(
    structure: PageStructure,
    components: ComponentAnalysis[],
    accessibility: AccessibilityFeatures,
    semantics: SemanticAnalysis
  ): string[] {
    const recommendations: string[] = [];

    if (structure.landmarks.length === 0) {
      recommendations.push('Add landmark regions (main, nav, header, footer) for better accessibility');
    }

    if (structure.headingHierarchy.length === 0) {
      recommendations.push('Add heading structure (h1-h6) to organize content hierarchically');
    }

    if (!accessibility.hasSkipLinks) {
      recommendations.push('Consider adding skip links for keyboard navigation');
    }

    if (!semantics.hasStructuredData) {
      recommendations.push('Add structured data (JSON-LD) for better search engine understanding');
    }

    const formComponents = components.filter(c => c.category === 'form');
    const invalidFormComponents = formComponents.filter(c => c.accessibility.issues.length > 0);
    if (invalidFormComponents.length > 0) {
      recommendations.push('Improve form accessibility by adding proper labels and descriptions');
    }

    if (accessibility.textAlternatives.images.missing > 0) {
      recommendations.push('Add alt text to all images for screen reader accessibility');
    }

    return recommendations;
  }

  /**
   * Get basic semantic analysis when deep analysis is disabled
   */
  private getBasicSemantics(document: Document): SemanticAnalysis {
    return {
      hasStructuredData: !!document.querySelector('script[type="application/ld+json"]'),
      hasMetadata: !!document.querySelector('meta[name="description"]'),
      contentType: 'unknown',
      entities: [],
      topics: [],
      readabilityScore: 0
    };
  }

  /**
   * Get basic performance metrics when performance analysis is disabled
   */
  private getBasicPerformance(): PerformanceMetrics {
    return {
      domSize: {
        elements: 0,
        depth: 0,
        complexity: 'low'
      },
      criticalPath: {
        length: 0,
        render_blocking: []
      },
      accessibility_performance: {
        landmarks_efficiency: 0,
        navigation_efficiency: 0
      }
    };
  }
}

// Export singleton instance
export const domAnalyzer = new DomAnalyzer();

// Export factory function
export function createDomAnalyzer(options?: {
  includeInvisible?: boolean;
  analyzePerformance?: boolean;
  deepSemanticAnalysis?: boolean;
}): DomAnalyzer {
  return new DomAnalyzer(options);
}