import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { OfferingController } from './offering.controller';
import { OfferingRepository } from './offering.repository';
import { OfferingService } from './offering.service';

@Module({
  imports: [PrismaModule, CatalogueModule, OrganisationsModule],
  controllers: [OfferingController],
  providers: [OfferingService, OfferingRepository],
  // Discovery will match against offerings; Booking will quote from a version.
  exports: [OfferingService, OfferingRepository],
})
export class OfferingsModule {}
