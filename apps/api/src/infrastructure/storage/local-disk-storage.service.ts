import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AccessDeniedException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env.validation';
import { StorageService, type StoredObjectRef } from './storage.service';

/**
 * DEVELOPMENT ONLY.
 *
 * Writes to a local folder and mints signed URLs pointing back at this API,
 * so the client-side flow is byte-for-byte identical to the S3 one. In
 * production this is replaced by an S3 adapter and the bytes never touch us.
 *
 * Not viable in production for the reason noted in the blueprint: managed
 * hosting gives you an ephemeral filesystem, so uploads vanish on redeploy.
 */
@Injectable()
export class LocalDiskStorageService extends StorageService {
  private readonly root: string;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly ttlSeconds = 300;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = resolve(process.cwd(), config.get('STORAGE_LOCAL_DIR', { infer: true }));
    this.baseUrl = config.get('API_PUBLIC_URL', { infer: true });
    // Reuses the JWT secret only because this adapter never runs in production.
    this.secret = config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  async createUploadUrl(input: {
    prefix: string;
    filename: string;
    contentType: string;
  }): Promise<StoredObjectRef> {
    // The client's filename is NEVER used as a path. It is attacker-controlled
    // and "../../etc/passwd" is a real filename. We keep only the extension.
    const extension = extname(input.filename).toLowerCase().slice(0, 10);
    const storageKey = `${input.prefix}/${randomUUID()}${extension}`;

    return {
      storageKey,
      uploadUrl: this.sign('upload', storageKey),
    };
  }

  async createDownloadUrl(storageKey: string): Promise<string> {
    return this.sign('download', storageKey);
  }

  async write(storageKey: string, body: Buffer): Promise<void> {
    const target = this.resolveInsideRoot(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolveInsideRoot(storageKey), { force: true });
  }

  resolveInsideRoot(storageKey: string): string {
    const target = resolve(join(this.root, normalize(storageKey)));

    // Defence in depth. Even with a generated key, any path that escapes the
    // root is refused rather than trusted.
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new AccessDeniedException('Invalid storage key');
    }

    return target;
  }

  verify(action: 'upload' | 'download', storageKey: string, expires: string, signature: string): void {
    const expiresAt = Number(expires);

    if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) {
      throw new AccessDeniedException('This link has expired');
    }

    const expected = Buffer.from(this.hmac(action, storageKey, expiresAt));
    const provided = Buffer.from(signature);

    // Length-safe constant-time compare: timingSafeEqual throws on a length
    // mismatch, so guard that first rather than leaking it via an exception.
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new AccessDeniedException('Invalid signature');
    }
  }

  private sign(action: 'upload' | 'download', storageKey: string): string {
    const expires = Math.floor(Date.now() / 1000) + this.ttlSeconds;
    const signature = this.hmac(action, storageKey, expires);

    const params = new URLSearchParams({ key: storageKey, expires: String(expires), signature });

    return `${this.baseUrl}/api/v1/storage/${action}?${params.toString()}`;
  }

  private hmac(action: string, storageKey: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${action}:${storageKey}:${expires}`).digest('hex');
  }
}
