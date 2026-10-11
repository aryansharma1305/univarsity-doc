'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@docversity/ui/components/button';

export function StudentResultsRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
      disabled={pending}
      className="min-h-11"
    >
      <RefreshCwIcon aria-hidden="true" />
      {pending ? 'Trying again…' : 'Try again'}
    </Button>
  );
}
