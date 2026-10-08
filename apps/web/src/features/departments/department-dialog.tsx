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
import {
  type CreateDepartmentInput,
  type Department,
  createDepartmentSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useSaveDepartment } from './api';

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
] as const;

export function DepartmentDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department?: Department;
}) {
  const save = useSaveDepartment();
  const form = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: { code: '', name: '', status: 'ACTIVE' },
  });

  useEffect(() => {
    if (open)
      form.reset(
        department
          ? { code: department.code, name: department.name, status: department.status }
          : { code: '', name: '', status: 'ACTIVE' },
      );
  }, [open, department, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...(department ? { id: department.id } : {}),
        body: createDepartmentSchema.parse(values),
      });
      toast.success(
        department ? `Department ${saved.code} updated` : `Department ${saved.code} created`,
      );
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? 'Edit department' : 'Add department'}</DialogTitle>
          <DialogDescription>
            Departments group programs. They are deactivated, never deleted.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
          <Field
            control={form.control}
            name="code"
            label="Code"
            required
            hint="Letters, digits, . _ / - (no spaces)"
          >
            {(aria) => <Input {...aria} autoComplete="off" {...form.register('code')} />}
          </Field>
          <Field control={form.control} name="name" label="Name" required>
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <SelectField
            control={form.control}
            name="status"
            label="Status"
            options={STATUS_OPTIONS}
            required
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
                : department
                  ? 'Save changes'
                  : 'Add department'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
