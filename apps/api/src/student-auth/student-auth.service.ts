import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  normalizeRegistrationNumber,
  passwordPolicyViolations,
  type StudentActivateRequest,
  type StudentLoginRequest,
  type StudentMe,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { summariseUserAgent } from '../auth/device-summary.js';
import { IdentifierHasher, safeEqual } from '../auth/identifier-hasher.js';
import { PasswordService } from '../auth/password.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { toDateOnly } from '../common/dates.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { hashActivationCode } from './activation-codes.js';
import type { StudentContext } from './student-auth.decorators.js';
import { StudentSessionStore } from './student-session.store.js';

export interface StudentClientInfo {
  ip: string;
  userAgent: string | undefined;
  /** An existing student session cookie, revoked on sign-in (session fixation defence). */
  existingSessionId: string | undefined;
}

/** One answer for every activation failure, so it never reveals which part was wrong. */
function activationFailed(): AppError {
  return new AppError(
    HttpStatus.BAD_REQUEST,
    ERROR_CODES.studentActivationFailed,
    'The registration number or activation code is not valid, or the code has expired or been used. Check them or ask the university for a new code.',
  );
}

/**
 * Student portal authentication (Phase 6). A separate principal from staff: accounts live in
 * `student_accounts`, sessions in their own Redis namespace and cookie, and nothing here can grant a
 * staff permission. Ownership of a registration is proven by a university-issued single-use
 * activation code — the registration number alone is never sufficient.
 */
