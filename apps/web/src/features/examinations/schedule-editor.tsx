'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import { Input } from '@docversity/ui/components/input';
import type { ExaminationSchedule } from '@docversity/validation';
import { ErrorState, TableSkeleton } from '@/components/data/states';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { examinationsApi } from './api';

interface Draft {
  programSubjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  venue: string;
}

const toDrafts = (schedule: ExaminationSchedule): Record<string, Draft> =>
  Object.fromEntries(
    schedule.items.map((item) => [item.programSubjectId, { ...item, venue: item.venue ?? '' }]),
  );

/**
 * Subject-wise timetable for one examination: dates, local times and venue per subject of the
 * examination period. Students see it only after publication, while the examination is open.
 */
export function ScheduleEditor({
  examinationId,
  canManage,
}: {
  examinationId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const key = ['examinations', examinationId, 'schedule'];
  const query = useQuery({ queryKey: key, queryFn: () => examinationsApi.schedule(examinationId) });
  const [drafts, setDrafts] = useState<Record<string, Draft> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const done = async (schedule: ExaminationSchedule, message: string) => {
    client.setQueryData(key, schedule);
    await client.invalidateQueries({ queryKey: ['examinations', examinationId] });
    setDrafts(null);
    setErrors({});
    toast.success(message);
  };
  const save = useMutation({
    mutationFn: (items: Draft[]) =>
      examinationsApi.saveSchedule(examinationId, {
        items: items.map((item) => ({ ...item, venue: item.venue.trim() || null })),
      }),
    onSuccess: (schedule) => done(schedule, 'Timetable saved.'),
    onError: (caught, items) => {
      if (caught instanceof ApiError && caught.details.length) {
        setErrors(
          Object.fromEntries(
            caught.details.map((detail) => {
              const index = Number(detail.path.split('.')[1]);
              return [items[index]?.programSubjectId ?? 'form', detail.message];
            }),
          ),
        );
      } else setErrors({ form: errorMessage(caught) });
    },
  });
  const publish = useMutation({
    mutationFn: (value: boolean) => examinationsApi.publishSchedule(examinationId, value),
    onSuccess: (schedule) =>
      done(
        schedule,
        schedule.publishedAt ? 'Timetable published to students.' : 'Timetable withdrawn.',
      ),
    onError: (caught) => {
      setErrors({ form: errorMessage(caught) });
    },
  });

  if (query.isPending) return <TableSkeleton rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const schedule = query.data;
  const editing = drafts !== null;
  const rows = drafts ?? toDrafts(schedule);
  const readOnly = !canManage || schedule.status === 'ARCHIVED';
  const set = (id: string, field: keyof Draft, value: string) => {
    setDrafts({
      ...rows,
      [id]: {
        ...(rows[id] ?? {
          programSubjectId: id,
          examDate: '',
          startTime: '',
          endTime: '',
          venue: '',
        }),
        [field]: value,
      },
    });
  };

  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-section-title text-navy-950">Timetable</h2>
            <p className="text-sm text-muted-foreground">
              {schedule.publishedAt
                ? `Published to students ${formatDateTime(schedule.publishedAt)}. Changes are visible at once.`
                : 'Not published. Students cannot see it yet.'}
            </p>
          </div>
          {!readOnly && !editing && (
            <div className="flex flex-wrap gap-2">
              {schedule.publishedAt ? (
                <Button
                  variant="outline"
                  disabled={publish.isPending}
                  onClick={() => {
                    publish.mutate(false);
                  }}
                >
                  Withdraw from students
                </Button>
              ) : (
                <Button
                  disabled={
                    publish.isPending || schedule.items.length === 0 || schedule.status !== 'OPEN'
                  }
                  onClick={() => {
                    publish.mutate(true);
                  }}
                >
                  Publish timetable
                </Button>
              )}
            </div>
          )}
        </div>
        {!readOnly && !schedule.publishedAt && schedule.status !== 'OPEN' && (
          <p className="text-sm text-muted-foreground">
            Open the examination before publishing its timetable.
          </p>
        )}
        {schedule.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This examination has no curriculum subjects to schedule.
          </p>
        ) : (
          <div
            // Keyboard users must be able to scroll the table (axe scrollable-region-focusable).
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            role="region"
            aria-label="Timetable by subject"
            className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-brand"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Timetable by subject</caption>
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Subject
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Start
                  </th>
                  <th scope="col" className="px-3 py-2">
                    End
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Venue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedule.subjects.map((subject) => {
                  const row = rows[subject.programSubjectId];
                  const label = `${subject.code} ${subject.name}`;
                  const error = errors[subject.programSubjectId];
                  return (
                    <tr key={subject.programSubjectId} className="align-top">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <span className="font-medium">{subject.code}</span> {subject.name}
                        {error && (
                          <span role="alert" className="block text-xs text-destructive">
                            {error}
                          </span>
                        )}
                      </th>
                      {editing ? (
                        (['examDate', 'startTime', 'endTime', 'venue'] as const).map((field) => (
                          <td key={field} className="px-3 py-2">
                            <Input
                              aria-label={`${label} ${field === 'examDate' ? 'date' : field === 'startTime' ? 'start time' : field === 'endTime' ? 'end time' : 'venue'}`}
                              type={
                                field === 'examDate' ? 'date' : field === 'venue' ? 'text' : 'time'
                              }
                              maxLength={field === 'venue' ? 200 : undefined}
                              className="h-9 min-w-28"
                              value={row?.[field] ?? ''}
                              onChange={(event) => {
                                set(subject.programSubjectId, field, event.target.value);
                              }}
                            />
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row ? formatDate(row.examDate) : 'Not scheduled'}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{row?.startTime ?? '—'}</td>
                          <td className="px-3 py-2 tabular-nums">{row?.endTime ?? '—'}</td>
                          <td className="px-3 py-2">{row && row.venue !== '' ? row.venue : '—'}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        {!readOnly && schedule.subjects.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  disabled={save.isPending}
                  onClick={() => {
                    // Subjects without a date are left unscheduled.
                    save.mutate(Object.values(rows).filter((row) => row.examDate));
                  }}
                >
                  Save timetable
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDrafts(null);
                    setErrors({});
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setDrafts(toDrafts(schedule));
                }}
              >
                Edit timetable
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-foreground/80">
          Times are the university’s local time. The examination itself is conducted in the
          university’s examination application.
        </p>
      </CardContent>
    </Card>
  );
}
