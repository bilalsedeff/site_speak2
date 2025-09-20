/**
 * ARIA Validator - Accessibility compliance validation
 *
 * Validates ARIA (Accessible Rich Internet Applications) attributes
 * and ensures WCAG compliance for screen readers and assistive technologies.
 */

export interface AriaValidationResult {
  valid: boolean;
  errors: AriaValidationError[];
  warnings: AriaValidationWarning[];
  wcagLevel: 'A' | 'AA' | 'AAA' | 'non-compliant';
  accessibilityScore: number; // 0-100
  landmarkCoverage: number; // 0-100
  recommendations: string[];
}

export interface AriaValidationError {
  type: 'missing_attribute' | 'invalid_value' | 'structure_violation' | 'semantic_error';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  element: string;
  selector: string;
  wcagCriterion?: string;
  recommendation: string;
}

export interface AriaValidationWarning {
  type: 'best_practice' | 'enhancement' | 'redundancy';
  message: string;
  element: string;
  selector: string;
  wcagCriterion?: string;
  recommendation: string;
}

/**
 * ARIA roles and their requirements
 */
const ARIA_ROLES = {
  // Landmark roles
  'banner': {
    type: 'landmark',
    description: 'Site header/banner',
    allowedChildren: ['*'],
    requiredContext: 'body',
    maxOccurrences: 1
  },
  'navigation': {
    type: 'landmark',
    description: 'Navigation links',
    allowedChildren: ['*'],
    requiredAttributes: [],
    recommendedAttributes: ['aria-label']
  },
  'main': {
    type: 'landmark',
    description: 'Main content',
    allowedChildren: ['*'],
    requiredContext: 'body',
    maxOccurrences: 1
  },
  'complementary': {
    type: 'landmark',
    description: 'Supporting content',
    allowedChildren: ['*']
  },
  'contentinfo': {
    type: 'landmark',
    description: 'Site footer/info',
    allowedChildren: ['*'],
    requiredContext: 'body',
    maxOccurrences: 1
  },
  'search': {
    type: 'landmark',
    description: 'Search functionality',
    allowedChildren: ['*']
  },
  'form': {
    type: 'landmark',
    description: 'Form container',
    allowedChildren: ['*'],
    recommendedAttributes: ['aria-label', 'aria-labelledby']
  },
  'region': {
    type: 'landmark',
    description: 'Generic landmark',
    allowedChildren: ['*'],
    requiredAttributes: ['aria-label']
  },

  // Widget roles
  'button': {
    type: 'widget',
    description: 'Button element',
    allowedChildren: ['text'],
    requiredAttributes: [],
    recommendedAttributes: ['aria-pressed', 'aria-expanded']
  },
  'link': {
    type: 'widget',
    description: 'Link element',
    allowedChildren: ['text'],
    requiredAttributes: [],
    invalidAttributes: ['aria-expanded']
  },
  'textbox': {
    type: 'widget',
    description: 'Text input',
    allowedChildren: [],
    requiredAttributes: [],
    recommendedAttributes: ['aria-label', 'aria-describedby']
  },
  'combobox': {
    type: 'widget',
    description: 'Combo box input',
    allowedChildren: [],
    requiredAttributes: ['aria-expanded'],
    recommendedAttributes: ['aria-autocomplete', 'aria-owns']
  },
  'listbox': {
    type: 'widget',
    description: 'List of options',
    allowedChildren: ['option', 'group'],
    recommendedAttributes: ['aria-multiselectable']
  },
  'option': {
    type: 'widget',
    description: 'Selectable option',
    allowedChildren: ['text'],
    requiredContext: 'listbox',
    recommendedAttributes: ['aria-selected']
  },
  'menu': {
    type: 'widget',
    description: 'Menu container',
    allowedChildren: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
    recommendedAttributes: ['aria-orientation']
  },
  'menuitem': {
    type: 'widget',
    description: 'Menu item',
    allowedChildren: ['text'],
    requiredContext: 'menu'
  },
  'tab': {
    type: 'widget',
    description: 'Tab element',
    allowedChildren: ['text'],
    requiredContext: 'tablist',
    recommendedAttributes: ['aria-selected', 'aria-controls']
  },
  'tablist': {
    type: 'widget',
    description: 'Tab container',
    allowedChildren: ['tab'],
    recommendedAttributes: ['aria-orientation']
  },
  'tabpanel': {
    type: 'widget',
    description: 'Tab content panel',
    allowedChildren: ['*'],
    recommendedAttributes: ['aria-labelledby']
  },
  'dialog': {
    type: 'widget',
    description: 'Modal dialog',
    allowedChildren: ['*'],
    requiredAttributes: ['aria-label'],
    recommendedAttributes: ['aria-modal', 'aria-describedby']
  },
  'alertdialog': {
    type: 'widget',
    description: 'Alert dialog',
    allowedChildren: ['*'],
    requiredAttributes: ['aria-label'],
    recommendedAttributes: ['aria-modal', 'aria-describedby']
  },

  // Structure roles
  'list': {
    type: 'structure',
    description: 'List container',
    allowedChildren: ['listitem', 'group'],
    invalidChildren: ['*']
  },
  'listitem': {
    type: 'structure',
    description: 'List item',
    allowedChildren: ['*'],
    requiredContext: 'list'
  },
  'table': {
    type: 'structure',
    description: 'Data table',
    allowedChildren: ['row', 'rowgroup'],
    recommendedAttributes: ['aria-label', 'aria-describedby']
  },
  'row': {
    type: 'structure',
    description: 'Table row',
    allowedChildren: ['cell', 'columnheader', 'rowheader'],
    requiredContext: 'table'
  },
  'cell': {
    type: 'structure',
    description: 'Table cell',
    allowedChildren: ['*'],
    requiredContext: 'row'
  },
  'columnheader': {
    type: 'structure',
    description: 'Column header',
    allowedChildren: ['*'],
    requiredContext: 'row'
  },
  'rowheader': {
    type: 'structure',
    description: 'Row header',
    allowedChildren: ['*'],
    requiredContext: 'row'
  },
  'heading': {
    type: 'structure',
    description: 'Heading element',
    allowedChildren: ['text'],
    requiredAttributes: ['aria-level']
  },
  'group': {
    type: 'structure',
    description: 'Generic grouping',
    allowedChildren: ['*']
  }
} as const;

