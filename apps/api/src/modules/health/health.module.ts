import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { HealthController } from './health.controller';

/** `imports: [PrismaModule]` is what makes PrismaService injectable into HealthController. */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
