import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  studentCertificateSampleIdSchema,
  studentCertificateSampleQuerySchema,
} from '@docversity/validation';
import { trainingCertificateSample } from '@docversity/documents';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { Errors } from '../common/app-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

@ApiTags('student')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/certificate-samples')
export class StudentCertificateSamplesController {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
  ) {}

  @Get(':sampleId/file')
  @ApiProduces('application/pdf')
  async file(
    @CurrentStudent() student: StudentContext,
    @Param('sampleId', new ZodValidationPipe(studentCertificateSampleIdSchema)) _sampleId: string,
    @Query(new ZodValidationPipe(studentCertificateSampleQuerySchema))
    query: { disposition: 'inline' | 'attachment' },
    @Res({ passthrough: true }) res: Response,
  ) {
    // A shared per-account window bounds both viewing and downloading without rendering anything.
    const limit = await this.limiter.hit(
      'student-certificate-samples',
      [
        {
          key: this.hasher.hash('student-certificate-samples', student.accountId),
          limit: 30,
        },
      ],
      60,
    );
    if (limit.limited) throw Errors.rateLimited(limit.retryAfterSeconds);
    const bytes = trainingCertificateSample();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: `${query.disposition}; filename="sample-training-certificate-v1.pdf"`,
      length: bytes.length,
    });
  }
}
