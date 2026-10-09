import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreatePaymentDestination,
  paymentDestinationDetailSchema,
  paymentDestinationListSchema,
  reExamPaymentDetailSchema,
  reExamPaymentListSchema,
  type ReExamPaymentQuery,
  type RejectReExamPayment,
  type UpdatePaymentDestination,
  type VerifyReExamPayment,
} from '@docversity/validation';
import { apiRequest, apiUpload } from '@/lib/api';

export const paymentKeys = {
  all: ['re-exam-payments'] as const,
  destinations: ['re-exam-payments', 'destinations'] as const,
  destination: (id: string) => ['re-exam-payments', 'destination', id] as const,
  list: (q: Partial<ReExamPaymentQuery>) => ['re-exam-payments', 'list', q] as const,
  detail: (id: string) => ['re-exam-payments', 'detail', id] as const,
};

/** Same-origin URLs of private images/files (streamed after a permission check, never cached). */
export const destinationQrUrl = (id: string, version: string) =>
  `/api/v1/re-exam-payment-destinations/${id}/qr?v=${encodeURIComponent(version)}`;
export const evidenceUrl = (id: string) => `/api/v1/re-exam-payments/${id}/evidence`;

export const paymentsApi = {
  destinations: () =>
    apiRequest('GET', 're-exam-payment-destinations', paymentDestinationListSchema),
  destination: (id: string) =>
    apiRequest('GET', `re-exam-payment-destinations/${id}`, paymentDestinationDetailSchema),
  createDestination: (body: CreatePaymentDestination) =>
    apiRequest('POST', 're-exam-payment-destinations', paymentDestinationDetailSchema, { body }),
  updateDestination: (id: string, body: UpdatePaymentDestination) =>
    apiRequest('PATCH', `re-exam-payment-destinations/${id}`, paymentDestinationDetailSchema, {
      body,
    }),
  uploadQr: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload(`re-exam-payment-destinations/${id}/qr`, form, paymentDestinationDetailSchema);
  },
  approve: (id: string) =>
    apiRequest(
      'POST',
      `re-exam-payment-destinations/${id}/approve`,
      paymentDestinationDetailSchema,
      {
        body: { confirmApproved: true },
      },
    ),
  setActive: (id: string, active: boolean) =>
    apiRequest(
      'POST',
      `re-exam-payment-destinations/${id}/active`,
      paymentDestinationDetailSchema,
      {
        body: { active },
      },
    ),
  retire: (id: string) =>
    apiRequest('POST', `re-exam-payment-destinations/${id}/retire`, paymentDestinationDetailSchema),
  list: (query: Partial<ReExamPaymentQuery>) =>
    apiRequest('GET', 're-exam-payments', reExamPaymentListSchema, { query }),
  get: (id: string) => apiRequest('GET', `re-exam-payments/${id}`, reExamPaymentDetailSchema),
  verify: (id: string, body: VerifyReExamPayment) =>
    apiRequest('POST', `re-exam-payments/${id}/verify`, reExamPaymentDetailSchema, { body }),
  reject: (id: string, body: RejectReExamPayment) =>
    apiRequest('POST', `re-exam-payments/${id}/reject`, reExamPaymentDetailSchema, { body }),
};

export function useDestinations() {
  return useQuery({
    queryKey: paymentKeys.destinations,
    queryFn: () => paymentsApi.destinations(),
  });
}

export function useDestination(id: string) {
  return useQuery({
    queryKey: paymentKeys.destination(id),
    queryFn: () => paymentsApi.destination(id),
  });
}

export function usePayments(query: Partial<ReExamPaymentQuery>) {
  return useQuery({
    queryKey: paymentKeys.list(query),
    queryFn: () => paymentsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function usePayment(id: string) {
  return useQuery({ queryKey: paymentKeys.detail(id), queryFn: () => paymentsApi.get(id) });
}

export function usePaymentMutation<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: paymentKeys.all }),
        client.invalidateQueries({ queryKey: ['re-exams'] }),
      ]),
  });
}
