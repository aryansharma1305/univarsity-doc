import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ObjectStorage } from '@docversity/storage';
import type { HealthResponse, HealthServiceName, ServiceStatus } from '@docversity/validation';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { PrismaService } from '../database/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { OBJECT_STORAGE } from '../storage/storage.module.js';

type DependencyName = Exclude<HealthServiceName, 'api'>;

/**
 * Checks every dependency with a real round-trip (SQL query, Redis PING, S3 HeadBucket).
 * A dependency is `ok` only if its check succeeds within the timeout — nothing is assumed.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis, storage] = await Promise.all([
      this.probe('database', () => this.prisma.ping()),
      this.probe('redis', () => this.redis.ping()),
      this.probe('storage', (signal) => this.storage.ping(signal)),
    ]);

    // `api` is ok by definition: this code only runs if the API process is serving requests.
    const services = { api: 'ok', database, redis, storage } as const satisfies Record<
      HealthServiceName,
      ServiceStatus
    >;
    const status = Object.values(services).every((value) => value === 'ok') ? 'ok' : 'error';
    return { status, services };
  }

  private async probe(
    name: DependencyName,
    check: (signal: AbortSignal) => Promise<void>,
  ): Promise<ServiceStatus> {
    try {
      await withTimeout(check, this.config.HEALTH_CHECK_TIMEOUT_MS);
      return 'ok';
    } catch (error) {
      // Details are logged server-side only; the public response never exposes them.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health check failed for ${name}: ${reason}`);
      return 'error';
    }
  }
}
