'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useId, useState } from 'react';
import { toast } from 'sonner';
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_NAMES } from '@docversity/types';
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
  STAFF_DISABLE_REASONS,
  type StaffUser,
  staffUserListResponseSchema,
  staffUserSchema,
  okResponseSchema,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan, useSessionUser } from '@/components/providers/session-context';
import { apiRequest, errorMessage } from '@/lib/api';

const ROLES = Object.values(ROLE_NAMES);
const REASON_LABELS: Record<(typeof STAFF_DISABLE_REASONS)[number], string> = {
  DEMO_ACCOUNT_RETIRED: 'Demo account retired',
  LEFT_ORGANISATION: 'Left the organisation',
  SECURITY_CONCERN: 'Security concern',
  OTHER: 'Other',
};

type Action =
  { kind: 'create' } | { kind: 'roles' | 'reset' | 'disable' | 'enable'; user: StaffUser };

const staffApi = {
  list: () => apiRequest('GET', 'staff-users', staffUserListResponseSchema),
  create: (body: unknown) => apiRequest('POST', 'staff-users', staffUserSchema, { body }),
  roles: (id: string, roles: string[]) =>
    apiRequest('PATCH', `staff-users/${id}/roles`, staffUserSchema, { body: { roles } }),
  reset: (id: string, temporaryPassword: string) =>
    apiRequest('POST', `staff-users/${id}/access-reset`, okResponseSchema, {
      body: { temporaryPassword },
    }),
  disable: (id: string, reason: string) =>
    apiRequest('POST', `staff-users/${id}/disable`, okResponseSchema, { body: { reason } }),
  enable: (id: string, temporaryPassword: string) =>
    apiRequest('POST', `staff-users/${id}/enable`, staffUserSchema, {
      body: { temporaryPassword },
    }),
};

function RoleChoices({ selected }: { selected: readonly string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Roles</legend>
      {ROLES.map((role) => (
        <div key={role} className="flex items-start gap-3 text-sm">
          <input
            id={`role-${role}`}
            type="checkbox"
            name="roles"
            value={role}
            defaultChecked={selected.includes(role)}
            aria-describedby={`role-${role}-hint`}
            className="mt-1"
          />
          <label htmlFor={`role-${role}`}>
            <span className="font-medium">{role.replaceAll('_', ' ')}</span>
            <span id={`role-${role}-hint`} className="block text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </span>
          </label>
        </div>
      ))}
    </fieldset>
  );
}

