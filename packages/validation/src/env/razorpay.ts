import { z } from 'zod';

// shortcut: live approval is a code constant, so enabling live mode is always a reviewed commit
// (a university sign-off ADR plus a live-mode security review). Never set it from configuration.
export const RAZORPAY_LIVE_APPROVAL_REF = null as string | null;
/** Deployment names that may never collect in test mode, whatever the environment says. */
export const PAYMENTS_FORBIDDEN_DEPLOYMENT = /(^|-)(prod|production|live|main)(-|$)/;
const deploymentName = z.string().regex(/^[a-z0-9-]{3,40}$/);
const RAZORPAY_SECRET_KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_ACCOUNT_ID',
] as const;

/** Razorpay payment settings shared by the API and the worker (both read the same runtime env). */
export const razorpayEnvSchema = z.object({
  /**
   * Razorpay collection: off (default; webhook 404, no provider calls), test (staging with test-mode
   * keys only), live (refused at startup until RAZORPAY_LIVE_APPROVAL_REF is set by a reviewed change).
   * Secrets are runtime-only and never logged; see docs/plans/razorpay-test-mode-plan.md section 8.4.
   */
  PAYMENTS_RAZORPAY_MODE: z.enum(['off', 'test', 'live']).default('off'),
  PAYMENTS_RAZORPAY_LIVE_APPROVAL: z.string().max(64).optional(),
  PAYMENTS_ALLOWED_DEPLOYMENT: deploymentName.optional(),
  DOCVERSITY_DEPLOYMENT: deploymentName.optional(),
  RAZORPAY_KEY_ID: z
    .string()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/, 'must look like a Razorpay key id')
    .optional(),
  RAZORPAY_KEY_SECRET: z.string().min(16).max(256).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
  RAZORPAY_ACCOUNT_ID: z
    .string()
    .regex(/^acc_[A-Za-z0-9]{1,50}$/, 'must look like a Razorpay account id')
    .optional(),
  /** Comma-separated synthetic registration UUIDs that may use test checkout. */
  PAYMENTS_TEST_REGISTRATION_ALLOWLIST: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.uuid()).max(100)),
  /**
   * API-initiated refunds (maker-checker): off (default) | full_only | partial. Only in test mode.
   * The university refund policy (plan D4) is undecided, so nothing enables this by default.
   */
  PAYMENTS_RAZORPAY_REFUNDS: z.enum(['off', 'full_only', 'partial']).default('off'),
  /**
   * Optional alert delivery (ops decision): an https endpoint that accepts a JSON POST (ntfy topic,
   * chat relay or mail gateway). Unset: alerts are structured warning log lines only.
   */
  PAYMENTS_ALERT_WEBHOOK_URL: z
    .url()
    .refine((value) => value.startsWith('https://'), 'must be an https URL')
    .optional(),
});
export type RazorpayEnv = z.infer<typeof razorpayEnvSchema>;

/** Startup refusal rules; the Razorpay secrets must never equal `otherSecrets`. */
export function refineRazorpayEnv(
  env: RazorpayEnv,
  ctx: z.RefinementCtx,
  otherSecrets: { SESSION_SECRET?: string; STAFF_MFA_ENCRYPTION_KEY?: string } = {},
): void {
  const razorpay = (message: string, path = 'PAYMENTS_RAZORPAY_MODE') => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };
  if (env.PAYMENTS_RAZORPAY_MODE === 'off') {
    // Catches misconfiguration: secrets present on an instance that must not collect.
    for (const key of RAZORPAY_SECRET_KEYS)
      if (env[key]) razorpay('must not be set while PAYMENTS_RAZORPAY_MODE=off', key);
  } else {
    for (const key of RAZORPAY_SECRET_KEYS)
      if (!env[key])
        razorpay(`is required when PAYMENTS_RAZORPAY_MODE=${env.PAYMENTS_RAZORPAY_MODE}`, key);
    if (!env.DOCVERSITY_DEPLOYMENT || env.DOCVERSITY_DEPLOYMENT !== env.PAYMENTS_ALLOWED_DEPLOYMENT)
      razorpay(
        'must equal PAYMENTS_ALLOWED_DEPLOYMENT on an instance allowed to collect',
        'DOCVERSITY_DEPLOYMENT',
      );
    for (const key of ['DOCVERSITY_DEPLOYMENT', 'PAYMENTS_ALLOWED_DEPLOYMENT'] as const)
      if (PAYMENTS_FORBIDDEN_DEPLOYMENT.test(env[key] ?? ''))
        razorpay('names a production deployment, which can never enable Razorpay collection', key);
    if (env.PAYMENTS_TEST_REGISTRATION_ALLOWLIST.length === 0)
      razorpay(
        'must list at least one synthetic registration',
        'PAYMENTS_TEST_REGISTRATION_ALLOWLIST',
      );
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (
      secret &&
      [
        env.RAZORPAY_KEY_SECRET,
        otherSecrets.SESSION_SECRET,
        otherSecrets.STAFF_MFA_ENCRYPTION_KEY,
      ].includes(secret)
    )
      razorpay(
        'must differ from RAZORPAY_KEY_SECRET, SESSION_SECRET and STAFF_MFA_ENCRYPTION_KEY',
        'RAZORPAY_WEBHOOK_SECRET',
      );
    if (env.RAZORPAY_KEY_SECRET && env.RAZORPAY_KEY_SECRET === otherSecrets.SESSION_SECRET)
      razorpay('must differ from SESSION_SECRET', 'RAZORPAY_KEY_SECRET');
    const liveKey = env.RAZORPAY_KEY_ID?.startsWith('rzp_live_') ?? false;
    if (env.PAYMENTS_RAZORPAY_MODE === 'test' && liveKey)
      razorpay('a live key id is refused in test mode', 'RAZORPAY_KEY_ID');
    if (env.PAYMENTS_RAZORPAY_MODE === 'live') {
      if (env.RAZORPAY_KEY_ID?.startsWith('rzp_test_'))
        razorpay('a test key id is refused in live mode', 'RAZORPAY_KEY_ID');
      if (
        RAZORPAY_LIVE_APPROVAL_REF === null ||
        env.PAYMENTS_RAZORPAY_LIVE_APPROVAL !== RAZORPAY_LIVE_APPROVAL_REF
      )
        razorpay('live mode is not approved (requires a reviewed code change)');
    }
  }
  if (env.PAYMENTS_RAZORPAY_REFUNDS !== 'off' && env.PAYMENTS_RAZORPAY_MODE !== 'test')
    ctx.addIssue({
      code: 'custom',
      path: ['PAYMENTS_RAZORPAY_REFUNDS'],
      message: 'refunds can be enabled only in PAYMENTS_RAZORPAY_MODE=test',
    });
}
