import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { type Prisma, uniqueConstraintName } from '@docversity/database';
import { type ObjectStorage, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  ERROR_CODES,
  formatMoney,
  isRegionGroup,
  normalizeTransactionReference,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGION_UNAVAILABLE_MESSAGES,
  PAYMENT_REGIONS,
  RE_EXAM_FEE_BLOCKED_MESSAGES,
  RE_EXAM_PAYMENT_RETENTION,
  type ReExamFeeBlockedReason,
  type ReExamPaymentDetail,
  type ReExamPaymentList,
  type ReExamPaymentQuery,
  type ReExamPaymentRow,
  type ReExamPaymentSummary,
  reExamReference,
  type RejectReExamPayment,
  type StartReExamPayment,
  type StudentReExamPayment,
  type StudentReExamPaymentView,
  type SubmitReExamPayment,
  toMinorUnits,
  type VerifyReExamPayment,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { pageArgs, paginationMeta } from '../common/pagination.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { sniffContentType } from '../historical-documents/document-file.js';
import {
  isUsable,
  PaymentDestinationsService,
  resolveAmount,
} from './payment-destinations.service.js';
import { type PreparedFile, prepareEvidence, sha256Of } from './payment-files.js';
import type { UploadedPaymentFile } from './payment-upload.interceptor.js';

const ENTITY = 'ReExamPayment';
const ONE_LIVE_INDEX = 're_exam_payments_one_live_key';
const ONE_REFERENCE_INDEX = 're_exam_payments_one_reference_key';
const LIVE = ['AWAITING_PAYMENT', 'SUBMITTED', 'VERIFIED'] as const;
const MAX_EVIDENCE_READ_BYTES = 8 * 1024 * 1024;
const RATE_WINDOW_SECONDS = 3600;

const STAFF_SUMMARIES: Partial<Record<AuditAction, string>> = {
  RE_EXAM_PAYMENT_STARTED: 'Country/region chosen by the student',
  RE_EXAM_PAYMENT_VOIDED: 'Replaced by another country/region',
  RE_EXAM_PAYMENT_SUBMITTED: 'Transaction reference submitted',
  RE_EXAM_PAYMENT_VERIFIED: 'Payment verified',
  RE_EXAM_PAYMENT_REJECTED: 'Payment not verified',
  RE_EXAM_PAYMENT_EVIDENCE_VIEWED: 'Evidence viewed',
};

const conflict = (message: string, path?: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message, {
    ...(path ? { details: [{ path, message }] } : {}),
  });
const storageUnavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.serviceUnavailable,
    'File storage is temporarily unavailable. Nothing was saved; please try again shortly.',
  );

interface ApplicationCore {
  status: string;
  feeStatus: string;
  feeBlockedReason: string | null;
}

/** Why no payment can be started or submitted for an application (null = it can). */
function applicationBlock(app: ApplicationCore): string | null {
  if (app.status === 'CANCELLED') {
    return 'This application was cancelled, so no payment can be made for it.';
  }
  if (app.status === 'REJECTED') {
    return 'This application was rejected by the university, so no payment can be made for it.';
  }
  if (app.feeStatus !== 'ASSESSED') {
    return app.feeBlockedReason
      ? RE_EXAM_FEE_BLOCKED_MESSAGES[app.feeBlockedReason as ReExamFeeBlockedReason]
      : 'No approved fee is recorded for this application. Payment cannot start.';
  }
  return null;
}

/** The latest non-replaced payment of an application, for display with the application. */
export async function latestPaymentSummary(
  db: Prisma.TransactionClient,
  applicationId: string,
): Promise<ReExamPaymentSummary | null> {
  const payment = await db.reExamPayment.findFirst({
    where: { applicationId, status: { not: 'VOID' } },
    orderBy: { createdAt: 'desc' },
  });
  return payment
    ? {
        id: payment.id,
        status: payment.status,
        region: payment.region,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        submittedAt: payment.submittedAt?.toISOString() ?? null,
        reviewedAt: payment.reviewedAt?.toISOString() ?? null,
      }
    : null;
}

