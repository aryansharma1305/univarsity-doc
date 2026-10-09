import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateExamination,
  type CreateExternalExamApp,
  examinationDetailSchema,
  examinationListSchema,
  type ExaminationQuery,
  externalExamAppListSchema,
  externalExamAppSchema,
  type UpdateExamination,
  type UpdateExternalExamApp,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const examinationKeys = {
  all: ['examinations'] as const,
  list: (q: Partial<ExaminationQuery>) => ['examinations', 'list', q] as const,
  detail: (id: string) => ['examinations', 'detail', id] as const,
  apps: ['examinations', 'apps'] as const,
};

export const examinationsApi = {
  list: (query: Partial<ExaminationQuery>) =>
    apiRequest('GET', 'examinations', examinationListSchema, { query }),
  get: (id: string) => apiRequest('GET', `examinations/${id}`, examinationDetailSchema),
  create: (body: CreateExamination) =>
    apiRequest('POST', 'examinations', examinationDetailSchema, { body }),
  update: (id: string, body: UpdateExamination) =>
    apiRequest('PATCH', `examinations/${id}`, examinationDetailSchema, { body }),
  open: (id: string) => apiRequest('POST', `examinations/${id}/open`, examinationDetailSchema),
  archive: (id: string) =>
    apiRequest('POST', `examinations/${id}/archive`, examinationDetailSchema),
  setReExamApplications: (id: string, open: boolean) =>
    apiRequest('POST', `examinations/${id}/re-exam-applications`, examinationDetailSchema, {
      body: { open },
    }),
  apps: () => apiRequest('GET', 'examination-apps', externalExamAppListSchema),
  createApp: (body: CreateExternalExamApp) =>
    apiRequest('POST', 'examination-apps', externalExamAppSchema, { body }),
  updateApp: (id: string, body: UpdateExternalExamApp) =>
    apiRequest('PATCH', `examination-apps/${id}`, externalExamAppSchema, { body }),
};

export function useExaminations(query: Partial<ExaminationQuery>) {
  return useQuery({
    queryKey: examinationKeys.list(query),
    queryFn: () => examinationsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useExamination(id: string) {
  return useQuery({ queryKey: examinationKeys.detail(id), queryFn: () => examinationsApi.get(id) });
}

export function useExamApps() {
  return useQuery({ queryKey: examinationKeys.apps, queryFn: () => examinationsApi.apps() });
}

export function useExaminationMutation<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: examinationKeys.all }),
  });
}
