import { Inject, Injectable } from '@nestjs/common';
import {
  RazorpayApiError,
  RazorpayClient,
  fetchRazorpayPort,
  type RazorpayHttpPort,
} from '@docversity/payments';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { Errors } from '../common/app-error.js';

export interface RazorpayPolicy {
  mode: 'TEST';
  merchantId: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  registrationIds: readonly string[];
}

/**
 * Razorpay settings come only from validated runtime configuration (api-config.ts). Nothing in code
 * holds a secret. `off` (the default) yields no policy, so every Razorpay route answers 404; `live`
 * never reaches here because the configuration refuses to start without a reviewed approval.
 */
export function razorpayPolicy(config: ApiConfig): RazorpayPolicy | null {
  const {
    PAYMENTS_RAZORPAY_MODE: mode,
    RAZORPAY_ACCOUNT_ID: merchantId,
    RAZORPAY_KEY_ID: keyId,
    RAZORPAY_KEY_SECRET: keySecret,
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    PAYMENTS_TEST_REGISTRATION_ALLOWLIST: registrationIds,
  } = config;
  if (
    mode !== 'test' ||
    !merchantId ||
    !keyId?.startsWith('rzp_test_') ||
    !keySecret ||
    !webhookSecret
  )
    return null;
  if (registrationIds.length === 0) return null;
  return { mode: 'TEST', merchantId, keyId, keySecret, webhookSecret, registrationIds };
}

/** Network access for the Razorpay client. Tests replace it with a fake; `off` never calls out. */
export const RAZORPAY_HTTP_PORT = Symbol('RAZORPAY_HTTP_PORT');
export function razorpayHttpPort(config: ApiConfig): RazorpayHttpPort {
  return config.PAYMENTS_RAZORPAY_MODE === 'off'
    ? () => Promise.reject(new RazorpayApiError('UNAVAILABLE'))
    : fetchRazorpayPort();
}

@Injectable()
export class PaymentButtonPolicyService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  fixture(): RazorpayPolicy | null {
    return razorpayPolicy(this.config);
  }
  requireFixture(): RazorpayPolicy {
    const fixture = this.fixture();
    if (!fixture) throw Errors.notFound();
    return fixture;
  }
}

@Injectable()
export class RazorpayGatewayService {
  constructor(
    private readonly policy: PaymentButtonPolicyService,
    @Inject(RAZORPAY_HTTP_PORT) private readonly port: RazorpayHttpPort,
  ) {}
  client(): RazorpayClient {
    const policy = this.policy.requireFixture();
    return new RazorpayClient(policy.keyId, policy.keySecret, this.port);
  }
}
