/**
 * Razorpay TEST-mode daily reconciliation (orders vs Razorpay's payments, then settlement recon).
 * Run once a day by the operator's scheduler on the staging instance:
 *
 *   pnpm --filter @docversity/api razorpay:reconcile
 *
 * Refuses (exit 1, "Not found.") when PAYMENTS_RAZORPAY_MODE is off. Prints counts and issue codes
 * only; never secrets, signatures or personal data. Exit 2 when any issue was found.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { JsonLogger } from '../common/json-logger.js';
import { loadApiConfig } from '../config/api-config.js';
import { loadRootEnv } from '../config/load-root-env.js';
import { RazorpayReconciliationService } from '../payment-buttons/razorpay-reconciliation.service.js';

async function main(): Promise<number> {
  loadRootEnv();
  const config = loadApiConfig();
  const app = await NestFactory.createApplicationContext(AppModule.register(config), {
    logger: new JsonLogger(['fatal', 'error', 'warn']),
  });
  try {
    const summary = await app.get(RazorpayReconciliationService).run();
    console.log(
      JSON.stringify({
        ordersChecked: summary.ordersChecked,
        rematched: summary.rematched,
        settlement: summary.settlement,
        driftMinor: summary.driftMinor,
        issues: summary.issues.map((issue) => issue.code),
      }),
    );
    return summary.issues.length > 0 ? 2 : 0;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Reconciliation failed.');
    process.exitCode = 1;
  },
);
