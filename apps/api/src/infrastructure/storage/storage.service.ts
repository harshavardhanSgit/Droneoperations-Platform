export interface StoredObjectRef {
  /** Opaque key. Callers must treat this as meaningless and never parse it. */
  storageKey: string;
  /** Where the client should PUT the bytes. Short-lived. */
  uploadUrl: string;
}

/** The seam between "we need to store a file" and "which vendor stores it". */
export abstract class StorageService {
  /** Reserves a location and returns a short-lived URL to upload to. */
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
