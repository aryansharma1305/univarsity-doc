import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PaymentButtonsService } from './payment-buttons.service.js';
import { PaymentButtonPolicyService } from './payment-button-policy.service.js';
import {
  PaymentButtonsController,
  StudentPaymentButtonsController,
  RazorpayWebhookController,
} from './payment-buttons.controller.js';
@Module({
  controllers: [
    PaymentButtonsController,
    StudentPaymentButtonsController,
    RazorpayWebhookController,
  ],
  providers: [PaymentButtonsService, PaymentButtonPolicyService],
})
export class PaymentButtonsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(
        PaymentButtonsController,
        StudentPaymentButtonsController,
        RazorpayWebhookController,
      );
  }
}