@Injectable()
export class StudentAuthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: StudentSessionStore,
    private readonly rateLimiter: RateLimiter,
    private readonly hasher: IdentifierHasher,
    private readonly audit: AuditService,
  ) {}

  /**
   * Redeems an activation code: creates the student's account (or, for an existing account, sets a
   * new password — the same proof serves account recovery), consumes the code and signs the student
   * in. Every failure returns the same generic error; repeated wrong codes revoke the open code.
   */
  async activate(
    input: StudentActivateRequest,
    client: StudentClientInfo,
  ): Promise<{ sessionId: string; me: StudentMe }> {
    const normalized = normalizeRegistrationNumber(input.registrationNumber);
    const registrationHash = this.hasher.hash('student-registration', normalized);
    const ipHash = this.hasher.hash('ip', client.ip);
    const limit = await this.rateLimiter.hit(
      'student-activation',
      [
        { key: `registration:${registrationHash}`, limit: 5 },
        { key: `ip:${ipHash}`, limit: 30 },
      ],
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (limit.limited) {
      if (limit.justExceeded)
        await this.auditFailure(null, 'rate_limited', registrationHash, ipHash);
      throw Errors.rateLimited(limit.retryAfterSeconds);
    }

    const codeHash = hashActivationCode(this.config.SESSION_SECRET, input.activationCode);
    const registration = await this.prisma.client.studentRegistration.findUnique({
      where: { registrationNumberNormalized: normalized },
      select: {
        id: true,
        status: true,
        studentId: true,
        student: { select: { fullName: true, account: { select: { id: true, status: true } } } },
        activationCodes: {
          where: { usedAt: null, revokedAt: null },
          select: { id: true, codeHash: true, expiresAt: true, failedAttempts: true },
        },
      },
    });
    const open = registration?.activationCodes[0];
    if (!registration || !open) {
      await this.auditFailure(
        registration?.id ?? null,
        registration ? 'no_open_code' : 'unknown_registration',
        registrationHash,
        ipHash,
      );
      throw activationFailed();
    }
    if (!safeEqual(open.codeHash, codeHash)) {
      const attempts = open.failedAttempts + 1;
      const revoke = attempts >= this.config.STUDENT_ACTIVATION_MAX_FAILED_ATTEMPTS;
      await this.prisma.client.studentActivationCode.update({
        where: { id: open.id },
        data: { failedAttempts: attempts, ...(revoke ? { revokedAt: new Date() } : {}) },
      });
      await this.auditFailure(
        registration.id,
        revoke ? 'wrong_code_revoked' : 'wrong_code',
        registrationHash,
        ipHash,
      );
      throw activationFailed();
    }
    const account = registration.student.account;
    if (
      open.expiresAt.getTime() <= Date.now() ||
      registration.status === 'REVOKED' ||
      account?.status === 'DISABLED'
    ) {
      await this.auditFailure(
        registration.id,
        'code_expired_or_not_allowed',
        registrationHash,
        ipHash,
      );
      throw activationFailed();
    }

    // Policy is checked before the code is consumed, so a weak password does not burn the code.
    const problems = passwordPolicyViolations(input.password, {
      displayName: registration.student.fullName,
    });
    if (problems.length > 0) {
      throw new AppError(
        HttpStatus.BAD_REQUEST,
        ERROR_CODES.authPasswordPolicy,
        'Choose a stronger password.',
        {
          details: problems.map((problem) => ({
            path: 'password',
            message: `Password ${problem}.`,
          })),
        },
      );
    }
    const passwordHash = await this.passwords.hashPassword(input.password);

    const accountId = await this.prisma.client.$transaction(async (tx) => {
      // Consume the code exactly once (compare-and-set).
      const consumed = await tx.studentActivationCode.updateMany({
        where: { id: open.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw activationFailed();
      const now = new Date();
      const saved = account
        ? await tx.studentAccount.update({
            where: { id: account.id },
            data: { passwordHash, passwordChangedAt: now, status: 'ACTIVE', statusReason: null },
          })
        : await tx.studentAccount.create({
            data: {
              studentId: registration.studentId,
              passwordHash,
              activatedAt: now,
              passwordChangedAt: now,
            },
          });
      await this.audit.writeAuditEvent(
        {
          actorUserId: null,
          action: AUDIT_ACTIONS.studentAccountActivated,
          entityType: 'StudentAccount',
          entityId: saved.id,
          metadata: {
            studentId: registration.studentId,
            registrationId: registration.id,
            recovery: account !== null,
            ipHash,
          },
        },
        tx,
      );
      return saved.id;
    });

    // A recovered account starts fresh: every other session ends.
    if (account) await this.sessions.revokeAllForUser(account.id);
    if (client.existingSessionId) await this.sessions.revoke(client.existingSessionId);
    await this.rateLimiter.clear('student-activation', [`registration:${registrationHash}`]);
    const device = summariseUserAgent(client.userAgent);
    const { sessionId } = await this.sessions.create({ userId: accountId, device, ipHash });
    return { sessionId, me: await this.me(registration.studentId, accountId) };
  }

  /**
   * Signs a student in with any of their registration numbers + password. Unknown numbers, accounts
   * that are not activated, wrong passwords and locked/disabled accounts all get the same answer,
   * and unknown accounts still pay the Argon2 cost.
   */
  async login(
    input: StudentLoginRequest,
    client: StudentClientInfo,
  ): Promise<{ sessionId: string; me: StudentMe }> {
    const normalized = normalizeRegistrationNumber(input.registrationNumber);
    const registrationHash = this.hasher.hash('student-registration', normalized);
    const ipHash = this.hasher.hash('ip', client.ip);
    const pairKey = this.hasher.hash('student-registration-ip', `${normalized}|${client.ip}`);
    const limit = await this.rateLimiter.hit(
      'student-login',
      [
        { key: `pair:${pairKey}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP },
        { key: `account:${registrationHash}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_ACCOUNT },
        { key: `ip:${ipHash}`, limit: this.config.LOGIN_MAX_ATTEMPTS_PER_IP },
      ],
      this.config.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    );
    if (limit.limited) {
      if (limit.justExceeded)
        await this.auditLoginFailure(null, 'rate_limited', registrationHash, ipHash);
      throw Errors.rateLimited(limit.retryAfterSeconds);
    }

    const registration = await this.prisma.client.studentRegistration.findUnique({
      where: { registrationNumberNormalized: normalized },
      select: { studentId: true, student: { select: { account: true } } },
    });
    const account = registration?.student.account ?? null;
    const valid = account
      ? await this.passwords.verifyPassword(account.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);
    if (!registration || !account || !valid || account.status !== 'ACTIVE') {
      const reason = !account
        ? 'no_account'
        : !valid
          ? 'invalid_password'
          : `account_${account.status.toLowerCase()}`;
      await this.auditLoginFailure(account?.id ?? null, reason, registrationHash, ipHash);
      throw Errors.invalidCredentials();
    }

    await this.rateLimiter.clear('student-login', [
      `pair:${pairKey}`,
      `account:${registrationHash}`,
    ]);
    if (client.existingSessionId) await this.sessions.revoke(client.existingSessionId);
    const device = summariseUserAgent(client.userAgent);
    const { sessionId, record } = await this.sessions.create({
      userId: account.id,
      device,
      ipHash,
    });
    await this.prisma.client.studentAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.studentLoginSuccess,
      entityType: 'StudentAccount',
      entityId: account.id,
      metadata: { sessionHandle: record.publicId, device, ipHash },
    });
    return { sessionId, me: await this.me(registration.studentId, account.id) };
  }

  async logout(student: StudentContext | undefined): Promise<void> {
    if (!student) return;
    await this.sessions.revoke(student.sessionId);
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.studentLogout,
      entityType: 'StudentAccount',
      entityId: student.accountId,
      metadata: { sessionHandle: student.session.publicId },
    });
  }

  /** The signed-in student's own record — always derived from the session, never from input. */
  async me(studentId: string, accountId: string): Promise<StudentMe> {
    const student = await this.prisma.client.student.findUnique({
      where: { id: studentId },
      include: {
        account: true,
        registrations: {
          orderBy: { createdAt: 'desc' },
          include: {
            program: { select: { id: true, code: true, name: true } },
            department: { select: { id: true, code: true, name: true } },
            academicSession: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (student?.account?.id !== accountId) throw Errors.sessionExpired();
    return {
      account: {
        id: student.account.id,
        status: student.account.status,
        activatedAt: student.account.activatedAt.toISOString(),
      },
      student: {
        id: student.id,
        fullName: student.fullName,
        fatherName: student.fatherName,
        motherName: student.motherName,
        dateOfBirth: toDateOnly(student.dateOfBirth),
        gender: student.gender,
        hasPhoto: student.photoStorageKey !== null,
      },
      registrations: student.registrations.map((registration) => ({
        id: registration.id,
        registrationNumber: registration.registrationNumber,
        rollReferenceNumber: registration.rollReferenceNumber,
        program: registration.program,
        department: registration.department,
        academicSession: registration.academicSession,
        admissionDate: toDateOnly(registration.admissionDate),
        completionDate: toDateOnly(registration.completionDate),
        status: registration.status,
      })),
    };
  }

  private async auditFailure(
    registrationId: string | null,
    reason: string,
    registrationHash: string,
    ipHash: string,
  ): Promise<void> {
    // Never the code, never the raw registration number or IP — only keyed hashes for correlation.
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.studentActivationFailed,
      entityType: 'StudentRegistration',
      entityId: registrationId,
      metadata: { reason, registrationHash, ipHash },
    });
  }

  private async auditLoginFailure(
    accountId: string | null,
    reason: string,
    registrationHash: string,
    ipHash: string,
  ): Promise<void> {
    await this.audit.writeAuditEvent({
      actorUserId: null,
      action: AUDIT_ACTIONS.studentLoginFailure,
      entityType: 'StudentAccount',
      entityId: accountId,
      metadata: { reason, registrationHash, ipHash },
    });
  }
}
