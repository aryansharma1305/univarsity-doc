'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@docversity/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { type StudentDetail, studentPersonalSchema } from '@docversity/validation';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useUpdateStudent } from './api';
import { PersonalFields } from './personal-fields';

type PersonalInput = z.input<typeof studentPersonalSchema>;

export function PersonalDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: StudentDetail;
}) {
  const update = useUpdateStudent(student.id);
  const form = useForm<PersonalInput>({ resolver: zodResolver(studentPersonalSchema) });

  useEffect(() => {
    if (open)
      form.reset({
        fullName: student.fullName,
        fatherName: student.fatherName ?? '',
        motherName: student.motherName ?? '',
        dateOfBirth: student.dateOfBirth ?? '',
        gender: student.gender ?? '',
      });
  }, [open, student, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(studentPersonalSchema.parse(values));
      toast.success('Personal details updated');
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit personal details</DialogTitle>
          <DialogDescription>
            Changes are recorded in the activity log (field names only).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
          <PersonalFields control={form.control} register={form.register} prefix="" />
          <DialogFooter>
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
              {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
