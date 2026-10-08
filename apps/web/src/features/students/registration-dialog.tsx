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
import { type Registration, newRegistrationSchema } from '@docversity/validation';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useSaveRegistration } from './api';
import { RegistrationFields } from './registration-fields';

type RegistrationInput = z.input<typeof newRegistrationSchema>;

const EMPTY: RegistrationInput = {
  registrationNumber: '',
  rollReferenceNumber: '',
  programId: '',
  departmentId: '',
  academicSessionId: '',
  admissionDate: '',
  completionDate: '',
  status: 'ACTIVE',
};

/** Adds a registration to a student, or edits one (including its status). */
export function RegistrationDialog({
  open,
  onOpenChange,
  studentId,
  registration,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  registration?: Registration;
}) {
  const save = useSaveRegistration();
  const form = useForm<RegistrationInput>({
    resolver: zodResolver(newRegistrationSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      registration
        ? {
            registrationNumber: registration.registrationNumber,
            rollReferenceNumber: registration.rollReferenceNumber ?? '',
            programId: registration.program.id,
            departmentId: registration.department?.id ?? '',
            academicSessionId: registration.academicSession.id,
            admissionDate: registration.admissionDate ?? '',
            completionDate: registration.completionDate ?? '',
            status: registration.status,
          }
        : EMPTY,
    );
  }, [open, registration, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const body = newRegistrationSchema.parse(values);
    try {
      if (registration) {
        await save.mutateAsync({ id: registration.id, body });
        toast.success(`Registration ${body.registrationNumber} updated`);
      } else {
        await save.mutateAsync({ body: { studentId, ...body } });
        toast.success(`Registration ${body.registrationNumber} added`);
      }
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{registration ? 'Edit registration' : 'Add registration'}</DialogTitle>
          <DialogDescription>
            Registration numbers are unique and not case-sensitive.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
          <RegistrationFields
            control={form.control}
            register={form.register}
            setValue={form.setValue}
            prefix=""
            current={registration}
          />
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
              {form.formState.isSubmitting
                ? 'Saving…'
                : registration
                  ? 'Save changes'
                  : 'Add registration'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
