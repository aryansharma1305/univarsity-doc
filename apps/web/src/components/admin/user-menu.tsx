'use client';

import { useRouter } from 'next/navigation';
import { LogOutIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@docversity/ui/components/avatar';
import { Button } from '@docversity/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@docversity/ui/components/dropdown-menu';
import { toast } from 'sonner';
import { useSessionUser } from '@/components/providers/session-context';
import { apiRequest, resetApiClient } from '@/lib/api';
import { okResponseSchema } from '@docversity/validation';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}

export function UserMenu() {
  const user = useSessionUser();
  const router = useRouter();

  async function signOut() {
    try {
      await apiRequest('POST', 'auth/logout', okResponseSchema);
    } catch {
      toast.error('Sign-out could not be confirmed. Close the browser to be safe.');
    } finally {
      resetApiClient();
      router.replace('/admin/login');
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 px-2"
          aria-label={`Account menu for ${user.displayName}`}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-navy-900 text-xs font-semibold text-white">
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium md:inline">
            {user.displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user.displayName}</span>
          <span
            className="truncate text-xs font-normal text-muted-foreground"
            data-testid="account-email"
          >
            {user.email}
          </span>
          <span className="text-xs font-normal text-muted-foreground" data-testid="account-roles">
            {user.roles.length > 0 ? user.roles.join(', ') : 'No roles'}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
