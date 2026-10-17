import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type DatabaseModels } from '@docversity/database';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ACADEMIC_TEMPLATE_IDS,
  ALL_CERTIFICATE_TYPES,
  CURRENT_CERTIFICATE_DURATION_POLICY_VERSION,
  ERROR_CODES,
  STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT,
  STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION,
  certificateEligibilityApprovalAuthoritySchema,
  certificateEligibilityConfigSchema,
  certificateTypeSchema,
  configMatchesCourse,
  describeCertificateDurationPolicy,
  durationEvaluationView,
  evaluateCourseDuration,
  programCertificateEligibilitySchema,
  resolveCourseConfigurationState,
  resolveTypeEligibility,
  studentCertificateEligibilityV1Schema,
  studentRegistrationEligibilityResponseV1Schema,
  type CertificateType,
  type EligibilityDecision,
  type ProposeCertificateEligibility,
  type StudentRegistrationEligibilityV1,
} from '@docversity/validation';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { CertificatePoliciesService } from '../certificate-requests/certificate-policies.service.js';

const conflict = (message: string) =>
  new AppError(HttpStatus.CONFLICT, ERROR_CODES.conflict, message);

const BOUNDARIES = [
  'Approving a course certificate set does not decide whether any student qualifies for a certificate.',
  'It is not Rector approval, Finance or payment verification, or permission to issue a certificate.',
  'It never enables certificate applications; those need a separately approved application policy.',
];
const APPROVAL_DISABLED =
  'Approval is disabled: the university has not yet authorized an eligibility-policy approver.';

type ConfigRow = DatabaseModels.ProgramCertificateEligibilityModel & {
  proposedBy: { id: string; displayName: string };
  decidedBy: { id: string; displayName: string } | null;
};
const actorSelect = { select: { id: true, displayName: true } } as const;
const withActors = { proposedBy: actorSelect, decidedBy: actorSelect } as const;

export interface StaffActor {
  readonly userId: string;
  readonly canPropose: boolean;
  readonly canApprove: boolean;
}

