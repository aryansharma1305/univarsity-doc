import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@docversity/database';
import {
  academicCertificateSample,
  verifyAcademicSample,
  ACADEMIC_SAMPLE_MAX_BYTES,
} from '@docversity/documents';
import { objectKeys, type ObjectStorage } from '@docversity/storage';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  ERROR_CODES,
  syntheticCertificatePolicySchema,
  syntheticCertificateReceiptSchema,
  type PrepareSyntheticCertificate,
  type SyntheticCertificateCommand,
} from '@docversity/validation';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';

const snapshotSchema = z
  .object({
    contractVersion: z.literal(1),
    usage: z.literal('SYNTHETIC_ONLY'),
    unsigned: z.literal(true),
    applicationId: z.uuid(),
    applicationVersion: z.number().int().positive(),
    registrationId: z.uuid(),
    prepareDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sampleId: z.enum(['sample-provisional-v1', 'sample-transcript-v1', 'sample-character-v1']),
  })
  .strict();
const digest = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const conflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    ERROR_CODES.conflict,
    'This synthetic credential cannot make that transition. Nothing official was issued.',
  );
type Action = 'APPROVE' | 'ISSUE' | 'REVOKE';
type Certificate = Prisma.CertificateGetPayload<{
  select: { id: true; status: true; certificateNumber: true };
}>;

@Injectable()
export class SyntheticCertificatesService {
  private readonly logger = new Logger(SyntheticCertificatesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // No runtime activation flag or live signing policy. Tests supply an explicit registration allowlist.
  policyDefinition(): unknown {
    return null;
  }
  private policy() {
    const policy = syntheticCertificatePolicySchema.safeParse(this.policyDefinition());
    if (this.config.NODE_ENV !== 'test' || !policy.success) throw Errors.notFound();
    return policy.data;
  }
  private present(c: Certificate) {
    return syntheticCertificateReceiptSchema.parse({
      contractVersion: 1,
      usage: 'SYNTHETIC_ONLY',
      certificateId: c.id,
      status: c.status,
      certificateNumber: c.certificateNumber,
      unsigned: true,
      officialIssuanceAllowed: false,
    });
  }
  private async auditReceipt(
    tx: Prisma.TransactionClient,
    c: Certificate,
    actor: string,
    requestId: string,
    requestDigest: string,
    action: string,
  ) {
    const receipt = this.present(c);
    await this.audit.writeAuditEvent(
      {
        actorUserId: actor,
        action: AUDIT_ACTIONS.syntheticCertificateTransitioned,
        entityType: 'SyntheticCertificate',
        entityId: c.id,
        metadata: { requestId, requestDigest, action, receipt },
      },
      tx,
    );
    return receipt;
  }
  private async replay(
    tx: Prisma.TransactionClient,
    id: string,
    requestId: string,
    requestDigest: string,
  ) {
    const prior = await tx.auditLog.findFirst({
      where: {
        entityType: 'SyntheticCertificate',
        entityId: id,
        action: AUDIT_ACTIONS.syntheticCertificateTransitioned,
        metadata: { path: ['requestId'], equals: requestId },
      },
    });
    if (!prior) return null;
    const parsed = z
      .object({ requestDigest: z.string(), receipt: syntheticCertificateReceiptSchema })
      .safeParse(prior.metadata);
    if (!parsed.success || parsed.data.requestDigest !== requestDigest) throw conflict();
    return parsed.data.receipt;
  }

  async prepare(applicationId: string, body: PrepareSyntheticCertificate, actor: string) {
    const policy = this.policy();
    if (!policy.registrationIds.includes(body.registrationId)) throw Errors.notFound();
    const fingerprint = digest({ applicationId, body, actor, action: 'PREPARE' });
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM certificate_requests WHERE id=${applicationId}::uuid FOR UPDATE`;
      const request = await tx.certificateRequest.findUnique({ where: { id: applicationId } });
      if (!request) throw Errors.notFound();
      await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${body.registrationId}::uuid FOR SHARE`;
      const registration = await tx.studentRegistration.findFirst({
        where: {
          id: body.registrationId,
          studentId: request.studentId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
      });
      if (!registration) throw Errors.notFound();
      if (request.status !== 'REVIEW_COMPLETED') throw conflict();
      const replay = await this.replay(tx, body.requestId, body.requestId, fingerprint);
      if (replay) return replay;
      const type = z
        .enum(['PROVISIONAL', 'TRANSCRIPT', 'CHARACTER'])
        .safeParse(request.certificateType);
      if (!type.success) throw conflict();
      const sampleId = `sample-${type.data.toLowerCase()}-v1`;
      const snapshot = snapshotSchema.parse({
        contractVersion: 1,
        usage: 'SYNTHETIC_ONLY',
        unsigned: true,
        applicationId,
        applicationVersion: request.version,
        registrationId: registration.id,
        prepareDigest: fingerprint,
        sampleId,
      });
      if (body.replacesId) {
        await tx.$queryRaw`SELECT id FROM certificates WHERE id=${body.replacesId}::uuid FOR UPDATE`;
        const prior = await tx.certificate.findUnique({ where: { id: body.replacesId } });
        if (
          !prior ||
          !snapshotSchema.safeParse(prior.sourceSnapshot).success ||
          prior.studentRegistrationId !== registration.id ||
          prior.documentType !== type.data ||
          !['ISSUED', 'REVOKED'].includes(prior.status)
        )
          throw conflict();
      } else if (
        await tx.certificate.findFirst({
          where: {
            studentRegistrationId: registration.id,
            sourceSnapshot: { path: ['applicationId'], equals: applicationId },
          },
        })
      )
        throw conflict();
      const certificate = await tx.certificate.create({
        data: {
          id: body.requestId,
          studentRegistrationId: registration.id,
          programId: registration.programId,
          documentType: type.data,
          status: 'PENDING_APPROVAL',
          generatedByUserId: actor,
          sourceSnapshot: snapshot,
          supersedesCertificateId: body.replacesId ?? null,
        },
      });
      return this.auditReceipt(tx, certificate, actor, body.requestId, fingerprint, 'PREPARE');
    });
  }

