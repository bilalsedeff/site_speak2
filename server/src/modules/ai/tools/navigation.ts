/**
 * Navigation Tools
 * 
 * Safe, instant navigation actions with speculative execution support.
 * Integrates with existing ActionExecutorService for actual navigation.
 */

import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  PathSchema,
  UrlSchema,
  CssSelectorSchema,
  toJsonSchema
} from './validators';

const logger = createLogger({ service: 'navigation-tools' });

// ==================== PARAMETER SCHEMAS ====================

const GotoParametersSchema = z.object({
  path: PathSchema.describe('URL path to navigate to'),
  replace: z.boolean().default(false).describe('Replace current history entry instead of pushing'),
  scrollToTop: z.boolean().default(true).describe('Scroll to top after navigation'),
  prefetch: z.boolean().default(true).describe('Enable prefetching for performance'),
});

const HighlightParametersSchema = z.object({
  selector: CssSelectorSchema.describe('CSS selector for element to highlight'),
  duration: z.number().int().min(100).max(5000).default(2000).describe('Highlight duration in milliseconds'),
  style: z.enum(['outline', 'glow', 'pulse']).default('outline').describe('Highlight visual style'),
});

const ScrollToParametersSchema = z.object({
  selector: CssSelectorSchema.optional().describe('CSS selector for target element'),
  position: z.enum(['top', 'center', 'bottom']).default('top').describe('Scroll position relative to viewport'),
  behavior: z.enum(['auto', 'smooth']).default('smooth').describe('Scroll behavior'),
  to: z.enum(['top', 'bottom', 'element']).optional().describe('Predefined scroll targets'),
});

const OpenExternalParametersSchema = z.object({
  url: UrlSchema.describe('External URL to open'),
  target: z.enum(['_blank', '_self']).default('_blank').describe('Target window'),
  validate: z.boolean().default(true).describe('Validate URL against allowlist'),
});

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * Navigate to a path within the site
 */
