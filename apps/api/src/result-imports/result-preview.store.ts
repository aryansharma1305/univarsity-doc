import { gunzipSync, gzipSync } from 'node:zlib';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { SourceCell } from '@docversity/imports';
import {
  ERROR_CODES,
  type ImportIssue,
  type ResultImportSheet,
  type ResultPreviewContext,
  type ResultPreviewCounts,
  type ResultPreviewMapping,
  type ResultPreviewRow,
} from '@docversity/validation';
import { AppError } from '../common/app-error.js';
import { withTimeout } from '../common/with-timeout.js';
import { API_CONFIG, type ApiConfig } from '../config/api-config.js';
import { RedisService } from '../redis/redis.service.js';

/** A preview lives for this long after its upload (fixed; it is never extended). */
export const RESULT_PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
/** Open previews per staff member. */
export const MAX_OPEN_PREVIEWS_PER_USER = 5;
const REDIS_TIMEOUT_MS = 5_000;

/** Everything about a preview except its rows (small; read on every request). */
export interface PreviewMeta {
  id: string;
  ownerUserId: string;
  originalFilename: string;
  fileSizeBytes: number;
  fileSha256: string;
  createdAt: number;
  expiresAt: number;
  context: ResultPreviewContext;
  sheets: ResultImportSheet[];
  mapping: ResultPreviewMapping | null;
  counts: ResultPreviewCounts | null;
}

/** Data rows of every usable worksheet, as read (formulas never evaluated). */
export type PreviewSource = Record<string, { rowNumber: number; cells: SourceCell[] }[]>;

/** The classified rows of the last validation. */
export interface PreviewOutcomeRow extends ResultPreviewRow {
  issues: ImportIssue[];
}

/**
 * Temporary storage of results import previews in Redis — not in PostgreSQL and not in object
 * storage, so a preview can never become an official record and disappears on its own.
 *
 * Keys (prefix = REDIS_KEY_PREFIX):
 *   <prefix>result-preview:<id>:meta      JSON PreviewMeta
 *   <prefix>result-preview:<id>:source    gzip(JSON PreviewSource)
 *   <prefix>result-preview:<id>:rows      gzip(JSON PreviewOutcomeRow[]) after validation
 *   <prefix>result-previews-user:<userId> ZSET preview id → expiresAt (open-preview limit)
 *
 * Every key expires at the preview's fixed `expiresAt` (PXAT), so Redis deletes the uploaded rows
 * without any cleanup job. The raw workbook bytes are never stored at all.
 */
@Injectable()
export class ResultPreviewStore {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly redis: RedisService,
  ) {}

  private key(id: string, part: 'meta' | 'source' | 'rows'): string {
    return `${this.config.REDIS_KEY_PREFIX}result-preview:${id}:${part}`;
  }

  private userKey(userId: string): string {
    return `${this.config.REDIS_KEY_PREFIX}result-previews-user:${userId}`;
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await withTimeout(operation, REDIS_TIMEOUT_MS);
    } catch {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ERROR_CODES.serviceUnavailable,
        'Result previews are temporarily unavailable. Try again shortly.',
      );
    }
  }

  /** Number of the user's previews that have not expired (expired entries are pruned). */
  async openCount(userId: string): Promise<number> {
    const key = this.userKey(userId);
    return this.run(async () => {
      await this.redis.client.zremrangebyscore(key, '-inf', Date.now());
      return this.redis.client.zcard(key);
    });
  }

  async create(meta: PreviewMeta, source: PreviewSource): Promise<void> {
    const userKey = this.userKey(meta.ownerUserId);
    const created = await this.run(() =>
      this.redis.client.eval(
        `redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[1])
       if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[2]) then return 0 end
       redis.call('SET', KEYS[1], ARGV[3], 'PXAT', ARGV[5])
       redis.call('SET', KEYS[2], ARGV[4], 'PXAT', ARGV[5])
       redis.call('ZADD', KEYS[3], ARGV[5], ARGV[6])
       local latest = redis.call('ZREVRANGE', KEYS[3], 0, 0, 'WITHSCORES')
       redis.call('PEXPIREAT', KEYS[3], latest[2])
       return 1`,
        3,
        this.key(meta.id, 'meta'),
        this.key(meta.id, 'source'),
        userKey,
        Date.now(),
        MAX_OPEN_PREVIEWS_PER_USER,
        JSON.stringify(meta),
        gzipSync(JSON.stringify(source)),
        meta.expiresAt,
        meta.id,
      ),
    );
    if (created !== 1)
      throw new AppError(
        HttpStatus.CONFLICT,
        ERROR_CODES.conflict,
        `You already have ${MAX_OPEN_PREVIEWS_PER_USER} open previews. Discard one or wait for it to expire.`,
      );
  }

  /**
   * The preview, only for its owner. Another user's preview, an expired one and an unknown id are
   * indistinguishable (null → 404), so preview ids reveal nothing.
   */
  async meta(id: string, userId: string): Promise<PreviewMeta | null> {
    const raw = await this.run(() => this.redis.client.get(this.key(id, 'meta')));
    if (!raw) return null;
    const meta = JSON.parse(raw) as PreviewMeta;
    if (meta.ownerUserId !== userId || meta.expiresAt <= Date.now()) return null;
    return meta;
  }

  async source(id: string): Promise<PreviewSource | null> {
    const raw = await this.run(() => this.redis.client.getBuffer(this.key(id, 'source')));
    return raw ? (JSON.parse(gunzipSync(raw).toString('utf8')) as PreviewSource) : null;
  }

  async rows(id: string): Promise<PreviewOutcomeRow[] | null> {
    const raw = await this.run(() => this.redis.client.getBuffer(this.key(id, 'rows')));
    return raw ? (JSON.parse(gunzipSync(raw).toString('utf8')) as PreviewOutcomeRow[]) : null;
  }

  /** Stores a validation (meta + rows) with the preview's original expiry. */
  async saveValidation(meta: PreviewMeta, rows: PreviewOutcomeRow[]): Promise<void> {
    const saved = await this.run(() =>
      this.redis.client.eval(
        `if redis.call('EXISTS', KEYS[1]) == 0 or tonumber(ARGV[3]) <= tonumber(ARGV[4]) then return 0 end
       redis.call('SET', KEYS[1], ARGV[1], 'PXAT', ARGV[3])
       redis.call('SET', KEYS[2], ARGV[2], 'PXAT', ARGV[3])
       return 1`,
        2,
        this.key(meta.id, 'meta'),
        this.key(meta.id, 'rows'),
        JSON.stringify(meta),
        gzipSync(JSON.stringify(rows)),
        meta.expiresAt,
        Date.now(),
      ),
    );
    if (saved !== 1)
      throw new AppError(
        HttpStatus.NOT_FOUND,
        ERROR_CODES.notFound,
        'This preview has expired or been discarded. Upload the workbook again.',
      );
  }

  async discard(meta: PreviewMeta): Promise<void> {
    await this.run(() =>
      this.redis.client
        .multi()
        .del(this.key(meta.id, 'meta'), this.key(meta.id, 'source'), this.key(meta.id, 'rows'))
        .zrem(this.userKey(meta.ownerUserId), meta.id)
        .exec(),
    );
  }
}
