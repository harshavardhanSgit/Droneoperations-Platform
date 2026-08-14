import { ApiProperty } from '@nestjs/swagger';

/** Aggregates of what has actually been delivered, per area and per provider. */

export class CoverageTotalsDto {
  @ApiProperty({ example: 1240, description: 'Acres delivered on completed jobs' })
  acresCovered: number;

  @ApiProperty({ example: 42, description: 'Completed jobs' })
  jobsCompleted: number;

  @ApiProperty({ example: 6, description: 'Providers who can currently receive bookings' })
  providersActive: number;

  @ApiProperty({ example: 12, description: 'Serviceable drones across all providers' })
  dronesServiceable: number;

  @ApiProperty({ example: 3, description: 'States with an active offering or a completed job' })
  statesCovered: number;

  @ApiProperty({ example: 8, description: 'Districts with an active offering or a completed job' })
  districtsCovered: number;
}

export class CoverageStateDto {
  @ApiProperty({ example: 'Telangana' })
  name: string;

  @ApiProperty({ example: 540 })
  acresCovered: number;

  @ApiProperty({ example: 12 })
  jobs: number;

  @ApiProperty({ example: 3, description: 'Distinct providers serving this state' })
  providers: number;
}

export class CoverageDistrictDto {
  @ApiProperty({ example: '4b8f...' })
  id: string;

  @ApiProperty({ example: 'Warangal' })
  name: string;

  @ApiProperty({ example: 'Telangana' })
  state: string;

  @ApiProperty({ example: 320 })
  acresCovered: number;

  @ApiProperty({ example: 8 })
  jobs: number;

  @ApiProperty({ example: 2, description: 'Distinct providers covering this district' })
  providers: number;
}

export class CoverageProviderDto {
  @ApiProperty({ example: 'Kisan Aerial Services' })
  name: string;

  @ApiProperty({ example: 260 })
  acresCovered: number;

  @ApiProperty({ example: 9 })
  jobs: number;

  @ApiProperty({ example: 2 })
  drones: number;
}

/** What an anonymous visitor may see: geography and totals, never a named business. */
export class PublicCoverageDto {
  @ApiProperty({ type: CoverageTotalsDto })
  totals: CoverageTotalsDto;

  @ApiProperty({ type: [CoverageStateDto] })
  states: CoverageStateDto[];

  @ApiProperty({ type: [CoverageDistrictDto] })
  districts: CoverageDistrictDto[];
}

export class CoverageDto extends PublicCoverageDto {
  @ApiProperty({
    type: [CoverageProviderDto],
    description: 'Named providers. Staff only — never served to the public endpoint.',
  })
  providers: CoverageProviderDto[];
}
