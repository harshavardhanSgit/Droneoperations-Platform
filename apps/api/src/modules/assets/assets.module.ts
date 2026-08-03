import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { DroneController } from './drone.controller';
import { DroneRepository } from './drone.repository';
import { DroneService } from './drone.service';

@Module({
  imports: [PrismaModule, OrganisationsModule],
  controllers: [DroneController],
  providers: [DroneService, DroneRepository],
  // Field Service needs both: the service for ownership checks, the repository
  // to ground and un-ground a drone as tickets open and close.
  exports: [DroneService, DroneRepository],
})
export class AssetsModule {}
