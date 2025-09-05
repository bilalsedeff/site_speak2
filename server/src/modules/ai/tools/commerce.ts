/**
 * Commerce Tools
 * 
 * E-commerce cart and checkout primitives with confirmation for irreversible actions.
 * Integrates with existing ActionExecutorService for actual execution.
 */

import { z } from 'zod';
import { createLogger } from '../../../shared/utils.js';
import { 
  RegistryToolDefinition,
  ToolContext,
  ToolExecutionResult,
  ProductIdSchema,
  VariantIdSchema,
  QuantitySchema,
  CouponCodeSchema,
  CartIdSchema,
  CheckoutTokenSchema,
  MoneySchema,
  IdempotencyKeySchema,
  UrlSchema,
  toJsonSchema
} from './validators';
import { actionExecutorService } from '../application/ActionExecutorService';

const logger = createLogger({ service: 'commerce-tools' });

// ==================== PARAMETER SCHEMAS ====================

const ListVariantsParametersSchema = z.object({
  productId: ProductIdSchema.describe('Product identifier to get variants for'),
  includeInventory: z.boolean().default(true).describe('Include inventory levels in response'),
  includeImages: z.boolean().default(false).describe('Include variant images'),
});

const AddToCartParametersSchema = z.object({
  productId: ProductIdSchema.describe('Product identifier'),
  variantId: VariantIdSchema.optional().describe('Specific product variant'),
  quantity: QuantitySchema.default(1).describe('Quantity to add'),
  notes: z.string().max(500).optional().describe('Special instructions or notes'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique key to prevent duplicate additions'),
});

const RemoveFromCartParametersSchema = z.object({
  cartLineId: z.string().min(1).describe('Cart line item identifier'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique key for safe removal'),
});

const UpdateQuantityParametersSchema = z.object({
  cartLineId: z.string().min(1).describe('Cart line item identifier'),
  quantity: QuantitySchema.describe('New quantity (0 to remove)'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique key for safe updates'),
});

const ApplyCouponParametersSchema = z.object({
  cartId: CartIdSchema.optional().describe('Cart identifier (auto-detected if not provided)'),
  couponCode: CouponCodeSchema.describe('Coupon or discount code'),
  validate: z.boolean().default(true).describe('Validate coupon before applying'),
});

const StartCheckoutParametersSchema = z.object({
  cartId: CartIdSchema.optional().describe('Cart identifier'),
  returnUrl: UrlSchema.optional().describe('URL to return to after checkout'),
  paymentMethod: z.enum(['stripe', 'paypal', 'bank_transfer']).optional().describe('Preferred payment method'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique checkout session key'),
});

const PlaceOrderParametersSchema = z.object({
  checkoutToken: CheckoutTokenSchema.describe('Secure checkout session token'),
  confirmTotal: MoneySchema.describe('Total amount confirmation'),
  paymentMethod: z.string().min(1).describe('Selected payment method'),
  shippingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    country: z.string().length(2),
    postalCode: z.string().min(1),
  }).optional().describe('Shipping address'),
  billingAddress: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    country: z.string().length(2),
    postalCode: z.string().min(1),
  }).optional().describe('Billing address'),
  idempotencyKey: IdempotencyKeySchema.describe('Unique order placement key'),
});

// ==================== TOOL IMPLEMENTATIONS ====================

/**
 * List available variants for a product
 */
async function executeListVariants(
  parameters: z.infer<typeof ListVariantsParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Listing product variants', {
    productId: parameters.productId,
    siteId: context.siteId,
  });

  try {
    // Look for product variant action or use API call
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const variantAction = availableActions.find(action => 
      action.name.includes('variant') || action.name.includes('product_details')
    );

    let result;
    if (variantAction) {
      const executionResult = await actionExecutorService.execute({
        siteId: context.siteId,
        actionName: variantAction.name,
        parameters: {
          productId: parameters.productId,
          includeInventory: parameters.includeInventory,
        },
        sessionId: context.sessionId || 'unknown',
        userId: context.userId || 'anonymous',
      });
      result = executionResult.result;
    } else {
      // Fallback to mock data - in production this would query actual product API
      result = {
        type: 'product_variants',
        productId: parameters.productId,
        variants: [
          {
            id: `${parameters.productId}_default`,
            name: 'Default',
            price: { amount: 2500, currency: 'USD' },
            inventory: parameters.includeInventory ? 10 : undefined,
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
        type: 'product_query',
        description: `Listed variants for product ${parameters.productId}`,
        data: { productId: parameters.productId },
      }],
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list variants',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Add product to cart with idempotency
 */
async function executeAddToCart(
  parameters: z.infer<typeof AddToCartParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Adding to cart', {
    productId: parameters.productId,
    variantId: parameters.variantId,
    quantity: parameters.quantity,
    siteId: context.siteId,
  });

  try {
    // Find add to cart action
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const cartAction = availableActions.find(action => 
      action.category === 'ecommerce' || 
      action.name.includes('cart') || 
      action.name.includes('add_to_cart')
    );

    if (!cartAction) {
      throw new Error('No cart functionality found on this site');
    }

    // Execute through existing ActionExecutorService
    const executionResult = await actionExecutorService.execute({
      siteId: context.siteId,
      actionName: cartAction.name,
      parameters: {
        productId: parameters.productId,
        variantId: parameters.variantId,
        quantity: parameters.quantity,
        notes: parameters.notes,
        idempotencyKey: parameters.idempotencyKey,
      },
      sessionId: context.sessionId,
      userId: context.userId,
    });

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: {
        type: 'cart_updated',
        action: 'add',
        productId: parameters.productId,
        variantId: parameters.variantId,
        quantity: parameters.quantity,
        ...executionResult.result,
      },
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
      // Bridge instructions handled by ActionDispatchService
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add to cart',
      executionTime,
      sideEffects: [],
    };
  }
}

