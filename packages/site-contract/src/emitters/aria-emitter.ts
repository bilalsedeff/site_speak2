import { JSDOM } from 'jsdom';
import { 
  EnhancedAriaAuditReport,
  EnhancedAriaIssue,
  AriaLandmark,
  AccessibilityMetrics,
  ComponentContract 
} from '../types/contract-types';

/**
 * ARIA emitter for generating comprehensive accessibility audit reports
 * 
 * Analyzes ARIA compliance, semantic structure, keyboard navigation,
 * and generates actionable accessibility recommendations.
 */
export class AriaEmitter {
  private baseUrl: string;
  private strict: boolean;

  constructor(baseUrl: string, options: { strict?: boolean } = {}) {
    this.baseUrl = baseUrl;
    this.strict = options.strict ?? false;
    // Note: strict mode for future use in validation
    void this.strict;
  }

  /**
   * Generate comprehensive ARIA audit report for all pages
   */
  async generateAriaAuditReport(
    pages: Record<string, string>, // pageUrl -> HTML content
    components: Record<string, ComponentContract>
  ): Promise<EnhancedAriaAuditReport> {
    const issues: EnhancedAriaIssue[] = [];
    const landmarks: AriaLandmark[] = [];
    const pageMetrics: Record<string, AccessibilityMetrics> = {};
    
    for (const [pageUrl, htmlContent] of Object.entries(pages)) {
      try {
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        
        // Analyze page accessibility
        const pageIssues = await this.auditPage(pageUrl, document, components);
        const pageLandmarks = this.extractLandmarks(pageUrl, document);
        const metrics = this.calculateAccessibilityMetrics(document, pageIssues);
        
        issues.push(...pageIssues);
        landmarks.push(...pageLandmarks);
        pageMetrics[pageUrl] = metrics;
        
      } catch (error) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'page-processing',
          message: `Failed to process page ${pageUrl}`,
          pageUrl,
          element: null,
          wcagLevel: 'A',
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }
    
    // Generate overall statistics and recommendations
    const overallMetrics = this.calculateOverallMetrics(pageMetrics);
    const recommendations = this.generateRecommendations(issues, overallMetrics);
    
    return {
      issues,
      landmarks,
      pageMetrics,
      overallMetrics,
      recommendations,
      auditedAt: new Date(),
      baseUrl: this.baseUrl,
      wcagVersion: '2.1',
      complianceLevel: this.calculateComplianceLevel(issues)
    };
  }

  /**
   * Audit individual page for accessibility issues
   */
  private async auditPage(
    pageUrl: string,
    document: Document,
    components: Record<string, ComponentContract>
  ): Promise<EnhancedAriaIssue[]> {
    const issues: EnhancedAriaIssue[] = [];
    
    // Core ARIA and semantic audits
    issues.push(...this.auditAriaLabels(pageUrl, document));
    issues.push(...this.auditHeadingStructure(pageUrl, document));
    issues.push(...this.auditLandmarks(pageUrl, document));
    issues.push(...this.auditForms(pageUrl, document));
    issues.push(...this.auditImages(pageUrl, document));
    issues.push(...this.auditLinks(pageUrl, document));
    issues.push(...this.auditKeyboardNavigation(pageUrl, document));
    issues.push(...this.auditColorContrast(pageUrl, document));
    issues.push(...this.auditFocusManagement(pageUrl, document));
    
    // Component-specific accessibility audits
    issues.push(...this.auditComponents(pageUrl, document, components));
    
    return issues;
  }

