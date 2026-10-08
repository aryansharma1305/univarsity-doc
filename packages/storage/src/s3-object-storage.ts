import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageEnv } from '@docversity/validation';
import {
  ObjectNotFoundError,
  type ObjectStorage,
  ObjectTooLargeError,
  type PutObjectOptions,
} from './object-storage.js';

export interface S3ObjectStorageOptions {
  config: StorageEnv;
  /** Connection timeout for every request (ms). */
  connectTimeoutMs: number;
  /** Per-request timeout (ms). Uploads/downloads of workbooks need more than a health check. */
  requestTimeoutMs?: number;
}

/** ObjectStorage backed by any S3-compatible service (MinIO, Cloudflare R2, AWS S3). */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor({ config, connectTimeoutMs, requestTimeoutMs = 60_000 }: S3ObjectStorageOptions) {
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
      requestHandler: { connectionTimeout: connectTimeoutMs, requestTimeout: requestTimeoutMs },
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

  async putObject(key: string, body: Uint8Array, options: PutObjectOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  async getObject(key: string, { maxBytes }: { maxBytes: number }): Promise<Uint8Array> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const size = head.ContentLength ?? 0;
      if (size > maxBytes) throw new ObjectTooLargeError(key, size);
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!object.Body) throw new ObjectNotFoundError(key);
      const bytes = await object.Body.transformToByteArray();
      if (bytes.byteLength > maxBytes) throw new ObjectTooLargeError(key, bytes.byteLength);
      return bytes;
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound)
        throw new ObjectNotFoundError(key);
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Releases sockets (Nest calls this on shutdown for factory-created providers). */
  onModuleDestroy(): void {
    this.client.destroy();
  }

  destroy(): void {
    this.client.destroy();
  }
}
