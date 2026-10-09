'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import type { CurriculumDetail } from '@docversity/validation';
import { errorMessage } from '@/lib/api';
import { curriculaApi, useCurriculumMutation } from './api';

export type LifecycleAction = 'activate' | 'archive' | 'end-date' | 'remove';

function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  destructive,
  run,
  success,
  children,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirm: string;
  destructive?: boolean;
  run: () => Promise<unknown>;
  success: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const mutation = useCurriculumMutation(run);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={mutation.isPending || disabled}
            onClick={() => {
              mutation.mutate(undefined, {
                onSuccess: () => {
                  toast.success(success);
                  onOpenChange(false);
                },
              });
            }}
          >
            {mutation.isPending ? 'Working…' : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActivateDialog(props: {
  curriculum: CurriculumDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { curriculum } = props;
  return (
    <Confirm
      {...props}
      title={`Activate version ${curriculum.versionCode}?`}
      description={
        <>
          The {String(curriculum.subjectCount)} subject assignment(s) become read-only and the
          version can be assigned to students. To change it later, create a new version.
        </>
      }
      confirm="Activate curriculum"
      run={() => curriculaApi.activate(curriculum.id)}
      success={`Version ${curriculum.versionCode} activated`}
    />
  );
}

export function ArchiveDialog(props: {
  curriculum: CurriculumDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { curriculum } = props;
  return (
    <Confirm
      {...props}
      destructive
      title={`Archive version ${curriculum.versionCode}?`}
      description={
        curriculum.status === 'ACTIVE'
          ? `No new students can be assigned. The ${String(curriculum.registrationCount)} student(s) already following it keep it, and it stays readable.`
          : 'The draft becomes read-only and cannot be activated.'
      }
      confirm="Archive curriculum"
      run={() => curriculaApi.archive(curriculum.id)}
      success={`Version ${curriculum.versionCode} archived`}
    />
  );
}

/** Mounted only while the dialog is open, so it always starts from the saved end date. */
function EndDateForm({ curriculum, onDone }: { curriculum: CurriculumDetail; onDone: () => void }) {
  const id = useId();
  const [value, setValue] = useState(curriculum.effectiveTo ?? '');
  const mutation = useCurriculumMutation(() =>
    curriculaApi.update(curriculum.id, { effectiveTo: value || null }),
  );
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Effective to</Label>
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(mutation.error)}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={mutation.isPending}
          onClick={() => {
            mutation.mutate(undefined, {
              onSuccess: () => {
                toast.success('End date saved');
                onDone();
              },
            });
          }}
        >
          {mutation.isPending ? 'Working…' : 'Save end date'}
        </Button>
      </DialogFooter>
    </>
  );
}

/** ACTIVE versions accept only an end date (e.g. before a successor version takes over). */
export function EndDateDialog({
  curriculum,
  open,
  onOpenChange,
}: {
  curriculum: CurriculumDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set the end date</DialogTitle>
          <DialogDescription>
            Active versions are read-only except for their end date. A successor version may start
            after it.
          </DialogDescription>
        </DialogHeader>
        <EndDateForm
          curriculum={curriculum}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RemoveAssignmentDialog(props: {
  curriculum: CurriculumDetail;
  assignment: { id: string; code: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { curriculum, assignment } = props;
  return (
    <Confirm
      open={assignment !== null}
      onOpenChange={props.onOpenChange}
      destructive
      title={`Remove ${assignment?.code ?? 'subject'}?`}
      description="It is removed from this draft only. The subject stays in the catalogue."
      confirm="Remove subject"
      run={() => curriculaApi.removeSubject(curriculum.id, assignment?.id ?? '')}
      success={`${assignment?.code ?? 'Subject'} removed`}
    />
  );
}
