'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import {
  type CreateProgramInput,
  PROGRAM_LEVEL_SUGGESTIONS,
  type Program,
  createProgramSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useActiveDepartmentOptions } from '@/features/departments/api';
import { DURATION_UNIT_OPTIONS, STRUCTURE_OPTIONS } from '@/features/curricula/labels';
import { useSaveProgram } from './api';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

const EMPTY: CreateProgramInput = {
  code: '',
  name: '',
  level: '',
  description: '',
  durationValue: '',
  durationUnit: '',
  academicStructure: '',
  periodCount: '',
  departmentId: '',
  status: 'ACTIVE',
};

/** Create or edit a course (stored as a Program). */
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
  const structure = useWatch({ control: form.control, name: 'academicStructure' });
  const periodWord = structure === 'YEAR_WISE' ? 'years' : 'semesters';

  useEffect(() => {
    if (!open) return;
    form.reset(
      program
        ? {
            code: program.code,
            name: program.name,
            level: program.level ?? '',
            description: program.description ?? '',
            durationValue: program.durationValue ?? '',
            durationUnit: program.durationUnit ?? '',
            academicStructure: program.academicStructure ?? '',
            periodCount: program.periodCount ?? '',
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
      toast.success(program ? `Course ${saved.code} updated` : `Course ${saved.code} created`);
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit course' : 'Create course'}</DialogTitle>
          <DialogDescription>
            The academic structure is the default for new curriculum versions; each version keeps
            its own.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field
            control={form.control}
            name="name"
            label="Course name"
            required
            className="sm:col-span-2"
          >
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field
            control={form.control}
            name="code"
            label="Course code"
            required
            hint="e.g. CERT-ULT"
          >
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('code')} />}
          </Field>
          <Field
            control={form.control}
            name="level"
            label="Course type"
            hint="e.g. CERTIFICATE, DIPLOMA, UG, PG"
          >
            {(aria) => (
              <>
                <Input {...aria} list="course-type-suggestions" {...form.register('level')} />
                <datalist id="course-type-suggestions">
                  {PROGRAM_LEVEL_SUGGESTIONS.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <div className="sm:col-span-2">
            <SelectField
              control={form.control}
              name="departmentId"
              label="Department / school"
              options={departmentOptions}
              allowNone
              placeholder="None"
            />
          </div>
          <Field control={form.control} name="durationValue" label="Duration">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                {...form.register('durationValue')}
              />
            )}
          </Field>
          <SelectField
            control={form.control}
            name="durationUnit"
            label="Duration unit"
            options={DURATION_UNIT_OPTIONS}
            allowNone
            placeholder="None"
          />
          <SelectField
            control={form.control}
            name="academicStructure"
            label="Academic structure"
            options={STRUCTURE_OPTIONS}
            allowNone
            placeholder="None"
          />
          <Field
            control={form.control}
            name="periodCount"
            label={`Number of ${periodWord}`}
            hint="Validated separately from the duration."
          >
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                max={40}
                {...form.register('periodCount')}
              />
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
              {form.formState.isSubmitting ? 'Saving…' : program ? 'Save changes' : 'Create course'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
