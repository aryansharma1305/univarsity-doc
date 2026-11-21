import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PrismaClient } from '@docversity/database';
import { PAYMENT_JOB_NAMES } from '@docversity/types';
import { loadWorkerEnv } from '../src/env.ts';
import {
  RAZORPAY_RECONCILE_EVERY_MS,
  razorpayProcessor,
  scheduleRazorpayReconcile,
  unscheduleRazorpayReconcile,
} from '../src/razorpay.ts';

// Synthetic values only; no network (the HTTP port is a fake that must never be called here).
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'docversity-local',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};
const job = (name: string) => ({ name }) as Job;

describe('worker Razorpay reconciliation job (SIMULATED, no services)', () => {
  it('is disabled with the default mode off and never builds a client', async () => {
    const env = loadWorkerEnv(base);
    expect(env.PAYMENTS_RAZORPAY_MODE).toBe('off');
    const port = vi.fn();
    const result: unknown = await razorpayProcessor({ prisma: {} as PrismaClient, env, port })(
      job(PAYMENT_JOB_NAMES.razorpayReconcile),
    );
    expect(result).toBe('DISABLED');
    expect(port).not.toHaveBeenCalled();
  });
  it('refuses Razorpay secrets while off and live mode, like the API', () => {
    expect(() =>
      loadWorkerEnv({ ...base, RAZORPAY_KEY_SECRET: 'synthetic-key-secret-0000' }),
    ).toThrow(/RAZORPAY_KEY_SECRET/);
    expect(() => loadWorkerEnv({ ...base, PAYMENTS_RAZORPAY_MODE: 'live' })).toThrow(
      /not approved/,
    );
    expect(() => loadWorkerEnv({ ...base, PAYMENTS_RAZORPAY_REFUNDS: 'partial' })).toThrow(
      /PAYMENTS_RAZORPAY_REFUNDS/,
    );
  });
  it('rejects unknown job names on the payments queue', async () => {
    const env = loadWorkerEnv(base);
    await expect(
      razorpayProcessor({ prisma: {} as PrismaClient, env })(job('something.else')),
    ).rejects.toThrow(/Unknown payments job/);
  });
  it('schedules one idempotent repeatable reconciliation', async () => {
    const upsertJobScheduler = vi.fn(() => Promise.resolve(undefined as never));
    await scheduleRazorpayReconcile({ upsertJobScheduler });
    await scheduleRazorpayReconcile({ upsertJobScheduler });
    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(upsertJobScheduler.mock.calls[0]).toEqual([
      'razorpay-reconcile',
      { every: RAZORPAY_RECONCILE_EVERY_MS },
      {
        name: PAYMENT_JOB_NAMES.razorpayReconcile,
        opts: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
      },
    ]);
  });
  it('removes a leftover schedule when the mode is off', async () => {
    const removeJobScheduler = vi.fn(() => Promise.resolve(true));
    await unscheduleRazorpayReconcile({ removeJobScheduler });
    expect(removeJobScheduler).toHaveBeenCalledWith('razorpay-reconcile');
  });
  it('accepts only an https alert webhook URL', () => {
    expect(() =>
      loadWorkerEnv({ ...base, PAYMENTS_ALERT_WEBHOOK_URL: 'http://ntfy.example.invalid/x' }),
    ).toThrow(/PAYMENTS_ALERT_WEBHOOK_URL/);
    expect(
      loadWorkerEnv({ ...base, PAYMENTS_ALERT_WEBHOOK_URL: 'https://ntfy.example.invalid/x' })
        .PAYMENTS_ALERT_WEBHOOK_URL,
    ).toBe('https://ntfy.example.invalid/x');
  });
});
