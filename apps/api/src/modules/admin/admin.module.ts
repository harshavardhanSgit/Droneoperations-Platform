import { Module } from '@nestjs/common';

import { CatalogueModule } from '../catalogue/catalogue.module';
import { FieldServiceModule } from '../field-service/field-service.module';
import { IdentityModule } from '../identity/identity.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { AdminCatalogueController } from './admin-catalogue.controller';
import { AdminTicketController } from './admin-ticket.controller';
import { AdminOrganisationController } from './admin-organisation.controller';
import { AdminProviderController } from './admin-provider.controller';
import { AdminStaffController } from './admin-staff.controller';

/**
 * Controllers only. No providers, ever.
 *
 * Every future admin capability arrives the same way: import the owning
 * module, add a controller that calls its exported service. A new domain module
 * therefore ships WITH its admin surface instead of being retrofitted into a
 * god module.
 */
@Module({
  imports: [OrganisationsModule, CatalogueModule, FieldServiceModule, IdentityModule],
  controllers: [
    AdminOrganisationController,
    AdminProviderController,
    AdminCatalogueController,
    AdminTicketController,
    AdminStaffController,
  ],
})
export class AdminModule {}
