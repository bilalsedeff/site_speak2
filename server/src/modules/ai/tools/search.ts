/**
 * Search Tools
 * 
 * Semantic and structured search across knowledge base and site APIs.
 * Integrates with existing KnowledgeBaseService and maintains response speed targets.
 */

import { z } from 'zod';
import { createLogger } from '../../../../../shared/utils/index.js';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  QuerySchema,
  FilterSchema,
  LocaleSchema,
  toJsonSchema
} from './validators';
import { KnowledgeBaseService } from '../infrastructure/KnowledgeBaseService';

// Create service instance
const knowledgeBaseService = new KnowledgeBaseService();

const logger = createLogger({ service: 'search-tools' });

// ==================== PARAMETER SCHEMAS ====================

const SiteSearchParametersSchema = z.object({
  query: QuerySchema.describe('Search query text'),
  filters: FilterSchema.optional().describe('Optional search filters (category, type, etc.)'),
  topK: z.number().int().min(1).max(50).default(10).describe('Maximum number of results to return'),
  minSimilarity: z.number().min(0).max(1).default(0.7).describe('Minimum similarity score threshold'),
  includeMetadata: z.boolean().default(true).describe('Include metadata in results'),
  locale: LocaleSchema.optional().describe('Search locale preference'),
});

const SuggestNextParametersSchema = z.object({
  context: z.enum(['catalog', 'blog', 'docs', 'products', 'services']).describe('Content context for suggestions'),
  currentPage: z.string().optional().describe('Current page URL for context'),
  userQuery: z.string().optional().describe('Previous user query for context'),
  maxSuggestions: z.number().int().min(1).max(20).default(5).describe('Maximum suggestions to return'),
  category: z.string().optional().describe('Content category to focus suggestions'),
});

const QuickAnswerParametersSchema = z.object({
  question: QuerySchema.describe('Question to answer from knowledge base'),
  context: z.string().optional().describe('Additional context for the question'),
  includeSource: z.boolean().default(true).describe('Include source information in response'),
  maxSources: z.number().int().min(1).max(10).default(3).describe('Maximum source documents to use'),
});

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * Search the site's knowledge base and return relevant results
 */
