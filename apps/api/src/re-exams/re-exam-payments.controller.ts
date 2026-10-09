import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  type ApprovePaymentDestination,
  approvePaymentDestinationSchema,
  type CreatePaymentDestination,
  createPaymentDestinationSchema,
  errorResponseSchema,
  type PaymentDestinationDetail,
  paymentDestinationDetailSchema,
  type PaymentDestinationList,
  paymentDestinationListSchema,
  type ReExamPaymentDetail,
  reExamPaymentDetailSchema,
  type ReExamPaymentList,
  reExamPaymentListSchema,
  type ReExamPaymentQuery,
  reExamPaymentQuerySchema,
  type RejectReExamPayment,
  rejectReExamPaymentSchema,
  type SetPaymentDestinationActive,
  setPaymentDestinationActiveSchema,
  type StartReExamPayment,
  startReExamPaymentSchema,
  type StudentReExamPaymentView,
  studentReExamPaymentViewSchema,
  submitReExamPaymentSchema,
  type UpdatePaymentDestination,
  updatePaymentDestinationSchema,
  type VerifyReExamPayment,
  verifyReExamPaymentSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentStudent,
  type StudentContext,
  StudentRoute,
} from '../student-auth/student-auth.decorators.js';
import { PaymentDestinationsService } from './payment-destinations.service.js';
import {
  EvidenceUploadInterceptor,
  type PaymentUploadRequest,
  QrUploadInterceptor,
} from './payment-upload.interceptor.js';
import { ReExamPaymentsService } from './re-exam-payments.service.js';

const error = { standardSchema: errorResponseSchema };

/** Private image/file: never cached, never sniffed, sandboxed, generated name. */
function sendFile(
  res: Response,
  file: { bytes: Uint8Array; contentType: string },
  filename: string,
  disposition: 'inline' | 'attachment' = 'inline',
): StreamableFile {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'",
  );
  return new StreamableFile(Buffer.from(file.bytes), {
    type: file.contentType,
    disposition: `${disposition}; filename="${filename}"`,
    length: file.bytes.byteLength,
  });
}

@ApiTags('re-exam-payments')
@ApiCookieAuth('session')
@Controller('re-exam-payment-destinations')
export class PaymentDestinationsController {
  constructor(private readonly destinations: PaymentDestinationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiOperation({
    summary: 'Payment details per country/region (all versions) and region overview',
  })
  @ApiOkResponse({ standardSchema: paymentDestinationListSchema })
  list(@Res({ passthrough: true }) res: Response): Promise<PaymentDestinationList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.destinations.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'Create DRAFT payment details for a country/region (or a replacement of approved ones)',
    description:
      'Nothing is shown to students until another authorised person approves it. Amounts are only entered for a currency different from the active fee rule’s (never converted).',
  })
  @ApiBody({ schema: openApiRequestSchema(createPaymentDestinationSchema) })
  @ApiCreatedResponse({ standardSchema: paymentDestinationDetailSchema })
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createPaymentDestinationSchema)) body: CreatePaymentDestination,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.create(body, auth.user.id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiOperation({ summary: 'One version with its amounts, approvals and history' })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  detail(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaymentDestinationDetail> {
    res.setHeader('Cache-Control', 'no-store');
    return this.destinations.detail(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Edit a DRAFT (approved and retired versions are frozen)' })
  @ApiBody({ schema: openApiRequestSchema(updatePaymentDestinationSchema) })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updatePaymentDestinationSchema)) body: UpdatePaymentDestination,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.update(id, body, auth.user.id);
  }

  @Post(':id/qr')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @UseInterceptors(QrUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload the QR image of a DRAFT (PNG/JPEG ≤ 2 MB; stored re-encoded without metadata)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  @ApiResponse({ status: 413, description: 'Larger than 2 MB', ...error })
  uploadQr(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Req() request: PaymentUploadRequest,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.uploadQr(id, request.file, auth.user.id);
  }

  @Get(':id/qr')
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiOperation({ summary: 'The stored QR image (staff preview)' })
  @ApiProduces('image/png', 'image/jpeg')
  async qr(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendFile(res, await this.destinations.staffQr(id), 'payment-qr');
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'DRAFT → APPROVED by a second person (QR required); a replacement retires the version it replaces',
  })
  @ApiBody({ schema: openApiRequestSchema(approvePaymentDestinationSchema) })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  @ApiResponse({
    status: 409,
    description: 'Same person, no QR, or region already approved',
    ...error,
  })
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(approvePaymentDestinationSchema)) body: ApprovePaymentDestination,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.approve(id, body, auth.user.id);
  }

  @Post(':id/active')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Switch approved payment details on or off for students' })
  @ApiBody({ schema: openApiRequestSchema(setPaymentDestinationActiveSchema) })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  setActive(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(setPaymentDestinationActiveSchema))
    body: SetPaymentDestinationActive,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.setActive(id, body, auth.user.id);
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsConfigure)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Retire a version (kept for history and existing payments)' })
  @ApiOkResponse({ standardSchema: paymentDestinationDetailSchema })
  retire(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PaymentDestinationDetail> {
    return this.destinations.retire(id, auth.user.id);
  }
}

