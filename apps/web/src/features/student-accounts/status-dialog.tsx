'use client';

import { useId, useState } from 'react';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Label } from '@docversity/ui/components/label';
import { Textarea } from '@docversity/ui/components/textarea';
import type { StudentAccountRow, StudentAccountStatus } from '@docversity/validation';
import { errorMessage } from '@/lib/api';
import { useSetAccountStatus } from './api';

const COPY: Record<StudentAccountStatus, { title: string; description: string; action: string }> = {
  LOCKED: {
    title: 'Lock account',
    description:
      'The student is signed out everywhere and cannot sign in until the account is re-activated.',
    action: 'Lock account',
  },
  DISABLED: {
    title: 'Disable account',
    description:
      'The student is signed out everywhere. A disabled account cannot be recovered with an activation code; only staff can re-activate it.',
    action: 'Disable account',
  },
  ACTIVE: {
    title: 'Re-activate account',
    description: 'The student can sign in again with their existing password.',
    action: 'Re-activate',
  },
};

export function StatusDialog({
  row,
  target,
  onClose,
}: {
  row: StudentAccountRow | null;
  target: StudentAccountStatus | null;
  onClose: () => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const mutation = useSetAccountStatus();
  const copy = target ? COPY[target] : null;
  return (
    <Dialog
      open={row !== null && target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason('');
          mutation.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>
            {row?.studentName} ({row?.registrationNumber}). {copy?.description}
          </DialogDescription>
        </DialogHeader>
        {target !== 'ACTIVE' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>Reason{target === 'DISABLED' ? '' : ' (optional)'}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </div>
        )}
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={target === 'ACTIVE' ? 'default' : 'destructive'}
            disabled={mutation.isPending || (target === 'DISABLED' && reason.trim() === '')}
            onClick={() => {
              if (!row?.account || !target) return;
              mutation.mutate(
                { accountId: row.account.id, body: { status: target, reason } },
                {
                  onSuccess: () => {
                    setReason('');
                    onClose();
                  },
                },
              );
            }}
          >
            {copy?.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
