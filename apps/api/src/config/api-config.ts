import {
  databaseEnvSchema,
  envBoolean,
  httpUrl,
  logLevelSchema,
  nodeEnvSchema,
  parseEnv,
  port,
  redisEnvSchema,
  storageEnvSchema,
} from '@docversity/validation';
import { z } from 'zod';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const positiveInt = (max: number) => z.coerce.number().int().min(1).max(max);

/**
 * Express "trust proxy" setting. Accepted values:
 * - `false` (default): never trust X-Forwarded-For; the client IP is the socket address.
 * - `loopback` / `linklocal` / `uniquelocal`: trust proxies on those address ranges only.
 * - a comma-separated list of IPs/CIDRs: trust exactly those proxies.
 * - a hop count (1–5): trust that many proxies in front of the API.
 * `true` (trust everything) is rejected because it lets any client spoof its IP.
 */
const trustProxySchema = z
  .string()
  .trim()
  .default('false')
  .transform((value, ctx): false | number | string => {
    if (value === 'false' || value === '0') return false;
    if (value === 'true') {
      ctx.addIssue({
        code: 'custom',
        message: 'must not be "true" (it would trust spoofed X-Forwarded-For)',
      });
      return z.NEVER;
    }
    if (/^[1-5]$/.test(value)) return Number(value);
    const entries = value.split(',').map((entry) => entry.trim());
    const valid = entries.every(
      (entry) =>
        ['loopback', 'linklocal', 'uniquelocal'].includes(entry) ||
        /^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(entry),
    );
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be false, 1-5, loopback/linklocal/uniquelocal, or IP/CIDR list',
      });
      return z.NEVER;
    }
    return entries.join(',');
  });

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    LOG_LEVEL: logLevelSchema,
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: port.default(4000),
    /** Browser-facing URL of the web app (cookie policy, password-reset links). */
    WEB_URL: httpUrl,
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
    SWAGGER_ENABLED: envBoolean.default(false),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    TRUST_PROXY: trustProxySchema,

    /** Key for HMAC-hashing identifiers (emails, IPs, tokens) before they reach Redis or logs. */
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Secure cookies. May be false only for local http development. */
    COOKIE_SECURE: envBoolean.default(true),
    SESSION_IDLE_TIMEOUT_SECONDS: positiveInt(86_400).default(1_800),
    SESSION_ABSOLUTE_TIMEOUT_SECONDS: positiveInt(7 * 86_400).default(43_200),
    REDIS_KEY_PREFIX: z
      .string()
      .regex(/^[a-z0-9:_-]{1,64}$/)
      .default('dv:'),

    LOGIN_RATE_LIMIT_WINDOW_SECONDS: positiveInt(86_400).default(900),
    /** Failed + successful attempts per (account, client IP) per window. */
    LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP: positiveInt(1_000).default(5),
    /** Attempts per account across all IPs (slows distributed guessing). */
    LOGIN_MAX_ATTEMPTS_PER_ACCOUNT: positiveInt(10_000).default(20),
    /** Attempts per client IP across all accounts (slows credential stuffing; allows shared NAT). */
    LOGIN_MAX_ATTEMPTS_PER_IP: positiveInt(100_000).default(100),
    PASSWORD_RESET_TOKEN_TTL_SECONDS: positiveInt(86_400).default(1_800),

    ...databaseEnvSchema.shape,
    ...redisEnvSchema.shape,
    ...storageEnvSchema.shape,
  })
  .superRefine((env, ctx) => {
    if (env.SESSION_ABSOLUTE_TIMEOUT_SECONDS < env.SESSION_IDLE_TIMEOUT_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_TIMEOUT_SECONDS'],
        message: 'must be greater than or equal to SESSION_IDLE_TIMEOUT_SECONDS',
      });
    }
    if (!env.COOKIE_SECURE) {
      if (env.NODE_ENV === 'production') {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'must be true in production',
        });
      } else if (!LOCAL_HOSTNAMES.has(new URL(env.WEB_URL).hostname)) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'may be false only when WEB_URL is localhost (local http development)',
        });
      }
    }
    if (env.NODE_ENV === 'production' && /^dev-only/i.test(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'must be a real random secret in production, not the development placeholder',
      });
    }
  });

export type ApiConfig = z.infer<typeof apiEnvSchema>;

/** Injection token for the validated, immutable API configuration. */
export const API_CONFIG = Symbol('API_CONFIG');

/** Validates process.env and fails fast with a readable error if anything is missing. */
export function loadApiConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return Object.freeze(parseEnv('api', apiEnvSchema, source));
}
