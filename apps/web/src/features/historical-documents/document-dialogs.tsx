'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
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
import { Label } from '@docversity/ui/components/label';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  HISTORICAL_DOCUMENT_RULES,
  type HistoricalDocumentDetail,
  type UpdateHistoricalDocumentInput,
  updateHistoricalDocumentSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { ApiError, errorMessage } from '@/lib/api';
import { documentForm, documentsApi, useDocumentMutation } from './api';
import { PROVENANCE_OPTIONS, TYPE_OPTIONS, versionLabel } from './labels';
import { checkDocumentFile } from './upload-view';

interface DialogProps {
  document: HistoricalDocumentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Footer({
  onCancel,
  confirm,
  pending,
  destructive,
  disabled,
  onConfirm,
}: {
  onCancel: () => void;
  confirm: string;
  pending: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm?: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type={onConfirm ? 'button' : 'submit'}
        variant={destructive ? 'destructive' : 'default'}
        disabled={pending || disabled}
        onClick={onConfirm}
      >
        {pending ? 'Working…' : confirm}
      </Button>
    </DialogFooter>
  );
}

export function PublishDialog({ document, open, onOpenChange }: DialogProps) {
  const mutation = useDocumentMutation(() => documentsApi.publish(document.id));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish to the student?</DialogTitle>
          <DialogDescription>
            {document.student.fullName} ({document.registration.registrationNumber}) will be able to
            view and download it in their document library.
            {document.replaces?.status === 'PUBLISHED'
              ? ` The document it replaces (${versionLabel(document.replaces)}) will be marked superseded and hidden from the student.`
              : ''}{' '}
            {document.studentCopy.status === 'READY'
              ? 'The student receives a copy of the scan with embedded metadata (such as location or device details) removed; the original stays unchanged for staff. '
              : ''}
            Publishing does not confirm authenticity.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage(mutation.error)}
          </p>
        )}
        <Footer
          onCancel={() => {
            onOpenChange(false);
          }}
          confirm="Publish document"
          pending={mutation.isPending}
          onConfirm={() => {
            mutation.mutate(undefined, {
              onSuccess: () => {
                toast.success('Published. The student can now see this document.');
                onOpenChange(false);
              },
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  document,
  onDone,
}: {
  document: HistoricalDocumentDetail;
  onDone: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const mutation = useDocumentMutation(() =>
    documentsApi.withdraw(document.id, { reason: reason.trim() }),
  );
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>Reason (staff only)</Label>
        <Textarea
          id={id}
          value={reason}
          maxLength={1000}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
        <p id={`${id}-hint`} className="text-meta">
          Required, at least 5 characters. Kept on the record.
        </p>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(mutation.error)}
        </p>
      )}
      <Footer
        onCancel={onDone}
        confirm="Withdraw document"
        destructive
        pending={mutation.isPending}
        disabled={reason.trim().length < 5}
        onConfirm={() => {
          mutation.mutate(undefined, {
            onSuccess: () => {
              toast.success('Withdrawn. The student no longer sees this document.');
              onDone();
            },
          });
        }}
      />
    </>
  );
}

