import {
  commitDraftImportSchema,
  draftAuditSchema,
  draftImportOutcomeSchema,
  draftImportPlanSchema,
  draftListSchema,
  draftLookupResponseSchema,
  savedDraftSchema,
  type CommitDraftImport,
  type DraftLookup,
  type SaveDraft,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';
export const draftResultsApi = {
  list: () => apiRequest('GET', 'draft-results', draftListSchema),
  get: (id: string) => apiRequest('GET', `draft-results/${id}`, savedDraftSchema),
  lookup: (body: DraftLookup) =>
    apiRequest('POST', 'draft-results/lookup', draftLookupResponseSchema, { body }),
  save: (body: SaveDraft) => apiRequest('POST', 'draft-results', savedDraftSchema, { body }),
  history: (id: string) => apiRequest('GET', `draft-results/${id}/history`, draftAuditSchema),
  plan: (id: string) =>
    apiRequest('POST', `draft-results/imports/${id}/plan`, draftImportPlanSchema),
  commit: (id: string, body: CommitDraftImport) =>
    apiRequest('POST', `draft-results/imports/${id}/commit`, draftImportOutcomeSchema, {
      body: commitDraftImportSchema.parse(body),
    }),
};
