/**
 * Forms Tools
 * 
 * Generic form interaction tools bound to site contract.
 * Integrates with existing ActionExecutorService form execution.
 */

import { z } from 'zod';
import { createLogger } from '../../../../../shared/utils.js';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  CssSelectorSchema,
  EmailSchema,
  PhoneSchema,
  IdempotencyKeySchema,
  toJsonSchema
} from './validators';
import { actionExecutorService } from '../application/ActionExecutorService';

const logger = createLogger({ service: 'forms-tools' });

// ==================== PARAMETER SCHEMAS ====================

const FillFieldParametersSchema = z.object({
  selector: CssSelectorSchema.describe('CSS selector for the form field'),
  value: z.string().describe('Value to fill in the field'),
  validate: z.boolean().default(true).describe('Validate field value before filling'),
  triggerEvents: z.boolean().default(true).describe('Trigger change/input events after filling'),
});

const SubmitFormParametersSchema = z.object({
  formSelector: CssSelectorSchema.describe('CSS selector for the form element'),
  validate: z.boolean().default(true).describe('Validate form before submission'),
  confirmRequired: z.boolean().default(false).describe('Require user confirmation before submit'),
  idempotencyKey: IdempotencyKeySchema.optional().describe('Idempotency key for safe retries'),
  waitForResponse: z.boolean().default(true).describe('Wait for server response'),
});

const ContactFormParametersSchema = z.object({
  name: z.string().min(1).max(100).describe('Contact name'),
  email: EmailSchema.describe('Contact email address'),
  phone: PhoneSchema.optional().describe('Contact phone number'),
  subject: z.string().min(1).max(200).optional().describe('Message subject'),
  message: z.string().min(10).max(5000).describe('Contact message'),
  formSelector: CssSelectorSchema.optional().describe('Specific form selector (auto-detected if not provided)'),
  subscribe: z.boolean().default(false).describe('Subscribe to newsletter'),
  idempotencyKey: IdempotencyKeySchema.optional(),
});

const NewsletterSignupParametersSchema = z.object({
  email: EmailSchema.describe('Email address for newsletter'),
  name: z.string().min(1).max(100).optional().describe('Name for personalization'),
  preferences: z.array(z.string()).default([]).describe('Email preferences/categories'),
  formSelector: CssSelectorSchema.optional().describe('Newsletter form selector'),
  idempotencyKey: IdempotencyKeySchema.optional(),
});

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * Fill a specific form field
 */
