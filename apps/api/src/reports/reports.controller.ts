import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PERMISSIONS } from '@docversity/types';
import {
  type Report,
  type ReportName,
  type ReportQuery,
  REPORT_QUERY_SCHEMAS,
  reportSchema,
} from '@docversity/validation';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { ApiListQuery } from '../common/api-list-query.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';

const pipe = (name: ReportName) => new ZodValidationPipe(REPORT_QUERY_SCHEMAS[name]);

/**
 * One route per report so each is guarded by its module's read permission; `format=csv` returns
 * the same rows as a download under the same permission.
 */
@ApiTags('reports')
@ApiCookieAuth('session')
@ApiProduces('application/json', 'text/csv')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  private async respond(
    name: ReportName,
    query: ReportQuery,
    response: Response,
  ): Promise<Report | StreamableFile> {
    response.setHeader('Cache-Control', 'no-store');
    if (query.format !== 'csv') return this.service.run(name, query);
    const file = await this.service.csv(name, query);
    return new StreamableFile(file.bytes, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${file.filename}"`,
      length: file.bytes.byteLength,
    });
  }

  @Get('enrolment')
  @RequirePermissions(PERMISSIONS.registrationsRead)
  @ApiOperation({ summary: 'Registrations by course, session and status' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS.enrolment)
  @ApiOkResponse({ standardSchema: reportSchema })
  enrolment(
    @Query(pipe('enrolment')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('enrolment', query, response);
  }

  @Get('certificate-requests')
  @RequirePermissions(PERMISSIONS.certificateRequestsRead)
  @ApiOperation({ summary: 'Certificate requests by type and status (submission date range)' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['certificate-requests'])
  @ApiOkResponse({ standardSchema: reportSchema })
  certificateRequests(
    @Query(pipe('certificate-requests')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('certificate-requests', query, response);
  }

  @Get('issued-documents')
  @RequirePermissions(PERMISSIONS.certificatesRead)
  @ApiOperation({ summary: 'Official documents by type and status (preparation date range)' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['issued-documents'])
  @ApiOkResponse({ standardSchema: reportSchema })
  issuedDocuments(
    @Query(pipe('issued-documents')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('issued-documents', query, response);
  }

  @Get('results')
  @RequirePermissions(PERMISSIONS.resultsRead)
  @ApiOperation({ summary: 'Results by examination and publication status' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS.results)
  @ApiOkResponse({ standardSchema: reportSchema })
  results(
    @Query(pipe('results')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('results', query, response);
  }

  @Get('re-exam-applications')
  @RequirePermissions(PERMISSIONS.reExamApplicationsRead)
  @ApiOperation({ summary: 'Re-examination applications by examination and status' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['re-exam-applications'])
  @ApiOkResponse({ standardSchema: reportSchema })
  reExamApplications(
    @Query(pipe('re-exam-applications')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('re-exam-applications', query, response);
  }

  @Get('verification-activity')
  @RequirePermissions(PERMISSIONS.auditRead)
  @ApiOperation({ summary: 'Public verification lookups by type and outcome' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['verification-activity'])
  @ApiOkResponse({ standardSchema: reportSchema })
  verificationActivity(
    @Query(pipe('verification-activity')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('verification-activity', query, response);
  }

  @Get('student-messages')
  @RequirePermissions(PERMISSIONS.studentMessagesRead)
  @ApiOperation({ summary: 'Student conversations by status (start date range)' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['student-messages'])
  @ApiOkResponse({ standardSchema: reportSchema })
  studentMessages(
    @Query(pipe('student-messages')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('student-messages', query, response);
  }

  @Get('verification-queries')
  @RequirePermissions(PERMISSIONS.verificationQueriesRead)
  @ApiOperation({ summary: 'Verification queries by source, category and status' })
  @ApiListQuery(REPORT_QUERY_SCHEMAS['verification-queries'])
  @ApiOkResponse({ standardSchema: reportSchema })
  verificationQueries(
    @Query(pipe('verification-queries')) query: ReportQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond('verification-queries', query, response);
  }
}
