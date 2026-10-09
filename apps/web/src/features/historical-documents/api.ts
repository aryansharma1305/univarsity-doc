import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type HistoricalDocumentQuery,
  historicalDocumentDetailSchema,
  historicalDocumentListSchema,
  type ReviewAuthenticity,
  type UpdateHistoricalDocument,
  type WithdrawHistoricalDocument,
} from '@docversity/validation';
import { apiRequest, apiUpload } from '@/lib/api';

export const documentKeys = {
  all: ['historical-documents'] as const,
  list: (q: Partial<HistoricalDocumentQuery>) => ['historical-documents', 'list', q] as const,
  detail: (id: string) => ['historical-documents', 'detail', id] as const,
};

/**
 * Same-origin file URL; the API checks the staff permission and audits every access. `original` is
 * the evidential upload; `student` is exactly what the student receives.
 */
export function documentFileUrl(
  id: string,
  disposition: 'inline' | 'attachment',
  variant: 'original' | 'student' = 'original',
) {
  return `/api/v1/historical-documents/${id}/file?disposition=${disposition}&variant=${variant}`;
}

/** Multipart body: text fields (empty values omitted) plus the file. */
export function documentForm(fields: Record<string, string | null | undefined>, file: File) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') form.set(name, value);
  }
  form.set('file', file);
  return form;
}

export const documentsApi = {
  list: (query: Partial<HistoricalDocumentQuery>) =>
    apiRequest('GET', 'historical-documents', historicalDocumentListSchema, { query }),
  get: (id: string) =>
    apiRequest('GET', `historical-documents/${id}`, historicalDocumentDetailSchema),
  upload: (form: FormData) =>
    apiUpload('historical-documents', form, historicalDocumentDetailSchema),
  replace: (id: string, form: FormData) =>
    apiUpload(`historical-documents/${id}/replace`, form, historicalDocumentDetailSchema),
  update: (id: string, body: UpdateHistoricalDocument) =>
    apiRequest('PATCH', `historical-documents/${id}`, historicalDocumentDetailSchema, { body }),
  publish: (id: string) =>
    apiRequest('POST', `historical-documents/${id}/publish`, historicalDocumentDetailSchema),
  withdraw: (id: string, body: WithdrawHistoricalDocument) =>
    apiRequest('POST', `historical-documents/${id}/withdraw`, historicalDocumentDetailSchema, {
      body,
    }),
  review: (id: string, body: ReviewAuthenticity) =>
    apiRequest('POST', `historical-documents/${id}/authenticity`, historicalDocumentDetailSchema, {
      body,
    }),
};

export function useHistoricalDocuments(query: Partial<HistoricalDocumentQuery>) {
  return useQuery({
    queryKey: documentKeys.list(query),
    queryFn: () => documentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useHistoricalDocument(id: string) {
  return useQuery({ queryKey: documentKeys.detail(id), queryFn: () => documentsApi.get(id) });
}

export function useDocumentMutation<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: documentKeys.all }),
  });
}
