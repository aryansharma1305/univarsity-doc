import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ApproveReExamApplication,
  type CreateReExamFeeRule,
  reExamApplicationDetailSchema,
  reExamApplicationListSchema,
  type ReExamApplicationQuery,
  reExamFeeRuleListSchema,
  reExamFeeRuleSchema,
  type RejectReExamApplication,
} from '@docversity/validation';
import { apiDownload, apiRequest } from '@/lib/api';

export const reExamKeys = {
  all: ['re-exams'] as const,
  list: (q: Partial<ReExamApplicationQuery>) => ['re-exams', 'list', q] as const,
  detail: (id: string) => ['re-exams', 'detail', id] as const,
  feeRules: ['re-exams', 'fee-rules'] as const,
};

/** Query string of the current filters (without paging) for the CSV export. */
export function exportPath(query: Partial<ReExamApplicationQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries<string | number | undefined>(query)) {
    if (value !== undefined && key !== 'page' && key !== 'pageSize') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return `re-exam-applications/export${qs ? `?${qs}` : ''}`;
}

export const reExamsApi = {
  list: (query: Partial<ReExamApplicationQuery>) =>
    apiRequest('GET', 're-exam-applications', reExamApplicationListSchema, { query }),
  get: (id: string) =>
    apiRequest('GET', `re-exam-applications/${id}`, reExamApplicationDetailSchema),
  approve: (id: string, body: ApproveReExamApplication) =>
    apiRequest('POST', `re-exam-applications/${id}/approve`, reExamApplicationDetailSchema, {
      body,
    }),
  reject: (id: string, body: RejectReExamApplication) =>
    apiRequest('POST', `re-exam-applications/${id}/reject`, reExamApplicationDetailSchema, {
      body,
    }),
  exportCsv: (query: Partial<ReExamApplicationQuery>) =>
    apiDownload(exportPath(query), 're-exam-applications.csv'),
  feeRules: () => apiRequest('GET', 're-exam-fee-rules', reExamFeeRuleListSchema),
  createFeeRule: (body: CreateReExamFeeRule) =>
    apiRequest('POST', 're-exam-fee-rules', reExamFeeRuleSchema, { body }),
  activateFeeRule: (id: string) =>
    apiRequest('POST', `re-exam-fee-rules/${id}/activate`, reExamFeeRuleSchema),
  retireFeeRule: (id: string) =>
    apiRequest('POST', `re-exam-fee-rules/${id}/retire`, reExamFeeRuleSchema),
};

export function useReExamApplications(query: Partial<ReExamApplicationQuery>) {
  return useQuery({
    queryKey: reExamKeys.list(query),
    queryFn: () => reExamsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useReExamApplication(id: string) {
  return useQuery({ queryKey: reExamKeys.detail(id), queryFn: () => reExamsApi.get(id) });
}

export function useFeeRules() {
  return useQuery({ queryKey: reExamKeys.feeRules, queryFn: () => reExamsApi.feeRules() });
}

export function useReExamMutation<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: reExamKeys.all }),
  });
}