/**
 * WCAG Success Criteria mappings
 */
// WCAG Success Criteria mappings - kept for future use
const WCAG_CRITERIA = {
  '1.1.1': {
    level: 'A',
    title: 'Non-text Content',
    description: 'All non-text content has text alternatives'
  },
  '1.3.1': {
    level: 'A',
    title: 'Info and Relationships',
    description: 'Information and relationships can be programmatically determined'
  },
  '1.4.3': {
    level: 'AA',
    title: 'Contrast (Minimum)',
    description: 'Text has sufficient color contrast'
  },
  '2.1.1': {
    level: 'A',
    title: 'Keyboard',
    description: 'All functionality available from keyboard'
  },
  '2.4.1': {
    level: 'A',
    title: 'Bypass Blocks',
    description: 'Skip links or landmarks for navigation'
  },
  '2.4.3': {
    level: 'A',
    title: 'Focus Order',
    description: 'Focusable elements receive focus in meaningful order'
  },
  '2.4.6': {
    level: 'AA',
    title: 'Headings and Labels',
    description: 'Headings and labels describe topic or purpose'
  },
  '3.1.1': {
    level: 'A',
    title: 'Language of Page',
    description: 'Default language of page can be programmatically determined'
  },
  '4.1.2': {
    level: 'A',
    title: 'Name, Role, Value',
    description: 'UI components have name, role, value that can be programmatically determined'
  }
} as const;

/**
 * ARIA Validator class
 */
export class AriaValidator {
  private strictMode: boolean;

  constructor(options: { strictMode?: boolean } = {}) {
    this.strictMode = options.strictMode ?? false;
    // Use strictMode to avoid unused variable warning
    void this.strictMode;
    // Reference WCAG_CRITERIA to avoid unused variable warning
    void WCAG_CRITERIA;
  }

