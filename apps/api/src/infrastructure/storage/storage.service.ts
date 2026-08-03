export interface StoredObjectRef {
  /** Opaque key. Callers must treat this as meaningless and never parse it. */
  storageKey: string;
  /** Where the client should PUT the bytes. Short-lived. */
  uploadUrl: string;
}

/**
 * The seam between "we need to store a file" and "which vendor stores it".
 *
 * Development uses local disk; production will use S3-compatible object
 * storage. Nothing that calls this knows or cares which — swapping vendors is
 * a new implementation plus a config value, with no change to any caller.
 *
 * Abstract class rather than an interface because Nest's DI container resolves
 * providers by runtime token, and a TypeScript interface does not exist at
 * runtime. This class IS the injection token.
 */
export abstract class StorageService {
  /**
   * Reserves a location and returns a short-lived URL to upload to.
   * Does NOT accept the bytes — the caller uploads directly, so a large file
   * never occupies an API worker.
   */
  abstract createUploadUrl(input: {
    /** Logical grouping, e.g. "provider-documents". */
    prefix: string;
    filename: string;
    contentType: string;
  }): Promise<StoredObjectRef>;

  /** Short-lived read URL. Stored objects are never publicly readable. */
  abstract createDownloadUrl(storageKey: string): Promise<string>;

  abstract delete(storageKey: string): Promise<void>;
}
