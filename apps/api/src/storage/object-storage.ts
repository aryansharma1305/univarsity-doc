/**
 * Provider-neutral object storage port.
 *
 * Business services depend on this interface — never on the AWS SDK or a specific provider.
 * MinIO (local), Cloudflare R2 and AWS S3 are all served by the S3 implementation and differ only
 * in configuration (S3_ENDPOINT, S3_REGION, S3_FORCE_PATH_STYLE, credentials).
 *
 * Phase 1 only needs a connectivity check. Object operations (private put/get, presigned URLs)
 * are added when the first feature that stores files is built.
 */
export interface ObjectStorage {
  /** Resolves when the configured bucket is reachable with the configured credentials. */
  ping(signal?: AbortSignal): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