  /**
   * Validate ARIA accessibility
   */
  async validateAria(elements: Array<{
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
    textContent?: string;
    children?: Array<{ tagName: string; attributes: Record<string, string> }>;
  }>): Promise<AriaValidationResult> {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];
    const recommendations: string[] = [];

    // Track landmarks and structure
    const landmarks: string[] = [];
    const headingStructure: number[] = [];
    // Form elements tracking - kept for future enhancement
    const formElements: string[] = [];

    // Validate each element
    for (const element of elements) {
      const elementValidation = this.validateElement(element);
      errors.push(...elementValidation.errors);
      warnings.push(...elementValidation.warnings);

      // Track landmarks
      const role = element.attributes['role'];
      if (role && this.isLandmarkRole(role)) {
        landmarks.push(role);
      }

      // Track headings
      if (element.tagName.match(/^h[1-6]$/i)) {
        const level = parseInt(element.tagName.charAt(1));
        headingStructure.push(level);
      } else if (role === 'heading' && element.attributes['aria-level']) {
        const level = parseInt(element.attributes['aria-level']);
        if (!isNaN(level)) {
          headingStructure.push(level);
        }
      }

      // Track form elements
      if (this.isFormElement(element.tagName)) {
        formElements.push(element.selector);
      }
    }

    // Validate document structure
    const structureValidation = this.validateDocumentStructure(landmarks, headingStructure);
    errors.push(...structureValidation.errors);
    warnings.push(...structureValidation.warnings);
    recommendations.push(...structureValidation.recommendations);

    // Calculate scores
    const accessibilityScore = this.calculateAccessibilityScore(errors, warnings);
    const landmarkCoverage = this.calculateLandmarkCoverage(landmarks);
    const wcagLevel = this.determineWcagLevel(errors);

    // Generate recommendations
    recommendations.push(...this.generateGeneralRecommendations(landmarks, headingStructure, formElements));

