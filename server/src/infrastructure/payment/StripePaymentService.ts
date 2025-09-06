import Stripe from 'stripe';
import { createLogger } from '../../shared/utils.js';
import type { UserRepository } from '../../domain/repositories/UserRepository';
import type { TenantRepository } from '../../domain/repositories/TenantRepository';

const logger = createLogger({ service: 'stripe-payment' });

export interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
  isDefault: boolean;
}

export interface Subscription {
  id: string;
  status: string;
  plan: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

export interface Invoice {
  id: string;
  status: string;
  amount: number;
  currency: string;
  dueDate?: Date;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}

export interface CreateSubscriptionRequest {
  userId: string;
  tenantId: string;
  priceId: string;
  paymentMethodId?: string;
  trialDays?: number;
  couponId?: string;
}

export interface UpdateSubscriptionRequest {
  subscriptionId: string;
  priceId?: string;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
}

export interface PaymentServiceConfig {
  secretKey: string;
  webhookSecret: string;
  environment: 'development' | 'production';
}

export class StripePaymentService {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(
    config: PaymentServiceConfig,
    private userRepository: UserRepository,
    private tenantRepository: TenantRepository
  ) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2024-09-30.acacia',
      typescript: true,
    });
    this.webhookSecret = config.webhookSecret;

    logger.info('Stripe payment service initialized', {
      environment: config.environment,
    });
  }

  /**
   * Create or retrieve Stripe customer
   */
  async ensureCustomer(userId: string): Promise<string> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tenant = await this.tenantRepository.findById(user.tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Check if customer already exists
      if (tenant.stripeCustomerId) {
        try {
          await this.stripe.customers.retrieve(tenant.stripeCustomerId);
          return tenant.stripeCustomerId;
        } catch (error) {
          logger.warn('Stripe customer not found, creating new one', {
            customerId: tenant.stripeCustomerId,
            tenantId: tenant.id,
          });
        }
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id,
          tenantId: tenant.id,
        },
      });

      // Update tenant with customer ID
      await this.tenantRepository.update(tenant.id, {
        stripeCustomerId: customer.id,
        billingEmail: user.email,
      });

      logger.info('Stripe customer created', {
        customerId: customer.id,
        userId: user.id,
        tenantId: tenant.id,
      });

      return customer.id;
    } catch (error) {
      logger.error('Failed to ensure Stripe customer', { error, userId });
      throw error;
    }
  }

  /**
   * Create setup intent for payment method collection
   */
  async createSetupIntent(userId: string): Promise<{ clientSecret: string; setupIntentId: string }> {
    try {
      const customerId = await this.ensureCustomer(userId);

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: {
          userId,
        },
      });

      logger.info('Setup intent created', {
        setupIntentId: setupIntent.id,
        userId,
        customerId,
      });

      return {
        clientSecret: setupIntent.client_secret!,
        setupIntentId: setupIntent.id,
      };
    } catch (error) {
      logger.error('Failed to create setup intent', { error, userId });
      throw error;
    }
  }

  /**
   * Get customer payment methods
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    try {
      const customerId = await this.ensureCustomer(userId);

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
      const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method as string;

      return paymentMethods.data.map((pm: Stripe.PaymentMethod) => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expiryMonth: pm.card.exp_month,
          expiryYear: pm.card.exp_year,
        } : undefined,
        isDefault: pm.id === defaultPaymentMethodId,
      }));
    } catch (error) {
      logger.error('Failed to get payment methods', { error, userId });
      throw error;
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    try {
      const customerId = await this.ensureCustomer(userId);

      await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      logger.info('Default payment method updated', {
        userId,
        customerId,
        paymentMethodId,
      });
    } catch (error) {
      logger.error('Failed to set default payment method', { error, userId, paymentMethodId });
      throw error;
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);

      logger.info('Payment method deleted', {
        userId,
        paymentMethodId,
      });
    } catch (error) {
      logger.error('Failed to delete payment method', { error, userId, paymentMethodId });
      throw error;
    }
  }

  /**
   * Create subscription
   */
  async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
    try {
      const customerId = await this.ensureCustomer(request.userId);

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: request.priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
        metadata: {
          userId: request.userId,
          tenantId: request.tenantId,
        },
      };

      if (request.paymentMethodId) {
        subscriptionParams.default_payment_method = request.paymentMethodId;
      }

      if (request.trialDays) {
        subscriptionParams.trial_period_days = request.trialDays;
      }

      if (request.couponId) {
        subscriptionParams.coupon = request.couponId;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionParams);

      // Update tenant with subscription info
      await this.tenantRepository.update(request.tenantId, {
        stripeSubscriptionId: subscription.id,
        plan: this.getPlanFromPriceId(request.priceId) as 'free' | 'starter' | 'professional' | 'enterprise',
      });

      logger.info('Subscription created', {
        subscriptionId: subscription.id,
        userId: request.userId,
        tenantId: request.tenantId,
        priceId: request.priceId,
      });

      return this.formatSubscription(subscription);
    } catch (error) {
      logger.error('Failed to create subscription', { error, request });
      throw error;
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(request: UpdateSubscriptionRequest): Promise<Subscription> {
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {
        proration_behavior: request.prorationBehavior || 'create_prorations',
      };

      if (request.priceId) {
        const subscription = await this.stripe.subscriptions.retrieve(request.subscriptionId);
        updateParams.items = [{
          id: subscription.items.data[0].id,
          price: request.priceId,
        }];
      }

      const subscription = await this.stripe.subscriptions.update(
        request.subscriptionId,
        updateParams
      );

      logger.info('Subscription updated', {
        subscriptionId: request.subscriptionId,
        priceId: request.priceId,
      });

      return this.formatSubscription(subscription);
    } catch (error) {
      logger.error('Failed to update subscription', { error, request });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    try {
      const subscription = immediate
        ? await this.stripe.subscriptions.cancel(subscriptionId)
        : await this.stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
          });

      logger.info('Subscription cancelled', {
        subscriptionId,
        immediate,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      });

      return this.formatSubscription(subscription);
    } catch (error) {
      logger.error('Failed to cancel subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(subscriptionId: string): Promise<Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      logger.info('Subscription reactivated', { subscriptionId });
      return this.formatSubscription(subscription);
    } catch (error) {
      logger.error('Failed to reactivate subscription', { error, subscriptionId });
      throw error;
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return this.formatSubscription(subscription);
    } catch (error) {
      logger.error('Failed to get subscription', { error, subscriptionId });
      return null;
    }
  }

  /**
   * Get customer invoices
   */
  async getInvoices(userId: string, limit: number = 10): Promise<Invoice[]> {
    try {
      const customerId = await this.ensureCustomer(userId);

      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data.map((invoice: Stripe.Invoice) => ({
        id: invoice.id,
        status: invoice.status || 'unknown',
        amount: invoice.amount_due,
        currency: invoice.currency,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
        paidAt: invoice.status_transitions?.paid_at 
          ? new Date(invoice.status_transitions.paid_at * 1000) 
          : undefined,
        hostedInvoiceUrl: invoice.hosted_invoice_url || undefined,
        invoicePdf: invoice.invoice_pdf || undefined,
      }));
    } catch (error) {
      logger.error('Failed to get invoices', { error, userId });
      throw error;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(signature: string, payload: string): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      logger.info('Webhook received', { type: event.type, id: event.id });

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionEvent(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.debug('Unhandled webhook event', { type: event.type });
      }
    } catch (error) {
      logger.error('Webhook handling failed', { error, signature: signature.slice(0, 10) });
      throw error;
    }
  }

  /**
   * Handle subscription events
   */
  private async handleSubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
    try {
      const tenantId = subscription.metadata?.['tenantId'];
      if (!tenantId) {
        logger.warn('Subscription event missing tenantId', { subscriptionId: subscription.id });
        return;
      }

      const plan = this.getPlanFromSubscription(subscription) as 'free' | 'starter' | 'professional' | 'enterprise';
      
      await this.tenantRepository.update(tenantId, {
        plan,
        stripeSubscriptionId: subscription.id,
      });

      logger.info('Subscription event processed', {
        subscriptionId: subscription.id,
        tenantId,
        status: subscription.status,
        plan,
      });
    } catch (error) {
      logger.error('Failed to handle subscription event', { error, subscriptionId: subscription.id });
    }
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      const tenantId = subscription.metadata?.['tenantId'];
      if (!tenantId) {
        return;
      }

      await this.tenantRepository.update(tenantId, {
        plan: 'free',
        stripeSubscriptionId: null,
      });

      logger.info('Subscription deleted', {
        subscriptionId: subscription.id,
        tenantId,
      });
    } catch (error) {
      logger.error('Failed to handle subscription deletion', { error, subscriptionId: subscription.id });
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      const customerId = invoice.customer as string;
      const subscriptionId = invoice.subscription as string;

      logger.info('Payment succeeded', {
        invoiceId: invoice.id,
        customerId,
        subscriptionId,
        amount: invoice.amount_paid,
      });

      // Could trigger usage reset, send receipt email, etc.
    } catch (error) {
      logger.error('Failed to handle payment success', { error, invoiceId: invoice.id });
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      const customerId = invoice.customer as string;
      const subscriptionId = invoice.subscription as string;

      logger.warn('Payment failed', {
        invoiceId: invoice.id,
        customerId,
        subscriptionId,
        amount: invoice.amount_due,
      });

      // Could trigger dunning emails, account suspension, etc.
    } catch (error) {
      logger.error('Failed to handle payment failure', { error, invoiceId: invoice.id });
    }
  }

  /**
   * Format Stripe subscription for API response
   */
  private formatSubscription(subscription: Stripe.Subscription): Subscription {
    const result: Subscription = {
      id: subscription.id,
      status: subscription.status,
      plan: this.getPlanFromSubscription(subscription),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };

    if (subscription.trial_end) {
      result.trialEnd = new Date(subscription.trial_end * 1000);
    }

    return result;
  }

  /**
   * Get plan name from Stripe price ID
   */
  private getPlanFromPriceId(priceId: string): string {
    // Map price IDs to plan names
    const planMapping: Record<string, string> = {
      'price_basic': 'basic',
      'price_pro': 'pro',
      'price_enterprise': 'enterprise',
    };

    return planMapping[priceId] || 'free';
  }

  /**
   * Get plan name from subscription
   */
  private getPlanFromSubscription(subscription: Stripe.Subscription): string {
    const priceId = subscription.items.data[0]?.price?.id;
    return priceId ? this.getPlanFromPriceId(priceId) : 'free';
  }
}

/**
 * Create payment service factory
 */
export function createStripePaymentService(
  userRepository: UserRepository,
  tenantRepository: TenantRepository
): StripePaymentService | null {
  const secretKey = process.env['STRIPE_SECRET_KEY'];
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  const environment = process.env['NODE_ENV'] as 'development' | 'production';

  if (!secretKey) {
    logger.warn('Stripe secret key not configured, payment service disabled');
    return null;
  }

  if (!webhookSecret) {
    logger.warn('Stripe webhook secret not configured, webhooks will not work');
  }

  const config: PaymentServiceConfig = {
    secretKey,
    webhookSecret: webhookSecret || '',
    environment: environment || 'development',
  };

  return new StripePaymentService(config, userRepository, tenantRepository);
}