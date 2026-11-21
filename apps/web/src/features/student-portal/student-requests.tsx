import Link from 'next/link';
import type { StudentProfileRequest } from '@docversity/validation';
import { ArrowRightIcon } from 'lucide-react';
import { QueryProvider } from '@/components/providers/query-provider';
import { StudentCertificateApplications } from '@/features/certificate-requests/views';
import { PageIntro } from './portal-ui';
import { ProfileRequestList } from './student-pages';

/** My Requests: the existing profile-update and certificate request lists in one place. */
export function StudentRequests({ requests }: { requests: StudentProfileRequest[] | null }) {
  return (
    <>
      <PageIntro title="My Requests" />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="profile-requests-heading" className="flex flex-col gap-4">
          <h2 id="profile-requests-heading" className="text-lg font-semibold text-navy-950">
            Profile update requests
          </h2>
          <ProfileRequestList requests={requests} />
        </section>
        <QueryProvider>
          <StudentCertificateApplications />
        </QueryProvider>
        <Link
          href="/student/examinations/re-exam/applications"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded text-sm font-medium text-brand hover:underline"
        >
          Re-exam applications <ArrowRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </>
  );
}
