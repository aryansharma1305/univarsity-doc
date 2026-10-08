import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { cookieNames, readCookie, sessionCookieOptions } from '../auth/cookies.js';
import { Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  STUDENT_AUTH_KEY,
  type StudentAuthMode,
  type StudentRequest,
} from './student-auth.decorators.js';
import { StudentSessionStore } from './student-session.store.js';

/**
 * Global guard — student authentication, for routes marked `@StudentRoute()` only (all other routes
 * pass through untouched). Reads ONLY the student cookie, from the student session namespace, and
 * reloads the account on every request so locking/disabling takes effect immediately. A staff
 * session cookie is never consulted here, so staff cannot act as students (and the staff AuthGuard
 * never reads the student cookie, so students cannot reach staff routes).
 */
@Injectable()
export class StudentAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: StudentSessionStore,
    private readonly prisma: PrismaService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<StudentAuthMode | undefined>(STUDENT_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!mode) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<StudentRequest>();
    const response = http.getResponse<Response>();
    const cookie = cookieNames(this.config).studentSession;

    const sessionId = readCookie(request, cookie);
    if (!sessionId) {
      if (mode === 'required') throw Errors.authRequired();
      return true;
    }
    const record = await this.sessions.read(sessionId);
    const account = record
      ? await this.prisma.client.studentAccount.findUnique({
          where: { id: record.userId },
          select: { id: true, studentId: true, status: true },
        })
      : null;
    if (!record || account?.status !== 'ACTIVE') {
      if (record) await this.sessions.revokeAllForUser(record.userId);
      response.clearCookie(cookie, sessionCookieOptions(this.config));
      if (mode === 'required') throw Errors.sessionExpired();
      return true;
    }
    const session = await this.sessions.touch(sessionId, record);
    request.student = { sessionId, session, accountId: account.id, studentId: account.studentId };
    return true;
  }
}