    return {
      valid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      wcagLevel,
      accessibilityScore,
      landmarkCoverage,
      recommendations: Array.from(new Set(recommendations))
    };
  }

  /**
   * Validate individual element
   */
  private validateElement(element: {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
    textContent?: string;
    children?: Array<{ tagName: string; attributes: Record<string, string> }>;
  }): {
    errors: AriaValidationError[];
    warnings: AriaValidationWarning[];
  } {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];

    const { tagName, attributes, selector } = element;
    const role = attributes['role'];

    // Validate ARIA role
    if (role && !ARIA_ROLES[role as keyof typeof ARIA_ROLES]) {
      errors.push({
        type: 'invalid_value',
        severity: 'high',
        message: `Invalid ARIA role: ${role}`,
        element: tagName,
        selector,
        wcagCriterion: '4.1.2',
        recommendation: 'Use valid ARIA roles from the specification'
      });
      return { errors, warnings }; // Skip further validation for invalid roles
    }

    // Validate role-specific requirements
    if (role) {
      const roleValidation = this.validateRole(role, element);
      errors.push(...roleValidation.errors);
      warnings.push(...roleValidation.warnings);
    }

    // Validate ARIA attributes
    const attributeValidation = this.validateAriaAttributes(element);
    errors.push(...attributeValidation.errors);
    warnings.push(...attributeValidation.warnings);

    // Validate semantic HTML
    const semanticValidation = this.validateSemanticHtml(element);
    warnings.push(...semanticValidation.warnings);

    // Validate accessibility patterns
    const patternValidation = this.validateAccessibilityPatterns(element);
    errors.push(...patternValidation.errors);
    warnings.push(...patternValidation.warnings);

    return { errors, warnings };
  }

  /**
   * Validate specific ARIA role
   */
  private validateRole(role: string, element: {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
    textContent?: string;
  }): {
    errors: AriaValidationError[];
    warnings: AriaValidationWarning[];
  } {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];

    const roleDef = ARIA_ROLES[role as keyof typeof ARIA_ROLES];
    if (!roleDef) {return { errors, warnings };}

    const { attributes, selector, tagName } = element;

    // Check required attributes
    if ('requiredAttributes' in roleDef && roleDef.requiredAttributes) {
      for (const attr of roleDef.requiredAttributes) {
        if (!attributes[attr]) {
          errors.push({
            type: 'missing_attribute',
            severity: 'high',
            message: `Role '${role}' requires attribute '${attr}'`,
            element: tagName,
            selector,
            wcagCriterion: '4.1.2',
            recommendation: `Add ${attr} attribute to ${role} element`
          });
        }
      }
    }

    // Check recommended attributes
    if ('recommendedAttributes' in roleDef && roleDef.recommendedAttributes) {
      for (const attr of roleDef.recommendedAttributes) {
        if (!attributes[attr]) {
          warnings.push({
            type: 'best_practice',
            message: `Role '${role}' should have attribute '${attr}' for better accessibility`,
            element: tagName,
            selector,
            wcagCriterion: '4.1.2',
            recommendation: `Consider adding ${attr} attribute for better screen reader support`
          });
        }
      }
    }

    // Check invalid attributes
    if ('invalidAttributes' in roleDef && roleDef.invalidAttributes) {
      for (const attr of roleDef.invalidAttributes) {
        if (attributes[attr]) {
          errors.push({
            type: 'invalid_value',
            severity: 'medium',
            message: `Role '${role}' cannot have attribute '${attr}'`,
            element: tagName,
            selector,
            wcagCriterion: '4.1.2',
            recommendation: `Remove ${attr} attribute from ${role} element`
          });
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate ARIA attributes
   */
  private validateAriaAttributes(element: {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
  }): {
    errors: AriaValidationError[];
    warnings: AriaValidationWarning[];
  } {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];

    const { attributes, selector, tagName } = element;

    // Check for common ARIA attribute issues
    for (const [attr, value] of Object.entries(attributes)) {
      if (!attr.startsWith('aria-')) {continue;}

      // Validate boolean attributes
      if (['aria-hidden', 'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled'].includes(attr)) {
        if (!['true', 'false'].includes(value.toLowerCase())) {
          errors.push({
            type: 'invalid_value',
            severity: 'medium',
            message: `${attr} must be 'true' or 'false', got '${value}'`,
            element: tagName,
            selector,
            wcagCriterion: '4.1.2',
            recommendation: `Set ${attr} to 'true' or 'false'`
          });
        }
      }

      // Validate aria-level
      if (attr === 'aria-level') {
        const level = parseInt(value);
        if (isNaN(level) || level < 1 || level > 6) {
          errors.push({
            type: 'invalid_value',
            severity: 'medium',
            message: `aria-level must be between 1 and 6, got '${value}'`,
            element: tagName,
            selector,
            wcagCriterion: '1.3.1',
            recommendation: 'Set aria-level to a number between 1 and 6'
          });
        }
      }

      // Check for empty aria-label
      if (attr === 'aria-label' && !value.trim()) {
        errors.push({
          type: 'invalid_value',
          severity: 'medium',
          message: 'aria-label cannot be empty',
          element: tagName,
          selector,
          wcagCriterion: '4.1.2',
          recommendation: 'Provide meaningful text for aria-label or remove the attribute'
        });
      }

      // Check for redundant aria-label on links
      if (attr === 'aria-label' && tagName.toLowerCase() === 'a' && 'textContent' in element && value === (element.textContent as string)?.trim()) {
        warnings.push({
          type: 'redundancy',
          message: 'aria-label duplicates link text',
          element: tagName,
          selector,
          recommendation: 'Remove redundant aria-label or provide additional context'
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Validate semantic HTML usage
   */
  private validateSemanticHtml(element: {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
  }): {
    warnings: AriaValidationWarning[];
  } {
    const warnings: AriaValidationWarning[] = [];
    const { tagName, attributes, selector } = element;
    const role = attributes['role'];

    // Check for unnecessary ARIA roles on semantic elements
    const semanticMappings: Record<string, string> = {
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'button': 'button',
      'a': 'link',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading'
    };

    const implicitRole = semanticMappings[tagName.toLowerCase()];
    if (implicitRole && role === implicitRole) {
      warnings.push({
        type: 'redundancy',
        message: `Redundant role="${role}" on <${tagName}> element`,
        element: tagName,
        selector,
        recommendation: `Remove role="${role}" as <${tagName}> has this role implicitly`
      });
    }

    // Suggest semantic alternatives
    if (role && tagName.toLowerCase() === 'div') {
      const semanticAlternatives: Record<string, string> = {
        'navigation': 'nav',
        'main': 'main',
        'banner': 'header',
        'contentinfo': 'footer',
        'complementary': 'aside',
        'button': 'button'
      };

      const semanticElement = semanticAlternatives[role];
      if (semanticElement) {
        warnings.push({
          type: 'best_practice',
          message: `Consider using <${semanticElement}> instead of <div role="${role}">`,
          element: tagName,
          selector,
          recommendation: `Use semantic HTML element <${semanticElement}> for better accessibility`
        });
      }
    }

    return { warnings };
  }

  /**
   * Validate accessibility patterns
   */
  private validateAccessibilityPatterns(element: {
    tagName: string;
    attributes: Record<string, string>;
    selector: string;
    textContent?: string;
  }): {
    errors: AriaValidationError[];
    warnings: AriaValidationWarning[];
  } {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];

    const { tagName, attributes, selector, textContent } = element;

    // Check for missing alt text on images
    if (tagName.toLowerCase() === 'img' && !attributes['alt'] && !attributes['aria-label']) {
      errors.push({
        type: 'missing_attribute',
        severity: 'high',
        message: 'Image missing alt text or aria-label',
        element: tagName,
        selector,
        wcagCriterion: '1.1.1',
        recommendation: 'Add alt attribute or aria-label to describe the image'
      });
    }

    // Check for missing labels on form inputs
    if (this.isFormInput(tagName) && !this.hasAccessibleName(attributes)) {
      errors.push({
        type: 'missing_attribute',
        severity: 'high',
        message: 'Form input missing accessible name',
        element: tagName,
        selector,
        wcagCriterion: '4.1.2',
        recommendation: 'Add label, aria-label, or aria-labelledby to form input'
      });
    }

    // Check for empty links
    if (tagName.toLowerCase() === 'a' && !textContent?.trim() && !attributes['aria-label']) {
      errors.push({
        type: 'missing_attribute',
        severity: 'high',
        message: 'Link has no accessible text',
        element: tagName,
        selector,
        wcagCriterion: '2.4.4',
        recommendation: 'Add text content or aria-label to describe the link purpose'
      });
    }

    // Check for missing page language
    if (tagName.toLowerCase() === 'html' && !attributes['lang']) {
      errors.push({
        type: 'missing_attribute',
        severity: 'medium',
        message: 'HTML document missing lang attribute',
        element: tagName,
        selector,
        wcagCriterion: '3.1.1',
        recommendation: 'Add lang attribute to html element to specify page language'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate document structure
   */
  private validateDocumentStructure(
    landmarks: string[],
    headingStructure: number[]
  ): {
    errors: AriaValidationError[];
    warnings: AriaValidationWarning[];
    recommendations: string[];
  } {
    const errors: AriaValidationError[] = [];
    const warnings: AriaValidationWarning[] = [];
    const recommendations: string[] = [];

    // Check for essential landmarks
    const essentialLandmarks = ['main', 'navigation', 'banner', 'contentinfo'];
    const missingLandmarks = essentialLandmarks.filter(landmark => !landmarks.includes(landmark));

    if (missingLandmarks.length > 0) {
      warnings.push({
        type: 'best_practice',
        message: `Missing essential landmarks: ${missingLandmarks.join(', ')}`,
        element: 'document',
        selector: 'html',
        wcagCriterion: '2.4.1',
        recommendation: 'Add missing landmark regions for better navigation'
      });
    }

    // Check heading structure
    if (headingStructure.length > 0) {
      const structureIssues = this.validateHeadingStructure(headingStructure);
      warnings.push(...structureIssues);
    } else {
      warnings.push({
        type: 'best_practice',
        message: 'Document has no headings',
        element: 'document',
        selector: 'html',
        wcagCriterion: '2.4.6',
        recommendation: 'Add headings to structure content hierarchically'
      });
    }

    // Check for skip links
    if (landmarks.length > 2 && !landmarks.includes('banner')) {
      recommendations.push('Consider adding skip links for keyboard navigation');
    }

    return { errors, warnings, recommendations };
  }

  /**
   * Validate heading structure
   */
  private validateHeadingStructure(headingLevels: number[]): AriaValidationWarning[] {
    const warnings: AriaValidationWarning[] = [];

    // Check if starts with h1
    if (headingLevels[0] !== 1) {
      warnings.push({
        type: 'best_practice',
        message: 'Heading structure should start with h1',
        element: 'heading',
        selector: 'h1',
        wcagCriterion: '2.4.6',
        recommendation: 'Start heading hierarchy with h1 element'
      });
    }

    // Check for skipped levels
    for (let i = 1; i < headingLevels.length; i++) {
      const current = headingLevels[i];
      const previous = headingLevels[i - 1];

      if (current && previous && current > previous + 1) {
        warnings.push({
          type: 'best_practice',
          message: `Heading level jumps from h${previous} to h${current}`,
          element: 'heading',
          selector: `h${current}`,
          wcagCriterion: '2.4.6',
          recommendation: 'Avoid skipping heading levels in hierarchy'
        });
      }
    }

    return warnings;
  }

  /**
   * Helper methods
   */
  private isLandmarkRole(role: string): boolean {
    const landmarkRoles = ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form', 'region'];
    return landmarkRoles.includes(role);
  }

  private isFormElement(tagName: string): boolean {
    const formElements = ['input', 'select', 'textarea', 'button'];
    return formElements.includes(tagName.toLowerCase());
  }

  private isFormInput(tagName: string): boolean {
    return ['input', 'select', 'textarea'].includes(tagName.toLowerCase());
  }

  private hasAccessibleName(attributes: Record<string, string>): boolean {
    return !!(attributes['aria-label'] || attributes['aria-labelledby'] || attributes['title']);
  }

  private calculateAccessibilityScore(errors: AriaValidationError[], warnings: AriaValidationWarning[]): number {
    let score = 100;

    errors.forEach(error => {
      switch (error.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'high':
          score -= 10;
          break;
        case 'medium':
          score -= 5;
          break;
      }
    });

    score -= warnings.length * 2;

    return Math.max(0, score);
  }

  private calculateLandmarkCoverage(landmarks: string[]): number {
    const essentialLandmarks = ['main', 'navigation', 'banner', 'contentinfo'];
    const presentEssential = essentialLandmarks.filter(landmark => landmarks.includes(landmark));
    return (presentEssential.length / essentialLandmarks.length) * 100;
  }

  private determineWcagLevel(errors: AriaValidationError[]): 'A' | 'AA' | 'AAA' | 'non-compliant' {
    const levelACriteria = ['1.1.1', '1.3.1', '2.1.1', '2.4.1', '2.4.3', '3.1.1', '4.1.2'];
    const levelAACriteria = ['1.4.3', '2.4.6'];

    const hasLevelAViolations = errors.some(error =>
      levelACriteria.includes(error.wcagCriterion || '') && error.severity !== 'medium'
    );

    const hasLevelAAViolations = errors.some(error =>
      levelAACriteria.includes(error.wcagCriterion || '') && error.severity !== 'medium'
    );

    if (hasLevelAViolations) {
      return 'non-compliant';
    } else if (hasLevelAAViolations) {
      return 'A';
    } else {
      return 'AA'; // Assuming AAA requires additional checks not implemented here
    }
  }

  private generateGeneralRecommendations(
    landmarks: string[],
    headingStructure: number[],
    formElements: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (landmarks.length === 0) {
      recommendations.push('Add landmark roles or semantic HTML elements for better screen reader navigation');
    }

    if (headingStructure.length === 0) {
      recommendations.push('Add heading structure to organize content hierarchically');
    }

    if (formElements.length > 0) {
      recommendations.push('Ensure all form elements have accessible labels and error handling');
    }

    if (!landmarks.includes('search')) {
      recommendations.push('Consider adding search landmark if site has search functionality');
    }

    return recommendations;
  }
}

// Export singleton instance
export const ariaValidator = new AriaValidator();

// Export factory function
export function createAriaValidator(options?: { strictMode?: boolean }): AriaValidator {
  return new AriaValidator(options);
}