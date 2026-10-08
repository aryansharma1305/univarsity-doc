'use client';

import { useEffect } from 'react';
import {
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormRegister,
  type UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import { Input } from '@docversity/ui/components/input';
import type { Registration } from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { useSessionOptions } from '@/features/academic-sessions/api';
import { useActiveDepartmentOptions } from '@/features/departments/api';
import { useProgramOptions } from '@/features/programs/api';
import { REGISTRATION_STATUS_OPTIONS } from './options';

/**
 * Registration fields shared by "create student" and the add/edit registration dialog.
 * `prefix` is "registration." in the create-student form and "" in the dialog.
 * When the chosen program belongs to a department, the department follows the program (the API
 * enforces the same rule).
 */
export function RegistrationFields<T extends FieldValues>({
  control,
  register,
  setValue,
  prefix,
  current,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  prefix: '' | 'registration.';
  /** The registration being edited: keeps its (possibly inactive) program/session selectable. */
  current?: Registration;
}) {
  const name = (field: string) => `${prefix}${field}` as Path<T>;
  const programs = useProgramOptions();
  const sessions = useSessionOptions();
  const departments = useActiveDepartmentOptions();
  const programId = useWatch({ control, name: name('programId') }) as string | undefined;
  const program = programs.programs.find((p) => p.id === programId);
  const programDepartment =
    program?.department ??
    (current && current.program.id === programId ? current.department : null);

  useEffect(() => {
    if (programDepartment)
      setValue(name('departmentId'), programDepartment.id as PathValue<T, Path<T>>);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- name() is stable for a given prefix
  }, [programDepartment?.id, setValue]);

  const withCurrent = (
    options: { value: string; label: string }[],
    ref: { id: string; code: string; name: string } | null | undefined,
  ) =>
    ref && !options.some((o) => o.value === ref.id)
      ? [...options, { value: ref.id, label: `${ref.code} — ${ref.name}` }]
      : options;

  const programOptions = withCurrent(programs.options, current?.program);
  const sessionOptions = withCurrent(sessions.options, current?.academicSession);
  const departmentOptions = withCurrent(
    withCurrent(departments.options, current?.department),
    programDepartment,
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        control={control}
        name={name('registrationNumber')}
        label="Registration number"
        required
      >
        {(aria) => <Input {...aria} autoComplete="off" {...register(name('registrationNumber'))} />}
      </Field>
      <Field
        control={control}
        name={name('rollReferenceNumber')}
        label="Roll / reference number"
        hint="As used by the university, if any."
      >
        {(aria) => (
          <Input {...aria} autoComplete="off" {...register(name('rollReferenceNumber'))} />
        )}
      </Field>
      <SelectField
        control={control}
        name={name('programId')}
        label="Program"
        options={programOptions}
        required
        placeholder={programs.isPending ? 'Loading…' : 'Select a program'}
      />
      <SelectField
        control={control}
        name={name('departmentId')}
        label="Department"
        options={departmentOptions}
        allowNone={!programDepartment}
        disabled={Boolean(programDepartment)}
        hint={
          programDepartment
            ? `Set by the program (${programDepartment.code}).`
            : 'Optional for programs without a department.'
        }
        placeholder="None"
      />
      <SelectField
        control={control}
        name={name('academicSessionId')}
        label="Academic session"
        options={sessionOptions}
        required
        placeholder={sessions.isPending ? 'Loading…' : 'Select a session'}
      />
      <SelectField
        control={control}
        name={name('status')}
        label="Status"
        options={REGISTRATION_STATUS_OPTIONS}
        required
      />
      <Field control={control} name={name('admissionDate')} label="Admission date">
        {(aria) => <Input {...aria} type="date" {...register(name('admissionDate'))} />}
      </Field>
      <Field control={control} name={name('completionDate')} label="Completion date">
        {(aria) => <Input {...aria} type="date" {...register(name('completionDate'))} />}
      </Field>
    </div>
  );
}
