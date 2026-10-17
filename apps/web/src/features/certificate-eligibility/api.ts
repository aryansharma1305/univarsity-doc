import { useQuery } from '@tanstack/react-query';
import {
  programCertificateEligibilitySchema,
  studentCertificateEligibilityV1Schema,
  type EligibilityDecision,
  type ProposeCertificateEligibility,
} from '@docversity/validation';
import { apiRequest, studentRequest } from '@/lib/api';

export const certificateEligibilityApi = {
  program: (programId: string) =>
    apiRequest(
      'GET',
      `programs/${programId}/certificate-eligibility`,
      programCertificateEligibilitySchema,
    ),
  propose: (programId: string, body: ProposeCertificateEligibility) =>
    apiRequest(
      'POST',
      `programs/${programId}/certificate-eligibility/proposals`,
      programCertificateEligibilitySchema,
      { body },
    ),
  decide: (
    configId: string,
    action: 'withdraw' | 'approve' | 'reject',
    body: EligibilityDecision,
  ) =>
    apiRequest(
      'POST',
      `certificate-eligibility/${configId}/${action}`,
      programCertificateEligibilitySchema,
      { body },
    ),
  student: () =>
    studentRequest('GET', 'student/certificate-eligibility', studentCertificateEligibilityV1Schema),
};

export const programEligibilityKey = (programId: string, durationKey: string) =>
  ['certificate-eligibility', 'program', programId, durationKey] as const;

export function useProgramCertificateEligibility(
  programId: string,
  durationKey: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: programEligibilityKey(programId, durationKey),
    queryFn: () => certificateEligibilityApi.program(programId),
    enabled,
  });
}
