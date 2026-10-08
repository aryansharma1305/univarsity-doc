'use client';

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@docversity/ui/components/table';

/**
 * Server-paginated table (TanStack Table). On small screens rows are rendered as cards via
 * `renderCard`, so wide tables never cause page-level horizontal scrolling.
 */
export function DataTable<TRow>({
  columns,
  data,
  caption,
  renderCard,
  getRowId,
}: {
  columns: ColumnDef<TRow>[];
  data: TRow[];
  caption: string;
  renderCard: (row: TRow) => ReactNode;
  getRowId: (row: TRow) => string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
  });
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card shadow-card md:block">
        <Table className="text-table">
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="bg-muted/60">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    className="h-11 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {data.map((row) => (
          <li
            key={getRowId(row)}
            className="rounded-lg border border-border bg-card p-4 shadow-card"
          >
            {renderCard(row)}
          </li>
        ))}
      </ul>
    </>
  );
}
