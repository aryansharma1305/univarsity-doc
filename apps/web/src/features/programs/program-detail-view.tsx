'use client';

import Link from 'next/link';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Skeleton } from '@docversity/ui/components/skeleton';
import { type CurriculumSummary, periodUnit } from '@docversity/validation';
import { useSetBreadcrumbLabel } from '@/components/admin/breadcrumb-context';
import { EmptyState, ErrorState } from '@/components/data/states';
import { RecordStatus } from '@/components/data/status';
import { useCan } from '@/components/providers/session-context';
import { useCurricula } from '@/features/curricula/api';
import { CurriculumDialog } from '@/features/curricula/curriculum-dialog';
import {
  CURRICULUM_STATUS,
  STRUCTURE_LABELS,
  durationLabel,
  structureLabel,
} from '@/features/curricula/labels';
import { formatDate } from '@/lib/format';
import { useProgram } from './api';
import { ProgramDialog } from './program-dialog';

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className="text-sm break-words text-navy-950">
        {value && value.length > 0 ? value : '—'}
      </dd>
    </div>
  );
}

function effective(version: CurriculumSummary): string {
  if (!version.effectiveFrom && !version.effectiveTo) return 'No dates set';
  return `${version.effectiveFrom ? formatDate(version.effectiveFrom) : 'Open'} – ${
    version.effectiveTo ? formatDate(version.effectiveTo) : 'open'
  }`;
}

export function ProgramDetailView({ programId }: { programId: string }) {
  const canEdit = useCan(PERMISSIONS.programsWrite);
  const canWriteCurricula = useCan(PERMISSIONS.curriculaWrite);
  const program = useProgram(programId);
  const curricula = useCurricula(programId);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  useSetBreadcrumbLabel(program.data ? program.data.name : null);

  if (program.isPending) return <Skeleton className="h-96 w-full" />;
  if (program.isError) {
    return <ErrorState error={program.error} onRetry={() => void program.refetch()} />;
  }
  const course = program.data;
  const versions = curricula.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0 shadow-card">
        <CardContent className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-meta">{course.code}</p>
              <h1 className="text-page-title break-words text-navy-950">{course.name}</h1>
              {course.description && (
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{course.description}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RecordStatus status={course.status} />
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <PencilIcon aria-hidden="true" />
                  Edit course
                </Button>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Course type" value={course.level} />
            <Detail
              label="Department / school"
              value={
                course.department ? `${course.department.code} — ${course.department.name}` : null
              }
            />
            <Detail
              label="Duration"
              value={durationLabel(course.durationValue, course.durationUnit)}
            />
            <Detail label="Academic structure" value={structureLabel(course) ?? 'Not set'} />
            <Detail label="Registrations" value={String(course.registrationCount)} />
            <Detail label="Curriculum versions" value={String(course.curriculumCount)} />
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="versions-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="versions-heading" className="text-section-title text-navy-950">
              Curriculum versions
            </h2>
            <p className="text-sm text-muted-foreground">
              Drafts are editable. Active versions are read-only and can be assigned to students;
              archived versions stay readable for historical records.
            </p>
          </div>
          {canWriteCurricula && (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              New version
            </Button>
          )}
        </div>
        {curricula.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : curricula.isError ? (
          <ErrorState error={curricula.error} onRetry={() => void curricula.refetch()} />
        ) : versions.length === 0 ? (
          <EmptyState
            title="No curriculum versions yet"
            description="Create a version, add subjects to each semester or year, then activate it."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {versions.map((version) => (
              <li key={version.id}>
                <Link
                  href={`/admin/programs/${course.id}/curricula/${version.id}`}
                  className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition hover:border-brand/40 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={`Open curriculum ${version.versionCode} — ${version.name}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-words text-navy-950">
                        {version.versionCode} · {version.name}
                      </p>
                      <p className="text-meta">
                        {STRUCTURE_LABELS[version.structureType]} ·{' '}
                        {periodUnit(version.structureType, version.numberOfPeriods)}
                      </p>
                    </div>
                    <StatusBadge tone={CURRICULUM_STATUS[version.status].tone}>
                      {CURRICULUM_STATUS[version.status].label}
                    </StatusBadge>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <Detail label="Subjects" value={String(version.subjectCount)} />
                    <Detail label="Students" value={String(version.registrationCount)} />
                    <Detail label="Effective" value={effective(version)} />
                  </dl>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProgramDialog open={editing} onOpenChange={setEditing} program={course} />
      <CurriculumDialog
        open={creating}
        onOpenChange={setCreating}
        program={course}
        versions={versions}
      />
    </div>
  );
}
