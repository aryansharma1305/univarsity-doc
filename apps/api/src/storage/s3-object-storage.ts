import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { StorageEnv } from '@docversity/validation';
import type { ObjectStorage } from './object-storage.js';

export interface S3ObjectStorageOptions {
  config: StorageEnv;
  timeoutMs: number;
}

/** ObjectStorage backed by any S3-compatible service (MinIO, Cloudflare R2, AWS S3). */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor({ config, timeoutMs }: S3ObjectStorageOptions) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: timeoutMs, requestTimeout: timeoutMs },
    });
  }

  async ping(signal?: AbortSignal): Promise<void> {
    // HeadBucket proves the endpoint is reachable, the credentials are valid and the bucket
    // exists, without reading or writing any object.
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.bucket }),
      signal ? { abortSignal: signal } : {},
    );
  }

  /** Called by Nest on shutdown (lifecycle hooks also run on factory-created providers). */
  onModuleDestroy(): void {
    this.client.destroy();
  }
}
