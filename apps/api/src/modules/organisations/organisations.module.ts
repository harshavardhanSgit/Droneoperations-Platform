import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrganisationController } from './organisation.controller';
import { OrganisationRepository } from './organisation.repository';
import { OrganisationService } from './organisation.service';
import { ProviderController } from './provider.controller';
import { ProviderRepository } from './provider.repository';
import { ProviderService } from './provider.service';

@Module({
  imports: [PrismaModule, DocumentsModule],
  controllers: [OrganisationController, ProviderController],
  providers: [OrganisationService, OrganisationRepository, ProviderService, ProviderRepository],
  // The repository is exported because Identity writes to it during account
  // provisioning — the documented exception in the aggregates doc. The service
  // is exported for the Admin console to compose.
  exports: [OrganisationRepository, OrganisationService, ProviderRepository, ProviderService],
})
export class OrganisationsModule {}
