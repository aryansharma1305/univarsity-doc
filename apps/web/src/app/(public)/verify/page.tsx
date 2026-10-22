import type { Metadata } from 'next';
import { VerificationPanel } from '@/features/public-verification/verification-panel';
export const metadata: Metadata = {
  title: 'Verification services',
  robots: { index: false, follow: false },
};
export default function VerificationServicesPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-4xl leading-tight font-semibold tracking-tight text-navy-950 sm:text-5xl">
        Verify. Trust. Confirm.
      </h1>
      <p className="mt-4 mb-8 max-w-2xl text-base leading-7 text-muted-foreground">
        Choose a service below. Public verification remains unavailable while university publication
        and disclosure policies are being established.
      </p>
      <VerificationPanel />
    </section>
  );
}
