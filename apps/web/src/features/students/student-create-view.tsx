'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { Button } from '@docversity/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@docversity/ui/components/card';
import { type CreateStudentInput, createStudentSchema } from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { ForbiddenState } from '@/components/data/states';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { useCreateStudent } from './api';
import { PersonalFields } from './personal-fields';
import { RegistrationFields } from './registration-fields';

const EMPTY: CreateStudentInput = {
  student: { fullName: '', fatherName: '', motherName: '', dateOfBirth: '', gender: '' },
  registration: {
    registrationNumber: '',
    rollReferenceNumber: '',
    programId: '',
    departmentId: '',
    academicSessionId: '',
    admissionDate: '',
    completionDate: '',
    status: 'ACTIVE',
  },
};

export function StudentCreateView() {
  const canWriteStudents = useCan(PERMISSIONS.studentsWrite);
  const canWriteRegistrations = useCan(PERMISSIONS.registrationsWrite);
  const canCreate = canWriteStudents && canWriteRegistrations;
  const router = useRouter();
  const create = useCreateStudent();
  const form = useForm<CreateStudentInput>({
    resolver: zodResolver(createStudentSchema),
    defaultValues: EMPTY,
  });

  if (!canCreate) return <ForbiddenState />;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const student = await create.mutateAsync(createStudentSchema.parse(values));
      toast.success(`Student ${student.fullName} created`);
      router.push(`/admin/students/${student.id}`);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <>
      <PageHeader
        title="New student"
        description="Creates the student and their first registration together. If either fails, nothing is saved."
      />
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="flex flex-col gap-6"
        noValidate
        aria-label="Create student"
      >
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-section-title">Personal information</CardTitle>
            <CardDescription>Only the full name is required.</CardDescription>
          </CardHeader>
          <CardContent>
            <PersonalFields control={form.control} register={form.register} prefix="student." />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-section-title">Academic registration</CardTitle>
            <CardDescription>
              Registration numbers are unique and not case-sensitive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationFields
              control={form.control}
              register={form.register}
              setValue={form.setValue}
              prefix="registration."
            />
          </CardContent>
        </Card>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/admin/students">Cancel</Link>
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating…' : 'Create student'}
          </Button>
        </div>
      </form>
    </>
  );
}
