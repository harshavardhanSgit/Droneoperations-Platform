import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { DiscoveryService } from './discovery.service';
import { MatchQueryDto, MatchResultsDto } from './dto/discovery.dto';

@ApiTags('Discovery')
@ApiBearerAuth('access-token')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('matches')
  @ApiOperation({
    summary: 'Who can do this job, and for how much',
    description:
      'Takes a requirement (service, area, quantity) and returns priced matches — not a provider directory. Only ACTIVATED providers appear (BR1).',
  })
  @ApiEnvelope(MatchResultsDto)
  @ApiErrorEnvelope(400, 'Retired service type or area')
  findMatches(@Query() query: MatchQueryDto): Promise<MatchResultsDto> {
    return this.discovery.findMatches(query);
  }
}
