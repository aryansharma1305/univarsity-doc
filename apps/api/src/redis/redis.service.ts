import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';

/**
 * Shared Redis connection for the API. Phase 1 uses it only for health checks; sessions,
 * rate-limit counters and BullMQ producers will reuse this service later.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private connectionHealthy = true;
  readonly client: Redis;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.client = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      connectTimeout: config.HEALTH_CHECK_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    });
    // Log state changes once instead of once per reconnect attempt.
    this.client.on('error', (error: Error) => {
      if (this.connectionHealthy) {
        this.connectionHealthy = false;
        this.logger.warn(`Redis connection error: ${error.message}`);
      }
    });
    this.client.on('ready', () => {
      if (!this.connectionHealthy) this.logger.log('Redis connection restored');
      this.connectionHealthy = true;
    });
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    // Resolves with "PONG" only after a full round-trip to the server; rejects otherwise.
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') return;
    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }
}
