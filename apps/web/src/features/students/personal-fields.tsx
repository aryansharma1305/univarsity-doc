'use client';

import type { Control, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { Input } from '@docversity/ui/components/input';
import { Field } from '@/components/forms/fields';

export function PersonalFields<T extends FieldValues>({
  control,
  register,
  prefix,
}: {
  control: Control<T>;
  register: UseFormRegister<T>;
  prefix: '' | 'student.';
}) {
  const name = (field: string) => `${prefix}${field}` as Path<T>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        control={control}
        name={name('fullName')}
        label="Full name"
        required
        className="sm:col-span-2"
      >
        {(aria) => <Input {...aria} autoComplete="off" {...register(name('fullName'))} />}
      </Field>
      <Field control={control} name={name('fatherName')} label="Father’s name">
        {(aria) => <Input {...aria} autoComplete="off" {...register(name('fatherName'))} />}
      </Field>
      <Field control={control} name={name('motherName')} label="Mother’s name">
        {(aria) => <Input {...aria} autoComplete="off" {...register(name('motherName'))} />}
      </Field>
      <Field control={control} name={name('dateOfBirth')} label="Date of birth">
        {(aria) => <Input {...aria} type="date" {...register(name('dateOfBirth'))} />}
      </Field>
      <Field
        control={control}
        name={name('gender')}
        label="Gender"
        hint="As recorded by the university."
      >
        {(aria) => <Input {...aria} autoComplete="off" {...register(name('gender'))} />}
      </Field>
    </div>
  );
}