  async command(id: string, action: Action, body: SyntheticCertificateCommand, actor: string) {
    const policy = this.policy();
    const fingerprint = digest({ id, action, body, actor });
    let attemptedKey: string | undefined;
    try {
      return await this.prisma.client.$transaction(
        async (tx) => {
          const initial = await tx.certificate.findUnique({ where: { id } });
          const origin = snapshotSchema.safeParse(initial?.sourceSnapshot);
          if (
            !initial ||
            !origin.success ||
            !policy.registrationIds.includes(initial.studentRegistrationId)
          )
            throw Errors.notFound();
          // Match prepare's request → registration → certificate order and freeze source authority.
          await tx.$queryRaw`SELECT id FROM certificate_requests WHERE id=${origin.data.applicationId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${initial.studentRegistrationId}::uuid FOR SHARE`;
          await tx.$queryRaw`SELECT id FROM certificates WHERE id=${id}::uuid FOR UPDATE`;
          const c = await tx.certificate.findUnique({ where: { id } });
          const snapshot = snapshotSchema.safeParse(c?.sourceSnapshot);
          if (
            !c ||
            !snapshot.success ||
            snapshot.data.applicationId !== origin.data.applicationId ||
            !policy.registrationIds.includes(c.studentRegistrationId) ||
            snapshot.data.registrationId !== c.studentRegistrationId
          )
            throw Errors.notFound();
          const replay = await this.replay(tx, id, body.requestId, fingerprint);
          if (replay) return replay;
          if (action !== 'REVOKE') {
            const request = await tx.certificateRequest.findUnique({
              where: { id: snapshot.data.applicationId },
            });
            const registration = await tx.studentRegistration.findUnique({
              where: { id: c.studentRegistrationId },
            });
            if (!request || !registration) throw conflict();
            if (
              request.studentId !== registration.studentId ||
              request.certificateType !== c.documentType ||
              request.status !== 'REVIEW_COMPLETED' ||
              request.version !== snapshot.data.applicationVersion ||
              !['ACTIVE', 'COMPLETED'].includes(registration.status)
            )
              throw conflict();
          }
          let data: Prisma.CertificateUpdateInput;
          if (
            action === 'APPROVE' &&
            c.status === 'PENDING_APPROVAL' &&
            c.generatedByUserId !== actor
          ) {
            data = {
              status: 'APPROVED',
              approvedBy: { connect: { id: actor } },
              approvedAt: new Date(),
            };
          } else if (
            action === 'ISSUE' &&
            c.status === 'APPROVED' &&
            c.generatedByUserId !== actor &&
            c.approvedByUserId &&
            c.approvedByUserId !== c.generatedByUserId
          ) {
            const bytes = academicCertificateSample(snapshot.data.sampleId, c.documentType);
            attemptedKey = objectKeys.syntheticCertificate(c.id);
            await this.storage.putObject(attemptedKey, bytes, { contentType: 'application/pdf' });
            const sequence = await tx.numberSequence.upsert({
              where: { key: 'synthetic-credentials-v1' },
              create: { key: 'synthetic-credentials-v1', currentValue: 1 },
              update: { currentValue: { increment: 1 } },
            });
            data = {
              status: 'ISSUED',
              certificateNumber: `SAMPLE-NOT-VALID-${String(sequence.currentValue).padStart(6, '0')}`,
              verificationToken: `SAMPLE_${randomBytes(32).toString('base64url')}`,
              issueDate: new Date(),
              issuedAt: new Date(),
              issuedBy: { connect: { id: actor } },
              pdfStorageKey: attemptedKey,
              pdfHash: digestBytes(bytes),
            };
          } else if (action === 'REVOKE' && c.status === 'ISSUED' && body.reason) {
            data = {
              status: 'REVOKED',
              revokedBy: { connect: { id: actor } },
              revokedAt: new Date(),
              revocationReason: body.reason,
            };
          } else throw conflict();
          const changed = await tx.certificate.update({ where: { id }, data });
          if (action === 'ISSUE' && c.supersedesCertificateId) {
            await tx.$queryRaw`SELECT id FROM certificates WHERE id=${c.supersedesCertificateId}::uuid FOR UPDATE`;
            const prior = await tx.certificate.findUniqueOrThrow({
              where: { id: c.supersedesCertificateId },
            });
            if (prior.status === 'ISSUED')
              await tx.certificate.update({
                where: { id: prior.id },
                data: { status: 'SUPERSEDED' },
              });
            else if (prior.status !== 'REVOKED') throw conflict();
          }
          return this.auditReceipt(tx, changed, actor, body.requestId, fingerprint, action);
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (attemptedKey) {
        try {
          const current = await this.prisma.client.certificate.findUnique({ where: { id } });
          // An ambiguous DB commit must never lead to deletion of a referenced PDF.
          if (current?.pdfStorageKey !== attemptedKey)
            await this.storage.deleteObject(attemptedKey);
        } catch {
          this.logger.warn('Synthetic PDF cleanup deferred; no referenced object was deleted.');
        }
      }
      throw error;
    }
  }

  async preview(studentId: string, id: string) {
    const policy = this.policy();
    const c = await this.prisma.client.certificate.findFirst({
      where: {
        id,
        status: 'ISSUED',
        studentRegistration: { studentId },
        studentRegistrationId: { in: policy.registrationIds },
      },
    });
    const snapshot = snapshotSchema.safeParse(c?.sourceSnapshot);
    if (
      !c ||
      !snapshot.success ||
      snapshot.data.registrationId !== c.studentRegistrationId ||
      !c.pdfStorageKey ||
      !c.pdfHash
    )
      throw Errors.notFound();
    const bytes = Buffer.from(
      await this.storage.getObject(c.pdfStorageKey, { maxBytes: ACADEMIC_SAMPLE_MAX_BYTES }),
    );
    verifyAcademicSample(snapshot.data.sampleId, c.documentType, bytes);
    if (digestBytes(bytes) !== c.pdfHash) throw conflict();
    await this.audit.writeAuditEvent({
      action: AUDIT_ACTIONS.syntheticCertificateTransitioned,
      entityType: 'SyntheticCertificate',
      entityId: c.id,
      metadata: { action: 'PREVIEW' },
    });
    return bytes;
  }
}
const digestBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
