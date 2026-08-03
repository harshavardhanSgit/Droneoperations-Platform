import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ReputationController } from './reputation.controller';
import { ReputationRepository } from './reputation.repository';
import { ReputationService } from './reputation.service';

@Module({
  imports: [PrismaModule, BookingsModule],
  controllers: [ReputationController],
  providers: [ReputationService, ReputationRepository],
  exports: [ReputationService],
})
export class ReputationModule {}
