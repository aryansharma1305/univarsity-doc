import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RAZORPAY_BUTTONS } from '@docversity/validation';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { Errors } from '../common/app-error.js';

const fixtureSchema = z
  .object({
    mode: z.literal('TEST'),
    merchantId: z.string().regex(/^acc_[A-Za-z0-9]{1,50}$/),
    webhookSecret: z.string().min(32).max(256),
    registrationIds: z.array(z.uuid()).min(1),
    reExamTestButtonId: z
      .string()
      .regex(/^pl_[A-Za-z0-9]{1,50}$/)
      .refine((id) => !Object.values(RAZORPAY_BUTTONS).some((button) => button.id === id)),
  })
  .strict();
@Injectable()
export class PaymentButtonPolicyService {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}
  // No environment variable or deployed reviewer setting can activate real transactions.
  definition(): unknown {
    return null;
  }
  fixture() {
    const value = fixtureSchema.safeParse(this.definition());
    return this.config.NODE_ENV === 'test' && value.success ? value.data : null;
  }
  requireFixture() {
    const fixture = this.fixture();
    if (!fixture) throw Errors.notFound();
    return fixture;
  }
}
