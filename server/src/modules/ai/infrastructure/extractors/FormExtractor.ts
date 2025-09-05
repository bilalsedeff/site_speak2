import { JSDOM } from 'jsdom';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'form-extractor' });

/**
 * Form Extractor
 * 
 * Extracts form information from HTML documents for voice AI interaction.
 * Provides comprehensive form field analysis, validation rules, and submission details.
 */
export class FormExtractor {
  
  /**
   * Extract all forms from HTML
   */
  async extractFromHtml(html: string, url: string): Promise<FormExtractionResult> {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      const forms: ExtractedForm[] = [];
      const formElements = document.querySelectorAll('form');
      
      logger.debug('Found forms', { 
        count: formElements.length, 
        url 
      });

      formElements.forEach((formElement, index) => {
        const extractedForm = this.extractFormData(formElement as HTMLFormElement, index, url);
        if (extractedForm) {
          forms.push(extractedForm);
        }
      });

      // Validate and enhance forms
      const validatedForms = this.validateAndEnrichForms(forms, url);

      const result: FormExtractionResult = {
        url,
        forms: validatedForms,
        totalForms: formElements.length,
        validForms: validatedForms.length,
        extractedAt: new Date()
      };

      logger.info('Form extraction completed', {
        url,
        totalForms: result.totalForms,
        validForms: result.validForms
      });

      return result;

    } catch (error) {
      logger.error('Form extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url
      });