  /**
   * Audit ARIA labels and descriptions
   */
  private auditAriaLabels(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // Elements that should have accessible names
    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="menuitem"]'
    );
    
    interactiveElements.forEach((element, index) => {
      const hasAccessibleName = this.hasAccessibleName(element);
      
      if (!hasAccessibleName) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'accessible-name',
          message: `Interactive element missing accessible name`,
          pageUrl,
          element: this.getElementSelector(element, index),
          wcagLevel: 'A',
          details: {
            tagName: element.tagName.toLowerCase(),
            role: element.getAttribute('role'),
            hasAriaLabel: element.hasAttribute('aria-label'),
            hasAriaLabelledby: element.hasAttribute('aria-labelledby')
          }
        });
      }
    });
    
    // Check for aria-labelledby references
    document.querySelectorAll('[aria-labelledby]').forEach((element, index) => {
      const labelledbyIds = element.getAttribute('aria-labelledby')?.split(/\s+/) || [];
      const missingIds = labelledbyIds.filter(id => !document.getElementById(id));
      
      if (missingIds.length > 0) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'aria-labelledby-references',
          message: `aria-labelledby references non-existent IDs: ${missingIds.join(', ')}`,
          pageUrl,
          element: this.getElementSelector(element, index),
          wcagLevel: 'A',
          details: { missingIds }
        });
      }
    });
    
    return issues;
  }

  /**
   * Audit heading structure for proper hierarchy
   */
  private auditHeadingStructure(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    
    if (headings.length === 0) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        rule: 'heading-structure',
        message: 'Page has no headings',
        pageUrl,
        element: null,
        wcagLevel: 'AA',
        details: { headingCount: 0 }
      });
      return issues;
    }
    
    // Check for H1
    const h1Elements = headings.filter(h => h.tagName === 'H1');
    if (h1Elements.length === 0) {
      issues.push({
        type: 'error',
        severity: 'high',
        rule: 'heading-h1',
        message: 'Page missing H1 element',
        pageUrl,
        element: null,
        wcagLevel: 'AA',
        details: { hasH1: false }
      });
    } else if (h1Elements.length > 1) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        rule: 'heading-h1-multiple',
        message: `Page has ${h1Elements.length} H1 elements, should have only one`,
        pageUrl,
        element: null,
        wcagLevel: 'AA',
        details: { h1Count: h1Elements.length }
      });
    }
    
    // Check heading hierarchy
    let previousLevel = 0;
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      
      if (level > previousLevel + 1) {
        issues.push({
          type: 'warning',
          severity: 'medium',
          rule: 'heading-hierarchy',
          message: `Heading level ${level} skips levels (previous was ${previousLevel})`,
          pageUrl,
          element: this.getElementSelector(heading, index),
          wcagLevel: 'AA',
          details: { level, previousLevel }
        });
      }
      
      // Check for empty headings
      if (!heading.textContent?.trim()) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'heading-empty',
          message: 'Heading element is empty',
          pageUrl,
          element: this.getElementSelector(heading, index),
          wcagLevel: 'A',
          details: { level }
        });
      }
      
      previousLevel = Math.max(previousLevel, level);
    });
    
    return issues;
  }

  /**
   * Audit ARIA landmarks for proper page structure
   */
  private auditLandmarks(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // Check for essential landmarks
    const essentialLandmarks = ['main', 'navigation', 'banner'];
    const presentLandmarks = new Set<string>();
    
    // Find landmarks by role and semantic elements
    const landmarkSelectors = [
      'main, [role="main"]',
      'nav, [role="navigation"]', 
      'header, [role="banner"]',
      'footer, [role="contentinfo"]',
      'aside, [role="complementary"]',
      '[role="search"]'
    ];
    
    landmarkSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const role = element.getAttribute('role') || this.getImplicitRole(element);
        if (role) {presentLandmarks.add(role);}
      });
    });
    
    // Check for missing essential landmarks
    essentialLandmarks.forEach(landmark => {
      if (!presentLandmarks.has(landmark)) {
        issues.push({
          type: 'warning',
          severity: 'medium',
          rule: 'landmark-missing',
          message: `Page missing ${landmark} landmark`,
          pageUrl,
          element: null,
          wcagLevel: 'AA',
          details: { missingLandmark: landmark }
        });
      }
    });
    
    // Check for multiple main landmarks
    const mainElements = document.querySelectorAll('main, [role="main"]');
    if (mainElements.length > 1) {
      issues.push({
        type: 'error',
        severity: 'high',
        rule: 'landmark-main-multiple',
        message: `Page has ${mainElements.length} main landmarks, should have only one`,
        pageUrl,
        element: null,
        wcagLevel: 'A',
        details: { mainCount: mainElements.length }
      });
    }
    
    return issues;
  }

  /**
   * Audit form accessibility
   */
  private auditForms(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    document.querySelectorAll('input, select, textarea').forEach((input, index) => {
      const type = input.getAttribute('type');
      
      // Skip hidden inputs
      if (type === 'hidden') {return;}
      
      // Check for labels
      const hasLabel = this.hasAssociatedLabel(input);
      if (!hasLabel && type !== 'submit' && type !== 'button' && type !== 'reset') {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'form-label',
          message: 'Form control missing associated label',
          pageUrl,
          element: this.getElementSelector(input, index),
          wcagLevel: 'A',
          details: {
            tagName: input.tagName.toLowerCase(),
            type: type || 'text',
            hasId: input.hasAttribute('id'),
            hasAriaLabel: input.hasAttribute('aria-label')
          }
        });
      }
      
      // Check required fields have proper indication
      if (input.hasAttribute('required')) {
        const hasRequiredIndication = input.hasAttribute('aria-required') || 
          input.getAttribute('aria-label')?.includes('required') ||
          this.findAssociatedText(input)?.includes('*');
          
        if (!hasRequiredIndication) {
          issues.push({
            type: 'warning',
            severity: 'medium',
            rule: 'form-required-indication',
            message: 'Required field not clearly indicated to screen readers',
            pageUrl,
            element: this.getElementSelector(input, index),
            wcagLevel: 'AA',
            details: { hasRequired: true, hasAriaRequired: input.hasAttribute('aria-required') }
          });
        }
      }
    });
    
    return issues;
  }

  /**
   * Audit image accessibility
   */
  private auditImages(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    document.querySelectorAll('img').forEach((img, index) => {
      const src = img.getAttribute('src');
      const alt = img.getAttribute('alt');
      const hasAlt = img.hasAttribute('alt');
      
      // Check for alt attribute
      if (!hasAlt) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'image-alt',
          message: 'Image missing alt attribute',
          pageUrl,
          element: this.getElementSelector(img, index),
          wcagLevel: 'A',
          details: { src: src || 'unknown' }
        });
      } else if (alt && alt === src) {
        // Alt text should not be the filename
        issues.push({
          type: 'warning',
          severity: 'medium',
          rule: 'image-alt-filename',
          message: 'Alt text appears to be filename',
          pageUrl,
          element: this.getElementSelector(img, index),
          wcagLevel: 'A',
          details: { alt, src: src || 'unknown' }
        });
      }
    });
    
    return issues;
  }

  /**
   * Audit link accessibility
   */
  private auditLinks(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    document.querySelectorAll('a').forEach((link, index) => {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim();
      const hasText = !!text && text.length > 0;
      
      // Check for link text
      if (!hasText && !this.hasAccessibleName(link)) {
        issues.push({
          type: 'error',
          severity: 'high',
          rule: 'link-text',
          message: 'Link missing accessible text',
          pageUrl,
          element: this.getElementSelector(link, index),
          wcagLevel: 'A',
          details: { href: href || 'unknown' }
        });
      }
      
      // Check for generic link text
      if (text && ['click here', 'read more', 'learn more', 'more'].includes(text.toLowerCase())) {
        issues.push({
          type: 'warning',
          severity: 'medium',
          rule: 'link-text-generic',
          message: 'Link uses generic text that may not be meaningful out of context',
          pageUrl,
          element: this.getElementSelector(link, index),
          wcagLevel: 'AA',
          details: { text, href: href || 'unknown' }
        });
      }
      
      // Check for external links
      if (href && this.isExternalLink(href)) {
        const hasExternalIndicator = link.hasAttribute('aria-label') || 
          link.querySelector('[aria-label*="external"]') ||
          text?.includes('(external)');
          
        if (!hasExternalIndicator) {
          issues.push({
            type: 'info',
            severity: 'low',
            rule: 'link-external-indication',
            message: 'External link not clearly indicated to screen readers',
            pageUrl,
            element: this.getElementSelector(link, index),
            wcagLevel: 'AAA',
            details: { href, isExternal: true }
          });
        }
      }
    });
    
    return issues;
  }

  /**
   * Audit keyboard navigation
   */
  private auditKeyboardNavigation(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // Check for focusable elements
    const focusableElements = document.querySelectorAll(
      'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    // Check for positive tabindex values (anti-pattern)
    document.querySelectorAll('[tabindex]').forEach((element, index) => {
      const tabindex = parseInt(element.getAttribute('tabindex') || '0');
      if (tabindex > 0) {
        issues.push({
          type: 'warning',
          severity: 'medium',
          rule: 'keyboard-tabindex-positive',
          message: 'Positive tabindex values can create confusing tab order',
          pageUrl,
          element: this.getElementSelector(element, index),
          wcagLevel: 'A',
          details: { tabindex }
        });
      }
    });
    
    // Check for skip links
    const skipLinks = document.querySelectorAll('a[href^="#"]');
    const hasSkipToMain = Array.from(skipLinks).some(link => 
      link.textContent?.toLowerCase().includes('skip to main') ||
      link.textContent?.toLowerCase().includes('skip to content')
    );
    
    if (!hasSkipToMain && focusableElements.length > 10) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        rule: 'keyboard-skip-link',
        message: 'Page with many focusable elements should have skip links',
        pageUrl,
        element: null,
        wcagLevel: 'A',
        details: { focusableCount: focusableElements.length }
      });
    }
    
    return issues;
  }

  /**
   * Audit color contrast (basic checks)
   */
  private auditColorContrast(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // This is a basic implementation - full color contrast checking
    // would require actual color calculation from computed styles
    
    // Check for color-only information indicators
    const colorOnlyElements = document.querySelectorAll('[style*="color"]');
    if (colorOnlyElements.length > 0) {
      issues.push({
        type: 'info',
        severity: 'low',
        rule: 'color-contrast-check',
        message: 'Manual color contrast verification needed for elements with inline colors',
        pageUrl,
        element: null,
        wcagLevel: 'AA',
        details: { elementsWithInlineColor: colorOnlyElements.length }
      });
    }
    
    return issues;
  }

  /**
   * Audit focus management
   */
  private auditFocusManagement(pageUrl: string, document: Document): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // Check for elements that might need focus management
    const dialogTriggers = document.querySelectorAll('[aria-haspopup], [data-toggle="modal"]');
    const accordions = document.querySelectorAll('[aria-expanded]');
    const tabs = document.querySelectorAll('[role="tab"]');
    
    // Note: Full focus management audit would require runtime testing
    if (dialogTriggers.length > 0 || accordions.length > 0 || tabs.length > 0) {
      issues.push({
        type: 'info',
        severity: 'low',
        rule: 'focus-management-check',
        message: 'Interactive components detected - verify proper focus management',
        pageUrl,
        element: null,
        wcagLevel: 'A',
        details: {
          dialogTriggers: dialogTriggers.length,
          accordions: accordions.length,
          tabs: tabs.length
        }
      });
    }
    
    return issues;
  }

  /**
   * Audit component-specific accessibility
   */
  private auditComponents(
    pageUrl: string,
    document: Document,
    components: Record<string, ComponentContract>
  ): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    // Check each component type for accessibility requirements
    Object.keys(components).forEach(componentName => {
      const elements = document.querySelectorAll(`[data-component="${componentName}"]`);
      
      elements.forEach((element, index) => {
        const componentIssues = this.auditComponentType(
          pageUrl,
          element,
          componentName,
          index
        );
        issues.push(...componentIssues);
      });
    });
    
    return issues;
  }

  /**
   * Audit specific component types
   */
  private auditComponentType(
    pageUrl: string,
    element: Element,
    componentName: string,
    index: number
  ): EnhancedAriaIssue[] {
    const issues: EnhancedAriaIssue[] = [];
    
    switch (componentName) {
      case 'Modal':
        if (!element.hasAttribute('role')) {
          issues.push({
            type: 'error',
            severity: 'high',
            rule: 'component-modal-role',
            message: 'Modal component missing role attribute',
            pageUrl,
            element: this.getElementSelector(element, index),
            wcagLevel: 'A',
            details: { component: componentName }
          });
        }
        break;
        
      case 'Dropdown':
        if (!element.hasAttribute('aria-expanded')) {
          issues.push({
            type: 'error',
            severity: 'high',
            rule: 'component-dropdown-state',
            message: 'Dropdown component missing aria-expanded state',
            pageUrl,
            element: this.getElementSelector(element, index),
            wcagLevel: 'A',
            details: { component: componentName }
          });
        }
        break;
        
      case 'Accordion': {
        const headers = element.querySelectorAll('[role="button"], button');
        const panels = element.querySelectorAll('[role="region"]');
        
        if (headers.length !== panels.length) {
          issues.push({
            type: 'error',
            severity: 'high',
            rule: 'component-accordion-structure',
            message: 'Accordion has mismatched headers and panels',
            pageUrl,
            element: this.getElementSelector(element, index),
            wcagLevel: 'A',
            details: { 
              component: componentName,
              headers: headers.length,
              panels: panels.length
            }
          });
        }
        break;
      }
    }
    
    return issues;
  }

  /**
   * Extract ARIA landmarks from page
   */
  private extractLandmarks(pageUrl: string, document: Document): AriaLandmark[] {
    const landmarks: AriaLandmark[] = [];
    
    const landmarkSelectors = [
      { selector: 'main, [role="main"]', type: 'main' },
      { selector: 'nav, [role="navigation"]', type: 'navigation' },
      { selector: 'header, [role="banner"]', type: 'banner' },
      { selector: 'footer, [role="contentinfo"]', type: 'contentinfo' },
      { selector: 'aside, [role="complementary"]', type: 'complementary' },
      { selector: '[role="search"]', type: 'search' }
    ];
    
    landmarkSelectors.forEach(({ selector, type }) => {
      document.querySelectorAll(selector).forEach(element => {
        const label = element.getAttribute('aria-label') || 
                     element.getAttribute('aria-labelledby') ||
                     element.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim() ||
                     null;
                     
        landmarks.push({
          type,
          label,
          pageUrl,
          element: this.getElementSelector(element, landmarks.length)
        });
      });
    });
    
    return landmarks;
  }

  /**
   * Calculate accessibility metrics for a page
   */
  private calculateAccessibilityMetrics(
    document: Document,
    issues: EnhancedAriaIssue[]
  ): AccessibilityMetrics {
    const errors = issues.filter(i => i.type === 'error').length;
    const warnings = issues.filter(i => i.type === 'warning').length;
    const totalIssues = issues.length;
    
    const interactiveElements = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"]'
    ).length;
    
    const elementsWithAccessibleNames = document.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"]'
    );
    
    let accessibleNameCount = 0;
    elementsWithAccessibleNames.forEach(element => {
      if (this.hasAccessibleName(element)) {
        accessibleNameCount++;
      }
    });
    
    const accessibilityScore = Math.max(0, 1 - (errors * 0.1 + warnings * 0.05));
    
    return {
      totalElements: document.querySelectorAll('*').length,
      interactiveElements,
      accessibleNameCoverage: interactiveElements > 0 ? accessibleNameCount / interactiveElements : 1,
      totalIssues,
      errorCount: errors,
      warningCount: warnings,
      accessibilityScore,
      wcagComplianceLevel: this.calculateWcagCompliance(issues)
    };
  }

  /**
   * Calculate overall metrics across all pages
   */
  private calculateOverallMetrics(pageMetrics: Record<string, AccessibilityMetrics>): AccessibilityMetrics {
    const pages = Object.values(pageMetrics);
    if (pages.length === 0) {
      return {
        totalElements: 0,
        interactiveElements: 0,
        accessibleNameCoverage: 1,
        totalIssues: 0,
        errorCount: 0,
        warningCount: 0,
        accessibilityScore: 1,
        wcagComplianceLevel: 'AAA'
      };
    }
    
    return {
      totalElements: pages.reduce((sum, p) => sum + p.totalElements, 0),
      interactiveElements: pages.reduce((sum, p) => sum + p.interactiveElements, 0),
      accessibleNameCoverage: pages.reduce((sum, p) => sum + p.accessibleNameCoverage, 0) / pages.length,
      totalIssues: pages.reduce((sum, p) => sum + p.totalIssues, 0),
      errorCount: pages.reduce((sum, p) => sum + p.errorCount, 0),
      warningCount: pages.reduce((sum, p) => sum + p.warningCount, 0),
      accessibilityScore: pages.reduce((sum, p) => sum + p.accessibilityScore, 0) / pages.length,
      wcagComplianceLevel: this.getLowestComplianceLevel(pages.map(p => p.wcagComplianceLevel))
    };
  }

  /**
   * Generate accessibility recommendations
   */
  private generateRecommendations(issues: EnhancedAriaIssue[], metrics: AccessibilityMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.errorCount > 0) {
      recommendations.push(`Fix ${metrics.errorCount} critical accessibility errors that prevent assistive technology users from accessing content`);
    }
    
    if (metrics.accessibleNameCoverage < 0.9) {
      recommendations.push('Improve accessible names for interactive elements to help screen reader users understand their purpose');
    }
    
    if (issues.some(i => i.rule === 'heading-hierarchy')) {
      recommendations.push('Fix heading hierarchy to create a logical document structure for screen reader navigation');
    }
    
    if (issues.some(i => i.rule === 'landmark-missing')) {
      recommendations.push('Add missing ARIA landmarks to improve page navigation for screen reader users');
    }
    
    if (issues.some(i => i.rule === 'form-label')) {
      recommendations.push('Ensure all form controls have associated labels for proper screen reader announcements');
    }
    
    if (issues.some(i => i.rule === 'image-alt')) {
      recommendations.push('Add alt text to images to make visual content accessible to screen reader users');
    }
    
    if (metrics.accessibilityScore < 0.8) {
      recommendations.push('Consider conducting user testing with assistive technology users to validate accessibility improvements');
    }
    
    return recommendations;
  }

  /**
   * Utility methods
   */
  private hasAccessibleName(element: Element): boolean {
    // Check various ways an element can have an accessible name
    return !!(
      element.getAttribute('aria-label') ||
      element.getAttribute('aria-labelledby') ||
      element.textContent?.trim() ||
      element.getAttribute('title') ||
      (element.tagName === 'INPUT' && element.getAttribute('placeholder')) ||
      this.hasAssociatedLabel(element)
    );
  }

  private hasAssociatedLabel(element: Element): boolean {
    const id = element.getAttribute('id');
    if (!id) {return false;}
    
    const label = element.ownerDocument?.querySelector(`label[for="${id}"]`);
    return !!label;
  }

  private findAssociatedText(element: Element): string | null {
    const id = element.getAttribute('id');
    if (!id) {return null;}
    
    const label = element.ownerDocument?.querySelector(`label[for="${id}"]`);
    return label?.textContent?.trim() || null;
  }

  private getImplicitRole(element: Element): string | null {
    const tagName = element.tagName.toLowerCase();
    const roleMap: Record<string, string> = {
      'main': 'main',
      'nav': 'navigation',
      'header': 'banner',
      'footer': 'contentinfo',
      'aside': 'complementary'
    };
    
    return roleMap[tagName] || null;
  }

  private isExternalLink(href: string): boolean {
    try {
      const url = new URL(href, this.baseUrl);
      const baseUrl = new URL(this.baseUrl);
      return url.hostname !== baseUrl.hostname;
    } catch {
      return false;
    }
  }

  private getElementSelector(element: Element, index: number): string {
    const tagName = element.tagName.toLowerCase();
    const id = element.getAttribute('id');
    const className = element.getAttribute('class');
    
    if (id) {return `#${id}`;}
    if (className) {return `${tagName}.${className.split(' ')[0]}`;}
    return `${tagName}:nth-of-type(${index + 1})`;
  }

  private calculateWcagCompliance(issues: EnhancedAriaIssue[]): 'A' | 'AA' | 'AAA' | 'non-compliant' {
    const levelAErrors = issues.filter(i => i.type === 'error' && i.wcagLevel === 'A').length;
    const levelAAErrors = issues.filter(i => i.type === 'error' && i.wcagLevel === 'AA').length;
    const levelAAAErrors = issues.filter(i => i.type === 'error' && i.wcagLevel === 'AAA').length;
    
    if (levelAErrors > 0) {return 'non-compliant';}
    if (levelAAErrors > 0) {return 'A';}
    if (levelAAAErrors > 0) {return 'AA';}
    return 'AAA';
  }

  private calculateComplianceLevel(issues: EnhancedAriaIssue[]): 'A' | 'AA' | 'AAA' | 'non-compliant' {
    return this.calculateWcagCompliance(issues);
  }

  private getLowestComplianceLevel(levels: Array<'A' | 'AA' | 'AAA' | 'non-compliant'>): 'A' | 'AA' | 'AAA' | 'non-compliant' {
    const order = ['non-compliant', 'A', 'AA', 'AAA'];
    let lowest = 'AAA';
    
    for (const level of levels) {
      if (order.indexOf(level) < order.indexOf(lowest)) {
        lowest = level;
      }
    }
    
    return lowest as 'A' | 'AA' | 'AAA' | 'non-compliant';
  }
}