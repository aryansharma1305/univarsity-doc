'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftIcon, ImageUpIcon, Loader2Icon, SendIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Label } from '@docversity/ui/components/label';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  GENDER_OPTIONS,
  PROFILE_FIELD_LABELS,
  PROFILE_PHOTO_RULES,
  type ProfileChangesInput,
  type ProfileRequestField,
  profileChangesSchema,
  type StudentMe,
} from '@docversity/validation';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { studentPortalApi } from './api';
import { StudentAvatar } from './student-avatar';

type TextField = Exclude<ProfileRequestField, 'gender' | 'dateOfBirth'>;
type Errors = Partial<Record<ProfileRequestField | 'photo' | 'note', string>>;

const TEXT_FIELDS: TextField[] = ['fullName', 'fatherName', 'motherName'];
const MAX_PHOTO_MB = PROFILE_PHOTO_RULES.maxBytes / (1024 * 1024);
const ACCEPT = PROFILE_PHOTO_RULES.acceptedTypes.join(',');

function displayValue(field: ProfileRequestField, value: string | null | undefined): string {
  if (!value) return 'Not on record';
  return field === 'dateOfBirth' ? formatDate(value) : value;
}

/** Fields whose form value differs from the official record (blank never "clears" a value). */
function changedValues(
  me: StudentMe,
  values: Record<ProfileRequestField, string>,
): ProfileChangesInput {
  const changes: Record<string, string> = {};
  for (const field of [...TEXT_FIELDS, 'gender', 'dateOfBirth'] as const) {
    const value = values[field].trim();
    if (value !== '' && value !== (me.student[field] ?? '')) changes[field] = value;
  }
  return changes;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].join(' ').trim() || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-label">
        {label}
      </Label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={`${id}-hint`} className="text-meta">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The chosen photo and a local object URL for previewing it. The previous URL is revoked whenever
 * the photo changes, and the last one when the form unmounts.
 */
function usePhotoChoice() {
  const [choice, setChoice] = useState<{ file: File; url: string } | null>(null);
  const current = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    [],
  );
  const choose = (file: File | null) => {
    if (current.current) URL.revokeObjectURL(current.current);
    const url = file ? URL.createObjectURL(file) : null;
    current.current = url;
    setChoice(file && url ? { file, url } : null);
  };
  return [choice?.file ?? null, choice?.url ?? null, choose] as const;
}

/**
 * Student profile update: edit → review → submit for approval. Nothing here changes the official
 * record; the university reviews every request. The API re-validates everything (incl. the photo).
 */
