import { Global, Module } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { OBJECT_STORAGE } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [API_CONFIG],
      useFactory: (config: ApiConfig) =>
        new S3ObjectStorage({ config, timeoutMs: config.HEALTH_CHECK_TIMEOUT_MS }),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
