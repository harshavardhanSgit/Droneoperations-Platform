import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DocumentsModule } from '../documents/documents.module';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';
import { OrganisationController } from './organisation.controller';
import { OrganisationRepository } from './organisation.repository';
import { OrganisationService } from './organisation.service';
import { ProviderController } from './provider.controller';
import { ProviderRepository } from './provider.repository';
import { ProviderService } from './provider.service';

@Module({
  // CatalogueModule is a new dependency: a saved default district is validated against the
  // catalogue before it is stored.
  imports: [PrismaModule, DocumentsModule, CatalogueModule],
  controllers: [OrganisationController, ProviderController, CustomerController],
  providers: [
    OrganisationService,
    OrganisationRepository,
    ProviderService,
    ProviderRepository,
    CustomerService,
    CustomerRepository,
  ],
  // The repository is exported because Identity writes to it during account provisioning — the
  // documented exception in the aggregates doc.
  exports: [OrganisationRepository, OrganisationService, ProviderRepository, ProviderService],
})
export class OrganisationsModule {}
