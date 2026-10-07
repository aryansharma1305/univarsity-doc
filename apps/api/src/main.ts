import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { SWAGGER_PATH, configureApp, installNotFoundFallback, logLevelsFor } from './app.setup.js';
import { JsonLogger } from './common/json-logger.js';
import { loadApiConfig } from './config/api-config.js';
import { loadRootEnv } from './config/load-root-env.js';

async function bootstrap(): Promise<void> {
  loadRootEnv();
  // Fails fast with a readable message if required variables are missing or malformed.
  const config = loadApiConfig();

  const app = await NestFactory.create(AppModule.register(config), {
    logger: new JsonLogger(logLevelsFor(config.LOG_LEVEL)),
  });
  configureApp(app, config);
  await app.init();
  installNotFoundFallback(app);
  await app.listen(config.API_PORT, config.API_HOST);

  const logger = new Logger('Bootstrap');
  const baseUrl = `http://${config.API_HOST}:${config.API_PORT}`;
  logger.log(`API listening on ${baseUrl} (health: ${baseUrl}/health)`);
  if (config.SWAGGER_ENABLED) logger.log(`Swagger UI: ${baseUrl}/${SWAGGER_PATH}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