async function executeGoto(
  parameters: z.infer<typeof GotoParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Executing navigation', {
    path: parameters.path,
    siteId: _context.siteId,
    replace: parameters.replace,
  });

  try {
    // Validate path format
    if (!parameters.path.startsWith('/')) {
      throw new Error('Path must start with /');
    }

    const sideEffects = [{
      type: 'navigation',
      description: `Navigate to ${parameters.path}`,
      data: {
        path: parameters.path,
        method: parameters.replace ? 'replace' : 'push',
        scrollToTop: parameters.scrollToTop,
      },
    }];

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result: {
        type: 'navigation',
        target: parameters.path,
        method: parameters.replace ? 'replaceState' : 'pushState',
        scrollToTop: parameters.scrollToTop,
      },
      executionTime,
      sideEffects,
      bridgeInstructions: {
        type: 'navigation',
        payload: {
          target: parameters.path,
          method: parameters.replace ? 'replaceState' : 'pushState',
          scrollToTop: parameters.scrollToTop,
        },
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Navigation failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Highlight an element to show where the agent will interact
 */
async function executeHighlight(
  parameters: z.infer<typeof HighlightParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const { selector, duration, style } = parameters;
  const startTime = Date.now();
  
  logger.info('Executing highlight', {
    selector: parameters.selector,
    duration: parameters.duration,
    style: parameters.style,
  });

  const sideEffects = [{
    type: 'dom_interaction',
    description: `Highlight element ${parameters.selector}`,
    data: {
      selector: parameters.selector,
      duration: parameters.duration,
      style: parameters.style,
    },
  }];

  const executionTime = Date.now() - startTime;

  return {
    success: true,
    result: {
      type: 'dom_interaction',
      action: 'highlight',
      selector: parameters.selector,
      duration: parameters.duration,
      style: parameters.style,
    },
    executionTime,
    sideEffects,
    bridgeInstructions: {
      type: 'dom_interaction',
      payload: {
        action: 'highlight',
        selector: parameters.selector,
        duration: parameters.duration,
        style: parameters.style,
      },
    },
  };
}

/**
 * Scroll to a specific element or position
 */
async function executeScrollTo(
  parameters: z.infer<typeof ScrollToParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const { selector, position, behavior, to } = parameters;
  const startTime = Date.now();
  
  logger.info('Executing scroll', {
    selector: parameters.selector,
    position: parameters.position,
    to: parameters.to,
  });

  const sideEffects = [{
    type: 'dom_interaction',
    description: `Scroll to ${parameters.selector || parameters.to}`,
    data: {
      selector: parameters.selector,
      position: parameters.position,
      behavior: parameters.behavior,
      to: parameters.to,
    },
  }];

  const executionTime = Date.now() - startTime;

  return {
    success: true,
    result: {
      type: 'dom_interaction',
      action: 'scroll',
      selector: parameters.selector,
      position: parameters.position,
      behavior: parameters.behavior,
      to: parameters.to,
    },
    executionTime,
    sideEffects,
    bridgeInstructions: {
      type: 'dom_interaction',
      payload: {
        action: 'scroll',
        selector: parameters.selector,
        position: parameters.position,
        behavior: parameters.behavior,
        to: parameters.to,
      },
    },
  };
}

/**
 * Open external URL with security validation
 */
async function executeOpenExternal(
  parameters: z.infer<typeof OpenExternalParametersSchema>,
  _context: ToolContext
): Promise<ToolExecutionResult> {
  const { url, target, validate } = parameters;
  const startTime = Date.now();
  
  logger.info('Executing external navigation', {
    url: parameters.url,
    target: parameters.target,
    validate: parameters.validate,
  });

  try {
    // Basic URL validation
    if (parameters.validate) {
      const url = new URL(parameters.url);
      
      // Basic security checks - no javascript: or data: URLs
      if (['javascript:', 'data:', 'vbscript:'].some(scheme => url.protocol.startsWith(scheme))) {
        throw new Error('Unsafe URL protocol detected');
      }
    }

    const sideEffects = [{
      type: 'navigation',
      description: `Open external URL ${parameters.url}`,
      data: {
        url: parameters.url,
        target: parameters.target,
        external: true,
      },
    }];

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result: {
        type: 'navigation',
        target: parameters.url,
        external: true,
        windowTarget: parameters.target,
      },
      executionTime,
      sideEffects,
      bridgeInstructions: {
        type: 'navigation',
        payload: {
          target: parameters.url,
          external: true,
          windowTarget: parameters.target,
        },
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'External navigation failed',
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const navigationTools: RegistryToolDefinition[] = [
  {
    name: 'navigation.goto',
    description: 'Navigate to a page within the site. Supports optimistic execution.',
    parameters: [
      {
        name: 'path',
        description: 'URL path to navigate to (must start with /)',
        schema: toJsonSchema(PathSchema),
        required: true,
      },
      {
        name: 'replace',
        description: 'Replace current history entry instead of pushing new one',
        schema: toJsonSchema(z.boolean()),
        required: false,
        defaultValue: false,
      },
      {
        name: 'scrollToTop',
        description: 'Scroll to top after navigation',
        schema: toJsonSchema(z.boolean()),
        required: false,
        defaultValue: true,
      },
    ],
    sideEffects: 'read-only-nav',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 150, // Optimistic navigation target
    idempotent: true,
    category: 'navigation',
    execute: executeGoto,
    jsonSchema: toJsonSchema(GotoParametersSchema, {
      title: 'Navigation Parameters',
      description: 'Parameters for site navigation',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'navigation.goto',
        description: 'Navigate to a page within the site. Use this for any page navigation requests.',
        parameters: toJsonSchema(GotoParametersSchema),
      },
    },
  },

  {
    name: 'navigation.highlight',
    description: 'Highlight an element to show where the agent will interact next.',
    parameters: [
      {
        name: 'selector',
        description: 'CSS selector for the element to highlight',
        schema: toJsonSchema(CssSelectorSchema),
        required: true,
      },
      {
        name: 'duration',
        description: 'How long to show the highlight in milliseconds',
        schema: toJsonSchema(z.number().int().min(100).max(5000)),
        required: false,
        defaultValue: 2000,
      },
      {
        name: 'style',
        description: 'Visual style of the highlight',
        schema: toJsonSchema(z.enum(['outline', 'glow', 'pulse'])),
        required: false,
        defaultValue: 'outline',
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 100,
    idempotent: true,
    category: 'utility',
    execute: executeHighlight,
    jsonSchema: toJsonSchema(HighlightParametersSchema, {
      title: 'Highlight Parameters',
      description: 'Parameters for element highlighting',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'navigation.highlight',
        description: 'Highlight an element to show user where agent will interact. Use before clicking buttons or filling forms.',
        parameters: toJsonSchema(HighlightParametersSchema),
      },
    },
  },

  {
    name: 'navigation.scrollTo',
    description: 'Scroll to a specific element or position on the page.',
    parameters: [
      {
        name: 'selector',
        description: 'CSS selector for target element (optional if using predefined position)',
        schema: toJsonSchema(CssSelectorSchema.optional()),
        required: false,
      },
      {
        name: 'position',
        description: 'Position relative to viewport',
        schema: toJsonSchema(z.enum(['top', 'center', 'bottom'])),
        required: false,
        defaultValue: 'top',
      },
      {
        name: 'to',
        description: 'Predefined scroll target',
        schema: toJsonSchema(z.enum(['top', 'bottom', 'element'])),
        required: false,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 100,
    idempotent: true,
    category: 'utility',
    execute: executeScrollTo,
    jsonSchema: toJsonSchema(ScrollToParametersSchema, {
      title: 'Scroll Parameters',
      description: 'Parameters for page scrolling',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'navigation.scrollTo',
        description: 'Scroll to a specific element or position. Use to bring content into view.',
        parameters: toJsonSchema(ScrollToParametersSchema),
      },
    },
  },

  {
    name: 'navigation.openExternal',
    description: 'Open an external URL with security validation.',
    parameters: [
      {
        name: 'url',
        description: 'External URL to open',
        schema: toJsonSchema(UrlSchema),
        required: true,
      },
      {
        name: 'target',
        description: 'Where to open the URL',
        schema: toJsonSchema(z.enum(['_blank', '_self'])),
        required: false,
        defaultValue: '_blank',
      },
    ],
    sideEffects: 'read-only-nav',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 200,
    idempotent: true,
    category: 'navigation',
    execute: executeOpenExternal,
    jsonSchema: toJsonSchema(OpenExternalParametersSchema, {
      title: 'External Navigation Parameters',
      description: 'Parameters for opening external URLs',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'navigation.openExternal',
        description: 'Open an external website or resource. Use for links that go outside the current site.',
        parameters: toJsonSchema(OpenExternalParametersSchema),
      },
    },
  },
];
