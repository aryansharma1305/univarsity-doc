import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_MODE_KEY } from '../auth/auth.decorators.js';
import { Errors } from '../common/app-error.js';
import type { SessionRecord } from '../auth/session.store.js';

export const STUDENT_AUTH_KEY = 'docversity:student-auth';
export type StudentAuthMode = 'required' | 'optional';

/**
 * Marks a route as part of the STUDENT portal. The staff AuthGuard ignores it (staff sessions are
 * never accepted here) and the StudentAuthGuard requires (or optionally attaches) a student session.
 * Student routes never carry @RequirePermissions: students have no roles or permissions.
 */
export const StudentRoute = (mode: StudentAuthMode = 'required') =>
  applyDecorators(SetMetadata(AUTH_MODE_KEY, 'none'), SetMetadata(STUDENT_AUTH_KEY, mode));

export interface StudentContext {
  /** Raw session ID — internal only; never returned or logged. */
  sessionId: string;
  session: SessionRecord;
  accountId: string;
  studentId: string;
}

export type StudentRequest = Request & { student?: StudentContext };

/** The signed-in student. Throws 401 if absent. */
export const CurrentStudent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StudentContext => {
    const student = context.switchToHttp().getRequest<StudentRequest>().student;
    if (!student) throw Errors.authRequired();
    return student;
  },
);

/** The signed-in student, if any (for `@StudentRoute('optional')`). */
export const OptionalStudent = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StudentContext | undefined =>
    context.switchToHttp().getRequest<StudentRequest>().student,
);
