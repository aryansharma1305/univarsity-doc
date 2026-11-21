'use client';

import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS } from '@docversity/types';
import { staffUserListResponseSchema } from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { ErrorState, ForbiddenState, TableSkeleton } from '@/components/data/states';
import { useCan } from '@/components/providers/session-context';
import { apiRequest } from '@/lib/api';

export default function StaffRolesPage() {
  const allowed = useCan(PERMISSIONS.usersManage);
  const query = useQuery({
    queryKey: ['staff-users'],
    queryFn: () => apiRequest('GET', 'staff-users', staffUserListResponseSchema),
    enabled: allowed,
  });
  if (!allowed) return <ForbiddenState />;
  return (
    <>
      <PageHeader
        title="Staff Users & Roles"
        description="View staff access, account status and two-step verification."
      />
      {query.isPending ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ul aria-label="Staff users" className="grid gap-3 sm:grid-cols-2">
          {query.data.data.map((staff) => (
            <li key={staff.id} className="min-w-0 rounded-lg border border-border bg-card p-4">
              <h2 className="break-words font-semibold">{staff.displayName}</h2>
              <p className="break-words text-sm text-muted-foreground">{staff.email}</p>
              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="font-medium">Roles</dt>
                  <dd className="break-words">{staff.roles.join(', ') || 'No roles assigned'}</dd>
                </div>
                <div>
                  <dt className="font-medium">Account status</dt>
                  <dd>{staff.status === 'ACTIVE' ? 'Active' : 'Disabled'}</dd>
                </div>
                <div>
                  <dt className="font-medium">Two-step verification</dt>
                  <dd>{staff.mfaEnabled ? 'Enabled' : 'Not set up'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
