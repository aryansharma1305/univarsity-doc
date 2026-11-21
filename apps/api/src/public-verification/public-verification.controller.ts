import { z } from 'zod';
import { officialVerificationResponseSchema } from '@docversity/validation';
import { officialVerificationRequestSchema } from '@docversity/validation';
import { OfficialVerificationService } from './official-verification.service.js';
import { StudentRoute, type StudentRequest } from '../student-auth/student-auth.decorators.js';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
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
import { AnonymousVerificationService } from './anonymous-verification.service.js';
import {
  publicCredentialSchema,
  publicDocumentRequestSchema,
  publicResultOptionsSchema,
  publicResultSearchSchema,
} from '@docversity/validation';

@ApiTags('public-verification')
@Public()
@UseGuards(PublicVerificationGuard)
@Controller('public/verify')
export class PublicVerificationController {
  constructor(
    private readonly service: PublicVerificationServiceHandler,
    private readonly official: OfficialVerificationService,
    private readonly anonymous: AnonymousVerificationService,
  ) {}

  // Anonymous verification (no sign-in). Every disclosure is limited to the course's approved policy.
  @Post('result-options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Courses (and their semesters/years) open to anonymous result search' })
  @ApiBody({ schema: openApiRequestSchema(z.object({ contractVersion: z.literal(2) }).strict()) })
  @ApiOkResponse({ standardSchema: publicResultOptionsSchema })
  resultOptions(@Body() body: unknown, @Query() query: Record<string, unknown>) {
    this.strict(z.object({ contractVersion: z.literal(2) }).strict(), body, query);
    return this.anonymous.resultOptions();
  }
  @Post('result-search')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Course + roll number + semester/year: published status only, never marks',
  })
  @ApiBody({ schema: openApiRequestSchema(publicResultSearchSchema) })
  @ApiOkResponse({ standardSchema: officialVerificationResponseSchema })
  resultSearch(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.anonymous.resultSearch(
      this.strict(publicResultSearchSchema, body, query),
      req.ip ?? 'unknown',
    );
  }
  @Post('result-marksheet')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Full marksheet for the holder of its QR credential (token in the body)',
  })
  @ApiBody({ schema: openApiRequestSchema(publicCredentialSchema) })
  @ApiOkResponse({ standardSchema: officialVerificationResponseSchema })
  resultMarksheet(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.anonymous.marksheet(
      this.strict(publicCredentialSchema, body, query),
      req.ip ?? 'unknown',
    );
  }
  @Post('document')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issued PDF for the holder of its QR credential, where the policy allows',
  })
  @ApiBody({ schema: openApiRequestSchema(publicDocumentRequestSchema) })
  @ApiProduces('application/pdf')
  async document(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bytes = await this.anonymous.document(
      this.strict(publicDocumentRequestSchema, body, query),
      req.ip ?? 'unknown',
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; object-src 'self'; frame-ancestors 'self'",
    );
    return new StreamableFile(bytes, {
      type: 'application/pdf',
      disposition: 'inline; filename="verified-document.pdf"',
      length: bytes.byteLength,
    });
  }

  /** Parses a body against one schema; never echoes unknown field names or values. */
  private strict<T extends z.ZodType>(
    schema: T,
    body: unknown,
    query: Record<string, unknown>,
  ): z.infer<T> {
    const parsed = schema.safeParse(body);
    if (!parsed.success || Object.keys(query).length)
      throw Errors.validation([
        {
          path: 'request',
          message: 'Send only the expected fields. Query parameters are not accepted.',
        },
      ]);
    return parsed.data;
  }
  // Explicit routes: no enumeration, listing, URL fetching or arbitrary lookup types.
  @StudentRoute('optional')
  @Post('result')
  @HttpCode(200)
  @ApiBody({
    schema: openApiRequestSchema(
      z.union([publicVerificationRequestSchema, officialVerificationRequestSchema]),
    ),
  })
  @ApiOkResponse({
    standardSchema: z.union([
      unavailableVerificationResponseSchema,
      officialVerificationResponseSchema,
    ]),
  })
  result(@Body() body: unknown, @Query() query: Record<string, unknown>, @Req() req: Request) {
    return this.check('result', body, query, req);
  }
  @StudentRoute('optional')
  @Post('registration')
  @HttpCode(200)
  @ApiBody({
    schema: openApiRequestSchema(
      z.union([publicVerificationRequestSchema, officialVerificationRequestSchema]),
    ),
  })
  @ApiOkResponse({
    standardSchema: z.union([
      unavailableVerificationResponseSchema,
      officialVerificationResponseSchema,
    ]),
  })
  registration(
    @Body() body: unknown,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.check('registration', body, query, req);
  }
  @Post('certificate')
  @HttpCode(200)
  @ApiBody({
    schema: openApiRequestSchema(
      z.union([publicVerificationRequestSchema, officialVerificationRequestSchema]),
    ),
  })
  @ApiOkResponse({
    standardSchema: z.union([
      unavailableVerificationResponseSchema,
      officialVerificationResponseSchema,
    ]),
  })
  certificate(@Body() body: unknown, @Query() query: Record<string, unknown>, @Req() req: Request) {
    return this.check('certificate', body, query, req);
  }
  @Post('admission-letter')
  @HttpCode(200)
  @ApiBody({
    schema: openApiRequestSchema(
      z.union([publicVerificationRequestSchema, officialVerificationRequestSchema]),
    ),
  })
  @ApiOkResponse({
    standardSchema: z.union([
      unavailableVerificationResponseSchema,
      officialVerificationResponseSchema,
    ]),
  })
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
    const official = officialVerificationRequestSchema.safeParse(body);
    if (official.success && !Object.keys(query).length)
      return this.official.check(
        service,
        official.data,
        req.ip ?? 'unknown',
        (req as StudentRequest).student?.studentId,
      );
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
