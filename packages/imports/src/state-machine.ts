import type { ImportActions, ImportFailure, ImportStatus } from '@docversity/validation';

/**
 * The import state machine. Every status change goes through `assertTransition` and is applied with
 * a compare-and-set update (see `transitionImportJob`), so concurrent requests or duplicate worker
 * deliveries cannot skip or repeat a step.
 *
 *   UPLOADED ──parse──▶ MAPPING ──validate──▶ VALIDATING ──▶ VALIDATED ──commit──▶ PROCESSING ──▶ COMPLETED
 *      │                  │  ▲                    │            │  │ ▲                 │
 *      │                  │  └──────── re-map ────┼────────────┘  │ └─ re-validate    │
 *      ▼                  ▼                       ▼               ▼                   ▼
 *    FAILED          CANCELLED                 FAILED         CANCELLED             FAILED
 *
 * FAILED → (UPLOADED | VALIDATING | PROCESSING) only through the explicit retry operation, and only
 * when the failure is retryable. COMPLETED and CANCELLED are terminal.
 */
export const IMPORT_TRANSITIONS: Readonly<Record<ImportStatus, readonly ImportStatus[]>> = {
  UPLOADED: ['MAPPING', 'FAILED', 'CANCELLED'],
  MAPPING: ['VALIDATING', 'CANCELLED'],
  VALIDATING: ['VALIDATED', 'FAILED', 'CANCELLED'],
  VALIDATED: ['MAPPING', 'VALIDATING', 'PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['UPLOADED', 'VALIDATING', 'PROCESSING'],
  CANCELLED: [],
};

export const TERMINAL_IMPORT_STATUSES: readonly ImportStatus[] = ['COMPLETED', 'CANCELLED'];

/** Statuses in which the worker is (or should be) running a step. */
export const RUNNING_IMPORT_STATUSES: readonly ImportStatus[] = [
  'UPLOADED',
  'VALIDATING',
  'PROCESSING',
];

export function canTransition(from: ImportStatus, to: ImportStatus): boolean {
  return IMPORT_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: readonly ImportStatus[], to: ImportStatus): void {
  for (const status of from) {
    if (!canTransition(status, to)) {
      throw new Error(`Invalid import transition ${status} → ${to}`);
    }
  }
}

/** The step to resume when a failed import is retried. */
export function retryTarget(failure: ImportFailure): ImportStatus {
  switch (failure.stage) {
    case 'PARSE':
      return 'UPLOADED';
    case 'VALIDATE':
      return 'VALIDATING';
    case 'COMMIT':
      return 'PROCESSING';
  }
}

/** Operations offered for a status (permissions are checked separately). */
export function importActions(status: ImportStatus, failure: ImportFailure | null): ImportActions {
  return {
    map: status === 'MAPPING' || status === 'VALIDATED',
    validate: status === 'MAPPING' || status === 'VALIDATED',
    commit: status === 'VALIDATED',
    cancel: IMPORT_TRANSITIONS[status].includes('CANCELLED'),
    retry: status === 'FAILED' && failure?.retryable === true,
  };
}
