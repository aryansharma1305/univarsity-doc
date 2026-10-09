'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PERMISSIONS } from '@docversity/types';
import { StatusBadge } from '@docversity/ui';
import { Button } from '@docversity/ui/components/button';
import { Card, CardContent } from '@docversity/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@docversity/ui/components/dialog';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  type CreateReExamFeeRuleInput,
  createReExamFeeRuleSchema,
  formatMoney,
  RE_EXAM_ATTEMPT_BASIS_LABEL,
  RE_EXAM_FEE_SCOPE_LABELS,
  RE_EXAM_FEE_SCOPES,
  type ReExamFeeRule,
} from '@docversity/validation';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data/states';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';
import { useCan } from '@/components/providers/session-context';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { reExamsApi, useFeeRules, useReExamMutation } from './api';

const SCOPE_OPTIONS = RE_EXAM_FEE_SCOPES.map((value) => ({
  value,
  label: RE_EXAM_FEE_SCOPE_LABELS[value],
}));

const RULE_TONE = { DRAFT: 'warning', ACTIVE: 'success', RETIRED: 'neutral' } as const;

function CreateRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<CreateReExamFeeRuleInput>({
    resolver: zodResolver(createReExamFeeRuleSchema),
    defaultValues: {
      scope: '' as CreateReExamFeeRuleInput['scope'],
      currency: 'INR',
      rates: [{ attemptNumber: 1, amount: '' }],
      note: '',
    },
  });
  const rates = useFieldArray({ control: form.control, name: 'rates' });
  const create = useReExamMutation(reExamsApi.createFeeRule);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(createReExamFeeRuleSchema.parse(values));
      toast.success('Fee rule saved as a draft. Activate it to apply it to new applications.');
      onOpenChange(false);
      form.reset();
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New fee rule version</DialogTitle>
          <DialogDescription>
            Enter only amounts the university has approved. Attempts without an amount have no fee —
            students with such an attempt cannot start payment. Choose the scope the university
            confirmed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-4">
          <SelectField
            control={form.control}
            name="scope"
            label="Fee is charged"
            options={SCOPE_OPTIONS}
            required
          />
          <Field control={form.control} name="currency" label="Currency (ISO code)" required>
            {(aria) => <Input {...aria} maxLength={3} {...form.register('currency')} />}
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-navy-950">Fee per re-exam attempt</legend>
            {rates.fields.map((rate, index) => (
              <div key={rate.id} className="flex items-end gap-2">
                <Field
                  control={form.control}
                  name={`rates.${index}.amount`}
                  label={`Attempt ${String(index + 1)} amount`}
                  hint="Major units, e.g. 1000 or 1000.00"
                  required
                >
                  {(aria) => (
                    <Input
                      {...aria}
                      inputMode="decimal"
                      {...form.register(`rates.${index}.amount`)}
                    />
                  )}
                </Field>
                {index > 0 && index === rates.fields.length - 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Remove attempt ${String(index + 1)}`}
                    onClick={() => {
                      rates.remove(index);
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={rates.fields.length >= 10}
              onClick={() => {
                rates.append({ attemptNumber: rates.fields.length + 1, amount: '' });
              }}
            >
              <PlusIcon aria-hidden="true" />
              Add attempt {rates.fields.length + 1}
            </Button>
          </fieldset>
          <Field control={form.control} name="note" label="Note (e.g. approval reference)">
            {(aria) => <Textarea {...aria} rows={2} maxLength={1000} {...form.register('note')} />}
          </Field>
          <p className="text-xs text-foreground/80">
            Attempts are counted as: {RE_EXAM_ATTEMPT_BASIS_LABEL}.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Working…' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RuleCard({ rule, canManage }: { rule: ReExamFeeRule; canManage: boolean }) {
  const [confirm, setConfirm] = useState<'activate' | 'retire' | null>(null);
  const run = useReExamMutation((which: 'activate' | 'retire') =>
    which === 'activate' ? reExamsApi.activateFeeRule(rule.id) : reExamsApi.retireFeeRule(rule.id),
  );
  return (
    <Card className="gap-0 py-0 shadow-card">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-section-title text-navy-950">Version {rule.version}</h2>
            <p className="text-meta">
              {RE_EXAM_FEE_SCOPE_LABELS[rule.scope]} · {rule.currency} · created{' '}
              {formatDateTime(rule.createdAt)}
              {rule.createdBy ? ` by ${rule.createdBy.displayName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={RULE_TONE[rule.status]}>{rule.status.toLowerCase()}</StatusBadge>
            {canManage && rule.status === 'DRAFT' && (
              <Button
                size="sm"
                onClick={() => {
                  setConfirm('activate');
                }}
              >
                Activate
              </Button>
            )}
            {canManage && rule.status !== 'RETIRED' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirm('retire');
                }}
              >
                Retire
              </Button>
            )}
          </div>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label={`Fees of version ${String(rule.version)}`}>
          {rule.rates.map((rate) => (
            <li
              key={rate.attemptNumber}
              className="rounded-md border border-border px-2.5 py-1 text-sm"
            >
              Attempt {rate.attemptNumber}: {formatMoney(rate.amountMinor, rule.currency)}
            </li>
          ))}
          <li className="rounded-md border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground">
            Attempt {rule.rates.length + 1}+: no approved fee
          </li>
        </ul>
        {rule.note && <p className="text-sm text-navy-950">{rule.note}</p>}
        <Dialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConfirm(null);
              run.reset();
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {confirm === 'activate'
                  ? `Activate version ${String(rule.version)}?`
                  : `Retire version ${String(rule.version)}?`}
              </DialogTitle>
              <DialogDescription>
                {confirm === 'activate'
                  ? 'New applications will be assessed with these amounts; the current active version is retired. Existing applications keep the amount they were assessed with. Active rules cannot be edited.'
                  : 'Without an active rule, new applications cannot be assessed and payment cannot start.'}
              </DialogDescription>
            </DialogHeader>
            {run.error && (
              <p role="alert" className="text-sm text-danger-text">
                {errorMessage(run.error)}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirm(null);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={run.isPending}
                onClick={() => {
                  if (!confirm) return;
                  run.mutate(confirm, {
                    onSuccess: () => {
                      toast.success(
                        confirm === 'activate' ? 'Fee rule activated.' : 'Fee rule retired.',
                      );
                      setConfirm(null);
                    },
                  });
                }}
              >
                {run.isPending ? 'Working…' : confirm === 'activate' ? 'Activate' : 'Retire'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function FeeRulesView() {
  const query = useFeeRules();
  const canManage = useCan(PERMISSIONS.reExamFeesManage);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Re-exam fee rules"
        description="Versioned fee schedules. Each application records the version and amount it was assessed with."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              New version
            </Button>
          )
        }
      />
      {query.isPending ? (
        <TableSkeleton rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          title="No fee rules yet"
          description="Until a rule is active, applications are recorded with “fee not configured” and payment cannot start."
        />
      ) : (
        <div className="grid gap-4">
          {query.data.data.map((rule) => (
            <RuleCard key={rule.id} rule={rule} canManage={canManage} />
          ))}
        </div>
      )}
      {canManage && <CreateRuleDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}