async function executeFillField(
  parameters: z.infer<typeof FillFieldParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Filling form field', {
    selector: parameters.selector,
    valueLength: parameters.value.length,
    siteId: context.siteId,
  });

  try {
    const sideEffects = [{
      type: 'form_field_filled',
      description: `Fill field ${parameters.selector}`,
      data: {
        selector: parameters.selector,
        valueLength: parameters.value.length,
        validate: parameters.validate,
      },
    }];

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result: {
        type: 'form_interaction',
        action: 'fillField',
        selector: parameters.selector,
        value: parameters.value,
        validated: parameters.validate,
      },
      executionTime,
      sideEffects,
      bridgeInstructions: {
        type: 'dom_interaction',
        payload: {
          action: 'fillField',
          selector: parameters.selector,
          value: parameters.value,
          triggerEvents: parameters.triggerEvents,
        },
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Field filling failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Submit a form with validation and confirmation
 */
async function executeSubmitForm(
  parameters: z.infer<typeof SubmitFormParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Submitting form', {
    formSelector: parameters.formSelector,
    validate: parameters.validate,
    confirmRequired: parameters.confirmRequired,
    siteId: context.siteId,
  });

  try {
    // Find corresponding SiteAction for form submission
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const formAction = availableActions.find(action => 
      action.type === 'form' && 
      action.selector === parameters.formSelector
    );

    if (!formAction) {
      throw new Error(`No form action found for selector: ${parameters.formSelector}`);
    }

    // Use existing ActionExecutorService to execute form submission
    const executionResult = await actionExecutorService.execute({
      siteId: context.siteId,
      actionName: formAction.name,
      parameters: {
        idempotencyKey: parameters.idempotencyKey,
        validate: parameters.validate,
        confirmRequired: parameters.confirmRequired,
      },
      sessionId: context.sessionId || 'default',
      userId: context.userId || 'anonymous',
    });

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: executionResult.result,
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Form submission failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Fill and submit a contact form with standard fields
 */
async function executeContactForm(
  parameters: z.infer<typeof ContactFormParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Submitting contact form', {
    name: parameters.name,
    email: parameters.email,
    hasPhone: !!parameters.phone,
    messageLength: parameters.message.length,
    siteId: context.siteId,
  });

  try {
    // Try to find contact form action or use provided selector
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const contactAction = availableActions.find(action => 
      action.type === 'form' && 
      (action.category === 'communication' || action.name.includes('contact'))
    );

    if (!contactAction && !parameters.formSelector) {
      throw new Error('No contact form found on this site');
    }

    const formSelector = parameters.formSelector || contactAction?.selector || 'form[id*="contact"], form[class*="contact"]';

    // Prepare form data
    const formData: Record<string, string> = {
      name: parameters.name,
      email: parameters.email,
      message: parameters.message,
    };

    if (parameters.phone) {
      formData['phone'] = parameters.phone;
    }

    if (parameters.subject) {
      formData['subject'] = parameters.subject;
    }

    if (parameters.subscribe) {
      formData['subscribe'] = 'true';
    }

    // Execute through ActionExecutorService if action exists
    let executionResult;
    if (contactAction) {
      executionResult = await actionExecutorService.execute({
        siteId: context.siteId,
        actionName: contactAction.name,
        parameters: {
          ...formData,
          idempotencyKey: parameters.idempotencyKey,
        },
        sessionId: context.sessionId || 'default',
        userId: context.userId || 'anonymous',
      });
    } else {
      // Direct form submission via bridge
      executionResult = {
        success: true,
        result: {
          type: 'form_submission',
          selector: formSelector,
          formData,
          method: 'POST',
        },
        executionTime: 0,
        sideEffects: [{
          type: 'form_submission',
          description: `Submit contact form`,
          data: { formSelector, fieldCount: Object.keys(formData).length },
        }],
      };
    }

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: {
        type: 'contact_form_submitted',
        formData: {
          name: parameters.name,
          email: parameters.email,
          hasPhone: !!parameters.phone,
          hasSubject: !!parameters.subject,
          messageLength: parameters.message.length,
        },
        formSelector,
        ...executionResult.result,
      },
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Contact form submission failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Sign up for newsletter
 */
async function executeNewsletterSignup(
  parameters: z.infer<typeof NewsletterSignupParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Newsletter signup', {
    email: parameters.email,
    hasName: !!parameters.name,
    preferences: parameters.preferences,
    siteId: context.siteId,
  });

  try {
    // Look for newsletter form action
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const newsletterAction = availableActions.find(action => 
      action.type === 'form' && 
      action.name.includes('newsletter')
    );

    const formSelector = parameters.formSelector || 
                         newsletterAction?.selector || 
                         'form[id*="newsletter"], form[class*="newsletter"], form[class*="subscribe"]';

    const formData: Record<string, string> = {
      email: parameters.email,
    };

    if (parameters.name) {
      formData['name'] = parameters.name;
    }

    if (parameters.preferences.length > 0) {
      formData['preferences'] = parameters.preferences.join(',');
    }

    // Execute through existing service
    let executionResult;
    if (newsletterAction) {
      executionResult = await actionExecutorService.execute({
        siteId: context.siteId,
        actionName: newsletterAction.name,
        parameters: {
          ...formData,
          idempotencyKey: parameters.idempotencyKey,
        },
        sessionId: context.sessionId || 'default',
        userId: context.userId || 'anonymous',
      });
    } else {
      // Direct form submission
      executionResult = {
        success: true,
        result: {
          type: 'form_submission',
          selector: formSelector,
          formData,
          method: 'POST',
        },
        executionTime: 0,
        sideEffects: [{
          type: 'form_submission',
          description: 'Submit newsletter signup',
          data: { formSelector, email: parameters.email },
        }],
      };
    }

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: {
        type: 'newsletter_signup',
        email: parameters.email,
        formSelector,
        ...executionResult.result,
      },
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Newsletter signup failed',
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const formsTools: RegistryToolDefinition[] = [
  {
    name: 'forms.fillField',
    description: 'Fill a specific form field with a value.',
    parameters: [
      {
        name: 'selector',
        description: 'CSS selector for the form field',
        schema: toJsonSchema(CssSelectorSchema),
        required: true,
      },
      {
        name: 'value',
        description: 'Value to enter in the field',
        schema: toJsonSchema(z.string()),
        required: true,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 100,
    idempotent: true,
    category: 'utility',
    execute: executeFillField,
    jsonSchema: toJsonSchema(FillFieldParametersSchema, {
      title: 'Fill Field Parameters',
      description: 'Parameters for filling form fields',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'forms.fillField',
        description: 'Fill a form field with a specific value. Use this to enter data into input fields, textareas, or select elements.',
        parameters: toJsonSchema(FillFieldParametersSchema),
      },
    },
  },

  {
    name: 'forms.submitForm',
    description: 'Submit a form after validation. Respects HTML form semantics.',
    parameters: [
      {
        name: 'formSelector',
        description: 'CSS selector for the form to submit',
        schema: toJsonSchema(CssSelectorSchema),
        required: true,
      },
      {
        name: 'validate',
        description: 'Validate form before submission',
        schema: toJsonSchema(z.boolean()),
        required: false,
        defaultValue: true,
      },
      {
        name: 'idempotencyKey',
        description: 'Unique key to prevent duplicate submissions',
        schema: toJsonSchema(IdempotencyKeySchema.optional()),
        required: false,
      },
    ],
    sideEffects: 'writes.content',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 1000,
    idempotent: true, // With idempotency key
    category: 'communication',
    execute: executeSubmitForm,
    jsonSchema: toJsonSchema(SubmitFormParametersSchema, {
      title: 'Submit Form Parameters',
      description: 'Parameters for form submission',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'forms.submitForm',
        description: 'Submit a form after validation. Use after filling all required fields.',
        parameters: toJsonSchema(SubmitFormParametersSchema),
      },
    },
  },

  {
    name: 'forms.contactForm',
    description: 'Fill and submit a contact form with standard fields.',
    parameters: [
      {
        name: 'name',
        description: 'Contact person\'s name',
        schema: toJsonSchema(z.string().min(1).max(100)),
        required: true,
      },
      {
        name: 'email',
        description: 'Contact email address',
        schema: toJsonSchema(EmailSchema),
        required: true,
      },
      {
        name: 'message',
        description: 'Contact message content',
        schema: toJsonSchema(z.string().min(10).max(5000)),
        required: true,
      },
      {
        name: 'phone',
        description: 'Optional phone number',
        schema: toJsonSchema(PhoneSchema.optional()),
        required: false,
      },
      {
        name: 'subject',
        description: 'Optional message subject',
        schema: toJsonSchema(z.string().max(200).optional()),
        required: false,
      },
    ],
    sideEffects: 'writes.content',
    confirmRequired: true, // Contact forms should be confirmed
    auth: 'session',
    latencyBudgetMs: 1500,
    idempotent: true,
    category: 'communication',
    execute: executeContactForm,
    jsonSchema: toJsonSchema(ContactFormParametersSchema, {
      title: 'Contact Form Parameters',
      description: 'Parameters for contact form submission',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'forms.contactForm',
        description: 'Fill and submit a contact form. Use when user wants to send a message or inquiry.',
        parameters: toJsonSchema(ContactFormParametersSchema),
      },
    },
  },

  {
    name: 'forms.newsletterSignup',
    description: 'Sign up for newsletter or email updates.',
    parameters: [
      {
        name: 'email',
        description: 'Email address for newsletter',
        schema: toJsonSchema(EmailSchema),
        required: true,
      },
      {
        name: 'name',
        description: 'Name for personalization',
        schema: toJsonSchema(z.string().min(1).max(100).optional()),
        required: false,
      },
    ],
    sideEffects: 'writes.content',
    confirmRequired: false, // Newsletter signup usually doesn't need confirmation
    auth: 'session',
    latencyBudgetMs: 800,
    idempotent: true,
    category: 'communication',
    execute: executeNewsletterSignup,
    jsonSchema: toJsonSchema(NewsletterSignupParametersSchema, {
      title: 'Newsletter Signup Parameters',
      description: 'Parameters for newsletter subscription',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'forms.newsletterSignup',
        description: 'Sign up for newsletter or email updates. Use when user wants to subscribe to updates.',
        parameters: toJsonSchema(NewsletterSignupParametersSchema),
      },
    },
  },
];
