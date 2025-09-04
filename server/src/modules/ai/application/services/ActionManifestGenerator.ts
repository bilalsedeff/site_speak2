/**
 * Action Manifest Generator - Build-time action manifest creation
 * 
 * Analyzes HTML content and site structure to generate comprehensive
 * action manifests for AI agent interaction with published sites.
 */

import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../../../shared/utils.js';
import type { ActionParameter } from '../../../../shared/types.js';

const logger = createLogger({ service: 'action-manifest-generator' });

/**
 * Enhanced site manifest interface
 */
export interface SiteManifest {
  siteId: string;
  version: string;
  generatedAt: string;
  actions: EnhancedSiteAction[];
  capabilities: string[];
  metadata: SiteCapabilities;
  privacy?: PrivacySettings;
  security: SecuritySettings;
}

/**
 * Enhanced action interface with security and validation
 */
export interface EnhancedSiteAction {
  // Base SiteAction properties
  name: string;
  type: 'navigation' | 'form' | 'button' | 'api' | 'custom';
  description: string;
  parameters: ActionParameter[];
  selector?: string;
  confirmation?: boolean;
  sideEffecting?: 'safe' | 'read' | 'write';
  riskLevel?: 'low' | 'medium' | 'high';
  category?: string;
  metadata?: Record<string, any>;
  
  // Enhanced properties
  id: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint?: string;
  requiresAuth: boolean;
  jsonSchema?: Record<string, any>; // JSON Schema 2020-12 for OpenAI
  validationSchema?: z.ZodSchema;   // Runtime validation
}

/**
 * Site capabilities detection
 */
export interface SiteCapabilities {
  hasContactForm: boolean;
  hasEcommerce: boolean;
  hasBooking: boolean;
  hasBlog: boolean;
  hasGallery: boolean;
  hasAuth: boolean;
  hasSearch: boolean;
  hasNavigation: boolean;
  hasFilters: boolean;
  hasComments: boolean;
  hasNewsletter: boolean;
  hasShoppingCart: boolean;
  hasPayments: boolean;
  hasUserProfiles: boolean;
  hasFileUploads: boolean;
}

/**
 * Privacy settings for action execution
 */
export interface PrivacySettings {
  indexablePages?: string[];
  excludedPages?: string[];
  excludedSelectors?: string[];
  sensitiveFields?: string[];
  piiFields?: string[];
}

/**
 * Security settings for actions
 */
export interface SecuritySettings {
  allowedOrigins: string[];
  csrfProtection: boolean;
  rateLimiting: boolean;
  requiresHttps: boolean;
  allowedMethods: string[];
}

/**
 * Form field analysis result
 */
interface FormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  validation?: Record<string, any>;
  options?: string[];
}

/**
 * Discovered page structure
 */
interface DiscoveredPage {
  url: string;
  title: string;
  forms: FormField[][];
  buttons: Array<{ text: string; selector: string; action?: string }>;
  links: Array<{ text: string; href: string; internal: boolean }>;
  capabilities: string[];
}

/**
 * Action Manifest Generator Service
 */
export class ActionManifestGenerator {
  private readonly widgetVersion = '1.0.0';

