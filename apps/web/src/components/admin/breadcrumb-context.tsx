'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

type Setter = (label: string | null) => void;
const LabelContext = createContext<{ label: string | null; setLabel: Setter }>({
  label: null,
  setLabel: () => undefined,
});

export function BreadcrumbLabelProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | null>(null);
  return <LabelContext.Provider value={{ label, setLabel }}>{children}</LabelContext.Provider>;
}

export function useBreadcrumbLabel(): string | null {
  return useContext(LabelContext).label;
}

/** Lets a detail page name the last breadcrumb (e.g. the student's name) instead of "Details". */
export function useSetBreadcrumbLabel(label: string | null | undefined): void {
  const { setLabel } = useContext(LabelContext);
  useEffect(() => {
    setLabel(label ?? null);
    return () => {
      setLabel(null);
    };
  }, [label, setLabel]);
}
