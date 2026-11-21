import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
export default function Layout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
