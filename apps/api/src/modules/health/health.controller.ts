import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { DependencyUnavailableException } from '../../common/errors/app.exception';
import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Public } from '../identity/decorators/public.decorator';
import { LivenessResponseDto, ReadinessResponseDto } from './dto/health-response.dto';

// Probes must answer without credentials — a load balancer has none.
@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Is the process alive? Checks no dependencies. A failure here means restart me.',
  })
  @ApiEnvelope(LivenessResponseDto, { description: 'Process is alive' })
  live(): LivenessResponseDto {
    return {
      status: 'ok',
      service: 'drone-ops-api',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Can we serve traffic? Verifies the database. A failure here means stop routing to me, but do not restart me.',
  })
  @ApiEnvelope(ReadinessResponseDto, { description: 'All dependencies reachable' })
  @ApiErrorEnvelope(HttpStatus.SERVICE_UNAVAILABLE, 'A dependency is unreachable')
  async ready(): Promise<ReadinessResponseDto> {
    if (!(await this.prisma.isReachable())) {
      throw new DependencyUnavailableException('database');
    }

    return { status: 'ready', checks: { database: 'up' } };
  }
}
