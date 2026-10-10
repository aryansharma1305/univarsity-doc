import { z } from 'zod';
import { apiDownload, apiRequest, apiUpload } from '@/lib/api';
import {
  resultImportContextOptionsSchema,
  resultPreviewSchema,
  resultPreviewRowListSchema,
  type ResultPreviewContext,
  type ResultPreviewMapping,
  type ResultPreviewRowQuery,
} from '@docversity/validation';

export const resultImportsApi = {
  discard: (id: string) => apiRequest('DELETE', `result-imports/previews/${id}`, z.void()),
  contexts: () => apiRequest('GET', 'result-imports/context', resultImportContextOptionsSchema),
  get: (id: string) => apiRequest('GET', `result-imports/previews/${id}`, resultPreviewSchema),
  create: (context: ResultPreviewContext, file: File) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(context)) form.append(key, String(value));
    form.append('file', file);
    return apiUpload('result-imports/previews', form, resultPreviewSchema);
  },
  validate: (id: string, body: ResultPreviewMapping) =>
    apiRequest('POST', `result-imports/previews/${id}/validate`, resultPreviewSchema, { body }),
  rows: (id: string, query: Partial<ResultPreviewRowQuery>) =>
    apiRequest('GET', `result-imports/previews/${id}/rows`, resultPreviewRowListSchema, { query }),
  template: () => apiDownload('result-imports/template', 'docversity-results-import-template.xlsx'),
  report: (id: string) =>
    apiDownload(`result-imports/previews/${id}/error-report`, 'results-preview-issues.xlsx'),
};
