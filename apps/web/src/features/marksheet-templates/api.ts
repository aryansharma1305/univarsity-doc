import {
  marksheetTemplatesResponseSchema,
  marksheetPreviewQuerySchema,
  type MarksheetPreviewQuery,
} from '@docversity/validation';
import { apiFile, apiRequest } from '@/lib/api';
export const marksheetTemplatesApi = {
  list: () => apiRequest('GET', '/marksheet-templates', marksheetTemplatesResponseSchema),
  preview: (raw: MarksheetPreviewQuery) => {
    const query = marksheetPreviewQuerySchema.parse(raw);
    return apiFile(
      `/marksheet-templates/preview?${new URLSearchParams({ templateId: query.templateId, version: String(query.version), fixture: query.fixture, disposition: query.disposition }).toString()}`,
    );
  },
};
