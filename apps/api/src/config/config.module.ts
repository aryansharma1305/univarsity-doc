import { type DynamicModule, Global, Module } from '@nestjs/common';
import { API_CONFIG, type ApiConfig } from './api-config.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_CONFIG, useValue: config }],
      exports: [API_CONFIG],
    };
  }
}
