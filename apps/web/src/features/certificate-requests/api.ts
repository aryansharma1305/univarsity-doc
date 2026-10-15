import {
  certificateServiceListSchema,
  certificateRequestListSchema,
  certificateRequestSchema,
  type CertificateRequestQuery,
  type SubmitCertificateRequest,
} from '@docversity/validation';
import { apiRequest, studentRequest } from '@/lib/api';
export const certificateRequestsApi = {
  catalogue: () =>
    studentRequest('GET', 'student/certificate-services', certificateServiceListSchema),
  list: (student: boolean, query: CertificateRequestQuery) =>
    (student ? studentRequest : apiRequest)(
      'GET',
      student ? 'student/certificate-requests' : 'certificate-requests',
      certificateRequestListSchema,
      { query },
    ),
  detail: (student: boolean, id: string) =>
    (student ? studentRequest : apiRequest)(
      'GET',
      `${student ? 'student/' : ''}certificate-requests/${id}`,
      certificateRequestSchema,
    ),
  submit: (body: SubmitCertificateRequest) =>
    studentRequest('POST', 'student/certificate-requests', certificateRequestSchema, { body }),
  action: (student: boolean, id: string, action: string, body: unknown) =>
    (student ? studentRequest : apiRequest)(
      'POST',
      `${student ? 'student/' : ''}certificate-requests/${id}/${action}`,
      certificateRequestSchema,
      { body },
    ),
};
