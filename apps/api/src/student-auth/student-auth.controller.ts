import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  csrfTokenResponseSchema,
  errorResponseSchema,
  okResponseSchema,
  type StudentActivateRequest,
  studentActivateRequestSchema,
  type StudentLoginRequest,
  studentLoginRequestSchema,
  type StudentMe,
  studentMeSchema,
} from '@docversity/validation';
import type { Request, Response } from 'express';
import { CsrfPreAuth } from '../auth/auth.decorators.js';
import {
  cookieNames,
  preAuthCsrfCookieOptions,
  readCookie,
  sessionCookieOptions,
} from '../auth/cookies.js';
import { CsrfService } from '../auth/csrf.service.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import {
  CurrentStudent,
  OptionalStudent,
  type StudentContext,
  StudentRoute,
} from './student-auth.decorators.js';
import { StudentAuthService, type StudentClientInfo } from './student-auth.service.js';

const STUDENT_SESSION = 'studentSession';
const CSRF_AUTH = 'csrf';
const errorResponse = { standardSchema: errorResponseSchema };

function clientInfo(req: Request, config: ApiConfig): StudentClientInfo {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.header('user-agent'),
    existingSessionId: readCookie(req, cookieNames(config).studentSession),
  };
}

/** Student portal sign-in (Phase 6). Separate endpoints, cookie and session store from staff auth. */
@ApiTags('student-auth')
@Controller('student-auth')
export class StudentAuthController {
  constructor(
    private readonly auth: StudentAuthService,
    private readonly csrf: CsrfService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get('csrf')
  @StudentRoute('optional')
  @ApiOperation({
    summary: 'Get a CSRF token for the student portal',
    description:
      'Signed in: the student session token. Signed out: a pre-authentication token (and cookie) for activation/login.',
  })
  @ApiOkResponse({ standardSchema: csrfTokenResponseSchema })
  getCsrfToken(
    @OptionalStudent() student: StudentContext | undefined,
    @Res({ passthrough: true }) res: Response,
  ): { csrfToken: string } {
    res.setHeader('Cache-Control', 'no-store');
    if (student) return { csrfToken: this.csrf.sessionToken(student.sessionId) };
    const token = this.csrf.createPreAuthToken();
    res.cookie(cookieNames(this.config).preAuthCsrf, token, preAuthCsrfCookieOptions(this.config));
    return { csrfToken: token };
  }

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @StudentRoute('optional')
  @CsrfPreAuth()
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Activate (or recover) a student account with a university-issued activation code',
    description:
      'Registration number + single-use activation code + new password. Every failure returns the same STUDENT_ACTIVATION_FAILED error; throttled per registration and per IP.',
  })
  @ApiBody({ schema: openApiRequestSchema(studentActivateRequestSchema) })
  @ApiOkResponse({ standardSchema: studentMeSchema })
  @ApiResponse({ status: 400, description: 'Activation failed / weak password', ...errorResponse })
  @ApiResponse({ status: 429, description: 'Too many attempts', ...errorResponse })
  async activate(
    @Body(new ZodValidationPipe(studentActivateRequestSchema)) body: StudentActivateRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentMe> {
    const { sessionId, me } = await this.auth.activate(body, clientInfo(req, this.config));
    return this.signedIn(res, sessionId, me);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @StudentRoute('optional')
  @CsrfPreAuth()
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({ summary: 'Student sign-in (registration number + password)' })
  @ApiBody({ schema: openApiRequestSchema(studentLoginRequestSchema) })
  @ApiOkResponse({ standardSchema: studentMeSchema })
  @ApiResponse({ status: 401, description: 'Invalid credentials', ...errorResponse })
  @ApiResponse({ status: 429, description: 'Too many attempts', ...errorResponse })
  async login(
    @Body(new ZodValidationPipe(studentLoginRequestSchema)) body: StudentLoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentMe> {
    const { sessionId, me } = await this.auth.login(body, clientInfo(req, this.config));
    return this.signedIn(res, sessionId, me);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @StudentRoute('optional')
  @ApiSecurity(CSRF_AUTH)
  @ApiCookieAuth(STUDENT_SESSION)
  @ApiOperation({ summary: 'Student sign-out' })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  async logout(
    @OptionalStudent() student: StudentContext | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(student);
    res.clearCookie(cookieNames(this.config).studentSession, sessionCookieOptions(this.config));
    return { ok: true };
  }

  private signedIn(res: Response, sessionId: string, me: StudentMe): StudentMe {
    const names = cookieNames(this.config);
    res.cookie(names.studentSession, sessionId, sessionCookieOptions(this.config));
    res.clearCookie(names.preAuthCsrf, preAuthCsrfCookieOptions(this.config));
    res.setHeader('Cache-Control', 'no-store');
    return me;
  }
}

/** The signed-in student's own data. Every query is scoped by the session — never by a URL id. */
@ApiTags('student')
@ApiCookieAuth(STUDENT_SESSION)
@StudentRoute()
@Controller('student')
export class StudentController {
  constructor(private readonly auth: StudentAuthService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in student: own profile and registrations' })
  @ApiOkResponse({ standardSchema: studentMeSchema })
  @ApiResponse({ status: 401, description: 'Not signed in as a student', ...errorResponse })
  async me(
    @CurrentStudent() student: StudentContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentMe> {
    res.setHeader('Cache-Control', 'no-store');
    return this.auth.me(student.studentId, student.accountId);
  }
}
