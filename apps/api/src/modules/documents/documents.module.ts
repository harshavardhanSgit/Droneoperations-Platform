import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { LocalDiskStorageService } from '../../infrastructure/storage/local-disk-storage.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DocumentRepository } from './document.repository';
import { DocumentService } from './document.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StorageController],
  providers: [
    DocumentService,
    DocumentRepository,
    LocalDiskStorageService,
    // The abstract class is the injection token.
    { provide: StorageService, useExisting: LocalDiskStorageService },
  ],
  exports: [DocumentService],
})
export class DocumentsModule {}
