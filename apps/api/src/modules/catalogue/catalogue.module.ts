import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueRepository } from './catalogue.repository';
import { CatalogueService } from './catalogue.service';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogueController],
  providers: [CatalogueService, CatalogueRepository],
  // Offerings, Discovery and Booking all need to validate against the
  // catalogue. None of them may touch its tables directly.
  exports: [CatalogueService],
})
export class CatalogueModule {}