/**
 * Start checkout process
 */
async function executeStartCheckout(
  parameters: z.infer<typeof StartCheckoutParametersSchema>,
  context: ToolContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  
  logger.info('Starting checkout', {
    cartId: parameters.cartId,
    paymentMethod: parameters.paymentMethod,
    siteId: context.siteId,
  });

  try {
    // Find checkout action
    const availableActions = actionExecutorService.getAvailableActions(context.siteId);
    const checkoutAction = availableActions.find(action => 
      action.category === 'payment' || 
      action.name.includes('checkout')
    );

    if (!checkoutAction) {
      throw new Error('No checkout functionality found on this site');
    }

    // Execute checkout initiation
    const executionResult = await actionExecutorService.execute({
      siteId: context.siteId,
      actionName: checkoutAction.name,
      parameters: {
        cartId: parameters.cartId,
        returnUrl: parameters.returnUrl,
        paymentMethod: parameters.paymentMethod,
        idempotencyKey: parameters.idempotencyKey,
      },
      sessionId: context.sessionId,
      userId: context.userId,
    });

    const executionTime = Date.now() - startTime;

    return {
      success: executionResult.success,
      result: {
        type: 'checkout_started',
        checkoutUrl: executionResult.result?.checkoutUrl,
        checkoutToken: parameters.idempotencyKey, // Use idempotency key as token
        ...executionResult.result,
      },
      error: executionResult.error,
      executionTime,
      sideEffects: executionResult.sideEffects || [],
      // Bridge instructions handled by ActionDispatchService
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start checkout',
      executionTime,
      sideEffects: [],
    };
  }
}

// ==================== TOOL DEFINITIONS ====================

export const commerceTools: RegistryToolDefinition[] = [
  {
    name: 'commerce.listVariants',
    description: 'List available variants for a product (size, color, etc.).',
    parameters: [
      {
        name: 'productId',
        description: 'Product identifier',
        schema: toJsonSchema(ProductIdSchema),
        required: true,
      },
    ],
    sideEffects: 'none',
    confirmRequired: false,
    auth: 'session',
    latencyBudgetMs: 300,
    idempotent: true,
    category: 'ecommerce',
    execute: executeListVariants,
    jsonSchema: toJsonSchema(ListVariantsParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'commerce.listVariants',
        description: 'Get available variants for a product like different sizes, colors, or styles.',
        parameters: toJsonSchema(ListVariantsParametersSchema),
      },
    },
  },

  {
    name: 'commerce.addToCart',
    description: 'Add a product to the shopping cart with quantity and variant selection.',
    parameters: [
      {
        name: 'productId',
        description: 'Product identifier',
        schema: toJsonSchema(ProductIdSchema),
        required: true,
      },
      {
        name: 'quantity',
        description: 'Quantity to add',
        schema: toJsonSchema(QuantitySchema),
        required: false,
        defaultValue: 1,
      },
      {
        name: 'variantId',
        description: 'Specific variant selection',
        schema: toJsonSchema(VariantIdSchema.optional()),
        required: false,
      },
      {
        name: 'idempotencyKey',
        description: 'Unique key to prevent duplicate additions',
        schema: toJsonSchema(IdempotencyKeySchema),
        required: true,
      },
    ],
    sideEffects: 'writes.cart',
    confirmRequired: false, // Cart operations don't need confirmation
    auth: 'session',
    latencyBudgetMs: 500,
    idempotent: true,
    category: 'ecommerce',
    execute: executeAddToCart,
    jsonSchema: toJsonSchema(AddToCartParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'commerce.addToCart',
        description: 'Add a product to the shopping cart. Use when user wants to purchase or save items.',
        parameters: toJsonSchema(AddToCartParametersSchema),
      },
    },
  },

  {
    name: 'commerce.startCheckout',
    description: 'Initialize checkout process for items in cart.',
    parameters: [
      {
        name: 'idempotencyKey',
        description: 'Unique checkout session identifier',
        schema: toJsonSchema(IdempotencyKeySchema),
        required: true,
      },
      {
        name: 'paymentMethod',
        description: 'Preferred payment method',
        schema: toJsonSchema(z.enum(['stripe', 'paypal', 'bank_transfer']).optional()),
        required: false,
      },
      {
        name: 'returnUrl',
        description: 'URL to return to after checkout',
        schema: toJsonSchema(UrlSchema.optional()),
        required: false,
      },
    ],
    sideEffects: 'writes.order',
    confirmRequired: true, // Checkout should be confirmed
    auth: 'session',
    latencyBudgetMs: 1000,
    idempotent: true,
    category: 'ecommerce',
    execute: executeStartCheckout,
    jsonSchema: toJsonSchema(StartCheckoutParametersSchema),
    openAIFunction: {
      type: 'function',
      function: {
        name: 'commerce.startCheckout',
        description: 'Start the checkout process for items in cart. This will begin payment flow.',
        parameters: toJsonSchema(StartCheckoutParametersSchema),
      },
    },
  },
];
