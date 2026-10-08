import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateProgram,
  type ProgramQuery,
  type UpdateProgram,
  programListSchema,
  programSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const programKeys = {
  all: ['programs'] as const,
  list: (q: Partial<ProgramQuery>) => ['programs', 'list', q] as const,
};

export const programsApi = {
  list: (query: Partial<ProgramQuery>) =>
    apiRequest('GET', 'programs', programListSchema, { query }),
  create: (body: CreateProgram) => apiRequest('POST', 'programs', programSchema, { body }),
  update: (id: string, body: UpdateProgram) =>
    apiRequest('PATCH', `programs/${id}`, programSchema, { body }),
};

export function usePrograms(query: Partial<ProgramQuery>) {
  return useQuery({
    queryKey: programKeys.list(query),
    queryFn: () => programsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Programs for select boxes (active only by default). */
export function useProgramOptions(status: 'ACTIVE' | undefined = 'ACTIVE') {
  const query = usePrograms({ status, pageSize: 100, sortBy: 'code' });
  return {
    ...query,
    programs: query.data?.data ?? [],
    options: (query.data?.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  };
}

export function useSaveProgram() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateProgram | UpdateProgram }) =>
      input.id
        ? programsApi.update(input.id, input.body)
        : programsApi.create(input.body as CreateProgram),
    onSuccess: () => client.invalidateQueries({ queryKey: programKeys.all }),
  });
}
