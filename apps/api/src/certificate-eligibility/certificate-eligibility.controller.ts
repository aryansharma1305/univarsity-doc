import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS } from '@docversity/types';
import {
  eligibilityDecisionSchema,
  eligibilityRejectionSchema,
  programCertificateEligibilitySchema,
  proposeCertificateEligibilitySchema,
  studentCertificateEligibilityV1Schema,
  studentRegistrationEligibilityResponseV1Schema,
  type EligibilityDecision,
  type ProposeCertificateEligibility,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CertificateEligibilityService,
  type StaffActor,
} from './certificate-eligibility.service.js';

const noQuery = new ZodValidationPipe(z.object({}).strict());
const actor = (a: AuthContext): StaffActor => ({
  userId: a.user.id,
  canPropose: a.user.permissions.has(PERMISSIONS.certificateEligibilityPropose),
  canApprove: a.user.permissions.has(PERMISSIONS.certificateEligibilityApprove),
});

@ApiTags('certificate-eligibility')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.certificateEligibilityRead)
@Controller()
export class CertificateEligibilityController {
  constructor(private readonly service: CertificateEligibilityService) {}

  @ApiOkResponse({ standardSchema: programCertificateEligibilitySchema })
  @Get('programs/:programId/certificate-eligibility')
  view(
    @CurrentAuth() a: AuthContext,
    @Param('programId', UuidParamPipe) programId: string,
    @Query(noQuery) _q: object,
  ) {
    return this.service.programView(programId, actor(a));
  }

  @ApiOkResponse({ standardSchema: programCertificateEligibilitySchema })
  @ApiBody({ schema: openApiRequestSchema(proposeCertificateEligibilitySchema) })
  @Post('programs/:programId/certificate-eligibility/proposals')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.certificateEligibilityRead,
    PERMISSIONS.certificateEligibilityPropose,
  )
  propose(
    @CurrentAuth() a: AuthContext,
    @Param('programId', UuidParamPipe) programId: string,
    @Body(new ZodValidationPipe(proposeCertificateEligibilitySchema))
    body: ProposeCertificateEligibility,
  ) {
    return this.service.propose(programId, body, actor(a));
  }

  @ApiOkResponse({ standardSchema: programCertificateEligibilitySchema })
  @ApiBody({ schema: openApiRequestSchema(eligibilityDecisionSchema) })
  @Post('certificate-eligibility/:configId/withdraw')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.certificateEligibilityRead,
    PERMISSIONS.certificateEligibilityPropose,
  )
  withdraw(
    @CurrentAuth() a: AuthContext,
    @Param('configId', UuidParamPipe) configId: string,
    @Body(new ZodValidationPipe(eligibilityDecisionSchema)) body: EligibilityDecision,
  ) {
    return this.service.withdraw(configId, body, actor(a));
  }

  @ApiOkResponse({ standardSchema: programCertificateEligibilitySchema })
  @ApiBody({ schema: openApiRequestSchema(eligibilityDecisionSchema) })
  @Post('certificate-eligibility/:configId/approve')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.certificateEligibilityRead,
    PERMISSIONS.certificateEligibilityApprove,
  )
  approve(
    @CurrentAuth() a: AuthContext,
    @Param('configId', UuidParamPipe) configId: string,
    @Body(new ZodValidationPipe(eligibilityDecisionSchema)) body: EligibilityDecision,
  ) {
    return this.service.approve(configId, body, actor(a));
  }

  @ApiOkResponse({ standardSchema: programCertificateEligibilitySchema })
  @ApiBody({ schema: openApiRequestSchema(eligibilityRejectionSchema) })
  @Post('certificate-eligibility/:configId/reject')
  @HttpCode(200)
  @RequirePermissions(
    PERMISSIONS.certificateEligibilityRead,
    PERMISSIONS.certificateEligibilityApprove,
  )
  reject(
    @CurrentAuth() a: AuthContext,
    @Param('configId', UuidParamPipe) configId: string,
    @Body(new ZodValidationPipe(eligibilityRejectionSchema)) body: EligibilityDecision,
  ) {
    return this.service.reject(configId, body, actor(a));
  }
}

@ApiTags('student-certificate-eligibility')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/certificate-eligibility')
export class StudentCertificateEligibilityController {
  constructor(private readonly service: CertificateEligibilityService) {}

  /** Contract v1: every registration of the signed-in student, each with its own eligibility. */
  @ApiOkResponse({ standardSchema: studentCertificateEligibilityV1Schema })
  @Get()
  list(@CurrentStudent() s: StudentContext, @Query(noQuery) _q: object) {
    return this.service.studentEligibility(s.studentId);
  }

  /** One explicitly selected registration; ownership is checked on the server (404 otherwise). */
  @ApiOkResponse({ standardSchema: studentRegistrationEligibilityResponseV1Schema })
  @Get('registrations/:registrationId')
  one(
    @CurrentStudent() s: StudentContext,
    @Param('registrationId', UuidParamPipe) registrationId: string,
    @Query(noQuery) _q: object,
  ) {
    return this.service.studentRegistrationEligibility(s.studentId, registrationId);
  }
}
