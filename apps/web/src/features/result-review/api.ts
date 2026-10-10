import {
  resultImportContextOptionsSchema,
  reviewedResultSchema,
  reviewQueueSchema,
  reviewReceiptSchema,
  reviewVersionSchema,
  type ReviewAction,
  type ReviewQuery,
} from '@docversity/validation';
import { apiRequest } from '@/lib/api';
export const resultReviewApi = {
  version: (id: string, eventId: string) =>
    apiRequest('GET', `result-review/${id}/versions/${eventId}`, reviewVersionSchema),
  contexts: () => apiRequest('GET', 'result-review/contexts', resultImportContextOptionsSchema),
  list: (query: Partial<ReviewQuery>) =>
    apiRequest('GET', 'result-review', reviewQueueSchema, { query }),
  get: (id: string) => apiRequest('GET', `result-review/${id}`, reviewedResultSchema),
  act: (id: string, action: 'submit' | 'return' | 'reject' | 'approve', body: ReviewAction) =>
    apiRequest('POST', `result-review/${id}/${action}`, reviewReceiptSchema, { body }),
};
