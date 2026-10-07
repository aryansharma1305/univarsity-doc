import type { INestApplication, LogLevel } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express, Request, Response } from 'express';
import { ERROR_CODES, type ErrorResponse } from '@docversity/validation';
import { currentRequestId } from './common/request-context.js';
import helmet from 'helmet';
import { cookieNames } from './auth/cookies.js';
import { CSRF_HEADER } from './auth/csrf.service.js';
import { requestContextMiddleware } from './common/request-context.js';
import { accessLogMiddleware } from './common/access-log.js';
import type { ApiConfig } from './config/api-config.js';

/** Versioned prefix for all business endpoints. Infrastructure routes stay unprefixed. */
export const API_ROUTE_PREFIX = 'api/v1';
export const SWAGGER_PATH = 'api/docs';
export const OPENAPI_JSON_PATH = 'api/docs/openapi.json';

const LOG_LEVELS: Record<ApiConfig['LOG_LEVEL'], LogLevel[]> = {
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  log: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  verbose: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
};

export function logLevelsFor(level: ApiConfig['LOG_LEVEL']): LogLevel[] {
  return LOG_LEVELS[level];
}

/** Applies cross-cutting HTTP configuration. Shared by main.ts and the integration tests. */
export function configureApp(app: INestApplication, config: ApiConfig): void {
  const express = app.getHttpAdapter().getInstance() as Express;
  // Which proxies may supply X-Forwarded-For (never "trust everything"; see TRUST_PROXY).
  express.set('trust proxy', config.TRUST_PROXY);

  app.use(requestContextMiddleware);
  app.use(accessLogMiddleware);
  app.setGlobalPrefix(API_ROUTE_PREFIX, { exclude: ['health'] });
  app.use(helmet());
  // Explicit allow-list; credentials allowed, so a wildcard origin is never used.
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) {
    const names = cookieNames(config);
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Docversity API')
        .setDescription(
          'REST API for the Docversity academic verification & records portal.\n\n' +
            '**Authentication:** staff sign in with `POST /api/v1/auth/login`, which sets an HttpOnly ' +
            `session cookie (\`${names.session}\`). Browsers send it automatically; it is never exposed ` +
            'to JavaScript.\n\n**CSRF:** every POST/PUT/PATCH/DELETE must send `X-CSRF-Token`. Get the ' +
            'token from `GET /api/v1/auth/csrf` (session token when signed in; signed pre-auth token for ' +
            'login and password reset).',
        )
        .setVersion('0.0.0')
        .addCookieAuth(
          names.session,
          { type: 'apiKey', in: 'cookie', name: names.session },
          'session',
        )
        .addApiKey({ type: 'apiKey', in: 'header', name: CSRF_HEADER }, 'csrf')
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, { jsonDocumentUrl: OPENAPI_JSON_PATH });
  }
}

/**
 * Final JSON 404 for paths outside the API prefix (Nest only handles unknown routes under it, and
 * Express would otherwise answer with an HTML page). Call AFTER `app.init()` so it runs last.
 */
export function installNotFoundFallback(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as Express;
  express.use((_req: Request, res: Response) => {
    const body: ErrorResponse = {
      error: {
        code: ERROR_CODES.notFound,
        message: 'Not found.',
        requestId: currentRequestId() ?? 'unknown',
      },
    };
    res.status(404).json(body);
  });
}
