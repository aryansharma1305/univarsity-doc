import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  type CreateReExamFeeRule,
  ERROR_CODES,
  RE_EXAM_ATTEMPT_BASIS,
  type ReExamFeeBlockedReason,
  type ReExamFeeRule,
  type ReExamFeeRuleList,
  toMinorUnits,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';

const ENTITY = 'ReExamFeeRule';
const person = { select: { id: true, displayName: true } } as const;
const ruleInclude = {
  rates: { orderBy: { attemptNumber: 'asc' as const } },
  createdBy: person,
  activatedBy: person,
  retiredBy: person,
} as const;
type RuleRecord = Prisma.ReExamFeeRuleGetPayload<{ include: typeof ruleInclude }>;

function toRule(rule: RuleRecord): ReExamFeeRule {
  return {
    id: rule.id,
    version: rule.version,
    status: rule.status,
    scope: rule.scope,
    currency: rule.currency,
    attemptBasis: rule.attemptBasis,
    note: rule.note,
    rates: rule.rates.map((rate) => ({
      attemptNumber: rate.attemptNumber,
      amountMinor: rate.amountMinor,
    })),
    createdAt: rule.createdAt.toISOString(),
    createdBy: rule.createdBy,
    activatedAt: rule.activatedAt?.toISOString() ?? null,
    activatedBy: rule.activatedBy,
    retiredAt: rule.retiredAt?.toISOString() ?? null,
    retiredBy: rule.retiredBy,
  };
}

export type FeeAssessment =
  | {
      status: 'ASSESSED';
      ruleId: string;
      ruleVersion: number;
      scope: RuleRecord['scope'];
      currency: string;
      amountMinor: number;
    }
  | { status: 'NOT_CONFIGURED'; blockedReason: ReExamFeeBlockedReason };

const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);

/**
 * Versioned re-exam fee rules (Phase 9B). The amounts are entered by authorised staff; nothing is
 * pre-filled or assumed. Only one rule is ACTIVE; activating a new version retires the previous one
 * in the same transaction. Applications snapshot the version they were assessed with.
 */
@Injectable()
export class FeeRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ReExamFeeRuleList> {
    const rules = await this.prisma.client.reExamFeeRule.findMany({
      include: ruleInclude,
      orderBy: { version: 'desc' },
    });
    return { data: rules.map(toRule) };
  }

  async create(input: CreateReExamFeeRule, actorUserId: string): Promise<ReExamFeeRule> {
    const rule = await this.prisma.client.$transaction(async (tx) => {
      // Serialise version numbering.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('re_exam_fee_rules_version'))`;
      const last = await tx.reExamFeeRule.aggregate({ _max: { version: true } });
      const created = await tx.reExamFeeRule.create({
        data: {
          version: (last._max.version ?? 0) + 1,
          scope: input.scope,
          currency: input.currency,
          attemptBasis: RE_EXAM_ATTEMPT_BASIS,
          note: input.note ?? null,
          createdByUserId: actorUserId,
          rates: {
            create: input.rates.map((rate) => ({
              attemptNumber: rate.attemptNumber,
              // Validated by the schema; never a float.
              amountMinor: toMinorUnits(rate.amount, input.currency) ?? 0,
            })),
          },
        },
        include: ruleInclude,
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamFeeRuleCreated,
          entityType: ENTITY,
          entityId: created.id,
          metadata: {
            version: created.version,
            scope: created.scope,
            currency: created.currency,
            rates: created.rates.map((r) => ({
              attempt: r.attemptNumber,
              amountMinor: r.amountMinor,
            })),
          },
        },
        tx,
      );
      return created;
    });
    return toRule(rule);
  }

  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM re_exam_fee_rules WHERE id = ${id}::uuid FOR UPDATE`;
    const rule = await tx.reExamFeeRule.findUnique({ where: { id } });
    if (!rule) throw Errors.notFound();
    return rule;
  }

  /** DRAFT → ACTIVE; the currently ACTIVE rule (if any) is retired in the same transaction. */
  async activate(id: string, actorUserId: string): Promise<ReExamFeeRule> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('re_exam_fee_rules_active'))`;
      const rule = await this.lock(tx, id);
      if (rule.status !== 'DRAFT')
        throw conflict(`This fee rule is already ${rule.status.toLowerCase()}.`);
      const now = new Date();
      const previous = await tx.reExamFeeRule.findFirst({ where: { status: 'ACTIVE' } });
      if (previous) {
        await tx.reExamFeeRule.update({
          where: { id: previous.id },
          data: { status: 'RETIRED', retiredAt: now, retiredByUserId: actorUserId },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId,
            action: AUDIT_ACTIONS.reExamFeeRuleRetired,
            entityType: ENTITY,
            entityId: previous.id,
            metadata: { version: previous.version, replacedByVersion: rule.version },
          },
          tx,
        );
      }
      await tx.reExamFeeRule.update({
        where: { id },
        data: { status: 'ACTIVE', activatedAt: now, activatedByUserId: actorUserId },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamFeeRuleActivated,
          entityType: ENTITY,
          entityId: id,
          metadata: { version: rule.version, scope: rule.scope, currency: rule.currency },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** DRAFT/ACTIVE → RETIRED. With no ACTIVE rule, fees cannot be assessed (payment is blocked). */
  async retire(id: string, actorUserId: string): Promise<ReExamFeeRule> {
    await this.prisma.client.$transaction(async (tx) => {
      const rule = await this.lock(tx, id);
      if (rule.status === 'RETIRED') throw conflict('This fee rule is already retired.');
      await tx.reExamFeeRule.update({
        where: { id },
        data: { status: 'RETIRED', retiredAt: new Date(), retiredByUserId: actorUserId },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId,
          action: AUDIT_ACTIONS.reExamFeeRuleRetired,
          entityType: ENTITY,
          entityId: id,
          metadata: { version: rule.version, from: rule.status },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async get(id: string): Promise<ReExamFeeRule> {
    const rule = await this.prisma.client.reExamFeeRule.findUnique({
      where: { id },
      include: ruleInclude,
    });
    if (!rule) throw Errors.notFound();
    return toRule(rule);
  }

  /**
   * The fee for an attempt under the ACTIVE rule. One application covers one subject, so
   * PER_SUBJECT and PER_APPLICATION give the same amount; PER_EXAMINATION_SESSION needs a policy on
   * how several subjects of one session are combined and is refused rather than guessed.
   */
  async assess(tx: Prisma.TransactionClient, attemptNumber: number): Promise<FeeAssessment> {
    const rule = await tx.reExamFeeRule.findFirst({
      where: { status: 'ACTIVE' },
      include: { rates: true },
    });
    if (!rule) return { status: 'NOT_CONFIGURED', blockedReason: 'NO_ACTIVE_RULE' };
    if (rule.scope === 'PER_EXAMINATION_SESSION') {
      return { status: 'NOT_CONFIGURED', blockedReason: 'SCOPE_NOT_SUPPORTED' };
    }
    const rate = rule.rates.find((r) => r.attemptNumber === attemptNumber);
    if (!rate) return { status: 'NOT_CONFIGURED', blockedReason: 'NO_RATE_FOR_ATTEMPT' };
    return {
      status: 'ASSESSED',
      ruleId: rule.id,
      ruleVersion: rule.version,
      scope: rule.scope,
      currency: rule.currency,
      amountMinor: rate.amountMinor,
    };
  }
}
