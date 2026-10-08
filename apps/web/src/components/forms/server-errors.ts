import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from '@/lib/api';

/**
 * Shows an API error on the form: field-level details go next to their fields; anything else
 * (permission, network, conflict without a field) becomes a toast with the API's safe message.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  prefix = '',
): void {
  if (error instanceof ApiError && error.details.length > 0 && error.status !== 403) {
    for (const detail of error.details) {
      const path =
        prefix && detail.path.startsWith(prefix) ? detail.path.slice(prefix.length) : detail.path;
      setError(path as Path<T>, { type: 'server', message: detail.message }, { shouldFocus: true });
    }
    return;
  }
  toast.error(errorMessage(error));
}
