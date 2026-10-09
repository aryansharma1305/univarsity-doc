'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { cn } from '@docversity/ui';
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
import {
  type AddCurriculumSubjectInput,
  type CurriculumDetail,
  type CurriculumSubject,
  type Subject,
  addCurriculumSubjectSchema,
  periodLabel,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { useSubjects } from '@/features/subjects/api';
import { SubjectDialog } from '@/features/subjects/subject-dialog';
import { PERMISSIONS } from '@docversity/types';
import { curriculaApi, useCurriculumMutation } from './api';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from './labels';

/** Search the catalogue (active subjects not yet in this curriculum) and pick one. */
function SubjectPicker({
  curriculum,
  selected,
  onSelect,
  error,
}: {
  curriculum: CurriculumDetail;
  selected: Subject | null;
  onSelect: (subject: Subject) => void;
  error?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = useCan(PERMISSIONS.subjectsWrite);
  const query = useSubjects({ search: search || undefined, status: 'ACTIVE', pageSize: 8 });
  const used = new Set(curriculum.periods.flatMap((p) => p.subjects.map((s) => s.subject.id)));
  const results = (query.data?.data ?? []).filter((subject) => !used.has(subject.id));

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label htmlFor={`${id}-search`} className="text-label">
        Subject{' '}
        <span aria-hidden="true" className="text-danger-text">
          *
        </span>
      </Label>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={`${id}-search`}
          value={search}
          placeholder="Search the catalogue by code or title"
          className="h-10 pl-9"
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </div>
      <ul
        aria-label="Catalogue subjects"
        className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1"
      >
        {query.isPending ? (
          <li className="p-2 text-sm text-muted-foreground">Searching…</li>
        ) : query.isError ? (
          <li className="flex flex-col items-start gap-2 p-2 text-sm">
            <p role="alert" className="text-danger-text">
              The subject catalogue could not be loaded.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
            >
              {query.isFetching ? 'Retrying catalogue…' : 'Retry catalogue'}
            </Button>
          </li>
        ) : results.length === 0 ? (
          <li className="p-2 text-sm text-muted-foreground">
            No active subject matches{search ? ` “${search}”` : ''} that is not already in this
            curriculum.
          </li>
        ) : (
          results.map((subject) => {
            const active = selected?.id === subject.id;
            return (
              <li key={subject.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onSelect(subject);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded px-2 py-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    active && 'bg-secondary',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong',
                      active && 'border-brand bg-brand text-white',
                    )}
                  >
                    {active && <CheckIcon aria-hidden="true" className="size-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-navy-950">{subject.code}</span>{' '}
                    <span className="break-words">{subject.name}</span>
                    <span className="block text-xs text-foreground/80">
                      {subject.category ? CATEGORY_LABELS[subject.category] : 'No category'}
                      {subject.usageCount > 0
                        ? ` · used in ${String(subject.usageCount)} curricul${subject.usageCount === 1 ? 'um' : 'a'}`
                        : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
      {canCreate && !query.isError && (
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-10 self-start p-0 text-left whitespace-normal"
          onClick={() => {
            setCreating(true);
          }}
        >
          <PlusIcon aria-hidden="true" />
          Not in the catalogue? Create a new subject
        </Button>
      )}
      <SubjectDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(subject) => {
          onSelect(subject);
          setSearch(subject.code);
        }}
      />
    </div>
  );
}

/** Add a catalogue subject to a semester/year of a DRAFT curriculum, or edit an assignment. */
export function AssignmentDialog({
  open,
  onOpenChange,
  curriculum,
  periodNumber,
  assignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  curriculum: CurriculumDetail;
  periodNumber: number;
  assignment?: CurriculumSubject;
}) {
  const [selected, setSelected] = useState<Subject | null>(null);
  const form = useForm<AddCurriculumSubjectInput>({
    resolver: zodResolver(addCurriculumSubjectSchema),
  });
  const components = useFieldArray({ control: form.control, name: 'components' });
  const watchedComponents = useWatch({ control: form.control, name: 'components' }) ?? [];
  const componentTotal = watchedComponents.reduce(
    (sum, component) => sum + (Number(component.maxMarks) || 0),
    0,
  );
  // Array-level errors (e.g. the components total) live under `.root` for field arrays.
  const componentErrors = form.formState.errors.components;
  const componentsError = componentErrors?.root?.message ?? componentErrors?.message;
  const save = useCurriculumMutation((values: AddCurriculumSubjectInput) => {
    const parsed = addCurriculumSubjectSchema.parse(values);
    if (!assignment) return curriculaApi.addSubject(curriculum.id, parsed);
    const { subjectId: _subject, ...rest } = parsed;
    return curriculaApi.updateSubject(curriculum.id, assignment.id, {
      ...rest,
      components: rest.components ?? [],
    });
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      assignment
        ? {
            subjectId: assignment.subject.id,
            periodNumber: String(assignment.periodNumber),
            classification: assignment.classification ?? assignment.subject.category ?? 'THEORY',
            credits: assignment.credits ?? '',
            maxMarks: assignment.maxMarks ?? '',
            passMarks: assignment.passMarks ?? '',
            components: assignment.components.map((c) => ({
              name: c.name,
              maxMarks: c.maxMarks,
              passMarks: c.passMarks ?? '',
            })),
          }
        : {
            subjectId: '',
            periodNumber: String(periodNumber),
            classification: 'THEORY',
            credits: '',
            maxMarks: '',
            passMarks: '',
            components: [],
          },
    );
  }, [open, assignment, periodNumber, form]);

  /** Closing (cancel, Escape or after saving) also clears the picked subject. */
  function handleOpenChange(next: boolean) {
    if (!next) setSelected(null);
    onOpenChange(next);
  }

  function choose(subject: Subject) {
    setSelected(subject);
    form.setValue('subjectId', subject.id, { shouldValidate: true });
    if (subject.category) form.setValue('classification', subject.category);
    if (subject.defaultCredits !== null && form.getValues('credits') === '') {
      form.setValue('credits', subject.defaultCredits);
    }
  }

  const periodOptions = curriculum.periods.map((period) => ({
    value: String(period.number),
    label: period.label,
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      const code = assignment?.subject.code ?? selected?.code ?? 'Subject';
      toast.success(
        assignment
          ? `${code} updated`
          : `${code} added to ${periodLabel(curriculum.structureType, Number(values.periodNumber))}`,
      );
      handleOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {assignment ? `Edit ${assignment.subject.code}` : 'Add subject'}
          </DialogTitle>
          <DialogDescription>
            {assignment
              ? assignment.subject.name
              : `Reuse a subject from the catalogue in version ${curriculum.versionCode}. Marks and credits apply to this curriculum only.`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
          noValidate
        >
          {!assignment && (
            <SubjectPicker
              curriculum={curriculum}
              selected={selected}
              onSelect={choose}
              error={form.formState.errors.subjectId?.message}
            />
          )}
          <SelectField
            control={form.control}
            name="periodNumber"
            label={curriculum.structureType === 'YEAR_WISE' ? 'Year' : 'Semester'}
            options={periodOptions}
            required
          />
          <SelectField
            control={form.control}
            name="classification"
            label="Classification"
            options={CATEGORY_OPTIONS}
            required
          />
          <Field control={form.control} name="credits" label="Credits">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                {...form.register('credits')}
              />
            )}
          </Field>
          <Field control={form.control} name="maxMarks" label="Maximum marks">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="decimal"
                min={0}
                {...form.register('maxMarks')}
              />
            )}
          </Field>
          <Field control={form.control} name="passMarks" label="Passing marks">
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="decimal"
                min={0}
                {...form.register('passMarks')}
              />
            )}
          </Field>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:col-span-2">
            <legend className="px-1 text-label">
              Assessment components{' '}
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </legend>
            <p className="text-xs text-muted-foreground">
              For example Internal assessment, External examination, Practical examination. When
              maximum marks are set, the components must add up to them. No grading formula is
              applied.
            </p>
            {components.fields.map((component, index) => (
              <div
                key={component.id}
                className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              >
                <Field
                  control={form.control}
                  name={`components.${index}.name`}
                  label="Component"
                  required
                  className="col-span-2 sm:col-span-1"
                >
                  {(aria) => <Input {...aria} {...form.register(`components.${index}.name`)} />}
                </Field>
                <Field
                  control={form.control}
                  name={`components.${index}.maxMarks`}
                  label="Max"
                  required
                >
                  {(aria) => (
                    <Input
                      {...aria}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      {...form.register(`components.${index}.maxMarks`)}
                    />
                  )}
                </Field>
                <Field control={form.control} name={`components.${index}.passMarks`} label="Pass">
                  {(aria) => (
                    <Input
                      {...aria}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      {...form.register(`components.${index}.passMarks`)}
                    />
                  )}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={`Remove component ${String(index + 1)}`}
                  onClick={() => {
                    components.remove(index);
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            ))}
            {componentsError && (
              <p role="alert" className="text-xs font-medium text-danger-text">
                {componentsError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={components.fields.length >= 6}
                onClick={() => {
                  components.append({ name: '', maxMarks: '', passMarks: '' });
                }}
              >
                <PlusIcon aria-hidden="true" />
                Add component
              </Button>
              {components.fields.length > 0 && (
                <span className="text-xs text-foreground/80 tabular">
                  Components total: {componentTotal}
                </span>
              )}
            </div>
          </fieldset>

          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? 'Saving…'
                : assignment
                  ? 'Save changes'
                  : 'Add subject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
