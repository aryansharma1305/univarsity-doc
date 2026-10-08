import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  errorResponseSchema,
  type IssueActivationCodes,
  type IssuedActivationCodes,
  issueActivationCodesSchema,
  issuedActivationCodesSchema,
  type RevokeActivationCodes,
  revokeActivationCodesSchema,
  type SetStudentAccountStatus,
  setStudentAccountStatusSchema,
  type StudentAccountList,
  studentAccountListSchema,
  type StudentAccountQuery,
  studentAccountQuerySchema,
  type StudentAccountRow,
  studentAccountRowSchema,
} from '@docversity/validation';
import type { Response } from 'express';
import { type AuthContext, CurrentAuth, RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StudentAccountsService } from './student-accounts.service.js';

const error = { standardSchema: errorResponseSchema };

@ApiTags('student-accounts')
@ApiCookieAuth('session')
@Controller('student-accounts')
export class StudentAccountsController {
  constructor(private readonly service: StudentAccountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.studentAccountsRead)
  @ApiOperation({ summary: 'Registrations with their student-portal state' })
  @ApiListQuery(studentAccountQuerySchema)
  @ApiOkResponse({ standardSchema: studentAccountListSchema })
  list(
    @Query(new ZodValidationPipe(studentAccountQuerySchema)) query: StudentAccountQuery,
  ): Promise<StudentAccountList> {
    return this.service.list(query);
  }

  @Post('activation-codes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentAccountsManage)
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Issue single-use activation codes',
    description:
      'For the given registrations, or every registration of an import. Previous open codes are revoked. The plain codes are in this response ONLY — they are stored as keyed hashes.',
  })
  @ApiBody({ schema: openApiRequestSchema(issueActivationCodesSchema) })
  @ApiOkResponse({ standardSchema: issuedActivationCodesSchema })
  @ApiResponse({ status: 403, description: 'Missing permission or CSRF token', ...error })
  async issue(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(issueActivationCodesSchema)) body: IssueActivationCodes,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IssuedActivationCodes> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.issueCodes(body, auth.user.id);
  }

  @Post('activation-codes/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentAccountsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Revoke the open activation codes of registrations' })
  @ApiBody({ schema: openApiRequestSchema(revokeActivationCodesSchema) })
  @ApiOkResponse({ schema: { type: 'object', properties: { revoked: { type: 'integer' } } } })
  revoke(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(revokeActivationCodesSchema)) body: RevokeActivationCodes,
  ): Promise<{ revoked: number }> {
    return this.service.revokeCodes(body, auth.user.id);
  }

  @Post(':accountId/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.studentAccountsManage)
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Lock, disable or re-activate a student account (ends its sessions)' })
  @ApiBody({ schema: openApiRequestSchema(setStudentAccountStatusSchema) })
  @ApiOkResponse({ standardSchema: studentAccountRowSchema })
  setStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('accountId', UuidParamPipe) accountId: string,
    @Body(new ZodValidationPipe(setStudentAccountStatusSchema)) body: SetStudentAccountStatus,
  ): Promise<StudentAccountRow> {
    return this.service.setStatus(accountId, body, auth.user.id);
  }
}