export function WithdrawDialog({ document, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw this document</DialogTitle>
          <DialogDescription>
            It is hidden from the student. Nothing is deleted: the file and its history stay on
            record, and it can be published again.
          </DialogDescription>
        </DialogHeader>
        <ReasonForm
          document={document}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({
  document,
  onDone,
}: {
  document: HistoricalDocumentDetail;
  onDone: () => void;
}) {
  const id = useId();
  const [authenticity, setAuthenticity] = useState<'CONFIRMED_AGAINST_RECORDS' | 'DISPUTED'>(
    'CONFIRMED_AGAINST_RECORDS',
  );
  const [note, setNote] = useState('');
  const mutation = useDocumentMutation(() =>
    documentsApi.review(document.id, { authenticity, note: note.trim() }),
  );
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label">Outcome</legend>
        {(
          [
            ['CONFIRMED_AGAINST_RECORDS', 'Confirmed against university records'],
            ['DISPUTED', 'Disputed — does not match records or needs investigation'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${id}-outcome`}
              className="size-4 accent-[var(--color-brand)]"
              checked={authenticity === value}
              onChange={() => {
                setAuthenticity(value);
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>What was checked</Label>
        <Textarea
          id={id}
          value={note}
          maxLength={1000}
          placeholder="e.g. Matched the 2019 convocation register, page 14."
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMessage(mutation.error)}
        </p>
      )}
      <Footer
        onCancel={onDone}
        confirm="Record review"
        pending={mutation.isPending}
        disabled={note.trim().length < 5}
        onConfirm={() => {
          mutation.mutate(undefined, {
            onSuccess: () => {
              toast.success('Authenticity review recorded.');
              onDone();
            },
          });
        }}
      />
    </>
  );
}

export function AuthenticityDialog({ document, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record authenticity review</DialogTitle>
          <DialogDescription>
            An official staff check of this copy against university records. It is separate from
            whether the student can see the document, and it is not a cryptographic verification.
          </DialogDescription>
        </DialogHeader>
        <ReviewForm
          document={document}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditDraftDialog({ document, open, onOpenChange }: DialogProps) {
  const form = useForm<UpdateHistoricalDocumentInput>({
    resolver: zodResolver(updateHistoricalDocumentSchema),
    values: {
      documentType: document.documentType,
      title: document.title,
      certificateNumber: document.certificateNumber ?? '',
      issuedOn: document.issuedOn ?? '',
      provenance: document.provenance,
      provenanceNote: document.provenanceNote ?? '',
      legacySourceSystem: document.legacySourceSystem ?? '',
      legacyRecordId: document.legacyRecordId ?? '',
      legacyVerificationUrl: document.legacyVerificationUrl ?? '',
    },
  });
  const mutation = useDocumentMutation((values: UpdateHistoricalDocumentInput) =>
    documentsApi.update(document.id, updateHistoricalDocumentSchema.parse(values)),
  );
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      toast.success('Draft updated');
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit draft details</DialogTitle>
          <DialogDescription>
            Drafts can be corrected freely. After publication, corrections need a replacement.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="grid gap-4 sm:grid-cols-2"
        >
          <SelectField
            control={form.control}
            name="documentType"
            label="Document type"
            options={TYPE_OPTIONS}
            required
          />
          <Field control={form.control} name="title" label="Title" required>
            {(aria) => <Input {...aria} {...form.register('title')} />}
          </Field>
          <Field control={form.control} name="certificateNumber" label="Certificate number">
            {(aria) => <Input {...aria} {...form.register('certificateNumber')} />}
          </Field>
          <Field control={form.control} name="issuedOn" label="Issue date">
            {(aria) => <Input {...aria} type="date" {...form.register('issuedOn')} />}
          </Field>
          <SelectField
            control={form.control}
            name="provenance"
            label="Source"
            options={PROVENANCE_OPTIONS}
            required
          />
          <Field control={form.control} name="legacySourceSystem" label="Legacy system">
            {(aria) => <Input {...aria} {...form.register('legacySourceSystem')} />}
          </Field>
          <Field control={form.control} name="legacyRecordId" label="Legacy record ID">
            {(aria) => <Input {...aria} {...form.register('legacyRecordId')} />}
          </Field>
          <Field
            control={form.control}
            name="legacyVerificationUrl"
            label="Printed verification URL"
          >
            {(aria) => <Input {...aria} type="url" {...form.register('legacyVerificationUrl')} />}
          </Field>
          <Field
            control={form.control}
            name="provenanceNote"
            label="Provenance note"
            className="sm:col-span-2"
          >
            {(aria) => <Textarea {...aria} maxLength={1000} {...form.register('provenanceNote')} />}
          </Field>
          <div className="sm:col-span-2">
            <Footer
              onCancel={() => {
                onOpenChange(false);
              }}
              confirm="Save changes"
              pending={form.formState.isSubmitting}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceForm({
  document,
  onDone,
}: {
  document: HistoricalDocumentDetail;
  onDone: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [title, setTitle] = useState(document.title);
  const [number, setNumber] = useState(document.certificateNumber ?? '');
  const mutation = useDocumentMutation((form: FormData) => documentsApi.replace(document.id, form));
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-file`}>Corrected file</Label>
        <Input
          id={`${id}-file`}
          type="file"
          accept={HISTORICAL_DOCUMENT_RULES.acceptedTypes.join(',')}
          className="h-10 file:mr-3 file:font-medium file:text-brand"
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            const issue = chosen ? checkDocumentFile(chosen) : null;
            setProblem(issue);
            setFile(issue ? null : chosen);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-number`}>Certificate number</Label>
        <Input
          id={`${id}-number`}
          value={number}
          onChange={(event) => {
            setNumber(event.target.value);
          }}
        />
      </div>
      {(problem ?? mutation.error) && (
        <p role="alert" className="text-sm text-danger-text">
          {problem ??
            (mutation.error instanceof ApiError && mutation.error.details[0]
              ? mutation.error.details[0].message
              : errorMessage(mutation.error))}
        </p>
      )}
      <Footer
        onCancel={onDone}
        confirm="Upload replacement"
        pending={mutation.isPending}
        disabled={!file || title.trim() === ''}
        onConfirm={() => {
          if (!file) return;
          mutation.mutate(
            documentForm(
              {
                ...(title.trim() !== document.title ? { title: title.trim() } : {}),
                // Sent exactly as typed: certificate numbers are never trimmed or rewritten.
                ...(number !== (document.certificateNumber ?? '')
                  ? { certificateNumber: number }
                  : {}),
              },
              file,
            ),
            {
              onSuccess: (saved) => {
                toast.success(
                  'Replacement saved as a draft. Publish it to show it to the student.',
                );
                onDone();
                router.push(`/admin/historical-documents/${saved.id}`);
              },
            },
          );
        }}
      />
    </>
  );
}

export function ReplaceDialog({ document, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a replacement</DialogTitle>
          <DialogDescription>
            Creates a corrected draft linked to this document. This document stays on record; when
            the replacement is published, it is marked superseded.
          </DialogDescription>
        </DialogHeader>
        <ReplaceForm
          document={document}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
