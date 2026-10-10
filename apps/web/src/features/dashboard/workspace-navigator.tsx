'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRightIcon } from 'lucide-react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@docversity/ui/components/tabs';
import { ADMIN_NAV } from '@/components/admin/nav';
import { navGroup } from '@/components/admin/nav-groups';
import { useSessionUser } from '@/components/providers/session-context';

const GROUPS = ['Records', 'Academic', 'Examinations'] as const;

export function WorkspaceNavigator() {
  const user = useSessionUser();
  const links = ADMIN_NAV.filter(
    (item) => !item.permission || user.permissions.includes(item.permission),
  );
  const groups = GROUPS.filter((group) => links.some((item) => navGroup(item.href) === group));
  const [choice, setChoice] = useState<string>('Records');
  const selected = groups.find((group) => group === choice) ?? groups[0];
  const scope = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const layoutId = useId();

  useEffect(() => {
    const root = scope.current;
    if (!root || reduce !== false) return;
    let cancelled = false;
    let revert: (() => void) | undefined;
    // The dashboard's bounded workspace wipe is the only admin GSAP timeline.
    void import('gsap')
      .then(({ gsap }) => {
        if (cancelled) return;
        const context = gsap.context(() => {
          gsap
            .timeline({ defaults: { duration: 0.24, ease: 'power3.out' } })
            .fromTo(
              '[data-workspace-rule]',
              { scaleX: 0, transformOrigin: 'left' },
              { scaleX: 1 },
              0,
            )
            .fromTo(
              '[data-workspace-links]',
              { clipPath: 'inset(0 8% 0 0)' },
              { clipPath: 'inset(0 0% 0 0)' },
              0,
            );
        }, root);
        revert = () => {
          context.revert();
        };
      })
      .catch(() => {
        /* Navigation remains fully usable if the optional motion chunk fails. */
      });
    return () => {
      cancelled = true;
      revert?.();
    };
  }, [selected, reduce]);

  if (!selected) return null;
  return (
    <section
      aria-labelledby="workspace-heading"
      className="overflow-hidden rounded-xl bg-navy-950 text-white"
    >
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="workspace-heading" className="text-section-title text-white">
              Open a workspace
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Academic records, organized around your work.
            </p>
          </div>
          <span className="text-xs text-white/65">Available to your account</span>
        </div>
        <LayoutGroup id={layoutId}>
          <Tabs value={selected} onValueChange={setChoice}>
            <TabsList
              aria-label="Workspace categories"
              className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0"
            >
              {groups.map((group) => (
                <TabsTrigger
                  key={group}
                  value={group}
                  className="relative min-h-10 flex-none rounded-md px-3 text-white/70 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none"
                >
                  {selected === group && (
                    <motion.span
                      layoutId="workspace-choice"
                      aria-hidden="true"
                      initial={false}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                      className="absolute inset-0 rounded-md bg-white/10"
                    />
                  )}
                  <span className="relative">{group}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div ref={scope} className="mt-3">
              <div data-workspace-rule className="h-px bg-white/20" />
              {groups.map((group) => (
                <TabsContent key={group} value={group} className="mt-3">
                  <ul data-workspace-links className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
                    {links
                      .filter((item) => navGroup(item.href) === group)
                      .map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className="group flex min-h-12 items-center gap-3 rounded-md px-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-brand-accent"
                          >
                            <item.icon
                              aria-hidden="true"
                              className="size-[18px] shrink-0 text-white/65"
                            />
                            <span className="flex-1">{item.label}</span>
                            <ArrowUpRightIcon
                              aria-hidden="true"
                              className="size-4 text-white/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                            />
                          </Link>
                        </li>
                      ))}
                  </ul>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </LayoutGroup>
      </div>
    </section>
  );
}
