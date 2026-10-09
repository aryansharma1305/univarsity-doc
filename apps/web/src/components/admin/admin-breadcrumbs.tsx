'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@docversity/ui/components/breadcrumb';
import { useBreadcrumbLabel } from './breadcrumb-context';
import { SEGMENT_LABELS } from './nav';

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const customLabel = useBreadcrumbLabel();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join('/')}`,
    label:
      SEGMENT_LABELS[`${segments[index - 1] ?? ''}/${segment}`] ??
      SEGMENT_LABELS[segment] ??
      (index === segments.length - 1 && customLabel
        ? customLabel
        : (SEGMENT_LABELS[`${segments[index - 1] ?? ''}/*`] ?? 'Details')),
  }));

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.href}>
              {/* On small screens only the current page is shown, without separators. */}
              {index > 0 && <BreadcrumbSeparator className="hidden sm:block" />}
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden sm:inline-flex'}>
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href as '/admin'}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