  /**
   * Generate complete site manifest from HTML content
   */
  async generateManifest(
    siteId: string,
    htmlContent: string,
    options: {
      baseUrl?: string;
      includePrivacy?: boolean;
      securitySettings?: Partial<SecuritySettings>;
    } = {}
  ): Promise<SiteManifest> {
    const startTime = Date.now();
    
    logger.info('Generating action manifest', {
      siteId,
      contentLength: htmlContent.length,
      options,
    });

    try {
      const $ = cheerio.load(htmlContent);
      
      // Analyze page structure
      const discoveredPage = this.analyzePage($, options.baseUrl || '');
      
      // Generate actions from discovered elements
      const actions = await this.generateActions($, discoveredPage, siteId);
      
      // Detect site capabilities
      const capabilities = this.detectCapabilities($, discoveredPage);
      
      // Create security settings
      const security: SecuritySettings = {
        allowedOrigins: [options.baseUrl || 'https://*.sitespeak.com'],
        csrfProtection: true,
        rateLimiting: true,
        requiresHttps: true,
        allowedMethods: ['GET', 'POST'],
        ...options.securitySettings,
      };

      // Create privacy settings if requested
      const privacy = options.includePrivacy ? this.generatePrivacySettings($) : undefined;

      const manifest: SiteManifest = {
        siteId,
        version: this.widgetVersion,
        generatedAt: new Date().toISOString(),
        actions,
        capabilities: Object.entries(capabilities)
          .filter(([, value]) => value)
          .map(([key]) => key.replace('has', '').toLowerCase()),
        metadata: capabilities,
        ...(privacy !== undefined && { privacy }),
        security,
      };

      const duration = Date.now() - startTime;
      logger.info('Action manifest generated successfully', {
        siteId,
        actionCount: actions.length,
        capabilities: manifest.capabilities,
        duration,
      });

      return manifest;
    } catch (error) {
      logger.error('Action manifest generation failed', {
        siteId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Analyze page structure and extract interactive elements
   */
  private analyzePage($: cheerio.CheerioAPI, baseUrl: string): DiscoveredPage {
    // Extract forms with field analysis
    const forms: FormField[][] = [];
    $('form').each((_, form) => {
      const formFields: FormField[] = [];
      $(form).find('input, select, textarea').each((_, field) => {
        const $field = $(field);
        const type = $field.attr('type') || $field.prop('tagName')?.toLowerCase() || 'text';
        
        const placeholder = $field.attr('placeholder');
        const validation = this.extractFieldValidation($field, type);
        const options = type === 'select' ? this.extractSelectOptions($, $field) : undefined;
        
        formFields.push({
          name: $field.attr('name') || $field.attr('id') || '',
          type,
          label: this.extractFieldLabel($, $field),
          required: Boolean($field.prop('required')) || $field.attr('required') !== undefined,
          ...(placeholder !== undefined && { placeholder }),
          ...(validation !== undefined && { validation }),
          ...(options !== undefined && { options }),
        });
      });
      
      if (formFields.length > 0) {
        forms.push(formFields);
      }
    });

    // Extract buttons with actions
    const buttons: Array<{ text: string; selector: string; action?: string }> = [];
    $('button, input[type="button"], input[type="submit"], [data-action]').each((_, btn) => {
      const $btn = $(btn);
      const text = $btn.text().trim() || $btn.attr('value') || $btn.attr('aria-label') || '';
      const action = $btn.attr('data-action');
      
      buttons.push({
        text,
        selector: this.generateSelector($, $btn),
        ...(action !== undefined && { action }),
      });
    });

    // Extract navigation links
    const links: Array<{ text: string; href: string; internal: boolean }> = [];
    $('a[href]').each((_, link) => {
      const $link = $(link);
      const href = $link.attr('href') || '';
      const text = $link.text().trim();
      
      if (href && text) {
        links.push({
          text,
          href,
          internal: this.isInternalLink(href, baseUrl),
        });
      }
    });

    // Detect capabilities from structure
    const capabilities: string[] = [];
    if (forms.length > 0) {capabilities.push('forms');}
    if (buttons.some(b => b.action?.includes('cart'))) {capabilities.push('ecommerce');}
    if ($('[role="search"], .search, #search').length > 0) {capabilities.push('search');}
    if ($('[role="navigation"], nav').length > 0) {capabilities.push('navigation');}

    return {
      url: baseUrl,
      title: $('title').text() || '',
      forms,
      buttons,
      links,
      capabilities,
    };
  }

  /**
   * Generate actions from discovered page elements
   */
  private async generateActions(
    $: cheerio.CheerioAPI,
    page: DiscoveredPage,
    siteId: string
  ): Promise<EnhancedSiteAction[]> {
    const actions: EnhancedSiteAction[] = [];

    // Generate navigation actions
    const navActions = this.generateNavigationActions(page.links);
    actions.push(...navActions);

    // Generate form actions
    const formActions = await this.generateFormActions(page.forms, $);
    actions.push(...formActions);

    // Generate button actions
    const buttonActions = this.generateButtonActions(page.buttons);
    actions.push(...buttonActions);

    // Generate search actions if search capability exists
    if (page.capabilities.includes('search')) {
      const searchActions = this.generateSearchActions($);
      actions.push(...searchActions);
    }

    // Add unique IDs and validation
    return actions.map((action, index) => ({
      ...action,
      id: `${siteId}_${action.name}_${index}`,
      jsonSchema: this.generateJsonSchema(action.parameters),
      validationSchema: this.generateZodSchema(action.parameters),
    }));
  }

  /**
   * Generate navigation actions from links
   */
  private generateNavigationActions(links: Array<{ text: string; href: string; internal: boolean }>): EnhancedSiteAction[] {
    return links
      .filter(link => link.internal)
      .slice(0, 10) // Limit to top 10 navigation items
      .map(link => ({
        name: `navigate_to_${this.slugify(link.text)}`,
        type: 'navigation' as const,
        description: `Navigate to ${link.text}`,
        parameters: [],
        id: `nav_${this.slugify(link.text)}_${Date.now()}`,
        selector: `a[href="${link.href}"]`,
        confirmation: false,
        sideEffecting: 'safe' as const,
        riskLevel: 'low' as const,
        category: 'read' as const,
        requiresAuth: false,
        metadata: {
          url: link.href,
          linkText: link.text,
        },
      }));
  }

  /**
   * Generate form submission actions
   */
  private async generateFormActions(forms: FormField[][], $: cheerio.CheerioAPI): Promise<EnhancedSiteAction[]> {
    const actions: EnhancedSiteAction[] = [];

    forms.forEach((formFields, formIndex) => {
      const formEl = $('form').eq(formIndex);
      const formName = formEl.attr('name') || formEl.attr('id') || `form_${formIndex}`;
      const isContactForm = this.isContactForm(formFields);
      const isPaymentForm = this.isPaymentForm(formFields);
      
      const parameters: ActionParameter[] = formFields
        .filter(field => field.name)
        .map(field => {
          const description = field.label || `${field.name} field`;
          return {
            name: field.name,
            type: this.mapFieldType(field.type),
            required: field.required,
            ...(description !== undefined && { description }),
            ...(field.validation !== undefined && { validation: field.validation }),
          };
        });

      actions.push({
        id: `form_${this.slugify(formName)}_${Date.now()}`,
        name: `submit_${this.slugify(formName)}`,
        type: 'form' as const,
        description: `Submit ${formName}${isContactForm ? ' contact form' : ''}`,
        parameters,
        selector: `form[name="${formName}"], form:nth-of-type(${formIndex + 1})`,
        method: this.normalizeHttpMethod(formEl.attr('method')),
        endpoint: formEl.attr('action') || '#',
        confirmation: isPaymentForm,
        sideEffecting: isPaymentForm ? 'write' : 'write',
        riskLevel: isPaymentForm ? 'high' : (isContactForm ? 'medium' : 'low'),
        category: isPaymentForm ? 'payment' : 'communication',
        requiresAuth: isPaymentForm,
        metadata: {
          formName,
          fieldCount: formFields.length,
          hasFileUpload: formFields.some(f => f.type === 'file'),
        },
      });
    });

    return actions;
  }

  /**
   * Generate button click actions
   */
  private generateButtonActions(buttons: Array<{ text: string; selector: string; action?: string }>): EnhancedSiteAction[] {
    return buttons
      .filter(btn => btn.text && !btn.text.toLowerCase().includes('submit')) // Exclude form submits
      .slice(0, 15) // Limit button actions
      .map(btn => {
        const isDestructive = /delete|remove|cancel|close/i.test(btn.text);
        const isAddToCart = /cart|add.*cart|buy/i.test(btn.text);
        const isBooking = /book|reserve|schedule/i.test(btn.text);
        
        return {
          id: `btn_${this.slugify(btn.text)}_${Date.now()}`,
          name: `click_${this.slugify(btn.text)}`,
          type: 'button' as const,
          description: `Click ${btn.text} button`,
          parameters: [],
          selector: btn.selector,
          confirmation: isDestructive || isBooking,
          sideEffecting: isDestructive ? 'write' : (isAddToCart || isBooking ? 'write' : 'safe'),
          riskLevel: isDestructive ? 'high' : (isAddToCart || isBooking ? 'medium' : 'low'),
          category: isDestructive ? 'delete' : (isAddToCart ? 'write' : 'read'),
          requiresAuth: isBooking || isDestructive,
          metadata: {
            buttonText: btn.text,
            dataAction: btn.action,
          },
        };
      });
  }

  /**
   * Generate search actions
   */
  private generateSearchActions($: cheerio.CheerioAPI): EnhancedSiteAction[] {
    const searchElements = $('[role="search"], .search, #search, input[type="search"]');
    
    if (searchElements.length === 0) {return [];}

    const searchSchema = z.object({
      query: z.string().min(1).max(100),
      filters: z.record(z.string()).optional(),
    });

    return [{
      id: `search_site_${Date.now()}`,
      name: 'search_site',
      type: 'custom' as const,
      description: 'Search the website content',
      parameters: [
        {
          name: 'query',
          type: 'string' as const,
          required: true,
          description: 'Search query',
          validation: { min: 1, max: 100 },
        },
        {
          name: 'filters',
          type: 'object' as const,
          required: false,
          description: 'Additional search filters',
        },
      ],
      selector: searchElements.first().get(0) ? this.generateSelector($, searchElements.first()) : '.search',
      confirmation: false,
      sideEffecting: 'safe' as const,
      riskLevel: 'low' as const,
      category: 'read' as const,
      requiresAuth: false,
      validationSchema: searchSchema,
      jsonSchema: zodToJsonSchema(searchSchema),
      metadata: {
        searchElementCount: searchElements.length,
      },
    }];
  }

  /**
   * Detect site capabilities from HTML structure
   */
  private detectCapabilities($: cheerio.CheerioAPI, page: DiscoveredPage): SiteCapabilities {
    return {
      hasContactForm: page.forms.some(form => this.isContactForm(form)),
      hasEcommerce: this.hasEcommerceCapability($, page),
      hasBooking: this.hasBookingCapability($, page),
      hasBlog: this.hasBlogCapability($),
      hasGallery: this.hasGalleryCapability($),
      hasAuth: this.hasAuthCapability($, page),
      hasSearch: $('[role="search"], .search, #search, input[type="search"]').length > 0,
      hasNavigation: $('[role="navigation"], nav, .nav, .navigation').length > 0,
      hasFilters: $('.filter, .filters, [data-filter]').length > 0,
      hasComments: $('.comment, .comments, [data-comments]').length > 0,
      hasNewsletter: page.forms.some(form => this.isNewsletterForm(form)),
      hasShoppingCart: $('.cart, .shopping-cart, [data-cart]').length > 0,
      hasPayments: this.hasPaymentCapability($, page),
      hasUserProfiles: $('.profile, .user-profile, [data-profile]').length > 0,
      hasFileUploads: $('input[type="file"]').length > 0,
    };
  }

  /**
   * Generate privacy settings from HTML analysis
   */
  private generatePrivacySettings($: cheerio.CheerioAPI): PrivacySettings {
    const sensitiveSelectors = [
      'input[type="password"]',
      'input[type="email"]',
      'input[name*="phone"]',
      'input[name*="ssn"]',
      'input[name*="tax"]',
      '[data-sensitive]',
    ];

    const excludedSelectors = [
      '.admin',
      '.private',
      '[data-private]',
      '.sensitive',
      '[data-exclude]',
    ];

    const piiFields: string[] = [];
    $('input').each((_, input) => {
      const name = $(input).attr('name') || '';
      const type = $(input).attr('type') || '';
      
      if (type === 'email' || name.includes('email')) {piiFields.push(name);}
      if (name.includes('phone') || name.includes('tel')) {piiFields.push(name);}
      if (name.includes('address') || name.includes('location')) {piiFields.push(name);}
    });

    return {
      excludedSelectors,
      sensitiveFields: sensitiveSelectors,
      piiFields,
    };
  }

  /**
   * Generate JSON Schema for OpenAI function calling
   */
  private generateJsonSchema(parameters: ActionParameter[]): Record<string, any> {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    parameters.forEach(param => {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };

      if (param.validation) {
        if (param.validation.min !== undefined) {properties[param.name].minimum = param.validation.min;}
        if (param.validation.max !== undefined) {properties[param.name].maximum = param.validation.max;}
        if (param.validation.pattern) {properties[param.name].pattern = param.validation.pattern;}
        if (param.validation.options) {properties[param.name].enum = param.validation.options;}
      }

      if (param.required) {
        required.push(param.name);
      }

      if (param.default !== undefined) {
        properties[param.name].default = param.default;
      }
    });

    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * Generate Zod schema for runtime validation
   */
  private generateZodSchema(parameters: ActionParameter[]): z.ZodSchema {
    const shape: Record<string, z.ZodTypeAny> = {};

    parameters.forEach(param => {
      let schema: z.ZodTypeAny;

      switch (param.type) {
        case 'string':
          schema = z.string();
          if (param.validation?.min) {schema = (schema as z.ZodString).min(param.validation.min);}
          if (param.validation?.max) {schema = (schema as z.ZodString).max(param.validation.max);}
          if (param.validation?.pattern) {schema = (schema as z.ZodString).regex(new RegExp(param.validation.pattern));}
          if (param.validation?.options) {schema = z.enum(param.validation.options as [string, ...string[]]);}
          break;
        
        case 'number':
          schema = z.number();
          if (param.validation?.min) {schema = (schema as z.ZodNumber).min(param.validation.min);}
          if (param.validation?.max) {schema = (schema as z.ZodNumber).max(param.validation.max);}
          break;
        
        case 'boolean':
          schema = z.boolean();
          break;
        
        case 'array':
          schema = z.array(z.any());
          break;
        
        case 'object':
          schema = z.record(z.any());
          break;
        
        default:
          schema = z.any();
      }

      if (!param.required) {
        schema = schema.optional();
      }

      if (param.default !== undefined) {
        schema = schema.default(param.default);
      }

      shape[param.name] = schema;
    });

    return z.object(shape);
  }

  // Helper methods for analysis
  private extractFieldLabel($: cheerio.CheerioAPI, $field: cheerio.Cheerio<Element>): string {
    const id = $field.attr('id');
    if (id) {
      const label = $(`label[for="${id}"]`).text().trim();
      if (label) {return label;}
    }
    
    const placeholder = $field.attr('placeholder');
    if (placeholder) {return placeholder;}
    
    return $field.attr('name') || 'Field';
  }

  private extractFieldValidation($field: cheerio.Cheerio<Element>, _type: string): { min?: number; max?: number; pattern?: string; options?: string[]; } | undefined {
    const validation: { min?: number; max?: number; pattern?: string; options?: string[]; } = {};
    
    const min = $field.attr('min');
    const max = $field.attr('max');
    const pattern = $field.attr('pattern');
    const minLength = $field.attr('minlength');
    const maxLength = $field.attr('maxlength');
    
    if (min) {validation.min = parseFloat(min);}
    if (max) {validation.max = parseFloat(max);}
    if (pattern) {validation.pattern = pattern;}
    if (minLength) {validation.min = parseInt(minLength);}
    if (maxLength) {validation.max = parseInt(maxLength);}
    
    return Object.keys(validation).length > 0 ? validation : undefined;
  }

  private extractSelectOptions($: cheerio.CheerioAPI, $field: cheerio.Cheerio<Element>): string[] | undefined {
    const options: string[] = [];
    $field.find('option').each((_, option) => {
      const value = $(option).attr('value');
      if (value) {options.push(value);}
    });
    return options.length > 0 ? options : undefined;
  }

  private generateSelector(_$: cheerio.CheerioAPI, $element: cheerio.Cheerio<Element>): string {
    // Prefer data-action attributes
    const dataAction = $element.attr('data-action');
    if (dataAction) {return `[data-action="${dataAction}"]`;}
    
    // Try ID
    const id = $element.attr('id');
    if (id) {return `#${id}`;}
    
    // Try name
    const name = $element.attr('name');
    if (name) {return `[name="${name}"]`;}
    
    // Fall back to class or tag
    const className = $element.attr('class');
    if (className) {
      const firstClass = className.split(' ')[0];
      return `.${firstClass}`;
    }
    
    return $element.prop('tagName')?.toLowerCase() || 'element';
  }

  private isInternalLink(href: string, baseUrl: string): boolean {
    if (href.startsWith('/')) {return true;}
    if (href.startsWith('#')) {return false;}
    if (href.startsWith('mailto:') || href.startsWith('tel:')) {return false;}
    
    try {
      const url = new URL(href);
      const base = new URL(baseUrl);
      return url.hostname === base.hostname;
    } catch {
      return false;
    }
  }

  private isContactForm(fields: FormField[]): boolean {
    const fieldNames = fields.map(f => f.name.toLowerCase());
    return fieldNames.some(name => 
      ['email', 'message', 'subject', 'name', 'contact'].some(keyword => name.includes(keyword))
    );
  }

  private isPaymentForm(fields: FormField[]): boolean {
    const fieldNames = fields.map(f => f.name.toLowerCase());
    return fieldNames.some(name => 
      ['card', 'payment', 'billing', 'cvv', 'expiry', 'amount'].some(keyword => name.includes(keyword))
    );
  }

  private isNewsletterForm(fields: FormField[]): boolean {
    return fields.length <= 2 && fields.some(f => f.type === 'email');
  }

  private normalizeHttpMethod(method?: string): 'GET' | 'POST' | 'PUT' | 'DELETE' {
    if (!method) {return 'POST';}
    const upperMethod = method.toUpperCase();
    if (['GET', 'POST', 'PUT', 'DELETE'].includes(upperMethod)) {
      return upperMethod as 'GET' | 'POST' | 'PUT' | 'DELETE';
    }
    return 'POST'; // Default fallback
  }

  private hasEcommerceCapability($: cheerio.CheerioAPI, page: DiscoveredPage): boolean {
    const ecommerceSelectors = ['.cart', '.add-to-cart', '.product', '.price', '[data-price]', '.checkout'];
    return ecommerceSelectors.some(selector => $(selector).length > 0) ||
           page.buttons.some(btn => /cart|buy|purchase|checkout/i.test(btn.text));
  }

  private hasBookingCapability($: cheerio.CheerioAPI, page: DiscoveredPage): boolean {
    const bookingSelectors = ['.booking', '.appointment', '.schedule', '[data-booking]'];
    return bookingSelectors.some(selector => $(selector).length > 0) ||
           page.buttons.some(btn => /book|reserve|schedule|appointment/i.test(btn.text)) ||
           page.forms.some(form => form.some(field => /date|time|appointment|booking/i.test(field.name)));
  }

  private hasBlogCapability($: cheerio.CheerioAPI): boolean {
    const blogSelectors = ['.blog', '.post', '.article', '[data-blog]', 'article'];
    return blogSelectors.some(selector => $(selector).length > 0);
  }

  private hasGalleryCapability($: cheerio.CheerioAPI): boolean {
    const gallerySelectors = ['.gallery', '.photos', '.images', '[data-gallery]'];
    return gallerySelectors.some(selector => $(selector).length > 0) ||
           $('img').length > 5; // Many images suggest gallery
  }

  private hasAuthCapability($: cheerio.CheerioAPI, page: DiscoveredPage): boolean {
    const authSelectors = ['.login', '.signin', '.auth', '[data-auth]'];
    return authSelectors.some(selector => $(selector).length > 0) ||
           page.buttons.some(btn => /login|signin|register|signup|auth/i.test(btn.text)) ||
           page.forms.some(form => form.some(field => field.type === 'password'));
  }

  private hasPaymentCapability($: cheerio.CheerioAPI, page: DiscoveredPage): boolean {
    return page.forms.some(form => this.isPaymentForm(form)) ||
           $('.payment, .stripe, .paypal, [data-payment]').length > 0;
  }

  private mapFieldType(htmlType: string): ActionParameter['type'] {
    switch (htmlType) {
      case 'number':
      case 'range':
        return 'number';
      case 'checkbox':
        return 'boolean';
      case 'select':
      case 'select-multiple':
        return 'array';
      default:
        return 'string';
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);
  }
}

/**
 * Export singleton instance
 */
export const actionManifestGenerator = new ActionManifestGenerator();