@Injectable()
export class CertificateEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimiter,
    private readonly applicationPolicies: CertificatePoliciesService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Approval authority
  // ------------------------------------------------------------------------------------------

  /** University approval authority. None has been supplied; no environment flag changes this. */
  approvalAuthorityDefinition(): unknown {
    return null;
  }
  approvalAuthority() {
    const parsed = certificateEligibilityApprovalAuthoritySchema.safeParse(
      this.approvalAuthorityDefinition(),
    );
    // Only isolated tests may supply a synthetic authority.
    return parsed.success && this.config.NODE_ENV === 'test' ? parsed.data : null;
  }

  private async throttle(id: string) {
    const r = await this.limiter.hit(
      'certificate-eligibility-write',
      [{ key: `principal:${id}`, limit: 30 }],
      60,
    );
    if (r.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ERROR_CODES.authRateLimited,
        'Too many eligibility changes. Please wait before trying again.',
        { headers: { 'Retry-After': String(r.retryAfterSeconds) } },
      );
  }

  // ------------------------------------------------------------------------------------------
  // Staff course view
  // ------------------------------------------------------------------------------------------

  private configOutput(
    row: ConfigRow,
    program: { durationValue: number | null; durationUnit: string | null },
  ) {
    const evaluation = evaluateCourseDuration(program.durationValue, program.durationUnit);
    return certificateEligibilityConfigSchema.parse({
      id: row.id,
      programId: row.programId,
      revision: row.revision,
      version: row.version,
      status: row.status,
      certificateTypes: row.certificateTypes,
      policyId: row.policyId,
      policyVersion: row.policyVersion,
      durationMonths: row.durationMonths,
      tier: row.tier,
      authorityReference: row.authorityReference,
      rationale: row.rationale,
      proposedBy: row.proposedBy,
      proposedAt: row.proposedAt.toISOString(),
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      matchesCurrentCourse: configMatchesCourse(row, evaluation),
    });
  }

  async programView(programId: string, actor: StaffActor) {
    const program = await this.prisma.client.program.findUnique({ where: { id: programId } });
    if (!program) throw Errors.notFound();
    const rows = await this.prisma.client.programCertificateEligibility.findMany({
      where: { programId },
      include: withActors,
      orderBy: { revision: 'desc' },
      take: 100,
    });
    const evaluation = evaluateCourseDuration(program.durationValue, program.durationUnit);
    const approvedRow = rows.find((r) => r.status === 'APPROVED') ?? null;
    const pendingRow = rows.find((r) => r.status === 'PROPOSED') ?? null;
    const approved = approvedRow ? this.approvedInput(approvedRow) : null;
    const types = resolveTypeEligibility(evaluation, approved);
    const authority = this.approvalAuthority();
    return programCertificateEligibilitySchema.parse({
      program: {
        id: program.id,
        code: program.code,
        name: program.name,
        durationValue: program.durationValue,
        durationUnit: program.durationUnit,
      },
      policy: describeCertificateDurationPolicy(),
      evaluation: durationEvaluationView(evaluation),
      configuration: resolveCourseConfigurationState(evaluation, approved, !!pendingRow),
      approved: approvedRow ? this.configOutput(approvedRow, program) : null,
      pending: pendingRow ? this.configOutput(pendingRow, program) : null,
      history: rows.map((r) => this.configOutput(r, program)),
      types: ALL_CERTIFICATE_TYPES.map((certificateType) => ({
        certificateType,
        eligibility: types[certificateType],
      })),
      approval: authority
        ? { enabled: true, reason: `Authorized by ${authority.authorityReference}.` }
        : { enabled: false, reason: APPROVAL_DISABLED },
      canPropose: actor.canPropose && evaluation.outcome === 'TIER' && !pendingRow,
      canWithdraw: actor.canPropose && !!pendingRow,
      canDecide:
        actor.canApprove &&
        !!authority &&
        !!pendingRow &&
        pendingRow.proposedByUserId !== actor.userId &&
        configMatchesCourse(pendingRow, evaluation),
      boundaries: BOUNDARIES,
    });
  }

  private approvedInput(row: {
    certificateTypes: string[];
    policyVersion: number;
    durationMonths: number;
  }) {
    return {
      certificateTypes: row.certificateTypes.flatMap((t) => {
        const parsed = certificateTypeSchema.safeParse(t);
        return parsed.success ? [parsed.data] : [];
      }),
      policyVersion: row.policyVersion,
      durationMonths: row.durationMonths,
    };
  }

  // ------------------------------------------------------------------------------------------
  // Staff writes
  // ------------------------------------------------------------------------------------------

  async propose(programId: string, body: ProposeCertificateEligibility, actor: StaffActor) {
    await this.throttle(actor.userId);
    await this.prisma.client
      .$transaction(async (tx) => {
        // Lock the course so a concurrent duration edit cannot slip between evaluation and insert.
        const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM programs WHERE id = ${programId}::uuid FOR UPDATE`;
        if (locked.length === 0) throw Errors.notFound();
        const program = await tx.program.findUniqueOrThrow({ where: { id: programId } });
        const evaluation = evaluateCourseDuration(program.durationValue, program.durationUnit);
        if (evaluation.outcome !== 'TIER')
          throw conflict(
            'This course duration is not covered by the university policy. No certificate set can be proposed until the university decides.',
          );
        const outside = body.certificateTypes.filter(
          (t) => !evaluation.certificateTypes.includes(t),
        );
        if (outside.length)
          throw Errors.validation([
            {
              path: 'certificateTypes',
              message: `Not permitted for a ${evaluation.durationMonths}-month course: ${outside.join(', ')}.`,
            },
          ]);
        if (
          await tx.programCertificateEligibility.findFirst({
            where: { programId, status: 'PROPOSED' },
          })
        )
          throw conflict('This course already has a proposal awaiting a decision.');
        const last = await tx.programCertificateEligibility.findFirst({
          where: { programId },
          orderBy: { revision: 'desc' },
          select: { revision: true },
        });
        // Keep the university's order so stored sets are deterministic.
        const certificateTypes = ALL_CERTIFICATE_TYPES.filter((t) =>
          body.certificateTypes.includes(t),
        );
        const row = await tx.programCertificateEligibility.create({
          data: {
            programId,
            revision: (last?.revision ?? 0) + 1,
            certificateTypes,
            policyId: evaluation.policyId,
            policyVersion: evaluation.policyVersion,
            durationMonths: evaluation.durationMonths,
            tier: evaluation.tier,
            authorityReference: body.authorityReference,
            rationale: body.rationale ?? null,
            proposedByUserId: actor.userId,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: actor.userId,
            action: AUDIT_ACTIONS.certificateEligibilityProposed,
            entityType: 'ProgramCertificateEligibility',
            entityId: row.id,
            metadata: {
              programId,
              revision: row.revision,
              certificateTypes,
              policyId: row.policyId,
              policyVersion: row.policyVersion,
              durationMonths: row.durationMonths,
              tier: row.tier,
            },
          },
          tx,
        );
      })
      .catch(this.translateConflict);
    return this.programView(programId, actor);
  }

  async withdraw(configId: string, body: EligibilityDecision, actor: StaffActor) {
    return this.decide(configId, body, actor, 'WITHDRAWN');
  }
  async approve(configId: string, body: EligibilityDecision, actor: StaffActor) {
    return this.decide(configId, body, actor, 'APPROVED');
  }
  async reject(configId: string, body: EligibilityDecision, actor: StaffActor) {
    return this.decide(configId, body, actor, 'REJECTED');
  }

  private async decide(
    configId: string,
    body: EligibilityDecision,
    actor: StaffActor,
    status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN',
  ) {
    await this.throttle(actor.userId);
    const deciding = status !== 'WITHDRAWN';
    const authority = deciding ? this.approvalAuthority() : null;
    if (deciding && (!actor.canApprove || !authority))
      throw new AppError(HttpStatus.FORBIDDEN, ERROR_CODES.forbidden, APPROVAL_DISABLED);
    const row = await this.prisma.client.programCertificateEligibility.findUnique({
      where: { id: configId },
    });
    if (!row) throw Errors.notFound();
    if (deciding && row.proposedByUserId === actor.userId)
      throw new AppError(
        HttpStatus.FORBIDDEN,
        ERROR_CODES.forbidden,
        'A different person must decide a proposal you made.',
      );
    await this.prisma.client
      .$transaction(async (tx) => {
        if (status === 'APPROVED') {
          const program = await tx.program.findUniqueOrThrow({ where: { id: row.programId } });
          const evaluation = evaluateCourseDuration(program.durationValue, program.durationUnit);
          if (!configMatchesCourse(row, evaluation))
            throw conflict(
              'The course duration or policy version changed after this proposal. Withdraw it and propose again.',
            );
          const current = await tx.programCertificateEligibility.findFirst({
            where: { programId: row.programId, status: 'APPROVED' },
          });
          if (current) {
            const superseded = await tx.programCertificateEligibility.updateMany({
              where: { id: current.id, status: 'APPROVED', version: current.version },
              data: {
                status: 'SUPERSEDED',
                version: current.version + 1,
                supersededAt: new Date(),
              },
            });
            if (superseded.count !== 1)
              throw conflict('The approved set changed. Reload and try again.');
          }
        }
        const updated = await tx.programCertificateEligibility.updateMany({
          where: { id: configId, status: 'PROPOSED', version: body.version },
          data: {
            status,
            version: body.version + 1,
            decidedByUserId: actor.userId,
            decidedAt: new Date(),
            decisionNote: body.note ?? null,
          },
        });
        if (updated.count !== 1)
          throw conflict('This proposal was already decided or changed. Reload and try again.');
        await this.audit.writeAuditEvent(
          {
            actorUserId: actor.userId,
            action:
              status === 'APPROVED'
                ? AUDIT_ACTIONS.certificateEligibilityApproved
                : status === 'REJECTED'
                  ? AUDIT_ACTIONS.certificateEligibilityRejected
                  : AUDIT_ACTIONS.certificateEligibilityWithdrawn,
            entityType: 'ProgramCertificateEligibility',
            entityId: configId,
            metadata: {
              programId: row.programId,
              revision: row.revision,
              version: body.version + 1,
              certificateTypes: row.certificateTypes,
              ...(authority ? { authorityId: authority.id } : {}),
            },
          },
          tx,
        );
      })
      .catch(this.translateConflict);
    return this.programView(row.programId, actor);
  }

  private translateConflict = (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw conflict('Another change to this course was saved first. Reload and try again.');
    throw error;
  };

  // ------------------------------------------------------------------------------------------
  // Student contract (registration-specific; identity from the session only)
  // ------------------------------------------------------------------------------------------

  private async registrationsFor(studentId: string, registrationId?: string) {
    const registrations = await this.prisma.client.studentRegistration.findMany({
      where: { studentId, ...(registrationId ? { id: registrationId } : {}) },
      include: { program: true },
      orderBy: [{ registrationNumber: 'asc' }, { id: 'asc' }],
      take: 50,
    });
    const programIds = [...new Set(registrations.map((r) => r.programId))];
    const configs = programIds.length
      ? await this.prisma.client.programCertificateEligibility.findMany({
          where: { programId: { in: programIds }, status: { in: ['APPROVED', 'PROPOSED'] } },
          select: {
            programId: true,
            status: true,
            certificateTypes: true,
            policyVersion: true,
            durationMonths: true,
          },
        })
      : [];
    return registrations.map((r) => this.registrationOutput(r, configs));
  }

  private registrationOutput(
    r: DatabaseModels.StudentRegistrationModel & { program: DatabaseModels.ProgramModel },
    configs: {
      programId: string;
      status: string;
      certificateTypes: string[];
      policyVersion: number;
      durationMonths: number;
    }[],
  ): StudentRegistrationEligibilityV1 {
    const evaluation = evaluateCourseDuration(r.program.durationValue, r.program.durationUnit);
    const approvedRow = configs.find((c) => c.programId === r.programId && c.status === 'APPROVED');
    const pending = configs.some((c) => c.programId === r.programId && c.status === 'PROPOSED');
    const approved = approvedRow ? this.approvedInput(approvedRow) : null;
    const types = resolveTypeEligibility(evaluation, approved);
    return {
      registrationId: r.id,
      registrationNumber: r.registrationNumber,
      registrationStatus: r.status,
      program: {
        code: r.program.code,
        name: r.program.name,
        durationMonths: evaluation.durationMonths,
      },
      duration: {
        outcome: evaluation.outcome,
        tier: evaluation.outcome === 'TIER' ? evaluation.tier : null,
        unresolvedReason: evaluation.outcome === 'UNRESOLVED' ? evaluation.reason : null,
      },
      courseConfiguration: resolveCourseConfigurationState(evaluation, approved, pending),
      certificates: ALL_CERTIFICATE_TYPES.map((certificateType: CertificateType) => {
        const allowed = types[certificateType] === 'APPROVED_FOR_COURSE';
        return {
          certificateType,
          typeEligibility: types[certificateType],
          samplePreviewAllowed: allowed,
          samplePreviewTemplate: allowed
            ? { templateId: ACADEMIC_TEMPLATE_IDS[certificateType], version: 1 }
            : null,
          // Reported from the Phase 12B application policies as they are; eligibility never enables it.
          applicationAvailability: this.applicationPolicies.get(certificateType)
            ? 'AVAILABLE'
            : 'NOT_AVAILABLE',
          courseCompletionStatus: 'NOT_EVALUATED',
          paymentVerification: 'NOT_AVAILABLE',
          rectorApproval: 'NOT_AVAILABLE',
          issuance: 'NOT_AVAILABLE',
        };
      }),
    };
  }

  private policyRef() {
    return {
      id: describeCertificateDurationPolicy().id,
      version: CURRENT_CERTIFICATE_DURATION_POLICY_VERSION,
    };
  }

  async studentEligibility(studentId: string) {
    return studentCertificateEligibilityV1Schema.parse({
      contract: STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT,
      contractVersion: STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION,
      policy: this.policyRef(),
      registrations: await this.registrationsFor(studentId),
    });
  }

  /** One explicitly selected registration; another student's registration is indistinguishable from none. */
  async studentRegistrationEligibility(studentId: string, registrationId: string) {
    const [registration] = await this.registrationsFor(studentId, registrationId);
    if (!registration) throw Errors.notFound();
    return studentRegistrationEligibilityResponseV1Schema.parse({
      contract: STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT,
      contractVersion: STUDENT_CERTIFICATE_ELIGIBILITY_CONTRACT_VERSION,
      policy: this.policyRef(),
      registration,
    });
  }
}