const paymentInclude = {
  application: {
    select: {
      id: true,
      status: true,
      attemptNumber: true,
      studentName: true,
      registrationNumber: true,
      subjectCode: true,
      subjectName: true,
      programName: true,
      academicSessionName: true,
      examinationName: true,
      periodLabel: true,
    },
  },
} as const;
type PaymentRecord = Prisma.ReExamPaymentGetPayload<{ include: typeof paymentInclude }>;

function toRow(p: PaymentRecord): ReExamPaymentRow {
  return {
    id: p.id,
    status: p.status,
    region: p.region,
    amountMinor: p.amountMinor,
    currency: p.currency,
    createdAt: p.createdAt.toISOString(),
    submittedAt: p.submittedAt?.toISOString() ?? null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    application: {
      id: p.application.id,
      reference: reExamReference(p.application.id),
      status: p.application.status,
      attemptNumber: p.application.attemptNumber,
    },
    student: { id: p.studentId, name: p.application.studentName },
    registrationNumber: p.application.registrationNumber,
    subject: { code: p.application.subjectCode, name: p.application.subjectName },
    transactionReference: p.transactionReference,
    hasEvidence: p.evidenceStorageKey !== null,
  };
}

/**
 * Re-exam payments (Phase 9C). Students choose a country/region and pay outside Docversity using the
 * approved details; the obligation (amount, currency, fee-rule and destination versions) is
 * snapshotted when they choose. They then submit a transaction reference (and evidence, if required).
 * Only staff with `reExamPayments.verify` confirm a payment, after checking the university's own
 * account. Payment never approves or rejects the academic application.
 */
