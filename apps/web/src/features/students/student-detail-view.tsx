'use client';

import { useSearchParams } from 'next/navigation';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS } from '@docversity/types';
import { Avatar, AvatarFallback } from '@docversity/ui/components/avatar';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@docversity/ui/components/tabs';
import type { Registration, StudentDetail } from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { initials } from '@/components/admin/user-menu';
import { EmptyState, ErrorState } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { formatDate, formatDateTime } from '@/lib/format';
import { useStudent, useStudentActivity } from './api';
import { PersonalDialog } from './personal-dialog';
import { RegistrationDialog } from './registration-dialog';

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className="text-sm text-foreground">{value && value.length > 0 ? value : '—'}</dd>
    </div>
  );
}

function RegistrationCard({
  registration,
  canEdit,
  onEdit,
}: {
  registration: Registration;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-navy-950 tabular">{registration.registrationNumber}</p>
            <p className="text-meta">
              {registration.program.code} — {registration.program.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RecordStatus status={registration.status} />
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                aria-label={`Edit registration ${registration.registrationNumber}`}
              >
                <PencilIcon aria-hidden="true" />
                Edit
              </Button>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Detail label="Roll / reference number" value={registration.rollReferenceNumber} />
          <Detail
            label="Department"
            value={
              registration.department
                ? `${registration.department.code} — ${registration.department.name}`
                : null
            }
          />
          <Detail
            label="Academic session"
            value={`${registration.academicSession.code} — ${registration.academicSession.name}`}
          />
          <Detail label="Admission date" value={formatDate(registration.admissionDate)} />
          <Detail label="Completion date" value={formatDate(registration.completionDate)} />
          <Detail label="Last updated" value={formatDateTime(registration.updatedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function ActivityTab({ studentId, active }: { studentId: string; active: boolean }) {
  const query = useStudentActivity(studentId, active);
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.data.length === 0) return <EmptyState title="No activity recorded" />;
  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-card shadow-card">
      {query.data.data.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        >
          <span className="text-sm">{item.summary}</span>
          <span className="text-meta shrink-0">
            {item.actor ?? 'System'} · {formatDateTime(item.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Header({ student }: { student: StudentDetail }) {
  const latest = student.registrations[0];
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center">
      <Avatar className="size-14">
        <AvatarFallback className="bg-navy-900 text-lg font-semibold text-white">
          {initials(student.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h1 className="text-page-title break-words text-navy-950">{student.fullName}</h1>
        {latest ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular">{latest.registrationNumber}</span>
            <span>
              {latest.program.code} — {latest.program.name}
            </span>
            <RecordStatus status={latest.status} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No registration</p>
        )}
      </div>
    </div>
  );
}

export function StudentDetailView({ studentId }: { studentId: string }) {
  const query = useStudent(studentId);
  const searchParams = useSearchParams();
  const canEditStudent = useCan(PERMISSIONS.studentsWrite);
  const canEditRegistrations = useCan(PERMISSIONS.registrationsWrite);
  const [tab, setTab] = useState('overview');
  const [personalOpen, setPersonalOpen] = useState(searchParams.get('edit') === 'personal');
  const [registrationDialog, setRegistrationDialog] = useState<{
    open: boolean;
    registration?: Registration;
  }>({ open: false });
  useSetBreadcrumbLabel(query.data?.fullName);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading student">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const student = query.data;
  return (
    <>
      <Header student={student} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">
            Registrations ({student.registrations.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card className="shadow-card">
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-section-title text-navy-950">Personal details</h2>
                {canEditStudent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPersonalOpen(true);
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                    Edit
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Full name" value={student.fullName} />
                <Detail label="Father’s name" value={student.fatherName} />
                <Detail label="Mother’s name" value={student.motherName} />
                <Detail label="Date of birth" value={formatDate(student.dateOfBirth)} />
                <Detail label="Gender" value={student.gender} />
                <Detail label="Record created" value={formatDateTime(student.createdAt)} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="registrations" className="flex flex-col gap-3">
          {canEditRegistrations && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setRegistrationDialog({ open: true });
                }}
              >
                <PlusIcon aria-hidden="true" />
                Add registration
              </Button>
            </div>
          )}
          {student.registrations.length === 0 ? (
            <EmptyState title="No registrations" />
          ) : (
            student.registrations.map((registration) => (
              <RegistrationCard
                key={registration.id}
                registration={registration}
                canEdit={canEditRegistrations}
                onEdit={() => {
                  setRegistrationDialog({ open: true, registration });
                }}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab studentId={student.id} active={tab === 'activity'} />
        </TabsContent>
      </Tabs>
      {canEditStudent && (
        <PersonalDialog open={personalOpen} onOpenChange={setPersonalOpen} student={student} />
      )}
      {canEditRegistrations && (
        <RegistrationDialog
          open={registrationDialog.open}
          registration={registrationDialog.registration}
          studentId={student.id}
          onOpenChange={(open) => {
            setRegistrationDialog((state) => ({ ...state, open }));
          }}
        />
      )}
    </>
  );
}
