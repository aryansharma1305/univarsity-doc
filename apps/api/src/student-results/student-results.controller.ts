import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  studentResultsPageSchema,
  studentResultsQuerySchema,
  type StudentResultsPage,
  type StudentResultsQuery,
} from '@docversity/validation';
import { Errors } from '../common/app-error.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CurrentStudent,
  StudentRoute,
  type StudentContext,
} from '../student-auth/student-auth.decorators.js';

@ApiTags('student-results')
@ApiCookieAuth('studentSession')
@StudentRoute()
@Controller('student/results')
export class StudentResultsController {
  @Get()
  @ApiOkResponse({ standardSchema: studentResultsPageSchema })
  list(
    @CurrentStudent() _student: StudentContext,
    @Query(new ZodValidationPipe(studentResultsQuerySchema)) query: StudentResultsQuery,
  ): StudentResultsPage {
    // Phase 10D disables publication; legacy status/timestamp cannot prove an authorized release.
    // Do not query result rows or introduce a bypass until publication provenance is approved.
    return studentResultsPageSchema.parse({
      publicationAvailable: false,
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    });
  }

  @Get(':id')
  get(@CurrentStudent() _student: StudentContext, @Param('id', UuidParamPipe) _id: string): never {
    // Own, foreign, unpublished, legacy PUBLISHED and nonexistent IDs are indistinguishable.
    throw Errors.notFound();
  }
}
