import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '@shared/utils';
import { 
  embeddingService, 
  conversationService, 
  knowledgeBaseService,
} from '../application/services';

const logger = createLogger({ service: 'ai-controller' });

// Request schemas
const SearchKnowledgeBaseSchema = z.object({
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(50).default(5),
  threshold: z.number().min(0).max(1).optional(),
  filters: z.object({
    contentType: z.array(z.string()).optional(),
    url: z.string().optional(),
    section: z.string().optional(),
  }).optional(),
});

const ChatCompletionSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  context: z.object({
    currentPage: z.string().url().optional(),
    userPreferences: z.record(z.unknown()).optional(),
  }).optional(),
});

const GenerateEmbeddingSchema = z.object({
  texts: z.array(z.string()).min(1).max(100),
  model: z.string().optional(),
});

export class AIController {
  /**
   * Search knowledge base
   */
  async searchKnowledgeBase(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      const data = SearchKnowledgeBaseSchema.parse(req.body);

      logger.info('Knowledge base search request', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        query: data.query.substring(0, 100),
        correlationId: req.correlationId,
      });

      // TODO: Verify user has access to this site
      // TODO: Get knowledge base ID from site

      const results = await knowledgeBaseService.search({
        query: data.query,
        knowledgeBaseId: `kb-${siteId}`, // Mock knowledge base ID
        topK: data.topK,
        threshold: data.threshold,
        filters: data.filters,
      });

      res.json({
        success: true,
        data: {
          results: results.map(result => ({
            content: result.relevantContent,
            score: result.score,
            source: {
              url: result.chunk.metadata.url,
              title: result.chunk.metadata.title,
              section: result.chunk.metadata.section,
            },
          })),
          query: data.query,
          resultsCount: results.length,
        },
      });
    } catch (error) {
      logger.error('Knowledge base search failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Generate chat completion
   */
  async generateChatCompletion(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;
      const data = ChatCompletionSchema.parse(req.body);

      logger.info('Chat completion request', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        messageLength: data.message.length,
        correlationId: req.correlationId,
      });

      // TODO: Check if user has AI usage remaining
      // TODO: Get relevant knowledge base context

      const conversationId = data.conversationId || `conv-${Date.now()}-${user.id}`;

      // Search knowledge base for relevant context
      const knowledgeResults = await knowledgeBaseService.search({
        query: data.message,
        knowledgeBaseId: `kb-${siteId}`,
        topK: 3,
        threshold: 0.7,
      });

      const knowledgeContext = knowledgeResults.map(result => result.relevantContent);

      // Generate chat completion
      const completion = await conversationService.generateChatCompletion({
        conversationId,
        message: data.message,
        context: {
          knowledgeBase: knowledgeContext,
          currentPage: data.context?.currentPage,
          userPreferences: data.context?.userPreferences,
        },
      });

      // TODO: Save conversation message to database
      // TODO: Update tenant AI token usage

      res.json({
        success: true,
        data: {
          message: completion.message,
          conversationId,
          sources: knowledgeResults.map(result => ({
            title: result.chunk.metadata.title,
            url: result.chunk.metadata.url,
            score: result.score,
          })),
          usage: completion.usage,
        },
      });
    } catch (error) {
      logger.error('Chat completion failed', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Start knowledge base indexing
   */
  async startIndexing(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;

      logger.info('Starting knowledge base indexing', {
        userId: user.id,
        tenantId: user.tenantId,
        siteId,
        correlationId: req.correlationId,
      });

      // TODO: Verify user has access to this site
      // TODO: Check if indexing is already in progress

      await knowledgeBaseService.startIndexing(`kb-${siteId}`);

      res.json({
        success: true,
        message: 'Knowledge base indexing started',
        data: {
          siteId,
          status: 'started',
        },
      });
    } catch (error) {
      logger.error('Failed to start indexing', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get indexing status
   */
  async getIndexingStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const { siteId } = req.params;

      const progress = await knowledgeBaseService.getIndexingProgress(`kb-${siteId}`);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      logger.error('Failed to get indexing status', {
        error,
        userId: req.user?.id,
        siteId: req.params['siteId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Generate embeddings (admin/debug endpoint)
   */
  async generateEmbeddings(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const data = GenerateEmbeddingSchema.parse(req.body);

      logger.info('Generate embeddings request', {
        userId: user.id,
        textsCount: data.texts.length,
        correlationId: req.correlationId,
      });

      const result = await embeddingService.generateEmbeddings({
        texts: data.texts,
        model: data.model,
      });

      res.json({
        success: true,
        data: {
          embeddings: result.embeddings,
          usage: result.usage,
          model: result.model,
          dimensions: result.embeddings[0]?.length || 0,
        },
      });
    } catch (error) {
      logger.error('Generate embeddings failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get AI service health
   */
  async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      // TODO: Check OpenAI API connectivity
      // TODO: Check database connectivity
      // TODO: Check embeddings service

      res.json({
        success: true,
        data: {
          service: 'ai',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            openai: 'healthy',
            embeddings: 'healthy',
            knowledgeBase: 'healthy',
          },
        },
      });
    } catch (error) {
      logger.error('AI health check failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get AI usage statistics
   */
  async getUsageStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;

      // TODO: Get actual usage statistics from database
      const mockStats = {
        currentMonth: {
          aiTokensUsed: 15000,
          conversationsStarted: 45,
          knowledgeBasesIndexed: 3,
          averageResponseTime: 850,
        },
        limits: {
          aiTokensPerMonth: 100000,
          conversationsPerMonth: 1000,
          knowledgeBasesPerSite: 1,
        },
        usage: {
          aiTokensPercentage: 15,
          conversationsPercentage: 4.5,
        },
      };

      res.json({
        success: true,
        data: mockStats,
      });
    } catch (error) {
      logger.error('Failed to get AI usage statistics', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }
}

// Export controller instance
export const aiController = new AIController();