function Field({
  name,
  label,
  type = 'text',
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

const TEMP_HINT =
  'Hand it over in person or by phone, never by email. They must choose their own at first sign-in.';

function ActionDialog({ action, onClose }: { action: Action; onClose: () => void }) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (data: FormData): Promise<unknown> => {
      const text = (key: string) => {
        const value = data.get(key);
        return typeof value === 'string' ? value : '';
      };
      const roles = data.getAll('roles').map(String);
      switch (action.kind) {
        case 'create':
          return staffApi.create({
            email: text('email'),
            displayName: text('displayName'),
            roles,
            temporaryPassword: text('temporaryPassword'),
          });
        case 'roles':
          return staffApi.roles(action.user.id, roles);
        case 'reset':
          return staffApi.reset(action.user.id, text('temporaryPassword'));
        case 'disable':
          return staffApi.disable(action.user.id, text('reason'));
        case 'enable':
          return staffApi.enable(action.user.id, text('temporaryPassword'));
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['staff-users'] });
      toast.success(SUCCESS[action.kind]);
      onClose();
    },
    onError: (caught) => {
      setError(errorMessage(caught));
    },
  });
  const target = action.kind === 'create' ? null : action.user;
  const { title, description, submit } = COPY[action.kind];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          className="grid gap-4"
          onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
            event.preventDefault();
            setError('');
            mutation.mutate(new FormData(event.currentTarget));
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {target && (
                <>
                  {target.displayName} ({target.email}).{' '}
                </>
              )}
              {description}
            </DialogDescription>
          </DialogHeader>
          {action.kind === 'create' && (
            <>
              <Field name="displayName" label="Full name" />
              <Field name="email" label="Email" type="email" />
            </>
          )}
          {(action.kind === 'create' || action.kind === 'roles') && (
            <RoleChoices selected={target?.roles ?? []} />
          )}
          {(action.kind === 'create' || action.kind === 'reset' || action.kind === 'enable') && (
            <Field
              name="temporaryPassword"
              label="Temporary password"
              type="password"
              hint={TEMP_HINT}
            />
          )}
          {action.kind === 'disable' && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Reason</legend>
              {STAFF_DISABLE_REASONS.map((reason, index) => (
                <label key={reason} className="flex items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={reason}
                    defaultChecked={index === 0}
                    required
                  />
                  {REASON_LABELS[reason]}
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action.kind === 'disable' ? 'destructive' : 'default'}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving…' : submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COPY = {
  create: {
    title: 'Add staff account',
    description: 'Give only the roles this person needs.',
    submit: 'Create account',
  },
  roles: {
    title: 'Change roles',
    description: 'Takes effect on their next action. The last active Super Admin keeps that role.',
    submit: 'Save roles',
  },
  reset: {
    title: 'Reset access',
    description: 'Removes their authenticator, ends their sessions and sets a temporary password.',
    submit: 'Reset access',
  },
  disable: {
    title: 'Disable account',
    description: 'They are signed out everywhere and cannot sign in until re-enabled.',
    submit: 'Disable account',
  },
  enable: {
    title: 'Re-enable account',
    description: 'Sets a temporary password and removes any old authenticator.',
    submit: 'Re-enable account',
  },
} as const;

const SUCCESS = {
  create: 'Staff account created.',
  roles: 'Roles updated.',
  reset: 'Access reset.',
  disable: 'Account disabled.',
  enable: 'Account re-enabled.',
} as const;

export function StaffUsersView() {
  const allowed = useCan(PERMISSIONS.usersManage);
  const me = useSessionUser();
  const [action, setAction] = useState<Action | null>(null);
  const query = useQuery({ queryKey: ['staff-users'], queryFn: staffApi.list, enabled: allowed });
  if (!allowed) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Staff Users & Roles"
        description="Add staff, assign roles, and manage account access and two-step verification."
        actions={
          <Button
            onClick={() => {
              setAction({ kind: 'create' });
            }}
          >
            Add staff account
          </Button>
        }
      />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul aria-label="Staff users" className="grid gap-3 sm:grid-cols-2">
          {query.data.data.map((staff) => {
            const self = staff.id === me.id;
            const open = (kind: 'roles' | 'reset' | 'disable' | 'enable') => () => {
              setAction({ kind, user: staff });
            };
            return (
              <li key={staff.id} className="min-w-0 rounded-lg border border-border bg-card p-4">
                <h2 className="break-words font-semibold">
                  {staff.displayName}
                  {self && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </h2>
                <p className="break-words text-sm text-muted-foreground">{staff.email}</p>
                <dl className="mt-3 grid gap-2 text-sm">
                  <div>
                    <dt className="font-medium">Roles</dt>
                    <dd className="break-words">{staff.roles.join(', ') || 'No roles assigned'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Account status</dt>
                    <dd>
                      {staff.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                      {staff.status === 'ACTIVE' &&
                        staff.passwordChangeRequired &&
                        ' · must set a new password'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Two-step verification</dt>
                    <dd>{staff.mfaEnabled ? 'Enabled' : 'Not set up'}</dd>
                  </div>
                </dl>
                {!self && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {staff.status === 'ACTIVE' ? (
                      <>
                        <Button size="sm" variant="outline" onClick={open('roles')}>
                          Change roles
                        </Button>
                        <Button size="sm" variant="outline" onClick={open('reset')}>
                          Reset access
                        </Button>
                        <Button size="sm" variant="outline" onClick={open('disable')}>
                          Disable
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={open('enable')}>
                        Re-enable
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {action && (
        <ActionDialog
          action={action}
          onClose={() => {
            setAction(null);
          }}
        />
      )}
    </>
  );
}
