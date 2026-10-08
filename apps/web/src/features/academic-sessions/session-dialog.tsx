'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  type AcademicSession,
  type CreateAcademicSessionInput,
  createAcademicSessionSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useSaveAcademicSession } from './api';

export const SESSION_STATUS_OPTIONS = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

const EMPTY: CreateAcademicSessionInput = {
  code: '',
  name: '',
  startsOn: '',
  endsOn: '',
  status: 'UPCOMING',
};

export function SessionDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: AcademicSession;
}) {
  const save = useSaveAcademicSession();
  const form = useForm<CreateAcademicSessionInput>({
    resolver: zodResolver(createAcademicSessionSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      session
        ? {
            code: session.code,
            name: session.name,
            startsOn: session.startsOn ?? '',
            endsOn: session.endsOn ?? '',
            status: session.status,
          }
        : EMPTY,
    );
  }, [open, session, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...(session ? { id: session.id } : {}),
        body: createAcademicSessionSchema.parse(values),
      });
      toast.success(session ? `Session ${saved.code} updated` : `Session ${saved.code} created`);
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{session ? 'Edit academic session' : 'Add academic session'}</DialogTitle>
          <DialogDescription>
            Dates are optional; if both are set, the end must not be before the start.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field control={form.control} name="code" label="Code" required hint="e.g. 2026-27">
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('code')} />}
          </Field>
          <SelectField
            control={form.control}
            name="status"
            label="Status"
            options={SESSION_STATUS_OPTIONS}
            required
          />
          <Field control={form.control} name="name" label="Name" required className="sm:col-span-2">
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field control={form.control} name="startsOn" label="Starts on">
            {(aria) => <Input {...aria} type="date" {...form.register('startsOn')} />}
          </Field>
          <Field control={form.control} name="endsOn" label="Ends on">
            {(aria) => <Input {...aria} type="date" {...form.register('endsOn')} />}
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : session ? 'Save changes' : 'Add session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
