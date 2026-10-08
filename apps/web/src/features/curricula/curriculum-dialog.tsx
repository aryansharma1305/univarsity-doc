'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
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
  type CreateCurriculumInput,
  type CurriculumDetail,
  type CurriculumSummary,
  type Program,
  createCurriculumSchema,
  updateCurriculumSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { curriculaApi, useCurriculumMutation } from './api';
import { CURRICULUM_STATUS, STRUCTURE_OPTIONS } from './labels';

/**
 * New curriculum version (optionally copying another version's subjects), or edit the details of
 * a DRAFT version. Active and archived versions are read-only (see the end-date dialog).
 */
export function CurriculumDialog({
  open,
  onOpenChange,
  program,
  versions = [],
  curriculum,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: Program;
  versions?: CurriculumSummary[];
  curriculum?: CurriculumDetail;
}) {
  const router = useRouter();
  const form = useForm<CreateCurriculumInput>({ resolver: zodResolver(createCurriculumSchema) });
  const structure = useWatch({ control: form.control, name: 'structureType' });
  const save = useCurriculumMutation((values: CreateCurriculumInput) =>
    curriculum
      ? curriculaApi.update(curriculum.id, updateCurriculumSchema.parse(values))
      : curriculaApi.create(program.id, createCurriculumSchema.parse(values)),
  );

  useEffect(() => {
    if (!open) return;
    form.reset(
      curriculum
        ? {
            versionCode: curriculum.versionCode,
            name: curriculum.name,
            description: curriculum.description ?? '',
            structureType: curriculum.structureType,
            numberOfPeriods: curriculum.numberOfPeriods,
            effectiveFrom: curriculum.effectiveFrom ?? '',
            effectiveTo: curriculum.effectiveTo ?? '',
          }
        : {
            versionCode: '',
            name: '',
            description: '',
            structureType: program.academicStructure ?? 'SEMESTER_WISE',
            numberOfPeriods: program.periodCount ?? '',
            effectiveFrom: '',
            effectiveTo: '',
            copyFromCurriculumId: '',
          },
    );
  }, [open, curriculum, program, form]);

  const copyOptions = versions.map((version) => ({
    value: version.id,
    label: `${version.versionCode} — ${version.name} (${CURRICULUM_STATUS[version.status].label.toLowerCase()})`,
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { copyFromCurriculumId, ...rest } = values;
      const saved = (await save.mutateAsync(
        curriculum ? rest : { ...rest, copyFromCurriculumId },
      )) as CurriculumDetail;
      toast.success(
        curriculum ? `Version ${saved.versionCode} updated` : `Draft ${saved.versionCode} created`,
      );
      onOpenChange(false);
      if (!curriculum) router.push(`/admin/programs/${program.id}/curricula/${saved.id}`);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{curriculum ? 'Edit draft details' : 'New curriculum version'}</DialogTitle>
          <DialogDescription>
            {curriculum
              ? 'Drafts can be changed freely until they are activated.'
              : `A new DRAFT version of ${program.code}. Existing versions are never changed.`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field
            control={form.control}
            name="versionCode"
            label="Version code"
            required
            hint="Unique within the course, e.g. 2026"
          >
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('versionCode')} />}
          </Field>
          <Field control={form.control} name="name" label="Name" required hint="e.g. 2026 syllabus">
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <SelectField
            control={form.control}
            name="structureType"
            label="Academic structure"
            options={STRUCTURE_OPTIONS}
            required
          />
          <Field
            control={form.control}
            name="numberOfPeriods"
            label={`Number of ${structure === 'YEAR_WISE' ? 'years' : 'semesters'}`}
            required
          >
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                max={40}
                {...form.register('numberOfPeriods')}
              />
            )}
          </Field>
          <Field
            control={form.control}
            name="effectiveFrom"
            label="Effective from"
            hint="Active versions of a course may not overlap."
          >
            {(aria) => <Input {...aria} type="date" {...form.register('effectiveFrom')} />}
          </Field>
          <Field control={form.control} name="effectiveTo" label="Effective to">
            {(aria) => <Input {...aria} type="date" {...form.register('effectiveTo')} />}
          </Field>
          {!curriculum && copyOptions.length > 0 && (
            <div className="sm:col-span-2">
              <SelectField
                control={form.control}
                name="copyFromCurriculumId"
                label="Copy subjects from"
                options={copyOptions}
                allowNone
                placeholder="Start empty"
                hint="Copies every subject assignment into the new draft."
              />
            </div>
          )}
          <Field
            control={form.control}
            name="description"
            label="Description"
            className="sm:col-span-2"
          >
            {(aria) => <Textarea {...aria} maxLength={1000} {...form.register('description')} />}
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
              {form.formState.isSubmitting
                ? 'Saving…'
                : curriculum
                  ? 'Save changes'
                  : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
