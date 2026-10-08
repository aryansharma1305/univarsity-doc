import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ProfileRequestQuery,
  type RejectProfileRequest,
  profileRequestDetailSchema,
  profileRequestListSchema,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';

export const profileRequestKeys = {
  all: ['profile-requests'] as const,
  list: (q: Partial<ProfileRequestQuery>) => ['profile-requests', 'list', q] as const,
  detail: (id: string) => ['profile-requests', 'detail', id] as const,
};

export const profileRequestsApi = {
  list: (query: Partial<ProfileRequestQuery>) =>
    apiRequest('GET', 'profile-requests', profileRequestListSchema, { query }),
  get: (id: string) => apiRequest('GET', `profile-requests/${id}`, profileRequestDetailSchema),
  approve: (id: string) =>
    apiRequest('POST', `profile-requests/${id}/approve`, profileRequestDetailSchema, { body: {} }),
  reject: (id: string, body: RejectProfileRequest) =>
    apiRequest('POST', `profile-requests/${id}/reject`, profileRequestDetailSchema, { body }),
};

/** Same-origin URL of a request photo (the API checks the staff permission on every request). */
export function profileRequestPhotoUrl(id: string, variant: 'proposed' | 'official'): string {
  return `/api/v1/profile-requests/${id}/photo?variant=${variant}`;
}

export function useProfileRequests(query: Partial<ProfileRequestQuery>) {
  return useQuery({
    queryKey: profileRequestKeys.list(query),
    queryFn: () => profileRequestsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useProfileRequest(id: string) {
  return useQuery({
    queryKey: profileRequestKeys.detail(id),
    queryFn: () => profileRequestsApi.get(id),
  });
}

/** A decision changes the request, possibly the student record, and dashboard activity. */
function useInvalidateAfterDecision() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: profileRequestKeys.all }),
      client.invalidateQueries({ queryKey: ['students'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
}

export function useApproveProfileRequest(id: string) {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({ mutationFn: () => profileRequestsApi.approve(id), onSettled: invalidate });
}

export function useRejectProfileRequest(id: string) {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: (body: RejectProfileRequest) => profileRequestsApi.reject(id, body),
    onSettled: invalidate,
  });
}
