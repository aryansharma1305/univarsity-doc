'use client';

import { PrinterIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import type { IssuedActivationCodes } from '@docversity/validation';
import { formatDate } from '@/lib/format';

/**
 * The freshly issued codes. They exist only in this response: closing the dialog discards them
 * (only keyed hashes are stored). Print them for delivery to the students.
 */
export function CodesDialog({
  result,
  onClose,
}: {
  result: IssuedActivationCodes | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={result !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Activation codes</DialogTitle>
          <DialogDescription>
            Shown once — they cannot be displayed again. Print them now and give each student only
            their own code. A student needs their registration number and this code to activate
            their account.
          </DialogDescription>
        </DialogHeader>
        {result && (
          <div data-print-area className="flex flex-col gap-4">
            {result.issued.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Issued activation codes</caption>
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2">
                        Registration number
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Student
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Program
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Activation code
                      </th>
                      <th scope="col" className="px-3 py-2">
                        Valid until
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issued.map((row) => (
                      <tr key={row.registrationId} className="border-t border-border">
                        <td className="px-3 py-2 break-all">{row.registrationNumber}</td>
                        <td className="px-3 py-2">{row.studentName}</td>
                        <td className="px-3 py-2">{row.programCode}</td>
                        <td className="px-3 py-2 font-mono text-base tracking-wider whitespace-nowrap">
                          {row.code}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(row.expiresAt.slice(0, 10))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm text-navy-950">
              Activate at <strong>/student/register</strong> on the university portal.
            </p>
            {result.skipped.length > 0 && (
              <div className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-text">
                <p className="font-medium">Not issued ({result.skipped.length}):</p>
                <ul className="list-disc pl-5">
                  {result.skipped.map((row) => (
                    <li key={row.registrationId}>
                      {row.registrationNumber} — {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {result && result.issued.length > 0 && (
            <Button
              onClick={() => {
                window.print();
              }}
            >
              <PrinterIcon aria-hidden="true" />
              Print codes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
