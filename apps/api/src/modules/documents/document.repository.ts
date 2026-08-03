import { Injectable } from '@nestjs/common';

import type {
  DocumentOwnerType,
  DocumentStatus,
  ProviderDocumentKind,
} from '../../generated/prisma/client';
import type { DocumentModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(
    data: {
      ownerType: DocumentOwnerType;
      ownerId: string;
      kind?: ProviderDocumentKind | undefined;
      originalFilename: string;
      storageKey: string;
      contentType: string;
      sizeBytes: number;
      uploadedByUserId: string;
    },
    tx?: Tx,
  ): Promise<DocumentModel> {
    return this.db(tx).document.create({ data });
  }

  findById(id: string, tx?: Tx): Promise<DocumentModel | null> {
    return this.db(tx).document.findUnique({ where: { id } });
  }

  markReady(id: string, sizeBytes: number, tx?: Tx): Promise<DocumentModel> {
    return this.db(tx).document.update({
      where: { id },
      data: { status: 'READY', sizeBytes },
    });
  }

  listForOwner(
    ownerType: DocumentOwnerType,
    ownerId: string,
    status?: DocumentStatus,
    tx?: Tx,
  ): Promise<DocumentModel[]> {
    return this.db(tx).document.findMany({
      where: { ownerType, ownerId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  countReady(ownerType: DocumentOwnerType, ownerId: string, tx?: Tx): Promise<number> {
    return this.db(tx).document.count({ where: { ownerType, ownerId, status: 'READY' } });
  }

  delete(id: string, tx?: Tx): Promise<DocumentModel> {
    return this.db(tx).document.delete({ where: { id } });
  }
}
