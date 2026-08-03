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
    // The abstract class is the injection token. Everything depends on
    // StorageService; only this one line decides which implementation answers.
    // Swapping to S3 means adding S3StorageService and changing useExisting.
    { provide: StorageService, useExisting: LocalDiskStorageService },
  ],
  exports: [DocumentService],
})
export class DocumentsModule {}
