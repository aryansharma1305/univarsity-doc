import { PublicHeader } from '@/components/public/public-header';
import { VerificationPanel } from './verification-panel';

/** Admission verification is the default entry; other lookups remain in the public header. */
export function VerificationHome() {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <PublicHeader />
      <main id="main" tabIndex={-1} className="flex-1">
        <VerificationPanel service="admission-letter" />
      </main>
    </div>
  );
}
