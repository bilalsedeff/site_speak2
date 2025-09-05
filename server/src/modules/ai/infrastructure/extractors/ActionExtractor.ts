import { JSDOM } from 'jsdom';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'action-extractor' });

/**
 * Action Extractor
 * 
 * Extracts interactive actions from HTML documents that the voice AI can perform.
 * Focuses on buttons, links, and other actionable elements with deterministic selectors.
 */
export class ActionExtractor {
  
  /**
   * Extract all actions from HTML
   */
  async extractFromHtml(html: string, url: string): Promise<ActionExtractionResult> {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const actions: ExtractedAction[] = [];
      const errors: ActionExtractionError[] = [];

      // Extract different types of actions
      actions.push(...this.extractButtonActions(document, url));
      actions.push(...this.extractLinkActions(document, url));
      actions.push(...this.extractFormSubmitActions(document, url));
      actions.push(...this.extractCustomActions(document, url));
      
      // Validate and enrich actions
      const validatedActions = this.validateAndEnrichActions(actions, url);

      const result: ActionExtractionResult = {
        url,
        actions: validatedActions,
        totalElements: actions.length,
        validActions: validatedActions.length,
        errors,
        extractedAt: new Date()
      };

      logger.info('Action extraction completed', {
        url,
        totalElements: result.totalElements,
        validActions: result.validActions,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      logger.error('Action extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url
      });

      return {
        url,
        actions: [],
        totalElements: 0,
        validActions: 0,
        errors: [{
          type: 'extraction-error',
          message: error instanceof Error ? error.message : 'Unknown error',
          url
        }],
        extractedAt: new Date()
      };
    }
  }

  /**
   * Extract button actions
   */
  private extractButtonActions(document: Document, url: string): ExtractedAction[] {
    const actions: ExtractedAction[] = [];
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"]');
    
    buttons.forEach((button, index) => {
      const element = button as HTMLElement;
      const action = this.createActionFromButton(element, index, url);
      if (action) {
        actions.push(action);
      }
    });

    return actions;
  }

  /**
   * Extract link actions
   */
  private extractLinkActions(document: Document, url: string): ExtractedAction[] {
    const actions: ExtractedAction[] = [];
    const links = document.querySelectorAll('a[href]');
    
    links.forEach((link, index) => {
      const element = link as HTMLAnchorElement;
      const action = this.createActionFromLink(element, index, url);
      if (action) {
        actions.push(action);
      }
    });

    return actions;
  }

  /**
   * Extract form submit actions
   */
  private extractFormSubmitActions(document: Document, url: string): ExtractedAction[] {
    const actions: ExtractedAction[] = [];
    const forms = document.querySelectorAll('form');
    
    forms.forEach((form, index) => {
      const element = form as HTMLFormElement;
      const action = this.createActionFromForm(element, index, url);
      if (action) {
        actions.push(action);
      }
    });

    return actions;
  }

