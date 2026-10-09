'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLinkIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
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
import { Textarea } from '@docversity/ui/components/textarea';
import {
  type CreateExternalExamAppInput,
  createExternalExamAppSchema,
  type ExternalExamApp,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { Field } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { formatDateTime } from '@/lib/format';
import { examinationsApi, useExamApps, useExaminationMutation } from './api';

function AppDialog({
  app,
  open,
  onOpenChange,
}: {
  app: ExternalExamApp | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<CreateExternalExamAppInput>({
    resolver: zodResolver(createExternalExamAppSchema),
    values: {
      name: app?.name ?? '',
      websiteUrl: app?.websiteUrl ?? '',
      androidUrl: app?.androidUrl ?? '',
      iosUrl: app?.iosUrl ?? '',
      instructions: app?.instructions ?? '',
      isActive: app?.isActive ?? false,
    },
  });
  const save = useExaminationMutation((body: CreateExternalExamAppInput) => {
    const parsed = createExternalExamAppSchema.parse(body);
    return app ? examinationsApi.updateApp(app.id, parsed) : examinationsApi.createApp(parsed);
  });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      toast.success(app ? 'Examination application updated.' : 'Examination application added.');
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {app ? 'Edit examination application' : 'Add examination application'}
          </DialogTitle>
          <DialogDescription>
            Enter only the official https addresses the university provides. Leave a download link
            empty if there is none — students then see no download button.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-4">
          <Field control={form.control} name="name" label="Application name" required>
            {(aria) => <Input {...aria} {...form.register('name')} />}
          </Field>
          <Field control={form.control} name="websiteUrl" label="Official website URL" required>
            {(aria) => (
              <Input {...aria} type="url" inputMode="url" {...form.register('websiteUrl')} />
            )}
          </Field>
          <Field control={form.control} name="androidUrl" label="Android download URL">
            {(aria) => (
              <Input {...aria} type="url" inputMode="url" {...form.register('androidUrl')} />
            )}
          </Field>
          <Field control={form.control} name="iosUrl" label="iOS download URL">
            {(aria) => <Input {...aria} type="url" inputMode="url" {...form.register('iosUrl')} />}
          </Field>
          <Field control={form.control} name="instructions" label="Instructions for students">
            {(aria) => (
              <Textarea {...aria} rows={4} maxLength={4000} {...form.register('instructions')} />
            )}
          </Field>
          <div className="flex items-center gap-2">
            <input
              id="exam-app-active"
              type="checkbox"
              className="size-4 accent-brand"
              {...form.register('isActive')}
            />
            <Label htmlFor="exam-app-active">Show to students (active)</Label>
          </div>
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
              {form.formState.isSubmitting ? 'Working…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className="font-mono text-xs break-all text-navy-950">{url ?? 'Not provided'}</dd>
    </div>
  );
}

export function ExamAppView() {
  const query = useExamApps();
  const canManage = useCan(PERMISSIONS.examinationsManage);
  const [editing, setEditing] = useState<ExternalExamApp | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Examination application"
        description="The university’s separate examination app. Students see active entries on their Examinations page; examinations are taken there, not in Docversity."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              Add application
            </Button>
          )
        }
      />
      {query.isPending ? (
        <TableSkeleton rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title="No examination application configured"
          description="Students see “Examination application not configured yet” until an active entry exists."
        />
      ) : (
        <div className="grid gap-4">
          {query.data.data.map((app) => (
            <Card key={app.id} className="gap-0 py-0 shadow-card">
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="text-section-title break-words text-navy-950">{app.name}</h2>
                    <p className="text-meta">
                      Updated {formatDateTime(app.updatedAt)} by {app.updatedBy.displayName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={app.isActive ? 'success' : 'neutral'}>
                      {app.isActive ? 'Active (shown to students)' : 'Inactive'}
                    </StatusBadge>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(app);
                          setOpen(true);
                        }}
                      >
                        <PencilIcon aria-hidden="true" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <LinkRow label="Official website" url={app.websiteUrl} />
                  <LinkRow label="Android" url={app.androidUrl} />
                  <LinkRow label="iOS" url={app.iosUrl} />
                </dl>
                {app.instructions && (
                  <p className="text-sm whitespace-pre-line text-navy-950">{app.instructions}</p>
                )}
                <a
                  href={app.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand underline underline-offset-2"
                >
                  <ExternalLinkIcon aria-hidden="true" className="size-4" />
                  Check the website link
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {canManage && <AppDialog app={editing} open={open} onOpenChange={setOpen} />}
    </>
  );
}
