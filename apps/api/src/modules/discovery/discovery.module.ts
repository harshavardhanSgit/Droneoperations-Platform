import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ReputationModule } from '../reputation/reputation.module';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryRepository } from './discovery.repository';
import { DiscoveryService } from './discovery.service';

@Module({
  imports: [PrismaModule, CatalogueModule, ReputationModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService, DiscoveryRepository],
  // Exported because V2's Assignment module calls findMatches() to auto-assign.
  // Same matching logic, different caller — that is why this is a module.
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
