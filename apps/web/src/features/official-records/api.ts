import {
  officialActionReceiptSchema,
  officialDocumentReceiptSchema,
  officialPolicyListSchema,
  officialStaffDocumentListSchema,
  officialTemplateListSchema,
  registrationListSchema,
  verificationAuditListSchema,
  verificationPolicyResponseSchema,
  type officialPolicyQuerySchema,
  type officialDocumentQuerySchema,
  type officialTemplateQuerySchema,
} from '@docversity/validation';
import type { z } from 'zod';
import { apiFile, apiRequest, apiUpload } from '@/lib/api';
export const officialApi = {
  policies: (query: Partial<z.infer<typeof officialPolicyQuerySchema>>) =>
    apiRequest('GET', 'verification-policies', officialPolicyListSchema, { query }),
  propose: (body: unknown) =>
    apiRequest('POST', 'verification-policies', verificationPolicyResponseSchema, { body }),
  policyAction: (id: string, action: 'approve' | 'withdraw') =>
    apiRequest('POST', `verification-policies/${id}/${action}`, verificationPolicyResponseSchema, {
      body: {},
    }),
  documents: (query: Partial<z.infer<typeof officialDocumentQuerySchema>>) =>
    apiRequest('GET', 'official-documents', officialStaffDocumentListSchema, { query }),
  documentAction: (id: string, action: 'approve' | 'issue' | 'revoke', reason?: string) =>
    apiRequest('POST', `official-documents/${id}/${action}`, officialDocumentReceiptSchema, {
      body: reason ? { reason } : {},
    }),
  verificationLink: (id: string) =>
    apiRequest(
      'POST',
      `official-documents/${id}/verification-link`,
      officialDocumentReceiptSchema,
      {
        body: {},
      },
    ),
  /** Without a file the body must ask the server to generate the PDF (admission letters). */
  prepare: (body: unknown, file?: File) => {
    const form = new FormData();
    form.set('metadata', JSON.stringify(body));
    if (file) form.set('file', file);
    return apiUpload('official-documents', form, officialDocumentReceiptSchema);
  },
  templates: (query: Partial<z.infer<typeof officialTemplateQuerySchema>>) =>
    apiRequest('GET', 'official-documents/templates', officialTemplateListSchema, { query }),
  template: (body: unknown) =>
    apiRequest('POST', 'official-documents/templates', officialActionReceiptSchema, { body }),
  approveTemplate: (id: string) =>
    apiRequest('POST', `official-documents/templates/${id}/approve`, officialActionReceiptSchema, {
      body: {},
    }),
  registrations: (search: string, page: number) =>
    apiRequest('GET', 'registrations', registrationListSchema, {
      query: { search, page, pageSize: 25, sortBy: 'registrationNumber' },
    }),
  admissionLetterPreview: async (body: unknown) =>
    (await apiFile('official-documents/admission-letter/preview', body)).blob,
  audit: (page: number) =>
    apiRequest('GET', 'verification-audit', verificationAuditListSchema, {
      query: { page, pageSize: 25, sortOrder: 'desc' },
    }),
  attest: (id: string, body: unknown) =>
    apiRequest('POST', `official-results/${id}/attest`, officialActionReceiptSchema, { body }),
  publish: (id: string, body: unknown) =>
    apiRequest('POST', `official-results/${id}/publish`, officialActionReceiptSchema, { body }),
  withdraw: (id: string) =>
    apiRequest('POST', `official-results/${id}/withdraw`, officialActionReceiptSchema, {
      body: {},
    }),
};
