import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AcademicSessionQuery,
  type CreateAcademicSession,
  type UpdateAcademicSession,
  academicSessionListSchema,
  academicSessionSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const sessionKeys = {
  all: ['academic-sessions'] as const,
  list: (q: Partial<AcademicSessionQuery>) => ['academic-sessions', 'list', q] as const,
};

export const sessionsApi = {
  list: (query: Partial<AcademicSessionQuery>) =>
    apiRequest('GET', 'academic-sessions', academicSessionListSchema, { query }),
  create: (body: CreateAcademicSession) =>
    apiRequest('POST', 'academic-sessions', academicSessionSchema, { body }),
  update: (id: string, body: UpdateAcademicSession) =>
    apiRequest('PATCH', `academic-sessions/${id}`, academicSessionSchema, { body }),
};

export function useAcademicSessions(query: Partial<AcademicSessionQuery>) {
  return useQuery({
    queryKey: sessionKeys.list(query),
    queryFn: () => sessionsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Sessions that can receive registrations (everything except archived). */
export function useSessionOptions() {
  const query = useAcademicSessions({ pageSize: 100, sortBy: 'startsOn', sortOrder: 'desc' });
  return {
    ...query,
    options: (query.data?.data ?? [])
      .filter((s) => s.status !== 'ARCHIVED')
      .map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    all: (query.data?.data ?? []).map((s) => ({ value: s.id, label: s.code })),
  };
}

export function useSaveAcademicSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateAcademicSession | UpdateAcademicSession }) =>
      input.id
        ? sessionsApi.update(input.id, input.body)
        : sessionsApi.create(input.body as CreateAcademicSession),
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKeys.all }),
  });
}
