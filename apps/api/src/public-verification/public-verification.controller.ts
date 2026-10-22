import { Body, Controller, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  publicVerificationRequestSchema,
  unavailableVerificationResponseSchema,
  type PublicVerificationService,
} from '@docversity/validation';
import { Public } from '../auth/auth.decorators.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { Errors } from '../common/app-error.js';
import { PublicVerificationGuard } from './public-verification.guard.js';
import { PublicVerificationServiceHandler } from './public-verification.service.js';

@ApiTags('public-verification')
@Public()
@UseGuards(PublicVerificationGuard)
@Controller('public/verify')
export class PublicVerificationController {
  constructor(private readonly service: PublicVerificationServiceHandler) {}
  // Explicit routes: no enumeration, listing, URL fetching or arbitrary lookup types.
  @Post('result')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(publicVerificationRequestSchema) })
  @ApiOkResponse({ standardSchema: unavailableVerificationResponseSchema })
  result(@Body() body: unknown, @Query() query: Record<string, unknown>, @Req() req: Request) {
    return this.check('result', body, query, req);
  }
  @Post('registration')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(publicVerificationRequestSchema) })
  @ApiOkResponse({ standardSchema: unavailableVerificationResponseSchema })
  registration(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.check('registration', body, query, req);
  }
  @Post('certificate')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(publicVerificationRequestSchema) })
  @ApiOkResponse({ standardSchema: unavailableVerificationResponseSchema })
  certificate(@Body() body: unknown, @Query() query: Record<string, unknown>, @Req() req: Request) {
    return this.check('certificate', body, query, req);
  }
  @Post('admission-letter')
  @HttpCode(200)
  @ApiBody({ schema: openApiRequestSchema(publicVerificationRequestSchema) })
  @ApiOkResponse({ standardSchema: unavailableVerificationResponseSchema })
  admissionLetter(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.check('admission-letter', body, query, req);
  }

  private check(
    service: PublicVerificationService,
    body: unknown,
    query: Record<string, unknown>,
    req: Request,
  ) {
    const parsed = publicVerificationRequestSchema.safeParse(body);
    // Generic validation details never echo unknown user-controlled field names or values.
    if (!parsed.success || Object.keys(query).length)
      throw Errors.validation([
        {
          path: 'request',
          message:
            'Use contract version 1 and a valid reference only. Query parameters are not accepted.',
        },
      ]);
    return this.service.check(service, parsed.data, req.ip ?? 'unknown');
  }
}
