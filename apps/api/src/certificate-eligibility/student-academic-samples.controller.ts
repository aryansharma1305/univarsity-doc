import { Controller, Get, HttpStatus, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ERROR_CODES,
  academicCertificateSampleIdSchema,
  studentCertificateSampleQuerySchema,
  type AcademicCertificateSampleId,
} from '@docversity/validation';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError } from '../common/app-error.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AcademicSamplesService } from './academic-samples.service.js';

@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/certificate-samples/registrations')
export class StudentAcademicSamplesController {
  constructor(
    private readonly samples: AcademicSamplesService,
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}

  @Get(':registrationId/:sampleId/file')
  @ApiProduces('application/pdf')
  async file(
    @CurrentStudent() student: StudentContext,
    @Param('registrationId', UuidParamPipe) registrationId: string,
    @Param('sampleId', new ZodValidationPipe(academicCertificateSampleIdSchema))
    sampleId: AcademicCertificateSampleId,
    @Query(new ZodValidationPipe(studentCertificateSampleQuerySchema))
    query: { disposition: 'inline' | 'attachment' },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Same per-account window as the UI-05 training sample, checked before any lookup, so viewing,
    // downloading and probing registrations share one bound.
    const limit = await this.limiter.hit(
      'student-certificate-samples',
      [{ key: this.hasher.hash('student-certificate-samples', student.accountId), limit: 30 }],
      60,
    );
    if (limit.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many sample requests. Please wait and try again.',
        { headers: { 'Retry-After': String(Math.max(1, limit.retryAfterSeconds)) } },
      );
    const bytes = await this.samples.sample(student.studentId, registrationId, sampleId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `${query.disposition}; filename="${sampleId}.pdf"`,
      length: bytes.length,
    });
  }
}
