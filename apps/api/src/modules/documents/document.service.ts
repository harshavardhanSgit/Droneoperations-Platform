import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InvalidInputException, ResourceNotFoundException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env.validation';
import type {
  DocumentOwnerType,
  ProviderDocumentKind,
} from '../../generated/prisma/client';
import type { DocumentModel } from '../../generated/prisma/models';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DocumentRepository } from './document.repository';

const ALLOWED_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export interface DocumentDescriptor {
  id: string;
  kind: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

@Injectable()
export class DocumentService {
  private readonly maxBytes: number;

  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: StorageService,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('UPLOAD_MAX_BYTES', { infer: true });
  }

  /**
   * Step 1 of 3. Validates, reserves a storage location, records a PENDING
   * row, and returns a short-lived upload URL.
   *
   * The bytes are NOT accepted here. In production the client uploads straight
   * to object storage, so a 5 MB file never occupies an API worker.
   */
  async requestUpload(input: {
    ownerType: DocumentOwnerType;
    ownerId: string;
    kind?: ProviderDocumentKind | undefined;
    filename: string;
    contentType: string;
    uploadedByUserId: string;
  }): Promise<{ documentId: string; uploadUrl: string; maxBytes: number }> {
    if (!ALLOWED_CONTENT_TYPES.includes(input.contentType)) {
      throw new InvalidInputException('Unsupported file type', {
        contentType: input.contentType,
        allowed: ALLOWED_CONTENT_TYPES,
      });
    }

    const { storageKey, uploadUrl } = await this.storage.createUploadUrl({
      prefix: `${input.ownerType.toLowerCase()}-documents/${input.ownerId}`,
      filename: input.filename,
      contentType: input.contentType,
    });

    const document = await this.documents.create({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      kind: input.kind,
      originalFilename: input.filename,
      storageKey,
      contentType: input.contentType,
      sizeBytes: 0,
      uploadedByUserId: input.uploadedByUserId,
    });

    return { documentId: document.id, uploadUrl, maxBytes: this.maxBytes };
  }

  /**
   * Step 3 of 3. Only now is the document usable.
   *
   * PENDING rows that are never confirmed are abandoned uploads — harmless,
   * and a V1 sweeper can delete them. Nothing treats them as real.
   */
  async confirmUpload(documentId: string, sizeBytes: number): Promise<DocumentDescriptor> {
    const document = await this.requireById(documentId);

    return this.toDescriptor(await this.documents.markReady(document.id, sizeBytes));
  }

  async listFor(ownerType: DocumentOwnerType, ownerId: string): Promise<DocumentDescriptor[]> {
    const documents = await this.documents.listForOwner(ownerType, ownerId);

    return documents.map((document) => this.toDescriptor(document));
  }

  async countReady(ownerType: DocumentOwnerType, ownerId: string): Promise<number> {
    return this.documents.countReady(ownerType, ownerId);
  }

  /**
   * Callers must have already established that the actor may see this document
   * — this issues a link, it does not authorise. Ownership belongs to the
   * module that owns the entity, which is the only thing that knows the rule.
   */
  async createDownloadUrl(documentId: string): Promise<string> {
    const document = await this.requireById(documentId);

    return this.storage.createDownloadUrl(document.storageKey);
  }

  async requireById(id: string): Promise<DocumentModel> {
    const document = await this.documents.findById(id);

    if (!document) {
      throw new ResourceNotFoundException('Document', id);
    }

    return document;
  }

  private toDescriptor(document: DocumentModel): DocumentDescriptor {
    return {
      id: document.id,
      kind: document.kind,
      originalFilename: document.originalFilename,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      status: document.status,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
