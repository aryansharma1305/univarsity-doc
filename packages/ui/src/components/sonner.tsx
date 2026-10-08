'use client';

import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Sonner's rich colours, mapped to Docversity's status tokens. Sonner's own success/error text
 * colours fall just below WCAG AA contrast on their tinted backgrounds; these tokens meet it.
 */
const STATUS_COLOURS = {
  '--success-bg': 'var(--color-success-soft)',
  '--success-text': 'var(--color-success-text)',
  '--success-border': 'var(--color-success-soft)',
  '--error-bg': 'var(--color-danger-soft)',
  '--error-text': 'var(--color-danger-text)',
  '--error-border': 'var(--color-danger-soft)',
  '--warning-bg': 'var(--color-warning-soft)',
  '--warning-text': 'var(--color-warning-text)',
  '--warning-border': 'var(--color-warning-soft)',
} as CSSProperties;

/** App-wide toast outlet. Light theme only (Docversity has no dark mode in this phase). */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      richColors
      closeButton
      position="bottom-right"
      style={STATUS_COLOURS}
      toastOptions={{ classNames: { toast: 'font-sans' } }}
      {...props}
    />
  );
}

export { Toaster };
