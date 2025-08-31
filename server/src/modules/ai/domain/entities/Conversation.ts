import { z } from 'zod';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    toolCalls?: ToolCall[];
    sources?: string[];
    timestamp: Date;
    tokens?: {
      input: number;
      output: number;
    };
  };
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  result?: string;
  error?: string;
}

export interface ConversationAnalytics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalTokens: number;
  averageResponseTime: number;
  toolCallsUsed: string[];
  satisfaction?: number; // 1-5 rating
  resolved?: boolean;
}

/**
 * Conversation domain entity
 */
export class Conversation {
  constructor(
    public readonly id: string,
    public readonly siteId: string,
    public readonly tenantId: string,
    public sessionId: string,
    public messages: ConversationMessage[],
    public context: {
      userAgent?: string;
      ipAddress?: string;
      referrer?: string;
      currentPage?: string;
      userPreferences?: Record<string, unknown>;
    },
    public analytics: ConversationAnalytics,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public endedAt?: Date,
    public readonly isActive: boolean = true,
  ) {}

  /**
   * Add message to conversation
   */
  addMessage(message: Omit<ConversationMessage, 'id' | 'createdAt'>): Conversation {
    const newMessage: ConversationMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    const updatedMessages = [...this.messages, newMessage];
    const updatedAnalytics = this.updateAnalytics(newMessage);

    return new Conversation(
      this.id,
      this.siteId,
      this.tenantId,
      this.sessionId,
      updatedMessages,
      this.context,
      updatedAnalytics,
      this.createdAt,
      new Date(), // updatedAt
      this.endedAt,
      this.isActive,
    );
  }

  /**
   * Update conversation context
   */
  updateContext(context: Partial<Conversation['context']>): Conversation {
    return new Conversation(
      this.id,
      this.siteId,
      this.tenantId,
      this.sessionId,
      this.messages,
      { ...this.context, ...context },
      this.analytics,
      this.createdAt,
      new Date(),
      this.endedAt,
      this.isActive,
    );
  }

  /**
   * End conversation
   */
  end(satisfaction?: number, resolved?: boolean): Conversation {
    const updatedAnalytics: ConversationAnalytics = {
      ...this.analytics,
      satisfaction,
      resolved,
    };

    return new Conversation(
      this.id,
      this.siteId,
      this.tenantId,
      this.sessionId,
      this.messages,
      this.context,
      updatedAnalytics,
      this.createdAt,
      new Date(),
      new Date(), // endedAt
      false, // isActive
    );
  }

  /**
   * Get conversation duration in minutes
   */
  getDuration(): number | null {
    if (!this.endedAt) return null;
    return Math.floor((this.endedAt.getTime() - this.createdAt.getTime()) / (1000 * 60));
  }

  /**
   * Get last user message
   */
  getLastUserMessage(): ConversationMessage | null {
    return this.messages
      .filter(m => m.role === 'user')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  }

  /**
   * Get last assistant message
   */
  getLastAssistantMessage(): ConversationMessage | null {
    return this.messages
      .filter(m => m.role === 'assistant')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  }

  /**
   * Get conversation summary
   */
  getSummary(): string {
    const firstUserMessage = this.messages.find(m => m.role === 'user')?.content;
    const messageCount = this.messages.length;
    const duration = this.getDuration();
    
    if (!firstUserMessage) return 'No messages';
    
    const truncatedMessage = firstUserMessage.length > 100 
      ? firstUserMessage.substring(0, 100) + '...'
      : firstUserMessage;
    
    return `"${truncatedMessage}" (${messageCount} messages${duration ? `, ${duration}m` : ''})`;
  }

  /**
   * Check if conversation is stale (no activity for 30 minutes)
   */
  isStale(): boolean {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return this.updatedAt < thirtyMinutesAgo;
  }

  /**
   * Get tool usage statistics
   */
  getToolUsage(): Record<string, number> {
    const toolUsage: Record<string, number> = {};
    
    this.messages.forEach(message => {
      if (message.metadata?.toolCalls) {
        message.metadata.toolCalls.forEach(toolCall => {
          toolUsage[toolCall.function.name] = (toolUsage[toolCall.function.name] || 0) + 1;
        });
      }
    });
    
    return toolUsage;
  }

  /**
   * Update analytics based on new message
   */
  private updateAnalytics(message: ConversationMessage): ConversationAnalytics {
    const analytics = { ...this.analytics };
    
    analytics.totalMessages += 1;
    
    if (message.role === 'user') {
      analytics.userMessages += 1;
    } else if (message.role === 'assistant') {
      analytics.assistantMessages += 1;
    }
    
    // Add token counts if available
    if (message.metadata?.tokens) {
      analytics.totalTokens += message.metadata.tokens.input + message.metadata.tokens.output;
    }
    
    // Track tool usage
    if (message.metadata?.toolCalls) {
      message.metadata.toolCalls.forEach(toolCall => {
        if (!analytics.toolCallsUsed.includes(toolCall.function.name)) {
          analytics.toolCallsUsed.push(toolCall.function.name);
        }
      });
    }
    
    return analytics;
  }
}

/**
 * Default conversation analytics
 */
export const getDefaultConversationAnalytics = (): ConversationAnalytics => ({
  totalMessages: 0,
  userMessages: 0,
  assistantMessages: 0,
  totalTokens: 0,
  averageResponseTime: 0,
  toolCallsUsed: [],
});

/**
 * Validation schemas
 */
export const CreateConversationSchema = z.object({
  siteId: z.string().uuid(),
  tenantId: z.string().uuid(),
  sessionId: z.string().min(1),
  context: z.object({
    userAgent: z.string().optional(),
    ipAddress: z.string().optional(),
    referrer: z.string().url().optional(),
    currentPage: z.string().url().optional(),
    userPreferences: z.record(z.unknown()).optional(),
  }).optional().default({}),
});

export const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  metadata: z.object({
    toolCalls: z.array(z.object({
      id: z.string(),
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
      result: z.string().optional(),
      error: z.string().optional(),
    })).optional(),
    sources: z.array(z.string()).optional(),
    timestamp: z.date().optional(),
    tokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    }).optional(),
  }).optional(),
});

export const EndConversationSchema = z.object({
  satisfaction: z.number().int().min(1).max(5).optional(),
  resolved: z.boolean().optional(),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type AddMessageInput = z.infer<typeof AddMessageSchema>;
export type EndConversationInput = z.infer<typeof EndConversationSchema>;