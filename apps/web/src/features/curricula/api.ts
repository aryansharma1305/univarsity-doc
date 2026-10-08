import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AddCurriculumSubject,
  type AssignCurriculum,
  assignCurriculumResultSchema,
  type CreateCurriculum,
  curriculumDetailSchema,
  curriculumListSchema,
  type CurriculumRegistrationQuery,
  curriculumRegistrationListSchema,
  type ReorderCurriculumSubjects,
  type UpdateCurriculum,
  type UpdateCurriculumSubject,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const curriculumKeys = {
  all: ['curricula'] as const,
  forProgram: (programId: string) => ['curricula', 'program', programId] as const,
  detail: (id: string) => ['curricula', 'detail', id] as const,
  registrations: (id: string, q: Partial<CurriculumRegistrationQuery>) =>
    ['curricula', 'registrations', id, q] as const,
};

export const curriculaApi = {
  list: (programId: string) =>
    apiRequest('GET', `programs/${programId}/curricula`, curriculumListSchema),
  get: (id: string) => apiRequest('GET', `curricula/${id}`, curriculumDetailSchema),
  create: (programId: string, body: CreateCurriculum) =>
    apiRequest('POST', `programs/${programId}/curricula`, curriculumDetailSchema, { body }),
  update: (id: string, body: UpdateCurriculum) =>
    apiRequest('PATCH', `curricula/${id}`, curriculumDetailSchema, { body }),
  activate: (id: string) => apiRequest('POST', `curricula/${id}/activate`, curriculumDetailSchema),
  archive: (id: string) => apiRequest('POST', `curricula/${id}/archive`, curriculumDetailSchema),
  addSubject: (id: string, body: AddCurriculumSubject) =>
    apiRequest('POST', `curricula/${id}/subjects`, curriculumDetailSchema, { body }),
  updateSubject: (id: string, assignmentId: string, body: UpdateCurriculumSubject) =>
    apiRequest('PATCH', `curricula/${id}/subjects/${assignmentId}`, curriculumDetailSchema, {
      body,
    }),
  removeSubject: (id: string, assignmentId: string) =>
    apiRequest('DELETE', `curricula/${id}/subjects/${assignmentId}`, curriculumDetailSchema),
  reorder: (id: string, body: ReorderCurriculumSubjects) =>
    apiRequest('POST', `curricula/${id}/subjects/reorder`, curriculumDetailSchema, { body }),
  registrations: (id: string, query: Partial<CurriculumRegistrationQuery>) =>
    apiRequest('GET', `curricula/${id}/registrations`, curriculumRegistrationListSchema, {
      query,
    }),
  assign: (id: string, body: AssignCurriculum) =>
    apiRequest('POST', `curricula/${id}/registrations`, assignCurriculumResultSchema, { body }),
};

export function useCurricula(programId: string) {
  return useQuery({
    queryKey: curriculumKeys.forProgram(programId),
    queryFn: () => curriculaApi.list(programId),
  });
}

export function useCurriculum(id: string) {
  return useQuery({ queryKey: curriculumKeys.detail(id), queryFn: () => curriculaApi.get(id) });
}

export function useCurriculumRegistrations(
  id: string,
  query: Partial<CurriculumRegistrationQuery>,
) {
  return useQuery({
    queryKey: curriculumKeys.registrations(id, query),
    queryFn: () => curriculaApi.registrations(id, query),
    placeholderData: keepPreviousData,
  });
}

/** Any curriculum change refreshes curricula, programs (counts), subjects (usage) and students. */
export function useInvalidateCurricula() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: curriculumKeys.all }),
      client.invalidateQueries({ queryKey: ['programs'] }),
      client.invalidateQueries({ queryKey: ['subjects'] }),
      client.invalidateQueries({ queryKey: ['students'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useCurriculumMutation<TArgs>(run: (args: TArgs) => Promise<unknown>) {
  const invalidate = useInvalidateCurricula();
  return useMutation({ mutationFn: run, onSuccess: invalidate });
}