export function ProfileUpdateForm({ me }: { me: StudentMe }) {
  const router = useRouter();
  const { student } = me;
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [values, setValues] = useState<Record<ProfileRequestField, string>>({
    fullName: student.fullName,
    fatherName: student.fatherName ?? '',
    motherName: student.motherName ?? '',
    gender: student.gender ?? '',
    dateOfBirth: '',
  });
  const [photo, preview, setPhoto] = usePhotoChoice();
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const changes = changedValues(me, values);
  const changedFields = Object.keys(changes) as ProfileRequestField[];
  const hasChanges = changedFields.length > 0 || photo !== null;
  const genderOptions: string[] = [...GENDER_OPTIONS];

  function set(field: ProfileRequestField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function choosePhoto(file: File | undefined) {
    setErrors((current) => ({ ...current, photo: undefined }));
    if (!file) {
      setPhoto(null);
      return;
    }
    const accepted: readonly string[] = PROFILE_PHOTO_RULES.acceptedTypes;
    if (!accepted.includes(file.type)) {
      setErrors((current) => ({ ...current, photo: 'Choose a JPEG, PNG or WebP photo.' }));
      setPhoto(null);
      return;
    }
    if (file.size > PROFILE_PHOTO_RULES.maxBytes) {
      setErrors((current) => ({ ...current, photo: `Choose a photo under ${MAX_PHOTO_MB} MB.` }));
      setPhoto(null);
      return;
    }
    setPhoto(file);
  }

  function review() {
    setFormError(null);
    const parsed = profileChangesSchema.safeParse(changes);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as ProfileRequestField | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (!hasChanges) {
      setFormError('Change at least one detail or choose a photo.');
      return;
    }
    setStep('review');
  }

  async function submit() {
    setPending(true);
    setFormError(null);
    try {
      await studentPortalApi.submitProfileRequest({
        changes,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(photo ? { photo } : {}),
      });
      // The tracking page confirms the submission (the profile page now shows the pending request).
      router.push('/student/profile/requests?submitted=1');
    } catch (caught) {
      const next: Errors = {};
      if (caught instanceof ApiError) {
        for (const detail of caught.details) {
          const key = detail.path.replace(/^changes\./, '') as keyof Errors;
          next[key] = detail.message;
        }
      }
      setErrors(next);
      setFormError(errorMessage(caught));
      // Field problems are fixed on the edit step; other problems can be retried from review.
      if (Object.keys(next).length > 0) setStep('edit');
    } finally {
      setPending(false);
    }
  }

  if (step === 'review') {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-base font-semibold text-navy-950">Review your request</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Check the proposed changes. They are sent to the university for approval.
          </p>
        </div>
        {formError && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-text">
            {formError}
          </p>
        )}
        {changedFields.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Proposed changes</caption>
              <thead className="bg-muted text-foreground/80">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Detail
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    On record
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Proposed
                  </th>
                </tr>
              </thead>
              <tbody>
                {changedFields.map((field) => (
                  <tr key={field} className="border-t border-border align-top">
                    <th scope="row" className="px-3 py-2 font-medium text-navy-950">
                      {PROFILE_FIELD_LABELS[field]}
                    </th>
                    <td className="px-3 py-2 break-words text-muted-foreground">
                      {displayValue(field, student[field])}
                    </td>
                    <td className="px-3 py-2 font-medium break-words text-navy-950">
                      {displayValue(field, changes[field])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {photo && preview && (
          <div className="flex flex-wrap items-center gap-6">
            <figure className="flex flex-col items-center gap-2">
              <StudentAvatar name={student.fullName} hasPhoto={student.hasPhoto} size="lg" />
              <figcaption className="text-meta">On record</figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-2">
              {/* A local blob preview of the file the student chose (never uploaded until submit). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt={`${student.fullName}, proposed`}
                className="size-24 rounded-full object-cover ring-4 ring-white"
              />
              <figcaption className="text-meta">Proposed</figcaption>
            </figure>
          </div>
        )}
        {note.trim() && (
          <p className="text-sm text-navy-950">
            <span className="text-muted-foreground">Your note: </span>
            {note.trim()}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setStep('edit');
            }}
          >
            <ArrowLeftIcon aria-hidden="true" />
            Back to edit
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {pending ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : (
              <SendIcon aria-hidden="true" />
            )}
            Submit for approval
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
    >
      {formError && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger-text">
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {student.dateOfBirth === null ? (
          <Field
            label="Date of birth"
            hint="Missing from your record. Enter it as on your official documents."
            error={errors.dateOfBirth}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="date"
                className="h-10"
                value={values.dateOfBirth}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  set('dateOfBirth', event.target.value);
                }}
              />
            )}
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-label">Date of birth</span>
            <span className="font-medium text-navy-950">{formatDate(student.dateOfBirth)}</span>
            <span className="text-meta">
              On record. Contact the registrar’s office to correct it.
            </span>
          </div>
        )}
        <Field label="Gender" error={errors.gender}>
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              value={values.gender}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                set('gender', event.target.value);
              }}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm text-navy-950 shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {!genderOptions.includes(values.gender) && (
                <option value={values.gender}>
                  {values.gender ? `${values.gender} (on record)` : 'Not on record'}
                </option>
              )}
              {genderOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
        {TEXT_FIELDS.map((field) => (
          <Field key={field} label={PROFILE_FIELD_LABELS[field]} error={errors[field]}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                className="h-10"
                maxLength={200}
                autoComplete="off"
                value={values[field]}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                onChange={(event) => {
                  set(field, event.target.value);
                }}
              />
            )}
          </Field>
        ))}
      </div>
      <Field
        label="Photo"
        hint={`A clear, recent passport-style photo. JPEG, PNG or WebP, at least ${PROFILE_PHOTO_RULES.minWidth} × ${PROFILE_PHOTO_RULES.minHeight} pixels, up to ${MAX_PHOTO_MB} MB.`}
        error={errors.photo}
      >
        {({ id, describedBy, invalid }) => (
          <div className="flex flex-wrap items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Your chosen file"
                className="size-16 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ImageUpIcon aria-hidden="true" className="size-6" />
              </span>
            )}
            <Input
              id={id}
              type="file"
              accept={ACCEPT}
              className="h-10 max-w-full min-w-0 flex-1 file:mr-3 file:font-medium file:text-brand"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                choosePhoto(event.target.files?.[0]);
              }}
            />
          </div>
        )}
      </Field>
      <Field label="Note for the registrar (optional)" error={errors.note}>
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            maxLength={500}
            value={note}
            aria-describedby={describedBy}
            placeholder="For example, which document shows the correct details."
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        )}
      </Field>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta">
          {hasChanges
            ? `${changedFields.length + (photo ? 1 : 0)} change(s) ready to review.`
            : 'No changes yet.'}
        </p>
        <Button type="submit">Review changes</Button>
      </div>
    </form>
  );
}
