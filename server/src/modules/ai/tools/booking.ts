/**
 * Booking Tools
 * 
 * Time slots, availability checking, holds, and reservation management.
 * Uses RFC 3339 timestamps and ISO 8601 durations for time handling.
 */

import { z } from 'zod';
import { createLogger } from '../../../../shared/utils';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  ResourceIdSchema,
  SlotIdSchema,
  PartySizeSchema,
  Rfc3339DateTimeSchema,
  IsoIntervalSchema,
  EmailSchema,
  PhoneSchema,
  IdempotencyKeySchema,
  toJsonSchema
} from './validators';
import { actionExecutorService } from '../application/ActionExecutorService';

const logger = createLogger({ service: 'booking-tools' });

// ==================== PARAMETER SCHEMAS ====================

const SearchSlotsParametersSchema = z.object({
  resourceId: ResourceIdSchema.optional().describe('Specific resource to search (room, table, service)'),
  interval: IsoIntervalSchema.optional().describe('Time window to search within'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Specific date (YYYY-MM-DD)'),
  duration: z.string().regex(/^PT(\d+H)?(\d+M)?$/).optional().describe('Required duration (ISO 8601, e.g., PT2H, PT90M)'),
  partySize: PartySizeSchema.optional().describe('Number of people'),
  serviceType: z.string().optional().describe('Type of service or booking category'),
});

const HoldSlotParametersSchema = z.object({
  slotId: SlotIdSchema.describe('Time slot identifier to hold'),
  customer: z.object({
    name: z.string().min(1).max(100),
    email: EmailSchema,
    phone: PhoneSchema.optional(),
  }).describe('Customer information for the hold'),
  duration: z.string().regex(/^PT(\d+M)$/).default('PT15M').describe('Hold duration (ISO 8601, e.g., PT15M)'),
  notes: z.string().max(500).optional().describe('Special requests or notes'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique hold identifier'),
});

const BookSlotParametersSchema = z.object({
  slotId: SlotIdSchema.describe('Time slot identifier to book'),
  customer: z.object({
    name: z.string().min(1).max(100),
    email: EmailSchema,
    phone: PhoneSchema.optional(),
    specialRequests: z.string().max(500).optional(),
  }).describe('Customer details'),
  paymentToken: z.string().optional().describe('Payment authorization token'),
  notes: z.string().max(1000).optional().describe('Booking notes or special requests'),
  confirmationRequired: z.boolean().default(true).describe('Whether booking requires confirmation'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique booking identifier'),
});

const CancelBookingParametersSchema = z.object({
  bookingId: z.string().min(1).describe('Booking identifier to cancel'),
  reason: z.string().max(500).optional().describe('Cancellation reason'),
  refundRequested: z.boolean().default(false).describe('Request refund if applicable'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique cancellation identifier'),
});

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * Search for available time slots
 */
async function executeSearchSlots(
  parameters: z.infer<typeof SearchSlotsParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Searching available slots', {
    resourceId: parameters.resourceId,
    date: parameters.date,
    partySize: parameters.partySize,
    siteId: context.siteId,
  });

  try {
    // Look for booking-related actions
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const bookingAction = availableActions.find(action => 
      action.category === 'booking' || 
      action.name.includes('booking') ||
      action.name.includes('schedule')
    );

    let result;
    if (bookingAction) {
      const executionResult = await actionExecutorService.execute({
        siteId: context.siteId,
        actionName: bookingAction.name,
        parameters: {
          action: 'search_slots',
          resourceId: parameters.resourceId,
          date: parameters.date,
          duration: parameters.duration,
          partySize: parameters.partySize,
        },
        sessionId: context.sessionId || 'unknown',
        userId: context.userId || 'anonymous',
      });
      result = executionResult.result;
    } else {
      // Mock response for demo - in production would query actual booking system
      result = {
        type: 'available_slots',
        date: parameters.date,
        slots: [
          {
            id: `slot_${Date.now()}`,
            startTime: '09:00',
            endTime: '10:00',
            available: true,
            price: { amount: 5000, currency: 'USD' },
          },
          {
            id: `slot_${Date.now() + 1}`,
            startTime: '14:00', 
            endTime: '15:00',
            available: true,
            price: { amount: 5000, currency: 'USD' },
          },
        ],
      };
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result,
      executionTime,
      sideEffects: [{
        type: 'availability_check',
        description: `Searched slots for ${parameters.date || 'available dates'}`,
        data: {
          resourceId: parameters.resourceId,
          partySize: parameters.partySize,
        },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Slot search failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Hold a time slot temporarily
 */
async function executeHoldSlot(
  parameters: z.infer<typeof HoldSlotParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Holding slot', {
    slotId: parameters.slotId,
    customerEmail: parameters.customer.email,
    duration: parameters.duration,
    siteId: context.siteId,
  });

  try {
    // Hold is typically a temporary reservation - no confirmation needed
    const result = {
      type: 'slot_held',
      slotId: parameters.slotId,
      holdId: parameters.idempotencyKey,
      customer: parameters.customer,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes default
      message: `Slot held for ${parameters.customer.name} until completion of booking process`,
    };

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      result,
      executionTime,
      sideEffects: [{
        type: 'slot_held',
        description: `Held slot ${parameters.slotId} for ${parameters.customer.name}`,
        data: {
          slotId: parameters.slotId,
          customerEmail: parameters.customer.email,
          duration: parameters.duration,
        },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Slot hold failed',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Book a time slot permanently
 */
async function executeBookSlot(
  parameters: z.infer<typeof BookSlotParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Booking slot', {
    slotId: parameters.slotId,
    customerEmail: parameters.customer.email,
    hasPaymentToken: !!parameters.paymentToken,
    siteId: context.siteId,
  });

  try {
    // Find booking action
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const bookingAction = availableActions.find(action => 
      action.category === 'booking' || 
      action.name.includes('book') ||
      action.name.includes('reserve')
    );

    if (!bookingAction) {
      throw new Error('No booking functionality found on this site');
    }

    // Execute booking through ActionExecutorService
    const executionResult = await actionExecutorService.execute({
      siteId: context.siteId,
      actionName: bookingAction.name,
      parameters: {
        slotId: parameters.slotId,
        customerName: parameters.customer.name,
        customerEmail: parameters.customer.email,
        customerPhone: parameters.customer.phone,
        paymentToken: parameters.paymentToken,
        notes: parameters.notes,
        specialRequests: parameters.customer.specialRequests,
        idempotencyKey: parameters.idempotencyKey,
      },
      sessionId: context.sessionId,
      userId: context.userId,
    });

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: {
        type: 'booking_confirmed',
        bookingId: parameters.idempotencyKey,
        slotId: parameters.slotId,
        customer: parameters.customer,
        ...executionResult.result,
      },
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
      bridgeInstructions: executionResult.bridgeInstructions ? {
        type: executionResult.bridgeInstructions.type as any,
        payload: executionResult.bridgeInstructions.payload,
      } : undefined,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Booking failed',
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const bookingTools: RegistryToolDefinition[] = [
  {
    name: 'booking.searchSlots',
    description: 'Search for available time slots for booking.',
    parameters: [
      {
        name: 'date',
        description: 'Date to search for slots (YYYY-MM-DD)',
        schema: toJsonSchema(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        required: false,
      },
      {
        name: 'partySize',
        description: 'Number of people',
        schema: toJsonSchema(PartySizeSchema.optional()),
        required: false,
      },
      {
        name: 'serviceType',
        description: 'Type of service to book',
        schema: toJsonSchema(z.string().optional()),
        required: false,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 400,
    idempotent: true,
    category: 'booking',
    execute: executeSearchSlots,
    jsonSchema: toJsonSchema(SearchSlotsParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'booking.searchSlots',
        description: 'Find available time slots for booking appointments or reservations.',
        parameters: toJsonSchema(SearchSlotsParametersSchema),
      },
    },
  },

  {
    name: 'booking.holdSlot',
    description: 'Temporarily hold a time slot while completing booking details.',
    parameters: [
      {
        name: 'slotId',
        description: 'Time slot identifier to hold',
        schema: toJsonSchema(SlotIdSchema),
        required: true,
      },
      {
        name: 'customer',
        description: 'Customer information',
        schema: toJsonSchema(z.object({
          name: z.string().min(1),
          email: EmailSchema,
          phone: PhoneSchema.optional(),
        })),
        required: true,
      },
      {
        name: 'idempotencyKey',
        description: 'Unique hold identifier',
        schema: toJsonSchema(IdempotencyKeySchema),
        required: true,
      },
    ],
    sideEffects: 'writes.booking',
    confirmRequired: false, // Holds are temporary
    auth: 'session',
    latencyBudgetMs: 300,
    idempotent: true,
    category: 'booking',
    execute: executeHoldSlot,
    jsonSchema: toJsonSchema(HoldSlotParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'booking.holdSlot',
        description: 'Temporarily hold a time slot. Use this to reserve a slot while gathering additional booking details.',
        parameters: toJsonSchema(HoldSlotParametersSchema),
      },
    },
  },

  {
    name: 'booking.bookSlot',
    description: 'Permanently book a time slot with customer details.',
    parameters: [
      {
        name: 'slotId',
        description: 'Time slot identifier to book',
        schema: toJsonSchema(SlotIdSchema),
        required: true,
      },
      {
        name: 'customer',
        description: 'Complete customer information',
        schema: toJsonSchema(z.object({
          name: z.string().min(1),
          email: EmailSchema,
          phone: PhoneSchema.optional(),
          specialRequests: z.string().optional(),
        })),
        required: true,
      },
      {
        name: 'idempotencyKey',
        description: 'Unique booking identifier',
        schema: toJsonSchema(IdempotencyKeySchema),
        required: true,
      },
    ],
    sideEffects: 'writes.booking',
    confirmRequired: true, // Bookings require confirmation
    auth: 'session',
    latencyBudgetMs: 1500,
    idempotent: true,
    category: 'booking',
    execute: executeBookSlot,
    jsonSchema: toJsonSchema(BookSlotParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'booking.bookSlot',
        description: 'Permanently book a time slot. This will confirm the reservation and may trigger payment.',
        parameters: toJsonSchema(BookSlotParametersSchema),
      },
    },
  },
];
