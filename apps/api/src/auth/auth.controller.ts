import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  authUserSchema,
  type AuthUser,
  changePasswordRequestSchema,
  type ChangePasswordRequest,
  csrfTokenResponseSchema,
  errorResponseSchema,
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
  loginRequestSchema,
  type LoginRequest,
  mfaEnrollmentConfirmRequestSchema,
  type MfaEnrollmentConfirmRequest,
  mfaEnrollmentConfirmResponseSchema,
  type MfaEnrollmentConfirmResponse,
  mfaEnrollmentStartResponseSchema,
  type MfaEnrollmentStartResponse,
  mfaVerifyRequestSchema,
  type MfaVerifyRequest,
  okResponseSchema,
  resetPasswordRequestSchema,
  type ResetPasswordRequest,
  sessionListResponseSchema,
  type SessionSummary,
} from '@docversity/validation';
import type { Request, Response } from 'express';
import { Errors } from '../common/app-error.js';
import { openApiRequestSchema } from '../common/openapi.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import {
  ALL_STAFF_STEPS,
  AllowDuringStep,
  type AuthContext,
  CsrfPreAuth,
  CurrentAuth,
  OptionalAuth,
  Public,
} from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import {
  cookieNames,
  preAuthCsrfCookieOptions,
  readCookie,
  sessionCookieOptions,
} from './cookies.js';
import { CsrfService } from './csrf.service.js';
import { MfaService } from './mfa.service.js';

