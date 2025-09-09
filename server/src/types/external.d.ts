/**
 * Type declarations for optional external dependencies
 */

declare module 'stripe' {
  interface Stripe {
    customers: {
      create(params: any): Promise<any>;
      retrieve(id: string): Promise<any>;
      update(id: string, params: any): Promise<any>;
    };
    paymentMethods: {
      list(params: any): Promise<any>;
      detach(id: string): Promise<any>;
    };
    subscriptions: {
      create(params: any): Promise<any>;
      retrieve(id: string): Promise<any>;
      update(id: string, params: any): Promise<any>;
      cancel(id: string): Promise<any>;
    };
    invoices: {
      list(params: any): Promise<any>;
    };
    setupIntents: {
      create(params: any): Promise<any>;
    };
    webhooks: {
      constructEvent(payload: string, sig: string, secret: string): any;
    };
  }

  interface StripeConstructorOptions {
    apiVersion?: string;
    typescript?: boolean;
  }

  declare class Stripe {
    constructor(secretKey: string, options?: StripeConstructorOptions);
    customers: Stripe['customers'];
    paymentMethods: Stripe['paymentMethods'];
    subscriptions: Stripe['subscriptions'];
    invoices: Stripe['invoices'];
    setupIntents: Stripe['setupIntents'];
    webhooks: Stripe['webhooks'];
  }

  namespace Stripe {
    interface SubscriptionCreateParams {
      customer: string;
      items: Array<{ price: string }>;
      payment_behavior?: string;
      payment_settings?: { save_default_payment_method: string };
      expand?: string[];
      metadata?: Record<string, string>;
      default_payment_method?: string;
      trial_period_days?: number;
      coupon?: string;
    }

    interface SubscriptionUpdateParams {
      proration_behavior?: string;
      items?: Array<{ id: string; price: string }>;
    }
    interface Customer {
      id: string;
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
      invoice_settings?: {
        default_payment_method?: string;
      };
    }

    interface PaymentMethod {
      id: string;
      type: string;
      card?: {
        brand: string;
        last4: string;
        exp_month: number;
        exp_year: number;
      };
    }

    interface Subscription {
      id: string;
      status: string;
      items: {
        data: Array<{
          id: string;
          price: {
            id: string;
          };
        }>;
      };
      current_period_start: number;
      current_period_end: number;
      cancel_at_period_end: boolean;
      trial_end?: number;
      metadata?: Record<string, string>;
    }

    interface Invoice {
      id: string;
      status?: string;
      amount_due: number;
      amount_paid: number;
      currency: string;
      customer?: string;
      subscription?: string;
      due_date?: number;
      hosted_invoice_url?: string;
      invoice_pdf?: string;
      status_transitions?: {
        paid_at?: number;
      };
    }

    interface SetupIntent {
      id: string;
      client_secret?: string;
    }

    interface Event {
      id: string;
      type: string;
      data: {
        object: any;
      };
    }
  }

  export = Stripe;
}

declare module '@discordjs/opus' {
  export class OpusEncoder {
    constructor(sampleRate: number, channels: number);

    encode(buffer: Int16Array): Buffer;
    applyEncoderCTL(ctl: number, value: number): void;
  }
}

declare module '@wasm-codecs/opus' {
  export class OpusEncoder {
    static create(options: {
      sampleRate: number;
      channelCount: number;
      application: string;
      bitrate: number;
      complexity: number;
      frameSize: number;
    }): Promise<OpusEncoder>;

    encode(buffer: Int16Array): Buffer;
    encodeFloat(buffer: Float32Array): Buffer;
    cleanup(): Promise<void>;
  }
}

declare module 'opus-media-recorder' {
  export default class OpusMediaRecorder {
    constructor(stream: MediaStream, options?: {
      mimeType?: string;
      audioBitsPerSecond?: number;
    });
    
    start(): void;
    stop(): void;
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
  }
}