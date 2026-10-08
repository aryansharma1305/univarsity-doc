import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { DynamicModule, INestApplication, LogLevel, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@docversity/database';
import { type RoleName } from '@docversity/types';
import {
  authUserSchema,
  errorResponseSchema,
  healthResponseSchema,
  sessionListResponseSchema,
} from '@docversity/validation';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp, installNotFoundFallback } from '../src/app.setup.js';
import {
  PASSWORD_RESET_NOTIFIER,
  type PasswordResetNotifier,
} from '../src/auth/password-reset.notifier.js';
import { PasswordService } from '../src/auth/password.service.js';
import { ensureRoles } from '../src/cli/roles.js';
import { JsonLogger } from '../src/common/json-logger.js';
import { type ApiConfig, loadApiConfig } from '../src/config/api-config.js';
import { loadRootEnv } from '../src/config/load-root-env.js';

/**
 * Configuration from the environment (root .env locally, workflow env in CI), pointed at the
 * disposable API test database and a Redis key prefix unique to this call (test isolation).
 */
export function realConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  loadRootEnv();
  return {
    ...loadApiConfig(),
    DATABASE_URL: inject('apiTestDatabaseUrl'),
    REDIS_KEY_PREFIX: `dvtest:${randomUUID().slice(0, 8)}:`,
    QUEUE_PREFIX: `dvtq-${randomUUID().slice(0, 8)}`,
    SWAGGER_ENABLED: true,
    HEALTH_CHECK_TIMEOUT_MS: 2_000,
    ...overrides,
  };
}

export interface TestAppOptions {
  extraModules?: (Type | DynamicModule)[];
  /** Capture structured log lines (enables the JSON logger at debug level). */
  logSink?: (line: string) => void;
  passwordResetNotifier?: PasswordResetNotifier;
}

export async function createTestApp(
  config: ApiConfig,
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule.register(config), ...(options.extraModules ?? [])],
  });
  if (options.passwordResetNotifier) {
    builder = builder
      .overrideProvider(PASSWORD_RESET_NOTIFIER)
      .useValue(options.passwordResetNotifier);
  }
  const moduleRef = await builder.compile();
  const levels: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug'];
  const app = moduleRef.createNestApplication({
    logger: options.logSink ? new JsonLogger(levels, options.logSink) : false,
  });
  configureApp(app, config);
  await app.init();
  installNotFoundFallback(app);
  return app;
}

/** Supertest request builder bound to the Nest HTTP server (typed, so tests never handle `any`). */
export function http(app: INestApplication) {
  return request(app.getHttpServer() as Server);
}

/** A cookie-keeping client, like a browser. */
export function browser(app: INestApplication) {
  return request.agent(app.getHttpServer() as Server);
}

/** An address on which nothing listens, so connections are refused immediately. */
export const CLOSED_PORT_HOST = '127.0.0.1:1';

export const TEST_PASSWORD = 'correct horse battery staple 42';

let sharedDb: PrismaClient | undefined;
export function testDb(): PrismaClient {
  sharedDb ??= createPrismaClient({ connectionString: inject('apiTestDatabaseUrl') });
  return sharedDb;
}

const passwords = new PasswordService();

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

/** Creates a staff user with the given roles directly in the test database. */
export async function createTestUser(
  options: { roles?: RoleName[]; status?: 'ACTIVE' | 'DISABLED'; password?: string | null } = {},
): Promise<TestUser> {
  const db = testDb();
  await ensureRoles(db);
  const email = `user.${randomUUID().slice(0, 8)}@example.test`;
  const password = options.password === undefined ? TEST_PASSWORD : options.password;
  const roles = await db.role.findMany({ where: { name: { in: options.roles ?? [] } } });
  const user = await db.user.create({
    data: {
      email,
      displayName: 'Test Staff Member',
      status: options.status ?? 'ACTIVE',
      passwordHash: password === null ? null : await passwords.hashPassword(password),
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
  });
  return { id: user.id, email, password: password ?? '' };
}

type Agent = ReturnType<typeof browser>;

export async function csrfToken(agent: Agent): Promise<string> {
  const response = await agent.get('/api/v1/auth/csrf').expect(200);
  return (response.body as { csrfToken: string }).csrfToken;
}

/** Signs in through the real endpoints (pre-auth CSRF → login) and returns the session CSRF token. */
export async function signIn(
  agent: Agent,
  user: Pick<TestUser, 'email' | 'password'>,
): Promise<string> {
  const preAuth = await csrfToken(agent);
  await agent
    .post('/api/v1/auth/login')
    .set('X-CSRF-Token', preAuth)
    .send({ email: user.email, password: user.password })
    .expect(200);
  return csrfToken(agent);
}

/** Value of a Set-Cookie header for the given cookie name (or undefined). */
export function setCookie(
  response: { headers: Record<string, unknown> },
  name: string,
): string | undefined {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header)
    ? (header as string[])
    : typeof header === 'string'
      ? [header]
      : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

interface HasBody {
  body: unknown;
}

/** The `error` object of a standard error response (validated against the shared schema). */
export function errorOf(response: HasBody) {
  return errorResponseSchema.parse(response.body).error;
}

export function sessionsOf(response: HasBody) {
  return sessionListResponseSchema.parse(response.body).sessions;
}

export function userOf(response: HasBody) {
  return authUserSchema.parse(response.body);
}

export function healthOf(response: HasBody) {
  return healthResponseSchema.parse(response.body);
}

/** A signed-in staff member with the given roles: request helpers that send the CSRF token. */
export async function staff(app: INestApplication, roles: RoleName[]) {
  const user = await createTestUser({ roles });
  const agent = browser(app);
  const csrf = await signIn(agent, user);
  return {
    user,
    agent,
    csrf,
    get: (path: string) => agent.get(`/api/v1/${path}`),
    post: (path: string, body?: object) =>
      agent.post(`/api/v1/${path}`).set('X-CSRF-Token', csrf).send(body),
    patch: (path: string, body?: object) =>
      agent.patch(`/api/v1/${path}`).set('X-CSRF-Token', csrf).send(body),
  };
}

export type Staff = Awaited<ReturnType<typeof staff>>;

export function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 6).toUpperCase()}`;
}