const SESSION_AUTH = 'session';
const CSRF_AUTH = 'csrf';
const errorResponse = { standardSchema: errorResponseSchema };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly csrf: CsrfService,
    private readonly mfa: MfaService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Get('csrf')
  @Public('optional')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @ApiOperation({
    summary: 'Get a CSRF token',
    description:
      'Signed in: returns the session CSRF token. Signed out: sets an HttpOnly pre-authentication ' +
      'cookie and returns the matching token for login/password reset. Send it as `X-CSRF-Token` ' +
      'on every POST/PUT/PATCH/DELETE.',
  })
  @ApiOkResponse({ standardSchema: csrfTokenResponseSchema })
  getCsrfToken(
    @OptionalAuth() auth: AuthContext | undefined,
    @Res({ passthrough: true }) res: Response,
  ): { csrfToken: string } {
    res.setHeader('Cache-Control', 'no-store');
    if (auth) return { csrfToken: this.csrf.sessionToken(auth.sessionId) };
    const token = this.csrf.createPreAuthToken();
    res.cookie(cookieNames(this.config).preAuthCsrf, token, preAuthCsrfCookieOptions(this.config));
    return { csrfToken: token };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public('optional')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @CsrfPreAuth()
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Sign in (staff only)',
    description:
      'On success sets the HttpOnly session cookie and returns the user. Every failure returns the ' +
      'same AUTH_INVALID_CREDENTIALS error. Throttled per account+IP, per account and per IP (429). ' +
      'If `nextStep` is set the session is restricted to that step: MFA_VERIFY (POST /auth/mfa/verify, ' +
      'a 5-minute pending session), PASSWORD_CHANGE (POST /auth/password) or MFA_ENROLL ' +
      '(POST /auth/mfa/enrollment). Other routes answer 403 with the matching error code.',
  })
  @ApiBody({ schema: openApiRequestSchema(loginRequestSchema) })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiResponse({ status: 401, description: 'Invalid credentials', ...errorResponse })
  @ApiResponse({ status: 403, description: 'Missing/invalid CSRF token', ...errorResponse })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts (see Retry-After)',
    ...errorResponse,
  })
  @ApiResponse({
    status: 503,
    description: 'Session storage unavailable (fails closed)',
    ...errorResponse,
  })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const names = cookieNames(this.config);
    const { sessionId, user } = await this.auth.login(body, {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.header('user-agent'),
      existingSessionId: readCookie(req, names.session),
    });
    res.cookie(names.session, sessionId, sessionCookieOptions(this.config));
    res.clearCookie(names.preAuthCsrf, preAuthCsrfCookieOptions(this.config));
    res.setHeader('Cache-Control', 'no-store');
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Public('optional')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @ApiSecurity(CSRF_AUTH)
  @ApiCookieAuth(SESSION_AUTH)
  @ApiOperation({
    summary: 'Sign out',
    description: 'Ends the current session and clears the cookie. Succeeds even without a session.',
  })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  async logout(
    @OptionalAuth() auth: AuthContext | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.auth.logout(auth);
    res.clearCookie(cookieNames(this.config).session, sessionCookieOptions(this.config));
    return { ok: true };
  }

  @Get('me')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @ApiCookieAuth(SESSION_AUTH)
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiResponse({ status: 401, description: 'Not signed in or session ended', ...errorResponse })
  me(@CurrentAuth() auth: AuthContext): AuthUser {
    return this.auth.currentUser(auth);
  }

  @Get('sessions')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiOperation({ summary: "The signed-in user's active sessions" })
  @ApiOkResponse({ standardSchema: sessionListResponseSchema })
  async listSessions(@CurrentAuth() auth: AuthContext): Promise<{ sessions: SessionSummary[] }> {
    return { sessions: await this.auth.listSessions(auth) };
  }

  @Delete('sessions/:sessionId')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({ summary: 'Revoke one of your sessions (by its public id)' })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  @ApiResponse({ status: 404, description: 'No such session', ...errorResponse })
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('sessionId') sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw Errors.notFound();
    const { wasCurrent } = await this.auth.revokeSession(auth, sessionId);
    if (wasCurrent)
      res.clearCookie(cookieNames(this.config).session, sessionCookieOptions(this.config));
    return { ok: true };
  }

  @Delete('sessions')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({ summary: 'Revoke all of your other sessions (keeps this one)' })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  async revokeOtherSessions(@CurrentAuth() auth: AuthContext): Promise<{ ok: true }> {
    await this.auth.revokeOtherSessions(auth);
    return { ok: true };
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @AllowDuringStep('PASSWORD_CHANGE')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Change your password (revokes your other sessions)',
    description:
      'Also completes a required first-login / access-reset password change. The new password must ' +
      'differ from the current one.',
  })
  @ApiBody({ schema: openApiRequestSchema(changePasswordRequestSchema) })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  @ApiResponse({ status: 400, description: 'Password policy not met', ...errorResponse })
  @ApiResponse({ status: 401, description: 'Current password incorrect', ...errorResponse })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(auth, body);
    return { ok: true };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Public('optional')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @CsrfPreAuth()
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Answers identically whether or not the account exists. Returns 503 PASSWORD_RESET_UNAVAILABLE ' +
      'for every request while email delivery is not configured.',
  })
  @ApiBody({ schema: openApiRequestSchema(forgotPasswordRequestSchema) })
  @ApiAcceptedResponse({ standardSchema: okResponseSchema })
  @ApiResponse({ status: 503, description: 'Email delivery not configured', ...errorResponse })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.auth.forgotPassword(body.email, req.ip ?? 'unknown');
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Public('optional')
  @AllowDuringStep(...ALL_STAFF_STEPS)
  @CsrfPreAuth()
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({ summary: 'Complete a password reset (single-use token; ends all sessions)' })
  @ApiBody({ schema: openApiRequestSchema(resetPasswordRequestSchema) })
  @ApiOkResponse({ standardSchema: okResponseSchema })
  @ApiResponse({
    status: 400,
    description: 'Invalid/expired token or weak password',
    ...errorResponse,
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
  ): Promise<{ ok: true }> {
    await this.auth.resetPassword(body);
    return { ok: true };
  }

  @Post('mfa/enrollment')
  @HttpCode(HttpStatus.OK)
  @AllowDuringStep('MFA_ENROLL')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Start authenticator-app (TOTP) enrollment',
    description:
      'Generates a new secret and returns it once (base32 + otpauth URI + QR). It becomes active only ' +
      'after POST /auth/mfa/enrollment/confirm with a valid code (within 10 minutes).',
  })
  @ApiOkResponse({ standardSchema: mfaEnrollmentStartResponseSchema })
  @ApiResponse({ status: 409, description: 'MFA already enabled', ...errorResponse })
  @ApiResponse({ status: 503, description: 'MFA not configured on this server', ...errorResponse })
  async startMfaEnrollment(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaEnrollmentStartResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.mfa.startEnrollment(auth);
  }

  @Post('mfa/enrollment/confirm')
  @HttpCode(HttpStatus.OK)
  @AllowDuringStep('MFA_ENROLL')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Confirm enrollment with your current password and a current code',
    description:
      'Re-authenticates with the current password (throttled like sign-in), activates MFA, returns ' +
      'single-use recovery codes ONCE, replaces the session cookie with a new session ID and ends ' +
      'your other sessions. Requires a live enrollment (started within 10 minutes), checked before ' +
      'the password. Once MFA is enabled the codes are always returned; if the session could not be ' +
      'rotated, `reauthenticate` is true, the cookie is cleared and the client must sign in again.',
  })
  @ApiBody({ schema: openApiRequestSchema(mfaEnrollmentConfirmRequestSchema) })
  @ApiOkResponse({ standardSchema: mfaEnrollmentConfirmResponseSchema })
  @ApiResponse({ status: 400, description: 'Enrollment expired', ...errorResponse })
  @ApiResponse({
    status: 401,
    description: 'Current password incorrect, invalid code or session expired',
    ...errorResponse,
  })
  @ApiResponse({ status: 429, description: 'Too many attempts', ...errorResponse })
  async confirmMfaEnrollment(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(mfaEnrollmentConfirmRequestSchema))
    body: MfaEnrollmentConfirmRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaEnrollmentConfirmResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId, result } = await this.mfa.confirmEnrollment(auth, body, {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.header('user-agent'),
    });
    const name = cookieNames(this.config).session;
    // No rotated session (reauthenticate: true): MFA is on and the codes are returned, but the old
    // session is gone and the client must sign in again.
    if (sessionId) res.cookie(name, sessionId, sessionCookieOptions(this.config));
    else res.clearCookie(name, sessionCookieOptions(this.config));
    return result;
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @AllowDuringStep('MFA_VERIFY')
  @ApiCookieAuth(SESSION_AUTH)
  @ApiSecurity(CSRF_AUTH)
  @ApiOperation({
    summary: 'Second sign-in step: authenticator code or recovery code',
    description:
      'Only for a pending (MFA_VERIFY) session. Each 30-second code works once (±1 step accepted); ' +
      'each recovery code works once. On success the pending session is replaced by a new full ' +
      'session cookie. Throttled with the dedicated MFA_* limits (429 AUTH_RATE_LIMITED); repeated ' +
      'wrong codes lock verification for the account (429 MFA_LOCKED) until the cool-down ends or ' +
      'an administrator resets access.',
  })
  @ApiBody({ schema: openApiRequestSchema(mfaVerifyRequestSchema) })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiResponse({ status: 401, description: 'Invalid or reused code', ...errorResponse })
  @ApiResponse({ status: 409, description: 'Verification already in progress', ...errorResponse })
  @ApiResponse({ status: 429, description: 'Too many attempts or locked', ...errorResponse })
  async verifyMfa(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUser> {
    const { sessionId, user } = await this.mfa.verifyLogin(auth, body, {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.header('user-agent'),
    });
    res.cookie(cookieNames(this.config).session, sessionId, sessionCookieOptions(this.config));
    res.setHeader('Cache-Control', 'no-store');
    return user;
  }
}