async function executeSiteSearch(
  parameters: z.infer<typeof SiteSearchParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Executing site search', {
    query: parameters.query,
    siteId: context.siteId,
    topK: parameters.topK,
    filters: parameters.filters,
  });

  try {
    // Use existing KnowledgeBaseService for search
    const searchResults = await knowledgeBaseService.semanticSearch({
      query: parameters.query,
      siteId: context.siteId,
      tenantId: context.tenantId,
      limit: parameters.topK,
      threshold: parameters.minSimilarity,
      filters: {
        ...(parameters.filters?.['contentType'] && { contentType: parameters.filters['contentType'] as string[] }),
        ...(parameters.locale && { locale: parameters.locale }),
      },
    });

    const results = searchResults.map((result: { id: string; title?: string; content: string; url: string; score: number; metadata?: Record<string, unknown> }) => ({
      id: result.id,
      title: result.title || 'Untitled',
      content: result.content,
      url: result.url,
      score: result.score,
      snippet: result.content.substring(0, 200) + '...',
      metadata: parameters.includeMetadata ? result.metadata : undefined,
    }));

    const executionTime = Date.now() - startTime;

    const sideEffects = [{
      type: 'search_performed',
      description: `Searched knowledge base for "${parameters.query}"`,
      data: {
        query: parameters.query,
        resultCount: results.length,
        executionTime,
      },
    }];

    logger.info('Site search completed', {
      query: parameters.query,
      resultCount: results.length,
      executionTime,
    });

    return {
      success: true,
      result: {
        type: 'search_results',
        query: parameters.query,
        results,
        metadata: {
          totalResults: results.length,
          executionTime,
          usedFilters: parameters.filters,
          usedLocale: parameters.locale || context.locale,
        },
      },
      executionTime,
      sideEffects,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error('Site search failed', {
      query: parameters.query,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Generate contextual suggestions for next actions
 */
async function executeSuggestNext(
  parameters: z.infer<typeof SuggestNextParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Generating suggestions', {
    context: parameters.context,
    currentPage: parameters.currentPage,
    maxSuggestions: parameters.maxSuggestions,
  });

  try {
    // Build contextual query based on context type
    let contextualQuery = '';
    switch (parameters.context) {
      case 'catalog':
        contextualQuery = 'products categories popular items featured';
        break;
      case 'blog':
        contextualQuery = 'articles recent posts popular topics';
        break;
      case 'docs':
        contextualQuery = 'documentation guides tutorials help';
        break;
      case 'products':
        contextualQuery = 'product details specifications reviews similar';
        break;
      case 'services':
        contextualQuery = 'services offerings packages pricing';
        break;
    }

    // Add user query context if available
    if (parameters.userQuery) {
      contextualQuery += ` ${parameters.userQuery}`;
    }

    // Search for relevant suggestions
    const searchResults = await knowledgeBaseService.semanticSearch({
      query: contextualQuery,
      siteId: context.siteId,
      tenantId: context.tenantId,
      limit: parameters.maxSuggestions * 2, // Get more results to filter
      threshold: 0.6, // Lower threshold for suggestions
    });

    // Generate suggestions from search results
    const suggestions = searchResults
      .slice(0, parameters.maxSuggestions)
      .map((result: { title?: string; content: string; url: string; score: number; metadata?: Record<string, unknown> }) => ({
        title: result.title || 'Suggested Content',
        description: result.content.substring(0, 100) + '...',
        url: result.url,
        score: result.score,
        category: parameters.context,
        actionHint: generateActionHint(result.metadata),
      }));

    const executionTime = Date.now() - startTime;

    const sideEffects = [{
      type: 'suggestions_generated',
      description: `Generated ${suggestions.length} suggestions for ${parameters.context}`,
      data: {
        context: parameters.context,
        suggestionCount: suggestions.length,
        executionTime,
      },
    }];

    return {
      success: true,
      result: {
        type: 'suggestions',
        context: parameters.context,
        suggestions,
        metadata: {
          currentPage: parameters.currentPage,
          userQuery: parameters.userQuery,
          generatedAt: new Date(),
        },
      },
      executionTime,
      sideEffects,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Suggestion generation failed',
      executionTime,
      sideEffects: [],
    };
  }

// Helper function to generate action hints
function generateActionHint(metadata?: Record<string, unknown>): string {
  if (metadata?.['contentType'] === 'product') {
    return 'View details or add to cart';
  } else if (metadata?.['contentType'] === 'service') {
    return 'Learn more or book consultation';
  } else if (metadata?.['contentType'] === 'article') {
    return 'Read full article';
  }
  return 'View page';
}
}

/**
 * Get a quick answer from knowledge base for specific questions
 */
async function executeQuickAnswer(
  parameters: z.infer<typeof QuickAnswerParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Generating quick answer', {
    question: parameters.question,
    siteId: context.siteId,
    includeSource: parameters.includeSource,
  });

  try {
    // Search knowledge base for relevant information
    const searchResults = await knowledgeBaseService.semanticSearch({
      query: parameters.question,
      siteId: context.siteId,
      tenantId: context.tenantId,
      limit: parameters.maxSources,
      threshold: 0.8, // Higher threshold for accurate answers
    });

    if (searchResults.length === 0) {
      return {
        success: true,
        result: {
          type: 'quick_answer',
          answer: 'I could not find relevant information to answer that question.',
          confidence: 0,
          sources: [],
        },
        executionTime: Date.now() - startTime,
        sideEffects: [],
      };
    }

    // Build answer from search results
    const relevantContent = searchResults
      .slice(0, parameters.maxSources)
      .map((result: { content: string }) => result.content)
      .join('\n\n');

    const sources = parameters.includeSource ? searchResults.map((result: { title?: string; content: string; url: string; score: number }) => ({
      title: result.title || 'Source',
      url: result.url,
      snippet: result.content.substring(0, 150) + '...',
      score: result.score,
    })) : [];

    const executionTime = Date.now() - startTime;

    const sideEffects = [{
      type: 'answer_generated',
      description: `Generated answer for "${parameters.question}"`,
      data: {
        question: parameters.question,
        sourceCount: sources.length,
        executionTime,
      },
    }];

    return {
      success: true,
      result: {
        type: 'quick_answer',
        question: parameters.question,
        answer: relevantContent,
        confidence: searchResults[0]?.score || 0,
        sources,
        context: parameters.context,
      },
      executionTime,
      sideEffects,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Answer generation failed',
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const searchTools: RegistryToolDefinition[] = [
  {
    name: 'search.siteSearch',
    description: 'Search the site\'s knowledge base for relevant content and information.',
    parameters: [
      {
        name: 'query',
        description: 'What to search for',
        schema: toJsonSchema(QuerySchema),
        required: true,
      },
      {
        name: 'topK',
        description: 'Maximum number of results',
        schema: toJsonSchema(z.number().int().min(1).max(50)),
        required: false,
        defaultValue: 10,
      },
      {
        name: 'filters',
        description: 'Optional filters to narrow search',
        schema: toJsonSchema(FilterSchema.optional()),
        required: false,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 350, // P95 target from source-of-truth
    idempotent: true,
    category: 'search',
    execute: executeSiteSearch,
    jsonSchema: toJsonSchema(SiteSearchParametersSchema, {
      title: 'Site Search Parameters',
      description: 'Parameters for searching site content',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'search.siteSearch',
        description: 'Search the website\'s content and knowledge base. Use this to find information about products, services, or any site content.',
        parameters: toJsonSchema(SiteSearchParametersSchema),
      },
    },
  },

  {
    name: 'search.suggestNext',
    description: 'Generate contextual suggestions for what the user might want to do next.',
    parameters: [
      {
        name: 'context',
        description: 'Current content context',
        schema: toJsonSchema(z.enum(['catalog', 'blog', 'docs', 'products', 'services'])),
        required: true,
      },
      {
        name: 'maxSuggestions',
        description: 'Maximum suggestions to return',
        schema: toJsonSchema(z.number().int().min(1).max(20)),
        required: false,
        defaultValue: 5,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 300,
    idempotent: true,
    category: 'search',
    execute: executeSuggestNext,
    jsonSchema: toJsonSchema(SuggestNextParametersSchema, {
      title: 'Suggestion Parameters',
      description: 'Parameters for generating contextual suggestions',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'search.suggestNext',
        description: 'Generate helpful suggestions for what the user might want to do next based on current context.',
        parameters: toJsonSchema(SuggestNextParametersSchema),
      },
    },
  },

  {
    name: 'search.quickAnswer',
    description: 'Get a direct answer to a specific question from the knowledge base.',
    parameters: [
      {
        name: 'question',
        description: 'Specific question to answer',
        schema: toJsonSchema(QuerySchema),
        required: true,
      },
      {
        name: 'includeSource',
        description: 'Include source information in response',
        schema: toJsonSchema(z.boolean()),
        required: false,
        defaultValue: true,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 400,
    idempotent: true,
    category: 'search',
    execute: executeQuickAnswer,
    jsonSchema: toJsonSchema(QuickAnswerParametersSchema, {
      title: 'Quick Answer Parameters',
      description: 'Parameters for getting direct answers',
    }),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'search.quickAnswer',
        description: 'Get a direct answer to a specific question from the website\'s knowledge base. Use for factual questions.',
        parameters: toJsonSchema(QuickAnswerParametersSchema),
      },
    },
  },
];
