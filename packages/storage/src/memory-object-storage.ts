import {
  ObjectNotFoundError,
  type ObjectStorage,
  ObjectTooLargeError,
  type PutObjectOptions,
} from './object-storage.js';

/** In-memory ObjectStorage for unit tests. Not used by any running application. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  ping(): Promise<void> {
    return Promise.resolve();
  }

  putObject(key: string, body: Uint8Array, options: PutObjectOptions): Promise<void> {
    this.objects.set(key, { body: new Uint8Array(body), contentType: options.contentType });
    return Promise.resolve();
  }

  getObject(key: string, { maxBytes }: { maxBytes: number }): Promise<Uint8Array> {
    const object = this.objects.get(key);
    if (!object) return Promise.reject(new ObjectNotFoundError(key));
    if (object.body.byteLength > maxBytes) {
      return Promise.reject(new ObjectTooLargeError(key, object.body.byteLength));
    }
    return Promise.resolve(object.body);
  }

  deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
