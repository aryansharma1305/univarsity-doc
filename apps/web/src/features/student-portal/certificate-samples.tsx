import { DownloadIcon, ExternalLinkIcon, FileBadgeIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';
import type { StudentRegistrationEligibilityV1 } from '@docversity/validation';
import { CourseCertificateSamples } from './course-certificate-samples';
import { PortalCard } from './portal-ui';
import { StudentActionMotion } from './student-motion';

const sampleFile = '/api/v1/student/certificate-samples/sample-training-v1/file';

/** No student props: the sample is the same fixed fictional document for every student. */
export function StudentCertificateSamples({
  courseSamples = null,
}: {
  /** Phase 12C.1: the student's registrations with their course offerings; null when unavailable. */
  courseSamples?: StudentRegistrationEligibilityV1[] | null;
}) {
  return (
    <div
      id="certificate-samples"
      tabIndex={-1}
      className="mb-6 scroll-mt-6 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <StudentActionMotion>
        <PortalCard title="View Sample Certificate" icon={FileBadgeIcon}>
          <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
            <div>
              <h3 className="text-lg font-semibold text-navy-950">Training Certificate</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                An illustrative certificate layout with fictional details and unsigned signatures.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-navy-950">
                This is a sample certificate for reference only. Your final certificate may vary
                according to your course and the university&apos;s approved format.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild className="min-h-11">
                  <a
                    href={`${sampleFile}?disposition=inline`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Preview Sample (opens in a new tab)"
                  >
                    <ExternalLinkIcon aria-hidden="true" />
                    Preview Sample
                  </a>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <a href={`${sampleFile}?disposition=attachment`}>
                    <DownloadIcon aria-hidden="true" />
                    Download Sample PDF
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Watermarked PDF · Fictional details only · Preview opens in a new tab
              </p>
            </div>
            <div className="border-t border-border pt-4 lg:border-t-0 lg:pt-0">
              <h3 className="font-semibold text-navy-950">Illustrative only</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Not an issued certificate.</li>
                <li>Not valid for verification.</li>
                <li>Does not indicate course completion.</li>
                <li>Does not guarantee eligibility or issuance.</li>
              </ul>
              <p className="mt-4 text-sm font-medium text-navy-950">Other sample formats</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Academic certificate samples for your own courses are listed below. The Training
                Certificate is not their official format.
              </p>
            </div>
          </div>
          <section
            aria-labelledby="course-samples-heading"
            className="mt-6 border-t border-border pt-5"
          >
            <h3 id="course-samples-heading" className="text-lg font-semibold text-navy-950">
              Samples for your courses
            </h3>
            <CourseCertificateSamples registrations={courseSamples} />
          </section>
        </PortalCard>
      </StudentActionMotion>
    </div>
  );
}
