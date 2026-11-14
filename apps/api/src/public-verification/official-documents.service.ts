import {
  prepareOfficialTemplateSchema,
  studentIssuedDocumentsSchema,
} from '@docversity/validation';
import { officialDocumentListSchema, officialDocumentReceiptSchema } from '@docversity/validation';
import type { z } from 'zod';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AUDIT_ACTIONS } from '@docversity/types';
import {
  officialDocumentSnapshotSchema,
  type PrepareOfficialDocument,
} from '@docversity/validation';
import { type ObjectStorage } from '@docversity/storage';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { AppError, Errors } from '../common/app-error.js';
import { assertStaticPdf, sniffContentType } from '../historical-documents/document-file.js';
import { VerificationPoliciesService } from './verification-policies.service.js';
const conflict = () =>
  new AppError(
    HttpStatus.CONFLICT,
    'CONFLICT',
    'The document authority or lifecycle has changed. Reload before acting.',
  );
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
@Injectable()
export class OfficialDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policies: VerificationPoliciesService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}
  async prepareTemplate(
    body: z.infer<typeof prepareOfficialTemplateSchema>,
    actor: string,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.client.$transaction(async (tx) => {
      const policy = await this.policies.current(
        body.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
        body.programId,
        tx,
        body.policyId,
      );
      if (!policy) throw Errors.forbidden();
      const prior = await tx.certificateTemplate.findFirst({
        where: { name: body.name },
        orderBy: { version: 'desc' },
      });
      const template = await tx.certificateTemplate.create({
        data: {
          name: body.name,
          documentType: body.documentType,
          version: (prior?.version ?? 0) + 1,
        },
      });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.officialDocumentChanged,
          entityType: 'CertificateTemplate',
          entityId: template.id,
          metadata: { action: 'PREPARE_TEMPLATE', policyId: policy.id, programId: body.programId },
        },
        tx,
      );
      return { id: template.id, status: template.status };
    });
  }
  async approveTemplate(id: string, actor: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM certificate_templates WHERE id=${id}::uuid FOR UPDATE`;
      const t = await tx.certificateTemplate.findUnique({ where: { id } });
      const receipt = await tx.auditLog.findFirst({
        where: {
          entityType: 'CertificateTemplate',
          entityId: id,
          action: AUDIT_ACTIONS.officialDocumentChanged,
        },
      });
      const authority = receipt?.metadata as { policyId?: string; programId?: string } | null;
      if (
        t?.status !== 'DRAFT' ||
        !receipt?.actorUserId ||
        receipt.actorUserId === actor ||
        !authority?.programId ||
        !authority.policyId
      )
        throw Errors.forbidden();
      if (
        !(await this.policies.current(
          t.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
          authority.programId,
          tx,
          authority.policyId,
        ))
      )
        throw Errors.forbidden();
      // Default routing can change without altering an immutable template or any issued document.
      await tx.$queryRaw`SELECT id FROM programs WHERE id=${authority.programId}::uuid FOR UPDATE`;
      await tx.programDocumentTemplate.deleteMany({
        where: { programId: authority.programId, documentType: t.documentType, isDefault: true },
      });
      await tx.programDocumentTemplate.create({
        data: {
          programId: authority.programId,
          documentType: t.documentType,
          certificateTemplateId: id,
          isDefault: true,
        },
      });
      await tx.certificateTemplate.update({ where: { id }, data: { status: 'ACTIVE' } });
      await this.audit.writeAuditEvent(
        {
          actorUserId: actor,
          action: AUDIT_ACTIONS.officialDocumentChanged,
          entityType: 'CertificateTemplate',
          entityId: id,
          metadata: { action: 'APPROVE_TEMPLATE' },
        },
        tx,
      );
      return { id, status: 'ACTIVE' };
    });
  }
  async ownDocuments(studentId: string) {
    const rows = await this.prisma.client.certificate.findMany({
      where: {
        studentRegistration: { studentId },
        status: 'ISSUED',
        sourceSnapshot: { path: ['usage'], equals: 'OFFICIAL' },
      },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
    const visible = [];
    for (const c of rows) {
      const snapshot = officialDocumentSnapshotSchema.safeParse(c.sourceSnapshot);
      if (
        !snapshot.success ||
        !c.certificateNumber ||
        !c.issueDate ||
        !c.issuedByUserId ||
        !c.approvedByUserId ||
        !(await this.policies.current(
          c.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
          c.programId,
          this.prisma.client,
          snapshot.data.policyId,
        ))
      )
        continue;
      visible.push({
        id: c.id,
        documentType: c.documentType,
        certificateNumber: c.certificateNumber,
        issueDate: c.issueDate.toISOString().slice(0, 10),
      });
    }
    return studentIssuedDocumentsSchema.parse(visible);
  }
  async list(): Promise<z.infer<typeof officialDocumentListSchema>> {
    return this.prisma.client.certificate.findMany({
      where: { sourceSnapshot: { path: ['usage'], equals: 'OFFICIAL' } },
      select: {
        id: true,
        status: true,
        certificateNumber: true,
        documentType: true,
        studentRegistrationId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async prepare(
    body: PrepareOfficialDocument,
    bytes: Buffer,
    actor: string,
  ): Promise<z.infer<typeof officialDocumentReceiptSchema>> {
    if (bytes.length > 10 * 1024 * 1024 || sniffContentType(bytes) !== 'application/pdf')
      throw Errors.validation([{ path: 'file', message: 'Upload a static PDF up to 10 MB.' }]);
    assertStaticPdf(bytes);
    const id = randomUUID(),
      key = `official-documents/${id}.pdf`,
      pdfHash = sha(bytes);
    // Storage write precedes SQL; failed authority leaves an unreferenced private object, never a credential.
    await this.storage.putObject(key, bytes, { contentType: 'application/pdf' });
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${body.registrationId}::uuid FOR SHARE`;
        const r = await tx.studentRegistration.findUnique({
          where: { id: body.registrationId },
          include: { program: true },
        });
        if (!r || !['ACTIVE', 'COMPLETED'].includes(r.status)) throw Errors.notFound();
        const service =
          body.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate';
        const policy = await this.policies.current(service, r.programId, tx, body.policyId);
        if (!policy) throw Errors.forbidden();
        const template = await tx.certificateTemplate.findFirst({
          where: { id: body.templateId, documentType: body.documentType, status: 'ACTIVE' },
        });
        const mapping = await tx.programDocumentTemplate.findFirst({
          where: {
            programId: r.programId,
            certificateTemplateId: body.templateId,
            documentType: body.documentType,
          },
        });
        if (!template || !mapping) throw conflict();
        let requestVersion: number | null = null;
        if (body.documentType !== 'ADMISSION_LETTER') {
          if (!body.requestId) throw conflict();
          await tx.$queryRaw`SELECT id FROM certificate_requests WHERE id=${body.requestId}::uuid FOR UPDATE`;
          const request = await tx.certificateRequest.findUnique({ where: { id: body.requestId } });
          if (
            request?.studentId !== r.studentId ||
            request.certificateType !== body.documentType ||
            request.status !== 'REVIEW_COMPLETED'
          )
            throw conflict();
          requestVersion = request.version;
          if (
            await tx.certificate.findFirst({
              where: {
                sourceSnapshot: { path: ['requestId'], equals: body.requestId },
                status: { in: ['PENDING_APPROVAL', 'APPROVED', 'ISSUED'] },
              },
            })
          )
            throw conflict();
        } else if (body.requestId) throw conflict();
        const snapshot = officialDocumentSnapshotSchema.parse({
          usage: 'OFFICIAL',
          policyId: policy.id,
          templateId: template.id,
          registrationId: r.id,
          institutionName: policy.definition.institutionName,
          programName: r.program.name,
          authorityReference: body.authorityReference,
          requestId: body.requestId ?? null,
          requestVersion,
        });
        const c = await tx.certificate.create({
          data: {
            id,
            studentRegistrationId: r.id,
            programId: r.programId,
            documentType: body.documentType,
            certificateTemplateId: template.id,
            certificateNumber: body.certificateNumber,
            issueDate: new Date(body.issueDate),
            status: 'PENDING_APPROVAL',
            sourceSnapshot: snapshot,
            pdfStorageKey: key,
            pdfHash,
            generatedByUserId: actor,
          },
        });
        await this.audit.writeAuditEvent(
          {
            actorUserId: actor,
            action: AUDIT_ACTIONS.officialDocumentChanged,
            entityType: 'Certificate',
            entityId: id,
            metadata: { action: 'PREPARE', policyId: policy.id },
          },
          tx,
        );
        return { id: c.id, status: c.status, certificateNumber: c.certificateNumber };
      });
    } catch (error) {
      // An ambiguous SQL commit must never delete a referenced document.
      try {
        if (!(await this.prisma.client.certificate.findUnique({ where: { id } })))
          await this.storage.deleteObject(key);
      } catch {
        /* Private orphan cleanup can be retried safely. */
      }
      throw error;
    }
  }
  async command(
    id: string,
    action: 'APPROVE' | 'ISSUE' | 'REVOKE',
    actor: string,
    reason?: string,
  ): Promise<z.infer<typeof officialDocumentReceiptSchema>> {
    return this.prisma.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM certificates WHERE id=${id}::uuid FOR UPDATE`;
        const c = await tx.certificate.findUnique({
          where: { id },
          include: { template: true },
        });
        const snapshot = officialDocumentSnapshotSchema.safeParse(c?.sourceSnapshot);
        if (
          !c ||
          !snapshot.success ||
          snapshot.data.registrationId !== c.studentRegistrationId ||
          snapshot.data.templateId !== c.certificateTemplateId
        )
          throw Errors.notFound();
        if (action === 'REVOKE') {
          if (c.status !== 'ISSUED' || !reason) throw conflict();
          await tx.certificate.update({
            where: { id },
            data: {
              status: 'REVOKED',
              revokedByUserId: actor,
              revokedAt: new Date(),
              revocationReason: reason,
            },
          });
        } else {
          await tx.$queryRaw`SELECT id FROM student_registrations WHERE id=${c.studentRegistrationId}::uuid FOR SHARE`;
          const registration = await tx.studentRegistration.findUnique({
            where: { id: c.studentRegistrationId },
          });
          if (!registration) throw Errors.notFound();
          const service =
            c.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate';
          const policy = await this.policies.current(
            service,
            c.programId,
            tx,
            snapshot.data.policyId,
          );
          if (
            !policy ||
            c.generatedByUserId === actor ||
            !c.generatedByUserId ||
            !['ACTIVE', 'COMPLETED'].includes(registration.status) ||
            c.template?.status !== 'ACTIVE'
          )
            throw Errors.forbidden();
          if (snapshot.data.requestId) {
            const request = await tx.certificateRequest.findUnique({
              where: { id: snapshot.data.requestId },
            });
            if (
              request?.status !== 'REVIEW_COMPLETED' ||
              request.version !== snapshot.data.requestVersion ||
              request.studentId !== registration.studentId ||
              request.certificateType !== c.documentType
            )
              throw conflict();
          }
          if (action === 'APPROVE' && c.status === 'PENDING_APPROVAL')
            await tx.certificate.update({
              where: { id },
              data: { status: 'APPROVED', approvedByUserId: actor, approvedAt: new Date() },
            });
          else if (
            action === 'ISSUE' &&
            c.status === 'APPROVED' &&
            c.approvedAt &&
            c.approvedByUserId &&
            c.approvedByUserId !== c.generatedByUserId &&
            c.pdfStorageKey &&
            c.pdfHash
          ) {
            const bytes = Buffer.from(
              await this.storage.getObject(c.pdfStorageKey, { maxBytes: 10 * 1024 * 1024 }),
            );
            if (sha(bytes) !== c.pdfHash) throw conflict();
            await tx.certificate.update({
              where: { id },
              data: {
                status: 'ISSUED',
                issuedByUserId: actor,
                issuedAt: new Date(),
                verificationToken: randomBytes(32).toString('base64url'),
              },
            });
          } else throw conflict();
        }
        await this.audit.writeAuditEvent(
          {
            actorUserId: actor,
            action: AUDIT_ACTIONS.officialDocumentChanged,
            entityType: 'Certificate',
            entityId: id,
            metadata: { action },
          },
          tx,
        );
        const changed = await tx.certificate.findUniqueOrThrow({ where: { id } });
        const service =
          changed.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate';
        return {
          id,
          status: changed.status,
          certificateNumber: changed.certificateNumber,
          ...(changed.status === 'ISSUED' && changed.verificationToken
            ? {
                verificationUrl: new URL(
                  `/verify/${service}#token=${changed.verificationToken}`,
                  this.config.WEB_URL,
                ).href,
              }
            : {}),
        };
      },
      { timeout: 20000 },
    );
  }
  async reviewDocument(id: string, actor: string) {
    const c = await this.prisma.client.certificate.findUnique({ where: { id } });
    if (
      !c ||
      !officialDocumentSnapshotSchema.safeParse(c.sourceSnapshot).success ||
      !c.pdfStorageKey ||
      !c.pdfHash
    )
      throw Errors.notFound();
    const bytes = Buffer.from(
      await this.storage.getObject(c.pdfStorageKey, { maxBytes: 10 * 1024 * 1024 }),
    );
    if (sha(bytes) !== c.pdfHash) throw conflict();
    await this.audit.writeAuditEvent({
      actorUserId: actor,
      action: AUDIT_ACTIONS.officialDocumentChanged,
      entityType: 'Certificate',
      entityId: id,
      metadata: { action: 'STAFF_REVIEW_DOWNLOAD' },
    });
    return bytes;
  }
  async download(studentId: string, id: string) {
    const c = await this.prisma.client.certificate.findFirst({
      where: { id, status: 'ISSUED', studentRegistration: { studentId } },
    });
    const snapshot = officialDocumentSnapshotSchema.safeParse(c?.sourceSnapshot);
    if (
      !c ||
      !snapshot.success ||
      !c.pdfStorageKey ||
      !c.pdfHash ||
      !c.issuedByUserId ||
      !c.approvedByUserId
    )
      throw Errors.notFound();
    if (
      !(await this.policies.current(
        c.documentType === 'ADMISSION_LETTER' ? 'admission-letter' : 'certificate',
        c.programId,
        this.prisma.client,
        snapshot.data.policyId,
      ))
    )
      throw Errors.notFound();
    const bytes = Buffer.from(
      await this.storage.getObject(c.pdfStorageKey, { maxBytes: 10 * 1024 * 1024 }),
    );
    if (sha(bytes) !== c.pdfHash) throw conflict();
    await this.audit.writeAuditEvent({
      action: AUDIT_ACTIONS.officialDocumentChanged,
      entityType: 'Certificate',
      entityId: id,
      metadata: { action: 'OWNER_DOWNLOAD' },
    });
    return bytes;
  }
}
