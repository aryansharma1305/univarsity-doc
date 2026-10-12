import {
  trainingCertificateTemplatesResponseSchema,
  trainingCertificatePreviewQuerySchema,
  type TrainingCertificatePreviewQuery,
} from '@docversity/validation';
import { apiFile, apiRequest } from '@/lib/api';
export const certificateTemplatesApi = {
  list: () =>
    apiRequest('GET', '/certificate-templates', trainingCertificateTemplatesResponseSchema),
  preview: (raw: TrainingCertificatePreviewQuery) => {
    const query = trainingCertificatePreviewQuerySchema.parse(raw);
    return apiFile(
      `/certificate-templates/preview?${new URLSearchParams({ templateId: query.templateId, version: String(query.version), fixture: query.fixture, disposition: query.disposition }).toString()}`,
    );
  },
};
