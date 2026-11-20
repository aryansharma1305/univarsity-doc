import type { Processor, Queue } from 'bullmq';
import type { PrismaClient } from '@docversity/database';
import { RazorpayClient, fetchRazorpayPort, type RazorpayHttpPort } from '@docversity/payments';
import {
  prismaAuditWriter,
  razorpayPolicy,
  reconcileRazorpay,
  type AlertNotifier,
  type ReconciliationSummary,
} from '@docversity/payments/server';
import { PAYMENT_JOB_NAMES } from '@docversity/types';
import type { WorkerEnv } from './env.ts';

/** How often the worker reconciles Razorpay TEST orders and refunds. */
export const RAZORPAY_RECONCILE_EVERY_MS = 15 * 60_000;

/** Default alert hook: one structured warning line (no secrets, ids and codes only). */
export const logAlert: AlertNotifier = (alert) => {
  console.warn(JSON.stringify({ level: 'warn', context: 'PaymentAlerts', ...alert }));
  return Promise.resolve();
};

export interface RazorpayJobDeps {
  prisma: PrismaClient;
  env: WorkerEnv;
  port?: RazorpayHttpPort;
  notify?: AlertNotifier;
}

/**
 * Processor for the `payments` queue. Mode off (no policy): the job does nothing. Test: the shared
 * reconciliation core, which never marks anything paid without a signed receipt and a captured,
 * amount-exact provider payment.
 */
export function razorpayProcessor(deps: RazorpayJobDeps): Processor {
  return async (job): Promise<ReconciliationSummary | 'DISABLED'> => {
    if (job.name !== PAYMENT_JOB_NAMES.razorpayReconcile)
      throw new Error(`Unknown payments job "${job.name}"`);
    const policy = razorpayPolicy(deps.env);
    if (!policy) return 'DISABLED';
    return reconcileRazorpay({
      prisma: deps.prisma,
      client: new RazorpayClient(policy.keyId, policy.keySecret, deps.port ?? fetchRazorpayPort()),
      audit: prismaAuditWriter(deps.prisma),
      notify: deps.notify ?? logAlert,
    });
  };
}

/** Idempotent repeatable schedule (one scheduler id, so restarts never duplicate it). */
export async function scheduleRazorpayReconcile(
  queue: Pick<Queue, 'upsertJobScheduler'>,
): Promise<void> {
  await queue.upsertJobScheduler(
    'razorpay-reconcile',
    { every: RAZORPAY_RECONCILE_EVERY_MS },
    {
      name: PAYMENT_JOB_NAMES.razorpayReconcile,
      opts: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
    },
  );
}
