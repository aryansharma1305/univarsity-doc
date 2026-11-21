import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DatabaseModels } from '@docversity/database';
import { type ObjectStorage } from '@docversity/storage';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  officialDocumentSnapshotSchema,
  officialVerificationResponseSchema,
  PUBLIC_DISCLOSURE_FIELDS,
  type OfficialVerificationResponse,
  type PublicCredential,
  type PublicDisclosure,
  type PublicDisclosureField,
  type PublicDocumentRequest,
  type PublicResultOptions,
  type PublicResultSearch,
  type PublicVerificationDetails,
  type PublicVerificationService,
} from '@docversity/validation';
import { AuditService } from '../audit/audit.service.js';
import { IdentifierHasher } from '../auth/identifier-hasher.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { AppError, Errors } from '../common/app-error.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { OfficialResultsService } from './official-results.service.js';
import { verificationUnavailable } from './public-verification.service.js';
import { VerificationPoliciesService } from './verification-policies.service.js';

type Response = OfficialVerificationResponse;
type Program = DatabaseModels.ProgramModel & { department: { name: string } | null };

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10);
export const mask = (value: string) =>
  `••••${value.length > 4 ? value.slice(-4) : value.slice(-1)}`;

const NO_REGISTRATION =
  'No publicly verifiable registration matches these details. Students can sign in to check their own record.';
/** Status-aware wording: only an ACTIVE registration is ever described as active. */
export const REGISTRATION_MESSAGES = {
  ACTIVE: 'This student registration is valid and active.',
  COMPLETED: 'This registration is valid. The student has completed the course.',
  SUSPENDED: 'This registration exists but is currently suspended.',
  REVOKED: 'This registration has been revoked by the university.',
} as const;
const NO_RESULT = 'No published result matches these details.';
const NO_DOCUMENT = 'No approved, issued document matches these details.';

/** "3 YEARS" / "18 MONTHS" as stated by the university; falls back to the period structure. */
function duration(program: DatabaseModels.ProgramModel): string | undefined {
  if (program.durationValue && program.durationUnit)
    return `${program.durationValue} ${program.durationUnit === 'YEARS' ? 'year' : 'month'}${program.durationValue === 1 ? '' : 's'}`;
  if (program.periodCount && program.academicStructure)
    return `${program.periodCount} ${program.academicStructure === 'YEAR_WISE' ? 'year' : 'semester'}${program.periodCount === 1 ? '' : 's'}`;
  return undefined;
}

/** Keeps only fields the policy lists AND the service may ever disclose; drops empty values. */
function pick(
  service: PublicVerificationService,
  disclosure: PublicDisclosure,
  candidates: Partial<Record<PublicDisclosureField, Partial<PublicVerificationDetails>>>,
): PublicVerificationDetails {
  const allowed: readonly string[] = PUBLIC_DISCLOSURE_FIELDS[service];
  const details: PublicVerificationDetails = {};
  for (const field of disclosure.fields) {
    if (!allowed.includes(field)) continue;
    for (const [key, value] of Object.entries(candidates[field] ?? {}))
      if (value !== undefined && value !== null && value !== '')
        Object.assign(details, { [key]: value });
  }
  return details;
}

/**
 * Anonymous (no sign-in) verification. Every disclosure comes from the course's latest APPROVED
 * policy that carries an explicit `publicDisclosure` block; without one nothing is disclosed and the
 * response is the same as for an unknown record (no enumeration oracle). Documents and full
 * marksheets require their QR credential. Audit metadata holds hashes and outcomes only.
 */
