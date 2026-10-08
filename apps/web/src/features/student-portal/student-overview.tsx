import type { StudentMe } from '@docversity/validation';
import { Card, CardContent, CardHeader, CardTitle } from '@docversity/ui/components/card';
import { RecordStatus } from '@/components/data/status';
import { formatDate } from '@/lib/format';

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-meta">{label}</dt>
      <dd className="break-words text-navy-950">{value}</dd>
    </div>
  );
}

/** The signed-in student's own record. Read-only: corrections go through the university. */
export function StudentOverview({ me }: { me: StudentMe }) {
  const { student, registrations } = me;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title text-navy-950">Welcome, {student.fullName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your records as held by the university. Results and documents appear here once the
          university publishes them.
        </p>
      </div>

      <section aria-labelledby="registrations-heading" className="flex flex-col gap-3">
        <h2 id="registrations-heading" className="text-section-title text-navy-950">
          Your registrations
        </h2>
        <ul className="grid gap-4 md:grid-cols-2">
          {registrations.map((registration) => (
            <li key={registration.id}>
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <CardTitle>
                    <h3 className="text-card-title break-all text-navy-950">
                      {registration.registrationNumber}
                    </h3>
                  </CardTitle>
                  <RecordStatus status={registration.status} />
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <Item
                      label="Program"
                      value={`${registration.program.name} (${registration.program.code})`}
                    />
                    <Item label="Academic session" value={registration.academicSession.name} />
                    {registration.department && (
                      <Item label="Department" value={registration.department.name} />
                    )}
                    {registration.rollReferenceNumber && (
                      <Item
                        label="Roll / reference number"
                        value={registration.rollReferenceNumber}
                      />
                    )}
                    <Item label="Admission date" value={formatDate(registration.admissionDate)} />
                    {registration.completionDate && (
                      <Item
                        label="Completion date"
                        value={formatDate(registration.completionDate)}
                      />
                    )}
                  </dl>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="profile-heading">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>
              <h2 id="profile-heading" className="text-card-title text-navy-950">
                Personal details
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item label="Full name" value={student.fullName} />
              {student.fatherName && <Item label="Father’s name" value={student.fatherName} />}
              {student.motherName && <Item label="Mother’s name" value={student.motherName} />}
              <Item
                label="Date of birth"
                value={student.dateOfBirth ? formatDate(student.dateOfBirth) : 'Not on record'}
              />
              <Item label="Photo" value={student.hasPhoto ? 'On record' : 'Not on record'} />
            </dl>
            {(!student.dateOfBirth || !student.hasPhoto) && (
              <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-navy-950">
                Your date of birth or photo is not on record yet. Submitting them through the portal
                is coming soon; until then, contact the registrar’s office.
              </p>
            )}
            <p className="text-meta">
              To correct any of these details, contact the registrar’s office. You cannot change
              official records here.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
