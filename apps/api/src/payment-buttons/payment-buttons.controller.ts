import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PERMISSIONS } from '@docversity/types';
import {
  paymentButtonViewSchema,
  razorpayCheckoutReturnResultSchema,
  razorpayCheckoutReturnSchema,
  razorpayOrderViewSchema,
  type RazorpayCheckoutReturn,
  razorpayReceiptsSchema,
  razorpayReconciliationSchema,
  razorpayWebhookResponseSchema,
  reconcileRazorpayPaymentSchema,
  type ReconcileRazorpayPayment,
} from '@docversity/validation';
import {
  CurrentAuth,
  Public,
  RequirePermissions,
  type AuthContext,
} from '../auth/auth.decorators.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { PaymentButtonsService } from './payment-buttons.service.js';
import { RazorpayOrdersService } from './razorpay-orders.service.js';

@ApiTags('payment-buttons')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/payment-buttons')
export class StudentPaymentButtonsController {
  constructor(private readonly service: PaymentButtonsService) {}
  @Get('exam/:registrationId/:id')
  @ApiOkResponse({ standardSchema: paymentButtonViewSchema })
  exam(
    @CurrentStudent() student: StudentContext,
    @Param('registrationId', UuidParamPipe) registrationId: string,
    @Param('id', UuidParamPipe) id: string,
  ) {
    return this.service.exam(student.studentId, registrationId, id);
  }
  @Get('re-exam/:id')
  @ApiOkResponse({ standardSchema: paymentButtonViewSchema })
  reExam(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.reExam(student.studentId, id);
  }
  @Get('certificate/:id')
  @ApiOkResponse({ standardSchema: paymentButtonViewSchema })
  certificate(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.service.certificate(student.studentId, id);
  }
}
/** Test-mode Orders API checkout for an own re-exam obligation. 404 unless PAYMENTS_RAZORPAY_MODE=test. */
@ApiTags('payment-buttons')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/re-exam-payments')
export class StudentRazorpayOrdersController {
  constructor(private readonly orders: RazorpayOrdersService) {}
  @Post(':id/razorpay-order')
  @HttpCode(200)
  @ApiSecurity('csrf')
  @ApiOkResponse({ standardSchema: razorpayOrderViewSchema })
  order(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.orders.create(student.studentId, student.accountId, id);
  }
  @Post(':id/razorpay-return')
  @HttpCode(200)
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(razorpayCheckoutReturnSchema) })
  @ApiOkResponse({ standardSchema: razorpayCheckoutReturnResultSchema })
  checkoutReturn(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(razorpayCheckoutReturnSchema)) body: RazorpayCheckoutReturn,
  ) {
    return this.orders.checkoutReturn(student.studentId, student.accountId, id, body);
  }
}
@ApiTags('payment-buttons')
@ApiCookieAuth('session')
@Controller('payment-buttons')
export class PaymentButtonsController {
  constructor(private readonly service: PaymentButtonsService) {}
  @Get('re-exam/:id/receipts')
  @RequirePermissions(PERMISSIONS.reExamPaymentsVerify)
  @ApiOkResponse({ standardSchema: razorpayReceiptsSchema })
  receipts(@Param('id', UuidParamPipe) id: string) {
    return this.service.receipts(id);
  }
  @Post('reconcile')
  @HttpCode(200)
  @ApiSecurity('csrf')
  @RequirePermissions(PERMISSIONS.reExamPaymentsVerify)
  @ApiBody({ schema: openApiRequestSchema(reconcileRazorpayPaymentSchema) })
  @ApiOkResponse({ standardSchema: razorpayReconciliationSchema })
  reconcile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(reconcileRazorpayPaymentSchema)) body: ReconcileRazorpayPayment,
  ) {
    return this.service.reconcile(body, auth.user.id);
  }
}
@ApiTags('payment-buttons')
@Public()
@Controller('payment-buttons/webhook')
export class RazorpayWebhookController {
  constructor(private readonly service: PaymentButtonsService) {}
  @Post()
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: razorpayWebhookResponseSchema })
  webhook(@Req() request: Request) {
    return this.service.webhook(
      request.body,
      request.header('x-razorpay-signature'),
      request.header('x-razorpay-event-id'),
      request.ip ?? 'unknown',
    );
  }
}
