import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { CoverageService } from './coverage.service';
import { CoverageDto, PublicCoverageDto } from './dto/coverage.dto';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * Two doors into ONE aggregation, the access model the platform was built on:
 *
 *  - GET /coverage       — the REAL numbers, platform staff only (admin sees
 *                          the whole market; a provider sees their own on
 *                          their own screens; a customer theirs). Never cached.
 *  - GET /coverage/public — the SAME real numbers, anonymous, TTL-cached and
 *                          rate-limited for the landing page. There is no demo
 *                          dataset: a visitor sees exactly what the database
 *                          proves, no more.
 *
 * The DTO is shared, so the map and cards on the landing page are the same
 * components the admin screen renders against the same data.
 */
@ApiTags('Coverage')
@Controller('coverage')
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @RequirePermissions('booking:read-any')
  @ApiOperation({
    summary: 'Platform coverage (staff)',
    description:
      'Derived, never stored: acres and jobs from completed bookings, provider ' +
      'footprint from active offerings, fleet from serviceable drones.',
  })
  @ApiEnvelope(CoverageDto)
  @ApiErrorEnvelope(401, 'Authentication required')
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  async overview(): Promise<CoverageDto> {
    return this.coverage.overview();
  }

  @Get('public')
  @Public()
  @UseGuards(RateLimitGuard)
  @ApiOperation({
    summary: 'Platform coverage (public landing)',
    description:
      'The same real aggregation as the staff endpoint, served to anonymous ' +
      'visitors. TTL-cached and rate-limited so the landing page cannot abuse ' +
      'the database. No illustrative data — these numbers are what the ' +
      'database proves.',
  })
  @ApiEnvelope(PublicCoverageDto)
  @ApiErrorEnvelope(429, 'Rate limit exceeded')
  async publicOverview(): Promise<PublicCoverageDto> {
    return this.coverage.publicOverview();
  }
}
