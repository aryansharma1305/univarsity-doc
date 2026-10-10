import { z } from 'zod';
import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  commitDraftImportSchema,
  draftAuditSchema,
  draftImportOutcomeSchema,
  draftImportPlanSchema,
  draftListSchema,
  draftLookupResponseSchema,
  draftLookupSchema,
  savedDraftSchema,
  saveDraftSchema,
  type CommitDraftImport,
  type DraftLookup,
  type DraftLookupResponse,
  type SaveDraft,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DraftResultsService } from './draft-results.service.js';

@ApiTags('draft-results')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.resultsRead)
@Controller('draft-results')
export class DraftResultsController {
  constructor(private readonly service: DraftResultsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: draftListSchema })
  list(@Query('examinationId', new ZodValidationPipe(z.uuid().optional())) examinationId?: string) {
    return this.service.list(examinationId);
  }
  @Header('Cache-Control', 'no-store')
  @Post('lookup')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(draftLookupSchema) })
  @RequirePermissions(PERMISSIONS.resultsWrite)
  @ApiCreatedResponse({ standardSchema: draftLookupResponseSchema })
  lookup(
    @Body(new ZodValidationPipe(draftLookupSchema)) input: DraftLookup,
  ): Promise<DraftLookupResponse> {
    return this.service.lookup(input);
  }
  @Header('Cache-Control', 'no-store')
  @Post()
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(saveDraftSchema) })
  @RequirePermissions(PERMISSIONS.resultsWrite)
  @ApiCreatedResponse({ standardSchema: savedDraftSchema })
  save(
    @Body(new ZodValidationPipe(saveDraftSchema)) input: SaveDraft,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.save(input, auth.user.id);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: savedDraftSchema })
  get(@Param('id', UuidParamPipe) id: string) {
    return this.service.get(id);
  }
  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: draftAuditSchema })
  history(@Param('id', UuidParamPipe) id: string) {
    return this.service.history(id);
  }
  @Header('Cache-Control', 'no-store')
  @Post('imports/:id/plan')
  @ApiSecurity('csrf')
  @RequirePermissions(PERMISSIONS.importsResultsRun, PERMISSIONS.resultsWrite)
  @ApiCreatedResponse({ standardSchema: draftImportPlanSchema })
  plan(@Param('id', UuidParamPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.service.plan(id, auth.user.id);
  }
  @Header('Cache-Control', 'no-store')
  @Post('imports/:id/commit')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(commitDraftImportSchema) })
  @RequirePermissions(PERMISSIONS.importsResultsRun, PERMISSIONS.resultsWrite)
  @ApiCreatedResponse({ standardSchema: draftImportOutcomeSchema })
  commit(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(commitDraftImportSchema)) input: CommitDraftImport,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.commit(id, auth.user.id, input);
  }
}