  /**
   * Extract custom data-action attributes
   */
  private extractCustomActions(document: Document, url: string): ExtractedAction[] {
    const actions: ExtractedAction[] = [];
    const customElements = document.querySelectorAll('[data-action], [data-sitespeak-action]');
    
    customElements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const action = this.createActionFromCustomElement(htmlElement, index, url);
      if (action) {
        actions.push(action);
      }
    });

    return actions;
  }

  /**
   * Create action from button element
   */
  private createActionFromButton(element: HTMLElement, index: number, url: string): ExtractedAction | null {
    const text = this.getElementText(element);
    if (!text) {return null;}

    const type = element.getAttribute('type') || 'button';
    const form = element.closest('form');
    
    return {
      id: this.generateActionId('button', index, element),
      type: this.classifyButtonAction(text, type),
      label: text,
      selector: this.generateSelector(element),
      element: 'button',
      url,
      parameters: this.extractButtonParameters(element, form),
      confirmation: this.requiresConfirmation(text, type),
      sideEffects: this.determineSideEffects(text, type),
      confidence: this.calculateConfidence(element, text),
      extractionMeta: {
        index,
        elementType: element.tagName.toLowerCase(),
        extractedAt: new Date(),
        attributes: this.extractRelevantAttributes(element)
      }
    };
  }

  /**
   * Create action from link element
   */
  private createActionFromLink(element: HTMLAnchorElement, index: number, url: string): ExtractedAction | null {
    const text = this.getElementText(element);
    const href = element.href;
    
    if (!text || !href || this.isInternalAnchor(href)) {
      return null;
    }

    return {
      id: this.generateActionId('link', index, element),
      type: this.classifyLinkAction(text, href),
      label: text,
      selector: this.generateSelector(element),
      element: 'link',
      url,
      parameters: {
        href,
        target: element.target || '_self',
        download: element.download || undefined
      },
      confirmation: this.requiresConfirmation(text, 'link'),
      sideEffects: this.determineLinkSideEffects(href),
      confidence: this.calculateConfidence(element, text),
      extractionMeta: {
        index,
        elementType: element.tagName.toLowerCase(),
        extractedAt: new Date(),
        attributes: this.extractRelevantAttributes(element)
      }
    };
  }

  /**
   * Create action from form element
   */
  private createActionFromForm(element: HTMLFormElement, index: number, url: string): ExtractedAction | null {
    const submitButton = element.querySelector('input[type="submit"], button[type="submit"], button:not([type])');
    const label = submitButton ? this.getElementText(submitButton as HTMLElement) : 'Submit Form';
    
    if (!label) {return null;}

    return {
      id: this.generateActionId('form', index, element),
      type: this.classifyFormAction(element, label),
      label,
      selector: this.generateSelector(element),
      element: 'form',
      url,
      parameters: {
        action: element.action || url,
        method: element.method || 'get',
        enctype: element.enctype || 'application/x-www-form-urlencoded',
        fields: this.extractFormFields(element)
      },
      confirmation: this.requiresConfirmation(label, 'form'),
      sideEffects: this.determineFormSideEffects(element, label),
      confidence: this.calculateConfidence(element, label),
      extractionMeta: {
        index,
        elementType: element.tagName.toLowerCase(),
        extractedAt: new Date(),
        attributes: this.extractRelevantAttributes(element)
      }
    };
  }

  /**
   * Create action from custom data-action element
   */
  private createActionFromCustomElement(element: HTMLElement, index: number, url: string): ExtractedAction | null {
    const actionData = element.getAttribute('data-action') || element.getAttribute('data-sitespeak-action');
    if (!actionData) {return null;}

    try {
      const parsedAction = JSON.parse(actionData);
      const text = this.getElementText(element) || parsedAction.label || 'Custom Action';

      return {
        id: this.generateActionId('custom', index, element),
        type: parsedAction.type || 'custom',
        label: text,
        selector: this.generateSelector(element),
        element: 'custom',
        url,
        parameters: parsedAction.parameters || {},
        confirmation: parsedAction.confirmation || false,
        sideEffects: parsedAction.sideEffects || ['unknown'],
        confidence: 0.9, // High confidence for explicitly marked actions
        extractionMeta: {
          index,
          elementType: element.tagName.toLowerCase(),
          extractedAt: new Date(),
          attributes: this.extractRelevantAttributes(element),
          customData: parsedAction
        }
      };
    } catch {
      return null; // Invalid JSON in data-action
    }
  }

  /**
   * Validate and enrich extracted actions
   */
  private validateAndEnrichActions(actions: ExtractedAction[], url: string): ExtractedAction[] {
    return actions
      .filter(action => this.isValidAction(action))
      .map(action => this.enrichAction(action, url))
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending
  }

  /**
   * Generate unique action ID
   */
  private generateActionId(type: string, index: number, element: HTMLElement): string {
    const elementId = element.id;
    const elementClass = element.className;
    
    if (elementId) {
      return `${type}-${elementId}`;
    }
    
    if (elementClass) {
      const mainClass = elementClass.split(' ')[0];
      return `${type}-${mainClass}-${index}`;
    }
    
    return `${type}-${index}`;
  }

  /**
   * Generate CSS selector for element
   */
  private generateSelector(element: HTMLElement): string {
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try unique class combination
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        const selector = `.${classes.join('.')}`;
        // Check if selector is unique enough (simplified check)
        return selector;
      }
    }
    
    // Generate path-based selector
    return this.generatePathSelector(element);
  }

  /**
   * Generate path-based CSS selector
   */
  private generatePathSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Add nth-child if needed
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const sameTagSiblings = siblings.filter(s => s.tagName === current!.tagName);
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      // Limit depth to avoid overly long selectors
      if (path.length >= 5) {break;}
    }
    
    return path.join(' > ');
  }

  /**
   * Classify button action type
   */
  private classifyButtonAction(text: string, type: string): string {
    const lowText = text.toLowerCase();
    
    if (type === 'submit') {return 'form-submit';}
    if (type === 'reset') {return 'form-reset';}
    
    // Classify by text content
    if (lowText.includes('buy') || lowText.includes('purchase') || lowText.includes('add to cart')) {
      return 'commerce-action';
    }
    if (lowText.includes('book') || lowText.includes('reserve') || lowText.includes('schedule')) {
      return 'booking-action';
    }
    if (lowText.includes('contact') || lowText.includes('send') || lowText.includes('submit')) {
      return 'contact-action';
    }
    if (lowText.includes('search') || lowText.includes('find')) {
      return 'search-action';
    }
    if (lowText.includes('download') || lowText.includes('save')) {
      return 'download-action';
    }
    
    return 'general-action';
  }

  /**
   * Classify link action type
   */
  private classifyLinkAction(text: string, href: string): string {
    const lowText = text.toLowerCase();
    const lowHref = href.toLowerCase();
    
    if (lowHref.includes('mailto:')) {return 'email-link';}
    if (lowHref.includes('tel:')) {return 'phone-link';}
    if (lowHref.includes('download') || lowText.includes('download')) {return 'download-link';}
    if (this.isExternalUrl(href)) {return 'external-link';}
    
    return 'navigation-link';
  }

  /**
   * Classify form action type
   */
  private classifyFormAction(form: HTMLFormElement, label: string): string {
    const lowLabel = label.toLowerCase();
    const action = form.action?.toLowerCase() || '';
    
    if (lowLabel.includes('contact') || action.includes('contact')) {return 'contact-form';}
    if (lowLabel.includes('search') || action.includes('search')) {return 'search-form';}
    if (lowLabel.includes('newsletter') || lowLabel.includes('subscribe')) {return 'newsletter-form';}
    if (lowLabel.includes('login') || action.includes('login')) {return 'login-form';}
    if (lowLabel.includes('register') || lowLabel.includes('signup')) {return 'registration-form';}
    
    return 'general-form';
  }

  /**
   * Determine if action requires confirmation
   */
  private requiresConfirmation(text: string, _type: string): boolean {
    const lowText = text.toLowerCase();
    
    // Actions that typically require confirmation
    const confirmationTriggers = [
      'delete', 'remove', 'cancel', 'unsubscribe',
      'purchase', 'buy', 'order', 'checkout',
      'submit', 'send', 'contact'
    ];
    
    return confirmationTriggers.some(trigger => lowText.includes(trigger));
  }

  /**
   * Determine action side effects
   */
  private determineSideEffects(text: string, type: string): string[] {
    const lowText = text.toLowerCase();
    const sideEffects: string[] = [];
    
    if (type === 'submit' || lowText.includes('submit') || lowText.includes('send')) {
      sideEffects.push('writes.content');
    }
    if (lowText.includes('buy') || lowText.includes('purchase') || lowText.includes('add to cart')) {
      sideEffects.push('writes.cart', 'writes.order');
    }
    if (lowText.includes('book') || lowText.includes('reserve')) {
      sideEffects.push('writes.booking');
    }
    if (lowText.includes('delete') || lowText.includes('remove')) {
      sideEffects.push('writes.content');
    }
    
    return sideEffects.length > 0 ? sideEffects : ['none'];
  }

  /**
   * Determine link side effects
   */
  private determineLinkSideEffects(href: string): string[] {
    if (this.isExternalUrl(href)) {
      return ['navigation.external'];
    }
    return ['navigation.internal'];
  }

  /**
   * Determine form side effects
   */
  private determineFormSideEffects(form: HTMLFormElement, label: string): string[] {
    const method = form.method?.toLowerCase() || 'get';
    const lowLabel = label.toLowerCase();
    
    if (method === 'post' || method === 'put' || method === 'patch') {
      if (lowLabel.includes('contact') || lowLabel.includes('message')) {
        return ['writes.content', 'writes.contact'];
      }
      return ['writes.content'];
    }
    
    return ['none'];
  }

  /**
   * Calculate action confidence score
   */
  private calculateConfidence(element: HTMLElement, text: string): number {
    let confidence = 0.7; // Base confidence
    
    // Boost for clear labeling
    if (text && text.trim().length > 2) {
      confidence += 0.1;
    }
    
    // Boost for semantic HTML
    if (element.tagName.toLowerCase() === 'button') {
      confidence += 0.1;
    }
    
    // Boost for accessibility attributes
    if (element.getAttribute('aria-label') || element.getAttribute('title')) {
      confidence += 0.05;
    }
    
    // Boost for ID or meaningful classes
    if (element.id || element.className) {
      confidence += 0.05;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Extract relevant element attributes
   */
  private extractRelevantAttributes(element: HTMLElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    const relevantAttrs = ['id', 'class', 'type', 'name', 'value', 'href', 'action', 'method', 'aria-label', 'title'];
    
    relevantAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    });
    
    return attributes;
  }

  /**
   * Get clean text content from element
   */
  private getElementText(element: HTMLElement): string {
    // Try aria-label first
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {return ariaLabel.trim();}
    
    // Try title attribute
    const title = element.getAttribute('title');
    if (title) {return title.trim();}
    
    // Try text content
    const textContent = element.textContent?.trim();
    if (textContent) {return textContent;}
    
    // Try value for input elements
    if (element.tagName.toLowerCase() === 'input') {
      const value = (element as HTMLInputElement).value;
      if (value) {return value.trim();}
    }
    
    return '';
  }

  /**
   * Extract form fields
   */
  private extractFormFields(form: HTMLFormElement): FormField[] {
    const fields: FormField[] = [];
    const inputs = form.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      const element = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const field = this.createFormField(element);
      if (field) {
        fields.push(field);
      }
    });
    
    return fields;
  }

  /**
   * Create form field descriptor
   */
  private createFormField(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): FormField | null {
    const name = element.name;
    const type = element.type || element.tagName.toLowerCase();
    
    if (!name || type === 'hidden' || type === 'submit' || type === 'button') {
      return null;
    }
    
    const label = this.getFieldLabel(element);
    const required = element.hasAttribute('required');
    const placeholder = element.getAttribute('placeholder');
    const value = (element as HTMLInputElement).value;
    const options = type === 'select' ? this.getSelectOptions(element as HTMLSelectElement) : undefined;
    
    return {
      name,
      type,
      label: label || name,
      required,
      ...(placeholder && { placeholder }),
      ...(value && { value }),
      ...(options && { options })
    };
  }

  /**
   * Get field label
   */
  private getFieldLabel(element: HTMLElement): string | undefined {
    // Try associated label
    const id = element.id;
    if (id) {
      const label = element.ownerDocument?.querySelector(`label[for="${id}"]`);
      if (label?.textContent) {
        return label.textContent.trim();
      }
    }
    
    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel?.textContent) {
      return parentLabel.textContent.trim();
    }
    
    // Try aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return ariaLabel.trim();
    }
    
    return undefined;
  }

  /**
   * Get select options
   */
  private getSelectOptions(select: HTMLSelectElement): string[] {
    const options: string[] = [];
    const optionElements = select.querySelectorAll('option');
    
    optionElements.forEach(option => {
      if (option.value && option.value !== '') {
        options.push(option.value);
      }
    });
    
    return options;
  }

  /**
   * Extract button parameters
   */
  private extractButtonParameters(element: HTMLElement, form: HTMLFormElement | null): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Basic button parameters
    // Basic button parameters
    params['type'] = element.getAttribute('type') || 'button';
    params['value'] = (element as HTMLInputElement).value || element.textContent?.trim();
    
    // Form-related parameters
    if (form) {
      params['formAction'] = form.action;
      params['formMethod'] = form.method;
    }
    
    return params;
  }

  /**
   * Check if action is valid
   */
  private isValidAction(action: ExtractedAction): boolean {
    return !!(action.id && action.label && action.selector && action.type);
  }

  /**
   * Enrich action with additional data
   */
  private enrichAction(action: ExtractedAction, url: string): ExtractedAction {
    // Add URL context
    action.url = url;
    
    // Enhance confidence based on context
    if (action.extractionMeta.attributes['id']) {
      action.confidence = Math.min(1.0, action.confidence + 0.05);
    }
    
    return action;
  }

  /**
   * Check if href is internal anchor
   */
  private isInternalAnchor(href: string): boolean {
    return href.startsWith('#');
  }

  /**
   * Check if URL is external
   */
  private isExternalUrl(href: string): boolean {
    try {
      const url = new URL(href);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

/**
 * Action extraction result
 */
export interface ActionExtractionResult {
  url: string;
  actions: ExtractedAction[];
  totalElements: number;
  validActions: number;
  errors: ActionExtractionError[];
  extractedAt: Date;
}

/**
 * Extracted action
 */
export interface ExtractedAction {
  id: string;
  type: string;
  label: string;
  selector: string;
  element: string;
  url: string;
  parameters: Record<string, any>;
  confirmation: boolean;
  sideEffects: string[];
  confidence: number;
  extractionMeta: ActionExtractionMeta;
}

/**
 * Action extraction metadata
 */
export interface ActionExtractionMeta {
  index: number;
  elementType: string;
  extractedAt: Date;
  attributes: Record<string, string>;
  customData?: any;
}

/**
 * Form field descriptor
 */
export interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  value?: string;
  options?: string[];
}

/**
 * Action extraction error
 */
export interface ActionExtractionError {
  type: 'extraction-error' | 'validation-error' | 'parsing-error';
  message: string;
  url: string;
}

/**
 * Factory function
 */
export function createActionExtractor(): ActionExtractor {
  return new ActionExtractor();
}