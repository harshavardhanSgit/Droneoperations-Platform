import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { HealthController } from './health.controller';

/**
 * `imports: [PrismaModule]` is what makes PrismaService injectable into
 * HealthController. Without this line the app fails AT BOOT with
 * "Nest can't resolve dependencies of HealthController (?)" — the `?` being
 * Nest saying it found a constructor parameter it has no provider for.
 *
 * That boot-time failure is a feature. A missing dependency is caught the
 * moment the process starts, not on the first request that needs it.
 *
 * Still no `exports` — this module offers nothing to others.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
