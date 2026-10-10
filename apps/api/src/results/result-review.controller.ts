import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@docversity/types';
import {
  resultImportContextOptionsSchema,
  reviewActionSchema,
  reviewPolicySchema,
  reviewQuerySchema,
  reviewQueueSchema,
  reviewedResultSchema,
  reviewVersionSchema,
  reviewReceiptSchema,
  type ReviewAction,
  type ReviewQuery,
} from '@docversity/validation';
import { CurrentAuth, RequirePermissions, type AuthContext } from '../auth/auth.decorators.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { UuidParamPipe } from '../common/uuid-param.pipe.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ResultReviewService } from './result-review.service.js';
@ApiTags('result-review')
@ApiCookieAuth('session')
@RequirePermissions(PERMISSIONS.resultsRead)
@Controller('result-review')
export class ResultReviewController {
  constructor(private readonly service: ResultReviewService) {}
  @Get('contexts')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: resultImportContextOptionsSchema })
  contexts() {
    return this.service.contexts();
  }
  @Get('policy')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: reviewPolicySchema })
  policy() {
    return this.service.policy();
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: reviewQueueSchema })
  list(@Query(new ZodValidationPipe(reviewQuerySchema)) q: ReviewQuery) {
    return this.service.list(q);
  }
  @Get(':id/versions/:eventId')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: reviewVersionSchema })
  version(
    @Param('id', UuidParamPipe) id: string,
    @Param('eventId', UuidParamPipe) eventId: string,
  ) {
    return this.service.version(id, eventId);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ standardSchema: reviewedResultSchema })
  get(@Param('id', UuidParamPipe) id: string) {
    return this.service.get(id);
  }
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(reviewActionSchema) })
  @ApiOkResponse({ standardSchema: reviewReceiptSchema })
  @RequirePermissions(PERMISSIONS.resultsWrite)
  submit(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reviewActionSchema)) body: ReviewAction,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'SUBMIT', body, auth.user.id);
  }
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(reviewActionSchema) })
  @ApiOkResponse({ standardSchema: reviewReceiptSchema })
  @RequirePermissions(PERMISSIONS.resultsReview)
  return(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reviewActionSchema)) body: ReviewAction,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'RETURN', body, auth.user.id);
  }
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(reviewActionSchema) })
  @ApiOkResponse({ standardSchema: reviewReceiptSchema })
  @RequirePermissions(PERMISSIONS.resultsReview)
  reject(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reviewActionSchema)) body: ReviewAction,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'REJECT', body, auth.user.id);
  }
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(reviewActionSchema) })
  @ApiOkResponse({ standardSchema: reviewReceiptSchema })
  @RequirePermissions(PERMISSIONS.resultsApprove)
  approve(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(reviewActionSchema)) body: ReviewAction,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.service.transition(id, 'APPROVE', body, auth.user.id);
  }
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiSecurity('csrf')
  @ApiBody({ schema: openApiRequestSchema(reviewActionSchema) })
  @RequirePermissions(PERMISSIONS.resultsPublish)
  publish(
    @Param('id', UuidParamPipe) _id: string,
    @Body(new ZodValidationPipe(reviewActionSchema)) _body: ReviewAction,
  ) {
    return this.service.publish();
  }
}
