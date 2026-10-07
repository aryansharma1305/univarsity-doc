import 'reflect-metadata';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { type ApiConfig, loadApiConfig } from '../src/config/api-config.js';
import { loadRootEnv } from '../src/config/load-root-env.js';

/** Real configuration from the environment (root .env locally, workflow env in CI). */
export function realConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  loadRootEnv();
  return {
    ...loadApiConfig(),
    SWAGGER_ENABLED: true,
    HEALTH_CHECK_TIMEOUT_MS: 2_000,
    ...overrides,
  };
}

export async function createTestApp(config: ApiConfig): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

/** An address on which nothing listens, so connections are refused immediately. */
export const CLOSED_PORT_HOST = '127.0.0.1:1';

/** Supertest agent bound to the Nest HTTP server (typed, so tests never handle `any`). */
export function http(app: INestApplication) {
  return request(app.getHttpServer() as Server);
}
