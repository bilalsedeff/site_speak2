import { z } from 'zod';

export interface VoiceInteraction {
  id: string;
  sessionId: string;
  type: 'user_speech' | 'assistant_speech' | 'system_message';
  audioUrl?: string;
  transcript?: string;
  duration?: number; // in milliseconds
  confidence?: number; // 0-1 for speech recognition confidence
  metadata?: {
    language?: string;
    emotion?: string;
    intent?: string;
    entities?: Record<string, unknown>;
    processingTime?: number;
  };
  createdAt: Date;
}

export interface VoiceMetrics {
  totalInteractions: number;
  userSpeechCount: number;
  assistantSpeechCount: number;
  totalDuration: number; // milliseconds
  averageResponseTime: number; // milliseconds
  speechRecognitionAccuracy: number; // average confidence
  languagesUsed: string[];
  emotionsDetected: string[];
  intentsIdentified: string[];
}

/**
 * Voice Session domain entity
 */
export class VoiceSession {
  constructor(
    public readonly id: string,
    public readonly siteId: string,
    public readonly tenantId: string,
    public readonly conversationId: string,
    public interactions: VoiceInteraction[],
    public context: {
      userAgent?: string;
      ipAddress?: string;
      language: string;
      voiceSettings: {
        model: 'tts-1' | 'tts-1-hd';
        voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
        speed: number; // 0.25 - 4.0
        format: 'mp3' | 'opus' | 'aac' | 'flac';
      };
      sttSettings: {
        model: 'whisper-1';
        language?: string;
        prompt?: string;
      };
    },
    public metrics: VoiceMetrics,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public endedAt?: Date,
    public readonly isActive: boolean = true,
  ) {}

  /**
   * Add voice interaction
   */
  addInteraction(interaction: Omit<VoiceInteraction, 'id' | 'sessionId' | 'createdAt'>): VoiceSession {
    const newInteraction: VoiceInteraction = {
      ...interaction,
      id: crypto.randomUUID(),
      sessionId: this.id,
      createdAt: new Date(),
    };

    const updatedInteractions = [...this.interactions, newInteraction];
    const updatedMetrics = this.updateMetrics(newInteraction);

    return new VoiceSession(
      this.id,
      this.siteId,
      this.tenantId,
      this.conversationId,
      updatedInteractions,
      this.context,
      updatedMetrics,
      this.createdAt,
      new Date(), // updatedAt
      this.endedAt,
      this.isActive,
    );
  }

  /**
   * Update voice settings
   */
  updateVoiceSettings(voiceSettings: Partial<VoiceSession['context']['voiceSettings']>): VoiceSession {
    return new VoiceSession(
      this.id,
      this.siteId,
      this.tenantId,
      this.conversationId,
      this.interactions,
      {
        ...this.context,
        voiceSettings: { ...this.context.voiceSettings, ...voiceSettings },
      },
      this.metrics,
      this.createdAt,
      new Date(),
      this.endedAt,
      this.isActive,
    );
  }

  /**
   * Update STT settings
   */
  updateSTTSettings(sttSettings: Partial<VoiceSession['context']['sttSettings']>): VoiceSession {
    return new VoiceSession(
      this.id,
      this.siteId,
      this.tenantId,
      this.conversationId,
      this.interactions,
      {
        ...this.context,
        sttSettings: { ...this.context.sttSettings, ...sttSettings },
      },
      this.metrics,
      this.createdAt,
      new Date(),
      this.endedAt,
      this.isActive,
    );
  }

  /**
   * End voice session
   */
  end(): VoiceSession {
    return new VoiceSession(
      this.id,
      this.siteId,
      this.tenantId,
      this.conversationId,
      this.interactions,
      this.context,
      this.metrics,
      this.createdAt,
      new Date(),
      new Date(), // endedAt
      false, // isActive
    );
  }

  /**
   * Get session duration in minutes
   */
  getDuration(): number | null {
    if (!this.endedAt) {return null;}
    return Math.floor((this.endedAt.getTime() - this.createdAt.getTime()) / (1000 * 60));
  }

  /**
   * Get last user speech
   */
  getLastUserSpeech(): VoiceInteraction | null {
    return this.interactions
      .filter(i => i.type === 'user_speech')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  }

  /**
   * Get last assistant speech
   */
  getLastAssistantSpeech(): VoiceInteraction | null {
    return this.interactions
      .filter(i => i.type === 'assistant_speech')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  }

  /**
   * Check if session is stale (no activity for 10 minutes)
   */
  isStale(): boolean {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return this.updatedAt < tenMinutesAgo;
  }

  /**
   * Get conversation flow
   */
  getConversationFlow(): Array<{ type: string; content: string; timestamp: Date }> {
    return this.interactions
      .filter(i => i.type === 'user_speech' || i.type === 'assistant_speech')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(i => ({
        type: i.type === 'user_speech' ? 'user' : 'assistant',
        content: i.transcript || '[Audio]',
        timestamp: i.createdAt,
      }));
  }

