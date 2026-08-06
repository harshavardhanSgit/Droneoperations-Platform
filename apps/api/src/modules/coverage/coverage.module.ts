import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TtlCache } from '../../infrastructure/cache/ttl-cache';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { CoverageController } from './coverage.controller';
import { CoverageRepository } from './coverage.repository';
import { CoverageService } from './coverage.service';
import { COVERAGE_CACHE } from './coverage.tokens';
import type { PublicCoverageDto } from './dto/coverage.dto';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  imports: [PrismaModule],
  controllers: [CoverageController],
  providers: [
    CoverageService,
    CoverageRepository,
    RateLimitGuard,
    {
      provide: COVERAGE_CACHE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new TtlCache<PublicCoverageDto>(
          (Number(config.get<number>('COVERAGE_PUBLIC_CACHE_TTL_SECONDS')) || 300) * 1000,
        ),
    },
  ],
})
export class CoverageModule {}
