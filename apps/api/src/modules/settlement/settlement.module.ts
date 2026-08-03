import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { SettlementController } from './settlement.controller';
import { SettlementRepository } from './settlement.repository';
import { SettlementService } from './settlement.service';

@Module({
  imports: [PrismaModule, BookingsModule, OrganisationsModule],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementRepository],
  exports: [SettlementService],
})
export class SettlementModule {}