  /**
   * Get quality metrics
   */
  getQualityMetrics() {
    const userInteractions = this.interactions.filter(i => i.type === 'user_speech');
    const avgConfidence = userInteractions.length > 0
      ? userInteractions.reduce((sum, i) => sum + (i.confidence || 0), 0) / userInteractions.length
      : 0;

    return {
      speechRecognitionAccuracy: avgConfidence,
      averageResponseTime: this.metrics.averageResponseTime,
      totalInteractions: this.metrics.totalInteractions,
      sessionDuration: this.getDuration(),
      languageConsistency: this.metrics.languagesUsed.length <= 1,
    };
  }

  /**
   * Update metrics based on new interaction
   */
  private updateMetrics(interaction: VoiceInteraction): VoiceMetrics {
    const metrics = { ...this.metrics };

    metrics.totalInteractions += 1;

    if (interaction.type === 'user_speech') {
      metrics.userSpeechCount += 1;
      
      if (interaction.confidence && interaction.confidence > 0) {
        const totalConfidence = this.metrics.speechRecognitionAccuracy * this.metrics.userSpeechCount;
        metrics.speechRecognitionAccuracy = (totalConfidence + interaction.confidence) / metrics.userSpeechCount;
      }
    } else if (interaction.type === 'assistant_speech') {
      metrics.assistantSpeechCount += 1;
    }

    if (interaction.duration) {
      metrics.totalDuration += interaction.duration;
    }

    if (interaction.metadata?.processingTime) {
      const totalResponseTime = this.metrics.averageResponseTime * this.metrics.assistantSpeechCount;
      metrics.averageResponseTime = (totalResponseTime + interaction.metadata.processingTime) / Math.max(metrics.assistantSpeechCount, 1);
    }

    if (interaction.metadata?.language && !metrics.languagesUsed.includes(interaction.metadata.language)) {
      metrics.languagesUsed.push(interaction.metadata.language);
    }

    if (interaction.metadata?.emotion && !metrics.emotionsDetected.includes(interaction.metadata.emotion)) {
      metrics.emotionsDetected.push(interaction.metadata.emotion);
    }

    if (interaction.metadata?.intent && !metrics.intentsIdentified.includes(interaction.metadata.intent)) {
      metrics.intentsIdentified.push(interaction.metadata.intent);
    }

    return metrics;
  }
}

/**
 * Default voice metrics
 */
export const getDefaultVoiceMetrics = (): VoiceMetrics => ({
  totalInteractions: 0,
  userSpeechCount: 0,
  assistantSpeechCount: 0,
  totalDuration: 0,
  averageResponseTime: 0,
  speechRecognitionAccuracy: 0,
  languagesUsed: [],
  emotionsDetected: [],
  intentsIdentified: [],
});

/**
 * Default voice settings
 */
export const getDefaultVoiceSettings = () => ({
  voiceSettings: {
    model: 'tts-1' as const,
    voice: 'alloy' as const,
    speed: 1.0,
    format: 'mp3' as const,
  },
  sttSettings: {
    model: 'whisper-1' as const,
  },
});

/**
 * Validation schemas
 */
export const CreateVoiceSessionSchema = z.object({
  siteId: z.string().uuid(),
  tenantId: z.string().uuid(),
  conversationId: z.string().uuid(),
  context: z.object({
    userAgent: z.string().optional(),
    ipAddress: z.string().optional(),
    language: z.string().default('en'),
    voiceSettings: z.object({
      model: z.enum(['tts-1', 'tts-1-hd']).default('tts-1'),
      voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
      speed: z.number().min(0.25).max(4.0).default(1.0),
      format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
    }).optional(),
    sttSettings: z.object({
      model: z.enum(['whisper-1']).default('whisper-1'),
      language: z.string().optional(),
      prompt: z.string().optional(),
    }).optional(),
  }).optional(),
});

export const AddVoiceInteractionSchema = z.object({
  type: z.enum(['user_speech', 'assistant_speech', 'system_message']),
  audioUrl: z.string().url().optional(),
  transcript: z.string().optional(),
  duration: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.object({
    language: z.string().optional(),
    emotion: z.string().optional(),
    intent: z.string().optional(),
    entities: z.record(z.unknown()).optional(),
    processingTime: z.number().int().positive().optional(),
  }).optional(),
});

export const UpdateVoiceSettingsSchema = z.object({
  voiceSettings: z.object({
    model: z.enum(['tts-1', 'tts-1-hd']).optional(),
    voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
    speed: z.number().min(0.25).max(4.0).optional(),
    format: z.enum(['mp3', 'opus', 'aac', 'flac']).optional(),
  }).optional(),
  sttSettings: z.object({
    model: z.enum(['whisper-1']).optional(),
    language: z.string().optional(),
    prompt: z.string().optional(),
  }).optional(),
});

export type CreateVoiceSessionInput = z.infer<typeof CreateVoiceSessionSchema>;
export type AddVoiceInteractionInput = z.infer<typeof AddVoiceInteractionSchema>;
export type UpdateVoiceSettingsInput = z.infer<typeof UpdateVoiceSettingsSchema>;