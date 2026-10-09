import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { type ObjectStorage, objectKeys } from '@docversity/storage';
import { AUDIT_ACTIONS, type AuditAction } from '@docversity/types';
import {
  type ActivityItem,
  type ApprovePaymentDestination,
  type CreatePaymentDestination,
  ERROR_CODES,
  isRegionGroup,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGIONS,
  type PaymentDestination,
  type PaymentDestinationDetail,
  type PaymentDestinationList,
  type PaymentDestinationState,
  type SetPaymentDestinationActive,
  toMinorUnits,
  type UpdatePaymentDestination,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { invalidRelation } from '../common/conflicts.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { prepareQrImage, sha256Of } from './payment-files.js';
import type { UploadedPaymentFile } from './payment-upload.interceptor.js';

const ENTITY = 'ReExamPaymentDestination';
const MAX_QR_READ_BYTES = 4 * 1024 * 1024;

const person = { select: { id: true, displayName: true } } as const;
export const destinationInclude = {
  rates: { orderBy: { attemptNumber: 'asc' as const } },
  createdBy: person,
  updatedBy: person,
  approvedBy: person,
  retiredBy: person,
  _count: { select: { payments: true } },
} as const;
type DestinationRecord = Prisma.ReExamPaymentDestinationGetPayload<{
  include: typeof destinationInclude;
}>;

type DestinationCore = Pick<
  DestinationRecord,
  'status' | 'isActive' | 'effectiveFrom' | 'effectiveUntil'
>;

/** What a student would experience right now. */
export function destinationState(d: DestinationCore, now = new Date()): PaymentDestinationState {
  if (d.status === 'DRAFT') return 'DRAFT';
  if (d.status === 'RETIRED') return 'RETIRED';
  if (!d.isActive) return 'INACTIVE';
  if (d.effectiveFrom > now) return 'SCHEDULED';
  if (d.effectiveUntil && d.effectiveUntil <= now) return 'EXPIRED';
  return 'AVAILABLE';
}

export const isUsable = (d: DestinationCore, now = new Date()) =>
  destinationState(d, now) === 'AVAILABLE';

/**
 * The amount a student pays at a destination for an assessed application: the application's own fee
 * when the currencies match, otherwise the destination's approved amount for that attempt. Never a
 * conversion; `null` when no amount was approved.
 */
export function resolveAmount(
  destination: { currency: string; rates: { attemptNumber: number; amountMinor: number }[] },
  application: { attemptNumber: number; feeCurrency: string | null; feeAmountMinor: number | null },
): { source: 'FEE_RULE' | 'DESTINATION_RATE'; amountMinor: number } | null {
  if (application.feeCurrency === null || application.feeAmountMinor === null) return null;
  if (destination.currency === application.feeCurrency) {
    return { source: 'FEE_RULE', amountMinor: application.feeAmountMinor };
  }
  const rate = destination.rates.find((r) => r.attemptNumber === application.attemptNumber);
  return rate ? { source: 'DESTINATION_RATE', amountMinor: rate.amountMinor } : null;
}

function toDestination(d: DestinationRecord, now = new Date()): PaymentDestination {
  return {
    id: d.id,
    region: d.region,
    version: d.version,
    status: d.status,
    state: destinationState(d, now),
    isActive: d.isActive,
    countryName: d.countryName,
    beneficiaryName: d.beneficiaryName,
    method: d.method,
    currency: d.currency,
    instructions: d.instructions,
    evidenceRequirement: d.evidenceRequirement,
    effectiveFrom: d.effectiveFrom.toISOString(),
    effectiveUntil: d.effectiveUntil?.toISOString() ?? null,
    qr:
      d.qrStorageKey && d.qrContentType && d.qrSizeBytes !== null && d.qrSha256
        ? { contentType: d.qrContentType, sizeBytes: d.qrSizeBytes, sha256: d.qrSha256 }
        : null,
    rates: d.rates.map((r) => ({ attemptNumber: r.attemptNumber, amountMinor: r.amountMinor })),
    replacesDestinationId: d.replacesDestinationId,
    createdAt: d.createdAt.toISOString(),
    createdBy: d.createdBy,
    updatedAt: d.updatedAt.toISOString(),
    updatedBy: d.updatedBy,
    approvedAt: d.approvedAt?.toISOString() ?? null,
    approvedBy: d.approvedBy,
    retiredAt: d.retiredAt?.toISOString() ?? null,
    retiredBy: d.retiredBy,
    paymentCount: d._count.payments,
  };
}

const SUMMARIES: Partial<Record<AuditAction, string>> = {
  RE_EXAM_PAYMENT_DESTINATION_CREATED: 'Draft created',
  RE_EXAM_PAYMENT_DESTINATION_UPDATED: 'Draft edited',
  RE_EXAM_PAYMENT_DESTINATION_QR_UPLOADED: 'QR image uploaded',
  RE_EXAM_PAYMENT_DESTINATION_APPROVED: 'Approved',
  RE_EXAM_PAYMENT_DESTINATION_ACTIVATED: 'Switched on',
  RE_EXAM_PAYMENT_DESTINATION_DEACTIVATED: 'Switched off',
  RE_EXAM_PAYMENT_DESTINATION_RETIRED: 'Retired',
};

const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);
const notEditable = () =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.conflict,
    'Approved and retired payment details cannot be changed. Prepare a replacement instead.',
  );