      return {
        url,
        forms: [],
        totalForms: 0,
        validForms: 0,
        extractedAt: new Date()
      };
    }
  }

  /**
   * Extract data from individual form
   */
  private extractFormData(form: HTMLFormElement, index: number, url: string): ExtractedForm | null {
    try {
      const formId = this.generateFormId(form, index);
      const formType = this.classifyForm(form);
      
      // Extract form fields
      const fields = this.extractFormFields(form);
      if (fields.length === 0) {
        return null; // Skip forms with no fields
      }

      // Extract submit buttons
      const submitButtons = this.extractSubmitButtons(form);
      
      // Extract validation rules
      const validation = this.extractValidationRules(form, fields);

      const extractedForm: ExtractedForm = {
        id: formId,
        type: formType,
        name: form.name || formId,
        action: this.resolveFormAction(form.action, url),
        method: (form.method || 'get').toLowerCase() as FormMethod,
        enctype: form.enctype || 'application/x-www-form-urlencoded',
        selector: this.generateFormSelector(form),
        fields,
        submitButtons,
        validation,
        url,
        confidence: this.calculateFormConfidence(form, fields),
        extractionMeta: {
          index,
          hasId: !!form.id,
          hasName: !!form.name,
          hasAction: !!form.action,
          fieldCount: fields.length,
          extractedAt: new Date(),
          attributes: this.extractFormAttributes(form)
        }
      };

      return extractedForm;

    } catch (error) {
      logger.warn('Failed to extract form data', {
        formIndex: index,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Extract form fields with detailed information
   */
  private extractFormFields(form: HTMLFormElement): FormField[] {
    const fields: FormField[] = [];
    const fieldElements = form.querySelectorAll('input, select, textarea, button');

    fieldElements.forEach((element, index) => {
      const field = this.extractFieldData(element as HTMLElement, index);
      if (field) {
        fields.push(field);
      }
    });

    return fields;
  }

  /**
   * Extract individual field data
   */
  private extractFieldData(element: HTMLElement, index: number): FormField | null {
    const tagName = element.tagName.toLowerCase();
    
    // Skip certain elements
    if (tagName === 'button' && (element as HTMLButtonElement).type !== 'submit') {
      return null;
    }

    const label = this.getFieldLabel(element);
    const placeholder = element.getAttribute('placeholder');
    const validation = this.extractFieldValidation(element);
    const options = this.getFieldOptions(element);
    const value = this.getFieldValue(element);
    
    const field: FormField = {
      name: this.getFieldName(element),
      type: this.getFieldType(element),
      ...(label && { label }),
      selector: this.generateFieldSelector(element, index),
      required: element.hasAttribute('required'),
      disabled: element.hasAttribute('disabled'),
      readonly: element.hasAttribute('readonly'),
      ...(placeholder && { placeholder }),
      ...(value && { value }),
      ...(validation && { validation }),
      ...(options && { options }),
      confidence: this.calculateFieldConfidence(element),
      extractionMeta: {
        index,
        tagName,
        hasLabel: !!label,
        hasValidation: this.hasValidationAttributes(element),
        extractedAt: new Date()
      }
    };

    return field.name ? field : null;
  }

  /**
   * Extract submit buttons
   */
  private extractSubmitButtons(form: HTMLFormElement): SubmitButton[] {
    const buttons: SubmitButton[] = [];
    const submitElements = form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');

    submitElements.forEach((element, index) => {
      const button = this.extractSubmitButtonData(element as HTMLElement, index);
      if (button) {
        buttons.push(button);
      }
    });

    return buttons;
  }

  /**
   * Extract submit button data
   */
  private extractSubmitButtonData(element: HTMLElement, index: number): SubmitButton | null {
    const text = this.getElementText(element);
    if (!text) {return null;}

    const value = this.getElementValue(element);

    return {
      text,
      ...(value && { value }),
      selector: this.generateFieldSelector(element, index),
      primary: index === 0, // First submit button is usually primary
      type: this.classifySubmitButton(text)
    };
  }

  /**
   * Extract validation rules for form
   */
  private extractValidationRules(form: HTMLFormElement, fields: FormField[]): FormValidation {
    const rules: ValidationRule[] = [];
    const groups: ValidationGroup[] = [];

    // Extract field-level validation
    fields.forEach(field => {
      if (field.validation) {
        Object.entries(field.validation).forEach(([type, rule]) => {
          if (rule) {
            rules.push({
              field: field.name,
              type: type as ValidationType,
              rule,
              message: this.getValidationMessage(field.name, type, rule)
            });
          }
        });
      }
    });

    // Extract form-level validation attributes
    const novalidate = form.hasAttribute('novalidate');
    const customValidation = this.extractCustomValidation(form);

    return {
      rules,
      groups,
      novalidate,
      ...(customValidation && { customValidation })
    };
  }

  /**
   * Generate form ID
   */
  private generateFormId(form: HTMLFormElement, index: number): string {
    if (form.id) {return form.id;}
    if (form.name) {return form.name;}
    if (form.className) {
      const mainClass = form.className.split(' ')[0];
      return `form-${mainClass}-${index}`;
    }
    return `form-${index}`;
  }

  /**
   * Classify form type
   */
  private classifyForm(form: HTMLFormElement): FormType {
    const action = form.action?.toLowerCase() || '';
    const formId = form.id?.toLowerCase() || '';
    const formClass = form.className?.toLowerCase() || '';
    const formName = form.name?.toLowerCase() || '';
    
    // Check for specific patterns
    const combinedText = [action, formId, formClass, formName].join(' ');
    
    if (combinedText.includes('contact') || combinedText.includes('message')) {
      return 'contact';
    }
    if (combinedText.includes('search')) {
      return 'search';
    }
    if (combinedText.includes('newsletter') || combinedText.includes('subscribe')) {
      return 'newsletter';
    }
    if (combinedText.includes('login') || combinedText.includes('signin')) {
      return 'login';
    }
    if (combinedText.includes('register') || combinedText.includes('signup')) {
      return 'registration';
    }
    if (combinedText.includes('checkout') || combinedText.includes('payment')) {
      return 'checkout';
    }
    if (combinedText.includes('booking') || combinedText.includes('reservation')) {
      return 'booking';
    }
    if (combinedText.includes('feedback') || combinedText.includes('review')) {
      return 'feedback';
    }

    // Check field types
    const fields = form.querySelectorAll('input, textarea, select');
    const fieldTypes = Array.from(fields).map(f => f.getAttribute('type') || f.tagName.toLowerCase());
    
    if (fieldTypes.includes('email') && fieldTypes.includes('password')) {
      return 'login';
    }
    if (fieldTypes.includes('email') && fieldTypes.some(t => t.includes('name'))) {
      return 'contact';
    }

    return 'other';
  }

  /**
   * Get field name
   */
  private getFieldName(element: HTMLElement): string {
    return element.getAttribute('name') || 
           element.getAttribute('id') || 
           `field-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get field type
   */
  private getFieldType(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'input') {
      return (element as HTMLInputElement).type || 'text';
    }
    if (tagName === 'select') {
      return (element as HTMLSelectElement).multiple ? 'select-multiple' : 'select';
    }
    
    return tagName;
  }

  /**
   * Get field label
   */
  private getFieldLabel(element: HTMLElement): string | undefined {
    // Try associated label element
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
      // Remove the input's own text from the label
      const labelText = parentLabel.textContent.trim();
      const inputText = element.getAttribute('value') || '';
      return labelText.replace(inputText, '').trim();
    }
    
    // Try aria-label or aria-labelledby
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {return ariaLabel.trim();}
    
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = element.ownerDocument?.getElementById(ariaLabelledBy);
      if (labelElement?.textContent) {
        return labelElement.textContent.trim();
      }
    }
    
    // Try placeholder as last resort
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {return placeholder;}
    
    return undefined;
  }

  /**
   * Get field value
   */
  private getFieldValue(element: HTMLElement): string | undefined {
    if (element.tagName.toLowerCase() === 'textarea') {
      return (element as HTMLTextAreaElement).value || undefined;
    }
    
    if (element.tagName.toLowerCase() === 'select') {
      const select = element as HTMLSelectElement;
      return select.value || undefined;
    }
    
    if (element.tagName.toLowerCase() === 'input') {
      const input = element as HTMLInputElement;
      return input.value || undefined;
    }
    
    return undefined;
  }

  /**
   * Get field options for select elements
   */
  private getFieldOptions(element: HTMLElement): FieldOption[] | undefined {
    if (element.tagName.toLowerCase() !== 'select') {
      return undefined;
    }
    
    const select = element as HTMLSelectElement;
    const options: FieldOption[] = [];
    
    Array.from(select.options).forEach(option => {
      options.push({
        value: option.value,
        text: option.textContent || option.value,
        selected: option.selected,
        disabled: option.disabled
      });
    });
    
    return options.length > 0 ? options : undefined;
  }

  /**
   * Extract field validation rules
   */
  private extractFieldValidation(element: HTMLElement): Record<string, ValidationRuleData> | undefined {
    const validation: Record<string, ValidationRuleData> = {};
    
    // Required validation
    if (element.hasAttribute('required')) {
      validation['required'] = { required: true };
    }
    
    // Pattern validation
    const pattern = element.getAttribute('pattern');
    if (pattern) {
      validation['pattern'] = { pattern };
    }
    
    // Min/Max length
    const minlength = element.getAttribute('minlength');
    const maxlength = element.getAttribute('maxlength');
    if (minlength) {
      validation['minLength'] = { minLength: parseInt(minlength, 10) };
    }
    if (maxlength) {
      validation['maxLength'] = { maxLength: parseInt(maxlength, 10) };
    }
    
    // Min/Max value (for number inputs)
    const min = element.getAttribute('min');
    const max = element.getAttribute('max');
    if (min) {
      validation['min'] = { min: parseFloat(min) };
    }
    if (max) {
      validation['max'] = { max: parseFloat(max) };
    }
    
    // Email validation
    if ((element as HTMLInputElement).type === 'email') {
      validation['email'] = { email: true };
    }
    
    // URL validation
    if ((element as HTMLInputElement).type === 'url') {
      validation['url'] = { url: true };
    }
    
    return Object.keys(validation).length > 0 ? validation : undefined;
  }

  /**
   * Resolve form action URL
   */
  private resolveFormAction(action: string | undefined, baseUrl: string): string {
    if (!action || action === '') {
      return baseUrl;
    }
    
    try {
      // If action is already absolute, return it
      new URL(action);
      return action;
    } catch {
      // Resolve relative action against base URL
      try {
        return new URL(action, baseUrl).toString();
      } catch {
        return baseUrl;
      }
    }
  }

  /**
   * Generate form selector
   */
  private generateFormSelector(form: HTMLFormElement): string {
    if (form.id) {
      return `#${form.id}`;
    }
    
    if (form.name) {
      return `form[name="${form.name}"]`;
    }
    
    if (form.className) {
      const classes = form.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `form.${classes.join('.')}`;
      }
    }
    
    // Generate path-based selector
    return this.generatePathSelector(form);
  }

  /**
   * Generate field selector
   */
  private generateFieldSelector(element: HTMLElement, index: number): string {
    const tagName = element.tagName.toLowerCase();
    
    if (element.id) {
      return `#${element.id}`;
    }
    
    const name = element.getAttribute('name');
    if (name) {
      return `${tagName}[name="${name}"]`;
    }
    
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return `${tagName}.${classes.join('.')}`;
      }
    }
    
    return `${tagName}:nth-of-type(${index + 1})`;
  }

  /**
   * Generate path-based selector
   */
  private generatePathSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
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
      
      if (path.length >= 5) {break;}
    }
    
    return path.join(' > ');
  }

  /**
   * Calculate form confidence score
   */
  private calculateFormConfidence(form: HTMLFormElement, fields: FormField[]): number {
    let confidence = 0.6; // Base confidence
    
    // Boost for semantic attributes
    if (form.id) {confidence += 0.1;}
    if (form.name) {confidence += 0.1;}
    if (form.action) {confidence += 0.1;}
    
    // Boost for field quality
    const labeledFields = fields.filter(f => f.label).length;
    if (labeledFields > 0) {
      confidence += (labeledFields / fields.length) * 0.1;
    }
    
    // Boost for validation
    const validatedFields = fields.filter(f => f.validation && Object.keys(f.validation).length > 0).length;
    if (validatedFields > 0) {
      confidence += (validatedFields / fields.length) * 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Calculate field confidence score
   */
  private calculateFieldConfidence(element: HTMLElement): number {
    let confidence = 0.7; // Base confidence
    
    if (this.getFieldLabel(element)) {confidence += 0.1;}
    if (element.getAttribute('name')) {confidence += 0.1;}
    if (this.hasValidationAttributes(element)) {confidence += 0.1;}
    
    return Math.min(1.0, confidence);
  }

  /**
   * Check if element has validation attributes
   */
  private hasValidationAttributes(element: HTMLElement): boolean {
    const validationAttrs = ['required', 'pattern', 'minlength', 'maxlength', 'min', 'max'];
    return validationAttrs.some(attr => element.hasAttribute(attr));
  }

  /**
   * Get element text content
   */
  private getElementText(element: HTMLElement): string {
    return element.textContent?.trim() || 
           element.getAttribute('value') || 
           element.getAttribute('aria-label') || 
           '';
  }

  /**
   * Get element value
   */
  private getElementValue(element: HTMLElement): string | undefined {
    return (element as HTMLInputElement).value || undefined;
  }

  /**
   * Classify submit button type
   */
  private classifySubmitButton(text: string): string {
    const lowText = text.toLowerCase();
    
    if (lowText.includes('submit') || lowText.includes('send')) {return 'submit';}
    if (lowText.includes('search') || lowText.includes('find')) {return 'search';}
    if (lowText.includes('subscribe') || lowText.includes('sign up')) {return 'subscribe';}
    if (lowText.includes('login') || lowText.includes('sign in')) {return 'login';}
    if (lowText.includes('register') || lowText.includes('create account')) {return 'register';}
    
    return 'submit';
  }

  /**
   * Extract form attributes
   */
  private extractFormAttributes(form: HTMLFormElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    const relevantAttrs = ['id', 'name', 'class', 'action', 'method', 'enctype', 'target', 'novalidate'];
    
    relevantAttrs.forEach(attr => {
      const value = form.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    });
    
    return attributes;
  }

  /**
   * Get validation message
   */
  private getValidationMessage(fieldName: string, type: string, rule: any): string {
    const messages: Record<string, string> = {
      required: `${fieldName} is required`,
      email: `Please enter a valid email address`,
      url: `Please enter a valid URL`,
      pattern: `${fieldName} format is invalid`,
      minLength: `${fieldName} must be at least ${rule.minLength} characters`,
      maxLength: `${fieldName} must be no more than ${rule.maxLength} characters`,
      min: `${fieldName} must be at least ${rule.min}`,
      max: `${fieldName} must be no more than ${rule.max}`
    };
    
    return messages[type] || `${fieldName} validation failed`;
  }

  /**
   * Extract custom validation
   */
  private extractCustomValidation(form: HTMLFormElement): Record<string, any> | undefined {
    const customValidation: Record<string, any> = {};
    
    // Look for data attributes with validation
    Array.from(form.attributes).forEach(attr => {
      if (attr.name.startsWith('data-validation-')) {
        const ruleName = attr.name.replace('data-validation-', '');
        try {
          customValidation[ruleName] = JSON.parse(attr.value);
        } catch {
          customValidation[ruleName] = attr.value;
        }
      }
    });
    
    return Object.keys(customValidation).length > 0 ? customValidation : undefined;
  }

  /**
   * Validate and enrich forms
   */
  private validateAndEnrichForms(forms: ExtractedForm[], url: string): ExtractedForm[] {
    return forms
      .filter(form => this.isValidForm(form))
      .map(form => this.enrichForm(form, url))
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if form is valid
   */
  private isValidForm(form: ExtractedForm): boolean {
    return !!(form.id && form.fields.length > 0 && form.selector);
  }

  /**
   * Enrich form with additional data
   */
  private enrichForm(form: ExtractedForm, url: string): ExtractedForm {
    // Ensure URL is set
    form.url = url;
    
    // Add semantic labels based on form type
    if (!form.extractionMeta) {
      form.extractionMeta = {} as any;
    }
    
    return form;
  }
}

// Type definitions
export type FormType = 'contact' | 'search' | 'newsletter' | 'login' | 'registration' | 'checkout' | 'booking' | 'feedback' | 'other';
export type FormMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type ValidationType = 'required' | 'pattern' | 'minLength' | 'maxLength' | 'min' | 'max' | 'email' | 'url';

export interface FormExtractionResult {
  url: string;
  forms: ExtractedForm[];
  totalForms: number;
  validForms: number;
  extractedAt: Date;
}

export interface ExtractedForm {
  id: string;
  type: FormType;
  name: string;
  action: string;
  method: FormMethod;
  enctype: string;
  selector: string;
  fields: FormField[];
  submitButtons: SubmitButton[];
  validation: FormValidation;
  url: string;
  confidence: number;
  extractionMeta: FormExtractionMeta;
}

export interface FormField {
  name: string;
  type: string;
  label?: string;
  selector: string;
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  placeholder?: string;
  value?: string;
  validation?: Record<string, ValidationRuleData>;
  options?: FieldOption[];
  confidence: number;
  extractionMeta: FieldExtractionMeta;
}

export interface FieldOption {
  value: string;
  text: string;
  selected: boolean;
  disabled: boolean;
}

export interface SubmitButton {
  text: string;
  value?: string;
  selector: string;
  primary: boolean;
  type: string;
}

export interface FormValidation {
  rules: ValidationRule[];
  groups: ValidationGroup[];
  novalidate: boolean;
  customValidation?: Record<string, any>;
}

export interface ValidationRule {
  field: string;
  type: ValidationType;
  rule: ValidationRuleData;
  message: string;
}

export interface ValidationRuleData {
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  email?: boolean;
  url?: boolean;
}

export interface ValidationGroup {
  name: string;
  fields: string[];
  type: 'all' | 'any';
}

export interface FormExtractionMeta {
  index: number;
  hasId: boolean;
  hasName: boolean;
  hasAction: boolean;
  fieldCount: number;
  extractedAt: Date;
  attributes: Record<string, string>;
}

export interface FieldExtractionMeta {
  index: number;
  tagName: string;
  hasLabel: boolean;
  hasValidation: boolean;
  extractedAt: Date;
}

/**
 * Factory function
 */
export function createFormExtractor(): FormExtractor {
  return new FormExtractor();
}