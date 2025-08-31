import OpenAI from 'openai';
import { z } from 'zod';
import { createLogger } from '@shared/utils';
import { config } from '../../../../infrastructure/config';
import type { 
  Conversation, 
  ConversationMessage, 
  ToolCall,
  CreateConversationInput,
  AddMessageInput,
} from '../../domain/entities/Conversation';

const logger = createLogger({ service: 'conversation' });

export interface ChatCompletionRequest {
  conversationId: string;
  message: string;
  context?: {
    knowledgeBase?: string[];
    currentPage?: string;
    userPreferences?: Record<string, unknown>;
  };
  tools?: ToolDefinition[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionResponse {
  message: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

/**
 * Service for managing AI conversations
 */
export class ConversationService {
  private openai: OpenAI;
  private defaultModel: string;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    this.defaultModel = config.AI_MODEL;
  }

  /**
   * Generate chat completion with optional tool calling
   */
  async generateChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      logger.debug('Generating chat completion', {
        conversationId: request.conversationId,
        messageLength: request.message.length,
        hasContext: !!request.context,
        toolsCount: request.tools?.length || 0,
      });

      // Build system message
      const systemMessage = this.buildSystemMessage(request.context);
      
      // Build messages array
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: request.message },
      ];

      // Add knowledge base context if available
      if (request.context?.knowledgeBase && request.context.knowledgeBase.length > 0) {
        const contextMessage = `Here's relevant information from the knowledge base:\n\n${request.context.knowledgeBase.join('\n\n')}`;
        messages.splice(-1, 0, { role: 'system', content: contextMessage });
      }

      // Prepare OpenAI request
      const openaiRequest: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.defaultModel,
        messages,
        max_tokens: config.MAX_TOKENS,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
      };

      // Add tools if provided
      if (request.tools && request.tools.length > 0) {
        openaiRequest.tools = request.tools;
        openaiRequest.tool_choice = 'auto';
      }

      const completion = await this.openai.chat.completions.create(openaiRequest);
      
      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No completion choice received');
      }

      // Extract tool calls if present
      let toolCalls: ToolCall[] | undefined;
      if (choice.message.tool_calls) {
        toolCalls = choice.message.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }

      const responseMessage = choice.message.content || '';
      
      logger.info('Chat completion generated successfully', {
        conversationId: request.conversationId,
        responseLength: responseMessage.length,
        toolCallsCount: toolCalls?.length || 0,
        usage: completion.usage,
        finishReason: choice.finish_reason,
      });

      return {
        message: responseMessage,
        toolCalls,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        finishReason: choice.finish_reason as ChatCompletionResponse['finishReason'],
      };
    } catch (error) {
      logger.error('Chat completion failed', {
        error,
        conversationId: request.conversationId,
      });
      throw error;
    }
  }

  /**
   * Generate streaming chat completion
   */
  async *generateStreamingChatCompletion(
    request: ChatCompletionRequest
  ): AsyncGenerator<{ content?: string; toolCalls?: ToolCall[]; done: boolean }> {
    try {
      logger.debug('Starting streaming chat completion', {
        conversationId: request.conversationId,
      });

      const systemMessage = this.buildSystemMessage(request.context);
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: request.message },
      ];

      if (request.context?.knowledgeBase && request.context.knowledgeBase.length > 0) {
        const contextMessage = `Here's relevant information from the knowledge base:\n\n${request.context.knowledgeBase.join('\n\n')}`;
        messages.splice(-1, 0, { role: 'system', content: contextMessage });
      }

      const openaiRequest: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.defaultModel,
        messages,
        max_tokens: config.MAX_TOKENS,
        temperature: 0.7,
        stream: true,
      };

      if (request.tools && request.tools.length > 0) {
        openaiRequest.tools = request.tools;
        openaiRequest.tool_choice = 'auto';
      }

      const stream = await this.openai.chat.completions.create(openaiRequest);

      let accumulatedContent = '';
      let accumulatedToolCalls: ToolCall[] = [];

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle content
        if (delta.content) {
          accumulatedContent += delta.content;
          yield { content: delta.content, done: false };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index !== undefined) {
              if (!accumulatedToolCalls[toolCall.index]) {
                accumulatedToolCalls[toolCall.index] = {
                  id: toolCall.id || '',
                  type: 'function',
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: toolCall.function?.arguments || '',
                  },
                };
              } else {
                if (toolCall.function?.name) {
                  accumulatedToolCalls[toolCall.index].function.name += toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  accumulatedToolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                }
              }
            }
          }
        }

        // Check if stream is done
        if (choice.finish_reason) {
          logger.info('Streaming chat completion finished', {
            conversationId: request.conversationId,
            finishReason: choice.finish_reason,
            contentLength: accumulatedContent.length,
            toolCallsCount: accumulatedToolCalls.length,
          });

          yield {
            content: undefined,
            toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
            done: true,
          };
          break;
        }
      }
    } catch (error) {
      logger.error('Streaming chat completion failed', {
        error,
        conversationId: request.conversationId,
      });
      throw error;
    }
  }

  /**
   * Summarize conversation
   */
  async summarizeConversation(messages: ConversationMessage[]): Promise<string> {
    try {
      logger.debug('Summarizing conversation', {
        messageCount: messages.length,
      });

      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes conversations. Provide a concise summary of the key points and outcomes from this conversation.',
          },
          {
            role: 'user',
            content: `Please summarize this conversation:\n\n${conversationText}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      });

      const summary = completion.choices[0]?.message?.content || 'Could not generate summary';

      logger.info('Conversation summarized successfully', {
        messageCount: messages.length,
        summaryLength: summary.length,
      });

      return summary;
    } catch (error) {
      logger.error('Conversation summarization failed', { error });
      throw error;
    }
  }

  /**
   * Generate conversation title
   */
  async generateConversationTitle(firstMessage: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that creates short, descriptive titles for conversations. Generate a title that captures the main topic or question in 5-8 words.',
          },
          {
            role: 'user',
            content: `Create a title for a conversation that starts with: "${firstMessage}"`,
          },
        ],
        max_tokens: 50,
        temperature: 0.3,
      });

      const title = completion.choices[0]?.message?.content || 'Untitled Conversation';
      return title.replace(/^["']|["']$/g, ''); // Remove quotes
    } catch (error) {
      logger.error('Title generation failed', { error });
      return 'Untitled Conversation';
    }
  }

  /**
   * Build system message based on context
   */
  private buildSystemMessage(context?: ChatCompletionRequest['context']): string {
    let systemMessage = `You are a helpful AI assistant integrated into a website. Your role is to help users with their questions and guide them through the site.

Key guidelines:
- Be helpful, friendly, and professional
- If you don't know something, admit it honestly
- Use the knowledge base information when available to provide accurate answers
- Focus on helping users achieve their goals on the website
- Keep responses concise but comprehensive
- If appropriate, suggest relevant pages or actions the user can take`;

    if (context?.currentPage) {
      systemMessage += `\n\nCurrent page: ${context.currentPage}`;
    }

    if (context?.userPreferences) {
      systemMessage += `\n\nUser preferences: ${JSON.stringify(context.userPreferences)}`;
    }

    return systemMessage;
  }

  /**
   * Validate tool call arguments
   */
  validateToolCall(toolCall: ToolCall, toolDefinition: ToolDefinition): { valid: boolean; error?: string } {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      
      // TODO: Implement proper JSON schema validation based on toolDefinition.function.parameters
      // For now, just check if arguments can be parsed
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid JSON in tool call arguments',
      };
    }
  }
}

// Export singleton instance
export const conversationService = new ConversationService();