const storageUnavailable = () =>
  new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_CODES.serviceUnavailable,
    'File storage is temporarily unavailable. Nothing was saved; please try again shortly.',
  );

/**
 * Re-exam payment destinations per country/region group (Phase 9C). Nothing is pre-filled: staff
 * enter the university's beneficiary, currency, amounts (other currencies only), instructions and
 * QR; a second authorised person approves before students see anything. Approved versions are frozen
 * (database trigger); replacing a QR means approving a replacement, which retires the old version.
 */
@Injectable()
export class PaymentDestinationsService {
  private readonly logger = new Logger(PaymentDestinationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  private async activeFeeCurrency(db: Prisma.TransactionClient): Promise<string | null> {
    const rule = await db.reExamFeeRule.findFirst({
      where: { status: 'ACTIVE' },
      select: { currency: true },
    });
    return rule?.currency ?? null;
  }

  async list(): Promise<PaymentDestinationList> {
    const now = new Date();
    const rows = await this.prisma.client.reExamPaymentDestination.findMany({
      include: destinationInclude,
      orderBy: [{ region: 'asc' }, { version: 'desc' }],
    });
    const data = rows.map((row) => toDestination(row, now));
    return {
      regions: PAYMENT_REGIONS.map((region) => ({
        region,
        label: PAYMENT_REGION_LABELS[region],
        isGroup: isRegionGroup(region),
        approved: data.find((d) => d.region === region && d.status === 'APPROVED') ?? null,
        draftCount: data.filter((d) => d.region === region && d.status === 'DRAFT').length,
      })),
      data,
      feeCurrency: await this.activeFeeCurrency(this.prisma.client),
    };
  }

  async detail(id: string): Promise<PaymentDestinationDetail> {
    const row = await this.prisma.client.reExamPaymentDestination.findUnique({
      where: { id },
      include: destinationInclude,
    });
    if (!row) throw Errors.notFound();
    const history = await this.prisma.client.auditLog.findMany({
      where: { entityType: ENTITY, entityId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { displayName: true } } },
      take: 100,
    });
    return {
      ...toDestination(row),
      history: history.map((entry): ActivityItem => ({
        id: entry.id,
        action: entry.action,
        summary: SUMMARIES[entry.action as AuditAction] ?? entry.action,
        actor: entry.actor?.displayName ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  /** Converts approved amounts; amounts in the fee rule's currency come from the fee rule only. */
  private async rates(
    db: Prisma.TransactionClient,
    currency: string,
    rates: { attemptNumber: number; amount: string }[] | undefined,
  ) {
    if (!rates || rates.length === 0) return [];
    if (currency === (await this.activeFeeCurrency(db))) {
      throw invalidRelation(
        'rates',
        `Amounts in ${currency} come from the active re-exam fee rule. Leave them empty here.`,
      );
    }
    return rates.map((rate) => ({
      attemptNumber: rate.attemptNumber,
      // Validated by the schema; never a float.
      amountMinor: toMinorUnits(rate.amount, currency) ?? 0,
    }));
  }

  async create(
    input: CreatePaymentDestination,
    actorUserId: string,
  ): Promise<PaymentDestinationDetail> {
    const id = await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-destination:${input.region}`}, 0))`;
      if (input.replacesDestinationId) {
        const replaced = await tx.reExamPaymentDestination.findUnique({
          where: { id: input.replacesDestinationId },
          select: { region: true, status: true },
        });
        if (replaced?.region !== input.region || replaced.status !== 'APPROVED') {
          throw invalidRelation(
            'replacesDestinationId',
            'Only the approved payment details of the same country/region can be replaced.',
          );
        }
      }
      const rates = await this.rates(tx, input.currency, input.rates);
      const last = await tx.reExamPaymentDestination.aggregate({
        where: { region: input.region },
        _max: { version: true },
      });
      const created = await tx.reExamPaymentDestination.create({
        data: {
          region: input.region,
          version: (last._max.version ?? 0) + 1,
          countryName: input.countryName ?? null,
          beneficiaryName: input.beneficiaryName,
          method: input.method,
          currency: input.currency,
          instructions: input.instructions,
          evidenceRequirement: input.evidenceRequirement,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
          replacesDestinationId: input.replacesDestinationId ?? null,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          rates: { create: rates },
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentDestinationCreated,
          entityType: ENTITY,
          entityId: created.id,
          metadata: {
            region: created.region,
            version: created.version,
            currency: created.currency,
            method: created.method,
            evidenceRequirement: created.evidenceRequirement,
            replacesDestinationId: created.replacesDestinationId,
            rates: rates.map((r) => ({ attempt: r.attemptNumber, amountMinor: r.amountMinor })),
          },
        },
        tx,
      );
      return created.id;
    });
    return this.detail(id);
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM re_exam_payment_destinations WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.reExamPaymentDestination.findUnique({ where: { id } });
    if (!row) throw Errors.notFound();
    return row;
  }

  async update(
    id: string,
    input: UpdatePaymentDestination,
    actorUserId: string,
  ): Promise<PaymentDestinationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.lock(tx, id);
      if (row.status !== 'DRAFT') throw notEditable();
      if (input.countryName && !isRegionGroup(row.region)) {
        throw invalidRelation(
          'countryName',
          'A country is only entered for Europe, Central Asia or Others.',
        );
      }
      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : row.effectiveFrom;
      const effectiveUntil =
        input.effectiveUntil === undefined
          ? row.effectiveUntil
          : input.effectiveUntil
            ? new Date(input.effectiveUntil)
            : null;
      if (effectiveUntil && effectiveUntil <= effectiveFrom) {
        throw invalidRelation('effectiveUntil', 'The end must be after the start.');
      }
      const currency = input.currency ?? row.currency;
      const changed = Object.keys(input).filter(
        (key) => input[key as keyof UpdatePaymentDestination] !== undefined,
      );
      if (input.rates !== undefined || input.currency !== undefined) {
        const existing = await tx.reExamPaymentDestinationRate.findMany({
          where: { destinationId: id },
          orderBy: { attemptNumber: 'asc' },
        });
        const rates =
          input.rates !== undefined
            ? await this.rates(tx, currency, input.rates)
            : existing.length > 0 && currency !== row.currency
              ? // Amounts were entered for the old currency; they must be entered again.
                await this.rates(tx, currency, [])
              : null;
        if (rates !== null) {
          await tx.reExamPaymentDestinationRate.deleteMany({ where: { destinationId: id } });
          if (rates.length > 0) {
            await tx.reExamPaymentDestinationRate.createMany({
              data: rates.map((rate) => ({ ...rate, destinationId: id })),
            });
          }
        }
      }
      await tx.reExamPaymentDestination.update({
        where: { id },
        data: {
          ...(input.countryName !== undefined ? { countryName: input.countryName } : {}),
          ...(input.beneficiaryName !== undefined
            ? { beneficiaryName: input.beneficiaryName }
            : {}),
          ...(input.method !== undefined ? { method: input.method } : {}),
          currency,
          ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
          ...(input.evidenceRequirement !== undefined
            ? { evidenceRequirement: input.evidenceRequirement }
            : {}),
          effectiveFrom,
          effectiveUntil,
          updatedByUserId: actorUserId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentDestinationUpdated,
          entityType: ENTITY,
          entityId: id,
          // Field NAMES only.
          metadata: { fields: changed },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Stores a new QR image for a DRAFT (re-encoded, new key); the draft's previous image is removed. */
  async uploadQr(
    id: string,
    file: UploadedPaymentFile | undefined,
    actorUserId: string,
  ): Promise<PaymentDestinationDetail> {
    const existing = await this.prisma.client.reExamPaymentDestination.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw Errors.notFound();
    if (existing.status !== 'DRAFT') throw notEditable();
    const prepared = await prepareQrImage(file);
    const key = objectKeys.paymentDestinationQr(id, prepared.extension === 'png' ? 'png' : 'jpg');
    try {
      await this.storage.putObject(key, prepared.bytes, { contentType: prepared.contentType });
    } catch {
      throw storageUnavailable();
    }
    let previousKey: string | null;
    try {
      previousKey = await this.prisma.client.$transaction(async (tx) => {
        const row = await this.lock(tx, id);
        if (row.status !== 'DRAFT') throw notEditable();
        await tx.reExamPaymentDestination.update({
          where: { id },
          data: {
            qrStorageKey: key,
            qrContentType: prepared.contentType,
            qrSizeBytes: prepared.sizeBytes,
            qrSha256: prepared.sha256,
            updatedByUserId: actorUserId,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.reExamPaymentDestinationQrUploaded,
            entityType: ENTITY,
            entityId: id,
            metadata: {
              contentType: prepared.contentType,
              sizeBytes: prepared.sizeBytes,
              sha256: prepared.sha256,
              replacedSha256: row.qrSha256,
            },
          },
          tx,
        );
        return row.qrStorageKey;
      });
    } catch (error) {
      await this.storage.deleteObject(key).catch(() => undefined);
      throw error;
    }
    // A draft's earlier image was never shown to students or referenced by a payment.
    if (previousKey) await this.storage.deleteObject(previousKey).catch(() => undefined);
    return this.detail(id);
  }

  /**
   * DRAFT → APPROVED by someone other than its creator. A replacement retires the version it replaces
   * in the same transaction; otherwise the region must not already have an approved version.
   */
  async approve(
    id: string,
    _input: ApprovePaymentDestination,
    actorUserId: string,
  ): Promise<PaymentDestinationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const draft = await tx.reExamPaymentDestination.findUnique({
        where: { id },
        select: { region: true },
      });
      if (!draft) throw Errors.notFound();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-destination:${draft.region}`}, 0))`;
      const row = await this.lock(tx, id);
      if (row.status !== 'DRAFT') {
        throw conflict(`These payment details are already ${row.status.toLowerCase()}.`);
      }
      if (row.createdByUserId === actorUserId) {
        throw conflict(
          'Payment details must be approved by a different authorised staff member than the one who prepared them.',
        );
      }
      if (!row.qrStorageKey) throw conflict('Upload the QR image before approving.');
      const now = new Date();
      if (row.effectiveUntil && row.effectiveUntil <= now) {
        throw conflict('The validity of these payment details has already ended.');
      }
      const current = await tx.reExamPaymentDestination.findFirst({
        where: { region: row.region, status: 'APPROVED' },
      });
      if (current && current.id !== row.replacesDestinationId) {
        throw conflict(
          'This country/region already has approved payment details. Prepare a replacement of them instead.',
        );
      }
      if (row.replacesDestinationId && !current) {
        throw conflict('The payment details this draft replaces are no longer approved.');
      }
      if (current) {
        await tx.reExamPaymentDestination.update({
          where: { id: current.id },
          data: {
            status: 'RETIRED',
            isActive: false,
            retiredAt: now,
            retiredByUserId: actorUserId,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.reExamPaymentDestinationRetired,
            entityType: ENTITY,
            entityId: current.id,
            metadata: { region: current.region, version: current.version, replacedBy: id },
          },
          tx,
        );
      }
      await tx.reExamPaymentDestination.update({
        where: { id },
        data: {
          status: 'APPROVED',
          isActive: true,
          approvedAt: now,
          approvedByUserId: actorUserId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentDestinationApproved,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            region: row.region,
            version: row.version,
            currency: row.currency,
            qrSha256: row.qrSha256,
            confirmedApproved: true,
            replaces: current?.id ?? null,
          },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Switch an APPROVED destination on or off for students (payments already started keep it). */
  async setActive(
    id: string,
    input: SetPaymentDestinationActive,
    actorUserId: string,
  ): Promise<PaymentDestinationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.lock(tx, id);
      if (row.status !== 'APPROVED') {
        throw conflict('Only approved payment details can be switched on or off.');
      }
      if (row.isActive === input.active) return;
      await tx.reExamPaymentDestination.update({
        where: { id },
        data: { isActive: input.active },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: input.active
            ? AUDIT_ACTIONS.reExamPaymentDestinationActivated
            : AUDIT_ACTIONS.reExamPaymentDestinationDeactivated,
          entityType: ENTITY,
          entityId: id,
          metadata: { region: row.region, version: row.version },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** DRAFT/APPROVED → RETIRED (kept for history and for payments that reference it). */
  async retire(id: string, actorUserId: string): Promise<PaymentDestinationDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const row = await this.lock(tx, id);
      if (row.status === 'RETIRED') throw conflict('These payment details are already retired.');
      await tx.reExamPaymentDestination.update({
        where: { id },
        data: {
          status: 'RETIRED',
          isActive: false,
          retiredAt: new Date(),
          retiredByUserId: actorUserId,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamPaymentDestinationRetired,
          entityType: ENTITY,
          entityId: id,
          metadata: { region: row.region, version: row.version, from: row.status },
        },
        tx,
      );
    });
    return this.detail(id);
  }

  /** The stored (re-encoded) QR image, checked against its recorded checksum. */
  async qrBytes(destination: {
    id: string;
    qrStorageKey: string | null;
    qrContentType: string | null;
    qrSha256: string | null;
  }): Promise<{ bytes: Uint8Array; contentType: string }> {
    if (!destination.qrStorageKey || !destination.qrContentType || !destination.qrSha256) {
      throw Errors.notFound();
    }
    let bytes: Uint8Array;
    try {
      bytes = await this.storage.getObject(destination.qrStorageKey, {
        maxBytes: MAX_QR_READ_BYTES,
      });
    } catch {
      this.logger.error(`QR image of payment destination ${destination.id} could not be read`);
      throw storageUnavailable();
    }
    if (sha256Of(bytes) !== destination.qrSha256) {
      this.logger.error(`QR image of payment destination ${destination.id} failed its checksum`);
      throw storageUnavailable();
    }
    return { bytes, contentType: destination.qrContentType };
  }

  async staffQr(id: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const row = await this.prisma.client.reExamPaymentDestination.findUnique({ where: { id } });
    if (!row) throw Errors.notFound();
    return this.qrBytes(row);
  }
}
