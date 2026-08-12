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
  // CatalogueModule is a new dependency: a saved default district is validated
  // against the catalogue before it is stored, so a retired area cannot sit in
  // a profile waiting to fail at booking time. The arrow points the same way
  // the architecture already declares — Organisations reads Catalogue.
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
  // The repository is exported because Identity writes to it during account
  // provisioning — the documented exception in the aggregates doc. The service
  // is exported for the Admin console to compose.
  exports: [OrganisationRepository, OrganisationService, ProviderRepository, ProviderService],
})
export class OrganisationsModule {}
