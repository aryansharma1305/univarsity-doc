import type { Metadata } from 'next';
import { VerificationHome } from '@/features/public-verification/verification-home';

const TITLE = 'Docversity | Verification';
const DESCRIPTION =
  'Explore result checking, registration, certificate and admission letter verification. Public verification is not available yet.';

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
  return <VerificationHome year={new Date().getFullYear()} />;
}
