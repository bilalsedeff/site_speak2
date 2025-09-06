import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../../shared/utils.js';
import { createStripePaymentService } from '../../../infrastructure/payment/StripePaymentService.js';
import { UserRepositoryImpl } from '../../../infrastructure/repositories/UserRepositoryImpl.js';
import { TenantRepositoryImpl } from '../../../infrastructure/repositories/TenantRepositoryImpl.js';
import { db } from '../../../infrastructure/database/index.js';

const logger = createLogger({ service: 'payment-controller' });

// Initialize repositories and payment service
const userRepository = new UserRepositoryImpl(db);
const tenantRepository = new TenantRepositoryImpl(db);
const paymentService = createStripePaymentService(userRepository, tenantRepository);

export class PaymentController {
  /**
   * Create setup intent for payment method collection
   */
  async createSetupIntent(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const result = await paymentService.createSetupIntent(user.id);

      logger.info('Setup intent created', {
        userId: user.id,
        setupIntentId: result.setupIntentId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Create setup intent failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const paymentMethods = await paymentService.getPaymentMethods(user.id);

      res.json({
        success: true,
        data: paymentMethods,
      });
    } catch (error) {
      logger.error('Get payment methods failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const { paymentMethodId } = req.body;

      if (!paymentMethodId) {
        return res.status(400).json({
          success: false,
          error: 'Payment method ID is required',
          code: 'MISSING_PAYMENT_METHOD_ID',
        });
      }

      await paymentService.setDefaultPaymentMethod(user.id, paymentMethodId);

      logger.info('Default payment method set', {
        userId: user.id,
        paymentMethodId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Default payment method updated',
      });
    } catch (error) {
      logger.error('Set default payment method failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const { paymentMethodId } = req.params;

      if (!paymentMethodId) {
        return res.status(400).json({
          success: false,
          error: 'Payment method ID is required',
          code: 'MISSING_PAYMENT_METHOD_ID',
        });
      }

      await paymentService.deletePaymentMethod(user.id, paymentMethodId);

      logger.info('Payment method deleted', {
        userId: user.id,
        paymentMethodId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        message: 'Payment method deleted',
      });
    } catch (error) {
      logger.error('Delete payment method failed', {
        error,
        userId: req.user?.id,
        paymentMethodId: req.params['paymentMethodId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Create subscription
   */
  async createSubscription(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const { priceId, paymentMethodId, trialDays, couponId } = req.body;

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: 'Price ID is required',
          code: 'MISSING_PRICE_ID',
        });
      }

      const subscription = await paymentService.createSubscription({
        userId: user.id,
        tenantId: user.tenantId,
        priceId,
        paymentMethodId,
        trialDays,
        couponId,
      });

      logger.info('Subscription created', {
        userId: user.id,
        tenantId: user.tenantId,
        subscriptionId: subscription.id,
        priceId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription created successfully',
      });
    } catch (error) {
      logger.error('Create subscription failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Update subscription
   */
  async updateSubscription(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const { subscriptionId } = req.params;
      const { priceId, prorationBehavior } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
          code: 'MISSING_SUBSCRIPTION_ID',
        });
      }

      const subscription = await paymentService.updateSubscription({
        subscriptionId,
        priceId,
        prorationBehavior,
      });

      logger.info('Subscription updated', {
        userId: req.user?.id,
        subscriptionId,
        priceId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription updated successfully',
      });
    } catch (error) {
      logger.error('Update subscription failed', {
        error,
        subscriptionId: req.params['subscriptionId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const { subscriptionId } = req.params;
      const { immediate } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
          code: 'MISSING_SUBSCRIPTION_ID',
        });
      }

      const subscription = await paymentService.cancelSubscription(subscriptionId, immediate);

      logger.info('Subscription cancelled', {
        userId: req.user?.id,
        subscriptionId,
        immediate,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: subscription,
        message: immediate ? 'Subscription cancelled immediately' : 'Subscription will cancel at period end',
      });
    } catch (error) {
      logger.error('Cancel subscription failed', {
        error,
        subscriptionId: req.params['subscriptionId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const { subscriptionId } = req.params;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
          code: 'MISSING_SUBSCRIPTION_ID',
        });
      }

      const subscription = await paymentService.reactivateSubscription(subscriptionId);

      logger.info('Subscription reactivated', {
        userId: req.user?.id,
        subscriptionId,
        correlationId: req.correlationId,
      });

      res.json({
        success: true,
        data: subscription,
        message: 'Subscription reactivated successfully',
      });
    } catch (error) {
      logger.error('Reactivate subscription failed', {
        error,
        subscriptionId: req.params['subscriptionId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const { subscriptionId } = req.params;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
          code: 'MISSING_SUBSCRIPTION_ID',
        });
      }

      const subscription = await paymentService.getSubscription(subscriptionId);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found',
          code: 'SUBSCRIPTION_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: subscription,
      });
    } catch (error) {
      logger.error('Get subscription failed', {
        error,
        subscriptionId: req.params['subscriptionId'],
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Get invoices
   */
  async getInvoices(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      const user = req.user!;
      const limit = parseInt(req.query['limit'] as string) || 10;

      const invoices = await paymentService.getInvoices(user.id, limit);

      res.json({
        success: true,
        data: invoices,
      });
    } catch (error) {
      logger.error('Get invoices failed', {
        error,
        userId: req.user?.id,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleWebhook(req: Request, res: Response, _next: NextFunction): Promise<void | Response> {
    try {
      if (!paymentService) {
        logger.warn('Webhook received but payment service not available');
        return res.status(503).json({
          success: false,
          error: 'Payment service not available',
        });
      }

      const signature = req.headers['stripe-signature'] as string;
      const payload = req.body;

      if (!signature) {
        logger.warn('Webhook received without signature');
        return res.status(400).json({
          success: false,
          error: 'Missing stripe signature',
        });
      }

      await paymentService.handleWebhook(signature, payload);

      logger.info('Webhook processed successfully', {
        signature: signature.slice(0, 10),
        correlationId: req.correlationId,
      });

      res.json({ received: true });
    } catch (error) {
      logger.error('Webhook processing failed', {
        error,
        signature: req.headers['stripe-signature'],
        correlationId: req.correlationId,
      });

      // For webhooks, we should return 200 even on error to prevent retries
      // unless it's a signature verification error
      if (error instanceof Error && error.message.includes('signature')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signature',
        });
      }

      res.status(200).json({ received: false });
    }
  }

  /**
   * Get billing health status
   */
  async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    try {
      const status = {
        service: 'billing',
        available: !!paymentService,
        timestamp: new Date().toISOString(),
        stripe: {
          configured: !!process.env['STRIPE_SECRET_KEY'],
          webhookConfigured: !!process.env['STRIPE_WEBHOOK_SECRET'],
        },
      };

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Billing health check failed', {
        error,
        correlationId: req.correlationId,
      });
      next(error);
    }
  }
}