@ApiTags('re-exam-payments')
@ApiCookieAuth('session')
@Controller('re-exam-payments')
export class ReExamPaymentsController {
  constructor(private readonly payments: ReExamPaymentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.reExamPaymentsRead)
  @ApiOperation({
    summary: 'Re-exam payments (search: name, registration, subject, transaction ref)',
  })
  @ApiListQuery(reExamPaymentQuerySchema)
  @ApiOkResponse({ standardSchema: reExamPaymentListSchema })
  list(
    @Query(new ZodValidationPipe(reExamPaymentQuerySchema)) query: ReExamPaymentQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReExamPaymentList> {
    res.setHeader('Cache-Control', 'no-store');
    return this.payments.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.reExamPaymentsRead)
  @ApiOperation({ summary: 'A payment with its obligation snapshot, evidence summary and history' })
  @ApiOkResponse({ standardSchema: reExamPaymentDetailSchema })
  detail(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReExamPaymentDetail> {
    res.setHeader('Cache-Control', 'no-store');
    return this.payments.detail(id);
  }

  @Get(':id/evidence')
  @RequirePermissions(PERMISSIONS.reExamPaymentsRead)
  @ApiOperation({ summary: 'The submitted evidence (checked against its checksum); audited' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  async evidence(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.payments.evidence(id, auth.user.id);
    return sendFile(res, file, file.filename);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsVerify)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'SUBMITTED → VERIFIED after checking the university account (amount and currency must match exactly)',
  })
  @ApiBody({ schema: openApiRequestSchema(verifyReExamPaymentSchema) })
  @ApiOkResponse({ standardSchema: reExamPaymentDetailSchema })
  @ApiResponse({
    status: 409,
    description: 'Already decided, or amount/currency mismatch',
    ...error,
  })
  verify(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(verifyReExamPaymentSchema)) body: VerifyReExamPayment,
  ): Promise<ReExamPaymentDetail> {
    return this.payments.verify(id, body, auth.user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.reExamPaymentsVerify)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'SUBMITTED → REJECTED with a reason (shown to the student)' })
  @ApiBody({ schema: openApiRequestSchema(rejectReExamPaymentSchema) })
  @ApiOkResponse({ standardSchema: reExamPaymentDetailSchema })
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(rejectReExamPaymentSchema)) body: RejectReExamPayment,
  ): Promise<ReExamPaymentDetail> {
    return this.payments.reject(id, body, auth.user.id);
  }
}

/** The signed-in student's own re-exam payments. Amounts and destinations come from the server. */
@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student')
export class StudentReExamPaymentsController {
  constructor(private readonly payments: ReExamPaymentsService) {}

  @Get('re-exam-applications/:id/payment')
  @ApiOperation({
    summary: 'Pay Now view of an own application: fee, country/region availability, payments',
  })
  @ApiOkResponse({ standardSchema: studentReExamPaymentViewSchema })
  view(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentReExamPaymentView> {
    res.setHeader('Cache-Control', 'no-store');
    return this.payments.view(student.studentId, id);
  }

  @Post('re-exam-applications/:id/payment')
  @HttpCode(HttpStatus.OK)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary:
      'Choose the country/region to pay from (creates the payment with a snapshotted amount, or replaces an unpaid one)',
  })
  @ApiBody({ schema: openApiRequestSchema(startReExamPaymentSchema) })
  @ApiOkResponse({ standardSchema: studentReExamPaymentViewSchema })
  @ApiResponse({
    status: 409,
    description: 'Not configured, no approved amount, or already submitted',
    ...error,
  })
  start(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(startReExamPaymentSchema)) body: StartReExamPayment,
  ): Promise<StudentReExamPaymentView> {
    return this.payments.start(student.studentId, student.accountId, id, body);
  }

  @Get('re-exam-payments/:id/qr')
  @ApiOperation({
    summary: 'The QR of an own unpaid payment, only while its payment details are available',
  })
  @ApiProduces('image/png', 'image/jpeg')
  async qr(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendFile(res, await this.payments.studentQr(student.studentId, id), 'payment-qr');
  }

  @Post('re-exam-payments/:id/submit')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(EvidenceUploadInterceptor)
  @ApiSecurity('csrf')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Submit the transaction reference (and receipt, if required) after paying; never a PIN or OTP',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['transactionReference'],
      properties: {
        transactionReference: { type: 'string' },
        evidence: { type: 'string', format: 'binary', description: 'PDF, JPEG or PNG (≤ 5 MB)' },
      },
    },
  })
  @ApiOkResponse({ standardSchema: studentReExamPaymentViewSchema })
  @ApiResponse({
    status: 409,
    description: 'Already submitted, or reference already used',
    ...error,
  })
  submit(
    @CurrentStudent() student: StudentContext,
    @Param('id', UuidParamPipe) id: string,
    @Req() request: PaymentUploadRequest,
  ): Promise<StudentReExamPaymentView> {
    const body = new ZodValidationPipe(submitReExamPaymentSchema).transform(request.body ?? {});
    return this.payments.submit(student.studentId, student.accountId, id, body, request.file);
  }
}
