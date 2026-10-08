import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateRegistration,
  type CreateStudent,
  type StudentQuery,
  type UpdateRegistration,
  type UpdateStudent,
  activityListSchema,
  registrationSchema,
  studentDetailSchema,
  studentListSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const studentKeys = {
  all: ['students'] as const,
  list: (q: Partial<StudentQuery>) => ['students', 'list', q] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
  activity: (id: string) => ['students', 'activity', id] as const,
};

export const studentsApi = {
  list: (query: Partial<StudentQuery>) =>
    apiRequest('GET', 'students', studentListSchema, { query }),
  get: (id: string) => apiRequest('GET', `students/${id}`, studentDetailSchema),
  activity: (id: string) => apiRequest('GET', `students/${id}/activity`, activityListSchema),
  create: (body: CreateStudent) => apiRequest('POST', 'students', studentDetailSchema, { body }),
  update: (id: string, body: UpdateStudent) =>
    apiRequest('PATCH', `students/${id}`, studentDetailSchema, { body }),
  addRegistration: (body: CreateRegistration) =>
    apiRequest('POST', 'registrations', registrationSchema, { body }),
  updateRegistration: (id: string, body: UpdateRegistration) =>
    apiRequest('PATCH', `registrations/${id}`, registrationSchema, { body }),
};

export function useStudents(query: Partial<StudentQuery>) {
  return useQuery({
    queryKey: studentKeys.list(query),
    queryFn: () => studentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string) {
  return useQuery({ queryKey: studentKeys.detail(id), queryFn: () => studentsApi.get(id) });
}

export function useStudentActivity(id: string, enabled: boolean) {
  return useQuery({
    queryKey: studentKeys.activity(id),
    queryFn: () => studentsApi.activity(id),
    enabled,
  });
}

/** Any student/registration change invalidates student data and the dashboard counts. */
function useInvalidateStudents() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: studentKeys.all }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useCreateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({ mutationFn: studentsApi.create, onSuccess: invalidate });
}

export function useUpdateStudent(id: string) {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (body: UpdateStudent) => studentsApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useSaveRegistration() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateRegistration | UpdateRegistration }) =>
      input.id
        ? studentsApi.updateRegistration(input.id, input.body)
        : studentsApi.addRegistration(input.body as CreateRegistration),
    onSuccess: invalidate,
  });
}
