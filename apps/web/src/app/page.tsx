import type { Metadata } from 'next';
import { MOTION_GUARD } from '@/features/public-verification/motion-guard';
import { VerificationHome } from '@/features/public-verification/verification-home';

const TITLE = 'Docversity | Verification';
const DESCRIPTION =
  'The student portal for your academic records, documents and examination services. Public verification of results, registrations and certificates is not available yet.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL ?? 'http://localhost:3000'),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Docversity',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function HomePage() {
  return (
    <>
      {/* Runs before paint; see MOTION_GUARD. Hides only the hero words while GSAP loads. */}
      <script dangerouslySetInnerHTML={{ __html: MOTION_GUARD }} />
      <VerificationHome year={new Date().getFullYear()} />
    </>
  );
}
