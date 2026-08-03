import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({
    example: 'RESOURCE_NOT_FOUND',
    description: 'Stable machine-readable code. Switch on this, not on the HTTP status.',
  })
  code: string;

  @ApiProperty({ example: "Provider 'a1b2c3' was not found" })
  message: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Structured context about the failure.',
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: '3555a023-9a39-45b1-bf9f-5053e4e49661',
    description: 'Matches the x-request-id response header. Quote this when reporting a bug.',
  })
  requestId?: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: ErrorBodyDto })
  error: ErrorBodyDto;
}
