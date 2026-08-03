import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AssetsModule } from '../assets/assets.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { EngineerTicketController, ProviderTicketController } from './ticket.controller';
import { TicketRepository } from './ticket.repository';
import { TicketService } from './ticket.service';

/**
 * A second product line, sharing identity, storage and documents with the
 * marketplace and nothing else. It imports Assets, Documents and Organisations
 * — and NOTHING from Booking, Discovery, Offerings, Settlement or Reputation.
 */
@Module({
  imports: [PrismaModule, AssetsModule, DocumentsModule, OrganisationsModule],
  controllers: [ProviderTicketController, EngineerTicketController],
  providers: [TicketService, TicketRepository],
  exports: [TicketService],
})
export class FieldServiceModule {}
