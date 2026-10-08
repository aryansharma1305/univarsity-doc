import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '@docversity/ui/components/sonner';
import '@/styles/globals.css';

// next/font downloads the fonts at build time and serves them from this app (no runtime CDN).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Docversity', template: '%s — Docversity' },
  description: 'Academic Verification & Records Portal',
  // Not launched yet — keep out of search indexes until go-live.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#03142F' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      {/*
        Browser extensions (e.g. Grammarly adds data-gr-ext-installed / data-new-gr-c-s-check-loaded)
        modify <body> attributes before React hydrates. suppressHydrationWarning only ignores
        attribute differences on this one element — mismatches anywhere inside the app are still reported.
      */}
      <body className="min-h-screen" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
