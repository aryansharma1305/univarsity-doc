'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** App-wide toast outlet. Light theme only (Docversity has no dark mode in this phase). */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{ classNames: { toast: 'font-sans' } }}
      {...props}
    />
  );
}

export { Toaster };
