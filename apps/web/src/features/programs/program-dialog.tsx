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
import { type CreateProgramInput, type Program, createProgramSchema } from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useActiveDepartmentOptions } from '@/features/departments/api';
import { useSaveProgram } from './api';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

const EMPTY: CreateProgramInput = {
  code: '',
  name: '',
  level: '',
  durationSemesters: '',
  departmentId: '',
  status: 'ACTIVE',
};

export function ProgramDialog({
  open,
  onOpenChange,
  program,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: Program;
}) {
  const save = useSaveProgram();
  const departments = useActiveDepartmentOptions();
  const form = useForm<CreateProgramInput>({
    resolver: zodResolver(createProgramSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      program
        ? {
            code: program.code,
            name: program.name,
            level: program.level ?? '',
            durationSemesters: program.durationSemesters ?? '',
            departmentId: program.department?.id ?? '',
            status: program.status,
          }
        : EMPTY,
    );
  }, [open, program, form]);

  // Keep the current department selectable even if it has since been deactivated.
  const departmentOptions =
    program?.department && !departments.options.some((o) => o.value === program.department?.id)
      ? [
          ...departments.options,
          {
            value: program.department.id,
            label: `${program.department.code} — ${program.department.name}`,
          },
        ]
      : departments.options;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...(program ? { id: program.id } : {}),
        body: createProgramSchema.parse(values),
      });
      toast.success(program ? `Program ${saved.code} updated` : `Program ${saved.code} created`);
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit program' : 'Add program'}</DialogTitle>
          <DialogDescription>Level, duration and department are optional.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field control={form.control} name="code" label="Code" required hint="e.g. BTECH-CSE">
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('code')} />}
          </Field>
          <Field control={form.control} name="level" label="Level" hint="e.g. UG, PG, Diploma">
            {(aria) => <Input {...aria} {...form.register('level')} />}
          </Field>
          <Field control={form.control} name="name" label="Name" required className="sm:col-span-2">
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field control={form.control} name="durationSemesters" label="Duration (semesters)">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                max={40}
                {...form.register('durationSemesters')}
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
          <div className="sm:col-span-2">
            <SelectField
              control={form.control}
              name="departmentId"
              label="Department"
              options={departmentOptions}
              allowNone
              placeholder="None"
            />
          </div>
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
              {form.formState.isSubmitting ? 'Saving…' : program ? 'Save changes' : 'Add program'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
