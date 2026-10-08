import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CommitImport,
  type ImportJob,
  type ImportJobQuery,
  type ImportMappingInput,
  type ImportRowQuery,
  type ImportStatus,
  importCreatorListSchema,
  importJobListSchema,
  importJobSchema,
  importRowDetailSchema,
  importRowListSchema,
} from '@docversity/validation';
import { apiDownload, apiRequest, apiUpload } from '@/lib/api';

/** Statuses in which the worker is running a step — the only time the UI polls. */
export const RUNNING_STATUSES: readonly ImportStatus[] = ['UPLOADED', 'VALIDATING', 'PROCESSING'];
const POLL_INTERVAL_MS = 1_500;

export const importKeys = {
  all: ['imports'] as const,
  list: (q: Partial<ImportJobQuery>) => ['imports', 'list', q] as const,
  creators: ['imports', 'creators'] as const,
  detail: (id: string) => ['imports', 'detail', id] as const,
  rows: (id: string, q: Partial<ImportRowQuery>) => ['imports', 'rows', id, q] as const,
  row: (id: string, rowNumber: number) => ['imports', 'row', id, rowNumber] as const,
};

export const importsApi = {
  list: (query: Partial<ImportJobQuery>) =>
    apiRequest('GET', 'imports', importJobListSchema, { query }),
  creators: () => apiRequest('GET', 'imports/creators', importCreatorListSchema),
  get: (id: string) => apiRequest('GET', `imports/${id}`, importJobSchema),
  rows: (id: string, query: Partial<ImportRowQuery>) =>
    apiRequest('GET', `imports/${id}/rows`, importRowListSchema, { query }),
  row: (id: string, rowNumber: number) =>
    apiRequest('GET', `imports/${id}/rows/${rowNumber}`, importRowDetailSchema),
  create: (file: File) => {
    const form = new FormData();
    form.append('type', 'STUDENTS');
    form.append('file', file);
    return apiUpload('imports', form, importJobSchema);
  },
  saveMapping: (id: string, body: ImportMappingInput) =>
    apiRequest('POST', `imports/${id}/mapping`, importJobSchema, { body }),
  validate: (id: string) => apiRequest('POST', `imports/${id}/validate`, importJobSchema),
  commit: (id: string, body: CommitImport) =>
    apiRequest('POST', `imports/${id}/commit`, importJobSchema, { body }),
  cancel: (id: string) => apiRequest('POST', `imports/${id}/cancel`, importJobSchema),
  retry: (id: string) => apiRequest('POST', `imports/${id}/retry`, importJobSchema),
  downloadTemplate: () =>
    apiDownload('imports/templates/students', 'docversity-student-import-template.xlsx'),
  downloadReport: (id: string) => apiDownload(`imports/${id}/error-report`, 'import-issues.xlsx'),
};

export function useImports(query: Partial<ImportJobQuery>) {
  return useQuery({
    queryKey: importKeys.list(query),
    queryFn: () => importsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useImportCreators() {
  return useQuery({ queryKey: importKeys.creators, queryFn: importsApi.creators });
}

/**
 * The import, polled only while a worker step runs (persisted progress — never simulated), and
 * not at all once it is waiting for the user or finished.
 */
export function useImportJob(id: string) {
  return useQuery({
    queryKey: importKeys.detail(id),
    queryFn: () => importsApi.get(id),
    refetchInterval: (query) =>
      query.state.data && RUNNING_STATUSES.includes(query.state.data.status)
        ? POLL_INTERVAL_MS
        : false,
  });
}

export function useImportRows(id: string, query: Partial<ImportRowQuery>, enabled: boolean) {
  return useQuery({
    queryKey: importKeys.rows(id, query),
    queryFn: () => importsApi.rows(id, query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useImportRow(id: string, rowNumber: number | null) {
  return useQuery({
    queryKey: importKeys.row(id, rowNumber ?? 0),
    queryFn: () => importsApi.row(id, rowNumber ?? 0),
    enabled: rowNumber !== null,
  });
}

/** Runs an import step and stores the returned state (no refetch round-trip needed). */
export function useImportStep<TInput>(id: string, run: (input: TInput) => Promise<ImportJob>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (job) => {
      client.setQueryData(importKeys.detail(id), job);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['imports', 'rows', id] }),
        client.invalidateQueries({ queryKey: ['imports', 'list'] }),
      ]);
    },
  });
}

export function useCreateImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: importsApi.create,
    onSuccess: (job) => {
      client.setQueryData(importKeys.detail(job.id), job);
      return client.invalidateQueries({ queryKey: ['imports', 'list'] });
    },
  });
}
