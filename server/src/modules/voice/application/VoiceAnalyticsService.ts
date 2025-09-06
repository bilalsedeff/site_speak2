import { and, eq, desc, count, sum, avg, sql, between } from 'drizzle-orm';
import { db } from '../../../infrastructure/database/index.js';
import { 
  voiceSessions, 
  voiceInteractions,
  type NewVoiceSession,
  type VoiceSession,
  type VoiceInteraction
} from '../../../infrastructure/database/schema/voice-sessions.js';
import { users } from '../../../infrastructure/database/schema/users.js';
import { createLogger } from '../../../shared/utils.js';

const logger = createLogger({ service: 'voice-analytics' });

export interface VoiceSessionAnalytics {
  sessionId: string;
  userId: string;
  tenantId: string;
  totalInteractions: number;
  duration: number; // in minutes
  speechToTextAccuracy: number;
  averageResponseTime: number; // in milliseconds
  emotionsDetected: string[];
  languagesUsed: string[];
  qualityScore: number;
  startedAt: Date;
  endedAt?: Date;
  status: string;
}

export interface VoiceUsageStatistics {
  userId: string;
  tenantId: string;
  currentMonth: {
    voiceMinutesUsed: number;
    speechToTextRequests: number;
    textToSpeechRequests: number;
    activeSessions: number;
  };
  limits: {
    voiceMinutesPerMonth: number;
    requestsPerMonth: number;
  };
  usage: {
    voiceMinutesPercentage: number;
    requestsPercentage: number;
  };
  trending: {
    thisWeek: number;
    lastWeek: number;
    growth: number;
  };
}

export interface VoiceInteractionData {
  sessionId: string;
  turnId: string;
  type: 'question' | 'command' | 'confirmation' | 'clarification' | 'interruption';
  transcript?: string;
  confidence?: number;
  responseText?: string;
  processingTime?: number;
  qualityScore?: number;
  intent?: string;
  intentConfidence?: number;
  toolsUsed?: string[];
  userId?: string;
}

/**
 * Voice Analytics Service for real database-backed voice metrics
 * 
 * Provides comprehensive analytics for voice interactions, sessions,
 * and usage patterns with tenant isolation and performance optimization.
 */
export class VoiceAnalyticsService {
  
