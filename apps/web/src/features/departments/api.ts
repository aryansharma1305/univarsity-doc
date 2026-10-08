import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateDepartment,
  type DepartmentQuery,
  type UpdateDepartment,
  departmentListSchema,
  departmentSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const departmentKeys = {
  all: ['departments'] as const,
  list: (query: Partial<DepartmentQuery>) => ['departments', 'list', query] as const,
};

export const departmentsApi = {
  list: (query: Partial<DepartmentQuery>) =>
    apiRequest('GET', 'departments', departmentListSchema, { query }),
  create: (body: CreateDepartment) => apiRequest('POST', 'departments', departmentSchema, { body }),
  update: (id: string, body: UpdateDepartment) =>
    apiRequest('PATCH', `departments/${id}`, departmentSchema, { body }),
};

export function useDepartments(query: Partial<DepartmentQuery>) {
  return useQuery({
    queryKey: departmentKeys.list(query),
    queryFn: () => departmentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

/** Active departments for select boxes. */
export function useActiveDepartmentOptions() {
  const query = useDepartments({ status: 'ACTIVE', pageSize: 100, sortBy: 'code' });
  return {
    ...query,
    options: (query.data?.data ?? []).map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })),
  };
}

export function useSaveDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateDepartment | UpdateDepartment }) =>
      input.id
        ? departmentsApi.update(input.id, input.body)
        : departmentsApi.create(input.body as CreateDepartment),
    onSuccess: () => client.invalidateQueries({ queryKey: departmentKeys.all }),
  });
}
