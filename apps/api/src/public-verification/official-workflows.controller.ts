import { prepareOfficialTemplateSchema } from '@docversity/validation';
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
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { PERMISSIONS } from '@docversity/types';
import {
  attestOfficialResultSchema,
  officialDocumentCommandSchema,
  prepareOfficialDocumentSchema,
  proposeVerificationPolicySchema,
  publishOfficialResultSchema,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { Errors } from '../common/app-error.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
import { OfficialDocumentsService } from './official-documents.service.js';
import { OfficialResultsService } from './official-results.service.js';
import type { z } from 'zod';
@Controller('verification-policies')
@RequirePermissions(PERMISSIONS.verificationPoliciesManage)
export class VerificationPoliciesController {
  constructor(private readonly service: VerificationPoliciesService) {}
  @Get() @Header('Cache-Control', 'no-store') list() {
    return this.service.list();
  }
  @Post() propose(
    @Body(new ZodValidationPipe(proposeVerificationPolicySchema))
    body: z.infer<typeof proposeVerificationPolicySchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.propose(body, auth.user.id);
  }
  @Post(':id/approve') @HttpCode(200) approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'APPROVE', auth.user.id);
  }
  @Post(':id/withdraw') @HttpCode(200) withdraw(
    @Param('id', UuidParamPipe) id: string,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'WITHDRAW', auth.user.id);
  }
}
@Controller('official-documents')
export class OfficialDocumentsController {
  constructor(private readonly service: OfficialDocumentsService) {}
  @Post('templates')
  @RequirePermissions(PERMISSIONS.templatesWrite)
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
  approveTemplate(@Param('id', UuidParamPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.approveTemplate(id, auth.user.id);
  }
  @Get()
  @RequirePermissions(PERMISSIONS.certificatesRead)
  @Header('Cache-Control', 'no-store')
  list() {
    return this.service.list();
  }
  @Post()
  @RequirePermissions(PERMISSIONS.certificatesGenerate)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 10000 },
    }),
  )
  prepare(
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
    if (!parsed.success || !file)
      throw Errors.validation([
        { path: 'metadata', message: 'Provide valid authority metadata and a PDF.' },
      ]);
    return this.service.prepare(parsed.data, file.buffer, auth.user.id);
  }
  @Get(':id/file')
  @RequirePermissions(PERMISSIONS.certificatesRead)
  @Header('Cache-Control', 'no-store')
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
  approve(@Param('id', UuidParamPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.command(id, 'APPROVE', auth.user.id);
  }
  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesIssue)
  issue(@Param('id', UuidParamPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.command(id, 'ISSUE', auth.user.id);
  }
  @Post(':id/revoke')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.certificatesRevoke)
  revoke(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(officialDocumentCommandSchema))
    body: z.infer<typeof officialDocumentCommandSchema>,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.command(id, 'REVOKE', auth.user.id, body.reason);
  }
}
@Controller('official-results')
export class OfficialResultsController {
  constructor(private readonly service: OfficialResultsService) {}
  @Post(':id/attest')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.resultsWrite)
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
  withdraw(@Param('id', UuidParamPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.withdraw(id, auth.user.id);
  }
}
@Controller('student/official-documents')
@StudentRoute()
export class StudentOfficialDocumentsController {
  constructor(private readonly service: OfficialDocumentsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentStudent() student: StudentContext) {
    return this.service.ownDocuments(student.studentId);
  }
  @Get(':id/download')
  @Header('Cache-Control', 'no-store')
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
