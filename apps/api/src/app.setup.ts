import type { INestApplication, LogLevel } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { ApiConfig } from './config/api-config.js';

/** Versioned prefix for all future business endpoints. Infrastructure routes stay unprefixed. */
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
  app.setGlobalPrefix(API_ROUTE_PREFIX, { exclude: ['health'] });
  app.use(helmet());
  app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();

  if (config.SWAGGER_ENABLED) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Docversity API')
        .setDescription(
          'REST API for the Docversity academic verification & records portal. ' +
            'Phase 1 exposes infrastructure endpoints only.',
        )
        .setVersion('0.0.0')
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, { jsonDocumentUrl: OPENAPI_JSON_PATH });
  }
}
