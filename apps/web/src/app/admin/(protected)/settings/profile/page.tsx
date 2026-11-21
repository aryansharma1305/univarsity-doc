'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/data/page-header';
import { useSessionUser } from '@/components/providers/session-context';

export default function AdminProfilePage() {
  const user = useSessionUser();
  return (
    <>
      <PageHeader title="Admin Profile" />
      <dl className="grid max-w-xl gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-sm font-medium">Name</dt>
          <dd className="break-words">{user.displayName}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-medium">Email</dt>
          <dd className="break-words">{user.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm font-medium">Roles</dt>
          <dd className="break-words">{user.roles.join(', ') || 'No roles assigned'}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-4">
        <Link className="text-brand underline" href="/admin/security/password">
          Change password
        </Link>
        <Link className="text-brand underline" href="/admin/security/mfa">
          Two-step verification
        </Link>
      </div>
    </>
  );
}
