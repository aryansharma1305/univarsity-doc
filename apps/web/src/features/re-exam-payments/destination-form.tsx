'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button } from '@docversity/ui/components/button';
import { Input } from '@docversity/ui/components/input';
import { Textarea } from '@docversity/ui/components/textarea';
import {
  createPaymentDestinationSchema,
  currencyMinorDigits,
  isKnownCurrency,
  isRegionGroup,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_REGION_LABELS,
  PAYMENT_REGIONS,
  type PaymentDestination,
  type PaymentRegion,
  updatePaymentDestinationSchema,
} from '@docversity/validation';
import { Field, SelectField } from '@/components/forms/fields';
import { applyServerErrors } from '@/components/forms/server-errors';

export interface DestinationFormValues {
  region: PaymentRegion | '';
  countryName: string;
  beneficiaryName: string;
  method: string;
  currency: string;
  instructions: string;
  evidenceRequirement: string;
  effectiveFrom: string;
  effectiveUntil: string;
  rates: { attemptNumber: number; amount: string }[];
}

/** `<input type="datetime-local">` value in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export function minorToMajor(amountMinor: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  return digits === 0 ? String(amountMinor) : (amountMinor / 10 ** digits).toFixed(digits);
}

export function defaultsFrom(
  destination: PaymentDestination | null,
  region: PaymentRegion | '' = '',
): DestinationFormValues {
  return destination
    ? {
        region: destination.region,
        countryName: destination.countryName ?? '',
        beneficiaryName: destination.beneficiaryName,
        method: destination.method,
        currency: destination.currency,
        instructions: destination.instructions,
        evidenceRequirement: destination.evidenceRequirement,
        effectiveFrom: toLocalInput(destination.effectiveFrom),
        effectiveUntil: toLocalInput(destination.effectiveUntil),
        rates: destination.rates.map((rate) => ({
          attemptNumber: rate.attemptNumber,
          amount: minorToMajor(rate.amountMinor, destination.currency),
        })),
      }
    : {
        region,
        countryName: '',
        beneficiaryName: '',
        method: '',
        currency: 'INR',
        instructions: '',
        evidenceRequirement: 'OPTIONAL',
        effectiveFrom: toLocalInput(new Date().toISOString()),
        effectiveUntil: '',
        rates: [],
      };
}

const REGION_OPTIONS = PAYMENT_REGIONS.map((value) => ({
  value,
  label: PAYMENT_REGION_LABELS[value],
}));
const METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));
const EVIDENCE_OPTIONS = [
  { value: 'OPTIONAL', label: 'Optional — students may attach a receipt' },
  { value: 'REQUIRED', label: 'Required — students must attach a receipt' },
];

/**
 * Draft form for payment details (create or edit). Validates with the shared contract before
 * sending; the API re-validates and decides. Amounts are only asked for a currency other than the
 * active fee rule's — those come from the fee rule and are never converted.
 */
export function DestinationForm({
  mode,
  initial,
  feeCurrency,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  initial: DestinationFormValues;
  feeCurrency: string | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const form = useForm<DestinationFormValues>({ defaultValues: initial });
  const rates = useFieldArray({ control: form.control, name: 'rates' });
  const region = useWatch({ control: form.control, name: 'region' });
  const currency = useWatch({ control: form.control, name: 'currency' }).trim().toUpperCase();
  const needsRates = isKnownCurrency(currency) && currency !== (feeCurrency ?? 'INR');

  const submit = form.handleSubmit(async (values) => {
    const payload: Record<string, unknown> = {
      ...(mode === 'create' ? { region: values.region } : {}),
      countryName: values.countryName,
      beneficiaryName: values.beneficiaryName,
      method: values.method,
      currency: values.currency,
      instructions: values.instructions,
      evidenceRequirement: values.evidenceRequirement,
      effectiveFrom: fromLocalInput(values.effectiveFrom) ?? '',
      effectiveUntil: fromLocalInput(values.effectiveUntil),
      rates: needsRates ? values.rates : [],
    };
    const schema =
      mode === 'create' ? createPaymentDestinationSchema : updatePaymentDestinationSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        form.setError(issue.path.join('.') as keyof DestinationFormValues, {
          message: issue.message,
        });
      }
      return;
    }
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
      {mode === 'create' && (
        <SelectField
          control={form.control}
          name="region"
          label="Country / region"
          options={REGION_OPTIONS}
          required
        />
      )}
      {region !== '' && isRegionGroup(region) && (
        <Field
          control={form.control}
          name="countryName"
          label="Specific country or area (optional)"
          hint="Only if these details apply to part of the group, e.g. one country."
        >
          {(aria) => <Input {...aria} maxLength={100} {...form.register('countryName')} />}
        </Field>
      )}
      <Field
        control={form.control}
        name="beneficiaryName"
        label="Beneficiary / payee name shown to students"
        required
      >
        {(aria) => <Input {...aria} maxLength={200} {...form.register('beneficiaryName')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="method"
          label="Payment method"
          options={METHOD_OPTIONS}
          required
        />
        <Field control={form.control} name="currency" label="Currency (ISO code)" required>
          {(aria) => <Input {...aria} maxLength={3} {...form.register('currency')} />}
        </Field>
      </div>
      {needsRates ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium text-navy-950">
            Approved amount per re-exam attempt in {currency}
          </legend>
          <p className="text-xs text-foreground/80">
            Enter only amounts the university approved in {currency}. Nothing is converted from{' '}
            {feeCurrency ?? 'INR'}. Students whose attempt has no amount here cannot pay with these
            details.
          </p>
          {rates.fields.map((rate, index) => (
            <div key={rate.id} className="flex items-end gap-2">
              <Field
                control={form.control}
                name={`rates.${index}.amount`}
                label={`Attempt ${String(index + 1)} amount`}
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
              {index === rates.fields.length - 1 && (
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
      ) : (
        <p className="text-xs text-foreground/80">
          Amounts in {feeCurrency ?? 'INR'} come from the active re-exam fee rule (each student’s
          assessed fee).
        </p>
      )}
      <Field
        control={form.control}
        name="instructions"
        label="Payment instructions shown to students"
        required
      >
        {(aria) => (
          <Textarea {...aria} rows={4} maxLength={2000} {...form.register('instructions')} />
        )}
      </Field>
      <SelectField
        control={form.control}
        name="evidenceRequirement"
        label="Payment receipt"
        options={EVIDENCE_OPTIONS}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field control={form.control} name="effectiveFrom" label="Valid from" required>
          {(aria) => <Input {...aria} type="datetime-local" {...form.register('effectiveFrom')} />}
        </Field>
        <Field control={form.control} name="effectiveUntil" label="Valid until (optional)">
          {(aria) => <Input {...aria} type="datetime-local" {...form.register('effectiveUntil')} />}
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
