import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PaymentButtonsService } from './payment-buttons.service.js';
import {
  PaymentButtonPolicyService,
  RAZORPAY_HTTP_PORT,
  RazorpayGatewayService,
  razorpayHttpPort,
} from './payment-button-policy.service.js';
import { RazorpayOrdersService } from './razorpay-orders.service.js';
import { RazorpayReconciliationService } from './razorpay-reconciliation.service.js';
import { PaymentAlertsService } from './payment-alerts.service.js';
import { API_CONFIG } from '../config/api-config.js';
import {
  PaymentButtonsController,
  StudentRazorpayOrdersController,
  StudentPaymentButtonsController,
  RazorpayWebhookController,
} from './payment-buttons.controller.js';
@Module({
  controllers: [
    PaymentButtonsController,
    StudentPaymentButtonsController,
    StudentRazorpayOrdersController,
    RazorpayWebhookController,
  ],
  providers: [
    PaymentButtonsService,
    PaymentButtonPolicyService,
    RazorpayGatewayService,
    RazorpayOrdersService,
    RazorpayReconciliationService,
    PaymentAlertsService,
    { provide: RAZORPAY_HTTP_PORT, inject: [API_CONFIG], useFactory: razorpayHttpPort },
  ],
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
        StudentRazorpayOrdersController,
        RazorpayWebhookController,
      );
  }
}
