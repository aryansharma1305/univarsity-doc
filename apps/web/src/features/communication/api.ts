import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  messageThreadDetailSchema,
  messageThreadListSchema,
  notificationListSchema,
  notificationSchema,
  publicVerificationQueryReceiptSchema,
  requesterVerificationQueryListSchema,
  requesterVerificationQuerySchema,
  staffVerificationQueryListSchema,
  staffVerificationQuerySchema,
  unreadCountSchema,
  type CreateMessageThread,
  type MessageThreadQuery,
  type NotificationQuery,
  type PublicVerificationQueryInput,
  type PublicVerificationQueryStatusRequest,
  type RespondVerificationQuery,
  type StudentVerificationQueryInput,
  type VerificationQueryListQuery,
} from '@docversity/validation';
import { apiRequest, studentRequest } from '@/lib/api';

export type Side = 'student' | 'staff';
/** Same paths on both sides; the student side is prefixed and uses the student session. */
const call = <T extends Parameters<typeof apiRequest>[2]>(
  side: Side,
  method: 'GET' | 'POST',
  path: string,
  schema: T,
  options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
) =>
  side === 'student'
    ? studentRequest(method, `student/${path}`, schema, options)
    : apiRequest(method, path, schema, options);

export const communicationKeys = {
  all: ['communication'] as const,
  threads: (side: Side, q: Partial<MessageThreadQuery>) =>
    ['communication', side, 'threads', q] as const,
  thread: (side: Side, id: string) => ['communication', side, 'thread', id] as const,
  notifications: (side: Side, q: Partial<NotificationQuery>) =>
    ['communication', side, 'notifications', q] as const,
  unread: (side: Side) => ['communication', side, 'unread'] as const,
  queries: (side: Side, q?: Partial<VerificationQueryListQuery>) =>
    ['communication', side, 'queries', q] as const,
  query: (id: string) => ['communication', 'staff', 'query', id] as const,
};

export function useThreads(side: Side, query: Partial<MessageThreadQuery>) {
  return useQuery({
    queryKey: communicationKeys.threads(side, query),
    queryFn: () => call(side, 'GET', 'messages', messageThreadListSchema, { query }),
    placeholderData: keepPreviousData,
  });
}

export function useThread(side: Side, id: string) {
  return useQuery({
    queryKey: communicationKeys.thread(side, id),
    queryFn: () => call(side, 'GET', `messages/${id}`, messageThreadDetailSchema),
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: communicationKeys.all });
}

export function useStartThread() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateMessageThread) =>
      call('student', 'POST', 'messages', messageThreadDetailSchema, { body }),
    onSuccess: invalidate,
  });
}

export function useReply(side: Side, id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: string) =>
      call(side, 'POST', `messages/${id}/replies`, messageThreadDetailSchema, { body: { body } }),
    onSuccess: invalidate,
  });
}

export function useThreadStatus(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (action: 'resolve' | 'reopen') =>
      apiRequest('POST', `messages/${id}/${action}`, messageThreadDetailSchema, { body: {} }),
    onSuccess: invalidate,
  });
}

export function useNotifications(side: Side, query: Partial<NotificationQuery>) {
  return useQuery({
    queryKey: communicationKeys.notifications(side, query),
    queryFn: () => call(side, 'GET', 'notifications', notificationListSchema, { query }),
    placeholderData: keepPreviousData,
  });
}

export function useUnreadCount(side: Side) {
  return useQuery({
    queryKey: communicationKeys.unread(side),
    queryFn: () => call(side, 'GET', 'notifications/unread-count', unreadCountSchema),
    refetchInterval: 60_000,
  });
}

export function useMarkRead(side: Side) {
  const invalidate = useInvalidate();
  return useMutation({
    /** `id` is a notification ID, or 'all' to mark every notification read. */
    mutationFn: async (id: string): Promise<void> => {
      if (id === 'all')
        await call(side, 'POST', 'notifications/read-all', unreadCountSchema, { body: {} });
      else await call(side, 'POST', `notifications/${id}/read`, notificationSchema, { body: {} });
    },
    onSuccess: invalidate,
  });
}

export function useOwnQueries() {
  return useQuery({
    queryKey: communicationKeys.queries('student'),
    queryFn: () =>
      studentRequest('GET', 'student/verification-queries', requesterVerificationQueryListSchema),
  });
}

export function useSubmitOwnQuery() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: StudentVerificationQueryInput) =>
      studentRequest('POST', 'student/verification-queries', requesterVerificationQuerySchema, {
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useStaffQueries(query: Partial<VerificationQueryListQuery>) {
  return useQuery({
    queryKey: communicationKeys.queries('staff', query),
    queryFn: () =>
      apiRequest('GET', 'verification-queries', staffVerificationQueryListSchema, { query }),
    placeholderData: keepPreviousData,
  });
}

export function useStaffQuery(id: string) {
  return useQuery({
    queryKey: communicationKeys.query(id),
    queryFn: () => apiRequest('GET', `verification-queries/${id}`, staffVerificationQuerySchema),
  });
}

export function useRespondQuery(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: RespondVerificationQuery) =>
      apiRequest('POST', `verification-queries/${id}/respond`, staffVerificationQuerySchema, {
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useResolveQuery(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (version: number) =>
      apiRequest('POST', `verification-queries/${id}/resolve`, staffVerificationQuerySchema, {
        body: { version },
      }),
    onSuccess: invalidate,
  });
}

/** Public form: the student CSRF endpoint issues the pre-auth token these routes require. */
export const publicQueriesApi = {
  submit: (body: PublicVerificationQueryInput) =>
    studentRequest('POST', 'public/verification-queries', publicVerificationQueryReceiptSchema, {
      body,
    }),
  status: (body: PublicVerificationQueryStatusRequest) =>
    studentRequest('POST', 'public/verification-queries/status', requesterVerificationQuerySchema, {
      body,
    }),
};
