import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  checkDatabaseConnection,
  createPrismaClient,
  type PrismaClient,
} from '@docversity/database';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/**
 * Owns the API's Prisma client. The client connects lazily, so the API still starts (and reports
 * `database: error` on /health) when PostgreSQL is unavailable.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = createPrismaClient({
      connectionString: config.DATABASE_URL,
      connectionTimeoutMillis: config.HEALTH_CHECK_TIMEOUT_MS,
    });
  }

  ping(): Promise<void> {
    return checkDatabaseConnection(this.client);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
