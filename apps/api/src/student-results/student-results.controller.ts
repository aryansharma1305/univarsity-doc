import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  studentResultsPageSchema,
  studentResultsQuerySchema,
  type StudentResultsPage,
  type StudentResultsQuery,
} from '@docversity/validation';
import { ReleasesService } from '../release-workflows/releases.service.js';
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
  constructor(private readonly releases: ReleasesService) {}
  @Get()
  @ApiOkResponse({ standardSchema: studentResultsPageSchema })
  list(
    @CurrentStudent() student: StudentContext,
    @Query(new ZodValidationPipe(studentResultsQuerySchema)) query: StudentResultsQuery,
  ): Promise<StudentResultsPage> {
    return this.releases.list(student.studentId, query);
  }

  @Get(':id')
  get(@CurrentStudent() student: StudentContext, @Param('id', UuidParamPipe) id: string) {
    return this.releases.get(student.studentId, id);
  }
}
