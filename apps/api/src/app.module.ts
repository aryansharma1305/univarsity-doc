import { type DynamicModule, Module } from '@nestjs/common';
import type { ApiConfig } from './config/api-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({})
export class AppModule {
  /** The validated configuration is passed in explicitly so tests can supply their own. */
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        StorageModule,
        HealthModule,
      ],
    };
  }
}
