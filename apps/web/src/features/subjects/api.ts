import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateSubject,
  type SubjectQuery,
  type UpdateSubject,
  subjectListSchema,
  subjectSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const subjectKeys = {
  all: ['subjects'] as const,
  list: (q: Partial<SubjectQuery>) => ['subjects', 'list', q] as const,
};

export const subjectsApi = {
  list: (query: Partial<SubjectQuery>) =>
    apiRequest('GET', 'subjects', subjectListSchema, { query }),
  create: (body: CreateSubject) => apiRequest('POST', 'subjects', subjectSchema, { body }),
  update: (id: string, body: UpdateSubject) =>
    apiRequest('PATCH', `subjects/${id}`, subjectSchema, { body }),
};

export function useSubjects(query: Partial<SubjectQuery>, enabled = true) {
  return useQuery({
    queryKey: subjectKeys.list(query),
    queryFn: () => subjectsApi.list(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSaveSubject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateSubject | UpdateSubject }) =>
      input.id
        ? subjectsApi.update(input.id, input.body)
        : subjectsApi.create(input.body as CreateSubject),
    onSuccess: () => client.invalidateQueries({ queryKey: subjectKeys.all }),
  });
}
