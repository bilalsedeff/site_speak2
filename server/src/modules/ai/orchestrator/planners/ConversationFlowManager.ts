/**
 * Conversation Flow Manager
 * 
 * Implements slot-frame dialog management for complex multi-step tasks:
 * - Slot extraction and normalization (time: "this summer" → Jun-Aug)
 * - Missing slot detection and clarification prompts
 * - Speculative navigation policy for hiding latency
 * - Dialog state management with context awareness
 * 
 * Based on source-of-truth requirement for handling complex queries like:
 * "Find me EDM/House concerts by the sea near me this summer and add 2 tickets to cart"
 */

import { createLogger } from '../../../../shared/utils.js';
import { HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { config } from '../../../../infrastructure/config';

const logger = createLogger({ service: 'conversation-flow' });

export interface SlotFrame {
  intent: 'buy_tickets' | 'book_service' | 'find_products' | 'get_information' | 'navigation';
  confidence: number;
  slots: {
    [key: string]: SlotValue;
  };
  missingSlots: string[];
  resolvedSlots: string[];
  constraints: Constraint[];
}

export interface SlotValue {
  raw: string;
  normalized: any;
  confidence: number;
  source: 'user_input' | 'context' | 'inference' | 'default';
  needsConfirmation?: boolean;
}

export interface Constraint {
  type: 'temporal' | 'spatial' | 'categorical' | 'quantitative';
  field: string;
  operator: 'equals' | 'greater' | 'less' | 'contains' | 'near' | 'within';
  value: any;
  priority: number;
}

export interface ConversationContext {
  sessionId: string;
  siteId: string;
  tenantId: string;
  userLocation?: {
    lat: number;
    lng: number;
    city?: string;
    country?: string;
  };
  userPreferences?: {
    language: string;
    timezone: string;
    currency?: string;
  };
  conversationHistory: Array<{
    userInput: string;
    botResponse: string;
    timestamp: Date;
    slotFrame?: SlotFrame;
  }>;
  speculativeActions: Array<{
    actionName: string;
    parameters: Record<string, any>;
    startedAt: Date;
    confidence: number;
  }>;
}

export interface ClarificationResponse {
  needed: boolean;
  question?: string;
  suggestedValues?: Array<{
    display: string;
    value: any;
    confidence: number;
  }>;
  canProceedWithDefaults?: boolean;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Conversation Flow Manager for complex task orchestration
 */
export class ConversationFlowManager {
  private llm: ChatOpenAI;
  private slotExtractors = new Map<string, SlotExtractor>();
  
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: config.AI_MODEL || 'gpt-4o',
      temperature: 0.1,
      maxTokens: 1000,
    });
    
    this.registerSlotExtractors();
    logger.info('Conversation Flow Manager initialized');
  }

  /**
   * Parse user input and extract slot frame
   */
  async parseUserIntent(
    userInput: string, 
    context: ConversationContext,
    availableActions: string[] = []
  ): Promise<SlotFrame> {
    const startTime = Date.now();
    
    logger.info('Parsing user intent', {
      sessionId: context.sessionId,
      inputLength: userInput.length,
      availableActions: availableActions.length
    });

    try {
      const prompt = this.buildIntentExtractionPrompt(userInput, context, availableActions);
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      
      let intentResult;
      try {
        intentResult = JSON.parse(response.content as string);
      } catch (parseError) {
        logger.warn('Failed to parse LLM response, using fallback', { parseError });
        intentResult = this.createFallbackIntentResult(userInput);
      }

      // Process and normalize slots
      const slotFrame = await this.processSlotExtraction(intentResult, context);
      
      const processingTime = Date.now() - startTime;
      logger.info('Intent parsing completed', {
        sessionId: context.sessionId,
        intent: slotFrame.intent,
        slotCount: Object.keys(slotFrame.slots).length,
        missingSlots: slotFrame.missingSlots.length,
        processingTime
      });

      return slotFrame;

    } catch (error) {
      logger.error('Intent parsing failed', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return fallback slot frame
      return this.createFallbackSlotFrame(userInput, context);
    }
  }

  /**
   * Check if clarification is needed for missing slots
   */
  async checkClarificationNeeded(
    slotFrame: SlotFrame,
    context: ConversationContext
  ): Promise<ClarificationResponse> {
    if (slotFrame.missingSlots.length === 0) {
      return { needed: false, priority: 'low' };
    }

    // Prioritize missing slots by importance
    const prioritizedSlots = this.prioritizeMissingSlots(slotFrame.missingSlots, slotFrame.intent);
    const mostImportantSlot = prioritizedSlots[0];

    if (!mostImportantSlot) {
      return { needed: false, priority: 'low' };
    }

    // Generate clarification question
    const clarification = await this.generateClarificationQuestion(
      mostImportantSlot,
      slotFrame,
      context
    );

    logger.info('Clarification check completed', {
      sessionId: context.sessionId,
      needed: clarification.needed,
      slot: mostImportantSlot,
      priority: clarification.priority
    });

    return clarification;
  }

  /**
   * Plan speculative actions to execute while waiting for user response
   */
  planSpeculativeActions(
    slotFrame: SlotFrame,
    context: ConversationContext,
    availableActions: string[]
  ): Array<{ actionName: string; parameters: Record<string, any>; confidence: number }> {
    const speculativeActions: Array<{ actionName: string; parameters: Record<string, any>; confidence: number }> = [];

    // Only speculate on safe, reversible actions
    const safeActions = availableActions.filter(action => 
      this.isSafeForSpeculation(action)
    );

    logger.debug('Planning speculative actions', {
      sessionId: context.sessionId,
      intent: slotFrame.intent,
      safeActions: safeActions.length,
      resolvedSlots: slotFrame.resolvedSlots.length
    });

    // Navigate to relevant pages based on intent
    if (slotFrame.intent === 'buy_tickets' && slotFrame.resolvedSlots.length > 0) {
      if (safeActions.includes('navigate_events')) {
        speculativeActions.push({
          actionName: 'navigate_events',
          parameters: this.buildNavigationParameters(slotFrame),
          confidence: 0.8
        });
      }
    }

    if (slotFrame.intent === 'find_products') {
      if (safeActions.includes('navigate_products')) {
        speculativeActions.push({
          actionName: 'navigate_products',
          parameters: this.buildNavigationParameters(slotFrame),
          confidence: 0.7
        });
      }
    }

    // Pre-load search results if we have enough context
    const contextSlots = Object.keys(slotFrame.slots).filter(key => 
      slotFrame.slots[key].confidence > 0.6
    );

    if (contextSlots.length >= 2 && safeActions.includes('search_content')) {
      speculativeActions.push({
        actionName: 'search_content',
        parameters: {
          query: this.buildSearchQuery(slotFrame),
          preload: true
        },
        confidence: 0.6
      });
    }

    logger.info('Speculative actions planned', {
      sessionId: context.sessionId,
      actionCount: speculativeActions.length,
      averageConfidence: speculativeActions.length > 0 
        ? speculativeActions.reduce((sum, a) => sum + a.confidence, 0) / speculativeActions.length 
        : 0
    });

    return speculativeActions;
  }

  /**
   * Update slot frame with new information from user response
   */
  async updateSlotFrame(
    currentFrame: SlotFrame,
    userResponse: string,
    context: ConversationContext
  ): Promise<SlotFrame> {
    logger.info('Updating slot frame', {
      sessionId: context.sessionId,
      currentSlots: Object.keys(currentFrame.slots).length,
      missingSlots: currentFrame.missingSlots.length
    });

    try {
      // Extract new slots from user response
      const newSlots = await this.extractSlotsFromResponse(userResponse, currentFrame, context);
      
      // Merge with existing slots
      const updatedSlots = { ...currentFrame.slots };
      for (const [key, value] of Object.entries(newSlots)) {
        updatedSlots[key] = value;
      }

      // Recalculate missing slots
      const updatedMissingSlots = currentFrame.missingSlots.filter(slot => !updatedSlots[slot]);
      const updatedResolvedSlots = [...currentFrame.resolvedSlots, ...Object.keys(newSlots)];

      const updatedFrame: SlotFrame = {
        ...currentFrame,
        slots: updatedSlots,
        missingSlots: updatedMissingSlots,
        resolvedSlots: updatedResolvedSlots
      };

      logger.info('Slot frame updated', {
        sessionId: context.sessionId,
        newSlots: Object.keys(newSlots).length,
        totalSlots: Object.keys(updatedSlots).length,
        remainingMissingSlots: updatedMissingSlots.length
      });

      return updatedFrame;

    } catch (error) {
      logger.error('Slot frame update failed', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return currentFrame;
    }
  }

  /**
   * Build intent extraction prompt
   */
  private buildIntentExtractionPrompt(
    userInput: string,
    context: ConversationContext,
    availableActions: string[]
  ): string {
    const userLocation = context.userLocation 
      ? `${context.userLocation.city}, ${context.userLocation.country}`
      : 'unknown location';
      
    const timezone = context.userPreferences?.timezone || 'UTC';
    const currentDate = new Date().toLocaleDateString();

    return `Analyze this user request and extract structured intent with slots:

User Input: "${userInput}"
User Location: ${userLocation}
Current Date: ${currentDate}
Timezone: ${timezone}
Available Actions: ${availableActions.join(', ')}

Extract and return JSON with this structure:
{
  "intent": "buy_tickets|book_service|find_products|get_information|navigation",
  "confidence": 0.0-1.0,
  "slots": {
    "time": {"raw": "this summer", "type": "temporal"},
    "location": {"raw": "near me", "type": "spatial"},
    "genre": {"raw": "EDM/House", "type": "categorical"},
    "quantity": {"raw": "2 tickets", "type": "quantitative"},
    "venue_feature": {"raw": "by the sea", "type": "spatial_qualifier"}
  },
  "constraints": [
    {
      "type": "temporal",
      "field": "event_date", 
      "operator": "within",
      "value": "summer_2024"
    }
  ]
}

Key slot types to extract:
- temporal: time expressions (dates, seasons, relative time)
- spatial: location references (addresses, relative positions, venue features)
- categorical: product types, genres, categories
- quantitative: numbers, quantities, measurements
- qualitative: preferences, features, descriptions

Normalize common expressions:
- "this summer" → current year summer season
- "near me" → use user location context
- "by the sea/waterfront/beach" → coastal venue feature
- "2 tickets" → quantity: 2, item_type: "tickets"`;
  }

  /**
   * Process slot extraction and normalization
   */
  private async processSlotExtraction(
    intentResult: any,
    context: ConversationContext
  ): Promise<SlotFrame> {
    const slotFrame: SlotFrame = {
      intent: intentResult.intent || 'get_information',
      confidence: intentResult.confidence || 0.5,
      slots: {},
      missingSlots: [],
      resolvedSlots: [],
      constraints: intentResult.constraints || []
    };

    // Process each slot with specialized extractors
    for (const [slotKey, slotData] of Object.entries(intentResult.slots || {})) {
      const extractor = this.slotExtractors.get((slotData as any).type);
      
      if (extractor) {
        try {
          const normalized = await extractor.extract((slotData as any).raw, context);
          slotFrame.slots[slotKey] = {
            raw: (slotData as any).raw,
            normalized: normalized,
            confidence: 0.8,
            source: 'user_input'
          };
          slotFrame.resolvedSlots.push(slotKey);
        } catch (error) {
          logger.warn('Slot extraction failed', { slot: slotKey, error });
          slotFrame.missingSlots.push(slotKey);
        }
      } else {
        // No specialized extractor, use raw value
        slotFrame.slots[slotKey] = {
          raw: (slotData as any).raw,
          normalized: (slotData as any).raw,
          confidence: 0.6,
          source: 'user_input'
        };
        slotFrame.resolvedSlots.push(slotKey);
      }
    }

    // Identify critical missing slots based on intent
    const criticalSlots = this.getCriticalSlotsForIntent(slotFrame.intent);
    const missing = criticalSlots.filter(slot => !slotFrame.slots[slot]);
    slotFrame.missingSlots = missing;

    return slotFrame;
  }

  /**
   * Register slot extractors for different data types
   */
  private registerSlotExtractors(): void {
    // Temporal slot extractor
    this.slotExtractors.set('temporal', {
      extract: async (raw: string, context: ConversationContext) => {
        const timezone = context.userPreferences?.timezone || 'UTC';
        const currentYear = new Date().getFullYear();
        
        // Handle common temporal expressions
        if (raw.toLowerCase().includes('summer')) {
          const hemisphere = this.getHemisphere(context.userLocation);
          if (hemisphere === 'northern') {
            return {
              startDate: new Date(currentYear, 5, 21), // June 21
              endDate: new Date(currentYear, 8, 22),   // September 22
              season: 'summer',
              hemisphere: 'northern'
            };
          } else {
            return {
              startDate: new Date(currentYear, 11, 21), // December 21
              endDate: new Date(currentYear + 1, 2, 20), // March 20
              season: 'summer',
              hemisphere: 'southern'
            };
          }
        }
        
        if (raw.toLowerCase().includes('this weekend')) {
          const now = new Date();
          const daysUntilSaturday = 6 - now.getDay();
          const saturday = new Date(now);
          saturday.setDate(now.getDate() + daysUntilSaturday);
          const sunday = new Date(saturday);
          sunday.setDate(saturday.getDate() + 1);
          
          return {
            startDate: saturday,
            endDate: sunday,
            period: 'weekend'
          };
        }
        
        return { raw, parsed: false };
      }
    });

    // Spatial slot extractor
    this.slotExtractors.set('spatial', {
      extract: async (raw: string, context: ConversationContext) => {
        if (raw.toLowerCase().includes('near me')) {
          return {
            type: 'relative',
            center: context.userLocation,
            radius: 25, // km
            units: 'km'
          };
        }
        
        if (raw.toLowerCase().match(/by the (sea|ocean|coast|waterfront|beach)/)) {
          return {
            type: 'venue_feature',
            feature: 'waterfront',
            keywords: ['sea', 'ocean', 'coast', 'waterfront', 'beach', 'marina', 'harbor']
          };
        }
        
        return { raw, type: 'address' };
      }
    });

    // Quantitative slot extractor
    this.slotExtractors.set('quantitative', {
      extract: async (raw: string) => {
        const numberMatch = raw.match(/(\d+)/);
        const quantity = numberMatch ? parseInt(numberMatch[1]) : 1;
        
        let itemType = 'items';
        if (raw.includes('ticket')) {itemType = 'tickets';}
        if (raw.includes('seat')) {itemType = 'seats';}
        if (raw.includes('person')) {itemType = 'people';}
        
        return {
          quantity,
          itemType,
          raw
        };
      }
    });

    // Categorical slot extractor
    this.slotExtractors.set('categorical', {
      extract: async (raw: string) => {
        const normalized = raw.toLowerCase().trim();
        
        // Music genres
        if (normalized.includes('edm') || normalized.includes('house') || normalized.includes('electronic')) {
          return {
            category: 'music_genre',
            values: ['edm', 'house', 'electronic', 'dance'],
            primary: 'electronic'
          };
        }
        
        return {
          category: 'general',
          values: [normalized],
          primary: normalized
        };
      }
    });
  }

  /**
   * Get critical slots required for each intent type
   */
  private getCriticalSlotsForIntent(intent: string): string[] {
    switch (intent) {
      case 'buy_tickets':
        return ['time', 'location', 'quantity'];
      case 'find_products':
        return ['category', 'location'];
      case 'book_service':
        return ['service_type', 'time', 'location'];
      default:
        return [];
    }
  }

  /**
   * Generate clarification question for missing slot
   */
  private async generateClarificationQuestion(
    missingSlot: string,
    slotFrame: SlotFrame,
    context: ConversationContext
  ): Promise<ClarificationResponse> {
    const knownInfo = Object.keys(slotFrame.slots)
      .filter(key => slotFrame.slots[key].confidence > 0.6)
      .map(key => `${key}: ${slotFrame.slots[key].raw}`)
      .join(', ');

    const prompt = `Generate a natural, conversational clarification question for missing information:

Intent: ${slotFrame.intent}
Missing Slot: ${missingSlot}
Known Information: ${knownInfo}
Context: User is looking for ${slotFrame.intent.replace('_', ' ')}

Generate a single, specific question that:
1. Asks for the missing information directly
2. Provides context about what we already know
3. Offers reasonable suggestions if applicable
4. Keeps the conversation flowing naturally

Return JSON:
{
  "question": "clarification question text",
  "suggestedValues": [
    {"display": "Option 1", "value": "value1", "confidence": 0.8},
    {"display": "Option 2", "value": "value2", "confidence": 0.6}
  ],
  "priority": "high|medium|low"
}`;

    try {
      const response = await this.llm.invoke([new HumanMessage(prompt)]);
      const result = JSON.parse(response.content as string);
      
      return {
        needed: true,
        question: result.question,
        suggestedValues: result.suggestedValues || [],
        priority: result.priority || 'medium'
      };
    } catch (error) {
      logger.error('Clarification generation failed', { error });
      
      return {
        needed: true,
        question: `Could you please specify the ${missingSlot.replace('_', ' ')}?`,
        priority: 'medium'
      };
    }
  }

  // Helper methods
  
  private prioritizeMissingSlots(missingSlots: string[], intent: string): string[] {
    const priority = {
      'buy_tickets': ['time', 'quantity', 'location', 'genre'],
      'find_products': ['category', 'location', 'price_range'],
      'book_service': ['service_type', 'time', 'location']
    };
    
    const intentPriority = priority[intent as keyof typeof priority] || missingSlots;
    return missingSlots.sort((a, b) => {
      const aIndex = intentPriority.indexOf(a);
      const bIndex = intentPriority.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
  }

  private isSafeForSpeculation(action: string): boolean {
    const safeActions = [
      'navigate_', 'search_', 'filter_', 'sort_', 'view_', 'preview_', 'load_'
    ];
    return safeActions.some(safe => action.startsWith(safe));
  }

  private buildNavigationParameters(slotFrame: SlotFrame): Record<string, any> {
    const params: Record<string, any> = {};
    
    if (slotFrame.slots['genre']) {
      params['category'] = slotFrame.slots['genre'].normalized;
    }
    if (slotFrame.slots['location']) {
      params['location'] = slotFrame.slots['location'].normalized;
    }
    if (slotFrame.slots['time']) {
      params['timeRange'] = slotFrame.slots['time'].normalized;
    }
    
    return params;
  }

  private buildSearchQuery(slotFrame: SlotFrame): string {
    const terms = Object.values(slotFrame.slots)
      .filter(slot => slot.confidence > 0.6)
      .map(slot => slot.raw)
      .join(' ');
    return terms;
  }

  private getHemisphere(location?: { lat: number; lng: number }): 'northern' | 'southern' {
    return !location || location.lat >= 0 ? 'northern' : 'southern';
  }

  private createFallbackIntentResult(userInput: string): any {
    return {
      intent: 'get_information',
      confidence: 0.3,
      slots: {
        query: {
          raw: userInput,
          type: 'general'
        }
      },
      constraints: []
    };
  }

  private createFallbackSlotFrame(userInput: string, context: ConversationContext): SlotFrame {
    return {
      intent: 'get_information',
      confidence: 0.3,
      slots: {
        query: {
          raw: userInput,
          normalized: userInput,
          confidence: 1.0,
          source: 'user_input'
        }
      },
      missingSlots: [],
      resolvedSlots: ['query'],
      constraints: []
    };
  }

  private async extractSlotsFromResponse(
    userResponse: string,
    currentFrame: SlotFrame,
    context: ConversationContext
  ): Promise<Record<string, SlotValue>> {
    const newSlots: Record<string, SlotValue> = {};
    
    // Simple extraction for common responses
    if (currentFrame.missingSlots.includes('ticket_type')) {
      if (userResponse.toLowerCase().includes('vip')) {
        newSlots['ticket_type'] = {
          raw: 'VIP',
          normalized: { type: 'vip', display: 'VIP' },
          confidence: 0.9,
          source: 'user_input'
        };
      } else if (userResponse.toLowerCase().includes('standard')) {
        newSlots['ticket_type'] = {
          raw: 'Standard',
          normalized: { type: 'standard', display: 'Standard' },
          confidence: 0.9,
          source: 'user_input'
        };
      }
    }
    
    return newSlots;
  }
}

interface SlotExtractor {
  extract(raw: string, context: ConversationContext): Promise<any>;
}

// Factory function
export function createConversationFlowManager(): ConversationFlowManager {
  return new ConversationFlowManager();
}

// Export singleton instance
export const conversationFlowManager = createConversationFlowManager();