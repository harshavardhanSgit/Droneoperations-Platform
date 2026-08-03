import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: 'drone-ops-api' })
  service: string;

  @ApiProperty({ example: 42, description: 'Seconds since this process started' })
  uptimeSeconds: number;
}

export class ReadinessChecksDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'] })
  database: string;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ready' })
  status: string;

  @ApiProperty({ type: ReadinessChecksDto })
  checks: ReadinessChecksDto;
}
