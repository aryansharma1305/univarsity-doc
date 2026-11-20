import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { MOTION_GUARD } from '@/features/public-verification/motion-guard';
import { VerificationHome } from '@/features/public-verification/verification-home';

const TITLE = 'Docversity | Verification';
const DESCRIPTION =
  'Academic verification portal. Record checks depend on university approval; student sign-in protects private records.';

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

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      {/* Runs before paint; see MOTION_GUARD. Hides only the hero words while GSAP loads. */}
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTION_GUARD }} />
      <VerificationHome year={new Date().getFullYear()} />
    </>
  );
}
