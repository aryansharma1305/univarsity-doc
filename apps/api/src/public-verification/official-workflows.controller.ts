import { Query } from '@nestjs/common';
import {
  officialPolicyQuerySchema,
  officialPolicyListSchema,
  officialDocumentQuerySchema,
  officialStaffDocumentListSchema,
  officialTemplateQuerySchema,
  officialTemplateListSchema,
  verificationAuditQuerySchema,
  verificationAuditListSchema,
} from '@docversity/validation';
import { OfficialAdminService } from './official-admin.service.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { PERMISSIONS } from '@docversity/types';
import {
  attestOfficialResultSchema,
  emptyOfficialCommandSchema,
  officialActionReceiptSchema,
  officialDocumentCommandSchema,
  officialDocumentReceiptSchema,
  admissionLetterPreviewSchema,
  officialDocumentUploadSchema,
  prepareOfficialDocumentSchema,
  prepareOfficialTemplateSchema,
  proposeVerificationPolicySchema,
  publishOfficialResultSchema,
  studentIssuedDocumentsSchema,
  verificationPolicyResponseSchema,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { Errors } from '../common/app-error.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
import { OfficialDocumentsService } from './official-documents.service.js';
import { OfficialResultsService } from './official-results.service.js';
import type { z } from 'zod';
@ApiTags('verification-policies')
@ApiCookieAuth('session')
@Controller('verification-policies')
@RequirePermissions(PERMISSIONS.verificationPoliciesManage)
export class VerificationPoliciesController {
  constructor(
    private readonly service: VerificationPoliciesService,
    private readonly reads: OfficialAdminService,
  ) {}
  @Get()
  @RequirePermissions(PERMISSIONS.certificatesRead)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: officialPolicyListSchema })
  list(
    @Query(new ZodValidationPipe(officialPolicyQuerySchema))
    query: z.infer<typeof officialPolicyQuerySchema>,
  ) {
    return this.reads.policyList(query);
  }
  @Post()
  @ApiBody({ schema: openApiRequestSchema(proposeVerificationPolicySchema) })
  @ApiCreatedResponse({ standardSchema: verificationPolicyResponseSchema })
  propose(
    @Body(new ZodValidationPipe(proposeVerificationPolicySchema))
    body: z.infer<typeof proposeVerificationPolicySchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.propose(body, auth.user.id);
  }
  @Post(':id/approve')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: verificationPolicyResponseSchema })
  approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.transition(id, 'APPROVE', auth.user.id);
  }
  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: verificationPolicyResponseSchema })
  withdraw(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.transition(id, 'WITHDRAW', auth.user.id);
  }
}
@ApiTags('official-documents')
@ApiCookieAuth('session')
@Controller('official-documents')
export class OfficialDocumentsController {
  constructor(
    private readonly service: OfficialDocumentsService,
    private readonly reads: OfficialAdminService,
  ) {}
  @Get()
  @RequirePermissions(PERMISSIONS.certificatesRead)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: officialStaffDocumentListSchema })
  list(
    @Query(new ZodValidationPipe(officialDocumentQuerySchema))
    query: z.infer<typeof officialDocumentQuerySchema>,
  ) {
    return this.reads.documents(query);
  }
  @Get('templates')
  @RequirePermissions(PERMISSIONS.templatesRead)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: officialTemplateListSchema })
  templates(
    @Query(new ZodValidationPipe(officialTemplateQuerySchema))
    query: z.infer<typeof officialTemplateQuerySchema>,
  ) {
    return this.reads.templates(query);
  }
  @Post('templates')
  @RequirePermissions(PERMISSIONS.templatesWrite)
  @ApiBody({ schema: openApiRequestSchema(prepareOfficialTemplateSchema) })
  @ApiCreatedResponse({ standardSchema: officialActionReceiptSchema })
  prepareTemplate(
    @Body(new ZodValidationPipe(prepareOfficialTemplateSchema))
    body: z.infer<typeof prepareOfficialTemplateSchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.prepareTemplate(body, auth.user.id);
  }
  @Post('templates/:id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesApprove)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: officialActionReceiptSchema })
  approveTemplate(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.approveTemplate(id, auth.user.id);
  }
  @Post()
  @RequirePermissions(PERMISSIONS.certificatesGenerate)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: openApiRequestSchema(officialDocumentUploadSchema) })
  @ApiCreatedResponse({ standardSchema: officialDocumentReceiptSchema })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 10000 },
    }),
  )
  async prepare(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAuth() auth: AuthContext,
  ) {
    let input: unknown;
    try {
      if (Object.keys(body).length !== 1 || typeof body.metadata !== 'string') throw new Error();
      input = JSON.parse(body.metadata);
    } catch {
      throw Errors.validation([
        { path: 'metadata', message: 'Provide document metadata as JSON.' },
      ]);
    }
    const parsed = prepareOfficialDocumentSchema.safeParse(input);
    // Exactly one source: an uploaded PDF, or (admission letters) a server-generated one.
    if (!parsed.success || !file === !parsed.data.generate)
      throw Errors.validation([
        { path: 'metadata', message: 'Provide valid authority metadata and a PDF.' },
      ]);
    const { generate, ...metadata } = parsed.data;
    const bytes = generate
      ? await this.service.generateAdmissionLetter({
          registrationId: metadata.registrationId,
          policyId: metadata.policyId,
          templateId: metadata.templateId,
          certificateNumber: metadata.certificateNumber,
          issueDate: metadata.issueDate,
          authorityReference: metadata.authorityReference,
        })
      : file?.buffer;
    if (!bytes)
      throw Errors.validation([
        { path: 'file', message: 'Provide valid authority metadata and a PDF.' },
      ]);
    return this.service.prepare(metadata, bytes, auth.user.id, generate ? 'GENERATED' : 'UPLOADED');
  }
  @Post('admission-letter/preview')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesGenerate)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ schema: openApiRequestSchema(admissionLetterPreviewSchema) })
  @ApiProduces('application/pdf')
  async previewAdmissionLetter(
    @Body(new ZodValidationPipe(admissionLetterPreviewSchema))
    body: z.infer<typeof admissionLetterPreviewSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Nothing is stored: the preview is rendered again when the letter is prepared.
    const bytes = await this.service.generateAdmissionLetter(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="admission-letter-preview.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes);
  }
  @Get(':id/file')
  @RequirePermissions(PERMISSIONS.historicalDocumentsRead)
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  async file(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.service.reviewDocument(id, auth.user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="document-for-review.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes);
  }
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesApprove)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: officialDocumentReceiptSchema })
  approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.command(id, 'APPROVE', auth.user.id);
  }
  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesIssue)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: officialDocumentReceiptSchema })
  issue(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.command(id, 'ISSUE', auth.user.id);
  }
  @Post(':id/verification-link')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesIssue)
  @Header('Cache-Control', 'no-store')
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: officialDocumentReceiptSchema })
  verificationLink(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.credentialLink(id, auth.user.id);
  }
  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesRevoke)
  @ApiBody({ schema: openApiRequestSchema(officialDocumentCommandSchema) })
  @ApiOkResponse({ standardSchema: officialDocumentReceiptSchema })
  revoke(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(officialDocumentCommandSchema))
    body: z.infer<typeof officialDocumentCommandSchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.command(id, 'REVOKE', auth.user.id, body.reason);
  }
}
@ApiTags('official-results')
@ApiCookieAuth('session')
@Controller('official-results')
export class OfficialResultsController {
  constructor(private readonly service: OfficialResultsService) {}
  @Post(':id/attest')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.resultsWrite)
  @ApiBody({ schema: openApiRequestSchema(attestOfficialResultSchema) })
  @ApiOkResponse({ standardSchema: officialActionReceiptSchema })
  attest(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(attestOfficialResultSchema))
    body: z.infer<typeof attestOfficialResultSchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.attest(id, body, auth.user.id);
  }
  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.resultsPublish)
  @ApiBody({ schema: openApiRequestSchema(publishOfficialResultSchema) })
  @ApiOkResponse({ standardSchema: officialActionReceiptSchema })
  publish(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(publishOfficialResultSchema))
    body: z.infer<typeof publishOfficialResultSchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.publish(id, body, auth.user.id);
  }
  @Post(':id/withdraw')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.resultsPublish)
  @ApiBody({ schema: openApiRequestSchema(emptyOfficialCommandSchema) })
  @ApiOkResponse({ standardSchema: officialActionReceiptSchema })
  withdraw(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(emptyOfficialCommandSchema))
    _body: z.infer<typeof emptyOfficialCommandSchema>,
  ) {
    return this.service.withdraw(id, auth.user.id);
  }
}
@ApiTags('student-issued-documents')
@ApiCookieAuth('studentSession')
@Controller('student/official-documents')
@StudentRoute()
export class StudentOfficialDocumentsController {
  constructor(private readonly service: OfficialDocumentsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: studentIssuedDocumentsSchema })
  list(@CurrentStudent() student: StudentContext) {
    return this.service.ownDocuments(student.studentId);
  }
  @Get(':id/download')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  async download(
    @Param('id', UuidParamPipe) id: string,
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.service.download(student.studentId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="issued-document.pdf"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes);
  }
}

@ApiTags('verification-audit')
@ApiCookieAuth('session')
@Controller('verification-audit')
@RequirePermissions(PERMISSIONS.auditRead)
export class VerificationAuditController {
  constructor(private readonly reads: OfficialAdminService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: verificationAuditListSchema })
  list(
    @Query(new ZodValidationPipe(verificationAuditQuerySchema))
    query: z.infer<typeof verificationAuditQuerySchema>,
  ) {
    return this.reads.audit(query);
  }
}