@Injectable()
export class AnonymousVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: VerificationPoliciesService,
    private readonly results: OfficialResultsService,
    private readonly audit: AuditService,
    private readonly hasher: IdentifierHasher,
    private readonly limiter: RateLimiter,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** The latest approved policy's anonymous disclosure for a service and course, if any. */
  async disclosure(service: PublicVerificationService, programId: string) {
    const policy = await this.policies.current(service, programId);
    return policy?.definition.publicDisclosure ?? null;
  }

  /** Whether any course allows anonymous lookup for this service (otherwise the owner path applies). */
  async anyAnonymous(service: PublicVerificationService) {
    const rows = await this.prisma.client.verificationPolicy.findMany({
      where: {
        service,
        status: 'APPROVED',
        definition: { path: ['publicDisclosure', 'anonymousLookup'], equals: true },
      },
      take: 100,
    });
    return rows.some((row) => this.policies.approvedDefinition(row)?.publicDisclosure);
  }

  private program(programId: string): Promise<Program | null> {
    return this.prisma.client.program.findUnique({
      where: { id: programId },
      include: { department: { select: { name: true } } },
    });
  }

  private courseFields(program: Program) {
    return {
      PROGRAM: { program: program.name },
      COURSE_LEVEL: { courseLevel: program.level ?? undefined },
      COURSE_DURATION: { courseDuration: duration(program) },
      SCHOOL: { school: program.department?.name },
    } satisfies Partial<Record<PublicDisclosureField, Partial<PublicVerificationDetails>>>;
  }

  /** Registration by number, without a session. Called by the v2 check when no student is signed in. */
  async registration(
    reference: string,
    make: (s: Response['status'], m: string, f?: Partial<Response>) => Response,
  ) {
    const registration = await this.prisma.client.studentRegistration.findFirst({
      where: { registrationNumberNormalized: reference.toUpperCase() },
      include: {
        student: { select: { fullName: true } },
        academicSession: { select: { name: true } },
      },
    });
    const disclosure =
      registration && (await this.disclosure('registration', registration.programId));
    const program = disclosure && registration ? await this.program(registration.programId) : null;
    if (!registration || !disclosure || !program) return make('NOT_FOUND', NO_REGISTRATION);
    const active = registration.status === 'ACTIVE';
    return make(active ? 'ACTIVE' : 'INACTIVE', REGISTRATION_MESSAGES[registration.status], {
      recordStatus: registration.status,
      maskedReference: mask(registration.registrationNumber),
      details: pick('registration', disclosure, {
        ...this.courseFields(program),
        STUDENT_NAME: { studentName: registration.student.fullName },
        REGISTRATION_NUMBER: { registrationNumber: registration.registrationNumber },
        REGISTRATION_DATE: { registrationDate: day(registration.createdAt) },
        ACADEMIC_SESSION: { academicSession: registration.academicSession.name },
        ADMISSION_DATE: { admissionDate: day(registration.admissionDate) },
        COMPLETION_DATE: { completionDate: day(registration.completionDate) },
      }),
    });
  }

  /** Extra approved fields for an issued document (validity is decided by the caller). */
  async documentDetails(
    service: 'certificate' | 'admission-letter',
    certificate: DatabaseModels.CertificateModel,
    issueDate: string | undefined,
    byToken: boolean,
  ): Promise<Pick<Response, 'details' | 'documentAccess'>> {
    const disclosure = await this.disclosure(service, certificate.programId);
    if (!disclosure) return {};
    const [program, registration] = await Promise.all([
      this.program(certificate.programId),
      this.prisma.client.studentRegistration.findUnique({
        where: { id: certificate.studentRegistrationId },
        include: { student: { select: { fullName: true } } },
      }),
    ]);
    if (!program || !registration) return {};
    return {
      details: pick(service, disclosure, {
        ...this.courseFields(program),
        STUDENT_NAME: { studentName: registration.student.fullName },
        REGISTRATION_NUMBER: { registrationNumber: registration.registrationNumber },
        ISSUE_DATE: { issueDate },
        CERTIFICATE_TYPE: { certificateType: certificate.documentType },
      }),
      documentAccess: byToken && disclosure.documentWithCredential,
    };
  }

  /** Courses whose approved result policy allows anonymous search, with their real periods. */
  async resultOptions(): Promise<PublicResultOptions> {
    return this.guarded(async () => {
      const rows = await this.prisma.client.verificationPolicy.findMany({
        where: { service: 'result', status: 'APPROVED' },
        include: { program: true },
        take: 500,
      });
      const programs = new Map<string, PublicResultOptions['programs'][number]>();
      for (const row of rows) {
        const disclosure = await this.disclosure('result', row.programId);
        const p = row.program;
        const count =
          p.periodCount ?? (p.academicStructure === 'SEMESTER_WISE' ? p.durationSemesters : null);
        if (!disclosure || !p.academicStructure || !count || p.status !== 'ACTIVE') continue;
        programs.set(p.id, {
          id: p.id,
          name: p.name,
          structure: p.academicStructure === 'YEAR_WISE' ? 'YEAR' : 'SEMESTER',
          periods: Array.from({ length: count }, (_, i) => i + 1),
        });
      }
      return { programs: [...programs.values()].sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }

  /** Course + roll number + period: a published status (and approved fields) — never marks. */
  async resultSearch(input: PublicResultSearch, ip: string): Promise<Response> {
    const key = `${input.programId}:${input.rollNumber.toUpperCase()}:${input.periodNumber}`;
    return this.run('result', key, ip, async (make) => {
      const disclosure = await this.disclosure('result', input.programId);
      const program = disclosure ? await this.program(input.programId) : null;
      if (!disclosure || !program) return make('NOT_FOUND', NO_RESULT);
      const matches = await this.prisma.client.studentRegistration.findMany({
        where: {
          programId: input.programId,
          rollReferenceNumber: { equals: input.rollNumber, mode: 'insensitive' },
        },
        include: { academicSession: { select: { name: true } } },
        take: 2,
      });
      // An ambiguous roll number never resolves to anyone.
      const registration = matches.length === 1 ? matches[0] : undefined;
      if (!registration) return make('NOT_FOUND', NO_RESULT);
      const [latest] = await this.results.list(registration.studentId, {
        registrationId: registration.id,
        periodNumber: input.periodNumber,
      });
      if (!latest) return make('NOT_FOUND', NO_RESULT);
      return make('VALID', 'An official published result exists for these details.', {
        details: {
          program: program.name,
          rollNumber: mask(registration.rollReferenceNumber ?? input.rollNumber),
          period: this.period(program, latest.periodNumber),
          examination: latest.examination,
          ...pick('result', disclosure, {
            ACADEMIC_SESSION: { academicSession: registration.academicSession.name },
            RESULT_OUTCOME: { outcome: latest.outcome ?? undefined },
          }),
        },
        documentAccess: false,
      });
    });
  }

  /** The full marksheet for the holder of a publication's QR credential, where the policy allows. */
  async marksheet(input: PublicCredential, ip: string): Promise<Response> {
    return this.run('result', input.token, ip, async (make) => {
      const publication = await this.prisma.client.resultPublication.findUnique({
        where: { verificationToken: input.token },
        include: {
          result: {
            include: {
              studentRegistration: {
                include: {
                  student: { select: { fullName: true } },
                  academicSession: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      const registration = publication?.result.studentRegistration;
      const disclosure = registration && (await this.disclosure('result', registration.programId));
      if (!publication || !registration || !disclosure?.documentWithCredential)
        return make('NOT_FOUND', NO_RESULT);
      const [result] = await this.results.list(registration.studentId, {
        id: publication.resultId,
      });
      const program = await this.program(registration.programId);
      if (!result || !program) return make('NOT_FOUND', NO_RESULT);
      return make('VALID', 'This marksheet matches an official published result.', {
        results: [result],
        documentAccess: true,
        details: {
          program: program.name,
          period: this.period(program, result.periodNumber),
          examination: result.examination,
          academicSession: registration.academicSession.name,
          ...(registration.rollReferenceNumber
            ? { rollNumber: registration.rollReferenceNumber }
            : {}),
          studentName: registration.student.fullName,
          ...(result.outcome ? { outcome: result.outcome } : {}),
        },
      });
    });
  }

  /** The issued PDF for the holder of the document's QR credential, where the policy allows. */
  async document(input: PublicDocumentRequest, ip: string): Promise<Buffer> {
    const audit = (outcome: string) =>
      this.audit.writeAuditEvent({
        action: AUDIT_ACTIONS.publicVerificationChecked,
        entityType: 'public_verification',
        metadata: {
          contractVersion: 2,
          service: input.service,
          kind: 'DOCUMENT',
          outcome,
          referenceHash: this.hasher.hash(`public-verification:v2:${input.service}`, input.token),
          clientHash: this.hasher.hash('public-verification:client', ip),
        },
      });
    await this.budget(input.token, input.service);
    const c = await this.prisma.client.certificate.findFirst({
      where: {
        verificationToken: input.token,
        status: 'ISSUED',
        documentType:
          input.service === 'admission-letter' ? 'ADMISSION_LETTER' : { not: 'ADMISSION_LETTER' },
      },
    });
    const snapshot = officialDocumentSnapshotSchema.safeParse(c?.sourceSnapshot);
    const issuing =
      c && snapshot.success
        ? await this.policies.current(
            input.service,
            c.programId,
            this.prisma.client,
            snapshot.data.policyId,
          )
        : null;
    const disclosure = c && issuing ? await this.disclosure(input.service, c.programId) : null;
    if (
      !c ||
      !issuing ||
      !disclosure?.documentWithCredential ||
      !c.pdfStorageKey ||
      !c.pdfHash ||
      !c.issuedByUserId ||
      !c.approvedByUserId ||
      c.generatedByUserId === c.approvedByUserId
    ) {
      await audit('NOT_FOUND');
      throw Errors.notFound();
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(
        await this.storage.getObject(c.pdfStorageKey, { maxBytes: 10 * 1024 * 1024 }),
      );
    } catch {
      throw verificationUnavailable();
    }
    if (sha(bytes) !== c.pdfHash) throw verificationUnavailable();
    await audit('DOCUMENT_VIEWED');
    return bytes;
  }

  private period(program: DatabaseModels.ProgramModel, number: number) {
    return {
      structure:
        program.academicStructure === 'YEAR_WISE' ? ('YEAR' as const) : ('SEMESTER' as const),
      number,
    };
  }

  private async budget(principal: string, service: PublicVerificationService) {
    const limit = await this.limiter
      .hit(
        'public-verification-reference',
        [{ key: this.hasher.hash(`public-verification:v2:${service}`, principal), limit: 10 }],
        60,
      )
      .catch(() => {
        throw verificationUnavailable();
      });
    if (limit.limited)
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'PUBLIC_VERIFICATION_RATE_LIMITED',
        'Too many requests. Please wait before trying again.',
        {
          headers: { 'Retry-After': String(limit.retryAfterSeconds) },
        },
      );
  }

  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw verificationUnavailable();
    }
  }

  /** Budget, uniform failure handling and one audit event per anonymous check. */
  private run(
    service: PublicVerificationService,
    principal: string,
    ip: string,
    work: (
      make: (s: Response['status'], m: string, f?: Partial<Response>) => Response,
    ) => Promise<Response>,
  ): Promise<Response> {
    return this.guarded(async () => {
      await this.budget(principal, service);
      const response = await work((status, message, fields = {}) => ({
        contractVersion: 2,
        service,
        status,
        message,
        ...fields,
      }));
      await this.audit.writeAuditEvent({
        action: AUDIT_ACTIONS.publicVerificationChecked,
        entityType: 'public_verification',
        metadata: {
          contractVersion: 2,
          service,
          kind: 'ANONYMOUS',
          outcome: response.status,
          referenceHash: this.hasher.hash(`public-verification:v2:${service}`, principal),
          clientHash: this.hasher.hash('public-verification:client', ip),
        },
      });
      return officialVerificationResponseSchema.parse(response);
    });
  }
}
