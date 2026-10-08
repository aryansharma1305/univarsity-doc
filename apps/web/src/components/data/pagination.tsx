import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import type { PaginationMeta } from '@docversity/validation';

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row"
    >
      <p className="text-meta tabular" aria-live="polite">
        Showing {from}–{to} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => {
            onPageChange(meta.page - 1);
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
          Previous
        </Button>
        <span className="text-meta tabular">
          Page {meta.page} of {Math.max(1, meta.totalPages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => {
            onPageChange(meta.page + 1);
          }}
        >
          Next
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