@Injectable()
export class ReExamPaymentsService {
  private readonly logger = new Logger(ReExamPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly destinations: PaymentDestinationsService,
    private readonly rateLimiter: RateLimiter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async throttle(scope: string, accountId: string, limit: number) {
    const result = await this.rateLimiter.hit(
      scope,
      [{ key: `account:${accountId}`, limit }],
      RATE_WINDOW_SECONDS,
    );
    if (result.limited) throw Errors.rateLimited(result.retryAfterSeconds);
  }

  // ------------------------------------------------------------------------------------------
  // Student
  // ------------------------------------------------------------------------------------------

  private async ownApplication(db: Prisma.TransactionClient, studentId: string, id: string) {
    // Ownership: another student's application is indistinguishable from a missing one.
    const app = await db.reExamApplication.findFirst({ where: { id, studentId } });
    if (!app) throw Errors.notFound();
    return app;
  }

  async view(studentId: string, applicationId: string): Promise<StudentReExamPaymentView> {
    const db = this.prisma.client;
    const app = await this.ownApplication(db, studentId, applicationId);
    const unavailableReason = applicationBlock(app);
    const now = new Date();
    const approved = unavailableReason
      ? []
      : await db.reExamPaymentDestination.findMany({
          where: { status: 'APPROVED' },
          include: { rates: true },
        });
    const regions = unavailableReason
      ? []
      : PAYMENT_REGIONS.map((region) => {
          const destination = approved.find((d) => d.region === region);
          const reason =
            !destination || !isUsable(destination, now)
              ? ('NOT_CONFIGURED' as const)
              : resolveAmount(destination, app) === null
                ? ('NO_APPROVED_AMOUNT' as const)
                : null;
          return {
            region,
            label: PAYMENT_REGION_LABELS[region],
            isGroup: isRegionGroup(region),
            available: reason === null,
            unavailableReason: reason,
          };
        });
    const payments = await db.reExamPayment.findMany({
      where: { applicationId: app.id },
      include: { destination: true },
      orderBy: { createdAt: 'desc' },
    });
    const toStudent = (p: (typeof payments)[number]): StudentReExamPayment => ({
      id: p.id,
      status: p.status,
      region: p.region,
      amountMinor: p.amountMinor,
      currency: p.currency,
      createdAt: p.createdAt.toISOString(),
      destination: {
        countryName: p.destination.countryName,
        beneficiaryName: p.destination.beneficiaryName,
        method: p.destination.method,
        instructions: p.destination.instructions,
        evidenceRequirement: p.destination.evidenceRequirement,
        available: isUsable(p.destination, now),
      },
      transactionReference: p.transactionReference,
      submittedAt: p.submittedAt?.toISOString() ?? null,
      hasEvidence: p.evidenceStorageKey !== null,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      rejectionReason: p.rejectionReason,
    });
    const current = payments.find((p) => (LIVE as readonly string[]).includes(p.status));
    return {
      application: {
        id: app.id,
        reference: reExamReference(app.id),
        status: app.status,
        studentName: app.studentName,
        registrationNumber: app.registrationNumber,
        programName: app.programName,
        academicSessionName: app.academicSessionName,
        examinationName: app.examinationName,
        examSession: app.examSession,
        periodLabel: app.periodLabel,
        subject: { code: app.subjectCode, name: app.subjectName },
        attemptNumber: app.attemptNumber,
        attemptBasis: app.attemptBasis,
      },
      fee: {
        status: app.feeStatus,
        blockedReason: (app.feeBlockedReason as ReExamFeeBlockedReason | null) ?? null,
        amountMinor: app.feeAmountMinor,
        currency: app.feeCurrency,
        scope: app.feeScope,
        ruleVersion: app.feeRuleVersion,
        assessedAt: app.feeAssessedAt?.toISOString() ?? null,
      },
      unavailableReason,
      regions,
      current: current ? toStudent(current) : null,
      previous: payments.filter((p) => p !== current).map(toStudent),
      retention: RE_EXAM_PAYMENT_RETENTION.description,
    };
  }

  /**
   * The student chooses a country/region: creates the obligation with a snapshotted amount, or
   * replaces an unpaid one from another region. Idempotent for the same destination.
   */
  async start(
    studentId: string,
    accountId: string,
    applicationId: string,
    input: StartReExamPayment,
  ): Promise<StudentReExamPaymentView> {
    await this.throttle('reexam-payment-start', accountId, 30);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`re-exam-payment:${applicationId}`}, 0))`;
        const app = await this.ownApplication(tx, studentId, applicationId);
        const block = applicationBlock(app);
        if (block) throw conflict(block);
        const live = await tx.reExamPayment.findFirst({
          where: { applicationId, status: { in: [...LIVE] } },
        });
        if (live && live.status !== 'AWAITING_PAYMENT') {
          throw conflict(
            live.status === 'VERIFIED'
              ? 'The payment for this application has already been verified.'
              : 'A payment has already been submitted for this application and is awaiting verification.',
          );
        }
        const destination = await tx.reExamPaymentDestination.findFirst({
          where: { region: input.region, status: 'APPROVED' },
          include: { rates: true },
        });
        if (!destination || !isUsable(destination)) {
          throw conflict(PAYMENT_REGION_UNAVAILABLE_MESSAGES.NOT_CONFIGURED, 'region');
        }
        const amount = resolveAmount(destination, app);
        if (!amount || app.feeRuleId === null || app.feeRuleVersion === null) {
          throw conflict(PAYMENT_REGION_UNAVAILABLE_MESSAGES.NO_APPROVED_AMOUNT, 'region');
        }
        if (live?.destinationId === destination.id) return;
        if (live) {
          await tx.reExamPayment.update({
            where: { id: live.id },
            data: {
              status: 'VOID',
              voidedAt: new Date(),
              voidReason: live.region === input.region ? 'DESTINATION_REPLACED' : 'REGION_CHANGED',
            },
          });
          await this.audit.writeAuditEvent(
            {
              actorUserId: null,
              action: AUDIT_ACTIONS.reExamPaymentVoided,
              entityType: ENTITY,
              entityId: live.id,
              metadata: { principal: 'student', accountId, applicationId, toRegion: input.region },
            },
            tx,
          );
        }
        const created = await tx.reExamPayment.create({
          data: {
            applicationId,
            studentId,
            destinationId: destination.id,
            region: destination.region,
            destinationVersion: destination.version,
            attemptNumber: app.attemptNumber,
            feeRuleId: app.feeRuleId,
            feeRuleVersion: app.feeRuleVersion,
            amountSource: amount.source,
            amountMinor: amount.amountMinor,
            currency: destination.currency,
            createdByAccountId: accountId,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: null,
            action: AUDIT_ACTIONS.reExamPaymentStarted,
            entityType: ENTITY,
            entityId: created.id,
            metadata: {
              principal: 'student',
              studentId,
              accountId,
              applicationId,
              region: created.region,
              destinationId: destination.id,
              destinationVersion: destination.version,
              feeRuleVersion: created.feeRuleVersion,
              amountSource: created.amountSource,
              amountMinor: created.amountMinor,
              currency: created.currency,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (uniqueConstraintName(error) === ONE_LIVE_INDEX) {
        throw conflict('A payment for this application is already in progress. Refresh the page.');
      }
      throw error;
    }
    return this.view(studentId, applicationId);
  }

  private async ownPayment(studentId: string, paymentId: string) {
    const payment = await this.prisma.client.reExamPayment.findFirst({
      where: { id: paymentId, studentId },
      include: { destination: true, application: true },
    });
    if (!payment) throw Errors.notFound();
    return payment;
  }

  /** The QR of the student's own unpaid obligation, only while its destination is available. */
  async studentQr(
    studentId: string,
    paymentId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const payment = await this.ownPayment(studentId, paymentId);
    if (
      payment.status !== 'AWAITING_PAYMENT' ||
      applicationBlock(payment.application) !== null ||
      !isUsable(payment.destination)
    ) {
      throw Errors.notFound();
    }
    return this.destinations.qrBytes(payment.destination);
  }

  async submit(
    studentId: string,
    accountId: string,
    paymentId: string,
    input: SubmitReExamPayment,
    file: UploadedPaymentFile | undefined,
  ): Promise<StudentReExamPaymentView> {
    await this.throttle('reexam-payment-submit', accountId, 10);
    const payment = await this.ownPayment(studentId, paymentId);
    if (payment.status !== 'AWAITING_PAYMENT') {
      throw conflict('This payment has already been submitted or replaced.');
    }
    const block = applicationBlock(payment.application);
    if (block) throw conflict(block);
    const evidence = await prepareEvidence(file);
    if (!evidence && payment.destination.evidenceRequirement === 'REQUIRED') {
      throw Errors.validation([
        {
          path: 'evidence',
          message: 'Attach the payment receipt or screenshot (PDF, JPEG or PNG).',
        },
      ]);
    }
    const key = evidence ? await this.storeEvidence(paymentId, evidence) : null;
    const normalized = normalizeTransactionReference(input.transactionReference);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
        const locked = await tx.reExamPayment.findUnique({
          where: { id: paymentId },
          include: { application: true },
        });
        if (locked?.studentId !== studentId) throw Errors.notFound();
        if (locked.status !== 'AWAITING_PAYMENT') {
          throw conflict('This payment has already been submitted or replaced.');
        }
        const lockedBlock = applicationBlock(locked.application);
        if (lockedBlock) throw conflict(lockedBlock);
        await tx.reExamPayment.update({
          where: { id: paymentId },
          data: {
            status: 'SUBMITTED',
            transactionReference: input.transactionReference,
            transactionReferenceNormalized: normalized,
            submittedAt: new Date(),
            submittedByAccountId: accountId,
            ...(evidence && key
              ? {
                  evidenceStorageKey: key,
                  evidenceContentType: evidence.contentType,
                  evidenceSizeBytes: evidence.sizeBytes,
                  evidenceSha256: evidence.sha256,
                }
              : {}),
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: null,
            action: AUDIT_ACTIONS.reExamPaymentSubmitted,
            entityType: ENTITY,
            entityId: paymentId,
            // The reference itself is not copied into the log.
            metadata: {
              principal: 'student',
              accountId,
              applicationId: locked.applicationId,
              hasEvidence: evidence !== null,
              ...(evidence
                ? {
                    evidenceContentType: evidence.contentType,
                    evidenceSizeBytes: evidence.sizeBytes,
                    evidenceSha256: evidence.sha256,
                  }
                : {}),
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (key) await this.storage.deleteObject(key).catch(() => undefined);
      if (uniqueConstraintName(error) === ONE_REFERENCE_INDEX) {
        throw conflict(
          'This transaction reference has already been submitted for another payment. If one transaction paid for several applications, contact the examination office.',
          'transactionReference',
        );
      }
      throw error;
    }
    return this.view(studentId, payment.applicationId);
  }

  private async storeEvidence(paymentId: string, evidence: PreparedFile): Promise<string> {
    const key = objectKeys.reExamPaymentEvidence(paymentId, evidence.extension);
    try {
      await this.storage.putObject(key, evidence.bytes, { contentType: evidence.contentType });
    } catch {
      throw storageUnavailable();
    }
    return key;
  }

  // ------------------------------------------------------------------------------------------
  // Staff
  // ------------------------------------------------------------------------------------------

  private where(query: ReExamPaymentQuery): Prisma.ReExamPaymentWhereInput {
    const normalized = query.search ? normalizeTransactionReference(query.search) : '';
    return {
      AND: [
        query.status ? { status: query.status } : {},
        query.region ? { region: query.region } : {},
        query.search
          ? {
              OR: [
                { application: { studentName: { contains: query.search, mode: 'insensitive' } } },
                {
                  application: {
                    registrationNumber: { contains: query.search, mode: 'insensitive' },
                  },
                },
                { application: { subjectCode: { contains: query.search, mode: 'insensitive' } } },
                ...(normalized.length >= 4
                  ? [{ transactionReferenceNormalized: { contains: normalized } }]
                  : []),
              ],
            }
          : {},
      ],
    };
  }

  async list(query: ReExamPaymentQuery): Promise<ReExamPaymentList> {
    const where = this.where(query);
    const orderBy: Prisma.ReExamPaymentOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [{ createdAt: query.sortOrder }, { id: 'asc' }]
        : [{ submittedAt: { sort: query.sortOrder, nulls: 'last' } }, { createdAt: 'desc' }];
    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.reExamPayment.findMany({
        where,
        include: paymentInclude,
        orderBy,
        ...pageArgs(query),
      }),
      this.prisma.client.reExamPayment.count({ where }),
    ]);
    return { data: rows.map(toRow), meta: paginationMeta(query, total) };
  }

  async detail(id: string): Promise<ReExamPaymentDetail> {
    const db = this.prisma.client;
    const p = await db.reExamPayment.findUnique({
      where: { id },
      include: {
        ...paymentInclude,
        destination: true,
        reviewedBy: { select: { id: true, displayName: true } },
      },
    });
    if (!p) throw Errors.notFound();
    const [others, sameReference, history] = await Promise.all([
      db.reExamPayment.findMany({
        where: { applicationId: p.applicationId, id: { not: p.id } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, createdAt: true },
      }),
      p.transactionReferenceNormalized
        ? db.reExamPayment.findMany({
            where: {
              transactionReferenceNormalized: p.transactionReferenceNormalized,
              id: { not: p.id },
            },
            select: { id: true, status: true, applicationId: true },
          })
        : Promise.resolve([]),
      db.auditLog.findMany({
        where: { entityType: ENTITY, entityId: id },
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { displayName: true } } },
        take: 100,
      }),
    ]);
    return {
      ...toRow(p),
      amountSource: p.amountSource,
      feeRuleVersion: p.feeRuleVersion,
      destination: {
        id: p.destination.id,
        version: p.destination.version,
        countryName: p.destination.countryName,
        beneficiaryName: p.destination.beneficiaryName,
        method: p.destination.method,
        currency: p.destination.currency,
      },
      programName: p.application.programName,
      academicSessionName: p.application.academicSessionName,
      examinationName: p.application.examinationName,
      periodLabel: p.application.periodLabel,
      evidence:
        p.evidenceStorageKey && p.evidenceContentType && p.evidenceSizeBytes && p.evidenceSha256
          ? {
              contentType: p.evidenceContentType,
              sizeBytes: p.evidenceSizeBytes,
              sha256: p.evidenceSha256,
            }
          : null,
      reviewedBy: p.reviewedBy,
      verifiedAmountMinor: p.verifiedAmountMinor,
      verifiedCurrency: p.verifiedCurrency,
      reviewNote: p.reviewNote,
      rejectionReason: p.rejectionReason,
      voidedAt: p.voidedAt?.toISOString() ?? null,
      voidReason: p.voidReason,
      otherPayments: others.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      sameReference: sameReference.map((s) => ({
        id: s.id,
        status: s.status,
        applicationReference: reExamReference(s.applicationId),
      })),
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: STAFF_SUMMARIES[entry.action as AuditAction] ?? entry.action,
        actor: entry.actor?.displayName ?? (entry.actorUserId ? null : 'Student'),
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** The submitted evidence (staff only), checked against its checksum; every view is audited. */
  async evidence(
    id: string,
    actorUserId: string,
  ): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
    const p = await this.prisma.client.reExamPayment.findUnique({ where: { id } });
    if (!p?.evidenceStorageKey || !p.evidenceContentType || !p.evidenceSha256) {
      throw Errors.notFound();
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.getObject(p.evidenceStorageKey, {
        maxBytes: MAX_EVIDENCE_READ_BYTES,
      });
    } catch {
      this.logger.error(`Evidence of re-exam payment ${id} could not be read`);
      throw storageUnavailable();
    }
    if (sha256Of(bytes) !== p.evidenceSha256 || sniffContentType(bytes) !== p.evidenceContentType) {
      this.logger.error(`Evidence of re-exam payment ${id} failed its integrity check`);
      throw storageUnavailable();
    }
    await this.audit.writeAuditEvent({
      actorUserId,
      action: AUDIT_ACTIONS.reExamPaymentEvidenceViewed,
      entityType: ENTITY,
      entityId: id,
      metadata: { sha256: p.evidenceSha256 },
    });
    const extension =
      p.evidenceContentType === 'application/pdf'
        ? 'pdf'
        : p.evidenceContentType === 'image/png'
          ? 'png'
          : 'jpg';
    return {
      bytes,
      contentType: p.evidenceContentType,
      filename: `payment-evidence-${id.replace(/-/g, '').slice(-8)}.${extension}`,
    };
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM re_exam_payments WHERE id = ${id}::uuid FOR UPDATE`;
    const p = await tx.reExamPayment.findUnique({ where: { id } });
    if (!p) throw Errors.notFound();
    return p;
  }

  private notSubmitted(status: string) {
    return conflict(
      status === 'VERIFIED' || status === 'REJECTED'
        ? `This payment has already been ${status === 'VERIFIED' ? 'verified' : 'rejected'}.`
        : 'Only submitted payments can be reviewed.',
    );
  }

  /**
   * SUBMITTED → VERIFIED. The reviewer records the amount and currency actually received; they must
   * equal the obligation (partial, excess and other-currency payments are rejected with a reason).
   */
  async verify(
    id: string,
    input: VerifyReExamPayment,
    actorUserId: string,
  ): Promise<ReExamPaymentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const p = await this.lock(tx, id);
      if (p.status !== 'SUBMITTED') throw this.notSubmitted(p.status);
      const received = toMinorUnits(input.verifiedAmount, input.verifiedCurrency);
      if (input.verifiedCurrency !== p.currency || received !== p.amountMinor) {
        throw conflict(
          `The amount received does not match the amount due (${formatMoney(p.amountMinor, p.currency)}). Partial, excess or other-currency payments cannot be verified — reject the payment with a reason instead.`,
          'verifiedAmount',
        );
      }
      await tx.reExamPayment.update({
        where: { id },
        data: {
          status: 'VERIFIED',
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          verifiedAmountMinor: received,
          verifiedCurrency: input.verifiedCurrency,
          reviewNote: input.note ?? null,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentVerified,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            applicationId: p.applicationId,
            amountMinor: received,
            currency: input.verifiedCurrency,
            confirmedAgainstUniversityAccount: true,
          },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** SUBMITTED → REJECTED with a reason (shown to the student). The student may then pay again. */
  async reject(
    id: string,
    input: RejectReExamPayment,
    actorUserId: string,
  ): Promise<ReExamPaymentDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const p = await this.lock(tx, id);
      if (p.status !== 'SUBMITTED') throw this.notSubmitted(p.status);
      await tx.reExamPayment.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          rejectionReason: input.reason,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentRejected,
          entityType: ENTITY,
          entityId: id,
          // The reason stays on the payment; it is not copied into the log.
          metadata: { applicationId: p.applicationId },
        },
        tx,
      );
    });
    return this.detail(id);
  }
}
