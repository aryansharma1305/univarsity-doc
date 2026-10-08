import { Global, Module } from '@nestjs/common';
import { S3ObjectStorage } from '@docversity/storage';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/** Injection token for the shared ObjectStorage port (`@docversity/storage`). */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        new S3ObjectStorage({ config, connectTimeoutMs: config.HEALTH_CHECK_TIMEOUT_MS }),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
