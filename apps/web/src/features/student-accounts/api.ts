import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type IssueActivationCodes,
  issuedActivationCodesSchema,
  type SetStudentAccountStatusInput,
  type StudentAccountQuery,
  studentAccountListSchema,
  studentAccountRowSchema,
} from '@docversity/validation';
import { z } from 'zod';
import { apiRequest } from '@/lib/api';

export const studentAccountKeys = {
  all: ['student-accounts'] as const,
  list: (q: Partial<StudentAccountQuery>) => ['student-accounts', 'list', q] as const,
};

export function useStudentAccounts(query: Partial<StudentAccountQuery>) {
  return useQuery({
    queryKey: studentAccountKeys.list(query),
    queryFn: () => apiRequest('GET', 'student-accounts', studentAccountListSchema, { query }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: studentAccountKeys.all });
}

/** Issues codes; the plain codes exist only in this response (shown once, then gone). */
export function useIssueCodes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: IssueActivationCodes) =>
      apiRequest('POST', 'student-accounts/activation-codes', issuedActivationCodesSchema, {
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useRevokeCodes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (registrationIds: string[]) =>
      apiRequest(
        'POST',
        'student-accounts/activation-codes/revoke',
        z.object({ revoked: z.number() }),
        {
          body: { registrationIds },
        },
      ),
    onSuccess: invalidate,
  });
}

export function useSetAccountStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { accountId: string; body: SetStudentAccountStatusInput }) =>
      apiRequest('POST', `student-accounts/${input.accountId}/status`, studentAccountRowSchema, {
        body: input.body,
      }),
    onSuccess: invalidate,
  });
}