  /**
   * Create or update a voice session
   */
  async createOrUpdateSession(sessionData: Partial<NewVoiceSession>): Promise<VoiceSession> {
    try {
      // Check if session already exists
      if (sessionData.sessionId) {
        const existingSession = await db
          .select()
          .from(voiceSessions)
          .where(eq(voiceSessions.sessionId, sessionData.sessionId))
          .limit(1);

        if (existingSession.length > 0) {
          // Update existing session
          const updated = await db
            .update(voiceSessions)
            .set({
              ...sessionData,
              lastActivityAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(voiceSessions.sessionId, sessionData.sessionId))
            .returning();
          
          if (updated.length === 0) {
            throw new Error(`Failed to update voice session: ${sessionData.sessionId}`);
          }
          
          const updatedSession = updated[0];
          if (!updatedSession) {
            throw new Error(`Failed to get updated session: ${sessionData.sessionId}`);
          }
          
          logger.info('Voice session updated', { sessionId: sessionData.sessionId });
          return updatedSession;
        }
      }

      // Ensure siteId is provided (required by schema)
      if (!sessionData.siteId) {
        throw new Error('siteId is required to create a voice session');
      }

      // Create new session - ensure required fields are provided
      const sessionValues = {
        ...sessionData,
        siteId: sessionData.siteId, // Ensure siteId is defined
        sessionId: sessionData.sessionId || crypto.randomUUID(),
        status: sessionData.status || 'initializing',
        language: sessionData.language || 'en',
        locale: sessionData.locale || 'en-US',
        totalInteractions: 0,
        totalDuration: 0,
        averageResponseTime: 0,
        errorCount: 0
      };

      const newSessions = await db
        .insert(voiceSessions)
        .values(sessionValues)
        .returning();

      if (newSessions.length === 0) {
        throw new Error('Failed to create voice session');
      }
      
      const newSession = newSessions[0];
      if (!newSession) {
        throw new Error('Failed to get created session');
      }
      
      logger.info('Voice session created', { sessionId: newSession.sessionId });
      return newSession;
    } catch (error) {
      logger.error('Failed to create/update voice session', { error, sessionData });
      throw error;
    }
  }

  /**
   * Record a voice interaction
   */
  async recordInteraction(interactionData: VoiceInteractionData): Promise<VoiceInteraction> {
    try {
      // Get session to link interaction
      const session = await db
        .select()
        .from(voiceSessions)
        .where(eq(voiceSessions.sessionId, interactionData.sessionId))
        .limit(1);

      if (session.length === 0) {
        throw new Error(`Voice session not found: ${interactionData.sessionId}`);
      }

      // Create interaction record
      const sessionRecord = session[0];
      if (!sessionRecord) {
        throw new Error(`Voice session record not found: ${interactionData.sessionId}`);
      }

      const interactions = await db
        .insert(voiceInteractions)
        .values({
          sessionId: sessionRecord.id,
          turnId: interactionData.turnId,
          type: interactionData.type,
          status: 'completed',
          input: {
            transcript: interactionData.transcript,
            confidence: interactionData.confidence
          },
          output: {
            text: interactionData.responseText
          },
          processing: {
            responseTime: interactionData.processingTime,
            timestamp: new Date().toISOString()
          },
          detectedIntent: interactionData.intent,
          intentConfidence: interactionData.intentConfidence,
          toolsCalled: interactionData.toolsUsed || [],
          qualityScore: interactionData.qualityScore,
          processedAt: new Date(),
          completedAt: new Date()
        })
        .returning();
        
      if (interactions.length === 0) {
        throw new Error('Failed to create voice interaction');
      }
      
      const interaction = interactions[0];
      if (!interaction) {
        throw new Error('Failed to get created voice interaction');
      }

      // Update session statistics
      await this.updateSessionStatistics(sessionRecord.id, interactionData);

      logger.info('Voice interaction recorded', { 
        interactionId: interaction.id, 
        sessionId: interactionData.sessionId 
      });
      
      return interaction;
    } catch (error) {
      logger.error('Failed to record voice interaction', { error, interactionData });
      throw error;
    }
  }

  /**
   * Update session statistics after interaction
   */
  private async updateSessionStatistics(sessionId: string | undefined, interactionData: VoiceInteractionData): Promise<void> {
    if (!sessionId) {
      logger.warn('No session ID provided for statistics update');
      return;
    }
    try {
      // Get current session stats
      const [session] = await db
        .select({
          totalInteractions: voiceSessions.totalInteractions,
          totalDuration: voiceSessions.totalDuration,
          averageResponseTime: voiceSessions.averageResponseTime
        })
        .from(voiceSessions)
        .where(eq(voiceSessions.id, sessionId))
        .limit(1);

      if (!session) {return;}

      const newTotalInteractions = (session.totalInteractions || 0) + 1;
      const processingTime = interactionData.processingTime || 0;
      
      // Calculate new average response time
      const currentAvgResponseTime = session.averageResponseTime || 0;
      const newAvgResponseTime = 
        (currentAvgResponseTime * (newTotalInteractions - 1) + processingTime) / newTotalInteractions;

      // Update session
      await db
        .update(voiceSessions)
        .set({
          totalInteractions: newTotalInteractions,
          averageResponseTime: newAvgResponseTime,
          lastActivityAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(voiceSessions.id, sessionId));

    } catch (error) {
      logger.error('Failed to update session statistics', { error, sessionId });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Get session analytics for a specific session
   */
  async getSessionAnalytics(sessionId: string, userId: string, tenantId: string): Promise<VoiceSessionAnalytics | null> {
    try {
      // Get session with interactions
      const sessionQuery = await db
        .select({
          session: voiceSessions,
          user: users
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(voiceSessions.sessionId, sessionId),
            eq(users.tenantId, tenantId) // Ensure tenant isolation
          )
        )
        .limit(1);

      if (sessionQuery.length === 0) {
        return null;
      }

      const sessionResult = sessionQuery[0];
      if (!sessionResult?.session) {
        return null;
      }
      
      const { session, user } = sessionResult;

      // Get interactions for this session
      const interactions = await db
        .select()
        .from(voiceInteractions)
        .where(eq(voiceInteractions.sessionId, session.id))
        .orderBy(desc(voiceInteractions.receivedAt));

      // Calculate analytics
      const totalInteractions = interactions.length;
      const duration = session.totalDuration || 0; // Convert to minutes
      
      // Calculate speech-to-text accuracy (from confidence scores)
      const confidenceScores = interactions
        .map(i => {
          const input = i.input as Record<string, any> | null;
          return input?.['confidence'] as number | undefined;
        })
        .filter((c): c is number => c !== undefined && c !== null);
      const speechToTextAccuracy = confidenceScores.length > 0 
        ? confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length 
        : 0;

      // Extract emotions and languages from interactions
      const emotionsDetected = [...new Set(
        interactions
          .flatMap(i => {
            const output = i.output as Record<string, any> | null;
            return (output?.['emotions'] as string[]) || [];
          })
          .filter(Boolean)
      )];

      const languagesUsed = [...new Set(
        interactions
          .map(i => {
            const input = i.input as Record<string, any> | null;
            return (input?.['language'] as string) || session.language;
          })
          .filter(Boolean)
      )];

      // Calculate quality score
      const qualityScores = interactions
        .map(i => i.qualityScore)
        .filter(s => s !== undefined && s !== null) as number[];
      const qualityScore = qualityScores.length > 0
        ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
        : 0;

      const result: VoiceSessionAnalytics = {
        sessionId: session.sessionId,
        userId: user?.id || userId,
        tenantId: user?.tenantId || tenantId,
        totalInteractions,
        duration: duration / 60, // Convert seconds to minutes
        speechToTextAccuracy,
        averageResponseTime: session.averageResponseTime || 0,
        emotionsDetected,
        languagesUsed,
        qualityScore,
        startedAt: session.startedAt,
        status: session.status
      };

      // Only add endedAt if it exists
      if (session.endedAt) {
        result.endedAt = session.endedAt;
      }

      return result;
    } catch (error) {
      logger.error('Failed to get session analytics', { error, sessionId, userId });
      throw error;
    }
  }

  /**
   * Get voice usage statistics for a user/tenant
   */
  async getUsageStatistics(userId: string, tenantId: string): Promise<VoiceUsageStatistics> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfLastWeek = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // Get current month statistics
      const monthlyStats = await db
        .select({
          totalSessions: count(voiceSessions.id),
          totalDuration: sum(voiceSessions.totalDuration),
          totalInteractions: sum(voiceSessions.totalInteractions)
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            between(voiceSessions.startedAt, startOfMonth, now)
          )
        );

      // Get interaction counts for STT/TTS
      const interactionStats = await db
        .select({
          speechToTextRequests: count(sql`CASE WHEN ${voiceInteractions.input} IS NOT NULL THEN 1 END`),
          textToSpeechRequests: count(sql`CASE WHEN ${voiceInteractions.output} IS NOT NULL THEN 1 END`)
        })
        .from(voiceInteractions)
        .leftJoin(voiceSessions, eq(voiceInteractions.sessionId, voiceSessions.id))
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            between(voiceInteractions.receivedAt, startOfMonth, now)
          )
        );

      // Get active sessions count
      const activeSessionsQuery = await db
        .select({
          activeSessions: count(voiceSessions.id)
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            eq(voiceSessions.status, 'listening'),
            sql`${voiceSessions.lastActivityAt} > NOW() - INTERVAL '1 hour'`
          )
        );

      // Get this week's usage
      const thisWeekStats = await db
        .select({
          weeklyDuration: sum(voiceSessions.totalDuration)
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            between(voiceSessions.startedAt, startOfWeek, now)
          )
        );

      // Get last week's usage  
      const lastWeekStats = await db
        .select({
          weeklyDuration: sum(voiceSessions.totalDuration)
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            between(voiceSessions.startedAt, startOfLastWeek, startOfWeek)
          )
        );

      // Calculate statistics
      const voiceMinutesUsed = Number(monthlyStats[0]?.totalDuration || 0) / 60;
      const speechToTextRequests = Number(interactionStats[0]?.speechToTextRequests || 0);
      const textToSpeechRequests = Number(interactionStats[0]?.textToSpeechRequests || 0);
      const activeSessions = Number(activeSessionsQuery[0]?.activeSessions || 0);

      // Set limits (these could come from a subscription/plan service)
      const limits = {
        voiceMinutesPerMonth: 300, // Default limit
        requestsPerMonth: 1000
      };

      const totalRequests = speechToTextRequests + textToSpeechRequests;
      
      const thisWeekMinutes = Number(thisWeekStats[0]?.weeklyDuration || 0) / 60;
      const lastWeekMinutes = Number(lastWeekStats[0]?.weeklyDuration || 0) / 60;
      const growth = lastWeekMinutes > 0 
        ? ((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100 
        : thisWeekMinutes > 0 ? 100 : 0;

      return {
        userId,
        tenantId,
        currentMonth: {
          voiceMinutesUsed,
          speechToTextRequests,
          textToSpeechRequests,
          activeSessions
        },
        limits,
        usage: {
          voiceMinutesPercentage: (voiceMinutesUsed / limits.voiceMinutesPerMonth) * 100,
          requestsPercentage: (totalRequests / limits.requestsPerMonth) * 100
        },
        trending: {
          thisWeek: thisWeekMinutes,
          lastWeek: lastWeekMinutes,
          growth
        }
      };
    } catch (error) {
      logger.error('Failed to get usage statistics', { error, userId, tenantId });
      throw error;
    }
  }

  /**
   * Update tenant voice usage (for billing/limits)
   */
  async updateTenantUsage(tenantId: string, usage: {
    minutesUsed?: number;
    requestsUsed?: number;
    interactionType?: 'stt' | 'tts';
  }): Promise<void> {
    try {
      // This would typically update a separate tenant_usage table
      // For now, we'll just log the usage
      logger.info('Tenant voice usage updated', { tenantId, usage });
      
      // Future implementation: update tenant limits/billing
      // await db.update(tenantUsage)
      //   .set({ /* usage updates */ })
      //   .where(eq(tenantUsage.tenantId, tenantId));
      
    } catch (error) {
      logger.error('Failed to update tenant usage', { error, tenantId, usage });
      // Don't throw - this is non-critical for the user experience
    }
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      await db
        .update(voiceSessions)
        .set({
          status: 'ended',
          endedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(voiceSessions.sessionId, sessionId));
        
      logger.info('Voice session ended', { sessionId });
    } catch (error) {
      logger.error('Failed to end voice session', { error, sessionId });
      throw error;
    }
  }

  /**
   * Get tenant voice analytics summary
   */
  async getTenantAnalyticsSummary(tenantId: string, days: number = 30): Promise<{
    totalSessions: number;
    totalInteractions: number;
    totalMinutes: number;
    averageSessionDuration: number;
    averageQualityScore: number;
    topLanguages: Array<{ language: string; count: number }>;
    topIntents: Array<{ intent: string; count: number }>;
  }> {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get overall statistics
      const overallStats = await db
        .select({
          totalSessions: count(voiceSessions.id),
          totalDuration: sum(voiceSessions.totalDuration),
          totalInteractions: sum(voiceSessions.totalInteractions),
          avgQuality: avg(voiceInteractions.qualityScore)
        })
        .from(voiceSessions)
        .leftJoin(users, eq(voiceSessions.userId, users.id))
        .leftJoin(voiceInteractions, eq(voiceInteractions.sessionId, voiceSessions.id))
        .where(
          and(
            eq(users.tenantId, tenantId),
            sql`${voiceSessions.startedAt} >= ${cutoffDate}`
          )
        );

      const stats = overallStats[0];
      const totalMinutes = Number(stats?.totalDuration || 0) / 60;
      const totalSessions = Number(stats?.totalSessions || 0);
      const averageSessionDuration = totalSessions > 0 
        ? totalMinutes / totalSessions 
        : 0;

      return {
        totalSessions,
        totalInteractions: Number(stats?.totalInteractions || 0),
        totalMinutes,
        averageSessionDuration,
        averageQualityScore: Number(stats?.avgQuality || 0),
        topLanguages: [], // TODO: implement language aggregation
        topIntents: [] // TODO: implement intent aggregation
      };
    } catch (error) {
      logger.error('Failed to get tenant analytics summary', { error, tenantId });
      throw error;
    }
  }
}

// Export singleton instance
export const voiceAnalyticsService = new VoiceAnalyticsService();