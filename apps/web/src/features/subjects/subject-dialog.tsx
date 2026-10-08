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
import { Textarea } from '@docversity/ui/components/textarea';
import { type CreateSubjectInput, type Subject, createSubjectSchema } from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { CATEGORY_OPTIONS } from '@/features/curricula/labels';
import { useSaveSubject } from './api';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

const EMPTY: CreateSubjectInput = {
  code: '',
  name: '',
  description: '',
  category: 'THEORY',
  defaultCredits: '',
  status: 'ACTIVE',
};

/** Create or edit a catalogue subject. Course-specific rules are set on each curriculum assignment. */
export function SubjectDialog({
  open,
  onOpenChange,
  subject,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: Subject;
  onSaved?: (subject: Subject) => void;
}) {
  const save = useSaveSubject();
  const form = useForm<CreateSubjectInput>({
    resolver: zodResolver(createSubjectSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      subject
        ? {
            code: subject.code,
            name: subject.name,
            description: subject.description ?? '',
            category: subject.category ?? 'THEORY',
            defaultCredits: subject.defaultCredits ?? '',
            status: subject.status,
          }
        : EMPTY,
    );
  }, [open, subject, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const parsed = createSubjectSchema.parse(values);
      const saved = await save.mutateAsync({
        ...(subject ? { id: subject.id } : {}),
        body: subject?.historyLocked
          ? {
              description: parsed.description,
              defaultCredits: parsed.defaultCredits,
              status: parsed.status,
            }
          : parsed,
      });
      toast.success(subject ? `Subject ${saved.code} updated` : `Subject ${saved.code} created`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{subject ? 'Edit subject' : 'Add subject to catalogue'}</DialogTitle>
          <DialogDescription>
            {subject?.historyLocked
              ? 'Code, title and category are read-only because this subject is used in academic history. Create a new subject to change its identity.'
              : subject && subject.usageCount > 0
                ? `Used in ${String(subject.usageCount)} curriculum assignment(s). Credits and marks stay as set in each curriculum.`
                : 'Search the catalogue first: subject codes are unique, so an existing subject should be reused.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field
            control={form.control}
            name="code"
            label="Subject code"
            required
            hint="Stored in capitals, e.g. ULT-101"
          >
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                readOnly={subject?.historyLocked}
                {...form.register('code')}
              />
            )}
          </Field>
          <SelectField
            control={form.control}
            name="category"
            label="Category"
            options={
              subject?.historyLocked && subject.category === null
                ? [{ value: 'THEORY', label: 'Not on record' }]
                : CATEGORY_OPTIONS
            }
            disabled={subject?.historyLocked}
            hint={
              subject?.historyLocked && subject.category === null
                ? 'Category is not on record; this field is preserved.'
                : undefined
            }
            required
          />
          <Field
            control={form.control}
            name="name"
            label="Subject title"
            required
            className="sm:col-span-2"
          >
            {(aria) => (
              <Input {...aria} readOnly={subject?.historyLocked} {...form.register('name')} />
            )}
          </Field>
          <Field
            control={form.control}
            name="description"
            label="Description"
            className="sm:col-span-2"
          >
            {(aria) => <Textarea {...aria} maxLength={1000} {...form.register('description')} />}
          </Field>
          <Field
            control={form.control}
            name="defaultCredits"
            label="Suggested credits"
            hint="Pre-fills new assignments only."
          >
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                {...form.register('defaultCredits')}
              />
            )}
          </Field>
          <SelectField
            control={form.control}
            name="status"
            label="Status"
            options={STATUS_OPTIONS}
            required
          />
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
              {form.formState.isSubmitting ? 'Saving…' : subject ? 'Save changes' : 'Add subject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
